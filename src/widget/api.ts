import {
  API_BASE,
  CHATS_PAGE_SIZE,
  DEFAULT_CHAT_TITLE,
  WHISPER_CPP_URL,
} from './constants';
import type {
  ApiChatDto,
  ApiChatsPageDto,
  ApiSendMessageResponse,
  ApiStreamChunkDto,
  NormalizedChat,
  SendMessageResult,
  WhisperInferenceResponse,
} from './types';
import { toChat } from './helpers';

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

export {
  createChatRequest,
  getChatRequest,
  listChatsRequest,
  sendMessageRequest,
  transcribeAudioRequest,
};
