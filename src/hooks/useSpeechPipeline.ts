import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const TTS_MODEL_ID = 'eleven_flash_v2';
const STT_MODEL_ID = 'scribe_v1';
const DEFAULT_OUTPUT_FORMAT = 'mp3_22050_32';

const DEFAULT_VOICE_IDS: [string, string] = [
  '21m00Tcm4TlvDq8ikWAM', // Rachel
  'EXAVITQu4vr4xnSDxMaL' // Bella
];

const LISTEN_DURATION_MS = 8000;

type UseSpeechPipelineArgs = {
  onTranscription(text: string): void;
  voiceIds?: [string, string];
};

type RecorderHandle = {
  stop(): void;
};

const validateElevenLabsKey = (): string => {
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY;

  if (!apiKey) {
    throw new Error(
      'VITE_ELEVENLABS_API_KEY is missing. Add it to your .env (Vite env vars must be prefixed with VITE_).' 
    );
  }

  return apiKey;
};

const readStreamToBlob = async (response: Response, contentType: string): Promise<Blob> => {
  if (!response.body) {
    throw new Error('TTS response did not include a readable body.');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }

  return new Blob(chunks, { type: contentType });
};

const playAudioBlob = async (blob: Blob, sessionId: number, activeSessionRef: React.MutableRefObject<number>, activeAudioRef: React.MutableRefObject<HTMLAudioElement | null>) => {
  if (sessionId !== activeSessionRef.current) return;

  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  audio.preload = 'auto';

  activeAudioRef.current = audio;

  try {
    await audio.play();
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    activeAudioRef.current = null;
    throw err;
  }

  await new Promise<void>((resolve, reject) => {
    const handleEnded = () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      resolve();
    };

    const handleError = () => {
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      reject(new Error('Audio playback failed.'));
    };

    audio.addEventListener('ended', handleEnded, { once: true });
    audio.addEventListener('error', handleError, { once: true });
  });

  if (activeAudioRef.current === audio) {
    activeAudioRef.current = null;
  }

  URL.revokeObjectURL(objectUrl);
};

const fetchSpeech = async (text: string, voiceId: string, apiKey: string) => {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL_ID,
      output_format: DEFAULT_OUTPUT_FORMAT,
      voice_settings: {
        stability: 0.05,
        similarity_boost: 0.9,
        style: 0.15,
        use_speaker_boost: false,
        speed: 1.05
      },
      optimize_streaming_latency: 1
    })
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Unknown error');
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${message}`);
  }

  return readStreamToBlob(response, 'audio/mpeg');
};

const transcribeBlob = async (blob: Blob, apiKey: string): Promise<string> => {
  const formData = new FormData();
  formData.append('model_id', STT_MODEL_ID);
  formData.append('language_code', 'eng');
  formData.append('diarize', 'false');
  formData.append('tag_audio_events', 'false');
  formData.append('file', blob, 'recording.webm');

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey
    },
    body: formData
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'Unknown error');
    throw new Error(`ElevenLabs STT failed (${response.status}): ${message}`);
  }

  const data = await response.json();

  if (typeof data?.text === 'string') {
    return data.text.trim();
  }

  if (Array.isArray(data?.results)) {
    const combined = data.results
      .map((entry: { text?: string }) => entry?.text ?? '')
      .filter(Boolean)
      .join(' ')
      .trim();
    if (combined) return combined;
  }

  throw new Error('Unexpected transcription payload.');
};

export const useSpeechPipeline = ({ onTranscription, voiceIds }: UseSpeechPipelineArgs) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiKey = useMemo(() => {
    try {
      return validateElevenLabsKey();
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  const sessionRef = useRef(0);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);
  const mountedRef = useRef(true);

  const voices = useMemo(() => voiceIds ?? DEFAULT_VOICE_IDS, [voiceIds]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.src = '';
        activeAudioRef.current = null;
      }
      if (recorderRef.current) {
        recorderRef.current.stop();
        recorderRef.current = null;
      }
    };
  }, []);

  const stopActiveRecorder = useCallback(() => {
    if (!recorderRef.current) return;
    recorderRef.current.stop();
    recorderRef.current = null;
  }, []);

  const stopActiveAudio = useCallback(() => {
    if (!activeAudioRef.current) return;
    activeAudioRef.current.pause();
    activeAudioRef.current.removeAttribute('src');
    activeAudioRef.current.load();
    activeAudioRef.current = null;
  }, []);

  const cancelPipeline = useCallback(() => {
    sessionRef.current += 1;
    stopActiveAudio();
    stopActiveRecorder();
    setIsSpeaking(false);
    setIsListening(false);
  }, [stopActiveAudio, stopActiveRecorder]);

  const startListening = useCallback(async (sessionId: number) => {
    if (!apiKey || sessionId !== sessionRef.current || !mountedRef.current) return;

    setIsListening(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : undefined;

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];

      const cleanup = () => {
        recorder.stream.getTracks().forEach(track => track.stop());
        recorderRef.current = null;
      };

      recorderRef.current = {
        stop: () => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
          cleanup();
        }
      };

      const recordingPromise = new Promise<Blob>((resolve, reject) => {
        const handleDataAvailable = (event: BlobEvent) => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        const handleStop = () => {
          recorder.removeEventListener('dataavailable', handleDataAvailable);
          recorder.removeEventListener('error', handleError);
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          resolve(blob);
        };

        const handleError = (event: MediaRecorderErrorEvent) => {
          recorder.removeEventListener('dataavailable', handleDataAvailable);
          recorder.removeEventListener('stop', handleStop);
          reject(event.error || new Error('MediaRecorder error'));
        };

        recorder.addEventListener('dataavailable', handleDataAvailable);
        recorder.addEventListener('stop', handleStop, { once: true });
        recorder.addEventListener('error', handleError, { once: true });

        recorder.start(300);

        window.setTimeout(() => {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
        }, LISTEN_DURATION_MS);
      });

      const blob = await recordingPromise;
      cleanup();

      if (sessionId !== sessionRef.current || !mountedRef.current) return;

      const transcription = await transcribeBlob(blob, apiKey);

      if (sessionId !== sessionRef.current || !mountedRef.current) return;

      if (transcription) {
        onTranscription(transcription);
      }
    } catch (err) {
      if (sessionId === sessionRef.current && mountedRef.current) {
        setError((err as Error).message ?? 'Failed to transcribe audio.');
      }
    } finally {
      if (sessionId === sessionRef.current && mountedRef.current) {
        setIsListening(false);
      }
    }
  }, [apiKey, onTranscription]);

  const runPipeline = useCallback(
    async (lines: string[]) => {
      if (!apiKey) return;
      if (!lines.length) return;

      cancelPipeline();

      const sessionId = ++sessionRef.current;
      setError(null);

      try {
        setIsSpeaking(true);

        for (let index = 0; index < Math.min(2, lines.length); index++) {
          const line = lines[index];
          if (!line) continue;

          const voiceId = voices[index % voices.length];
          const audioBlob = await fetchSpeech(line, voiceId, apiKey);
          await playAudioBlob(audioBlob, sessionId, sessionRef, activeAudioRef);

          if (sessionId !== sessionRef.current || !mountedRef.current) {
            return;
          }
        }
      } catch (err) {
        if (sessionId === sessionRef.current && mountedRef.current) {
          setError((err as Error).message ?? 'Failed to play narration.');
        }
        return;
      } finally {
        if (sessionId === sessionRef.current && mountedRef.current) {
          setIsSpeaking(false);
        }
      }

      await startListening(sessionId);
    },
    [apiKey, cancelPipeline, startListening, voices]
  );

  return {
    runPipeline,
    cancelPipeline,
    isSpeaking,
    isListening,
    error
  };
};

export type SpeechPipelineState = ReturnType<typeof useSpeechPipeline>;

