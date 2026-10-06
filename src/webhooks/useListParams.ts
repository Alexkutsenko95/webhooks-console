import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import type { WebhookListParams } from '../api';

/** "?page=abc", "?page=-3" → 1. The URL is user input like any other. */
export function parsePage(raw: string | null): number {
  const page = Number(raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/**
 * The URL is the single source of truth for page and search — no copy in useState to keep in
 * sync. Reload, back/forward and shared links all just work. Defaults are left out of the URL.
 */
export function useListParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params: WebhookListParams = {
    page: parsePage(searchParams.get('page')),
    search: searchParams.get('search') ?? '',
  };

  const update = useCallback(
    (next: Partial<WebhookListParams>, { replace = false } = {}) => {
      setSearchParams(
        (current) => {
          const merged = new URLSearchParams(current);
          const page = next.page ?? parsePage(current.get('page'));
          const search = next.search ?? current.get('search') ?? '';
          if (page > 1) merged.set('page', String(page));
          else merged.delete('page');
          if (search) merged.set('search', search);
          else merged.delete('search');
          return merged;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  // Page change = a history entry, so "back" returns to the previous page.
  const setPage = useCallback((page: number) => update({ page }), [update]);
  // A new search always starts from page 1. Typing replaces the entry instead of adding one per keystroke.
  const setSearch = useCallback((search: string) => update({ search, page: 1 }, { replace: true }), [update]);
  // Fixing an impossible page (beyond the last) should not leave the bad URL in history.
  const correctPage = useCallback((page: number) => update({ page }, { replace: true }), [update]);

  return { params, setPage, setSearch, correctPage };
}
