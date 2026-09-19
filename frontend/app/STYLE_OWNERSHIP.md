# MARBO3A V3 style ownership

`layout.js` owns the ordered global stylesheet list. The order is contractual while older V2/V3 compatibility layers are retired safely. The locked final cascade MUST end with `ui-v3-unified-scale.css` -> `ui-contract-lock.css` -> `ui-contract-additions.css`. Route/support styles must be imported before that tail.

## Coherence repair ownership contract — 2026-09-19

Each shared concern has one final owner. Route files may consume shared tokens and define feature structure, but they must not redefine protected global tokens.

| Domain | Final owner | Contract |
| --- | --- | --- |
| Tokens / Theme | `design-system.css` | Typography, colors, spacing, shared control heights, radii and shadows. |
| Header geometry | `ui-v3-unified-scale.css` | Owns `--app-header-h`; temporarily also owns compatibility `--v3-header-h`. |
| Bottom Dock geometry | `ui-v3-unified-scale.css` | Owns `--app-dock-h`; temporarily also owns compatibility `--v3-dock-h`. |
| Buttons / Inputs | `design-system.css` | Shared height/type/radius tokens; route files may add feature-specific variants only. |
| Feed | `social-feed.css` | Feed structure; shared scale/theme comes from central contracts. |
| Rooms | `ui-v3-room-community.css` | Community-room visual structure; voice behavior remains runtime/component owned. |
| Direct Chat | `ui-v3-chat.css` | Direct-chat visual structure. |
| Settings / Dialogs | `ui-v3-settings.css` | Settings surfaces; reusable dialog primitives stay in shared UI components. |
| Profile | `ui-v3-profile.css` | Profile route visual structure. |
| Admin | `ui-v3-admin.css` | Admin route visual structure. |
| Calls / Media Viewer | `calls.css` | Call overlay geometry; shared viewer primitives consume central tokens. |

### Protected token owners

- `--ui-font` -> `design-system.css`.
- `--ui-accent` -> `design-system.css`.
- `--app-header-h` -> `ui-v3-unified-scale.css`.
- `--app-dock-h` -> `ui-v3-unified-scale.css`.
- `--v3-header-h` -> `ui-v3-unified-scale.css` temporarily, preserving current effective legacy values until Group 2.
- `--v3-dock-h` -> `ui-v3-unified-scale.css` temporarily, preserving current effective legacy values until Group 2.

The legacy V3 geometry values were centralized without changing their effective cascade:
- base: `72px / 78px`;
- <=720px: `66px / 78px`;
- <=520px: header `68px`, dock remains `78px`.

Group 2 owns the decision to converge those compatibility values with `--app-header-h` / `--app-dock-h`; Group 1 does not guess new geometry.

## Final cascade responsibilities

- Global signed-in density, width, safe areas and interaction geometry: `ui-v3-unified-scale.css`.
- Contract enforcement and protected shared UI overrides: `ui-contract-lock.css`.
- Final additive compatibility rules already accepted into the contract: `ui-contract-additions.css`.
- Saved/system theme lifecycle: `ThemeRuntime.js`; route components must not own startup theme application.
- Official visible mark: `/brand/official/marbo3a-mark.png`. Compatibility selectors may redirect stale references but may not redesign the mark.
- Route-specific files must not become a later sizing override after `ui-contract-additions.css`.

## Filename guard

Do not add new global CSS files whose names contain `repair`, `fix`, `final` or `override`. The only grandfathered filename exceptions are:
- `ui-v3-final-audit.css` — existing compatibility layer; retirement is staged.
- `r1-brand-override.css` — existing brand compatibility redirect; retirement is staged.

Any future exception requires a documented temporary reason and explicit ownership-contract/checker update rather than silently adding another cascade layer.

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
