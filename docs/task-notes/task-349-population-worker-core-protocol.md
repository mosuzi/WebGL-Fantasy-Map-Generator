# 第 349-8 阶段：人口 Worker 核心协议切片

## 冻结范围

本阶段只接管既有 `population.compute` 的主线程协议边界，不重写人口增减 / 转移算法，不迁移其他 Worker task，也不建立第二份 map、history、revision 或 Worker session owner。正式 Worker 仍使用既有可结构化克隆的 legacy binding 和 v1 domain patch；TypeScript adapter 在 canonical commit 前把 binding 显式映射为核心 `compute / pre-commit` 契约，并验证结果与 Manifest 写集。

## 协议闭合

- 主线程在发起人口计算前用既有 `fingerprintPopulationSource` 计算来源指纹并随请求发送；Worker 已有 stale 门验证输入，回包 adapter 再要求 plan / result 指纹与主线程请求一致。
- legacy `mapIdentity / mapRevision / generationToken / lockFingerprint / operationId / operationName` 显式映射为核心 `ComputeOperationBinding`；transaction identity 由同一请求字段确定性组成，不把数字 operation id 冒充品牌字符串。
- 普通结果必须同时匹配 output binding、plan binding、请求 kind、result kind、来源指纹、patch domain 和 `result.changedPaths`；历史结果必须匹配 action、请求 kind 和 binding。
- patch 的 `writeSet` 与 operations 路径必须一一对应、无重复，且每条路径属于 population Manifest 声明的根写集。历史 undo / redo patch 在发送给 Worker 前经过同一门。
- v1 legacy patch 没有 `baseChecksum / targetChecksum / baseRevision`，因此本阶段不伪装成 `ComputedDomainPatch`；升级 patch wire format 留在后续领域迁移阶段，当前以真实来源指纹和写集闭合其已有协议。

## 原子性与恢复

- stale revision / generation / operation gap / source fingerprint 在 canonical commit 前拒绝。
- 实际 Worker 取消发生在 apply 后时，既有领域快照回滚保持来源指纹不变；fault、锁、zero input、undo / redo 和 100k parity 继续由既有 population Worker 专项覆盖。
- session ACK、late result、取消终止、rollback order、session invalidation 与 restart / resync owner 沿用唯一 `workerTaskCoordinator`；通用 Worker registry 回归通过。本阶段没有复制 coordinator 或新增人口私有 session 状态。

## 验收证据

- `regress:population-core-protocol`：固定 1k 实际 task，普通 / history 两种 result kind，`145` 条实际 patch 路径；拒绝 generation、stale、operation gap、checksum、错误 result kind、未知 / 重复写路径，并验证取消回滚。
- `regress:population-adjustment`、`regress:population-transfer`：领域语义、旧图、save、undo / redo 与 fault 门通过。
- `webgl-generator-population-worker-task-regression.mjs`：10k / 100k、legacy parity、identity、history、locks / cancel / fault / stale 通过；100k 本轮约 `627.7ms`，`1560` 条 patch path。
- `webgl-generator-worker-task-regression.mjs`：通用协议、late reject、cancel terminate、ACK、rollback / recovery / session owner 通过。
- `typecheck:core`、`regress:core-manifests` 与 production build `1373 modules` 通过。
- `regress:population-adjustment-ui-api` 的静态文案断言仍期待“预检转移”，而本阶段起点 `HEAD` 已为“查看转移影响”；该首败与本阶段 diff 无关，未修改产品文案，也不把此门声称为通过。

## 边界

Manifest 继续为 `shadow`：本阶段只使一个真实 Worker 协议进入核心校验，不表示 population command、view、persistence 或整域已由核心 facade 接管。`source/`、其他 Worker task、浏览器和 `main` 均未触碰。
