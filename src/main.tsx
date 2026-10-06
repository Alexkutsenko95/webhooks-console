import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { queryClient } from './app/queryClient';
import { router } from './app/router';
import { AuthProvider } from './auth/AuthProvider';
import { worker } from './mocks/browser';
import './styles.css';

// There is no real backend: the MSW worker IS the API, so it must be running before the first request.
await worker.start({ onUnhandledFrame: 'bypass', quiet: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
