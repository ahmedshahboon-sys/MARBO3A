"use client";
import Link from "next/link";
import {useRef} from "react";
import Icon from "./Icon";

function sizeClass(size){return size==="compact"?"ui-compact":""}

export function UiButton({children,variant="primary",size="default",type="button",className="",...props}){
  return <button type={type} className={`ui-button ui-${variant} ${sizeClass(size)} ${className}`.trim()} {...props}>{children}</button>
}

export function UiIconButton({icon,label,size="default",type="button",className="",...props}){
  return <button type={type} className={`ui-icon-button ${sizeClass(size)} ${className}`.trim()} aria-label={label} {...props}><Icon name={icon}/></button>
}

export function UiLinkButton({href,children,variant="ghost",size="default",className="",...props}){
  return <Link href={href} className={`ui-button ui-${variant} ${sizeClass(size)} ${className}`.trim()} {...props}>{children}</Link>
}

export function UiPageHeader({title,kicker="MARBO3A",backHref=null,children}){
  return <header className="ui-page-header">{backHref?<UiLinkButton href={backHref} className="ui-header-back" aria-label="رجوع"><Icon name="arrowRight"/></UiLinkButton>:<span/>}<div><small>{kicker}</small><h1>{title}</h1></div><div className="ui-header-actions">{children}</div></header>
}

export function UiCard({children,className=""}){return <section className={`ui-card ${className}`.trim()}>{children}</section>}

export function UiTabs({items,value,onChange,label,className="",panelId,renderLabel}){
  const refs=useRef([]),select=index=>{const item=items[index];if(!item)return;onChange(item.value);refs.current[index]?.focus()};
  const onKeyDown=(event,index)=>{let next=null;if(event.key==="ArrowLeft")next=(index+1)%items.length;if(event.key==="ArrowRight")next=(index-1+items.length)%items.length;if(event.key==="Home")next=0;if(event.key==="End")next=items.length-1;if(next===null)return;event.preventDefault();select(next)};
  return <div className={`ui-tabs ${className}`.trim()} role="tablist" aria-label={label}>{items.map((item,index)=>{const selected=value===item.value,id=item.id||`ui-tab-${item.value}`;return <button ref={node=>{refs.current[index]=node}} key={item.value} id={id} type="button" role="tab" tabIndex={selected?0:-1} aria-selected={selected} aria-controls={item.panelId||panelId} className={selected?"active":""} onClick={()=>onChange(item.value)} onKeyDown={event=>onKeyDown(event,index)}>{renderLabel?renderLabel(item):item.label}</button>})}</div>
}
