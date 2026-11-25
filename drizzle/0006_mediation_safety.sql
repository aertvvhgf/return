CREATE TABLE `user_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockerId` int NOT NULL,
	`blockedId` int NOT NULL,
	`sourcePostId` int,
	`sourceMediationId` varchar(36),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_blocks_pair_unique` UNIQUE(`blockerId`,`blockedId`)
);
--> statement-breakpoint
CREATE TABLE `user_safety_reports` (
	`id` varchar(36) NOT NULL,
	`reporterId` int NOT NULL,
	`reportedUserId` int NOT NULL,
	`mediationId` varchar(36),
	`postId` int,
	`category` enum('personal_information','harassment','fraud','unsafe_handover','spam','other') NOT NULL,
	`details` text NOT NULL,
	`ownerNotificationAccepted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_safety_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `user_blocks_blocked_idx` ON `user_blocks` (`blockedId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `user_safety_reports_reporter_idx` ON `user_safety_reports` (`reporterId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `user_safety_reports_target_idx` ON `user_safety_reports` (`reportedUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `user_safety_reports_mediation_idx` ON `user_safety_reports` (`mediationId`,`createdAt`);