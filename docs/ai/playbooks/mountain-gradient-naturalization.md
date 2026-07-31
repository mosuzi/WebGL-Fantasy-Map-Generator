# Playbook：保持基本地形关系的山地高度自然化

1. 用高山 cells、自然地区或手工选区定义两个大陆的山地区域；保留海平面、主要山脊、盆地、山口、河源和沿海边界为硬约束。
2. `diagnoseTerrain` 查看 slope / roughness P90、abruptCells 与 roughCells；同时比较邻近平原，确认异常是局部尖刺还是整条山脉落差。
3. 不以降低所有峰值为目标。优先压低孤立尖刺、扩大过渡带、限制相邻最大高度差，并保持峰谷排序和分水岭连通。
4. 建议目标使用诊断给出的 `slopeP90AtMost`、`roughnessP90AtMost`，再加“主峰高度排序不变、海陆 cell 不变、主要河流出口不变”。
5. 浏览器写入候选应优先 `edit.height.inspectSelectionSmoothing`、range / terrain program inspector；执行后必须重建所需基础 / 下游派生，并复查河流、湖泊、路线、城市、政治与 checksum / history。

验收应同时检查统计和画面：高度梯度连续，山脊仍可辨识，丘陵—山地—高峰形成多级过渡，没有新孤岛、断河、跨海路线或被意外淹没的陆地。无头阶段只提供异常 cell 与目标，不修改高度。
