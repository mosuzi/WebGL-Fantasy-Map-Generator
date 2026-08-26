# 第 361 项：首次边界不可逆第三态消除

## 任务契约

- 唯一完成输入仍为 `C:\Users\mosuzi\Downloads\krichars (3).webfmg`，SHA-256 `CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61`。
- 用户已经给出决定性反例：首次载入时的疆界柔化在关闭“平滑边界”后再次开启也无法恢复。该画面必须按非法第三态调查，不能继续称为 `smoothCellBorders=true` 的正常效果。
- 主线程唯一写者；任务分支为 `codex/task-361-initial-boundary-third-state`，按用户要求从第 360 项完成提交顺序创建，只推送自身，不合入 `main`。
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

## 完成记录（2026-08-27）

### 归因与收敛

- 在第 360 项完成提交上重新导入指定真实存档，排除导入成功提示层后，首个正式平滑帧与 `1,200ms` 后像素已经完全相等，关闭再开启也能逐像素恢复。这说明第 359 项的并行加载改造已经顺带消除了用户原先看到的画面分叉，但当时没有建立任何契约阻止 primary shore 与 secondary surface 携带不同显示意图后仍被拼装，因此仍可能再次产生非法第三态。
- `render.prepare` 现在为每份 prepared bundle 固定携带 map / source revision / topology revision / render generation / preparation id、color mode、海底显示、平滑开关、edge fade、视觉主题和岸线 surface key 的显示指纹。并行导入合并要求两份指纹完全相同；首次 renderer 安装要求指纹与当前 UI / renderer 意图完全相同，缺失、篡改或错配均在提交前 fail closed。
- 首屏 surface 的 `smoothShoreSurfaceKey` 与 `shoreSurfaceEnabled` 只从已通过校验的 primary 显示意图取得，不再把 secondary 的 key 与 primary 的实际岸线数组默认为兼容。renderer 调试摘要新增 `boundaryPresentation`，开发面板明确显示 `smooth / canonical` 或 `hard / canonical`。

### 指定存档逐帧与往返验收

- 平滑初始导入：`F0`、`F1200`、第一次关→开和第二次关→开的固定裁剪像素 SHA-256 均为 `e3c301367d5055cae49a273fa3d357fae0c1d037e858d25ef8eec37f19a5e19c`，逐像素差异 `0`；两次关闭态均为 `da59408a75759f4e4a5ffb06ce0c3a1982c31191a3ad60259c1aba4e560d9753`。
- 硬边界初始导入：`F0 == F1200 == 开→关`，像素 SHA-256 均为 `da59408a75759f4e4a5ffb06ce0c3a1982c31191a3ad60259c1aba4e560d9753`；开启帧为同一个平滑指纹。两种初始设置始终保持 edge fade 关闭，并分别显示 `smooth / canonical`、`hard / canonical`。
- 每次回读身份均为 `100000 grid / 43419 pack / 1251 cities / 442 routes / 7976 segments`，地图数据、边界拓扑、政治归属、主题和历史均未改变。最终五轮独立冷导入墙钟为 `4733 / 5112 / 5063 / 4963 / 5447ms`，中位 `5063ms`、最大 `5447ms`，继续低于第 359 项 `6s` 绝对门；五轮 `canonical=true`、WebGL error `0`，目标导入窗口没有 console error / warn 或新增产品 LongTask。

### 专项门与已知夹具首败

- `regress:boundary-presentation` 固定 HARD / SMOOTH 两个合法状态以及缺指纹、篡改指纹、并行错配和安装错配反例；render preparation、prepared installer、GPU display mutation、map-file Worker、typecheck、`1406 modules` production build 与差异门通过。
- 既有 `regress:shoreline` 仍在六组模式共同得到 `lineTriangleCount=11448`，低于夹具固定的 smooth `30000` / hard `25000` 阈值；本项没有改 line 构造算法或放宽该阈值，并按首败规则不重复运行。指定真实存档的岸线 / 边界逐帧像素、显示指纹和 WebGL 门已独立通过。
