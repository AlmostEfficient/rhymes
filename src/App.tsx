import { useState, useEffect, useRef } from 'react';
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
  const [titleAnimated, setTitleAnimated] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => setTitleAnimated(true), 500);
  }, []);

  const generateTwoLines = async () => {
    setPoemState(prev => ({ ...prev, isGenerating: true }));
    
    const topic = `The Day ${poemState.character} ${poemState.dream}`;
    
    // Build context from previous stanzas
    let storyContext = '';
    if (poemState.completedStanzas.length > 0) {
      storyContext = '\n\nPrevious stanzas of the story:\n';
      poemState.completedStanzas.forEach((stanza, index) => {
        storyContext += `Stanza ${index + 1}:\n${stanza[0]}\n${stanza[1]}\n${stanza[2]}\n\n`;
      });
      storyContext += `Continue this story naturally in stanza ${poemState.currentStanza}.`;
    }
    
    const prompt = `You are helping someone practice improv epic poems. Generate exactly 2 lines for ${poemState.currentStanza === 1 ? 'the beginning of' : 'continuing'} an epic poem about ${topic}.${storyContext}

Requirements:
- Lines should rhyme with each other
- Each line must be 6-8 words maximum and follow the da-da-da-da rhythm (exactly 8 beats)
- ${poemState.currentStanza === 1 ? 'Start the story and set the scene' : 'Continue the story naturally from where it left off'}
- End the second line with a word that's easy to rhyme with
- Keep it fun, dramatic, and slightly over-the-top like epic poetry
- Make it family-friendly
${poemState.currentStanza === 4 ? '- This is the final stanza, bring the story to a satisfying conclusion' : ''}

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
      
      setPoemState(prev => ({
        ...prev,
        generatedLines: lines,
        isGenerating: false,
        isWaitingForUser: true
      }));
      
      // Focus input after generation
      setTimeout(() => inputRef.current?.focus(), 100);
      
    } catch (error) {
      console.error('Error generating lines:', error);
      setPoemState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const generateTwoLinesForNewPoem = async () => {
    // This function is called after state has been reset for a new poem
    const prompt = `You are helping someone practice improv epic poems. Generate exactly 2 lines for the beginning of an epic poem about The Day ${poemState.character} ${poemState.dream}.

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
      
      setPoemState(prev => ({
        ...prev,
        generatedLines: lines,
        isGenerating: false,
        isWaitingForUser: true
      }));
      
      // Focus input after generation
      setTimeout(() => inputRef.current?.focus(), 100);
      
    } catch (error) {
      console.error('Error generating lines:', error);
      setPoemState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  const handleStart = () => {
    setPoemState(prev => ({ ...prev, hasStarted: true }));
    generateTwoLines();
  };

  const handleUserLineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || !poemState.isWaitingForUser) return;

    const userLine = userInput.trim();
    const completedStanza = [poemState.generatedLines[0], poemState.generatedLines[1], userLine];
    const currentStanzaNum = poemState.currentStanza;

    setPoemState(prev => ({
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
        setPoemState({
          character: newPrompt.name,
          dream: newPrompt.dream,
          currentStanza: 1,
          generatedLines: [],
          userLine: '',
          isGenerating: false,
          isWaitingForUser: false,
          hasStarted: true,
          completedStanzas: []
        });
        // Auto-start next poem
        setTimeout(() => {
          // Need to call generateTwoLines with fresh state, so use a callback
          setPoemState(prev => ({ ...prev, isGenerating: true }));
          generateTwoLinesForNewPoem();
        }, 1000);
      } else {
        // Next stanza of current poem
        setPoemState(prev => ({
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
    setPoemState({
      character: newPrompt.name,
      dream: newPrompt.dream,
      currentStanza: 1,
      generatedLines: [],
      userLine: '',
      isGenerating: false,
      isWaitingForUser: false,
      hasStarted: false,
      completedStanzas: []
    });
    setUserInput('');
  };

  return (
    <div className="app-container">
      <div className={`main-title ${titleAnimated ? 'animated' : ''}`}>
        Epic Poem Practice
      </div>
      
      <div className="subtitle">
        The Day <span className="character-name">{poemState.character}</span> <span className="dream-text">{poemState.dream}</span>
      </div>
      
      <div className="stanza-progress">
        {poemState.hasStarted && `Stanza ${poemState.currentStanza}/4`}
      </div>
      
      <div className="poem-lines">
        <div className="line-slot line-1">
          {poemState.generatedLines[0] || ''}
        </div>
        <div className="line-slot line-2">
          {poemState.generatedLines[1] || ''}
        </div>
        <div className="line-slot line-3">
          {poemState.userLine || (poemState.isWaitingForUser ? '← Your line goes here' : '')}
        </div>
      </div>
      
      {poemState.isGenerating && (
        <div className="generating">
          Generating epic lines...
        </div>
      )}
      
      {poemState.isWaitingForUser && (
        <form onSubmit={handleUserLineSubmit} className="input-form">
          <input
            ref={inputRef}
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Complete the stanza with your rhyming line..."
            className="line-input"
            autoFocus
          />
        </form>
      )}
      
      {!poemState.hasStarted && (
        <button onClick={handleStart} className="start-button">
          Start Epic Poem
        </button>
      )}
      
      {poemState.hasStarted && !poemState.isWaitingForUser && !poemState.isGenerating && poemState.currentStanza > 4 && (
        <button onClick={handleNewPoem} className="new-poem-button">
          New Poem
        </button>
      )}
      
      <div className="rhythm-guide">
        da-da, da-da, da-da, da-da ♫
      </div>
    </div>
  );
}

export default App
