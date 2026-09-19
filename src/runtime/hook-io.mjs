export async function readHookInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export function writeHookOutput(output) {
  if (output === undefined || output === null) return;
  process.stdout.write(JSON.stringify(output));
}

export function normalizeHookInput(input) {
  return {
    sessionId: String(input.session_id || 'unknown'),
    turnId: input.turn_id ? String(input.turn_id) : null,
    cwd: input.cwd || process.cwd(),
    event: input.hook_event_name || 'unknown',
    model: input.model || null,
    permissionMode: input.permission_mode || null,
    source: input.source || null,
    trigger: input.trigger || null,
    prompt: input.prompt || null,
    toolName: input.tool_name || input.tool || null,
    toolUseId: input.tool_use_id || null,
    toolInput: input.tool_input,
    toolResponse: input.tool_response
  };
}
