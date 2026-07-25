const point = (x, y) => [x, y];
const ref = (arcId, reversed = false) => ({arcId, reversed});

function arc(id, points, options = {}) {
  return {id, points, closed: false, ...options};
}

function region(id, name, fill, rings, options = {}) {
  return {id, name, fill, rings, ...options};
}

const singleIsland = {
  id: "single-island",
  name: "单岛",
  category: "coast",
  description: "检验孤立海岸闭环能否在简化后保持轮廓、闭合与方向。",
  arcs: [
    arc("coast", [point(55, 116), point(67, 72), point(105, 48), point(149, 55), point(184, 39), point(235, 64), point(266, 105), point(249, 151), point(206, 180), point(151, 171), point(105, 184), point(69, 157), point(55, 116)], {closed: true, kind: "coast"})
  ],
  regions: [region("island", "孤岛", "#b8ad7d", [[ref("coast")]])],
  protectedObjects: {
    towns: [{id: "island-town", name: "临潮镇", regionId: "island", point: point(78, 126)}],
    roads: [{id: "island-road", name: "环岛路", regionId: "island", points: [point(82, 137), point(118, 151), point(158, 151), point(193, 139)]}],
    rivers: [{
      id: "island-river",
      name: "西溪",
      regionId: "island",
      points: [point(143, 104), point(111, 112), point(80, 117), point(55, 116)],
      mouth: {arcId: "coast", endpoint: "start"}
    }]
  }
};

const singleCellSeamSpike = {
  id: "single-cell-seam-spike",
  name: "单 cell 闭环接缝毛刺",
  category: "coast-seam",
  description: "原样复刻独立单 cell 岛屿靠近大陆时，闭环首点被硬锁而残留尖角的案例；检验修复不受附近大陆影响。",
  arcs: [
    arc("single-cell-coast", [
      point(210, 52),
      point(221, 91),
      point(211, 125),
      point(178, 143),
      point(139, 136),
      point(112, 109),
      point(128, 72),
      point(164, 52),
      point(210, 52)
    ], {closed: true, kind: "coast"}),
    arc("nearby-mainland", [
      point(28, 174),
      point(82, 161),
      point(126, 173),
      point(163, 164),
      point(203, 176),
      point(248, 159),
      point(294, 174),
      point(294, 218),
      point(28, 218),
      point(28, 174)
    ], {closed: true, kind: "coast"})
  ],
  regions: [
    region("single-cell-island", "单 cell 孤岛", "#b7d7a8", [[ref("single-cell-coast")]]),
    region("mainland", "附近大陆", "#b7d7a8", [[ref("nearby-mainland")]])
  ]
};

const islandWithHole = {
  id: "island-with-hole",
  name: "带洞岛屿",
  category: "ring",
  description: "检验外环与湖泊内环的闭合、方向和洞结构不会被平滑吞并。",
  arcs: [
    arc("outer", [point(42, 121), point(55, 72), point(94, 42), point(151, 49), point(199, 35), point(260, 72), point(276, 126), point(250, 175), point(194, 189), point(141, 175), point(89, 190), point(52, 161), point(42, 121)], {closed: true, kind: "coast"}),
    arc("lake", [point(119, 111), point(135, 84), point(175, 78), point(203, 99), point(198, 132), point(168, 151), point(133, 140), point(119, 111)], {closed: true, kind: "lake"})
  ],
  regions: [region("island", "环湖岛", "#b7aa75", [[ref("outer")], [ref("lake", true)]])]
};

const narrowStrait = {
  id: "narrow-strait",
  name: "狭窄海峡",
  category: "clearance",
  description: "检验最大位移约束是否保住两岸之间的窄水道。",
  arcs: [
    arc("west-coast", [point(20, 38), point(115, 35), point(126, 66), point(115, 96), point(127, 127), point(113, 158), point(122, 190), point(20, 188), point(20, 38)], {closed: true, kind: "coast"}),
    arc("east-coast", [point(300, 34), point(171, 36), point(160, 66), point(173, 98), point(159, 128), point(174, 159), point(164, 190), point(300, 188), point(300, 34)], {closed: true, kind: "coast"})
  ],
  regions: [
    region("west", "西岸", "#9fa97e", [[ref("west-coast")]]),
    region("east", "东岸", "#c0a97d", [[ref("east-coast")]])
  ],
  protectedObjects: {
    towns: [{id: "strait-town", name: "峡西镇", regionId: "west", point: point(92, 99)}],
    roads: [{id: "strait-road", name: "西岸驿道", regionId: "west", points: [point(48, 72), point(77, 84), point(96, 105), point(76, 136)]}],
    rivers: [{
      id: "strait-river",
      name: "北湾河",
      regionId: "west",
      points: [point(66, 68), point(48, 57), point(32, 46), point(20, 38)],
      mouth: {arcId: "west-coast", endpoint: "start"}
    }]
  }
};

const lakeSeaConnection = {
  id: "lake-sea-connection",
  name: "湖海连接",
  category: "connectivity",
  description: "检验狭窄入海口在平滑后仍连通，不会被闭合或自交。",
  requirements: {minimumChannelDepth: 76, minimumChannelLength: 212, basinDepth: 64, minimumBasinPoints: 2},
  arcs: [
    arc("outer-east", [point(24, 35), point(296, 35), point(296, 190), point(193, 190)], {kind: "coast"}),
    arc("locked-mouth", [point(193, 190), point(193, 151), point(211, 136), point(209, 92), point(187, 72), point(156, 75), point(135, 98), point(137, 133), point(151, 151), point(151, 190)], {kind: "coast", mouth: true}),
    arc("outer-west", [point(151, 190), point(24, 190), point(24, 35)], {kind: "coast"})
  ],
  regions: [region("land", "潟湖海岸", "#b8ae83", [[ref("outer-east"), ref("locked-mouth"), ref("outer-west")]])],
  protectedObjects: {
    towns: [{id: "lagoon-town", name: "潟湖镇", regionId: "land", point: point(230, 150)}],
    roads: [{id: "lagoon-road", name: "东岸路", regionId: "land", points: [point(226, 119), point(250, 137), point(267, 161), point(274, 180)]}],
    rivers: [{
      id: "lagoon-river",
      name: "东湾河",
      regionId: "land",
      points: [point(250, 151), point(230, 168), point(209, 183), point(193, 190)],
      mouth: {arcId: "locked-mouth", endpoint: "start"}
    }]
  }
};

const triStateJunction = {
  id: "tri-state-junction",
  name: "三国交界",
  category: "junction",
  description: "三条共享国界必须在同一个锁定节点汇合，不能形成针孔。",
  arcs: [
    arc("top-left", [point(24, 24), point(160, 24)], {kind: "frame"}),
    arc("top-right", [point(160, 24), point(296, 24)], {kind: "frame"}),
    arc("right", [point(296, 24), point(296, 196)], {kind: "frame"}),
    arc("bottom-right", [point(296, 196), point(160, 196)], {kind: "frame"}),
    arc("bottom-left", [point(160, 196), point(24, 196)], {kind: "frame"}),
    arc("left", [point(24, 196), point(24, 24)], {kind: "frame"}),
    arc("north-border", [point(160, 24), point(153, 58), point(166, 83), point(160, 110)], {kind: "state"}),
    arc("southwest-border", [point(24, 196), point(70, 170), point(111, 146), point(160, 110)], {kind: "state"}),
    arc("southeast-border", [point(160, 110), point(205, 135), point(244, 168), point(296, 196)], {kind: "state"})
  ],
  regions: [
    region("northwest", "北境", "#9ab2a0", [[ref("top-left"), ref("north-border"), ref("southwest-border", true), ref("left")]]),
    region("northeast", "东境", "#c1a079", [[ref("top-right"), ref("right"), ref("southeast-border", true), ref("north-border", true)]]),
    region("south", "南境", "#b69aaa", [[ref("southwest-border"), ref("southeast-border"), ref("bottom-right"), ref("bottom-left")]])
  ]
};

const crossStateProvince = {
  id: "cross-state-province",
  name: "跨国省界",
  category: "hierarchy",
  description: "省界抵达国界时必须复用并锁定国界节点，不能越境或错位。",
  arcs: [
    arc("top-west", [point(24, 24), point(160, 24)], {kind: "frame"}),
    arc("top-east", [point(160, 24), point(296, 24)], {kind: "frame"}),
    arc("right-north", [point(296, 24), point(296, 110)], {kind: "frame"}),
    arc("right-south", [point(296, 110), point(296, 196)], {kind: "frame"}),
    arc("bottom-east", [point(296, 196), point(160, 196)], {kind: "frame"}),
    arc("bottom-west", [point(160, 196), point(24, 196)], {kind: "frame"}),
    arc("left-south", [point(24, 196), point(24, 110)], {kind: "frame"}),
    arc("left-north", [point(24, 110), point(24, 24)], {kind: "frame"}),
    arc("state-north", [point(160, 24), point(154, 55), point(165, 82), point(160, 110)], {kind: "state"}),
    arc("state-south", [point(160, 110), point(153, 138), point(165, 167), point(160, 196)], {kind: "state"}),
    arc("province-west", [point(24, 110), point(68, 104), point(112, 116), point(160, 110)], {kind: "province"}),
    arc("province-east", [point(160, 110), point(205, 104), point(248, 116), point(296, 110)], {kind: "province"})
  ],
  regions: [
    region("wa", "西国北省", "#91aa8d", [[ref("top-west"), ref("state-north"), ref("province-west", true), ref("left-north")]], {state: "west"}),
    region("wb", "西国南省", "#aaba96", [[ref("province-west"), ref("state-south"), ref("bottom-west"), ref("left-south")]], {state: "west"}),
    region("ea", "东国北省", "#c49c77", [[ref("top-east"), ref("right-north"), ref("province-east", true), ref("state-north", true)]], {state: "east"}),
    region("eb", "东国南省", "#d4ad87", [[ref("province-east"), ref("right-south"), ref("bottom-east"), ref("state-south", true)]], {state: "east"})
  ]
};

const mapBoundary = {
  id: "map-boundary",
  name: "地图边界",
  category: "frame",
  description: "检验贴图框端点绝不漂移，边界区域仍保持有效闭环。",
  arcs: [
    arc("top-left", [point(0, 0), point(160, 0)], {kind: "frame"}), arc("top-right", [point(160, 0), point(320, 0)], {kind: "frame"}),
    arc("right", [point(320, 0), point(320, 220)], {kind: "frame"}), arc("bottom-right", [point(320, 220), point(160, 220)], {kind: "frame"}),
    arc("bottom-left", [point(160, 220), point(0, 220)], {kind: "frame"}), arc("left", [point(0, 220), point(0, 0)], {kind: "frame"}),
    arc("shared", [point(160, 0), point(149, 42), point(170, 78), point(151, 116), point(169, 158), point(160, 220)], {kind: "state"})
  ],
  regions: [
    region("west", "西缘", "#9bb094", [[ref("top-left"), ref("shared"), ref("bottom-left"), ref("left")]]),
    region("east", "东缘", "#c5a17d", [[ref("top-right"), ref("right"), ref("bottom-right"), ref("shared", true)]])
  ]
};

const closedLoop = {
  id: "closed-loop",
  name: "无天然分叉节点闭环",
  category: "closed-loop",
  description: "没有天然分叉点的环必须建立稳定锚点，并在所有算法下保持闭合。",
  arcs: [arc("stable-loop", [point(52, 112), point(65, 65), point(112, 43), point(162, 52), point(207, 41), point(260, 72), point(274, 120), point(247, 169), point(199, 184), point(151, 171), point(102, 187), point(63, 158), point(52, 112)], {closed: true, kind: "coast", syntheticAnchor: true})],
  regions: [region("loop", "闭环", "#b1a77e", [[ref("stable-loop")]])]
};

const coastFillStrokeSeparation = {
  id: "coast-fill-stroke-separation",
  name: "海岸填色—描边分离",
  category: "surface-parity",
  description: "以深窄凹湾复现原始填色未随平滑海岸移动时的外露楔形，并验证最终填色与描边必须共用同一快照。",
  arcs: [
    arc("saw-bay", [
      point(20, 20), point(300, 20), point(300, 200),
      point(230, 200), point(210, 45), point(190, 200),
      point(170, 45), point(150, 200), point(130, 45),
      point(110, 200), point(20, 200), point(20, 20)
    ], {closed: true, kind: "coast"})
  ],
  regions: [region("saw-land", "锯齿凹湾陆地", "#b69f72", [[ref("saw-bay")]])],
  surfaceComparison: {
    bounds: {minX: 40, minY: 30, maxX: 280, maxY: 205},
    sampleStep: 1,
    legacyRepairRadius: 0.5,
    minimumLegacyMismatchSamples: 30,
    correctionMode: "exact-polygon-xor"
  }
};

const coastBandTriangleFlip = {
  id: "coast-band-triangle-flip",
  name: "海岸过渡带翻面",
  category: "surface-triangulation",
  description: "固定法向急转反例：旧门禁认为两条外缘安全，但实际提交 GPU 的四个三角面中有一个反向，形成跨海岸的大三角扇。",
  arcs: [
    arc("frame", [
      point(24, 24), point(296, 24), point(296, 196),
      point(24, 196), point(24, 24)
    ], {closed: true, kind: "coast"})
  ],
  regions: [region("water", "对照底图", "#5f91c2", [[ref("frame")]])],
  bandTriangleComparison: {
    centerA: point(140, 100),
    centerB: point(132.6, 125.9),
    landA: point(147.4, 60.7),
    landB: point(111.4, 120),
    waterA: point(132.6, 139.3),
    waterB: point(153.8, 131.8),
    finalTriangles: []
  }
};

const coastXorSubpixelNeedle = {
  id: "coast-xor-subpixel-needle",
  name: "正式单元填色扇越界",
  category: "surface-triangulation",
  description: "直接使用 stage-2-1 / 10k 正式地图的 cell #1061 与 #8832 顶点，复现中心扇形跨出凹多边形造成的水色、陆色长针，并验证边界 Earcut 三角化归零。",
  arcs: [
    arc("frame", [
      point(24, 24), point(296, 24), point(296, 196),
      point(24, 196), point(24, 24)
    ], {closed: true, kind: "coast"})
  ],
  regions: [region("water", "对照底图", "#5f91c2", [[ref("frame")]])],
  cellFanComparison: {
    source: {
      seed: "stage-2-1",
      cellsTarget: 10000,
      renderer: "cell-visual-layer"
    },
    cases: [
      {
        id: "formal-cell-1061",
        cell: 1061,
        side: "water",
        height: 19,
        center: point(1003.52, 105.03),
        neighborHeights: [21, 19, 18, 17, 17, 17, 19, 21],
        points: [
          point(994, 105),
          point(994.7385389021487, 103.0239574118273),
          point(995.4052055688152, 101.0239574118273),
          point(996, 99),
          point(997.358785755951, 98.76847635713719),
          point(998.6921190892842, 98.43514302380385),
          point(1000, 98),
          point(1002.6666666666667, 98.2275264000351),
          point(1005.3333333333334, 98.22752640003509),
          point(1008, 98),
          point(1009.1283013995217, 99.2371072836921),
          point(1010.1283013995218, 100.57044061702544),
          point(1011, 102),
          point(1010.7213412273, 102.69400394698329),
          point(1010.3880078939667, 103.36067061364996),
          point(1010, 104),
          point(1005.2715661987794, 104.71175337208135),
          point(1000.6048995321127, 105.71175337208133),
          point(996, 107),
          point(995.3052078207161, 106.36145884595058),
          point(994.6385411540494, 105.69479217928392)
        ],
        expectedLegacyLeaks: 2
      },
      {
        id: "formal-cell-8832",
        cell: 8832,
        side: "land",
        height: 20,
        center: point(572.51, 857.58),
        neighborHeights: [19, 21, 19, 19, 20],
        points: [
          point(574, 848),
          point(575.6942989102706, 850.6493965144143),
          point(577.3609655769371, 853.3160631810808),
          point(579, 856),
          point(573.6541214304789, 857.2831523885825),
          point(568.3207880971456, 858.6164857219159),
          point(563, 860),
          point(563.0012170026295, 859.3333333333335),
          point(563.0012170026296, 858.6666666666669),
          point(563, 858),
          point(565.6475350832031, 854.9829941480326),
          point(568.3142017498698, 851.9829941480325),
          point(571, 849),
          point(571.9992531159999, 848.6644260146663),
          point(572.999253116, 848.3310926813332)
        ],
        expectedLegacyLeaks: 3
      }
    ]
  }
};

const coastVoronoiVertexCollapse = {
  id: "coast-voronoi-vertex-collapse",
  name: "正式 Voronoi 顶点坍缩",
  category: "surface-precision",
  description: "原样固定当前 stage-2-1 / 10k 地图的 cell #6255 与 #6378：两个不同 Voronoi 顶点都被存成 [397,608]，使同为水面的共享边退化成单点；最终路径从 vertices.c 与 grid.points 回算精确端点，恢复约 1 CSS px 的连续填色。",
  arcs: [
    arc("frame", [
      point(24, 24), point(296, 24), point(296, 196),
      point(24, 196), point(24, 24)
    ], {closed: true, kind: "coast"})
  ],
  regions: [region("land", "对照底图", "#bde7ef", [[ref("frame")]])],
  vertexCollapseComparison: {
    source: {
      seed: "stage-2-1",
      cellsTarget: 10000,
      cells: [6255, 6378],
      vertices: [5331, 5519],
      cameraScale: 12
    },
    storedEdge: [point(397, 608), point(397, 608)],
    resolvedEdge: [
      point(397.1586584325404, 608.2544910966592),
      point(397.03568309391176, 608.3210877997307)
    ],
    projection: {xCssPerWorld: 5.76687116564417, yCssPerWorld: 10.424242424242424},
    cells: [
      {
        cell: 6255,
        side: "water",
        height: 15,
        center: point(395.04, 600.53),
        vertexIds: [5331, 5519, 5527, 5694, 5398, 5399],
        storedPoints: [point(397, 608), point(397, 608), point(389, 609), point(389, 608), point(395, 592), point(398, 591)]
      },
      {
        cell: 6378,
        side: "water",
        height: 14,
        center: point(402.47, 614.25),
        vertexIds: [5189, 5400, 5418, 5519, 5331, 5329],
        storedPoints: [point(410, 615), point(407, 623), point(403, 624), point(397, 608), point(397, 608), point(405, 607)]
      },
      {
        cell: 6256,
        side: "land",
        height: 21,
        center: point(400.72, 601.08),
        vertexIds: [4924, 4972, 5329, 5331, 5399],
        storedPoints: [point(400, 590), point(407, 602), point(405, 607), point(397, 608), point(398, 591)]
      },
      {
        cell: 6377,
        side: "land",
        height: 26,
        center: point(397.28, 616.36),
        vertexIds: [5418, 5691, 5790, 5832, 5834, 5527, 5519],
        storedPoints: [point(403, 624), point(401, 625), point(392, 623), point(386, 616), point(386, 612), point(389, 609), point(397, 608)]
      }
    ]
  }
};

const coastPixelParityResiduals = {
  id: "coast-pixel-parity-residuals",
  name: "正式近景长针与浅边",
  category: "surface-pixel-parity",
  description: "原样固定用户第五次截图的两处正式几何：湖岸 #6496/#6617 的完整补水面在新旧边缘采用同坐标时仍会露出陆色像素针，海岸 #6377/#6378 的 0.42 世界单位描边在当前相机下膨胀成宽浅色带。",
  arcs: [
    arc("frame", [
      point(24, 24), point(296, 24), point(296, 196),
      point(24, 196), point(24, 24)
    ], {closed: true, kind: "coast"})
  ],
  regions: [region("water", "截图水面", "#5f91c2", [[ref("frame")]])],
  pixelParityComparison: {
    source: {
      seed: "stage-2-1",
      cellsTarget: 10000,
      screenshot: "codex-clipboard-436de10e-e65c-4516-b879-d3437d017612.png"
    },
    projection: {
      xCssPerWorld: 16.47937136814729,
      yCssPerWorld: 11.90181531621419
    },
    lakeNeedle: {
      landCell: 6496,
      waterCell: 6617,
      side: "water",
      oldBoundary: [point(349, 635), point(351, 643), point(351, 645)],
      correctionTriangle: [
        point(351, 643),
        point(352.5, 634),
        point(352.5, 635)
      ],
      renderBoundaryEdge: [point(352.5, 635), point(351, 645)],
      altitudeWorld: 0.1643989873053573,
      legacyBoundaryCoverWorld: 0,
      finalBoundaryCoverWorld: 0.18
    },
    coastStroke: {
      landCell: 6377,
      waterCell: 6378,
      segment: [
        point(397.03568309391176, 608.3210877997307),
        point(403, 624)
      ],
      legacyWidthWorld: 0.42,
      finalWidthWorld: 0.09,
      maximumFinalCssWidth: 1.5
    }
  }
};

function stressFixture(id, name, category, description, stressComparison) {
  const frameId = `${id}-frame`;
  return {
    id,
    name,
    category,
    description,
    arcs: [arc(frameId, [
      point(24, 24), point(296, 24), point(296, 196),
      point(24, 196), point(24, 24)
    ], {closed: true, kind: "coast"})],
    regions: [region(`${id}-region`, "高风险定位画布", "#b8ad7d", [[ref(frameId)]])],
    stressComparison
  };
}

const coastDrawPacketPhaseMatrix = stressFixture(
  "coast-draw-packet-phase-matrix",
  "Float32 像素相位矩阵",
  "surface-phase-matrix",
  "以固定 raw/render 岸线重放 Float32 修正面与封口面，覆盖 DPR 1/1.5/2、三档 zoom、非等比投影和四组亚像素偏移，并显示最终值与破坏反例的最坏相位位置。",
  {
    kind: "phase-matrix",
    sourceRings: [[
      point(0, 0), point(12, 0.12), point(24, 0), point(28, 8), point(24, 16),
      point(14, 15.92), point(8, 13), point(0, 16), point(-2, 8), point(0, 0)
    ]],
    baseRings: [[
      point(0, 0.06), point(12, 0.18), point(24, 0.06), point(28, 8), point(24, 16),
      point(14, 15.92), point(8, 13), point(0, 16), point(-2, 8), point(0, 0.06)
    ]],
    renderRings: [[
      point(0, -0.25), point(12, -0.22), point(24, -0.25), point(28, 8), point(24, 16),
      point(14, 15.92), point(8, 13), point(0, 16), point(-2, 8), point(0, -0.25)
    ]]
  }
);

const coastMultiRingXorCompound = stressFixture(
  "coast-multiring-xor-compound",
  "多环 XOR 复合海岸",
  "surface-multiring",
  "同一固定输入同时包含外海岸、湖洞、狭窄水道与强凹角，实际执行 polygon XOR 和 Earcut，并定位洞、水道、连通性与错侧覆盖。",
  {
    kind: "multi-ring",
    sourceRings: [
      [point(0, 0), point(32, 0), point(32, 22), point(20, 22), point(20, 14), point(12, 14), point(12, 22), point(0, 22), point(0, 0)],
      [point(4, 4), point(10, 4), point(10, 10), point(4, 10), point(4, 4)]
    ],
    baseRings: [
      [point(0, 0.06), point(32, 0.06), point(32, 22), point(20, 22), point(20, 14), point(12, 14), point(12, 22), point(0, 22), point(0, 0.06)],
      [point(4, 4), point(10, 4), point(10, 10), point(4, 10), point(4, 4)]
    ],
    renderRings: [
      [point(0, -0.25), point(32, -0.25), point(32, 22), point(20, 22), point(20, 14), point(12, 14), point(12, 22), point(0, 22), point(0, -0.25)],
      [point(4.2, 4.1), point(9.8, 4.2), point(9.9, 9.8), point(4.1, 9.9), point(4.2, 4.1)]
    ],
    probes: [
      {kind: "hole", label: "湖洞中心", point: point(7, 7)},
      {kind: "channel", label: "狭窄水道", point: point(16, 19)},
      {kind: "land", label: "凹角内陆", point: point(16, 8)}
    ]
  }
);

const coastFallbackSpliceProtected = stressFixture(
  "coast-fallback-splice-protected",
  "平滑/回退拼接保护",
  "fallback-splice",
  "固定平滑段与原始回退段的共享端点、方向、canonical cell，并同时核验城镇、道路与河口；破坏端点后显示缝隙距离和回折段。",
  {
    kind: "fallback-splice",
    smoothSegment: [point(0, 0), point(4, 0), point(8, 2)],
    rawFallbackSegment: [point(8, 2), point(12, 2), point(16, 0)],
    sourceLandCells: [101, 102, 103, 104, 105],
    stitchedLandCells: [101, 102, 103, 104, 105],
    sourceWaterCells: [201, 202, 203, 204, 205],
    stitchedWaterCells: [201, 202, 203, 204, 205],
    protectedDistance: 1,
    protected: {
      towns: [point(8, 2.5)],
      roads: [[point(12, 0), point(12, 4)]],
      rivers: [[point(16, -4), point(16, 0)]]
    }
  }
);

const cellEarcutSafeFailure = stressFixture(
  "cell-earcut-safe-failure",
  "Earcut 安全失败",
  "cell-triangulation-safety",
  "固定重复点、极短边、强凹 cell 与平滑后自交输入；平滑 Earcut 失败必须切换到同一 cell 的安全硬边界并完整填面，旧中心扇形作为破坏对照。",
  {
    kind: "earcut-safe-failure",
    duplicateMicroBoundary: [point(0, 0), point(8, 0), point(8, 0.000000001), point(8, 8), point(4, 4), point(0, 8), point(0, 8), point(0, 0)],
    concaveBoundary: [point(0, 0), point(10, 0), point(10, 10), point(7, 10), point(7, 3), point(3, 3), point(3, 10), point(0, 10)],
    concaveLegacyCenter: point(5, 8),
    irreparableBoundary: [point(0, 0), point(8, 8), point(0, 8), point(8, 0)],
    hardBoundary: [point(0, 0), point(8, 0), point(8, 8), point(0, 8)],
    hardCenter: point(4, 4)
  }
);

export const FIXTURES = Object.freeze([
  singleIsland,
  singleCellSeamSpike,
  islandWithHole,
  narrowStrait,
  lakeSeaConnection,
  triStateJunction,
  crossStateProvince,
  mapBoundary,
  closedLoop,
  coastFillStrokeSeparation,
  coastBandTriangleFlip,
  coastXorSubpixelNeedle,
  coastVoronoiVertexCollapse,
  coastPixelParityResiduals,
  coastDrawPacketPhaseMatrix,
  coastMultiRingXorCompound,
  coastFallbackSpliceProtected,
  cellEarcutSafeFailure
].map(fixture => Object.freeze(fixture)));

export const FIXTURE_BY_ID = new Map(FIXTURES.map(fixture => [fixture.id, fixture]));

export function cloneFixture(fixture) {
  return structuredClone(fixture);
}
