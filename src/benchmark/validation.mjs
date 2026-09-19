import { clusterBootstrapDifference, clusterBootstrapSaving, exactTwoSidedSignTest, exactMcNemar, mean } from './stats.mjs';

function grouped(runs) {
  const byTask=new Map(); const byPair=new Map();
  for(const r of runs||[]) {
    const t=r.taskId||'task'; const rep=Number(r.repeat||1); const variant=r.variant;
    if(!byTask.has(t)) byTask.set(t,{});
    const task=byTask.get(t); if(!task[variant]) task[variant]=[]; task[variant].push(r);
    const pk=`${t}::${rep}`; if(!byPair.has(pk)) byPair.set(pk,{taskId:t,repeat:rep}); byPair.get(pk)[variant]=r;
  }
  return {byTask, pairs:[...byPair.values()]};
}

function taskRows(runs, baseline, variant) {
  const {byTask}=grouped(runs); const rows=[];
  for(const [taskId, variants] of byTask) {
    const row={taskId};
    for(const name of [baseline,variant]) {
      const xs=variants[name]||[];
      if(!xs.length) continue;
      const pairedSuccessTokens=xs.filter(x=>x.success===true && Number(x.usage?.totalTokens||0)>0).map(x=>Number(x.usage.totalTokens));
      row[name]={
        runs:xs.length,
        successRate:mean(xs.map(x=>x.success===true?1:0)),
        testPassRate:mean(xs.map(x=>x.testPass===true?1:0)),
        meanTokensAll:mean(xs.map(x=>Number(x.usage?.totalTokens||0))),
        meanTokensSuccess:mean(pairedSuccessTokens)
      };
    }
    // For paired token inference use repetitions where BOTH variants succeeded.
    const base=variants[baseline]||[], cand=variants[variant]||[];
    const bmap=new Map(base.map(x=>[Number(x.repeat||1),x])); const cmap=new Map(cand.map(x=>[Number(x.repeat||1),x]));
    const bvals=[], cvals=[];
    for(const [rep,b] of bmap) {
      const c=cmap.get(rep); if(!c || !b.success || !c.success) continue;
      const bt=Number(b.usage?.totalTokens||0), ct=Number(c.usage?.totalTokens||0);
      if(bt>0 && ct>=0){bvals.push(bt);cvals.push(ct);}
    }
    if(row[baseline]) row[baseline].meanTokensPaired=mean(bvals);
    if(row[variant]) row[variant].meanTokensPaired=mean(cvals);
    rows.push(row);
  }
  return rows;
}

function fingerprintStatus(runs, baseline, variant) {
  const relevant=(runs||[]).filter(r=>r.variant===baseline||r.variant===variant);
  const cli=relevant.filter(r=>r.mode==='cli');
  const fps=cli.map(r=>r.environmentFingerprint).filter(Boolean);
  if(!cli.length) return { status:'not-applicable', unique:0, missing:0 };
  const missing=cli.length-fps.length;
  const keys=new Set(fps.map(f=>JSON.stringify({
    codexVersion:f.codexVersion||null,solCodexVersion:f.solCodexVersion||null,
    model:f.model||null,reasoningEffort:f.reasoningEffort||null,
    sandbox:f.sandbox||null,manifestHash:f.manifestHash||null
  })));
  if(missing>0) return {status:'missing',unique:keys.size,missing};
  return {status:keys.size<=1?'consistent':'mismatch',unique:keys.size,missing:0};
}

export function validateVariant(runs, {
  baseline='native', variant='all', tolerance=0.02, alpha=0.05,
  bootstrapIterations=5000, minTasks=30, minPairedSuccessfulTasks=20, seed=20260919
}={}) {
  const rows=taskRows(runs,baseline,variant);
  const {pairs}=grouped(runs);
  const comparablePairs=pairs.filter(p=>p[baseline]&&p[variant]);
  const successCI=clusterBootstrapDifference(rows,{a:baseline,b:variant,field:'successRate',iterations:bootstrapIterations,alpha,seed});
  const testCI=clusterBootstrapDifference(rows,{a:baseline,b:variant,field:'testPassRate',iterations:bootstrapIterations,alpha,seed:seed+1});
  const savingCI=clusterBootstrapSaving(rows,{baseline,variant,field:'meanTokensPaired',iterations:bootstrapIterations,alpha,seed:seed+2});
  const perTaskSavings=rows.filter(r=>Number.isFinite(r?.[baseline]?.meanTokensPaired)&&Number.isFinite(r?.[variant]?.meanTokensPaired)&&r[baseline].meanTokensPaired>0)
    .map(r=>1-r[variant].meanTokensPaired/r[baseline].meanTokensPaired);
  const sign=exactTwoSidedSignTest(perTaskSavings);
  const mcnemarSuccess=exactMcNemar(comparablePairs,{left:baseline,right:variant,field:'success'});
  const mcnemarTest=exactMcNemar(comparablePairs,{left:baseline,right:variant,field:'testPass'});

  const distinctComparableTasks=rows.filter(r=>r[baseline]&&r[variant]).length;
  const environment=fingerprintStatus(runs,baseline,variant);
  const qualityPoint = successCI.estimate!==null && testCI.estimate!==null && successCI.estimate>=-tolerance && testCI.estimate>=-tolerance;
  const qualityCI = successCI.low!==null && testCI.low!==null && successCI.low>=-tolerance && testCI.low>=-tolerance;
  const savingPositive = savingCI.low!==null && savingCI.low>0;
  const sampleAdequate = distinctComparableTasks>=minTasks && savingCI.n>=minPairedSuccessfulTasks;
  let status='inconclusive';
  if (successCI.high!==null && successCI.high < -tolerance) status='quality-regression';
  else if (testCI.high!==null && testCI.high < -tolerance) status='quality-regression';
  else if (environment.status==='mismatch' || environment.status==='missing') status='environment-mismatch';
  else if (sampleAdequate && qualityCI && savingPositive) status='supported';

  return {
    baseline,variant,alpha,tolerance,bootstrapIterations,
    distinctComparableTasks,pairedRuns:comparablePairs.length,pairedSuccessfulTasks:savingCI.n,
    minimums:{tasks:minTasks,pairedSuccessfulTasks:minPairedSuccessfulTasks},
    sampleAdequate,qualityPoint,qualityCI,tokenSavingPositive95:savingPositive,status,environment,
    successDelta:successCI,testPassDelta:testCI,pairedTokenSaving:savingCI,
    tokenSavingSignTest:sign,mcnemarSuccess,mcnemarTestPass:mcnemarTest
  };
}

export function validationSummary(v) {
  const p=x=>x==null?'—':`${(100*x).toFixed(1)}%`;
  const ci=x=>x?.estimate==null?'—':`${p(x.estimate)} [${p(x.low)}, ${p(x.high)}]`;
  return [
    `Validation status: ${v.status.toUpperCase()}`,
    `Comparable tasks: ${v.distinctComparableTasks} (minimum ${v.minimums.tasks})`,
    `Paired successful tasks: ${v.pairedSuccessfulTasks} (minimum ${v.minimums.pairedSuccessfulTasks})`,
    `Success delta: ${ci(v.successDelta)}`,
    `Test-pass delta: ${ci(v.testPassDelta)}`,
    `Paired token saving: ${ci(v.pairedTokenSaving)}`,
    `Token sign-test p: ${Number(v.tokenSavingSignTest.pValue).toFixed(4)}`,
    `Quality non-inferiority CI gate: ${v.qualityCI?'PASS':'FAIL/INCONCLUSIVE'}`,
    `Positive token-saving CI gate: ${v.tokenSavingPositive95?'PASS':'FAIL/INCONCLUSIVE'}`
  ].join('\n');
}
