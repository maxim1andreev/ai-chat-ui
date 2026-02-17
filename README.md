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

- `GET /api/chats` (список чатов)
- `POST /api/chats` (создание чата)
- `POST /api/chats/:chatId/messages` (отправка сообщения)

Для ответа сообщения поддерживается и Qwen/OpenAI-compatible формат `choices[0].message.content`.

## Переменные окружения

Скопируй `.env.example` в `.env` при необходимости:

```bash
VITE_API_BASE_URL=/api
VITE_USE_MOCK_CHAT=true
```

`VITE_USE_MOCK_CHAT=true` включает мок-ответы без реального backend API.
Если переменная не задана, в dev-режиме (`npm run dev`) мок включен по умолчанию.
Для работы с реальным API установи `VITE_USE_MOCK_CHAT=false`.
