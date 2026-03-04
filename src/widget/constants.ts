const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:20010';
const WHISPER_CPP_URL = import.meta.env.VITE_WHISPER_CPP_URL;
const CHATS_PAGE_SIZE = Number(import.meta.env.VITE_CHATS_PAGE_SIZE || 20);
const MOCK_DELAY_MS = 700;
const DEFAULT_CHAT_TITLE = 'Новый чат';
const MOCK_FALLBACKS = [
  'Принято. Могу расписать это по шагам.',
  'Хороший вопрос. Нужен короткий или подробный ответ?',
  'Ок, давай сделаем. Сначала определим входные данные.',
  'Могу подготовить пример кода под твой стек.',
];

function parseEnvBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined) return fallback;
  const normalized = String(value).trim().toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(normalized);
}

const USE_MOCK_CHAT = parseEnvBoolean(import.meta.env.VITE_USE_MOCK_CHAT, import.meta.env.DEV);

export {
  API_BASE,
  CHATS_PAGE_SIZE,
  DEFAULT_CHAT_TITLE,
  MOCK_DELAY_MS,
  MOCK_FALLBACKS,
  USE_MOCK_CHAT,
  WHISPER_CPP_URL,
};
