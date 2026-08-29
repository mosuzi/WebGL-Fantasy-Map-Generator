# 第 372 项：任务分支版本准备与快进合入门禁

## 问题

仓库已经要求每次提交递增根版本，但此前只有文字约束。任务分支合入时容易出现两种风险：忘记在任务提交中更新版本，或快进完成后又在 `main` 手工补一个版本提交，破坏“任务提交就是可发布状态”的边界。

## 冻结设计

- `version:prepare -- <patch|minor|major> <base-ref>` 比较工作树版本和指定主线版本，取较高者后递增，只写 `package.json`。
- `version:check -- <base-ref>` 只读验证当前版本严格高于主线；相等、落后、格式非法或 ref 不可读全部失败。
- 命令不执行 fetch、commit、merge、push 或分支删除；Git 状态变化继续由操作者显式完成。
- 版本始终在任务分支提交内；`main` 只接受 `--ff-only`，因此合入后不再改版本。

## 验收

- 纯函数专项覆盖严格三段数字版本、比较、patch / minor / major、当前领先、主线领先和失败校验。
- 本任务必须实际用 `version:prepare` 从 `0.5.83` 产生下一版本，并用 `version:check origin/main` 通过。
- 完成提交快进进入远端 `main` 后，`package.json` 必须与任务提交逐字节相同，不产生主线补版本提交。

## 完成证据

- 真实相等版本 `0.5.83 / 0.5.83` 被 `version:check` 拒绝；随后 `version:prepare -- patch origin/main` 生成 `0.5.84`，再次检查为 `ahead = true`。
- 隔离 Git 专项覆盖工作树领先、主线领先、patch / minor / major、非法版本 / 级别、相等 / 落后与不可越过的唯一 `package.json` 写集；`regress:project-version` 通过。
- `v0.5.84` production build 为 `1408 modules transformed`。正式应用源、构建注入、存档与 API 均未修改。
