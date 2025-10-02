import { memo, useMemo } from 'react';
import { STICK_FIGURES } from '../constants/prompts';
import { PoemState } from '../hooks/usePoemEngine';

interface PoemStageProps {
  poemState: PoemState;
  supportVoices: [string, string];
  userInput: string;
  onUserInputChange(value: string): void;
  onSubmitUserLine(e: React.FormEvent): void;
  inputRef: React.RefObject<HTMLInputElement>;
}

export const PoemStage = memo(
  ({
    poemState,
    supportVoices,
    userInput,
    onUserInputChange,
    onSubmitUserLine,
    inputRef
  }: PoemStageProps) => {
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
          const label = isUser ? 'You' : supportVoices[index] || `Voice ${index + 1}`;
          const bubbleClasses = ['line-bubble'];
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

