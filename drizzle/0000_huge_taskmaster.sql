CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` integer NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attachments_job` ON `attachments` (`job_id`);--> statement-breakpoint
CREATE TABLE `job_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` integer NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_job` ON `job_events` (`job_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`requester_id` text NOT NULL,
	`requester_name` text NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`material` text NOT NULL,
	`color` text DEFAULT '' NOT NULL,
	`infill` integer,
	`requirements` text DEFAULT '' NOT NULL,
	`priority` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`operator_id` text,
	`printer_id` text,
	`dims_json` text DEFAULT '[null,null,null]' NOT NULL,
	`links_json` text DEFAULT '[]' NOT NULL,
	`due_date` text,
	`scheduled_start` text,
	`scheduled_end` text,
	`notes` text DEFAULT '' NOT NULL,
	`print_minutes` real,
	`filament_grams` real,
	`profile` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jobs_requester` ON `jobs` (`requester_id`);--> statement-breakpoint
CREATE INDEX `jobs_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_printing_per_printer` ON `jobs` (`printer_id`) WHERE status = 'printing' AND printer_id IS NOT NULL;--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `printers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model` text NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`z` real NOT NULL,
	`state` text DEFAULT 'ready' NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);