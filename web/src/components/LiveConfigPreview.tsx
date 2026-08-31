import { useState, type ReactNode } from 'react';
import type { DiscordGuild, GuildSettingsData } from '../types/discord';
import './LiveConfigPreview.css';

interface LiveConfigPreviewProps {
  guild: DiscordGuild;
  settings: GuildSettingsData;
  isDirty: boolean;
}

const LOOP_MODE_NAMES = ['off', 'track', 'queue'] as const;

function JsonValue({ value }: { value: string | number | boolean }) {
  const valueType = typeof value;
  const className = valueType === 'string'
    ? 'code-string'
    : valueType === 'boolean'
      ? 'code-boolean'
      : 'code-number';

  return <span className={className}>{valueType === 'string' ? JSON.stringify(value) : String(value)}</span>;
}

function CodeLine({ indent = 0, children }: { indent?: number; children: ReactNode }) {
  return <span className="config-code-line" style={{ paddingLeft: `${indent * 1.25}rem` }}>{children}</span>;
}

export default function LiveConfigPreview({ guild, settings, isDirty }: LiveConfigPreviewProps) {
  const [copied, setCopied] = useState(false);
  const loopMode = LOOP_MODE_NAMES[settings.defaultLoopMode] ?? 'off';
  const config = {
    guild: guild.name,
    playback: {
      volume: settings.defaultVolume,
      loop: loopMode,
      duckOnSpeech: settings.turnDownVolumeWhenPeopleSpeak,
      duckVolume: settings.turnDownVolumeWhenPeopleSpeakTarget,
    },
    queue: {
      playlistLimit: settings.playlistLimit,
      maxSize: settings.maxQueueSize === 0 ? 'unlimited' : settings.maxQueueSize,
      announceNext: settings.autoAnnounceNextSong,
    },
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <aside className="live-config-preview" aria-label="Live configuration preview">
      <div className="config-preview-header">
        <div>
          <span className="eyebrow">Live preview</span>
          <h3>Settings as code</h3>
        </div>
        <button type="button" className="copy-config-button" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
      </div>
      <p className="config-preview-intro">
        This updates as you tune the server. Save changes to apply the profile to ISOBEL.
      </p>
      <div className="config-code-window">
        <div className="config-code-topbar">
          <span className="code-dot red" />
          <span className="code-dot amber" />
          <span className="code-dot green" />
          <span>isobel.settings.json</span>
          {isDirty && <span className="code-unsaved">unsaved</span>}
        </div>
        <pre className="config-code" aria-label="Current server configuration as JSON">
          <CodeLine><span className="code-punctuation">{'{'}</span></CodeLine>
          <CodeLine indent={1}><span className="code-key">"guild"</span><span className="code-punctuation">: </span><JsonValue value={guild.name} /><span className="code-punctuation">,</span></CodeLine>
          <CodeLine indent={1}><span className="code-key">"playback"</span><span className="code-punctuation">: {'{'}</span></CodeLine>
          <CodeLine indent={2}><span className="code-key">"volume"</span><span className="code-punctuation">: </span><JsonValue value={settings.defaultVolume} /><span className="code-punctuation">,</span></CodeLine>
          <CodeLine indent={2}><span className="code-key">"loop"</span><span className="code-punctuation">: </span><JsonValue value={loopMode} /><span className="code-punctuation">,</span></CodeLine>
          <CodeLine indent={2}><span className="code-key">"duckOnSpeech"</span><span className="code-punctuation">: </span><JsonValue value={settings.turnDownVolumeWhenPeopleSpeak} /><span className="code-punctuation">,</span></CodeLine>
          <CodeLine indent={2}><span className="code-key">"duckVolume"</span><span className="code-punctuation">: </span><JsonValue value={settings.turnDownVolumeWhenPeopleSpeakTarget} /></CodeLine>
          <CodeLine indent={1}><span className="code-punctuation">{'}'},</span></CodeLine>
          <CodeLine indent={1}><span className="code-key">"queue"</span><span className="code-punctuation">: {'{'}</span></CodeLine>
          <CodeLine indent={2}><span className="code-key">"playlistLimit"</span><span className="code-punctuation">: </span><JsonValue value={settings.playlistLimit} /><span className="code-punctuation">,</span></CodeLine>
          <CodeLine indent={2}><span className="code-key">"maxSize"</span><span className="code-punctuation">: </span><JsonValue value={config.queue.maxSize} /><span className="code-punctuation">,</span></CodeLine>
          <CodeLine indent={2}><span className="code-key">"announceNext"</span><span className="code-punctuation">: </span><JsonValue value={settings.autoAnnounceNextSong} /></CodeLine>
          <CodeLine indent={1}><span className="code-punctuation">{'}'}</span></CodeLine>
          <CodeLine><span className="code-punctuation">{'}'}</span></CodeLine>
        </pre>
      </div>
    </aside>
  );
}
