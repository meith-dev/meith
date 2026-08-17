CREATE TABLE "analytics_days" (
	"day" date PRIMARY KEY NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"member_views" integer DEFAULT 0 NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	"member_visitors" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_pages" (
	"day" date NOT NULL,
	"path" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "analytics_pages_day_path_pk" PRIMARY KEY("day","path")
);
--> statement-breakpoint
CREATE TABLE "analytics_sources" (
	"day" date NOT NULL,
	"source" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "analytics_sources_day_source_pk" PRIMARY KEY("day","source")
);
--> statement-breakpoint
CREATE TABLE "analytics_visitors" (
	"day" date NOT NULL,
	"visitor" text NOT NULL,
	"member" boolean DEFAULT false NOT NULL,
	CONSTRAINT "analytics_visitors_day_visitor_pk" PRIMARY KEY("day","visitor")
);
--> statement-breakpoint
CREATE INDEX "analytics_pages_day_idx" ON "analytics_pages" USING btree ("day","views");--> statement-breakpoint
CREATE INDEX "analytics_sources_day_idx" ON "analytics_sources" USING btree ("day","views");