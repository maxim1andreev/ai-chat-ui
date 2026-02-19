import type {
  ApiChatDto,
  ApiChatEntryDto,
  ApiChatsPageDto,
  ApiCreateChatRequest,
  ApiSendMessageResponse,
  ApiStreamChunkDto,
  ChatMessage,
  NormalizedChat,
  SendMessageResult,
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
    title: chat.name || 'Новый чат',
    messages: entries.map(entryToMessage),
    isEntriesLoaded: Array.isArray(chat.entries),
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

interface SendMessageOptions {
  onChunk?: (chunk: string) => void;
}

export async function sendMessageRequest(
  { chatId, content }: SendMessagePayload,
  options: SendMessageOptions = {},
): Promise<SendMessageResult> {
  const response = await fetch(buildUrl(`/chats/${encodeURIComponent(chatId)}/entries/stream`), {
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
              options.onChunk?.(chunk);
            }
          } catch {
            // Ignore malformed chunk event payloads.
          }
        }
        if (eventType === 'final' && data) {
          try {
            const parsed = JSON.parse(data) as ApiSendMessageResponse;
            finalChat = toChat(parsed);
          } catch {
            // Ignore malformed final event payloads.
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
