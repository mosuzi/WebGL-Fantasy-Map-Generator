# 第 327 项上下文预算改造前报告

生成时间：2026-08-12T18:52:14.492Z

估算口径：中日韩字符按 1 token，其它非空白字符按 4 字符约 1 token；硬门以 UTF-8 字节数为准。

## 项目说明自动注入

| 任务路径 | 自动注入文件 | 累计字节 | 估算 token |
| --- | --- | ---: | ---: |
| `.` | `AGENTS.md` | 59493 | 16630 |
| `app/webgl-generator/src/runtime` | `AGENTS.md` | 59493 | 16630 |
| `app/webgl-generator/src/renderer` | `AGENTS.md` | 59493 | 16630 |
| `tools` | `AGENTS.md` | 59493 | 16630 |

硬门：根说明不超过 16384B，普通路径累计不超过 24576B。

## 通用 Skill

| Skill | 主入口字节 | 估算 token | 按需 reference 数 |
| --- | ---: | ---: | ---: |
| `run-lean-staged-delivery` | 6609 | 1401 | 1 |
| `four-officials-flow` | 7728 | 1678 | 1 |

## 文档入口

- 默认读取链：未声明
- 当前固定顺序：已声明
- 开发日志入口：2770910B
- 开发日志分卷索引：不存在
- 阶段 handoff 模板：不存在
