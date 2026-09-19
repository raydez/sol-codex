#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=[];
await walk(root);
let failed=false;
for(const file of files.filter(f=>f.endsWith('.mjs'))){
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(r.status!==0){ failed=true; process.stderr.write(r.stderr||`${file} failed\n`); }
}
for(const rel of ['plugin.json','.codex-plugin/plugin.json','.agents/plugins/marketplace.json','hooks/hooks.json','config/sol-codex.example.json','benchmark/examples/benchmark.example.json','benchmark/examples/pricing.example.json','benchmark/validation-manifest.example.json','benchmark/suites/swebench-verified-30.json','package.json']){
  try{ JSON.parse(await fs.readFile(path.join(root,rel),'utf8')); }
  catch(e){ failed=true; console.error(`${rel}: ${e.message}`); }
}
if(failed) process.exit(1);
console.log(`Syntax/manifest check passed (${files.filter(f=>f.endsWith('.mjs')).length} modules).`);

async function walk(dir){
  for(const e of await fs.readdir(dir,{withFileTypes:true})){
    if(['.git','node_modules','.sol-codex-benchmark'].includes(e.name)) continue;
    const p=path.join(dir,e.name);
    if(e.isDirectory()) await walk(p); else files.push(p);
  }
}
