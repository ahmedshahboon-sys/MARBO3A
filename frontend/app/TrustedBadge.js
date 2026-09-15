"use client";

const LABELS={official:"رسمي",admin:"إدارة مربوعة",moderator:"مشرف"};
export default function TrustedBadge({badge,className=""}){
 const key=String(badge||"").toLowerCase();
 if(!LABELS[key])return null;
 return <span className={`trusted-account-badge trusted-account-badge-${key} ${className}`.trim()} title={LABELS[key]} aria-label={`حساب ${LABELS[key]}`}>{key==="admin"?"✓ إدارة":key==="moderator"?"✓ مشرف":"✓ رسمي"}</span>;
}
