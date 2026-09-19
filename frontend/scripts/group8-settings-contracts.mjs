import fs from "fs";
const read=p=>fs.readFileSync(p,"utf8");
let failed=false;
function must(file,tokens,label=file){const src=read(file);for(const token of tokens)if(!src.includes(token)){console.error(`Missing Group8 ${label}: ${token}`);failed=true}}
function mustNot(file,tokens,label=file){const src=read(file);for(const token of tokens)if(src.includes(token)){console.error(`Forbidden Group8 ${label}: ${token}`);failed=true}}

must("app/PrivacySettingsPanel.js",["/api/privacy","whoCanMessage","whoCanCall","whoCanInviteRoom","whoCanSeePosts","whoCanSeeStory","whoCanReplyStory","whoCanSeeFriends","showOnline","showLastSeen","showCity","birthVisibility","readReceipts","messageRequestsEnabled","whoCanMention","whoCanTag"]);
must("app/SettingsPanel.js",["PrivacySettingsPanel","notification_categories","quiet_hours_enabled","mutedConversations","hiddenWords","autoplay_media","data_saver","reduced_motion","text_scale","/api/account/export","device_name","/api/account/sessions/"]);
must("app/settings/privacy/page.js",["PrivacySettingsPanel","مصدر واحد"]);
mustNot("app/settings/privacy/page.js",["/api/privacy/v2","fetch("],"duplicate privacy route logic");
must("app/AccountSecurityPanel.js",["/api/account/deactivate","تعطيل الحساب مؤقتًا","7 أيام","clearCookieSession"]);
must("app/ThemeRuntime.js",["dataset.reducedMotion","dataset.dataSaver","dataset.autoplayMedia","style.fontSize","marbo3a_user_preferences"]);
must("app/MediaGallery.js",["dataSaver","autoplay&&!dataSaver","preload={dataSaver?\"none\":\"metadata\"}"]);
must("app/chat/[id]/page.js",["/api/settings/muted-conversations/","كتم إشعارات المحادثة"]);\nmust("app/ui-v3-settings.css",['html[data-reduced-motion="true"]',"settings-inline-form"]);
if(failed)process.exit(1);
console.log("Group 8 unified settings/privacy frontend contracts OK");
