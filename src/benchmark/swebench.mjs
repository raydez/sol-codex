import fs from 'node:fs/promises';
import path from 'node:path';
import { readRuns } from './run-store.mjs';
import { execFile } from './runner.mjs';

export async function readJsonl(file) {
  const text=await fs.readFile(path.resolve(file),'utf8');
  return text.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));
}

export async function prepareSWEbenchManifest({ rowsFile, reposDir, output, model, reasoningEffort='medium', sandbox='workspace-write' }) {
  if(!rowsFile||!reposDir||!output||!model) throw new Error('prepare requires --rows, --repos-dir, --manifest-output, and --model');
  const rows=await readJsonl(rowsFile);
  const reposRoot=path.resolve(reposDir); await fs.mkdir(reposRoot,{recursive:true});
  const repoPaths=new Map();
  for(const row of rows) {
    const repo=String(row.repo||''); if(!repo) throw new Error(`Missing repo for ${row.instance_id}`);
    if(repoPaths.has(repo)) continue;
    const dest=path.join(reposRoot,repo.replaceAll('/','__')+'.git');
    try { await fs.access(dest); }
    catch {
      const r=await execFile('git',['clone','--mirror',`https://github.com/${repo}.git`,dest],{timeoutMs:1800000,maxOutputBytes:2_000_000});
      if(r.exitCode!==0) throw new Error(`git clone failed for ${repo}: ${r.stderr||r.stdout}`);
    }
    repoPaths.set(repo,dest);
  }
  const manifest={
    version:1,
    outputDir:'.sol-codex-benchmark',
    environment:{model:String(model),reasoningEffort:String(reasoningEffort)},
    defaults:{sandbox,taskTimeoutMs:1800000,verifyTimeoutMs:180000,codexArgs:[]},
    tasks:rows.map(row=>({
      id:row.instance_id,
      repo:repoPaths.get(row.repo),
      revision:row.base_commit,
      prompt:`Resolve the following GitHub issue in the repository. Make the smallest correct code change. Do not use or search for a gold solution patch.\n\n${row.problem_statement}`,
      verify:[],
      externalVerification:'swebench',
      metadata:{repo:row.repo,version:row.version,image:row.image||null}
    }))
  };
  await fs.writeFile(path.resolve(output),JSON.stringify(manifest,null,2)+'\n');
  return manifest;
}

export async function exportSWEbenchPredictions({ dir, variant, repeat, output, modelName=null }) {
  if(!dir||!variant||!repeat||!output) throw new Error('export requires --dir, --variant, --repeat, and --output');
  const runs=await readRuns(path.resolve(dir));
  const selected=runs.filter(r=>r.variant===variant && Number(r.repeat||1)===Number(repeat));
  if(!selected.length) throw new Error(`No runs found for variant=${variant} repeat=${repeat}`);
  const predictions=[];
  for(const run of selected) {
    const patchFile=path.join(path.resolve(dir),run.artifacts||'', 'model.patch');
    let patch=''; try { patch=await fs.readFile(patchFile,'utf8'); } catch {}
    predictions.push({instance_id:run.taskId,model_patch:patch,model_name_or_path:modelName||`sol-codex-${variant}`});
  }
  await fs.writeFile(path.resolve(output),JSON.stringify(predictions,null,2)+'\n');
  return predictions;
}

function resultSets(doc) {
  const resolved=new Set(doc.resolved||doc.resolved_ids||doc.resolved_instances||[]);
  const unresolved=new Set(doc.unresolved||doc.unresolved_ids||doc.unresolved_instances||[]);
  if(doc.report && typeof doc.report==='object') {
    for(const [id,v] of Object.entries(doc.report)) {
      if(v?.resolved===true) resolved.add(id); else if(v?.resolved===false) unresolved.add(id);
    }
  }
  if(!resolved.size && !unresolved.size && typeof doc==='object') {
    for(const [id,v] of Object.entries(doc)) {
      if(v && typeof v==='object' && typeof v.resolved==='boolean') (v.resolved?resolved:unresolved).add(id);
    }
  }
  return {resolved,unresolved};
}

export async function importSWEbenchResults({ dir, resultsFile, variant, repeat }) {
  if(!dir||!resultsFile||!variant||!repeat) throw new Error('import requires --dir, --results, --variant, and --repeat');
  const root=path.resolve(dir); const doc=JSON.parse(await fs.readFile(path.resolve(resultsFile),'utf8'));
  const {resolved,unresolved}=resultSets(doc);
  if(!resolved.size && !unresolved.size) throw new Error('No resolved/unresolved instance IDs found in SWE-bench result file');
  const runsDir=path.join(root,'runs'); const names=(await fs.readdir(runsDir)).filter(x=>x.endsWith('.json'));
  let updated=0, skipped=0;
  for(const name of names) {
    const file=path.join(runsDir,name); const run=JSON.parse(await fs.readFile(file,'utf8'));
    if(run.variant!==variant || Number(run.repeat||1)!==Number(repeat)) continue;
    if(resolved.has(run.taskId)) { run.success=true; run.testPass=true; run.externalVerificationPending=false; run.externalVerificationResult='resolved'; }
    else if(unresolved.has(run.taskId)) { run.success=false; run.testPass=false; run.externalVerificationPending=false; run.externalVerificationResult='unresolved'; }
    else { skipped++; continue; }
    run.externalVerificationImportedAt=new Date().toISOString();
    await fs.writeFile(file,JSON.stringify(run,null,2)+'\n'); updated++;
  }
  return {updated,skipped,resolved:resolved.size,unresolved:unresolved.size};
}
