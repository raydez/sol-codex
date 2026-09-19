import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateRuns, reportMarkdown } from '../src/benchmark/report.mjs';

const u=n=>({inputTokens:n-100,cachedInputTokens:0,outputTokens:100,totalTokens:n});

test('benchmark aggregation uses cost/tokens per successful task and applies quality gate', () => {
  const runs=[
    {variant:'native',success:true,testPass:true,usage:u(1000),modelTurns:10,toolCalls:5,wallTimeMs:1000},
    {variant:'native',success:true,testPass:true,usage:u(1000),modelTurns:10,toolCalls:5,wallTimeMs:1000},
    {variant:'all',success:true,testPass:true,usage:u(700),modelTurns:8,toolCalls:5,wallTimeMs:800},
    {variant:'all',success:true,testPass:true,usage:u(700),modelTurns:8,toolCalls:5,wallTimeMs:800}
  ];
  const r=aggregateRuns(runs,{successTolerance:0.02});
  assert.equal(r.variants.all.qualityGate,true);
  assert.equal(r.variants.all.tokensPerSuccess,700);
  assert.ok(Math.abs(r.variants.all.tokenSavingPerSuccess-0.3) < 1e-12);
  assert.match(reportMarkdown({generatedAt:'x',...r,runs}),/30\.0%/);
});

test('benchmark quality gate fails when savings come with material success loss', () => {
  const runs=[
    ...Array.from({length:10},(_,i)=>({variant:'native',success:i<9,testPass:i<9,usage:u(1000),modelTurns:10,toolCalls:5,wallTimeMs:1000})),
    ...Array.from({length:10},(_,i)=>({variant:'all',success:i<7,testPass:i<7,usage:u(500),modelTurns:6,toolCalls:4,wallTimeMs:700}))
  ];
  const r=aggregateRuns(runs,{successTolerance:0.02});
  assert.equal(r.variants.all.qualityGate,false);
});
