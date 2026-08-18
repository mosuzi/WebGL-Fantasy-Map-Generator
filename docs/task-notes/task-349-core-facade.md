# 第 349-5 阶段：薄核心 Facade 与投影协调器

## 目标与边界

本阶段建立 `MapCoreEngine + MapRuntimeCoordinator` 的影子实现，用统一词汇如实记录现有 legacy 事务已经发生的事实。它不是新的执行器：不调用 command、不推进 revision、不写 history、不保存第二份 map、不发布 UI / API / persistence，也不接管任何 runtime action。

正式互动地图的唯一 canonical owner 仍是 `createGeneratorApp` 内的 `state.map`。Facade 只接收 `getMap / getRevision / getHistoryFingerprint` 三个 getter；每次同步读取都重新取得 owner，通过可撤销的深层只读 membrane 阻止同步改写、直接或嵌套返回，并在回调结束后令闭包捕获的 borrowed 引用失效。Facade 不缓存 map，也不建立第二 owner。

## 影子提交状态机

```text
planned → computed → validated → projections-prepared
→ canonical-committed → published → projections-settled
```

- pre-commit 阶段只接收第 349-3 已验证的 binding，不分配 `commitId`；
- legacy 路径真实推进 owner revision / history 后，facade 才允许观察 `canonical-committed` 并分配 `commitId`；
- 同一组 `before / after revision + before / after history` 只能由一个 operation 原子认领；publish 前 rollback 会释放认领，允许 legacy 真实重试；
- publish 时再次核对 owner revision 与 history 指纹仍对应刚才的 commit，不能把已经由 legacy 回滚的状态误报为发布；
- publish 前允许记录 legacy 已完成的 rollback，包括 `canonical-committed` 后、`published` 前的恢复；
- publish 后禁止 rollback。Worker / renderer / persistence / UI 失败只进入 projection 状态恢复链，不改写 canonical history；
- commit envelope 的 projection 集合在后续更新中必须保持不变、不得重复；Core 自行校验逐项状态迁移并判定只有全部 `ready / degraded` 才记为 `projections-settled`，调用方不能自行声明 lifecycle。

## Coordinator 状态

每个已发布 commit 可独立跟踪四类投影：`worker / renderer / persistence / ui`。允许的恢复链为：

```text
pending → prepared / ready / degraded
prepared → ready / degraded
ready → degraded
degraded → retrying / resyncing
retrying → ready / degraded / resyncing
resyncing → ready / degraded
```

`degraded` 必须附原因。首次 settled 后仍允许真实资源丢失进入 degraded，再走 retry / resync；commit lifecycle 不倒退，canonical owner 不回滚。

## 专项证据

`regress:core-facade` 使用 getter-only 假 owner 回放：

- 完整七步 lifecycle；pre-commit `commitId` 分配为 `0`；
- facade 对 legacy revision / history 写调用均为 `0`；owner 替换后读取立即看到新引用，证明没有缓存第二 map；
- interactive 普通提交、headless 普通提交与 adoption 新 session / revision `0` 均复用第 349-3 的 revision validator；
- async borrow、根或嵌套 owner 逃逸、嵌套写入、读取期换 owner、source revision 漂移、重复 projection、非法 lifecycle 均拒绝；
- 并发 operation 不能重复认领同一次 owner/history 转换；rollback 后操作不可复活，且这些拒绝均不消耗 `commitId`；
- publish 前 canonical commit 可在 legacy 恢复后记为 rolled-back，不能再发布；
- publish 后 Worker degraded 不影响 revision / history，并可 `retrying → resyncing → ready`；已 ready renderer 也可因 context loss 进入 degraded 后恢复；
- 直接绕开 coordinator 提交非法状态跳跃或无原因 degraded 仍由 Core 拒绝；settled lifecycle 由 Core 根据完整集合自行判定；
- runtime 对两个 facade 模块的 import 为 `0`，本阶段没有路由接管。

## 验收口径

- `typecheck:core`、`regress:core-contracts`、`regress:core-manifests`、`regress:core-facade` 与 production build 均已通过；
- production build 保持 `1361 modules transformed`，构建模块分母不因 shadow facade 进入正式 import graph；
- `source/` 零改动，浏览器执行为 `0`；
- checkpoint 由同一只读评审智能体复核，只有 `ACCEPT` 才进入 notes 垂直切片 `349-6`。
