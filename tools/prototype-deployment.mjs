import {access, cp, mkdir, readdir} from "node:fs/promises";
import path from "node:path";

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
    await cp(deployment.sourcePath, path.join(outputRoot, deployment.id), {recursive: true});
  }
  return deployments;
}
