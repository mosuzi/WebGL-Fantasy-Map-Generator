import {mkdir, readFile, writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(repoRoot, "source", "Fantasy-Map-Generator");
const playwright = createRequire(join(sourceDir, "package.json"))("playwright");
const publicDir = join(repoRoot, "app", "webgl-generator", "public");
const master = await readFile(join(publicDir, "app-icon-circle-master.png"));
const masterDataUrl = `data:image/png;base64,${master.toString("base64")}`;
const svg = iconSvg(masterDataUrl);
await writeFile(join(publicDir, "app-icon.svg"), svg, "utf8");
const outputs = new Map([
  [32, "app-icon-32.png"],
  [64, "app-icon-64.png"],
  [180, "apple-touch-icon.png"],
  [192, "app-icon-192.png"],
  [256, "app-icon-256.png"],
  [512, "app-icon-512.png"]
]);

const browser = await playwright.chromium.launch({headless: true, channel: "chrome"});
try {
  const page = await browser.newPage({deviceScaleFactor: 1});
  for (const [size, filename] of outputs) {
    await page.setViewportSize({width: size, height: size});
    await page.setContent(imageDocument(masterDataUrl));
    await page.screenshot({path: join(publicDir, filename), omitBackground: true});
  }

  const previewDir = join(repoRoot, "docs", "generated", "screenshots");
  await mkdir(previewDir, {recursive: true});
  await page.setViewportSize({width: 1200, height: 300});
  await page.setContent(previewDocument(masterDataUrl));
  await page.screenshot({path: join(previewDir, "app-icon-preview.png")});
} finally {
  await browser.close();
}

console.log(JSON.stringify({ok: true, outputs: [...outputs.values()]}, null, 2));

function iconSvg(dataUrl) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-labelledby="title description">
  <title id="title">WebGL 幻想地图生成器</title>
  <desc id="description">海岸、山脉、河流、路线与环城城池组成的圆形旧纸地图</desc>
  <image id="app-icon-circle-master-image" width="1024" height="1024" preserveAspectRatio="xMidYMid meet" href="${dataUrl}" />
</svg>
`;
}

function imageDocument(dataUrl) {
  return `<!doctype html><style>html,body,img{width:100%;height:100%;margin:0;background:transparent}img{display:block;object-fit:contain}</style><img src="${dataUrl}" alt="">`;
}

function previewDocument(dataUrl) {
  const sizes = [16, 32, 64, 128, 256];
  const items = sizes.map(size => `<figure><div class="tile"><img src="${dataUrl}" alt="" style="width:${size}px;height:${size}px"></div><figcaption>${size}px</figcaption></figure>`).join("");
  return `<!doctype html><style>
    html,body{margin:0;width:100%;height:100%;background:#101714;color:#d8cba4;font:14px/1.4 system-ui,sans-serif}
    body{display:grid;place-items:center}.row{display:flex;align-items:flex-end;gap:28px;padding:24px}
    figure{display:grid;gap:10px;justify-items:center;margin:0}.tile{display:grid;place-items:center;width:200px;height:210px;border:1px solid #33453c;border-radius:18px;background:#eef1ed}
    img{display:block;object-fit:contain}figcaption{color:#b9c7bf}
  </style><div class="row">${items}</div>`;
}
