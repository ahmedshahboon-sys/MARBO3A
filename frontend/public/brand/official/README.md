# MARBO3A official brand source

The approved MARBO3A identity is centralized under this directory.

- `marbo3a-mark.svg` is the canonical vector application/social mark used by the UI, OpenGraph rendering, maintenance gate, onboarding, login, and fallback brand surfaces.
- PWA raster derivatives (`pwa-192.png`, `pwa-512.png`, `apple-touch-icon.png`, `pwa-maskable-512.png`) remain separate generated/committed derivatives of the approved identity.
- Do not embed base64 raster data inside the canonical SVG. Keep the canonical source as normal vector SVG so it is reliable in browsers, Docker builds, maintenance mode, and caches.
- The approved visual identity uses the dark circular badge, white Arabic wordmark, and orange accents.

Do not introduce independent logo artwork elsewhere in the project. All new surfaces must reference the canonical brand assets from this directory.
