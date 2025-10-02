import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const TTS_MODEL_ID = 'eleven_flash_v2';
const STT_MODEL_ID = 'scribe_v1';
const DEFAULT_OUTPUT_FORMAT = 'mp3_22050_32';

const DEFAULT_VOICE_IDS: [string, string] = [
  // 'wyoowlc1iU22XqveSbUE', // Raza
  '21m00Tcm4TlvDq8ikWAM', // Rachel
  'EXAVITQu4vr4xnSDxMaL' // Bella
];

const MAX_LISTEN_DURATION_MS = 12000;

type AudioContextConstructor = typeof AudioContext;

type UseSpeechPipelineArgs = {
  onTranscription(text: string): void;
  voiceIds?: [string, string];
};

type RecorderErrorEvent = Event & { error?: DOMException };

type RecordingContext = {
  recorder: MediaRecorder;
  stream: MediaStream;
  sessionId: number;
  blobPromise: Promise<Blob>;
  timeoutId: number | null;
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

const playAudioBlob = async (
  blob: Blob,
  sessionId: number,
  activeSessionRef: React.MutableRefObject<number>,
  activeAudioRef: React.MutableRefObject<HTMLAudioElement | null>
) => {
  if (sessionId !== activeSessionRef.current) return;

  const objectUrl = URL.createObjectURL(blob);
  const audio = new Audio(objectUrl);
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  audio.setAttribute('playsinline', 'true');

  activeAudioRef.current = audio;

  console.log('[speech] playAudioBlob start', {
    sessionId,
    size: blob.size,
    type: blob.type
  });

  audio.addEventListener('playing', () => {
    console.log('[speech] audio playing', { sessionId });
  });
  audio.addEventListener('ended', () => {
    console.log('[speech] audio ended', { sessionId });
  });

  try {
    await audio.play();
    console.log('[speech] audio play resolved', { sessionId });
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    activeAudioRef.current = null;
    console.error('[speech] audio play failed', { sessionId, error: err });
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
  console.log('[speech] fetchSpeech request', {
    voiceId,
    length: text.length,
    sample: text.slice(0, 80)
  });

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
    console.error('[speech] fetchSpeech failed', {
      voiceId,
      status: response.status,
      message
    });
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${message}`);
  }

  console.log('[speech] fetchSpeech success', {
    voiceId,
    status: response.status
  });

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
  const [activeSpeakerIndex, setActiveSpeakerIndex] = useState<number | null>(null);

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
  const recordingRef = useRef<RecordingContext | null>(null);
  const wantsRecordingRef = useRef(false);
  const mountedRef = useRef(true);
  const unlockedAudioRef = useRef(false);
  const unlockingPromiseRef = useRef<Promise<boolean> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fallbackNoticeRef = useRef(false);

  const voices = useMemo(() => voiceIds ?? DEFAULT_VOICE_IDS, [voiceIds]);

  const speakWithSpeechSynthesis = useCallback(
    async (text: string, index: number, sessionId: number) => {
      if (!text) return true;
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return false;
      }

      const synth = window.speechSynthesis;
      if (!synth) return false;

      const loadVoices = async () => {
        const existing = synth.getVoices();
        if (existing.length) {
          return existing;
        }

        return await new Promise<SpeechSynthesisVoice[]>(resolve => {
          const handle = () => {
            const loaded = synth.getVoices();
            if (loaded.length) {
              synth.removeEventListener('voiceschanged', handle);
              resolve(loaded);
            }
          };

          synth.addEventListener('voiceschanged', handle);

          window.setTimeout(() => {
            synth.removeEventListener('voiceschanged', handle);
            resolve(synth.getVoices());
          }, 1000);
        });
      };

      try {
        const availableVoices = await loadVoices();
        const utterance = new SpeechSynthesisUtterance(text);

        if (availableVoices.length) {
          const selected = availableVoices[index % availableVoices.length] ?? availableVoices[0];
          utterance.voice = selected;
        }

        utterance.rate = 1;
        utterance.pitch = 1;

        return await new Promise<boolean>(resolve => {
          const cleanup = () => {
            utterance.onend = null;
            utterance.onerror = null;
          };

          utterance.onend = () => {
            cleanup();
            if (sessionId !== sessionRef.current || !mountedRef.current) {
              resolve(false);
              return;
            }
            resolve(true);
          };

          utterance.onerror = () => {
            cleanup();
            resolve(false);
          };

          try {
            synth.cancel();
            synth.speak(utterance);
          } catch (err) {
            console.error('[speech] speechSynthesis speak failed', { sessionId, error: err });
            cleanup();
            resolve(false);
          }
        });
      } catch (err) {
        console.error('[speech] speechSynthesis fallback error', { sessionId, error: err });
        return false;
      }
    },
    [mountedRef, sessionRef]
  );

  const finalizeRecording = useCallback(
    async (shouldSubmit: boolean) => {
      wantsRecordingRef.current = false;
      const context = recordingRef.current;

      console.log('[speech] finalizeRecording', {
        shouldSubmit,
        hasContext: Boolean(context)
      });

      if (!context) {
        if (shouldSubmit && mountedRef.current) {
          setIsListening(false);
        }
        return;
      }

      recordingRef.current = null;

      const { recorder, blobPromise, stream, sessionId, timeoutId } = context;

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      if (recorder.state !== 'inactive') {
        console.log('[speech] finalizeRecording stopping recorder', { sessionId });
        recorder.stop();
      }

      let blob: Blob | null = null;

      try {
        blob = await blobPromise;
        console.log('[speech] finalizeRecording got blob', {
          sessionId,
          size: blob.size,
          type: blob.type
        });
      } catch (err) {
        console.error('[speech] finalizeRecording blob error', {
          sessionId,
          error: err
        });
        if (shouldSubmit && sessionId === sessionRef.current && mountedRef.current) {
          setError((err as Error).message ?? 'Failed to capture audio.');
        }
      } finally {
        stream.getTracks().forEach(track => track.stop());
        console.log('[speech] finalizeRecording stopped tracks', { sessionId });
      }

      if (!mountedRef.current) {
        return;
      }

      if (!shouldSubmit || !blob || sessionId !== sessionRef.current) {
        setIsListening(false);
        return;
      }

      if (!apiKey) {
        setIsListening(false);
        return;
      }

      try {
        console.log('[speech] finalizeRecording transcribing', { sessionId });
        const transcription = await transcribeBlob(blob, apiKey);

        if (sessionId === sessionRef.current && mountedRef.current && transcription) {
          console.log('[speech] finalizeRecording transcription success', {
            sessionId,
            text: transcription
          });
          onTranscription(transcription);
        }
      } catch (err) {
        console.error('[speech] finalizeRecording transcription error', {
          sessionId,
          error: err
        });
        if (sessionId === sessionRef.current && mountedRef.current) {
          setError((err as Error).message ?? 'Failed to transcribe audio.');
        }
      } finally {
        if (sessionId === sessionRef.current && mountedRef.current) {
          setIsListening(false);
        }
      }
    },
    [apiKey, onTranscription]
  );

  const stopActiveAudio = useCallback(() => {
    if (!activeAudioRef.current) return;
    activeAudioRef.current.pause();
    activeAudioRef.current.removeAttribute('src');
    activeAudioRef.current.load();
    activeAudioRef.current = null;
  }, []);

  const cancelPipeline = useCallback(() => {
    sessionRef.current += 1;
    console.log('[speech] cancelPipeline');
    stopActiveAudio();
    void finalizeRecording(false);
    setIsSpeaking(false);
    setIsListening(false);
    setActiveSpeakerIndex(null);
    wantsRecordingRef.current = false;
    fallbackNoticeRef.current = false;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [finalizeRecording, stopActiveAudio]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.removeAttribute('src');
        activeAudioRef.current.load();
        activeAudioRef.current = null;
      }
      if (audioContextRef.current) {
        const context = audioContextRef.current;
        audioContextRef.current = null;
        void context.close().catch(() => {});
      }
      void finalizeRecording(false);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [finalizeRecording]);

  const unlockAudioPlayback = useCallback(async () => {
    if (unlockedAudioRef.current) return true;
    if (typeof window === 'undefined') return false;

    if (unlockingPromiseRef.current) {
      return unlockingPromiseRef.current;
    }

    const promise = (async () => {
      try {
        const contextCtor: AudioContextConstructor | undefined =
          window.AudioContext ?? (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
        if (!contextCtor) {
          unlockedAudioRef.current = true;
          return true;
        }

        if (!audioContextRef.current) {
          audioContextRef.current = new contextCtor();
        }

        const context = audioContextRef.current;
        if (!context) {
          unlockedAudioRef.current = true;
          return true;
        }

        if (context.state === 'suspended') {
          await context.resume();
        }

        const buffer = context.createBuffer(1, 1, context.sampleRate);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(0);

        if (context.state === 'suspended') {
          await context.resume();
        }

        source.stop();
        source.disconnect();

        unlockedAudioRef.current = true;
        return true;
      } catch (err) {
        console.warn('[speech] unlockAudioPlayback failed', err);
        return false;
      } finally {
        unlockingPromiseRef.current = null;
      }
    })();

    unlockingPromiseRef.current = promise;
    return promise;
  }, []);

  const startRecording = useCallback(async () => {
    if (!apiKey || !mountedRef.current) return false;
    if (recordingRef.current) return false;
    if (isSpeaking) return false;

    wantsRecordingRef.current = true;
    const sessionId = sessionRef.current;
    let stream: MediaStream | null = null;

    console.log('[speech] startRecording request', {
      sessionId,
      isSpeaking,
      hasContext: Boolean(recordingRef.current)
    });

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[speech] startRecording got stream', { sessionId });

      if (
        sessionId !== sessionRef.current ||
        !mountedRef.current ||
        !wantsRecordingRef.current
      ) {
        stream.getTracks().forEach(track => track.stop());
        wantsRecordingRef.current = false;
        console.log('[speech] startRecording aborted post-stream', { sessionId });
        return false;
      }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : undefined;

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];

      const blobPromise = new Promise<Blob>((resolve, reject) => {
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

        const handleError = (event: RecorderErrorEvent) => {
          recorder.removeEventListener('dataavailable', handleDataAvailable);
          recorder.removeEventListener('stop', handleStop);
          reject(event.error || new Error('MediaRecorder error'));
        };

        recorder.addEventListener('dataavailable', handleDataAvailable);
        recorder.addEventListener('stop', handleStop, { once: true });
        recorder.addEventListener('error', handleError, { once: true });
      });

      const context: RecordingContext = {
        recorder,
        stream,
        sessionId,
        blobPromise,
        timeoutId: null
      };

      recordingRef.current = context;

      const timeoutId = window.setTimeout(() => {
        if (recorder.state !== 'inactive') {
          console.warn('[speech] startRecording timeout firing', { sessionId });
          recorder.stop();
        }
      }, MAX_LISTEN_DURATION_MS);

      context.timeoutId = timeoutId;

      recorder.start(300);
      console.log('[speech] startRecording recorder started', { sessionId });

      if (!wantsRecordingRef.current) {
        void finalizeRecording(true);
        return false;
      }

      if (sessionId === sessionRef.current && mountedRef.current) {
        setIsListening(true);
        console.log('[speech] startRecording listening', { sessionId });
      }

      setError(null);
      return true;
    } catch (err) {
      if (recordingRef.current && recordingRef.current.sessionId === sessionId) {
        recordingRef.current = null;
      }

      const message = (err as Error).message ?? 'Microphone access failed.';

      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      if (mountedRef.current && sessionId === sessionRef.current) {
        console.error('[speech] startRecording error', { sessionId, error: err });
        setError(message);
        setIsListening(false);
      }

      wantsRecordingRef.current = false;
      return false;
    }
  }, [apiKey, finalizeRecording, isSpeaking]);

  const stopRecording = useCallback(async () => {
    wantsRecordingRef.current = false;
    console.log('[speech] stopRecording invoked');
    await finalizeRecording(true);
  }, [finalizeRecording]);

  const runPipeline = useCallback(
    async (lines: string[]) => {
      if (!lines.length) return;

      console.log('[speech] runPipeline invoked', {
        lines,
        session: sessionRef.current
      });

      cancelPipeline();

      const sessionId = ++sessionRef.current;
      setError(null);
      fallbackNoticeRef.current = false;

      console.log('[speech] runPipeline session start', { sessionId });

      try {
        setIsSpeaking(true);

        for (let index = 0; index < Math.min(2, lines.length); index++) {
          const line = lines[index];
          if (!line) continue;

          const voiceId = voices[index % voices.length];
          setActiveSpeakerIndex(index);
          console.log('[speech] runPipeline narrating', {
            sessionId,
            index,
            voiceId,
            length: line.length,
            sample: line.slice(0, 80)
          });
          let playbackSucceeded = false;
          let lastError: unknown = null;

          if (apiKey) {
            try {
              const audioBlob = await fetchSpeech(line, voiceId, apiKey);
              console.log('[speech] runPipeline fetched audio', {
                sessionId,
                index,
                size: audioBlob.size
              });
              await playAudioBlob(audioBlob, sessionId, sessionRef, activeAudioRef);
              playbackSucceeded = true;
            } catch (err) {
              lastError = err;
              console.warn('[speech] runPipeline elevenlabs playback failed, attempting fallback', {
                sessionId,
                index,
                error: err
              });
            }
          }

          if (!playbackSucceeded) {
            const fallbackOk = await speakWithSpeechSynthesis(line, index, sessionId);
            if (fallbackOk) {
              playbackSucceeded = true;
              if (!fallbackNoticeRef.current && sessionId === sessionRef.current && mountedRef.current) {
                setError('Premium voice unavailable; using device speech for now.');
                fallbackNoticeRef.current = true;
              }
            }
          }

          if (!playbackSucceeded) {
            const errorToThrow = lastError instanceof Error
              ? lastError
              : new Error('Unable to play narration with available voices.');
            throw errorToThrow;
          }

          setActiveSpeakerIndex(null);

          if (sessionId !== sessionRef.current || !mountedRef.current) {
            console.log('[speech] runPipeline aborted mid-session', { sessionId });
            return;
          }
        }
      } catch (err) {
        console.error('[speech] runPipeline error', { sessionId, error: err });
        if (sessionId === sessionRef.current && mountedRef.current) {
          setError((err as Error).message ?? 'Failed to play narration.');
        }
        return;
      } finally {
        if (sessionId === sessionRef.current && mountedRef.current) {
          setIsSpeaking(false);
          console.log('[speech] runPipeline session complete', { sessionId });
        }
        setActiveSpeakerIndex(null);
      }

    },
    [apiKey, cancelPipeline, mountedRef, speakWithSpeechSynthesis, voices]
  );

  return {
    runPipeline,
    cancelPipeline,
    startRecording,
    stopRecording,
    unlockAudioPlayback,
    isSpeaking,
    isListening,
    activeSpeakerIndex,
    error
  };
};

export type SpeechPipelineState = ReturnType<typeof useSpeechPipeline>;
