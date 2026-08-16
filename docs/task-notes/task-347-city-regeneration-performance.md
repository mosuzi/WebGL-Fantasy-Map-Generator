# 第 347 项：100k 城镇完全重生成端到端性能优化

## 阶段矩阵

| 字段 | 内容 |
| --- | --- |
| 最终任务 | 在不改变完全重算结果与事务语义的前提下，把用户当前 100k 存档城镇重生成从 `9969ms` 降至 `≤6000ms` 且至少降低 `40%` |
| 当前阶段 | 已完成：第二优化回合与用户当前存档最终验收通过 |
| 最小验收 | 分段覆盖误差可核对；固定 10k / 100k 基线；明确唯一首要热点与最窄优化边界 |
| 非目标 | 不优化其它十类重生成，不改 Loading 文案，不降城镇数量 / 质量，不删港口、道路、标签、图标或 picking，不改存档 schema、公开 API、默认参数或 `source/` |
| 唯一写者 | 主线程；性能账本、实测热点产品代码、专项回归与权威文档 |
| 独立角色 | 无；若后续风险扩大到共享 Worker / history 架构，再按任务级复核规则申请 |
| 首个廉价门 | 既有 Worker telemetry 字段静态盘点与专项 Node 账本守恒 |
| 冻结门 | 固定 100k 前后对照、用户精确 `5410` 当前存档正式入口与生产构建 |
| checkpoint | `codex-task-347-city-regeneration-performance` |

## 基线与成功定义

- 第 346 项在用户精确 `http://127.0.0.1:5410/?debug=1` 当前存档正式点击“重新生成城镇”，从点击到 health `operation-success` 为 `9969ms`；该数值是本项唯一真实用户基线。
- 旧采样只在约 `324 / 791 / 1140ms` 取得可见 Loading，随后调试读取至完成期间不稳定，因此不能用采样间隔推断计算、提交或刷新占比。
- 最终同一存档、同一正式入口必须同时满足：端到端 `≤6000ms`、相对基线降低至少 `40%`、主线程单任务 `≤200ms`。首阶段若给出足以支持更严格目标的证据，只能收紧目标。
- 固定 10k 代表入口不得显著回退；性能比较记录 cold / warm session、cell 数、城镇 / 港口 / 道路数、输入输出包、LongTask 和地图 binding，禁止混用不同分母。

## 冻结不变量

1. 保持第 345 项语义：未锁目标从空重建，不复用旧位置、名称或行政身份；成功结果 `replacementMode = from-empty / marineCities = 0`。
2. 显式锁、局部范围外对象、锁冲突、重复道路边冲突、地图 identity / revision、唯一 operation owner、Worker pending / commit / invalidate、失败回滚和 Ctrl+Z / Ctrl+Y 不得放宽。
3. 城镇派生的港口、道路、国家首都、省会、标签、图标、对象索引、overlay、picking 与当前显示模式必须完整；不能靠少算、延迟到成功之后或隐藏结果降低墙钟。
4. 普通界面继续使用第 346 项文案，不显示 Worker、消息包、buffer、picking、结构化克隆或存储实现；精确标量仅进入返回 telemetry、开发模式和本地 artifact。
5. 用户标签页只在阶段 A 采集一次基线核对、最终冻结后采集一次正式结果；每次成功后立即撤销并核对原始城镇 / 港口 / 道路 / 名称 / history，不保存或覆盖地图。

## 347-A：可信分段账本

- 复用既有 `domainComputeMs / patchCaptureMs / renderPrepareWorkerMs`、输入输出流、`commitInstallMs / renderInstallPrepareMs / renderInstallCommitMs / uiRefreshMs / commitTotalMs` 和 session telemetry，不重复造第二套计时。
- 补齐从 UI 点击到 Worker 调用、结果返回到 command commit、UI 刷新到 session commit / operation-success 的未归属间隙；输出 `accountedMs / unattributedMs / coverageRatio`，要求已归属时间不重叠，误差 `≤max(100ms, wall 的 5%)`。
- 用正式 API / UI 共用的运行链产生持久本地报告，不能依赖操作期间持续 CDP 轮询；报告只写入 `work/` 或 `docs/generated/`，不得提交用户地图或私人名称。
- 阶段结束只选择实测最大热点，冻结 347-B 的文件边界、反例和收益目标；没有证据不得先改领域算法或 renderer。

### 首败收敛（2026-08-17）

- 新增专用浏览器账本后，固定 10k 两轮均成功重生成城镇，但夹具错误读取顶层 `replacementMode`，因而在性能结论前停止；两轮均不计为通过。
- 用户批准补齐稳定结果合同后，纯 Node 最窄复现确认统一重生成结果把扩展标量稳定放在 `result.details`，即 `details.replacementMode = "from-empty" / details.marineCities = 0`；产品没有丢失字段，不能为错误夹具重复增加顶层字段。
- 夹具与完全重算回归现统一锁定 `result.details`，同时继续用实际身份指纹变化、正式地图陆地不变量和撤销恢复交叉验证。按用户裁定恢复 347-A，只允许一次修正后的 10k 目标复验。

### 阶段账本与冻结（2026-08-17）

- 固定 10k：墙钟 `1119.4ms`，归属覆盖 `95.6%`，未归属 `49.7ms`，最大 LongTask `0ms`；固定 100k：墙钟 `2307.3ms`，归属覆盖 `95.1%`，未归属 `114.1ms`，最大 LongTask `0ms`。固定 100k 的最大阶段是 `renderInstallPrepareMs = 1386.5ms`，其中主要为 prepared render 安装准备。
- 用户当前存档正式入口的首份完整账本为 `7754.3ms`：领域计算 `534.2ms`、Worker 渲染准备 `84.0ms`、输出接收 `307.0ms`、提交总计 `6593.9ms`；提交内 `renderInstallPrepareMs = 6337.4ms`，其中 `picking:picking-rebind` 至 `5661.0ms`，确认地图特有热点不是城镇选址算法。
- 首个最窄优化把分片回绑的字符串 segment 去重改为紧凑位图，并在缺少原生调度时用消息通道让出；专项 render-preparation 回归通过。用户目标复验为 `7108.3ms`，`picking:picking-rebind` 仍至 `5232.7ms`，仅降低 `646.0ms / 8.3%`，未达到 `≤6000ms` 且至少降低 `40%` 的双门。
- 两次成功操作均保持 `replacementMode = from-empty / marineCities = 0`；首次 `949 → 1017`，名称序列实质变化。每次 Ctrl+Z 后均恢复 `949` 及原始首十二城镇名，未保存用户地图。
- 同一性能 blocker 在唯一目标复验中再次出现，按仓库停止条件冻结。若用户批准第二优化回合，唯一候选边界是：城镇重生成安装时不再把 Worker 的数十万 route picking 引用逐条对象化回绑，而是在主线程用已提交的新地图直接构建 `cities + routeSegments` 局部 picking 索引；先以固定 100k 证明同步切片 `<200ms`、局部安装与 rollback 等价，再允许一次用户最终门。不得删除 route picking 或延迟到成功提示之后。

### 第二优化回合与最终验收（2026-08-17）

- 用户明确放行后按冻结候选实施：城镇 prepared install 继续校验 Worker picking DTO 的 schema version、地图 binding、组件集合、bucket 几何和统计摘要；校验通过后直接从已提交新地图构建 `cities + routeSegments` 局部对象索引，不再逐条对象化不被采用的 packed 引用。其它领域、错误回退、局部安装、rollback 与 finalize 仍走原事务边界。
- 重新生产构建后的固定 100k 墙钟为 `1276.4ms`，`renderInstallPrepareMs = 240.4ms`，`picking-direct = 2.8ms`，LongTask `0`；结果为 `from-empty / marineCities = 0`，撤销恢复 `1364` 城镇。生产构建、render preparation、prepared installer、完全重算、约束 bundle 与完整十一类 Worker 均通过。
- 用户精确 `5410/?debug=1` 当前存档正式按钮最终为 `1886.3ms`，相对第 346 项 `9969ms` 降低 `81.1%`，满足 `≤6000ms` 与至少降低 `40%` 的双门。领域计算 `480.0ms`、结果接收 `250.5ms`、安装准备 `601.2ms`、提交总计 `795.0ms`，`picking-direct = 3.4ms`。
- 用户图城镇 `949 → 1017`，首十二名称从“燕亭、月岚、玉汀……”变为“神女、月松、青森……”，`replacementMode = from-empty / marineCities = 0`。Ctrl+Z 后恢复 `949` 和原始首十二名称，Loading 隐藏；未保存或覆盖用户地图。

## 347-B：最大热点优化

- 若热点在领域计算：只消除重复排序、扫描、候选派生或可安全复用的只读上游索引，保持随机数消费次序、选址与完全重算契约。
- 若热点在 patch / history：只减少重复深拷贝与全图遍历，保持 before / after 可逆数据、replica paths、失败恢复和撤销精确性。
- 若热点在 transport / render / UI：只对明确未变化的结构做增量传输或复用；任何无法证明未变化的层继续走完整 prepared install，不把工作推迟到成功提示之后。
- 首个实质优化冻结后只跑一次专项门和一次固定 100k 目标复验；真实首败即停并按门禁做一次最窄诊断。

## 347-C：集成与真实验收

- L0：语法、差异、telemetry 守恒、完全重算静态约束。
- L1：城镇水域反例、身份变化、锁 / 局部 / 冲突、历史回滚及受影响共享模块专项。
- L2：固定 10k 正式浏览器入口，结果、Loading、LongTask、console / page / WebGL 错误面。
- L3：固定 100k 同分母前后对照，至少三次有效样本报告中位数与最差值；昂贵门首败即停。
- L4：用户精确 `5410` 当前存档只执行一次正式“重新生成城镇”，验证 `≤6000ms` 且降低至少 `40%`，随后 Ctrl+Z 恢复原始数据与名称序列；生产构建通过后才能归档。

## 停止条件

- 可信账本显示达标需要改变随机结果语义、降低内容规模 / 质量、删除依赖层或修改存档 / API 契约时，停止并请用户裁定。
- 固定 100k 或用户真实入口不能达到双重硬门时，不以提高阈值、改 Loading 完成时点或省略尾部刷新冒充优化；记录剩余热点与已获得收益后请用户决定是否扩项。
- 浏览器夹具连续两次失败、同一 blocker 再现、用户标签页状态与冻结基线不一致时立即冻结，不重复运行昂贵门。
