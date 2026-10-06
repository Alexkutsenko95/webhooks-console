import { setupWorker } from 'msw/browser';
import { createHandlers } from './handlers';

// A little latency so loading states are actually visible.
export const worker = setupWorker(...createHandlers({ latencyMs: 300 }));
