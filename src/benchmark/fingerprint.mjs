import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export function stableHash(value) {
  return crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
}

async function runVersion(command) {
  return new Promise(resolve=>{
    const child=spawn(command,['--version'],{shell:false,stdio:['ignore','pipe','pipe']});
    const out=[],err=[]; const timer=setTimeout(()=>child.kill('SIGKILL'),15000);
    child.stdout.on('data',b=>out.push(b)); child.stderr.on('data',b=>err.push(b));
    child.once('error',()=>{clearTimeout(timer);resolve(null);});
    child.once('close',()=>{clearTimeout(timer);resolve((Buffer.concat(out).toString('utf8')||Buffer.concat(err).toString('utf8')).trim()||null);});
  });
}

export async function environmentFingerprint({ manifest=null, manifestFile=null, codexCommand='codex' }={}) {
  const codexVersion=await runVersion(codexCommand);
  let packageVersion=null;
  try { const pkg=JSON.parse(await fs.readFile(new URL('../../package.json',import.meta.url),'utf8')); packageVersion=pkg.version; } catch {}
  const manifestHash=manifest ? stableHash(manifest) : (manifestFile ? stableHash(await fs.readFile(path.resolve(manifestFile),'utf8')) : null);
  return {
    capturedAt:new Date().toISOString(), codexVersion, solCodexVersion:packageVersion,
    nodeVersion:process.version, platform:process.platform, arch:process.arch, osRelease:os.release(),
    model:manifest?.environment?.model || null, reasoningEffort:manifest?.environment?.reasoningEffort || null,
    sandbox:manifest?.defaults?.sandbox || null, manifestHash
  };
}

export function validateFrozenEnvironment(manifest,{strict=true}={}) {
  const errors=[],warnings=[]; const env=manifest?.environment||{};
  if(!env.model || /^SET_|^YOUR_/i.test(String(env.model))) errors.push('environment.model must be set to the exact Codex model for validation-grade runs');
  if(!['minimal','low','medium','high','xhigh'].includes(String(env.reasoningEffort||''))) errors.push('environment.reasoningEffort must be one of minimal|low|medium|high|xhigh');
  if(!Array.isArray(manifest?.tasks)||manifest.tasks.length<1) errors.push('tasks[] is empty');
  for(const t of manifest?.tasks||[]) {
    if(!t.revision || !/^[0-9a-fA-F]{40}$/.test(String(t.revision))) (strict?errors:warnings).push(`${t.id}: revision must be an exact 40-hex commit SHA`);
    if(!Array.isArray(t.verify)||!t.verify.length) warnings.push(t.externalVerification ? `${t.id}: no local deterministic verify command; quality is pending external verifier '${t.externalVerification}'` : `${t.id}: no deterministic verify command; success will rely on Codex exit status`);
  }
  return {ok:errors.length===0,errors,warnings};
}
