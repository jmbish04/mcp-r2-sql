CREATE TABLE `query_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`operation` text NOT NULL,
	`ok` integer NOT NULL,
	`status` integer DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`sql` text,
	`request_id` text,
	`rows_returned` integer,
	`files_scanned` integer,
	`bytes_scanned` integer,
	`error` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
