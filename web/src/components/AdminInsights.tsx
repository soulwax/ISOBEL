// File: web/src/components/AdminInsights.tsx

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../lib/api-paths';

type Section = 'overview' | 'servers' | 'users' | 'channels';

interface Overview {
  available: boolean;
  servers?: number;
  users?: number;
  channels?: number;
  plays?: number;
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
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (section !== 'overview') return;
    const controller = new AbortController();
    setError(null);
    getJson<Overview>('/admin/insights?section=overview', controller.signal)
      .then(setOverview)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Failed to load insights.');
      });
    return () => controller.abort();
  }, [section]);

  useEffect(() => {
    if (section === 'overview') return;
    const controller = new AbortController();
    const query = new URLSearchParams({ section, limit: '25' });
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
    return () => controller.abort();
  }, [section, search]);

  const loadMore = async () => {
    if (section === 'overview' || nextCursor === null || loadingMore) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ section, limit: '25', cursor: String(nextCursor) });
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
      setLoadingMore(false);
    }
  };

  const columns = section === 'servers'
    ? ['Server', 'Known members', 'Plays', 'Last active']
    : section === 'users'
      ? ['User', 'Plays', 'Actions', 'Last active']
      : ['Channel', 'Server', 'Type', 'Plays', 'Listeners', 'Top track'];

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

      {section === 'overview' ? (
        <>
          {overview?.available === false && (
            <div className="admin-card admin-unavailable"><p>Playback insights become available after the bot has created its history tables.</p></div>
          )}
          {overview?.available !== false && (
            <div className="admin-insight-stats">
              {[
                ['Servers', overview?.servers],
                ['Known users', overview?.users],
                ['Active channels', overview?.channels],
                ['Plays recorded', overview?.plays],
              ].map(([label, value]) => (
                <article className="admin-stat" key={String(label)}>
                  <div className="admin-stat-label">{label}</div>
                  <div className="admin-stat-value">{formatNumber(value)}</div>
                </article>
              ))}
            </div>
          )}
          <div className="admin-card admin-insight-note">
            <h3 className="admin-card-title">Incremental and privacy-aware</h3>
            <p>Lists load only when opened and return 25 rows at a time. Channel insights summarize music activity and channel IDs; message bodies are never collected.</p>
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
                      <td className="admin-nowrap">{formatDate(row.lastActiveAt)}</td>
                    </tr>;
                  }
                  if (section === 'users') {
                    return <tr key={key}>
                      <td><span className="admin-song">{rowString(row, 'name')}</span><br /><span className="admin-muted">{rowString(row, 'id')}</span></td>
                      <td>{formatNumber(row.plays)}</td>
                      <td>{formatNumber(row.actions)}</td>
                      <td className="admin-nowrap">{formatDate(row.lastActiveAt)}</td>
                    </tr>;
                  }
                  return <tr key={key}>
                    <td><span className="admin-song">{rowString(row, 'id')}</span></td>
                    <td>{rowString(row, 'guildName') || rowString(row, 'guildId')}<br /><span className="admin-muted">{rowString(row, 'guildId')}</span></td>
                    <td>{rowString(row, 'kind')}</td>
                    <td>{formatNumber(row.plays)}</td>
                    <td>{formatNumber(row.listeners)}</td>
                    <td>{rowString(row, 'topTrack') || '—'}</td>
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
