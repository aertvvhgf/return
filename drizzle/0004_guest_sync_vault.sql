CREATE TABLE `guest_sync_vaults` (
	`id` varchar(36) NOT NULL,
	`accessKeyHash` varchar(64) NOT NULL,
	`encryptedPayload` text NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`status` enum('active','revoked','expired') NOT NULL DEFAULT 'active',
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `guest_sync_vaults_id` PRIMARY KEY(`id`),
	CONSTRAINT `guest_sync_vaults_key_unique` UNIQUE(`accessKeyHash`)
);
--> statement-breakpoint
CREATE INDEX `guest_sync_vaults_expiry_idx` ON `guest_sync_vaults` (`status`,`expiresAt`);