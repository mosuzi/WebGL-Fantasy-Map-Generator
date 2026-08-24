# 第 353 项：正式保存性能与路线锁定优先重生成

> 2026-08-25：本项产品与专项变更已单独移植到 `codex/map-core-engine-architecture-plan`，未带入第 352 项或旧方案提交；重构分支集成版本为 `0.5.62`，仍不合入 `main`。

## 冻结范围

- 代表存档：`C:\Users\mosuzi\Downloads\krichars (3).webfmg`，只读；100,000 个 grid cell、43,419 个 pack cell，地图 checksum 为 `28eede3c`。
- 目标入口：正式压缩保存、正式 `generate.regenerate("routes")`、路线生成器的锁定约束与港口预处理。
- 锁定规则：锁定对象高于主动路线重生成；只要锁对象仍可结构化读取，就原样保留并让新路线绕开，不要求用户解锁。
- 非目标：压缩级别、v3 section / schema、地图生成、其它领域重生成、锁管理 UI、公开 API、`source/`。

## 阶段一：真实拒绝与保存基线

- 用户存档共有 442 条路线，唯一显式锁为城市 `#8`，没有锁定路线。
- 拒绝并非真实资源冲突：路线收尾调用 `finalizeSettlements` 时只传入锁定路线，漏传锁定城市，导致城市 `#8` 的 `province` 从 `108` 被行政 cell 的 `96` 覆盖；锁校验随后以 `locked_snapshot_changed` 拒绝事务。
- 更早的港口预处理也位于锁快照之前，并以 `repairProtectedDerived` 改写城市 `#8` 的 `port / type / group / resource / visual`。这同样违反锁定优先，只是此前被首个省份差异遮蔽。
- 正式浏览器连续保存三次为 `2865.3 / 2928.0 / 2889.8ms`，中位数 `2889.8ms`。Node 分段中位数约为 v3 编码 `2052ms`、gzip `433ms`、总计 `2511ms`；主瓶颈是 grid / pack 的 v3 紧凑编码，而不是下载或压缩级别。

## 阶段二：锁定优先路线契约

- 路线与城市锁快照前移到 cell / 港口预处理之前；`finalizeSettlements` 同时接收 `lockedCities` 与 `lockedRoutes`。
- 港口拓扑新增锁定优先分流：可读取但语义陈旧的锁定港口只登记为 `skipped`，不搬迁、不清除、不补镜像；未锁港口仍按原规则修复。锁定海路只要路径仍结构化、相邻可读就原样进入路线生成器。
- 多条锁路允许共享同一条 pack 边，所有锁路对象与完整路径均保留。单值 `pack.cells.routes` 优先保留重生成前已属于这些锁路之一的 owner，否则稳定选择最小锁路 ID；新路线把共享边视为已占用，不与锁路争用。
- 真正无法表示的锁对象仍精确拒绝，例如无效 ID、路径镜像缺失、cell 越界或路径不相邻；不再使用 `duplicate-edge` 拒绝两个合法锁对象。

## 阶段三：保存编码优化

- v3 解码时保留 grid / pack 派生顶点拓扑描述；后续保存复用该描述，避免每次对两套顶点邻接分别重建 Set 和排列。缓存以对象身份加双 32 位内容指纹校验，拓扑数组原地变化时自动失效并重算。
- 首次需要重建时合并 cell 邻接与 vertex 邻接的扫描，不再对 `cells.v` 重复遍历。
- 紧凑整数位打包在 `<=25bit` 使用位运算、`<=46bit` 使用安全 Number 算术，更高位保留 BigInt；ragged integer 预分配扁平数组，小整数域稀疏统计改用定长计数，section checksum 循环八路展开。
- 固定 `exportedAt` 的用户存档 v3 原始字节仍为 `15,428,683B`，SHA-256 在优化前后均为 `f21a790352578428bf287cba5df6619675054c7e19d698df3956ea02377d1411`；没有降压缩级别、删字段、跳过校验或改变容器格式。

## 阶段四：验收

| 指标 | 基线中位数 | 当前中位数 | 结果 |
| --- | ---: | ---: | ---: |
| 正式浏览器保存总耗时 | `2889.8ms` | `1841.3ms` | `-36.28%` |
| Node v3 编码 | `2052ms` | `1142.2ms` | `-44.34%` |
| Node 编码 + gzip | `2511ms` | `1709.5ms` | `-31.92%` |

- 正式浏览器保存三次为 `1884.7 / 1841.3 / 1781.4ms`；三次保存均保持同一内存地图、checksum `28eede3c`、history `0 / 0`、WebGL error `0`，保存窗口 LongTask 为 `0`。
- 用户原档在正式浏览器路线入口用时 `2907.4ms`，路线 `442 → 432`，形成单一撤销记录；锁定城市 `#8` 及 burg 镜像逐字段不变，`province=108` 保留，即使所在 cell 仍为 `96`；未锁路线确实变化，LongTask、页面错误和 WebGL error 均为 `0`。
- 小图正式浏览器覆盖全部锁城 no-op、锁城 + 锁路、局部城镇、直接锁路和两条共享边锁路；共享边 owner 保持 `0`，各成功事务只增加一条历史记录。
- 用户原档 raw v3 与 gzip v3 均完成正式解析往返；旧版迁移、完整导出九项套件、存档命名、v3 同步 / 异步解码、拓扑缓存失效、整数固定字节哈希、港口拓扑和路线锁定专项通过。
- 最终 `0.5.6` 构建把优化后的压缩 Blob 经正式浏览器再次导入；地图摘要、checksum `28eede3c`、`疆界柔化=100` 的存档值 / renderer / 偏好、history `0 / 0` 与 WebGL error `0` 全部恢复。
- `browser-save-feedback` 的 6 秒 toast 时序夹具仍在约 5.5 秒采样点出现既有时序波动；它不涉及存档数据、正式保存结果或本项性能路径，未在封闭范围内修改产品提示时长。

## 本地产物

- 保存基线：`Z:\tmp\codex\2026-08-24\map-save-route-lock-priority\baseline.json`
- 最终浏览器保存：`Z:\tmp\codex\2026-08-24\map-save-route-lock-priority\browser-final.json`
- 用户原档浏览器路线：`Z:\tmp\codex\2026-08-24\map-save-route-lock-priority\browser-route-actual.json`
- 最终浏览器压缩回读：`Z:\tmp\codex\2026-08-24\map-save-route-lock-priority\browser-final-roundtrip.json`
- 固定字节与 raw / gzip 往返：`Z:\tmp\codex\2026-08-24\map-save-route-lock-priority\actual-roundtrip.json`
- CPU profile：`Z:\tmp\codex\2026-08-24\map-save-route-lock-priority\save-current.cpuprofile`

## 阶段交接

- 产品文件：路线锁定优先、港口锁定跳过、共享锁路边 owner、v3 拓扑缓存和紧凑编码优化完成。
- 工具文件：路线 Node / 浏览器回归、港口拓扑、v3 格式恒定与真实存档保存 / 路线浏览器夹具已补齐。
- 真实门禁：用户 100k 原档正式保存三轮、正式路线重生成、raw / gzip 往返、固定字节哈希和 LongTask 门均有本地产物。
- 未完成或阻断：产品目标无阻断；未启动委派角色。
