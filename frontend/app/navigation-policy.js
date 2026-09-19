export const APP_SHELL_EXACT=new Set([
  "/home","/feed","/search","/notifications","/friends","/messages","/rooms","/marketplace","/engagement","/map","/tv","/live","/settings","/saved","/blocked"
]);
const APP_SHELL_PREFIXES=["/u/","/profile/","/chat/","/room/","/live/"];
const PUBLIC_OR_STANDALONE_PREFIXES=["/admin","/about","/privacy","/terms","/invite/","/r/","/onboarding"];

export function isAppShellPath(path=""){
  const value=String(path||"");
  if(!value||value==="/"||PUBLIC_OR_STANDALONE_PREFIXES.some(prefix=>value.startsWith(prefix)))return false;
  return APP_SHELL_EXACT.has(value)||APP_SHELL_PREFIXES.some(prefix=>value.startsWith(prefix));
}
export function isConversationPath(path=""){
  const value=String(path||"");
  return /^\/chat\/\d+(?:\/|$)/.test(value)||/^\/room\/\d+\/chat(?:\/|$)/.test(value);
}
export function isImmersivePath(path=""){
  const value=String(path||"");
  return /^\/live\/(?!new(?:\/|$))[^/]+(?:\/|$)/.test(value);
}
export function getNavigationPolicy(path=""){
  const shell=isAppShellPath(path),immersive=isImmersivePath(path),conversation=isConversationPath(path);
  return {shell,immersive,conversation,showHeader:shell&&!immersive,showDock:shell&&!immersive,showDrawer:shell&&!immersive};
}
