# 独立实验室与原型说明

`prototype/` 保存可单独打开、可部署、但不等同于正式地图应用的实验性页面。它们用于保留可复现实验、历史性能基线或视觉评审；正式产品入口仍是 `app/webgl-generator/`。当前分母固定为四项，新增或删除目录前必须同步本页、各实验室 README、AI 路由、部署说明与对应回归。

## 选择入口

| 目标 | 应使用的入口 | 不应替代的对象 |
|---|---|---|
| 运行正式地图、编辑、存档、导出、公开 API 或用户现有地图 | `app/webgl-generator/`，默认 `http://127.0.0.1:5410/` | 任一 `prototype/` 页面 |
| 对照早期 WebGL2 渲染、主题切换、拾取或三种轻量编辑交互 | [`webgl-cells`](../../prototype/webgl-cells/README.md) | 正式编辑器或新生成链 |
| 研究共享边界的简化、平滑、环与岸线拓扑安全 | [`boundary-topology-lab`](../../prototype/boundary-topology-lab/README.md) | 正式地图、存档与编辑事务 |
| 评审画卷加载页的文字层级、动效和静态终态 | [`loading-scroll-showcase`](../../prototype/loading-scroll-showcase/README.md) | 正式加载生命周期 |
| 诊断河网父子关系、汇流显示曲线与水文安全门 | [`river-network-lab`](../../prototype/river-network-lab/README.md) | 用户地图、浏览器存储与公开 API |

这些页面会随一次正式构建静态装配到 `/prototype/<目录名>/`，但“可部署”不表示它们获得正式应用相同的写权限、兼容承诺或产品地位。

## 实验室清单

| 实验室 | 目标与数据 | 本地 / 部署入口 | 专项验证 | 与正式应用的关系 |
|---|---|---|---|---|
| `webgl-cells` | 以 `data/sample-map.json` 的固定快照对照 WebGL2 cells、图层、拾取、HTML/SVG overlay 及高度/河流/国家轻量编辑模型 | `pnpm run start:prototype` → `http://127.0.0.1:5400/`；`/prototype/webgl-cells/` | 无独立回归；以 `pnpm run regress:deployment` 确认静态入口与样本装配 | 历史 demo，不是正式运行时依赖，不得用它处理真实存档或替换正式编辑器 |
| `boundary-topology-lab` | 用不可变固定夹具比较边界算法，并验证共享弧、锁点、环、对象与岸线约束 | `pnpm run start:boundary-topology-lab` → `http://127.0.0.1:5401/`；`/prototype/boundary-topology-lab/` | `pnpm run regress:boundary-topology-lab`；改动受复用纯函数时还运行 `pnpm run regress:shoreline` | 页面自身不装配正式地图；但 `shore-render-spike-filter.js`、`surface-correction.js` 与 `stress-analysis.js` 的纯函数被正式岸线链和回归受控复用，修改它们视作正式岸线改动 |
| `loading-scroll-showcase` | 独立评审中国古代画卷加载页的文字、动效、错误态、静态终态与减少动态效果 | `pnpm run start:loading-scroll-showcase` → `http://127.0.0.1:5402/`；`/prototype/loading-scroll-showcase/` | `pnpm run regress:loading-scroll-showcase` | 仅视觉概念稿；不得把定时演示或评审控制接入正式加载生命周期，除非另有批准任务 |
| `river-network-lab` | 用固定夹具与只读 10k / 50k / 100k 快照审计父子 DAG、汇流曲线、水文单调和安全反例 | `pnpm run start:river-network-lab` → `http://127.0.0.1:5403/`；`/prototype/river-network-lab/` | `pnpm run regress:river-network-lab`；需要浏览器证据时再运行 `pnpm run regress:river-network-lab-browser` | 实验室页面只处理内存快照，不写地图、存档、历史、LocalStorage 或 API；候选算法已由正式共享模块提供，页面只作薄转发和证据展示 |

## 维护与验证

1. 先确认需求属于正式应用还是某个实验室；不要用实验室代替当前用户打开的正式地图。
2. 只修改目标目录、对应专项、必要的正式共享纯模块和本页明确列出的文档。涉及任何共享模块时，按正式产品范围评估旧数据、渲染与浏览器回归。
3. 固定夹具必须可复现且不含私人地图名称、对象 / cell ID、坐标、存档或截图。实验室结果是诊断或比较证据，不得伪装成用户地图实测。
4. 运行与改动面贴近的专项回归；改动 `prototype/` 清单、静态入口或构建装配时，再运行 `pnpm run regress:deployment`。文档改动至少运行链接核对、`pnpm run audit:ai-docs` 与 `git diff --check`。
5. 新增实验室前先在权威任务中冻结目的、隔离边界、固定数据、回归命令与部署影响；Vite 会自动枚举带 `index.html` 的直接子目录，不能靠遗漏文档把页面排除在部署之外。

## 与 AI 协作

AI 操作规则、目标选择和用户 Chrome 边界见 [`../ai/laboratory-prototypes.md`](../ai/laboratory-prototypes.md)。AI 在改动前应先读本页与目标实验室 README；涉及正式应用时还须回到 [`../ai/README.md`](../ai/README.md) 的正式 API / 安全路由。
