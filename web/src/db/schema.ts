// File: web/src/db/schema.ts

import { relations } from 'drizzle-orm';
import { boolean, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

// NextAuth required tables
export const users = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email'),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
});

export const accounts = pgTable('account', {
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
}, (table) => ({
  pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
  userIdIdx: index('account_user_id_idx').on(table.userId),
}));

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (table) => ({
  userIdIdx: index('session_user_id_idx').on(table.userId),
}));

export const verificationTokens = pgTable('verificationToken', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.identifier, table.token] }),
}));

// Discord-specific tables
export const discordUsers = pgTable('discord_user', {
  id: text('id').primaryKey(), // Discord user ID
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(), // Link to NextAuth user
  username: text('username').notNull(),
  discriminator: text('discriminator'), // Legacy discriminator (may be null for new users)
  globalName: text('globalName'), // New username system
  avatar: text('avatar'),
  bot: boolean('bot').notNull().default(false),
  system: boolean('system').notNull().default(false),
  mfaEnabled: boolean('mfaEnabled').notNull().default(false),
  banner: text('banner'),
  accentColor: integer('accentColor'),
  locale: text('locale'),
  verified: boolean('verified').notNull().default(false),
  email: text('email'),
  flags: integer('flags'),
  premiumType: integer('premiumType'),
  publicFlags: integer('publicFlags'),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('discord_user_user_id_idx').on(table.userId),
}));

export const discordGuilds = pgTable('discord_guild', {
  id: text('id').primaryKey(), // Discord guild ID
  name: text('name').notNull(),
  icon: text('icon'),
  iconHash: text('iconHash'),
  splash: text('splash'),
  discoverySplash: text('discoverySplash'),
  ownerId: text('ownerId').notNull(), // Discord user ID of owner
  owner: boolean('owner').notNull().default(false), // Whether the bot is the owner
  permissions: text('permissions'), // Bitwise permissions as string
  region: text('region'),
  afkChannelId: text('afkChannelId'),
  afkTimeout: integer('afkTimeout'),
  widgetEnabled: boolean('widgetEnabled'),
  widgetChannelId: text('widgetChannelId'),
  verificationLevel: integer('verificationLevel'),
  defaultMessageNotifications: integer('defaultMessageNotifications'),
  explicitContentFilter: integer('explicitContentFilter'),
  roles: text('roles'), // JSON array of role IDs
  emojis: text('emojis'), // JSON array of emoji data
  features: text('features'), // JSON array of guild features
  mfaLevel: integer('mfaLevel'),
  applicationId: text('applicationId'),
  systemChannelId: text('systemChannelId'),
  systemChannelFlags: integer('systemChannelFlags'),
  rulesChannelId: text('rulesChannelId'),
  maxMembers: integer('maxMembers'),
  maxPresences: integer('maxPresences'),
  vanityUrlCode: text('vanityUrlCode'),
  description: text('description'),
  banner: text('banner'),
  premiumTier: integer('premiumTier'),
  premiumSubscriptionCount: integer('premiumSubscriptionCount'),
  preferredLocale: text('preferredLocale'),
  publicUpdatesChannelId: text('publicUpdatesChannelId'),
  maxVideoChannelUsers: integer('maxVideoChannelUsers'),
  maxStageVideoChannelUsers: integer('maxStageVideoChannelUsers'),
  approximateMemberCount: integer('approximateMemberCount'),
  approximatePresenceCount: integer('approximatePresenceCount'),
  nsfwLevel: integer('nsfwLevel'),
  joinedAt: timestamp('joinedAt', { mode: 'date' }), // When bot joined
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
});

// Guild members (users in guilds)
export const guildMembers = pgTable('guild_member', {
  id: text('id').primaryKey(), // Composite: guildId_userId
  guildId: text('guildId')
    .notNull()
    .references(() => discordGuilds.id, { onDelete: 'cascade' }),
  userId: text('userId')
    .notNull()
    .references(() => discordUsers.id, { onDelete: 'cascade' }),
  nick: text('nick'),
  avatar: text('avatar'),
  roles: text('roles').notNull().default('[]'), // JSON array of role IDs
  joinedAt: timestamp('joinedAt', { mode: 'date' }),
  premiumSince: timestamp('premiumSince', { mode: 'date' }),
  deaf: boolean('deaf').notNull().default(false),
  mute: boolean('mute').notNull().default(false),
  pending: boolean('pending'),
  permissions: text('permissions'), // Computed permissions as string
  communicationDisabledUntil: timestamp('communicationDisabledUntil', { mode: 'date' }),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
}, (table) => ({
  // Indexes for frequently queried columns
  guildIdIdx: index('guild_member_guild_id_idx').on(table.guildId),
  userIdIdx: index('guild_member_user_id_idx').on(table.userId),
  // Composite index for common query pattern (guildId + userId)
  compositeIdx: index('guild_member_composite_idx').on(table.guildId, table.userId),
}));

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  discordUser: one(discordUsers),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const discordUsersRelations = relations(discordUsers, ({ one, many }) => ({
  user: one(users, { fields: [discordUsers.userId], references: [users.id] }),
  guildMembers: many(guildMembers),
}));

export const discordGuildsRelations = relations(discordGuilds, ({ many }) => ({
  members: many(guildMembers),
}));

// Bot settings per guild (matches BOT schema.prisma)
export const settings = pgTable('setting', {
  guildId: text('guildId').primaryKey().references(() => discordGuilds.id, { onDelete: 'cascade' }),
  playlistLimit: integer('playlistLimit').notNull().default(50),
  secondsToWaitAfterQueueEmpties: integer('secondsToWaitAfterQueueEmpties').notNull().default(30),
  leaveIfNoListeners: boolean('leaveIfNoListeners').notNull().default(true),
  queueAddResponseEphemeral: boolean('queueAddResponseEphemeral').notNull().default(false),
  autoAnnounceNextSong: boolean('autoAnnounceNextSong').notNull().default(false),
  defaultVolume: integer('defaultVolume').notNull().default(100),
  defaultQueuePageSize: integer('defaultQueuePageSize').notNull().default(10),
  turnDownVolumeWhenPeopleSpeak: boolean('turnDownVolumeWhenPeopleSpeak').notNull().default(false),
  turnDownVolumeWhenPeopleSpeakTarget: integer('turnDownVolumeWhenPeopleSpeakTarget').notNull().default(20),
  createdAt: timestamp('createdAt', { mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { mode: 'date' }).notNull().defaultNow(),
});

export const guildMembersRelations = relations(guildMembers, ({ one }) => ({
  guild: one(discordGuilds, { fields: [guildMembers.guildId], references: [discordGuilds.id] }),
  user: one(discordUsers, { fields: [guildMembers.userId], references: [discordUsers.id] }),
}));

export const discordGuildsSettingsRelations = relations(discordGuilds, ({ one }) => ({
  settings: one(settings, { fields: [discordGuilds.id], references: [settings.guildId] }),
}));
