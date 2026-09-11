CREATE UNIQUE INDEX IF NOT EXISTS direct_conversations_pair_idx ON direct_conversations(LEAST(user1_id,user2_id),GREATEST(user1_id,user2_id));
CREATE INDEX IF NOT EXISTS post_comments_owner_idx ON post_comments(user_id,id DESC) WHERE deleted_at IS NULL;
