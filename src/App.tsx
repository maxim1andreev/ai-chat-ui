import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { MessageOutlined, PlusOutlined, RobotOutlined, SendOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Avatar, Button, Card, Flex, Input, Space, Spin, Typography } from 'antd';
import {
  createChat,
  createLocalChat,
  createMessage,
  DEFAULT_CHAT_TITLE,
  getChat,
  listChats,
  requestAssistantReply,
} from './chatService';
import type { ChatState } from './types/chat';
import './App.css';

const { TextArea } = Input;
const { Title, Text, Paragraph } = Typography;

function promoteUpdatedChat(
  chats: ChatState[],
  chatId: string,
  updater: (chat: ChatState) => ChatState,
): ChatState[] {
  const target = chats.find((chat) => chat.id === chatId);
  if (!target) return chats;
  const updated = updater(target);
  return [updated, ...chats.filter((chat) => chat.id !== chatId)];
}

function formatChatTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return DEFAULT_CHAT_TITLE;
  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

function getChatPreview(chat: ChatState): string {
  const lastMessage = chat.messages.at(-1);
  if (!lastMessage) return 'Пустой чат';
  const prefix = lastMessage.role === 'user' ? 'Вы: ' : 'AI: ';
  const line = `${prefix}${lastMessage.content}`.replace(/\s+/g, ' ').trim();
  return line.length > 56 ? `${line.slice(0, 56)}...` : line;
}

export default function App() {
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const [chats, setChats] = useState<ChatState[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? chats[0];
  const messages = activeChat?.messages ?? [];
  const isSending = Boolean(activeChat?.isSending);
  const error = activeChat?.error ?? '';

  const hasText = useMemo(() => input.trim().length > 0, [input]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [activeChatId, messages.length, isSending]);

  useEffect(() => {
    if (activeChatId || chats.length === 0) return;
    setActiveChatId(chats[0].id);
  }, [activeChatId, chats]);

  useEffect(() => {
    if (!activeChatId) return;
    const chat = chats.find((item) => item.id === activeChatId);
    if (!chat || chat.messages.length > 0 || chat.isSending) return;

    let cancelled = false;

    async function loadChatDetails() {
      try {
        const fullChat = await getChat(activeChatId);
        if (cancelled) return;
        setChats((prev) => promoteUpdatedChat(prev, activeChatId, (current) => ({
          ...current,
          messages: fullChat.messages,
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

        if (loadedChats.length > 0) {
          setChats(loadedChats);
          return;
        }

        const initialChat = await createChat();
        if (!cancelled) {
          setChats([initialChat]);
        }
      } catch {
        if (!cancelled) {
          setChats([createLocalChat()]);
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
      setChats((prev) => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      setInput('');
    } catch {
      const fallbackChat = createLocalChat();
      setChats((prev) => [fallbackChat, ...prev]);
      setActiveChatId(fallbackChat.id);
      setInput('');
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
    const nextMessages = [...activeChat.messages, userMessage];

    setChats((prev) =>
      promoteUpdatedChat(prev, chatId, (chat) => ({
        ...chat,
        messages: nextMessages,
        title: chat.title === DEFAULT_CHAT_TITLE ? formatChatTitle(text) : chat.title,
        isSending: true,
        error: '',
        updatedAt: Date.now(),
      })),
    );
    setInput('');

    try {
      const aiReply = await requestAssistantReply({
        chatId,
        messages: nextMessages,
        text,
      });
      setChats((prev) =>
        promoteUpdatedChat(prev, chatId, (chat) => ({
          ...chat,
          messages: [...chat.messages, createMessage('assistant', aiReply)],
          isSending: false,
          updatedAt: Date.now(),
        })),
      );
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Неизвестная ошибка';
      setChats((prev) =>
        promoteUpdatedChat(prev, chatId, (chat) => ({
          ...chat,
          isSending: false,
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

          <div className="chat-messages" aria-live="polite" ref={messagesRef}>
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
                        <Paragraph className="bubble-text">{message.content}</Paragraph>
                      </div>
                    </Space>
                  </Card>
                </Flex>
              );
            })}
            {isSending && (
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
