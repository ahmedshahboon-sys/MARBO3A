import http from "http";

// Transitional compatibility registry.
// Explicit domain routers are registered by server-v3 before this legacy chain is retired.
// Keep this exact order: the remaining historical modules still depend on registration order.
const nativeCreateServer=http.createServer.bind(http);

const modules=[
  // observability/platform
  "./instrumentation.mjs",
  "./debug-trace.mjs",
  "./platform-extra.mjs",
  "./core-extensions.mjs",
  "./post-media.mjs",
  // feed/social
  "./feed-extensions.mjs",
  "./direct-extensions.mjs",
  "./social-extensions.mjs",
  "./social-ui-backend.mjs",
  "./release-hardening.mjs",
  "./media-social.mjs",
  // rtc/rooms
  "./calls.mjs",
  "./room-voice.mjs",
  "./room-voice-discovery.mjs",
  // compatibility/product routes
  "./launch-completion.mjs",
  "./v1-social-extra.mjs",
  "./v1-completion.mjs",
  "./closure-routes.mjs",
  "./stories.mjs",
  "./guest-explore.mjs",
  "./message-media-fix.mjs",
  // security/map/auth
  "./security-p0.mjs",
  "./real-map.mjs",
  "./social-auth-config.mjs",
  "./social-auth.mjs",
  "./experience-v2.mjs",
  "./session-control.mjs",
  "./security-completion.mjs",
  "./audit-completion.mjs",
  "./social-experience.mjs",
  // F/G/H wrapper must be immediately inside request foundation so it registers before legacy domains.
  "./fgh-privacy-compat.mjs",
  "./request-foundation.mjs",
  // Production regression shield: last wrapper registers corrected feed/profile handlers first.
  "./fgh-regression-hotfix.mjs"
];
for(const module of modules)await import(module);

export function restoreHttpCreateServer(){
  http.createServer=nativeCreateServer;
}