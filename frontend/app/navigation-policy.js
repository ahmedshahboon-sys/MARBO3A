export const APP_SHELL_EXACT=new Set([
  "/home","/feed","/search","/notifications","/friends","/messages","/rooms","/marketplace","/engagement","/map","/settings","/saved","/blocked"
]);
const APP_SHELL_PREFIXES=["/u/","/profile/","/chat/","/room/"];
export function isAppShellPath(path=""){
  const value=String(path||"");
  if(!value||value==="/"||value.startsWith("/admin")||value.startsWith("/about")||value.startsWith("/privacy")||value.startsWith("/terms")||value.startsWith("/invite/")||value.startsWith("/r/")||value.startsWith("/onboarding"))return false;
  return APP_SHELL_EXACT.has(value)||APP_SHELL_PREFIXES.some(prefix=>value.startsWith(prefix));
}
