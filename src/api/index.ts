import { type ApiClient, createApiClient } from './client';
import { getOrCreateFingerprint, type KeyValueStorage } from './fingerprint';
import type { LoginResponse, User, Webhook, WebhookInput, WebhookList, WebhookListParams } from './types';

export { ApiError } from './errors';
export type * from './types';

/** No captcha widget per the task; a real one would hand us this token. */
const CAPTCHA_TOKEN = 'mock-captcha-token';
export const PAGE_SIZE = 10;

export interface ApiOptions {
  baseUrl: string;
  storage: KeyValueStorage;
  fetch?: typeof fetch;
}

/**
 * The typed API the app talks to: auth and webhooks on top of one client.
 * No globals inside — the app passes window.localStorage, tests pass an in-memory storage
 * and an absolute baseUrl, so each test gets an isolated client with its own CSRF/session state.
 */
export function createApi({ baseUrl, storage, fetch }: ApiOptions) {
  const fingerprint = getOrCreateFingerprint(storage);
  const client: ApiClient = createApiClient({ baseUrl, fingerprint, ...(fetch && { fetch }) });

  const auth = {
    /**
     * login → issue. The device_session_token lives only in this function's scope: it is
     * exchanged for the session right away and never stored — not in state, storage or the URL.
     */
    async signIn(email: string, password: string): Promise<void> {
      const { device_session_token } = await client.post<LoginResponse>(
        '/auth/login',
        { email, password, fingerprint },
        { retryOnUnauthorized: false, headers: { 'X-Captcha-Token': CAPTCHA_TOKEN } },
      );
      await client.post<void>(
        '/auth/token/issue',
        { device_session_token, fingerprint },
        { retryOnUnauthorized: false },
      );
    },
    me: (signal?: AbortSignal) => client.get<User>('/v1/me', signal ? { signal } : {}),
    revoke: () => client.post<void>('/auth/token/revoke', { fingerprint }, { retryOnUnauthorized: false }),
  };

  const webhooks = {
    list({ page, search }: WebhookListParams, signal?: AbortSignal) {
      const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) query.set('search', search);
      return client.get<WebhookList>(`/v1/webhooks?${query}`, signal ? { signal } : {});
    },
    get: (id: number, signal?: AbortSignal) => client.get<Webhook>(`/v1/webhooks/${id}`, signal ? { signal } : {}),
    update: (id: number, input: WebhookInput) => client.put<Webhook>(`/v1/webhooks/${id}`, input),
  };

  return { client, auth, webhooks };
}

export type Api = ReturnType<typeof createApi>;
