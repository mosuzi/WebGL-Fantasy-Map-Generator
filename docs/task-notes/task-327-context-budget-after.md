# 第 327 项上下文预算改造后报告

生成时间：2026-08-12T19:09:38.203Z

估算口径：中日韩字符按 1 token，其它非空白字符按 4 字符约 1 token；硬门以 UTF-8 字节数为准。

## 项目说明自动注入

| 任务路径 | 自动注入文件 | 累计字节 | 估算 token |
| --- | --- | ---: | ---: |
| `.` | `AGENTS.md` | 6464 | 1840 |
| `app/webgl-generator/src/runtime` | `AGENTS.md` | 6464 | 1840 |
| `app/webgl-generator/src/renderer` | `AGENTS.md` | 6464 | 1840 |
| `tools` | `AGENTS.md` | 6464 | 1840 |

硬门：根说明不超过 16384B，普通路径累计不超过 24576B。

## 通用 Skill

| Skill | 主入口字节 | 估算 token | 按需 reference 数 | SHA-256 前缀 |
| --- | ---: | ---: | ---: | --- |
| `run-lean-staged-delivery` | 4056 | 866 | 2 | `f3d0a96c4c49` |
| `four-officials-flow` | 4260 | 925 | 2 | `516c07c4278c` |

## 文档入口

- 默认读取链：已声明
- 当前固定顺序：已声明
- 第 327 项已归档 / 第 322 项已离开当前清单：是
- 开发日志入口：1516B
- 开发日志分卷索引：存在
- 阶段 handoff 模板：存在
- 入口相对链接：有效
