import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const background = readFileSync(resolve(root, "src/background.js"), "utf8");

test("Outlook Webの専用タブを前面で開く", () => {
  assert.match(
    background,
    /chrome\.tabs\.create\(\{ url: OUTLOOK_INBOX_URL, active: true \}\)/
  );
});

test("通常のMoodle認証では取得コードを入力欄へ渡す", () => {
  assert.match(background, /type: "INSERT_MFA_CODE",[\s\S]*?code: message\.code/);
  assert.match(background, /if \(inputResult\?\.ok !== true\)/);
  assert.match(background, /await activateMoodleTab\(session\.moodleTabId\);/);
  assert.match(background, /chrome\.tabs\.update\(tabId, \{ active: true \}\)/);
  assert.doesNotMatch(background, /DEBUG_MODE|OUTLOOK_DEBUG|START_OUTLOOK_DEBUG_EXPERIMENT/);
});

test("同意前はOutlook Webを開かず、同意後だけ開始する", () => {
  assert.match(background, /import \{ grantMfaConsent, hasMfaConsent, revokeMfaConsent \} from "\.\/consent\.js"/);
  assert.match(background, /if \(!granted\) \{[\s\S]*?type: "MFA_CONSENT_REQUIRED"/);
  assert.match(background, /message\?\.type === "MFA_CONSENT_GRANTED"/);
  assert.match(background, /grantMfaConsent\(\)[\s\S]*?startMfaSession/);
  assert.match(background, /getMfaScreenDetectedAt\(message\.detectedAt\)/);
});

test("同意撤回では監視を止め、Outlookタブは残す", () => {
  assert.match(background, /message\?\.type === "MFA_CONSENT_REVOKED"/);
  assert.match(background, /revokeMfaConsent\(\)/);
  assert.match(background, /await clearSession\(\{ closeTab: false \}\)/);
  assert.match(background, /type: "STOP_MFA_WATCH"/);
});

test("待機時間は設定ファイルから取得する", () => {
  assert.match(background, /import "\.\/config\.js"/);
  assert.match(background, /waitTimeoutMs: WAIT_TIMEOUT_MS/);
  assert.doesNotMatch(background, /chrome\.alarms|TIMEOUT_ALARM/);
  assert.doesNotMatch(background, /chrome\.tabs\.onUpdated\.addListener/);
});

test("時間切れではMoodleへ戻り、Outlookタブを残す", () => {
  assert.match(background, /async function finishWithoutCode\(session\)/);
  assert.match(background, /await activateMoodleTab\(session\.moodleTabId\);/);
  assert.match(background, /await clearSession\(\{ closeTab: false \}\);/);
  assert.match(background, /await finishWithoutCode\(session\);/);
});
