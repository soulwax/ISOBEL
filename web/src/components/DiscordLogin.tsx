// File: web/src/components/DiscordLogin.tsx

import { useAuth } from '../hooks/useAuth';
import './DiscordLogin.css';

interface DiscordLoginProps {
  /** Makes the Super Admin badge open the admin section. */
  onOpenAdmin?: () => void;
}

export default function DiscordLogin({ onOpenAdmin }: DiscordLoginProps) {
  const { session, loading, signIn, signOut, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="discord-login loading">
        <span className="login-text">Loading...</span>
      </div>
    );
  }

  if (isAuthenticated && session?.user) {
    return (
      <div className="discord-login authenticated">
        <div className="user-info">
          {session.user.image && (
            <img
              src={session.user.image}
              alt={session.user.name || 'User'}
              className="user-avatar"
            />
          )}
          <span className="user-name">{session.user.name || 'User'}</span>
          {session.user.isSuperUser && (onOpenAdmin ? (
            <button
              type="button"
              className="superuser-badge superuser-badge-button"
              onClick={onOpenAdmin}
              title="Open playback history"
            >
              Super Admin
            </button>
          ) : (
            <span className="superuser-badge">Super Admin</span>
          ))}
        </div>
        <button onClick={signOut} className="login-button logout-button">
          Logout
        </button>
      </div>
    );
  }

  return (
    <button onClick={signIn} className="login-button login-button-primary">
      Login with Discord
    </button>
  );
}
