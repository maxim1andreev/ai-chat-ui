import type { ChatMessage, RemoteChat, RemoteChatMessage, SendMessagePayload } from '../types/chat';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v2';

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike };
type JsonObject = Record<string, JsonLike>;

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

function toMessage(message: RemoteChatMessage): ChatMessage {
  return {
    id: message.id || crypto.randomUUID(),
    role: message.role,
    content: message.content || '',
  };
}

function toChat(chat: RemoteChat): RemoteChat & { title: string; messages: ChatMessage[]; updatedAt: number } {
  return {
    id: chat.id || crypto.randomUUID(),
    title: chat.title || 'Новый чат',
    messages: Array.isArray(chat.messages) ? chat.messages.map(toMessage) : [],
    updatedAt: chat.updated_at ? new Date(chat.updated_at).getTime() : Date.now(),
  };
}

function extractChatsArray(payload: unknown): RemoteChat[] {
  if (Array.isArray(payload)) return payload as RemoteChat[];
  if (!payload || typeof payload !== 'object') return [];

  const data = payload as {
    chats?: unknown;
    data?: unknown;
    items?: unknown;
  };

  if (Array.isArray(data.chats)) return data.chats as RemoteChat[];
  if (Array.isArray(data.data)) return data.data as RemoteChat[];
  if (Array.isArray(data.items)) return data.items as RemoteChat[];
  return [];
}

function extractCreatedChat(payload: unknown): RemoteChat {
  if (!payload || typeof payload !== 'object') {
    return { id: crypto.randomUUID(), title: 'Новый чат', messages: [] };
  }

  const data = payload as {
    chat?: RemoteChat;
    data?: RemoteChat;
    id?: string;
    chat_id?: string;
    title?: string;
    messages?: RemoteChatMessage[];
    updated_at?: string;
  };

  if (data.chat && typeof data.chat === 'object') return data.chat;
  if (data.data && typeof data.data === 'object') return data.data;

  return {
    id: data.id || data.chat_id || crypto.randomUUID(),
    title: data.title,
    messages: data.messages,
    updated_at: data.updated_at,
  };
}

function extractStreamDelta(payload: string): string {
  if (!payload || payload === '[DONE]') return '';

  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{
        delta?: { content?: unknown };
        message?: { content?: unknown };
      }>;
      message?: { content?: unknown } | unknown;
      content?: unknown;
      text?: unknown;
    };

    const deltaContent = parsed.choices?.[0]?.delta?.content;
    if (typeof deltaContent === 'string') return deltaContent;

    const messageContent = parsed.choices?.[0]?.message?.content;
    if (typeof messageContent === 'string') return messageContent;

    if (parsed.message && typeof parsed.message === 'object') {
      const content = (parsed.message as { content?: unknown }).content;
      if (typeof content === 'string') return content;
    }

    if (typeof parsed.content === 'string') return parsed.content;
    if (typeof parsed.text === 'string') return parsed.text;
    return '';
  } catch {
    return payload;
  }
}

async function readSseAssistantText(response: Response): Promise<string> {
  if (!response.body) {
    throw new Error('Пустой stream-ответ от сервера.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');

    while (boundary !== -1) {
      const eventBlock = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const dataLines = eventBlock
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim());

      dataLines.forEach((line) => {
        result += extractStreamDelta(line);
      });

      boundary = buffer.indexOf('\n\n');
    }
  }

  buffer += decoder.decode();
  const rest = buffer
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());
  rest.forEach((line) => {
    result += extractStreamDelta(line);
  });

  return result.trim();
}

function extractAssistantText(payload: unknown): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return '';

  const data = payload as {
    reply?: unknown;
    message?: unknown;
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  if (typeof data.reply === 'string') return data.reply;
  if (typeof data.message === 'string') return data.message;
  if (
    data.message &&
    typeof data.message === 'object' &&
    typeof (data.message as { content?: unknown }).content === 'string'
  ) {
    return (data.message as { content: string }).content;
  }

  // Qwen/OpenAI-compatible shape: { choices: [{ message: { role, content } }] }
  const choiceMessage = data.choices?.[0]?.message?.content;
  if (typeof choiceMessage === 'string') return choiceMessage;

  return '';
}

export async function listChatsRequest(): Promise<Array<RemoteChat & { title: string; messages: ChatMessage[]; updatedAt: number }>> {
  const data = await fetchJson(buildUrl('/chats'), { method: 'GET' });
  const rawChats = extractChatsArray(data);
  if (!Array.isArray(rawChats)) return [];
  return rawChats.map((chat) => toChat(chat as RemoteChat));
}

export async function createChatRequest(payload: JsonObject = {}): Promise<RemoteChat & { title: string; messages: ChatMessage[]; updatedAt: number }> {
  const data = await fetchJson(buildUrl('/chats/new'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return toChat(extractCreatedChat(data));
}

export async function sendMessageRequest({ chatId, content, messages }: SendMessagePayload): Promise<string> {
  const response = await fetch(`${buildUrl('/chat/completions')}?chat_id=${encodeURIComponent(chatId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
    },
    body: JSON.stringify({
      content,
      messages: messages.map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      })),
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    const streamed = await readSseAssistantText(response);
    if (!streamed) {
      throw new Error('Пустой stream-ответ от сервера.');
    }
    return streamed;
  }

  const data = await response.json();
  const assistantText = extractAssistantText(data);
  if (!assistantText) {
    throw new Error('Пустой ответ от сервера.');
  }

  return assistantText;
}
