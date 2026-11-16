# 第 418 项：存档逐版兼容契约

## 现状

地图文档和地图 schema 当前都是 `v2`；文档 `v1→v2` 有注册迁移器，早期同版 v2 增加的字段由导入时的回填继续支持。`WEBFMG3` 是独立的二进制容器版本，浏览器 LocalStorage 与 IndexedDB 包装各为 `v1`。正式文件、API、恢复点和浏览器存储解包后进入共同的文档迁移链，当前 schema 校验位于迁移与回填之后。本项没有新增持久字段，因此保持当前磁盘版本；未来字段或校验变化的升版规则见[长期契约](../architecture/save-version-compatibility.md)。

## 修复

对象型地图导入和无头对象载入原用普通 `JSON.stringify`。已经解析的旧存档若含 `Uint8Array`，序列化后会变成数字键普通对象；地图可能通过校验，但高度统计从 3 格变成 0 格。两处现改用地图文档专用的 TypedArray 序列化，再经过既有逐版迁移。正式 UI 的 Worker 导入原本已经使用该序列化路径。

集成复核另发现：输入明确声明未来 `schema v3` 时，原代码会将文档与地图标记直接覆盖为 `v2`。现在在迁移、导出以及 `WEBFMG3` 同步 / 异步解码之前拒绝未来 schema；旧存档没有 schema 标记时仍照原规则回填。专项包含文档标记、地图标记、容器头标记分别超前的反例。

新增冻结的旧 `v2` 城镇存档夹具，保留缺少 burg 和旧 cell 镜像的原始形态。另用 `0.2.12` 的 `4810b23` 版编码器，将该旧结构写成固定 `WEBFMG3` 二进制夹具，SHA-256 为 `afdfcdc9b040db4c73e080266c902aacdb97bdf577591e1ff8e8ffc714164a46`；`tools/create-historical-save-fixture.mjs` 记录了可复现的生成过程，回归只读取固定字节。专项覆盖完整 JSON、压缩 JSON、历史 `WEBFMG3` 原始 / gzip、浏览器 plain / gzip 包装、v1 / v2 对象入口、无头读取和升级后保存回读；核对城市名称、人口、文化、视觉资料及数值数组类型不丢。现有 v1 固定夹具与缺失迁移步骤反例继续保留。两份真实历史 v1、v2 gzip 导出也已只读解析成功；这些样本不能代表所有历史发行版。

## 验收

`regress:map-migration`、`regress:headless-api`、`regress:map-file-io-worker`、`typecheck:core`、`build:app` 通过。正式浏览器旧存档兼容夹具覆盖旧 v2 恢复、缺失 burg 补全、损坏记录保留、普通 / 调试诊断；本轮恢复目标 LongTask 最大 `72ms`、超 `200ms` 为 `0`。夹具准备阶段的地图生成出现 `394ms` LongTask，单列为生成阶段，未计入存档恢复窗口。集成复核最初发现未来 schema 静默降级和历史二进制覆盖缺口，修复后 blocker-only 复查 `ACCEPT`；最终独立只读验收 `ACCEPT / P1 0 / P2 0`，正式 Worker handoff 与旧版容器头路径已核对。第 402 项仍冻结。
