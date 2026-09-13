"use client";
import {usePathname} from "next/navigation";
import {isAppShellPath} from "./navigation-policy";
import AppBootstrap from "./AppBootstrap";
import PlatformClient from "./PlatformClient";
import UsageTelemetry from "./UsageTelemetry";
import NavigationRuntime from "./NavigationRuntime";
import MaintenanceRuntime from "./MaintenanceRuntime";
import SessionGuard from "./SessionGuard";
import RealtimeClient from "./RealtimeClient";
import AppDataCoordinator from "./AppDataCoordinator";
import TypingRuntime from "./TypingRuntime";
import SocialHomeRedirect from "./SocialHomeRedirect";
import DebugTrace from "./DebugTrace";
import CallCenter from "./CallCenter";
import OnboardingGate from "./OnboardingGate";
import PermissionsCenter from "./PermissionsCenter";
import ContextSafety from "./ContextSafety";
import ReactionHoldBridge from "./ReactionHoldBridge";
import PremiumChrome from "./PremiumChrome";
import SettingsPanel from "./SettingsPanel";
import ExperienceEffects from "./ExperienceEffects";
import EngagementViewRuntime from "./EngagementViewRuntime";
import SideDrawer from "./SideDrawer";
import SocialDock from "./SocialDock";

export default function AppRuntime({children}){
  const path=usePathname(),app=isAppShellPath(path);
  return <>
    <AppBootstrap/><PlatformClient/><UsageTelemetry/><NavigationRuntime/><MaintenanceRuntime/>
    {app&&<><SessionGuard/><RealtimeClient/><AppDataCoordinator/><TypingRuntime/><ExperienceEffects/><EngagementViewRuntime/></>}
    <SocialHomeRedirect/>
    {app&&<><DebugTrace/><CallCenter/><OnboardingGate/><PermissionsCenter/><ContextSafety/><ReactionHoldBridge/><PremiumChrome/><SettingsPanel/></>}
    {children}
    {app&&<><SideDrawer/><SocialDock/></>}
  </>;
}
