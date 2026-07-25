#!/usr/bin/env node
import {createReadStream, existsSync, statSync} from "node:fs";
import {createServer} from "node:http";
import {extname, join, normalize, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {dirname} from "node:path";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const host = args.host || "127.0.0.1";
const port = Number(args.port || 5400);
const publicDir = resolve(args.dir || join(rootDir, "prototype", "webgl-cells"));

if (!existsSync(publicDir)) {
  console.error(`Static directory does not exist: ${publicDir}`);
  process.exit(1);
}

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const target = resolve(publicDir, `.${normalize(pathname)}`);

  if (!target.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!existsSync(target) || !statSync(target).isFile()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": getContentType(target),
    "cache-control": "no-store, max-age=0"
  });
  createReadStream(target).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Prototype server: http://${host}:${port}`);
  console.log(`Serving: ${publicDir}`);
});

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    parsed[key] = inlineValue ?? argv[++index] ?? true;
  }
  return parsed;
}

function getContentType(file) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  };
  return types[extname(file).toLowerCase()] || "application/octet-stream";
}
