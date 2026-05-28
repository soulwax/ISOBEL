import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { discordGuilds, discordUsers, guildMembers } from '../db/schema.js';

interface DiscordProfile {
  id?: unknown;
  username?: unknown;
  name?: unknown;
  discriminator?: unknown;
  global_name?: unknown;
  avatar?: unknown;
  email?: unknown;
}

interface SyncDiscordDataOptions {
  authUserId: string;
  discordUserId: string;
  accessToken: string;
  profile?: DiscordProfile | null;
}

async function fetchDiscordProfile(accessToken: string): Promise<DiscordProfile | null> {
  const response = await fetch('https://discord.com/api/v10/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return await response.json() as DiscordProfile;
}

export async function syncDiscordData({
  authUserId,
  discordUserId,
  accessToken,
  profile,
}: SyncDiscordDataOptions): Promise<void> {
  const discordProfile = profile ?? await fetchDiscordProfile(accessToken);
  const updatedAt = new Date();

  await db
    .insert(discordUsers)
    .values({
      id: discordUserId,
      userId: authUserId,
      username: (discordProfile?.username || discordProfile?.name || 'Unknown') as string,
      discriminator: (discordProfile?.discriminator as string) || null,
      globalName: (discordProfile?.global_name as string) || null,
      avatar: (discordProfile?.avatar as string) || null,
      email: (discordProfile?.email as string) || null,
      bot: false,
      system: false,
      mfaEnabled: false,
      verified: false,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: discordUsers.id,
      set: {
        userId: authUserId,
        username: (discordProfile?.username || discordProfile?.name || 'Unknown') as string,
        discriminator: (discordProfile?.discriminator as string) || null,
        globalName: (discordProfile?.global_name as string) || null,
        avatar: (discordProfile?.avatar as string) || null,
        email: (discordProfile?.email as string) || null,
        updatedAt,
      },
    });

  const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!guildsResponse.ok) {
    throw new Error(`Discord guild fetch failed with status ${guildsResponse.status}`);
  }

  const guilds = await guildsResponse.json() as Array<{
    id: string;
    name: string;
    icon?: string | null;
    owner?: boolean;
    owner_id?: string;
    permissions?: string | number | bigint | null;
  }>;

  await db.transaction(async (tx) => {
    for (const guild of guilds) {
      const permissions = guild.permissions?.toString() || null;

      await tx
        .insert(discordGuilds)
        .values({
          id: guild.id,
          name: guild.name,
          icon: guild.icon || null,
          ownerId: guild.owner_id || '',
          owner: guild.owner || false,
          permissions,
          deletedAt: null,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: discordGuilds.id,
          set: {
            name: sql`excluded.name`,
            icon: sql`excluded.icon`,
            permissions: sql`excluded.permissions`,
            deletedAt: null,
            updatedAt: sql`excluded."updatedAt"`,
          },
        });

      await tx
        .insert(guildMembers)
        .values({
          id: `${guild.id}_${discordUserId}`,
          guildId: guild.id,
          userId: discordUserId,
          permissions,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: guildMembers.id,
          set: {
            permissions: sql`excluded.permissions`,
            updatedAt: sql`excluded."updatedAt"`,
          },
        });
    }
  });
}
