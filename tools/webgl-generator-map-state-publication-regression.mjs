import assert from "node:assert/strict";
import {createMapStatePublication} from "../app/webgl-generator/src/runtime/map-state-publication.js";
import {MapRevisionTracker} from "../app/webgl-generator/src/runtime/map-revision.js";
import {createRenameObjectCommand} from "../app/webgl-generator/src/runtime/object-edit-commands.js";
import {projectCultureDirectory} from "../app/webgl-generator/src/runtime/culture-directory.js";
import {EditHistory} from "../app/webgl-generator/src/runtime/edit-history.js";

const revision = new MapRevisionTracker();
const primary = {i: 1, name: "规范名称"};
const mirror = {i: 1, name: "旧镜像", root: "旧"};
let map = {
  society: {cultures: [null, primary, {i: 2, removed: true, name: "已删除"}]},
  pack: {cultures: [null, mirror]}
};
let committing = false;
const errors = [];
const state = createMapStatePublication({
  readCurrent: () => ({map, revision: revision.getCoreSnapshot()}),
  canPublish: () => !committing,
  onError: error => errors.push(error)
});
const history = new EditHistory({
  onMutation: mutation => {
    const before = revision.getCoreSnapshot();
    revision.advance();
    state.record(mutation, before, revision.getCoreSnapshot());
  },
  onSnapshot: () => revision.createSnapshot(),
  onRestore: snapshot => {
    revision.restoreSnapshot(snapshot);
    state.restore(revision.getCoreSnapshot());
  }
});
const named = [];
const unrelated = [];
const stop = state.subscribe(["culture", "culture-directory"], event => named.push(event));
state.subscribe(["height"], event => unrelated.push(event));
revision.replaceMap("first");
state.replace(revision.getCoreSnapshot());
await Promise.resolve();
assert.equal(named.length, 1);
assert.equal(named[0].replaced, true);
assert.equal(unrelated.length, 1);

function rename(name) {
  const command = createRenameObjectCommand({kind: "culture", id: 1}, name);
  assert.equal(command.isNoop({map}), false);
  assert.equal(command.effects.render, "none");
  return history.execute(command, {map});
}

rename("青崖文化");
await Promise.resolve();
assert.equal(named.length, 2);
assert.equal(unrelated.length, 1);
assert.deepEqual(projectCultureDirectory(map), [{id: 1, name: "青崖文化"}]);
assert.deepEqual(primary, mirror);
history.undo({map});
await Promise.resolve();
assert.equal("root" in primary, false);
assert.equal(mirror.name, "旧镜像");
assert.equal(named.at(-1).changes[0].action, "undo");
history.redo({map});
await Promise.resolve();
assert.equal(primary.name, "青崖文化");
assert.equal(named.at(-1).changes[0].action, "redo");

committing = true;
const snapshot = history.createSnapshot();
const failed = rename("尚未提交文化");
await Promise.resolve();
assert.equal(named.length, 4);
failed.revert({map});
history.restoreSnapshot(snapshot);
committing = false;
state.schedule();
await Promise.resolve();
assert.equal(named.length, 4);
assert.equal(primary.name, "青崖文化");

rename("落定文化");
rename("同批第二次修改");
await Promise.resolve();
assert.deepEqual(named.at(-1).changes.map(change => change.after.mapRevision), [4, 5]);
assert.equal(named.at(-1).after.topologyRevision, 5);
assert.equal(unrelated.length, 1);

stop();
map = {};
revision.replaceMap("second");
state.replace(revision.getCoreSnapshot());
await Promise.resolve();
assert.equal(named.length, 5);
assert.equal(unrelated.at(-1).map, map);
assert.equal(unrelated.at(-1).after.mapIdentity, "second");
assert.deepEqual(errors, []);
console.log("通过地图提交订阅、隔离回滚、文化镜像、换图和解除订阅验证");
