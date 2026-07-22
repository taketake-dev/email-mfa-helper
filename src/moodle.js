const CODE_INPUT_SELECTOR = [
  'input[autocomplete="one-time-code"]',
  'input[name*="code" i]',
  'input[id*="code" i]',
  'input[aria-label*="認証"]',
  'input[placeholder*="認証"]',
  'input[aria-label*="code" i]',
  'input[placeholder*="code" i]'
].join(", ");

let detectionState = "idle";

function getPanel() {
  let panel = document.getElementById("email-mfa-helper-status");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "email-mfa-helper-status";
    panel.setAttribute("aria-live", "polite");
    panel.style.cssText = [
      "margin: 12px 0",
      "padding: 12px",
      "border: 1px solid #0d6efd",
      "border-radius: 6px",
      "background: #f8fbff",
      "color: #13233a",
      "font: 14px/1.5 system-ui, sans-serif"
    ].join(";");
    findCodeInput()?.closest("form")?.prepend(panel);
  }
  return panel;
}

function showStatus(status, detail) {
  const panel = getPanel();

  panel.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = `Email MFA Helper: ${status}`;
  const description = document.createElement("div");
  description.textContent = detail;
  panel.append(title, description);
}

function showConsent() {
  if (detectionState === "awaiting-consent") return;
  detectionState = "awaiting-consent";
  const panel = getPanel();
  panel.replaceChildren();

  const title = document.createElement("strong");
  title.textContent = "Email MFA Helper: 自動取得の利用確認";
  const description = document.createElement("p");
  description.textContent = "Outlook Webの受信トレイ一覧から、対象メールの送信元・件名・受信日時・一覧行に表示されるテキスト（本文プレビューを含む場合があります）を端末内で一時処理し、6桁コードをMoodleのコード欄へ入力します。入力後はMoodle側の仕様により自動送信されます。対象行以外のメール本文は開かず、処理した情報・パスワード・認証コードを保存、外部送信、第三者共有せず、開発者が閲覧することもありません。";
  const accept = document.createElement("button");
  accept.type = "button";
  accept.textContent = "同意して自動取得を使う";
  const decline = document.createElement("button");
  decline.type = "button";
  decline.textContent = "今回は使わない";
  decline.style.marginLeft = "8px";

  accept.addEventListener("click", async () => {
    accept.disabled = true;
    decline.disabled = true;
    let result = null;
    try {
      result = await chrome.runtime.sendMessage({ type: "MFA_CONSENT_GRANTED" });
    } catch {
      // バックグラウンド処理が利用できない場合は再試行を案内する。
    }
    if (!result?.ok) {
      detectionState = "idle";
      showStatus("自動取得を開始できません", "ページを再読み込みしてから再試行してください。");
    }
  });
  decline.addEventListener("click", () => {
    detectionState = "declined";
    showStatus("自動取得を開始しません", "Outlook Webで認証メールを確認し、コードを手動で入力してください。");
  });

  panel.append(title, description, accept, decline);
}

function findCodeInput() {
  return [...document.querySelectorAll(CODE_INPUT_SELECTOR)].find((input) => {
    return input instanceof HTMLInputElement && !input.disabled && input.offsetParent !== null;
  });
}

function setInputValue(input, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function detectMfaScreen() {
  if (detectionState !== "idle" || !findCodeInput()) {
    return;
  }

  detectionState = "checking";
  chrome.runtime.sendMessage({ type: "MFA_SCREEN_DETECTED" });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "MFA_STATUS") {
    showStatus(message.status, message.detail);
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "MFA_CONSENT_REQUIRED") {
    showConsent();
    sendResponse({ ok: true });
    return;
  }

  if (message?.type !== "INSERT_MFA_CODE") {
    return;
  }

  const input = findCodeInput();
  if (!input || !/^\d{6}$/.test(message.code)) {
    sendResponse({ ok: false });
    return;
  }

  setInputValue(input, message.code);
  showStatus("6桁コードを入力しました", "送信操作はMoodle側に任せます。");
  sendResponse({ ok: true });
});

detectMfaScreen();
new MutationObserver(detectMfaScreen).observe(document.documentElement, {
  childList: true,
  subtree: true
});
