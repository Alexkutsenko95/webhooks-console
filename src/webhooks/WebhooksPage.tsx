import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { Webhook, WebhookList } from '../api';
import { useWebhookList } from './queries';
import { useListParams } from './useListParams';

export function WebhooksPage() {
  const { params, setPage, setSearch, correctPage } = useListParams();
  const query = useWebhookList(params);
  const last = query.data?.paging.pages.last;
  // ?page=9 with only 3 pages (bookmark, or a filter shrank the list) → go to the last real page.
  // Until the corrected page arrives this is "loading", not "nothing found".
  const outOfRange = last !== undefined && params.page > last;

  useEffect(() => {
    if (outOfRange && last !== undefined) correctPage(last);
  }, [outOfRange, last, correctPage]);

  return (
    <section className="stack">
      <div className="toolbar">
        <h1>Webhooks</h1>
        <SearchInput value={params.search} onChange={setSearch} />
      </div>

      {query.isPending || outOfRange ? (
        <p className="state">Loading…</p>
      ) : query.isError ? (
        <div className="state state-error" role="alert">
          <p>Could not load webhooks: {query.error.message}</p>
          <button type="button" className="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : query.data.data.length === 0 ? (
        <p className="state">{params.search ? `Nothing found for “${params.search}”.` : 'No webhooks yet.'}</p>
      ) : (
        <>
          <WebhookTable items={query.data.data} dimmed={query.isPlaceholderData} />
          <Pagination paging={query.data.paging} onPage={setPage} busy={query.isFetching} />
        </>
      )}
    </section>
  );
}

interface SearchInputProps {
  /** The applied search — from the URL. */
  value: string;
  onChange: (value: string) => void;
}

/**
 * Local state for typing, URL for the applied value. Back/forward changes the URL → the input
 * follows; typing changes the input → after a pause the URL follows.
 */
function SearchInput({ value, onChange }: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);

  // The URL changed (back/forward, reset): adjust the draft during render, not in an effect —
  // an effect would render once with the stale draft and then again. If the change came from
  // our own debounce, the draft already says the same thing: keep it (and the caret) as is.
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (draft.trim() !== value) setDraft(value);
  }

  useEffect(() => {
    const next = draft.trim();
    if (next === value) return;
    const timer = setTimeout(() => onChange(next), 300);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  return (
    <input
      type="search"
      className="search"
      placeholder="Search by name"
      aria-label="Search by name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
}

interface WebhookTableProps {
  items: Webhook[];
  /** The previous page is still shown while the next one loads. */
  dimmed: boolean;
}

function WebhookTable({ items, dimmed }: WebhookTableProps) {
  const location = useLocation();
  return (
    <div className="table-wrap">
      <table className={dimmed ? 'dimmed' : undefined}>
        <thead>
          <tr>
            <th>Name</th>
            <th>URL</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {items.map((w) => (
            <tr key={w.id}>
              <td>{w.name}</td>
              <td className="mono">{w.url}</td>
              <td>
                <span className={w.active ? 'badge on' : 'badge off'}>{w.active ? 'Active' : 'Disabled'}</span>
              </td>
              <td className="actions">
                {/* Carry the list address so "back to list" returns to the same page and search. */}
                <Link to={`/webhooks/${w.id}`} state={{ from: location.pathname + location.search }}>
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PaginationProps {
  paging: WebhookList['paging'];
  onPage: (page: number) => void;
  /** A page request is in flight — buttons wait for it. */
  busy: boolean;
}

function Pagination({ paging, onPage, busy }: PaginationProps) {
  const { current, last } = paging.pages;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" className="button" disabled={current <= 1 || busy} onClick={() => onPage(current - 1)}>
        ← Previous
      </button>
      <span>
        Page {current} of {last} · {paging.results.total} {paging.results.total === 1 ? 'result' : 'results'}
      </span>
      <button type="button" className="button" disabled={current >= last || busy} onClick={() => onPage(current + 1)}>
        Next →
      </button>
    </nav>
  );
}
