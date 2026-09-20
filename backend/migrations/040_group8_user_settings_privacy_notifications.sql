-- GROUP 8 — unified user settings, privacy, notification preferences and data-rights support.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS notification_categories JSONB NOT NULL DEFAULT '{"dms":true,"friend_requests":true,"comments":true,"reactions":true,"rooms":true,"live":true,"calls":true,"moderation_system":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quiet_hours_start TIME NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end TIME NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_timezone TEXT NOT NULL DEFAULT 'Africa/Tripoli',
  ADD COLUMN IF NOT EXISTS autoplay_media BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS data_saver BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reduced_motion BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS text_scale NUMERIC(4,2) NOT NULL DEFAULT 1.00;

DO $$ BEGIN
  ALTER TABLE user_settings ADD CONSTRAINT user_settings_text_scale_check CHECK(text_scale BETWEEN 0.85 AND 1.50);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE user_settings ADD CONSTRAINT user_settings_notification_categories_object CHECK(jsonb_typeof(notification_categories)='object');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE profile_privacy
  ADD COLUMN IF NOT EXISTS who_can_mention TEXT NOT NULL DEFAULT 'friends' CHECK(who_can_mention IN('everyone','friends','friends_of_friends','nobody')),
  ADD COLUMN IF NOT EXISTS who_can_tag TEXT NOT NULL DEFAULT 'friends' CHECK(who_can_tag IN('everyone','friends','friends_of_friends','nobody'));

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS device_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS conversation_notification_mutes(
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id BIGINT NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,conversation_id)
);

CREATE TABLE IF NOT EXISTS user_hidden_words(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word TEXT NOT NULL CHECK(char_length(trim(word)) BETWEEN 2 AND 60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_hidden_words_unique_idx ON user_hidden_words(user_id,LOWER(word));
CREATE INDEX IF NOT EXISTS conversation_notification_mutes_user_idx ON conversation_notification_mutes(user_id,conversation_id);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'moderation_system',
  ADD COLUMN IF NOT EXISTS suppressed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION marbo3a_notification_category(p_type TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_type,'') ~* '(direct|message_request|dm|chat)' THEN 'dms'
    WHEN COALESCE(p_type,'') ~* '^friend|friend_' THEN 'friend_requests'
    WHEN COALESCE(p_type,'') ~* '(comment|reply)' THEN 'comments'
    WHEN COALESCE(p_type,'') ~* '(reaction|like|love)' THEN 'reactions'
    WHEN COALESCE(p_type,'') ~* '(room|invite)' THEN 'rooms'
    WHEN COALESCE(p_type,'') ~* 'live' THEN 'live'
    WHEN COALESCE(p_type,'') ~* 'call' THEN 'calls'
    ELSE 'moderation_system'
  END
$$;

CREATE OR REPLACE FUNCTION marbo3a_apply_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  categories JSONB;
  enabled BOOLEAN;
BEGIN
  NEW.category := marbo3a_notification_category(NEW.type);
  SELECT us.notification_categories,us.notifications_enabled
    INTO categories,enabled
  FROM user_settings us
  WHERE us.user_id=NEW.user_id;

  IF FOUND THEN
    IF enabled=FALSE OR COALESCE((categories->>NEW.category)::boolean,TRUE)=FALSE THEN
      NEW.suppressed := TRUE;
    END IF;
  END IF;

  IF NEW.actor_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM user_mutes um
    WHERE um.muter_id=NEW.user_id AND um.muted_id=NEW.actor_id
  ) THEN
    NEW.suppressed := TRUE;
  END IF;

  IF EXISTS(
    SELECT 1 FROM user_hidden_words hw
    WHERE hw.user_id=NEW.user_id
      AND POSITION(LOWER(hw.word) IN LOWER(COALESCE(NEW.title,'')||' '||COALESCE(NEW.body,'')))>0
  ) THEN
    NEW.suppressed := TRUE;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS notifications_preferences_before_insert ON notifications;
CREATE TRIGGER notifications_preferences_before_insert
BEFORE INSERT ON notifications
FOR EACH ROW EXECUTE FUNCTION marbo3a_apply_notification_preferences();

UPDATE notifications SET category=marbo3a_notification_category(type)
WHERE category='moderation_system';

CREATE INDEX IF NOT EXISTS notifications_user_visible_idx
  ON notifications(user_id,id DESC) WHERE suppressed=FALSE;
