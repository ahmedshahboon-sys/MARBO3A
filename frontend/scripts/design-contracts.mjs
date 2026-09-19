import fs from "fs/promises";
let failed=false;
async function must(file,tokens){let src="";try{src=await fs.readFile(file,"utf8")}catch(e){console.error(`Missing UI contract file: ${file}`);failed=true;return}for(const token of tokens){if(!src.includes(token)){console.error(`Missing UI contract in ${file}: ${token}`);failed=true}}}
async function mustNot(file,tokens){let src="";try{src=await fs.readFile(file,"utf8")}catch(e){console.error(`Missing UI contract file: ${file}`);failed=true;return}for(const token of tokens){if(src.includes(token)){console.error(`Forbidden UI contract token in ${file}: ${token}`);failed=true}}}
await must("app/design-system.css",[
  "--ui-font:var(--font-app)","--ui-page-title:22px","--ui-section-title:18px","--ui-body:14px",
  "--ui-btn-h:44px","--ui-input-h:44px","--ui-card-radius:18px","--ui-accent:#ff7a00",
  'html[data-theme="light"]','body.ui-v3{background:var(--ui-bg)!important;color:var(--ui-text)!important}'
]);
await must("app/brand.css",["/brand/official/marbo3a-mark.png","background-size:contain","background-repeat:no-repeat"]);
await mustNot("app/brand.css",["background-image:url('/logo.svg')"]);
await must("app/ThemeRuntime.js",["marbo3a_theme","prefers-color-scheme: light","/api/settings","dataset.theme=","dataset.themePreference"]);
await must("app/ui-v3-navigation.css",["color:var(--ui-muted)!important","color:var(--ui-accent)!important","box-shadow:0 0 0 3px var(--ui-bg)!important",".about-page","var(--ui-surface)","var(--ui-text)"]);
await must("app/ui-v3-settings.css",["var(--ui-text)","var(--ui-border)","var(--ui-surface)","var(--ui-bg-elevated)"]);
await mustNot("app/ui-v3-settings.css",["rgba(13,18,24,.92)","rgba(20,27,35,.96)","color:#fff"]);
await must("app/ui-v3-messages.css",["var(--ui-accent)","var(--ui-text-2)","var(--ui-muted)"]);
await must("app/ui-v3-profile.css",["background:linear-gradient(145deg,var(--ui-surface),var(--ui-bg-elevated))","border:6px solid var(--ui-surface)!important","color:var(--ui-text)!important","background:var(--ui-surface-2)!important"]);
await must("app/ui-v3-rooms.css",["background:linear-gradient(145deg,var(--ui-surface),var(--ui-bg-elevated))","background:var(--ui-surface)","color:var(--ui-text-2)","border:1px solid var(--ui-border)"]);
await must("app/ui-v3-chat.css",["var(--ui-bg-elevated)","var(--ui-bg)!important","background:var(--ui-surface)!important","background:var(--ui-surface-2)!important","color:var(--ui-text)!important"]);
await must("app/ui-contract-lock.css",[
  "FINAL MARBO3A UI CONTRACT",".v3-audience-stats","body.story-overlay-open .v3-global-header",
  ".chat-stream>*{position:relative", ".chat-bubble{position:relative", ".social-dock"
]);
await must("app/layout.js",[
  'import "./ui-v3-unified-scale.css"','import "./ui-contract-lock.css"','import "./ui-contract-additions.css"','import "./ui-audience.css"',
  'data-site-font="readex"','import ThemeRuntime from "./ThemeRuntime"','<ThemeRuntime/>'
]);
await must("app/PremiumChrome.js",["/api/public/site-stats","v3-audience-stats","totalVisitors","onlineNow","trackingStartedAt","boxShadow:\"0 0 0 2px var(--ui-bg)\""]);
await must("app/explore/page.js",["/api/public/site-stats","guest-audience-stats","/brand/official/marbo3a-mark.png","زائر مسجل"]);
await must("app/admin/debug/page.js",["groupEvents","debug-duplicate-count","<details>"]);
await must("app/FeedModePolicy.js",["/home","الأحدث","مختار لك","feed-mode-tabs"]);
await must("app/SocialFeed.js",["useState(\"latest\")","FriendSuggestions","feed-pinned-ribbon","parentCommentId","تثبيت أعلى الرئيسية","/api/engagement/suggestions"]);
await must("app/UiRoundFixes.js",["public-room-card","smart-feed-strip","feed-more-button","real-map-canvas","sf-comment-replies","feed-friend-suggestions","install-nudge","live-notification-toast","room-system-event"]);
await must("app/RealPeopleMap.js",["basemaps.cartocdn.com","tile.openstreetmap.org","CARTO","centeredViewer"]);
await must("app/StoryRail.js",["/api/stories/mutes","story-muted-manage","shareStory","إظهار الستوريات"]);
await must("app/PlatformClient.js",["beforeinstallprompt","install-nudge","marbo3a:notification:new","live-notification-toast","3000","12000","marbo3a_install_nudge_until","dismissInstall(7)"]);
await must("app/RoomExperienceRuntime.js",["/leave","room:member-event","room-system-event"]);
if(failed)process.exit(1);
console.log("MARBO3A locked design contracts OK.");
