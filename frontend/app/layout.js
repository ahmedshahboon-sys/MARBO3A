import "./globals.css";

export const metadata = {
  title: "MARBO3A | مربوعة",
  description: "منصة تواصل اجتماعي ليبية"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
