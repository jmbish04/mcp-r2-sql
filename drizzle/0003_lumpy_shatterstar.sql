CREATE TABLE `storyteller_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'New goal' NOT NULL,
	`goal_category` text,
	`goal_summary` text,
	`address` text,
	`parcel_block_lot` text,
	`lat` integer,
	`lng` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`last_message_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `storyteller_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`tool_calls` text,
	`token_usage` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `storyteller_messages_thread_idx` ON `storyteller_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `storyteller_data_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text,
	`plan` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `storyteller_data_plans_thread_idx` ON `storyteller_data_plans` (`thread_id`,`version`);--> statement-breakpoint
CREATE TABLE `storyteller_dashboard_specs` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`plan_id` text,
	`spec` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `storyteller_dashboard_specs_thread_idx` ON `storyteller_dashboard_specs` (`thread_id`,`version`);--> statement-breakpoint
CREATE TABLE `agentic_sf_context` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`topic` text NOT NULL,
	`content` text NOT NULL,
	`data_signals` text,
	`homeowner_action` text,
	`priority` integer DEFAULT 3 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `storyteller_named_queries` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text,
	`label` text NOT NULL,
	`sql` text NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `storyteller_named_queries_thread_idx` ON `storyteller_named_queries` (`thread_id`);--> statement-breakpoint
CREATE TABLE `storyteller_thread_filters` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`filters` text DEFAULT '{}' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`label` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `storyteller_thread_filters_thread_idx` ON `storyteller_thread_filters` (`thread_id`);--> statement-breakpoint
CREATE TABLE `permit_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`permit_number` text NOT NULL,
	`category` text NOT NULL,
	`source` text DEFAULT 'description' NOT NULL,
	`run_id` text,
	`model` text,
	`confidence` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permit_tags_uq` ON `permit_tags` (`permit_number`,`category`,`source`);--> statement-breakpoint
CREATE INDEX `permit_tags_category_idx` ON `permit_tags` (`category`);--> statement-breakpoint
CREATE INDEX `permit_tags_permit_idx` ON `permit_tags` (`permit_number`);--> statement-breakpoint
CREATE TABLE `enrichment_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'description' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`request_id` text,
	`external_reference` text,
	`model` text,
	`counts` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
