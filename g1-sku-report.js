/* Local-only report served by a Shadowrocket http-request script. */
"use strict";

(function () {
  var ROOT = "https://one.google.com/g1-sku-report";
  var SCAN_KEY = "g1.sku.scan.v1";
  var TEST_KEY = "g1.pro.annual.test.v1";
  var URL_KEY = "g1.url.log.v1";
  var url = typeof $request === "object" && $request ? $request.url : "";
  if (typeof url !== "string" || !/^https:\/\/one\.google\.com\/g1-sku-report(?:\?|$)/.test(url)) {
    $done({});
    return;
  }

  var storageAvailable = typeof $persistentStore !== "undefined" &&
    typeof $persistentStore.read === "function";
  var clearMessage = "";
  if (/(?:\?|&)clear=1(?:&|$)/.test(url)) {
    try {
      var scanCleared = $persistentStore.write("{}", SCAN_KEY);
      var testCleared = $persistentStore.write("{}", TEST_KEY);
      var urlCleared = $persistentStore.write("{}", URL_KEY);
      clearMessage = scanCleared && testCleared && urlCleared ?
        "本工具的三份本地记录已清空。" : "本地记录清空未完成。";
    } catch (error) {
      clearMessage = "本地存储接口暂未就绪。";
    }
  }

  function load(key) {
    if (!storageAvailable) return {};
    try {
      var value = JSON.parse($persistentStore.read(key) || "{}");
      return value && value.schemaVersion === 1 ? value : {};
    } catch (error) {
      return {};
    }
  }
  function text(value, length) {
    return typeof value === "string" ? value.slice(0, length || 180) : "";
  }
  function count(value) {
    var number = Number(value);
    return isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }
  function rows(value, withTime) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 300).filter(function (row) {
      return row && typeof row.id === "string" &&
        /^(?:g1\.|com\.google\.one\.)[A-Za-z0-9._-]{1,160}$/.test(row.id);
    }).map(function (row) {
      var out = { id: row.id, count: count(row.count) };
      if (withTime) {
        out.lastSeen = text(row.lastSeen, 32);
      } else {
        out.to = typeof row.to === "string" && /^g1\.[A-Za-z0-9._-]{1,160}$/.test(row.to) ?
          row.to : row.id.indexOf("g1.ios.2tb.") === 0 ? "g1.2tb.ai.annual" : "";
        out.fallback = row.fallback === true;
      }
      return out;
    }).sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  }

  function lines(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 4).filter(function (row) {
      return typeof row === "string" && row.length > 0;
    }).map(function (row) {
      return row.slice(0, 160).replace(/[^\x20-\x7e]/g, " ");
    });
  }

  function urlRows(value) {
    if (value && Array.isArray(value.logs)) {
      return value.logs.slice(-15).filter(function (row) {
        return row && typeof row.u === "string";
      }).map(function (row) {
        return {
          u: row.u.slice(0, 260).replace(/[^\x20-\x7e]/g, " "),
          t: typeof row.t === "string" ? row.t.slice(0, 8) : ""
        };
      });
    }
    return [];
  }

  var scanRaw = load(SCAN_KEY);
  var testRaw = load(TEST_KEY);
  var matchedFrom = rows(testRaw.matchedFrom, false);
  var annualHitCount = typeof testRaw.annualHitCount === "number" ? count(testRaw.annualHitCount) :
    matchedFrom.reduce(function (total, row) {
      return total + (row.id.indexOf("g1.ios.2tb.") === 0 ? row.count : 0);
    }, 0);
  var report = {
    schemaVersion: 1,
    storageAvailable: storageAvailable,
    scan: {
      updatedAt: text(scanRaw.updatedAt, 32),
      scannedResponses: count(scanRaw.scannedResponses),
      matchedResponses: count(scanRaw.matchedResponses),
      truncated: scanRaw.truncated === true,
      limit: 300,
      skus: rows(scanRaw.skus, true)
    },
    test: {
      version: text(testRaw.version, 32),
      updatedAt: text(testRaw.updatedAt, 32),
      sourcePrefix: "g1.ios.2tb.",
      target: "g1.2tb.ai.annual",
      status: text(testRaw.status, 32),
      hitCount: count(testRaw.hitCount),
      annualHitCount: annualHitCount,
      aliasSeen: count(testRaw.aliasSeen),
      samples: lines(testRaw.samples),
      bodyLength: count(testRaw.bodyLength),
      bodyHead: text(testRaw.bodyHead, 200),
      tokens: Array.isArray(testRaw.tokens) ?
        testRaw.tokens.slice(0, 24).filter(function (row) {
          return typeof row === "string" && row.length > 0;
        }).map(function (row) { return row.slice(0, 60); }) : [],
      matchedFrom: matchedFrom
    },
    urlLog: urlRows(load(URL_KEY))
  };

  var headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
  };
  if (/(?:\?|&)format=json(?:&|$)/.test(url)) {
    headers["Content-Type"] = "application/json; charset=utf-8";
    headers["Content-Disposition"] = 'attachment; filename="g1-sku-report.json"';
    $done({ response: { status: 200, headers: headers, body: JSON.stringify(report, null, 2) } });
    return;
  }

  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }
  function table(items, withTime) {
    if (!items.length) return "<p>暂无记录。</p>";
    return "<div class=scroll><table><thead><tr><th>完整商品编号</th><th>次数</th>" +
      (withTime ? "<th>最近发现时间（UTC）</th>" : "<th>实际目标 SKU</th><th>备用档</th>") + "</tr></thead><tbody>" +
      items.map(function (row) {
        return "<tr><td><code>" + escape(row.id) + "</code></td><td>" + row.count + "</td>" +
          (withTime ? "<td>" + escape(row.lastSeen) + "</td>" :
            "<td><code>" + escape(row.to || "未记录") + "</code></td><td>" + (row.fallback ? "75p" : "否") + "</td>") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }
  var statuses = {
    "rewritten": "已执行字符串替换",
    "no-match": "本次响应未命中三档映射中的源商品",
    "non-text": "本次响应没有可处理的文本正文"
  };
  var status = Object.prototype.hasOwnProperty.call(statuses, report.test.status) ?
    statuses[report.test.status] : "暂无测试执行记录";
  if (report.test.version === "pro-annual-test-v1" && report.test.status === "no-match") {
    status = "旧 v1 记录：本次响应未命中 iOS 2TB 前缀";
  }
  var html = [
    "<!doctype html><html lang=zh-CN><meta charset=utf-8>",
    "<meta name=viewport content=\"width=device-width,initial-scale=1\"><title>Google One SKU 本地报告</title>",
    "<style>body{font:16px/1.6 -apple-system,BlinkMacSystemFont,sans-serif;max-width:960px;margin:24px auto;padding:0 18px;color:#1c2737;background:#f5f7fa}section{background:white;border:1px solid #dde3ec;border-radius:12px;padding:18px;margin:18px 0}h1{font-size:24px}h2{font-size:20px}code{overflow-wrap:anywhere}a{color:#1259be;margin-right:18px}table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.scroll{overflow:auto}.note{color:#46556b}button{font:inherit;padding:8px 14px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:#eef2f8;border:1px solid #dde3ec;border-radius:8px;padding:10px}</style>",
    "<h1>Google One SKU 本地报告</h1>",
    "<p class=note>此页由手机上的 Shadowrocket 脚本生成；没有向外发送采集数据。</p>",
    "<p><a href=\"" + ROOT + "\">刷新</a><a href=\"" + ROOT + "?format=json\">导出 JSON</a></p>",
    clearMessage ? "<p>" + escape(clearMessage) + "</p>" : "",
    storageAvailable ? "" : "<p>本地存储接口暂未就绪；此页尚未读取到采集记录。</p>",
    "<section><h2>最近一次三档映射</h2>",
    "<p>版本：" + escape(report.test.version || "暂无") + "<br>状态：" + escape(status) + "；总替换次数：" + report.test.hitCount + "；其中 2TB：" + report.test.annualHitCount + "</p>",
    "<p>2TB 源前缀：<code>g1.ios.2tb.</code><br>2TB 固定目标：<code>g1.2tb.ai.annual</code><br>20TB / 30TB 沿用旧优惠映射与 75p 回退；各档实际目标见下表。<br>执行时间（UTC）：" + escape(report.test.updatedAt || "暂无") + "</p>",
    "<p class=note>这里记录的是脚本执行结果；商品是否被 App Store 识别、价格和周期需查看购买面板。</p>",
    table(report.test.matchedFrom, false), "</section>",
    "<section><h2>原始响应普查（v7.5 诊断）</h2>",
    "<p>响应长度：" + report.test.bodyLength + " 字符；其中的 <code>g1.*</code> 编号共 " + report.test.tokens.length + " 个。</p>",
    report.test.tokens.length ?
      "<pre>" + report.test.tokens.map(escape).join("\n") + "</pre>" :
      "<p>本次响应正文里没有出现任何 <code>g1.*</code> 编号。</p>",
    report.test.bodyHead ?
      "<p class=note>正文开头 160 字符（控制字符已替换）：</p><pre>" + escape(report.test.bodyHead) + "</pre>" : "",
    "</section>",
    "<section><h2>订阅相关请求 URL（v7.3 诊断）</h2>",
    "<p>最近 " + report.urlLog.length + " 条 one.google.com 请求（本机记录，未外发）：</p>",
    report.urlLog.length ?
      "<pre>" + report.urlLog.map(function (row) {
        return escape((row.t ? row.t + "  " : "") + row.u);
      }).join("\n") + "</pre>" :
      "<p>暂无记录。打开方案页并点一次「订阅」后再回来看。</p>",
    "</section>",
    "<section><h2>浏览页面时采集到的候选 SKU</h2>",
    "<p>扫描文本响应：" + report.scan.scannedResponses + "；含候选 SKU 的响应：" + report.scan.matchedResponses + "；累计编号：" + report.scan.skus.length + "</p>",
    "<p class=note>数据来自 one.google.com 已浏览页面中的字符串，并非商店的完整商品目录；此采集器保持原响应正文。</p>",
    report.scan.truncated ? "<p>记录已达到 300 个上限；清空后可重新采集目标页面。</p>" : "",
    table(report.scan.skus, true),
    "<p>更新时间（UTC）：" + escape(report.scan.updatedAt || "暂无") + "</p></section>",
    "<form method=get action=\"" + ROOT + "\"><button name=clear value=1>清空本工具的采集与测试记录</button></form>",
    "<p class=note>采集时仅启用 G1 SKU Scan；测试时仅启用 G1 ACQ，停用采集器和重复的 G1 Pro Annual Test 模块。</p></html>"
  ].join("");
  $done({ response: { status: 200, headers: headers, body: html } });
})();
