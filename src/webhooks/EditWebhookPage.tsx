import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ApiError, type Webhook, type WebhookInput } from '../api';
import type { ReturnTo } from '../auth/RequireAuth';
import { applyServerErrors } from '../forms/serverErrors';
import { useUpdateWebhook, useWebhook } from './queries';

export function EditWebhookPage() {
  const id = Number(useParams().id);
  const backTo = (useLocation().state as ReturnTo | null)?.from ?? '/webhooks';
  const query = useWebhook(id);

  return (
    <section className="stack narrow">
      <Link to={backTo} className="back">
        ← Back to list
      </Link>
      {query.isPending ? (
        <p className="state">Loading…</p>
      ) : query.isError ? (
        <p className="state state-error" role="alert">
          {query.error instanceof ApiError && query.error.status === 404
            ? 'Webhook not found.'
            : `Error: ${query.error.message}`}
        </p>
      ) : (
        // key: a different webhook = a fresh form, never stale values from the previous one.
        <EditForm key={query.data.id} webhook={query.data} backTo={backTo} />
      )}
    </section>
  );
}

interface EditFormProps {
  webhook: Webhook;
  /** The list address (path + ?page=&search=) to return to after save or cancel. */
  backTo: string;
}

function EditForm({ webhook, backTo }: EditFormProps) {
  const navigate = useNavigate();
  const update = useUpdateWebhook(webhook.id);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<WebhookInput>({ defaultValues: { name: webhook.name, url: webhook.url } });

  const onSubmit = handleSubmit(async (input) => {
    try {
      await update.mutateAsync(input);
      await navigate(backTo);
    } catch (error) {
      if (!applyServerErrors(error, setError, ['name', 'url'])) {
        setError('root.server', { message: error instanceof Error ? error.message : 'Could not save.' });
      }
    }
  });

  return (
    <form className="card stack" onSubmit={(event) => void onSubmit(event)} noValidate>
      <h1>Edit webhook</h1>

      <label className="field">
        <span>Name</span>
        <input aria-invalid={!!errors.name} {...register('name')} />
        {errors.name && <small className="field-error">{errors.name.message}</small>}
      </label>

      <label className="field">
        <span>URL</span>
        <input inputMode="url" className="mono" aria-invalid={!!errors.url} {...register('url')} />
        {errors.url && <small className="field-error">{errors.url.message}</small>}
      </label>

      {errors.root?.server && <p className="form-error">{errors.root.server.message}</p>}

      <div className="row">
        <button type="submit" className="button primary" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Saving…' : 'Save'}
        </button>
        <Link to={backTo} className="button">
          Cancel
        </Link>
      </div>
    </form>
  );
}
