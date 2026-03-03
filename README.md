# AI Chat UI (React + Vite)

SPA чат-интерфейс для ИИ на React + Vite.

## Запуск

```bash
npm install
npm run dev
```

## Сборка

```bash
npm run build
npm run preview
```

## API

Контракт API вынесен в отдельный файл:

- `docs/api.md`

Там описаны запросы:

- `GET /chats?page=0&size=...` (список чатов)
- `POST /chats` (создание чата)
- `GET /chats/:chatId` (получение истории чата)
- `POST /chats/:chatId/entries/stream` (стримовая отправка сообщения)

Для распознавания аудио поддерживается `whisper.cpp`:

- `POST {{VITE_WHISPER_CPP_URL}}/inference`
- `multipart/form-data`
- поля:
  - `file`
  - `response_format=json`

## Переменные окружения

Скопируй `.env.example` в `.env` при необходимости:

```bash
VITE_API_BASE_URL=http://localhost:20010
VITE_CHATS_PAGE_SIZE=20
VITE_USE_MOCK_CHAT=false
VITE_WHISPER_CPP_URL=http://localhost:8080
```

`VITE_USE_MOCK_CHAT=true` включает мок-ответы без реального backend API.
Если переменная не задана, в dev-режиме (`npm run dev`) мок включен по умолчанию.
Для работы с реальным API установи `VITE_USE_MOCK_CHAT=false`.
