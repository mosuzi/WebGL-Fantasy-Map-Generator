# 第 351 项：100k 全视图快切、owner 修复与后台预热

## 1. 现场与根因

用户精确 Chrome 标签页 `https://preview-fmg.mosuzi.top/` 当前为 100k 地图、约 `425万` GPU 顶点。页面最终保持 `height`；health 已记录两次：

```text
operation-failed：surface 颜色补丁与正式资源 owner 不属于同一受控 revision
```

同一现场另有 `2099.9 / 2264.7 / 2488.5ms` frame gap。普通操作 Loading 已清理，失败不是残留遮罩，而是显示事务在 prepared install 前拒绝并回滚。

静态调用链确认：`createWorkerRegenerationDeferredRenderRequest` 先调用通用 `createWorkerRegenerationRenderRequest`；后者只知道 regeneration 的 province patch 特例，因而把 display surface 请求判为 replacement 并推进 `renderGeneration`。外层随后才追加 deferred `surfacePatchScope`，Worker 返回 `cell-colors` 原位补丁；installer 要求原位补丁保持同一 generation，于是正确 fail-closed。owner 校验不是缺陷，发放 binding 的顺序才是缺陷。

现有 GPU 常驻白名单仅有 `height / biomes / population / states / provinces`，且快路径仍受完整 owner、correction、ranges 与 cell attribute store 条件约束。剩余数据已有较完整基础：numeric texture 包含 population / temperature / precipitation / region，identity texture 包含 state / province / culture / religion，palette 已包含 state / province / biome / culture / religion。

## 2. 冻结矩阵

| 字段 | 内容 |
| --- | --- |
| 最终任务 | 修复七类视图不能提交、十二类颜色视图全部 GPU 快切，并在正式数据提交后预热仍需几何计算的共享缓存 |
| 当前阶段 | 已完成：本地终验与用户精确预览标签页复核均通过 |
| 最小验收 | 十二类 10k / 100k cold / warm 达标；latest-revision 只接纳最新结果；错误面为 0 |
| 非目标 | 不修改生成算法、存档 schema、canonical 地图或视觉配色语义 |
| 唯一写者 | 主线程；runtime、renderer、专项夹具与本文档 |
| 独立角色 | 无；用户未要求四级流程或子智能体 |
| 首个廉价门 | `node --check`、prepared installer 专项、Worker task 专项 |
| 冻结门 | 一次小数据正式视图切换，文化视图成功且 owner / GL / Loading / health error 为 0 |
| checkpoint | `codex/task-351-view-switch-repair`，每个接受阶段按版本规则提交 |
| 停止条件 | 产品首败先窄诊断；同一浏览器 blocker 再现或夹具连续两次失败即冻结 |

## 3. 实施设计

### 3.1 原位 patch binding

- 在发放 render resource binding 前解析最终 layer 与 surface patch scope。
- `surfacePatchScope=all|water` 时 `replaceResources=false`，保持当前 `renderGeneration`；允许 source / topology revision同步 `0` 或 `+1` 的既有受控转换。
- 完整 surface、换图、context restore 等资源替换继续 `replaceResources=true` 并推进 generation。
- installer 的 identity、revision、topology、generation、owner 引用与范围指纹校验全部保留。

### 3.2 十二类 GPU 颜色模式

| 模式 | GPU 来源 | 更新粒度 |
| --- | --- | --- |
| height | terrain height + height ramp | uniform / terrain patch |
| biomes | terrain biome + palette | cell / palette patch |
| population | numeric population + max population | cell / uniform |
| states / provinces | identity + palette | cell / palette patch |
| temperature / precipitation | numeric texture | cell / uniform |
| cultures / religions | identity + 既有 palette | cell / palette patch |
| regions | 新增整数 region identity + palette | cell / palette patch |
| governments | state identity + government-family palette | palette patch |
| diplomacy | state identity + subject relation palette | subject 变化只替换小 palette |

shader 对水域、主题、平滑边界和 height fallback 的像素语义必须与 `colorForCell` 一致。文化、宗教等新模式不得触发 overlay 或 picking 重绑；外交主体变化保持相同 cell geometry。

### 3.3 后台预热调度

- 触发点：generation / import / restore / undo / redo / 正式编辑事务完成且 map-ready 已发布之后。
- 键：`mapIdentity + sourceRevision + topologyRevision + renderGeneration + contextGeneration + resourceKind`。
- 调度：尾随防抖、单并发、前台优先；同键前台请求晋升现有任务，不同键前台请求使后台任务在 checkpoint 让位。
- 失效：新 revision 立即清空 queued；running 任务协作取消或完成后 stale-drop；禁止通过终止共享 Worker 来取消预热。
- 产物：只缓存共享 shore / political / correction 等紧凑中间结果；不得缓存十二份完整 surface，不自动切换用户视图，不显示普通 Loading。

## 4. 验收矩阵

1. 十二类从 height 逐项进入、返回 height、A→B→C 快速切换，最终控件与 renderer 同源。
2. 100k cold / warm 每项记录 wall、主线程最大 task、Worker packets、render.prepare、surface rebuild、overlay / picking rebuild。
3. revision `+1`、undo、redo、导入、换图、Worker restart 与 WebGL context restore 后重新验证。
4. 预热中再提交 revision：旧 queued / running / ready 结果安装数均为 `0`，最终只保留最新 revision ready。
5. 用户前台切换、编辑、保存和生成不得排在整套预热之后；map-ready 和普通 Loading 不等待后台预热。
6. 最终错误面：application console、page error、health error、WebGL error、Loading 残留全部为 `0`。

## 5. 非目标与交付

- 不改 canonical map、存档、生成、颜色语义、对象和 `source/`。
- 不在用户标签页生成新地图；最终只在用户确认的精确标签页对应构建做受控视图验收。
- 本分支叠加于第 349～350 项未合入架构分支，完成后只推送任务分支，不直接合入 `main`。

## 6. 2026-08-23 本地验收 checkpoint

- `351-0`：deferred display 在发放 binding 前解析最终 `surfacePatchScope`，原位 `cell-colors` 不再误推进 render generation；严格 identity / revision / topology / generation / owner 门未放宽。prepared installer `21` cases、Worker task 与静态反例通过。
- `351-1`：GPU 常驻模式扩展为十二类；温度 / 降水使用 numeric texture，文化 / 宗教 / 地区 / 政体 / 外交使用对应 identity 与小 palette。外交主体变化只刷新 palette，地图装载时也按当前主体创建初始 palette。
- `351-2`：后台只生成 `height / states / provinces` 三份岸线 correction，不复制完整 surface。独立可丢弃 ComputeWorker 避免阻塞或终止长期 MapWorker；同键调度与无任务 cancel 幂等。专项实际证明 running `A` 被新 revision 取消，只有 `B` 接纳；queued `C` 被前台抢占且未启动。
- `351-3`：生产构建固定 `10004` cells 的 cold `13.0～26.2ms`、warm `12.7～16.3ms`；固定 `99846` cells 的 cold `15.5～29.1ms`、warm `15.4～19.2ms`。十二类逐项 `localGpu=true`、Worker input/output `0`、surface/line/picking/labels rebuild `0`、正式资源引用稳定、LongTask `0`，最终 Loading / application / page / health / WebGL error 全 `0`。
- 调度观测噪声已收敛：重复空 cancel 不再递增 sequence，10k 真实入口从旧的 `4163` 收敛为 `3`。正式 artifact 位于 `work/task351-all-view-modes-10000/result.json` 与 `work/task351-all-view-modes-100000/result.json`，不入库。
- 静态与专项最终通过：`git diff --check`、scheduler、cell attribute store、render preparation、GPU display mutation、prepared installer、Worker task、`typecheck:core` 与 `1402 modules` production build。

## 7. 2026-08-23 用户精确标签页终验

- 精确接管并刷新用户原标签页 `294256474 / https://preview-fmg.mosuzi.top/`；刷新后页面恢复浏览器保存的原地图，没有生成新地图或打开替代验收页。
- 通过可见控制面板依次进入高度、温度、降水、生物群系、文化、宗教、外交、政体、国家、省份、区域、人口十二类视图；每批终态的选中控件与 `activeMode` 一致，人口与高度画面完成视觉检查，最终恢复高度视图。
- 各批次切换结束后 `generation-loading=false / operation-loading=false`；目标复验以 `2026-08-23T13:02:56.831Z` 为界执行高度→温度，`activeMode=temperature`、新增 error / warn `0`，随后温度→高度同样新增 error / warn `0`，终态为 `height / startup ready / Loading 0`。
- 刷新后的存档恢复阶段曾单列一条 `operation-stall` 与一条 `main-thread-long-task`；两者早于目标视图复验窗口，未在任何后续视图切换中重现，归入既有 100k 存档恢复性能边界，不据此误判视图切换回归。
- Chrome 可见界面通道每次动作约 `5.27s` 的固定往返不计入产品渲染耗时；产品性能结论继续以正式 10k / 100k 浏览器夹具的 `15.5～29.1ms cold / 15.4～19.2ms warm`、LongTask `0` 为准。
