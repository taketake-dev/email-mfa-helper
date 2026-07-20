import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.manifest_version === 3, "Manifest V3ではありません。");
assert(manifest.background?.service_worker, "Service Workerが指定されていません。");
assert(manifest.permissions?.includes("tabs"), "tabs権限がありません。");
assert(manifest.permissions?.includes("storage"), "storage権限がありません。");
assert(manifest.permissions?.includes("alarms"), "alarms権限がありません。");
assert(manifest.version === "1.0.0", "公開候補のバージョンではありません。");
assert(manifest.options_ui?.page === "options.html", "同意設定画面が指定されていません。");
assert(manifest.icons?.[128] === "assets/icons/icon-128.png", "128pxアイコンが指定されていません。");

const scriptFiles = new Set([manifest.background.service_worker]);
scriptFiles.add("src/consent.js");
scriptFiles.add("src/options.js");
for (const definition of manifest.content_scripts ?? []) {
  for (const file of definition.js ?? []) scriptFiles.add(file);
}
for (const file of scriptFiles) {
  const path = resolve(root, file);
  assert(existsSync(path), `参照先がありません: ${file}`);
  execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });
}

assert(existsSync(resolve(root, manifest.options_ui.page)), "設定画面が見つかりません。");
for (const iconPath of Object.values(manifest.icons ?? {})) {
  assert(existsSync(resolve(root, iconPath)), `アイコンが見つかりません: ${iconPath}`);
}

console.log(`check: OK (${scriptFiles.size} JavaScript files)`);
