function mean(xs) { return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null; }
function median(xs) {
  if (!xs.length) return null;
  const a=[...xs].sort((x,y)=>x-y); const m=Math.floor(a.length/2);
  return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
}
function quantile(xs, q) {
  if (!xs.length) return null;
  const a=[...xs].sort((x,y)=>x-y);
  if (a.length===1) return a[0];
  const p=(a.length-1)*q; const lo=Math.floor(p), hi=Math.ceil(p);
  if (lo===hi) return a[lo];
  return a[lo]+(a[hi]-a[lo])*(p-lo);
}

// Mulberry32: deterministic PRNG for reproducible bootstrap reports.
export function seededRandom(seed=0x5eED1234) {
  let a=seed>>>0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function bootstrapCI(values, { iterations=5000, alpha=0.05, seed=0x5eED1234, statistic=mean }={}) {
  const clean=(values||[]).filter(Number.isFinite);
  if (!clean.length) return { estimate:null, low:null, high:null, n:0, iterations:0 };
  const estimate=statistic(clean);
  if (clean.length===1) return { estimate, low:estimate, high:estimate, n:1, iterations:0 };
  const rng=seededRandom(seed); const sims=[];
  for(let b=0;b<iterations;b++) {
    const sample=[];
    for(let i=0;i<clean.length;i++) sample.push(clean[Math.floor(rng()*clean.length)]);
    sims.push(statistic(sample));
  }
  return { estimate, low:quantile(sims,alpha/2), high:quantile(sims,1-alpha/2), n:clean.length, iterations };
}

export function clusterBootstrapDifference(taskRows, { a='native', b='all', field='successRate', iterations=5000, alpha=0.05, seed=0x5eED1234 }={}) {
  const rows=(taskRows||[]).filter(r=>Number.isFinite(r?.[a]?.[field]) && Number.isFinite(r?.[b]?.[field]));
  if (!rows.length) return { estimate:null,low:null,high:null,n:0,iterations:0 };
  const diffs=rows.map(r=>r[b][field]-r[a][field]);
  // Resampling tasks preserves the within-task pairing and repeated-run cluster.
  return bootstrapCI(diffs,{iterations,alpha,seed,statistic:mean});
}

export function clusterBootstrapSaving(taskRows, { baseline='native', variant='all', field='meanTokensPaired', iterations=5000, alpha=0.05, seed=0x51A7E }={}) {
  const rows=(taskRows||[]).filter(r=>Number.isFinite(r?.[baseline]?.[field]) && Number.isFinite(r?.[variant]?.[field]) && r[baseline][field] > 0);
  const savings=rows.map(r=>1-r[variant][field]/r[baseline][field]);
  return bootstrapCI(savings,{iterations,alpha,seed,statistic:mean});
}

function logChoose(n,k) {
  if (k<0 || k>n) return -Infinity;
  k=Math.min(k,n-k); let s=0;
  for(let i=1;i<=k;i++) s += Math.log(n-k+i)-Math.log(i);
  return s;
}
function binomProbHalf(n,k) { return Math.exp(logChoose(n,k)-n*Math.log(2)); }
function binomCdfHalf(n,k) {
  let s=0; for(let i=0;i<=Math.min(k,n);i++) s+=binomProbHalf(n,i); return Math.min(1,s);
}

export function exactTwoSidedSignTest(values) {
  const nonzero=(values||[]).filter(x=>Number.isFinite(x) && x!==0);
  const pos=nonzero.filter(x=>x>0).length; const neg=nonzero.length-pos;
  if (!nonzero.length) return { n:0,positive:0,negative:0,pValue:1 };
  const tail=Math.min(pos,neg);
  return { n:nonzero.length, positive:pos, negative:neg, pValue:Math.min(1,2*binomCdfHalf(nonzero.length,tail)) };
}

export function exactMcNemar(pairs, { left='native', right='all', field='success' }={}) {
  let leftOnly=0,rightOnly=0,both=0,neither=0;
  for(const p of pairs||[]) {
    const a=p?.[left]?.[field]===true, b=p?.[right]?.[field]===true;
    if(a&&b) both++; else if(a&&!b) leftOnly++; else if(!a&&b) rightOnly++; else neither++;
  }
  const n=leftOnly+rightOnly;
  const pValue=n ? Math.min(1,2*binomCdfHalf(n,Math.min(leftOnly,rightOnly))) : 1;
  return { pairs:(pairs||[]).length,both,neither,leftOnly,rightOnly,discordant:n,pValue };
}

export { mean, median, quantile };
