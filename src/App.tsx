import { useRef, useState, type RefObject } from 'react';
import './App.css';
import { PoemStage } from './components/PoemStage';
import { StanzaProgress } from './components/StanzaProgress';
import { ArchiveSection } from './components/ArchiveSection';
import { SettingsPanel } from './components/SettingsPanel';
import { usePoemEngine } from './hooks/usePoemEngine';
import { GearSixIcon, ArrowClockwiseIcon } from '@phosphor-icons/react';

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

  const settingsPanelId = 'poem-settings';

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
              rerollPrompt(true);
              return;
            }

            const confirmSwap = window.confirm(
              'Switching dreams mid-way will toss the current story. Do it anyway?'
            );

            if (confirmSwap) {
              rerollPrompt(true);
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
        supportVoices={supportVoices}
        userInput={userInput}
        onUserInputChange={setUserInput}
        onSubmitUserLine={handleUserLineSubmit}
        inputRef={inputRef as RefObject<HTMLInputElement>}
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
