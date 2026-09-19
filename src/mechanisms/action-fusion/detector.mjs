export function extractPatchedFiles(toolName, toolInput) {
  if (toolName !== 'apply_patch') return [];
  const patch = typeof toolInput?.command === 'string' ? toolInput.command : '';
  const out = [];
  const re = /^\*\*\* (?:Update|Add|Delete) File:\s*(.+)$/gm;
  let m;
  while ((m = re.exec(patch))) {
    const file = m[1].trim();
    if (file && !out.includes(file)) out.push(file);
  }
  return out;
}
