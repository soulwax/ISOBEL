// File: web/src/auth/config.ts

import { DrizzleAdapter } from '@auth/drizzle-adapter';
import Discord from '@auth/core/providers/discord';
import type { AuthConfig } from '@auth/core';
import { db } from '../db/index.js';
import {
  accounts,
  discordUsers,
  sessions,
  users,
  verificationTokens,
} from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { requireEnv } from '../lib/env.js';
import { logger } from '../lib/logger.js';
import { syncDiscordData } from './discord-sync.js';
import { isSuperUserIdentity } from '../server/superuser.js';

// Get NEXTAUTH_URL from environment, fallback to auto-detection
const nextAuthUrl = process.env.NEXTAUTH_URL;
const nextAuthSecret = process.env.NEXTAUTH_SECRET?.trim()
  || process.env.AUTH_SECRET?.trim()
  || process.env.DISCORD_CLIENT_SECRET?.trim();

if (!nextAuthSecret) {
  throw new Error('Missing auth secret. Set NEXTAUTH_SECRET or DISCORD_CLIENT_SECRET.');
}

if (!process.env.NEXTAUTH_SECRET?.trim() && !process.env.AUTH_SECRET?.trim()) {
  logger.warn('NEXTAUTH_SECRET not set, falling back to DISCORD_CLIENT_SECRET for Auth.js secret.');
}

export const authConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  trustHost: true, // Required for Auth.js core when running behind proxies/serverless
  basePath: '/api/auth', // Set the base path for auth routes
  ...(nextAuthUrl && { url: nextAuthUrl }), // Explicitly set URL if provided
  providers: [
    Discord({
      clientId: requireEnv('DISCORD_CLIENT_ID'),
      clientSecret: requireEnv('DISCORD_CLIENT_SECRET'),
      authorization: {
        params: {
          scope: 'identify email guilds',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'discord' && account.access_token && profile && user.id) {
        try {
          if (typeof profile.id === 'string') {
            await syncDiscordData({
              authUserId: user.id,
              discordUserId: profile.id,
              accessToken: account.access_token,
              profile,
            });

            if (typeof profile.email === 'string') {
              await db
                .update(users)
                .set({
                  email: profile.email,
                  updatedAt: new Date(),
                })
                .where(eq(users.id, user.id));
            }
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
        const sessionUser = session.user as typeof session.user & {
          id?: string;
          discordId?: string;
          isSuperUser?: boolean;
        };
        sessionUser.id = user.id;

        // Get Discord ID from discordUsers table
        const discordUser = await db
          .select()
          .from(discordUsers)
          .where(eq(discordUsers.userId, user.id))
          .limit(1);
        
        if (discordUser.length > 0) {
          sessionUser.discordId = discordUser[0].id;
          sessionUser.email = session.user.email ?? discordUser[0].email ?? undefined;
        }

        sessionUser.isSuperUser = await isSuperUserIdentity({
          email: sessionUser.email ?? session.user.email,
          discordId: sessionUser.discordId,
        });

        session.user = sessionUser;
      }
      return session;
    },
  },
  // Use default Auth.js pages (auto-generated sign-in page)
  session: {
    strategy: 'database',
  },
  secret: nextAuthSecret,
} satisfies AuthConfig;
