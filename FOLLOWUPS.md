# 后续事项

本文档只记录尚未进入权威任务清单的阶段外事项。新发现只有在当前权威任务明确排除、又有可复核证据时才登记于此；已经完成、已经转入权威任务或已由现行回归核销的记录不得继续保留为候选。

## 当前状态

当前有 4 项待评估的阶段外事项；尚未批准实施。既有核销记录仍由 Git 历史、权威任务归档和开发日志追溯。

### 城市自动规模生成与统一分级回归失配（2026-09-16）

- 发现入口：第 382 项附带运行 `regress:city-scale`，seed `city-scale-217`、10k 生成城市 `#748` 的 `group` 为 `city`，统一规模计算期望 `town`，首败位于 `tools/webgl-generator-city-scale-regression.mjs:79`。
- 基线证据：从未修改的 `63f176c` 用 `git archive` 提取产品源码与该回归独立执行，复现相同城市、实际值、期望值与首败行；不是第 382 项属性按钮改动引入。
- 本地证据：`Z:/tmp/codex/2026-09-16/task-382-city-shortcuts/city-scale.log` 与 `city-scale-baseline.log`。
- 边界：仅登记，未调整生成器、规模阈值或夹具断言；第 382 项城市属性事务、港口兼容与保存回读使用独立专项验收。

### 路线样式回归的拾取源码断言过时（2026-09-16）

- 发现入口：第 382 项性能窄修运行 `regress:route-style`，路线颜色、海陆分组、选中态、绘制顺序和数据不变检查通过后，第 `101` 行要求旧 `route.points` 循环文本；现行拾取实现已变更，正则不再匹配。
- 基线证据：未修改的 `63f176c` 产品源码独立运行同一脚本，复现相同断言与行号；本项未改拾取代码。日志 `Z:/tmp/codex/2026-09-16/task-382-city-shortcuts/fix-route-style.log`、`route-style-baseline.log`。
- 边界：仅登记，不在本项改写旧夹具。此次道路数组优化另以新旧 renderer 在 `1440 / 690px` 下的顶点逐值、drawRanges 与统计等价验证，证据 `route-buffer-parity.json`。

### 经济双域全锁的旧 no-op 断言失配（2026-09-16）

- 第 383 项运行 `webgl-generator-regeneration-lock-economy-regression.mjs`，部分锁、稀疏 ID、单域全锁等先行检查通过；第 `179` 行双域全锁 command.isNoop 返回 false。
- 未修改的 `2b87eae / 0.5.97` 独立归档源码复现相同断言，非本项城市经济系数导致。证据 `Z:/tmp/codex/2026-09-16/task-383-city-development/economy-lock.log`、`economy-baseline.log`。
- 仅登记，不在第 383 项调整锁协议或夹具预期。

### 锁定首都路线重算的旧接入检查失败（2026-09-16）

- 第 383 项运行 `webgl-generator-regeneration-lock-city-route-regression.mjs`，前置城市 / 路线对象保持、稀疏兼容与 scoped 检查通过；第 `216` 行固定陆块 `2` 有 `1` 个原目标首都未接入干道。
- 未修改的 `2b87eae / 0.5.97` 同种子独立执行，复现同一陆块和 `1 !== 0`；不是此次增加主干城市候选引入。证据同目录 `city-route-lock.log`、`route-baseline.log`。
- 仅登记，不扩改当前生成锁不可见 / 后置合并规则，也不宣称该旧套件全过。
