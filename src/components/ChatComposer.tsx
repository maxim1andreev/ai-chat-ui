import { AudioOutlined, SendOutlined } from '@ant-design/icons';
import { Alert, Button, Input } from 'antd';
import type { FormEvent, KeyboardEvent, RefObject } from 'react';

const { TextArea } = Input;

interface ChatComposerProps {
  input: string;
  hasText: boolean;
  isSending: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  transcriptionError: string;
  formRef: RefObject<HTMLFormElement>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onInputChange: (value: string) => void;
  onAudioToggle: () => void;
}

export function ChatComposer({
  input,
  hasText,
  isSending,
  isRecording,
  isTranscribing,
  transcriptionError,
  formRef,
  onSubmit,
  onInputChange,
  onAudioToggle,
}: ChatComposerProps) {
  return (
    <form className="chat-form" onSubmit={onSubmit} ref={formRef}>
      <TextArea
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        placeholder="Напиши сообщение..."
        autoSize={{ minRows: 2, maxRows: 6 }}
        disabled={isSending}
      />
      {transcriptionError && <Alert type="warning" showIcon message={transcriptionError} />}
      <div className="chat-actions">
        <Button
          className={`voice-button ${isRecording ? 'voice-button-recording' : ''} ${
            isTranscribing ? 'voice-button-transcribing' : ''
          }`}
          htmlType="button"
          icon={<AudioOutlined />}
          onClick={onAudioToggle}
          loading={isTranscribing}
          disabled={isSending}
          danger={isRecording}
        >
          <span className="voice-button-label">
            {isRecording && <span className="voice-indicator voice-indicator-recording" />}
            {isTranscribing && <span className="voice-indicator voice-indicator-transcribing" />}
            {isRecording
              ? 'Слушаю...'
              : isTranscribing
                ? 'Распознаю...'
                : 'Надиктовать'}
          </span>
        </Button>
        <Button
          type="primary"
          htmlType="submit"
          icon={<SendOutlined />}
          disabled={!hasText}
          loading={isSending}
        >
          Отправить
        </Button>
      </div>
    </form>
  );
}
