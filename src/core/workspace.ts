import type { UplDocument } from "./types";
import { normalizeTag, type TagColor, type TagColors } from "./tags";

export const WORKSPACE_PATH = "01-personal/planner/workspace.upl.json";
export const TAG_COLORS_FIELD = "std.tag.colors";

export function emptyWorkspaceDocument(): UplDocument {
  return {
    id: "planner_workspace",
    kind: "workspace",
    "std.name": "Planner",
  };
}

export function readTagColors(value: unknown): TagColors {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const colors: TagColors = {};
  for (const [tag, entry] of Object.entries(value)) {
    const name = normalizeTag(tag);
    if (!name || !entry || typeof entry !== "object") continue;
    const candidate = entry as Partial<TagColor>;
    if (typeof candidate.text !== "string" || typeof candidate.background !== "string") continue;
    colors[name] = { text: candidate.text, background: candidate.background };
  }
  return colors;
}

export function serializeTagColors(colors: TagColors): Record<string, TagColor> | null {
  const entries = Object.entries(colors).filter(([tag]) => normalizeTag(tag).length > 0);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries);
}
