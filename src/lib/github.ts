import { DEMO_REPO_CONTEXT, isDemoRepo } from "./demo-fixtures";
import type { RepoFileInput } from "./patch-executor";

const BASE = "https://api.github.com";

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "codex-syd-scout",
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

/** Parse https://github.com/owner/repo - { owner, repo } */
export function parseGitHubUrl(
  url: string
): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

type GHEntry = { name: string; path: string; type: "file" | "dir"; size: number };
type GHTreeEntry = {
  path: string;
  type: "blob" | "tree" | "commit";
  size?: number;
};

const MAX_FILES = 18;
const MAX_FILE_CHARS = 2600;
const MAX_TOTAL_CHARS = 42000;

/** Fetch a small representative sample of the repo as a single string. */
export async function fetchRepoContext(repoUrl: string): Promise<string> {
  if (isDemoRepo(repoUrl)) return DEMO_REPO_CONTEXT;

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) return "// Could not parse repo URL.";

  const { owner, repo } = parsed;
  const headers = ghHeaders();

  const treeContext = await fetchBoundedTreeContext(owner, repo, headers);
  if (treeContext) return treeContext;

  // 1. Root contents
  const rootRes = await fetch(`${BASE}/repos/${owner}/${repo}/contents`, {
    headers,
    next: { revalidate: 300 },
  });
  if (!rootRes.ok) return `// GitHub API error ${rootRes.status} - add GITHUB_TOKEN to .env.local to avoid rate limits.`;
  const root: GHEntry[] = await rootRes.json();

  // 2. Grab package.json or equivalent for project shape
  const pkgFile = root.find((f) => f.name === "package.json" || f.name === "pyproject.toml");
  const srcDir = root.find((f) => f.type === "dir" && (f.name === "src" || f.name === "app" || f.name === "lib"));

  const sections: string[] = [];

  if (pkgFile) {
    const txt = await fetchFileText(owner, repo, pkgFile.path, headers);
    if (txt) sections.push(`// ${pkgFile.path}\n${txt.slice(0, 1500)}`);
  }

  // 3. Sample a few source files
  const candidates = root.filter(
    (f) =>
      f.type === "file" &&
      f.size < 8000 &&
      /\.(ts|tsx|js|py|rb|go|rs)$/.test(f.name) &&
      f.name !== "package.json"
  );

  // Also look one level into src/
  if (srcDir) {
    const srcRes = await fetch(
      `${BASE}/repos/${owner}/${repo}/contents/${srcDir.path}`,
      { headers, next: { revalidate: 300 } }
    );
    if (srcRes.ok) {
      const srcEntries: GHEntry[] = await srcRes.json();
      candidates.push(
        ...srcEntries.filter(
          (f) => f.type === "file" && f.size < 6000 && /\.(ts|tsx|js|py)$/.test(f.name)
        )
      );
    }
  }

  const toFetch = candidates.slice(0, 4);
  const fileTexts = await Promise.all(
    toFetch.map(async (f) => {
      const txt = await fetchFileText(owner, repo, f.path, headers);
      return txt ? `// ${f.path}\n${txt.slice(0, 1800)}${txt.length > 1800 ? "\n// truncated" : ""}` : null;
    })
  );

  sections.push(...fileTexts.filter(Boolean) as string[]);
  return sections.join("\n\n---\n\n") || "// Empty repo or no readable source files found.";
}

export async function fetchRepoFiles(repoUrl: string): Promise<RepoFileInput[]> {
  if (isDemoRepo(repoUrl)) return contextToRepoFiles(DEMO_REPO_CONTEXT);

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) return [];

  const { owner, repo } = parsed;
  const headers = ghHeaders();
  const tree = await fetchInspectableTree(owner, repo, headers);
  if (!tree) return [];

  const files: RepoFileInput[] = [];
  for (const entry of tree.files) {
    const content = await fetchFileText(owner, repo, entry.path, headers);
    if (content) files.push({ path: entry.path, content });
  }
  return files;
}

async function fetchBoundedTreeContext(
  owner: string,
  repo: string,
  headers: Record<string, string>,
): Promise<string | null> {
  const tree = await fetchInspectableTree(owner, repo, headers);
  if (!tree) return null;

  const sections: string[] = [];
  let usedChars = tree.truncated ? "// GitHub tree was truncated, using highest-priority files only.\n\n" : "";

  for (const file of tree.files) {
    if (usedChars.length >= MAX_TOTAL_CHARS) break;
    const txt = await fetchFileText(owner, repo, file.path, headers);
    if (!txt) continue;
    const slice = txt.slice(0, MAX_FILE_CHARS);
    const section = `// ${file.path}\n${slice}${txt.length > MAX_FILE_CHARS ? "\n// truncated" : ""}`;
    if (usedChars.length + section.length > MAX_TOTAL_CHARS) break;
    sections.push(section);
    usedChars += section;
  }

  return sections.length ? `${repoHeader(owner, repo)}\n\n${sections.join("\n\n---\n\n")}` : null;
}

async function fetchInspectableTree(
  owner: string,
  repo: string,
  headers: Record<string, string>,
): Promise<{ files: GHTreeEntry[]; truncated: boolean } | null> {
  const metaRes = await fetch(`${BASE}/repos/${owner}/${repo}`, {
    headers,
    next: { revalidate: 300 },
  });
  if (!metaRes.ok) return null;

  const meta: { default_branch?: string } = await metaRes.json();
  const branch = meta.default_branch ?? "main";
  const treeRes = await fetch(
    `${BASE}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers, next: { revalidate: 300 } },
  );
  if (!treeRes.ok) return null;

  const data: { tree?: GHTreeEntry[]; truncated?: boolean } = await treeRes.json();
  const files = (data.tree ?? [])
    .filter((entry) => entry.type === "blob" && shouldInspectPath(entry.path, entry.size ?? 0))
    .sort((a, b) => scorePath(b.path) - scorePath(a.path))
    .slice(0, MAX_FILES);

  return { files, truncated: data.truncated ?? false };
}

function repoHeader(owner: string, repo: string) {
  return `// Repo: ${owner}/${repo}\n// Context mode: bounded GitHub tree\n// File cap: ${MAX_FILES}`;
}

function shouldInspectPath(path: string, size: number) {
  if (size > 12000) return false;
  if (/(^|\/)(node_modules|dist|build|coverage|\.next|\.git)\//.test(path)) return false;
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path)) return false;
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|json|md|toml|yaml|yml)$/.test(path);
}

function scorePath(path: string) {
  let score = 0;
  const lower = path.toLowerCase();

  if (/^(readme|agents|claude|package|tsconfig|pyproject|go\.mod|cargo)\./.test(lower)) score += 80;
  if (lower.includes("test") || lower.includes("spec")) score += 70;
  if (/^(src|app|lib|server|api)\//.test(lower)) score += 65;
  if (lower.includes("auth") || lower.includes("audit") || lower.includes("security")) score += 40;
  if (lower.includes("rate") || lower.includes("limit") || lower.includes("privacy")) score += 35;
  if (lower.endsWith(".md")) score += 20;
  if (lower.endsWith(".json")) score += 10;
  if (path.split("/").length > 4) score -= 20;

  return score;
}

async function fetchFileText(
  owner: string,
  repo: string,
  path: string,
  headers: Record<string, string>
): Promise<string | null> {
  const res = await fetch(`${BASE}/repos/${owner}/${repo}/contents/${path}`, {
    headers,
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  const data: { content?: string } = await res.json();
  if (!data.content) return null;
  return Buffer.from(data.content, "base64").toString("utf-8");
}

function contextToRepoFiles(context: string): RepoFileInput[] {
  const files: RepoFileInput[] = [];
  for (const section of context.split(/\n---\n/g)) {
    const lines = section.trim().split("\n");
    const header = lines.shift();
    const match = /^\/\/\s+(.+)$/.exec(header ?? "");
    if (!match) continue;
    files.push({ path: match[1], content: `${lines.join("\n")}\n` });
  }
  return files;
}
