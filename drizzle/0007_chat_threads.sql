CREATE TABLE `chat_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','member') NOT NULL DEFAULT 'member',
	`lastReadMessageId` int,
	`muted` boolean NOT NULL DEFAULT false,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`leftAt` timestamp,
	CONSTRAINT `chat_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_members_thread_user_unique` UNIQUE(`threadId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` varchar(36) NOT NULL,
	`senderId` int NOT NULL,
	`kind` enum('text','system') NOT NULL DEFAULT 'text',
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` varchar(36) NOT NULL,
	`kind` enum('dm','group') NOT NULL,
	`dmKey` varchar(64),
	`title` varchar(120),
	`topic` varchar(200),
	`postId` int,
	`mediationId` varchar(36),
	`createdBy` int NOT NULL,
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`lastMessagePreview` varchar(160),
	`lastMessageSenderId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `chat_threads_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_threads_dm_key_unique` UNIQUE(`dmKey`)
);
--> statement-breakpoint
ALTER TABLE `notification_preferences` MODIFY COLUMN `kind` enum('application','decision','status','message','handover','completion','cancelled','match','chat') NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `kind` enum('application','decision','status','message','handover','completion','cancelled','match','chat') NOT NULL;--> statement-breakpoint
ALTER TABLE `notifications` ADD `threadId` varchar(36);--> statement-breakpoint
CREATE INDEX `chat_members_user_idx` ON `chat_members` (`userId`,`leftAt`);--> statement-breakpoint
CREATE INDEX `chat_messages_thread_idx` ON `chat_messages` (`threadId`,`id`);--> statement-breakpoint
CREATE INDEX `chat_threads_recent_idx` ON `chat_threads` (`lastMessageAt`);