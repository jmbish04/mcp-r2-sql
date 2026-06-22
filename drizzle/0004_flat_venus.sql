PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_storyteller_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text DEFAULT 'New goal' NOT NULL,
	`goal_category` text,
	`goal_summary` text,
	`address` text,
	`parcel_block_lot` text,
	`lat` real,
	`lng` real,
	`status` text DEFAULT 'active' NOT NULL,
	`last_message_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_storyteller_threads`("id", "title", "goal_category", "goal_summary", "address", "parcel_block_lot", "lat", "lng", "status", "last_message_at", "created_at", "updated_at") SELECT "id", "title", "goal_category", "goal_summary", "address", "parcel_block_lot", "lat", "lng", "status", "last_message_at", "created_at", "updated_at" FROM `storyteller_threads`;--> statement-breakpoint
DROP TABLE `storyteller_threads`;--> statement-breakpoint
ALTER TABLE `__new_storyteller_threads` RENAME TO `storyteller_threads`;--> statement-breakpoint
PRAGMA foreign_keys=ON;