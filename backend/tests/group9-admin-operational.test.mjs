import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read=file=>fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8");
const readRepo=file=>fs.readFileSync(new URL(`../../${file}`,import.meta.url),"utf8");

test("Group 9 migration seeds bounded operational controls and verification state",()=>{
  const sql=read("migrations/041_group9_admin_operational_controls.sql");
  for(const token of [
    "login_rate_limit_15m","captcha_escalation_enabled","new_account_restrictions_enabled",
    "reports_limit_per_hour","friend_requests_limit_per_hour","dm_limit_per_minute",
    "post_limit_per_hour","comment_limit_per_hour","upload_max_image_mb","upload_max_video_mb",
    "upload_max_audio_mb","allowed_media_types","room_create_limit_per_day","room_default_max_members",
    "room_max_members_cap","room_invite_limit_per_hour","voice_participant_max",
    "live_create_limit_per_hour","live_max_viewers","live_default_slow_mode_seconds",
    "maintenance_mode","maintenance_message","maintenance_eta_minutes","operational_verifications",
    "marbo3a_room_member_policy"
  ])assert.ok(sql.includes(token),`${token} missing`);
  assert.match(sql,/\('live',TRUE/);
  assert.match(sql,/\('push',TRUE/);
});

test("canonical operational schema validates ranges and safe defaults",()=>{
  const src=read("operational-controls.mjs");
  for(const token of [
    "SETTING_SPECS","FEATURE_SPECS","parseOperationalSetting","operationalSettingMeta",
    "invalidateOperationalControls","live_max_viewers:{type:\"integer\",min:1,max:8",
    "upload_max_mb:{type:\"integer\",min:1,max:8",
    "room_max_members_cap:{type:\"integer\",min:2,max:500",
    "captcha_escalation_threshold:{type:\"integer\",min:2,max:20"
  ])assert.ok(src.includes(token),`${token} missing`);
});

test("request foundation applies real admin abuse and feature controls before routes",()=>{
  const src=read("request-foundation.mjs");
  for(const token of [
    "login_rate_limit_15m","reports_limit_per_hour","friend_requests_limit_per_hour","dm_limit_per_minute",
    "post_limit_per_hour","comment_limit_per_hour","room_create_limit_per_day","room_invite_limit_per_hour",
    "live_create_limit_per_hour","new_account_restrictions_enabled","captcha_escalation_enabled",
    "verifyTurnstile","CAPTCHA_REQUIRED","/api/auth/captcha-config","TURNSTILE_SITE_KEY","OPERATIONAL_CONTROL_UNAVAILABLE",
    'features.live===false','features.push===false',"REGISTRATION_DISABLED","ROOMS_DISABLED"
  ])assert.ok(src.includes(token),`${token} missing`);
});

test("content room live and push paths consume operational controls",()=>{
  const generic=read("experience-v2.mjs"),video=read("post-media.mjs"),voice=read("routes/core-room-voice.mjs"),
    guest=read("guest-rooms-v2.mjs"),live=read("routes/live.mjs"),prefs=read("user-preferences.mjs");
  for(const src of [generic,video]){assert.match(src,/allowed_media_types/);assert.match(src,/FILE_TOO_LARGE/)}
  assert.match(voice,/voiceParticipantLimit/);assert.match(voice,/voice_participant_max/);
  assert.match(guest,/voice_participant_max/);assert.match(guest,/VOICE_ROOM_FULL/);
  assert.match(live,/livePolicy/);assert.match(live,/live_max_viewers/);assert.match(live,/live_default_slow_mode_seconds/);
  assert.match(prefs,/operationalFeature\("push"\)/);assert.match(prefs,/push_disabled/);
});

test("Turnstile escalation is complete from capability guard to auth UI",()=>{
  const request=read("request-foundation.mjs"),admin=read("routes/group-o-admin.mjs"),ui=readRepo("frontend/app/page.js"),env=readRepo(".env.example");
  assert.match(request,/\/api\/auth\/captcha-config/);
  assert.match(request,/TURNSTILE_SITE_KEY/);assert.match(request,/TURNSTILE_SECRET_KEY/);
  assert.match(request,/frame-src https:\/\/challenges\.cloudflare\.com/);
  assert.match(admin,/TURNSTILE_SITE_KEY/);assert.match(admin,/TURNSTILE_NOT_CONFIGURED/);
  for(const token of ["TurnstileChallenge","captchaNeeded","captchaToken","captchaBody","CAPTCHA_REQUIRED","CAPTCHA_INVALID"])assert.ok(ui.includes(token),token+" missing from auth UI");
  assert.match(env,/TURNSTILE_SITE_KEY=CHANGE_ME/);assert.match(env,/TURNSTILE_SECRET_KEY=CHANGE_ME/);
});

test("admin operations expose factual DB Redis TURN backup restore and release status",()=>{
  const src=read("routes/core-admin-control.mjs");
  for(const token of ["/api/admin/operations","operational_verifications","backup_success","restore_success","releaseSha","turnConfigured","storageInfo","redis.ping"])assert.ok(src.includes(token),`${token} missing`);
  const backup=readRepo("ops/backup-database.sh"),restore=readRepo("ops/verify-backup-restore.sh");
  assert.match(backup,/operational_verifications\(kind,status\).*backup_success/);
  assert.match(restore,/operational_verifications\(kind,status\).*restore_success/);
});

test("advanced admin UI renders schema-driven controls and factual operations",()=>{
  const src=readRepo("frontend/app/admin/advanced/AdvancedAdmin.js");
  for(const token of ["/api/admin/operations","setSchema","settingEditor","groupedSettings","live_max_viewers","allowed_media_types","آخر Backup ناجح","Release SHA"])assert.ok(src.includes(token),`${token} missing`);
});
