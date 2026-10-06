import { ApiError, toApiError } from './errors';

// The only place that knows about headers, CSRF, session rotation and retries.
// Everything above it (endpoints, React Query hooks, components) just calls get/post/put.

type Method = 'GET' | 'POST' | 'PUT';

export interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /**
   * true (default): a 401 means "session expired" → rotate once and retry.
   * false: auth endpoints themselves — a 401/400 there is a real answer, and the rotate
   * request must never trigger another rotate.
   */
  retryOnUnauthorized?: boolean;
}

export interface ApiClientOptions {
  /** '' in the browser (same origin), an absolute origin in Node tests. */
  baseUrl: string;
  /** Sent in the body of rotate; the client needs it to refresh the session on its own. */
  fingerprint: string;
  fetch?: typeof fetch;
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>;
  /** Called when the session cannot be restored: rotate failed, or the retry got 401 again. */
  onSessionExpired(listener: () => void): () => void;
  /**
   * The user is signing out: abort every request still in flight, and make sure none of them
   * reports "session expired" afterwards — leaving on purpose is not an expiry.
   */
  endSession(): void;
}

/**
 * Every request goes through one loop: send → on 419 refresh CSRF and retry once →
 * on 401 rotate (shared by all concurrent callers) and retry once → otherwise result or ApiError.
 * State (CSRF token, in-flight rotate) lives in this closure, one per client instance.
 */
export function createApiClient({ baseUrl, fingerprint, fetch: fetchImpl = fetch }: ApiClientOptions): ApiClient {
  let csrfToken: string | null = null;
  // In-flight promises, shared by everyone who needs the same thing at the same time.
  let csrfInFlight: Promise<void> | null = null;
  let rotationInFlight: Promise<void> | null = null;
  // Bumped after every successful rotate. Lets a request that got 401 tell
  // "my session is dead" apart from "it was dead, but someone already rotated it meanwhile".
  let sessionGeneration = 0;
  const expiredListeners = new Set<() => void>();
  // Every request belongs to the session it started in. endSession() aborts this controller,
  // which cancels those requests and silences their expiry signal.
  let sessionScope = new AbortController();

  function send(method: Method, path: string, options: RequestOptions, scope: AbortSignal): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('X-Requested-With', 'XMLHttpRequest');
    headers.set('Accept', 'application/json');
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (method !== 'GET' && csrfToken) headers.set('X-CSRF-TOKEN', csrfToken);

    return fetchImpl(`${baseUrl}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // Cancelled by the caller (React Query) or by the end of the session — whichever comes first.
      signal: options.signal ? AbortSignal.any([options.signal, scope]) : scope,
      // The session lives in an HttpOnly cookie on a real backend; the client never touches it.
      credentials: 'same-origin',
    });
  }

  /** GET /csrf — single-flight: parallel callers wait for the same request. */
  function refreshCsrf(): Promise<void> {
    if (csrfInFlight) return csrfInFlight;
    const pending = (async () => {
      const response = await send('GET', '/csrf', {}, sessionScope.signal);
      if (!response.ok) throw await toApiError(response);
      const token = response.headers.get('X-CSRF-TOKEN');
      if (!token) throw new ApiError(response.status, 'UnknownError', 'CSRF token missing in the response');
      csrfToken = token;
    })().finally(() => {
      // Clear only our own promise: after endSession() a newer one may already be in flight.
      if (csrfInFlight === pending) csrfInFlight = null;
    });
    csrfInFlight = pending;
    return pending;
  }

  /** POST /auth/token/rotate — single-flight: N requests that got 401 together cause ONE rotate. */
  function rotateSession(): Promise<void> {
    if (rotationInFlight) return rotationInFlight;
    const pending = request<void>('POST', '/auth/token/rotate', {
      body: { fingerprint },
      retryOnUnauthorized: false,
    })
      .then(() => {
        sessionGeneration++;
      })
      .finally(() => {
        if (rotationInFlight === pending) rotationInFlight = null;
      });
    rotationInFlight = pending;
    return pending;
  }

  /** Only a request from the CURRENT session may declare it expired. */
  function expireSession(scope: AbortSignal): void {
    if (scope.aborted) return;
    for (const listener of expiredListeners) listener();
  }

  async function request<T>(method: Method, path: string, options: RequestOptions): Promise<T> {
    const retryOnUnauthorized = options.retryOnUnauthorized ?? true;
    const scope = sessionScope.signal;
    // "Before the first other API request, GET /csrf."
    if (!csrfToken) await refreshCsrf();

    let csrfRetried = false;
    let authRetried = false;

    for (;;) {
      const generationAtSend = sessionGeneration;
      const response = await send(method, path, options, scope);

      // 419: the CSRF token is stale — fetch a fresh one and retry, at most once.
      if (response.status === 419 && !csrfRetried) {
        csrfRetried = true;
        await refreshCsrf();
        continue;
      }

      if (response.status === 401 && retryOnUnauthorized) {
        if (authRetried) {
          // Rotated and still 401: the session is really gone.
          expireSession(scope);
          throw await toApiError(response);
        }
        authRetried = true;
        // Rotate only if nobody rotated since this request left; otherwise just retry.
        // While a rotate is in flight, this joins it instead of starting another one.
        if (generationAtSend === sessionGeneration) {
          try {
            await rotateSession();
          } catch (error) {
            expireSession(scope);
            throw error;
          }
        }
        continue;
      }

      if (!response.ok) throw await toApiError(response);
      return (await parseBody(response)) as T;
    }
  }

  return {
    get: (path, options = {}) => request('GET', path, options),
    post: (path, body, options = {}) => request('POST', path, { ...options, body }),
    put: (path, body, options = {}) => request('PUT', path, { ...options, body }),
    onSessionExpired(listener) {
      expiredListeners.add(listener);
      return () => expiredListeners.delete(listener);
    },
    endSession() {
      sessionScope.abort(new DOMException('The session was ended by the user', 'AbortError'));
      sessionScope = new AbortController();
      // Requests started from now on must not join a rotate/csrf from the old session.
      rotationInFlight = null;
      csrfInFlight = null;
    },
  };
}

async function parseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const text = await response.text();
  return text ? JSON.parse(text) : undefined;
}
