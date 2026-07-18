// src/services/skills-service.ts
// Task 1 of Mastra skills infrastructure. CRUD for skills stored in data/skills/<name>/.
import fs from "node:fs";
import path from "node:path";
import { getSetting, setSetting } from "@/services/settings-service";

const SKILLS_DIR = path.join(process.cwd(), "data", "skills");
const MOUNTS_KEY = "skills_agent_mounts";

export interface SkillMeta {
  name: string;
  description: string;
  version: string;
  sourceUrl: string;
  installedAt: string; // ISO
  enabled: boolean;
  contentHash: string;
}

function ensureSkillsDir(): void {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

function parseFrontmatter(md: string): { name?: string; description?: string; version?: string } | null {
  const match = md.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const front: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (kv) front[kv[1]] = kv[2].trim();
  }
  return front;
}

function enabledFlagPath(name: string): string {
  return path.join(skillDir(name), ".enabled");
}

function simpleHash(s: string): string {
  // djb2 -- sufficient non-crypto hash, avoids crypto import
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h.toString(16);
}

function validateSkillName(name: string): void {
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`无效的 Skill 名称: "${name}"`);
  }
}

function skillDir(name: string): string {
  validateSkillName(name);
  const dir = path.resolve(SKILLS_DIR, name);
  if (!dir.startsWith(path.resolve(SKILLS_DIR) + path.sep) && dir !== path.resolve(SKILLS_DIR)) {
    throw new Error(`Skill 路径超出范围: "${name}"`);
  }
  return dir;
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

interface GitHubRepo { default_branch: string }
interface GitHubTreeEntry { path: string; type: string }
interface GitHubTree { tree: GitHubTreeEntry[] }
interface GitHubContent { content: string; encoding: string }

// GitHub API request
async function githubApi(pathStr: string): Promise<any> {
  const res = await fetch(`https://api.github.com${pathStr}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "open-trading/1.0" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} -- ${pathStr}`);
  }
  return res.json();
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/** Install a skill from a public GitHub repository URL. */
export async function installFromUrl(url: string): Promise<{ name: string; version: string }> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error("仅支持 public GitHub 仓库 URL（github.com/<owner>/<repo> 格式）");
  }
  const { owner, repo } = parsed;

  // 1. Get default branch
  const repoMeta = await githubApi(`/repos/${owner}/${repo}`);
  const defaultBranch = repoMeta.default_branch;

  // 2. Get file tree (recursive)
  const tree = await githubApi(`/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);

  // 3. Find SKILL.md
  const skillMdEntry = tree.tree.find((e: { path: string }) => e.path === "SKILL.md");
  if (!skillMdEntry) throw new Error("仓库中未找到 SKILL.md");

  // 4. Fetch SKILL.md content
  const skillContent = await githubApi(`/repos/${owner}/${repo}/contents/SKILL.md?ref=${defaultBranch}`);
  const skillMd = Buffer.from(skillContent.content, "base64").toString("utf-8");
  const front = parseFrontmatter(skillMd);
  if (!front?.name || !front?.description) {
    throw new Error("SKILL.md 缺少必填字段 name/description");
  }

  // 5. Write to data/skills/<name>/
  const installDir = skillDir(front.name);
  ensureSkillsDir();
  if (fs.existsSync(installDir)) {
    throw new Error(`Skill "${front.name}" 已存在，请先删除`);
  }
  fs.mkdirSync(installDir, { recursive: true });
  fs.writeFileSync(path.join(installDir, "SKILL.md"), skillMd, "utf-8");

  // 6. Write .meta.json
  const meta: SkillMeta = {
    name: front.name,
    description: front.description,
    version: front.version ?? "0.0.0",
    sourceUrl: url,
    installedAt: new Date().toISOString(),
    enabled: false, // default disabled
    contentHash: simpleHash(skillMd),
  };
  fs.writeFileSync(path.join(installDir, ".meta.json"), JSON.stringify(meta, null, 2), "utf-8");

  // No .enabled file written -> dynamic resolver will skip

  // 7. Download ancillary files (assets/, etc. -- text only)
  for (const entry of tree.tree) {
    if (entry.path === "SKILL.md" || entry.type !== "blob") continue;
    if (entry.path.includes(".github")) continue; // skip CI/templates
    const content = await githubApi(`/repos/${owner}/${repo}/contents/${entry.path}?ref=${defaultBranch}`);
    if (typeof content.content !== "string") continue; // skip binary files
    const destPath = path.join(installDir, entry.path);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, Buffer.from(content.content, "base64").toString("utf-8"), "utf-8");
  }

  return { name: front.name, version: front.version ?? "0.0.0" };
}

/** List all installed skills. Skips directories missing .meta.json or SKILL.md. */
export function listSkills(): SkillMeta[] {
  ensureSkillsDir();
  const result: SkillMeta[] = [];
  for (const entry of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(SKILLS_DIR, entry.name, ".meta.json");
    const skillMdPath = path.join(SKILLS_DIR, entry.name, "SKILL.md");
    if (!fs.existsSync(metaPath) || !fs.existsSync(skillMdPath)) continue;
    try {
      const meta: SkillMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      meta.enabled = fs.existsSync(enabledFlagPath(entry.name));
      result.push(meta);
    } catch {
      // Malformed .meta.json, skip gracefully
      continue;
    }
  }
  return result;
}

/** Get a single skill with its SKILL.md content. Returns null if missing or broken. */
export function getSkill(name: string): (SkillMeta & { content: string }) | null {
  const dir = skillDir(name);
  const metaPath = path.join(dir, ".meta.json");
  const skillMdPath = path.join(dir, "SKILL.md");
  if (!fs.existsSync(metaPath) || !fs.existsSync(skillMdPath)) return null;
  try {
    const meta: SkillMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    meta.enabled = fs.existsSync(enabledFlagPath(name));
    const content = fs.readFileSync(skillMdPath, "utf-8");
    return { ...meta, content };
  } catch {
    return null;
  }
}

/** Enable a skill by writing a .enabled marker file. */
export function enableSkill(name: string): void {
  const dir = skillDir(name);
  if (!fs.existsSync(dir)) throw new Error(`Skill "${name}" 不存在`);
  fs.writeFileSync(enabledFlagPath(name), "", "utf-8");
}

/** Disable a skill by removing its .enabled marker file. */
export function disableSkill(name: string): void {
  const flag = enabledFlagPath(name);
  if (fs.existsSync(flag)) fs.unlinkSync(flag);
}

/** Delete a skill directory entirely. */
export function deleteSkill(name: string): void {
  const dir = skillDir(name);
  if (!fs.existsSync(dir)) throw new Error(`Skill "${name}" 不存在`);
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Check upstream for a newer version of an installed skill. */
export async function checkUpdate(name: string): Promise<{
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  diff?: string;
} | null> {
  const skill = getSkill(name);
  if (!skill) return null;

  const parsed = parseGitHubUrl(skill.sourceUrl);
  if (!parsed) throw new Error("来源 URL 格式不支持");

  const { owner, repo } = parsed;
  const repoMeta = await githubApi(`/repos/${owner}/${repo}`);
  const skillContent = await githubApi(
    `/repos/${owner}/${repo}/contents/SKILL.md?ref=${repoMeta.default_branch}`,
  );
  const latestMd = Buffer.from(skillContent.content, "base64").toString("utf-8");
  const latestFront = parseFrontmatter(latestMd);
  const latestVersion = latestFront?.version ?? "0.0.0";

  const hasUpdate = latestVersion !== skill.version;
  let diff: string | undefined;
  if (hasUpdate) {
    diff = `版本 ${skill.version} → ${latestVersion}`;
  }
  return { currentVersion: skill.version, latestVersion, hasUpdate, diff };
}

// ----------------------------------------------------------------
// Agent mount management (stored in settings KV table)
// ----------------------------------------------------------------

const DEFAULT_MOUNTS: Record<string, string[]> = {
  evaluatorAgent: ["a-stock-data"],
};

/** Get the agent-to-skill mount mapping from settings. Merges with defaults. */
export async function getAgentSkillMounts(): Promise<Record<string, string[]>> {
  const raw = await getSetting(MOUNTS_KEY);
  if (!raw) return { ...DEFAULT_MOUNTS };
  try {
    return { ...DEFAULT_MOUNTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_MOUNTS };
  }
}

/** Persist the agent-to-skill mount mapping to settings. */
export async function setAgentSkillMounts(mounts: Record<string, string[]>): Promise<void> {
  await setSetting(MOUNTS_KEY, JSON.stringify(mounts));
}

/**
 * Resolve enabled skill paths for a given agent key.
 * Returns `data/skills/<name>` paths for skills that are both mounted on the agent and enabled.
 */
export async function getEnabledSkillPaths(agentKey: string): Promise<string[]> {
  const mounts = await getAgentSkillMounts();
  const skillNames = mounts[agentKey] ?? [];
  const all = listSkills();
  return skillNames
    .filter((name) => {
      const skill = all.find((s) => s.name === name);
      return skill && skill.enabled;
    })
    .map((name) => path.join(SKILLS_DIR, name));
}
