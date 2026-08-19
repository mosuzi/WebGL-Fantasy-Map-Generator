# 第 349-10c0 阶段：共享 Worker result ownership

## 插入原因

10c 首门确认 `regeneration.compute` 同时承载多个领域的 result kind。现有 `WorkerTaskDescriptor.id` 又是全局 descriptor id、又被拿去解析真实 Worker registry；society-politics 登记 states / provinces / religions 后，独立 settlements 或 zones Manifest 无法登记同一个 transport，即使 result kind 完全不重叠。把领域合并或谎报不需要 Worker 都会破坏计划真实性，因此在 10c 前插入本阶段。

## 契约

- `WorkerTaskDescriptor.id` 是领域内 binding descriptor identity，继续进入全局分类 ID 账本。
- `WorkerTaskDescriptor.task` 是真实 Worker registry route，必须由权威 registry resolver 验证。
- 一个 task 可由多个领域声明互不重叠的 result kind；唯一 owner key 为 `task + resultKind`。
- 跨领域重叠和同一 Manifest 内重叠均在注册前拒绝；descriptor 与 result claim 一起原子登记，失败不残留半注册状态。
- 既有 foundation / population 显式声明同名 `task`，行为不变；society-politics 使用领域专属 descriptor id 绑定 `regeneration.compute`。不改 Worker wire DTO、task registry 或业务运行路由。

## 验收

- `pnpm typecheck:core`
- `pnpm regress:core-manifests`：正式注册仍为 `5 domains / 78 descriptors`；共享 `regeneration.compute` 的 society-politics(states) 与测试 settlements(cities) 可并存；跨领域 states 重叠、单 Manifest cities 重叠、缺 task、未知 task 均拒绝，负例 `35`。
- `pnpm regress:society-politics-core-protocol`
- `pnpm build`
- `git diff --check`；`source/` 改动 `0`；浏览器执行 `0`。

## 阶段交接

| 字段 | 内容 |
| --- | --- |
| 状态 | `ACCEPT`；同一只读评审智能体首轮无 P0 / P1 |
| 版本 | `0.5.32` |
| 下一步 | 返回 349-10c |
