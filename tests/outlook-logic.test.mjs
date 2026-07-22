import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "src/outlook-logic.js"), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const logic = context.globalThis.MoodleMfaHelperOutlookLogic;
const outlookSource = readFileSync(resolve(root, "src/outlook.js"), "utf8");

test("認証コードの前後文から6桁コードを抽出する", () => {
  assert.equal(logic.findCodeInText("あなたの認証コードです。 123456 コードは10分有効です。"), "123456");
  assert.equal(logic.findCodeInText("コードが見つかりません。"), null);
});

test("Outlookの受信日時タイトルを時刻へ変換する", () => {
  const actual = logic.parseReceivedAtTitle(["noreply@lms.rd.dendai.ac.jp", "2026/07/21 (火) 0:53"]);
  const expected = new Date("2026-07-21T00:53:00").getTime();
  assert.equal(actual, expected);
});

test("分単位表示を考慮して新着メールを判定する", () => {
  const startedAt = new Date("2026-07-21T00:54:30").getTime();
  const sameMinute = new Date("2026-07-21T00:54:00").getTime();
  const previousMinute = new Date("2026-07-21T00:53:00").getTime();
  assert.equal(logic.floorToMinute(startedAt), sameMinute);
  assert.equal(logic.isFreshReceivedAt(sameMinute, startedAt), true);
  assert.equal(logic.isFreshReceivedAt(previousMinute, startedAt), false);
});

test("送信元が一致した行だけ件名と本文相当テキストを確認する", () => {
  const senderCheck = outlookSource.indexOf("if (!hasSender)");
  const subjectRead = outlookSource.indexOf("const hasSubject");
  const rowTextRead = outlookSource.indexOf("const code = findCode(row);");
  assert.ok(senderCheck >= 0);
  assert.ok(subjectRead > senderCheck);
  assert.ok(rowTextRead > subjectRead);
});

test("監視停止メッセージでタイマーを解除する", () => {
  assert.match(outlookSource, /message\?\.type === "STOP_MFA_WATCH"[\s\S]*?stopWatching\(\)/);
});
