-- Add origin_message_id to file_metadata to link files to the message they were shared from
ALTER TABLE `file_metadata`
  ADD COLUMN `origin_message_id` INT NULL AFTER `uploaded_at`;

-- Add index for faster lookups by message
CREATE INDEX `file_metadata_origin_message_id_idx` ON `file_metadata` (`origin_message_id`);

-- Add foreign key constraint to messages table (if messages table exists)
ALTER TABLE `file_metadata`
  ADD CONSTRAINT `file_metadata_origin_message_id_fkey` FOREIGN KEY (`origin_message_id`) REFERENCES `messages`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;
