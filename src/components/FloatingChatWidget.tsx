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
import type { FormEvent, KeyboardEvent, MutableRefObject, UIEvent } from 'react';
import './FloatingChatWidget.css';

type ChatRole = 'user' | 'assistant';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

interface ChatState {
  id: string;
  title: string;
  messages: ChatMessage[];
  isEntriesLoaded: boolean;
  isSending: boolean;
  isAwaitingFirstChunk: boolean;
  streamingMessageId?: string;
  error: string;
  updatedAt: number;
}

interface ApiChatEntryDto {
  uid: string;
  entryType: 'USER' | 'ASSISTANT';
  message: string;
  createdAt?: string;
}

interface ApiChatDto {
  uid: string;
  name: string;
  createdAt?: string;
  entries?: ApiChatEntryDto[];
}

interface ApiChatsPageDto {
  chats: ApiChatDto[];
}

interface ApiStreamChunkDto {
  content: string;
}

interface ApiSendMessageResponse extends ApiChatDto {
  entries: ApiChatEntryDto[];
}

interface WhisperInferenceResponse {
  text?: string;
}

interface NormalizedChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  isEntriesLoaded: boolean;
  updatedAt: number;
}

interface SendMessageResult {
  assistantText: string;
  finalChat?: NormalizedChat;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:20010';
const WHISPER_CPP_URL = import.meta.env.VITE_WHISPER_CPP_URL;
const CHATS_PAGE_SIZE = Number(import.meta.env.VITE_CHATS_PAGE_SIZE || 20);
const MOCK_DELAY_MS = 700;
const DEFAULT_CHAT_TITLE = 'Новый чат';
const MOCK_FALLBACKS = [
  'Принято. Могу расписать это по шагам.',
  'Хороший вопрос. Нужен короткий или подробный ответ?',
  'Ок, давай сделаем. Сначала определим входные данные.',
  'Могу подготовить пример кода под твой стек.',
];

function parseEnvBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(normalized);
}

const USE_MOCK_CHAT = parseEnvBoolean(import.meta.env.VITE_USE_MOCK_CHAT, import.meta.env.DEV);

function buildApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

function buildWhisperUrl(path: string): string {
  if (!WHISPER_CPP_URL) {
    throw new Error('Не задан VITE_WHISPER_CPP_URL');
  }

  return `${WHISPER_CPP_URL}${path}`;
}

async function fetchJson(url: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function extractSseEvents(rawBlock: string): { eventType: string; data: string } {
  const lines = rawBlock.split('\n');
  let eventType = 'message';
  const dataLines: string[] = [];

  lines.forEach((line) => {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  });

  return {
    eventType,
    data: dataLines.join('\n'),
  };
}

function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
  };
}

function entryToMessage(entry: ApiChatEntryDto): ChatMessage {
  return {
    id: entry.uid,
    role: entry.entryType === 'USER' ? 'user' : 'assistant',
    content: entry.message,
  };
}

function toChat(chat: ApiChatDto): NormalizedChat {
  const entries = Array.isArray(chat.entries) ? chat.entries : [];
  return {
    id: chat.uid,
    title: chat.name || DEFAULT_CHAT_TITLE,
    messages: entries.map(entryToMessage),
    isEntriesLoaded: Array.isArray(chat.entries),
    updatedAt: chat.createdAt ? new Date(chat.createdAt).getTime() : Date.now(),
  };
}

function toChatState(chat: NormalizedChat): ChatState {
  return {
    id: chat.id,
    title: chat.title,
    messages: chat.messages.map((message) => ({ ...message })),
    isEntriesLoaded: chat.isEntriesLoaded,
    isSending: false,
    isAwaitingFirstChunk: false,
    streamingMessageId: undefined,
    error: '',
    updatedAt: chat.updatedAt || Date.now(),
  };
}

function createLocalChat(): ChatState {
  return toChatState({
    id: crypto.randomUUID(),
    title: DEFAULT_CHAT_TITLE,
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: USE_MOCK_CHAT
          ? 'Привет! Включен мок-режим. Напиши сообщение для теста общения.'
          : 'Привет! Я готов помочь. Задай вопрос.',
      },
    ],
    isEntriesLoaded: true,
    updatedAt: Date.now(),
  });
}

function sortChats(chats: ChatState[]): ChatState[] {
  return [...chats].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt - a.updatedAt;
    }
    return a.title.localeCompare(b.title, 'ru');
  });
}

function promoteUpdatedChat(
  chats: ChatState[],
  chatId: string,
  updater: (chat: ChatState) => ChatState,
): ChatState[] {
  const target = chats.find((chat) => chat.id === chatId);
  if (!target) return chats;
  const updated = updater(target);
  return sortChats([updated, ...chats.filter((chat) => chat.id !== chatId)]);
}

function formatChatTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return DEFAULT_CHAT_TITLE;
  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

function getChatPreview(chat: ChatState): string {
  const lastMessage = chat.messages[chat.messages.length - 1];
  if (!lastMessage) return 'Пустой чат';
  const prefix = lastMessage.role === 'user' ? 'Вы: ' : 'AI: ';
  const line = `${prefix}${lastMessage.content}`.replace(/\s+/g, ' ').trim();
  return line.length > 56 ? `${line.slice(0, 56)}...` : line;
}

function getMockReply(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes('привет') || normalized.includes('hello')) {
    return 'Привет! Я в мок-режиме. Можем протестировать сценарий диалога.';
  }
  if (normalized.includes('react')) {
    return 'Для React могу предложить структуру компонентов, state и обработчики событий.';
  }
  if (normalized.includes('vite')) {
    return 'Для Vite обычно достаточно `npm run dev` для локальной проверки и `npm run build` для сборки.';
  }
  if (normalized.includes('ошиб') || normalized.includes('error')) {
    return 'Давай разберем ошибку: пришли текст и шаги, на которых она воспроизводится.';
  }
  return MOCK_FALLBACKS[Math.floor(Math.random() * MOCK_FALLBACKS.length)];
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function listChatsRequest(): Promise<NormalizedChat[]> {
  const data = (await fetchJson(buildApiUrl(`/chats?page=0&size=${CHATS_PAGE_SIZE}`), {
    method: 'GET',
  })) as ApiChatsPageDto;

  const chats = Array.isArray(data?.chats) ? data.chats : [];
  return chats.map(toChat);
}

async function getChatRequest(chatId: string): Promise<NormalizedChat> {
  const data = (await fetchJson(buildApiUrl(`/chats/${encodeURIComponent(chatId)}`), {
    method: 'GET',
  })) as ApiChatDto;

  return toChat(data);
}

async function createChatRequest(): Promise<NormalizedChat> {
  const data = (await fetchJson(buildApiUrl('/chats'), {
    method: 'POST',
    body: JSON.stringify({ name: DEFAULT_CHAT_TITLE }),
  })) as ApiChatDto;

  return toChat(data);
}

async function sendMessageRequest(
  chatId: string,
  content: string,
  onChunk?: (chunk: string) => void,
): Promise<SendMessageResult> {
  const response = await fetch(buildApiUrl(`/chats/${encodeURIComponent(chatId)}/entries/stream`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ message: content }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Пустой stream-ответ от сервера.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let assistantText = '';
  let finalChat: NormalizedChat | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');

    while (boundary !== -1) {
      const rawBlock = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);

      if (rawBlock) {
        const { eventType, data } = extractSseEvents(rawBlock);

        if (eventType === 'chunk' && data) {
          try {
            const parsed = JSON.parse(data) as ApiStreamChunkDto;
            const chunk = typeof parsed.content === 'string' ? parsed.content : '';
            if (chunk) {
              assistantText += chunk;
              onChunk?.(chunk);
            }
          } catch {
            // Ignore malformed chunk payloads.
          }
        }

        if (eventType === 'final' && data) {
          try {
            const parsed = JSON.parse(data) as ApiSendMessageResponse;
            finalChat = toChat(parsed);
          } catch {
            // Ignore malformed final payloads.
          }
        }
      }

      boundary = buffer.indexOf('\n\n');
    }
  }

  if (!assistantText && finalChat) {
    const assistantEntry = [...finalChat.messages]
      .reverse()
      .find((entry) => entry.role === 'assistant');
    assistantText = assistantEntry?.content || '';
  }

  if (!assistantText) {
    throw new Error('В ответе нет сообщения ассистента.');
  }

  return {
    assistantText,
    finalChat,
  };
}

async function transcribeAudioRequest(file: File, signal?: AbortSignal): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('response_format', 'json');

  const response = await fetch(buildWhisperUrl('/inference'), {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = (await response.json()) as WhisperInferenceResponse;
  const text = typeof data.text === 'string' ? data.text.trim() : '';

  if (!text) {
    throw new Error('Whisper вернул пустую транскрипцию.');
  }

  return text;
}

function mergeFloat32Chunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;

  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });

  return merged;
}

function writeWavString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeWavString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeWavString(view, 8, 'WAVE');
  writeWavString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeWavString(view, 36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  samples.forEach((sample) => {
    const normalized = Math.max(-1, Math.min(1, sample));
    const pcm = normalized < 0 ? normalized * 0x8000 : normalized * 0x7fff;
    view.setInt16(offset, pcm, true);
    offset += bytesPerSample;
  });

  return new Blob([buffer], { type: 'audio/wav' });
}

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
  const shouldAutoScrollRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(16000);
  const transcriptionAbortControllerRef = useRef<AbortController | null>(null);
  const transcriptionRequestIdRef = useRef(0);

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

        const initialChat = USE_MOCK_CHAT ? createLocalChat() : toChatState(await createChatRequest());
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
      setIsHistoryOpen(false);
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
    if (isOpen) {
      setIsOpen(false);
      setIsHistoryOpen(false);
      return;
    }

    setIsHistoryOpen(false);
    setIsOpen(true);
  }

  return (
    <div className="chat-widget-anchor">
      {!isOpen && (
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
                          setIsHistoryOpen(false);
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
