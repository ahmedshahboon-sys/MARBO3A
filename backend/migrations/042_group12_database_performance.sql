-- MARBO3A_MIGRATION_NO_TRANSACTION
-- Group 12: additive indexes for production-scale social, moderation, and map workloads.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friendships_requester_status_updated
  ON friendships(requester_id,status,updated_at DESC,id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_friendships_addressee_status_updated
  ON friendships(addressee_id,status,updated_at DESC,id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_blocks_blocked_blocker
  ON user_blocks(blocked_id,blocker_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reports_status_created_id
  ON reports(status,created_at DESC,id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_post_comments_live_post_id
  ON post_comments(post_id,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_live_id
  ON notifications(user_id,id DESC) WHERE suppressed=FALSE;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_locations_city_updated
  ON user_locations(city,updated_at DESC) WHERE city<>'';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active_created
  ON users(created_at DESC,id DESC) WHERE account_status='active';
