import type {
  ChatMessage,
  RemoteChat,
  RemoteChatEntry,
  SendMessagePayload,
} from '../types/chat';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:20010';
const CHATS_PAGE_SIZE = Number(import.meta.env.VITE_CHATS_PAGE_SIZE || 20);

interface RequestOptions extends RequestInit {
  headers?: HeadersInit;
}

interface ListChatsResponse {
  content: RemoteChat[];
}

function buildUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function fetchJson(url: string, options: RequestOptions = {}): Promise<unknown> {
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

function entryToMessage(entry: RemoteChatEntry): ChatMessage {
  return {
    id: entry.id || crypto.randomUUID(),
    role: entry.type === 'question' ? 'user' : 'assistant',
    content: entry.message || '',
  };
}

function toChat(chat: RemoteChat): RemoteChat & { title: string; messages: ChatMessage[]; updatedAt: number } {
  return {
    id: chat.id,
    name: chat.name,
    title: chat.name || 'Новый чат',
    messages: Array.isArray(chat.entries) ? chat.entries.map(entryToMessage) : [],
    updatedAt: chat.updatedAt || Date.now(),
  };
}

function extractAssistantText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';

  const data = payload as {
    message?: unknown;
    answer?: unknown;
    entry?: { message?: unknown };
  };

  if (typeof data.answer === 'string') return data.answer;
  if (typeof data.message === 'string') return data.message;
  if (data.entry && typeof data.entry.message === 'string') return data.entry.message;

  return '';
}

export async function listChatsRequest(): Promise<Array<RemoteChat & { title: string; messages: ChatMessage[]; updatedAt: number }>> {
  const data = (await fetchJson(
    buildUrl(`/chats?page=0&size=${CHATS_PAGE_SIZE}`),
    { method: 'GET' },
  )) as ListChatsResponse;

  const chats = Array.isArray(data?.content) ? data.content : [];
  return chats.map(toChat);
}

export async function getChatRequest(chatId: string): Promise<RemoteChat & { title: string; messages: ChatMessage[]; updatedAt: number }> {
  const data = (await fetchJson(
    buildUrl(`/chats/${encodeURIComponent(chatId)}`),
    { method: 'GET' },
  )) as RemoteChat;

  return toChat(data);
}

export async function createChatRequest(payload: { name: string }): Promise<RemoteChat & { title: string; messages: ChatMessage[]; updatedAt: number }> {
  const data = (await fetchJson(buildUrl('/chats'), {
    method: 'POST',
    body: JSON.stringify(payload),
  })) as RemoteChat;

  return toChat(data);
}

export async function sendMessageRequest({ chatId, content }: SendMessagePayload): Promise<string> {
  const data = await fetchJson(buildUrl(`/chats/${encodeURIComponent(chatId)}/entries`), {
    method: 'POST',
    body: JSON.stringify({ message: content }),
  });

  const assistantText = extractAssistantText(data);
  if (!assistantText) {
    throw new Error('Пустой ответ от сервера.');
  }

  return assistantText;
}
