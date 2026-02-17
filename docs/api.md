# Chat API Contract (Qwen v2)

Фронтенд работает с API базой:

- `VITE_API_BASE_URL` (по умолчанию `/api/v2`)

## 1. Создать новый чат

`POST /api/v2/chats/new`

Тело запроса (минимум):

```json
{
  "title": "Новый чат"
}
```

Поддерживаемые варианты ответа:

```json
{ "id": "chat_123", "title": "Новый чат" }
```

или

```json
{ "chat_id": "chat_123" }
```

или

```json
{ "chat": { "id": "chat_123", "title": "Новый чат" } }
```

## 2. Получить список предыдущих чатов

`GET /api/v2/chats`

Поддерживаемые форматы ответа:

```json
{
  "chats": [
    {
      "id": "chat_123",
      "title": "Онбординг",
      "updated_at": "2026-02-17T10:00:00.000Z",
      "messages": [
        { "id": "m1", "role": "assistant", "content": "Привет" },
        { "id": "m2", "role": "user", "content": "Начнем" }
      ]
    }
  ]
}
```

Также поддерживается массив в корне (`[]`), `data: []` или `items: []`.

## 3. Отправить сообщение (SSE stream)

`POST /api/v2/chat/completions?chat_id=<CHAT_ID>`

Тело запроса:

```json
{
  "content": "Привет",
  "stream": true,
  "messages": [
    { "role": "assistant", "content": "Привет" },
    { "role": "user", "content": "Расскажи про Qwen" }
  ]
}
```

Ожидаемый тип ответа:

- `Content-Type: text/event-stream`

Поддерживаемые `data:` чанки стрима:

1. OpenAI/Qwen-совместимый delta
```json
{"choices":[{"delta":{"content":"Привет "}}]}
```

2. OpenAI/Qwen-совместимый message
```json
{"choices":[{"message":{"content":"Привет"}}]}
```

3. Простой формат
```json
{"content":"Привет"}
```

Завершение стрима:

```text
data: [DONE]
```

## Fallback без SSE

Если backend вернул `application/json`, фронтенд читает один из форматов:

- `{ "reply": "..." }`
- `{ "message": "..." }`
- `{ "message": { "content": "..." } }`
- `{ "choices": [{ "message": { "content": "..." } }] }`

## Ошибки

На ошибке API должен возвращать HTTP-код `>= 400`.
Фронтенд покажет: `Ошибка запроса: HTTP <status>`.
