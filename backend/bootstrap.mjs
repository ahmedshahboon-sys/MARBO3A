// MARBO3A backend bootstrap.
// New code should use runtime.mjs and migrations. Legacy extension modules stay
// behind this explicit compatibility boundary until their routes are folded
// into domain routers. Sequential imports preserve the verified production order.
const modules=[
  "./instrumentation.mjs",
  "./debug-trace.mjs",
  "./platform-extra.mjs",
  "./core-extensions.mjs",
  "./feed-extensions.mjs",
  "./direct-extensions.mjs",
  "./social-extensions.mjs",
  "./social-ui-backend.mjs",
  "./release-hardening.mjs",
  "./media-social.mjs",
  "./calls.mjs",
  "./room-voice.mjs",
  "./launch-completion.mjs",
  "./v1-social-extra.mjs",
  "./v1-completion.mjs",
  "./message-media-fix.mjs",
  "./preflight.mjs",
  "./security-p0.mjs",
  "./realtime-v2.mjs",
  "./product-v2.mjs",
  "./experience-v2.mjs",
  "./session-control.mjs"
];
for(const module of modules)await import(module);
