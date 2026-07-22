const OUTLOOK_MESSAGE_LIST_SELECTOR = '[role="listbox"]';
const { senderAddress: SENDER_ADDRESS, subject: SUBJECT } = globalThis.MoodleMfaHelperConfig;
const SENDER_SELECTOR = `[title="${SENDER_ADDRESS}"]`;
const logic = globalThis.MoodleMfaHelperOutlookLogic;
if (!logic) {
  chrome.runtime.sendMessage({
    type: "OUTLOOK_SCRIPT_ERROR",
    detail: "共通ロジックを読み込めませんでした。"
  });
  throw new Error("Outlook共通ロジックが読み込まれていません。");
}

const { findCodeInText, isFreshReceivedAt, parseReceivedAtTitle } = logic;

let watcher = null;
let inboxReadyReported = false;

chrome.runtime.sendMessage({ type: "OUTLOOK_SCRIPT_LOADED" });

function parseReceivedAt(row) {
  return parseReceivedAtTitle(
    [...row.querySelectorAll("[title]")].map((element) => element.getAttribute("title"))
  );
}

function findCode(row) {
  return findCodeInText(row.textContent ?? "");
}

function findFreshCode(startedAt) {
  const rows = [...document.querySelectorAll('[role="option"]')];

  for (const row of rows) {
    const hasSender = row.querySelector(SENDER_SELECTOR) !== null;
    if (!hasSender) {
      continue;
    }

    const hasSubject = [...row.querySelectorAll("*")]
      .some((element) => element.textContent?.trim() === SUBJECT);
    if (!hasSubject) {
      continue;
    }

    const receivedAt = parseReceivedAt(row);

    if (receivedAt === null) {
      continue;
    }

    if (!isFreshReceivedAt(receivedAt, startedAt)) {
      continue;
    }

    const code = findCode(row);
    if (code) {
      return code;
    }
  }

  return null;
}

function stopWatching() {
  if (watcher) {
    clearInterval(watcher.intervalId);
    clearTimeout(watcher.timeoutId);
    watcher = null;
  }
}

function startWatching({ startedAt, timeoutMs }) {
  stopWatching();

  const check = () => {
    const code = findFreshCode(startedAt);
    if (!code) {
      return;
    }

    stopWatching();
    chrome.runtime.sendMessage({ type: "MFA_CODE_FOUND", code });
  };

  watcher = {
    intervalId: setInterval(check, 1000),
    timeoutId: setTimeout(() => {
      stopWatching();
      chrome.runtime.sendMessage({ type: "MFA_WATCH_TIMED_OUT" });
    }, timeoutMs)
  };
  check();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "STOP_MFA_WATCH") {
    stopWatching();
    sendResponse({ ok: true });
    return;
  }

  if (message?.type !== "START_MFA_WATCH") {
    return;
  }

  startWatching(message);
  sendResponse({ ok: true });
});

async function reportInboxReady() {
  if (inboxReadyReported || !document.querySelector(OUTLOOK_MESSAGE_LIST_SELECTOR)) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: "OUTLOOK_INBOX_READY" });
    inboxReadyReported = response?.watching === true;
  } catch {
    inboxReadyReported = false;
  }

  if (!inboxReadyReported) {
    setTimeout(reportInboxReady, 1000);
  }
}

reportInboxReady();
new MutationObserver(reportInboxReady).observe(document.documentElement, {
  childList: true,
  subtree: true
});
