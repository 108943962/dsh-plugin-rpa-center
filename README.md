# RPA 中心（dsh-plugin-rpa-center）

DSH 左侧栏的「作业 × 店铺」自动化中心：对已登录的店铺批量跑推广 / 订单 / 财务 / 账户余额的日常导出与采集。

- 本仓库：<https://github.com/108943962/dsh-plugin-rpa-center>
- 当前接入平台：**拼多多**（13 条作业，见下方清单）
- 配套插件：**账号管理** `dsh-plugin-shop-accounts`（店铺与登录态都来自它）

## 店铺与「账号管理」共用档案

RPA 中心**不存密码、不另建浏览器档案**。默认（`source: "shop-accounts"`）直接读
`~/.dsh/shop-accounts/accounts.json`，复用「账号管理」插件里每个店铺的：

| 复用什么 | 从哪来 | 用途 |
|---|---|---|
| 店铺名 / storeId | `accounts.json` | 面板上的店铺列表、运行记录、推送里的 `store` |
| Chrome 用户目录 `profileDir` | 同上 | 跑作业时用**同一份档案**，登录一次长期复用 |
| 调试端口 `port` | 同上 | CDP 连接（默认 9222） |
| 登录态 | 同上（cookie 在档案里） | 掉登录/弹验证码时如实报 `LOGIN_REQUIRED`，去「打开店铺」手动过一次即可 |

于是两家插件分工是：**「账号管理」负责有哪些店、登没登录；「RPA 中心」负责对这些店跑什么**。
在「账号管理」里新增或登录一家店，这里刷新就能看到；这里的「打开店铺」拉起的是同一份档案，不是第二份。

用到的「账号管理」插件：

- 本机部署用的 fork：<https://github.com/108943962/dsh-plugin-shop-accounts>
- 上游原仓库：<https://github.com/monagisa/dsh-plugin-shop-accounts>（MIT，作者 monagisa）

### 不共用：只用本插件自己的店铺

设置 → 店铺来源 →「只用本插件自己的店铺」，下面会出现店铺编辑区，直接填：

| 字段 | 说明 |
|---|---|
| 店铺名 | 面板上显示的名字 |
| storeId | 可空，默认用店铺 id（推送/统计里用它） |
| 端口 | 可空，自动从 9200 起分配（多家不撞） |
| Chrome 档案目录 | 可空，默认 `~/.dsh/rpa-center/profiles/<店铺id>` |

保存后这家店会出现在店铺列表里，作业照常跑。**用哪份档案由你决定**：档案是新的，第一次点「打开店铺」会拉起浏览器停在登录页，
手动登录一次即可（登录态留在该档案里，长期复用；不会读「账号管理」的任何数据）。

## 安装

```bash
# 1) profile 里加依赖（两个一起装：RPA 中心 + 账号管理）
cd ~/.dsh/profiles/desktop
pnpm add github:108943962/dsh-plugin-rpa-center github:108943962/dsh-plugin-shop-accounts

# 2) package.json 的 dsh.profile.bundles 里要有这两行：
#    "dsh-plugin-shop-accounts"、"dsh-plugin-rpa-center"

# 3) 重启 DSH，左栏出现「RPA 中心」
```

本地开发用 link：`pnpm add link:/path/to/dsh-plugin-rpa-center`。

运行数据都在 `~/.dsh/rpa-center/`：`config.json`（设置）、`runs.json`（运行记录）、`raw/`（产物）、`data/`（指标台账）。

## 作业清单（13 条，拼多多）

| 作业 id | 分组 | 区间 | 产出 |
|---|---|---|---|
| `promotion_month` | 推广 | 上月 1 号 → 今天 | 指标 17 项 |
| `ads_goods_month` | 推广 | 本月 1 号 → 今天 | xls |
| `ads_month_export` | 推广 | 上月 1 号 → 今天 | xls |
| `order_guonei` / `order_guowai` | 订单 | 近 3 个月（平台上限） | csv |
| `finance_month` | 财务 | 上月整月 | xls |
| `finance_30d` | 财务 | 昨天往前 30 天 | xls |
| `bill_guonei` | 财务 | 上月整月 | zip（内含 csv） |
| `bill_guowai` | 财务 | 上月整月 | zip |
| `bill_deposit` | 财务 | 上月整月 | zip |
| `balance_guonei` / `balance_guowai` | 账户余额 | 月汇总（表格含全年各月） | 指标 |
| `ads_balance` | 账户余额 | 月账单（含各月） | 指标 |

## 界面

- **批量开关**（作业行左侧）：决定这条作业算不算跑量成员；关掉后单条「运行」照样能跑
- **本次运行**（顶部 chip）：这一次只跑勾上的；店铺的「跑作业」和「全部店铺跑一遍」都按它来
- **折叠**：本次运行 / 作业目录 / 每个分组都能点标题收起，状态记在 localStorage
- **最近运行**：每条都带产物下载按钮与推送结果
- **设置**：店铺来源、Chrome 路径、推送接口、按作业配接口

## 产物：任何作业都能下载

每次运行都有 `artifacts: [{role, kind, name, path, bytes}]`，界面渲染成下载按钮：

| role | 内容 | 谁有 |
|---|---|---|
| `business` | 站点下载的文件（zip / xls / csv） | 下载型作业 |
| `metrics` | 本次运行的指标 CSV（带 BOM，Excel 直接开） | 指标型作业 |
| `snapshot` | 指标快照 JSON | 指标型作业 |
| `run` | 整条运行记录 JSON（区间、日志、推送结果） | 所有作业（兜底） |

指标台账另有一份追加式长表 `~/.dsh/rpa-center/data/metrics.csv`（`ts,storeId,jobId,rangeStart,rangeEnd,key,label,value`），
每天跑一次自然形成时间序列；`GET /rpa/metrics?storeId=&jobId=&limit=` 可查。

## 结果推送（每条作业可以有自己的接口）

```json
{
  "push":   { "enabled": true, "url": "http://127.0.0.1:8000/rpa/inbox?task={task}", "method": "POST", "timeoutMs": 20000 },
  "pushes": { "bill_guonei": { "url": "http://127.0.0.1:8000/finance/bill", "includeFileBase64": false } }
}
```

判定顺序：`pushes[作业id]` 有地址就用它（`enabled:false` = 这条不推）→ 否则用全局 `push` → 都没有就只存本地。
请求体 `{ source, version, task, job:{id,name,group}, store:{id,name,storeId,platform}, range, ranAt, metrics?, file?{name,size,base64?} }`；
GET 方式把 `storeId/task/start/end` 拼进 URL。只接受 `http(s)` 地址。

## 定时任务（可以有多条）

面板「运行计划」卡片里点「＋ 添加任务」，每条规则独立配置：

| 字段 | 说明 |
|---|---|
| 启用 | 关掉只是不自动跑，规则还留着 |
| 名称 | 比如「早间账单」「午间推广」，出现在运行记录与日志里 |
| 时间 | 该规则的 `HH:mm`（本地时区） |
| 星期 | 点一下切换；默认每天 |
| 补跑 | 开着：当天任意时刻启动都会补一次；关掉：只在到点后 1 小时内跑 |
| 跑哪些 | 空 = 跟着每条作业的「批量」开关；也可以「用当前勾选」固定清单 |

- 到点时**逐条顺序执行**（同一时刻到点的多条规则不会并发开一堆浏览器）
- 状态按规则分开存 `~/.dsh/rpa-center/schedule-state.json`（`rules.<id>.lastRunDate / lastRunAt / lastResult`），不改 `config.json`
- 每条规则的「上次 11-13 08:01（成功 6 / 失败 0）」直接显示在规则行里；卡片标题显示「定时 2 条（下次 11-14 08:00）」
- 「立即执行」「删除」都是**二次确认**：第一下只变成「确认执行？/ 确认删除？」，3 秒内再点才真的执行，不点会自动取消
- 运行记录里带 `trigger`：`manual` / `schedule` / `schedule-manual`
- 老配置里那条单规则会自动升级成第一条规则（id `rule-1`），不用手改

**前提：到点时 DSH 得开着**。没开不丢：下次启动如果当天还没跑过，会按补跑设置补一次。

## 停止正在跑的任务

顶部按钮区在跑作业时会多出一个红色「**停止**」（面板刷新后也还在，因为状态来自 `/rpa/state` 的 `running`）。

点它之后：

- 当前作业会在**下一次等待时**退出（作业里的等待都走可中断的 `sleep`，一般 1–2 秒内），运行记录里标 `CANCELLED / 已手动停止`
- 这一批里**后面的作业不再开跑**，店铺、定时规则的队列同理
- 已经下载的文件、已经写入的记录都保留，不回滚

接口：`POST /rpa/stop`（无需参数）。下次开始运行会自动清掉停止标记，不用手动恢复。

## 已知边界

- 订单批量导出有 **5 分钟间隔**（站点限制）；5 分钟内重复跑会下载「最近一份」，`extra.reportTime` 里记录它的生成时间
- 掉登录、弹验证码时如实报 `LOGIN_REQUIRED`，不会自动填短信验证码
- 账单/流水是 zip 或 xls，本插件只负责拿到文件，解析交给下游
- 目前只接了拼多多；其它平台在 `lib/platforms.mjs` 里是 `ready:false`，不会给假按钮

## 开发与排障

```bash
node tools/run-job.mjs --list                      # 列店铺 + 作业
node tools/run-job.mjs <店铺名> <作业id>            # 不经界面跑一条（同一份代码）
node tools/peek.mjs <url> 'document.title'         # 开临时标签看页面（只读，跑完关掉）
node tools/smoke.mjs                               # 提交前自检：/state、/config 全打一遍（临时 DSH_HOME）
node tools/dl-test.mjs                             # 下载捕获回归：同名文件原地覆盖、每次运行独立子目录
# 定时任务逻辑（到点/已跑/补跑窗口）在 tools/smoke.mjs 里，会真的触发一次 tick
cd tools/ui-test && pnpm install && pnpm test      # 界面点击检查：把面板真渲染出来，点一遍折叠/批量

```

- 作业登记：`lib/jobs/index.mjs`（加作业只改这里 + 一个 `lib/jobs/*.mjs`，界面自动出现）
- 页面动作：`lib/jobs/common.mjs`（选择器、日期面板、下载）
- 引擎：`lib/engine/cdp.mjs`（Chrome CDP：点击、下载、等文件写完）
- 接口：`GET /rpa/state`、`POST /rpa/run`、`POST /rpa/run-all`、`POST /rpa/open`、`GET /rpa/file`、`POST /rpa/config`、`GET /rpa/metrics`、`POST /rpa/clear-runs`
