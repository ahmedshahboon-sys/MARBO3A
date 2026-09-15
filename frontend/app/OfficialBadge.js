"use client";
export default function OfficialBadge({role,badge,className=""}){
 const value=String(badge||role||"").toLowerCase();
 if(value!=="admin"&&value!=="moderator"&&value!=="official")return null;
 const label=value==="admin"?"إدارة مربوعة":value==="moderator"?"مشرف مربوعة":"حساب رسمي";
 return <span className={`official-role-badge ${value} ${className}`.trim()} title={label} aria-label={label}>{value==="admin"?"✓ إدارة":value==="moderator"?"✓ مشرف":"✓ رسمي"}</span>;
}
