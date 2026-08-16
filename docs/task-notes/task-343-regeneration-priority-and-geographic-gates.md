# 第 343 项：用户主动重生成优先级与地理门禁收敛

## 阶段矩阵

| 字段 | 内容 |
| --- | --- |
| 最终任务 | 用户主动省份 / 城镇重生成不再被可修复的旧省会地理状态整批拒绝，并完成十一类重生成硬门审计 |
| 当前阶段 | 已完成并归档 |
| 最小验收 | 用户原图正式重设成功并可撤销；十一类门禁审计与专项 / 完整 Worker / 生产构建通过 |
| 非目标 | 不取消显式锁、schema / 引用完整性、跨 owner、回滚、撤销或 latest-wins 门 |
| 唯一写者 | 主线程；regeneration worker、provincial capitals、既有专项与任务文档 |
| 独立角色 | 无 |
| 首个廉价门 | preflight / provincial-capital 专项 Node |
| 冻结门 | 十一类 Worker、生产构建、用户精确 Chrome 原图正式入口 |
| checkpoint | `codex/task-343-regeneration-priority` 最终工作树冻结点 |
| 投入产出 | 产品 `9` 文件、工具 `3` 文件、文档 / 版本 `8` 文件；最终完成 `100%`；委派等待 `0` |

## 产品判定

- 主动重生成的默认意图是替换目标派生系统；旧省会缺失、现任省会不再是有效候选、人口 / 中心性 / 适居度不理想，均应作为新结果的输入或待修复状态，不得在计算前整批拒绝。
- 显式用户锁仍表示“不要覆盖该对象”；目标范围全部锁定可以安全 no-op，部分锁必须保留锁定对象。锁冲突无法保持时继续 fail-closed。
- schema、数组长度、对象 ID / 引用、地图 identity / revision、Worker owner、写集、补丁应用、回滚和撤销属于结构安全，不是地理专业规则，不在本项放宽。
- 重生成完成后必须验证新的 politics / pack / city / burg 镜像与目标范围，不允许用“架空地图”掩盖悬空引用或半提交。

## 现场证据

- 精确标签页：`http://127.0.0.1:5410/?debug=1`。
- 正式 UI 返回：`重设失败：请求包含 235 个数据不一致的省份，全部省会重评均已拒绝。`
- 唯一写入前地理硬门位于 `inspectRegenerationWorkerPreflight`，只覆盖 `provinces / cities`；它在领域重建前调用省会重评，把旧 `province.burg` 缺失或候选镜像不一致直接转换为 `regeneration_preflight_rejected`。

## 硬门审计口径

| 类型 | 处置 |
| --- | --- |
| 旧省会、候选人口 / 中心性 / 适居度、当前候选失配 | 改为事务内重建 / 重评，不作前置拒绝 |
| 显式对象锁、锁闭包冲突 | 保留硬门或明确 no-op |
| scope / confirm / kind 参数 | 保留输入契约 |
| schema、ID / 引用、数组范围、地图 binding / owner | 保留结构安全硬门 |
| 写集、补丁、commit / rollback / undo | 保留事务安全硬门 |

## 十一类审计结论

| 入口 | 写前硬门结论 |
| --- | --- |
| features / routes / rivers | 只有显式对象锁、必需地形结构、写集与事务门；高度、河流或岸线质量用于生成结果，不作建议性地理拒绝 |
| cities / provinces | 删除旧省会 preflight；旧 burg、候选和省份镜像事务内修复；有效锁对象保护，旧失配锁锚点不扩散为整批拒绝 |
| states | 保留锁定国家与锁定外交端点无法兼容时的硬门；缺少可用城市 / pack 只作结构性 no-op |
| markers / diplomacy / religions / military / zones | 只有必需领域缺失、显式锁或对象 / 引用结构门；评分与地形规则只决定结果 |

## 最终浏览器证据

- 用户精确 Chrome 标签页仍为 `http://127.0.0.1:5410/?debug=1`，地图为原 `stage-2-1`、实际 `100000` grid / `4.3万` pack。
- 正式控制面板选择“省份”并点击“重新生成省份”，返回 `省份已在全图内重算（扰动 #5）：235 -> 268；道路 607 -> 372`。
- 正式 Ctrl+Z 后开发模式为 `国家 / 省份 / 道路 = 21 / 235 / 607`，history `undo 0 / redo 1`，说明已恢复操作前地图；WebGL error `0`，Loading 隐藏，健康事件只含本次 100k 操作的性能类 long-task / frame-gap / input-handler-stall，无应用、协议、owner、回滚或页面错误。
- 浏览器专项故意破坏全部活动省份的省会引用后，`provinces=193` 与 `cities=155` 两路均 commit、session idle、镜像一致且 undo 成功。

## 已知基线

- `webgl-generator-provincial-capital-regression.mjs` 的固定 `province #348` 极小省份断言在未修改的 `0.4.7@00f92fa` 隔离工作树也失败，属于既存固定 ID 夹具漂移；本项没有以修改产品结果迎合该断言，新增真实修复回归与其它锁 / Worker 门均通过。
