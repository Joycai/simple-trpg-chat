CREATE TABLE `clue_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`creator_id` integer NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`image_url` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `clue_visibility` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`clue_id` integer NOT NULL,
	`user_id` integer,
	`revealed_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`clue_id`) REFERENCES `clue_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_clue_vis_clue_id` ON `clue_visibility` (`clue_id`);--> statement-breakpoint
CREATE INDEX `idx_clue_vis_user_id` ON `clue_visibility` (`user_id`);--> statement-breakpoint
CREATE TABLE `room_dm_reads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`partner_user_id` integer NOT NULL,
	`last_read_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`partner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_dm_reads_room_id_user_id_partner_user_id_unique` ON `room_dm_reads` (`room_id`,`user_id`,`partner_user_id`);--> statement-breakpoint
ALTER TABLE `rooms` ADD `rule_template` text DEFAULT 'basic' NOT NULL;