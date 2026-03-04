import cors from 'cors';
import express from 'express';
import crypto from 'crypto';
import multer from 'multer';

const app = express();
const port = process.env.PORT || 20010;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

function nowIso() {
  return new Date().toISOString();
}

function createEntry(entryType, message) {
  return {
    uid: crypto.randomUUID(),
    createdAt: nowIso(),
    entryType,
    message,
  };
}

function createChat(name) {
  return {
    uid: crypto.randomUUID(),
    name,
    createdAt: nowIso(),
    entries: [],
  };
}

function formatChatName(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Новый чат';
  return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

function generateAssistantReply(userText) {
  const text = userText.toLowerCase();
  if (text.includes('markdown') || text.includes('md')) {
    return `### Пример Markdown

Это **жирный** и *курсивный* текст.

- пункт 1
- пункт 2
- пункт 3

\`\`\`ts
type User = { id: string; name: string };
const user: User = { id: '1', name: 'Max' };
\`\`\`

[Ссылка на Vite](https://vite.dev)`;
  }
  if (text.includes('table') || text.includes('таблиц')) {
    return `| Поле | Значение |
| --- | --- |
| model | qwen |
| stream | true |
| format | markdown |`;
  }
  if (text.includes('code') || text.includes('код')) {
    return `\`\`\`js
function sum(a, b) {
  return a + b;
}
console.log(sum(2, 3));
\`\`\``;
  }
  if (text.includes('list') || text.includes('спис')) {
    return `1. Подключить API
2. Отправить сообщение
3. Обработать stream
4. Обновить UI`;
  }
  if (text.includes('погод')) {
    return 'Завтра ожидается облачность, возможен слабый снег, температура около -8°C.';
  }
  if (text.includes('react')) {
    return 'React подходит: начни с декомпозиции на компоненты и явной типизации props/state.';
  }
  if (text.includes('qwen')) {
    return 'Для Qwen лучше держать system prompt на backend и логировать входные messages.';
  }
  return 'Принято. Могу продолжить и расписать это более подробно по шагам.';
}

function generateTranscription(fileName = '') {
  const normalized = fileName.toLowerCase();
  if (normalized.includes('weather')) {
    return 'Какая завтра будет погода в Москве?';
  }
  if (normalized.includes('markdown') || normalized.includes('md')) {
    return 'Покажи markdown пример с кодом и списком.';
  }
  if (normalized.includes('react')) {
    return 'Расскажи кратко про React hooks.';
  }

  return 'The stale smell of old beer lingers.\nIt takes heat to bring out the odor.\nA cold dip restores health and zest.\nA salt pickle tastes fine with ham.\nTacos al pastor are my favorite.\nA zestful food is the hot cross bun.';
}

const chats = [];

// Seed one demo chat
{
  const seedChat = createChat('Test chat');
  seedChat.entries.push(
    createEntry('USER', 'Какая завтра будет погода в Москве?'),
    createEntry(
      'ASSISTANT',
      'Завтра в Москве ожидается туман, температура воздуха будет около -7°C.',
    ),
    createEntry('USER', 'Покажи markdown пример'),
    createEntry(
      'ASSISTANT',
      `### Демо markdown

Вот пример списка:
- один
- два

И небольшой код:
\`\`\`python
print("hello markdown")
\`\`\``,
    ),
  );
  chats.push(seedChat);
}

app.get('/chats', (req, res) => {
  const page = Number(req.query.page ?? 0);
  const size = Number(req.query.size ?? 20);

  const safePage = Number.isFinite(page) && page >= 0 ? page : 0;
  const safeSize = Number.isFinite(size) && size > 0 ? size : 20;
  const start = safePage * safeSize;
  const end = start + safeSize;

  const summaries = chats
    .map((chat) => ({
      uid: chat.uid,
      name: chat.name,
      createdAt: chat.createdAt,
    }))
    .slice(start, end);

  const totalElements = chats.length;
  const totalPages = Math.max(1, Math.ceil(totalElements / safeSize));

  res.json({
    page: safePage,
    size: safeSize,
    totalPages,
    totalElements,
    chats: summaries,
  });
});

app.post('/chats', (req, res) => {
  const name = typeof req.body?.name === 'string' && req.body.name.trim()
    ? req.body.name.trim()
    : 'Test chat';

  const chat = createChat(name);
  chats.unshift(chat);
  res.status(201).json(chat);
});

app.get('/chats/:chatUid', (req, res) => {
  const chat = chats.find((item) => item.uid === req.params.chatUid);
  if (!chat) {
    res.status(404).json({ message: 'Chat not found' });
    return;
  }

  res.json(chat);
});

app.post('/chats/:chatUid/entries', async (req, res) => {
  const chat = chats.find((item) => item.uid === req.params.chatUid);
  if (!chat) {
    res.status(404).json({ message: 'Chat not found' });
    return;
  }

  const userMessage =
    typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!userMessage) {
    res.status(400).json({ message: 'Field "message" is required' });
    return;
  }

  chat.entries.push(createEntry('USER', userMessage));
  if (chat.name === 'Новый чат') {
    chat.name = formatChatName(userMessage);
  }

  // Simulate model latency (blocking-style endpoint)
  await new Promise((resolve) => {
    setTimeout(resolve, 900);
  });

  chat.entries.push(createEntry('ASSISTANT', generateAssistantReply(userMessage)));

  res.json(chat);
});

app.post('/chats/:chatUid/entries/stream', async (req, res) => {
  const chat = chats.find((item) => item.uid === req.params.chatUid);
  if (!chat) {
    res.status(404).json({ message: 'Chat not found' });
    return;
  }

  const userMessage =
    typeof req.body?.message === 'string' ? req.body.message.trim() : '';

  if (!userMessage) {
    res.status(400).json({ message: 'Field "message" is required' });
    return;
  }

  chat.entries.push(createEntry('USER', userMessage));
  if (chat.name === 'Новый чат') {
    chat.name = formatChatName(userMessage);
  }
  const assistantReply = generateAssistantReply(userMessage);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  await new Promise((resolve) => {
    setTimeout(resolve, 600);
  });

  const units = Array.from(assistantReply);
  const chunks = [];
  for (let i = 0; i < units.length; i += 4) {
    chunks.push(units.slice(i, i + 4).join(''));
  }
  for (const chunk of chunks) {
    res.write(`event:chunk\n`);
    res.write(`data:${JSON.stringify({ content: chunk })}\n\n`);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  chat.entries.push(createEntry('ASSISTANT', assistantReply));
  res.write('event:final\n');
  res.write(`data:${JSON.stringify(chat)}\n\n`);
  res.end();
});

app.post('/inference', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: 'Field "file" is required' });
    return;
  }

  const responseFormat =
    typeof req.body?.response_format === 'string' ? req.body.response_format : '';

  if (responseFormat && responseFormat !== 'json') {
    res.status(400).json({ message: 'Only response_format=json is supported' });
    return;
  }

  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });

  res.json({
    text: generateTranscription(req.file.originalname),
  });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Mock chat server is running at http://localhost:${port}`);
});
