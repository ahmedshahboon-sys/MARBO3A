import "./globals.css";
import "./brand.css";
import "./ui-plus.css";
import { Cairo } from "next/font/google";
import AppBootstrap from "./AppBootstrap";
import AdminConsole from "./AdminConsole";

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
        {children}
        <AdminConsole />
      </body>
    </html>
  );
}
