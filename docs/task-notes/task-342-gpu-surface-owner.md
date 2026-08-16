# 第 342 项：GPU surface 资源 owner 原子绑定

## 冻结契约

| 字段 | 内容 |
| --- | --- |
| 最终任务 | 阻断旧 / 新地图 surface 资源跨 owner 混装，纠正 GPU 高度量化跨越水陆阈值，并在用户原 100k 存档局部画面终验 |
| 当前阶段 | 完成并归档 |
| 最小验收 | 同长度跨 binding 混装 fail-closed；commit / rollback 成组恢复；原档四种显示组合无海上陆色块 |
| 非目标 | 不改存档、schema、地图数据、海岸算法、政治配色、公开 API、`source/` 或 15-cell 恢复 |
| 唯一写者 | 主线程；renderer surface owner / installer、既有专项、任务文档 |
| 独立角色 | 无 |
| 首个廉价门 | `node --check`、surface owner 与 prepared installer 专项 |
| 冻结门 | Worker / 旧档专项、生产构建、用户精确 Chrome 标签页局部截图 |
| checkpoint | `task-342-owner-contract` 工作树冻结点 |
| 投入产出 | 产品 `5` 文件、专项工具 `4` 文件、任务文档 `4` 文件；委派等待 `0` |

## 现场与不变量

- 原存档 checksum 为 `28eede3c`；数据层水陆身份与高度阈值不一致为 `0`，水 cell 携带国家身份为 `0`。
- 截图异常是无海岸描边的大块完整三角 / 多边形；15 个 Voronoi 恢复 cell 与 shore correction 均为局部小三角，不能解释该尺度。
- 像素与几何反查确认异常色为高度 `20` 的默认陆色 `#385745`，但对应 hard surface 几何属于合法水域 cell；原档存在 `19.5～19.99` 的水域高度，旧 GPU attribute 四舍五入把它们编码为 `20`，相邻水 cell 遂连成海上假岛链。
- 正式渲染不得再用 `floatLength / vertexCount / wordLength` 相等替代资源归属。surface base、cell correction、cell attribute 使用状态、CPU geometry 与 ranges 必须共享同一不可变 owner。
- owner 不一致时必须在清屏前 fail-closed，保留最后一帧并留下内部诊断；不能把错误组合提交给 WebGL。
- 最终浏览器验收必须接管用户原 `http://127.0.0.1:5410/?debug=1` 标签页并重新导入原存档；替代页面、新生成地图或全图缩略图均不能代替故障局部截图。

## 完成记录

- 阶段：owner 契约、原子安装与反例 — ACCEPT
- 冻结点：`task-342-owner-contract` 工作树冻结点
- 已完成：surface base / correction / CPU geometry / ranges / cell attribute 使用状态同 owner；owner 绑定 map identity、revision、长度与 ranges 指纹；prepared commit / rollback 成组恢复；draw 清屏前 fail-closed。
- 证据：surface base、prepared installer、render preparation、cell attribute、完整 Worker 专项和生产构建通过；prepared-installer 真实浏览器返回 `sameLengthRejected=true / previousFramePreserved=true / glError=0`，取消与 obsolete 均回滚。
- 首败归因：prepared-installer 浏览器旧指纹只读取 geometry buffer，漏掉已拆分的 color buffer，字节数恰差 `2×`；夹具改为重组正式 6-float source 后目标复验通过。
- 首次局部修正曾怀疑 `cells.c` 邻接缺口；刷新新构建并重导原档后色块仍在，故该未证明改动已撤回，没有作为交付内容保留。
- 最终根因修复：cell attribute 高度量化保持原始水陆侧，覆盖 `19.99 → 19` 与 `20.01 → 20` 的门槛反例；地图、存档、schema、海岸算法与政治配色不变。
- 原档浏览器终验：用户启用 Chrome 本地文件访问后，在精确 `http://127.0.0.1:5410/?debug=1` 标签页恢复 checksum `28eede3c`、`100000 / 43419` 原图；越浦—月溪外海的高度硬边界、高度平滑、国家平滑、国家硬边界四张局部截图均不再出现 `#385745` 海上块。
- 最终运行状态：加载追踪 `complete / 地图进入可交互状态`，页面无“启动失败”“接纳新地图失败”或 owner 错误；`states / 硬边界 / GPU 96.6万 / WebGL error 0`。

投入产出：产品 `5` 文件、专项工具 `4` 文件、任务文档 `4` 文件；委派等待 `0`。自动门、跨 owner 浏览器反例与原存档视觉终验均已形成。
