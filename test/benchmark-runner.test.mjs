import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { runBenchmark } from '../src/benchmark/runner.mjs';
import { buildReport } from '../src/benchmark/report.mjs';

test('automated runner creates fresh worktrees and parses Codex --json usage', async (t) => {
  if (process.platform === 'win32') return t.skip('fixture uses POSIX executable script');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sol-codex-bench-'));
  const repo=path.join(root,'repo'); await fs.mkdir(repo);
  run('git',['init'],repo); run('git',['config','user.email','test@example.com'],repo); run('git',['config','user.name','Test'],repo);
  await fs.writeFile(path.join(repo,'README.md'),'fixture\n');
  run('git',['add','.'],repo); run('git',['commit','-m','init'],repo);
  const fake=path.join(root,'fake-codex.mjs');
  await fs.writeFile(fake,`#!/usr/bin/env node\nimport fs from 'node:fs';\nconst sol=fs.existsSync('.sol-codex.json');\nconsole.log(JSON.stringify({type:'thread.started',thread_id:sol?'sol':'native'}));\nconsole.log(JSON.stringify({type:'item.started',item:{type:'command_execution'}}));\nconsole.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:sol?600:900,cached_input_tokens:0,output_tokens:100,reasoning_output_tokens:0}}));\n`);
  await fs.chmod(fake,0o755);
  const manifest=path.join(root,'bench.json');
  await fs.writeFile(manifest,JSON.stringify({version:1,codexCommand:fake,outputDir:path.join(root,'out'),tasks:[{id:'t1',repo,revision:'HEAD',prompt:'do it',verify:[[process.execPath,'-e','process.exit(0)']]}]},null,2));
  const result=await runBenchmark({manifestFile:manifest,variants:['native','all'],repeats:1});
  assert.equal(result.results.length,2);
  assert.equal(result.results.every(x=>x.success),true);
  const report=await buildReport({dir:result.root});
  assert.equal(report.variants.native.tokensPerSuccess,1000);
  assert.equal(report.variants.all.tokensPerSuccess,700);
  assert.ok(Math.abs(report.variants.all.tokenSavingPerSuccess-0.3)<1e-12);
});

function run(cmd,args,cwd){ const r=spawnSync(cmd,args,{cwd,encoding:'utf8'}); if(r.status!==0) throw new Error(`${cmd} failed: ${r.stderr}`); }
