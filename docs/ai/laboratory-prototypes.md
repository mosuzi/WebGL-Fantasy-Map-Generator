# AI 操作独立实验室

本页规定 AI 如何选择和操作 `prototype/` 下的四个独立实验性页面。它是正式 AI 接手入口的补充，不把实验室变成隐蔽的地图写入渠道；目录、命令和正式关系以 [`../architecture/laboratory-prototypes.md`](../architecture/laboratory-prototypes.md) 为准。

## 先判断目标

1. 用户要处理当前地图、用户 Chrome 标签页、存档、导出、正式 UI 或公开 API 时，进入正式应用路由，读取 [`README.md`](./README.md) 与相关安全文档；不得以实验室替代正式地图。
2. 用户明确要复现或比较历史 WebGL cells、共享边界拓扑、加载画卷视觉、河网夹具 / 候选时，才进入相应实验室。
3. 用户只要求查看已经打开的 Chrome 页面时，先确认该标签页 URL；不得新开同名实验室页面冒充现有现场，也不得刷新或覆盖用户未保存的地图。

## 四个实验室的 AI 边界

AI 从正式控制面板“简介 → 实验室”进入时，应预期在新标签页打开相应实验室的在线预览；不得把当前正式地图页导航到实验室。具体预览链接见[实验室总览](../architecture/laboratory-prototypes.md)。

| 实验室 | AI 可以做什么 | AI 不得做什么 |
|---|---|---|
| `webgl-cells` | 用固定样本研究早期 WebGL2 渲染、图层、拾取和轻量编辑交互 | 把 demo 的内存编辑当作正式事务；导入、覆盖或保存用户地图；据此宣称正式功能已经支持 |
| `boundary-topology-lab` | 修改或运行固定夹具、候选比较和几何诊断；用结果指导另行批准的正式岸线任务 | 让页面写入正式地图、存档或编辑历史；把独立算法比较直接当作正式上线结论；忽略被正式岸线链复用的纯函数回归 |
| `loading-scroll-showcase` | 评审无网络资源的视觉、动效、错误态、静态终态与窄屏表现 | 将定时演示接到正式加载流程；把概念稿当作已发布的正式界面 |
| `river-network-lab` | 在内存快照上运行固定夹具、10k / 50k / 100k 对照、A/B 证据和浏览器页面验证 | 写正式地图、存档、历史、LocalStorage、云端或公开 API；使用私人地图 ID / 坐标充当固定夹具；把实验室 `formalGeneratorWrite: false` 误读为正式生成器未接入候选 |

## 执行次序

1. 读取本页、架构总览和目标目录 README，随后检查权威任务与工作树状态。
2. 复用目标实验室的固定夹具、启动命令和专项回归；不要随意改 seed、阈值或夹具名称来“做出通过”。
3. 若修改拓扑实验室中被正式岸线引用的纯函数，额外按正式岸线改动运行 `pnpm run regress:shoreline`；若修改目录清单、Vite 装配或路径，运行 `pnpm run regress:deployment` 与 `pnpm run regress:prototype-deployment-browser`。后者从静态产物打开边界、河流页面，确认固定用例和运行矩阵存在，且不再请求 `/app/webgl-generator/src/**`。
4. 若修改控制面板中的实验室导引，再运行 `pnpm run regress:laboratory-guide-browser`，验证四个中文菜单项、窄屏布局和新标签页 URL。
5. 结论必须区分夹具事实、实验推断和正式产品验收；需要正式接入时登记新的权威任务，单独覆盖兼容、渲染、浏览器与安全门。
6. 完成后同步目标 README、架构总览、本文及必要的部署说明；不要修改 `docs/wiki/`，除非用户另行明确授权。

## 快速命令

```powershell
pnpm run start:prototype
pnpm run start:boundary-topology-lab
pnpm run start:loading-scroll-showcase
pnpm run start:river-network-lab
pnpm run regress:boundary-topology-lab
pnpm run regress:loading-scroll-showcase
pnpm run regress:river-network-lab
pnpm run regress:river-network-lab-browser
pnpm run regress:deployment
pnpm run regress:prototype-deployment-browser
pnpm run regress:laboratory-guide-browser
```

上面的命令不应并行占用同一端口；只启动当前需要的页面。浏览器验证完成后，关闭由本次操作启动的实验室服务，保留用户已有服务和标签页。
