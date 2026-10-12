/* =========================================================================
   现代学生语料重标定（v0.6）
   ---------------------------------------------------------------------
   背景：v0.4 的特征方向与阈值是在"19 世纪公版语料 vs 现代 AI"上标定的，
   存在**时代偏差**。用真实的现代学生语料才能复核这一点。

   本脚本做三件事：
     1) 读出三组语料的原始特征分布（现代AI / 现代学生 / 旧语料）
     2) 对每个特征算 10-90 分位重叠比例，判定它在**现代语料**上是否可用
     3) 输出建议阈值（只报告，不自动改 stylometry.js）

   ⚠️ 隐私说明（重要）：
     本脚本读取 `test/corpus/student/` 下的**现代语料**。该目录**不在本仓库中**，
     因为它原本装的是开发者本人及其同学的真实课程作业——开源时已移除。
     要复现 v0.6 的重标定，请自备语料放进 `test/corpus/student/`：
       · 文件名含 `ai` / `AI` 的 → 视为 AI 生成样本
       · 其余 .txt               → 视为真人写作样本
     建议：真人 ≥4 篇、AI ≥1 篇，每篇 150 词以上，且**来自同一个时代**
     （否则会重蹈"时代偏差"的覆辙）。

   运行：node test/corpus/recalibrate_modern.js
   ========================================================================= */
const fs = require('fs');
const path = require('path');

function loadModule(file, varName) {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'assets', file), 'utf8');
  new Function(src.replace(new RegExp('^const ' + varName + ' =', 'm'),
    'globalThis.' + varName + ' ='))();
  return globalThis[varName];
}
const S = loadModule('stylometry.js', 'Stylometry');

/* ---------------- 特征抽取 ---------------- */
function feats(t) {
  const bu = S.burstiness(t), rd = S.readability(t), pu = S.punctuationProfile(t),
    fw = S.functionWordProfile(t), lr = S.lexicalRichness(t);
  return {
    cv: bu.usable ? bu.cv : null,
    delta: bu.usable ? bu.meanDelta : null,
    mean: bu.usable ? bu.mean : null,
    longWord: rd.usable ? rd.longWordRatio : null,
    asw: rd.usable ? rd.asw : null,
    richPunct: pu.semicolonPer1k + pu.dashPer1k + pu.parenPer1k,
    colon: pu.colonPer1k,
    fwRatio: fw.usable ? fw.fwRatio : null,
    ttr: lr.usable ? lr.ttr : null,
    hapax: lr.usable ? lr.hapaxRatio : null,
    density: lr.usable ? lr.lexicalDensity : null,
    awl: lr.usable ? lr.avgWordLen : null,
  };
}

function quant(arr, p) {
  const a = arr.filter(x => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
}

/* 重叠比例：两类 10-90 区间的交叠 / 并集，越接近 0 越可分 */
function overlapRatio(ai, hu) {
  const a10 = quant(ai, 0.1), a90 = quant(ai, 0.9);
  const h10 = quant(hu, 0.1), h90 = quant(hu, 0.9);
  if (a10 == null || h10 == null) return null;
  const ov = Math.max(0, Math.min(a90, h90) - Math.max(a10, h10));
  const span = Math.max(a90, h90) - Math.min(a10, h10);
  return span > 0 ? ov / span : 0;
}

/* ---------------- 收集语料 ---------------- */
const S_DIR = path.join(__dirname, 'student');

/* ⚠️ 该目录不随仓库分发（内含真实作业，已因隐私移除）。
   找不到就友好退出，而不是抛 ENOENT。 */
if (!fs.existsSync(S_DIR)) {
  console.log('='.repeat(64));
  console.log('未找到 test/corpus/student/ —— 无法执行现代语料重标定');
  console.log('='.repeat(64));
  console.log('');
  console.log('原因：本仓库**不包含任何真实学生作业**（隐私保护），');
  console.log('      而重标定必须用真实的现代语料，否则会重蹈「时代偏差」。');
  console.log('');
  console.log('要复现 v0.6 的重标定，请自备语料放进该目录：');
  console.log('  · 文件名含 ai / AI 的 .txt  → AI 生成样本');
  console.log('  · 其余 .txt                 → 真人写作样本');
  console.log('  建议：真人 ≥4 篇、AI ≥1 篇，每篇 ≥150 词，且同属一个时代。');
  console.log('');
  console.log('（旧语料 human/ 与 ai/ 仍在仓库内，可直接跑 test/corpus/evaluate.js）');
  process.exit(0);
}

/* 按文件名约定区分 AI 与真人：含 ai/AI 的视为 AI 样本 */
const allStudent = fs.readdirSync(S_DIR).filter(f => f.endsWith('.txt'));
const modernAI = allStudent
  .filter(f => /ai/i.test(f))
  .map(f => feats(fs.readFileSync(path.join(S_DIR, f), 'utf8')));
const modernHuman = allStudent
  .filter(f => !/ai/i.test(f))
  .map(f => feats(fs.readFileSync(path.join(S_DIR, f), 'utf8')));

if (!modernAI.length || !modernHuman.length) {
  console.log('⚠️ corpus/student/ 里的样本不足以区分两组（需至少 1 篇 AI + 1 篇真人）。');
  console.log('   文件名含 ai/AI 的记为 AI 样本，其余记为真人样本。');
  process.exit(0);
}
console.log(`现代语料：真人 ${modernHuman.length} 篇 / AI ${modernAI.length} 篇\n`);

const oldHuman = fs.readdirSync(path.join(__dirname, 'human')).filter(f => f.endsWith('.txt'))
  .map(f => feats(fs.readFileSync(path.join(__dirname, 'human', f), 'utf8')));
const oldAI = fs.readdirSync(path.join(__dirname, 'ai')).filter(f => f.endsWith('.txt'))
  .map(f => feats(fs.readFileSync(path.join(__dirname, 'ai', f), 'utf8')));

const CN = {
  cv: '句式CV', delta: '相邻句长差', mean: '平均句长', longWord: '长词占比',
  asw: '平均音节', richPunct: '富标点‰', colon: '冒号‰', fwRatio: '虚词占比',
  ttr: 'TTR', hapax: 'hapax占比', density: '实词密度', awl: '平均词长',
};

console.log('='.repeat(88));
console.log('现代学生语料重标定（v0.6）');
console.log('='.repeat(88));
console.log(`现代 AI 样本 ${modernAI.length} 篇 · 现代学生 ${modernHuman.length} 篇 · ` +
  `旧 AI ${oldAI.length} 篇 · 旧人类 ${oldHuman.length} 篇`);
console.log();

console.log('--- 各特征：现代 AI 是否落进现代人类区间 ---');
console.log('特征'.padEnd(14) + '现代AI中位'.padStart(11) + '人类10%'.padStart(10) +
  '人类90%'.padStart(10) + '  方向'.padStart(10) + '  重叠检验');
console.log('-'.repeat(88));

const verdicts = [];
for (const k of Object.keys(CN)) {
  const ovM = overlapRatio(modernAI.map(x => x[k]), modernHuman.map(x => x[k]));
  const ovO = overlapRatio(oldAI.map(x => x[k]), oldHuman.map(x => x[k]));
  const mAi = quant(modernAI.map(x => x[k]), 0.5);
  const mHu = quant(modernHuman.map(x => x[k]), 0.5);

  let verdict;
  if (ovM == null) verdict = '不可用';
  else if (ovM < 0.05) verdict = '★强（现代）';
  else if (ovM < 0.30) verdict = '有效';
  else if (ovM < 0.60) verdict = '弱';
  else verdict = '✗失效';

  /* ---------- 关键修正：只有 1 篇现代 AI，重叠率必然为 0.000 ----------
     单个点无法构成区间，overlapRatio 一定返回 0。因此**不能**拿 ovM 当分离度。
     改用两个更可靠的判据：
       1) 中位数方向：现代 AI 与旧 AI 的差，是否指向同一侧？（方向一致性）
       2) 人类区间包含：现代 AI 的中位值是否落进现代人类的 10-90 区间？（重叠检验）
  */
  const h10 = quant(modernHuman.map(x => x[k]), 0.1);
  const h90 = quant(modernHuman.map(x => x[k]), 0.9);
  const oAi = quant(oldAI.map(x => x[k]), 0.5);
  const oHu = quant(oldHuman.map(x => x[k]), 0.5);

  // 方向：现代 AI 相对现代人类，落在哪一侧；旧 AI 相对旧人类，是否同侧
  const modernDir = (mAi != null && mHu != null) ? Math.sign(mAi - mHu) : 0;
  const oldDir = (oAi != null && oHu != null) ? Math.sign(oAi - oHu) : 0;
  const dirAgree = modernDir !== 0 && modernDir === oldDir;

  // 重叠检验：现代 AI 的中位值是否落在现代人类区间内（含边缘容差 5%）
  const inHumanRange = (mAi != null && h10 != null && h90 != null) &&
    mAi >= h10 - (h90 - h10) * 0.05 && mAi <= h90 + (h90 - h10) * 0.05;

  // 旧语料上的可分性：旧 AI 中位是否落在旧人类区间内
  const o10 = quant(oldHuman.map(x => x[k]), 0.1);
  const o90 = quant(oldHuman.map(x => x[k]), 0.9);
  const oldInRange = (oAi != null && o10 != null && o90 != null) &&
    oAi >= o10 - (o90 - o10) * 0.05 && oAi <= o90 + (o90 - o10) * 0.05;

  // 重新定级：以"是否落进人类区间"为主，方向一致性为辅
  if (mAi == null || mHu == null) verdict = '不可用';
  else if (!inHumanRange && dirAgree) verdict = '★可用（未重叠+方向一致）';
  else if (!inHumanRange) verdict = '○可用（未重叠）';
  else if (!dirAgree) verdict = '✗失效（重叠且方向相反）';
  else verdict = '△弱（落进人类区间）';

  // 时代伪信号：旧语料能分开（旧 AI 不在旧人类区间），现代分不开（现代 AI 在人类区间）
  let flag = '';
  if (!oldInRange && inHumanRange) flag = '  ⚠️时代伪信号';
  else if (dirAgree && !inHumanRange && oldInRange) flag = '  ↑现代更强';

  verdicts.push({
    key: k, name: CN[k], ovModern: ovM, ovOld: ovO, mAi, mHu, verdict,
    flag: flag || '',
    inHumanRange, dirAgree, h10, h90, oAi, oHu, modernDir, oldDir,
  });

  const fmt = v => v == null ? '--' : v.toFixed(3);
  const fmtDir = d => d > 0 ? 'AI高' : (d < 0 ? 'AI低' : '--');
  console.log(CN[k].padEnd(14) + fmt(mAi).padStart(11) + fmt(h10).padStart(10) +
    fmt(h90).padStart(10) + ('[' + fmtDir(modernDir) + ']').padStart(10) +
    (inHumanRange ? ' ✗重叠' : ' ✓分离') + '  ' + verdict + flag);
}

console.log();
console.log('--- 结论 ---');
console.log('⚠️ 统计警示：现代 AI 仅 1 篇，任何"区间重叠率"都无意义（单点必为 0）。');
console.log('   下面按「现代 AI 中位值是否落进现代人类 10-90 区间」判定，才是有意义的检验。');
console.log();

const usable = verdicts.filter(v => v.verdict.startsWith('★') || v.verdict.startsWith('○'));
const weak = verdicts.filter(v => v.verdict.startsWith('△'));
const dead = verdicts.filter(v => v.verdict.startsWith('✗'));
const fake = verdicts.filter(v => v.flag.includes('时代伪信号'));

console.log(`现代语料上仍可用的特征（${usable.length} 项）：` + usable.map(v => v.name).join('、'));
console.log(`现代语料上偏弱的特征（${weak.length} 项）：` + (weak.map(v => v.name).join('、') || '无'));
console.log(`现代语料上失效的特征（${dead.length} 项）：` + (dead.map(v => v.name).join('、') || '无'));
console.log(`旧语料能分、现代分不开的（时代伪信号，${fake.length} 项）：` + (fake.map(v => v.name).join('、') || '无'));

console.log();
console.log('--- 对 stylometry.js 的建议 ---');
for (const v of dead) {
  console.log(`  · ${v.name}：现代 AI 落在人类区间 [${v.h10.toFixed(3)}~${v.h90.toFixed(3)}] 内，` +
    `中位 ${v.mAi.toFixed(3)} —— **应降权或不用作主判据**`);
}
for (const v of weak) {
  console.log(`  · ${v.name}：现代 AI 中位 ${v.mAi.toFixed(3)} 落进人类区间 ` +
    `[${v.h10.toFixed(3)}~${v.h90.toFixed(3)}]，**仅可作辅助信号**`);
}
for (const v of usable) {
  console.log(`  · ${v.name}：现代 AI 中位 ${v.mAi.toFixed(3)} 在人类区间 ` +
    `[${v.h10.toFixed(3)}~${v.h90.toFixed(3)}] 之外${v.dirAgree ? '，且方向与旧语料一致' : ''} —— **可作主判据**`);
}

// 写报告
const report = {
  generated_at: new Date().toISOString(),
  caveat: '现代 AI 样本仅 1 篇，区间重叠率无统计意义；判定基于"现代 AI 中位值是否落进现代人类 10-90 区间"。',
  samples: {
    modernAI: modernAI.length, modernHuman: modernHuman.length,
    oldAI: oldAI.length, oldHuman: oldHuman.length,
  },
  features: verdicts.map(v => ({
    key: v.key, name: v.name,
    overlap_modern: v.ovModern, overlap_old: v.ovOld,
    ai_median: v.mAi, human_median: v.mHu,
    human_p10: v.h10, human_p90: v.h90,
    in_human_range: v.inHumanRange, dir_agree: v.dirAgree,
    modern_dir: v.modernDir, old_dir: v.oldDir,
    verdict: v.verdict, flag: v.flag.trim(),
  })),
  usable_modern: usable.map(v => v.key),
  weak_modern: weak.map(v => v.key),
  dead_modern: dead.map(v => v.key),
  era_fake_signals: fake.map(v => v.key),
};
fs.writeFileSync(path.join(__dirname, '_recalibration_modern.json'),
  JSON.stringify(report, null, 2));
console.log('\n报告已写入 test/corpus/_recalibration_modern.json');
