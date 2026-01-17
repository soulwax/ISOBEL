// File: src/components/DiscordLogin.tsx

import { useAuth } from '../hooks/useAuth';
import './DiscordLogin.css';

export default function DiscordLogin() {
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

