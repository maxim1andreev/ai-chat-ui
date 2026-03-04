interface WhisperInferenceResponse {
  text?: string;
}

const WHISPER_CPP_URL = import.meta.env.VITE_WHISPER_CPP_URL;

function buildWhisperUrl(path: string): string {
  if (!WHISPER_CPP_URL) {
    throw new Error('Не задан VITE_WHISPER_CPP_URL');
  }

  return `${WHISPER_CPP_URL}${path}`;
}

export async function transcribeAudioRequest(
  file: File,
  signal?: AbortSignal,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('response_format', 'json');

  const response = await fetch(buildWhisperUrl('/inference'), {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = (await response.json()) as WhisperInferenceResponse;
  const text = typeof data.text === 'string' ? data.text.trim() : '';

  if (!text) {
    throw new Error('Whisper вернул пустую транскрипцию.');
  }

  return text;
}
