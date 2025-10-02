import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChatWithMetrics } from '../lib/openai';
import { CHARACTERS_AND_DREAMS, SUPPORT_VOICE_NAMES } from '../constants/prompts';

export interface PoemState {
  character: string;
  dream: string;
  currentStanza: number;
  generatedLines: string[];
  userLine: string;
  isGenerating: boolean;
  isWaitingForUser: boolean;
  hasStarted: boolean;
  completedStanzas: string[][];
}

export interface ArchivedPoem {
  id: string;
  title: string;
  stanzas: string[][];
  timestamp: number;
}

export type RhymeDifficulty = 'easy' | 'medium' | 'hard';
export type NarrativeMode = 'simple' | 'crazy';

export interface PoemSettings {
  rhymeDifficulty: RhymeDifficulty;
  familyFriendly: boolean;
  narrativeMode: NarrativeMode;
}

const pickSupportVoices = (): [string, string] => {
  const shuffled = [...SUPPORT_VOICE_NAMES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return [shuffled[0], shuffled[1]];
};

const promptKey = (prompt: (typeof CHARACTERS_AND_DREAMS)[number]) => `${prompt.name}::${prompt.dream}`;

const getRandomPrompt = (excludeKey?: string) => {
  const pool = excludeKey
    ? CHARACTERS_AND_DREAMS.filter(prompt => promptKey(prompt) !== excludeKey)
    : CHARACTERS_AND_DREAMS;

  const source = pool.length ? pool : CHARACTERS_AND_DREAMS;
  return source[Math.floor(Math.random() * source.length)];
};

const createPoemState = (
  prompt = getRandomPrompt(),
  overrides: Partial<PoemState> = {}
): PoemState => ({
  character: prompt.name,
  dream: prompt.dream,
  currentStanza: 1,
  generatedLines: [],
  userLine: '',
  isGenerating: false,
  isWaitingForUser: false,
  hasStarted: false,
  completedStanzas: [],
  ...overrides
});

export const usePoemEngine = () => {
  const [poemState, setPoemState] = useState<PoemState>(() => {
    if (typeof window === 'undefined') return createPoemState();
    try {
      const saved = window.localStorage.getItem('poem_state');
      if (!saved) return createPoemState();
      return JSON.parse(saved);
    } catch (err) {
      console.error('Failed to parse saved poem state:', err);
      return createPoemState();
    }
  });
  const poemStateRef = useRef(poemState);
  const [supportVoices, setSupportVoices] = useState<[string, string]>(pickSupportVoices);
  const [settings, setSettings] = useState<PoemSettings>({
    rhymeDifficulty: 'easy',
    familyFriendly: true,
    narrativeMode: 'simple'
  });
  const settingsRef = useRef(settings);
  const generationSessionRef = useRef(0);
  const registeredTimeoutsRef = useRef<number[]>([]);
  const [archivedPoems, setArchivedPoems] = useState<ArchivedPoem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const existing = window.localStorage.getItem('poem_archive');
      if (!existing) return [];
      const parsed: ArchivedPoem[] = JSON.parse(existing);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('Failed to parse archived poems:', err);
      return [];
    }
  });
  const [activeArchiveId, setActiveArchiveId] = useState<string | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('poem_state', JSON.stringify(poemState));
      } catch (err) {
        console.error('Failed to save poem state:', err);
      }
    }
  }, [poemState]);

  const clearRegisteredTimeouts = useCallback(() => {
    if (typeof window === 'undefined') return;
    registeredTimeoutsRef.current.forEach(id => window.clearTimeout(id));
    registeredTimeoutsRef.current = [];
  }, []);

  const registerTimeout = useCallback((callback: () => void, delay: number) => {
    if (typeof window === 'undefined') return;
    const id = window.setTimeout(() => {
      registeredTimeoutsRef.current = registeredTimeoutsRef.current.filter(handle => handle !== id);
      callback();
    }, delay);
    registeredTimeoutsRef.current.push(id);
  }, []);

  useEffect(() => clearRegisteredTimeouts, [clearRegisteredTimeouts]);

  const updatePoemState = useCallback((updater: (prev: PoemState) => PoemState) => {
    setPoemState(prev => {
      const next = updater(prev);
      poemStateRef.current = next;
      return next;
    });
  }, []);

  const updateSettings = useCallback((partial: Partial<PoemSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      settingsRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('poem_archive', JSON.stringify(archivedPoems));
      } catch (err) {
        console.error('Failed to persist poems:', err);
      }
    }
  }, [archivedPoems]);

  const handleArchiveToggle = useCallback((id: string) => {
    setActiveArchiveId(prev => (prev === id ? null : id));
  }, []);

  const streamTwoLines = useCallback(
    async (prompt: string) => {
      const sessionId = ++generationSessionRef.current;

      updatePoemState(prev => ({
        ...prev,
        generatedLines: [],
        isGenerating: true,
        isWaitingForUser: false
      }));

      let buffer = '';

      try {
        for await (const { chunk } of streamChatWithMetrics(prompt)) {
          if (sessionId !== generationSessionRef.current) {
            return;
          }
          
          if (!chunk) continue;
          buffer += chunk;

          const partialLines = buffer
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .slice(0, 2);

          updatePoemState(prev => ({
            ...prev,
            generatedLines: partialLines
          }));
        }

        const finalLines = buffer
          .trim()
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(Boolean)
          .slice(0, 2);

        if (sessionId === generationSessionRef.current) {
          updatePoemState(prev => ({
            ...prev,
            generatedLines: finalLines,
            isGenerating: false,
            isWaitingForUser: true
          }));
        }
      } catch (error) {
        console.error('Error generating lines:', error);
        if (sessionId === generationSessionRef.current) {
          updatePoemState(prev => ({ ...prev, isGenerating: false }));
        }
      }
    },
    [updatePoemState]
  );

  const buildContextPrompt = useCallback((stanzaCount: number) => {
    const { character, dream, completedStanzas, currentStanza } = poemStateRef.current;
    const topic = `The Day ${character} ${dream}`;
    const previousStanzas = completedStanzas.length
      ? `\n\nPrevious stanzas of the story:\n${completedStanzas
          .map((stanza, index) => `Stanza ${index + 1}:\n${stanza.join('\n')}`)
          .join('\n\n')}\n\nContinue this story naturally in stanza ${currentStanza}.`
      : '';

    const isFirstStanza = stanzaCount === 0;
    const isFinalStanza = poemStateRef.current.currentStanza === 4;

    const stanzaRole = isFirstStanza ? 'the beginning of' : 'continuing';
    const stanzaInstruction = isFirstStanza
      ? '- Set the scene, introduce the dream and its obstacle, and be crystal clear the dream is still ahead'
      : isFinalStanza
        ? '- Drive the story into its climax and payoff for the dream'
        : '- Continue the story naturally from where it left off, showing progress or setbacks while the dream stays unresolved';
    const dreamProgressInstruction = isFinalStanza
      ? '- Resolve the dream in this stanza and deliver a satisfying conclusion'
      : '- Keep the dream unresolved so the next player has meaningful room to respond';

    const { rhymeDifficulty, familyFriendly, narrativeMode } = settingsRef.current;

    const rhymeDifficultyInstruction =
      rhymeDifficulty === 'easy'
        ? '- Use playful, obvious rhymes with straightforward vocabulary'
        : rhymeDifficulty === 'hard'
          ? '- Push for inventive, unexpected rhymes and richer vocabulary'
          : '- Keep the rhymes natural with balanced wordplay';

    const familyFriendlyInstruction = familyFriendly ? '- Keep it family-friendly' : '';

    const narrativeInstruction =
      narrativeMode === 'crazy'
        ? '- Lean into surreal twists, bold imagery, and surprising turns'
        : '- Keep the narrative grounded and coherent';

    return `You are helping someone practice improv epic poems. Generate exactly 2 lines for ${stanzaRole} an epic poem about ${topic}.${previousStanzas}

Requirements:
- Lines should rhyme with each other
- Each line must be 5-7 words maximum and follow the da-da-da-da rhythm (exactly 8 beats)
- ${stanzaInstruction}
- End the second line with a word that's easy to rhyme with
- Keep it fun, dramatic, and slightly over-the-top like epic poetry
${rhymeDifficultyInstruction}
${narrativeInstruction}
${familyFriendlyInstruction}
${dreamProgressInstruction}

Examples of correct 8-beat rhythm (da-da-da-da):
"Diana woke up early and bright" (da-da-da-da-da-da-da-da)
"She grabbed her gear to join the fight"
"The siren called through morning light"
"Bob climbed into his jet so fast"
"He knew this day would be his last"

Your lines must follow this exact rhythm and length. Return only the 2 lines, nothing else.`;
  }, []);

  const generateTwoLines = useCallback(async () => {
    await streamTwoLines(buildContextPrompt(poemStateRef.current.completedStanzas.length));
  }, [buildContextPrompt, streamTwoLines]);

  const generateTwoLinesForNewPoem = useCallback(async () => {
    await streamTwoLines(buildContextPrompt(0));
  }, [buildContextPrompt, streamTwoLines]);

  const rerollPrompt = useCallback((forceImmediate?: boolean) => {
    const current = poemStateRef.current;
    const nextPrompt = getRandomPrompt(promptKey({ name: current.character, dream: current.dream }));
    const nextState = createPoemState(nextPrompt, { hasStarted: current.hasStarted });

    generationSessionRef.current++;
    clearRegisteredTimeouts();

    setPoemState(nextState);
    poemStateRef.current = nextState;
    setSupportVoices(pickSupportVoices());
    setActiveArchiveId(null);

    if (current.hasStarted) {
      void generateTwoLinesForNewPoem();
    }
  }, [clearRegisteredTimeouts, generateTwoLinesForNewPoem]);

  const handleStart = useCallback(() => {
    setSupportVoices(pickSupportVoices());
    updatePoemState(prev => ({ ...prev, hasStarted: true }));
    void generateTwoLines();
  }, [generateTwoLines, updatePoemState]);

  const handleNewPoem = useCallback(() => {
    const nextState = createPoemState();
    setPoemState(nextState);
    poemStateRef.current = nextState;
    setSupportVoices(pickSupportVoices());
    setActiveArchiveId(null);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('poem_state');
    }
  }, []);

  const submitUserLine = useCallback(
    (rawLine: string) => {
      const current = poemStateRef.current;
      if (!current.isWaitingForUser) return false;

      const userLine = rawLine.trim();
      if (!userLine) return false;

      const completedStanza = [
        current.generatedLines[0],
        current.generatedLines[1],
        userLine
      ];

      const currentStanzaNum = current.currentStanza;

      updatePoemState(prev => ({
        ...prev,
        userLine,
        isWaitingForUser: false,
        completedStanzas: [...prev.completedStanzas, completedStanza]
      }));

      registerTimeout(() => {
        const nextStanza = currentStanzaNum + 1;

        if (nextStanza > 4) {
          const snapshot = poemStateRef.current;
          const completedPoem: ArchivedPoem = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            title: `The Day ${snapshot.character} ${snapshot.dream}`,
            stanzas: [...snapshot.completedStanzas],
            timestamp: Date.now()
          };

          setArchivedPoems(prev => [completedPoem, ...prev]);
          setActiveArchiveId(completedPoem.id);

          const nextState = createPoemState(undefined, { hasStarted: true });
          setPoemState(nextState);
          poemStateRef.current = nextState;
          setSupportVoices(pickSupportVoices());

          registerTimeout(() => {
            void generateTwoLinesForNewPoem();
          }, 1000);
        } else {
          updatePoemState(prev => ({
            ...prev,
            currentStanza: nextStanza,
            generatedLines: [],
            userLine: ''
          }));

          registerTimeout(() => {
            void generateTwoLines();
          }, 100);
        }
      }, 2000);

      return true;
    },
    [generateTwoLines, generateTwoLinesForNewPoem, registerTimeout, updatePoemState]
  );

  return {
    poemState,
    supportVoices,
    archivedPoems,
    activeArchiveId,
    settings: { ...settings },
    handleStart,
    handleNewPoem,
    handleArchiveToggle,
    submitUserLine,
    updateSettings,
    rerollPrompt
  };
};

