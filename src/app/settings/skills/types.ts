export interface SkillRow {
  name: string;
  description: string;
  version: string;
  sourceUrl: string;
  installedAt: string;
  enabled: boolean;
  license: string | null;
  commit: string | null;
  commitShort: string | null;
}
