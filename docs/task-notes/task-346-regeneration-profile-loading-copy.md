# 第 346 项：真实重生成 Profile 与 Loading 文案优化

## 阶段矩阵

| 字段 | 内容 |
| --- | --- |
| 最终任务 | 用用户当前地图量化一次城镇重生成耗时，并让十一类 Loading 准确、自然地表达真实阶段 |
| 当前阶段 | 已完成并归档 |
| 最小验收 | 精确标签页正式重生成与撤销、分段 telemetry、十一类文案、真实阶段序列、生产构建、错误面清零 |
| 非目标 | 不改变重生成算法、结果、锁、事务、Worker 协议、地图 schema、默认生成参数或其它 UI 文案 |
| 唯一写者 | 主线程；文案映射、专项回归、权威文档 |
| 独立角色 | 无 |
| 首个廉价门 | `webgl-generator-regeneration-user-copy-regression.mjs` |
| 冻结门 | 用户 `5410` 当前存档正式入口与生产构建 |
| checkpoint | `codex-task-346-regeneration-profile-loading-copy` |

## 冻结边界

1. Profile 只调用正式 `generate.regenerate("cities", {confirm: true})` 或对应正式 UI；记录返回的 Worker telemetry 和外层 wall，不插入产品计时代码。
2. Profile 前后记录城镇、港口、道路、history、地图 identity / revision；成功后立即通过正式撤销恢复，不保存或覆盖用户地图。
3. Loading 文案按准备、计算、结果收束、兼容处理、提交、画面更新、完成、取消和失败映射；底层阶段名与 detail message 不能进入普通界面。
4. 文案要说明用户正在等待什么结果，避免“梳理现有”“收束推演”等抽象重复，也避免每个进度包快速闪烁成不同句子。

## 待记录证据

- 当前地图规模与 Profile 前基线。
- wall、input、domain compute、render prepare、output receive、patch / commit install、render install、UI refresh、session commit 分段。
- 正式 Loading 文案实际出现顺序、去重后持续阶段与错误面。
- 撤销后的城镇 / 港口 / 道路与原始基线一致性。

## 真实 Profile 记录

- 精确标签页：`http://127.0.0.1:5410/?debug=1`，Profile 前当前未保存状态为城镇 `1017`，首批名称“神女 / 月松 / 青森 / 澜白…”。正式 UI 重生成后为城镇 `1011`、港口 `238`、道路 `334`，状态记录来源为 `1017 / 253 / 337`。
- 从点击到页面 health `operation-success` 的墙钟为 `9969ms`。外部 Loading 采样依次在约 `324ms / 791ms / 1140ms` 看到“推演新的城镇 → 重整地图上的城镇细节 → 收束城镇推演结果”，证明旧映射把后台 `render-prepare` 误称为正式上屏，且迟到结果阶段会令文案倒退。
- 约 `1.14s` 后至操作完成期间，Chrome 调试读取无法继续稳定采样，因此本轮只把 `9.969s` 作为可信端到端墙钟，不伪造 domain compute、结果接收、提交和 UI 刷新的独立数值。源码链确认这一段包含结果流接收、领域 patch、渲染准备/提交、标签与对象索引刷新及 Worker owner commit；当前证据不能给出它们各自占比。
- Profile 后正式撤销恢复城镇 `1017` 及首批名称。文案热更新触发开发页重新载入，浏览器存档恢复到原始城镇 `949`、首批名称“燕亭 / 月岚 / 玉汀 / 灵德…”；新版 UI 验收从该基线再次重生成到 `1017 / 253 / 337`，随后撤销恢复 `949` 和原始名称序列。

## 文案决议

- 十一类分别说明本次计算正在汇集的真实上游，例如城镇为“山河、人烟、文化与政区”，道路为“城邑、港口与通行地势”，外交为“诸国关系、战争与往来”。
- 阶段改为“重开一卷 → 汇集依据 → 重新铺陈 → 校定关系 → 落定成图 → 描清细节 → 新卷落定”；相同句子不重复更新，阶段 rank 只允许前进，迟到输出包不得把文案倒回计算阶段。
- Worker 内部 `render-prepare` 归入计算阶段；只有主线程 `render-install / render-commit` 才显示描清图上细节。普通文案继续隔离内部术语，取消和失败仍使用同一 Loading owner 清理。

## 最终门禁与边界

- `webgl-generator-regeneration-user-copy-regression.mjs`、两个源码语法门、`git diff --check` 与 `0.5.1` 生产构建通过；专项回归覆盖十一类资料来源、阶段单调前进、相同文案去重、内部术语隔离及取消 / 失败文案。
- 既有 `webgl-generator-loading-single-source-browser-regression.mjs` 连续两次未到达本项文案断言：首轮在初始化新图后因一次导航销毁 `page.evaluate` 上下文；按门禁完成最窄源码诊断后复轮越过重生成、取消、导入和回滚，最终停在“用户文件读取前必须由重写的 `File.text()` 记录 Loading”断言，实际 `fileReadLoading` 为 `undefined`。本项没有修改地图导入或 File 读取链，不能在封闭范围内顺手改该旧夹具，也不允许第三次重复运行。
- 用户精确标签页最终保持原存档城镇 `949`、首批名称“燕亭 / 月岚 / 玉汀 / 灵德…”，Loading 隐藏。用户已裁定不扩展本项，以专项回归、生产构建及真实当前地图成功 / 撤销证据完成；旧全局 Loading 夹具的导航与文件读取观测问题登记到 `FOLLOWUPS.md`，不冒充本项产品失败或通过。
