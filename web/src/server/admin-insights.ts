// File: web/src/server/admin-insights.ts

import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';

export type InsightSection = 'overview' | 'servers' | 'users' | 'channels';

export interface InsightPage {
  rows: Array<Record<string, unknown>>;
  nextCursor: number | null;
  total: number;
}

function searchPattern(search: string | undefined): string | null {
  const value = search?.trim().slice(0, 80);
  return value ? `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%` : null;
}

function withinRange(column: SQL, days: number): SQL {
  return days === 0
    ? sql`TRUE`
    : sql`${column} >= (now() AT TIME ZONE 'UTC') - make_interval(days => ${days})`;
}

export async function getInsightOverview(days: number) {
  const playRange = withinRange(sql`p."startedAt"`, days);
  const actionRange = withinRange(sql`a."createdAt"`, days);
  const rows = await db.execute<{
    servers: number;
    activeServers: number;
    knownUsers: number;
    activeUsers: number;
    activeChannels: number;
    plays: number;
    listenedSeconds: number;
    skipped: number;
    actions: number;
  }>(sql`
    WITH active_users AS (
      SELECT p."requestedBy" AS id FROM "SongPlay" p WHERE ${playRange}
      UNION
      SELECT a."userId" FROM "PlaybackAction" a WHERE ${actionRange}
    ), active_channels AS (
      SELECT p."guildId", p."voiceChannelId" AS id FROM "SongPlay" p
      WHERE ${playRange} AND p."voiceChannelId" IS NOT NULL
      UNION
      SELECT p."guildId", p."textChannelId" AS id FROM "SongPlay" p
      WHERE ${playRange} AND p."textChannelId" IS NOT NULL
    )
    SELECT
      (SELECT count(*)::int FROM "discord_guild" WHERE "joinedAt" IS NOT NULL AND "deletedAt" IS NULL) AS servers,
      (SELECT count(DISTINCT p."guildId")::int
        FROM "SongPlay" p JOIN "discord_guild" g ON g."id" = p."guildId"
        WHERE ${playRange} AND g."joinedAt" IS NOT NULL AND g."deletedAt" IS NULL) AS "activeServers",
      (SELECT count(*)::int FROM "discord_user") AS "knownUsers",
      (SELECT count(*)::int FROM active_users) AS "activeUsers",
      (SELECT count(*)::int FROM active_channels) AS "activeChannels",
      (SELECT count(*)::int FROM "SongPlay" p WHERE ${playRange}) AS plays,
      (SELECT coalesce(sum(p."playedSeconds"), 0)::int FROM "SongPlay" p WHERE ${playRange}) AS "listenedSeconds",
      (SELECT count(*)::int FROM "SongPlay" p WHERE ${playRange} AND p."endReason" = 'skipped') AS skipped,
      (SELECT count(*)::int FROM "PlaybackAction" a WHERE ${actionRange}) AS actions
  `);

  return rows[0] ?? {
    servers: 0, activeServers: 0, knownUsers: 0, activeUsers: 0,
    activeChannels: 0, plays: 0, listenedSeconds: 0, skipped: 0, actions: 0,
  };
}

export async function getInsightPage(options: {
  section: Exclude<InsightSection, 'overview'>;
  cursor: number;
  limit: number;
  days: number;
  search?: string;
}): Promise<InsightPage> {
  const { section, cursor, limit, days } = options;
  const pattern = searchPattern(options.search);
  const offset = Math.max(0, cursor);
  const playRange = withinRange(sql`p."startedAt"`, days);
  const actionRange = withinRange(sql`a."createdAt"`, days);

  if (section === 'servers') {
    const result = await db.execute<Record<string, unknown> & { total: number; nextCursor: number | null }>(sql`
      WITH period_plays AS (
        SELECT p."guildId", count(*)::int AS plays,
          count(DISTINCT p."requestedBy")::int AS requesters,
          count(*) FILTER (WHERE p."endReason" = 'skipped')::int AS skips,
          coalesce(sum(p."playedSeconds"), 0)::int AS "listenedSeconds"
        FROM "SongPlay" p WHERE ${playRange} GROUP BY p."guildId"
      ), all_time AS (
        SELECT p."guildId", max(p."startedAt") AS "lastActiveAt"
        FROM "SongPlay" p GROUP BY p."guildId"
      ), member_counts AS (
        SELECT "guildId", count(DISTINCT "userId")::int AS "knownMembers"
        FROM "guild_member" GROUP BY "guildId"
      ), scoped AS (
        SELECT g."id", g."name", g."icon", g."approximateMemberCount" AS "memberCount",
          COALESCE(p.plays, 0)::int AS plays, COALESCE(p.requesters, 0)::int AS requesters,
          COALESCE(p.skips, 0)::int AS skips, COALESCE(p."listenedSeconds", 0)::int AS "listenedSeconds",
          COALESCE(m."knownMembers", 0)::int AS "knownMembers", a."lastActiveAt",
          s."playlistLimit", s."maxQueueSize", s."defaultVolume", s."defaultLoopMode"
        FROM "discord_guild" g
        LEFT JOIN period_plays p ON p."guildId" = g."id"
        LEFT JOIN all_time a ON a."guildId" = g."id"
        LEFT JOIN member_counts m ON m."guildId" = g."id"
        LEFT JOIN "setting" s ON s."guildId" = g."id"
        WHERE g."joinedAt" IS NOT NULL AND g."deletedAt" IS NULL
          AND (${pattern}::text IS NULL OR g."name" ILIKE ${pattern} ESCAPE E'\\\\' OR g."id" ILIKE ${pattern} ESCAPE E'\\\\')
      ), counted AS (SELECT count(*)::int AS total FROM scoped)
      SELECT scoped.*, counted.total,
        CASE WHEN ${offset + limit} < counted.total THEN ${offset + limit} ELSE NULL END AS "nextCursor"
      FROM scoped CROSS JOIN counted
      ORDER BY plays DESC, "memberCount" DESC NULLS LAST, name ASC
      LIMIT ${limit} OFFSET ${offset}
    `);
    return page(result, offset, limit);
  }

  if (section === 'users') {
    const result = await db.execute<Record<string, unknown> & { total: number; nextCursor: number | null }>(sql`
      WITH player_activity AS (
        SELECT p."requestedBy" AS id, count(*)::int AS plays,
          coalesce(sum(p."playedSeconds"), 0)::int AS "listenedSeconds",
          (array_agg(p."requestedByName" ORDER BY p."startedAt" DESC)
            FILTER (WHERE p."requestedByName" IS NOT NULL))[1] AS "snapshotName",
          max(p."startedAt") AS "lastPlayedAt"
        FROM "SongPlay" p WHERE ${playRange} GROUP BY p."requestedBy"
      ), action_activity AS (
        SELECT a."userId" AS id, count(*)::int AS actions,
          count(*) FILTER (WHERE a.action = 'skip')::int AS skips,
          (array_agg(a."userName" ORDER BY a."createdAt" DESC)
            FILTER (WHERE a."userName" IS NOT NULL))[1] AS "snapshotName",
          max(a."createdAt") AS "lastActionAt"
        FROM "PlaybackAction" a WHERE ${actionRange} GROUP BY a."userId"
      ), user_servers AS (
        SELECT p."requestedBy" AS id, p."guildId" FROM "SongPlay" p WHERE ${playRange}
        UNION
        SELECT a."userId" AS id, a."guildId" FROM "PlaybackAction" a WHERE ${actionRange}
      ), server_counts AS (
        SELECT id, count(*)::int AS servers FROM user_servers GROUP BY id
      ), ids AS (
        SELECT id FROM player_activity UNION SELECT id FROM action_activity
      ), scoped AS (
        SELECT ids.id, COALESCE(du."globalName", du."username", p."snapshotName", a."snapshotName", 'Unknown user') AS name,
          COALESCE(p.plays, 0)::int AS plays, COALESCE(p."listenedSeconds", 0)::int AS "listenedSeconds",
          COALESCE(a.actions, 0)::int AS actions, COALESCE(a.skips, 0)::int AS skips,
          COALESCE(sc.servers, 0)::int AS servers,
          GREATEST(p."lastPlayedAt", a."lastActionAt") AS "lastActiveAt"
        FROM ids
        LEFT JOIN player_activity p ON p.id = ids.id
        LEFT JOIN action_activity a ON a.id = ids.id
        LEFT JOIN server_counts sc ON sc.id = ids.id
        LEFT JOIN "discord_user" du ON du.id = ids.id
        WHERE (${pattern}::text IS NULL OR COALESCE(du."globalName", du."username", p."snapshotName", a."snapshotName", '') ILIKE ${pattern} ESCAPE E'\\\\'
          OR ids.id ILIKE ${pattern} ESCAPE E'\\\\')
      ), counted AS (SELECT count(*)::int AS total FROM scoped)
      SELECT scoped.*, counted.total,
        CASE WHEN ${offset + limit} < counted.total THEN ${offset + limit} ELSE NULL END AS "nextCursor"
      FROM scoped CROSS JOIN counted
      ORDER BY (plays + actions) DESC, "lastActiveAt" DESC NULLS LAST, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `);
    return page(result, offset, limit);
  }

  const result = await db.execute<Record<string, unknown> & { total: number; nextCursor: number | null }>(sql`
    WITH channel_events AS (
      SELECT p.* FROM "SongPlay" p WHERE ${playRange}
    ), channel_activity AS (
      SELECT p."guildId", p."voiceChannelId" AS id, 'voice'::text AS kind,
        count(*)::int AS plays, count(DISTINCT p."requestedBy")::int AS requesters,
        count(*) FILTER (WHERE p."endReason" = 'skipped')::int AS skips,
        coalesce(sum(p."playedSeconds"), 0)::int AS "listenedSeconds",
        max(p."startedAt") AS "lastActiveAt"
      FROM channel_events p WHERE p."voiceChannelId" IS NOT NULL
      GROUP BY p."guildId", p."voiceChannelId"
      UNION ALL
      SELECT p."guildId", p."textChannelId" AS id, 'text'::text AS kind,
        count(*)::int AS plays, count(DISTINCT p."requestedBy")::int AS requesters,
        count(*) FILTER (WHERE p."endReason" = 'skipped')::int AS skips,
        coalesce(sum(p."playedSeconds"), 0)::int AS "listenedSeconds",
        max(p."startedAt") AS "lastActiveAt"
      FROM channel_events p WHERE p."textChannelId" IS NOT NULL
      GROUP BY p."guildId", p."textChannelId"
    ), scoped AS (
      SELECT c.*, g.name AS "guildName",
        top.title AS "topTrack", top.artist AS "topArtist"
      FROM channel_activity c LEFT JOIN "discord_guild" g ON g.id = c."guildId"
      LEFT JOIN LATERAL (
        SELECT p.title, p.artist FROM "SongPlay" p
        WHERE p."guildId" = c."guildId"
          AND CASE WHEN c.kind = 'voice' THEN p."voiceChannelId" ELSE p."textChannelId" END = c.id
          AND ${playRange}
        GROUP BY p.title, p.artist ORDER BY count(*) DESC, max(p."startedAt") DESC LIMIT 1
      ) top ON TRUE
      WHERE (${pattern}::text IS NULL OR c.id ILIKE ${pattern} ESCAPE E'\\\\'
        OR COALESCE(g.name, '') ILIKE ${pattern} ESCAPE E'\\\\')
    ), counted AS (SELECT count(*)::int AS total FROM scoped)
    SELECT scoped.*, counted.total,
      CASE WHEN ${offset + limit} < counted.total THEN ${offset + limit} ELSE NULL END AS "nextCursor"
    FROM scoped CROSS JOIN counted
    ORDER BY plays DESC, "lastActiveAt" DESC, "guildName" ASC NULLS LAST
    LIMIT ${limit} OFFSET ${offset}
  `);
  return page(result, offset, limit);
}

function page(
  rows: Array<Record<string, unknown> & { total: number; nextCursor: number | null }>,
  offset: number,
  limit: number,
): InsightPage {
  const total = Number(rows[0]?.total ?? 0);
  return {
    rows: rows.map(({ total: _total, nextCursor: _nextCursor, ...row }) => row),
    total,
    nextCursor: offset + rows.length < total && rows.length === limit ? offset + rows.length : null,
  };
}
