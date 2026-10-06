import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

/**
 * Shown instead of a white screen when a page throws while rendering. Data errors are handled
 * inside the pages (error states of the queries); this is the last line of defence.
 */
export function RouteError() {
  const error = useRouteError();
  const details = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null;

  return (
    <main className="auth">
      <div className="card auth-card" role="alert">
        <h1>Something went wrong</h1>
        <p className="hint">This page could not be displayed. Try reloading it.</p>
        {import.meta.env.DEV && details && <pre className="hint">{details}</pre>}
        <div className="row">
          <button type="button" className="button primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <Link to="/webhooks" className="button">
            Back to list
          </Link>
        </div>
      </div>
    </main>
  );
}
