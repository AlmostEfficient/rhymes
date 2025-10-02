import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const pickSupportVoices = (): [string, string] => {
  const shuffled = [...SUPPORT_VOICE_NAMES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return [shuffled[0], shuffled[1]];
};

const getRandomPrompt = () => CHARACTERS_AND_DREAMS[Math.floor(Math.random() * CHARACTERS_AND_DREAMS.length)];

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
  const [poemState, setPoemState] = useState<PoemState>(() => createPoemState());
  const poemStateRef = useRef(poemState);
  const [supportVoices, setSupportVoices] = useState<[string, string]>(pickSupportVoices);
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

  const updatePoemState = useCallback((updater: (prev: PoemState) => PoemState) => {
    setPoemState(prev => {
      const next = updater(prev);
      poemStateRef.current = next;
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
      updatePoemState(prev => ({
        ...prev,
        generatedLines: [],
        isGenerating: true,
        isWaitingForUser: false
      }));

      let buffer = '';

      try {
        for await (const { chunk } of streamChatWithMetrics(prompt)) {
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

        updatePoemState(prev => ({
          ...prev,
          generatedLines: finalLines,
          isGenerating: false,
          isWaitingForUser: true
        }));
      } catch (error) {
        console.error('Error generating lines:', error);
        updatePoemState(prev => ({ ...prev, isGenerating: false }));
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

    const stanzaRole = stanzaCount === 0 ? 'the beginning of' : 'continuing';
    const stanzaInstruction = stanzaCount === 0
      ? 'Start the story and set the scene'
      : 'Continue the story naturally from where it left off';
    const finalStanzaInstruction = poemStateRef.current.currentStanza === 4
      ? '\n- This is the final stanza, bring the story to a satisfying conclusion'
      : '';

    return `You are helping someone practice improv epic poems. Generate exactly 2 lines for ${stanzaRole} an epic poem about ${topic}.${previousStanzas}

Requirements:
- Lines should rhyme with each other
- Each line must be 5-7 words maximum and follow the da-da-da-da rhythm (exactly 8 beats)
- ${stanzaInstruction}
- End the second line with a word that's easy to rhyme with
- Keep it fun, dramatic, and slightly over-the-top like epic poetry
- Make it family-friendly${finalStanzaInstruction}

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
    const { character, dream } = poemStateRef.current;
    const prompt = `You are helping someone practice improv epic poems. Generate exactly 2 lines for the beginning of an epic poem about The Day ${character} ${dream}. This is the first stanza out of 4, so it should be introductory, not final (i.e. if the poem is about someone flying, they should not be flying already).

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
    await streamTwoLines(prompt);
  }, [streamTwoLines]);

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

      setTimeout(() => {
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

          setTimeout(() => {
            void generateTwoLinesForNewPoem();
          }, 1000);
        } else {
          updatePoemState(prev => ({
            ...prev,
            currentStanza: nextStanza,
            generatedLines: [],
            userLine: ''
          }));

          setTimeout(() => {
            void generateTwoLines();
          }, 100);
        }
      }, 2000);

      return true;
    },
    [generateTwoLines, generateTwoLinesForNewPoem, updatePoemState]
  );

  const snapshot = useMemo(
    () => ({
      poemState,
      supportVoices,
      archivedPoems,
      activeArchiveId
    }),
    [poemState, supportVoices, archivedPoems, activeArchiveId]
  );

  return {
    ...snapshot,
    handleStart,
    handleNewPoem,
    handleArchiveToggle,
    submitUserLine
  };
};

