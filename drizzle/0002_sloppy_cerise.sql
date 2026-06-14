CREATE TABLE `config_options` (
	`id` text PRIMARY KEY NOT NULL,
	`config_key` text NOT NULL,
	`value` text NOT NULL,
	`label` text NOT NULL,
	`description` text,
	`color` text,
	`text_color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `config_options_key_value_uq` ON `config_options` (`config_key`,`value`);