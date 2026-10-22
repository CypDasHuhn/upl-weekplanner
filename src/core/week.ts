import type { UplDocument } from "./types";

export interface IsoWeek {
  year: number;
  week: number;
  key: string;
  documentId: string;
  name: string;
  startDate: string;
  fileName: string;
}

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const PLANNER_DIRECTORY = "01-personal/planner";

export function isoWeekForDate(date: string): IsoWeek {
  const { year, month, day } = dateParts(date);
  const stamp = Date.UTC(year, month - 1, day);
  const weekday = (new Date(stamp).getUTCDay() + 6) % 7;
  const monday = stamp - weekday * DAY_MS;
  const thursday = monday + 3 * DAY_MS;
  const weekYear = new Date(thursday).getUTCFullYear();
  const januaryFourth = Date.UTC(weekYear, 0, 4);
  const firstWeekday = (new Date(januaryFourth).getUTCDay() + 6) % 7;
  const firstMonday = januaryFourth - firstWeekday * DAY_MS;
  const week = Math.round((monday - firstMonday) / (7 * DAY_MS)) + 1;
  const padded = String(week).padStart(2, "0");

  return {
    year: weekYear,
    week,
    key: `${weekYear}-W${padded}`,
    documentId: `week_${weekYear}_W${padded}`,
    name: `Week ${week}`,
    startDate: formatDate(new Date(monday)),
    fileName: `${weekYear}-W${padded}.upl.json`,
  };
}

export function isoWeekForLocalDate(date: Date): IsoWeek {
  return isoWeekForDate(localDateKey(date));
}

export function localDateKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weekDocumentPath(date: Date, directory: string = PLANNER_DIRECTORY): string {
  return `${directory}/${isoWeekForLocalDate(date).fileName}`;
}

export function emptyWeekDocument(date: Date): UplDocument {
  const week = isoWeekForLocalDate(date);
  return {
    id: week.documentId,
    kind: "container",
    "std.name": week.name,
    tasks: [],
  };
}

export function dateParts(value: string): CalendarDate {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`invalid date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const stamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(stamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`invalid date: ${value}`);
  }
  return { year, month, day };
}

function formatDate(value: Date): string {
  return `${String(value.getUTCFullYear()).padStart(4, "0")}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}
