# 第 349-3 阶段：核心身份、revision、operation、snapshot 与 commit 契约

> 状态：`ACCEPT`；只读评审首轮指出五项类型 / validator / 回归一致性缺口，最窄修正后复审通过。

## 1. 交付边界

本阶段在 `app/webgl-generator/src/core/contracts/` 新增纯 TypeScript 契约和 runtime validator，但没有任何旧 runtime、Worker、renderer、persistence、API 或 UI 入口导入它们。目标是先证明词汇、判别字段、负例和运行时错误稳定，再由后续 `349-3a` 修复 registry / identity adapter，`349-5` 才建立薄 facade。

| 文件 | 职责 |
| --- | --- |
| `identity.ts` | runtime session、普通 document、headless document、render preparation、operation、transaction、commit、checksum 和 lock 品牌类型 |
| `revision.ts` | interactive / headless revision vector，canonical / topology / presentation / render generation 分型 |
| `operation.ts` | pre-commit 与 committed-projection 判别联合；renderer profile 强制 render preparation identity |
| `projection.ts` | presentation binding 与不含 operation / lock token 的 render resource binding |
| `snapshot.ts` | purpose、ownership、transfer policy 和 owner state |
| `patch.ts` | computed / committed patch 分型 |
| `commit.ts` | 七步 lifecycle、commit envelope 和 projection 状态 |
| `runtime-validators.ts` | 对 `unknown` 输入的结构、身份、revision、ownership、patch 与 lifecycle 校验 |
| `contract.type-test.ts` | 品牌不可互换和 computed patch 无正式 commit 字段的编译负例 |
| `index.ts` | 统一导出；当前未被产品入口消费 |

## 2. 身份与 revision

### 2.1 品牌身份

以下值在 TypeScript 中结构不兼容：

- `RuntimeMapSessionId`；
- `PersistedDocumentId`；
- `HeadlessDocumentId`；
- `RenderPreparationId`；
- `OperationId` / `TransactionId` / `CommitId`；
- `CanonicalRevision` / `HeadlessDocumentRevision` / `TopologyRevision` / `PresentationRevision` / `RenderGeneration`。

本阶段只定义 `PersistedDocumentId` 类型，不构造或迁移普通存档 identity；普通存档当前没有稳定 id，这一前置工作严格留在 `349-3a`。

### 2.2 revision profile

```text
interactive = RuntimeMapSessionId + CanonicalRevision
            + TopologyRevision + DomainRevisionMap

headless    = HeadlessDocumentId + HeadlessDocumentRevision
            + DomainRevisionMap
```

runtime validator 拒绝 interactive / headless 字段混装。普通 edit、regenerate、undo、redo 必须在同一 owner 内把 revision 精确推进 `+1`；全图 `import` / `adoption` 必须建立不同的 interactive runtime session，并从 revision `0` 开始。

## 3. Operation 与 projection binding

```text
pre-commit:
  compute | render-prepare | persistence-prepare | query
  不得出现 commitId / targetRevision

committed-projection:
  worker-replica | renderer | persistence | ui
  必须出现 commitId / targetRevision
```

`render-prepare` 与 `renderer` binding 必须携带 `RenderPreparationId`；其它 profile 携带该字段会被拒绝。`RenderResourceBinding` 只允许 runtime session、source canonical revision、topology revision、render preparation identity 和 render generation，显式拒绝 operation id 与 lock fingerprint，避免短命操作 token 冒充资源 owner。

`PresentationBinding` 只推进 `PresentationRevision`，不会被类型系统接受为 canonical revision。

## 4. Snapshot ownership

| kind | transfer policy | 可进入 transferred | 用途 |
| --- | --- | --- | --- |
| `borrowed-readonly` | `forbidden` | 否 | 同步只读 query |
| `exclusive-clone` | `forbidden` | 否 | rollback / 隔离写副本 |
| `cloned-transferable` | `owner-transfer` | 是 | Worker clone 后 transfer |
| `prepared-exclusive` | `owner-transfer` | 是 | prepared renderer transaction |
| `projection-retained` | `forbidden` | 否 | renderer retained CPU projection |

validator 只校验本阶段能够稳定证明的 ownership 组合；具体 section、buffer detach 和目的域 capability 在 adapter / slice 阶段接线验证。

## 5. Patch 与 commit

`ComputedDomainPatch` 只有 `baseRevision`、pre-commit compute binding、write-set、payload 和 checksum；类型负例及 runtime validator 都拒绝 `commitId` 与 `targetRevision`。core 接纳后才生成 `CommittedDomainPatch`，它要求：

- committed-projection binding；
- patch 与 binding 的 `commitId` 相同；
- patch base / target revision 分别与 binding source / target 完全相同；
- 同一 owner 精确推进一个 revision。

commit lifecycle 固定为：

```text
planned → computed → validated → projections-prepared
→ canonical-committed → published → projections-settled
```

validator 只允许相邻前进，不提供 rollback 状态，因此 `published` 后不能退回 validated 或 canonical-committed。projection 可以单独记录 `degraded / retrying / resyncing`，不会反向改写 commit history。

## 6. Runtime 错误协议

`CoreContractError` 提供稳定 `code + path`，当前错误码覆盖：对象 / 字符串 / 非负整数 / 数组 / enum、缺失或意外字段、identity / revision 不匹配、ownership 与 lifecycle 非法。普通 UI 不消费这些技术错误；它们服务 adapter、专项回归和开发诊断。

## 7. 验收实现

- `typecheck:core` 包含 `contract.type-test.ts`；删除任一预期类型错误会触发 unused `@ts-expect-error`，放宽品牌或 patch 边界会使门禁失败。
- `tsconfig.core.runtime-test.json` 把同一批 TypeScript validator 编译到忽略的 `.cache/core-contract-test`；没有维护第二份 JS validator。
- `tools/webgl-generator-core-contract-regression.mjs` 在 Node 中执行编译结果，覆盖合法与非法 identity、operation、render resource、computed / committed patch、snapshot ownership、lifecycle、普通 commit 和 import / adoption。
- production build 验证新增契约没有进入现有 runtime import graph；转换模块数应保持 `1360`。

## 8. 非目标

- 不修改或接管 `MapRevisionTracker`、`EditHistory`、`RuntimeOperation`、Worker coordinator、renderer installer、map-file-io 或 headless write；
- 不修复五个 canonical registry 遗漏，不生成普通 persisted document id；
- 不创建 `MapCoreEngine` / `MapRuntimeCoordinator` facade；
- 不实现 Manifest、dependency registry 或领域模块；
- 不启动、不操作、不执行任何浏览器验收。
