import "./config.js";
import { grantMfaConsent, hasMfaConsent, revokeMfaConsent } from "./consent.js";

const { outlookInboxUrl: OUTLOOK_INBOX_URL, waitTimeoutMs: WAIT_TIMEOUT_MS } =
  globalThis.MoodleMfaHelperConfig;
const SESSION_KEY = "mfaSession";
const TIMEOUT_ALARM = "mfa-session-timeout";
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

async function clearSession({ closeTab = false } = {}) {
  const session = await getSession();
  await chrome.alarms.clear(TIMEOUT_ALARM);
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

async function startMfaSession(moodleTabId) {
  const session = await createSession({ moodleTabId, startedAt: Date.now() });
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
    await chrome.alarms.create(TIMEOUT_ALARM, { when: Date.now() + WAIT_TIMEOUT_MS });
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
        const session = await startMfaSession(sender.tab.id);
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
      .then(() => startMfaSession(sender.tab.id))
      .then((session) => sendResponse({ ok: true, outlookTabId: session.outlookTabId }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "MFA_CONSENT_REVOKED") {
    revokeMfaConsent()
      .then(async () => {
        const session = await getSession();
        if (session) {
          await sendStatus(session.moodleTabId, "自動取得を停止しました", "Outlook Webの確認は行いません。");
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

        await chrome.tabs.sendMessage(session.moodleTabId, { type: "INSERT_MFA_CODE", code: message.code });
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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== TIMEOUT_ALARM) return;
  const session = await getSession();
  await finishWithoutCode(session);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const session = await getSession();
  if (session?.outlookTabId === tabId || session?.moodleTabId === tabId) {
    await clearSession({ closeTab: false });
  }
});
