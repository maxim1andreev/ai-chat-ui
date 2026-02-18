# Chat API Contract (Exact DTO)

База API:

- `VITE_API_BASE_URL` (по умолчанию `http://localhost:20010`)

## 1. GET `/chats?page=0&size=3`

Ответ:

```json
{
  "page": 0,
  "size": 3,
  "totalPages": 1,
  "totalElements": 1,
  "chats": [
    {
      "uid": "fc90e8e5-fc40-46f8-80a4-197217b39d99",
      "name": "Test chat",
      "createdAt": "2026-02-17T06:32:29.859587Z"
    }
  ]
}
```

## 2. POST `/chats`

Тело:

```json
{
  "name": "Test chat"
}
```

Ответ:

```json
{
  "uid": "1af54961-0f22-447e-84c4-b18e16371d7a",
  "name": "Test chat",
  "createdAt": "2026-02-17T12:36:35.718603300Z",
  "entries": []
}
```

## 3. GET `/chats/{chatUid}`

Ответ:

```json
{
  "uid": "f618e003-ff5f-4a7f-a902-d44b7b4affb6",
  "name": "Test chat",
  "createdAt": "2026-02-17T12:31:09.491691Z",
  "entries": [
    {
      "uid": "f0018dab-0d8b-4e93-9c1c-2e4241dcdcb1",
      "createdAt": "2026-02-17T12:31:17.464966Z",
      "entryType": "USER",
      "message": "Какая завтра будет погода в Москве?"
    },
    {
      "uid": "672aa4cd-b0f9-4007-a897-062b1c9469a6",
      "createdAt": "2026-02-17T12:32:32.188931Z",
      "entryType": "ASSISTANT",
      "message": "Завтра в Москве ожидается туман..."
    }
  ]
}
```

## 4. POST `/chats/{chatUid}/entries`

Тело:

```json
{
  "message": "Какая завтра будет погода в Москве?"
}
```

Ответ: тот же DTO, что у `GET /chats/{chatUid}`, но с добавленными новыми `entries`.

Поведение фронта:

- `entryType: "USER"` -> `role: "user"`
- `entryType: "ASSISTANT"` -> `role: "assistant"`
- после отправки фронт берет последнее `ASSISTANT` сообщение из `entries`
