-- Group 13: additive indexes for high-frequency lifecycle queries.
-- CONCURRENTLY is intentional so a production migration does not take long write locks.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_live_created ON posts(created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_user_live_created ON posts(user_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_room_created_live ON messages(room_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_direct_messages_conversation_created_live ON direct_messages(conversation_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread_created ON notifications(user_id,created_at DESC,id DESC) WHERE read_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_durable_sessions_expiry ON durable_sessions(expires_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_logs_errors_created ON operation_logs(created_at DESC,id DESC) WHERE level='ERROR';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_operation_logs_category_created ON operation_logs(category,created_at DESC,id DESC);
