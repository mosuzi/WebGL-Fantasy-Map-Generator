# 第 349-4 阶段：领域能力清单与影子审计

## 目标与边界

本阶段把第 349 项计划中的 `DomainModuleManifest` 固化为 TypeScript 契约和运行时注册审计，但保持 `status: "shadow"`：既有 action、Worker、renderer、panel、API 和 persistence 路由完全不读取这些 Manifest。它们只用于核对现状并为后续垂直切片提供同一份能力分母，不成为第二个地图 owner。

本阶段不实现 `MapCoreEngine` facade，不迁移领域行为，不修改 `source/`，不合入 `main`，不启动或操作浏览器。

## 必填清单与拒绝规则

每个领域必须声明 identity / version、canonical sections、derived systems、commands、persistence、regression、capabilities 和不适用能力的理由；Worker、regeneration、query、view、layer、panel、API、lock 按领域真实能力选填。

注册器执行以下交叉审计：

- canonical section 以及 descriptor 的 read / write path 必须由唯一 canonical field registry 覆盖；
- command 必须有非空 write set、execution profile 和 undo policy，不可撤销时必须说明原因；
- regeneration 必须声明 source revision、binding、lock policy、replacement policy 和 write set；
- Worker task 必须存在于真实 Worker registry，并声明 result kind、binding、patch policy 和 write set；
- panel 只能引用同一 Manifest 已注册的 command / query；
- API binding 必须声明唯一 id、真实公开 method、target、schema version、capability group、mutates / undo / confirm、完整 business codes 和权威文档入口；必填 resolver 将其逐项对照 `api-contract + api-schema-registry` 的真实 description / metadata，target 必须解析到同一 Manifest 的 command / query / regeneration；
- persistence 必须声明 schema version、migration、backfill 和旧样本；
- regression gate 必须存在于根 `package.json`，并按实际能力覆盖 save、undo、worker、regeneration、view、layer 和 failure；
- `required` 能力缺 descriptor、`not-required / unsupported` 能力存在 descriptor 或缺理由均拒绝；未知 capability reason 拒绝；
- render layer 只读，不得声明 canonical write；regeneration 也进入全局分类 ID 账本；任何注册失败不得部分污染 registry。

## 三个影子样本

| 领域 | 真实能力 | 明确不具有的能力 | 影子证据 |
| --- | --- | --- | --- |
| `notes` | command、query、panel、persistence、API、undo | 独有 Worker、regeneration、map view、render layer | 五类既有备注命令、对象备注、导入与 notes panel 源码入口 |
| `markers` | command、可选资源重生成、view、独立 point layer、picking、export、panel、API、locks | 独有业务 Worker | Marker CRUD、资源 Marker 重生成、marker panel 与公开编辑入口 |
| `population` | command、query、view、真实 `population.compute` Worker、panel、API | 独有 regeneration、独立几何 layer | Worker registry、真实 result kind、patch policy 与源码 write set |

`population.compute` 是本阶段的真实 Worker 试点登记；这里只验证其既有协议与 Manifest 一致，统一 binding / result / patch / ACK / resync 的运行接管仍属于 `349-8`。

## 专项回归

`regress:core-manifests` 编译并直接执行同一套 TypeScript validator，当前登记 `3` 个领域、`45` 个分类 descriptor，核对 `population.compute` 的真实 Worker 注册及 write set，并确认 runtime 对 Manifest 的 import 为 `0`。canonical、Worker、package regression gate 与 API description 四类 resolver 都是必填依赖，不能在缺上下文时降级放行。

负例共 `28` 类，除原有 Manifest / capability / reference / 原子失败门外，新增三类缺失 resolver、未知 regression gate、API schema / capability / business codes / documentation 漂移，以及跨领域 regeneration ID 冲突。专项还将每个 descriptor 的 `headless` profile 与 `HEADLESS_WRITE_METHODS` 精确对照，并断言 `markers.delete` 的真实写集包含 `notes`。

## 阶段验收口径

- `typecheck:core`、`regress:core-contracts`、`regress:core-manifests` 与 canonical field audit 通过；
- notes / markers / population 三份 Manifest 均可由真实 registry 上下文登记；
- 生产构建通过，runtime route import 保持 `0`；
- `source/` 零改动，未执行浏览器验收；
- 冻结 checkpoint 后由同一只读评审智能体复核，只有 `ACCEPT` 才进入 `349-5`。

## 冻结证据

- `typecheck:core`、`regress:core-contracts`、`regress:core-manifests`、`audit:canonical-map-fields` 全部通过；registry 为 `66 fields / 29 sections`。
- 既有 `regress:object-creation`、`regress:auxiliary-object-creation`、`regress:population-adjustment`、`regress:population-transfer`、`regress:api-data-compatibility` 通过，证明三份影子样本引用的现有入口没有因本阶段漂移。
- 首轮与评审修正后的 `build:app` 分别以版本 `0.5.11 / 0.5.12` 通过，均转换 `1361` 个模块；chunk size 既有提示保留为非阻断观察。修正后另通过 `regress:api-ai-discovery` 的 `328 / 328` 描述覆盖、`regress:headless-write` 与 Marker / notes 辅助对象专项。
- `git diff --check` 通过，`source/` 状态为空；分支仍为 `codex/map-core-engine-architecture-plan`，`main` 是本分支祖先而不包含本分支 HEAD。
- 未启动、未操作、未执行任何浏览器验收。

## 首轮评审修正

同一只读评审智能体首轮给出四项 P1。修正后，外部 resolver 全部必填且有缺失 / false 反例；API 不再只校验自填非空字符串，而是通过 Vite SSR 读取既有 `buildMethodMetadata`，与 `api-schema-registry` 的真实 description 逐项对照；`markers.delete` 补入备注删除写集，notes / markers 与 population transfer 的虚假 headless profile 被移除；regeneration 纳入唯一性和原子注册预检。该修正不改变任何正式运行路由。
