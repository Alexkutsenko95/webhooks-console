import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api';
import { applyServerErrors } from '../forms/serverErrors';
import { useAuth } from './AuthProvider';
import type { ReturnTo } from './RequireAuth';

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const { user, sessionExpired, signIn } = useAuth();
  const navigate = useNavigate();
  const returnTo = (useLocation().state as ReturnTo | null)?.from ?? '/webhooks';
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ defaultValues: { email: '', password: '' } });

  if (user) return <Navigate to={returnTo} replace />;

  const onSubmit = handleSubmit(async ({ email, password }) => {
    try {
      await signIn(email, password);
      await navigate(returnTo, { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, setError, ['email', 'password'])) {
        setError('root.server', {
          message: error instanceof ApiError ? error.message : 'Could not sign in. Please try again.',
        });
      }
    }
  });

  return (
    <main className="auth">
      <form className="card auth-card" onSubmit={(event) => void onSubmit(event)} noValidate>
        <h1>Sign in</h1>
        {sessionExpired && <p className="notice">Your session has ended. Please sign in again.</p>}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            aria-invalid={!!errors.email}
            {...register('email', { required: 'Enter your email' })}
          />
          {errors.email && <small className="field-error">{errors.email.message}</small>}
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password', { required: 'Enter your password' })}
          />
          {errors.password && <small className="field-error">{errors.password.message}</small>}
        </label>

        {errors.root?.server && <p className="form-error">{errors.root.server.message}</p>}

        <button type="submit" className="button primary" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
        {/* Native disclosure: keyboard and screen-reader friendly, no state needed. */}
        <details className="hint">
          <summary>Hint</summary>
          <p>
            Test account: <code>demo@smartsender.test</code> / <code>Password123!</code>
          </p>
        </details>
      </form>
    </main>
  );
}
