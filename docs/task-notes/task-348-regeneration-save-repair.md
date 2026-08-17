# 第 348 项精简阶段交接

## 任务包

| 字段 | 内容 |
| --- | --- |
| 权威编号与目标 | 第 348 项；修复主动重生成后的 holey array 保存失败、失效港口派生拒绝和行政首都候选丢失 |
| 当前阶段 | 已完成，待 Git 交付 |
| 冻结点 | `codex/task-348-regeneration-save-repair`；产品、专项、真实浏览器与归档已接受 |
| 允许文件 | generator settlements / summary、map-file-io、regeneration task、port topology、app / city panel、对应专项与本项文档 |
| 禁止文件 | `source/`、持久 schema、开发服务器 / HMR、其它重生成算法与 UI |
| 必须保持 | 显式锁核心身份与位置、海上城镇为 0、Worker owner、事务回滚、撤销、旧 JSON / v2 / v3 兼容 |
| 最小验收 | 原图先保存；正式重生成城镇；新结果保存并载入；撤销恢复 949 / 21 / 218；三组 canonical 数组无 hole |
| 首个廉价门 | `node --no-warnings work/task-348-current-map-regression.mjs` |
| 停止条件 | 同一浏览器门二次产品失败、需扩大到加载 / HMR、或真实锁核心对象改变 |

## 阶段结果

- 状态：`ACCEPT`
- 完成：稠密 canonical 数组与 export 副本正规化；主动派生港口修复；面板结果反馈；TypedArray 行政候选纠错；专项与原存档离线回归。
- 已过门禁：原存档 `949 → 1194`、`20` 个有效首都、空国家首都归零、`marineCities 0`、三组 hole `0`；锁 / 路线、港口拓扑、v3 容器、生产构建通过。
- 浏览器证据：原图保存 `C:\Users\mosuzi\Downloads\krichars (1).webfmg`（`949 / 218 / 607`）；重生成结果保存 `C:\Users\mosuzi\Downloads\krichars (2).webfmg`（`1194 / 294 / 348`）；两者离线解码 hole 均为 `0`。
- 真实回读：同一用户标签页经实际“导入”控件先载入重生成文件，精确恢复 `1194 / 20 / 294 / 1176` 城镇 / 首都 / 港口 / 资源城镇；再载入基线文件，精确恢复 `949 / 21 / 218 / 852`，撤销 / 重做为空。
- 日志与现场：重生成文件、基线文件均由正式 UI 接纳；`holey`、保存失败、地图接纳失败、LongTask 与 WebGL 错误为 `0`。原档装载期间仅有一条约 `2.1s` 的 `operation-stall` 阶段告警，没有功能失败。最终页面保留原存档城市面板。
- 浏览器阻断收敛：Chrome remote debugging 曾被环境关闭，恢复后旧控制会话留下半占用；正式释放残留会话并重新接管精确 `294254848` 标签页后完成终验，未用替代页面或新地图规避。
- artifact：`work/task-348-current-map-regression.mjs` 为用户原 JSON 的正式 Worker 重生成 / v3 往返；`work/task-348-webfmg-inspect.mjs` 为下载存档离线解码。
- 延后记录：既有 100k 页面首次恢复性能不属于本项；本轮两次正式文件导入没有 LongTask。
- 下一步：无；按 `0.5.3` 提交任务分支并合入远端 `main`。
