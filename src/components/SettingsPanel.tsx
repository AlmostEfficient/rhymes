import { type RhymeDifficulty, type NarrativeMode, type ModelProvider, type AudioMode, type PoemSettings } from '../hooks/usePoemEngine';

interface SettingsPanelProps {
  isOpen: boolean;
  settings: PoemSettings;
  panelId?: string;
  onClose(): void;
  onUpdate(partial: Partial<PoemSettings>): void;
}

const RHYME_OPTIONS: { value: RhymeDifficulty; label: string }[] = [
  { value: 'easy', label: 'easy' },
  { value: 'medium', label: 'medium' },
  { value: 'hard', label: 'hard' }
];

const NARRATIVE_OPTIONS: { value: NarrativeMode; label: string }[] = [
  { value: 'simple', label: 'simple' },
  { value: 'crazy', label: 'crazy' }
];

const MODEL_OPTIONS: { value: ModelProvider; label: string }[] = [
  { value: 'openai', label: 'GPT-4.1 Nano' },
  { value: 'gemini', label: 'Gemini 2.0 Flash' },
  { value: 'anthropic', label: 'Claude 3.5 Haiku' }
];

const AUDIO_OPTIONS: { value: AudioMode; label: string }[] = [
  { value: 'human', label: 'human' },
  { value: 'device', label: 'robot' },
  { value: 'none', label: 'none' }
];

export const SettingsPanel = ({ isOpen, settings, panelId, onClose, onUpdate }: SettingsPanelProps) => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isIOSLike = ua ? /iPad|iPhone|iPod/i.test(ua) : false;

  return (
    <section
      id={panelId}
      className={`settings-panel ${isOpen ? 'open' : ''}`}
      aria-label="poem controls"
      hidden={!isOpen}
    >
      <header className="settings-header">
        <h2>settings</h2>
        <button type="button" className="settings-close" onClick={onClose} aria-label="close settings">
          ✕
        </button>
      </header>

      <div className="settings-body">
      {settings.showModelPicker && (
        <fieldset className="settings-field">
          <legend>model</legend>
          <div className="settings-options">
            {MODEL_OPTIONS.map(option => (
              <label key={option.value} className={`option-chip ${settings.model === option.value ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="model"
                  value={option.value}
                  checked={settings.model === option.value}
                  onChange={() => onUpdate({ model: option.value })}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="settings-field">
        <legend>rhyme difficulty</legend>
        <div className="settings-options">
          {RHYME_OPTIONS.map(option => (
            <label key={option.value} className={`option-chip ${settings.rhymeDifficulty === option.value ? 'active' : ''}`}>
              <input
                type="radio"
                name="rhyme-difficulty"
                value={option.value}
                checked={settings.rhymeDifficulty === option.value}
                onChange={() => onUpdate({ rhymeDifficulty: option.value })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="settings-field">
        <legend>family friendly</legend>
        <label className={`toggle ${settings.familyFriendly ? 'on' : 'off'}`}>
          <input
            type="checkbox"
            checked={settings.familyFriendly}
            onChange={() => onUpdate({ familyFriendly: !settings.familyFriendly })}
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span className="toggle-label">{settings.familyFriendly ? 'on' : 'off'}</span>
        </label>
      </fieldset>

      <fieldset className="settings-field">
        <legend>poem audio</legend>
        <div className="settings-options">
          {AUDIO_OPTIONS.map(option => (
            <label 
              key={option.value} 
              className={`option-chip ${settings.audioMode === option.value ? 'active' : ''} ${option.value === 'human' && isIOSLike ? 'disabled' : ''}`}
            >
              <input
                type="radio"
                name="audio-mode"
                value={option.value}
                checked={settings.audioMode === option.value}
                disabled={option.value === 'human' && isIOSLike}
                onChange={() => onUpdate({ audioMode: option.value })}
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="settings-note">Human audio doesn't work on iphones</p>
      </fieldset>

      <fieldset className="settings-field">
        <legend>narrative vibe</legend>
        <div className="settings-options">
          {NARRATIVE_OPTIONS.map(option => (
            <label key={option.value} className={`option-chip ${settings.narrativeMode === option.value ? 'active' : ''}`}>
              <input
                type="radio"
                name="narrative-mode"
                value={option.value}
                checked={settings.narrativeMode === option.value}
                onChange={() => onUpdate({ narrativeMode: option.value })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
    </section>
  );
};
