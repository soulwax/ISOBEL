CREATE TABLE "guild_order_preference" (
	"userId" text PRIMARY KEY NOT NULL,
	"guildOrder" text DEFAULT '[]' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_guild" ADD COLUMN "deletedAt" timestamp;--> statement-breakpoint
ALTER TABLE "setting" ADD COLUMN "maxQueueSize" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "setting" ADD COLUMN "defaultLoopMode" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_order_preference" ADD CONSTRAINT "guild_order_preference_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;