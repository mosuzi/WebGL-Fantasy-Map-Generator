# 第 341 项：Worker adoption 生命周期

## 冻结契约

| 字段 | 内容 |
| --- | --- |
| 最终任务 | 修复生成 / 导入 / 浏览器恢复在主线程接图超过 `120s` 后 owner 被提前销毁，并在用户当前 `5410` 标签页直载到终态 |
| 当前阶段 | owner 生命周期与专项反例 |
| 最小验收 | adoption 超过显式短 watchdog 仍 pending 且可 commit；普通 `map-mirror` watchdog 不变；Worker 专项通过 |
| 非目标 | 不改地图、schema、渲染几何、公开 API、普通显示 ACK 顺序或 `source/` |
| 唯一写者 | 主线程；`worker-task-coordinator.js`、既有 Worker 专项、任务文档 |
| 独立角色 | 无 |
| 首个廉价门 | `node --check` 与目标 Worker 专项 |
| 冻结门 | Worker 全合同、生产构建、用户精确 Chrome 标签页直载终态 |
| checkpoint | `codex-task-341-worker-adoption-lifecycle` |
| 投入产出 | 登记阶段产品代码 `0` 行、工具代码 `0` 行、委派等待 `0` |

## 现场与不变量

- 精确现场为 `http://127.0.0.1:5410/?debug=1`，可见错误与控制台栈均已在不刷新、不写入状态下保存。
- adoption 结果已经是唯一 canonical owner；主线程装载失败、取消、obsolete 与回滚继续由 `loadMapIntoRuntime` 的 catch 显式 invalidate。
- 普通 `map-mirror` pending transaction 仍保留有界防死锁 watchdog；本项不得用统一放宽超时替代生命周期区分。
- 最终浏览器验收必须等到启动 Loading 结束并出现 `map-ready`，同时核对应用错误、控制台和 WebGL；仅看见地图不算通过。

## 阶段交接

- 阶段：owner 生命周期与统一验收 — ACCEPT
- 冻结点：`codex-task-341-worker-adoption-lifecycle` 交付前冻结树
- 已完成：adoption 免于普通墙钟 watchdog；map-mirror watchdog 保留；短 watchdog 反例；生成 Chrome 门；用户精确 5410 直载终态。
- 证据：`node --no-warnings ./tools/webgl-generator-worker-task-regression.mjs`、`node --no-warnings ./tools/webgl-generator-generation-worker-browser-regression.mjs --cells=10000`、`pnpm run build:app`；用户页加载追踪 `complete +9894ms`、启动层 `ready`、Loading 隐藏、WebGL error `0`。
- 未完成：无本项功能阻断。
- 延后记录：用户 100k browser restore 仍有约 `23.3s` operation stall / page-load-timeout 性能告警。
- 下一步：归档、提交任务分支并合入远端 `main`。

投入产出：产品 `1` 文件 `+2 / -5`，既有工具 `2` 文件 `+6 / -1`，任务文档 `4` 文件；委派等待 `0`。
