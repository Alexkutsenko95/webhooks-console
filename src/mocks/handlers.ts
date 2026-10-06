import { delay, http, HttpResponse } from 'msw';
import type { ErrorBody, ErrorType, ValidationPayload, WebhookList } from '../api/types';
import { db, SESSION_TTL_MS, TEST_USER } from './db';

// The contract from the task, rule by rule. '*' in front of every path matches any origin:
// the browser calls same-origin, the Node test calls an absolute URL.

function fail(status: number, type: ErrorType, message: string, payload?: ValidationPayload) {
  const body: ErrorBody = { error: { type, message, ...(payload && { payload }) } };
  return HttpResponse.json(body, { status });
}

const unauthenticated = () => fail(401, 'AuthenticationException', 'Unauthenticated.');
const invalid = (payload: ValidationPayload) =>
  fail(422, 'ValidationException', 'The given data was invalid.', payload);

/** POST/PUT: CSRF is checked BEFORE the operation runs. */
function csrfFailure(request: Request) {
  return request.headers.get('X-CSRF-TOKEN') === db.csrfToken
    ? null
    : fail(419, 'TokenMismatchException', 'CSRF token mismatch.');
}

function sessionIsValid(): boolean {
  return db.session !== null && db.session.expiresAt > db.now();
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => null);
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

const str = (value: unknown) => (typeof value === 'string' ? value : '');

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function validateWebhook(name: string, url: string): ValidationPayload | null {
  const errors: ValidationPayload = {};
  if (!name.trim()) errors.name = ['The name field is required.'];
  if (!url.trim()) errors.url = ['The url field is required.'];
  else if (!isHttpUrl(url.trim())) errors.url = ['The url must be a valid URL.'];
  return Object.keys(errors).length ? errors : null;
}

/**
 * The fake backend: every rule of the task's API contract.
 * Shared by the browser worker (dev) and msw/node (tests), so both run the same rules.
 * latencyMs > 0 only in the browser — to make loading states visible.
 */
export function createHandlers({ latencyMs = 0 }: { latencyMs?: number } = {}) {
  const wait = () => (latencyMs > 0 ? delay(latencyMs) : Promise.resolve());

  return [
    http.get('*/csrf', async () => {
      await wait();
      return new HttpResponse(null, { status: 204, headers: { 'X-CSRF-TOKEN': db.csrfToken } });
    }),

    http.post('*/auth/login', async ({ request }) => {
      await wait();
      const csrf = csrfFailure(request);
      if (csrf) return csrf;
      if (!request.headers.get('X-Captcha-Token')) return invalid({ captcha: ['The captcha is required.'] });

      const body = await jsonBody(request);
      const email = str(body.email).trim().toLowerCase();
      const password = str(body.password);
      const fingerprint = str(body.fingerprint);

      const errors: ValidationPayload = {};
      if (!email) errors.email = ['The email field is required.'];
      if (!password) errors.password = ['The password field is required.'];
      if (!/^[0-9a-f]{32}$/.test(fingerprint)) errors.fingerprint = ['The fingerprint is invalid.'];
      if (Object.keys(errors).length) return invalid(errors);

      if (email !== TEST_USER.email) return invalid({ email: ['These credentials do not match our records.'] });
      if (password !== TEST_USER.password) return invalid({ password: ['The password is incorrect.'] });

      const deviceSessionToken = crypto.randomUUID();
      db.deviceTokens.set(deviceSessionToken, fingerprint);
      return HttpResponse.json({ device_session_token: deviceSessionToken });
    }),

    http.post('*/auth/token/issue', async ({ request }) => {
      await wait();
      const csrf = csrfFailure(request);
      if (csrf) return csrf;
      const body = await jsonBody(request);
      const token = str(body.device_session_token);
      const fingerprint = str(body.fingerprint);
      if (!token || db.deviceTokens.get(token) !== fingerprint) {
        return invalid({ device_session_token: ['The device session token is invalid.'] });
      }
      db.deviceTokens.delete(token); // one-time
      db.session = { fingerprint, expiresAt: db.now() + SESSION_TTL_MS };
      return new HttpResponse(null, { status: 200 });
    }),

    http.post('*/auth/token/rotate', async ({ request }) => {
      await wait();
      const csrf = csrfFailure(request);
      if (csrf) return csrf;
      const { fingerprint } = await jsonBody(request);
      // Before issue and after revoke there is no session to extend → 400.
      // An EXPIRED session can be rotated: that is the whole point of rotate.
      if (!db.session || db.session.fingerprint !== fingerprint) {
        return fail(400, 'BadRequestException', 'No session to rotate.');
      }
      db.session.expiresAt = db.now() + SESSION_TTL_MS;
      return new HttpResponse(null, { status: 200 });
    }),

    http.post('*/auth/token/revoke', async ({ request }) => {
      await wait();
      const csrf = csrfFailure(request);
      if (csrf) return csrf;
      db.session = null;
      return new HttpResponse(null, { status: 204 });
    }),

    http.get('*/v1/me', async () => {
      await wait();
      if (!sessionIsValid()) return unauthenticated();
      return HttpResponse.json(db.user);
    }),

    http.get('*/v1/webhooks', async ({ request }) => {
      await wait();
      if (!sessionIsValid()) return unauthenticated();
      const params = new URL(request.url).searchParams;
      const limit = 10;
      const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);
      const search = (params.get('search') ?? '').trim().toLowerCase();

      const matching = search ? db.webhooks.filter((w) => w.name.toLowerCase().includes(search)) : db.webhooks;
      const list: WebhookList = {
        data: matching.slice((page - 1) * limit, page * limit),
        paging: {
          pages: { current: page, last: Math.max(1, Math.ceil(matching.length / limit)) },
          results: { total: matching.length, limitation: limit },
        },
      };
      return HttpResponse.json(list);
    }),

    http.get('*/v1/webhooks/:id', async ({ params }) => {
      await wait();
      if (!sessionIsValid()) return unauthenticated();
      const webhook = db.webhooks.find((w) => w.id === Number(params.id));
      return webhook ? HttpResponse.json(webhook) : fail(404, 'NotFoundException', 'Webhook not found.');
    }),

    http.put('*/v1/webhooks/:id', async ({ request, params }) => {
      await wait();
      const csrf = csrfFailure(request);
      if (csrf) return csrf;
      if (!sessionIsValid()) return unauthenticated();
      const webhook = db.webhooks.find((w) => w.id === Number(params.id));
      if (!webhook) return fail(404, 'NotFoundException', 'Webhook not found.');

      const body = await jsonBody(request);
      const name = str(body.name);
      const url = str(body.url);
      const errors = validateWebhook(name, url);
      if (errors) return invalid(errors);

      webhook.name = name.trim();
      webhook.url = url.trim();
      return HttpResponse.json(webhook);
    }),
  ];
}
