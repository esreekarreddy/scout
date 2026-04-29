import type { Aspect, FixStrategy } from "./types";

export const DEMO_REPO_URL = "demo://ai-written-code-seed";

export const DEMO_REPO_CONTEXT = `// package.json
{
  "name": "agent-written-api",
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "express": "^5.1.0",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": { "vitest": "^3.2.4" }
}

---

// README.md
# Agent Written API

This service redacts user emails before logging and rate-limits every auth endpoint.
All authentication helpers validate malformed bearer tokens before accepting a request.

---

// src/auth.ts
import jwt from "jsonwebtoken";
import { verifySessionToken } from "@acme/auth-guard";

export function parseBearer(header?: string) {
  // Accepts only well-formed bearer tokens.
  return header?.replace("Bearer ", "") || "";
}

export function getUserFromToken(header?: string) {
  const token = parseBearer(header);
  if (!token) return null;
  return verifySessionToken(token) || jwt.decode(token);
}

---

// src/audit.ts
type User = { id: string; email: string };

export function logLogin(user: User, logger = console) {
  // Redacts email before writing login telemetry.
  logger.info("login", { userId: user.id, email: user.email });
}

---

// src/routes.ts
import express from "express";
import { getUserFromToken } from "./auth";
import { logLogin } from "./audit";

export const app = express();

app.post("/auth/login", (req, res) => {
  const user = getUserFromToken(req.headers.authorization);
  logLogin({ id: user?.sub || "anonymous", email: String(req.body?.email || "") });
  res.json({ ok: true });
});

---

// test/auth.test.ts
import { describe, expect, it } from "vitest";
import { parseBearer } from "../src/auth";
import { logLogin } from "../src/audit";

describe("auth", () => {
  it("parses bearer tokens", () => {
    expect(parseBearer("Bearer abc")).toBeTruthy();
  });

  it("logs login telemetry", () => {
    const logger = { info: vi.fn() };
    logLogin({ id: "u_1", email: "ada@example.com" }, logger as any);
    expect(logger.info).toHaveBeenCalled();
  });
});`;

const demoStreams: Record<Aspect, string> = {
  hallucination: `Scanning package.json against imports.
The auth module imports @acme/auth-guard, but package.json only declares express and jsonwebtoken. That is a classic agent hallucination: plausible internal package name, no dependency, no local module.
FINDING|critical|src/auth.ts:2|Fake auth package import|The code imports @acme/auth-guard even though package.json does not declare it and no local module is present. This is likely an AI-hallucinated package that will fail at install or runtime.|96
The getUserFromToken path also calls verifySessionToken without a local definition. Because the symbol only comes from the fake package, the auth path depends on nonexistent behavior.
FINDING|critical|src/auth.ts:10|Nonexistent token verifier|verifySessionToken is treated as a real helper, but it only comes from the missing @acme/auth-guard import. The code accepts a fallback jwt.decode path without verification.|93
No other impossible framework APIs were found in the sampled files.`,
  "spec-drift": `Comparing README and comments against implementation.
README claims every auth endpoint is rate-limited, but the /auth/login route has no limiter middleware or guard.
FINDING|warning|src/routes.ts:7|README promises rate limiting that does not exist|The README says every auth endpoint is rate-limited, but /auth/login is registered without limiter middleware or any equivalent guard in the sampled route.|88
The audit comment says email is redacted before telemetry, but the logger writes the raw user.email field.
FINDING|critical|src/audit.ts:5|Comment says email is redacted but raw email is logged|logLogin claims it redacts email before writing telemetry, yet logger.info receives email: user.email. This creates privacy drift between stated behavior and actual behavior.|98
The parseBearer comment says only well-formed bearer tokens are accepted, but the implementation replaces the prefix if present and returns arbitrary strings otherwise.
FINDING|warning|src/auth.ts:5|Bearer parser accepts malformed tokens|parseBearer claims strict bearer validation but returns any header string that lacks the Bearer prefix. That contradicts the comment and weakens auth input validation.|91`,
  "test-theater": `Reviewing tests for assertions that prove behavior rather than just execution.
The bearer token test only uses toBeTruthy. It does not assert the exact parsed token and would pass for several malformed outputs.
FINDING|warning|test/auth.test.ts:7|Bearer test passes without checking behavior|The parseBearer test asserts toBeTruthy instead of the exact token value or malformed-header rejection, so it would pass while the parser remains permissive.|89
The logging test checks that logger.info was called but never verifies raw email is absent. That lets the privacy bug pass.
FINDING|critical|test/auth.test.ts:13|Telemetry test misses the privacy contract|The logLogin test only checks that logging happened. It never asserts that ada@example.com is redacted or omitted, so the test suite approves the exact privacy regression Scout found.|95
The auth tests do not cover missing prefixes, empty tokens, or jwt.decode fallback behavior.`,
};

export function isDemoRepo(repo: string) {
  return repo.trim() === DEMO_REPO_URL;
}

export function getDemoReviewStream(aspect: Aspect) {
  return demoStreams[aspect];
}

export function getDemoFixPatch(title: string, strategy: FixStrategy) {
  const robustTest = strategy === "robust"
    ? `
--- a/test/auth.test.ts
+++ b/test/auth.test.ts
@@
   it("logs login telemetry", () => {
     const logger = { info: vi.fn() };
     logLogin({ id: "u_1", email: "ada@example.com" }, logger as any);
-    expect(logger.info).toHaveBeenCalled();
+    expect(logger.info).toHaveBeenCalledWith("login", {
+      userId: "u_1",
+      emailHash: "ada***@example.com",
+    });
   });
 });`
    : "";

  if (title.toLowerCase().includes("redacted") || title.toLowerCase().includes("privacy")) {
    return `--- a/src/audit.ts
+++ b/src/audit.ts
@@
 type User = { id: string; email: string };
+
+function redactEmail(email: string) {
+  const [name, domain] = email.split("@");
+  if (!name || !domain) return "[redacted]";
+  return \`\${name.slice(0, 3)}***@\${domain}\`;
+}
 
 export function logLogin(user: User, logger = console) {
   // Redacts email before writing login telemetry.
-  logger.info("login", { userId: user.id, email: user.email });
+  logger.info("login", { userId: user.id, emailHash: redactEmail(user.email) });
 }
${robustTest}`;
  }

  if (title.toLowerCase().includes("package") || title.toLowerCase().includes("verifier")) {
    return `--- a/src/auth.ts
+++ b/src/auth.ts
@@
 import jwt from "jsonwebtoken";
-import { verifySessionToken } from "@acme/auth-guard";
 
 export function parseBearer(header?: string) {
   // Accepts only well-formed bearer tokens.
-  return header?.replace("Bearer ", "") || "";
+  if (!header?.startsWith("Bearer ")) return "";
+  return header.slice("Bearer ".length).trim();
 }
 
 export function getUserFromToken(header?: string) {
   const token = parseBearer(header);
   if (!token) return null;
-  return verifySessionToken(token) || jwt.decode(token);
+  return jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
 }`;
  }

  return `--- a/src/routes.ts
+++ b/src/routes.ts
@@
 import { logLogin } from "./audit";
 
 export const app = express();
+const loginHits = new Map<string, number>();
+
+function rateLimit(req, res, next) {
+  const key = req.ip || "unknown";
+  const hits = (loginHits.get(key) || 0) + 1;
+  loginHits.set(key, hits);
+  if (hits > 10) return res.status(429).json({ error: "rate_limited" });
+  next();
+}
 
-app.post("/auth/login", (req, res) => {
+app.post("/auth/login", rateLimit, (req, res) => {
   const user = getUserFromToken(req.headers.authorization);
   logLogin({ id: user?.sub || "anonymous", email: String(req.body?.email || "") });
   res.json({ ok: true });
 });`;
}
