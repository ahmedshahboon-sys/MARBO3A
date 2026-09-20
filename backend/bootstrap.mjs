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
  "./social-extensions.mjs",
  "./social-ui-backend.mjs",
  "./release-hardening.mjs",
  "./media-social.mjs",
  // rtc/rooms
  // compatibility/product routes
  "./launch-completion.mjs",
  "./v1-social-extra.mjs",
  "./v1-completion.mjs",
  "./closure-routes.mjs",
  "./guest-explore.mjs",
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
  // Corrected F/G/H routes wrap the original F/G/H compatibility layer.
  "./fgh-privacy-compat.mjs",
  // I/J/K/L surfaces wrap older room/story/map/guest handlers.
  "./ijkl-experience.mjs",
  "./ijkl-room-guard.mjs",
  // Guest identity, room cards, guest listeners and room-seat experience.
  "./guest-rooms-v2.mjs",
  // R1 owns smart feed ranking, sponsored posts, threaded comments/reactions and room voice recovery/moderation.
  "./r1-core-experience.mjs",
  // Preserve a moderator force-mute if the member reconnects or navigates away and back.
  // R1 safety middleware registers ahead of R1 routes and preserves blocking/orphan-reply guarantees.
  "./r1-safety.mjs",
  // Request observability wraps the historical route chain, while request-foundation remains
  // the final import so security/parsing middleware is still registered first at runtime.
  "./observability-foundation.mjs",
  "./request-foundation.mjs"
];
for(const module of modules)await import(module);

export function restoreHttpCreateServer(){
  http.createServer=nativeCreateServer;
}
