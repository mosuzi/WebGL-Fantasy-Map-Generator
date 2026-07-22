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

export const FIXTURES = Object.freeze([
  singleIsland,
  islandWithHole,
  narrowStrait,
  lakeSeaConnection,
  triStateJunction,
  crossStateProvince,
  mapBoundary,
  closedLoop
].map(fixture => Object.freeze(fixture)));

export const FIXTURE_BY_ID = new Map(FIXTURES.map(fixture => [fixture.id, fixture]));

export function cloneFixture(fixture) {
  return structuredClone(fixture);
}
