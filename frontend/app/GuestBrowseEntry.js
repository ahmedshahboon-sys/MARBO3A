"use client";
import {usePathname} from "next/navigation";
import Icon from "./Icon";
const token=()=>typeof window!=="undefined"?(localStorage.getItem("marbo3a_token")||sessionStorage.getItem("marbo3a_token")||""):"";
export default function GuestBrowseEntry(){const path=usePathname();if(path!=="/"||token())return null;return <a className="guest-browse-entry guest-browse-primary" href="/explore"><span className="guest-entry-icon"><Icon name="eye"/></span><span><b>دخول كزائر</b><small>افتح مربوعة وشوف المنشورات والغرف واسمع الصوت قبل التسجيل</small></span><Icon name="arrowLeft"/></a>}
