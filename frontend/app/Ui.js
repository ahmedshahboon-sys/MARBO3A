"use client";
import Link from "next/link";
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
