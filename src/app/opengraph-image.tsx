import { ImageResponse } from "next/og";
import { siteDescription } from "./seo";

export const alt = "Scout patch tournament for AI-written code";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f6f7fb",
          color: "#101828",
          padding: "72px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 28,
            fontWeight: 700,
            color: "#155eef",
          }}
        >
          <span>Scout</span>
          <span style={{ color: "#475467", fontSize: 24 }}>Agentic Coding + Evals</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 74, fontWeight: 800, lineHeight: 1.02, letterSpacing: 0, maxWidth: 900 }}>
            Patch tournaments for AI-written code.
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.35, color: "#344054", maxWidth: 960 }}>
            {siteDescription}
          </div>
        </div>
        <div style={{ display: "flex", gap: 18, fontSize: 24, color: "#344054" }}>
          <span>Evidence receipts</span>
          <span>Seeded evals</span>
          <span>MCP handoff</span>
        </div>
      </div>
    ),
    size,
  );
}
