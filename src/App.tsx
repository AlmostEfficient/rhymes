import { useRef, useState } from 'react';
import './App.css';
import { PoemStage } from './components/PoemStage';
import { StanzaProgress } from './components/StanzaProgress';
import { ArchiveSection } from './components/ArchiveSection';
import { usePoemEngine } from './hooks/usePoemEngine';

function App() {
  const {
    poemState,
    supportVoices,
    archivedPoems,
    activeArchiveId,
    handleStart,
    handleNewPoem,
    handleArchiveToggle,
    submitUserLine
  } = usePoemEngine();

  const [userInput, setUserInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUserLineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitUserLine(userInput)) return;
    setUserInput('');

    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  return (
    <div className="app-shell">
      <header className="header">
        <h1>Epic Poem Practice</h1>
        <p>
          The Day <span className="header-emphasis">{poemState.character}</span>{' '}
          <span className="header-emphasis">{poemState.dream}</span>
        </p>
      </header>

      <PoemStage
        poemState={poemState}
        supportVoices={supportVoices}
        userInput={userInput}
        onUserInputChange={setUserInput}
        onSubmitUserLine={handleUserLineSubmit}
        inputRef={inputRef}
      />

      {poemState.isGenerating && (
        <div className="status-text" role="status" aria-live="polite">
          thinking up the next couplet...
        </div>
      )}

      {!poemState.hasStarted && !poemState.isGenerating && (
        <button onClick={handleStart} className="primary-button">
          start the tale
        </button>
      )}

      {poemState.hasStarted &&
        !poemState.isWaitingForUser &&
        !poemState.isGenerating &&
        poemState.currentStanza > 4 && (
          <button onClick={handleNewPoem} className="primary-button">
            new prompt
          </button>
        )}

      {poemState.hasStarted && <StanzaProgress currentStanza={poemState.currentStanza} />}

      <ArchiveSection
        poems={archivedPoems}
        activeId={activeArchiveId}
        onToggle={handleArchiveToggle}
      />

      <footer className="rhythm-guide">♫ da-da, da-da, da-da, da-da ♫</footer>
    </div>
  );
}

export default App
