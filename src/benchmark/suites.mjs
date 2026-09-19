import fs from 'node:fs/promises';
import path from 'node:path';

const BUILTIN = new URL('../../benchmark/suites/swebench-verified-30.json', import.meta.url);

export async function loadBuiltinSuite(name='swebench-verified-30') {
  if(name!=='swebench-verified-30') throw new Error(`Unknown built-in suite: ${name}`);
  return JSON.parse(await fs.readFile(BUILTIN,'utf8'));
}

export async function fetchSWEbenchVerifiedRows({ ids, output, dataset='SWE-bench/SWE-bench_Verified', fetchFn=fetch }) {
  const wanted=new Set(ids||[]); const found=new Map();
  const page=100;
  for(let offset=0; offset<500 && found.size<wanted.size; offset+=page) {
    const url=`https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(dataset)}&config=default&split=test&offset=${offset}&length=${page}`;
    const res=await fetchFn(url,{headers:{'user-agent':'sol-codex/0.2.1'}});
    if(!res.ok) throw new Error(`Hugging Face dataset fetch failed: HTTP ${res.status}`);
    const doc=await res.json();
    for(const item of doc.rows||[]) {
      const row=item.row||item; if(wanted.has(row.instance_id)) found.set(row.instance_id,row);
    }
  }
  const missing=[...wanted].filter(x=>!found.has(x));
  if(missing.length) throw new Error(`Dataset rows not found: ${missing.join(', ')}`);
  const rows=ids.map(id=>found.get(id));
  if(output) {
    const abs=path.resolve(output); await fs.mkdir(path.dirname(abs),{recursive:true});
    await fs.writeFile(abs,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  }
  return rows;
}
