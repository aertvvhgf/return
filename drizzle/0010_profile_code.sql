ALTER TABLE `users` ADD COLUMN `profileCode` varchar(20) NULL AFTER `email`;
CREATE UNIQUE INDEX `users_profileCode_unique` ON `users` (`profileCode`);
