# 第 349-2 阶段：受限 TypeScript 工具链

> 状态：`ACCEPT`；同一只读评审智能体确认工具链、lock、配置边界和运行产物不变证据均无偏差。

## 1. 阶段交付

本阶段只建立后续核心契约所需的独立静态检查边界，不迁移业务实现，不改变 Vite 运行入口，也不让 TypeScript 扫描现有 JS：

- 开发依赖：`typescript ^7.0.2`；
- 根配置：`tsconfig.core.json`；
- 命令：`pnpm run typecheck:core`；
- 最小输入：`app/webgl-generator/src/core/typecheck-sentinel.ts`，没有被任何 runtime 或 build entry 导入。

TypeScript `7.0.2` 是实施时 package registry 的 stable `latest`，要求 Node `>=16.20.0`；仓库实测 Node `24.14.0` 满足约束。仓库继续固定使用既有 `pnpm 10.0.0`，没有顺手升级包管理器。

## 2. 配置边界

`tsconfig.core.json` 只 include：

- `app/webgl-generator/src/core/**/*.ts`；
- `app/webgl-generator/src/domains/**/*.ts`。

关键约束：

- `strict: true`；
- `noEmit: true`；
- `isolatedModules: true`；
- `verbatimModuleSyntax: true`；
- `moduleResolution: Bundler`；
- `allowJs: true / checkJs: false`；
- `types: []`，不隐式吸入宿主 ambient types。

`allowJs` 只允许后续 TS adapter 解析显式导入的 legacy JS；`checkJs: false` 保证本阶段不把旧 JS 变成类型整改范围。Vite 仍单独负责构建，`typecheck:core` 不被塞进 dev server 或每次 HMR。

## 3. 运行产物不变证据

在安装 TypeScript 和新增配置前，以 `0.5.6` 执行一次 production build；接入后临时仅把未提交的 package 版本字段切回同一 `0.5.6` 再构建。两次均转换 `1360` 个模块、输出 `98` 个文件，按相对路径、字节数和每文件 SHA-256 汇总得到同一摘要：

```text
F3C93DF43DDA6E48D54B722BA6D20BBF3D569D32DB1D38B6CB3B68A4BE598623
```

因此工具链本身没有改变正式运行产物。恢复阶段版本 `0.5.7` 后，内容寻址 chunk 名会因既有 `__FMG_APP_VERSION__ / __FMG_APP_BUILD_ID__` 注入级联变化，这属于仓库既有版本规则，不是 TS runtime 接线。

## 4. 文件与非目标

| 类别 | 变更 |
| --- | --- |
| 产品运行代码 | `0` |
| 非运行时 TS sentinel | `1` 文件 / `2` 行 |
| 工具代码 | `0` |
| 配置 / lock | `package.json`、`pnpm-lock.yaml`、`tsconfig.core.json` |
| 业务 JS / Vue | `0` |
| `source/` | `0` |
| 浏览器 | 未启动、未操作、未验收 |

本阶段不创建 identity、revision、snapshot、patch、commit 或 Worker DTO；这些严格留给 `349-3`。不新增 facade、Manifest、runtime validator、adapter 或领域迁移。

## 5. 验收门

- `pnpm install --frozen-lockfile`；
- `pnpm run typecheck:core`；
- `pnpm run build:app`；
- `tsc --showConfig` 证明 include 只命中 core sentinel，且 `checkJs` 为 `false`；
- 同版本 build aggregate digest 精确相同；
- package / lock 一致、`git diff --check`、禁区检查；
- 同一只读评审智能体 `ACCEPT` 后才进入 `349-3`。
