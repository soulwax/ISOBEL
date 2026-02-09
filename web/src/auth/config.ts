// File: web/src/auth/config.ts

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import Discord from 'next-auth/providers/discord';
import type { DefaultSession, NextAuthConfig } from 'next-auth';
import { db } from '../db/index.js';
import { discordUsers, discordGuilds, guildMembers } from '../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { requireEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
      discordId?: string;
    } & DefaultSession['user'];
  }
}

// Get NEXTAUTH_URL from environment, fallback to auto-detection
const nextAuthUrl = process.env.NEXTAUTH_URL;

export const authConfig = {
  adapter: DrizzleAdapter(db),
  trustHost: true, // Required for NextAuth v5 when not using Next.js
  basePath: '/api/auth', // Set the base path for auth routes
  ...(nextAuthUrl && { url: nextAuthUrl }), // Explicitly set URL if provided
  providers: [
    Discord({
      clientId: requireEnv('DISCORD_CLIENT_ID'),
      clientSecret: requireEnv('DISCORD_CLIENT_SECRET'),
      authorization: {
        params: {
          scope: 'identify guilds',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'discord' && account.access_token && profile && user.id) {
        try {
          // Save or update Discord user data
          const discordUserData = {
            id: profile.id as string,
            userId: user.id,
            username: (profile.username || profile.name || 'Unknown') as string,
            discriminator: (profile.discriminator as string) || null,
            globalName: (profile.global_name as string) || null,
            avatar: (profile.avatar as string) || null,
            bot: false,
            system: false,
            mfaEnabled: false,
            verified: false,
            updatedAt: new Date(),
          };

          await db
            .insert(discordUsers)
            .values(discordUserData)
            .onConflictDoUpdate({
              target: discordUsers.id,
              set: {
                username: discordUserData.username,
                globalName: discordUserData.globalName,
                avatar: discordUserData.avatar,
                updatedAt: discordUserData.updatedAt,
              },
            });

          // Fetch and save user's guilds
          const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: {
              Authorization: `Bearer ${account.access_token}`,
            },
          });

          if (guildsResponse.ok) {
            const guilds = await guildsResponse.json();
            const discordUserId = profile.id as string;

            // Use transaction to ensure atomicity and better performance
            await db.transaction(async (tx) => {
              // Prepare all guild data
              const guildsData = guilds.map((guild: any) => ({
                id: guild.id,
                name: guild.name,
                icon: guild.icon || null,
                ownerId: guild.owner_id || '',
                owner: guild.owner || false,
                permissions: guild.permissions?.toString() || null,
                updatedAt: new Date(),
              }));

              // Prepare all member data
              const membersData = guilds.map((guild: any) => ({
                id: `${guild.id}_${discordUserId}`,
                guildId: guild.id,
                userId: discordUserId,
                permissions: guild.permissions?.toString() || null,
                updatedAt: new Date(),
              }));

              // Batch insert/update guilds
              // PostgreSQL supports efficient upserts with ON CONFLICT
              // All operations are done in a single transaction for atomicity
              for (const guildData of guildsData) {
                await tx
                  .insert(discordGuilds)
                  .values(guildData)
                  .onConflictDoUpdate({
                    target: discordGuilds.id,
                    set: {
                      name: sql`excluded.name`,
                      icon: sql`excluded.icon`,
                      permissions: sql`excluded.permissions`,
                      updatedAt: sql`excluded.updatedAt`,
                    },
                  });
              }

              // Batch insert/update members
              for (const memberData of membersData) {
                await tx
                  .insert(guildMembers)
                  .values(memberData)
                  .onConflictDoUpdate({
                    target: guildMembers.id,
                    set: {
                      permissions: sql`excluded.permissions`,
                      updatedAt: sql`excluded.updatedAt`,
                    },
                  });
              }
            });
          }
        } catch (error) {
          logger.error('Error saving Discord data', { error, userId: user.id });
          // Don't block sign-in if guild fetching fails
        }
      }
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        // Get Discord ID from discordUsers table
        const discordUser = await db
          .select()
          .from(discordUsers)
          .where(eq(discordUsers.userId, user.id))
          .limit(1);
        
        if (discordUser.length > 0) {
          session.user.discordId = discordUser[0].id;
        }
      }
      return session;
    },
  },
  // Use default NextAuth pages (auto-generated signin page)
  session: {
    strategy: 'database',
  },
  secret: requireEnv('NEXTAUTH_SECRET'),
} satisfies NextAuthConfig;
