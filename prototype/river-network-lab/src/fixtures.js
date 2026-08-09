const point = (x, y) => [x, y];

function river(id, points, cells, options = {}) {
  const length = points.slice(1).reduce((total, current, index) => total + distance(current, points[index]), 0);
  return {
    id,
    name: options.name || id,
    points,
    cells,
    parent: options.parent || 0,
    discharge: options.discharge ?? 10,
    flux: options.flux ?? options.discharge ?? 10,
    width: options.width ?? 0.12,
    length: options.length ?? Number(length.toFixed(2)),
    outletKind: options.outletKind || "internal",
    ...options
  };
}

const FIXTURES = [
  {
    id: "isolated-thin-fragment",
    name: "孤立离散细线",
    category: "fragment",
    description: "单独的短细线没有形成可解释的河段，作为最小视觉碎片夹具。",
    rivers: [river(1, [point(54, 72), point(67, 73)], [11], {width: 0.01, discharge: 1})],
    expectedIssueIds: ["thin-fragment"],
    acceptance: acceptance({"thin-fragment": 1})
  },
  {
    id: "tributary-unattached",
    name: "支流未接入干流",
    category: "confluence",
    description: "子河流声明了父河流，显示河口超过旧固定阈值但仍处于局部安全容差内，候选应以三次曲线接入干流。",
    metadata: {gridSpacing: 4},
    rivers: [
      river(1, [point(42, 110), point(290, 110)], [1, 2, 3], {discharge: 30, width: 0.3}),
      river(2, [point(90, 34), point(95, 94)], [8, 9], {parent: 1, discharge: 5, width: 0.08})
    ],
    expectedIssueIds: ["tributary-unattached"],
    acceptance: acceptance({"thin-fragment": 2, "tributary-unattached": 1})
  },
  {
    id: "tributary-over-parent",
    name: "支流超过干流",
    category: "confluence",
    description: "子河流的流量和宽度同时超过接收干流，固定为守恒与视觉宽度门禁反例。",
    rivers: [
      river(1, [point(40, 112), point(280, 112)], [1, 2, 3], {discharge: 20, width: 0.2}),
      river(2, [point(90, 35), point(140, 112)], [8, 9], {parent: 1, discharge: 35, width: 0.45})
    ],
    expectedIssueIds: ["tributary-discharge-over-parent", "tributary-width-over-parent"],
    acceptance: acceptance({"thin-fragment": 2, "tributary-discharge-over-parent": 1, "tributary-width-over-parent": 1, "valid-confluence": 1})
  },
  {
    id: "parent-cycle",
    name: "河流关系循环",
    category: "graph",
    description: "两条河流互相声明父级，固定验证网络关系图的环检测。",
    rivers: [
      river(1, [point(48, 80), point(150, 120)], [1, 2], {parent: 2}),
      river(2, [point(150, 120), point(270, 80)], [3, 4], {parent: 1})
    ],
    expectedIssueIds: ["parent-cycle"],
    acceptance: acceptance({"parent-cycle": 1, "thin-fragment": 2, "tributary-unattached": 1, "valid-confluence": 1}, {
      dag: rejected("parent-graph-rejected"),
      confluence: rejected("parent-graph-rejected"),
      hydrology: rejected("parent-graph-rejected")
    })
  },
  {
    id: "valid-confluence",
    name: "合法汇流",
    category: "confluence",
    description: "支流末端准确落在干流上，作为后续几何算法的正例基线。",
    rivers: [
      river(1, [point(35, 120), point(150, 120), point(285, 120)], [1, 2, 3], {discharge: 30, width: 0.3}),
      river(2, [point(92, 36), point(125, 78), point(150, 120)], [8, 9], {parent: 1, discharge: 8, width: 0.12})
    ],
    expectedIssueIds: ["valid-confluence"],
    acceptance: acceptance({"valid-confluence": 1})
  },
  {
    id: "non-confluence-crossing",
    name: "非汇流交叉",
    category: "geometry",
    description: "两条无父子关系的河流相交，固定区分正常汇流和异常穿越。",
    rivers: [
      river(1, [point(42, 40), point(150, 150), point(278, 40)], [1, 2, 3]),
      river(2, [point(42, 150), point(150, 40), point(278, 150)], [4, 5, 6])
    ],
    expectedIssueIds: ["non-confluence-crossing"],
    acceptance: acceptance({"non-confluence-crossing": 1})
  },
  {
    id: "lake-inlet-overflow-outlet",
    name: "湖泊入流与溢流",
    category: "lake-routing",
    description: "湖泊入流、自然溢流和出口语义并存，当前阶段只记录待专门处理的路由证据。",
    rivers: [
      river(1, [point(40, 80), point(118, 100)], [1, 2], {outletKind: "lake-inlet", lakeId: 7}),
      river(2, [point(118, 100), point(210, 100), point(280, 118)], [3, 4, 5], {outletKind: "ocean", lakeId: 7})
    ],
    expectedIssueIds: ["lake-routing-review"],
    acceptance: acceptance({"border-mouth-review": 1, "lake-routing-review": 1, "non-confluence-crossing": 1, "thin-fragment": 1})
  },
  {
    id: "border-ocean-mouth",
    name: "边界与入海口",
    category: "outlet",
    description: "末端落在地图边界并标记入海，固定保留出口类型和末端坐标证据。",
    rivers: [river(1, [point(180, 100), point(318, 102)], [20, 21], {outletKind: "ocean", mouth: [318, 102]})],
    expectedIssueIds: ["border-mouth-review"],
    acceptance: acceptance({"border-mouth-review": 1, "thin-fragment": 1})
  }
];

const FIXTURE_BY_ID = new Map(FIXTURES.map(fixture => [fixture.id, fixture]));

const SAFETY_FIXTURES = [
  curveSafetyFixture("curve-overshoot", "curve-overshoot", [[0, 0], [0, 100], [10, 0]]),
  curveSafetyFixture("curve-self-intersection", "curve-self-intersection", [[0, 0], [10, 3], [0, 3], [10, 0]]),
  curveSafetyFixture("curve-backtracking", "curve-backtracking", [[0, 0], [8, 0], [4, 1], [10, 0]]),
  curveSafetyFixture("curve-water-excursion", "curve-water-excursion", [[0, 0], [5, 0], [10, 0]], {
    childHydrologyPath: [{cell: 90, point: [5, 20], height: 10}]
  }),
  curveSafetyFixture("curve-non-confluence-crossing", "curve-non-confluence-crossing", [[0, 0], [10, 0]], {
    unrelated: river(3, [point(5, -5), point(5, 5)], [30, 31])
  }),
  {
    id: "protected-mouth-drift",
    kind: "protected-mouth",
    expectedReason: "protected-mouth-drift",
    before: {rivers: [river(1, [point(0, 0), point(10, 0)], [1, 2], {outletKind: "ocean"})]},
    after: {rivers: [river(1, [point(0, 0), point(11, 0)], [1, 2], {outletKind: "ocean"})]}
  },
  {
    id: "shared-cell-display-gap",
    kind: "candidate",
    expectedReason: "confluence-display-gap",
    snapshot: {
      metadata: {gridSpacing: 2},
      rivers: [
        river(1, [point(0, 0), point(100, 0)], [1, 2], {width: 0.2, discharge: 20, hydrologyPath: [{cell: 1, point: [50, 0], height: 30}]}),
        river(2, [point(0, 1000), point(0, 500)], [9], {parent: 1, width: 0.1, discharge: 5, hydrologyPath: [{cell: 1, point: [50, 0], height: 30}]})
      ]
    }
  }
];

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function acceptance(issueCounts, stages = {}) {
  return {
    issueCounts,
    stages: {
      dag: accepted(),
      confluence: accepted(),
      hydrology: accepted(),
      ...stages
    }
  };
}

function accepted() {
  return {status: "accepted", reason: null};
}

function rejected(reason) {
  return {status: "rejected", reason};
}

function curveSafetyFixture(id, expectedReason, sampledPoints, {childHydrologyPath = [], unrelated = null} = {}) {
  return {
    id,
    kind: "curve",
    expectedReason,
    childId: 2,
    parentId: 1,
    sampledPoints,
    snapshot: {
      metadata: {gridSpacing: 0},
      rivers: [
        river(1, [point(10, -10), point(10, 10)], [1, 2], {width: 0.2, discharge: 20}),
        river(2, [point(-10, 0), point(0, 0)], [8, 9], {parent: 1, width: 0.1, discharge: 5, hydrologyPath: childHydrologyPath}),
        ...(unrelated ? [unrelated] : [])
      ]
    }
  };
}

export {FIXTURES, FIXTURE_BY_ID, SAFETY_FIXTURES};
