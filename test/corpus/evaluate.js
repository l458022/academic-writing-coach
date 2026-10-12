/* 批量评估：用真实语料跑检测器，量化漏报率与误报率
   这是改进检测器的事实依据，而非凭印象调参。

   用法：node test/corpus/evaluate.js
   输出：混淆矩阵 + 各特征的判别力 + 失败案例明细 */
const fs = require('fs');
const path = require('path');

/* ---- 加载检测模块（与浏览器一致的方式）---- */
const _store = {};
global.localStorage = {
  getItem: k => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};
function loadModule(file, varName) {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'assets', file), 'utf8');
  new Function(src.replace(new RegExp('^const ' + varName + ' =', 'm'),
    'globalThis.' + varName + ' ='))();
  return globalThis[varName];
}
const Learner = loadModule('learner.js', 'Learner');
const Stylometry = loadModule('stylometry.js', 'Stylometry');
const DuplicateCheck = loadModule('duplicate.js', 'DuplicateCheck');

/* ---- 加载知识库（检测器需要 ai_tells / chinglish）---- */
const kb = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'web', 'assets', 'knowledge_base.json'), 'utf8'));

/* ---- 读取语料 ---- */
function readDir(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.txt') || f.startsWith('_')) continue;
    out.push({ name: f, text: fs.readFileSync(path.join(dir, f), 'utf8').trim() });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const human = readDir(path.join(__dirname, 'human'));
const ai = readDir(path.join(__dirname, 'ai'));

/* ---- 判定阈值（与产品一致）---- */
const HIGH = 60, MID = 35;

function judge(score) {
  if (score >= HIGH) return 'high';
  if (score >= MID) return 'mid';
  return 'low';
}

/* ---- 逐样本分析 ---- */
function run(samples, label) {
  return samples.map(s => {
    const st = Stylometry.analyze(s.text, kb);
    const dp = DuplicateCheck.analyze(s.text, kb);
    const sig = {};
    for (const x of st.signals) sig[x.key] = x.aiScore;
    return {
      label, name: s.name,
      ai: st.score, dup: dp.score,
      band: judge(Math.max(st.score, dp.score)),
      words: st.wordCount,
      reliable: st.reliable,
      sig,
      clicheHits: st.cliche ? st.cliche.hits.length : 0,
    };
  });
}

const R = [...run(human, 'human'), ...run(ai, 'ai')];

/* ---- 混淆矩阵（以"高危"为阳性判定）---- */
const H = R.filter(r => r.label === 'human');
const A = R.filter(r => r.label === 'ai');

// 用 ai 倾向分判定（查重的判据不同，这里聚焦 AI 检测）
const tp = A.filter(r => judge(r.ai) === 'high').length;   // AI 判高危 = 命中
const fn_ = A.filter(r => judge(r.ai) !== 'high').length;  // AI 未判高危 = 漏报
const tn = H.filter(r => judge(r.ai) === 'low').length;    // 真人判低 = 正确
const fp = H.filter(r => judge(r.ai) !== 'low').length;    // 真人判中/高 = 误报

console.log('='.repeat(64));
console.log('检测器批量评估（真实语料）');
console.log('='.repeat(64));
console.log(`真人语料 ${H.length} 篇（Project Gutenberg 公版）`);
console.log(`AI  语料 ${A.length} 篇（人工模拟 LLM 风格）`);
console.log('');

console.log('--- 混淆矩阵（AI 倾向分，高危=阳性）---');
console.log('                       判为高危/中      判为低');
console.log(`  实为 AI (${String(A.length).padStart(2)})        ${String(tp).padStart(2)} (命中)      ${String(fn_).padStart(2)} (漏报)`);
console.log(`  实为真人(${String(H.length).padStart(2)})        ${String(fp).padStart(2)} (误报)      ${String(tn).padStart(2)} (正确)`);
console.log('');

const recall = A.length ? (tp / A.length * 100).toFixed(1) : '--';
const fpr = H.length ? (fp / H.length * 100).toFixed(1) : '--';
const precision = (tp + fp) ? (tp / (tp + fp) * 100).toFixed(1) : '--';
console.log(`漏报率 (AI 未被判高危): ${fn_} / ${A.length} = ${(100 - recall).toFixed(1)}%`);
console.log(`误报率 (真人被判中/高): ${fp} / ${H.length} = ${fpr}%`);
console.log(`命中率 (recall)      : ${recall}%`);
console.log(`精确率 (precision)   : ${precision}%`);
console.log('');

/* ---- 分数分布 ---- */
function stats(arr) {
  if (!arr.length) return '（无）';
  const s = [...arr].sort((a, b) => a - b);
  const mean = (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1);
  return `均 ${mean} · 中位 ${s[Math.floor(s.length / 2)]} · 范围 ${s[0]}-${s[s.length - 1]}`;
}
console.log('--- AI 倾向分分布 ---');
console.log('  真人:', stats(H.map(r => r.ai)));
console.log('  AI  :', stats(A.map(r => r.ai)));
console.log('');

/* ---- 各特征判别力 ---- */
const keys = ['cliche', 'lexical', 'burstiness', 'starter', 'punct', 'readability'];
const FEAT_CN = {
  cliche: 'AI 套话密度', lexical: '词汇丰富度', burstiness: '句式波动',
  starter: '句首多样性', punct: '标点形式', readability: '可读性',
};
console.log('--- 各特征判别力（AI 均分 vs 真人均分）---');
console.log('  特征'.padEnd(16) + 'AI均分  真人均分  区分度');
const feats = keys.map(k => {
  const av = A.map(r => r.sig[k]).filter(v => v != null);
  const hv = H.map(r => r.sig[k]).filter(v => v != null);
  const m = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const mA = m(av), mH = m(hv);
  return { k, name: FEAT_CN[k], mA, mH, sep: (mA != null && mH != null) ? mA - mH : null };
}).sort((a, b) => (b.sep ?? -999) - (a.sep ?? -999));
for (const f of feats) {
  const fmt = v => v == null ? ' -- ' : v.toFixed(1).padStart(5);
  console.log('  ' + f.name.padEnd(14) + fmt(f.mA) + '   ' + fmt(f.mH) + '   '
    + (f.sep > 0 ? '+' : '') + (f.sep == null ? '--' : f.sep.toFixed(1)));
}
console.log('');

/* ---- 失败案例明细 ---- */
console.log('--- 漏报案例（AI 未被判高危）---');
const misses = A.filter(r => judge(r.ai) !== 'high').sort((a, b) => a.ai - b.ai);
if (!misses.length) console.log('  （无）');
for (const r of misses) {
  console.log(`  ${r.name.padEnd(28)} 分 ${String(r.ai).padStart(3)} [${r.band}] ${r.words}词  套话命中 ${r.clicheHits}`);
  console.log(`      套话${r.sig.cliche ?? '-'} 词汇${r.sig.lexical ?? '-'} 句式${r.sig.burstiness ?? '-'} 标点${r.sig.punct ?? '-'} 可读${r.sig.readability ?? '-'}`);
}
console.log('');

console.log('--- 误报案例（真人被判中/高）---');
const fps = H.filter(r => judge(r.ai) !== 'low').sort((a, b) => b.ai - a.ai);
if (!fps.length) console.log('  （无）');
for (const r of fps) {
  console.log(`  ${r.name.padEnd(28)} 分 ${String(r.ai).padStart(3)} [${r.band}] ${r.words}词  套话命中 ${r.clicheHits}`);
  console.log(`      套话${r.sig.cliche ?? '-'} 词汇${r.sig.lexical ?? '-'} 句式${r.sig.burstiness ?? '-'} 标点${r.sig.punct ?? '-'} 可读${r.sig.readability ?? '-'}`);
}
console.log('');

/* ---- 写报告 ---- */
const report = {
  generated: new Date().toISOString(),
  human_count: H.length, ai_count: A.length,
  confusion: { tp, fn: fn_, tn, fp },
  metrics: {
    miss_rate: (100 - +recall).toFixed(1) + '%',
    false_positive_rate: fpr + '%',
    recall: recall + '%',
    precision: precision + '%',
  },
  distribution: { human: stats(H.map(r => r.ai)), ai: stats(A.map(r => r.ai)) },
  features: feats.map(f => ({
    key: f.k, name: f.name,
    ai_avg: f.mA == null ? null : +f.mA.toFixed(1),
    human_avg: f.mH == null ? null : +f.mH.toFixed(1),
    separation: f.sep == null ? null : +f.sep.toFixed(1),
  })),
  misses: misses.map(r => ({ name: r.name, score: r.ai, words: r.words, clicheHits: r.clicheHits })),
  false_positives: fps.map(r => ({ name: r.name, score: r.ai, words: r.words, clicheHits: r.clicheHits })),
};
fs.writeFileSync(path.join(__dirname, '_report.json'), JSON.stringify(report, null, 2));
console.log('报告已写入 test/corpus/_report.json');
