# Mock Chat Server

Node.js + Express mock backend for the chat UI DTO.

## Run

```bash
cd mock-server
npm install
npm start
```

Server starts on `http://localhost:20010`.

## Endpoints

- `GET /chats?page=0&size=3`
- `POST /chats`
- `GET /chats/:chatUid`
- `POST /chats/:chatUid/entries`
- `POST /chats/:chatUid/entries/stream`
- `POST /inference`

`POST /chats/:chatUid/entries` simulates a blocking model call with a short delay and returns the full chat with appended `USER` + `ASSISTANT` entries.
`POST /chats/:chatUid/entries/stream` streams `event:chunk` and closes with `event:final`.
`POST /inference` accepts `multipart/form-data` with fields:

- `file`
- `response_format=json`

and returns:

```json
{
  "text": "The stale smell of old beer lingers..."
}
```

## Markdown test prompts

Send one of these messages to quickly validate markdown rendering in UI:

- `markdown`
- `table`
- `code`
- `list`

## Local env

For testing voice dictation against the same mock server:

```bash
VITE_WHISPER_CPP_URL=http://localhost:20010
```
