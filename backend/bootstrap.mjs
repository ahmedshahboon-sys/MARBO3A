import http from "http";

// Keep the historical extension chain contained to one boot-time registration pass.
// server-v3 restores Node's native createServer immediately after the app is built.
const nativeCreateServer=http.createServer.bind(http);

const modules=[
  "./instrumentation.mjs",
  "./debug-trace.mjs",
  "./platform-extra.mjs",
  "./core-extensions.mjs",
  "./post-media.mjs",
  "./feed-extensions.mjs",
  "./direct-extensions.mjs",
  "./social-extensions.mjs",
  "./social-ui-backend.mjs",
  "./release-hardening.mjs",
  "./media-social.mjs",
  "./calls.mjs",
  "./room-voice.mjs",
  "./room-voice-discovery.mjs",
  "./launch-completion.mjs",
  "./v1-social-extra.mjs",
  "./v1-completion.mjs",
  "./closure-routes.mjs",
  "./experience-stage1.mjs",
  "./stories.mjs",
  "./guest-explore.mjs",
  "./message-media-fix.mjs",
  "./security-p0.mjs",
  "./real-map.mjs",
  "./realtime-v2.mjs",
  "./social-auth-config.mjs",
  "./social-auth.mjs",
  "./experience-v2.mjs",
  "./session-control.mjs",
  "./security-completion.mjs",
  "./audit-completion.mjs",
  "./social-experience.mjs",
  "./request-foundation.mjs"
];
for(const module of modules)await import(module);

export function restoreHttpCreateServer(){
  http.createServer=nativeCreateServer;
}
