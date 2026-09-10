import "./globals.css";
import "./brand.css";
import "./ui-plus.css";
import "./platform.css";
import "./advanced.css";
import "./social-feed.css";
import "./social-pages.css";
import "./social-hubs.css";
import "./chat-social.css";
import { Cairo } from "next/font/google";
import AppBootstrap from "./AppBootstrap";
import PlatformClient from "./PlatformClient";
import SettingsPanel from "./SettingsPanel";
import AdminConsole from "./AdminConsole";
import ChatBridge from "./ChatBridge";
import SocialDock from "./SocialDock";
import SocialHomeRedirect from "./SocialHomeRedirect";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-cairo"
});

export const metadata = {
  title: "مربوعة | MARBO3A",
  description: "مكانك للتواصل، الغرف، والأصحاب",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/logo.svg", apple: "/logo.svg" },
  appleWebApp: { capable: true, title: "مربوعة", statusBarStyle: "black-translucent" }
};

export const viewport = {
  themeColor: "#FF7A00",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable}>
      <body className={cairo.className}>
        <AppBootstrap />
        <PlatformClient />
        <SocialHomeRedirect />
        {children}
        <SocialDock />
        <SettingsPanel />
        <AdminConsole />
        <ChatBridge />
      </body>
    </html>
  );
}
