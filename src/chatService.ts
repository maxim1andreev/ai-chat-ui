import {
  createChatRequest,
  getChatRequest,
  listChatsRequest,
  sendMessageRequest,
} from './api/chatApi';
import type { ChatMessage, ChatRole, ChatState, RemoteChat } from './types/chat';

const MOCK_DELAY_MS = 700;
const DEFAULT_CHAT_TITLE = 'Новый чат';
const MOCK_FALLBACKS = [
  'Принято. Могу расписать это по шагам.',
  'Хороший вопрос. Нужен короткий или подробный ответ?',
  'Ок, давай сделаем. Сначала определим входные данные.',
  'Могу подготовить пример кода под твой стек.',
];

function parseEnvBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(normalized);
}

export const USE_MOCK_CHAT = parseEnvBoolean(import.meta.env.VITE_USE_MOCK_CHAT, import.meta.env.DEV);
export { DEFAULT_CHAT_TITLE };

export function createMessage(role: ChatRole, content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
  };
}

function toChatState(chat: RemoteChat & { title?: string; messages?: ChatMessage[] }): ChatState {
  return {
    id: chat.id || crypto.randomUUID(),
    title: chat.title || DEFAULT_CHAT_TITLE,
    messages: Array.isArray(chat.messages)
      ? chat.messages.map((message) => createMessage(message.role, message.content))
      : [createMessage('assistant', 'Привет! Я готов помочь. Задай вопрос.')],
    isSending: false,
    error: '',
    updatedAt: chat.updatedAt || Date.now(),
  };
}

export function createLocalChat(): ChatState {
  return toChatState({
    id: crypto.randomUUID(),
    title: DEFAULT_CHAT_TITLE,
    messages: [
      {
        role: 'assistant',
        content: USE_MOCK_CHAT
          ? 'Привет! Включен мок-режим. Напиши сообщение для теста общения.'
          : 'Привет! Я готов помочь. Задай вопрос.',
      },
    ],
  });
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

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function listChats(): Promise<ChatState[]> {
  if (USE_MOCK_CHAT) return [createLocalChat()];
  const remoteChats = await listChatsRequest();
  if (remoteChats.length === 0) return [];
  return remoteChats.map(toChatState);
}

export async function createChat(): Promise<ChatState> {
  if (USE_MOCK_CHAT) return createLocalChat();
  const remoteChat = await createChatRequest({ name: DEFAULT_CHAT_TITLE });
  return toChatState(remoteChat);
}

export async function getChat(chatId: string): Promise<ChatState> {
  if (USE_MOCK_CHAT) return createLocalChat();
  const remoteChat = await getChatRequest(chatId);
  return toChatState(remoteChat);
}

interface RequestAssistantReplyParams {
  chatId: string;
  text: string;
}

export async function requestAssistantReply({
  chatId,
  text,
}: RequestAssistantReplyParams): Promise<string> {
  if (USE_MOCK_CHAT) {
    await wait(MOCK_DELAY_MS);
    return getMockReply(text);
  }

  return sendMessageRequest({
    chatId,
    content: text,
  });
}
