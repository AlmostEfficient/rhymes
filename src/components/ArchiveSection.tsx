import type { ArchivedPoem } from '../hooks/usePoemEngine';
import { useState, useEffect } from 'react';
import { publishPoem, fetchPublishedPoems, type PublishedPoem } from '../lib/supabase';

interface ArchiveSectionProps {
  poems: ArchivedPoem[];
  activeId: string | null;
  onToggle(id: string): void;
}

type TaleFilter = 'mine' | 'all';

export const ArchiveSection = ({ poems, activeId, onToggle }: ArchiveSectionProps) => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<TaleFilter>(poems.length === 0 ? 'all' : 'mine');
  const [publishedPoems, setPublishedPoems] = useState<PublishedPoem[]>([]);
  const [isLoadingPublished, setIsLoadingPublished] = useState(false);

  // Load published poems on mount to check if section should show
  useEffect(() => {
    setIsLoadingPublished(true);
    fetchPublishedPoems()
      .then(setPublishedPoems)
      .catch(err => console.error('Failed to load published poems:', err))
      .finally(() => setIsLoadingPublished(false));
  }, []);

  const activePoem = activeId ? poems.find(poem => poem.id === activeId) : null;
  const activePublished = activeId ? publishedPoems.find(poem => poem.id === activeId) : null;

  // Don't show section if no local poems and no published poems exist
  if (poems.length === 0 && publishedPoems.length === 0 && !isLoadingPublished) return null;

  const formatTimestamp = (timestamp: number | string) => {
    const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric'
    });
  };

  const handlePublish = async () => {
    if (!activePoem) return;

    const authorName = prompt('What\'s your name?');
    if (!authorName?.trim()) return;

    setIsPublishing(true);
    setPublishError(null);
    setPublishSuccess(null);

    try {
      const poemText = activePoem.stanzas
        .map((stanza, idx) => `Stanza ${idx + 1}\n${stanza.join('\n')}`)
        .join('\n\n');

      await publishPoem(authorName.trim(), activePoem.title, poemText);
      setPublishSuccess('Tale published! 🎉');
      setTimeout(() => setPublishSuccess(null), 3000);
      
      // Refresh published poems if viewing all
      if (filter === 'all') {
        const updated = await fetchPublishedPoems();
        setPublishedPoems(updated);
      }
    } catch (error) {
      console.error('Failed to publish poem:', error);
      setPublishError(error instanceof Error ? error.message : 'Failed to publish. Try again?');
    } finally {
      setIsPublishing(false);
    }
  };

  const parsePublishedPoem = (poem: PublishedPoem) => {
    const stanzas: string[][] = [];
    const stanzaBlocks = poem.poem.split(/\n\n+/);
    
    for (const block of stanzaBlocks) {
      const lines = block.split('\n').filter(line => !line.match(/^Stanza \d+$/i));
      if (lines.length > 0) {
        stanzas.push(lines);
      }
    }
    
    return stanzas;
  };

  const showFilter = poems.length > 0 || publishedPoems.length > 0;

  return (
    <section
      className={`archive-section ${activePoem || activePublished ? 'has-active' : ''}`}
      aria-label="Finished poems"
    >
      <div className="archive-header">
        <h2 className="archive-heading">finished tales</h2>
        {showFilter && (
          <div className="archive-filter">
            <button
              type="button"
              className={`filter-chip ${filter === 'mine' ? 'active' : ''}`}
              onClick={() => setFilter('mine')}
            >
              mine
            </button>
            <button
              type="button"
              className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              all tales
            </button>
          </div>
        )}
      </div>

      {activePoem ? (
        <article className="archive-detail" aria-label={`Finished poem ${activePoem.title}`}>
          <div className="archive-detail-content">
            <div className="archive-detail-header">
              <div>
                <div className="archive-detail-title">{activePoem.title}</div>
                <div className="archive-detail-meta">{formatTimestamp(activePoem.timestamp)}</div>
              </div>
              <div className="archive-detail-actions">
                <button
                  type="button"
                  className="archive-publish-button"
                  onClick={handlePublish}
                  disabled={isPublishing}
                >
                  {isPublishing ? 'publishing...' : 'publish'}
                </button>
                <button
                  type="button"
                  className="archive-back-button"
                  onClick={() => onToggle(activePoem.id)}
                >
                  back to all tales
                </button>
              </div>
            </div>
            {publishSuccess && (
              <div className="archive-publish-success" role="status">
                {publishSuccess}
              </div>
            )}
            {publishError && (
              <div className="archive-publish-error" role="alert">
                {publishError}
              </div>
            )}
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
      ) : activePublished ? (
        <article className="archive-detail" aria-label={`Published poem ${activePublished.title}`}>
          <div className="archive-detail-content">
            <div className="archive-detail-header">
              <div>
                <div className="archive-detail-title">{activePublished.title}</div>
                <div className="archive-detail-author">by {activePublished.name}</div>
                <div className="archive-detail-meta">{formatTimestamp(activePublished.created_at)}</div>
              </div>
              <div className="archive-detail-actions">
                <button
                  type="button"
                  className="archive-back-button"
                  onClick={() => onToggle(activePublished.id)}
                >
                  back to all tales
                </button>
              </div>
            </div>
            <div className="archive-detail-body">
              {parsePublishedPoem(activePublished).map((stanza, stanzaIndex) => (
                <div className="archive-stanza" key={`${activePublished.id}-stanza-${stanzaIndex}`}>
                  <div className="archive-stanza-label">Stanza {stanzaIndex + 1}</div>
                  {stanza.map((line, lineIndex) => (
                    <p
                      className={`archive-line ${lineIndex === 2 ? 'user-line' : ''}`}
                      key={`${activePublished.id}-stanza-${stanzaIndex}-line-${lineIndex}`}
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
        <>
          {isLoadingPublished && (
            <div className="archive-loading">loading tales...</div>
          )}
          {!isLoadingPublished && filter === 'mine' && poems.length === 0 && (
            <div className="archive-empty">No finished tales yet. Complete a poem to see it here!</div>
          )}
          {!isLoadingPublished && (
            <div className="archive-grid" role="list">
              {filter === 'mine' && poems.map(poem => (
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
              {filter === 'all' && publishedPoems.map(poem => (
                <button
                  key={poem.id}
                  type="button"
                  className="archive-card"
                  onClick={() => onToggle(poem.id)}
                  aria-expanded={false}
                  role="listitem"
                >
                  <div className="archive-card-title">{poem.title}</div>
                  <div className="archive-card-author">by {poem.name}</div>
                  <div className="archive-card-meta">{formatTimestamp(poem.created_at)}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
};
