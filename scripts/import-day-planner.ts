import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  buildWeekPlans,
  parseDayPlanner,
  type DayPlannerEntry,
  type ParseDayPlannerOptions,
} from "../src/core/dayPlannerImport.ts";

const DATE_FILE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const usage = `Usage: node scripts/import-day-planner.ts <daily-dir> <planner-dir> [options]

Converts Obsidian Day Planner Markdown notes named YYYY-MM-DD.md into
UniPlanner week containers named YYYY-Www.upl.json.

Options:
  --write              Write files. Without this, the script only prints a plan.
  --overwrite          Replace existing week files instead of skipping them.
  --timezone <zone>    IANA timezone for wall-clock times (default: Europe/Berlin).
  --heading <text>     Planner heading to read (default: Day planner).
  -h, --help           Show this help.`;

interface Options {
  write: boolean;
  overwrite: boolean;
  timezone: string;
  heading: string;
  inputDir: string;
  outputDir: string;
}

function main(): void {
  const options = readOptions();
  if (!options) return;

  const files = readdirSync(options.inputDir)
    .filter((name) => DATE_FILE.test(name))
    .sort();
  if (files.length === 0) throw new Error(`no YYYY-MM-DD.md files found in ${options.inputDir}`);

  const parseOptions: ParseDayPlannerOptions = { heading: options.heading };
  const entries: DayPlannerEntry[] = [];
  for (const file of files) {
    const date = DATE_FILE.exec(file)![1]!;
    const markdown = readFileSync(join(options.inputDir, file), "utf8");
    entries.push(...parseDayPlanner(markdown, date, file, parseOptions));
  }

  const plans = buildWeekPlans(entries, options.timezone);
  if (plans.length === 0) throw new Error(`no entries found under "${options.heading}"`);

  console.log(`Read ${files.length} daily notes with ${entries.length} entries in ${plans.length} weeks.`);
  if (options.write) mkdirSync(options.outputDir, { recursive: true });

  let written = 0;
  let skipped = 0;
  for (const plan of plans) {
    const target = join(options.outputDir, plan.week.fileName);
    if (existsSync(target) && !options.overwrite) {
      skipped += 1;
      console.log(`${plan.week.key}  ${plan.week.fileName}  ${plan.entries.length} tasks  exists, skipped`);
      continue;
    }
    if (options.write) {
      writeFileSync(target, `${JSON.stringify(plan.document, null, 2)}\n`, {
        encoding: "utf8",
        flag: options.overwrite ? "w" : "wx",
      });
      written += 1;
      console.log(`${plan.week.key}  ${plan.week.fileName}  ${plan.entries.length} tasks  written`);
    } else {
      console.log(`${plan.week.key}  ${plan.week.fileName}  ${plan.entries.length} tasks  would write`);
    }
  }

  if (!options.write) console.log(`Dry run. Add --write to create files in ${options.outputDir}.`);
  else console.log(`Wrote ${written} files, skipped ${skipped}, timezone ${options.timezone}.`);
}

function readOptions(): Options | null {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      write: { type: "boolean", default: false },
      overwrite: { type: "boolean", default: false },
      timezone: { type: "string", default: "Europe/Berlin" },
      heading: { type: "string", default: "Day planner" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (parsed.values.help) {
    console.log(usage);
    return null;
  }
  if (parsed.positionals.length !== 2) throw new Error(usage);

  return {
    write: parsed.values.write,
    overwrite: parsed.values.overwrite,
    timezone: parsed.values.timezone,
    heading: parsed.values.heading,
    inputDir: resolve(parsed.positionals[0]!),
    outputDir: resolve(parsed.positionals[1]!),
  };
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
