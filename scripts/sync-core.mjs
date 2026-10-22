import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = resolve(root, "../uniplanner");
const source = resolve(core, "js-api/build/kotlin-webpack/js/productionExecutable/uniplanner-core.js");
const target = resolve(root, "public/uniplanner-core.js");

execFileSync(resolve(core, "gradlew"), [":js-api:jsBrowserProductionWebpack", "--console=plain"], {
  cwd: core,
  stdio: "inherit",
});

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log(`copied ${source} -> ${target}`);
