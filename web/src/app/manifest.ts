import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wayfare",
    short_name: "Wayfare",
    description: "Compare every way to travel in Thailand: real timetables, prices for your day and weather-aware advice. Book every leg in one payment.",
    start_url: "/th/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#1463FF",
    background_color: "#F7F8FA",
    lang: "th",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
