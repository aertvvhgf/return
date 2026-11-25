CREATE TABLE `chat_pins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`threadId` varchar(36) NOT NULL,
	`messageId` int NOT NULL,
	`pinnedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_pins_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_pins_unique` UNIQUE(`threadId`,`messageId`)
);
--> statement-breakpoint
CREATE TABLE `chat_reactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`emoji` varchar(16) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chat_reactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `chat_reactions_unique` UNIQUE(`messageId`,`userId`,`emoji`)
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`endpoint` varchar(1000) NOT NULL,
	`subscriptionJson` text NOT NULL,
	`userAgent` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `push_subscriptions_endpoint_unique` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE TABLE `reward_requests` (
	`id` varchar(36) NOT NULL,
	`mediationId` varchar(36) NOT NULL,
	`payerId` int NOT NULL,
	`recipientId` int NOT NULL,
	`amountJpy` int NOT NULL,
	`status` enum('draft','agreed','payment_pending','paid','topup_pending','completed','cancelled','unavailable') NOT NULL DEFAULT 'draft',
	`provider` varchar(40) NOT NULL DEFAULT 'paypay',
	`providerPaymentId` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reward_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `chat_messages` MODIFY COLUMN `kind` enum('text','image','system') NOT NULL DEFAULT 'text';--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `attachmentUrl` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `attachmentName` varchar(160);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `editedAt` timestamp;--> statement-breakpoint
CREATE INDEX `chat_pins_thread_idx` ON `chat_pins` (`threadId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `chat_reactions_message_idx` ON `chat_reactions` (`messageId`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`userId`);--> statement-breakpoint
CREATE INDEX `reward_requests_mediation_idx` ON `reward_requests` (`mediationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reward_requests_payer_idx` ON `reward_requests` (`payerId`,`createdAt`);