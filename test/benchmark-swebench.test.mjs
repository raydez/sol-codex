import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { exportSWEbenchPredictions, importSWEbenchResults } from '../src/benchmark/swebench.mjs';

test('SWE-bench predictions export exact model patches and official results import quality', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'sol-swe-'));
  await fs.mkdir(path.join(root,'runs'),{recursive:true});
  await fs.mkdir(path.join(root,'artifacts','r1'),{recursive:true});
  await fs.writeFile(path.join(root,'artifacts','r1','model.patch'),'diff --git a/a b/a\n+fix\n');
  const run={id:'r1',mode:'cli',taskId:'django__django-12325',variant:'all',repeat:1,success:null,testPass:null,externalVerification:'swebench',externalVerificationPending:true,artifacts:'artifacts/r1'};
  await fs.writeFile(path.join(root,'runs','r1.json'),JSON.stringify(run));
  const predFile=path.join(root,'pred.json');
  const preds=await exportSWEbenchPredictions({dir:root,variant:'all',repeat:1,output:predFile});
  assert.equal(preds.length,1); assert.match(preds[0].model_patch,/\+fix/);
  const resultFile=path.join(root,'results.json');
  await fs.writeFile(resultFile,JSON.stringify({schema_version:2,resolved_instances:1,unresolved_instances:0,resolved_ids:['django__django-12325'],unresolved_ids:[]}));
  const imported=await importSWEbenchResults({dir:root,resultsFile:resultFile,variant:'all',repeat:1});
  assert.equal(imported.updated,1);
  const updated=JSON.parse(await fs.readFile(path.join(root,'runs','r1.json'),'utf8'));
  assert.equal(updated.success,true); assert.equal(updated.testPass,true); assert.equal(updated.externalVerificationPending,false);
});
