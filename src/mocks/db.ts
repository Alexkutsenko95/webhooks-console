import type { User, Webhook } from '../api/types';

// In-memory state of the fake backend. Reset on page reload — as the task allows.

export const TEST_USER = {
  email: 'demo@smartsender.test',
  password: 'Password123!',
} as const;

export const SESSION_TTL_MS = 30_000;

const user: User = {
  id: 1,
  email: TEST_USER.email,
  first_name: 'Olena',
  last_name: 'Demo',
  name: 'Olena Demo',
};

const NAMES = [
  'Order created',
  'Order paid',
  'Order shipped',
  'Order cancelled',
  'Refund issued',
  'Subscriber added',
  'Subscriber removed',
  'Campaign sent',
  'Campaign opened',
  'Link clicked',
  'Bot started',
  'Bot finished',
  'Chat assigned',
  'Chat closed',
  'Tag added',
  'Tag removed',
  'Payment failed',
  'Invoice created',
  'Trial started',
  'Trial ended',
  'Lead captured',
  'Form submitted',
  'Survey completed',
  'Ticket opened',
  'Ticket resolved',
  'Daily report',
  'Weekly digest',
];

function seedWebhooks(): Webhook[] {
  const start = Date.UTC(2026, 0, 5, 9, 0, 0);
  return NAMES.map((name, i) => ({
    id: i + 1,
    name,
    url: `https://hooks.example.com/${name.toLowerCase().replace(/\s+/g, '-')}`,
    active: i % 4 !== 3,
    created_at: new Date(start + i * 86_400_000).toISOString(),
  }));
}

interface Session {
  fingerprint: string;
  expiresAt: number;
}

export const db = {
  user,
  webhooks: seedWebhooks(),
  /** Fixed per the task; `rotateCsrfToken` exists only so tests can provoke a 419. */
  csrfToken: 'mock-csrf-token-3f9a2c',
  /** device_session_token → fingerprint, until exchanged by /auth/token/issue. */
  deviceTokens: new Map<string, string>(),
  /** The server-side session — the HttpOnly cookie analogue. The client never sees it. */
  session: null as Session | null,
  now: () => Date.now(),
};

export function resetDb(): void {
  db.webhooks = seedWebhooks();
  db.csrfToken = 'mock-csrf-token-3f9a2c';
  db.deviceTokens.clear();
  db.session = null;
}

// --- Test controls --------------------------------------------------------------------------

/** Makes the current session expire right now, without waiting 30 seconds. */
export function expireSession(): void {
  if (db.session) db.session.expiresAt = db.now() - 1;
}

/** Changes the CSRF token, so the client's cached one becomes invalid (→ 419). */
export function rotateCsrfToken(): void {
  db.csrfToken = `mock-csrf-token-${Math.random().toString(16).slice(2, 8)}`;
}
