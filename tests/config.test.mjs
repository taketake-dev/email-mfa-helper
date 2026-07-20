import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "src/config.js"), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const config = context.globalThis.MoodleMfaHelperConfig;

test("待機上限は10秒", () => {
  assert.equal(config.waitTimeoutMs, 10 * 1000);
  assert.equal("receivedAtGraceMs" in config, false);
});
