import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const moodle = readFileSync(resolve(root, "src/moodle.js"), "utf8");

test("Moodle認証画面で初回同意を表示する", () => {
  assert.match(moodle, /MFA_CONSENT_REQUIRED/);
  assert.match(moodle, /同意して自動取得を使う/);
  assert.match(moodle, /今回は使わない/);
  assert.match(moodle, /type: "MFA_CONSENT_GRANTED"/);
  assert.match(moodle, /本文プレビューを含む場合があります/);
  assert.match(moodle, /Moodle側の仕様により自動送信されます/);
});
