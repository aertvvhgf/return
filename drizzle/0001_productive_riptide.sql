CREATE TABLE `found_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`category` enum('wallet','device','keys','daily','bag','clothing','documents','other') NOT NULL,
	`facilityType` enum('rail','police','bus','commercial','community','other') NOT NULL DEFAULT 'other',
	`color` varchar(80) NOT NULL,
	`shape` varchar(160) NOT NULL,
	`description` text NOT NULL,
	`foundAt` timestamp NOT NULL,
	`placeLabel` varchar(200) NOT NULL,
	`deliveredTo` varchar(200) NOT NULL,
	`latitude` double,
	`longitude` double,
	`imageUrl` varchar(500),
	`privateClues` text NOT NULL,
	`status` enum('active','resolved','deleted') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `found_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loss_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`fullName` varchar(120) NOT NULL,
	`phone` varchar(40) NOT NULL,
	`itemName` varchar(160) NOT NULL,
	`category` varchar(60) NOT NULL,
	`details` text NOT NULL,
	`lostAt` timestamp,
	`location` varchar(200) NOT NULL,
	`route` varchar(200),
	`destinations` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loss_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lost_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`category` enum('wallet','device','keys','daily','bag','clothing','documents','other') NOT NULL,
	`details` text NOT NULL,
	`lostAt` timestamp,
	`location` varchar(200) NOT NULL,
	`route` varchar(200),
	`imageUrl` varchar(500),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lost_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mediation_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mediationId` varchar(36) NOT NULL,
	`senderId` int NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mediation_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mediation_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`mediationId` varchar(36) NOT NULL,
	`reporterId` int NOT NULL,
	`category` enum('personal_information','harassment','fraud','unsafe_handover','other') NOT NULL,
	`details` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mediation_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mediations` (
	`id` varchar(36) NOT NULL,
	`postId` int NOT NULL,
	`applicantId` int NOT NULL,
	`ownerId` int NOT NULL,
	`evidence` text NOT NULL,
	`status` enum('application_pending','verification_in_progress','handover_discussion','handover_scheduled','handover_completed','cancelled','operator_consultation') NOT NULL DEFAULT 'application_pending',
	`decisionNote` varchar(1500),
	`handoverMethod` enum('public_facility','police_station','facility_reception'),
	`handoverPlace` varchar(160),
	`handoverAt` timestamp,
	`handoverLatitude` double,
	`handoverLongitude` double,
	`ownerAccepted` boolean NOT NULL DEFAULT false,
	`applicantAccepted` boolean NOT NULL DEFAULT false,
	`ownerCompleted` boolean NOT NULL DEFAULT false,
	`applicantCompleted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mediations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('application','decision','status','message','handover','completion','cancelled','match') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_preferences_user_kind_idx` UNIQUE(`userId`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`mediationId` varchar(36),
	`kind` enum('application','decision','status','message','handover','completion','cancelled','match') NOT NULL,
	`title` varchar(120) NOT NULL,
	`summary` varchar(300) NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saved_searches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(80) NOT NULL,
	`query` varchar(200) NOT NULL,
	`category` varchar(40),
	`facilityType` varchar(40),
	`route` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saved_searches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(40);--> statement-breakpoint
ALTER TABLE `users` ADD `kana` varchar(120);--> statement-breakpoint
ALTER TABLE `users` ADD `settings` text;--> statement-breakpoint
CREATE INDEX `found_posts_owner_idx` ON `found_posts` (`ownerId`,`status`);--> statement-breakpoint
CREATE INDEX `found_posts_public_idx` ON `found_posts` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `loss_reports_user_idx` ON `loss_reports` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `lost_items_user_idx` ON `lost_items` (`userId`,`isActive`);--> statement-breakpoint
CREATE INDEX `lost_items_active_idx` ON `lost_items` (`isActive`,`createdAt`);--> statement-breakpoint
CREATE INDEX `mediation_messages_thread_idx` ON `mediation_messages` (`mediationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `mediation_reports_case_idx` ON `mediation_reports` (`mediationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `mediations_applicant_idx` ON `mediations` (`applicantId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `mediations_owner_idx` ON `mediations` (`ownerId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `mediations_post_idx` ON `mediations` (`postId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `notifications_unread_idx` ON `notifications` (`userId`,`readAt`);--> statement-breakpoint
CREATE INDEX `saved_searches_user_idx` ON `saved_searches` (`userId`,`createdAt`);