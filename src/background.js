import "./config.js";
import { grantMfaConsent, hasMfaConsent, revokeMfaConsent } from "./consent.js";

const { outlookInboxUrl: OUTLOOK_INBOX_URL, waitTimeoutMs: WAIT_TIMEOUT_MS } =
  globalThis.MoodleMfaHelperConfig;
const SESSION_KEY = "mfaSession";
const WAIT_TIMEOUT_SECONDS = WAIT_TIMEOUT_MS / 1_000;
const TIMEOUT_MESSAGE =
  "対象の認証メールを10秒間確認しましたが、見つかりませんでした。対象の認証メールがまだ届いていないか、先に発行された認証コードが10分間有効なため、新しいメールが送信されていない可能性があります。Outlook Webで認証メールをご確認ください。";
const startingWatchTabIds = new Set();

async function getSession() {
  const { [SESSION_KEY]: session } = await chrome.storage.session.get(SESSION_KEY);
  return session;
}

async function closeOutlookTab(tabId) {
  if (typeof tabId !== "number") return;
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // 利用者が先に閉じたタブは、そのまま扱う。
  }
}

async function stopOutlookWatch(tabId) {
  if (typeof tabId !== "number") return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "STOP_MFA_WATCH" });
  } catch {
    // タブが閉じられた場合やスクリプトが終了済みの場合は何もしない。
  }
}

async function clearSession({ closeTab = false, stopWatch = true } = {}) {
  const session = await getSession();
  if (stopWatch) await stopOutlookWatch(session?.outlookTabId);
  await chrome.storage.session.remove(SESSION_KEY);
  if (closeTab) await closeOutlookTab(session?.outlookTabId);
}

async function sendStatus(tabId, status, detail = "") {
  if (typeof tabId !== "number") return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: "MFA_STATUS", status, detail });
  } catch {
    // 認証画面が遷移済みなら表示先がないため何もしない。
  }
}

async function activateMoodleTab(tabId) {
  if (typeof tabId !== "number") return;
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    // 認証画面が遷移・終了済みなら、前面化できなくても処理は続ける。
  }
}

async function finishWithoutCode(session) {
  if (!session) return;
  await sendStatus(session.moodleTabId, "認証メールを確認できませんでした", TIMEOUT_MESSAGE);
  await activateMoodleTab(session.moodleTabId);
  await clearSession({ closeTab: false });
}

async function createSession(session) {
  await clearSession({ closeTab: true });
  // Outlook Web は非アクティブなタブでは受信トレイを描画・更新しないことがある。
  const outlookTab = await chrome.tabs.create({ url: OUTLOOK_INBOX_URL, active: true });
  const activeSession = { ...session, outlookTabId: outlookTab.id };
  await chrome.storage.session.set({ [SESSION_KEY]: activeSession });
  return activeSession;
}

function getMfaScreenDetectedAt(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : Date.now();
}

async function startMfaSession(moodleTabId, startedAt = Date.now()) {
  const session = await createSession({ moodleTabId, startedAt });
  await sendStatus(moodleTabId, "Outlook Webを開いています", "認証メールを待機します。");
  return session;
}

async function beginOutlookWatch(session) {
  if (!session || session.watchStartedAt) return Boolean(session?.watchStartedAt);
  if (startingWatchTabIds.has(session.outlookTabId)) return false;

  startingWatchTabIds.add(session.outlookTabId);
  try {
    await chrome.tabs.sendMessage(session.outlookTabId, {
      type: "START_MFA_WATCH",
      startedAt: session.startedAt,
      timeoutMs: WAIT_TIMEOUT_MS
    });
    const watchingSession = { ...session, watchStartedAt: Date.now() };
    await chrome.storage.session.set({ [SESSION_KEY]: watchingSession });
    await sendStatus(
      session.moodleTabId,
      "認証メールを待機中",
      `最大${WAIT_TIMEOUT_SECONDS}秒待機します。`
    );
    return true;
  } catch {
    return false;
  } finally {
    startingWatchTabIds.delete(session.outlookTabId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "MFA_SCREEN_DETECTED") {
    if (typeof sender.tab?.id !== "number") {
      sendResponse({ ok: false });
      return;
    }
    hasMfaConsent()
      .then(async (granted) => {
        if (!granted) {
          await chrome.tabs.sendMessage(sender.tab.id, { type: "MFA_CONSENT_REQUIRED" });
          sendResponse({ ok: false, consentRequired: true });
          return;
        }
        const session = await startMfaSession(
          sender.tab.id,
          getMfaScreenDetectedAt(message.detectedAt)
        );
        sendResponse({ ok: true, outlookTabId: session.outlookTabId });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "MFA_CONSENT_GRANTED") {
    if (typeof sender.tab?.id !== "number") {
      sendResponse({ ok: false });
      return;
    }
    grantMfaConsent()
      .then(() => startMfaSession(sender.tab.id, getMfaScreenDetectedAt(message.detectedAt)))
      .then((session) => sendResponse({ ok: true, outlookTabId: session.outlookTabId }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "MFA_CONSENT_REVOKED") {
    revokeMfaConsent()
      .then(async () => {
        const session = await getSession();
        if (session) {
          await sendStatus(session.moodleTabId, "自動取得を停止しました", "Outlook Webの確認を停止しました。");
        }
        await clearSession({ closeTab: false });
        sendResponse({ ok: true });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "OUTLOOK_INBOX_READY") {
    getSession()
      .then(async (session) => {
        if (!session || sender.tab?.id !== session.outlookTabId) {
          sendResponse({ watching: false });
          return;
        }
        sendResponse({ watching: await beginOutlookWatch(session) });
      })
      .catch(() => sendResponse({ watching: false }));
    return true;
  }

  if (message?.type === "OUTLOOK_SCRIPT_ERROR") {
    getSession()
      .then(async (session) => {
        if (!session || sender.tab?.id !== session.outlookTabId) return;
        await sendStatus(session.moodleTabId, "Outlook Webを確認できません", message.detail);
        await activateMoodleTab(session.moodleTabId);
        await clearSession({ closeTab: false });
      })
      .catch(() => {});
    return;
  }

  if (message?.type === "MFA_CODE_FOUND") {
    getSession()
      .then(async (session) => {
        if (!session || sender.tab?.id !== session.outlookTabId || !/^\d{6}$/.test(message.code)) {
          sendResponse({ ok: false });
          return;
        }

        let inputResult = null;
        try {
          inputResult = await chrome.tabs.sendMessage(session.moodleTabId, {
            type: "INSERT_MFA_CODE",
            code: message.code
          });
        } catch {
          // Moodle側が遷移・変更されて入力できない場合は手動確認へ切り替える。
        }

        if (inputResult?.ok !== true) {
          await sendStatus(
            session.moodleTabId,
            "認証コードを入力できませんでした",
            "Outlook Webで認証メールを確認し、コードを手動で入力してください。"
          );
          await activateMoodleTab(session.moodleTabId);
          await clearSession({ closeTab: false });
          sendResponse({ ok: false, inputFailed: true });
          return;
        }

        await activateMoodleTab(session.moodleTabId);
        await clearSession({ closeTab: true });
        sendResponse({ ok: true });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "MFA_WATCH_TIMED_OUT") {
    getSession()
      .then(async (session) => {
        if (session && sender.tab?.id === session.outlookTabId) {
          await finishWithoutCode(session);
        }
        sendResponse({ ok: true });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const session = await getSession();
  if (session?.outlookTabId === tabId || session?.moodleTabId === tabId) {
    await clearSession({ closeTab: false });
  }
});
