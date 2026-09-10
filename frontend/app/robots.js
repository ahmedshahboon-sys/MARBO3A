export default function robots() {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/messages/",
          "/chats/",
          "/settings/",
          "/notifications/"
        ]
      }
    ],
    sitemap: "https://marbo3a.ly/sitemap.xml",
    host: "https://marbo3a.ly"
  };
}
