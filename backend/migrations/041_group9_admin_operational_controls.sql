-- GROUP 9 — Admin Operational Control Completion.
-- Adds only bounded, documented controls that are enforced by backend/runtime code.

INSERT INTO admin_system_settings(key,value,description) VALUES
 ('login_rate_limit_15m','30'::jsonb,'Maximum login attempts per IP in a 15 minute window before requests are rejected'),
 ('captcha_escalation_enabled','false'::jsonb,'Require Cloudflare Turnstile only after suspicious authentication activity crosses the configured threshold'),
 ('captcha_escalation_threshold','6'::jsonb,'Authentication attempts in the escalation window before CAPTCHA becomes mandatory'),
 ('new_account_restrictions_enabled','true'::jsonb,'Apply stricter mutation limits to accounts younger than 24 hours'),
 ('reports_limit_per_hour','12'::jsonb,'Maximum reports submitted by one account per hour'),
 ('friend_requests_limit_per_hour','30'::jsonb,'Maximum outgoing friend requests per account per hour'),
 ('dm_limit_per_minute','30'::jsonb,'Maximum direct-message sends per account per minute'),
 ('post_limit_per_hour','30'::jsonb,'Maximum post creation attempts per account per hour'),
 ('comment_limit_per_hour','120'::jsonb,'Maximum comments per account per hour'),
 ('upload_max_image_mb','8'::jsonb,'Maximum image upload size in MB; cannot exceed the upload pipeline hard cap'),
 ('upload_max_video_mb','8'::jsonb,'Maximum video upload size in MB; cannot exceed the upload pipeline hard cap'),
 ('upload_max_audio_mb','8'::jsonb,'Maximum audio upload size in MB; cannot exceed the upload pipeline hard cap'),
 ('allowed_media_types','["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime","audio/mpeg","audio/ogg","audio/webm","audio/wav","audio/mp4","application/pdf"]'::jsonb,'Allowed detected media MIME types for user uploads'),
 ('room_create_limit_per_day','5'::jsonb,'Maximum rooms an account may create per day'),
 ('room_default_max_members','100'::jsonb,'Default member capacity assigned to newly created rooms'),
 ('room_max_members_cap','500'::jsonb,'Absolute maximum member capacity for a room'),
 ('room_invite_limit_per_hour','60'::jsonb,'Maximum room invitations sent by one account per hour'),
 ('voice_participant_max','24'::jsonb,'Maximum simultaneous participants allowed in a room voice session'),
 ('live_create_limit_per_hour','4'::jsonb,'Maximum live sessions an account may start per hour'),
 ('live_max_viewers','8'::jsonb,'Maximum concurrent P2P viewers per live session; capped at the validated architecture limit'),
 ('live_default_slow_mode_seconds','0'::jsonb,'Default live-chat slow mode in seconds for newly created live sessions'),
 ('maintenance_mode','false'::jsonb,'Put public/user API surfaces into maintenance mode while keeping health/admin endpoints available'),
 ('maintenance_message','"جاري تحديث مربوعة، بنرجعولك خلال دقائق."'::jsonb,'Public maintenance message'),
 ('maintenance_eta_minutes','0'::jsonb,'Optional maintenance ETA in minutes')
ON CONFLICT(key) DO NOTHING;

INSERT INTO feature_flags(key,enabled,description) VALUES
 ('live',TRUE,'Live broadcasting surfaces and lifecycle'),
 ('push',TRUE,'Web Push subscription and delivery surfaces')
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS operational_verifications(
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN('backup_success','restore_success')),
  status TEXT NOT NULL DEFAULT 'success' CHECK(status IN('success','failed')),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS operational_verifications_kind_idx ON operational_verifications(kind,verified_at DESC);

CREATE OR REPLACE FUNCTION marbo3a_room_member_policy() RETURNS TRIGGER AS $$
DECLARE
  default_members INTEGER:=100;
  max_members_cap INTEGER:=500;
BEGIN
  SELECT COALESCE((value #>> '{}')::INTEGER,100) INTO default_members
    FROM admin_system_settings WHERE key='room_default_max_members';
  SELECT COALESCE((value #>> '{}')::INTEGER,500) INTO max_members_cap
    FROM admin_system_settings WHERE key='room_max_members_cap';
  default_members:=GREATEST(2,LEAST(500,COALESCE(default_members,100)));
  max_members_cap:=GREATEST(2,LEAST(500,COALESCE(max_members_cap,500)));
  IF default_members>max_members_cap THEN default_members:=max_members_cap; END IF;
  IF NEW.max_members IS NULL OR NEW.max_members=500 THEN NEW.max_members:=default_members; END IF;
  NEW.max_members:=GREATEST(2,LEAST(NEW.max_members,max_members_cap));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  NEW.max_members:=GREATEST(2,LEAST(COALESCE(NEW.max_members,100),500));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rooms_member_policy ON rooms;
CREATE TRIGGER rooms_member_policy
BEFORE INSERT OR UPDATE OF max_members ON rooms
FOR EACH ROW EXECUTE FUNCTION marbo3a_room_member_policy();
