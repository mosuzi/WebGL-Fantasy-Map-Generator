# 第 357 项：全部重生成入口统一契约与阶段交接

## 冻结契约

1. 旧数据兼容只发生在事务 working copy：统一 `politics / pack`、`markers / pack`、社会镜像、普通数组 / TypedArray 和重生成计数来源；失败不得污染正式地图。
2. 锁快照在兼容归一后捕获。显式锁原样保留，依赖闭包只提供结构支撑；锁对象不重新参与水陆、中心重叠、扩张、数量、评分或平衡计算。
3. 未锁对象从空结果按既有领域限制生成，锁对象只占用 cell、edge、endpoint、identity slot 和固定 owner。
4. 合并只做稳定 ID 分配、锁快照覆盖和镜像一次重建，不再次运行领域生成限制。
5. 最终保留一次结构、引用、镜像和锁 before-image 校验；MapCoreEngine owner / binding / revision、Worker 写集、取消 / 过期、历史和回滚门保持。

## 入口分母

- 正式十一类：Feature、路线、河流、城镇、国家、省份、标记、外交、宗教、军事、地区。
- 复合六类：高度基础、高度下游、全部高度、气候下游、世界洋流、海底重置。
- 直接五类：洋流重生成、文化扩张、宗教扩张、市场单元归属、经济链重算。

## 阶段矩阵

| 阶段 | 最小交付 | 首个廉价门 | 冻结门 |
| --- | --- | --- | --- |
| 357-A | working copy 旧数据归一与经济回滚原子性 | 旧普通数组回滚专项 | 用户旧存档经济改派 / 重算与故障 before-image |
| 357-B | 十一类正式入口统一锁、生成、合并 | 社会锁与标记锁专项 | `11 × 15` 矩阵 + 用户旧存档十一类 |
| 357-C | 六类复合与五类直接入口闭合 | constraint bundle / composite 专项 | 用户旧存档十一类复合 / 直接入口 |
| 357-D | 集成冻结、撤销 / 重做和真实浏览器终验 | typecheck + scoped diff | `22 / 22`、build、真实页面、远端 main |

## 调查首败

- 正式入口：Feature 标记镜像、城镇政治镜像、国家旧省份闭包、省份缺首都锚点、外交 salt、军事旧 shape。
- 锁语义：社会中心位于水域或重叠仍被生成限制拒绝；标记自身锁在合并时被 `packCell / data` 改写。
- 复合入口：高度 / 气候继承旧省份闭包拒绝，世界洋流 / 海底继承缺首都锚点拒绝。
- 经济入口：旧 `pack.cells.market` 为普通数组时，失败恢复调用 `.set()`，回滚二次异常遮蔽首个错误。

## 阶段交接

### 357-A — 已完成

- 冻结点：`origin/main == 2c93e33`，任务分支 `codex/task-357-unified-regeneration-contract`。
- 唯一写者：主线程。
- 临时证据：`Z:\tmp\codex\2026-08-26\task-356-regeneration-audit`；新产物转入 `Z:\tmp\codex\2026-08-26\task-357-unified-regeneration-contract`。
- 结果：事务 working copy 收敛政治、标记、社会、地区和经济镜像，修复旧国家省份 / 军事 shape、外交 salt 与失效市场中心；经济普通数组的改派、重算和故障回滚均保持容器类型与完整 before-image。存档 schema 未变化。

### 357-B — 已完成

- 结果：十一类正式入口统一为未锁对象按既有限制生成、锁对象跳过生成限制后原样加入、合并不重复验证；锁仅保留稳定 ID、边界、必要引用、断裂路径与最终 before-image 等结构门。
- 门禁：`regress:regeneration-lock-priority` 为 `165 combinations / preserved 164 / noop 1 / failures 0`；状态、省份、社会、外交、军事、经济、河流、Feature 与 C1 保护专项全通过。

### 357-C — 已完成

- 结果：高度基础 / 下游 / 全部、气候下游、世界洋流、海底六类复合入口与洋流、文化、宗教、市场归属、经济链五类直接入口共用同一契约；复合补丁只提交目标写集，working copy 兼容修复不会越域污染正式地图。
- 门禁：代表性 `100k grid / 43,419 pack` 旧存档正式入口 `11 / 11`、同类锁 / 无锁 `22 / 22`、复合 `6 / 6`、直接 `5 / 5`；`regress:worker-composite` 含 `100k` 通过。

### 357-D — 已完成

- 浏览器：本地 `http://127.0.0.1:5173/?debug=1` 路线正式重生成 `296 → 300`；目标操作窗口 health 事件、console error / warn 和 WebGL error 均为 `0`。开发模式错误文案专项确认公开错误码与内部码链显示，普通模式不泄漏技术码。
- 视觉：首个正式可见帧与 `1,200ms` 后稳定帧均为 `94,950 bytes`，SHA-256 都是 `d0c3221d5e2b822916a461bba81c9c5c0cf09897157f1bfe9a8ca0d6cbcfcf05`，边界没有先虚化再替换。整页刷新单列一条启动 `generate.newMap 5169.7ms`，发生在目标操作窗口之前，路线重生成没有新增 LongTask 或健康错误。
- 最终门：`typecheck:core`、`regress:regeneration-user-copy`、`regress:worker-composite`、`CI=true pnpm run build:app`（`1404 modules`）与 `git diff --check` 通过；完成版本 `0.5.66`。
