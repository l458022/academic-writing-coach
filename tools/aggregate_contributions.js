#!/usr/bin/env node
/* =========================================================================
   匿名贡献包聚合 → 阈值建议
   ---------------------------------------------------------------------
   用途：把多份「匿名贡献包」（由网页 Learner.exportContribution() 导出）
   汇总起来，算出各特征在「真人 / AI」两类上的分布，并给出可执行的
   阈值调整建议。

   为什么需要它：项目长期缺**现代真实语料**——README 里反复承认
   「现代 AI 样本仅 1 篇，不足以精确标定」。靠单机积累太慢，
   汇总多人的匿名特征分布才能真正改进检测器。

   ⚠️ 贡献包里**没有原文**，只有统计量。本脚本也从不接触原文。

   用法：
     node tools/aggregate_contributions.js <包1.json> [包2.json ...]
     node tools/aggregate_contributions.js --dir <存放贡献包的目录>
     node tools/aggregate_contributions.js --dir ./contributions --min-n 3

   输出：分布对比表 + 阈值建议（**只报告，不自动改代码**）
   ========================================================================= */
const fs = require('fs');
const path = require('path');

/* ---------------- 特征元数据 ---------------- */
/* dir = 期望方向：AI 应该更高(+1) 还是更低(-1)。用于判断阈值该往哪调。 */
const FEATURES = {
  cv:        { name: '句式CV',      dir: -1, hint: '人类写作句长起伏更大；CV 偏低更像 AI' },
  delta:     { name: '相邻句长差',   dir: -1, hint: '同上，AI 句子长度过于均匀' },
  mean:      { name: '平均句长',     dir: -1, hint: '⚠️ 已知时代伪信号，现代语料上常失效' },
  longWord:  { name: '长词占比',     dir: +1, hint: 'AI 偏爱长词与抽象名词' },
  asw:       { name: '平均音节',     dir: +1, hint: '同上' },
  richPunct: { name: '富标点‰',      dir: -1, hint: '⚠️ 已知时代伪信号（人类更爱用分号破折号）' },
  colon:     { name: '冒号‰',        dir: -1, hint: 'AI 很少用冒号引出清单' },
  fwRatio:   { name: '虚词占比',     dir: -1, hint: '⚠️ 已知时代伪信号' },
  ttr:       { name: '类符形符比',   dir: -1, hint: 'AI 词汇重复度更均匀' },
  hapax:     { name: '一次词占比',   dir: -1, hint: '同上' },
  density:   { name: '实词密度',     dir: +1, hint: '⚠️ 已知时代伪信号' },
  awl:       { name: '平均词长',     dir: +1, hint: 'AI 用词更长' },
};

/* 被实测证伪、不建议再作主判据的特征（README 有记录） */
const DEPRECATED = new Set(['mean', 'richPunct', 'fwRatio', 'density']);

/* ---------------- 工具 ---------------- */
function quant(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;

function readBundle(p) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (j.format !== 'wb-coach-contribution-v1') {
    throw new Error(`不是贡献包格式：${path.basename(p)}（format=${j.format}）`);
  }
  return j;
}

/* ---------------- 主流程 ---------------- */
function main() {
  const args = process.argv.slice(2);
  let files = [];
  let minN = 2;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') {
      const d = args[++i];
      if (!fs.existsSync(d)) { console.error(`目录不存在：${d}`); process.exit(1); }
      files.push(...fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => path.join(d, f)));
    } else if (args[i] === '--min-n') {
      minN = parseInt(args[++i], 10) || 2;
    } else {
      files.push(args[i]);
    }
  }

  if (!files.length) {
    console.log('用法：node tools/aggregate_contributions.js <包1.json> [包2.json ...]');
    console.log('      node tools/aggregate_contributions.js --dir <目录> [--min-n N]');
    process.exit(0);
  }

  /* 1) 读入并合并 */
  const bundles = [];
  const contributors = new Set();
  for (const f of files) {
    try {
      const b = readBundle(f);
      bundles.push(b);
      contributors.add(b.contributor || 'unknown');
    } catch (e) {
      console.error(`⚠️ 跳过 ${path.basename(f)}：${e.message}`);
    }
  }
  const samples = bundles.flatMap(b => b.samples || []);
  const ai = samples.filter(s => s.label === 'ai');
  const hu = samples.filter(s => s.label === 'human');
  const unlabeled = samples.filter(s => s.label === 'unknown');

  console.log('='.repeat(70));
  console.log('匿名贡献包聚合报告');
  console.log('='.repeat(70));
  console.log(`贡献包 ${bundles.length} 份 · 贡献者 ${contributors.size} 人 · 样本 ${samples.length} 条`);
  console.log(`  AI 标注 ${ai.length} · 真人标注 ${hu.length} · 未标注 ${unlabeled.length}（不参与对比）`);
  console.log('');

  if (ai.length < minN || hu.length < minN) {
    console.log(`⚠️ 样本不足（需各类 ≥${minN} 条，当前 AI ${ai.length} / 真人 ${hu.length}）。`);
    console.log('   统计量在样本过少时没有意义 —— 继续积累，或调低 --min-n（不推荐）。');
    process.exit(0);
  }

  /* 2) 逐特征对比 */
  console.log('--- 特征分布对比（AI vs 真人）---');
  console.log('特征'.padEnd(12) + 'AI中位'.padStart(9) + '真人区间(10-90)'.padStart(22) + '方向'.padStart(7) + '  判定');
  console.log('-'.repeat(70));

  const verdicts = [];
  for (const key of Object.keys(FEATURES)) {
    const meta = FEATURES[key];
    const av = ai.map(s => s.raw && s.raw[key]).filter(v => v != null);
    const hv = hu.map(s => s.raw && s.raw[key]).filter(v => v != null);
    if (av.length < minN || hv.length < minN) continue;

    const aMed = quant(av, 0.5);
    const h10 = quant(hv, 0.1), h90 = quant(hv, 0.9);
    // AI 中位值是否落在真人 10-90 区间内 → 落入即"该特征无法区分"
    const inside = aMed >= h10 && aMed <= h90;
    const sep = r3(aMed - quant(hv, 0.5));

    let verdict;
    if (DEPRECATED.has(key)) verdict = '⛔ 已知伪信号';
    else if (inside) verdict = '❌ 无区分力';
    else verdict = '✅ 可用';

    console.log(
      meta.name.padEnd(12) +
      String(r3(aMed)).padStart(9) +
      `  ${r3(h10)} ~ ${r3(h90)}`.padStart(22) +
      (sep > 0 ? '  AI高' : '  AI低').padStart(7) +
      '  ' + verdict
    );
    verdicts.push({ key, name: meta.name, aMed: r3(aMed), h10: r3(h10), h90: r3(h90), sep, inside, verdict, meta });
  }

  /* 3) 阈值建议 */
  console.log('');
  console.log('--- 阈值建议（供人工判断，不自动改代码）---');
  const usable = verdicts.filter(v => v.verdict === '✅ 可用');
  const dead = verdicts.filter(v => v.verdict === '❌ 无区分力');

  if (dead.length) {
    console.log('');
    console.log('【建议降权或剔除】以下特征在当前语料上无法区分两类：');
    for (const v of dead) {
      console.log(`  · ${v.name}：AI 中位 ${v.aMed} 落进真人区间 ${v.h10}~${v.h90}`);
    }
  }

  if (usable.length) {
    console.log('');
    console.log('【可作主判据】以下特征在当前语料上仍完全分离，可提高权重：');
    for (const v of usable) {
      const bound = v.meta.dir < 0 ? v.h90 : v.h10;   // 真人区间的"AI 侧"边界
      console.log(`  · ${v.name}：真人 ${v.meta.dir < 0 ? '上沿' : '下沿'} ${bound} → 阈值可取 ${bound} 再留余量`);
      console.log(`      ${v.meta.hint}`);
    }
  }

  console.log('');
  console.log('⚠️ 落地前必须做的两件事：');
  console.log('   1) 用 test/corpus/evaluate.js 跑回归，确认漏报/误报没有变差；');
  console.log('   2) 记下改前的指标，便于回退（本项目曾因样本不足过度拟合，把 AI 分从 95 压到 47）。');
  console.log('');
}

main();
