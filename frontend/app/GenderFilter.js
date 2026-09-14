"use client";
export default function GenderFilter({value="all",onChange,className=""}){
  return <div className={`gender-filter ${className}`} role="group" aria-label="فلترة حسب الجنس">
    {[["all","الكل"],["male","♂ ذكر"],["female","♀ أنثى"]].map(([v,label])=><button type="button" key={v} className={value===v?"active":""} aria-pressed={value===v} onClick={()=>onChange?.(v)}>{label}</button>)}
  </div>
}
