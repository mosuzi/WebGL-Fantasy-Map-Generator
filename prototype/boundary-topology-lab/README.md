# 共享边界拓扑实验室

这是第 128 项边界平滑调研的独立验证原型，用于比较不同简化 / 平滑算法能否在共享边界结构下保持地图拓扑。高风险用例会直接复用正式 renderer 的纯几何函数，但实验室不接入地图生成器、存档或编辑命令。

实验室页面本身始终隔离；不过 `shore-render-spike-filter.js`、`surface-correction.js` 与 `stress-analysis.js` 的纯函数已被正式岸线链和回归受控复用。修改这些文件时必须同时按正式岸线范围验证，不能把它们当作可随意试验的孤立代码。四个实验室的统一入口见 [`../../docs/architecture/laboratory-prototypes.md`](../../docs/architecture/laboratory-prototypes.md)，AI 边界见 [`../../docs/ai/laboratory-prototypes.md`](../../docs/ai/laboratory-prototypes.md)。

## 运行

```powershell
pnpm run start:boundary-topology-lab
```

打开 `http://127.0.0.1:5401/`。

专项回归：

```powershell
pnpm run regress:boundary-topology-lab
```

## 用例命名约定

- 用例名称必须直接概括可观察现象、拓扑条件或失效阶段，例如“岸线闭环首点漏检跨面描边针”。
- 不得使用地图中的国家、地区、城镇等具体地名作为用例名称；地名不能说明缺陷类型，也无法帮助读者判断验收目标。
- 真实地图来源、cell id、相机参数等追溯信息只写入描述、诊断或开发记录，不进入用例标题。

## 看懂对照视图

- 页面默认打开“三国交界”。有共享 `arc` 时，A 图显示逐区域独立处理，青色与红色细线分别表示共享边的两侧；黄色连接线标出两侧最大偏差，右上角同步显示局部放大。
- B 图显示共享弧线处理。绿色宽线只表示相邻区域复用了同一份弧线坐标，不表示当前案例已经通过；卡片右上角的“几何验收通过 / 失败”才是 B 图的验收状态。
- 没有共享 `arc` 的案例不再展示无意义的 A/B 独立处理对照：A 图自动切换为原始轮廓，B 图显示处理后轮廓。
- 三类带对象案例会在两图同时绘制城镇、道路、河流和锚定河口。城镇必须留在原陆区，道路不得穿岸入水，河流只能在末端入海且河口必须等于指定海岸 `ArcRef` 端点。
- 图下方的“当前验收与形状诊断”合并列出硬验收失败与形状提示。海岸面积 P95 / 双向 Hausdorff 超出参考值只显示黄色“仅提示”，不会把 B 图染红；国界 / 省界 Hausdorff 和推荐管线面积门槛仍是硬失败。“最大独立偏差”同时给出 `arcId` 和两侧区域。
- “运行全部用例”只刷新底部的全量用例汇总；候选算法出现失败是实验结果，不是界面故障。

## 验证范围

- 基础固定夹具覆盖单岛、带洞岛屿、狭窄海峡、湖海连接、三国交界、跨国省界、地图边界和无天然分叉节点闭环。
- 高风险固定夹具覆盖单 cell 闭环接缝、跨面描边针、视觉三角岛整环回退、填色—描边分离、过渡带翻面、正式 cell 三角化 / 顶点坍缩、实际底面与 XOR 补面基线漂移、Float32 像素相位、多环 XOR、局部回退拼接和 Earcut 安全失败。
- 七种候选：原始折线、Douglas-Peucker、Visvalingam、有限 Chaikin、Catmull-Rom、B-spline、推荐共享管线。
- 共享 `arcId`、正反 `ArcRef`、锁定节点、不可变快照、fill / stroke 同源。
- gap、overlap、自交、非法环、最大位移、海峡 / 湖海连通与案例专属约束。
- `single-island`、`narrow-strait`、`lake-sea-connection` 各含最小城镇、道路、河流 / 河口保护模型；坏 region / arc、非有限坐标、非海岸河口和对象越岸都会被拒绝。
- 海岸面积 / Hausdorff 进入结构化形状诊断；国界 / 省界保留分层硬门槛。

默认矩阵的实际数量和结果以页面底部及 `pnpm run regress:boundary-topology-lab` 输出为准；推荐共享管线必须通过全部固定夹具。
