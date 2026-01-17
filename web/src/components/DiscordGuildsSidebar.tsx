// File: src/components/DiscordGuildsSidebar.tsx

import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import './DiscordGuildsSidebar.css';

interface Guild {
  id: string;
  name: string;
  icon: string | null;
  permissions: string | null;
}

interface DiscordGuildsSidebarProps {
  onGuildSelect?: (guild: Guild) => void;
  selectedGuildId?: string | null;
}

export default function DiscordGuildsSidebar({ onGuildSelect, selectedGuildId }: DiscordGuildsSidebarProps) {
  const { isAuthenticated, session } = useAuth();
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    const fetchGuilds = async () => {
      try {
        setLoading(true);
        const authApiUrl = import.meta.env.PROD 
          ? (import.meta.env.VITE_AUTH_API_URL || '/api')
          : '/api';
        
        const response = await fetch(`${authApiUrl}/guilds`, {
          credentials: 'include',
        });

        if (!response.ok) {
          if (response.status === 401) {
            setError(null);
            setGuilds([]);
            return;
          }
          throw new Error('Failed to fetch guilds');
        }

        const data = await response.json();
        setGuilds(data.guilds || []);
        setError(null);
      } catch (err) {
        console.error('Error fetching guilds:', err);
        setError('Failed to load servers');
        setGuilds([]);
      } finally {
        setLoading(false);
      }
    };

    fetchGuilds();
  }, [isAuthenticated, session]);

  if (!isAuthenticated) {
    return null;
  }

  const getGuildIconUrl = (guildId: string, icon: string | null) => {
    if (!icon) {
      return null;
    }
    // Discord CDN URL for guild icons
    return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png`;
  };

  const getGuildInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="discord-guilds-sidebar">
      <div className="sidebar-header">
        <h3 className="sidebar-title">Your Servers</h3>
      </div>
      <div className="sidebar-content">
        {loading ? (
          <div className="sidebar-loading">
            <span>Loading servers...</span>
          </div>
        ) : error ? (
          <div className="sidebar-error">
            <span>{error}</span>
          </div>
        ) : guilds.length === 0 ? (
          <div className="sidebar-empty">
            <span>No servers found</span>
          </div>
        ) : (
          <div className="guilds-list">
            {guilds.map((guild) => (
              <div
                key={guild.id}
                className={`guild-item ${selectedGuildId === guild.id ? 'selected' : ''}`}
                title={guild.name}
                onClick={() => onGuildSelect?.(guild)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onGuildSelect?.(guild);
                  }
                }}
              >
                {getGuildIconUrl(guild.id, guild.icon) ? (
                  <img
                    src={getGuildIconUrl(guild.id, guild.icon)!}
                    alt={guild.name}
                    className="guild-icon"
                  />
                ) : (
                  <div className="guild-icon-placeholder">
                    {getGuildInitials(guild.name)}
                  </div>
                )}
                <span className="guild-name">{guild.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

