import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WebhookInput, WebhookListParams } from '../api';
import { api } from '../app/api';

export const webhookKeys = {
  all: ['webhooks'] as const,
  list: (params: WebhookListParams) => [...webhookKeys.all, 'list', params] as const,
  detail: (id: number) => [...webhookKeys.all, 'detail', id] as const,
};

export function useWebhookList(params: WebhookListParams) {
  return useQuery({
    queryKey: webhookKeys.list(params),
    queryFn: ({ signal }) => api.webhooks.list(params, signal),
    // While the next page loads, keep showing the current one instead of flashing a spinner.
    placeholderData: keepPreviousData,
  });
}

export function useWebhook(id: number) {
  return useQuery({
    queryKey: webhookKeys.detail(id),
    queryFn: ({ signal }) => api.webhooks.get(id, signal),
  });
}

export function useUpdateWebhook(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: WebhookInput) => api.webhooks.update(id, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(webhookKeys.detail(id), updated);
      // The name may move it in or out of a search result — let every list refetch.
      await queryClient.invalidateQueries({ queryKey: [...webhookKeys.all, 'list'] });
    },
  });
}
