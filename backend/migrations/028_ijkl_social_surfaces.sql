ALTER TABLE rooms ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';
DO $$ BEGIN
  ALTER TABLE rooms ADD CONSTRAINT rooms_visibility_check CHECK (visibility IN ('public','friends','private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE rooms SET visibility=CASE WHEN is_public THEN 'public' ELSE 'private' END WHERE visibility IS NULL OR visibility='';

ALTER TABLE user_locations ADD COLUMN IF NOT EXISTS visibility_mode TEXT NOT NULL DEFAULT 'everyone';
ALTER TABLE user_locations ADD COLUMN IF NOT EXISTS ghost_mode BOOLEAN NOT NULL DEFAULT FALSE;
DO $$ BEGIN
  ALTER TABLE user_locations ADD CONSTRAINT user_locations_visibility_mode_check CHECK (visibility_mode IN ('everyone','friends'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS story_reactions(
 story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 emoji TEXT NOT NULL CHECK(emoji IN('❤️','😂','😍','😢','🔥')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(story_id,user_id)
);
CREATE INDEX IF NOT EXISTS story_reactions_story_idx ON story_reactions(story_id,created_at DESC);

CREATE TABLE IF NOT EXISTS story_mutes(
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 muted_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,muted_user_id),
 CHECK(user_id<>muted_user_id)
);

CREATE TABLE IF NOT EXISTS story_highlights(
 id BIGSERIAL PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
 title TEXT NOT NULL DEFAULT 'مميزة',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(user_id,story_id)
);
CREATE INDEX IF NOT EXISTS story_highlights_user_idx ON story_highlights(user_id,id DESC);
