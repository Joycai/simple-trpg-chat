PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_inventory_distributions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` integer NOT NULL,
	`item_id` integer NOT NULL,
	`from_user_id` integer NOT NULL,
	`to_user_id` integer NOT NULL,
	`action` text DEFAULT 'created' NOT NULL,
	`viewed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_inventory_distributions`("id", "room_id", "item_id", "from_user_id", "to_user_id", "action", "viewed", "created_at") SELECT "id", "room_id", "item_id", "from_user_id", "to_user_id", "action", "viewed", "created_at" FROM `inventory_distributions`;--> statement-breakpoint
DROP TABLE `inventory_distributions`;--> statement-breakpoint
ALTER TABLE `__new_inventory_distributions` RENAME TO `inventory_distributions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_dist_to_user_room` ON `inventory_distributions` (`to_user_id`,`room_id`);--> statement-breakpoint
CREATE INDEX `idx_dist_item_id` ON `inventory_distributions` (`item_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `is_bot` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `bot_config_json` text;