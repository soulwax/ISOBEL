// File: web/src/server/admin-insights.ts

import { sql } from 'drizzle-orm';
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

export async function getInsightOverview() {
  const rows = await db.execute<{
    servers: number;
    users: number;
    channels: number;
    plays: number;
  }>(sql`
    WITH users AS (
      SELECT id FROM "discord_user"
      UNION
      SELECT "requestedBy" FROM "SongPlay"
      UNION
      SELECT "userId" FROM "PlaybackAction"
    ), channels AS (
      SELECT "guildId", "voiceChannelId" AS id FROM "SongPlay" WHERE "voiceChannelId" IS NOT NULL
      UNION
      SELECT "guildId", "textChannelId" AS id FROM "SongPlay" WHERE "textChannelId" IS NOT NULL
    )
    SELECT
      (SELECT count(*)::int FROM "discord_guild" WHERE "joinedAt" IS NOT NULL AND "deletedAt" IS NULL) AS servers,
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM channels) AS channels,
      (SELECT count(*)::int FROM "SongPlay") AS plays
  `);

  return rows[0] ?? { servers: 0, users: 0, channels: 0, plays: 0 };
}

export async function getInsightPage(options: {
  section: Exclude<InsightSection, 'overview'>;
  cursor: number;
  limit: number;
  search?: string;
}): Promise<InsightPage> {
  const { section, cursor, limit } = options;
  const pattern = searchPattern(options.search);
  const offset = Math.max(0, cursor);

  if (section === 'servers') {
    const result = await db.execute<Record<string, unknown> & { total: number; nextCursor: number | null }>(sql`
      WITH scoped AS (
        SELECT g."id", g."name", g."icon", g."approximateMemberCount" AS "memberCount",
          COALESCE(p.plays, 0)::int AS plays,
          COALESCE(m."knownMembers", 0)::int AS "knownMembers",
          p."lastActiveAt"
        FROM "discord_guild" g
        LEFT JOIN (
          SELECT "guildId", count(*)::int AS plays, max("startedAt") AS "lastActiveAt"
          FROM "SongPlay" GROUP BY "guildId"
        ) p ON p."guildId" = g."id"
        LEFT JOIN (
          SELECT "guildId", count(DISTINCT "userId")::int AS "knownMembers"
          FROM "guild_member" GROUP BY "guildId"
        ) m ON m."guildId" = g."id"
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
      WITH activity AS (
        SELECT "requestedBy" AS id, max("requestedByName") AS snapshot_name, count(*)::int AS plays, 0::int AS actions,
          max("startedAt") AS "lastActiveAt"
        FROM "SongPlay" GROUP BY "requestedBy"
        UNION ALL
        SELECT "endedBy" AS id, max("endedByName") AS snapshot_name, 0::int AS plays, count(*)::int AS actions,
          max("endedAt") AS "lastActiveAt"
        FROM "SongPlay" WHERE "endedBy" IS NOT NULL GROUP BY "endedBy"
        UNION ALL
        SELECT "userId" AS id, max("userName") AS snapshot_name, 0::int AS plays, count(*)::int AS actions,
          max("createdAt") AS "lastActiveAt"
        FROM "PlaybackAction" GROUP BY "userId"
      ), aggregated AS (
        SELECT id, sum(plays)::int AS plays, sum(actions)::int AS actions, max("lastActiveAt") AS "lastActiveAt",
          (array_agg(snapshot_name ORDER BY "lastActiveAt" DESC) FILTER (WHERE snapshot_name IS NOT NULL))[1] AS "snapshotName"
        FROM activity GROUP BY id
      ), scoped AS (
        SELECT a.id, COALESCE(du."globalName", du."username", a."snapshotName", 'Unknown user') AS name,
          a.plays, a.actions, a."lastActiveAt"
        FROM aggregated a LEFT JOIN "discord_user" du ON du.id = a.id
        WHERE (${pattern}::text IS NULL OR COALESCE(du."globalName", du."username", a."snapshotName", '') ILIKE ${pattern} ESCAPE E'\\\\'
          OR a.id ILIKE ${pattern} ESCAPE E'\\\\')
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
    WITH channel_activity AS (
      SELECT p."guildId", p."voiceChannelId" AS id, 'voice'::text AS kind, count(*)::int AS plays,
        count(DISTINCT p."requestedBy")::int AS listeners, max(p."startedAt") AS "lastActiveAt"
      FROM "SongPlay" p WHERE p."voiceChannelId" IS NOT NULL
      GROUP BY p."guildId", p."voiceChannelId"
      UNION ALL
      SELECT p."guildId", p."textChannelId" AS id, 'text'::text AS kind, count(*)::int AS plays,
        count(DISTINCT p."requestedBy")::int AS listeners, max(p."startedAt") AS "lastActiveAt"
      FROM "SongPlay" p WHERE p."textChannelId" IS NOT NULL
      GROUP BY p."guildId", p."textChannelId"
    ), scoped AS (
      SELECT c.*, g.name AS "guildName",
        (SELECT p.title FROM "SongPlay" p WHERE p."guildId" = c."guildId"
          AND CASE WHEN c.kind = 'voice' THEN p."voiceChannelId" ELSE p."textChannelId" END = c.id
          GROUP BY p.title ORDER BY count(*) DESC, max(p."startedAt") DESC LIMIT 1) AS "topTrack"
      FROM channel_activity c LEFT JOIN "discord_guild" g ON g.id = c."guildId"
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
