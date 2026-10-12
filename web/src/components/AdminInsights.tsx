// File: web/src/components/AdminInsights.tsx

import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../lib/api-paths';

type Section = 'overview' | 'servers' | 'users' | 'channels';

interface Overview {
  available: boolean;
  days?: number;
  servers?: number;
  activeServers?: number;
  knownUsers?: number;
  activeUsers?: number;
  activeChannels?: number;
  plays?: number;
  listenedSeconds?: number;
  skipped?: number;
  actions?: number;
}

interface InsightPage {
  available?: boolean;
  rows: Array<Record<string, unknown>>;
  total: number;
  nextCursor: number | null;
}

const SECTIONS: Array<{ id: Section; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'servers', label: 'Servers' },
  { id: 'users', label: 'Users' },
  { id: 'channels', label: 'Channels' },
];

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
  { days: 0, label: 'All time' },
] as const;

const numberFormat = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function formatNumber(value: unknown): string {
  return numberFormat.format(Number(value ?? 0));
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date);
}

function rowString(row: Record<string, unknown>, field: string): string {
  return typeof row[field] === 'string' ? row[field] as string : '';
}

function formatListeningTime(value: unknown): string {
  const seconds = Number(value ?? 0);
  if (seconds >= 3600) return `${numberFormat.format(seconds / 3600)} h`;
  return `${Math.round(seconds / 60)} min`;
}

function formatLoopMode(value: unknown): string {
  return ['Off', 'Track', 'Queue'][Number(value)] ?? '—';
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Please log in again.');
    if (response.status === 403) throw new Error('The admin section is for superusers only.');
    if (response.status === 429) throw new Error('Too many requests. Wait a moment and try again.');
    throw new Error('Failed to load admin insights.');
  }
  return await response.json() as T;
}

export default function AdminInsights() {
  const [section, setSection] = useState<Section>('overview');
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageController = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (section !== 'overview') return;
    const controller = new AbortController();
    setError(null);
    getJson<Overview>(`/admin/insights?section=overview&days=${days}`, controller.signal)
      .then(setOverview)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Failed to load insights.');
      });
    return () => controller.abort();
  }, [section, days]);

  useEffect(() => {
    if (section === 'overview') return;
    pageController.current?.abort();
    pageController.current = null;
    const controller = new AbortController();
    const query = new URLSearchParams({ section, limit: '25', days: String(days) });
    if (search) query.set('search', search);
    setLoading(true);
    setRows([]);
    setTotal(0);
    setNextCursor(null);
    setError(null);
    getJson<InsightPage>(`/admin/insights?${query}`, controller.signal)
      .then((page) => {
        setRows(page.rows);
        setTotal(page.total);
        setNextCursor(page.nextCursor);
        if (page.available === false) setError('Playback insights become available after the bot has created its history tables.');
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Failed to load insights.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      pageController.current?.abort();
    };
  }, [section, search, days]);

  const loadMore = async () => {
    if (section === 'overview' || nextCursor === null || loadingMore) return;
    pageController.current?.abort();
    const controller = new AbortController();
    pageController.current = controller;
    const query = new URLSearchParams({ section, limit: '25', cursor: String(nextCursor), days: String(days) });
    if (search) query.set('search', search);
    setLoadingMore(true);
    setError(null);
    try {
      const page = await getJson<InsightPage>(`/admin/insights?${query}`, controller.signal);
      setRows((current) => [...current, ...page.rows]);
      setNextCursor(page.nextCursor);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to load more insights.');
    } finally {
      if (pageController.current === controller) pageController.current = null;
      setLoadingMore(false);
    }
  };

  const columns = section === 'servers'
    ? ['Server', 'Members', 'Plays', 'Requesters', 'Listening time', 'Skips', 'Settings', 'Last active']
    : section === 'users'
      ? ['User', 'Plays', 'Listening time', 'Actions', 'Skips', 'Servers', 'Last active']
      : ['Channel', 'Server', 'Type', 'Plays', 'Requesters', 'Listening time', 'Skips', 'Top track', 'Last active'];

  return (
    <section aria-label="Server, user, and channel insights">
      <div className="admin-insights-tabs" role="tablist" aria-label="Insight sections">
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={section === item.id}
            className={section === item.id ? 'active' : ''}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="admin-insight-range" role="group" aria-label="Insight time range">
        {RANGES.map((range) => (
          <button key={range.days} type="button" className={days === range.days ? 'active' : ''} aria-pressed={days === range.days} onClick={() => setDays(range.days)}>
            {range.label}
          </button>
        ))}
      </div>

      {section === 'overview' ? (
        <>
          {overview === null && <div className="admin-card admin-empty">Loading overview…</div>}
          {overview?.available === false && (
            <div className="admin-card admin-unavailable"><p>Playback insights become available after the bot has created its history tables.</p></div>
          )}
          {overview && overview.available && (
            <div className="admin-insight-stats">
              {[
                ['Servers active / total', `${formatNumber(overview?.activeServers)} / ${formatNumber(overview?.servers)}`],
                ['Active / known users', `${formatNumber(overview?.activeUsers)} / ${formatNumber(overview?.knownUsers)}`],
                ['Channels with plays', overview?.activeChannels],
                ['Plays recorded', overview?.plays],
                ['Listening time', formatListeningTime(overview?.listenedSeconds)],
                ['Skip rate', `${overview?.plays ? Math.round((Number(overview.skipped ?? 0) / overview.plays) * 100) : 0}%`],
                ['Playback actions', overview?.actions],
              ].map(([label, value]) => (
                <article className="admin-stat" key={String(label)}>
                  <div className="admin-stat-label">{label}</div>
                  <div className="admin-stat-value">{typeof value === 'string' ? value : formatNumber(value)}</div>
                </article>
              ))}
            </div>
          )}
          <div className="admin-card admin-insight-note">
            <h3 className="admin-card-title">Incremental and privacy-aware</h3>
            <p>Activity cards and lists use the selected period. Server totals and known user totals are current database coverage; user membership counts reflect dashboard users seen in shared servers, not a full member scrape. Channel reports summarize recorded music activity and channel IDs; message bodies are never collected.</p>
          </div>
        </>
      ) : (
        <>
          <div className="admin-insight-toolbar">
            <p className="admin-muted">Showing {formatNumber(rows.length)} of {formatNumber(total)}</p>
            <input
              className="admin-search"
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={`Search ${section}…`}
              aria-label={`Search ${section}`}
            />
          </div>
          {error && <div className="admin-card admin-error" role="alert">{error}</div>}
          <div className="admin-card admin-table-wrap">
            <table className="admin-table">
              <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
              <tbody>
                {rows.map((row, index) => {
                  const key = `${row.id ?? row.guildId}:${row.kind ?? ''}:${index}`;
                  if (section === 'servers') {
                    return <tr key={key}>
                      <td><span className="admin-song">{rowString(row, 'name') || 'Unknown server'}</span><br /><span className="admin-muted">{rowString(row, 'id')}</span></td>
                      <td>{row.memberCount == null ? '—' : formatNumber(row.memberCount)} <span className="admin-muted">({formatNumber(row.knownMembers)} known)</span></td>
                      <td>{formatNumber(row.plays)}</td>
                      <td>{formatNumber(row.requesters)}</td>
                      <td>{formatListeningTime(row.listenedSeconds)}</td>
                      <td>{formatNumber(row.skips)}</td>
                      <td className="admin-muted">{row.playlistLimit == null ? '—' : `Playlist ${formatNumber(row.playlistLimit)} · queue ${row.maxQueueSize == null || Number(row.maxQueueSize) === 0 ? '∞' : formatNumber(row.maxQueueSize)} · volume ${formatNumber(row.defaultVolume)}% · loop ${formatLoopMode(row.defaultLoopMode)}`}</td>
                      <td className="nowrap">{formatDate(row.lastActiveAt)}</td>
                    </tr>;
                  }
                  if (section === 'users') {
                    return <tr key={key}>
                      <td><span className="admin-song">{rowString(row, 'name')}</span><br /><span className="admin-muted">{rowString(row, 'id')}</span></td>
                      <td>{formatNumber(row.plays)}</td>
                      <td>{formatListeningTime(row.listenedSeconds)}</td>
                      <td>{formatNumber(row.actions)}</td>
                      <td>{formatNumber(row.skips)}</td>
                      <td>{formatNumber(row.servers)}</td>
                      <td className="nowrap">{formatDate(row.lastActiveAt)}</td>
                    </tr>;
                  }
                  return <tr key={key}>
                    <td><span className="admin-song">{rowString(row, 'id')}</span></td>
                    <td>{rowString(row, 'guildName') || rowString(row, 'guildId')}<br /><span className="admin-muted">{rowString(row, 'guildId')}</span></td>
                    <td>{rowString(row, 'kind')}</td>
                    <td>{formatNumber(row.plays)}</td>
                    <td>{formatNumber(row.requesters)}</td>
                    <td>{formatListeningTime(row.listenedSeconds)}</td>
                    <td>{formatNumber(row.skips)}</td>
                    <td><span className="admin-song">{rowString(row, 'topTrack') || '—'}</span><br /><span className="admin-muted">{rowString(row, 'topArtist')}</span></td>
                    <td className="nowrap">{formatDate(row.lastActiveAt)}</td>
                  </tr>;
                })}
                {!loading && rows.length === 0 && <tr><td colSpan={columns.length} className="admin-empty">No insights found.</td></tr>}
              </tbody>
            </table>
            {loading && <p className="admin-empty">Loading {section}…</p>}
          </div>
          {nextCursor !== null && <button type="button" className="admin-load-more" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load 25 more'}
          </button>}
        </>
      )}
      {error && section === 'overview' && <div className="admin-card admin-error" role="alert">{error}</div>}
    </section>
  );
}
