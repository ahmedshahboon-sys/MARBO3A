"use client";

export default function InterfaceFixes(){
  return <style jsx global>{`
    body.ui-v3:has(.settings-route-marker) .settings-overlay{
      overflow-y:auto!important;
      overflow-x:hidden!important;
      overscroll-behavior:contain!important;
      -webkit-overflow-scrolling:touch!important;
      align-items:flex-start!important;
      min-height:100dvh!important;
      height:100dvh!important;
      padding-bottom:calc(var(--app-safe-bottom) + 18px)!important;
    }
    body.ui-v3:has(.settings-route-marker) .settings-card{
      max-height:none!important;
      height:auto!important;
      overflow:visible!important;
      margin:0 auto!important;
    }
    .ui-v3 .global-search-box:focus-within{
      outline:none!important;
      border-color:rgba(255,255,255,.12)!important;
      box-shadow:none!important;
    }
    .ui-v3 .global-search-box input:focus,
    .ui-v3 .global-search-box input:focus-visible{
      outline:none!important;
      box-shadow:none!important;
      border-color:transparent!important;
    }
    .ui-v3 .chat-bubble{
      width:fit-content!important;
      max-width:min(78%,420px)!important;
      min-width:0!important;
      min-height:0!important;
      height:auto!important;
      padding:8px 10px!important;
    }
    .ui-v3 .chat-bubble>p{margin:2px 0!important;line-height:1.48!important}
    .ui-v3 .chat-bubble.mine{margin-inline-start:auto!important;margin-inline-end:0!important}
    .ui-v3 .chat-bubble.theirs{margin-inline-start:0!important;margin-inline-end:auto!important}
    .ui-v3 .profile-v3-route .sf-profile-actions{
      display:grid!important;
      grid-template-columns:minmax(0,1.45fr) minmax(0,1fr) 48px!important;
      gap:7px!important;
      align-items:stretch!important;
      width:100%!important;
    }
    .ui-v3 .profile-v3-route .sf-profile-actions>.sf-primary,
    .ui-v3 .profile-v3-route .sf-profile-actions>button,
    .ui-v3 .profile-v3-route .sf-profile-actions>.ghost,
    .ui-v3 .profile-v3-route .sf-profile-actions .share-qr-button,
    .ui-v3 .profile-v3-route .sf-profile-actions .share-qr>details>summary{
      height:42px!important;
      min-height:42px!important;
      border-radius:12px!important;
      padding:0 10px!important;
      display:flex!important;
      align-items:center!important;
      justify-content:center!important;
      gap:6px!important;
      font-size:11px!important;
      font-weight:800!important;
      white-space:nowrap!important;
    }
    .ui-v3 .profile-v3-route .sf-profile-actions .share-qr{display:contents!important}
    .ui-v3 .profile-v3-route .sf-profile-actions .share-qr>details{position:relative!important;margin:0!important}
    .ui-v3 .profile-v3-route .sf-profile-actions .share-qr>details>summary{
      width:48px!important;
      padding:0!important;
      border:1px solid rgba(255,255,255,.12)!important;
      background:#111821!important;
      color:#ff8a1f!important;
      list-style:none!important;
    }
    .ui-v3 .profile-v3-route .sf-profile-actions .share-qr>details[open]>img{
      position:absolute!important;
      z-index:40!important;
      bottom:50px!important;
      left:0!important;
      width:190px!important;
      max-width:70vw!important;
      padding:8px!important;
      border-radius:12px!important;
      background:#fff!important;
      box-shadow:0 18px 50px rgba(0,0,0,.5)!important;
    }
    .ui-v3 .profile-v3-route .sf-profile-actions .share-qr>details[open]>small{display:none!important}
    .ui-v3 .notifications-page .sf-simple-page,
    .ui-v3 .profile-v3-route .sf-profile-page{padding-bottom:calc(var(--app-safe-bottom) + 14px)!important}
    @media(max-width:390px){
      .ui-v3 .profile-v3-route .sf-profile-actions{grid-template-columns:minmax(0,1.3fr) minmax(0,.9fr) 44px!important;gap:5px!important}
      .ui-v3 .profile-v3-route .sf-profile-actions .share-qr>details>summary{width:44px!important}
    }
  `}</style>;
}
