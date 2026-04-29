import type { MetadataRoute } from "next";
import { siteDescription, siteName } from "./seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scout - AI code verification",
    short_name: siteName,
    description: siteDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#101828",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
