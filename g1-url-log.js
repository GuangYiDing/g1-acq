/* Local-only request URL log for Shadowrocket; never modifies the request. */
"use strict";

(function () {
  var STORE_KEY = "g1.url.log.v1";
  var LIMIT = 15;
  var MAX_LENGTH = 260;
  var url = typeof $request === "object" && $request ? $request.url : "";

  if (typeof url !== "string" || !/^https:\/\/one\.google\.com\//.test(url) ||
      /^https:\/\/one\.google\.com\/g1-sku-report(?:\?|$)/.test(url)) {
    $done({});
    return;
  }

  function scrub(value) {
    return value
      .slice(0, MAX_LENGTH)
      .replace(/([?&](?:token|sig|signature|auth|key|pli)=)[^&]+/gi, "$1<redacted>")
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>");
  }

  var saved = {};
  try {
    if (typeof $persistentStore !== "undefined" && typeof $persistentStore.read === "function") {
      saved = JSON.parse($persistentStore.read(STORE_KEY) || "{}");
    }
  } catch (error) {
    saved = {};
  }
  if (!saved || saved.schemaVersion !== 1 || !Array.isArray(saved.logs)) saved = {};

  var logs = (Array.isArray(saved.logs) ? saved.logs : []).filter(function (row) {
    return row && typeof row.u === "string";
  });
  var entry = scrub(url);
  if (!logs.length || logs[logs.length - 1].u !== entry) {
    logs.push({ u: entry, t: new Date().toISOString().slice(11, 19) });
  }
  if (logs.length > LIMIT) logs = logs.slice(logs.length - LIMIT);

  try {
    if (typeof $persistentStore !== "undefined" &&
        typeof $persistentStore.write === "function") {
      $persistentStore.write(JSON.stringify({ schemaVersion: 1, logs: logs }), STORE_KEY);
    }
  } catch (error) {
    console.log("[g1-url-log] local store unavailable");
  }
  $done({});
})();
