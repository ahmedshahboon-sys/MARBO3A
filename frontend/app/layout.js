import "./globals.css";
import "./brand.css";
import "./ui-plus.css";
import "./platform.css";
import { Cairo } from "next/font/google";
import AppBootstrap from "./AppBootstrap";
import PlatformClient from "./PlatformClient";
import SettingsPanel from "./SettingsPanel";
import AdminConsole from "./AdminConsole";

const cairo=Cairo({subsets:["arabic","latin"],weight:["400","500","600","700","800","900"],display:"swap",variable:"--font-cairo"});
export const metadata={metadataBase:new URL("https://marbo3a.ly"),title:"مربوعة | MARBO3A",description:"مكانك للتواصل، الغرف، والأصحاب",manifest:"/manifest.webmanifest",applicationName:"مربوعة",appleWebApp:{capable:true,title:"مربوعة",statusBarStyle:"black-translucent"},icons:{icon:"/logo.svg",apple:"/logo.svg"},openGraph:{title:"مربوعة",description:"مكانك للتواصل، الغرف، والأصحاب",url:"https://marbo3a.ly",siteName:"مربوعة",locale:"ar_LY",type:"website"}};
export const viewport={themeColor:"#FF7A00",width:"device-width",initialScale:1,viewportFit:"cover",colorScheme:"dark light"};
export default function RootLayout({children}){return <html lang="ar" dir="rtl" className={cairo.variable}><body className={cairo.className}><AppBootstrap/><PlatformClient/>{children}<SettingsPanel/><AdminConsole/></body></html>;}
