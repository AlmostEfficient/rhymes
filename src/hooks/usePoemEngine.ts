import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChatWithMetrics as streamOpenAI } from '../lib/openai';
import { streamChatWithMetrics as streamGemini } from '../lib/gemini';
import { streamChatWithMetrics as streamAnthropic } from '../lib/anthropic';
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
export type ModelProvider = 'openai' | 'gemini' | 'anthropic';

export interface PoemSettings {
  rhymeDifficulty: RhymeDifficulty;
  familyFriendly: boolean;
  narrativeMode: NarrativeMode;
  model: ModelProvider;
  showModelPicker: boolean;
  outboundAudioEnabled: boolean;
}

const getDefaultSettings = (): PoemSettings => {
  const isIOSChrome =
    typeof navigator !== 'undefined' && /CriOS/i.test(navigator.userAgent || '');

  return {
    rhymeDifficulty: 'easy',
    familyFriendly: true,
    narrativeMode: 'simple',
    model: 'openai',
    showModelPicker: false,
    outboundAudioEnabled: !isIOSChrome
  };
};

const pickSupportVoices = (): [string, string] => {
  const shuffled = [...SUPPORT_VOICE_NAMES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return [shuffled[0], shuffled[1]];
};

const sanitizeLine = (rawLine: string): string => {
  let line = rawLine
    .replace(/^["'“”]+/, '')
    .replace(/["'“”]+$/, '')
    .trim();

  if (!line) return '';

  const stanzaPrefixMatch = line.match(/^(stanza|verse|here'?s|this is)[^:]*:\s*(.*)$/i);
  if (stanzaPrefixMatch) {
    line = stanzaPrefixMatch[2]?.trim() ?? '';
  }

  if (!line) return '';

  if (/[:;]$/.test(line)) {
    line = line.replace(/[:;]+$/, '').trim();
  }

  const inlineMatch = line.match(/^(?:stanza|verse|line)\s*\d+\s*[:-]\s*(.*)$/i);
  if (inlineMatch) {
    line = inlineMatch[1]?.trim() ?? '';
  }

  if (!line) return '';

  return line.trim();
};

const extractValidLines = (text: string): string[] => {
  const rawSegments = text
    .split(/\r?\n/)
    .map(segment => segment.trim())
    .filter(Boolean);

  const lines: string[] = [];

  for (const segment of rawSegments) {
    const cleaned = sanitizeLine(segment);
    if (!cleaned) continue;
    lines.push(cleaned);
    if (lines.length === 2) break;
  }

  return lines;
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
  const [settings, setSettings] = useState<PoemSettings>(() => {
    const defaults = getDefaultSettings();
    if (typeof window === 'undefined') {
      return { ...defaults };
    }
    try {
      const saved = window.localStorage.getItem('poem_settings');
      if (!saved) {
        return { ...defaults };
      }
      const parsed = JSON.parse(saved);
      return { ...defaults, ...parsed };
    } catch (err) {
      console.error('Failed to parse saved settings:', err);
      return { ...defaults };
    }
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
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('poem_settings', JSON.stringify(settings));
      } catch (err) {
        console.error('Failed to save settings:', err);
      }
    }
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
        const streamFn = 
          settingsRef.current.model === 'gemini' ? streamGemini :
          settingsRef.current.model === 'anthropic' ? streamAnthropic :
          streamOpenAI;

        for await (const { chunk } of streamFn(prompt)) {
          if (sessionId !== generationSessionRef.current) {
            return;
          }
          
          if (!chunk) continue;
          buffer += chunk;

          const partialLines = extractValidLines(buffer);

          updatePoemState(prev => ({
            ...prev,
            generatedLines: partialLines
          }));
        }

        const finalLines = extractValidLines(buffer);

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
      ? `\n\nHere's the story so far:\n${completedStanzas
          .map((stanza, index) => `Stanza ${index + 1}:\n${stanza.join('\n')}`)
          .join('\n\n')}\n\nNow write stanza ${currentStanza} to continue naturally from where we left off.`
      : '';
  
    const isFirstStanza = stanzaCount === 0;
    const isFinalStanza = poemStateRef.current.currentStanza === 4;
  
    const stanzaGuidance = isFirstStanza
      ? 'Set the scene and introduce the dream. Make it clear the dream is still ahead - they haven\'t achieved it yet.'
      : isFinalStanza
        ? 'This is the climax! Time to resolve the dream and stick the landing.'
        : 'Keep the story moving forward. Show some progress or setbacks, but don\'t resolve the dream yet - leave room for what comes next.';
  
    const { rhymeDifficulty, familyFriendly, narrativeMode } = settingsRef.current;
  
    const rhymeStyle =
      rhymeDifficulty === 'easy'
        ? 'Use simple, playful rhymes that are easy to follow.'
        : rhymeDifficulty === 'hard'
          ? 'Go for creative, unexpected rhymes with richer vocabulary.'
          : 'Keep the rhymes natural - not too obvious, not too obscure.';
  
    const narrativeStyle =
      narrativeMode === 'crazy'
        ? 'Embrace the weird! Throw in surreal twists and wild imagery.'
        : 'Keep things grounded and logical.';
  
    const contentNote = familyFriendly ? '\nKeep it family-friendly.' : '';
  
    return `You're helping someone practice writing epic poems through improv. Write exactly 2 lines for an epic poem about "${topic}".${previousStanzas}
  
  Here's what you need to do:
  - ${stanzaGuidance}
  - The 2 lines should rhyme with each other
	- IMPORTANT: Don't put a period at the end of the second line - the story continues with the user's line
  - Each line needs to be 5-7 words and follow a da-da-da-da rhythm (8 beats total)
  - End the second line with a word that's easy to rhyme with - the user will add a third line
  - ${rhymeStyle}
  - ${narrativeStyle}${contentNote}
  - Keep it fun, dramatic, and over-the-top like classic epic poetry
  
  Good examples of the 8-beat rhythm:
  "Diana woke up early and bright" (8 beats: da-da-da-da-da-da-da-da)
  "She grabbed her gear to join the fight"
  "The siren called through morning light"
  "Bob climbed into his jet so fast"
  "He knew this day would be his last"
  "Maria dreamed of touching the stars"
	"She built a rocket in her backyard"
	"The dragon flew across the night"
	"Its silver wings were shining bright"
	"Tommy wanted to bake some bread"
	"He mixed the dough and went ahead"
	"The ocean waves were calling her"
	"To sail beyond where waters blur"
	"Alex raced toward the mountain peak"
	"The treasure that he came to seek"
	"The wizard cast a magic spell"
	"To save the kingdom from its hell"
	"She practiced every single day"
	"To learn the song she'd one day play"
  
  Make sure your lines match this rhythm exactly. Just give me the 2 lines, nothing else.`;
  }, []);

  const generateTwoLines = useCallback(async () => {
    await streamTwoLines(buildContextPrompt(poemStateRef.current.completedStanzas.length));
  }, [buildContextPrompt, streamTwoLines]);

  const rerollPrompt = useCallback(() => {
    const current = poemStateRef.current;
    const nextPrompt = getRandomPrompt(promptKey({ name: current.character, dream: current.dream }));
    const nextState = createPoemState(nextPrompt);

    generationSessionRef.current++;
    clearRegisteredTimeouts();

    setPoemState(nextState);
    poemStateRef.current = nextState;
    setSupportVoices(pickSupportVoices());
    setActiveArchiveId(null);
  }, [clearRegisteredTimeouts]);

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

          generationSessionRef.current += 1;
          clearRegisteredTimeouts();

          const nextState = createPoemState();
          setPoemState(nextState);
          poemStateRef.current = nextState;
          setSupportVoices(pickSupportVoices());
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
    [clearRegisteredTimeouts, generateTwoLines, registerTimeout, updatePoemState]
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
