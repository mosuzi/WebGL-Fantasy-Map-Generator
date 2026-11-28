// 共边身份和方向分开，翻转水陆时仍定位同一条网格共边。
export function shoreEdgeId({landCell, waterCell}) {
  return landCell < waterCell ? `${landCell}:${waterCell}` : `${waterCell}:${landCell}`;
}

export function createShoreEdgeIndex(vertexKey) {
  const edges = new Map();
  const byCell = new Map();
  const byVertex = new Map();
  let paths = [];

  function update(table, key, member, add) {
    let members = table.get(key);
    if (add) {
      if (!members) table.set(key, members = new Set());
      members.add(member);
    } else if (members) {
      members.delete(member);
      if (!members.size) table.delete(key);
    }
  }

  function changePath(path, add) {
    for (const rawEdge of path.sourceEdges) {
      const id = shoreEdgeId(rawEdge);
      if (add) edges.set(id, {rawEdge, path});
      else edges.delete(id);
      update(byCell, rawEdge.landCell, id, add);
      update(byCell, rawEdge.waterCell, id, add);
    }
    for (const point of path.points) update(byVertex, vertexKey(point), path, add);
  }

  function apply(next, removed, added) {
    for (const path of removed) changePath(path, false);
    for (const path of added) changePath(path, true);
    paths = next;
  }

  return {
    get paths() { return paths; },
    prepare(next) {
      if (paths === next) return;
      const before = new Set(paths);
      const after = new Set(next);
      apply(next, paths.filter(path => !after.has(path)), next.filter(path => !before.has(path)));
    },
    apply,
    pathsForCell(cell) {
      const result = new Set();
      for (const id of byCell.get(cell) || []) result.add(edges.get(id).path);
      return result;
    },
    pathsForVertex(point) {
      return byVertex.get(vertexKey(point)) || [];
    },
    readEdge(edge) {
      return edges.get(shoreEdgeId(edge));
    }
  };
}
