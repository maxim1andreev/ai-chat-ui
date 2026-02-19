export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export interface ChatState {
  id: string;
  title: string;
  messages: ChatMessage[];
  isEntriesLoaded: boolean;
  isSending: boolean;
  isAwaitingFirstChunk: boolean;
  streamingMessageId?: string;
  error: string;
  updatedAt: number;
}

export interface ApiChatEntryDto {
  uid: string;
  entryType: 'USER' | 'ASSISTANT';
  message: string;
  createdAt?: string;
}

export interface ApiChatDto {
  uid: string;
  name: string;
  createdAt?: string;
  entries?: ApiChatEntryDto[];
}

export interface ApiChatsPageDto {
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  chats: ApiChatDto[];
}

export interface ApiCreateChatRequest {
  name: string;
}

export interface ApiSendMessageRequest {
  message: string;
}

export interface ApiSendMessageResponse {
  uid: string;
  name: string;
  createdAt?: string;
  entries: ApiChatEntryDto[];
}

export interface ApiStreamChunkDto {
  content: string;
}

export interface SendMessagePayload {
  chatId: string;
  content: string;
}

export interface SendMessageResult {
  assistantText: string;
  finalChat?: NormalizedChat;
}

export interface NormalizedChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  isEntriesLoaded: boolean;
  updatedAt: number;
}
