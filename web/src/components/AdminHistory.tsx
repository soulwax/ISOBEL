// File: web/src/components/AdminHistory.tsx

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '../lib/api-paths';
import './GuildSettings.css';
import './AdminHistory.css';

interface AdminHistoryProps {
  onBack: () => void;
}

type HistoryAction = 'queue' | 'queue-next' | 'skip' | 'back' | 'stop';

interface HistorySummary {
  available: boolean;
  totals?: {
    plays: number;
    listenedSeconds: number;
    uniqueSongs: number;
    uniqueListeners: number;
    skipped: number;
    guilds: number;
  };
  topSongs?: Array<{ title: string; artist: string; plays: number; skipped: number; lastPlayedAt: string }>;
  topRequesters?: Array<{ userId: string; name: string | null; plays: number; listenedSeconds: number }>;
  topSkippers?: Array<{ userId: string; name: string | null; skips: number; lastSkipAt: string }>;
  guilds?: Array<{ guildId: string; name: string | null; plays: number; lastPlayedAt: string }>;
  daily?: Array<{ day: string; plays: number }>;
}

interface PlayRow {
  id: number;
  guildId: string;
  guildName: string | null;
  title: string;
  artist: string;
  album: string | null;
  source: string;
  lengthSeconds: number;
  isLive: boolean;
  playlistTitle: string | null;
  requestedBy: string;
  requestedByName: string | null;
  startedAt: string;
  endedAt: string | null;
  playedSeconds: number | null;
  endReason: string | null;
  endedBy: string | null;
  endedByName: string | null;
}

interface ActionRow {
  id: number;
  guildId: string;
  guildName: string | null;
  userId: string;
  userName: string | null;
  action: HistoryAction;
  songTitle: string | null;
  songArtist: string | null;
  detail: string | null;
  createdAt: string;
  songPlayId: number | null;
  playedSeconds: number | null;
  lengthSeconds: number | null;
  requestedBy: string | null;
  requestedByName: string | null;
}

interface UserFilter {
  id: string;
  name: string;
}

const RANGES = [
  { days: 1, label: '24h' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
  { days: 0, label: 'All time' },
] as const;

const ACTION_LABELS: Record<HistoryAction, string> = {
  queue: 'Queued',
  'queue-next': 'Queued next',
  skip: 'Skipped',
  back: 'Went back',
  stop: 'Stopped',
};

const END_REASON_LABELS: Record<string, string> = {
  finished: 'Finished',
  skipped: 'Skipped',
  back: 'Went back',
  stopped: 'Stopped',
  error: 'Error',
  disconnected: 'Disconnected',
};

const PAGE_SIZE = 50;

// ── formatting ────────────────────────────────────────────────

const numberFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const fullNumberFormat = new Intl.NumberFormat();
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dayFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

function formatCompact(value: number): string {
  return value < 10_000 ? fullNumberFormat.format(value) : numberFormat.format(value);
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mmss = `${minutes}:${secs.toString().padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss.padStart(5, '0')}` : mmss;
}

function formatListeningTime(seconds: number): string {
  const hours = seconds / 3600;
  if (hours >= 1) {
    return `${formatCompact(Math.round(hours * 10) / 10)} h`;
  }

  return `${Math.round(seconds / 60)} min`;
}

function formatRelative(iso: string): string {
  const diffSeconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSeconds);

  if (abs < 60) return relativeFormat.format(Math.round(diffSeconds), 'second');
  if (abs < 3600) return relativeFormat.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86_400) return relativeFormat.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 86_400 * 30) return relativeFormat.format(Math.round(diffSeconds / 86_400), 'day');
  return dateTimeFormat.format(new Date(iso));
}

function displayUser(id: string, name: string | null): string {
  return name ?? `User …${id.slice(-4)}`;
}

function displayGuild(id: string, name: string | null): string {
  return name ?? `Server …${id.slice(-4)}`;
}

// ── data ──────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }

  return search.toString();
}

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('Please log in again.');
    if (response.status === 403) throw new Error('The admin section is for superusers only.');
    if (response.status === 429) throw new Error('Too many requests. Wait a moment and try again.');
    throw new Error('Failed to load playback history.');
  }

  return await response.json() as T;
}

/** Fills missing days with zero and, past 90 days, folds them into weeks. */
function buildBuckets(daily: Array<{ day: string; plays: number }>, days: number) {
  const span = days > 0 ? days : 90;
  const byDay = new Map(daily.map((row) => [row.day, row.plays]));
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const points: Array<{ start: Date; plays: number }> = [];

  for (let offset = span - 1; offset >= 0; offset--) {
    const start = new Date(todayUtc - offset * 86_400_000);
    points.push({ start, plays: byDay.get(start.toISOString().slice(0, 10)) ?? 0 });
  }

  if (span <= 90) {
    return points.map((point) => ({ ...point, label: dayFormat.format(point.start) }));
  }

  const weeks: Array<{ start: Date; plays: number; label: string }> = [];
  for (let index = 0; index < points.length; index += 7) {
    const chunk = points.slice(index, index + 7);
    weeks.push({
      start: chunk[0].start,
      plays: chunk.reduce((sum, point) => sum + point.plays, 0),
      label: `Week of ${dayFormat.format(chunk[0].start)}`,
    });
  }

  return weeks;
}

// ── pieces ────────────────────────────────────────────────────

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="admin-stat">
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value}</div>
      {hint && <div className="admin-stat-hint">{hint}</div>}
    </div>
  );
}

function PlaysChart({ daily, days }: { daily: Array<{ day: string; plays: number }>; days: number }) {
  const buckets = useMemo(() => buildBuckets(daily, days), [daily, days]);
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...buckets.map((bucket) => bucket.plays));
  const unit = days > 90 ? 'week' : 'day';
  const title = days === 0 ? `Plays per ${unit}, last 90 days` : `Plays per ${unit}`;
  const hoveredBucket = hovered !== null ? buckets[hovered] : null;

  return (
    <section className="admin-card admin-chart-card" aria-labelledby="admin-chart-title">
      <h3 id="admin-chart-title" className="admin-card-title">{title}</h3>
      <div className="admin-chart">
        <div className="admin-chart-axis" aria-hidden="true">
          <span>{fullNumberFormat.format(max)}</span>
          <span>0</span>
        </div>
        <div className="admin-chart-plot" onMouseLeave={() => setHovered(null)}>
          <div className="admin-chart-gridline top" aria-hidden="true" />
          <div className="admin-chart-bars">
            {buckets.map((bucket, index) => (
              <div
                key={bucket.start.toISOString()}
                className={`admin-chart-slot${hovered === index ? ' hovered' : ''}`}
                onMouseEnter={() => setHovered(index)}
              >
                <div
                  className="admin-chart-bar"
                  style={{ height: bucket.plays > 0 ? `max(2px, ${(bucket.plays / max) * 100}%)` : 0 }}
                />
              </div>
            ))}
          </div>
          {hoveredBucket && hovered !== null && (
            <div
              className="admin-chart-tooltip"
              role="status"
              style={{ left: `${((hovered + 0.5) / buckets.length) * 100}%` }}
            >
              <span className="admin-chart-tooltip-label">{hoveredBucket.label}</span>
              <span className="admin-chart-tooltip-value">
                {fullNumberFormat.format(hoveredBucket.plays)} {hoveredBucket.plays === 1 ? 'play' : 'plays'}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="admin-chart-range" aria-hidden="true">
        <span>{buckets[0]?.label}</span>
        <span>{buckets[buckets.length - 1]?.label}</span>
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {buckets.filter((bucket) => bucket.plays > 0).map((bucket) => (
            <tr key={bucket.start.toISOString()}>
              <th scope="row">{bucket.label}</th>
              <td>{bucket.plays}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function UserButton({ id, name, onSelect }: { id: string; name: string | null; onSelect: (user: UserFilter) => void }) {
  const label = displayUser(id, name);
  return (
    <button
      type="button"
      className="admin-link"
      title={`Show history for ${label} (${id})`}
      onClick={() => onSelect({ id, name: label })}
    >
      {label}
    </button>
  );
}

function RankList<T>({
  title,
  rows,
  empty,
  render,
}: {
  title: string;
  rows: T[];
  empty: string;
  render: (row: T) => { key: string; primary: ReactNode; secondary?: ReactNode; value: string };
}) {
  return (
    <section className="admin-card">
      <h3 className="admin-card-title">{title}</h3>
      {rows.length === 0 ? (
        <p className="admin-empty">{empty}</p>
      ) : (
        <ol className="admin-rank">
          {rows.map((row, index) => {
            const item = render(row);
            return (
              <li key={item.key} className="admin-rank-row">
                <span className="admin-rank-index">{index + 1}</span>
                <span className="admin-rank-main">
                  <span className="admin-rank-primary">{item.primary}</span>
                  {item.secondary && <span className="admin-rank-secondary">{item.secondary}</span>}
                </span>
                <span className="admin-rank-value">{item.value}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Timestamp({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} title={dateTimeFormat.format(new Date(iso))}>
      {formatRelative(iso)}
    </time>
  );
}

// ── main ──────────────────────────────────────────────────────

export default function AdminHistory({ onBack }: AdminHistoryProps) {
  const [days, setDays] = useState<number>(30);
  const [guildId, setGuildId] = useState('');
  const [user, setUser] = useState<UserFilter | null>(null);
  const [tab, setTab] = useState<'plays' | 'actions'>('plays');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<HistoryAction | ''>('');

  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [plays, setPlays] = useState<PlayRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  // Shared by the first page and "Load more", so a filter change also cancels
  // a pending next page instead of letting it append to the new results.
  const listController = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryError(null);

    fetchJson<HistorySummary>(`/admin/history/summary?${buildQuery({ days, guildId, userId: user?.id })}`, controller.signal)
      .then(setSummary)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSummaryError(error instanceof Error ? error.message : 'Failed to load summary.');
        }
      });

    return () => controller.abort();
  }, [days, guildId, user]);

  const loadList = async (cursor: number | null, signal: AbortSignal) => {
    setListLoading(true);
    setListError(null);

    try {
      if (tab === 'plays') {
        const data = await fetchJson<{ plays: PlayRow[]; nextCursor: number | null }>(
          `/admin/history/plays?${buildQuery({ days, guildId, userId: user?.id, search, before: cursor, limit: PAGE_SIZE })}`,
          signal,
        );
        setPlays((current) => cursor ? [...current, ...data.plays] : data.plays);
        setNextCursor(data.nextCursor);
      } else {
        const data = await fetchJson<{ actions: ActionRow[]; nextCursor: number | null }>(
          `/admin/history/actions?${buildQuery({ days, guildId, userId: user?.id, action: actionFilter, before: cursor, limit: PAGE_SIZE })}`,
          signal,
        );
        setActions((current) => cursor ? [...current, ...data.actions] : data.actions);
        setNextCursor(data.nextCursor);
      }
    } catch (error: unknown) {
      if (!signal.aborted) {
        setListError(error instanceof Error ? error.message : 'Failed to load history.');
      }
    } finally {
      if (!signal.aborted) {
        setListLoading(false);
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    listController.current = controller;
    void loadList(null, controller.signal);
    return () => controller.abort();
    // loadList reads exactly these values; listing it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, days, guildId, user, search, actionFilter]);

  const selectUser = (selected: UserFilter) => {
    setUser(selected);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totals = summary?.totals;
  const skipRate = totals && totals.plays > 0 ? Math.round((totals.skipped / totals.plays) * 100) : 0;
  const guildOptions = summary?.guilds ?? [];
  const selectedGuildName = guildOptions.find((guild) => guild.guildId === guildId);

  return (
    <div className="admin-history">
      <header className="admin-header">
        <button type="button" className="back-button" onClick={onBack}>← Back</button>
        <div>
          <span className="admin-eyebrow">Super admin</span>
          <h2 className="admin-title">Playback history</h2>
          <p className="admin-subtitle">
            What played where, who asked for it, and who skipped it — across every server ISOBEL is in.
          </p>
        </div>
      </header>

      <div className="admin-filters" role="group" aria-label="History filters">
        <div className="admin-segmented" role="radiogroup" aria-label="Time range">
          {RANGES.map((range) => (
            <button
              key={range.days}
              type="button"
              role="radio"
              aria-checked={days === range.days}
              className={days === range.days ? 'active' : ''}
              onClick={() => setDays(range.days)}
            >
              {range.label}
            </button>
          ))}
        </div>

        <label className="admin-select-label">
          <span className="sr-only">Server</span>
          <select className="setting-select" value={guildId} onChange={(event) => setGuildId(event.target.value)}>
            <option value="">All servers</option>
            {guildOptions.map((guild) => (
              <option key={guild.guildId} value={guild.guildId}>
                {displayGuild(guild.guildId, guild.name)} ({fullNumberFormat.format(guild.plays)})
              </option>
            ))}
          </select>
        </label>

        {user && (
          <span className="admin-chip">
            User: {user.name}
            <button type="button" aria-label={`Clear user filter ${user.name}`} onClick={() => setUser(null)}>×</button>
          </span>
        )}
      </div>

      {summaryError && <div className="settings-message error">{summaryError}</div>}

      {summary && !summary.available ? (
        <div className="admin-card admin-unavailable">
          <h3 className="admin-card-title">No history yet</h3>
          <p>
            The history tables don't exist yet. They are created by the bot's database migration —
            restart the bot with <code>pnpm start</code> (or run <code>pnpm prisma:migrate:deploy</code>),
            then play something.
          </p>
        </div>
      ) : (
        <>
          <div className="admin-stats" aria-busy={!summary}>
            <StatTile label="Plays" value={totals ? formatCompact(totals.plays) : '–'} />
            <StatTile label="Listening time" value={totals ? formatListeningTime(totals.listenedSeconds) : '–'} />
            <StatTile label="Unique songs" value={totals ? formatCompact(totals.uniqueSongs) : '–'} />
            <StatTile label="Requesters" value={totals ? formatCompact(totals.uniqueListeners) : '–'} />
            <StatTile
              label="Skipped"
              value={totals ? formatCompact(totals.skipped) : '–'}
              hint={totals && totals.plays > 0 ? `${skipRate}% of plays` : undefined}
            />
            <StatTile
              label="Servers"
              value={totals ? formatCompact(totals.guilds) : '–'}
              hint={selectedGuildName ? displayGuild(selectedGuildName.guildId, selectedGuildName.name) : undefined}
            />
          </div>

          {summary?.daily && days !== 1 && <PlaysChart daily={summary.daily} days={days} />}

          <div className="admin-rank-grid">
            <RankList
              title="Most played"
              rows={summary?.topSongs ?? []}
              empty="Nothing played in this range."
              render={(song) => ({
                key: `${song.title}-${song.artist}`,
                primary: song.title,
                secondary: `${song.artist}${song.skipped > 0 ? ` · skipped ${song.skipped}×` : ''}`,
                value: fullNumberFormat.format(song.plays),
              })}
            />
            <RankList
              title="Top requesters"
              rows={summary?.topRequesters ?? []}
              empty="No requests in this range."
              render={(row) => ({
                key: row.userId,
                primary: <UserButton id={row.userId} name={row.name} onSelect={selectUser} />,
                secondary: `${formatListeningTime(row.listenedSeconds)} listened`,
                value: fullNumberFormat.format(row.plays),
              })}
            />
            <RankList
              title="Most skips"
              rows={summary?.topSkippers ?? []}
              empty="Nobody skipped anything."
              render={(row) => ({
                key: row.userId,
                primary: <UserButton id={row.userId} name={row.name} onSelect={selectUser} />,
                secondary: <>last <Timestamp iso={row.lastSkipAt} /></>,
                value: fullNumberFormat.format(row.skips),
              })}
            />
          </div>

          <section className="admin-card admin-log">
            <div className="admin-log-header">
              <div className="admin-tabs" role="tablist" aria-label="History log">
                <button type="button" role="tab" aria-selected={tab === 'plays'} className={tab === 'plays' ? 'active' : ''} onClick={() => setTab('plays')}>
                  Songs played
                </button>
                <button type="button" role="tab" aria-selected={tab === 'actions'} className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}>
                  Who did what
                </button>
              </div>
              {tab === 'plays' ? (
                <input
                  type="search"
                  className="admin-search"
                  placeholder="Search title or artist"
                  aria-label="Search title or artist"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              ) : (
                <select
                  className="setting-select"
                  aria-label="Action type"
                  value={actionFilter}
                  onChange={(event) => setActionFilter(event.target.value as HistoryAction | '')}
                >
                  <option value="">All actions</option>
                  {(Object.keys(ACTION_LABELS) as HistoryAction[]).map((action) => (
                    <option key={action} value={action}>{ACTION_LABELS[action]}</option>
                  ))}
                </select>
              )}
            </div>

            {listError && <div className="settings-message error">{listError}</div>}

            <div className="admin-table-wrap">
              {tab === 'plays' ? (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Server</th>
                      <th scope="col">Song</th>
                      <th scope="col">Requested by</th>
                      <th scope="col" className="numeric">Played</th>
                      <th scope="col">Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plays.map((play) => (
                      <tr key={play.id}>
                        <td className="nowrap"><Timestamp iso={play.startedAt} /></td>
                        <td>
                          <button type="button" className="admin-link" onClick={() => setGuildId(play.guildId)}>
                            {displayGuild(play.guildId, play.guildName)}
                          </button>
                        </td>
                        <td>
                          <div className="admin-song">{play.title}</div>
                          <div className="admin-muted">
                            {play.artist}
                            {play.playlistTitle && ` · from ${play.playlistTitle}`}
                          </div>
                        </td>
                        <td><UserButton id={play.requestedBy} name={play.requestedByName} onSelect={selectUser} /></td>
                        <td className="numeric nowrap">
                          {play.playedSeconds !== null ? formatClock(play.playedSeconds) : '–'}
                          {!play.isLive && play.lengthSeconds > 0 && (
                            <span className="admin-muted"> / {formatClock(play.lengthSeconds)}</span>
                          )}
                        </td>
                        <td>
                          {play.endedAt ? (
                            <>
                              <span className={`admin-badge reason-${play.endReason ?? 'unknown'}`}>
                                {END_REASON_LABELS[play.endReason ?? ''] ?? 'Ended'}
                              </span>
                              {play.endedBy && (
                                <span className="admin-muted"> by <UserButton id={play.endedBy} name={play.endedByName} onSelect={selectUser} /></span>
                              )}
                            </>
                          ) : (
                            <span className="admin-badge reason-open">No end recorded</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">When</th>
                      <th scope="col">Server</th>
                      <th scope="col">Who</th>
                      <th scope="col">Action</th>
                      <th scope="col">Song</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actions.map((action) => (
                      <tr key={action.id}>
                        <td className="nowrap"><Timestamp iso={action.createdAt} /></td>
                        <td>
                          <button type="button" className="admin-link" onClick={() => setGuildId(action.guildId)}>
                            {displayGuild(action.guildId, action.guildName)}
                          </button>
                        </td>
                        <td><UserButton id={action.userId} name={action.userName} onSelect={selectUser} /></td>
                        <td>
                          <span className={`admin-badge action-${action.action}`}>{ACTION_LABELS[action.action] ?? action.action}</span>
                        </td>
                        <td>
                          {action.songTitle ? (
                            <>
                              <div className="admin-song">{action.songTitle}</div>
                              <div className="admin-muted">
                                {action.songArtist}
                                {action.playedSeconds !== null && action.lengthSeconds
                                  ? ` · after ${formatClock(action.playedSeconds)} of ${formatClock(action.lengthSeconds)}`
                                  : ''}
                                {action.requestedBy && action.requestedBy !== action.userId && (
                                  <> · requested by <UserButton id={action.requestedBy} name={action.requestedByName} onSelect={selectUser} /></>
                                )}
                                {action.detail && ` · ${action.detail}`}
                              </div>
                            </>
                          ) : (
                            <span className="admin-muted">{action.detail ?? '–'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {!listLoading && !listError && (tab === 'plays' ? plays : actions).length === 0 && (
                <p className="admin-empty">Nothing recorded for these filters.</p>
              )}
            </div>

            <div className="admin-log-footer">
              {listLoading ? (
                <span className="admin-muted">Loading…</span>
              ) : nextCursor !== null && (
                <button
                  type="button"
                  className="back-button"
                  onClick={() => {
                    if (listController.current) {
                      void loadList(nextCursor, listController.current.signal);
                    }
                  }}
                >
                  Load more
                </button>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
