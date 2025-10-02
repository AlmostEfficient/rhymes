import { memo, useCallback, useMemo, useRef } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  MouseEvent as ReactMouseEvent
} from 'react';
import { STICK_FIGURES } from '../constants/prompts';
import { type PoemState } from '../hooks/usePoemEngine';

interface PoemStageProps {
  poemState: PoemState;
  supportVoices: [string, string];
  userInput: string;
  onUserInputChange(value: string): void;
  onSubmitUserLine(e: React.FormEvent): void;
  inputRef: React.RefObject<HTMLInputElement>;
  speakingIndex?: number | null;
  isListening?: boolean;
  onStartRecording?: () => Promise<boolean | void> | boolean | void;
  onStopRecording?: () => Promise<void> | void;
}

export const PoemStage = memo(
  ({
    poemState,
    supportVoices,
    userInput,
    onUserInputChange,
    onSubmitUserLine,
    inputRef,
    speakingIndex = null,
    isListening = false,
    onStartRecording,
    onStopRecording
  }: PoemStageProps) => {
    const holdActiveRef = useRef(false);

    const invokeStartRecording = useCallback(() => {
      if (!onStartRecording || holdActiveRef.current) return;

      holdActiveRef.current = true;

      console.log('[speech] push-to-talk start');

      try {
        const result = onStartRecording();
        if (result instanceof Promise) {
          result
            .then(value => {
              if (value === false) {
                holdActiveRef.current = false;
              }
            })
            .catch(() => {
              holdActiveRef.current = false;
            });
        } else if (result === false) {
          holdActiveRef.current = false;
        }
      } catch (err) {
        console.error('[speech] push-to-talk start failed', err);
        holdActiveRef.current = false;
      }
    }, [onStartRecording]);

    const invokeStopRecording = useCallback(() => {
      if (holdActiveRef.current) {
        holdActiveRef.current = false;
      }
      if (!onStopRecording) return;
      console.log('[speech] push-to-talk stop');
      try {
        const result = onStopRecording();
        if (result instanceof Promise) {
          result.catch(err => {
            console.error('[speech] push-to-talk stop failed', err);
          });
        }
      } catch (err) {
        console.error('[speech] push-to-talk stop failed', err);
      }
    }, [onStopRecording]);

    const makePointerHandler = useCallback(
      (type: 'down' | 'up' | 'leave' | 'cancel') =>
        (event: ReactPointerEvent<HTMLButtonElement>) => {
          if (type === 'down') {
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch (err) {
              // noop if pointer capture unsupported
            }
            invokeStartRecording();
            return;
          }

          if (type === 'up') {
            event.preventDefault();
            try {
              event.currentTarget.releasePointerCapture(event.pointerId);
            } catch (err) {
              // optional release failure can be ignored
            }
            invokeStopRecording();
            return;
          }

          if (type === 'leave' || type === 'cancel') {
            if (type === 'leave' && event.buttons === 0) {
              return;
            }
            invokeStopRecording();
          }
        },
      [invokeStartRecording, invokeStopRecording]
    );

    const handlePointerDown = makePointerHandler('down');
    const handlePointerUp = makePointerHandler('up');
    const handlePointerLeave = makePointerHandler('leave');
    const handlePointerCancel = makePointerHandler('cancel');

    const handleTouchStart = useCallback(
      (event: ReactTouchEvent<HTMLButtonElement>) => {
        if (event.touches.length > 1) return;
        event.preventDefault();
        invokeStartRecording();
      },
      [invokeStartRecording]
    );

    const handleTouchEnd = useCallback(
      (event: ReactTouchEvent<HTMLButtonElement>) => {
        event.preventDefault();
        invokeStopRecording();
      },
      [invokeStopRecording]
    );

    const handleTouchCancel = useCallback(() => {
      invokeStopRecording();
    }, [invokeStopRecording]);

    const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
    }, []);

    const handleKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault();
          invokeStartRecording();
        }
      },
      [invokeStartRecording]
    );

    const handleKeyUp = useCallback(
      (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          invokeStopRecording();
        }
      },
      [invokeStopRecording]
    );

    const linesPerFigure = useMemo(
      () => [
        poemState.generatedLines[0] ?? '',
        poemState.generatedLines[1] ?? '',
        poemState.userLine ?? ''
      ],
      [poemState.generatedLines, poemState.userLine]
    );

    const placeholders = useMemo(
      () => [
        poemState.hasStarted && poemState.completedStanzas.length > 0 ? '' : 'waiting on the next beat',
        poemState.hasStarted && poemState.completedStanzas.length > 0 ? '' : 'warming up the echo',
        ''
      ],
      [poemState.completedStanzas.length, poemState.hasStarted]
    );

    return (
      <main className="poem-stage">
        {STICK_FIGURES.map((figure, index) => {
          const line = linesPerFigure[index];
          const isUser = index === 2;
          const placeholderText = placeholders[index];
          const isActive = Boolean(line);
          const isSpeaking = !isUser && speakingIndex === index;
          const isUserListening = isUser && isListening;
          const labelBase = isUser ? 'You' : supportVoices[index] || `Voice ${index + 1}`;
          const isActiveTurn = isSpeaking || isUserListening;
          const label = isActiveTurn ? `👉 ${labelBase}` : labelBase;
          const bubbleClasses = ['line-bubble'];
          if (isSpeaking) {
            bubbleClasses.push('line-speaking');
          }
          if (isUserListening) {
            bubbleClasses.push('line-listening');
          }
          const showEllipsis =
            !isUser &&
            !isActive &&
            poemState.hasStarted &&
            poemState.completedStanzas.length > 0 &&
            poemState.isGenerating;

          if (isActive) {
            bubbleClasses.push('line-visible');
          } else if (!isUser && !showEllipsis) {
            bubbleClasses.push('line-placeholder');
          }

          const showPushToTalk = isUser && poemState.isWaitingForUser;
          const buttonLabel = isListening ? 'release to send' : 'hold to speak';

          return (
            <section
              className="poem-line"
              key={`figure-${index}-${poemState.currentStanza}-${line || 'blank'}`}
            >
              <div className="figure-wrapper">
                <pre aria-hidden="true">{figure}</pre>
                <span className="figure-label">{label}</span>
              </div>
              <div className={bubbleClasses.join(' ')}>
                {isUser ? (
                  poemState.isWaitingForUser ? (
                    <div className="user-input-stack">
                      {showPushToTalk && (
                        <button
                          type="button"
                          className={`push-to-talk-button${isListening ? ' push-to-talk-button--active' : ''}`}
                          onPointerDown={handlePointerDown}
                          onPointerUp={handlePointerUp}
                          onPointerLeave={handlePointerLeave}
                          onPointerCancel={handlePointerCancel}
                          onTouchStart={handleTouchStart}
                          onTouchEnd={handleTouchEnd}
                          onTouchCancel={handleTouchCancel}
                          onContextMenu={handleContextMenu}
                          onKeyDown={handleKeyDown}
                          onKeyUp={handleKeyUp}
                          aria-pressed={isListening}
                          disabled={!onStartRecording}
                        >
                          {buttonLabel}
                        </button>
                      )}

                      <form onSubmit={onSubmitUserLine} className="inline-input-form">
                        <input
                          ref={inputRef}
                          type="text"
                          value={userInput}
                          onChange={(e) => onUserInputChange(e.target.value)}
                          placeholder="drop an 8-beat rhyme here"
                          className="inline-input"
                          autoFocus
                        />
                      </form>
                    </div>
                  ) : (
                    line || placeholderText
                  )
                ) : showEllipsis ? (
                  <span className="ellipsis" aria-hidden="true">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                ) : (
                  line || placeholderText
                )}
              </div>
            </section>
          );
        })}
      </main>
    );
  }
);

PoemStage.displayName = 'PoemStage';
