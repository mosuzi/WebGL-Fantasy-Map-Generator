# 第 349-3a 阶段：字段注册表与普通文档身份

## 1. 阶段结论

本阶段闭合 `349-1` 发现的两个 Manifest 前置阻断：持久字段注册遗漏与身份命名空间混用。没有实现 Domain Manifest、`MapCoreEngine` facade，也没有接管旧 action。

canonical field registry 从版本 `1` 升至 `2`，由 `60` 个 descriptor、`24` 个顶层 section 扩为 `66 / 29`。新增持久字段是 `notes`、`measurements`、`labels`、`visualTheme`、`display`；另加一个不占顶层 section id 的 `options.visualTheme` 精确分类 descriptor。前三个字段分类为 `canonical`，`layers / visualTheme / display / options.visualTheme` 分类为 `persisted-presentation`。

这里的 persisted presentation 是存档可重复恢复的地图配置，不等于 live presentation。viewport、当前 display intent、pending render request、presentation revision 与 renderer resource owner 仍属于 runtime projection，不进入普通文档身份，也不与 canonical revision 共用时间线。

## 2. 注册表与兼容边界

- 新增五个顶层 section 固定追加在旧 `24` 个 section 之后，旧 `.webfmg v3` 的 section id 保持原顺序。
- `display` 仍是 optional；旧 v3 不含该 section 时由既有 v2 migration 按当前默认规则回填。
- `notes / measurements / labels / visualTheme` 沿用 `map-file-io` 的已有默认化与校验，不另建第二套 schema。
- full replica checksum、v3 persistence、replica patch path audit 与后续 Manifest audit 共用 registry 描述；普通 commit 仍使用增量 patch checksum，不改为每次全图 hash。
- full checksum 仍覆盖全部持久 section；缓存键由 canonical revision 与 persisted-presentation 小集合 checksum 共同组成，因此不推进 canonical revision 的主题 / display 修改也不会返回陈旧值。
- patch 可写路径必须由精确、通配或最具体祖先 descriptor 覆盖。这样保留 `metadata.name`、`pack.burgs.1` 等既有精细写路径，同时拒绝未登记的新顶层状态。

## 3. 普通 persisted document identity v1

普通 `.webfmg` / JSON 文档现在在 document header 与 `map.metadata` 同时保存：

- `documentId`；
- `documentIdentityVersion: 1`。

迁移规则：

1. 两处已有相同合法 id 时原样保留；
2. 仅 header 有 id 时回填到 map metadata；
3. 旧图两处均缺失时，仅根据 seed 与 generatedAt 等不随内容、checksum 或 topology 编辑变化的来源信息确定性派生 `fmg-doc-v1-<16 hex>`；
4. 两处 id 冲突时以 `persisted_document_identity_mismatch` 拒绝；
5. 显式非法 id 以 `persisted_document_identity_invalid` 拒绝，未知 identity version 以 `persisted_document_identity_version_invalid` 拒绝；
6. 地图内容与 checksum 改变不改变旧图派生 id；导出只修改 normalized copy，不向当前运行时 map 原地写入身份。

确定性派生用于让同一旧 map 的重复导出稳定，不把它解释为 runtime session id。普通 `PersistedDocumentId`、互动 `RuntimeMapSessionId`、一次 renderer prepare 的 `RenderPreparationId` 和 `metadata.headlessWrite.documentId` 各自保持独立语义；跨边界只能调用显式 adapter。

## 4. TypeScript 与运行时适配

新增 `PersistedDocumentBinding` 和以下显式 adapter：

- legacy interactive revision → `InteractiveRevisionVector`；
- legacy headless metadata → `HeadlessRevisionVector`；
- ordinary document header / map metadata → `PersistedDocumentBinding`；
- legacy presentation binding → `PresentationBinding`；
- legacy render resource binding → `RenderResourceBinding`。

adapter 复用 `349-3` 的 runtime validators；document header 与 map metadata 的 id / version 必须一致。品牌类型负例进一步证明 `PersistedDocumentId` 不能赋给 `RuntimeMapSessionId`。

## 5. 独立验收证据

- `pnpm run typecheck:core`；
- `pnpm run regress:core-contracts`；
- `pnpm run audit:canonical-map-fields`：registry `2 / 66 / 29`，旧 24 section 路径顺序不变；
- `pnpm run regress:registry-document-identity`：五字段 v3 `29` section 往返、full / patch / applied checksum、未知 patch path、identity 稳定性与版本拒绝；
- `pnpm run regress:map-migration`：v1 / 稀疏 v2 回填、source non-mutation、header-only 与冲突 identity；
- `node --no-warnings ./tools/webgl-generator-webfmg-v3-container-regression.mjs`；
- `pnpm run regress:map-replica-journal`；
- `pnpm run regress:map-replica-command-patch`；
- `node --no-warnings ./tools/webgl-generator-map-file-io-worker-regression.mjs`；
- `pnpm run build:app`；
- `git diff --check`。

本阶段浏览器启动、操作和验收均为 `0`。浏览器方案只在 `349-11` 评估并写入文档。

## 6. 未完成阶段顺序重评

本阶段未发现新的强制插入项。`349-4` 可在完整 registry 和已隔离 identity 的基础上实现 capability-aware Manifest；其余顺序保持：

```text
349-4 → 349-5 → 349-6 → 349-7 → 349-8 → 349-9
→ 349-10a → 349-10b → 349-10c → 349-10d → 349-10e → 349-10f → 349-10g
→ 349-11
```

同一只读评审智能体首轮提出四项 P1；最窄修正与反例闭合后复审 `ACCEPT`。后续进入 `349-4`。
