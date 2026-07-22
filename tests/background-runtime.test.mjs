import assert from "node:assert/strict";
import test from "node:test";

const runtimeState = {
  insertResult: { ok: true },
  local: {},
  removedTabs: [],
  sentMessages: [],
  session: {},
  updatedTabs: []
};

let runtimeMessageListener;

globalThis.chrome = {
  runtime: {
    onMessage: {
      addListener(listener) {
        runtimeMessageListener = listener;
      }
    }
  },
  storage: {
    local: {
      async get(key) {
        return key in runtimeState.local ? { [key]: runtimeState.local[key] } : {};
      },
      async set(values) {
        Object.assign(runtimeState.local, values);
      },
      async remove(key) {
        delete runtimeState.local[key];
      }
    },
    session: {
      async get(key) {
        return key in runtimeState.session ? { [key]: runtimeState.session[key] } : {};
      },
      async set(values) {
        Object.assign(runtimeState.session, values);
      },
      async remove(key) {
        delete runtimeState.session[key];
      }
    }
  },
  tabs: {
    async create() {
      return { id: 22 };
    },
    async remove(tabId) {
      runtimeState.removedTabs.push(tabId);
    },
    async sendMessage(tabId, message) {
      runtimeState.sentMessages.push({ tabId, message });
      return message.type === "INSERT_MFA_CODE" ? runtimeState.insertResult : { ok: true };
    },
    async update(tabId, updateProperties) {
      runtimeState.updatedTabs.push({ tabId, updateProperties });
    },
    onRemoved: {
      addListener() {}
    }
  }
};

await import(new URL("../src/background.js?background-runtime-tests", import.meta.url));

function resetRuntime({ insertResult = { ok: true } } = {}) {
  runtimeState.insertResult = insertResult;
  runtimeState.local = {};
  runtimeState.removedTabs = [];
  runtimeState.sentMessages = [];
  runtimeState.session = {
    mfaSession: { moodleTabId: 11, outlookTabId: 22, startedAt: Date.now() }
  };
  runtimeState.updatedTabs = [];
}

function dispatch(message, sender = {}) {
  return new Promise((resolve, reject) => {
    let responded = false;
    const sendResponse = (response) => {
      responded = true;
      resolve(response);
    };

    try {
      const asyncResponse = runtimeMessageListener(message, sender, sendResponse);
      if (asyncResponse !== true && !responded) resolve(undefined);
    } catch (error) {
      reject(error);
    }
  });
}

test("同意撤回でOutlook監視を即時停止し、タブを残す", async () => {
  resetRuntime();
  runtimeState.local.mfaConsentGranted = true;

  assert.deepEqual(await dispatch({ type: "MFA_CONSENT_REVOKED" }), { ok: true });
  assert.equal(runtimeState.local.mfaConsentGranted, undefined);
  assert.equal(runtimeState.session.mfaSession, undefined);
  assert.deepEqual(runtimeState.removedTabs, []);
  assert.ok(runtimeState.sentMessages.some(({ tabId, message }) =>
    tabId === 22 && message.type === "STOP_MFA_WATCH"
  ));
});

test("Moodleへの入力成功時だけOutlookタブを閉じる", async () => {
  resetRuntime({ insertResult: { ok: true } });

  assert.deepEqual(
    await dispatch({ type: "MFA_CODE_FOUND", code: "123456" }, { tab: { id: 22 } }),
    { ok: true }
  );
  assert.deepEqual(runtimeState.removedTabs, [22]);
  assert.ok(runtimeState.updatedTabs.some(({ tabId }) => tabId === 11));
  assert.equal(runtimeState.session.mfaSession, undefined);
});

test("Moodleへの入力失敗時はOutlookタブを残してMoodleへ戻る", async () => {
  resetRuntime({ insertResult: { ok: false } });

  assert.deepEqual(
    await dispatch({ type: "MFA_CODE_FOUND", code: "123456" }, { tab: { id: 22 } }),
    { ok: false, inputFailed: true }
  );
  assert.deepEqual(runtimeState.removedTabs, []);
  assert.ok(runtimeState.updatedTabs.some(({ tabId }) => tabId === 11));
  assert.equal(runtimeState.session.mfaSession, undefined);
});

test("時間切れではOutlookタブを残してMoodleへ戻る", async () => {
  resetRuntime();

  assert.deepEqual(
    await dispatch({ type: "MFA_WATCH_TIMED_OUT" }, { tab: { id: 22 } }),
    { ok: true }
  );
  assert.deepEqual(runtimeState.removedTabs, []);
  assert.ok(runtimeState.updatedTabs.some(({ tabId }) => tabId === 11));
  assert.equal(runtimeState.session.mfaSession, undefined);
});
