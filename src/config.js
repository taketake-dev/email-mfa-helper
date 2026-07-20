(() => {
  globalThis.MoodleMfaHelperConfig = Object.freeze({
    outlookInboxUrl: "https://outlook.office.com/mail/",
    waitTimeoutMs: 10 * 1000,
    senderAddress: "noreply@lms.rd.dendai.ac.jp",
    subject: "あなたの認証コードです。"
  });
})();
