import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { MessageOutlined, PlusOutlined, RobotOutlined, SendOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Avatar, Button, Card, Flex, Input, Space, Spin, Typography } from 'antd';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import {
  createChat,
  createMessage,
  DEFAULT_CHAT_TITLE,
  getChat,
  listChats,
  requestAssistantReply,
} from './chatService';
import type { ChatState } from './types/chat';
import './App.css';

const { TextArea } = Input;
const { Title, Text } = Typography;

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

export default function App() {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const [chats, setChats] = useState<ChatState[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [initError, setInitError] = useState('');
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0];
  const messages = activeChat?.messages ?? [];
  const isSending = Boolean(activeChat?.isSending);
  const error = activeChat?.error ?? '';
  const lastMessageContent = messages[messages.length - 1]?.content ?? '';

  const hasText = useMemo(() => input.trim().length > 0, [input]);

  useEffect(() => {
    if (!messagesRef.current) return;
    shouldAutoScrollRef.current = true;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [activeChatId]);

  useEffect(() => {
    if (!messagesRef.current || !shouldAutoScrollRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages.length, lastMessageContent, isSending]);

  useEffect(() => {
    if (activeChatId || chats.length === 0) return;
    setActiveChatId(chats[0].id);
  }, [activeChatId, chats]);

  useEffect(() => {
    if (!activeChatId) return;
    const chatId = activeChatId;
    const chat = chats.find((item) => item.id === chatId);
    if (!chat || chat.isEntriesLoaded || chat.isSending) return;

    let cancelled = false;

    async function loadChatDetails() {
      try {
        const fullChat = await getChat(chatId);
        if (cancelled) return;
        setChats((prev) => promoteUpdatedChat(prev, chatId, (current) => ({
          ...current,
          messages: fullChat.messages,
          isEntriesLoaded: true,
          updatedAt: fullChat.updatedAt || current.updatedAt,
        })));
      } catch {
        // Keep chat list item visible even if detail loading failed.
      }
    }

    loadChatDetails();

    return () => {
      cancelled = true;
    };
  }, [activeChatId, chats]);

  useEffect(() => {
    let cancelled = false;

    async function initChats() {
      try {
        const loadedChats = await listChats();
        if (cancelled) return;
        setInitError('');

        if (loadedChats.length > 0) {
          setChats(sortChats(loadedChats));
          return;
        }

        const initialChat = await createChat();
        if (!cancelled) {
          setChats(sortChats([initialChat]));
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Не удалось загрузить чаты';
          setInitError(`Ошибка инициализации: ${message}`);
          setChats([]);
        }
      }
    }

    initChats();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateChat() {
    if (isCreatingChat) return;
    setIsCreatingChat(true);

    try {
      const newChat = await createChat();
      setChats((prev) => sortChats([newChat, ...prev]));
      setActiveChatId(newChat.id);
      setInput('');
      setInitError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось создать чат';
      setInitError(`Ошибка создания чата: ${message}`);
    } finally {
      setIsCreatingChat(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!activeChat || !text || isSending) return;

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
      const result = await requestAssistantReply({
        chatId,
        text,
        onChunk: (chunk) => {
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
                  : [...chat.messages, { id: streamingMessageId, role: 'assistant' as const, content: chunk }];

              return {
                ...chat,
                messages: nextChatMessages,
                isAwaitingFirstChunk: false,
                streamingMessageId,
                updatedAt: Date.now(),
              };
            }),
          );
        },
      });

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

  return (
    <main className="app">
      <div className="chat-layout">
        <aside className="chat-sidebar">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            block
            onClick={handleCreateChat}
            loading={isCreatingChat}
          >
            Новый чат
          </Button>

          <div className="chat-list">
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={`chat-list-item ${chat.id === activeChatId ? 'active' : ''}`}
                onClick={() => {
                  setActiveChatId(chat.id);
                  setInput('');
                }}
              >
                <Space align="start" size={8}>
                  <MessageOutlined />
                  <div className="chat-list-text">
                    <Text strong ellipsis>
                      {chat.title}
                    </Text>
                    <Text ellipsis>{getChatPreview(chat)}</Text>
                  </div>
                </Space>
              </button>
            ))}
          </div>
        </aside>

        <Card className="chat-shell" bordered={false}>
          <header className="chat-header">
            <Title level={3}>AI Chat</Title>
            <Text type="secondary">{activeChat?.title || 'Диалог'}</Text>
          </header>

          {initError && <Alert type="error" showIcon message={initError} />}

          <div
            className="chat-messages"
            aria-live="polite"
            ref={messagesRef}
            onScroll={(event) => {
              const element = event.currentTarget;
              const distanceToBottom =
                element.scrollHeight - element.scrollTop - element.clientHeight;
              shouldAutoScrollRef.current = distanceToBottom < 80;
            }}
          >
            {messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <Flex key={message.id} justify={isUser ? 'end' : 'start'}>
                  <Card className={`bubble bubble-${message.role}`} size="small">
                    <Space align="start">
                      <Avatar
                        icon={isUser ? <UserOutlined /> : <RobotOutlined />}
                        className="bubble-avatar"
                      />
                      <div>
                        <Text strong>{isUser ? 'Вы' : 'AI'}</Text>
                        <div className="bubble-text markdown-content">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeSanitize]}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </Space>
                  </Card>
                </Flex>
              );
            })}
            {isSending && activeChat?.isAwaitingFirstChunk && (
              <Flex justify="start">
                <Card className="bubble bubble-assistant" size="small">
                  <Space>
                    <Spin size="small" />
                    <Text>AI печатает...</Text>
                  </Space>
                </Card>
              </Flex>
            )}
          </div>

          {error && <Alert type="error" showIcon message={error} />}

          <form className="chat-form" onSubmit={handleSubmit} ref={formRef}>
            <TextArea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              placeholder="Напиши сообщение..."
              autoSize={{ minRows: 2, maxRows: 6 }}
              disabled={isSending}
            />
            <Button
              type="primary"
              htmlType="submit"
              icon={<SendOutlined />}
              disabled={!hasText}
              loading={isSending}
            >
              Отправить
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
