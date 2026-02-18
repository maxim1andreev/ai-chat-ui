export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export interface ChatState {
  id: string;
  title: string;
  messages: ChatMessage[];
  isSending: boolean;
  error: string;
  updatedAt: number;
}

export interface RemoteChatEntry {
  id?: string;
  type?: 'question' | 'answer';
  message?: string;
  createdAt?: string;
}

export interface RemoteChatMessage {
  id?: string;
  role: ChatRole;
  content: string;
  message?: string;
  text?: string;
}

export interface RemoteChat {
  id: string;
  name?: string;
  entries?: RemoteChatEntry[];
  updatedAt?: number;
}

export interface SendMessagePayload {
  chatId: string;
  content: string;
}
