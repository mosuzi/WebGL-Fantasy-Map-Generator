# 第 361 项：首次边界不可逆第三态消除

## 任务契约

- 唯一完成输入仍为 `C:\Users\mosuzi\Downloads\krichars (3).webfmg`，SHA-256 `CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61`。
- 用户已经给出决定性反例：首次载入时的疆界柔化在关闭“平滑边界”后再次开启也无法恢复。该画面必须按非法第三态调查，不能继续称为 `smoothCellBorders=true` 的正常效果。
- 主线程唯一写者；任务分支计划为 `codex/task-361-initial-boundary-third-state`，必须从第 360 项已合入并推送的最新 `main` 创建。
- 本项只收敛显示资源与状态机，不改地图疆界数据、政治归属、edge fade 或视觉主题。

## 当前证据与待证假设

第 358 项把“首次帧与 `1,200ms` 后相同”误当成正确性；这只能说明第三态稳定存在。当前导入请求省略完整 `cell-visual` 与 `gpu-shore-surface`，以 `boundary-only` cell visual 和 `current-shore-only` line resident 准备 surface / shore / line；prepared installer 提交首次资源，后续 UI 切换则进入 renderer 的 GPU resident / lazy rebuild 路径。两条路径可能产生不同资源，但目前只能列为首要嫌疑，不能在 361-A 前写成根因。

合法状态只有两种：

- `HARD`：`smoothCellBorders=false` 对应的规范 surface / shore / line 资源；
- `SMOOTH`：`smoothCellBorders=true` 对应的规范 surface / shore / line 资源。

任何首次帧 `F0` 若既不等于 `HARD`，也不等于通过 UI 往返可重建的 `SMOOTH`，就是必须消除的 `THIRD` 状态。

## 阶段矩阵

| 阶段 | 单一目标 | 首个廉价门 | 冻结门 |
| --- | --- | --- | --- |
| 361-A | 同时冻结 `F0 / Foff / Fon / Foff2 / Fon2` 的像素和资源 owner / hash，定位第一个分叉 | renderer prepared / toggle 静态审计 | 真实存档逐帧 trace 能把第三态归到明确 layer、cache key 或 binding |
| 361-B | 让 prepared presentation 与 runtime display 使用同一规范状态和 display fingerprint | prepared installer、resource binding 专项 | display fingerprint 不一致的 bundle 在提交前拒绝或重建；不再存在不可达资源组合 |
| 361-C | 建立 HARD / SMOOTH 幂等和往返契约 | surface / shore / line Node 与 GPU 摘要专项 | load / toggle 的同状态资源摘要完全相等，连续往返不漂移 |
| 361-D | 真实存档首次可见帧逐帧终验 | typecheck、scoped diff | 两种初始设置、完整 canvas / 裁剪 / GPU 摘要、build 与性能门全部通过 |

## 设计约束

- 修复点必须在首次 prepared resource 和运行时 display state 的 owner / binding 边界，不能靠延长 Loading 或用第二帧覆盖第一帧掩盖问题。
- prepared render 必须携带生成它的 color mode、`smoothCellBorders`、主题、map identity / revision / topology revision 和 render generation 指纹；installer 只能提交与当前显示意图一致的 bundle。
- 初始导入和开关切换必须调用同一个规范 surface / shore / line 构造或消费同一份等价缓存；不能保留只有导入路径才能产生的 fallback 组合。
- “地图边缘渐隐”完全排除在对照变量之外并保持关闭；视觉主题、相机、图层和截图裁剪范围在每轮比较中冻结。
- 是否将 `smoothCellBorders` 写入存档是另一项产品选择；本项只要求给定同一个明确 UI 状态时，首次加载和后续往返结果一致。

## 最终验收

1. 以 `SMOOTH` 初始状态导入：`F0 == Foff→Fon == Foff→Fon→Foff→Fon`。
2. 以 `HARD` 初始状态导入：`F0 == Fon→Foff`。
3. 每个等式同时比较完整 canvas PNG、固定疆界 / 海岸裁剪 PNG、surface base / correction / ranges、shore surface、shore line 顶点摘要、cache key 和 render binding；不得只比较文件大小、肉眼或首帧 / 稳定帧时间关系。
4. 每轮 `F0 == F1200ms`，且 map-ready 后没有第三组资源摘要、晚到画面替换、WebGL error 或新增 `>200ms` LongTask。
5. 第 359 项同存档五轮加载绝对门仍通过；若视觉收敛导致性能回退，不得以正确性为由跳过性能复验。
