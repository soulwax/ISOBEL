// File: web/src/components/DiscordGuildsSidebar.tsx

import { type DragEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../lib/api-paths';
import type { DiscordGuild } from '../types/discord';
import './DiscordGuildsSidebar.css';

interface DiscordGuildsSidebarProps {
  onGuildSelect?: (guild: DiscordGuild) => void;
  onGuildLeave?: (guildId: string) => void;
  selectedGuildId?: string | null;
}

export default function DiscordGuildsSidebar({ onGuildSelect, onGuildLeave, selectedGuildId }: DiscordGuildsSidebarProps) {
  const { session, isAuthenticated } = useAuth();
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ name: string; top: number } | null>(null);
  const [leaveStatus, setLeaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [draggedGuildId, setDraggedGuildId] = useState<string | null>(null);
  const tooltipTimer = useRef<number | null>(null);
  const guildsRef = useRef<DiscordGuild[]>([]);
  const draggedGuildIdRef = useRef<string | null>(null);
  const dragChangedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const pulse = (pattern: number | number[] = 10) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  };

  const clearTooltip = () => {
    if (tooltipTimer.current !== null) {
      window.clearTimeout(tooltipTimer.current);
      tooltipTimer.current = null;
    }

    setTooltip(null);
  };

  const scheduleTooltip = (guild: DiscordGuild, element: HTMLElement) => {
    if (tooltipTimer.current !== null) {
      window.clearTimeout(tooltipTimer.current);
    }

    const rect = element.getBoundingClientRect();
    tooltipTimer.current = window.setTimeout(() => {
      setTooltip({
        name: guild.name,
        top: rect.top + rect.height / 2,
      });
      tooltipTimer.current = null;
    }, 500);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    const fetchGuilds = async () => {
      try {
        setLoading(true);

        const response = await fetch(`${API_BASE_URL}/guilds`, {
          credentials: 'include',
          cache: 'no-store',
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
  }, [isAuthenticated]);

  useEffect(() => {
    guildsRef.current = guilds;
  }, [guilds]);

  useEffect(() => {
    return () => {
      if (tooltipTimer.current !== null) {
        window.clearTimeout(tooltipTimer.current);
      }
    };
  }, []);

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

  const selectedGuild = guilds.find((guild) => guild.id === selectedGuildId) ?? null;
  const canLeaveSelectedGuild = Boolean(session?.user?.isSuperUser && selectedGuild);

  const saveGuildOrder = async (orderedGuilds: DiscordGuild[]) => {
    try {
      const response = await fetch(`${API_BASE_URL}/guilds/order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          guildOrder: orderedGuilds.map((guild) => guild.id),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? 'Failed to save server order');
      }

      setLeaveStatus({ type: 'success', message: 'Order saved' });
    } catch (err) {
      console.error('Error saving server order:', err);
      setLeaveStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save server order',
      });
    } finally {
      window.setTimeout(() => setLeaveStatus(null), 2200);
    }
  };

  const moveGuild = (sourceGuildId: string, targetGuildId: string) => {
    if (sourceGuildId === targetGuildId) {
      return;
    }

    setGuilds((currentGuilds) => {
      const sourceIndex = currentGuilds.findIndex((guild) => guild.id === sourceGuildId);
      const targetIndex = currentGuilds.findIndex((guild) => guild.id === targetGuildId);

      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
        return currentGuilds;
      }

      const nextGuilds = [...currentGuilds];
      const [movedGuild] = nextGuilds.splice(sourceIndex, 1);
      nextGuilds.splice(targetIndex, 0, movedGuild);
      guildsRef.current = nextGuilds;
      dragChangedRef.current = true;
      pulse(6);
      return nextGuilds;
    });
  };

  const handleGuildDragStart = (event: DragEvent<HTMLButtonElement>, guild: DiscordGuild) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', guild.id);
    setDraggedGuildId(guild.id);
    draggedGuildIdRef.current = guild.id;
    dragChangedRef.current = false;
    suppressClickRef.current = false;
    clearTooltip();
    pulse(12);
  };

  const handleGuildDragOver = (event: DragEvent<HTMLButtonElement>, guild: DiscordGuild) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    if (draggedGuildIdRef.current) {
      moveGuild(draggedGuildIdRef.current, guild.id);
    }
  };

  const finishGuildDrag = async () => {
    if (!draggedGuildIdRef.current) {
      return;
    }

    const changed = dragChangedRef.current;
    draggedGuildIdRef.current = null;
    setDraggedGuildId(null);
    dragChangedRef.current = false;

    if (changed) {
      suppressClickRef.current = true;
      pulse([10, 35, 10]);
      await saveGuildOrder(guildsRef.current);
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  };

  const handleLeaveSelectedGuild = async () => {
    if (!selectedGuild || leaving) {
      return;
    }

    const confirmed = window.confirm(`Make ISOBEL leave ${selectedGuild.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      setLeaving(true);
      setLeaveStatus(null);

      const response = await fetch(`${API_BASE_URL}/guilds/${selectedGuild.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? 'Failed to leave server');
      }

      setGuilds((currentGuilds) => currentGuilds.filter((guild) => guild.id !== selectedGuild.id));
      onGuildLeave?.(selectedGuild.id);
      clearTooltip();
      setLeaveStatus({ type: 'success', message: 'Server left' });
    } catch (err) {
      console.error('Error leaving server:', err);
      setLeaveStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to leave server',
      });
    } finally {
      setLeaving(false);
      window.setTimeout(() => setLeaveStatus(null), 3000);
    }
  };

  return (
    <nav className="discord-guilds-sidebar" aria-label="Discord servers">
      <div className="sidebar-content">
        {loading ? (
          <div className="sidebar-loading" aria-live="polite">
            <span className="rail-status-dot" aria-hidden="true" />
            <span className="sr-only">Loading servers...</span>
          </div>
        ) : error ? (
          <div className="sidebar-error" role="status" aria-label={error}>
            <span aria-hidden="true">!</span>
          </div>
        ) : guilds.length === 0 ? (
          <div className="sidebar-empty" role="status" aria-label="No admin servers found">
            <span aria-hidden="true">+</span>
          </div>
        ) : (
          <div className="guilds-list">
            {guilds.map((guild) => (
              <button
                key={guild.id}
                className={[
                  'guild-item',
                  selectedGuildId === guild.id ? 'selected' : '',
                  draggedGuildId === guild.id ? 'dragging' : '',
                ].filter(Boolean).join(' ')}
                type="button"
                aria-label={guild.name}
                aria-current={selectedGuildId === guild.id ? 'page' : undefined}
                draggable
                onClick={() => {
                  if (suppressClickRef.current) {
                    return;
                  }

                  onGuildSelect?.(guild);
                }}
                onMouseEnter={(event) => scheduleTooltip(guild, event.currentTarget)}
                onMouseLeave={clearTooltip}
                onFocus={(event) => scheduleTooltip(guild, event.currentTarget)}
                onBlur={clearTooltip}
                onDragStart={(event) => handleGuildDragStart(event, guild)}
                onDragOver={(event) => handleGuildDragOver(event, guild)}
                onDrop={(event) => {
                  event.preventDefault();
                  void finishGuildDrag();
                }}
                onDragEnd={() => {
                  void finishGuildDrag();
                }}
              >
                {getGuildIconUrl(guild.id, guild.icon) ? (
                  <img
                    src={getGuildIconUrl(guild.id, guild.icon)!}
                    alt={guild.name}
                    className="guild-icon"
                    draggable={false}
                  />
                ) : (
                  <div className="guild-icon-placeholder">
                    {getGuildInitials(guild.name)}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {session?.user?.isSuperUser && (
        <div className="rail-actions">
          <button
            className="rail-action-button rail-action-danger"
            type="button"
            aria-label="Leave Server"
            disabled={!canLeaveSelectedGuild || leaving}
            onClick={handleLeaveSelectedGuild}
            onMouseEnter={(event) => {
              if (canLeaveSelectedGuild) {
                scheduleTooltip({ ...selectedGuild!, name: 'Leave Server' }, event.currentTarget);
              }
            }}
            onMouseLeave={clearTooltip}
            onFocus={(event) => {
              if (canLeaveSelectedGuild) {
                scheduleTooltip({ ...selectedGuild!, name: 'Leave Server' }, event.currentTarget);
              }
            }}
            onBlur={clearTooltip}
          >
            <span aria-hidden="true">-</span>
          </button>
        </div>
      )}
      {tooltip && (
        <span
          className="guild-name"
          role="tooltip"
          style={{ top: `${tooltip.top}px` }}
        >
          {tooltip.name}
        </span>
      )}
      {leaveStatus && (
        <span className={`rail-feedback ${leaveStatus.type}`} role="status">
          {leaveStatus.message}
        </span>
      )}
    </nav>
  );
}
