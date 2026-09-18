// 第 396 项一次性、可重放的界面色值迁移；地图覆盖层与配色预览不在迁移范围。
import fs from "node:fs";
import path from "node:path";
const root = "app/webgl-generator/src";
const colors = /#[\da-f]{3,8}\b|rgba?\([^)]*\)/gi;
function role(selector) { return /error|danger|invalid/.test(selector) ? "danger" : /warn/.test(selector) ? "warning" : /success|applied|valid=.true/.test(selector) ? "success" : /active|selected|editing|focus|primary/.test(selector) ? "accent" : ""; }
function convert(css, global = false) {
  const mapStart = css.indexOf(".map-stage {"), mapEnd = css.indexOf(".floating-panel-layer {");
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (block, selector, body, offset) => {
    if (global && (offset >= mapStart && offset < mapEnd || /grid-cell-diagnostic-label|^\s*\.app-shell\s*$/.test(selector))) return block;
    if (/swatch|theme-preview|emblem-preview|coat-of-arms|pattern-diagonal|pattern-cross|pattern-dots/.test(selector)) return block;
    const tone = role(selector);
    const next = body.replace(/([\w-]+)\s*:\s*([^;{}]+);/g, (declaration, property, value) => {
      if (property.startsWith("--") && /:root/.test(selector) || !colors.test(value)) { colors.lastIndex = 0; return declaration; }
      colors.lastIndex = 0;
      let replacement;
      if (property.startsWith("--")) {
        const name = property.toLowerCase();
        const stateTone = /danger|error/.test(name) ? "danger" : /warning/.test(name) ? "warning" : /active|selected|focus|switch-on|slider-main/.test(name) ? "accent" : tone;
        replacement = /border|off-color|runway|stop-bg/.test(name) ? "var(--panel-border)" : /bg|background|fill/.test(name) ? `var(--panel-${stateTone ? `${stateTone}-soft` : "surface"})` : `var(--panel-${stateTone || "text"})`;
      }
      else if (property === "color") replacement = `var(--panel-${tone || "text"})`;
      else if (/^background/.test(property)) replacement = `var(--panel-${tone ? `${tone}-soft` : /header|hover|card|section|summary|detail|metric/.test(selector) ? "surface-alt" : "surface"})`;
      else if (/border|outline/.test(property)) replacement = `var(--panel-${tone || "border"})`;
      else if (property === "box-shadow") replacement = "rgba(30, 48, 64, 0.13)";
      else return declaration;
      return `${property}: ${value.replace(colors, replacement)};`;
    });
    return `${selector}{${next}}`;
  });
}
let files = 0;
const globalPath = `${root}/styles.css`;
const old = fs.readFileSync(globalPath,"utf8");
let next = convert(old,true).replace("color-scheme: dark;", "color-scheme: light;");
if(next!==old){fs.writeFileSync(globalPath,next);files++;}
function visit(directory) { for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {const file=path.join(directory,entry.name);if(entry.isDirectory())visit(file);else if(file.endsWith(".vue")){const source=fs.readFileSync(file,"utf8");const output=source.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g,(_,start,css,end)=>start+convert(css)+end);if(output!==source){fs.writeFileSync(file,output);files++;}}} }
visit(`${root}/ui/vue/components`);
console.log(`已迁移 ${files} 个界面样式文件，地图覆盖层保持原色。`);
