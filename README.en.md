# Webhooks — Senior Frontend Engineer test task (Smart Sender)

[Українська версія](README.md)

Sign-in, a webhook list with pagination and search, editing. React 19 + TypeScript (strict),
the API is an MSW mock built to the contract from the task.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # session tests (Vitest + msw/node)
npm run typecheck  # tsc --noEmit, strict
npm run lint       # ESLint: typescript-eslint (type-aware) + react-hooks
npm run format     # Prettier
npm run build
```

CI (GitHub Actions, `.github/workflows/ci.yml`) runs lint, the formatting check, type checking, tests and the
build on every push and PR.

**Test credentials:** `demo@smartsender.test` / `Password123!`
(also under "Hint" on the sign-in screen). A wrong password → 422 with the error next to the field.

The mock session lives for 30 seconds — wait half a minute and open another page of the list: the Network tab
shows `401 → POST /auth/token/rotate → retry 200`.

## Structure

```
src/
  api/          ← network layer, knows nothing about React
    client.ts       headers, CSRF, 401 → rotate → retry, 419 → new CSRF → retry
    index.ts        typed calls: auth.signIn / me / revoke, webhooks.list / get / update
    errors.ts       ApiError + parsing of the error format
    fingerprint.ts  stable device identifier
    types.ts        API contract
  app/          router, QueryClient, Layout, RouteError (instead of a white screen on a render error)
  auth/         AuthProvider (user, sign-in, sign-out), RequireAuth, LoginPage
  webhooks/     list and edit pages, React Query hooks, list state in the URL
  forms/        422 → errors next to the fields (react-hook-form)
  mocks/        MSW: db.ts (in-memory state), handlers.ts (contract rules)
tests/session.test.ts
```

API logic → state (React Query + AuthProvider) → UI. Components never see `fetch`, headers or status codes:
they get data or an `ApiError`.

## Key decisions

1. **One shared rotate (single-flight).** `client.ts` holds the promise of the rotate in progress. Requests that
   got 401 at the same time wait for that same promise. Rotate itself runs with `retryOnUnauthorized: false`,
   so it cannot start another rotate.
2. **Rotation counter (`sessionGeneration`).** The counter goes up after every successful rotate. If a request
   was sent before a rotate but got its 401 after it, it does not rotate again — it simply retries. Without this
   a slow request would trigger a needless rotate.
3. **Exactly one retry.** After a rotate, a second 401 or a failed rotate → `onSessionExpired`: local sign-out,
   the React Query cache is cleared, the sign-in screen explains why.
4. **CSRF.** `GET /csrf` before the first request, sign-in included (it is a POST). Parallel requests wait for
   the same `/csrf`. On 419 — a new token and one retry. `X-Requested-With` is sent on every request.
5. **Tokens.** `device_session_token` lives only inside the scope of `signIn`: it is exchanged for a session right
   away and stored nowhere. The client never sees session tokens: the mock keeps the session on its side (the
   equivalent of an HttpOnly cookie). `localStorage` holds only the `fingerprint` (32 hex,
   `crypto.getRandomValues`).
6. **The URL is the single source of truth for the list.** `page` and `search` are not copied into `useState`.
   Reload, back / forward and shared links work without any syncing. Changing the page adds a history entry;
   typing in search (debounced by 300 ms) replaces it, so "back" does not step through every letter; a new
   search → page 1. A page that no longer exists (`?page=9` with 3 pages) is corrected to the last one.
7. **After a reload.** The session lives only in memory → you have to sign in again (the task allows this), but
   `RequireAuth` remembers the full address, and the list parameters from the URL apply after sign-in.
8. **Validation is on the server.** The API checks the URL format, the client shows 422 errors next to the fields
   (`forms/serverErrors.ts`). One source of rules, no drift between client and server.
9. **Testability.** `createApi({ baseUrl, storage })` has no global dependencies. The test builds its own instance
   with in-memory storage instead of `localStorage` and counts requests through MSW events.
10. **Signing out mid-request.** If you press "Sign out" while a list request is in flight, after revoke that
    request would get 401, try to rotate (400) and show "Your session has ended" to someone who signed out on
    purpose. So sign-out first calls `client.endSession()`: requests of the current session are aborted
    (`AbortController`), and the session-expired signal is accepted only from requests of the current session.
11. **Errors.** Data errors are handled by the pages themselves (query states). A render error goes to the
    router's `errorElement` with a reload button instead of a white screen.

## Tests

`tests/session.test.ts`:

- **required:** two parallel requests get 401 → exactly one rotate → both retries succeed;
- a request in flight at sign-out is aborted and does not report an expired session;
- a failed rotate ends the session, with no endless retries;
- CSRF: the token is fetched once before the first request; 419 → new token and one retry;
- 422 turns into per-field errors.

Verified that the tests really catch bugs: without single-flight the required test fails, without `endSession()`
the sign-out test fails.

## Time and tools

About 3 hours. I used Claude Code as an assistant: I reviewed every decision, checked it in the browser and with
tests, and can explain it.

## What I would do next

- Playwright E2E: sign-in → list → edit → session expiry in a real browser.
- Component tests for the list page (URL state, back / forward).
- De-duplicating `onSessionExpired` when several requests fail at once (the handler is idempotent now, so this
  does not affect behavior).
- Accessibility of the table and pagination (announcing page changes to screen readers).
