CREATE TABLE IF NOT EXISTS post_reactions(
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK(reaction IN('like','laugh','angry','sad')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(post_id,user_id)
);
CREATE INDEX IF NOT EXISTS post_reactions_post_idx ON post_reactions(post_id,updated_at DESC);
INSERT INTO post_reactions(post_id,user_id,reaction)
SELECT post_id,user_id,'like' FROM post_likes
ON CONFLICT(post_id,user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION sync_legacy_post_like_insert() RETURNS trigger AS $$
BEGIN
  INSERT INTO post_reactions(post_id,user_id,reaction)
  VALUES(NEW.post_id,NEW.user_id,'like')
  ON CONFLICT(post_id,user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_legacy_post_like_delete() RETURNS trigger AS $$
BEGIN
  DELETE FROM post_reactions WHERE post_id=OLD.post_id AND user_id=OLD.user_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_legacy_post_like_insert ON post_likes;
CREATE TRIGGER trg_sync_legacy_post_like_insert
AFTER INSERT ON post_likes FOR EACH ROW EXECUTE FUNCTION sync_legacy_post_like_insert();
DROP TRIGGER IF EXISTS trg_sync_legacy_post_like_delete ON post_likes;
CREATE TRIGGER trg_sync_legacy_post_like_delete
AFTER DELETE ON post_likes FOR EACH ROW EXECUTE FUNCTION sync_legacy_post_like_delete();

ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;
