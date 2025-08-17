ALTER TABLE "user" ADD COLUMN "wallet_address" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_wallet_address_unique" UNIQUE("wallet_address");