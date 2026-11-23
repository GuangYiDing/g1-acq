# Pro 年付测试与 SKU 扫描

**G1 ACQ** 已合并三档改写：把订阅页中实际出现、前缀为 `g1.ios.2tb.` 的 **原始 iOS 2TB 完整 SKU** 改为 `g1.2tb.ai.annual`，同时保留 20TB / 30TB 优惠映射与各档独立的 75p 回退逻辑。2TB 年付目标没有备用档；20TB / 30TB 的完整源 ID 与目标见第 4 节。当前响应脚本版本为 `g1-acq-v7.1`，一个 **G1 ACQ** 即可覆盖三档。

`g1.2tb.ai.annual` 在 Google Play 公开记录中对应 Pro、`P1Y`（一年）、`US$199.99`。这条记录只说明 Play 中的商品信息，不确认 iOS 可购买，也不确认 iOS 一折价格。目前已证实匹配逻辑与脚本离线测试，App Store 识别结果、商品名称、周期、初次与续费金额均待实机核对。

## 1. 删除旧模块，安装新主模块

**G1 ACQ — 原始 iOS 2TB 年付测试，合并 20TB / 30TB 映射**

```text
https://cdn.jsdelivr.net/gh/GuangYiDing/g1-acq@v7.1.0/g1-acq-v7.sgmodule
```

在小火箭模块管理中删除手机上的旧 **G1 ACQ** 模块，再添加上面的唯一新主安装地址并启用；首次安装也使用该地址。模块名仍为 **G1 ACQ**，安装入口与内部响应、报告脚本均固定引用 `@v7.0.0`，无需单独添加脚本。安装后重新连接，再重新打开 Google App 的方案页。

历史 `pro-annual-test-v1` / `pro-annual-test-v2` 标签保留且不移动；手机上已有这些标签的副本时停用即可。[G1 Pro Annual Test 兼容入口](../g1-pro-annual-test.sgmodule) 引用同一 [g1-acq.js](../g1-acq.js)，无需另外启用。

测试阶段只启用本次新地址安装的 **G1 ACQ**，停用 **G1 SKU Scan**、**G1 Pro Annual Test**、历史 v1 / v2 副本与其它同页 SKU 改写模块。可选的原始 SKU 采集流程见第 3 节。

主模块包含本地报告脚本，只追加 MITM hostname `one.google.com`，并沿用原有全局 UDP 443 拦截规则；后者也会影响其它 App 的 HTTP/3、速度或连通性。

## 2. 配置 HTTPS 解密

模块要处理 HTTPS 响应，需在当前使用的配置中启用解密并信任证书。

1. 确认手机旧 **G1 ACQ** 已删除，启用第 1 节新地址安装的 **G1 ACQ**，保持小火箭 VPN 连接。
2. 进入 **配置页 → 当前使用配置右侧的 (i) 图标 → HTTPS 解密**，打开解密开关。
3. 已有可用且已受信任的 Shadowrocket 证书时直接沿用；尚未配置证书时，在该页生成并安装证书，再前往 iOS **设置 → 通用 → VPN 与设备管理** 完成描述文件安装。
4. 首次配置证书时，前往 iOS **设置 → 通用 → 关于本机 → 证书信任设置**，开启对应 Shadowrocket 根证书的信任。
5. 在当前配置的 **HTTPS 解密 hostname 列表**中核对 `one.google.com`。模块使用 `%APPEND%` 追加该域名；此处是 HTTPS 解密列表，不是 DNS Hosts。
6. 更改模块开关或解密配置后重新连接小火箭，再重新进入 Google App 的方案页面。

[README 中的配置入口截图](../README.md#安装shadowrocket--小火箭)展示了当前配置右侧的 `(i)` 入口。MITM hostname 覆盖 `one.google.com` 整个域名，脚本读取与改写范围由下文的 URL 匹配限定。

## 3. 可选：采集原始 SKU

本节记录手机实际加载页面中出现的编号，作为确定源 ID 的依据；需要采集时添加 **G1 SKU Scan**：

```text
https://cdn.jsdelivr.net/gh/GuangYiDing/g1-acq@v7.1.0/g1-sku-scan.sgmodule
```

采集模块与内部脚本均固定引用 `@v7.0.0`，并包含同一本地报告页。它与主模块共用两份手机本地记录，切换模块后仍可查看；MITM hostname 与全局 UDP 443 规则和主模块一致。

| 阶段 | G1 SKU Scan | G1 ACQ | G1 Pro Annual Test / 历史 v1、v2 副本 / 其它同页 SKU 改写模块 |
|---|---|---|---|
| 采集原始 SKU | 开启 | 关闭 | 关闭 |
| 测试合并三档（含 Pro 年付） | 关闭 | 开启 | 关闭 |

采集阶段仅开 **G1 SKU Scan**；采集结束后关闭它，再启用新地址安装的 **G1 ACQ** 按第 4 节测试。

1. 停用 **G1 ACQ**、**G1 Pro Annual Test**、历史 v1 / v2 副本与其它 SKU 改写模块，仅启用 **G1 SKU Scan**；切换后重新连接小火箭。
2. 打开 **Google App（彩色 G 图标）→ Google One 管理**，打开页面提供的 **2TB / Pro** 方案；核对保留映射时，再浏览实际提供的 **20TB / 30TB** 方案。
3. 页面提供月付、年付切换时，逐个浏览并等待页面加载完成。采集阶段浏览方案即可，无需完成购买；账号、地区、App 版本决定实际显示的方案与控件。
4. 保持小火箭连接，在同一手机的 Safari 打开 [SKU 本地报告](https://one.google.com/g1-sku-report)。
5. 查看“浏览页面时采集到的候选 SKU”，记录完整编号、次数、最近发现时间。寻找实际出现的 `g1.ios.2tb.` 前缀完整编号；20TB / 30TB 对照第 4 节的两个完整源 ID，不自行补全或猜测后缀。
6. 打开 [JSON 导出](https://one.google.com/g1-sku-report?format=json)，保存本轮采集结果。

采集器匹配 `https://one.google.com/` 下的文本响应，跳过自身的 `/g1-sku-report` 精确路径及其 query。它识别 `g1.*` 与 `com.google.one.*` 字符串，按 ID 去重累计出现次数；同一 ID 在一个响应中重复出现，或在后续采集响应中再次出现，都会增加次数，次数不是购买次数。

最多保留 **300 个不同 ID**。达到上限后继续更新已保存 ID 的次数和时间；遇到超出上限的新 ID 时，不再加入列表，并在报告页显示上限提示。需要重新采集目标页面时，先导出当前结果，再按第 5 节清空本工具的两份记录。

采集器会在用于识别的文本副本中还原 `\u002e`、`\x2e` 与 HTML 点号实体。响应正文通过 `$done({})` 原样返回；采集器不读取请求头或请求体，不保存完整响应正文，不查询 App Store，不向外发送采集数据。

## 4. 测试 `g1.2tb.ai.annual` 与 20TB / 30TB 映射

测试阶段关闭采集器，避免把改写后的编号混入原始 SKU 采集结果。

1. 关闭 **G1 SKU Scan**，只启用新地址安装的 **G1 ACQ**；**G1 Pro Annual Test**、历史 v1 / v2 副本和其它同页 SKU 改写模块继续关闭。
2. 核对当前配置右侧 **(i) → HTTPS 解密** 中的开关、`one.google.com` hostname 和 iOS 证书信任，然后重新连接小火箭。
3. 退出当前方案页，再从 **Google App（彩色 G）→ Google One 管理** 重新进入 **2TB / Pro** 方案。年付实验的源商品是原始 iOS 2TB；核对保留映射时分别打开页面实际提供的 20TB / 30TB 方案。
4. 从页面实际提供的方案进入订阅流程，核对 App Store 收银台中的 **商品名称、订阅周期、币种、初次金额、续费金额**。若未拉起收银台，记录屏幕上的实际提示；2TB、20TB、30TB 的结果分别记录。
5. 在 Safari 打开 [本地报告](https://one.google.com/g1-sku-report)，查看“最近一次三档映射”的版本、执行时间与状态；“总替换次数”是三档总数，“其中 2TB”是年付改写数，下方按行显示完整源编号、实际目标与备用状态。
6. 打开 [JSON 导出](https://one.google.com/g1-sku-report?format=json)，保留 `test.version`、`test.matchedFrom`、`test.target`、`test.hitCount`、`test.annualHitCount`、`test.status` 与 `test.updatedAt`，将它们和本次 App Store 显示结果一起记录。

脚本只处理匹配 `^https://one\.google\.com/ai\?` 的响应。在响应原文中先识别完整明文编号，再应用以下三档映射：

| 正文中的完整源 SKU | 默认目标 | 备用目标 |
|---|---|---|
| `g1.ios.2tb.` 前缀的完整 SKU | `g1.2tb.ai.annual` | 无 |
| `g1.ios.20tb.m.v2` | `g1.20tb.3months_ip_90p.acq` | `g1.20tb.3months_ip_75p.acq` |
| `g1.ios.30tb.ai.pro.m` | `g1.ai.ultra.3months_ip_90p.acq` | `g1.ai.ultra.3months_ip_75p.acq` |

2TB 匹配到的完整源 ID 固定替换为 `g1.2tb.ai.annual`，没有备用目标，也不要求目标预先出现在正文中。20TB / 30TB 必须命中表中的完整源 ID，各档独立按原始响应正文决定目标，保留原有判断：

- 默认 90p 目标出现在正文中时，使用 90p；即使对应 75p 也出现，仍优先 90p。
- 默认 90p 目标未出现、对应 75p 备用目标出现时，使用该档的 75p，记录 `fallback=true`。
- 默认 90p 与对应 75p 均未出现时，仍按默认 90p 替换。

20TB 的回退判断只使用 20TB 的目标，30TB 的回退判断只使用 30TB 的目标。这是响应正文中的目标字符串判断，不是向 App Store 或 Google Play 查询商品目录。其它编号保持原样；三档都未命中时原样返回响应。

| 报告字段 | 含义 |
|---|---|
| `test.version` | 生成该执行记录的脚本版本；当前主脚本为 `g1-acq-v7.1` |
| `test.matchedFrom` | 本次响应实际命中的完整源 ID，逐行格式为 `{id, to, count, fallback}`；`to` 是该源本次实际目标，`count` 是该源的改写次数，`fallback=true` 表示 20TB / 30TB 使用对应 75p 备用档 |
| `test.target` | 仍专指 2TB 年付目标 `g1.2tb.ai.annual`；20TB / 30TB 的实际目标看各行 `to` |
| `test.hitCount` | 本次响应三档总改写数；脚本输出中的 `hits=N` 对应此值 |
| `test.annualHitCount` | 本次响应仅 2TB 年付改写数；脚本输出中的 `annualHits=N` 对应此值 |
| `test.updatedAt` | 最近一次执行时间，UTC |
| `test.status = rewritten` | 三档中至少一档已执行字符串替换；只有 20TB / 30TB 命中时也为此状态 |
| `test.status = no-match` | 本次文本响应三档完整源 ID 都未命中，响应原样返回 |
| `test.status = non-text` | 本次响应没有可处理的文本正文，响应原样返回 |

当前日志使用 `[g1-acq]` 前缀，汇总格式为 `g1-acq-v7.1 hits=N annualHits=N`，逐行输出 `源 SKU → 实际目标 xN`；20TB / 30TB 选用备用档时，该行附 `fallback=75p`。报告中的 `to` 与逐行日志对应，主汇总的 `hits` 与 `annualHits` 分别对应 `hitCount` 与 `annualHitCount`。

这里保存的是**最近一次匹配 URL 的执行记录**，不是累计测试历史；后续零命中响应也会更新记录。核对时对照执行时间，命中次数仅证明文本替换，不证明 App Store 接受目标商品或已完成订阅。

`hitCount=0` 与 `status=no-match` 表示本次文本响应三档都未命中，不等于账号没有 2TB 商品，也不等于目标商品不存在。若 `annualHitCount=0`、`hitCount>0`，说明只命中了 20TB / 30TB，状态仍为 `rewritten`；判断 2TB 年付实验须看 `annualHitCount`，再对照各行 `id` 与 `to`。

采集器覆盖整个 `one.google.com/`，并可识别转义点号；合并改写仅处理 `/ai?` 原文中的完整明文编号。因此采集页出现候选 ID，不保证另一条 `/ai?` 响应能命中。目标档未命中时切回采集流程取得实际编号，不推测新的 iOS SKU。

## 5. 本地结果页、导出与清理

在小火箭连接且 **G1 ACQ** 或 **G1 SKU Scan** 开启时访问以下地址：

| 地址 | 动作 |
|---|---|
| [本地报告](https://one.google.com/g1-sku-report) | 显示累计采集结果与最近一次三档合并测试记录 |
| [导出 JSON](https://one.google.com/g1-sku-report?format=json) | 返回 `g1-sku-report.json` 下载响应 |
| [清空本工具记录](https://one.google.com/g1-sku-report?clear=1) | 清空本工具的采集记录与最近测试记录 |

结果页由 Shadowrocket 的 `http-request` 脚本拦截 **`https://one.google.com/g1-sku-report` 精确路径及其 query**，在本机生成 HTML 或 JSON 并直接返回，不把这次页面请求交给 Google 处理。HTML 不加载外部资源，结果页和导出脚本没有网络上报调用。

数据保存在手机 `$persistentStore` 中，两个键名与 `schemaVersion: 1` 均保持不变：

| 键 | 内容 |
|---|---|
| `g1.sku.scan.v1` | 候选 ID、累计次数、最近发现时间、扫描响应计数与上限状态 |
| `g1.pro.annual.test.v1` | 最近一次执行的脚本版本、2TB 源前缀、三档命中源 ID 与逐行实际目标及备用状态、2TB 目标、总改写数、2TB 改写数、时间和状态 |

HTML 按命中行显示完整源 ID、实际目标、次数与备用状态，避免把 `test.target` 误读成 20TB / 30TB 的目标。新版结果页兼容旧 v1 的仅 2TB 记录：旧行缺少 `to` 时补为 `g1.2tb.ai.annual`，缺少的 `annualHitCount` 从旧 2TB 行次数计算；旧行按未使用备用档展示。保留旧记录无需先清空这两个键。

JSON 中的核心采集字段是 `scan.skus`，每项含 `id`、`count`、`lastSeen`；测试字段见第 4 节。导出还包含必要的版本、存储状态与统计字段，不包含请求头、请求体或完整响应正文。

`?clear=1` 只清空上述两个键的内容，不执行小火箭“清空所有数据”。清空后返回不带 `clear=1` 的[本地报告地址](https://one.google.com/g1-sku-report)，避免刷新清理地址时再次清除新记录。

## 6. “扫描 SKU”的三个层级

| 层级 | 实际方法 | 能确认的内容 |
|---|---|---|
| 网页被动采集 | 本仓库 G1 SKU Scan，记录已浏览 `one.google.com/` 响应中的字符串 | 发现候选 ID；不确认商店收录、地区可售或当前账号购买资格 |
| iOS 商品查询 | 在对应 App 上下文中用 StoreKit `Product.products(for:)` 或 `SKProductsRequest` 查询一组已知 ID | 返回该 App 上下文下能取得的商品信息；StoreKit 客户端没有列出该 App 全部商品的接口 |
| Google Play 商品查询 | 用 Google Play Billing 查询已知商品 ID | 只证明 Play 目录中的商品信息，不等同于 iOS App Store 目录 |

本仓库提供第一级采集和网页 ID 改写测试，没有在小火箭中执行 StoreKit 或 Google Play Billing 查询。把一个 ID 放进网页、看到候选 ID、脚本成功替换、App Store 返回商品，是不同的验证结果，记录时分别描述。

## 7. 常见结果的判断

| 观察结果 | 下一步 |
|---|---|
| 报告页显示“暂无记录” | 核对启用的模块与 HTTPS 解密配置，再从 Google App 重新加载目标方案；以报告中的时间与扫描响应计数判断是否有新数据 |
| Safari 显示 Google 普通页面或 404，而不是本地报告 | 核对地址是否为精确 `/g1-sku-report` 路径、G1 ACQ 或 G1 SKU Scan 是否开启、小火箭是否连接、当前配置是否解密 `one.google.com` |
| 报告页显示本地存储接口暂未就绪 | 页面脚本未取得 `$persistentStore` 读取接口，当前页面不构成采集成功的证据；记录显示结果与小火箭版本 |
| 扫描响应计数增加，但没有候选 ID | 本次已处理的正文未出现匹配字符串；继续浏览实际提供的 2TB / Pro 与月付、年付页面，不凭空生成 ID |
| 已采集到 2TB ID，但 `annualHitCount` 为 0 | 对照执行时间、完整源 ID、`g1.ios.2tb.` 前缀与 `/ai?` 匹配范围；按第 3 节重新采集 |
| `status=rewritten`、`hitCount>0`，但 `annualHitCount=0` | 本次只改写了 20TB / 30TB；查看各行 `id`、`to` 与 `fallback`，此状态不代表 2TB 年付命中 |
| `status=no-match`、`hitCount=0` | 本次文本响应三档都未命中；对照第 4 节完整源 ID 与 URL 范围，再按第 3 节采集 |
| 20TB / 30TB 的 `fallback=true` | 对应默认 90p 未见于原始正文，已选用正文中的该档 75p；核对该行 `to` 和收银台实际结果 |
| `hitCount` 大于 0，但收银台报错或未出现 | 记录实际提示与该档的实际目标 `to`；文本替换成功与商店接受目标商品分别记录 |
| App Store 商品、周期或金额与预期不同 | 按收银台实际显示记录，不把 Play 中的 `P1Y / US$199.99` 套用为 iOS 结论 |
| 采集达到 300 个上限 | 先导出，再用 `?clear=1` 清空本工具记录，返回报告主页后集中浏览目标方案 |

## 8. 实机记录模板

```text
采集 / 测试时间（含时区）：[填写]
iOS / Google App / Shadowrocket 版本：[填写]
主模块名称：G1 ACQ
主模块地址：https://cdn.jsdelivr.net/gh/GuangYiDing/g1-acq@v7.1.0/g1-acq-v7.sgmodule
主模块发布版本：v7.0.0
主模块脚本版本：g1-acq-v7
当前阶段：采集 / 三档合并测试（含 2TB 年付）
当前启用模块：[填写]
Google App 内实际打开的方案名称：[填写 2TB / Pro、20TB 或 30TB 的实际名称]
采集到的原始 iOS 2TB 完整 SKU：[填写原文；未出现则记“未采集到”]
采集到的原始 iOS 20TB / 30TB 完整 SKU：[填写原文；未出现则记“未采集到”]
执行脚本版本 test.version：[填写]
最近测试时间 test.updatedAt：[填写]
逐行源 ID、实际目标、次数、备用状态 test.matchedFrom：[填写 {id, to, count, fallback}]
2TB 固定目标 test.target：g1.2tb.ai.annual
三档总改写数 test.hitCount：[填写]
仅 2TB 年付改写数 test.annualHitCount：[填写]
执行状态 test.status：[填写]
是否拉起 App Store 收银台：[填写]
App Store 商品名称：[填写实际显示]
订阅周期：[填写实际显示]
币种 / 初次金额 / 续费金额：[填写实际显示]
实际错误提示：[填写原文；未出现则记“无”]
是否实际完成购买：[填写]
购买后 Google One 账户显示的权益：[仅在实际购买后填写]
本轮 JSON 导出文件：[填写]
```
