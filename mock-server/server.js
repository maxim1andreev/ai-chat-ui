import cors from 'cors';
import express from 'express';
import crypto from 'crypto';

const app = express();
const port = process.env.PORT || 20010;

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

function generateAssistantReply(userText) {
  const text = userText.toLowerCase();
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

  // Simulate model latency (blocking-style endpoint)
  await new Promise((resolve) => {
    setTimeout(resolve, 900);
  });

  chat.entries.push(createEntry('ASSISTANT', generateAssistantReply(userMessage)));

  res.json(chat);
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Mock chat server is running at http://localhost:${port}`);
});
