import "./globals.css";
import AppBootstrap from "./AppBootstrap";
import AdminConsole from "./AdminConsole";

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
    <html lang="ar" dir="rtl">
      <body>
        <AppBootstrap />
        {children}
        <AdminConsole />
      </body>
    </html>
  );
}
