import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(process.cwd()),read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("Group 8 migration is additive and defines unified settings schema",()=>{
  const sql=read("migrations/040_group8_user_settings_privacy_notifications.sql");
  for(const token of ["notification_categories","quiet_hours_enabled","quiet_hours_timezone","autoplay_media","data_saver","reduced_motion","text_scale","who_can_mention","who_can_tag","conversation_notification_mutes","user_hidden_words","suppressed","device_name","deactivated_at"])assert.ok(sql.includes(token),`missing ${token}`);
  assert.doesNotMatch(sql,/DROP\s+(TABLE|COLUMN)|TRUNCATE\s+/i);
});

test("canonical settings owner covers settings mutes export and validation",()=>{
  const src=read("routes/core-user-settings.mjs"),index=read("routes/index.mjs"),legacy=read("instrumentation.mjs");
  for(const token of ["/api/settings","/api/settings/mutes","muted-conversations","hidden-words","/api/account/export","INVALID_TIMEZONE","INVALID_TEXT_SCALE","notificationCategories","quietHours"])assert.ok(src.includes(token),`missing ${token}`);
  assert.ok(index.includes("registerCoreUserSettings"));
  assert.doesNotMatch(legacy,/app\.(get|patch)\("\/api\/settings"/);
});

test("privacy source of truth includes mentions and tags without subset resets",()=>{
  const src=read("routes/fgh-social.mjs");
  for(const token of ["who_can_mention","who_can_tag","whoCanMention","whoCanTag","who_can_see_story","message_requests_enabled"])assert.ok(src.includes(token),`missing ${token}`);
  assert.match(src,/b\.whoCanMention/);
  assert.match(src,/p\.who_can_mention/);
});

test("notification preferences gate persistence visibility realtime and push",()=>{
  const migration=read("migrations/040_group8_user_settings_privacy_notifications.sql");
  const policy=read("user-preferences.mjs"),social=read("routes/core-social.mjs"),push=read("core-extensions.mjs");
  for(const token of ["marbo3a_apply_notification_preferences","user_mutes","user_hidden_words","notification_categories"])assert.ok(migration.includes(token),`migration missing ${token}`);
  for(const token of ["quiet_hours","muted_conversation","hidden_word","notificationDeliveryState"])assert.ok(policy.includes(token),`policy missing ${token}`);
  assert.match(social,/suppressed=FALSE/);
  assert.match(social,/if\(!row\.suppressed\)emitUser/);
  assert.match(push,/notificationDeliveryState/);
});

test("data rights include step-up deactivation and factor-safe reactivation",()=>{
  const account=read("routes/account-security.mjs"),auth=read("routes/auth-session.mjs"),settings=read("routes/core-user-settings.mjs");
  for(const token of ["/api/account/deactivate","account_deactivated","deactivated_at","destroySession","clearSessionCookie"])assert.ok(account.includes(token),`account missing ${token}`);
  for(const token of ["reactivate:u.account_status===\"deactivated\"","account_reactivated","password+2fa"])assert.ok(auth.includes(token),`auth missing ${token}`);
  assert.match(settings,/Content-Disposition/);
  assert.doesNotMatch(settings,/password_hash|token_hash|session_hash/);
});

test("trusted device naming is owned by session control",()=>{
  const src=read("session-control.mjs");
  for(const token of ["device_name","app.patch(\"/api/account/sessions/:id\"","DEVICE_NAME_REQUIRED","SESSION_RENAME_FAILED"])assert.ok(src.includes(token),`missing ${token}`);
});
