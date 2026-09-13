# MARBO3A V3 style ownership

`styles.css` is the only global stylesheet manifest imported by `layout.js`. Its import order is contractual while older V2/V3 layers are retired safely.

## Final owners

- Global density, max width, safe areas and interaction sizing: `ui-v3-unified-scale.css`.
- Bottom navigation final size: `ui-v3-unified-scale.css` (`--app-dock-h` and `.social-dock*`).
- Messages final density: `ui-v3-unified-scale.css` under `.messages-v3-page`.
- Notifications final density: `ui-v3-unified-scale.css` under `.notifications-*`.
- Room/community final density and composer safe-area: `ui-v3-unified-scale.css` under `.room-community-*` and `.room-compose`.
- Route-specific files may define component structure, color, animation or feature-specific behavior, but must not become a later sizing override.

## Compatibility layers

`ui-v3.css`, `ui-v3-density.css`, `ui-v3-reference.css`, `ui-v3-navigation.css`, `ui-v3-mobile-parity.css`, `ui-v3-production-qa.css` and the older social/chat styles remain loaded for legacy selectors that are still in use. Historical comments in those files such as "loaded last" are no longer authoritative. `styles.css` defines the real order and always loads `ui-v3-unified-scale.css` last.

Do not add another global override stylesheet to fix a page-size bug. Fix the owning component/route stylesheet or the final V3 contract. Legacy layers can be deleted only after route-by-route visual comparison confirms their remaining selectors are unused.

Legacy `.sf-top` mastheads are not part of V3 DOM. A build contract prevents them from being rendered again; stale hide selectors can be removed gradually without changing production appearance.
