// File: src/components/GuildSettings.tsx

import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import './GuildSettings.css';

interface GuildSettings {
  guildId: string;
  playlistLimit: number;
  secondsToWaitAfterQueueEmpties: number;
  leaveIfNoListeners: boolean;
  queueAddResponseEphemeral: boolean;
  autoAnnounceNextSong: boolean;
  defaultVolume: number;
  defaultQueuePageSize: number;
  turnDownVolumeWhenPeopleSpeak: boolean;
  turnDownVolumeWhenPeopleSpeakTarget: number;
}

interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

interface GuildSettingsProps {
  guild: Guild | null;
  onBack: () => void;
}

export default function GuildSettings({ guild, onBack }: GuildSettingsProps) {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState<GuildSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!guild || !isAuthenticated) {
      setLoading(false);
      return;
    }

    const fetchSettings = async () => {
      try {
        setLoading(true);
        setError(null);
        const authApiUrl = import.meta.env.PROD 
          ? (import.meta.env.VITE_AUTH_API_URL || '/api')
          : '/api';
        
        const response = await fetch(`${authApiUrl}/guilds/${guild.id}/settings`, {
          credentials: 'include',
        });

        if (!response.ok) {
          if (response.status === 401) {
            setError('Please log in to view settings');
            return;
          }
          if (response.status === 403) {
            setError('You do not have access to this server');
            return;
          }
          throw new Error('Failed to fetch settings');
        }

        const data = await response.json();
        setSettings(data.settings);
      } catch (err) {
        console.error('Error fetching settings:', err);
        setError('Failed to load settings');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, [guild, isAuthenticated]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!guild || !settings) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      
      const authApiUrl = import.meta.env.PROD 
        ? (import.meta.env.VITE_AUTH_API_URL || '/api')
        : '/api';
      
      const response = await fetch(`${authApiUrl}/guilds/${guild.id}/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Please log in to update settings');
          return;
        }
        if (response.status === 403) {
          setError('You do not have permission to update settings');
          return;
        }
        throw new Error('Failed to update settings');
      }

      const data = await response.json();
      setSettings(data.settings);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error updating settings:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof GuildSettings, value: string | number | boolean) => {
    if (!settings) return;
    setSettings({
      ...settings,
      [field]: value,
    });
  };

  const getGuildIconUrl = (guildId: string, icon: string | null) => {
    if (!icon) return null;
    return `https://cdn.discordapp.com/icons/${guildId}/${icon}.png`;
  };

  if (!guild) {
    return null;
  }

  if (loading) {
    return (
      <div className="guild-settings">
        <div className="settings-loading">
          <span>Loading settings...</span>
        </div>
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

  if (!settings) {
    return null;
  }

  return (
    <div className="guild-settings">
      <div className="settings-header">
        <button onClick={onBack} className="back-button">← Back</button>
        <div className="guild-header-info">
          {getGuildIconUrl(guild.id, guild.icon) ? (
            <img
              src={getGuildIconUrl(guild.id, guild.icon)!}
              alt={guild.name}
              className="guild-header-icon"
            />
          ) : (
            <div className="guild-header-icon-placeholder">
              {guild.name.substring(0, 2).toUpperCase()}
            </div>
          )}
          <h2 className="guild-header-name">{guild.name} Settings</h2>
        </div>
      </div>

      <div className="settings-content">
        {error && (
          <div className="settings-message error">
            {error}
          </div>
        )}
        {success && (
          <div className="settings-message success">
            Settings saved successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} className="settings-form">
          <div className="settings-section">
            <h3 className="section-title">Playlist Settings</h3>
            
            <div className="setting-field">
              <label htmlFor="playlistLimit">
                Playlist Limit
                <span className="field-description">
                  Maximum number of tracks that can be added from a playlist
                </span>
              </label>
              <input
                type="number"
                id="playlistLimit"
                min="1"
                max="200"
                value={settings.playlistLimit}
                onChange={(e) => handleChange('playlistLimit', parseInt(e.target.value) || 50)}
              />
            </div>
          </div>

          <div className="settings-section">
            <h3 className="section-title">Queue Settings</h3>
            
            <div className="setting-field">
              <label htmlFor="defaultQueuePageSize">
                Default Queue Page Size
                <span className="field-description">
                  Number of tracks shown per page in the queue command
                </span>
              </label>
              <input
                type="number"
                id="defaultQueuePageSize"
                min="1"
                max="30"
                value={settings.defaultQueuePageSize}
                onChange={(e) => handleChange('defaultQueuePageSize', parseInt(e.target.value) || 10)}
              />
            </div>

            <div className="setting-field">
              <label htmlFor="queueAddResponseEphemeral">
                <input
                  type="checkbox"
                  id="queueAddResponseEphemeral"
                  checked={settings.queueAddResponseEphemeral}
                  onChange={(e) => handleChange('queueAddResponseEphemeral', e.target.checked)}
                />
                Hide Queue Add Responses
                <span className="field-description">
                  Make queue add responses only visible to the user who added the track
                </span>
              </label>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="section-title">Voice Channel Settings</h3>
            
            <div className="setting-field">
              <label htmlFor="secondsToWaitAfterQueueEmpties">
                Wait Time After Queue Empties (seconds)
                <span className="field-description">
                  Time to wait before leaving the voice channel when queue empties (0 = never leave)
                </span>
              </label>
              <input
                type="number"
                id="secondsToWaitAfterQueueEmpties"
                min="0"
                max="300"
                value={settings.secondsToWaitAfterQueueEmpties}
                onChange={(e) => handleChange('secondsToWaitAfterQueueEmpties', parseInt(e.target.value) || 30)}
              />
            </div>

            <div className="setting-field">
              <label htmlFor="leaveIfNoListeners">
                <input
                  type="checkbox"
                  id="leaveIfNoListeners"
                  checked={settings.leaveIfNoListeners}
                  onChange={(e) => handleChange('leaveIfNoListeners', e.target.checked)}
                />
                Leave If No Listeners
                <span className="field-description">
                  Automatically leave when all other participants leave the voice channel
                </span>
              </label>
            </div>
          </div>

          <div className="settings-section">
            <h3 className="section-title">Volume Settings</h3>
            
            <div className="setting-field">
              <label htmlFor="defaultVolume">
                Default Volume
                <span className="field-description">
                  Default volume level (0-100)
                </span>
              </label>
              <input
                type="number"
                id="defaultVolume"
                min="0"
                max="100"
                value={settings.defaultVolume}
                onChange={(e) => handleChange('defaultVolume', parseInt(e.target.value) || 100)}
              />
            </div>

            <div className="setting-field">
              <label htmlFor="turnDownVolumeWhenPeopleSpeak">
                <input
                  type="checkbox"
                  id="turnDownVolumeWhenPeopleSpeak"
                  checked={settings.turnDownVolumeWhenPeopleSpeak}
                  onChange={(e) => handleChange('turnDownVolumeWhenPeopleSpeak', e.target.checked)}
                />
                Auto-Duck When People Speak
                <span className="field-description">
                  Automatically lower volume when people are speaking
                </span>
              </label>
            </div>

            {settings.turnDownVolumeWhenPeopleSpeak && (
              <div className="setting-field">
                <label htmlFor="turnDownVolumeWhenPeopleSpeakTarget">
                  Duck Volume Target
                  <span className="field-description">
                    Volume level to lower to when people speak (0-100)
                  </span>
                </label>
                <input
                  type="number"
                  id="turnDownVolumeWhenPeopleSpeakTarget"
                  min="0"
                  max="100"
                  value={settings.turnDownVolumeWhenPeopleSpeakTarget}
                  onChange={(e) => handleChange('turnDownVolumeWhenPeopleSpeakTarget', parseInt(e.target.value) || 20)}
                />
              </div>
            )}
          </div>

          <div className="settings-section">
            <h3 className="section-title">Announcement Settings</h3>
            
            <div className="setting-field">
              <label htmlFor="autoAnnounceNextSong">
                <input
                  type="checkbox"
                  id="autoAnnounceNextSong"
                  checked={settings.autoAnnounceNextSong}
                  onChange={(e) => handleChange('autoAnnounceNextSong', e.target.checked)}
                />
                Auto-Announce Next Song
                <span className="field-description">
                  Automatically announce when the next song starts playing
                </span>
              </label>
            </div>
          </div>

          <div className="settings-actions">
            <button type="submit" className="save-button" disabled={saving}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


