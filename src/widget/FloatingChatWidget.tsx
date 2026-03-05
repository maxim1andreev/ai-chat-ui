import {
  Button,
  FloatingButton,
  Spinner,
  T,
  TextArea,
} from '@admiral-ds/react-ui';
import {
  AudioOutlined,
  CloseOutlined,
  MessageOutlined,
  PlusOutlined,
  SendOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  FormEvent,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  TouchEvent as ReactTouchEvent,
  UIEvent,
} from 'react';
import { createChatRequest, getChatRequest, listChatsRequest, sendMessageRequest, transcribeAudioRequest } from './api';
import { encodeWav, mergeFloat32Chunks } from './audio';
import { DEFAULT_CHAT_TITLE, MOCK_DELAY_MS, USE_MOCK_CHAT } from './constants';
import {
  createLocalChat,
  createMessage,
  formatChatTitle,
  getChatPreview,
  getMockReply,
  promoteUpdatedChat,
  sortChats,
  toChatState,
  wait,
} from './helpers';
import type { ChatMessage, ChatState, SendMessageResult } from './types';
import './FloatingChatWidget.css';

function Notice({
  tone,
  message,
}: {
  tone: 'error' | 'warning';
  message: string;
}) {
  if (!message) return null;

  return (
    <div className={`chat-widget-notice chat-widget-notice-${tone}`} role="status">
      <T as="span" font="Caption/Caption 1">
        {message}
      </T>
    </div>
  );
}

function renderMessage(message: ChatMessage) {
  const isUser = message.role === 'user';

  return (
    <div
      key={message.id}
      className={`chat-widget-message-row ${isUser ? 'chat-widget-message-row-user' : ''}`}
    >
      <article
        className={`chat-widget-bubble ${
          isUser ? 'chat-widget-bubble-user' : 'chat-widget-bubble-assistant'
        }`}
      >
        <div className="chat-widget-bubble-meta">
          <span className="chat-widget-bubble-badge">{isUser ? 'Вы' : 'AI'}</span>
        </div>
        <div className="chat-widget-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
}

function handleMessagesScroll(
  event: UIEvent<HTMLDivElement>,
  shouldAutoScrollRef: MutableRefObject<boolean>,
) {
  const element = event.currentTarget;
  const distanceToBottom =
    element.scrollHeight - element.scrollTop - element.clientHeight;
  shouldAutoScrollRef.current = distanceToBottom < 80;
}

export function FloatingChatWidget() {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const launcherRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(16000);
  const transcriptionAbortControllerRef = useRef<AbortController | null>(null);
  const transcriptionRequestIdRef = useRef(0);
  const dragMovedRef = useRef(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    width: number;
    height: number;
  } | null>(null);

  const [chats, setChats] = useState<ChatState[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [initError, setInitError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');
  const [anchorPosition, setAnchorPosition] = useState<{ x: number; y: number } | null>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0];
  const messages = activeChat?.messages ?? [];
  const isSending = Boolean(activeChat?.isSending);
  const isVoiceBusy = isRecording || isTranscribing;
  const hasText = useMemo(() => input.trim().length > 0, [input]);
  const error = activeChat?.error ?? '';
  const lastMessageContent = messages[messages.length - 1]?.content ?? '';

  useEffect(
    () => () => {
      transcriptionAbortControllerRef.current?.abort();
      processorNodeRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      audioContextRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  useEffect(() => {
    if (!messagesRef.current || !isOpen) return;
    shouldAutoScrollRef.current = true;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [activeChatId, isOpen]);

  useEffect(() => {
    if (!messagesRef.current || !isOpen || !shouldAutoScrollRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages.length, lastMessageContent, isSending, isOpen]);

  useEffect(() => {
    if (activeChatId || chats.length === 0) return;
    setActiveChatId(chats[0].id);
  }, [activeChatId, chats]);

  useEffect(() => {
    if (!activeChatId || USE_MOCK_CHAT) return;
    const chatId = activeChatId;
    const chat = chats.find((item) => item.id === chatId);
    if (!chat || chat.isEntriesLoaded || chat.isSending) return;

    let cancelled = false;

    async function loadChatDetails() {
      try {
        const fullChat = toChatState(await getChatRequest(chatId));
        if (cancelled) return;
        setChats((prev) => promoteUpdatedChat(prev, chatId, (current) => ({
          ...current,
          messages: fullChat.messages,
          isEntriesLoaded: true,
          updatedAt: fullChat.updatedAt || current.updatedAt,
        })));
      } catch {
        // Keep visible in list even if loading details failed.
      }
    }

    void loadChatDetails();

    return () => {
      cancelled = true;
    };
  }, [activeChatId, chats]);

  useEffect(() => {
    let cancelled = false;

    async function initChats() {
      try {
        const loadedChats = USE_MOCK_CHAT
          ? [createLocalChat()]
          : (await listChatsRequest()).map(toChatState);

        if (cancelled) return;
        setInitError('');

        if (loadedChats.length > 0) {
          setChats(sortChats(loadedChats));
          return;
        }

        const initialChat = USE_MOCK_CHAT
          ? createLocalChat()
          : toChatState(await createChatRequest());

        if (!cancelled) {
          setChats(sortChats([initialChat]));
        }
      } catch (initChatsError) {
        if (!cancelled) {
          const message =
            initChatsError instanceof Error ? initChatsError.message : 'Не удалось загрузить чаты';
          setInitError(`Ошибка инициализации: ${message}`);
          setChats([]);
        }
      }
    }

    void initChats();

    return () => {
      cancelled = true;
    };
  }, []);

  function stopRecordingSession() {
    processorNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    audioContextRef.current?.close();
    sourceNodeRef.current = null;
    processorNodeRef.current = null;
    audioContextRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setIsRecording(false);
  }

  async function transcribeRecordedAudio(blob: Blob) {
    const file = new File([blob], 'voice-note.wav', {
      type: 'audio/wav',
    });

    const requestId = transcriptionRequestIdRef.current + 1;
    transcriptionRequestIdRef.current = requestId;
    const abortController = new AbortController();
    transcriptionAbortControllerRef.current = abortController;

    setIsTranscribing(true);
    setTranscriptionError('');

    try {
      const transcript = await transcribeAudioRequest(file, abortController.signal);
      if (transcriptionRequestIdRef.current !== requestId) return;
      setInput((prev) => {
        const current = prev.trim();
        if (!current) return transcript;
        return `${prev}${prev.endsWith('\n') ? '' : '\n'}${transcript}`;
      });
    } catch (voiceError) {
      if (abortController.signal.aborted) return;
      if (transcriptionRequestIdRef.current !== requestId) return;
      const message = voiceError instanceof Error ? voiceError.message : 'Не удалось распознать аудио';
      setTranscriptionError(`Ошибка распознавания: ${message}`);
    } finally {
      if (transcriptionRequestIdRef.current === requestId) {
        transcriptionAbortControllerRef.current = null;
        setIsTranscribing(false);
      }
    }
  }

  function cancelAudioCapture() {
    if (isRecording) {
      stopRecordingSession();
      pcmChunksRef.current = [];
      setTranscriptionError('');
      return;
    }

    if (isTranscribing) {
      transcriptionRequestIdRef.current += 1;
      transcriptionAbortControllerRef.current?.abort();
      transcriptionAbortControllerRef.current = null;
      setIsTranscribing(false);
      setTranscriptionError('');
    }
  }

  async function handleAudioToggle() {
    if (isTranscribing) return;

    if (isRecording) {
      stopRecordingSession();

      const recordedBlob = encodeWav(
        mergeFloat32Chunks(pcmChunksRef.current),
        sampleRateRef.current,
      );
      pcmChunksRef.current = [];

      if (recordedBlob.size > 44) {
        await transcribeRecordedAudio(recordedBlob);
      }
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioContext === 'undefined'
    ) {
      setTranscriptionError('Браузер не поддерживает запись с микрофона.');
      return;
    }

    try {
      setTranscriptionError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      pcmChunksRef.current = [];

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      sampleRateRef.current = audioContext.sampleRate;

      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      processorNodeRef.current = processorNode;

      processorNode.onaudioprocess = (event) => {
        const channelData = event.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(channelData));
      };

      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);
      setIsRecording(true);
    } catch (voiceError) {
      const message =
        voiceError instanceof Error ? voiceError.message : 'Не удалось получить доступ к микрофону';
      setTranscriptionError(`Ошибка записи: ${message}`);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      processorNodeRef.current = null;
      sourceNodeRef.current = null;
      audioContextRef.current = null;
      pcmChunksRef.current = [];
      setIsRecording(false);
    }
  }

  async function handleCreateChat() {
    if (isCreatingChat) return;
    setIsCreatingChat(true);

    try {
      const newChat = USE_MOCK_CHAT ? createLocalChat() : toChatState(await createChatRequest());
      setChats((prev) => sortChats([newChat, ...prev]));
      setActiveChatId(newChat.id);
      setInput('');
      setInitError('');
      setIsOpen(true);
    } catch (createChatError) {
      const message =
        createChatError instanceof Error ? createChatError.message : 'Не удалось создать чат';
      setInitError(`Ошибка создания чата: ${message}`);
    } finally {
      setIsCreatingChat(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!activeChat || !text || isSending) return;
    setIsOpen(true);

    const userMessage = createMessage('user', text);
    const chatId = activeChat.id;
    const streamingMessageId = crypto.randomUUID();
    const nextMessages = [...activeChat.messages, userMessage];

    setChats((prev) =>
      promoteUpdatedChat(prev, chatId, (chat) => ({
        ...chat,
        messages: nextMessages,
        isEntriesLoaded: true,
        title: chat.title === DEFAULT_CHAT_TITLE ? formatChatTitle(text) : chat.title,
        isSending: true,
        isAwaitingFirstChunk: true,
        streamingMessageId,
        error: '',
        updatedAt: Date.now(),
      })),
    );
    setInput('');

    try {
      let result: SendMessageResult;

      if (USE_MOCK_CHAT) {
        await wait(MOCK_DELAY_MS);
        result = { assistantText: getMockReply(text) };
      } else {
        result = await sendMessageRequest(chatId, text, (chunk) => {
          setChats((prev) =>
            promoteUpdatedChat(prev, chatId, (chat) => {
              const existingIndex = chat.messages.findIndex(
                (message) => message.id === streamingMessageId,
              );

              const nextChatMessages =
                existingIndex >= 0
                  ? chat.messages.map((message, index) =>
                      index === existingIndex
                        ? { ...message, content: `${message.content}${chunk}` }
                        : message,
                    )
                  : [
                      ...chat.messages,
                      { id: streamingMessageId, role: 'assistant' as const, content: chunk },
                    ];

              return {
                ...chat,
                messages: nextChatMessages,
                isAwaitingFirstChunk: false,
                streamingMessageId,
                updatedAt: Date.now(),
              };
            }),
          );
        });
      }

      const finalMessages = result.finalChat?.messages ?? [];
      const hasFinalMessages = finalMessages.length > 0;

      setChats((prev) =>
        promoteUpdatedChat(prev, chatId, (chat) => ({
          ...chat,
          title: result.finalChat?.title || chat.title,
          messages: hasFinalMessages
            ? finalMessages
            : [...chat.messages, createMessage('assistant', result.assistantText)],
          isEntriesLoaded: true,
          isSending: false,
          isAwaitingFirstChunk: false,
          streamingMessageId: undefined,
          updatedAt: Date.now(),
        })),
      );
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Неизвестная ошибка';
      setChats((prev) =>
        promoteUpdatedChat(prev, chatId, (chat) => ({
          ...chat,
          isSending: false,
          isAwaitingFirstChunk: false,
          streamingMessageId: undefined,
          error: `Ошибка запроса: ${message}`,
          updatedAt: Date.now(),
        })),
      );
    }
  }

  function handleToggleOpen() {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }

    if (isOpen) {
      setIsOpen(false);
      setIsHistoryOpen(false);
      return;
    }

    setIsHistoryOpen(false);
    setIsOpen(true);
  }

  function beginLauncherDrag(clientX: number, clientY: number) {
    if (!launcherRef.current) return;

    const rect = launcherRef.current.getBoundingClientRect();
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      originX: rect.left,
      originY: rect.top,
      width: rect.width,
      height: rect.height,
    };
    dragMovedRef.current = false;

    const onPointerMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      if (moveEvent instanceof TouchEvent) {
        moveEvent.preventDefault();
      }
      const point =
        moveEvent instanceof MouseEvent
          ? { x: moveEvent.clientX, y: moveEvent.clientY }
          : moveEvent.touches[0]
            ? { x: moveEvent.touches[0].clientX, y: moveEvent.touches[0].clientY }
            : null;
      if (!point) return;

      const dx = point.x - dragRef.current.startX;
      const dy = point.y - dragRef.current.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) {
        dragMovedRef.current = true;
      }

      const maxX = window.innerWidth - dragRef.current.width - 8;
      const maxY = window.innerHeight - dragRef.current.height - 8;
      const nextX = Math.max(8, Math.min(maxX, dragRef.current.originX + dx));
      const nextY = Math.max(8, Math.min(maxY, dragRef.current.originY + dy));
      setAnchorPosition({ x: nextX, y: nextY });
    };

    const clearListeners = () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
      window.removeEventListener('touchcancel', onPointerUp);
      dragRef.current = null;
    };

    const onPointerUp = () => {
      clearListeners();
    };

    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
    window.addEventListener('touchcancel', onPointerUp);
  }

  function handleLauncherMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    beginLauncherDrag(event.clientX, event.clientY);
  }

  function handleLauncherTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    if (!touch) return;
    beginLauncherDrag(touch.clientX, touch.clientY);
  }

  useEffect(() => {
    if (!anchorPosition || !launcherRef.current) return;

    const onResize = () => {
      if (!launcherRef.current) return;
      const rect = launcherRef.current.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 8;
      const maxY = window.innerHeight - rect.height - 8;
      setAnchorPosition((prev) => {
        if (!prev) return prev;
        const clampedX = Math.max(8, Math.min(maxX, prev.x));
        const clampedY = Math.max(8, Math.min(maxY, prev.y));
        if (clampedX === prev.x && clampedY === prev.y) return prev;
        return { x: clampedX, y: clampedY };
      });
    };

    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [anchorPosition]);

  return (
    <div
      className="chat-widget-anchor"
      style={
        !isOpen && anchorPosition
          ? { left: anchorPosition.x, top: anchorPosition.y, right: 'auto', bottom: 'auto' }
          : undefined
      }
    >
      {!isOpen && (
        <div
          className="chat-widget-launcher-drag-area"
          ref={launcherRef}
          onMouseDown={handleLauncherMouseDown}
          onTouchStart={handleLauncherTouchStart}
        >
          <FloatingButton
            className="chat-widget-launcher"
            appearance="primary"
            dimension="xl"
            tooltip="Открыть AI чат"
            onClick={handleToggleOpen}
            aria-label="Открыть AI чат"
          >
            <MessageOutlined />
          </FloatingButton>
        </div>
      )}

      {isOpen && (
        <div
          className={`chat-widget-panel ${isHistoryOpen ? 'history-open' : ''}`}
          role="dialog"
          aria-label="AI чат"
        >
          <div className="chat-widget-shell">
            <header className="chat-widget-topbar">
              <div className="chat-widget-heading">
                <T as="span" font="Button/Button 2">
                  AI Chat
                </T>
                <T as="span" font="Caption/Caption 1">
                  {activeChat?.title || 'Диалог'}
                </T>
              </div>

              <div className="chat-widget-controls">
                <Button
                  appearance="tertiary"
                  dimension="s"
                  iconStart={<UnorderedListOutlined />}
                  onClick={() => setIsHistoryOpen((prev) => !prev)}
                >
                  История
                </Button>
                <Button
                  appearance="tertiary"
                  dimension="s"
                  iconStart={<CloseOutlined />}
                  onClick={() => {
                    if (isVoiceBusy) {
                      cancelAudioCapture();
                    }
                    handleToggleOpen();
                  }}
                  aria-label="Свернуть чат"
                />
              </div>
            </header>

            <div className={`chat-widget-body ${isHistoryOpen ? 'history-open' : ''}`}>
              {isHistoryOpen && (
                <aside className="chat-widget-history" aria-label="История чатов">
                  <Button
                    appearance="secondary"
                    dimension="m"
                    iconStart={<PlusOutlined />}
                    onClick={handleCreateChat}
                    disabled={isVoiceBusy}
                    loading={isCreatingChat}
                  >
                    Новый чат
                  </Button>

                  <div className="chat-widget-history-list">
                    {chats.map((chat) => (
                      <button
                        key={chat.id}
                        type="button"
                        className={`chat-widget-history-item ${
                          chat.id === activeChatId ? 'active' : ''
                        }`}
                        onClick={() => {
                          setActiveChatId(chat.id);
                          setInput('');
                          setIsOpen(true);
                        }}
                      >
                        <T as="span" font="Body/Body 2 Short">
                          {chat.title}
                        </T>
                        <T as="span" font="Caption/Caption 1">
                          {getChatPreview(chat)}
                        </T>
                      </button>
                    ))}
                  </div>
                </aside>
              )}

              <section className="chat-widget-conversation">
                <Notice tone="error" message={initError} />

                <div
                  className="chat-widget-messages"
                  aria-live="polite"
                  ref={messagesRef}
                  onScroll={(event) => handleMessagesScroll(event, shouldAutoScrollRef)}
                >
                  {messages.map(renderMessage)}
                  {isSending && activeChat?.isAwaitingFirstChunk && (
                    <div className="chat-widget-message-row">
                      <article className="chat-widget-bubble chat-widget-bubble-assistant">
                        <div className="chat-widget-loading">
                          <Spinner />
                          <T as="span" font="Caption/Caption 1">
                            AI печатает...
                          </T>
                        </div>
                      </article>
                    </div>
                  )}
                </div>

                <Notice tone="error" message={error} />
                <Notice tone="warning" message={transcriptionError} />

                <form className="chat-widget-form" onSubmit={handleSubmit} ref={formRef}>
                  <TextArea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        formRef.current?.requestSubmit();
                      }
                    }}
                    placeholder="Напишите сообщение..."
                    rows={2}
                    autoHeight={false}
                    resizable={false}
                    disabled={isSending}
                  />

                  <div className="chat-widget-actions">
                    <Button
                      appearance={isRecording ? 'danger' : 'secondary'}
                      dimension="m"
                      iconStart={<AudioOutlined />}
                      onClick={() => {
                        void handleAudioToggle();
                      }}
                      type="button"
                      disabled={isSending}
                      loading={isTranscribing}
                    >
                      {isRecording
                        ? 'Слушаю...'
                        : isTranscribing
                          ? 'Распознаю...'
                          : 'Надиктовать'}
                    </Button>
                    <Button
                      appearance="primary"
                      dimension="m"
                      iconEnd={<SendOutlined />}
                      type="submit"
                      disabled={!hasText}
                      loading={isSending}
                    >
                      Отправить
                    </Button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
