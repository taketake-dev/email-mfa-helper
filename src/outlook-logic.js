(() => {
  function parseReceivedAtTitle(titles) {
    const title = titles.find((value) => /^\d{4}\/\d{2}\/\d{2}/.test(value ?? ""));
    const parts = title?.match(/^(\d{4})\/(\d{2})\/(\d{2}).*?(\d{1,2}):(\d{2})$/);
    if (!parts) return null;

    const [, year, month, day, hour, minute] = parts;
    return new Date(`${year}-${month}-${day}T${hour.padStart(2, "0")}:${minute}:00`).getTime();
  }

  function findCodeInText(text) {
    const namedCode = text.match(/認証コード(?:です)?\D{0,40}(\d{6})/);
    return namedCode?.[1] ?? text.match(/\b\d{6}\b/)?.[0] ?? null;
  }

  function floorToMinute(timestamp) {
    return Math.floor(timestamp / 60_000) * 60_000;
  }

  function isFreshReceivedAt(receivedAt, startedAt) {
    return receivedAt !== null && receivedAt >= floorToMinute(startedAt);
  }

  globalThis.MoodleMfaHelperOutlookLogic = {
    findCodeInText,
    floorToMinute,
    isFreshReceivedAt,
    parseReceivedAtTitle
  };
})();
