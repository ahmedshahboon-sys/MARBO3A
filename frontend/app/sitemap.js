export default function sitemap() {
  const now = new Date();
  return [
    {
      url: "https://marbo3a.ly/",
      lastModified: now,
      changeFrequency: "daily",
      priority: 1
    },
    {
      url: "https://marbo3a.ly/feed",
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.8
    }
  ];
}
