CREATE TABLE IF NOT EXISTS "guild_order_preference" (
	"userId" text PRIMARY KEY NOT NULL,
	"guildOrder" text DEFAULT '[]' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM information_schema.table_constraints
		WHERE constraint_schema = 'public'
			AND table_name = 'guild_order_preference'
			AND constraint_name = 'guild_order_preference_userId_user_id_fk'
	) THEN
		ALTER TABLE "guild_order_preference"
		ADD CONSTRAINT "guild_order_preference_userId_user_id_fk"
		FOREIGN KEY ("userId") REFERENCES "public"."user"("id")
		ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
