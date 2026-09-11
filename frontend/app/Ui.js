"use client";
import Link from "next/link";
import Icon from "./Icon";
export function UiButton({children,variant="primary",className="",...props}){return <button className={`ui-button ui-${variant} ${className}`.trim()} {...props}>{children}</button>}
export function UiIconButton({icon,label,className="",...props}){return <button className={`ui-icon-button ${className}`.trim()} aria-label={label} {...props}><Icon name={icon}/></button>}
export function UiLinkButton({href,children,variant="ghost",className="",...props}){return <Link href={href} className={`ui-button ui-${variant} ${className}`.trim()} {...props}>{children}</Link>}
export function UiPageHeader({title,kicker="MARBO3A",backHref=null,children}){return <header className="ui-page-header">{backHref?<UiLinkButton href={backHref} className="ui-header-back"><Icon name="close"/></UiLinkButton>:<span/>}<div><small>{kicker}</small><h1>{title}</h1></div><div className="ui-header-actions">{children}</div></header>}
export function UiCard({children,className=""}){return <section className={`ui-card ${className}`.trim()}>{children}</section>}
