import {access, cp, mkdir, readdir} from "node:fs/promises";
import path from "node:path";

export const SELF_CONTAINED_PROTOTYPE_IDS = Object.freeze([
  "boundary-topology-lab",
  "river-network-lab"
]);

export async function listPrototypeDeployments(sourceRoot) {
  const entries = await readdir(sourceRoot, {withFileTypes: true});
  const deployments = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const sourcePath = path.join(sourceRoot, entry.name);
    const entryPath = path.join(sourcePath, "index.html");
    await access(entryPath).catch(() => {
      throw new Error(`prototype/${entry.name} 缺少 index.html，无法纳入统一部署`);
    });
    deployments.push({id: entry.name, sourcePath, entryPath});
  }
  return deployments;
}

export async function stagePrototypeDeployments(sourceRoot, outputRoot) {
  const deployments = await listPrototypeDeployments(sourceRoot);
  await mkdir(outputRoot, {recursive: true});
  for (const deployment of deployments) {
    const outputPath = path.join(outputRoot, deployment.id);
    if (SELF_CONTAINED_PROTOTYPE_IDS.includes(deployment.id)) {
      await bundlePrototypeDeployment(deployment.sourcePath, outputPath);
      continue;
    }
    await cp(deployment.sourcePath, outputPath, {recursive: true});
  }
  return deployments;
}

async function bundlePrototypeDeployment(sourcePath, outputPath) {
  const {build} = await import("vite");
  await build({
    configFile: false,
    root: sourcePath,
    base: "./",
    publicDir: false,
    clearScreen: false,
    logLevel: "error",
    build: {
      outDir: outputPath,
      emptyOutDir: true,
      rolldownOptions: {
        treeshake: {
          moduleSideEffects: id => String(id).replaceAll("\\", "/").includes("/vendor/")
        }
      }
    }
  });
  await cp(path.join(sourcePath, "vendor"), path.join(outputPath, "vendor"), {recursive: true, force: true}).catch(error => {
    if (error?.code !== "ENOENT") throw error;
  });
}
