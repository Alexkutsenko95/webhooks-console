import { createBrowserRouter, Navigate } from 'react-router';
import { LoginPage } from '../auth/LoginPage';
import { RequireAuth } from '../auth/RequireAuth';
import { EditWebhookPage } from '../webhooks/EditWebhookPage';
import { WebhooksPage } from '../webhooks/WebhooksPage';
import { Layout } from './Layout';
import { RouteError } from './RouteError';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    element: (
      <RequireAuth>
        <Layout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { path: '/webhooks', element: <WebhooksPage /> },
      { path: '/webhooks/:id', element: <EditWebhookPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/webhooks" replace /> },
]);
