# 第 352 项：启封舆图性能与边界柔化样式

## 冻结范围

- 代表存档：`C:\Users\mosuzi\Downloads\krichars (3).webfmg`，只读；SHA-256 为 `CF7402BC2BEA22AD1FCDE441444479F880DC0DB15D55520EF5A1A399D335DA61`。
- 目标入口：正式文件选择、文件 IO Worker、地图接纳、prepared render 安装与 `map-ready`。
- 视觉目标：解释原子换图后的首个正式帧与稳定帧，并只在政治边界线层提供可持久化柔化参数。
- 非目标：地图生成 / 编辑、v3 section 契约、显示快切、公开 API、`source/`、第 349～351 项。

## 阶段一：基线与成因

- 存档为 gzip v3：压缩 `9,642,587B`，解压 `15,428,683B`，schema 2，共 24 个 canonical section。
- 三轮基线 UI 导入端到端为 `19,709.7 / 19,795.5 / 19,830.7ms`，中位数 `19,795.5ms`。
- Worker 内部 handoff 编码中位数 `2,064.6ms`；Worker 总耗时中位数 `12,124.7ms`；render prepare 中位数 `8,295.3ms`。
- Worker 已经完成解压、v3 解码与迁移，随后又将完整地图重新编码成 v3 handoff，主线程再次解码，是可独立消除的重复工作。
- prepared installer 在同一原子提交中装入地图、政治路径和线顶点；首个正式帧与稳定帧的政治线签名同为 `88812:e13fea6a`，中心 `256×256` 像素哈希同为 `d8fe8143`，不存在单独的栅格快照。
- 旧视觉的蒙眬来自国界 `0.36` 世界宽度 / `0.34` alpha、省界 `0.24` / `0.22` alpha 的亚像素半透明线与标准 `SRC_ALPHA / ONE_MINUS_SRC_ALPHA` 混合；政治色带的 surface smoothing 不是这条边界描线。

## 阶段二：最窄实现

- 文件 IO Worker 对原始 v3 或 gzip v3 复用一次解压后的 canonical 分段字节，不再二次编码；主线程仍对这些原始 section 执行正式迁移和 main-thread projection。JSON、旧格式和非 v3 输入继续使用既有编码 fallback。
- `疆界柔化` 归一化为整数 `0～100`：`0` 相对旧值加宽、提高不透明度，`50` 的宽度与 alpha 精确等于旧值，`100` 收窄并降低不透明度。
- 设置变化只刷新 state / province line vertices；不刷新 surface，不改变地图 revision / history / checksum。
- 样式页加入政治边界卡片和连续 slider。普通界面只呈现“清晰描线 / 保留旧观感 / 轻柔朦胧”，不暴露 Worker、handoff 或 buffer 等内部术语。
- 正式导出复用既有 `map.metadata` section 的 `metadata.display`；新入口恢复为 `map.display`。没有增加 v3 顶层 section，旧应用可忽略新增嵌套字段。

## 阶段三：验收

| 指标 | 基线中位数 | 当前中位数 | 结果 |
| --- | ---: | ---: | ---: |
| 正式 UI 导入总耗时 | `19,795.5ms` | `17,509.1ms` | `-11.55%` |
| Worker 总耗时 | `12,124.7ms` | `9,879.3ms` | `-18.52%` |
| handoff 编码 | `2,064.6ms` | `0.2ms` | `>-99.99%` |
| render prepare | `8,295.3ms` | `8,205.9ms` | 无回退 |

- 当前三轮 UI 总耗时为 `17,509.1 / 17,472.5 / 17,818.7ms`；最大 LongTask `143ms`，低于硬门 `200ms`。
- 地图 checksum 保持 `28eede3c`；grid / pack / states / provinces / cities / routes / rivers / markers 为 `100000 / 43419 / 21 / 268 / 1251 / 442 / 1528 / 50`；导入后 history `undo = 0`，WebGL error `0`。
- `0 / 50 / 100` 三档政治边界 line mesh 签名分别为 `393948:665ea56a / 393948:1a13a4f6 / 393948:d5b96262`；默认 `50` 与基线首稳帧签名及像素完全一致。
- 压缩保存并正式回读 `100` 档后，存档值、renderer 与偏好均为 `100`，checksum、历史和 WebGL 状态不变。
- 代码门：`regress:political-boundary-softness`、地图迁移、v3 容器、文件 IO Worker、生产构建、归档检查和 `git diff --check`。

## 本地产物

- 基线三轮：`Z:\tmp\codex\2026-08-24\map-unseal-performance\baseline-three-runs.json`
- 当前三轮：`Z:\tmp\codex\2026-08-24\map-unseal-performance\current-three-runs.json`
- 视觉与持久化：`Z:\tmp\codex\2026-08-24\map-unseal-performance\current-visual\`
- 基线隔离 worktree：`Z:\tmp\codex\2026-08-24\map-unseal-performance\baseline-worktree`

## 阶段交接

- 产品文件：政治边界样式、renderer 增量线刷新、正式保存 / 导入接线、v3 handoff 优化及 UI 已完成。
- 工具文件：新增纯 Node 边界回归与真实存档浏览器基准 / 视觉脚本；文件 IO Worker 回归补齐复用路径深度一致性。
- 真实门禁：代表性大存档三轮基线 / 当前对照、首稳帧同源、三档视觉和压缩回读均已有本地产物。
- 未完成或阻断：无；未启动委派角色。
