import { useEffect, useRef, useState } from 'react';
import { transcribeAudioRequest } from '../api/whisperApi';
import { encodeWav, mergeFloat32Chunks } from '../utils/audio';

interface UseVoiceRecorderParams {
  onTranscription: (text: string) => void;
}

interface UseVoiceRecorderResult {
  isRecording: boolean;
  isTranscribing: boolean;
  transcriptionError: string;
  handleAudioToggle: () => Promise<void>;
  cancelAudioCapture: () => void;
}

export function useVoiceRecorder({
  onTranscription,
}: UseVoiceRecorderParams): UseVoiceRecorderResult {
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(16000);
  const transcriptionAbortControllerRef = useRef<AbortController | null>(null);
  const transcriptionRequestIdRef = useRef(0);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');

  useEffect(
    () => () => {
      transcriptionAbortControllerRef.current?.abort();
      processorNodeRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      audioContextRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  function stopRecordingSession() {
    processorNodeRef.current?.disconnect();
    sourceNodeRef.current?.disconnect();
    audioContextRef.current?.close();
    sourceNodeRef.current = null;
    processorNodeRef.current = null;
    audioContextRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setIsRecording(false);
  }

  async function transcribeRecordedAudio(blob: Blob) {
    const file = new File([blob], 'voice-note.wav', {
      type: 'audio/wav',
    });

    const requestId = transcriptionRequestIdRef.current + 1;
    transcriptionRequestIdRef.current = requestId;
    const abortController = new AbortController();
    transcriptionAbortControllerRef.current = abortController;

    setIsTranscribing(true);
    setTranscriptionError('');

    try {
      const transcript = await transcribeAudioRequest(file, abortController.signal);
      if (transcriptionRequestIdRef.current !== requestId) return;
      onTranscription(transcript);
    } catch (error) {
      if (abortController.signal.aborted) return;
      if (transcriptionRequestIdRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : 'Не удалось распознать аудио';
      setTranscriptionError(`Ошибка распознавания: ${message}`);
    } finally {
      if (transcriptionRequestIdRef.current === requestId) {
        transcriptionAbortControllerRef.current = null;
        setIsTranscribing(false);
      }
    }
  }

  function cancelAudioCapture() {
    if (isRecording) {
      stopRecordingSession();
      pcmChunksRef.current = [];
      setTranscriptionError('');
      return;
    }

    if (isTranscribing) {
      transcriptionRequestIdRef.current += 1;
      transcriptionAbortControllerRef.current?.abort();
      transcriptionAbortControllerRef.current = null;
      setIsTranscribing(false);
      setTranscriptionError('');
    }
  }

  async function handleAudioToggle() {
    if (isTranscribing) return;

    if (isRecording) {
      stopRecordingSession();

      const recordedBlob = encodeWav(
        mergeFloat32Chunks(pcmChunksRef.current),
        sampleRateRef.current,
      );
      pcmChunksRef.current = [];

      if (recordedBlob.size > 44) {
        await transcribeRecordedAudio(recordedBlob);
      }
      return;
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioContext === 'undefined'
    ) {
      setTranscriptionError('Браузер не поддерживает запись с микрофона.');
      return;
    }

    try {
      setTranscriptionError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      pcmChunksRef.current = [];

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      sampleRateRef.current = audioContext.sampleRate;

      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      processorNodeRef.current = processorNode;

      processorNode.onaudioprocess = (event) => {
        const channelData = event.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(channelData));
      };

      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);
      setIsRecording(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось получить доступ к микрофону';
      setTranscriptionError(`Ошибка записи: ${message}`);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      processorNodeRef.current = null;
      sourceNodeRef.current = null;
      audioContextRef.current = null;
      pcmChunksRef.current = [];
      setIsRecording(false);
    }
  }

  return {
    isRecording,
    isTranscribing,
    transcriptionError,
    handleAudioToggle,
    cancelAudioCapture,
  };
}
