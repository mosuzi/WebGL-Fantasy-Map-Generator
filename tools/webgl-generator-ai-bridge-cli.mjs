const options = parseArguments(process.argv.slice(2));
if (!options.token) fail("必须通过 --token 提供配对令牌");

try {
  if (options.command === "status") {
    const result = await request("GET", "/v1/status");
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (options.command === "call") {
    const result = await request("POST", "/v1/request", {
      method: options.method,
      arguments: JSON.parse(options.arguments || "[]"),
      requestId: options.requestId || undefined,
      documentId: options.documentId || undefined,
      expectedRevision: options.expectedRevision === undefined ? undefined : Number(options.expectedRevision)
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else fail("命令必须是 status 或 call");
} catch (error) {
  fail(error.message || String(error));
}

async function request(method, path, body = undefined) {
  const response = await fetch(`http://127.0.0.1:5412${path}`, {
    method,
    headers: {Authorization: `Bearer ${options.token}`, ...(body ? {"Content-Type": "application/json"} : {})},
    ...(body ? {body: JSON.stringify(body)} : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${data?.error?.code || "bridge_error"}: ${data?.error?.message || `HTTP ${response.status}`}`);
  return data;
}

function parseArguments(args) {
  const result = {command: args[0] || "status", method: args[1] || "", arguments: args[2] || "[]"};
  for (let index = result.command === "call" ? 3 : 1; index < args.length; index += 1) {
    const key = args[index];
    if (key === "--token") result.token = args[++index];
    else if (key === "--request-id") result.requestId = args[++index];
    else if (key === "--document-id") result.documentId = args[++index];
    else if (key === "--expected-revision") result.expectedRevision = args[++index];
  }
  return result;
}

function fail(message) {
  process.stderr.write(`${JSON.stringify({ok: false, error: {code: "bridge_cli_error", message}})}\n`);
  process.exit(1);
}
