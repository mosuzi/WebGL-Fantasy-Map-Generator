import assert from "node:assert/strict";
import {createRescueOrphanNoteCommand} from "../app/webgl-generator/src/runtime/orphan-note-commands.js";
const map = {settlements:{cities:[{id:0,name:"同名",state:0,province:0}]},politics:{states:[],provinces:[]},notes:{notes:[{id:"city:999",kind:"city",objectId:999,body:"旧正文",extra:"旧字段"}],metadata:{notes:1}}};
const original = structuredClone(map.notes), context = {map};
const edit = createRescueOrphanNoteCommand(map,"city:999",{body:"新正文"}); edit.apply(context); assert.equal(map.notes.notes[0].body,"新正文"); edit.revert(context); assert.deepEqual(map.notes,original);
const bind = createRescueOrphanNoteCommand(map,"city:999",{target:{kind:"city",id:0}}); bind.apply(context); assert.equal(map.notes.notes[0].id,"city:0"); assert.equal(map.notes.notes[0].extra,"旧字段"); const after=structuredClone(map.notes); bind.revert(context); assert.deepEqual(map.notes,original); bind.apply(context); assert.deepEqual(map.notes,after); bind.revert(context);
assert.throws(()=>bind.apply({map:structuredClone(map)}),/地图已更换/);
map.notes.notes.push({id:"city:0",kind:"city",objectId:0}); assert.throws(()=>bind.isNoop(context),/已有备注/); map.notes.notes.pop(); map.settlements.cities[0]=null; assert.throws(()=>bind.apply(context),/目标对象/);
console.log("孤儿备注：正文、ID 0、冲突、目标消失、换图、精确历史通过");
