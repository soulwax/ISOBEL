// File: web/src/server/admin-history.ts

// Read side of the bot's playback history (SongPlay / PlaybackAction). Those
// tables belong to Prisma (root schema.prisma) and are deliberately not in the
// Drizzle schema, so drizzle-kit never tries to manage them; everything here
// is raw SQL.
//
// The bot stores TIMESTAMP(3) without a zone, holding UTC. Range filters
// compare against a UTC "now", and timestamps leave as ISO-8601 strings built
// in SQL (db.execute returns Postgres's own text format, e.g. "...+00", which
// not every browser's Date parses), so nothing depends on a server time zone.

import { type SQL, sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export const HISTORY_ACTIONS = ['queue', 'queue-next', 'skip', 'back', 'stop'] as const;
export type HistoryAction = typeof HISTORY_ACTIONS[number];

export interface HistoryFilters {
  /** 0 means all time. */
  days: number;
  guildId?: string;
  userId?: string;
}

let tablesExist = false;

/** False until the bot has run the migration that creates the tables. */
export async function isHistoryAvailable(): Promise<boolean> {
  if (tablesExist) {
    return true;
  }

  const rows = await db.execute<{ exists: boolean }>(sql`
    SELECT to_regclass('public."SongPlay"') IS NOT NULL
       AND to_regclass('public."PlaybackAction"') IS NOT NULL AS "exists"
  `);

  // Only cache the positive answer: the bot may migrate while we're running.
  tablesExist = rows[0]?.exists === true;
  return tablesExist;
}

function since(column: SQL, days: number): SQL {
  return days > 0
    ? sql`${column} >= (now() AT TIME ZONE 'UTC') - make_interval(days => ${days})`
    : sql`TRUE`;
}

function iso(column: SQL): SQL {
  return sql`to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function playFilters({ days, guildId, userId }: HistoryFilters): SQL {
  const conditions = [since(sql`p."startedAt"`, days)];

  if (guildId) {
    conditions.push(sql`p."guildId" = ${guildId}`);
  }

  if (userId) {
    conditions.push(sql`(p."requestedBy" = ${userId} OR p."endedBy" = ${userId})`);
  }

  return sql.join(conditions, sql` AND `);
}

function actionFilters({ days, guildId, userId }: HistoryFilters): SQL {
  const conditions = [since(sql`a."createdAt"`, days)];

  if (guildId) {
    conditions.push(sql`a."guildId" = ${guildId}`);
  }

  if (userId) {
    conditions.push(sql`a."userId" = ${userId}`);
  }

  return sql.join(conditions, sql` AND `);
}

// Guild names: the dashboard's discord_guild row (joined as g) is the freshest
// source; the snapshot on the history row covers servers the bot has left.
const GUILD_NAME = (alias: 'a' | 'p') => sql.raw(`COALESCE(g."name", ${alias}."guildName")`);

export async function getHistorySummary(filters: HistoryFilters) {
  const where = playFilters(filters);
  const actionWhere = actionFilters(filters);

  const [totalsRows, topSongs, topRequesters, topSkippers, guilds, daily] = await Promise.all([
    db.execute<{
      plays: number;
      listenedSeconds: number;
      uniqueSongs: number;
      uniqueListeners: number;
      skipped: number;
      guilds: number;
    }>(sql`
      SELECT
        count(*)::int AS "plays",
        coalesce(sum(p."playedSeconds"), 0)::int AS "listenedSeconds",
        count(DISTINCT p."url")::int AS "uniqueSongs",
        count(DISTINCT p."requestedBy")::int AS "uniqueListeners",
        count(*) FILTER (WHERE p."endReason" = 'skipped')::int AS "skipped",
        count(DISTINCT p."guildId")::int AS "guilds"
      FROM "SongPlay" p
      WHERE ${where}
    `),
    db.execute<{
      title: string;
      artist: string;
      plays: number;
      skipped: number;
      lastPlayedAt: string;
    }>(sql`
      SELECT
        p."title",
        p."artist",
        count(*)::int AS "plays",
        count(*) FILTER (WHERE p."endReason" = 'skipped')::int AS "skipped",
        ${iso(sql`max(p."startedAt")`)} AS "lastPlayedAt"
      FROM "SongPlay" p
      WHERE ${where}
      GROUP BY p."url", p."title", p."artist"
      ORDER BY "plays" DESC, "lastPlayedAt" DESC
      LIMIT 10
    `),
    db.execute<{
      userId: string;
      name: string | null;
      plays: number;
      listenedSeconds: number;
    }>(sql`
      SELECT
        p."requestedBy" AS "userId",
        (array_agg(p."requestedByName" ORDER BY p."startedAt" DESC)
          FILTER (WHERE p."requestedByName" IS NOT NULL))[1] AS "name",
        count(*)::int AS "plays",
        coalesce(sum(p."playedSeconds"), 0)::int AS "listenedSeconds"
      FROM "SongPlay" p
      WHERE ${where}
      GROUP BY p."requestedBy"
      ORDER BY "plays" DESC
      LIMIT 10
    `),
    db.execute<{
      userId: string;
      name: string | null;
      skips: number;
      lastSkipAt: string;
    }>(sql`
      SELECT
        a."userId",
        (array_agg(a."userName" ORDER BY a."createdAt" DESC)
          FILTER (WHERE a."userName" IS NOT NULL))[1] AS "name",
        count(*)::int AS "skips",
        ${iso(sql`max(a."createdAt")`)} AS "lastSkipAt"
      FROM "PlaybackAction" a
      WHERE a."action" = 'skip' AND ${actionWhere}
      GROUP BY a."userId"
      ORDER BY "skips" DESC
      LIMIT 10
    `),
    // Every guild that has history at all, independent of the filters, so the
    // guild picker never loses its options while a filter is applied.
    db.execute<{
      guildId: string;
      name: string | null;
      plays: number;
      lastPlayedAt: string;
    }>(sql`
      SELECT
        p."guildId",
        COALESCE(
          g."name",
          (array_agg(p."guildName" ORDER BY p."startedAt" DESC)
            FILTER (WHERE p."guildName" IS NOT NULL))[1]
        ) AS "name",
        count(*)::int AS "plays",
        ${iso(sql`max(p."startedAt")`)} AS "lastPlayedAt"
      FROM "SongPlay" p
      LEFT JOIN "discord_guild" g ON g."id" = p."guildId"
      GROUP BY p."guildId", g."name"
      ORDER BY "lastPlayedAt" DESC
    `),
    db.execute<{ day: string; plays: number }>(sql`
      SELECT
        to_char(date_trunc('day', p."startedAt"), 'YYYY-MM-DD') AS "day",
        count(*)::int AS "plays"
      FROM "SongPlay" p
      WHERE ${playFilters({ ...filters, days: filters.days > 0 ? filters.days : 90 })}
      GROUP BY 1
      ORDER BY 1
    `),
  ]);

  return {
    totals: totalsRows[0] ?? {
      plays: 0,
      listenedSeconds: 0,
      uniqueSongs: 0,
      uniqueListeners: 0,
      skipped: 0,
      guilds: 0,
    },
    topSongs: [...topSongs],
    topRequesters: [...topRequesters],
    topSkippers: [...topSkippers],
    guilds: [...guilds],
    daily: [...daily],
  };
}

export async function getPlayHistory(
  filters: HistoryFilters & { search?: string; before?: number; limit: number },
) {
  const conditions = [playFilters(filters)];

  if (filters.search) {
    const pattern = `%${escapeLike(filters.search)}%`;
    conditions.push(sql`(p."title" ILIKE ${pattern} OR p."artist" ILIKE ${pattern})`);
  }

  if (filters.before) {
    conditions.push(sql`p."id" < ${filters.before}`);
  }

  const rows = await db.execute<{
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
  }>(sql`
    SELECT
      p."id",
      p."guildId",
      ${GUILD_NAME('p')} AS "guildName",
      p."title",
      p."artist",
      p."album",
      p."source",
      p."lengthSeconds",
      p."isLive",
      p."playlistTitle",
      p."requestedBy",
      p."requestedByName",
      ${iso(sql`p."startedAt"`)} AS "startedAt",
      ${iso(sql`p."endedAt"`)} AS "endedAt",
      p."playedSeconds",
      p."endReason",
      p."endedBy",
      p."endedByName"
    FROM "SongPlay" p
    LEFT JOIN "discord_guild" g ON g."id" = p."guildId"
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY p."id" DESC
    LIMIT ${filters.limit + 1}
  `);

  const hasMore = rows.length > filters.limit;
  const plays = rows.slice(0, filters.limit);

  return {
    plays,
    nextCursor: hasMore ? plays[plays.length - 1]?.id ?? null : null,
  };
}

export async function getActionHistory(
  filters: HistoryFilters & { action?: HistoryAction; before?: number; limit: number },
) {
  const conditions = [actionFilters(filters)];

  if (filters.action) {
    conditions.push(sql`a."action" = ${filters.action}`);
  }

  if (filters.before) {
    conditions.push(sql`a."id" < ${filters.before}`);
  }

  const rows = await db.execute<{
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
  }>(sql`
    SELECT
      a."id",
      a."guildId",
      ${GUILD_NAME('a')} AS "guildName",
      a."userId",
      a."userName",
      a."action",
      a."songTitle",
      a."songArtist",
      a."detail",
      ${iso(sql`a."createdAt"`)} AS "createdAt",
      a."songPlayId",
      p."playedSeconds",
      p."lengthSeconds",
      p."requestedBy",
      p."requestedByName"
    FROM "PlaybackAction" a
    LEFT JOIN "SongPlay" p ON p."id" = a."songPlayId"
    LEFT JOIN "discord_guild" g ON g."id" = a."guildId"
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY a."id" DESC
    LIMIT ${filters.limit + 1}
  `);

  const hasMore = rows.length > filters.limit;
  const actions = rows.slice(0, filters.limit);

  return {
    actions,
    nextCursor: hasMore ? actions[actions.length - 1]?.id ?? null : null,
  };
}
