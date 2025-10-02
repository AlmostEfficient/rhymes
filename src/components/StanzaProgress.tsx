interface StanzaProgressProps {
  currentStanza: number;
}

export const StanzaProgress = ({ currentStanza }: StanzaProgressProps) => (
  <div className="stanza-progress" aria-live="polite">
    <span className="progress-label"></span>
    <div className="progress-lines">
      {Array.from({ length: 4 }).map((_, idx) => {
        const status = currentStanza - 1 > idx ? 'completed' : currentStanza - 1 === idx ? 'current' : 'upcoming';
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
);

