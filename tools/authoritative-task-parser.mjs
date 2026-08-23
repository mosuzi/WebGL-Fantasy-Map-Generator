export function parseTaskBlocks(markdown, source = "markdown") {
  const lines = String(markdown || "").replaceAll("\r\n", "\n").split("\n");
  const tasks = [];
  const bulletPattern = /^- \*\*(?:权威任务)?第 (\d+) 项：(.+?)\*\* `([^`]+)`/;
  const headingPattern = /^### (?:权威任务)?第 (\d+) 项：(.+?) `([^`]+)`\s*$/;
  const taskLikePattern = /^(?:- \*\*|### )(?:权威任务)?第 \d+ 项：/;
  const taskLikeCount = lines.filter(line => taskLikePattern.test(line)).length;

  for (let index = 0; index < lines.length; index += 1) {
    const bulletMatch = lines[index].match(bulletPattern);
    const headingMatch = lines[index].match(headingPattern);
    const match = bulletMatch || headingMatch;
    if (!match) continue;
    const headingStyle = Boolean(headingMatch);
    let end = index + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (headingStyle ? /^#{1,3}\s/.test(line) : line.trim() && !line.startsWith("  ")) break;
      end += 1;
    }
    const sourceLines = lines.slice(index, end);
    const archiveLines = headingStyle
      ? [`- **权威任务第 ${match[1]} 项：${match[2]}** \`${match[3]}\``, ...sourceLines.slice(1).map(line => line.startsWith("- ") ? `  ${line}` : line)]
      : sourceLines;
    tasks.push({
      number: Number(match[1]),
      title: match[2],
      status: match[3],
      block: sourceLines.join("\n").trimEnd().replace(/^- \*\*第 /, "- **权威任务第 "),
      archiveBlock: archiveLines.join("\n").trimEnd().replace(/^- \*\*第 /, "- **权威任务第 "),
      source,
    });
    index = end - 1;
  }
  if (tasks.length !== taskLikeCount) {
    throw new Error(`${source} 存在未识别任务标题：检测 ${taskLikeCount}，解析 ${tasks.length}`);
  }
  return tasks;
}
