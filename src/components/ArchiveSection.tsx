import type { ArchivedPoem } from '../hooks/usePoemEngine';

interface ArchiveSectionProps {
  poems: ArchivedPoem[];
  activeId: string | null;
  onToggle(id: string): void;
}

export const ArchiveSection = ({ poems, activeId, onToggle }: ArchiveSectionProps) => {
  if (poems.length === 0) return null;

  const activePoem = activeId ? poems.find(poem => poem.id === activeId) : null;

  const formatTimestamp = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });

  return (
    <section
      className={`archive-section ${activePoem ? 'has-active' : ''}`}
      aria-label="Finished poems"
    >
      <h2 className="archive-heading">finished tales</h2>
      {activePoem ? (
        <article className="archive-detail" aria-label={`Finished poem ${activePoem.title}`}>
          <div className="archive-detail-content">
            <div className="archive-detail-header">
              <div>
                <div className="archive-detail-title">{activePoem.title}</div>
                <div className="archive-detail-meta">{formatTimestamp(activePoem.timestamp)}</div>
              </div>
              <button
                type="button"
                className="archive-back-button"
                onClick={() => onToggle(activePoem.id)}
              >
                back to all tales
              </button>
            </div>
            <div className="archive-detail-body">
              {activePoem.stanzas.map((stanza, stanzaIndex) => (
                <div className="archive-stanza" key={`${activePoem.id}-stanza-${stanzaIndex}`}>
                  <div className="archive-stanza-label">Stanza {stanzaIndex + 1}</div>
                  {stanza.map((line, lineIndex) => (
                    <p
                      className={`archive-line ${lineIndex === 2 ? 'user-line' : ''}`}
                      key={`${activePoem.id}-stanza-${stanzaIndex}-line-${lineIndex}`}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </article>
      ) : (
        <div className="archive-grid" role="list">
          {poems.map(poem => (
            <button
              key={poem.id}
              type="button"
              className="archive-card"
              onClick={() => onToggle(poem.id)}
              aria-expanded={false}
              role="listitem"
            >
              <div className="archive-card-title">{poem.title}</div>
              <div className="archive-card-meta">{formatTimestamp(poem.timestamp)}</div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};
