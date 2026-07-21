# 共享边界拓扑实验室

这是第 128 项边界平滑调研的独立验证原型，用于比较不同简化 / 平滑算法能否在共享边界结构下保持地图拓扑。它不接入正式 WebGL renderer、地图生成器、存档或编辑命令。

## 运行

```powershell
pnpm run start:boundary-topology-lab
```

打开 `http://127.0.0.1:5401/`。

专项回归：

```powershell
pnpm run regress:boundary-topology-lab
```

## 验证范围

- 八类固定夹具：单岛、带洞岛屿、狭窄海峡、湖海连接、三国交界、跨国省界、地图边界、无天然分叉节点闭环。
- 七种候选：原始折线、Douglas-Peucker、Visvalingam、有限 Chaikin、Catmull-Rom、B-spline、推荐共享管线。
- 共享 `arcId`、正反 `ArcRef`、锁定节点、不可变快照、fill / stroke 同源。
- gap、overlap、自交、非法环、面积误差、双向 Hausdorff 与案例专属约束。

候选算法出现失败是实验结果，不是界面故障；推荐管线必须在默认参数下通过全部八类夹具。
