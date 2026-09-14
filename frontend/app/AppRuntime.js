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
import RoomVoiceR1Runtime from "./RoomVoiceR1Runtime";
import RoomExperienceRuntime from "./RoomExperienceRuntime";
import SideDrawer from "./SideDrawer";
import SocialDock from "./SocialDock";
import SiteFontRuntime from "./SiteFontRuntime";
import FeedModePolicy from "./FeedModePolicy";
import UiRoundFixes from "./UiRoundFixes";
import ViewportRuntime from "./ViewportRuntime";
import LibyanDialectRuntime from "./LibyanDialectRuntime";

export default function AppRuntime({children}){
  const path=usePathname(),app=isAppShellPath(path);
  return <>
    <ViewportRuntime/><LibyanDialectRuntime/><AppBootstrap/><SiteFontRuntime/><PlatformClient/><UsageTelemetry/><NavigationRuntime/><MaintenanceRuntime/>
    {app&&<><SessionGuard/><RealtimeClient/><AppDataCoordinator/><TypingRuntime/><ExperienceEffects/><EngagementViewRuntime/><RoomVoiceR1Runtime/><RoomExperienceRuntime/><FeedModePolicy/><UiRoundFixes/></>}
    <SocialHomeRedirect/>
    {app&&<><DebugTrace/><CallCenter/><OnboardingGate/><PermissionsCenter/><ContextSafety/><ReactionHoldBridge/><PremiumChrome/><SettingsPanel/></>}
    {children}
    {app&&<><SideDrawer/><SocialDock/></>}
  </>;
}
