# Chat API Contract (Strict Postman)

База API:

- `VITE_API_BASE_URL` (по умолчанию `http://localhost:20010`)

## 1. Get chats page

`GET /chats?page=0&size=3`

Фронтенд ожидает формат:

```json
{
  "content": [
    {
      "id": "f618e003-ff5f-4a7f-a902-d44b7b4affb6",
      "name": "Test chat"
    }
  ]
}
```

## 2. Create chat

`POST /chats`

Тело:

```json
{
  "name": "Test chat"
}
```

Ответ:

```json
{
  "id": "f618e003-ff5f-4a7f-a902-d44b7b4affb6",
  "name": "Test chat"
}
```

## 3. Get chat

`GET /chats/:chatId`

Ответ:

```json
{
  "id": "f618e003-ff5f-4a7f-a902-d44b7b4affb6",
  "name": "Test chat",
  "entries": [
    {
      "id": "entry_1",
      "type": "question",
      "message": "Привет"
    },
    {
      "id": "entry_2",
      "type": "answer",
      "message": "Здравствуйте"
    }
  ]
}
```

Маппинг во фронте:

- `type: "question"` -> роль `user`
- `type: "answer"` -> роль `assistant`

## 4. Send message

`POST /chats/:chatId/entries`

Тело:

```json
{
  "message": "Какая завтра будет погода в Москве?"
}
```

Ответ (один из ожидаемых):

```json
{
  "message": "Завтра в Москве ..."
}
```

или

```json
{
  "answer": "Завтра в Москве ..."
}
```

или

```json
{
  "entry": {
    "message": "Завтра в Москве ..."
  }
}
```
