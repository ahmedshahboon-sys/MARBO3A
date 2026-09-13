"use client";
import dynamic from "next/dynamic";
import {usePathname} from "next/navigation";
import {isAppShellPath} from "./navigation-policy";

const AppBootstrap=dynamic(()=>import("./AppBootstrap"),{ssr:false});
const PlatformClient=dynamic(()=>import("./PlatformClient"),{ssr:false});
const NavigationRuntime=dynamic(()=>import("./NavigationRuntime"),{ssr:false});
const SocialHomeRedirect=dynamic(()=>import("./SocialHomeRedirect"),{ssr:false});
const GuestBrowseEntry=dynamic(()=>import("./GuestBrowseEntry"),{ssr:false});
const SessionGuard=dynamic(()=>import("./SessionGuard"),{ssr:false});
const RealtimeClient=dynamic(()=>import("./RealtimeClient"),{ssr:false});
const AppDataCoordinator=dynamic(()=>import("./AppDataCoordinator"),{ssr:false});
const TypingRuntime=dynamic(()=>import("./TypingRuntime"),{ssr:false});
const DebugTrace=dynamic(()=>import("./DebugTrace"),{ssr:false});
const CallCenter=dynamic(()=>import("./CallCenter"),{ssr:false});
const OnboardingGate=dynamic(()=>import("./OnboardingGate"),{ssr:false});
const ContextSafety=dynamic(()=>import("./ContextSafety"),{ssr:false});
const ReactionHoldBridge=dynamic(()=>import("./ReactionHoldBridge"),{ssr:false});
const PremiumChrome=dynamic(()=>import("./PremiumChrome"),{ssr:false});
const SettingsPanel=dynamic(()=>import("./SettingsPanel"),{ssr:false});
const SideDrawer=dynamic(()=>import("./SideDrawer"),{ssr:false});
const SocialDock=dynamic(()=>import("./SocialDock"),{ssr:false});

export default function AppRuntime(){
  const path=usePathname(),app=isAppShellPath(path),conversation=/^\/chat\/\d+(?:\/|$)/.test(path)||/^\/room\/\d+\/chat(?:\/|$)/.test(path),admin=path?.startsWith("/admin");
  return <>
    <AppBootstrap/><PlatformClient/><NavigationRuntime/><SocialHomeRedirect/><GuestBrowseEntry/>
    {app&&<><SessionGuard/><RealtimeClient/><AppDataCoordinator/><TypingRuntime/><OnboardingGate/><ContextSafety/><PremiumChrome/><SettingsPanel/><SideDrawer/><SocialDock/></>}
    {app&&!admin&&<CallCenter/>}
    {app&&!conversation&&<ReactionHoldBridge/>}
    {app&&<DebugTrace/>}
  </>;
}
