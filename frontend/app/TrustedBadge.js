"use client";

const LABELS={official:"رسمي",admin:"إدارة مربوعة",moderator:"مشرف"};
const base={display:"inline-flex",alignItems:"center",gap:3,marginInlineStart:5,padding:"2px 6px",borderRadius:999,fontSize:9,fontWeight:900,lineHeight:1.4,verticalAlign:"middle",whiteSpace:"nowrap",border:"1px solid currentColor"};
export default function TrustedBadge({badge,className=""}){
 const key=String(badge||"").toLowerCase();
 if(!LABELS[key])return null;
 const tone=key==="admin"?{color:"#ffb45f",background:"rgba(255,180,95,.10)"}:key==="moderator"?{color:"#9fd3ff",background:"rgba(104,180,255,.10)"}:{color:"#8de3b2",background:"rgba(75,205,135,.10)"};
 return <span className={`trusted-account-badge trusted-account-badge-${key} ${className}`.trim()} style={{...base,...tone}} title={LABELS[key]} aria-label={`حساب ${LABELS[key]}`}>{key==="admin"?"✓ إدارة":key==="moderator"?"✓ مشرف":"✓ رسمي"}</span>;
}
