ALTER TABLE "member" ADD COLUMN "staticSiteOnly" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "application" ADD COLUMN "staticSiteOnly" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "staticSiteOnly" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "staticSiteOrganizationId" text;
