"use client";
import {useEffect} from "react";

const COPY=new Map(Object.entries({
  "تسجيل الدخول":"خش لحسابك",
  "تسجيل الخروج":"اطلع من الحساب",
  "إنشاء حساب":"افتح حساب",
  "إنشاء الحساب":"افتح حساب",
  "سجل الآن":"سجّل توا",
  "لدي حساب":"عندي حساب",
  "عندي حساب":"عندي حساب",
  "إرسال":"ابعث",
  "إرسال الرد":"ابعث الرد",
  "إرسال رسالة":"ابعث رسالة",
  "إلغاء":"خلاص",
  "إغلاق":"سكّر",
  "حفظ":"احفظ",
  "حذف":"امسح",
  "حذف التعليق":"امسح التعليق",
  "حذف الرسالة":"امسح الرسالة",
  "تعديل":"عدّل",
  "تعديل الملف":"عدّل ملفك",
  "تعديل الملف الشخصي":"عدّل ملفك",
  "مشاركة":"شارك",
  "مشاركة الغرفة":"شارك الغرفة",
  "مشاركة المنشور":"شارك المنشور",
  "بحث":"دوّر",
  "البحث":"دوّر",
  "بحث في الغرف":"دوّر في الغرف",
  "بحث داخل الغرفة":"دوّر داخل الغرفة",
  "ابحث في المحادثة...":"دوّر في المحادثة...",
  "ابحث عن غرفة؟":"دوّر على غرفة...",
  "جاري التحميل...":"لحظة، بنحمّل...",
  "جاري...":"لحظة...",
  "إعادة المحاولة":"جرّب من جديد",
  "المزيد":"زيادة",
  "الإشعارات":"التنبيهات",
  "الأصدقاء":"الأصحاب",
  "طلبات الصداقة":"طلبات الإضافة",
  "إضافة صديق":"ضيفه",
  "طلب صداقة":"طلب إضافة",
  "تم إرسال الطلب":"الطلب انبعث",
  "تم الإرسال ✓":"انبعت ✓",
  "الرسائل":"الرسايل",
  "رسالة":"رسالة",
  "غرفة جديدة":"مربوعة جديدة",
  "إنشاء الغرفة":"افتح الغرفة",
  "جميع الغرف":"كل الغرف",
  "كل الغرف":"كل الغرف",
  "نتائج البحث":"نتايج البحث",
  "لا توجد نتائج":"ما لقيناش نتايج",
  "لا يوجد":"ما فيش",
  "غير متوفر":"مش متوفر",
  "الإعدادات":"الإعدادات",
  "الملف الشخصي":"ملفي",
  "ملفي الشخصي":"ملفي",
  "المحفوظات":"المحفوظ",
  "المحظورون":"المحظورين",
  "حول مربوعة":"على مربوعة",
  "العودة":"ارجع",
  "رجوع":"ارجع",
  "التالي":"اللي بعده",
  "السابق":"اللي قبله",
  "قبول":"اقبل",
  "رفض":"ارفض",
  "انضمام":"خش",
  "دخول":"خش",
  "دخول مباشر":"خش على طول",
  "طلب انضمام":"اطلب تخش",
  "بانتظار الموافقة":"نستنو في الموافقة",
  "تمت القراءة":"تقرت",
  "اكتب رسالتك هنا...":"اكتب رسالتك...",
  "اكتب رسالتك...":"اكتب رسالتك...",
  "كتم":"سكّر المايك",
  "إنهاء":"سكّر",
  "مكبر الصوت":"السبيكر",
  "الصوت المباشر":"الصوت لايف",
  "مباشر":"لايف",
  "المثبتة":"المثبت",
  "عرض":"شوف",
  "فتح المرفق":"افتح المرفق",
  "إرفاق ملف":"ضيف ملف",
  "خيارات الرسالة":"خيارات الرسالة",
  "خيارات التعليق":"خيارات التعليق"
}));
const UI_SELECTOR="button,a,label,option,nav span,header span,header small,[aria-label],[title],input,textarea";
const EXCLUDE=".sf-post-body,.guest-post-body,.chat-bubble,.room-community-message-main>p,.profile-bio,.story-viewer,.media-gallery,[contenteditable='true']";
function translate(value){const s=String(value||''),trim=s.trim(),next=COPY.get(trim);if(!next||next===trim)return null;return s.replace(trim,next)}
function translateNode(root){
  const nodes=[];
  if(root.nodeType===Node.ELEMENT_NODE&&root.matches?.(UI_SELECTOR))nodes.push(root);
  root.querySelectorAll?.(UI_SELECTOR).forEach(el=>nodes.push(el));
  for(const el of nodes){
    if(el.closest?.(EXCLUDE))continue;
    for(const attr of ['placeholder','aria-label','title']){if(el.hasAttribute?.(attr)){const next=translate(el.getAttribute(attr));if(next)el.setAttribute(attr,next)}}
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){if(n.parentElement?.closest(EXCLUDE))continue;const next=translate(n.nodeValue);if(next)n.nodeValue=next}
  }
}
export default function LibyanDialectRuntime(){
  useEffect(()=>{
    translateNode(document.body);
    const observer=new MutationObserver(records=>{for(const r of records){if(r.type==='characterData'){const p=r.target.parentElement;if(p)translateNode(p)}else for(const n of r.addedNodes){if(n.nodeType===Node.ELEMENT_NODE)translateNode(n)}}});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title']});
    return()=>observer.disconnect();
  },[]);
  return null;
}
