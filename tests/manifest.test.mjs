import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));

test("Manifestが必要な権限と参照先を持つ", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, "1.0.1");
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.action, undefined);
  assert.deepEqual(manifest.options_ui, { page: "options.html", open_in_tab: true });
  assert.equal(manifest.icons?.[128], "assets/icons/icon-128.png");
  assert.ok(existsSync(resolve(root, manifest.options_ui.page)));
  for (const iconPath of Object.values(manifest.icons ?? {})) {
    assert.ok(existsSync(resolve(root, iconPath)), `見つかりません: ${iconPath}`);
  }
  assert.ok(existsSync(resolve(root, manifest.background.service_worker)));

  const moodleDefinition = manifest.content_scripts.find((definition) =>
    definition.js.includes("src/moodle.js")
  );
  assert.deepEqual(moodleDefinition?.matches, [
    "https://lms.rd.dendai.ac.jp/admin/tool/mfa/auth.php*"
  ]);

  const outlookDefinition = manifest.content_scripts.find((definition) =>
    definition.js.includes("src/outlook.js")
  );
  assert.deepEqual(outlookDefinition?.matches, [
    "https://outlook.office.com/mail/*",
    "https://outlook.cloud.microsoft/mail/*"
  ]);
  assert.deepEqual(outlookDefinition?.js, ["src/config.js", "src/outlook-logic.js", "src/outlook.js"]);

  for (const definition of manifest.content_scripts) {
    for (const file of definition.js) {
      assert.ok(existsSync(resolve(root, file)), `見つかりません: ${file}`);
    }
  }
});
