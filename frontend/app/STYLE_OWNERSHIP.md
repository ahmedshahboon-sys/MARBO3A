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

### Namespace ownership guard

- `--ui-*` -> `design-system.css` only. Shared typography, colors, spacing, control sizes, radii and shadows must enter the product through this namespace owner.
- `--app-*` -> `ui-v3-unified-scale.css` only during the coherence round. These tokens are app-shell geometry/spacing contracts and will be rationalized further in Group 2.
- `--v3-*` remains a temporary compatibility namespace. No new shared design token should be introduced there. The protected header/dock aliases above are already single-owner; the remaining legacy V3 tokens are retired gradually rather than deleted in bulk.

### Deferred compatibility inventory

These existing definitions are intentionally **not** treated as final design-system owners. They are compatibility debt recorded for later groups so Group 1 does not cause a visual rewrite:

- `ui-v3.css`: legacy V3 palette/surface/text/border/shadow tokens.
- `ui-v3-density.css`: legacy density/control/radius/gap tokens.
- `ui-v3-reference.css`: legacy page-width/mobile-gap/card-radius tokens.
- Fixed dark literals inside legacy/reference layers are a Theme parity concern for Group 5, not a reason to add another override layer here.

The contract now rejects any future `--ui-*` or `--app-*` declaration outside its namespace owner, even if the individual token was not previously listed in the protected-token table.

The legacy V3 geometry values were centralized without changing their effective cascade:
- base: `72px / 78px`;
- <=720px: `66px / 78px`;
- <=520px: header `68px`, dock remains `78px`.

Group 2 owns the decision to converge those compatibility values with `--app-header-h` / `--app-dock-h`; Group 1 does not guess new geometry.

## Group 2 responsive geometry contract — 2026-09-19

- Final chrome geometry comes only from `ui-v3-unified-scale.css`.
- `--app-header-h: 58px` is the content-height contract for the global header; `--app-header-total-h` adds `--app-safe-top`.
- `--app-dock-h: 62px` is the dock content-height contract; `--app-dock-total-h` adds `--app-safe-bottom`.
- `--app-page-max: 600px` is the shared signed-in content width. `--app-max` remains only as a compatibility alias.
- `--v3-header-h` and `--v3-dock-h` are compatibility aliases to the app geometry and may not carry independent breakpoint values.
- Shared responsive geometry uses 520px for mobile compaction and 720px for tablet/phone layout changes. A short-height query is allowed when vertical space, not width, is the actual constraint.
- Safe areas are part of header/dock total height instead of being added again as external fixed offsets.
- Interactive global-header actions have a 44×44 hit area. Visible icons may remain smaller.
- CI runs a real Chrome geometry matrix at 320×568, 360×640, 390×844, 412×915, 768×1024, 1024×768, 1366×768 and 1920×1080 in both Dark and Light, including simulated phone safe areas and signed-in/guest shell content.
- Critical shell width/page reserve selectors in `ui-contract-lock.css` deliberately use explicit `body.ui-v3 :is(...)` specificity because older compatibility layers contain `!important`; this is a bounded geometry-owner exception, not a new repair layer.
## Group 3 overlay/stacking contract — 2026-09-19

- `design-system.css` owns the complete `--ui-z-*` ladder.
- `useModalLayer.js` owns focus trapping, Escape routing, focus restoration and modal-depth scroll lock for Drawer, modal Settings, AppDialog, Media Viewer and Call overlay.
- Nested layers are stack-aware: only the top layer handles Tab/Escape, and closing a child leaves the parent locked.
- Toasts/install prompts sit below dialogs and media; critical call state suppresses ordinary transient UI.
- Global Header and Bottom Dock never outrank Drawer/Dialog/Media/Call layers.

## Group 4 navigation contract — 2026-09-19

- `navigation-policy.js` is the functional source of truth for Global Header, Bottom Dock and Drawer visibility.
- `/live/[id]` is immersive and does not render global navigation chrome; `/live` and `/live/new` retain normal app-shell behavior.
- Direct chat and room chat remain app-shell conversations; their page-specific heads are content headers, not replacements for route policy.
- The Bottom Dock remains five fixed destinations: المزيد، الأصحاب، الرئيسية، الرسائل، الغرف.
- CSS may style navigation and provide a dataset fallback, but may not decide whether the global chrome exists via route-content `:has()`.

## Group 5 theme/font contract — 2026-09-19

- Theme and site-font preference are applied in `<head>` before first paint from local storage, then reconciled by the existing runtimes.
- Readex Pro is the explicit default product font through `--font-app`; Cairo remains supported only when the saved/server font preference requests it.
- Shared Admin/Profile/InterfaceFixes surfaces consume `--ui-*` theme tokens. Media/call viewing backdrops may remain intentionally dark.
- Light and Dark share the same surface/border/text contracts, and nonessential motion respects `prefers-reduced-motion`.

## Group 6 core social surfaces — 2026-09-19

- Generic `main` no longer centers every page; centering is scoped to legacy Auth/Splash cards only.
- Auth surfaces consume product theme tokens and keep 16px mobile form text.
- Feed/Profile/Friends/Notifications/Messages/Search/Saved shared rows protect long Arabic/Latin identifiers and constrain media/actions to the viewport.
- Empty/Skeleton/Error states share bounded card geometry and readable tokenized text.
- Core tabs remain horizontally scrollable/snap-safe instead of clipping.

## Group 7 chat/room/call contract — 2026-09-19

- `ViewportRuntime.js` owns VisualViewport height and keyboard detection; CSS consumes `--app-viewport-h` and does not calculate a second keyboard height.
- Direct chat and room chat each have one scroll owner: the message stream. Their shell and composer remain non-scrolling flex siblings.
- Keyboard-open state hides the Bottom Dock and collapses the room live card without unmounting the voice stage.
- Call layout owns the visible viewport and central critical z-index layer; WebRTC signaling/media logic is unchanged.
- Room voice action controls keep a minimum 44px interaction target.

## Group 8 admin/settings/secondary contract — 2026-09-19

- Advanced Admin consumes the current `--app-*` geometry contract and keeps tabs/toolbars horizontally scrollable only inside their own controls.
- Admin action controls and TV Admin inputs/buttons keep a 44px minimum interaction height.
- Settings route consumes `--app-content-bottom-space`, `--app-dock-total-h` and the central stacking tokens; legacy `--v3-dock-h` is no longer its geometry source.
- Debug toolbar horizontal overflow is local to the toolbar; the page itself remains clipped to the viewport.
- Dangerous Admin/TV actions continue to use `AppDialog`; permissions, APIs and moderation behavior are unchanged.

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
