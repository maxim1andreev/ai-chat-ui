import type { ChatMessage, RemoteChat, RemoteChatMessage, SendMessagePayload } from '../types/chat';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:20010';
const CHATS_PAGE_SIZE = Number(import.meta.env.VITE_CHATS_PAGE_SIZE || 20);

interface RequestOptions extends RequestInit {
  headers?: HeadersInit;
}

interface JsonPayload {
  [key: string]: unknown;
}

function buildUrl(path: string): string {
  return `${API_BASE}${path}`;
}

function resolveMessageContent(message: RemoteChatMessage): string {
  if (typeof message.content === 'string') return message.content;
  if (typeof message.message === 'string') return message.message;
  if (typeof message.text === 'string') return message.text;
  return '';
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

function toMessage(message: RemoteChatMessage): ChatMessage {
  const role = message.role || (message.type === 'question' ? 'user' : 'assistant');

  return {
    id: message.id || crypto.randomUUID(),
    role,
    content: resolveMessageContent(message),
  };
}

function toChat(chat: Partial<RemoteChat>): RemoteChat & { title: string; messages: ChatMessage[]; updatedAt: number } {
  const rawMessages =
    (Array.isArray(chat.messages) && chat.messages) ||
    (Array.isArray(chat.entries) && chat.entries) ||
    [];

  return {
    id: chat.id || crypto.randomUUID(),
    title: chat.title || chat.name || 'Новый чат',
    messages: rawMessages.map(toMessage),
    updatedAt: chat.updated_at ? new Date(chat.updated_at).getTime() : Date.now(),
  };
}

function extractChats(payload: unknown): Partial<RemoteChat>[] {
  if (Array.isArray(payload)) return payload as Partial<RemoteChat>[];
  if (!payload || typeof payload !== 'object') return [];

  const data = payload as {
    chats?: unknown;
    data?: unknown;
    items?: unknown;
    content?: unknown;
  };

  if (Array.isArray(data.chats)) return data.chats as Partial<RemoteChat>[];
  if (Array.isArray(data.data)) return data.data as Partial<RemoteChat>[];
  if (Array.isArray(data.items)) return data.items as Partial<RemoteChat>[];
  if (Array.isArray(data.content)) return data.content as Partial<RemoteChat>[];

  return [];
}

function extractCreatedChat(payload: unknown): Partial<RemoteChat> {
  if (!payload || typeof payload !== 'object') {
    return { id: crypto.randomUUID(), title: 'Новый чат', messages: [] };
  }

  const data = payload as {
    chat?: Partial<RemoteChat>;
    data?: Partial<RemoteChat>;
    id?: string;
    chat_id?: string;
    title?: string;
    name?: string;
  };

  if (data.chat && typeof data.chat === 'object') return data.chat;
  if (data.data && typeof data.data === 'object') return data.data;

  return {
    id: data.id || data.chat_id || crypto.randomUUID(),
    title: data.title,
    name: data.name,
  };
}

function extractAssistantText(payload: unknown): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return '';

  const data = payload as {
    reply?: unknown;
    answer?: unknown;
    message?: unknown;
    content?: unknown;
    text?: unknown;
    entry?: { answer?: unknown; content?: unknown; message?: unknown };
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  if (typeof data.reply === 'string') return data.reply;
  if (typeof data.answer === 'string') return data.answer;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.content === 'string') return data.content;
  if (typeof data.text === 'string') return data.text;

  if (data.entry && typeof data.entry === 'object') {
    if (typeof data.entry.answer === 'string') return data.entry.answer;
    if (typeof data.entry.content === 'string') return data.entry.content;
    if (typeof data.entry.message === 'string') return data.entry.message;
  }

  const choiceMessage = data.choices?.[0]?.message?.content;
  if (typeof choiceMessage === 'string') return choiceMessage;

  return '';
}

export async function listChatsRequest(): Promise<Array<RemoteChat & { title: string; messages: ChatMessage[]; updatedAt: number }>> {
  const data = await fetchJson(buildUrl(`/chats?page=0&size=${CHATS_PAGE_SIZE}`), { method: 'GET' });
  return extractChats(data).map(toChat);
}

export async function getChatRequest(chatId: string): Promise<RemoteChat & { title: string; messages: ChatMessage[]; updatedAt: number }> {
  const data = await fetchJson(buildUrl(`/chats/${encodeURIComponent(chatId)}`), { method: 'GET' });

  if (data && typeof data === 'object' && 'chat' in data) {
    return toChat((data as { chat: Partial<RemoteChat> }).chat);
  }

  return toChat(data as Partial<RemoteChat>);
}

export async function createChatRequest(payload: JsonPayload = {}): Promise<RemoteChat & { title: string; messages: ChatMessage[]; updatedAt: number }> {
  const data = await fetchJson(buildUrl('/chats'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return toChat(extractCreatedChat(data));
}

export async function sendMessageRequest({ chatId, content }: SendMessagePayload): Promise<string> {
  const data = await fetchJson(buildUrl(`/chats/${encodeURIComponent(chatId)}/entries`), {
    method: 'POST',
    body: JSON.stringify({
      message: content,
    }),
  });

  const assistantText = extractAssistantText(data);
  if (!assistantText) {
    throw new Error('Пустой ответ от сервера.');
  }

  return assistantText;
}
