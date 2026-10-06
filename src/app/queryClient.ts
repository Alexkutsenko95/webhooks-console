import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      // 4xx will not fix itself (and 401 is already handled by the client). Retry only network/5xx.
      retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
    },
  },
});
