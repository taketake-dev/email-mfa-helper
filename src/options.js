import { hasMfaConsent } from "./consent.js";

const status = document.getElementById("consent-status");
const revokeButton = document.getElementById("revoke-consent");

async function refresh() {
  const granted = await hasMfaConsent();
  status.textContent = granted
    ? "Outlook Webの認証メールを自動確認することに同意済みです。"
    : "自動確認への同意は保存されていません。";
  revokeButton.disabled = !granted;
}

revokeButton.addEventListener("click", async () => {
  revokeButton.disabled = true;
  const result = await chrome.runtime.sendMessage({ type: "MFA_CONSENT_REVOKED" });
  status.textContent = result?.ok
    ? "同意を取り消しました。実行中の自動確認も停止しました。"
    : "同意を取り消せませんでした。ページを再読み込みしてから再試行してください。";
  await refresh();
});

refresh();
