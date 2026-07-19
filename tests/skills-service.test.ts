// tests/skills-service.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  detectLicense,
  publishCandidates,
  listSkills,
} from "@/services/skills-service";

const ORIGINAL_DATA_ROOT = process.env.DATA_ROOT;
let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skills-test-"));
  process.env.DATA_ROOT = tmpRoot;
});

afterEach(() => {
  if (ORIGINAL_DATA_ROOT === undefined) delete process.env.DATA_ROOT;
  else process.env.DATA_ROOT = ORIGINAL_DATA_ROOT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("detectLicense", () => {
  it("识别 MIT / Apache-2.0", () => {
    expect(detectLicense("MIT License\n\nCopyright")).toBe("MIT");
    expect(detectLicense("Apache License\nVersion 2.0, January 2004")).toBe("Apache-2.0");
    expect(detectLicense("proprietary stuff")).toBeNull();
  });
});

describe("publishCandidates meta 规范化", () => {
  it("将 .candidate.json 转为 .meta.json 后 listSkills 可见", () => {
    const batchId = "demo-repo";
    const skillName = "demo-skill";
    // 手工构造 staging 结构
    const stagingSkill = path.join(tmpRoot, "skills-staging", batchId, "skills", skillName);
    fs.mkdirSync(stagingSkill, { recursive: true });
    fs.writeFileSync(
      path.join(stagingSkill, "SKILL.md"),
      "---\nname: demo-skill\ndescription: d\nversion: 1.0.0\n---\nbody\n",
      "utf-8",
    );
    const candidate = {
      name: skillName,
      description: "d",
      version: "1.0.0",
      sourceUrl: "https://github.com/o/r",
      installedAt: new Date().toISOString(),
      enabled: false,
      contentHash: "abc",
      license: "MIT",
      commit: "abcdef1234567890",
      commitShort: "abcdef1",
    };
    fs.writeFileSync(path.join(stagingSkill, ".candidate.json"), JSON.stringify(candidate, null, 2));
    // LICENSE 在 batch 根
    fs.writeFileSync(path.join(tmpRoot, "skills-staging", batchId, "LICENSE"), "MIT License\n", "utf-8");
    const batch = {
      batchId,
      sourceUrl: "https://github.com/o/r",
      installedAt: new Date().toISOString(),
      candidates: [
        {
          name: skillName,
          description: "d",
          version: "1.0.0",
          sourcePath: "SKILL.md",
        },
      ],
      review: {
        status: "passed",
        reviewedAt: new Date().toISOString(),
        verdict: "pass",
        summary: "ok",
        issues: [],
      },
    };
    fs.writeFileSync(
      path.join(tmpRoot, "skills-staging", batchId, ".batch.json"),
      JSON.stringify(batch, null, 2),
    );

    const result = publishCandidates(batchId, [skillName]);
    expect(result.published).toEqual([skillName]);
    expect(result.errors).toEqual([]);

    const dest = path.join(tmpRoot, "skills", skillName);
    expect(fs.existsSync(path.join(dest, ".meta.json"))).toBe(true);
    expect(fs.existsSync(path.join(dest, ".candidate.json"))).toBe(false);
    expect(fs.existsSync(path.join(dest, "LICENSE"))).toBe(true);

    const listed = listSkills();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe(skillName);
    expect(listed[0].license).toBe("MIT");
    expect(listed[0].commitShort).toBe("abcdef1");
  });

  it("overwrite=false 时已存在返回 errors 且不抛", () => {
    // 先放一个正式 skill
    const dest = path.join(tmpRoot, "skills", "demo-skill");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "SKILL.md"), "x", "utf-8");
    fs.writeFileSync(
      path.join(dest, ".meta.json"),
      JSON.stringify({
        name: "demo-skill",
        description: "old",
        version: "0.1.0",
        sourceUrl: "https://github.com/o/r",
        installedAt: "2020-01-01T00:00:00.000Z",
        enabled: false,
        contentHash: "x",
        license: null,
        commit: null,
        commitShort: null,
      }),
      "utf-8",
    );
    // staging candidate 同名
    const batchId = "demo-repo";
    const stagingSkill = path.join(tmpRoot, "skills-staging", batchId, "skills", "demo-skill");
    fs.mkdirSync(stagingSkill, { recursive: true });
    fs.writeFileSync(path.join(stagingSkill, "SKILL.md"), "new", "utf-8");
    fs.writeFileSync(
      path.join(stagingSkill, ".candidate.json"),
      JSON.stringify({
        name: "demo-skill",
        description: "new",
        version: "2.0.0",
        sourceUrl: "https://github.com/o/r",
        installedAt: new Date().toISOString(),
        enabled: false,
        contentHash: "y",
        license: null,
        commit: null,
        commitShort: null,
      }),
    );
    fs.writeFileSync(
      path.join(tmpRoot, "skills-staging", batchId, ".batch.json"),
      JSON.stringify({
        batchId,
        sourceUrl: "https://github.com/o/r",
        installedAt: new Date().toISOString(),
        candidates: [
          {
            name: "demo-skill",
            description: "new",
            version: "2.0.0",
            sourcePath: "SKILL.md",
          },
        ],
        review: {
          status: "passed",
          reviewedAt: new Date().toISOString(),
          verdict: "pass",
          summary: "ok",
          issues: [],
        },
      }),
    );

    const result = publishCandidates(batchId, ["demo-skill"], {
      overwrite: false,
    });
    expect(result.published).toEqual([]);
    expect(result.errors.some((e: string) => e.includes("已存在"))).toBe(true);
    const meta = JSON.parse(fs.readFileSync(path.join(dest, ".meta.json"), "utf-8"));
    expect(meta.version).toBe("0.1.0");
  });

  it("overwrite=true 覆盖并保留 enabled", () => {
    const dest = path.join(tmpRoot, "skills", "demo-skill");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "SKILL.md"), "old", "utf-8");
    fs.writeFileSync(path.join(dest, ".enabled"), "", "utf-8");
    fs.writeFileSync(
      path.join(dest, ".meta.json"),
      JSON.stringify({
        name: "demo-skill",
        description: "old",
        version: "0.1.0",
        sourceUrl: "https://github.com/o/r",
        installedAt: "2020-01-01T00:00:00.000Z",
        enabled: false,
        contentHash: "x",
        license: null,
        commit: null,
        commitShort: null,
      }),
    );
    const batchId = "demo-repo";
    const stagingSkill = path.join(tmpRoot, "skills-staging", batchId, "skills", "demo-skill");
    fs.mkdirSync(stagingSkill, { recursive: true });
    fs.writeFileSync(path.join(stagingSkill, "SKILL.md"), "new body", "utf-8");
    fs.writeFileSync(
      path.join(stagingSkill, ".candidate.json"),
      JSON.stringify({
        name: "demo-skill",
        description: "new",
        version: "2.0.0",
        sourceUrl: "https://github.com/o/r",
        installedAt: new Date().toISOString(),
        enabled: false,
        contentHash: "y",
        license: "MIT",
        commit: "11111112222222",
        commitShort: "1111111",
      }),
    );
    fs.writeFileSync(
      path.join(tmpRoot, "skills-staging", batchId, ".batch.json"),
      JSON.stringify({
        batchId,
        sourceUrl: "https://github.com/o/r",
        installedAt: new Date().toISOString(),
        candidates: [
          {
            name: "demo-skill",
            description: "new",
            version: "2.0.0",
            sourcePath: "SKILL.md",
          },
        ],
        review: {
          status: "passed",
          reviewedAt: new Date().toISOString(),
          verdict: "pass",
          summary: "ok",
          issues: [],
        },
      }),
    );

    const result = publishCandidates(batchId, ["demo-skill"], {
      overwrite: true,
    });
    expect(result.published).toEqual(["demo-skill"]);
    const meta = JSON.parse(fs.readFileSync(path.join(dest, ".meta.json"), "utf-8"));
    expect(meta.version).toBe("2.0.0");
    expect(fs.existsSync(path.join(dest, ".enabled"))).toBe(true);
    expect(fs.readFileSync(path.join(dest, "SKILL.md"), "utf-8")).toContain("new body");
  });

  it("listSkills 迁移幽灵 .candidate.json", () => {
    const dest = path.join(tmpRoot, "skills", "ghost");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "SKILL.md"), "body", "utf-8");
    fs.writeFileSync(
      path.join(dest, ".candidate.json"),
      JSON.stringify({
        name: "ghost",
        description: "g",
        version: "1.0.0",
        sourceUrl: "https://github.com/o/r",
        installedAt: "2020-01-01T00:00:00.000Z",
        enabled: false,
        contentHash: "z",
      }),
    );

    const listed = listSkills();
    expect(listed).toHaveLength(1);
    expect(listed[0].name).toBe("ghost");
    expect(fs.existsSync(path.join(dest, ".meta.json"))).toBe(true);
    expect(fs.existsSync(path.join(dest, ".candidate.json"))).toBe(false);
  });
});
