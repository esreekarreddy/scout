import type { Metadata } from "next";
import { siteDescription, siteKeywords, siteName, siteTitle, siteUrl } from "./seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: siteTitle,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: siteKeywords,
  authors: [{ name: "Sreekar Reddy", url: "https://sreekarreddy.com" }],
  creator: "Sreekar Reddy",
  publisher: "Sreekar Reddy",
  category: "Developer Tools",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_AU",
    url: siteUrl,
    siteName,
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Scout patch tournament interface for verifying AI-written code",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    creator: "@esreekarreddy",
    title: siteTitle,
    description: siteDescription,
    images: ["/twitter-image"],
  },
  icons: {
    icon: "/favicon.svg",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${siteUrl}/#app`,
      name: siteName,
      url: siteUrl,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      description: siteDescription,
      creator: {
        "@type": "Person",
        name: "Sreekar Reddy",
        url: "https://sreekarreddy.com",
      },
      featureList: [
        "Specialist AI-code review agents",
        "Seeded eval scorecard",
        "Evidence pack and evidence graph",
        "Patch tournament ranking",
        "Execution-aware patch gate",
        "Official TypeScript SDK MCP server",
      ],
      keywords: siteKeywords.join(", "),
    },
    {
      "@type": "SoftwareSourceCode",
      "@id": `${siteUrl}/#source`,
      name: "Scout source code",
      codeRepository: "https://github.com/esreekarreddy/openai-codex-hackathon",
      programmingLanguage: ["TypeScript", "React", "Next.js"],
      runtimePlatform: "Node.js",
      author: {
        "@type": "Person",
        name: "Sreekar Reddy",
        url: "https://sreekarreddy.com",
      },
      isPartOf: {
        "@id": `${siteUrl}/#app`,
      },
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      name: siteName,
      url: siteUrl,
      description: siteDescription,
      publisher: {
        "@type": "Person",
        name: "Sreekar Reddy",
        url: "https://sreekarreddy.com",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-canvas text-ink">
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
