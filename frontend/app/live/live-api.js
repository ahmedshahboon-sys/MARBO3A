import {sessionMarker,cookieHeaders} from "../webSession";
export const liveToken=()=>sessionMarker();

export async function liveApi(path,options={}){
  liveToken();
  const headers=cookieHeaders(options.headers||{});
  if(options.body&&!(options.body instanceof FormData)&&!headers["content-type"])headers["content-type"]="application/json";
  const response=await fetch(path,{...options,headers,cache:"no-store",credentials:"same-origin"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||"REQUEST_FAILED");error.status=response.status;error.retryAfter=Number(data.retryAfter)||0;throw error}
  return data;
}

export const liveErrorText=e=>({
  UNAUTHORIZED:"الجلسة انتهت. خش لحسابك من جديد.",
  LIVE_NOT_FOUND:"اللايف هذا مش موجود.",
  LIVE_ENDED:"اللايف سكّر.",
  LIVE_FULL:"اللايف وصل للحد الحالي من المشاهدين.",
  LIVE_BLOCKED:"صاحب اللايف منعك من الدخول للايف هذا.",
  LIVE_NOT_JOINED:"لازم تعاود تدخل للايف.",
  LIVE_JOIN_FAILED:"تعذر الدخول للايف توا.",
  LIVE_CHAT_MUTED:"صاحب اللايف كاتمك من الشات.",
  LIVE_CHAT_CLOSED:"الشات مقفول توا من صاحب اللايف.",
  LIVE_SLOW_MODE:e?.retryAfter?`استنى ${e.retryAfter} ثواني قبل الرسالة الجاية.`:"الشات على الوضع البطيء.",
  FORBIDDEN:"ما عندكش صلاحية للحركة هذي.",
  BAD_SIGNAL:"صار خلل في ربط البث.",
  BAD_SIGNAL_ROLE:"صار خلل في ترتيب ربط البث. حاول من جديد.",
  VIEWER_GONE:"المشاهد طلع من اللايف.",
  EMPTY_MESSAGE:"اكتب حاجة الأول.",
  BAD_REACTION:"التفاعل هذا مش مدعوم.",
  CANNOT_REPORT_SELF:"ما تقدرش تبلغ على لايفك.",
  REQUEST_FAILED:"صار خلل. جرّب من جديد."
}[e?.message]||"صار خلل. جرّب من جديد.");
