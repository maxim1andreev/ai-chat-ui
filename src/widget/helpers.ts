import type {
  ApiChatDto,
  ApiChatEntryDto,
  ChatMessage,
  ChatRole,
  ChatState,
  NormalizedChat,
} from './types';
import { DEFAULT_CHAT_TITLE, MOCK_FALLBACKS, USE_MOCK_CHAT } from './constants';

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
  if (!lastMessage) return '';
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

export {
  createLocalChat,
  createMessage,
  formatChatTitle,
  getChatPreview,
  getMockReply,
  promoteUpdatedChat,
  sortChats,
  toChat,
  toChatState,
  wait,
};
