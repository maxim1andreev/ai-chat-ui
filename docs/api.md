# Chat API Contract (Postman)

API базируется на адресе:

- `VITE_API_BASE_URL` (по умолчанию `http://localhost:20010`)

## 1. Получить страницу чатов

`GET /chats?page=0&size=3`

Фронтенд использует `size` из `VITE_CHATS_PAGE_SIZE` (по умолчанию `20`).

Поддерживаемые ответы:

1. Spring Page-формат:
```json
{
  "content": [
    { "id": "chat_1", "name": "Test chat" }
  ]
}
```

2. Объект с `chats`:
```json
{ "chats": [{ "id": "chat_1", "name": "Test chat" }] }
```

3. Массив в корне:
```json
[{ "id": "chat_1", "name": "Test chat" }]
```

## 2. Создать чат

`POST /chats`

Тело:

```json
{
  "name": "Test chat"
}
```

Поддерживаемые ответы:

```json
{ "id": "chat_1", "name": "Test chat" }
```

или

```json
{ "chat": { "id": "chat_1", "name": "Test chat" } }
```

## 3. Получить один чат

`GET /chats/:chatId`

Ответ может содержать:

- `messages` или `entries`
- поля сообщения: `content` или `message`

Пример:

```json
{
  "id": "chat_1",
  "name": "Test chat",
  "entries": [
    { "id": "e1", "role": "user", "message": "Привет" },
    { "id": "e2", "role": "assistant", "message": "Здравствуйте" }
  ]
}
```

## 4. Отправить сообщение

`POST /chats/:chatId/entries`

Тело:

```json
{
  "message": "Какая завтра будет погода в Москве?"
}
```

Фронтенд ожидает текст ответа в одном из полей:

- `reply`
- `answer`
- `message`
- `content`
- `text`
- `entry.answer`
- `entry.content`
- `entry.message`

## Системный промпт

Системную инструкцию (например, `Ты лаконичный ассистент.`) обычно задают на backend-слое при вызове модели, а не из браузера.
