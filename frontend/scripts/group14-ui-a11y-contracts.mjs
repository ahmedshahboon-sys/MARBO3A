import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const must=(src,needle,label)=>{if(!src.includes(needle))throw new Error(label+": missing "+needle)};

const layout=read("app/layout.js");
must(layout,'<html lang="ar" dir="rtl"',"RTL root");

const a11y=read("app/accessibility.css");
for(const t of ["button:focus-visible","a:focus-visible","input:focus-visible","prefers-reduced-motion:reduce","animation-duration:.001ms","transition-duration:.001ms"])must(a11y,t,"accessibility CSS");

const modal=read("app/useModalLayer.js");
for(const t of ['e.key==="Escape"',"document.addEventListener(\"keydown\"", "previous.focus", "document.activeElement===first", "document.activeElement===last"])must(modal,t,"modal focus trap");

const dialog=read("app/AppDialog.js");
for(const t of ['role="dialog"','aria-modal="true"','aria-labelledby="app-dialog-title"','variant={danger?"danger":"primary"}'])must(dialog,t,"app dialog");

const viewport=read("app/ViewportRuntime.js");
for(const t of ["window.visualViewport","data-keyboard-open","--marbo3a-keyboard-h","focusin","focusout"])must(viewport,t,"keyboard viewport");

const settings=read("app/SettingsPanel.js");
for(const t of ['aria-label="إعدادات مربوعة"','settings-empty','تعذر حفظ الإعدادات','reduced_motion','text_scale'])must(settings,t,"settings states");

const notifications=read("app/notifications/page.js");
for(const t of ["تعذر تحميل التنبيهات","ما فيش تنبيهات توا",'role="status"',"disabled={busy||unread===0}"])must(notifications,t,"notification states");

const messages=read("app/messages/page.js");
for(const t of ["جاري التحميل...","تعذر تحميل الرسائل","ما عندكش محادثات توا",'aria-label="إعادة الاتصال"'])must(messages,t,"message states");

const rooms=read("app/rooms/page.js");
for(const t of ["جاري...","تعذر","ROOM_BANNED","ROOM_FULL","disabled={busy"])must(rooms,t,"room states");

const voice=read("app/RoomVoiceStage.js");
for(const t of ['aria-label="الصوت المباشر"',"جاري الدخول كمستمع...","تعذر تحديث الصوت المباشر","المشرف كتم المايكروفون"])must(voice,t,"room voice states");

const calls=read("app/CallCenter.js");
for(const t of ['className={\`call-overlay',"جاري الاتصال...","تعذر بدء المكالمة","aria-label=\"مكالمة مربوعة\""])must(calls,t,"call states");

const live=read("app/live/page.js");
for(const t of ["live-page","live-status","تعذر","ما فيش"])must(live,t,"live states");

const lock=read("app/ui-contract-lock.css");
for(const t of ["Group 14 final accessibility lock",".live-watch-reactions button",".story-viewer-head-actions button",".real-map-controls button",".install-nudge>button","min-width:44px!important","min-height:44px!important"])must(lock,t,"touch target lock");

const nativeDialogPattern=/(^|[^.\w$])(window\.)?(alert|confirm|prompt)\(/m;
for(const file of fs.readdirSync("app",{recursive:true}).filter(x=>String(x).endsWith(".js"))){
  const src=read("app/"+file);
  if(nativeDialogPattern.test(src))throw new Error("browser-native dialog found: app/"+file);
}

console.log("Group 14 UI/accessibility contracts OK · RTL/focus/reduced-motion/keyboard/states/destructive dialog/touch locks");
