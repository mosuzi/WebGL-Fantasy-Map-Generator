import fs from "node:fs";
const path = "app/webgl-generator/src/styles.css";
const theme = fs.readFileSync("app/webgl-generator/src/panel-theme.css", "utf8");
const keys = new Set([...theme.matchAll(/^\s*(--[\w-]+):/gm)].map(match => match[1]));
const source = fs.readFileSync(path,"utf8");
const end = source.indexOf("\n}");
const head = source.slice(0,end).split("\n").filter(line => !keys.has(line.match(/^\s*(--[\w-]+):/)?.[1])).join("\n");
fs.writeFileSync(path,head.replace("Element Plus 全局暗色主题变量。", "Element Plus 共用尺寸与遮罩变量；界面颜色见 panel-theme.css。")+source.slice(end));
