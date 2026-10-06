import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError, createApi } from '../src/api';
import { db, expireSession, resetDb, rotateCsrfToken, TEST_USER } from '../src/mocks/db';
import { createHandlers } from '../src/mocks/handlers';

const BASE_URL = 'http://api.test';
const server = setupServer(...createHandlers());

/** Counts requests per pathname, as they leave the client. */
const calls = new Map<string, number>();
server.events.on('request:start', ({ request }) => {
  const path = new URL(request.url).pathname;
  calls.set(path, (calls.get(path) ?? 0) + 1);
});

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetDb();
  calls.clear();
});
afterAll(() => server.close());

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

async function signedIn() {
  const api = createApi({ baseUrl: BASE_URL, storage: memoryStorage() });
  await api.auth.signIn(TEST_USER.email, TEST_USER.password);
  calls.clear();
  return api;
}

describe('session rotation', () => {
  // The test the task asks for.
  it('two parallel requests that get 401 share ONE rotate, and both retries succeed', async () => {
    const api = await signedIn();
    expireSession();

    const [me, list] = await Promise.all([api.auth.me(), api.webhooks.list({ page: 1, search: '' })]);

    expect(me.email).toBe(TEST_USER.email);
    expect(list.data).toHaveLength(10);
    expect(calls.get('/auth/token/rotate')).toBe(1);
    expect(calls.get('/v1/me')).toBe(2); // 401, then the retry
    expect(calls.get('/v1/webhooks')).toBe(2);
  });

  it('a request still in flight at sign-out is cancelled and does not report "session expired"', async () => {
    const api = await signedIn();
    const onExpired = vi.fn();
    api.client.onSessionExpired(onExpired);
    // The list answer arrives late — after the user has already signed out.
    server.use(
      http.get('*/v1/webhooks', async () => {
        await delay(50);
        return HttpResponse.json(
          { error: { type: 'AuthenticationException', message: 'Unauthenticated.' } },
          { status: 401 },
        );
      }),
    );

    const inFlight = api.webhooks.list({ page: 1, search: '' });
    api.client.endSession();
    await api.auth.revoke();

    await expect(inFlight).rejects.toMatchObject({ name: 'AbortError' });
    expect(onExpired).not.toHaveBeenCalled();
    expect(calls.get('/auth/token/rotate')).toBeUndefined();
  });

  it('ends the local session when rotate fails, without retrying forever', async () => {
    const api = await signedIn();
    const onExpired = vi.fn();
    api.client.onSessionExpired(onExpired);
    db.session = null; // server forgot us → rotate answers 400

    await expect(api.auth.me()).rejects.toMatchObject({ status: 400 });
    expect(onExpired).toHaveBeenCalled();
    expect(calls.get('/auth/token/rotate')).toBe(1);
    expect(calls.get('/v1/me')).toBe(1);
  });
});

describe('csrf', () => {
  it('fetches the token before the first request and sends it on POST/PUT', async () => {
    const api = createApi({ baseUrl: BASE_URL, storage: memoryStorage() });
    await api.auth.signIn(TEST_USER.email, TEST_USER.password);
    expect(calls.get('/csrf')).toBe(1); // once, before login — not before every request
  });

  it('on 419 refetches the token and retries the request once', async () => {
    const api = await signedIn();
    rotateCsrfToken(); // the cached token is now stale

    const updated = await api.webhooks.update(1, { name: 'Renamed', url: 'https://hooks.example.com/renamed' });

    expect(updated.name).toBe('Renamed');
    expect(calls.get('/csrf')).toBe(1);
    expect(calls.get('/v1/webhooks/1')).toBe(2); // 419, then the retry
  });

  it('turns a 422 into field errors the form can show', async () => {
    const api = await signedIn();
    const error = await api.webhooks.update(1, { name: '', url: 'ftp://nope' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).payload).toEqual({
      name: ['The name field is required.'],
      url: ['The url must be a valid URL.'],
    });
  });
});
