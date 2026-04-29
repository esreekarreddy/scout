import { DEMO_REPO_CONTEXT, isDemoRepo } from "./demo-fixtures";

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

/** Fetch a small representative sample of the repo as a single string. */
export async function fetchRepoContext(repoUrl: string): Promise<string> {
  if (isDemoRepo(repoUrl)) return DEMO_REPO_CONTEXT;

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) return "// Could not parse repo URL.";

  const { owner, repo } = parsed;
  const headers = ghHeaders();

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
