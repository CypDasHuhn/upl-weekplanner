import { normalizeTag } from "./tags.ts";
import { formatIsoDuration } from "./time.ts";
import type { UplDocument, UplTask } from "./types.ts";
import { dateParts, isoWeekForDate, type IsoWeek } from "./week.ts";

export { isoWeekForDate };

export interface DayPlannerEntry {
  date: string;
  start: string;
  end: string;
  name: string;
  tags: string[];
  closed: boolean;
  source: string;
  line: number;
}

export interface WeekPlan {
  week: IsoWeek;
  entries: DayPlannerEntry[];
  document: UplDocument;
}

export interface ParseDayPlannerOptions {
  heading?: string;
}

export type TaskIdFactory = (entry: DayPlannerEntry, week: IsoWeek) => string;

const DEFAULT_HEADING = "Day planner";
const HEADING_PATTERN = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE_PATTERN = /^(```|~~~)/;
const TASK_PATTERN = /^[-*]\s+\[(.)\]\s+(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})(.*)$/;
const TAG_PATTERN = /#([\p{L}\p{N}_-]+)/gu;
const formatters = new Map<string, Intl.DateTimeFormat>();

export function parseDayPlanner(
  markdown: string,
  date: string,
  source: string = date,
  options: ParseDayPlannerOptions = {},
): DayPlannerEntry[] {
  dateParts(date);
  const heading = (options.heading ?? DEFAULT_HEADING).trim();
  const entries: DayPlannerEntry[] = [];
  let inSection = false;
  let fenced = false;

  markdown.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    if (FENCE_PATTERN.test(line.trim())) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;

    const headingMatch = HEADING_PATTERN.exec(line);
    if (headingMatch) {
      inSection = headingMatch[2]!.trim().toLowerCase() === heading.toLowerCase();
      return;
    }
    if (!inSection) return;

    const taskMatch = TASK_PATTERN.exec(line);
    if (!taskMatch) return;

    const start = `${taskMatch[2]!.padStart(2, "0")}:${taskMatch[3]!}`;
    const end = `${taskMatch[4]!.padStart(2, "0")}:${taskMatch[5]!}`;
    const startMinutes = clockMinutes(start, source, lineNumber);
    const endMinutes = clockMinutes(end, source, lineNumber);
    if (endMinutes <= startMinutes) {
      throw new Error(`${source}:${lineNumber}: end time must be after start time`);
    }

    const title = splitTitle(taskMatch[6]!.trim());
    entries.push({
      date,
      start,
      end,
      name: title.name,
      tags: title.tags,
      closed: taskMatch[1]!.toLowerCase() === "x",
      source,
      line: lineNumber,
    });
  });

  return entries;
}

export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const { year, month, day } = dateParts(date);
  const [hour, minute] = timeParts(time);
  const formatter = formatterFor(timeZone);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = zoneOffset(wallClock, formatter);
  const firstGuess = wallClock - firstOffset;
  const secondOffset = zoneOffset(firstGuess, formatter);
  return new Date(wallClock - secondOffset);
}

export function buildWeekPlans(
  entries: readonly DayPlannerEntry[],
  timeZone: string,
  createId: TaskIdFactory = defaultTaskId,
): WeekPlan[] {
  formatterFor(timeZone);
  const groups = new Map<string, DayPlannerEntry[]>();
  for (const entry of entries) {
    const week = isoWeekForDate(entry.date);
    const group = groups.get(week.key);
    if (group) group.push(entry);
    else groups.set(week.key, [entry]);
  }

  return [...groups.values()]
    .map((group) => {
      const sorted = [...group].sort(
        (left, right) =>
          left.date.localeCompare(right.date) || left.start.localeCompare(right.start) || left.line - right.line,
      );
      const week = isoWeekForDate(sorted[0]!.date);
      const tasks = sorted.map((entry) => taskFor(entry, week, timeZone, createId));
      return {
        week,
        entries: sorted,
        document: {
          id: week.documentId,
          kind: "container",
          "std.name": week.name,
          tasks,
        },
      };
    })
    .sort((left, right) => left.week.startDate.localeCompare(right.week.startDate));
}

function taskFor(entry: DayPlannerEntry, week: IsoWeek, timeZone: string, createId: TaskIdFactory): UplTask {
  const start = zonedTimeToUtc(entry.date, entry.start, timeZone);
  const end = zonedTimeToUtc(entry.date, entry.end, timeZone);
  const minutes = (end.getTime() - start.getTime()) / 60_000;
  const task: UplTask = {
    id: createId(entry, week),
    "std.name": entry.name,
    "std.time.start": start.toISOString(),
    "std.time.duration": formatIsoDuration(minutes),
    "std.status.closed": entry.closed,
  };
  if (entry.tags.length > 0) task["std.tags"] = entry.tags;
  return task;
}

function splitTitle(value: string): { name: string; tags: string[] } {
  const tags: string[] = [];
  const name = value
    .replace(TAG_PATTERN, (_, tag: string) => {
      const normalized = normalizeTag(tag);
      if (normalized && !tags.includes(normalized)) tags.push(normalized);
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[+,;:–—-]+|[+,;:–—-]+$/g, "")
    .trim();
  return { name: name || tags.join(", ") || "Untitled", tags };
}

function clockMinutes(value: string, source: string, line: number): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`${source}:${line}: invalid time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`${source}:${line}: invalid time: ${value}`);
  return hour * 60 + minute;
}

function timeParts(value: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`invalid time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`invalid time: ${value}`);
  return [hour, minute];
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const existing = formatters.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatters.set(timeZone, formatter);
  return formatter;
}

function zoneOffset(epoch: number, formatter: Intl.DateTimeFormat): number {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const part of formatter.formatToParts(new Date(epoch))) values[part.type] = part.value;
  const wallClock = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return wallClock - epoch;
}

function defaultTaskId(): string {
  return globalThis.crypto.randomUUID();
}
