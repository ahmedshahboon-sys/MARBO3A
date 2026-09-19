"use client";

import {useEffect} from "react";
import {sessionMarker,cookieHeaders} from "./webSession";

const THEME_KEY="marbo3a_theme";
const validTheme=value=>["dark","light","system"].includes(value)?value:"dark";

function resolvedTheme(theme,media){
  return theme==="system"?(media.matches?"light":"dark"):theme;
}

function applyTheme(theme,media){
  const choice=validTheme(theme);
  document.documentElement.dataset.theme=resolvedTheme(choice,media);
  document.documentElement.dataset.themePreference=choice;
  try{localStorage.setItem(THEME_KEY,choice)}catch{}
}

export default function ThemeRuntime(){
  useEffect(()=>{
    const media=window.matchMedia("(prefers-color-scheme: light)");
    let preference=validTheme(document.documentElement.dataset.themePreference||localStorage.getItem(THEME_KEY)||"dark");
    applyTheme(preference,media);

    const onSystemChange=()=>{if(preference==="system")applyTheme(preference,media)};
    media.addEventListener?.("change",onSystemChange);

    const onThemeControl=event=>{
      const control=event.target?.closest?.('select[aria-label="المظهر"]');
      if(!control)return;
      preference=validTheme(control.value);
      applyTheme(preference,media);
    };
    document.addEventListener("change",onThemeControl,true);

    let cancelled=false;
    const token=sessionMarker();
    if(token){
      fetch("/api/settings",{
        cache:"no-store",
        credentials:"same-origin",
        headers:cookieHeaders(),
      }).then(response=>response.ok?response.json():null).then(data=>{
        if(cancelled||!data?.settings?.theme)return;
        preference=validTheme(data.settings.theme);
        applyTheme(preference,media);
      }).catch(()=>{});
    }

    return()=>{
      cancelled=true;
      media.removeEventListener?.("change",onSystemChange);
      document.removeEventListener("change",onThemeControl,true);
    };
  },[]);
  return null;
}
