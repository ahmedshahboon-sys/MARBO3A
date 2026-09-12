"use client";
import {usePathname} from "next/navigation";
import Icon from "./Icon";
const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";
export default function GuestBrowseEntry(){const path=usePathname();if(path!=="/"||token())return null;return <a className="guest-browse-entry" href="/explore"><Icon name="sparkles"/><span><b>تصفح مربوعة كزائر</b><small>شوف المنشورات قبل ما تنشئ حساب</small></span><Icon name="arrowLeft"/></a>}
