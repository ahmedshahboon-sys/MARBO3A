CREATE INDEX IF NOT EXISTS posts_user_id_idx ON posts(user_id,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS friendships_status_people_idx ON friendships(status,requester_id,addressee_id);
CREATE INDEX IF NOT EXISTS direct_messages_unread_idx ON direct_messages(conversation_id,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id,id DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS rooms_created_idx ON rooms(id DESC);
