CREATE TABLE IF NOT EXISTS users(
 id BIGSERIAL PRIMARY KEY,email TEXT NOT NULL UNIQUE,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,
 gender TEXT NOT NULL CHECK(gender IN('male','female')),password_hash TEXT NOT NULL,bio TEXT NOT NULL DEFAULT '',avatar_url TEXT,
 email_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),account_status TEXT NOT NULL DEFAULT 'active',ban_reason TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_username_lower_idx ON users((LOWER(username)));
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users((LOWER(email)));
CREATE TABLE IF NOT EXISTS rooms(id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,description TEXT NOT NULL DEFAULT '',is_public BOOLEAN NOT NULL DEFAULT TRUE,owner_id BIGINT REFERENCES users(id) ON DELETE SET NULL,join_policy TEXT NOT NULL DEFAULT 'open',image_url TEXT,rules TEXT NOT NULL DEFAULT '',max_members INT NOT NULL DEFAULT 500,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS room_members(room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL DEFAULT 'member' CHECK(role IN('owner','moderator','member')),joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(room_id,user_id));
CREATE INDEX IF NOT EXISTS room_members_user_idx ON room_members(user_id,room_id);
CREATE TABLE IF NOT EXISTS messages(id BIGSERIAL PRIMARY KEY,room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,reply_to_id BIGINT,attachment_url TEXT,attachment_type TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),edited_at TIMESTAMPTZ,deleted_at TIMESTAMPTZ,forwarded_from_message_id BIGINT);
CREATE INDEX IF NOT EXISTS messages_room_id_id_idx ON messages(room_id,id DESC);
CREATE TABLE IF NOT EXISTS friendships(id BIGSERIAL PRIMARY KEY,requester_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,addressee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','rejected')),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(requester_id<>addressee_id));
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx ON friendships(LEAST(requester_id,addressee_id),GREATEST(requester_id,addressee_id));
CREATE TABLE IF NOT EXISTS notifications(id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,actor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,type TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',ref_id BIGINT,read_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,id DESC);
CREATE TABLE IF NOT EXISTS direct_conversations(id BIGSERIAL PRIMARY KEY,user1_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,user2_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(user1_id<>user2_id));
CREATE UNIQUE INDEX IF NOT EXISTS direct_conversations_pair_idx ON direct_conversations(LEAST(user1_id,user2_id),GREATEST(user1_id,user2_id));
CREATE TABLE IF NOT EXISTS direct_messages(id BIGSERIAL PRIMARY KEY,conversation_id BIGINT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL,reply_to_id BIGINT,attachment_url TEXT,attachment_type TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),edited_at TIMESTAMPTZ,deleted_at TIMESTAMPTZ,forwarded_from_message_id BIGINT);
CREATE INDEX IF NOT EXISTS direct_messages_conv_id_idx ON direct_messages(conversation_id,id DESC);
CREATE TABLE IF NOT EXISTS audit_logs(id BIGSERIAL PRIMARY KEY,user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,level TEXT NOT NULL DEFAULT 'INFO',category TEXT NOT NULL DEFAULT 'SYSTEM',action TEXT NOT NULL,status_code INT,duration_ms INT,ip_address TEXT,details JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(id DESC);
CREATE TABLE IF NOT EXISTS visitor_presence(visitor_id TEXT PRIMARY KEY,user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_ip TEXT);
CREATE TABLE IF NOT EXISTS user_locations(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,city TEXT NOT NULL DEFAULT '',latitude DOUBLE PRECISION,longitude DOUBLE PRECISION,share_precise BOOLEAN NOT NULL DEFAULT FALSE,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
