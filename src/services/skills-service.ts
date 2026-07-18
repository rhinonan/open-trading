// src/services/skills-service.ts
// Task 1 of Mastra skills infrastructure. CRUD for skills stored in data/skills/<name>/.
import fs from "node:fs";
import path from "node:path";
import { getSetting, setSetting } from "@/services/settings-service";
import { dataPath } from "@/lib/data-root";

const SKILLS_DIR = dataPath("skills");
const STAGING_DIR = dataPath("skills-staging");
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

export interface ReviewIssue {
  dimension: "security" | "execution_scope" | "license";
  severity: "error" | "warning";
  file: string | null;
  description: string;
}

export interface SkillReviewResult {
  status: "pending" | "reviewing" | "passed" | "rejected";
  reviewedAt: string | null; // ISO
  verdict: "pass" | "reject";
  summary: string;
  issues: ReviewIssue[];
}

export interface StagingFile {
  path: string;       // 相对于 batch 根目录的路径
  content: string | null; // null = 二进制文件，跳过内容审查
}

export interface SkillCandidate {
  name: string;
  description: string;
  version: string;
  sourcePath: string; // "SKILL.md" or "skills/foo/SKILL.md"
}

export interface StagingBatch {
  batchId: string;
  sourceUrl: string;
  installedAt: string;
  candidates: SkillCandidate[];
  review: SkillReviewResult;
}

function ensureSkillsDir(): void {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

function ensureStagingDir(): void {
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
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

function stagingDir(batchId: string): string {
  validateSkillName(batchId);
  const dir = path.resolve(STAGING_DIR, batchId);
  if (!dir.startsWith(path.resolve(STAGING_DIR) + path.sep) && dir !== path.resolve(STAGING_DIR)) {
    throw new Error(`Staging 路径超出范围: "${batchId}"`);
  }
  return dir;
}

function batchPath(batchId: string): string {
  return path.join(stagingDir(batchId), ".batch.json");
}

function candidateDir(batchId: string, name: string): string {
  return path.join(stagingDir(batchId), "skills", name);
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
// Staging operations (install → review → publish)
// ----------------------------------------------------------------

/** Install skills from a GitHub repo to staging. Scans root and skills/ dir for SKILL.md files. */
export async function installToStaging(url: string): Promise<StagingBatch> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error("仅支持 public GitHub 仓库 URL（github.com/<owner>/<repo> 格式）");
  }
  const { owner, repo } = parsed;

  const repoMeta = await githubApi(`/repos/${owner}/${repo}`);
  const defaultBranch = repoMeta.default_branch;

  const tree = await githubApi(`/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);

  // 找出所有 SKILL.md：根目录 + skills/*/SKILL.md
  const skillMdPaths: string[] = [];
  if (tree.tree.some((e: { path: string }) => e.path === "SKILL.md")) {
    skillMdPaths.push("SKILL.md");
  }
  const seenNames = new Set<string>();
  for (const entry of tree.tree) {
    if (!entry.path.startsWith("skills/") || !entry.path.endsWith("/SKILL.md")) continue;
    const inner = entry.path.slice("skills/".length);
    const skillName = inner.slice(0, inner.indexOf("/"));
    if (skillName && !seenNames.has(skillName)) {
      skillMdPaths.push(entry.path);
      seenNames.add(skillName);
    }
  }
  if (skillMdPaths.length === 0) {
    throw new Error("仓库根目录和 skills/ 目录下均未找到 SKILL.md");
  }

  const batchId = repo;
  const batchDir = stagingDir(batchId);
  ensureStagingDir();
  if (fs.existsSync(batchDir)) {
    throw new Error(`仓库 "${batchId}" 已在暂存区，请先处理`);
  }
  fs.mkdirSync(batchDir, { recursive: true });

  // 解析每个 SKILL.md → candidates
  const candidates: SkillCandidate[] = [];
  for (const mdPath of skillMdPaths) {
    const content = await githubApi(`/repos/${owner}/${repo}/contents/${mdPath}?ref=${defaultBranch}`);
    const md = Buffer.from(content.content, "base64").toString("utf-8");
    const front = parseFrontmatter(md);
    if (!front?.name || !front?.description) {
      throw new Error(`${mdPath} 缺少必填字段 name/description`);
    }
    // 检查 candidate 名称唯一性
    if (candidates.some((c) => c.name === front.name)) {
      throw new Error(`Skill 名称 "${front.name}" 重复`);
    }
    const dir = candidateDir(batchId, front.name!);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), md, "utf-8");
    // candidate 元数据
    const candidateMeta: SkillMeta = {
      name: front.name!,
      description: front.description!,
      version: front.version ?? "0.0.0",
      sourceUrl: url,
      installedAt: new Date().toISOString(),
      enabled: false,
      contentHash: simpleHash(md),
    };
    fs.writeFileSync(path.join(dir, ".candidate.json"), JSON.stringify(candidateMeta, null, 2), "utf-8");
    candidates.push({
      name: front.name!,
      description: front.description!,
      version: front.version ?? "0.0.0",
      sourcePath: mdPath,
    });
  }

  // 附属文件（共享文件：LICENSE、scripts 等；跳过已处理的 SKILL.md 和 skills/ 下 SKILL.md）
  const handledPaths = new Set(skillMdPaths);
  for (const entry of tree.tree) {
    if (entry.type !== "blob") continue;
    if (handledPaths.has(entry.path)) continue;
    if (entry.path.includes(".github")) continue;
    // 跳过 skills/<name>/ 下的文件（已经在 candidate dir 中）
    if (entry.path.startsWith("skills/")) {
      const inner = entry.path.slice("skills/".length);
      const slashIdx = inner.indexOf("/");
      if (slashIdx !== -1) {
        const skillName = inner.slice(0, slashIdx);
        if (candidates.some((c) => c.name === skillName)) {
          // 附属文件 belong to that candidate
          const content = await githubApi(`/repos/${owner}/${repo}/contents/${entry.path}?ref=${defaultBranch}`);
          if (typeof content.content !== "string") continue;
          const destPath = path.join(candidateDir(batchId, skillName), inner.slice(slashIdx + 1));
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.writeFileSync(destPath, Buffer.from(content.content, "base64").toString("utf-8"), "utf-8");
          continue;
        }
      }
    }
    // 其他共享文件（LICENSE 等）
    const content = await githubApi(`/repos/${owner}/${repo}/contents/${entry.path}?ref=${defaultBranch}`);
    if (typeof content.content !== "string") continue;
    const destPath = path.join(batchDir, entry.path);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, Buffer.from(content.content, "base64").toString("utf-8"), "utf-8");
  }

  // 批次元数据
  const batch: StagingBatch = {
    batchId,
    sourceUrl: url,
    installedAt: new Date().toISOString(),
    candidates,
    review: { status: "pending", reviewedAt: null, verdict: "reject", summary: "", issues: [] },
  };
  fs.writeFileSync(batchPath(batchId), JSON.stringify(batch, null, 2), "utf-8");

  return batch;
}

/** List all staging batches with their review status. */
export function listStaging(): StagingBatch[] {
  ensureStagingDir();
  const result: StagingBatch[] = [];
  for (const entry of fs.readdirSync(STAGING_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const bp = batchPath(entry.name);
    if (!fs.existsSync(bp)) continue;
    try {
      result.push(JSON.parse(fs.readFileSync(bp, "utf-8")));
    } catch {
      continue;
    }
  }
  return result;
}

/** Get a single staging batch with all file contents for review. */
export function getStaging(batchId: string): (StagingBatch & { files: StagingFile[] }) | null {
  const bp = batchPath(batchId);
  if (!fs.existsSync(bp)) return null;
  try {
    const batch: StagingBatch = JSON.parse(fs.readFileSync(bp, "utf-8"));
    const files = getStagingFilesFromDir(stagingDir(batchId));
    return { ...batch, files };
  } catch {
    return null;
  }
}

/** Walk batch directory, returning all text file contents. Binary files get content=null. */
export function getStagingFiles(batchId: string): StagingFile[] {
  const dir = stagingDir(batchId);
  if (!fs.existsSync(dir)) throw new Error(`Staging 中未找到 "${batchId}"`);
  return getStagingFilesFromDir(dir);
}

function getStagingFilesFromDir(dir: string): StagingFile[] {
  const results: StagingFile[] = [];
  const textExtensions = new Set([
    ".md", ".txt", ".json", ".yaml", ".yml", ".toml",
    ".js", ".ts", ".mjs", ".cjs", ".py", ".sh", ".bash",
    ".css", ".html", ".xml", ".svg", ".csv", ".env.example",
  ]);
  const textBasenames = new Set(["LICENSE", "Makefile", "Dockerfile", ".gitignore", ".env.example"]);

  function walk(currentDir: string, prefix: string) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") && entry.name !== ".github") continue;
        if (entry.name === "node_modules") continue;
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const isText = textExtensions.has(ext) || textBasenames.has(entry.name);
        try {
          const buf = fs.readFileSync(fullPath);
          if (isText || isUtf8File(buf)) {
            results.push({ path: relPath, content: buf.toString("utf-8") });
          } else {
            results.push({ path: relPath, content: null });
          }
        } catch {
          results.push({ path: relPath, content: null });
        }
      }
    }
  }

  walk(dir, "");
  return results;
}

function isUtf8File(buf: Buffer): boolean {
  try {
    const s = buf.toString("utf-8");
    return !s.includes("�") || buf.length < 100;
  } catch {
    return false;
  }
}

/** Publish selected candidates from a batch to permanent skills directory. Requires review verdict=pass. */
export function publishCandidates(batchId: string, names: string[]): string[] {
  const bp = batchPath(batchId);
  if (!fs.existsSync(bp)) throw new Error(`Staging 中未找到 "${batchId}"`);
  const batch: StagingBatch = JSON.parse(fs.readFileSync(bp, "utf-8"));
  if (batch.review.verdict !== "pass") {
    throw new Error(`批次 "${batchId}" 审查未通过，无法发布`);
  }

  const published: string[] = [];
  const errors: string[] = [];
  ensureSkillsDir();

  for (const name of names) {
    const candidate = batch.candidates.find((c) => c.name === name);
    if (!candidate) {
      errors.push(`"${name}" 不在候选列表中`);
      continue;
    }
    const src = candidateDir(batchId, name);
    const dest = skillDir(name);
    if (fs.existsSync(dest)) {
      errors.push(`Skill "${name}" 已存在`);
      continue;
    }
    fs.renameSync(src, dest);
    published.push(name);
  }

  // 更新 batch，移除已发布的 candidate
  const remaining = batch.candidates.filter((c) => !published.includes(c.name));
  if (remaining.length === 0) {
    // 全部发布，清理 batch
    fs.rmSync(stagingDir(batchId), { recursive: true, force: true });
  } else {
    batch.candidates = remaining;
    fs.writeFileSync(bp, JSON.stringify(batch, null, 2), "utf-8");
  }

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
  return published;
}

/** Discard a staging batch entirely. */
export function discardStaging(batchId: string): void {
  const dir = stagingDir(batchId);
  if (!fs.existsSync(dir)) throw new Error(`Staging 中未找到 "${batchId}"`);
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Write review result to the batch's .batch.json. */
export function writeReviewResult(batchId: string, result: SkillReviewResult): void {
  const bp = batchPath(batchId);
  if (!fs.existsSync(bp)) throw new Error(`Staging 中未找到 "${batchId}"`);
  const batch: StagingBatch = JSON.parse(fs.readFileSync(bp, "utf-8"));
  batch.review = result;
  fs.writeFileSync(bp, JSON.stringify(batch, null, 2), "utf-8");
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
