import { useState, useRef } from 'react';
import { streamChatWithMetrics } from './lib/openai';
import './App.css'

interface PoemState {
  character: string;
  dream: string;
  currentStanza: number;
  generatedLines: string[];
  userLine: string;
  isGenerating: boolean;
  isWaitingForUser: boolean;
  hasStarted: boolean;
  completedStanzas: string[][];  // Array of [line1, line2, userLine] arrays
}

const CHARACTERS_AND_DREAMS = [
  { name: 'Diana', dream: 'became a firefighter' },
  { name: 'Bob', dream: 'became a fighter pilot' },
  { name: 'Sarah', dream: 'climbed Mount Everest' },
  { name: 'Marcus', dream: 'opened a restaurant' },
  { name: 'Luna', dream: 'traveled to space' },
  { name: 'Jake', dream: 'discovered a new species' },
  { name: 'Maya', dream: 'started her own bakery' },
  { name: 'Oliver', dream: 'danced on Broadway' },
  { name: 'Zoe', dream: 'saved endangered animals' },
  { name: 'Alex', dream: 'learned to fly' }
];

const STICK_FIGURES = [
  `  O
 /|\\
 / \\`,
  `  O
 /|\\
 / \\`,
  `  O
 /|\\
 / \\`
];

const SUPPORT_VOICE_NAMES = [
  'Raza',
  'Artemis',
  'Diana',
  'Marin',
  'Anna',
  'MJ',
  'Lisa',
  'Sam',
  'Adrienne',
  'Ivan',
  'Lauren',
  'Gui',
  'Brody'
];

const pickSupportVoices = (): [string, string] => {
  const shuffled = [...SUPPORT_VOICE_NAMES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return [shuffled[0], shuffled[1]];
};

function App() {
  const [poemState, setPoemState] = useState<PoemState>(() => {
    const randomPrompt = CHARACTERS_AND_DREAMS[Math.floor(Math.random() * CHARACTERS_AND_DREAMS.length)];
    return {
      character: randomPrompt.name,
      dream: randomPrompt.dream,
      currentStanza: 1,
      generatedLines: [],
      userLine: '',
      isGenerating: false,
      isWaitingForUser: false,
      hasStarted: false,
      completedStanzas: []
    };
  });
  
  const [userInput, setUserInput] = useState('');
  const [supportVoices, setSupportVoices] = useState<[string, string]>(pickSupportVoices);
  const inputRef = useRef<HTMLInputElement>(null);
  const poemStateRef = useRef(poemState);

  const updatePoemState = (updater: (prev: PoemState) => PoemState) => {
    setPoemState(prev => {
      const next = updater(prev);
      poemStateRef.current = next;
      return next;
    });
  };

  const generateTwoLines = async () => {
    updatePoemState(prev => ({ ...prev, isGenerating: true }));
    
    const { character, dream, completedStanzas, currentStanza } = poemStateRef.current;
    const topic = `The Day ${character} ${dream}`;
    
    // Build context from previous stanzas
    let storyContext = '';
    if (completedStanzas.length > 0) {
      storyContext = '\n\nPrevious stanzas of the story:\n';
      completedStanzas.forEach((stanza, index) => {
        storyContext += `Stanza ${index + 1}:\n${stanza[0]}\n${stanza[1]}\n${stanza[2]}\n\n`;
      });
      storyContext += `Continue this story naturally in stanza ${currentStanza}.`;
    }
    
    const prompt = `You are helping someone practice improv epic poems. Generate exactly 2 lines for ${currentStanza === 1 ? 'the beginning of' : 'continuing'} an epic poem about ${topic}.${storyContext}

Requirements:
- Lines should rhyme with each other
- Each line must be 5-7 words maximum and follow the da-da-da-da rhythm (exactly 8 beats)
- ${currentStanza === 1 ? 'Start the story and set the scene' : 'Continue the story naturally from where it left off'}
- End the second line with a word that's easy to rhyme with
- Keep it fun, dramatic, and slightly over-the-top like epic poetry
- Make it family-friendly
${currentStanza === 4 ? '- This is the final stanza, bring the story to a satisfying conclusion' : ''}

Examples of correct 8-beat rhythm (da-da-da-da):
"Diana woke up early and bright" (da-da-da-da-da-da-da-da)
"She grabbed her gear to join the fight"
"The siren called through morning light"
"Bob climbed into his jet so fast"
"He knew this day would be his last"

Your lines must follow this exact rhythm and length. Return only the 2 lines, nothing else.`;

    try {
      let response = '';
      for await (const { chunk } of streamChatWithMetrics(prompt)) {
        response += chunk;
      }
      
      const lines = response.trim().split('\n').filter(line => line.trim()).slice(0, 2);
      
      updatePoemState(prev => ({
        ...prev,
        generatedLines: lines,
        isGenerating: false,
        isWaitingForUser: true
      }));
      
      // Focus input after generation
      setTimeout(() => inputRef.current?.focus(), 100);
      
    } catch (error) {
      console.error('Error generating lines:', error);
      updatePoemState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const generateTwoLinesForNewPoem = async () => {
    // This function is called after state has been reset for a new poem
    const { character, dream } = poemStateRef.current;
    const prompt = `You are helping someone practice improv epic poems. Generate exactly 2 lines for the beginning of an epic poem about The Day ${character} ${dream}.

Requirements:
- Lines should rhyme with each other
- Each line must be 6-8 words maximum and follow the da-da-da-da rhythm (exactly 8 beats)
- Start the story and set the scene
- End the second line with a word that's easy to rhyme with
- Keep it fun, dramatic, and slightly over-the-top like epic poetry
- Make it family-friendly

Examples of correct 8-beat rhythm (da-da-da-da):
"Diana woke up early and bright" (da-da-da-da-da-da-da-da)
"She grabbed her gear to join the fight"
"The siren called through morning light"
"Bob climbed into his jet so fast"
"He knew this day would be his last"

Your lines must follow this exact rhythm and length. Return only the 2 lines, nothing else.`;

    try {
      let response = '';
      for await (const { chunk } of streamChatWithMetrics(prompt)) {
        response += chunk;
      }
      
      const lines = response.trim().split('\n').filter(line => line.trim()).slice(0, 2);
      
      updatePoemState(prev => ({
        ...prev,
        generatedLines: lines,
        isGenerating: false,
        isWaitingForUser: true
      }));
      
      // Focus input after generation
      setTimeout(() => inputRef.current?.focus(), 100);
      
    } catch (error) {
      console.error('Error generating lines:', error);
      updatePoemState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const handleStart = () => {
    setSupportVoices(pickSupportVoices());
    updatePoemState(prev => ({ ...prev, hasStarted: true }));
    generateTwoLines();
  };

  const handleUserLineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const current = poemStateRef.current;
    if (!userInput.trim() || !current.isWaitingForUser) return;

    const userLine = userInput.trim();
    const completedStanza = [current.generatedLines[0], current.generatedLines[1], userLine];
    const currentStanzaNum = current.currentStanza;

    updatePoemState(prev => ({
      ...prev,
      userLine: userLine,
      isWaitingForUser: false,
      completedStanzas: [...prev.completedStanzas, completedStanza]
    }));
    
    setUserInput('');
    
    // Clear lines after showing complete stanza for a moment, then generate next
    setTimeout(() => {
      const nextStanza = currentStanzaNum + 1;
      
      if (nextStanza > 4) {
        // Start new poem
        const newPrompt = CHARACTERS_AND_DREAMS[Math.floor(Math.random() * CHARACTERS_AND_DREAMS.length)];
        const nextState: PoemState = {
          character: newPrompt.name,
          dream: newPrompt.dream,
          currentStanza: 1,
          generatedLines: [],
          userLine: '',
          isGenerating: false,
          isWaitingForUser: false,
          hasStarted: true,
          completedStanzas: []
        };
        setPoemState(nextState);
        poemStateRef.current = nextState;
        setSupportVoices(pickSupportVoices());
        // Auto-start next poem
        setTimeout(() => {
          // Need to call generateTwoLines with fresh state, so use a callback
          updatePoemState(prev => ({ ...prev, isGenerating: true }));
          generateTwoLinesForNewPoem();
        }, 1000);
      } else {
        // Next stanza of current poem
        updatePoemState(prev => ({
          ...prev,
          currentStanza: nextStanza,
          generatedLines: [],
          userLine: ''
        }));
        // Small delay then generate next stanza
        setTimeout(() => {
          generateTwoLines();
        }, 100);
      }
    }, 2000);
  };

  const handleNewPoem = () => {
    const newPrompt = CHARACTERS_AND_DREAMS[Math.floor(Math.random() * CHARACTERS_AND_DREAMS.length)];
    const nextState: PoemState = {
      character: newPrompt.name,
      dream: newPrompt.dream,
      currentStanza: 1,
      generatedLines: [],
      userLine: '',
      isGenerating: false,
      isWaitingForUser: false,
      hasStarted: false,
      completedStanzas: []
    };
    setPoemState(nextState);
    poemStateRef.current = nextState;
    setSupportVoices(pickSupportVoices());
    setUserInput('');
  };

  const linesPerFigure = [
    poemState.generatedLines[0] ?? '',
    poemState.generatedLines[1] ?? '',
    poemState.userLine ?? ''
  ];

  const placeholders = [
    poemState.hasStarted ? 'waiting on the next beat' : 'tap start to begin',
    poemState.hasStarted ? 'warming up the echo' : 'setting the scene',
    ''
  ];

  return (
    <div className="app-shell">
      <header className="header">
        <h1>Epic Poem Practice</h1>
        <p>
          The Day <span className="header-emphasis">{poemState.character}</span> <span className="header-emphasis">{poemState.dream}</span>
        </p>
      </header>

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
                    <form onSubmit={handleUserLineSubmit} className="inline-input-form">
                      <input
                        ref={inputRef}
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
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

      {poemState.hasStarted && (
        <div className="stanza-progress" aria-live="polite">
          <span className="progress-label"></span>
          <div className="progress-lines">
            {Array.from({ length: 4 }).map((_, idx) => {
              const status = poemState.currentStanza - 1 > idx
                ? 'completed'
                : poemState.currentStanza - 1 === idx
                  ? 'current'
                  : 'upcoming';
              return (
                <span
                  key={`stanza-indicator-${idx}`}
                  className={`progress-line ${status}`}
                  aria-hidden="true"
                />
              );
            })}
          </div>
        </div>
      )}

      <footer className="rhythm-guide">♫ da-da, da-da, da-da, da-da ♫</footer>
    </div>
  );
}

export default App
