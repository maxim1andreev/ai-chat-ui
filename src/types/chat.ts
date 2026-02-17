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

export interface RemoteChatMessage {
  id?: string;
  role: ChatRole;
  content: string;
}

export interface RemoteChat {
  id: string;
  title?: string;
  messages?: RemoteChatMessage[];
  updated_at?: string;
  updatedAt?: number;
}

export interface SendMessagePayload {
  chatId: string;
  content: string;
  messages: ChatMessage[];
}
