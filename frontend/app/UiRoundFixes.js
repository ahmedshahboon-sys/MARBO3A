"use client";

export default function UiRoundFixes(){
  return <style jsx global>{`
    /* Home room rail: match the compact room-card scale used by the rooms route. */
    .ui-v3 .public-room-track{gap:10px!important;padding:2px 2px 6px!important;scroll-snap-type:x proximity!important}
    .ui-v3 .public-room-card{flex:0 0 min(252px,74vw)!important;width:min(252px,74vw)!important;min-width:0!important;border-radius:16px!important;overflow:hidden!important;scroll-snap-align:start!important;background:var(--ui-surface,#111821)!important;border:1px solid var(--ui-border,rgba(255,255,255,.1))!important}
    .ui-v3 .public-room-cover{min-height:112px!important;height:112px!important;padding:10px!important;display:flex!important;align-items:flex-end!important;border-radius:15px 15px 0 0!important;background-color:var(--ui-surface-2,#171e28)!important;background-size:cover!important;background-position:center!important;position:relative!important;overflow:hidden!important}
    .ui-v3 .public-room-cover>img{position:absolute!important;inset:18px auto auto 50%!important;transform:translateX(-50%)!important;width:48px!important;height:48px!important;object-fit:contain!important;opacity:.78!important}
    .ui-v3 .public-room-cover>div{position:relative!important;z-index:2!important;min-width:0!important}.ui-v3 .public-room-cover h3{margin:0!important;font-size:14px!important;line-height:1.25!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}.ui-v3 .public-room-cover p{margin:3px 0 0!important;font-size:10px!important;line-height:1.35!important;color:var(--ui-text-2,#b8c0cb)!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    .ui-v3 .public-room-card-meta{padding:8px 9px 5px!important;display:grid!important;grid-template-columns:1fr 1fr!important;gap:5px!important}.ui-v3 .public-room-card-meta span{font-size:9px!important;display:flex!important;align-items:center!important;gap:4px!important;color:var(--ui-muted,#8f99a7)!important}.ui-v3 .public-room-card-meta span:last-child{grid-column:1/-1!important}.ui-v3 .public-room-card-meta svg{width:14px!important;height:14px!important}
    .ui-v3 .public-room-enter{height:38px!important;min-height:38px!important;margin:5px 8px 8px!important;width:calc(100% - 16px)!important;border-radius:11px!important;font-size:11px!important;font-weight:850!important}
    .ui-v3 .public-room-rail>header{margin-bottom:6px!important}.ui-v3 .public-room-rail>header h2{font-size:22px!important;line-height:1.2!important}.ui-v3 .public-room-rail>header small{font-size:10px!important}

    /* Feed mode: the explanatory smart strip is removed; only compact choices remain. */
    .ui-v3 .smart-feed-strip{display:none!important}
    .ui-v3 .feed-mode-tabs{display:flex!important;gap:7px!important;overflow-x:auto!important;overscroll-behavior-inline:contain!important;scrollbar-width:none!important;padding:6px 0 9px!important;margin:0!important}
    .ui-v3 .feed-mode-tabs::-webkit-scrollbar{display:none!important}
    .ui-v3 .feed-mode-tabs button{flex:0 0 auto!important;min-height:38px!important;height:38px!important;padding:0 13px!important;border-radius:999px!important;font-size:11px!important;font-weight:800!important;background:var(--ui-surface,#111821)!important;border:1px solid var(--ui-border,rgba(255,255,255,.1))!important;color:var(--ui-text-2,#c0c7d1)!important}
    .ui-v3 .feed-mode-tabs button.active{background:var(--ui-accent-soft,rgba(255,122,0,.12))!important;border-color:rgba(255,122,0,.55)!important;color:var(--ui-accent-2,#ff9b43)!important}
    .ui-v3 .feed-mode-tabs button:nth-child(3){order:-5}.ui-v3 .feed-mode-tabs button:nth-child(2){order:-4}.ui-v3 .feed-mode-tabs button:nth-child(4){order:-3}.ui-v3 .feed-mode-tabs button:nth-child(5){order:-2}.ui-v3 .feed-mode-tabs button:nth-child(1){order:-1}

    /* Load-more is a first-class MARBO3A control, not a browser-grey button. */
    .ui-v3 .feed-more-button{width:100%!important;min-height:44px!important;margin:10px 0 calc(var(--app-safe-bottom,78px) + 8px)!important;border-radius:14px!important;border:1px solid rgba(255,122,0,.42)!important;background:linear-gradient(105deg,rgba(255,122,0,.18),rgba(255,122,0,.08))!important;color:var(--ui-accent-2,#ff9b43)!important;font-size:12px!important;font-weight:850!important;box-shadow:none!important}
    .ui-v3 .feed-more-button:disabled{opacity:.55!important;color:var(--ui-muted,#8f99a7)!important;background:var(--ui-surface-2,#171e28)!important;border-color:var(--ui-border,rgba(255,255,255,.1))!important}

    /* Close-only dialogs render one full-width action. */
    .ui-v3 .app-dialog footer.single-action{grid-template-columns:1fr!important;display:grid!important}.ui-v3 .app-dialog footer.single-action>button{width:100%!important;min-width:0!important}

    /* Map surface polish: keep controls clear of the dock and prevent label overlays from looking like form controls. */
    .ui-v3 .real-map-canvas{direction:ltr!important;isolation:isolate!important;background:#dfe5e8!important}
    .ui-v3 .real-map-tiles img{direction:ltr!important;image-rendering:auto!important}
    .ui-v3 .real-map-controls{inset-inline-start:12px!important;inset-inline-end:auto!important;top:12px!important;gap:7px!important}.ui-v3 .real-map-controls button{width:42px!important;height:42px!important;min-width:42px!important;min-height:42px!important;border-radius:12px!important}
    .ui-v3 .real-map-attribution{font-size:8px!important;direction:ltr!important;background:rgba(255,255,255,.82)!important;color:#26313a!important;padding:2px 5px!important;border-radius:6px 0 0 0!important}

    @media(max-width:430px){
      .ui-v3 .public-room-card{flex-basis:min(238px,72vw)!important;width:min(238px,72vw)!important}.ui-v3 .public-room-cover{height:106px!important;min-height:106px!important}.ui-v3 .public-room-rail>header h2{font-size:20px!important}
      .ui-v3 .feed-mode-tabs button{height:36px!important;min-height:36px!important;padding-inline:12px!important;font-size:10.5px!important}
    }
  `}</style>;
}
