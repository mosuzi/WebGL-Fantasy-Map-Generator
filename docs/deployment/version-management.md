# 项目版本与快进合入

根 `package.json` 是唯一项目版本源，正式首页卷次继续由构建注入该字段。版本必须在任务分支的提交中准备完成；`main` 只快进接收已经携带版本的任务提交，不再为合入另建手工版本提交。

## 任务分支提交前

先同步远端引用，再准备版本：

```powershell
git fetch origin main
pnpm run version:prepare -- patch origin/main
```

`version:prepare` 严格读取当前工作树和 `origin/main` 的三段数字语义版本，取较高者后按指定级别递增，只写根 `package.json`：

- 普通修复、文档、测试、实验室和内部 checkpoint 使用 `patch`。
- 成组新能力或明显产品阶段升级评估使用 `minor`。
- 不兼容数据、API 或产品契约变化评估使用 `major`。

每次提交前只运行一次；任务分支已有更高版本时会继续从该版本递增，因此多个提交不会复用版本。

## 合入前

```powershell
git fetch origin main
pnpm run version:check -- origin/main
```

`version:check` 完全只读。当前版本等于或低于主线、版本格式非法、远端引用不可读时都会失败。通过后显式暂存授权文件并提交任务分支。

## 快进合入

```powershell
git switch main
git pull --ff-only origin main
git merge --ff-only <任务分支>
git push origin main
```

快进不会产生新的提交，所以不得在 `main` 再次运行 `version:prepare`。推送后用 `git merge-base --is-ancestor <完成提交> origin/main` 确认远端包含任务提交，再删除任务分支。

## 门禁

```powershell
pnpm run regress:project-version
```

专项覆盖严格版本格式、三种递增级别、任务分支领先、主线领先，以及版本相等或落后时的 fail-closed 校验。
