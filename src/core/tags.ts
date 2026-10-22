import type { UplTask } from "./types";

export interface TagColor {
  text: string;
  background: string;
}

export type TagColors = Record<string, TagColor>;

const NEUTRAL_TEXT = "#1e293b";
const NEUTRAL_BACKGROUND = "#f8fafc";
const TAG_BACKGROUNDS = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#e0e7ff", "#ccfbf1", "#ffedd5", "#ede9fe"];
const TAG_TEXT_COLORS = ["#1e3a8a", "#166534", "#92400e", "#9d174d", "#3730a3", "#115e59", "#9a3412", "#5b21b6"];
const STRIPE_WIDTH = 10;

export function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, "");
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const tag = normalizeTag(item);
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

export function parseTags(value: string): string[] {
  return normalizeTags(value.split(/[,\s]+/));
}

export function readTags(task: UplTask | null | undefined): string[] {
  return normalizeTags(task?.["std.tags"]);
}

export function defaultTagColor(tag: string): TagColor {
  const index = hash(tag) % TAG_BACKGROUNDS.length;
  return { text: TAG_TEXT_COLORS[index]!, background: TAG_BACKGROUNDS[index]! };
}

export function tagPaint(tags: readonly string[], colors: TagColors): Record<string, string> {
  if (tags.length === 0) return { color: NEUTRAL_TEXT, backgroundColor: NEUTRAL_BACKGROUND };

  const tagColors = tags.map((tag) => colors[tag] ?? defaultTagColor(tag));
  if (tagColors.length === 1) {
    return { color: tagColors[0]!.text, backgroundColor: tagColors[0]!.background };
  }

  return {
    color: tagColors[0]!.text,
    backgroundColor: tagColors[0]!.background,
    backgroundImage: stripeGradient(tagColors.map((color) => color.background)),
  };
}

function stripeGradient(colors: string[]): string {
  const stops = colors.map((color, index) => `${color} ${index * STRIPE_WIDTH}px ${(index + 1) * STRIPE_WIDTH}px`);
  return `repeating-linear-gradient(135deg, ${stops.join(", ")})`;
}

function hash(value: string): number {
  let result = 0;
  for (const character of value) {
    result = (result * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return result;
}
