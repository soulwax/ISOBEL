// File: web/src/components/GuildSettings.tsx

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE_URL } from '../lib/api-paths';
import type { DiscordGuild, GuildSettingsData } from '../types/discord';
import './GuildSettings.css';

interface GuildSettingsProps {
  guild: DiscordGuild | null;
  onBack: () => void;
  onGuildLeave?: (guildId: string) => void;
}

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}

const LOOP_MODES = ['Off', 'Loop Track', 'Loop Queue'] as const;

const NAV_SECTIONS = [
  { id: 'playback', label: 'Playback' },
  { id: 'queue', label: 'Queue' },
  { id: 'voice', label: 'Voice' },
  { id: 'announcements', label: 'Announcements' },
] as const;

export default function GuildSettings({ guild, onBack, onGuildLeave }: GuildSettingsProps) {
  const { session, isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<GuildSettingsData | null>(null);
  const [original, setOriginal] = useState<GuildSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leaveMessage, setLeaveMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState('playback');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const isDirty = settings !== null && original !== null &&
    JSON.stringify(settings) !== JSON.stringify(original);

  useEffect(() => {
    if (!guild || !isAuthenticated) {
      setLoading(false);
      return;
    }

    const fetchSettings = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`${API_BASE_URL}/guilds/${guild.id}/settings`, {
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          if (response.status === 401) { setError('Please log in to view settings'); return; }
          if (response.status === 403) { setError('You do not have access to this server'); return; }
          throw new Error('Failed to fetch settings');
        }

        const data = await response.json();
        setSettings(data.settings);
        setOriginal(data.settings);
      } catch (err) {
        console.error('Error fetching settings:', err);
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [guild, isAuthenticated]);

  const handleChange = <K extends keyof GuildSettingsData>(
    field: K,
    value: GuildSettingsData[K],
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const handleReset = () => setSettings(original);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guild || !settings) return;

    try {
      setSaving(true);
      setError(null);

      const {
        playlistLimit,
        secondsToWaitAfterQueueEmpties,
        leaveIfNoListeners,
        queueAddResponseEphemeral,
        autoAnnounceNextSong,
        defaultVolume,
        defaultQueuePageSize,
        turnDownVolumeWhenPeopleSpeak,
        turnDownVolumeWhenPeopleSpeakTarget,
        maxQueueSize,
        defaultLoopMode,
      } = settings;

      const response = await fetch(`${API_BASE_URL}/guilds/${guild.id}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          playlistLimit,
          secondsToWaitAfterQueueEmpties,
          leaveIfNoListeners,
          queueAddResponseEphemeral,
          autoAnnounceNextSong,
          defaultVolume,
          defaultQueuePageSize,
          turnDownVolumeWhenPeopleSpeak,
          turnDownVolumeWhenPeopleSpeakTarget,
          maxQueueSize,
          defaultLoopMode,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) { setError('Please log in to update settings'); return; }
        if (response.status === 403) { setError('You do not have permission to update settings'); return; }
        throw new Error('Failed to update settings');
      }

      const data = await response.json();
      setSettings(data.settings);
      setOriginal(data.settings);
    } catch (err) {
      console.error('Error updating settings:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveGuild = async () => {
    if (!guild || leaving) return;
    if (!window.confirm(`Make ISOBEL leave ${guild.name}?`)) return;

    try {
      setLeaving(true);
      setError(null);
      setLeaveMessage(null);

      const response = await fetch(`${API_BASE_URL}/guilds/${guild.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(data?.error ?? 'Failed to leave server');
      }

      setLeaveMessage('Server left. Removing it from your list…');
      onGuildLeave?.(guild.id);
    } catch (err) {
      console.error('Error leaving server:', err);
      setError(err instanceof Error ? err.message : 'Failed to leave server');
    } finally {
      setLeaving(false);
    }
  };

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const getGuildIconUrl = (guildId: string, icon: string | null) =>
    icon ? `https://cdn.discordapp.com/icons/${guildId}/${icon}.png` : null;

  if (!guild) return null;

  if (loading) {
    return (
      <div className="guild-settings">
        <div className="settings-loading">Loading settings…</div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="guild-settings">
        <div className="settings-error">
          <span>{error}</span>
          <button onClick={onBack} className="back-button">Back to Servers</button>
        </div>
      </div>
    );
  }

  if (!settings) return null;

  const iconUrl = getGuildIconUrl(guild.id, guild.icon);

  return (
    <div className="guild-settings">
      {/* ── left nav ── */}
      <nav className="settings-nav" aria-label="Settings sections">
        <div className="settings-nav-label">{guild.name}</div>
        {NAV_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`settings-nav-item${activeSection === s.id ? ' active' : ''}`}
            onClick={() => scrollToSection(s.id)}
          >
            {s.label}
          </button>
        ))}
        {session?.user?.isSuperUser && (
          <>
            <div className="settings-nav-divider" />
            <button
              type="button"
              className="settings-nav-item"
              onClick={() => scrollToSection('danger')}
            >
              Danger Zone
            </button>
          </>
        )}
      </nav>

      {/* ── main content ── */}
      <main className="settings-main">
        {/* page header */}
        <header className="settings-page-header">
          <button onClick={onBack} className="back-button" type="button">
            ← Back
          </button>
          <div className="guild-header-info">
            {iconUrl ? (
              <img src={iconUrl} alt={guild.name} className="guild-header-icon" />
            ) : (
              <div className="guild-header-icon-placeholder">
                {guild.name.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div className="guild-header-text">
              <h2 className="guild-header-name">{guild.name}</h2>
              <span className="guild-header-id">{guild.id}</span>
            </div>
          </div>
        </header>

        {/* flash messages */}
        {error && <div className="settings-message error">{error}</div>}
        {leaveMessage && <div className="settings-message success">{leaveMessage}</div>}

        <form onSubmit={handleSubmit} noValidate>

          {/* ── Playback ── */}
          <section
            id="playback"
            className="settings-section"
            ref={(el) => { sectionRefs.current['playback'] = el; }}
          >
            <h3 className="section-title">Playback</h3>
            <div className="section-divider" />

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Default Volume</div>
                <div className="setting-desc">Volume level when the bot joins a voice channel (0 – 100)</div>
              </div>
              <div className="setting-control range-control">
                <input
                  type="range"
                  className="setting-range"
                  min={0}
                  max={100}
                  value={settings.defaultVolume}
                  onChange={(e) => handleChange('defaultVolume', parseInt(e.target.value))}
                />
                <span className="range-value">{settings.defaultVolume}%</span>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Default Loop Mode</div>
                <div className="setting-desc">Loop behaviour when the bot starts playing</div>
              </div>
              <div className="setting-control">
                <select
                  className="setting-select"
                  value={settings.defaultLoopMode}
                  onChange={(e) => handleChange('defaultLoopMode', parseInt(e.target.value))}
                >
                  {LOOP_MODES.map((label, i) => (
                    <option key={i} value={i}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Auto-duck When People Speak</div>
                <div className="setting-desc">Temporarily lower volume while someone is talking in the channel</div>
              </div>
              <div className="setting-control">
                <Toggle
                  id="turnDownVolumeWhenPeopleSpeak"
                  checked={settings.turnDownVolumeWhenPeopleSpeak}
                  onChange={(v) => handleChange('turnDownVolumeWhenPeopleSpeak', v)}
                />
              </div>
            </div>

            {settings.turnDownVolumeWhenPeopleSpeak && (
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-label">Duck Volume Target</div>
                  <div className="setting-desc">Volume to drop to when someone speaks (0 – 100)</div>
                </div>
                <div className="setting-control range-control">
                  <input
                    type="range"
                    className="setting-range"
                    min={0}
                    max={100}
                    value={settings.turnDownVolumeWhenPeopleSpeakTarget}
                    onChange={(e) =>
                      handleChange('turnDownVolumeWhenPeopleSpeakTarget', parseInt(e.target.value))
                    }
                  />
                  <span className="range-value">{settings.turnDownVolumeWhenPeopleSpeakTarget}%</span>
                </div>
              </div>
            )}
          </section>

          {/* ── Queue ── */}
          <section
            id="queue"
            className="settings-section"
            ref={(el) => { sectionRefs.current['queue'] = el; }}
          >
            <h3 className="section-title">Queue</h3>
            <div className="section-divider" />

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Playlist Track Limit</div>
                <div className="setting-desc">Maximum tracks imported from a single playlist (1 – 200)</div>
              </div>
              <div className="setting-control">
                <input
                  type="number"
                  className="setting-input"
                  min={1}
                  max={200}
                  value={settings.playlistLimit}
                  onChange={(e) => handleChange('playlistLimit', parseInt(e.target.value) || 50)}
                />
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Max Queue Size</div>
                <div className="setting-desc">
                  Hard cap on total queued tracks (0 = unlimited, max 500)
                </div>
              </div>
              <div className="setting-control">
                <input
                  type="number"
                  className="setting-input"
                  min={0}
                  max={500}
                  value={settings.maxQueueSize}
                  onChange={(e) => handleChange('maxQueueSize', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Queue Page Size</div>
                <div className="setting-desc">Tracks shown per page in <code>/queue</code> (1 – 30)</div>
              </div>
              <div className="setting-control">
                <input
                  type="number"
                  className="setting-input"
                  min={1}
                  max={30}
                  value={settings.defaultQueuePageSize}
                  onChange={(e) =>
                    handleChange('defaultQueuePageSize', parseInt(e.target.value) || 10)
                  }
                />
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Hide Queue Responses</div>
                <div className="setting-desc">
                  Make "added to queue" replies visible only to the person who queued the track
                </div>
              </div>
              <div className="setting-control">
                <Toggle
                  id="queueAddResponseEphemeral"
                  checked={settings.queueAddResponseEphemeral}
                  onChange={(v) => handleChange('queueAddResponseEphemeral', v)}
                />
              </div>
            </div>
          </section>

          {/* ── Voice ── */}
          <section
            id="voice"
            className="settings-section"
            ref={(el) => { sectionRefs.current['voice'] = el; }}
          >
            <h3 className="section-title">Voice</h3>
            <div className="section-divider" />

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Leave If No Listeners</div>
                <div className="setting-desc">Disconnect when everyone else leaves the voice channel</div>
              </div>
              <div className="setting-control">
                <Toggle
                  id="leaveIfNoListeners"
                  checked={settings.leaveIfNoListeners}
                  onChange={(v) => handleChange('leaveIfNoListeners', v)}
                />
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Wait Before Leaving (seconds)</div>
                <div className="setting-desc">
                  How long to idle after the queue empties before disconnecting — 0 means never leave
                </div>
              </div>
              <div className="setting-control">
                <input
                  type="number"
                  className="setting-input"
                  min={0}
                  max={300}
                  value={settings.secondsToWaitAfterQueueEmpties}
                  onChange={(e) =>
                    handleChange('secondsToWaitAfterQueueEmpties', parseInt(e.target.value) || 0)
                  }
                />
                <span className="input-unit">sec</span>
              </div>
            </div>
          </section>

          {/* ── Announcements ── */}
          <section
            id="announcements"
            className="settings-section"
            ref={(el) => { sectionRefs.current['announcements'] = el; }}
          >
            <h3 className="section-title">Announcements</h3>
            <div className="section-divider" />

            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">Auto-announce Next Song</div>
                <div className="setting-desc">Post a message in the channel when a new track starts</div>
              </div>
              <div className="setting-control">
                <Toggle
                  id="autoAnnounceNextSong"
                  checked={settings.autoAnnounceNextSong}
                  onChange={(v) => handleChange('autoAnnounceNextSong', v)}
                />
              </div>
            </div>
          </section>

          {/* ── Danger zone ── */}
          {session?.user?.isSuperUser && (
            <section
              id="danger"
              className="danger-section"
              ref={(el) => { sectionRefs.current['danger'] = el; }}
            >
              <h3 className="section-title danger-title">Superuser Actions</h3>
              <div className="danger-row">
                <div>
                  <p className="danger-label">Leave Server</p>
                  <p className="danger-desc">
                    Remove ISOBEL from this Discord server and hide it from the dashboard.
                  </p>
                </div>
                <button
                  type="button"
                  className="danger-button"
                  disabled={leaving}
                  onClick={handleLeaveGuild}
                >
                  {leaving ? 'Leaving…' : 'Leave Server'}
                </button>
              </div>
            </section>
          )}
        </form>

        {/* ── unsaved changes bar ── */}
        {isDirty && (
          <div className="unsaved-bar" role="status">
            <div className="unsaved-bar-inner">
              <span className="unsaved-text">Careful — you have unsaved changes!</span>
              <div className="unsaved-actions">
                <button
                  type="button"
                  className="reset-button"
                  onClick={handleReset}
                  disabled={saving}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="save-button"
                  disabled={saving}
                  onClick={handleSubmit}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
