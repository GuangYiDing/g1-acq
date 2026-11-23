"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const TARGET = "g1.2tb.ai.annual";
const SCAN_KEY = "g1.sku.scan.v1";
const TEST_KEY = "g1.pro.annual.test.v1";
const REPORT = "https://one.google.com/g1-sku-report";
// Fixture source IDs test the matching contract; they are not store catalog evidence.
const SOURCE = "g1.ios.2tb.fixture_monthly";
const OTHER_SOURCE = "g1.ios.2tb.fixture_annual";
const TWENTY = "g1.ios.20tb.m.v2";
const THIRTY = "g1.ios.30tb.ai.pro.m";
const TWENTY_TARGET = "g1.20tb.3months_ip_90p.acq";
const THIRTY_TARGET = "g1.ai.ultra.3months_ip_90p.acq";
const TWENTY_FALLBACK = "g1.20tb.3months_ip_75p.acq";
const THIRTY_FALLBACK = "g1.ai.ultra.3months_ip_75p.acq";
const source = Object.fromEntries(
  ["g1-acq.js", "tests/fixtures/g1-acq-v6.js", "g1-sku-scan.js", "g1-sku-report.js", "g1-url-log.js"].map(name =>
    [name, fs.readFileSync(path.join(root, name), "utf8")])
);

function run(name, options = {}) {
  const storage = options.storage || new Map();
  const calls = [];
  const logs = [];
  const reads = [];
  const writes = [];
  const context = {
    $request: {
      url: options.url || "https://one.google.com/ai?fixture=1",
      headers: { Cookie: "cookie-secret", Authorization: "auth-secret" }
    },
    $response: { body: options.body, headers: { "x-private": "response-secret" } },
    $done: payload => calls.push(JSON.parse(JSON.stringify(payload))),
    console: { log: value => logs.push(String(value)) }
  };
  if (options.storageAvailable !== false) {
    context.$persistentStore = {
      read(key) {
        if (options.storageThrows) throw new Error("fixture storage failure");
        reads.push(key);
        return storage.get(key) || null;
      },
      write(value, key) {
        if (options.storageThrows) throw new Error("fixture storage failure");
        writes.push(key);
        if (options.storageWriteFails) return false;
        storage.set(key, value);
        return true;
      }
    };
  }
  vm.runInNewContext(source[name], context, { timeout: 2000, filename: name });
  assert.equal(calls.length, 1, "$done must be called once");
  return { payload: calls[0], storage, logs, reads, writes };
}

function get(storage, key) {
  return JSON.parse(storage.get(key));
}

test("combined module maps 2TB, 20TB and 30TB while preserving unrelated full tokens", () => {
  const untouched = [
    "g1.ios.12tb.fixture", TWENTY + ".extra", THIRTY + ".extra",
    "g1.ios.2tbx.fixture", "prefix" + SOURCE, "x." + SOURCE,
    "person@" + SOURCE, "g1.2tb", TARGET
  ];
  const values = [SOURCE, OTHER_SOURCE, SOURCE, TWENTY, THIRTY, ...untouched];
  const result = run("g1-acq.js", { body: JSON.stringify(values) });
  assert.deepEqual(JSON.parse(result.payload.body), [TARGET, TARGET, TARGET, TWENTY_TARGET, THIRTY_TARGET, ...untouched]);
  const record = get(result.storage, TEST_KEY);
  assert.equal(record.hitCount, 5);
  assert.equal(record.annualHitCount, 3);
  assert.equal(record.status, "rewritten");
  assert.equal(record.version, "g1-acq-v7.4");
  assert.deepEqual(record.matchedFrom, [
    { id: TWENTY, to: TWENTY_TARGET, count: 1, fallback: false },
    { id: OTHER_SOURCE, to: TARGET, count: 1, fallback: false },
    { id: SOURCE, to: TARGET, count: 2, fallback: false },
    { id: THIRTY, to: THIRTY_TARGET, count: 1, fallback: false }
  ]);
});

test("empty responses or responses with no configured sources pass through", () => {
  for (const body of ["", "g1.ios.100gb.m", "g1.ios.20tb.other", "g1.ios.30tb.other"]) {
    const result = run("g1-acq.js", { body });
    assert.deepEqual(result.payload, {});
    assert.equal(get(result.storage, TEST_KEY).status, "no-match");
  }
  for (const body of [undefined, null, 123, {}]) {
    const result = run("g1-acq.js", { body });
    assert.deepEqual(result.payload, {});
    assert.equal(get(result.storage, TEST_KEY).status, "non-text");
  }
});

test("20TB and 30TB fallback results agree with the original v6 across all offer combinations", () => {
  const offers = [TWENTY_TARGET, THIRTY_TARGET, TWENTY_FALLBACK, THIRTY_FALLBACK];
  for (let mask = 0; mask < 16; mask++) {
    const observed = offers.filter((_, index) => mask & (1 << index));
    const body = JSON.stringify([TWENTY, THIRTY, TWENTY, ...observed]);
    const legacy = run("tests/fixtures/g1-acq-v6.js", { body });
    const combined = run("g1-acq.js", { body });
    assert.equal(combined.payload.body, legacy.payload.body, "offer mask=" + mask);
    const record = get(combined.storage, TEST_KEY);
    assert.equal(record.hitCount, 3);
    assert.equal(record.annualHitCount, 0);
    assert.equal(record.status, "rewritten");
  }
});

test("fallback decisions are independent and the 2TB target stays fixed", () => {
  const body = JSON.stringify([SOURCE, TWENTY, THIRTY, TWENTY_TARGET, TWENTY_FALLBACK, THIRTY_FALLBACK]);
  const result = run("g1-acq.js", { body });
  assert.deepEqual(JSON.parse(result.payload.body).slice(0, 3), [TARGET, TWENTY_TARGET, THIRTY_FALLBACK]);
  const rows = get(result.storage, TEST_KEY).matchedFrom;
  assert.deepEqual(rows.find(row => row.id === SOURCE), { id: SOURCE, to: TARGET, count: 1, fallback: false });
  assert.deepEqual(rows.find(row => row.id === TWENTY), { id: TWENTY, to: TWENTY_TARGET, count: 1, fallback: false });
  assert.deepEqual(rows.find(row => row.id === THIRTY), { id: THIRTY, to: THIRTY_FALLBACK, count: 1, fallback: true });
});

test("test script accepts only the agreed query-bearing /ai URL", () => {
  for (const url of [
    "https://one.google.com/ai", "https://one.google.com/ai/other?x=1",
    "https://one.google.com/u/1/ai", "https://one.google.com/u/x/ai?x=1",
    "https://one.google.com/plans?x=1", "https://one.google.com.evil/ai?x=1",
    "http://one.google.com/ai?x=1"
  ]) {
    const result = run("g1-acq.js", { url, body: SOURCE });
    assert.deepEqual(result.payload, {});
    assert.equal(result.storage.size, 0);
  }
});

test("multi-account /u/N/ plan URLs are rewritten too", () => {
  for (const url of [
    "https://one.google.com/u/0/ai?g1_landing_page=75",
    "https://one.google.com/u/12/ai?hl=zh-TW"
  ]) {
    const result = run("g1-acq.js", { url, body: JSON.stringify([TWENTY, THIRTY]) });
    assert.deepEqual(JSON.parse(result.payload.body), [TWENTY_TARGET, THIRTY_TARGET]);
    assert.equal(get(result.storage, TEST_KEY).status, "rewritten");
  }
});

test("storage errors do not prevent a matched response from completing", () => {
  for (const flags of [{ storageAvailable: false }, { storageThrows: true }, { storageWriteFails: true }]) {
    const result = run("g1-acq.js", { body: SOURCE, ...flags });
    assert.equal(result.payload.body, TARGET);
  }
});

test("test records omit cookies, headers and full response data", () => {
  const result = run("g1-acq.js", { body: JSON.stringify({ sku: SOURCE, email: "private@example.test" }) });
  const saved = result.storage.get(TEST_KEY);
  assert(!saved.includes("private@example.test"));
  assert(!saved.includes("secret"));
  assert.deepEqual(result.reads, []);
});

test("collector discovers IDs and escaped dots while preserving the response", () => {
  const body = JSON.stringify([
    SOURCE, SOURCE, TARGET, "com.google.one.2tb.fixture.iog", "private@example.test"
  ]) + String.raw` "g1\u002eios\u002e2tb\u002eescaped" "g1&#46;2tb&#46;html"`;
  const result = run("g1-sku-scan.js", { body });
  assert.deepEqual(result.payload, {});
  const state = get(result.storage, SCAN_KEY);
  assert.equal(state.scannedResponses, 1);
  assert.equal(state.matchedResponses, 1);
  assert.equal(state.skus.length, 5);
  assert.equal(state.skus.find(row => row.id === SOURCE).count, 2);
  assert(state.skus.some(row => row.id === "g1.ios.2tb.escaped"));
  assert(state.skus.some(row => row.id === "g1.2tb.html"));
  assert(!JSON.stringify(state).includes("private@example.test"));
  assert(!JSON.stringify(state).includes("secret"));
});

test("collector accumulates prior records and recovers corrupt storage", () => {
  const storage = new Map([[SCAN_KEY, "corrupt JSON"]]);
  run("g1-sku-scan.js", { body: SOURCE, storage });
  run("g1-sku-scan.js", { url: "https://one.google.com/plans", body: SOURCE + " " + TARGET, storage });
  const state = get(storage, SCAN_KEY);
  assert.equal(state.scannedResponses, 2);
  assert.equal(state.skus.length, 2);
  assert.equal(state.skus.find(row => row.id === SOURCE).count, 2);
});

test("collector bounds stored candidates at 300 and still counts existing IDs", () => {
  const body = Array.from({ length: 305 }, (_, index) => "g1.fixture." + index).join(" ");
  const result = run("g1-sku-scan.js", { body });
  assert.equal(get(result.storage, SCAN_KEY).skus.length, 300);
  assert.equal(get(result.storage, SCAN_KEY).truncated, true);
  run("g1-sku-scan.js", { body: "g1.fixture.0", storage: result.storage });
  assert.equal(get(result.storage, SCAN_KEY).skus.find(row => row.id === "g1.fixture.0").count, 2);
});

test("collector skips the local report, other domains and nontext bodies", () => {
  for (const options of [
    { url: REPORT, body: SOURCE },
    { url: REPORT + "?format=json", body: SOURCE },
    { url: "https://one.google.com.evil/ai?x=1", body: SOURCE },
    { body: undefined }, { body: new Uint8Array([1, 2]) }
  ]) {
    const result = run("g1-sku-scan.js", options);
    assert.deepEqual(result.payload, {});
    assert.equal(result.storage.size, 0);
  }
});

test("collector passes through on storage failure", () => {
  const result = run("g1-sku-scan.js", { body: SOURCE, storageThrows: true });
  assert.deepEqual(result.payload, {});
  assert(result.logs.some(line => line.includes("saved=no")));
});

test("report displays captured IDs and test sources without external assets", () => {
  const storage = new Map();
  run("g1-sku-scan.js", { body: SOURCE, storage });
  run("g1-acq.js", { body: SOURCE, storage });
  const { payload } = run("g1-sku-report.js", { url: REPORT, storage });
  assert.equal(payload.response.status, 200);
  assert.match(payload.response.body, /Google One SKU 本地报告/);
  assert(payload.response.body.includes(SOURCE));
  assert(payload.response.body.includes(TARGET));
  assert(payload.response.body.includes("?format=json"));
  assert(!/<(?:script|img|iframe)\b/i.test(payload.response.body));
  assert.equal(payload.response.headers["Cache-Control"], "no-store");
});

test("report exports each actual target and separates annual hits from total hits", () => {
  const storage = new Map();
  run("g1-acq.js", {
    body: JSON.stringify([SOURCE, TWENTY, THIRTY, THIRTY_FALLBACK]), storage
  });
  const result = run("g1-sku-report.js", { url: REPORT + "?format=json", storage });
  const data = JSON.parse(result.payload.response.body).test;
  assert.equal(data.version, "g1-acq-v7.4");
  assert.equal(data.hitCount, 3);
  assert.equal(data.annualHitCount, 1);
  assert.equal(data.matchedFrom.find(row => row.id === TWENTY).to, TWENTY_TARGET);
  assert.deepEqual(data.matchedFrom.find(row => row.id === THIRTY), {
    id: THIRTY, count: 1, to: THIRTY_FALLBACK, fallback: true
  });
  const html = run("g1-sku-report.js", { url: REPORT, storage }).payload.response.body;
  assert(html.includes("最近一次三档映射"));
  assert(html.includes("其中 2TB：1"));
  assert(html.includes(TWENTY_TARGET));
  assert(html.includes(THIRTY_FALLBACK));
});

test("new report displays existing v1 records with their original 2TB target", () => {
  const storage = new Map([[TEST_KEY, JSON.stringify({
    schemaVersion: 1, version: "pro-annual-test-v1", hitCount: 2, status: "rewritten",
    matchedFrom: [{ id: SOURCE, count: 2 }]
  })]]);
  const result = run("g1-sku-report.js", { url: REPORT + "?format=json", storage });
  const data = JSON.parse(result.payload.response.body).test;
  assert.equal(data.version, "pro-annual-test-v1");
  assert.equal(data.hitCount, 2);
  assert.equal(data.annualHitCount, 2);
  assert.deepEqual(data.matchedFrom, [{ id: SOURCE, count: 2, to: TARGET, fallback: false }]);
  storage.set(TEST_KEY, JSON.stringify({
    schemaVersion: 1, version: "pro-annual-test-v1", hitCount: 0,
    status: "no-match", matchedFrom: []
  }));
  const html = run("g1-sku-report.js", { url: REPORT, storage }).payload.response.body;
  assert(html.includes("旧 v1 记录：本次响应未命中 iOS 2TB 前缀"));
});

test("JSON export is limited to report fields and escapes untrusted HTML text", () => {
  const storage = new Map([[SCAN_KEY, JSON.stringify({
    schemaVersion: 1, updatedAt: "<script>fixture</script>", scannedResponses: 1,
    secret: "must-not-export", body: "must-not-export",
    skus: [{ id: SOURCE, count: 2, lastSeen: "<img src=x>", secret: "must-not-export" }]
  })]]);
  const jsonResult = run("g1-sku-report.js", { url: REPORT + "?format=json", storage });
  assert.match(jsonResult.payload.response.headers["Content-Type"], /application\/json/);
  const report = JSON.parse(jsonResult.payload.response.body);
  assert.equal(report.scan.skus[0].id, SOURCE);
  assert(!jsonResult.payload.response.body.includes("must-not-export"));
  const htmlResult = run("g1-sku-report.js", { url: REPORT, storage });
  assert(!htmlResult.payload.response.body.includes("<script>fixture"));
  assert(htmlResult.payload.response.body.includes("&lt;img src=x&gt;"));
});

test("url log keeps only one.google.com paths and redacts credentials", () => {
  const storage = new Map();
  const target = "https://one.google.com/checkout?plan=g1.20tb.v2&token=abcd1234";
  run("g1-url-log.js", { url: target, storage });
  run("g1-url-log.js", { url: target, storage });
  run("g1-url-log.js", { url: "https://example.test/checkout?plan=g1.20tb.v2", storage });
  run("g1-url-log.js", { url: REPORT + "?format=json", storage });
  const state = get(storage, "g1.url.log.v1");
  assert.equal(state.logs.length, 1);
  assert(state.logs[0].u.includes("plan=g1.20tb.v2"));
  assert(!state.logs[0].u.includes("abcd1234"));
  assert(!JSON.stringify(state).includes("secret"));
});

test("clear action affects only the tool's three storage keys", () => {
  const storage = new Map([
    [SCAN_KEY, JSON.stringify({ schemaVersion: 1, skus: [{ id: SOURCE, count: 1 }] })],
    [TEST_KEY, JSON.stringify({ schemaVersion: 1, hitCount: 1 })],
    ["g1.url.log.v1", JSON.stringify({ schemaVersion: 1, logs: [{ u: "https://one.google.com/x", t: "00:00:00" }] })],
    ["other-tool", "untouched"]
  ]);
  const result = run("g1-sku-report.js", { url: REPORT + "?clear=1", storage });
  assert.deepEqual(get(storage, SCAN_KEY), {});
  assert.deepEqual(get(storage, TEST_KEY), {});
  assert.deepEqual(get(storage, "g1.url.log.v1"), {});
  assert.equal(storage.get("other-tool"), "untouched");
  assert.deepEqual(new Set(result.reads), new Set([SCAN_KEY, TEST_KEY, "g1.url.log.v1"]));
});

test("report handles unavailable storage and skips other URL paths", () => {
  const unavailable = run("g1-sku-report.js", { url: REPORT + "?format=json", storageAvailable: false });
  assert.equal(JSON.parse(unavailable.payload.response.body).storageAvailable, false);
  for (const url of ["https://one.google.com/ai?x=1", REPORT + "-other", "https://example.test/g1-sku-report"]) {
    const result = run("g1-sku-report.js", { url });
    assert.deepEqual(result.payload, {});
    assert.deepEqual(result.reads, []);
  }
});

test("the new installer replaces the old entry and all modules share one fixed release", () => {
  assert.equal(fs.existsSync(path.join(root, "g1-acq.sgmodule")), false);
  let scriptBase;
  for (const file of ["g1-acq-v7.sgmodule", "g1-pro-annual-test.sgmodule", "g1-sku-scan.sgmodule"]) {
    const module = fs.readFileSync(path.join(root, file), "utf8");
    const scripts = module.split("\n").filter(line => line.includes("script-path="));
    assert.equal(scripts.length, 2);
    if (file === "g1-acq-v7.sgmodule") assert.match(module, /^#!name=G1 ACQ$/m);
    for (const script of scripts) {
      if (script.includes("g1-url-log.js")) {
        assert.match(script, /^g1-url-log = type=http-request,pattern=\^https:\\\/\\\/one\\\.google\\\.com\\\//);
        continue;
      }
      const url = script.match(/script-path=([^,\s]+)/)[1];
      assert.match(url, /^https:\/\/cdn\.jsdelivr\.net\/gh\/[^/]+\/g1-acq@v7\.\d+\.\d+\/[a-z0-9.-]+\.js$/);
      const base = url.slice(0, url.lastIndexOf("/") + 1);
      if (!scriptBase) scriptBase = base;
      assert.equal(base, scriptBase);
      assert(fs.existsSync(path.join(root, url.split("/").at(-1))));
    }
    assert.match(module, /hostname = %APPEND% one\.google\.com/);
    const responseLine = scripts.find(line => line.includes("type=http-response"));
    const pattern = new RegExp(responseLine.match(/pattern=([^,]+)/)[1]);
    assert(pattern.test("https://one.google.com/ai?x=1"));
    assert(!pattern.test("https://one.google.com.evil/ai?x=1"));
    assert.equal(pattern.test("https://one.google.com/plans"), file === "g1-sku-scan.sgmodule");
    if (file !== "g1-sku-scan.sgmodule") {
      assert(!pattern.test("https://one.google.com/ai"));
      assert(pattern.test("https://one.google.com/u/1/ai?x=1"));
      assert(!pattern.test("https://one.google.com/u/x/ai?x=1"));
      assert.equal(responseLine.match(/script-path=([^,\s]+)/)[1],
        scriptBase + "g1-acq.js");
    }
    const requestLine = scripts.find(line => line.includes("type=http-request"));
    assert.equal(requestLine.match(/script-path=([^,\s]+)/)[1],
      scriptBase + "g1-sku-report.js");
  }
});
