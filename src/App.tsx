import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import './App.css';
import { PoemStage } from './components/PoemStage';
import { StanzaProgress } from './components/StanzaProgress';
import { ArchiveSection } from './components/ArchiveSection';
import { SettingsPanel } from './components/SettingsPanel';
import { usePoemEngine } from './hooks/usePoemEngine';
import { GearSixIcon, ArrowClockwiseIcon } from '@phosphor-icons/react';
import { useSpeechPipeline } from './hooks/useSpeechPipeline';

const RAZA_NAME = 'Raza';
const RAZA_VOICE_ID = 'wyoowlc1iU22XqveSbUE';
const SECONDARY_VOICE_FALLBACK_ID = 'EXAVITQu4vr4xnSDxMaL';
const SECONDARY_VOICE_ALT_ID = 'DLsHlh26Ugcm6ELvS0qi';
const SECONDARY_NAME_FALLBACK = 'Gui';

function App() {
  const {
    poemState,
    supportVoices,
    archivedPoems,
    activeArchiveId,
    handleStart,
    handleNewPoem,
    handleArchiveToggle,
    submitUserLine,
    settings,
    updateSettings,
    rerollPrompt
  } = usePoemEngine();

  const [userInput, setUserInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tapCount, setTapCount] = useState(0);
  const tapTimerRef = useRef<number | null>(null);
  const lastNarratedRef = useRef<string>('');
  const wasStartedRef = useRef(poemState.hasStarted);
  const [micError, setMicError] = useState<string | null>(null);

  const settingsPanelId = 'poem-settings';

  const secondarySupportName = useMemo(() => {
    const candidates = supportVoices.filter(name => name !== RAZA_NAME);
    const picked = candidates[0] ?? supportVoices[0] ?? SECONDARY_NAME_FALLBACK;
    return picked === RAZA_NAME ? SECONDARY_NAME_FALLBACK : picked;
  }, [supportVoices]);

  const displayedSupportVoices = useMemo<[string, string]>(
    () => [RAZA_NAME, `${secondarySupportName}?`],
    [secondarySupportName]
  );

  const voiceIds = useMemo<[string, string]>(() => {
    const secondVoiceId = Math.random() < 0.1 ? SECONDARY_VOICE_ALT_ID : SECONDARY_VOICE_FALLBACK_ID;
    return [RAZA_VOICE_ID, secondVoiceId];
  }, [supportVoices]);

  const {
    runPipeline,
    cancelPipeline,
    startRecording,
    stopRecording,
    unlockAudioPlayback,
    isSpeaking,
    isListening,
    activeSpeakerIndex,
    error: speechError
  } = useSpeechPipeline({
    onTranscription: useCallback(
      (text: string) => {
        if (!text) return;
        setUserInput(text);
        inputRef.current?.blur();
        const submitted = submitUserLine(text);
        if (submitted) {
          setUserInput('');
        }
      },
      [submitUserLine]
    ),
    voiceIds
  });

  const handleRhythmTap = () => {
    if (tapTimerRef.current) {
      window.clearTimeout(tapTimerRef.current);
    }

    const nextCount = tapCount + 1;
    setTapCount(nextCount);

    if (nextCount === 8) {
      updateSettings({ showModelPicker: !settings.showModelPicker });
      setTapCount(0);
    } else {
      tapTimerRef.current = window.setTimeout(() => {
        setTapCount(0);
      }, 2000);
    }
  };

  const handleUserLineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitUserLine(userInput)) return;
    setUserInput('');

    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const ensureMicPermission = useCallback(async () => {
    if (typeof navigator === 'undefined') {
      return true;
    }

    const mediaDevices = navigator.mediaDevices;

    if (!mediaDevices?.getUserMedia) {
      console.warn('[speech] getUserMedia unavailable');
      setMicError(null);
      return true;
    }

    try {
      const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
      if (permissions?.query) {
        const status = await permissions.query({ name: 'microphone' as PermissionName });
        if (status.state === 'granted') {
          setMicError(null);
          return true;
        }
        if (status.state === 'denied') {
          setMicError('Microphone access is blocked. Update your browser settings to continue.');
          return false;
        }
      }
    } catch (err) {
      console.warn('[speech] microphone permission query failed', err);
    }

    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicError(null);
      return true;
    } catch (err) {
      console.error('[speech] mic permission request failed', err);
      setMicError('We need microphone access to practice. Check your browser settings and try again.');
      return false;
    }
  }, []);

  const handleStartButton = useCallback(async () => {
    await unlockAudioPlayback();
    lastNarratedRef.current = '';
    const hasMic = await ensureMicPermission();
    if (!hasMic) {
      console.warn('[speech] proceeding without microphone permission');
    }
    handleStart();
  }, [ensureMicPermission, handleStart, unlockAudioPlayback]);

  const handleNewPoemButton = () => {
    lastNarratedRef.current = '';
    handleNewPoem();
  };

  const handleStartRecording = useCallback(() => {
    console.log('[speech] handleStartRecording', {
      isWaitingForUser: poemState.isWaitingForUser,
      isGenerating: poemState.isGenerating,
      isSpeaking,
      isListening
    });
    if (!poemState.isWaitingForUser) return false;
    if (poemState.isGenerating) return false;
    if (isSpeaking) return false;
    if (isListening) return true;
    return startRecording();
  }, [isListening, isSpeaking, poemState.isGenerating, poemState.isWaitingForUser, startRecording]);

  const handleStopRecording = useCallback(() => {
    console.log('[speech] handleStopRecording');
    return stopRecording();
  }, [stopRecording]);

  useEffect(() => {
    if (!settings.outboundAudioEnabled) {
      cancelPipeline();
      lastNarratedRef.current = '';
      return;
    }

    if (poemState.isGenerating) return;

    const firstTwo = poemState.generatedLines.slice(0, 2).filter(Boolean);
    if (!poemState.isWaitingForUser || firstTwo.length < 2) {
      return;
    }

    const signature = `${poemState.currentStanza}:${firstTwo.join('|')}`;
    if (lastNarratedRef.current === signature) {
      return;
    }

    lastNarratedRef.current = signature;
    runPipeline(firstTwo);
  }, [
    cancelPipeline,
    poemState.currentStanza,
    poemState.generatedLines,
    poemState.isGenerating,
    poemState.isWaitingForUser,
    runPipeline,
    settings.outboundAudioEnabled
  ]);

  useEffect(() => {
    return () => {
      cancelPipeline();
    };
  }, [cancelPipeline]);

  useEffect(() => {
    const wasStarted = wasStartedRef.current;
    if (wasStarted && !poemState.hasStarted) {
      cancelPipeline();
      lastNarratedRef.current = '';
    }
    wasStartedRef.current = poemState.hasStarted;
  }, [cancelPipeline, poemState.hasStarted]);

  useEffect(() => {
    if (!poemState.isWaitingForUser && isListening) {
      stopRecording();
    }
  }, [isListening, poemState.isWaitingForUser, stopRecording]);

  return (
    <div className="app-shell">
      <div className="settings-wrapper">
        <button
          type="button"
          className="settings-toggle"
          aria-expanded={isSettingsOpen}
          aria-controls={settingsPanelId}
          aria-label="toggle settings"
          onClick={() => setIsSettingsOpen(prev => !prev)}
        >
          <GearSixIcon color="#2a2522" size={26} />
        </button>

        <SettingsPanel
          isOpen={isSettingsOpen}
          settings={settings}
          panelId={settingsPanelId}
          onClose={() => setIsSettingsOpen(false)}
          onUpdate={updateSettings}
        />
      </div>

      <header className="header">
        <h1>Epic Poem Practice</h1>
        <button
          type="button"
          className="header-prompt-toggle"
          onClick={() => {
            if (!poemState.hasStarted) {
              rerollPrompt();
              return;
            }

            const confirmSwap = window.confirm(
              'Switching dreams mid-way will toss the current story. Do it anyway?'
            );

            if (confirmSwap) {
              rerollPrompt();
            }
          }}
        >
          <span className="header-text">
            The Day <span className="header-emphasis">{poemState.character}</span>{' '}
            <span className="header-emphasis">{poemState.dream}</span>
          </span>
          <ArrowClockwiseIcon size={12} className="header-reroll" weight="bold" />
        </button>
      </header>

      <PoemStage
        poemState={poemState}
        supportVoices={displayedSupportVoices}
        userInput={userInput}
        onUserInputChange={setUserInput}
        onSubmitUserLine={handleUserLineSubmit}
        inputRef={inputRef as RefObject<HTMLInputElement>}
        speakingIndex={activeSpeakerIndex}
        isListening={isListening && poemState.isWaitingForUser}
        onStartRecording={poemState.isWaitingForUser ? handleStartRecording : undefined}
        onStopRecording={poemState.isWaitingForUser ? handleStopRecording : undefined}
      />

      {poemState.isGenerating && (
        <div className="status-text" role="status" aria-live="polite">
          thinking up the next couplet...
        </div>
      )}

      {[micError, speechError]
        .filter((message): message is string => Boolean(message))
        .map((message, index) => (
          <div key={`speech-error-${index}`} className="status-text" role="alert">
            {message}
          </div>
        ))}

      {(isSpeaking || isListening) && !poemState.isGenerating && (
        <div className="status-text" role="status" aria-live="polite">
          {isSpeaking ? 'voicing the prophecy...' : 'listening for your rhyme...'}
        </div>
      )}

      {!poemState.hasStarted && !poemState.isGenerating && (
        <button onClick={handleStartButton} className="primary-button" type="button">
          start the tale
        </button>
      )}

      {poemState.hasStarted &&
        !poemState.isWaitingForUser &&
        !poemState.isGenerating &&
        poemState.currentStanza > 4 && (
          <button onClick={handleNewPoemButton} className="primary-button">
            new prompt
          </button>
        )}

      {poemState.hasStarted && <StanzaProgress currentStanza={poemState.currentStanza} />}

      <ArchiveSection
        poems={archivedPoems}
        activeId={activeArchiveId}
        onToggle={handleArchiveToggle}
      />

      <footer 
        className="rhythm-guide" 
        onClick={handleRhythmTap}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        ♫ da-da, da-da, da-da, da-da ♫
      </footer>
    </div>
  );
}

export default App
