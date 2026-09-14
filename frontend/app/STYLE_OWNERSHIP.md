# MARBO3A V3 style ownership

`layout.js` owns the ordered global stylesheet list. The order is contractual while older V2/V3 compatibility layers are retired safely. The locked final cascade MUST end with `ui-v3-unified-scale.css` -> `ui-contract-lock.css` -> `ui-contract-additions.css`. Route/support styles such as `ui-audience.css` must be imported before that final locked tail.

## Final owners

- Global density, max width, safe areas and interaction sizing: `ui-v3-unified-scale.css`.
- Contract enforcement and protected shared UI overrides: `ui-contract-lock.css`.
- Final additive compatibility fixes that are explicitly part of the locked design contract: `ui-contract-additions.css`.
- Product typography, color, spacing and light/dark tokens: `design-system.css`.
- Saved/system theme lifecycle: `ThemeRuntime.js`; route components must not own startup theme application.
- Official visible mark: `/brand/official/marbo3a-mark.png`. Legacy image selectors may redirect historical sources to this mark, but new visible brand references must use the official asset directly.
- Bottom navigation final size: the locked final cascade (`--app-dock-h` and `.social-dock*`).
- Messages final density: the locked final cascade under `.messages-v3-page`.
- Notifications final density: the locked final cascade under `.notifications-*`.
- Room/community final density and composer safe-area: the locked final cascade under `.room-community-*` and `.room-compose`.
- Route-specific files may define structure, colors, animation and feature-specific behavior, but must not become a later sizing override after `ui-contract-additions.css`.

## Group 3 visual consistency audit — 2026-09-15

Closed in this round:

- `.brand-mark` and `.mini-mark` no longer render the historical `/logo.svg`; both use the approved official mark directly. The historical `/logo.svg` selector in `r1-brand-override.css` remains intentionally as a compatibility safety net that redirects old image references to the official asset.
- V3 root background/text now follow `--ui-bg` / `--ui-text` instead of inheriting the older fixed dark page treatment.
- Theme startup is no longer tied to opening `SettingsPanel`. `ThemeRuntime.js` applies the cached preference at app startup, reconciles it with `/api/settings`, and follows operating-system color-scheme changes while the saved preference is `system`.
- Header notification badge framing follows design tokens instead of a fixed dark background ring.
- `ui-v3-navigation.css` uses product tokens for dock secondary/active states and the About page, so Light and Dark share one visual contract without changing route geometry.
- `/settings` route surfaces no longer force dark-only colors with `!important`; they use the same product tokens while preserving the existing layout and responsive behavior.

Guardrails:

1. Do not add a fourth stylesheet after the locked final tail.
2. Shared light/dark behavior must use design tokens rather than route-local fixed page colors, except immersive media surfaces where black/dark is intentional for viewing.
3. Do not redesign, recolor, crop or distort the approved MARBO3A mark. Compatibility selectors may only redirect stale asset references to the official mark.
4. Keep layout/density changes separate from feature behavior; route-specific visual fixes must not silently change navigation, auth, messaging, room or realtime logic.
5. Browser/device QA is still required before release closure; source ownership contracts prevent regressions but do not replace visual E2E validation.

## Compatibility layers

`ui-v3.css`, `ui-v3-density.css`, `ui-v3-reference.css`, `ui-v3-navigation.css`, `ui-v3-mobile-parity.css`, `ui-v3-production-qa.css` and older social/chat styles remain loaded only because legacy selectors are still in use. Historical comments inside those files such as "loaded last" are no longer authoritative; the ordered imports in `layout.js` and the contract checks are authoritative.

Do not add another global override stylesheet after the locked final cascade to fix a page-size bug. Fix the owning component/route stylesheet or the final V3 contract. Compatibility layers can be deleted only after route-by-route visual comparison confirms their remaining selectors are unused.

Legacy `.sf-top` mastheads are not part of V3 DOM. A build contract prevents them from being rendered again; stale hide selectors can be removed gradually without changing production appearance.
