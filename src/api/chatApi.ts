import type {
  ApiChatDto,
  ApiChatEntryDto,
  ApiChatsPageDto,
  ApiCreateChatRequest,
  ApiSendMessageResponse,
  NormalizedChat,
  SendMessagePayload,
} from '../types/chat';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:20010';
const CHATS_PAGE_SIZE = Number(import.meta.env.VITE_CHATS_PAGE_SIZE || 20);

interface RequestOptions extends RequestInit {
  headers?: HeadersInit;
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

function entryToMessage(entry: ApiChatEntryDto) {
  return {
    id: entry.uid,
    role: entry.entryType === 'USER' ? 'user' : 'assistant',
    content: entry.message,
  };
}

function toChat(chat: ApiChatDto): NormalizedChat {
  const hasEntries = Array.isArray(chat.entries);
  return {
    id: chat.uid,
    title: chat.name || 'Новый чат',
    messages: hasEntries ? chat.entries.map(entryToMessage) : [],
    isEntriesLoaded: hasEntries,
    updatedAt: chat.createdAt ? new Date(chat.createdAt).getTime() : Date.now(),
  };
}

export async function listChatsRequest(): Promise<NormalizedChat[]> {
  const data = (await fetchJson(
    buildUrl(`/chats?page=0&size=${CHATS_PAGE_SIZE}`),
    { method: 'GET' },
  )) as ApiChatsPageDto;

  const chats = Array.isArray(data?.chats) ? data.chats : [];
  return chats.map(toChat);
}

export async function getChatRequest(chatId: string): Promise<NormalizedChat> {
  const data = (await fetchJson(
    buildUrl(`/chats/${encodeURIComponent(chatId)}`),
    { method: 'GET' },
  )) as ApiChatDto;

  return toChat(data);
}

export async function createChatRequest(payload: ApiCreateChatRequest): Promise<NormalizedChat> {
  const data = (await fetchJson(buildUrl('/chats'), {
    method: 'POST',
    body: JSON.stringify(payload),
  })) as ApiChatDto;

  return toChat(data);
}

export async function sendMessageRequest({ chatId, content }: SendMessagePayload): Promise<string> {
  const data = await fetchJson(buildUrl(`/chats/${encodeURIComponent(chatId)}/entries`), {
    method: 'POST',
    body: JSON.stringify({ message: content }),
  }) as ApiSendMessageResponse;

  const entries = Array.isArray(data?.entries) ? data.entries : [];
  const assistantEntry = [...entries].reverse().find((entry) => entry.entryType === 'ASSISTANT');
  if (!assistantEntry?.message) {
    throw new Error('В ответе нет сообщения ассистента.');
  }

  return assistantEntry.message;
}
