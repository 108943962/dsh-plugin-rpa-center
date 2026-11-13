# RPA 中心（dsh-plugin-rpa-center）1.3

左侧栏入口 → 一个「作业 × 店铺」的自动化中心。第一家接入的是拼多多：**推广 / 订单 / 财务 / 账户余额** 四组、共 13 条作业，
其中 10 条是把原来每天手动跑的 **Automa 流程** 搬过来的（第 5 节有对照表与实测状态）。

界面可折叠：**本次运行**（默认收起，标题上就写着「已勾 N/13」）、**作业目录**、以及目录里的**每个分组**都能点标题收起；
折叠状态记在 localStorage，刷新后保持。

三条核心设计（都是「批量」场景逼出来的）：
1. **批量 ≠ 全跑**：每条作业有「批量」开关；顶部还有「本次运行」勾选（默认＝开着的那些），店铺按钮和「全部店铺跑一遍」都只跑勾上的；
2. **任何作业都能下载**：运行记录统一有 `artifacts`——文件类给业务文件，指标类自动落一份 CSV＋快照 JSON，另外每条运行都有一份 `run.json`；
3. **任何作业都能单独推接口**：见「结果推送」一节（全局默认 + 每条作业覆盖）。
后续的结算单、发票、商品报表只要在 `lib/jobs/` 加一个文件、在 `lib/jobs/index.mjs` 加一行元数据，
界面会自动出现这条作业（不用改 UI）。

## 安装

```bash
# 1) 在 DSH 的 profile 目录里加依赖（把 <you>/<sha> 换成你的仓库）
cd ~/.dsh/profiles/desktop
pnpm add github:<you>/dsh-plugin-rpa-center

# 2) 把包名写进 package.json 的 dsh.profile.bundles
#    bundles 里追加一行 "dsh-plugin-rpa-center"

# 3) 重启 DSH，左栏出现「RPA 中心」
```

本地开发时用 link 更省事：

```bash
cd ~/.dsh/profiles/desktop
pnpm add link:/path/to/dsh-plugin-rpa-center
```

装好之后 `~/.dsh/rpa-center/` 里会有 `config.json`（设置）、`runs.json`（运行记录）、`raw/`（产物）、`data/`（指标台账）。

## 两级维度：平台 → 业务

RPA 的第一层是**平台**（拼多多 / 天猫 / 淘宝 / 京东 / 抖音 / 1688），第二层才是业务分组（推广 / 财务）。

- 平台登记在 `lib/platforms.mjs`：`id / name / ready / backend / note`
- 作业登记里带 `platform`；面板顶部就是平台 tab，选中平台后只显示该平台的作业与该平台的店铺
- 未接入的平台（`ready:false`）不会给假按钮，而是显示「还缺什么 + 怎么接入」
- 已登记但该平台没有店铺时，显示「去账号管理新增一家并登录」

## 界面

左栏「RPA 中心」图标 → 面板：

```
RPA 中心                                  [刷新] [全部店铺跑一遍]
店铺 1 · 作业 13 · 今日成功 2 · 今日失败 0

作业目录   店铺 [购喜旺财务专用 ▾]
  推广 · 广告投放数据与报表
   月推广指标           [运行]  11-13 08:20 成功
   商品推广报表（本月）  [运行] [下载]
   推广报表（上月1号→今天）[运行]
  订单 · 订单对账报表
   订单对账报表（国内）  [运行]
  财务 · 账户资金与账单
   财务流水（上月）      [运行] [下载]
   货款对账单（上月）    [运行]
   保证金账单（上月）    [运行]
  账户余额 · 月汇总 / 月账单
   账单余额（国内·月汇总）[运行]

店铺
  购喜旺财务专用  pdd · 端口 9222  [打开店铺] [跑全部作业]   上次 08:21 成功

最近运行
  11-13 08:21 OK 购喜旺 · 财务流水（上月）· 6.0s  [2026-10-01~2026-10-31流水明细.xls]
  11-13 08:20 OK 购喜旺 · 月推广指标 · 6.5s  [总花费(元)=73400] [交易额(元)=126500] ...

设置 ▸ 店铺来源 / 引擎 / 推送接口（JSON）
```

## 稳定性处理（踩过的坑，都已修）

| 现象 | 原因 | 现在的做法 |
|---|---|---|
| `DATE_CELL_MISSING`（日期面板里找不到目标日） | ① 站内弹层（引导/活动/公告）盖住面板；② 页面同时开着主区间+对比区间两个面板，只点了一个；③ Esc 把刚打开的面板关掉 | 先清弹层（Esc + 关闭按钮 + 点遮罩）再开面板；**每轮把所有可见面板都翻到上个月**；只在面板确实没开时才补点 |
| 随机的 `Input.dispatchMouseEvent 超时` | 旧标签被中断后 Input 通道挂住；每条命令新建 WebSocket 把连接打满 | 每个作业跑在**新标签**上、跑完关闭；CDP 会话复用一条长连接 |
| 点了「下载明细」永远等不到文件 | ① 目录里已有同名文件（Chrome 改名/跳过）；② 文件几百毫秒就落盘，点完再扫目录会把它当「本来就有的」 | 每次运行用新的 `dl-xxx` 子目录；**点之前**先给目录拍快照作基线 |

## 指标怎么用（指标项之后去哪了）

指标类作业（`promotion_month`）跑完会落三处：

1. **运行记录**：界面「最近运行」里那排 chip（`总花费(元)=74900` …），点每行的 `JSON` 可下载整条快照
2. **快照 JSON**：`~/.dsh/rpa-center/data/<storeId>/<jobId>/<时间>.json`
   ```json
   { "ts": "…", "store": {…}, "platform": "pdd", "job": {…}, "range": {…},
     "metrics": [ { "key": "total_cost", "label": "总花费(元)", "value": 74900 } ] }
   ```
3. **追加台账 CSV**：`~/.dsh/rpa-center/data/metrics.csv`（长表，一行一个指标，`ts,storeId,storeName,platform,jobId,rangeStart,rangeEnd,key,label,value`）
   - 界面「最近运行」右上角「下载 CSV」
   - 代码/后端：`GET /rpa/metrics?storeId=&jobId=&limit=`（带 `x-dsh-rpa-center: 1`）
   - 推送：设置里打开「结果推送」后，每次运行会 POST `{store, job, range, metrics}` 到你的接口；
     **每条作业可以配自己的地址**（见「按作业配接口」）

典型用法：每天跑一次 `promotion_month` → CSV 累积成时间序列 → Excel/pandas/BI 直接出趋势；
`finance_month` 产出 xls，交给下游解析成「每日推广支出」再和推广数据对齐。

## 作业与产出的对应关系

| 作业 id | 分组 | 区间 | 产出 | 落点 |
|---|---|---|---|---|
| `promotion_month` | 推广 | 上月 1 号 → 今天 | 指标（17 项） | 运行记录 + 推送 |
| `ads_goods_month` | 推广 | 本月 1 号 → 今天 | xls | `raw/<店铺>/ads_goods_month/` |
| `ads_month_export` | 推广 | 上月 1 号 → 今天 | xls | 同上 |
| `order_guonei` | 订单 | 近 3 个月（平台上限） | csv | `raw/<店铺>/order_guonei/` |
| `order_guowai` | 订单 | 同上 | csv | 同上 |
| `finance_month` | 财务 | 上月整月 | xls | `raw/<店铺>/finance_month/` |
| `finance_30d` | 财务 | 昨天往前 30 天 | xls | 同上（适合每日对账） |
| `bill_guonei` | 财务 | 上月整月 | zip（内含 csv） | `raw/<店铺>/bill_guonei/` |
| `bill_guowai` | 财务 | 上月整月 | zip | 同上 |
| `bill_deposit` | 财务 | 上月整月 | zip | 同上 |
| `balance_guonei` | 账户余额 | 上月（表格含全年各月） | 指标（每格一项） | 运行记录 + `metrics.csv` |
| `balance_guowai` | 账户余额 | 同上 | 指标 | 同上 |
| `ads_balance` | 账户余额 | 同上 | 指标（月份/余额/收入/支出） | 同上 |

## 5. 从 Automa 搬过来的 10 条日常流程

> 原件就是仓库里那 10 份 `*.automa.json`。搬过来的原则：**页面动作照抄，编排层重写**。
> Automa 里那些 webhook/钉钉/SMS/loop-data/repeat-task 是它自己那套后端（localhost:8000/8001）在做的编排，
> 这里由「店铺 × 作业 × 运行记录 × 指标台账 × 推送」替代；cookie 注入/SMS 验证码也不再需要（每店一个 Chrome 档案，登录一次长期复用）。

| Automa 原件 | 现在的作业 | 页面 | 实测（2026-11-13 本店 Chrome） |
|---|---|---|---|
| `1.2026-pdd国内下载对账单-月` | `bill_guonei` | 对账中心·货款账户 | ✅ 2026-10 整月，38 KB zip |
| `2.2026-pdd下载海外对账单-月` | `bill_guowai` | 跨境财务流水页（国内店落到对账中心） | ✅ 落到对账中心后同上 |
| `3.2026-pdd下载海外订单-月` | `order_guowai` | 订单查询 → 批量导出 | ✅ 892 KB csv |
| `4.2026-pdd国内订单-月` | `order_guonei` | 同上 | ✅ 同上 |
| `5.1.2026-pdd-商品推广月` | `ads_goods_month` | 推广报表·商品推广总览 | ✅ 2026-11-01~11-13，41 KB xls |
| `6.2026-pdd-月推广数据-月` | `ads_month_export` | 同上 | ✅ 2026-10-01~11-12，60 KB xls |
| `7.2026-pdd国外下载账单余额` | `balance_guowai` | 对账中心·月汇总 | ✅ 11 行 / 77 指标 |
| `8.2026-pdd国内下载账单余额` | `balance_guonei` | 同上 | ✅ 同上 |
| `9.2026-pdd国内下载保证金` | `bill_deposit` | 对账中心·保证金账户 | ✅ 上月 zip（本店该月无数据，内含 279B csv） |
| `10.2026-pdd下载推广月余额` | `ads_balance` | 推广账户·财务流水·月账单 | ✅ 20 行 / 100 指标 |

### 搬的过程中修掉的坑

| Automa 的做法 | 为什么不行 | 现在的做法 |
|---|---|---|
| 直连 `cashier.pinduoduo.com/...` | 缺 mms 的 SSO，页面直接「登录异常，请返回后重试」 | 走 `mms.pinduoduo.com/cashier/finance/payment-bills`，站点自己做一次 SSO |
| 用 `switch-tab` 在多个标签之间跳 | 本引擎一个会话绑一个标签 | mms 桥接 URL 同标签直达；导出确实开新标签的场景（导出历史、导出记录页）用 `waitForTab` 接管 |
| 「点第一个文本为 1 的格子，再点它前面那个格子」= 整月 | 跨年、面板翻页、对比面板都会点错 | `pickMonthRpr` 按 header 上的「2026年10月」找面板再点具体某天，找不到就点左箭头翻月 |
| 点「导出」→ 睡 4 秒 → 点 `downloadBalance-btn-0` | 导出是**异步任务**：先落到「导出历史」，任务生成后才有下载入口 | 点导出 → 等新标签/导出历史 → 轮询下载入口 → 点下载 → 文件真落盘才算成功 |
| 点「生成报表」后 sleep 30+20 秒再点下载 | 导出记录页**永远显示最近一次已生成的报表**，直接点会下到几分钟前那份 | 读页面上的「生成报表时间」，晚于本次提交才下载；否则重开标签重试（最多 40s） |
| 8 个 `get-text` + export-data 导出 CSV | 一列一个块，改版就错位 | 直接读整张表 → 拍平成指标（label 带月份前缀）进 `metrics.csv` 台账 |
| 发现验证码就发短信、睡 40-60 秒等人填 | 无人值守时必然卡死 | `assertAlive()` 如实报 `LOGIN_REQUIRED`，让人去「打开店铺」手动过一次 |

### 已知边界（这两条失败会明确报错，不会静默给错数据）

- **订单导出有 5 分钟间隔**（弹窗里写死的：「两次导出的时间间隔请保持在5分钟以上」）。5 分钟内重复跑会被降级成
  「下载最近一份」，`extra.reportTime` 里记录的是那份报表的生成时间；要严格对时就把这条作业单独排期。
- 站点偶发把真实鼠标事件吞掉（`Input.dispatchMouseEvent` 超时）。导出记录页这类页面已经改成 **DOM 点击优先**。
- 保证金/货款账单是 zip（内含 csv/xls），本插件只负责拿到文件，解析交给下游。

## 开发/排障工具

```bash
cd <本仓库目录>
node tools/run-job.mjs --list                    # 列店铺 + 作业
node tools/run-job.mjs 购喜旺财务专用 bill_guonei   # 不经界面直接跑一条（跑的是同一份代码）
node tools/peek.mjs <url> 'document.title'       # 开临时标签看页面（只读，跑完关掉）
node tools/smoke.mjs                             # 提交前自检：面板一打开就会调的 /state、/config 全打一遍（临时 DSH_HOME，不碰真数据）
```

## 批量运行：跑哪些作业由你定

两层，别混：

| 层 | 在哪 | 作用 |
|---|---|---|
| **批量开关**（长期） | 作业行左边的「批量」勾选框 | 决定这条作业**算不算**批量的默认成员；关掉后单条「运行」照样能跑 |
| **本次运行**（这一次） | 顶部「本次运行」那排 chip | 只有勾上的会被跑；点「全选/清空」，或点「恢复默认」回到跟着批量开关走 |

- 店铺行「跑作业」、顶部「全部店铺跑一遍」都走**本次勾选**（没勾就提示），不会再无脑把 13 条全跑一遍
- 接口层同样支持：`POST /rpa/run {storeId, jobs:[...]}`、`POST /rpa/run-all {jobs:[...], storeId?}`
- 只跑某一家店：`run-all` 带 `storeId`（界面上的店铺行按钮就是这个语义）

## 产物：任何作业都能下载

每条运行记录都有 `artifacts: [{role, kind, name, path, bytes}]`，界面直接渲染成下载按钮：

| role | 内容 | 谁有 |
|---|---|---|
| `business` | 站点下载的文件（zip / xls / csv） | 下载型作业 |
| `metrics` | 本次运行的指标 CSV（带 BOM，Excel 双击就开） | 指标型作业 |
| `snapshot` | 指标快照 JSON（含 store/job/range/metrics） | 指标型作业 |
| `run` | 整条运行记录 JSON（区间、日志、推送结果、产物清单） | **所有作业**（兜底） |

所以「余额/推广指标」这类原本只有数字的作业，现在也能一键下 CSV/JSON；「下载型」作业除了业务文件，还留一份 `run.json` 备查。
老记录没有 `artifacts` 时，界面会退回显示 `file` / `ledger.snapshot`。

## 设置页（不再是裸 JSON）

面板底部「设置（点开调整）」现在是表单：

| 项 | 说明 |
|---|---|
| **店铺来源** | 二选一：跟「账号管理」共用（推荐）/ 只用本插件自己的店铺列表 |
| **浏览器** | Chrome 可执行文件路径 + 「检测」按钮（✅ 找到 / ❌ 路径不对） |
| **结果推送（默认）** | 全局兜底：开关、地址、方法（POST/GET）、超时、是否附带文件 base64。地址里可写 `{task}` 占位符 |
| **按作业配接口** | 13 条作业各一行，填了就推到自己的地址；留空 = 用上面的默认接口。右侧「清空」把作业恢复成用默认 |
| **平台** | 只读：已接入哪些、未接入哪些（接入要改代码） |
| **高级** | 折叠的原始 JSON，给排障用，一般不用碰 |

## 结果推送：每条作业可以有自己的接口

下游通常是分开的（账单进财务库、订单进订单库、推广数据进 BI），所以推送不是一个地址，而是两层：

```json
{
  "push": {                      // 全局默认（没单独配的作业用这个）
    "enabled": true,
    "url": "http://127.0.0.1:8000/rpa/inbox?task={task}",
    "method": "POST", "timeoutMs": 20000, "includeFileBase64": true
  },
  "pushes": {                    // 每条作业自己的接口（优先级最高）
    "bill_guonei":  { "enabled": true,  "url": "http://127.0.0.1:8000/finance/bill",  "includeFileBase64": false },
    "order_guonei": { "enabled": false, "url": "http://127.0.0.1:8000/orders/import" }
  }
}
```

判定顺序（`lib/push.mjs` 的 `resolvePush`）：

1. `pushes[作业id]` 有地址 → 用它；它的 `enabled:false` 表示「这条作业不推」（即使全局开着）
2. 否则看全局 `push.enabled` + `push.url`
3. 都没有 → 只存本地，运行记录里标「未推送」

请求体：`{ source, version, task(=作业id), job:{id,name,group}, store:{id,name,storeId,platform}, range, ranAt, metrics? , file?{name,size,base64?} }`。
GET 方式则把 `storeId / task / start / end` 拼进 URL（区间可能为空，比如订单导出由站点决定区间，这时不加 start/end）。
运行记录里每条都会带 `push`：`{ok,status,source:'job'|'global',url}` 或 `{skipped:true,reason}`，面板「最近运行」上显示 `推送·专用✓` / `推送✗`。

只允许 `http(s)` 地址（`state.mjs` 的 `safePushUrl` 会把 `file:` 之类直接丢掉），避免配置变成任意协议的手脚。

## 店铺从哪来

`source: "shop-accounts"`（默认）：直接读 `~/.dsh/shop-accounts/accounts.json`，
复用「账号管理」插件的店铺、Chrome 档案、调试端口、登录态。平台白名单 `platforms: ["pdd"]`。

于是两个插件的关系是：**账号管理负责「有哪些店、登没登录」，RPA 中心负责「对这些店跑什么」**。

## HTTP 接口（面板用的就是这几个）

```
GET  /rpa/state                            店铺 + 作业目录 + 分组 + 最近运行
POST /rpa/run       {storeId, jobs?, start?, end?}
POST /rpa/run-all   {jobs?}
POST /rpa/open      {storeId}              打开（必要时拉起）店铺 Chrome
GET  /rpa/file?path=...                    下载产物（只允许插件目录内）
POST /rpa/config    {source, push, ...}
POST /rpa/clear-runs {withMetrics?}        清空运行记录；withMetrics=true 连指标台账 CSV 一起清
```
全部要求 `x-dsh-rpa-center: 1` 请求头（同源防线）。

## 接入一个新平台（比如天猫）

1. `lib/platforms.mjs` 里把 `tmall` 的 `ready` 改成 `true`（或新增平台行）
2. `lib/jobs/common.mjs` 补该平台的页面地址与选择器（或新建 `common-tmall.mjs`）
3. `lib/jobs/index.mjs` 给该平台加作业行（`platform: 'tmall'`）
4. 重启 DSH：面板顶部会出现「天猫」tab，账号管理里加一家天猫店即可跑

## 加一个新 RPA

```js
// lib/jobs/bill.mjs
export async function runBill(session, { range, log }) { /* 页面动作 */ return { range, file } }

// lib/jobs/index.mjs
{
  id: 'bill_month', group: 'finance', name: '结算账单（上月）',
  platform: 'pdd', rangeMode: 'last_month', rangeLabel: '上月整月',
  output: 'file', desc: '结算中心导出的账单',
  timeoutMs: 90000, run: runBill,
}
```

## 已知边界

- 站内接口都带加密 `crawlerInfo`，只能走页面；引擎用真实鼠标点击 + 明确错误码
- 财务导出是 `.xls`（BIFF），本插件只负责拿到文件，解析交给下游
- 新增平台（淘宝/京东）需要补 `jobs/common.mjs` 里的页面地址与选择器
