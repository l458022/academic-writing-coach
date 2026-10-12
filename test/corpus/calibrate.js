/* 重新标定：基于 72 篇真人 + 9 篇 AI 的真实语料，用数据确定各特征的
   阈值与方向，而不是沿用论文或直觉。

   方法：对每个候选特征，画出两类样本的分布，计算区分能力。
   判定标准：方向必须一致（AI 与真人分布分离），否则该特征不可用。 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'assets', 'stylometry.js'), 'utf8');
new Function(src.replace(/^const Stylometry =/m, 'globalThis.Stylometry ='))();
const S = globalThis.Stylometry;

function readDir(d) {
  return fs.readdirSync(d).filter(f => f.endsWith('.txt') && !f.startsWith('_'))
    .map(f => ({ name: f, text: fs.readFileSync(path.join(d, f), 'utf8').trim() }));
}
const H = readDir(path.join(__dirname, 'human'));
const A = readDir(path.join(__dirname, 'ai'));

/* 收集所有候选特征在两类的取值 */
function feats(text) {
  const lr = S.lexicalRichness(text);
  const bu = S.burstiness(text);
  const fw = S.functionWordProfile(text);
  const pu = S.punctuationProfile(text);
  const rd = S.readability(text);
  return {
    ttr: lr.usable ? lr.ttr : null,
    hapax: lr.usable ? lr.hapaxRatio : null,
    lexDensity: lr.usable ? lr.lexicalDensity : null,
    avgWordLen: lr.usable ? lr.avgWordLen : null,
    cv: bu.usable ? bu.cv : null,
    meanSentLen: bu.usable ? bu.mean : null,
    meanDelta: bu.usable ? bu.meanDelta : null,
    drift: bu.usable ? Math.abs(bu.drift) : null,
    fwRatio: fw.usable ? fw.fwRatio : null,
    starterDiv: fw.usable ? fw.starterDiversity : null,
    semicolon: pu.semicolonPer1k,
    dash: pu.dashPer1k,
    paren: pu.parenPer1k,
    colon: pu.colonPer1k,
    excl: pu.exclPer1k,
    question: pu.questionPer1k,
    pAndD: pu.semicolonPer1k + pu.dashPer1k + pu.parenPer1k,
    longWord: rd.usable ? rd.longWordRatio : null,
    flesch: rd.usable ? rd.flesch : null,
  };
}

const FH = H.map(s => feats(s.text));
const FA = A.map(s => feats(s.text));

function col(arr, k) { return arr.map(x => x[k]).filter(v => v != null && isFinite(v)); }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function quantile(a, q) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

console.log('='.repeat(78));
console.log('特征重标定：真实语料分布（72 真人 / 9 AI）');
console.log('='.repeat(78));
console.log('特征'.padEnd(16) + 'AI均值    真人均值   方向    AI[10-90%]          真人[10-90%]');

const rows = [];
for (const k of Object.keys(FH[0])) {
  const a = col(FA, k), h = col(FH, k);
  if (a.length < 3 || h.length < 5) continue;
  const mA = mean(a), mH = mean(h);
  const diff = mA - mH;
  // 用 10% 与 90% 分位重叠程度判断可分性
  const a10 = quantile(a, 0.1), a90 = quantile(a, 0.9);
  const h10 = quantile(h, 0.1), h90 = quantile(h, 0.9);
  // 重叠区间的宽度（越小越可分）
  const overlap = Math.max(0, Math.min(a90, h90) - Math.max(a10, h10));
  const span = Math.max(a90, h90) - Math.min(a10, h10);
  const overlapRatio = span > 0 ? overlap / span : 0;
  const dir = diff > 0 ? 'AI高' : '真人高';
  const f = x => x == null ? '  --  ' : x.toFixed(3).padStart(7);
  console.log(k.padEnd(14) + f(mA) + '  ' + f(mH) + '  ' + dir.padEnd(6)
    + `[${f(a10)},${f(a90)}]`.padEnd(20) + `[${f(h10)},${f(h90)}]`);
  rows.push({ k, mA, mH, diff, overlapRatio, dir, a10, a90, h10, h90 });
}

console.log('\n=== 按可分性排序（重叠比例越低越好）===');
rows.sort((x, y) => x.overlapRatio - y.overlapRatio);
console.log('特征'.padEnd(16) + '重叠比例   方向    建议阈值区间（AI 侧）');
for (const r of rows) {
  const grade = r.overlapRatio < 0.1 ? '★强' : r.overlapRatio < 0.3 ? '◆中' : r.overlapRatio < 0.6 ? '○弱' : '✗不可用';
  // 给出 AI 侧的阈值建议（取 AI 的 10 分位作为"开始偏离"的起点）
  let thr = '';
  if (r.dir === 'AI高') thr = `>= ${r.a10.toFixed(3)} 起算`;
  else thr = `<= ${r.a90.toFixed(3)} 起算`;
  console.log(r.k.padEnd(14) + grade.padEnd(8) + r.overlapRatio.toFixed(3).padEnd(9) + r.dir.padEnd(7) + thr);
}

/* 关键发现：TTR / hapax 的真实方向 */
console.log('\n=== 关键修正 ===');
const ttr = rows.find(r => r.k === 'ttr');
const hapax = rows.find(r => r.k === 'hapax');
const cv = rows.find(r => r.k === 'cv');
console.log(`TTR      : AI ${ttr.mA.toFixed(3)} vs 真人 ${ttr.mH.toFixed(3)}  → ${ttr.dir}  (重叠 ${ttr.overlapRatio.toFixed(3)})`);
console.log(`hapax    : AI ${hapax.mA.toFixed(3)} vs 真人 ${hapax.mH.toFixed(3)}  → ${hapax.dir}  (重叠 ${hapax.overlapRatio.toFixed(3)})`);
console.log(`句长CV   : AI ${cv.mA.toFixed(3)} vs 真人 ${cv.mH.toFixed(3)}  → ${cv.dir}  (重叠 ${cv.overlapRatio.toFixed(3)})`);

fs.writeFileSync(path.join(__dirname, '_calibration.json'),
  JSON.stringify(rows, null, 2));
console.log('\n标定数据已写入 test/corpus/_calibration.json');
