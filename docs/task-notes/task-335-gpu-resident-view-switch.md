# 第 335 项：GPU 常驻视图与零重编译切换

## 1. 问题定义

100k 视图切换的用户等待时间不能再用 Worker 内部算法耗时代表。历史 fresh 路径总计约 `10.029s`，其中完整地图输入约 `6.829s`、领域计算约 `0.546s`、结果接收约 `0.373s`、主线程渲染安装约 `1.887s`；旧省份重生成约 `9.529s`，其中领域算法约 `1.346s`，但 Worker 内构建政治路径、surface、线、标签与 picking 等渲染资料约 `4.886s`。真正 WebGL draw 通常只有毫秒至几十毫秒。

第 334 项通过长期 MapWorker、副本复用、约 `1.60MB` cell color patch 和约 `0.88MB` 水域 patch，把固定 100k 暖颜色视图降到约 `142～257ms`；主题和平滑仍约 `0.59～1.16s`。该结果没有证明 cold / session 失效、长期开发页旧模块混用或所有显示入口都不会退回全量准备。第 335 项要改变视图的数据模型，不继续给全量编译链打补丁。

## 2. 最终架构

普通视图从当前链路：

```text
点击 → operation → Worker 地图副本 → CPU 渲染准备 → 分包回传
→ 主线程解码 → 临时 GPU 资源 → 原子安装 → overlay / picking → draw
```

改为：

```text
点击 → display intent sequence → colorMode / palette / uniform → draw → 提交控件状态
```

地图数据真正变化时继续坚持：

```text
MapWorker canonical 计算 → canonical patch → GPU 属性区间更新
→ 必要的 topology cache 失效 / 重建 → 原子提交
```

Worker 化继续用于生成、重生成、地图编辑、派生拓扑、撤销 / 重做和存档 owner；纯显示状态不再伪装成地图计算。

## 3. 数据与渲染设计

### 3.1 稳定 surface geometry

当前 surface base 每顶点为 `x / y / r / g / b / side`，共 `6 × Float32 = 24 bytes`。固定 100k 约 `439` 万顶点，单份 base 约 `105MB`。颜色在每个三角顶点重复烘焙，导致颜色模式变化也需要重写大数组。

目标顶点为 `x / y / packedCellIdAndSide`：位置保持 Float32，cellId 与 land / water side 用 Uint32 打包；三角顺序、cell range、hard-cell fallback、局部高度编辑、分段 buffer、回滚和 picking 语义不变。预计 base 降至约 `53MB`，颜色不再随几何重复。

### 3.2 GPU cell attribute store

按 cell 常驻高度、biome、state、province、culture、religion、population、水陆 / feature flags 等窄类型纹理或 buffer；state / province / biome palette 单独维护。shader 通过 packed cellId 读取属性，再按 `u_colorMode` 选择高度梯度、人口梯度或政治 / biome palette。GPU 派生数据不写入存档，WebGL context restore 时从主线程兼容投影重新上传。

地图 patch 只提供 changed cell / state / province / biome / population ID 与 topology change 标志；连续 cell 合并后以 `texSubImage2D` 或等价有界写入更新，不上传整图。

### 3.3 政治与平滑几何

国家 / 省份 topology cache 以 `mapIdentity + mapRevision + topologyRevision + smoothMode` 为键。主题、颜色、选择和 debug 样式只更新 palette / uniform，不重建路径。平滑边界优先使用只覆盖受影响边界 cell 的 correction mesh；若证据证明 correction 接近全图，才采用明确计入地图 ready 的受控双缓存，不允许把预热藏到新图完成后。

### 3.4 overlay 与 picking

颜色视图不得重建 label descriptors、调用全量 `replaceChildren`、重装 city instance 或重绑路线 / 河流 /对象 picking。标签节点保持 identity，只在国家 / 省份等真实语义显隐变化时 keyed 更新；picking 只在对象几何或 canonical 引用改变时刷新对应 component。

### 3.5 UI 和版本一致性

显示意图使用递增 sequence。按钮在 renderer 正式提交后才成为 active；旧 Promise、平移缩放或 obsolete 操作不得覆盖最新意图。页面、Worker 与 renderer protocol 交换 build / protocol version，版本不一致时拒绝提交并提示保存后刷新。仅对已完整回滚的 session stale / commit rejected 做一次新会话重试，第二次仍失败则保留真实结构化诊断。

## 4. 内部阶段

| 阶段 | 唯一目标 | 最小门 | 非目标 |
| --- | --- | --- | --- |
| 335-A | 冻结完整端到端账本和 cold / warm / stale 分母 | 静态遥测合同、10k 单入口、100k 一次代表性基线 | 不优化产品 |
| 335-B | surface 顶点去颜色化并保留所有权 / rollback | 纯 Node 重组、FakeGL transaction、10k 视觉同源 | 不迁移全部视图 |
| 335-C | GPU cell attribute / palette store 与 patch | 类型、纹理布局、context restore、增量反例 | 不改变存档 |
| 335-D | 高度 / biome / population shader 化 | 0 Worker / 0 geometry rebuild、像素和 picking 同源 | 不处理政治 topology |
| 335-E | 国家 / 省份 palette 与 topology cache 解耦 | 首次 / 重复、revision 失效、平滑关闭 | 不处理平滑 correction |
| 335-F | 主题、海底、普通图层移出 Worker prepare | 0 map input、0 overlay / picking rebuild | 不处理几何型选项 |
| 335-G | 平滑边界 correction / cache | 异常三角、岸线、政治边界、冷热性能 | 不降低视觉精度 |
| 335-H | overlay / city / picking identity 稳定 | 节点 / 对象 / GPU 引用与必要增量 | 不重做 UI 状态机 |
| 335-I | latest-wins、正式提交控件、build handshake、自愈 | 首次点击、快速 A/B/C、缩放、stale session | 不扩大地图写并发 |
| 335-J | 冷热、故障、旧数据、视觉和用户原标签页终验 | 10k / 50k / 100k、PNG、context restore、错误面 | 不新增功能 |

## 5. 性能与正确性验收

- 固定 100k 普通颜色视图 cold 首次 `≤150ms`、warm `≤50ms`。
- 颜色视图 Worker 地图输入 `0 bytes`、`render.prepare=0`、surface geometry build `0`、overlay replace `0`、picking rebuild `0`。
- 主题 `≤150ms`、海底 `≤100ms`、普通图层 `≤50ms`。
- 平滑边界首次 `≤300ms`、重复 `≤100ms`。
- 所有入口单个主线程 task `<50ms`、LongTask `0`；不继承既有 `≤200ms` 登记。
- 10k / 50k / 100k 的高度、国家、省份、biome、population、主题、海底和平滑截图 / 像素、PNG、标签、城市、路线、河流、选择、高亮与 picking 同源。
- cold、warm、revision 变化、Worker 重启、快速切换、切换中 / 后平移缩放、撤销 / 重做、保存 / 读取和 WebGL context restore 均通过。

## 6. 执行与 Git 规则

- 唯一任务分支为 `codex/task-335-gpu-resident-views`，主线程为唯一写者。
- 每个 335-A～J 接受后各做一次本地中文 checkpoint commit，并按仓库规则同步递增版本；阶段提交不推送、不合入 `main`。
- 静态、专项 Node、小数据浏览器、代表性 100k 和最终全量逐级运行；昂贵门首败即停，只允许一次窄诊断和一次目标复验。
- 全部阶段集成冻结后统一验收；该架构升级最终评估升至 `0.4.0`，验收通过后才推送任务分支、合入并推送 `main`。
- 不修改 `source/`、Wiki、用户地图或持久存档 schema；用户原标签页只有在确认已保存并取得刷新授权后才现场验收。

## 7. 335-A：端到端账本（已接受）

- 新增独立显示账本，按运行前 session 与正式 binding 把路径精确区分为 `warm / cold / stale-map / stale-revision / stale-context / busy-restart / inconsistent-reuse`，并记录输入 / 输出分包、传输时间、首个 animation frame 与已呈现 frame。该证据只进入开发态对象和测试 artifact，不进入普通界面文案。
- 10k 真实入口通过：暖普通颜色约 `38～99ms`，主题约 `181～209ms`，平滑约 `73～124ms`；正式 revision 推进后继续复用同一 session，主动丢失 session 后准确进入 cold，快速两次视图意图保持 renderer、可见 Tab、bridge 与 API 同源，LongTask 为 `0`。artifact 为 `work/task335-a-view-ledger-10000/result.json`。
- 固定 `99846` cells 的 100k 账本通过：暖普通颜色 `101～186ms / 3` 输入包，主题 `538～678ms`，海底 `127～145ms`，平滑 `576～747ms`，标签 `293～299ms`。正式城市改名把 revision `0→1` 后，下一次视图仍只输入 `3` 包，但 Worker 渲染 cache 因 revision 全失效，wall 为 `5.02s`；session 丢失后 cold 输入 `1032` 包、输入流 `12.21s`、wall `21.07s`。两类慢路径均无 LongTask，证明帧可让步不能替代端到端消除复制与重编译。artifact 为 `work/task335-a-view-ledger-100000/result.json`。
- 100k 首轮暴露并修复一项前置产品错误：`0.3.16` emergency hard fan 为保证先绘而被放到 `cellVisualMesh.cells` 前端，颜色补丁沿用几何顺序后不再满足 installer 的严格递增 ID 合同。现在只对补丁项按 cell ID 排序，surface 几何与 emergency 覆盖顺序不变；Node 反例和目标 100k 复验均通过。
- 阶段门通过：上下文 / 日志审计、语法与差异、账本纯 Node、Worker app replay、render preparation、生产构建、10k 与一次代表性 100k。产品 `3` 文件约 `+76 / -2`，工具 `3` 文件约 `+123 / -8`；A 为一次性测量阶段，工具增量高于产品增量的原因已在动手前登记，浏览器夹具最终 `438` 行且未超过 `500` 行。版本为 `0.3.17`，下一阶段只进入 335-B。

## 8. 335-B：稳定 surface geometry（已接受）

- 正式 surface base 现以三字 `Float32 / Uint32` 同一底层布局保存 `x / y / packed(cellId, side)`，每顶点 `12 bytes`；cell identity 允许稳定回查，land / water side 不再借用颜色 alpha。8MiB 分段继续保持完整三角对齐，geometry / color 两个 buffer 作为同一 segment 的共同所有权参与 prepare、commit、rollback、finalize、嵌套事务和失败清理，旧 `vertexBuffer` 只保留为首段 geometry alias。
- 335-C 尚未建立 per-cell attribute store，因此 B 只保留独立 Float32 RGB 兼容流。它不属于稳定 geometry，颜色 patch 只更新该流，不再上传位置或 packed identity；本阶段 geometry 从旧 `24` 降到 `12 bytes/vertex`，两流合计暂仍为 `24 bytes/vertex`，C 接管后移除逐顶点 RGB。曾尝试 4-byte Uint8 RGB，但正式 framebuffer 有 `64692` 个通道发生最大 `1/255` 的提前量化差异，未放宽视觉标准，已撤回该方案。
- 纯 Node 证明跨段位置重组、packed identity / side、缺少 cell range 时的显式 sentinel、跨段颜色更新、async 取消与失败释放；FakeGL 证明未提交、已提交回滚、finalize、commit fault、嵌套 installer 和原位颜色补丁均不会提前删除或覆写正式资源。
- 正式 10k 浏览器门通过：`452091` 顶点，geometry / compatibility RGB 各 `5425092B`；从 WebGL 回读逐顶点核对位置、cell、side、颜色、alias 和聚合字节，并分别用 legacy 与 packed shader 绘制同一 base，整张 framebuffer checksum 为 `781237281` 且逐通道差异 `0`。14 类视图、相机 / 控件收敛、回滚不变量、LongTask、health、Loading 与 WebGL error 均为 `0`；artifact 为 `work/task335-b-surface-10000/result.json`。
- 产品 `3` 文件 `+306 / -106`，工具 `3` 文件 `+200 / -133`；浏览器夹具 `475` 行，未超过 `500` 行。语法、差异、两项专项 Node、生产构建和增强后 10k 目标门通过。版本为 `0.3.18`，下一阶段只进入 335-C。

## 9. 335-C：GPU cell attribute / palette store（已接受）

- 新增与持久存档解耦的 GPU 派生投影：`RGBA32UI` identity 保存 state / province / culture / religion，`RGBA32UI` terrain 保存 height / biome / feature / land，`RGBA32F` numeric 保存 population / temperature / precipitation / region；states、provinces、biomes、cultures、religions 使用五张 `RGBA8` palette。三张 cell texture 共享二维布局，负一 ID 以偏移编码保留，CPU typed snapshot 仅作为 GPU 恢复与局部 patch 的派生源。
- changed cells 先去重排序，再按 texture row 合并 `texSubImage2D`；GPU 任一写入失败会尝试写回旧值，只有三张纹理全部成功后才更新 snapshot。map identity / 越界 / 空 patch 均先拒绝。context restore 从同一 snapshot 建立八张新纹理，事务 prepare、commit、rollback、finalize、commit fault 与嵌套 installer 都按 store owner 计数释放，既不提前删当前纹理，也不泄漏 detached 纹理。
- 纯 FakeGL 门覆盖 `7` cells、八张纹理、跨三行九次局部写入、应用 / 回滚、故障恢复、context restore、尺寸上限和资源释放；prepared installer 的双重删除会直接报错，七类既有 surface transaction 连同 cell store 所有权全部通过。正式 10k 浏览器门为 `10004` cells、cell 三张 texture 各 `160064B`、palette 合计 `1068B`；局部 patch 后重建保持 snapshot identity，旧八张全部删除、新八张全部有效。
- 现有 14 类视图 / 主题 / 海底 / 平滑 / 标签操作、相机与控件收敛继续通过，LongTask、health、Loading、应用错误和 WebGL error 均为 `0`；artifact 为 `work/task335-c-cell-attributes-10000/result.json`。产品 `3` 文件约 `+401 / -2`，工具 `3` 文件约 `+268 / -16`；浏览器夹具机械压缩后 `499` 行，仍未超过 `500` 行。语法、差异、两项专项 Node、生产构建和 10k 目标门通过。版本为 `0.3.19`，下一阶段只进入 335-D。

## 10. 335-D：普通颜色视图直接读取 GPU 常驻属性（已接受）

- 高度、生物群系和人口在 `smoothCellBorders=false`、无 correction / hard-cell patch 且 surface ranges 完整覆盖全部 grid cells 时，只切换 shader 模式并重绘；不调用 MapWorker、不执行 surface refresh、不重建 geometry、overlay 或 picking。其它模式、平滑政治面和不完整 ranges 继续走既有 Worker 路径，避免把政治 topology 或 correction 误当普通颜色切换。
- 非平滑基面在现有 `pushGridCells` 遍历中同步记录连续 `grid-cells` ranges；installer 要求 cell `0..N-1` 有序、无缺口、完整覆盖 base，非法输入在 GPU 安装前拒绝且不泄漏 buffer / texture。shader 通过 packed cell ID 读取 terrain / numeric texture 与 biome palette；高度颜色表复用正式 `colorForHeight`，人口公式与 CPU 权威实现同源。
- 固定 `10004` cells 的真实 Chrome 验收通过：高度 / 生物群系 / 人口 framebuffer checksum 分别为 `2949860715 / 1641731067 / 2261249289`，与 D 实施前 Worker 基线精确一致；三次切换的 Worker run、surface refresh、LongTask 均为 `0`，surface set / segments / alias、cell attributes、picking 与 overlay 引用全部不变，控件、API 和 renderer 同源。重指纹 `34.6～37.7ms` 在产品 observer 断开后单列，不冒充切换耗时；artifact 为 `work/task335-d-gpu-resident-views-10000/result.json`。
- 语法、差异、surface base / cell attributes / prepared installer 三项专项 Node、生产构建和 10k 目标门通过。产品 `3` 文件约 `+145 / -11`，工具 `2` 文件约 `+140 / -4`，新浏览器夹具 `123` 行且未超过 `500` 行。版本为 `0.3.20`，下一阶段只进入 335-E。

## 11. 335-E：政治 palette 与 topology cache 解耦（已接受）

- 关闭平滑边界且 surface ranges 完整覆盖全部 grid cells 时，国家 / 省份分别从 identity texture 的 state / province 通道读取偏移编码 ID，再查询 states / provinces palette；颜色切换不再调用 Worker、重建 surface 或触碰政治 mesh。平滑政治 surface 与 correction 仍留在既有安全路径，335-G 前不冒充已优化。
- 政治生成跨独立 `newMap` 运行的最终颜色并非稳定 checksum 分母，因此验收没有把一次偶然数字改写成新 expected。正式工具在同一张图内先强制旧 Worker 生成国家 / 省份 framebuffer，再以最终旧画面资源为 baseline 执行 GPU 切换；两种模式逐像素 `mismatches=0 / maxDelta=0`，同时要求目标操作 Worker / surface refresh / LongTask 为 `0`。
- 固定 `10004` cells 的目标门中，国家 / 省份同图 checksum 分别为 `4293181400 / 2882771796`，GPU 与各自 Worker 基线一致；surface set / segments / alias、cell attributes、political cache、picking 和 overlay 引用全部不变，控件、API、renderer、health、Loading 与 WebGL error 同源。artifact 为 `work/task335-e-political-views-10000/result.json`。
- 产品 `1` 文件 `+14 / -3`；复用 D 浏览器夹具约 `+50 / -18`，测试增量高于产品是因为必须在页内保留同图双 framebuffer、隔离旧 Worker 基线和产品 LongTask 后再逐像素比较，未新建第二套浏览器 harness，文件总长 `154` 行。语法、差异、cell attributes / prepared installer Node、生产构建和 10k 目标门通过。版本为 `0.3.21`，下一阶段只进入 335-F。

## 12. 335-F：主题、海底和普通图层本地显示提交（已接受）

- 海底开关只在当前颜色模式满足 GPU 常驻条件时改 `showOceanHeight` 并重绘，不再刷新 surface / line；不满足条件时仍保留原 Worker 安全路径，平滑 correction 不在本阶段越界处理。
- 普通图层只对白名单中的独立 draw gate 开放本地提交：标签、国家 / 省份 / 地区标签、测量、比例尺、地图徽记，以及缓存新鲜的路线 / 河流。城市、人口、Marker、资源、军事、岸线、政治边界、地区线、洋流、首次网格诊断和 dirty 动态 buffer 明确拒绝本地快路，不能把真实几何变化伪装成零重建。
- 主题切换在 GPU 常驻 surface 上不再调用 Worker：surface 直接读取新主题 uniform；既有标签节点原位更新 resolved style 并分片让步；正式 line / shore CPU 顶点只改主题颜色并原位上传，不再遍历全部 hard-cell 岸线邻接；道路继续使用既有异步分片 builder。目标链不替换 overlay、不重绑 picking、不重建 surface，失败用同一异步本地路径恢复旧主题。
- 固定 `10004` cells 的 Chrome 目标门中，主题、海底、标签、路线响应分别为 `48.6 / 12.5 / 14.2 / 13.2ms`，全部低于 `150 / 100 / 50 / 50ms` 门限。主题和海底与同图 Worker framebuffer 均为 `mismatches=0 / maxDelta=0`，标签 resolved style 同源；四项 Worker run、surface refresh、overlay replace、picking rebuild 与 LongTask 均为 `0`，surface、overlay、picking 和 route buffer 引用不变，health、Loading 与 WebGL error 为 `0`。artifact 为 `work/task335-f-display-mutations-10000/result.json`。
- 新增纯 Node 契约门并复用 GPU 视图浏览器夹具；产品 `3` 文件 `+165 / -15`，工具新增约 `+104 / -6`，浏览器夹具总长 `207` 行，未超过 `500` 行且测试增量低于产品。语法、差异、专项 Node、Worker 全合同、prepared installer、主题 / API 收敛 / display ledger、生产构建和目标浏览器门均通过。版本为 `0.3.22`，下一阶段只进入 335-G。

## 13. 335-G：平滑边界 correction 与岸线双态缓存（已接受）

- GPU 常驻颜色模式不再为平滑边界重新三角化整张 cell surface。正式 hard surface 始终保持稳定，内部非岸线曲边只生成 `x/y/packed(cellId, side)` correction 三角层；曲线向某个 cell 内弯时，条带由对侧 cell 覆盖，岸线仍交给既有拓扑 correction。这样既保留原平滑几何，也从结构上消除整 cell 重三角化产生深色三角的风险。
- correction 按完整三角和 `8MiB` 上限分段上传，prepared installer 对整个 buffer set 实施 retain / rollback / finalize 所有权；失败、取消和嵌套事务不会覆盖正式 set 或泄漏临时 WebGLBuffer。100k correction 为 `3` 段、`539440` 个三角、`19,419,840B`。
- Worker 在正式全量渲染时同时准备当前颜色的平滑岸线面，以及平滑 / 硬岸线线条两套轻量缓存。切换时只启停岸线 correction draw count、上传已缓存岸线线条并重绘；颜色或主题改变时才按真实语义刷新岸线颜色。没有删 point / labels / political / shore 图层，也没有降低精度或放宽 LongTask 阈值。
- 固定 `10004` cells 的首次开启 / 关闭 / 重复开启为 `14.7 / 13.9 / 13.1ms`；固定 `99846` cells 为 `20.2 / 18.7 / 16.4ms`。两档均与同图旧 Worker framebuffer `mismatches=0 / maxDelta=0`，Worker run、完整 surface refresh、完整 line refresh 与 LongTask 均为 `0`；surface、correction、cell attributes、overlay、picking 引用不变，health、Loading 和 WebGL error 为 `0`。artifact 为 `work/task335-g-smooth-borders-10000/result.json` 与 `work/task335-g-smooth-borders-100000/result.json`。
- 产品 `5` 文件约 `+460` 行，专项 / 复用工具约 `+180` 行；浏览器夹具总长 `241` 行，未超过 `500` 行且测试增量低于产品。语法、差异、correction / display mutation / prepared installer、Worker 全合同、render preparation、主题、生产构建以及 10k / 100k Chrome 门均通过。版本为 `0.3.23`，下一阶段只进入 335-H。

## 14. 335-H：overlay、城市与 picking identity 稳定（已接受）

- point buffer 改为一次构建人口、城市、Marker、资源与军事的稳定顶点，并按原顺序保存可见 draw ranges；图层开关只选择 ranges，不再重建 / 上传 point buffer。Worker render preparation 与 prepared installer 同步传递、校验和原子安装 ranges；真实地图数据变化仍使用既有完整 point refresh，不把写操作误走显示快路。
- 城市总开关不再把图层可见性写入全部城市实例的 `visibilityTarget`，WebGL 层以统一 draw gate 隐藏 / 显示；隐藏期间仍维护视口和碰撞目标，避免恢复时重装实例。城市开关只执行轻量 city / marker / military overlay 更新，不重新布局全部标签；Marker 等真实碰撞变化仍保留完整 overlay 语义。
- 固定 `99846` cells 十次反转 / 恢复响应为 `12.2～38.5ms`，固定 `10004` cells 为 `11.1～19.6ms`。两档 Worker run、point refresh、overlay replace、picking rebuild、city `setInstances` 与 LongTask 全为 `0`；城市 / 人口开关的实例状态上传为 `0`，point buffer / ranges、overlay 节点、label / marker / military / city items、city instance buffer 与 picking 引用不变，隐藏 / 恢复 picking 语义正确，最终 framebuffer `mismatches=0 / maxDelta=0`。artifact 为 `work/task335-h-layer-identity-10000/result.json` 与 `work/task335-h-layer-identity-100000/result.json`。
- 修复过程中 100k 城市恢复曾由全标签重排产生 `67 / 58ms`，改为轻量 overlay 后剩余 `57 / 52ms`；进一步移除图层总开关对全部城市实例状态的写入后，最终复验为 `38.5ms / LongTask 0`，没有以登记阈值替代最终门。浏览器夹具总长 `275` 行，仍低于 `500` 行；语法、差异、点层 / city WebGL / render preparation / prepared installer、Worker 全合同、API 收敛、主题、生产构建与两档 Chrome 均通过。版本为 `0.3.24`，下一阶段只进入 335-I。

## 15. 335-I：latest-wins、build handshake 与一次性自愈（已接受）

- 所有正式显示入口进入独立递增 sequence 队列。同一事件循环内连续 A→B→C 时，尚未执行的 A / B 以结构化 `operation_obsolete` 结束，只执行 C；已经运行的旧意图可完成原子资源事务，但 `intent.isCurrent()` 为假时不得再回写控件。UI 对被新意图取代的预期错误不弹错误 toast、不恢复旧控件；真实失败仍从 renderer 恢复。
- Vite 用当前 package version 注入编译时 build id；Worker request、stream、response、session commit / patch 全部沿协议 envelope 带回并逐条验证。页面 / Worker build 不一致返回 `worker_build_mismatch`、明确提示保存后刷新，且 coordinator 在 accepted 前也直接拒绝，禁止退回主线程计算。
- 仅当完整 display rollback 已结束且错误链精确含 `worker_protocol_session_stale` 或 `worker_session_commit_rejected` 时，当前显示 operation 才清理旧 session 并重试一次；第二次失败原样保留。真实 10k 中首次 states 提交后 renderer / API / active Tab 同源；同步 height→provinces→biomes 加真实 wheel 后，前两项 obsolete、最终三处均为 biomes。commit rejected 与 stale 各自 `runCalls=2 / selfHealAttempts=1` 并提交目标状态；build mismatch `runCalls=1 / fallbackRuns=0` 且旧状态精确保留。artifact 为 `work/task335-i-display-consistency-10000/result.json`。
- 新增纯 latest-wins Node 门并扩充 Worker build 失配反例；产品新增约 `99` 行，测试 / 工具新增约 `97` 行，复用浏览器夹具总长 `316` 行。语法、差异、latest-wins、Worker app static / 全合同、display ledger、API 收敛、生产构建与目标 Chrome 均通过。版本为 `0.3.25`，下一阶段只进入 335-J 统一终验。
