"use client";

const META={
  like:{label:"إعجاب",bg:"#ff7a00",fg:"#fff7ef"},
  love:{label:"أحببته",bg:"#ff4568",fg:"#fff5f7"},
  laugh:{label:"أضحكني",bg:"#ffb020",fg:"#2a1900"},
  wow:{label:"واو",bg:"#ffcf4b",fg:"#3b2700"},
  sad:{label:"أحزنني",bg:"#65a8ff",fg:"#f4f9ff"},
  angry:{label:"أغضبني",bg:"#f0563d",fg:"#fff5f1"}
};

export const reactionMeta=META;

function Glyph({type,fg}){
  if(type==="like")return <><path d="M10.2 18.7H7.1c-.8 0-1.4-.6-1.4-1.4v-6.1c0-.8.6-1.4 1.4-1.4h3.1v8.9Z" fill={fg}/><path d="M10.2 10.4c2.2-1.5 2.9-3.3 3-5.4 0-.7.6-1.2 1.2-1.1 1.7.2 2.5 1.8 2.1 3.8l-.4 2.1h2.6c1.2 0 2.1 1.1 1.8 2.3l-1.2 5c-.2 1-1.1 1.7-2.1 1.7h-7V10.4Z" fill={fg}/></>;
  if(type==="love")return <path d="M12 20.1 4.8 13.3C1.4 10.1 3.4 4.8 7.7 4.8c1.8 0 3.4.9 4.3 2.3.9-1.4 2.5-2.3 4.3-2.3 4.3 0 6.3 5.3 2.9 8.5L12 20.1Z" fill={fg}/>;
  if(type==="laugh")return <><path d="M7.1 9.1c.8-1 1.8-1 2.6 0M14.3 9.1c.8-1 1.8-1 2.6 0" stroke={fg} strokeWidth="1.7" strokeLinecap="round" fill="none"/><path d="M7.5 13.1c1 4.5 8 4.5 9 0-2.7.7-6.3.7-9 0Z" fill={fg}/><path d="M9.3 14.5h5.4" stroke="#fff" strokeOpacity=".7" strokeWidth="1.1" strokeLinecap="round"/></>;
  if(type==="wow")return <><circle cx="8.3" cy="9.1" r="1.3" fill={fg}/><circle cx="15.7" cy="9.1" r="1.3" fill={fg}/><ellipse cx="12" cy="15" rx="2.7" ry="3.4" fill={fg}/></>;
  if(type==="sad")return <><path d="M7.3 9.8c.8-.8 1.6-.8 2.4 0M14.3 9.8c.8-.8 1.6-.8 2.4 0" stroke={fg} strokeWidth="1.6" strokeLinecap="round" fill="none"/><path d="M8.6 16.9c1.9-2.1 4.9-2.1 6.8 0" stroke={fg} strokeWidth="1.8" strokeLinecap="round" fill="none"/><path d="M17 11.2c1.4 1.8 1.2 3.5-.2 4.1-1.2-.8-1.1-2.4.2-4.1Z" fill="#dff0ff"/></>;
  return <><path d="m6.8 8.1 3.1 1.2M17.2 8.1l-3.1 1.2" stroke={fg} strokeWidth="1.8" strokeLinecap="round"/><circle cx="8.7" cy="11" r="1.1" fill={fg}/><circle cx="15.3" cy="11" r="1.1" fill={fg}/><path d="M8.3 17c2-2 5.4-2 7.4 0" stroke={fg} strokeWidth="1.8" strokeLinecap="round" fill="none"/></>;
}

export default function ReactionIcon({type="like",size=24,className="",title}){
  const meta=META[type]||META.like;
  return <svg className={`marbo3a-reaction ${className}`} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title||meta.label}>
    <circle cx="12" cy="12" r="11" fill={meta.bg}/>
    <circle cx="8" cy="6.8" r="5" fill="#fff" opacity=".08"/>
    <Glyph type={type} fg={meta.fg}/>
  </svg>;
}
