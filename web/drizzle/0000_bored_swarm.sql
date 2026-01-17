-- File: web/drizzle/0000_bored_swarm.sql

CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "discord_guild" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"iconHash" text,
	"splash" text,
	"discoverySplash" text,
	"ownerId" text NOT NULL,
	"owner" boolean DEFAULT false NOT NULL,
	"permissions" text,
	"region" text,
	"afkChannelId" text,
	"afkTimeout" integer,
	"widgetEnabled" boolean,
	"widgetChannelId" text,
	"verificationLevel" integer,
	"defaultMessageNotifications" integer,
	"explicitContentFilter" integer,
	"roles" text,
	"emojis" text,
	"features" text,
	"mfaLevel" integer,
	"applicationId" text,
	"systemChannelId" text,
	"systemChannelFlags" integer,
	"rulesChannelId" text,
	"maxMembers" integer,
	"maxPresences" integer,
	"vanityUrlCode" text,
	"description" text,
	"banner" text,
	"premiumTier" integer,
	"premiumSubscriptionCount" integer,
	"preferredLocale" text,
	"publicUpdatesChannelId" text,
	"maxVideoChannelUsers" integer,
	"maxStageVideoChannelUsers" integer,
	"approximateMemberCount" integer,
	"approximatePresenceCount" integer,
	"nsfwLevel" integer,
	"joinedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_user" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"username" text NOT NULL,
	"discriminator" text,
	"globalName" text,
	"avatar" text,
	"bot" boolean DEFAULT false NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"mfaEnabled" boolean DEFAULT false NOT NULL,
	"banner" text,
	"accentColor" integer,
	"locale" text,
	"verified" boolean DEFAULT false NOT NULL,
	"email" text,
	"flags" integer,
	"premiumType" integer,
	"publicFlags" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discord_user_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "guild_member" (
	"id" text PRIMARY KEY NOT NULL,
	"guildId" text NOT NULL,
	"userId" text NOT NULL,
	"nick" text,
	"avatar" text,
	"roles" text DEFAULT '[]' NOT NULL,
	"joinedAt" timestamp,
	"premiumSince" timestamp,
	"deaf" boolean DEFAULT false NOT NULL,
	"mute" boolean DEFAULT false NOT NULL,
	"pending" boolean,
	"permissions" text,
	"communicationDisabledUntil" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"guildId" text PRIMARY KEY NOT NULL,
	"playlistLimit" integer DEFAULT 50 NOT NULL,
	"secondsToWaitAfterQueueEmpties" integer DEFAULT 30 NOT NULL,
	"leaveIfNoListeners" boolean DEFAULT true NOT NULL,
	"queueAddResponseEphemeral" boolean DEFAULT false NOT NULL,
	"autoAnnounceNextSong" boolean DEFAULT false NOT NULL,
	"defaultVolume" integer DEFAULT 100 NOT NULL,
	"defaultQueuePageSize" integer DEFAULT 10 NOT NULL,
	"turnDownVolumeWhenPeopleSpeak" boolean DEFAULT false NOT NULL,
	"turnDownVolumeWhenPeopleSpeakTarget" integer DEFAULT 20 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_user" ADD CONSTRAINT "discord_user_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_member" ADD CONSTRAINT "guild_member_guildId_discord_guild_id_fk" FOREIGN KEY ("guildId") REFERENCES "public"."discord_guild"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_member" ADD CONSTRAINT "guild_member_userId_discord_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."discord_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setting" ADD CONSTRAINT "setting_guildId_discord_guild_id_fk" FOREIGN KEY ("guildId") REFERENCES "public"."discord_guild"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "discord_user_user_id_idx" ON "discord_user" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "guild_member_guild_id_idx" ON "guild_member" USING btree ("guildId");--> statement-breakpoint
CREATE INDEX "guild_member_user_id_idx" ON "guild_member" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "guild_member_composite_idx" ON "guild_member" USING btree ("guildId","userId");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("userId");
