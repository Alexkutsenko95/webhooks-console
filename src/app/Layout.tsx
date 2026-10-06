import { useState } from 'react';
import { Link, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthProvider';

export function Layout() {
  const { user, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/webhooks" className="brand">
          Webhooks
        </Link>
        <div className="topbar-user">
          <span>{user?.name}</span>
          <button
            type="button"
            className="button"
            disabled={leaving}
            onClick={() => {
              setLeaving(true);
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
