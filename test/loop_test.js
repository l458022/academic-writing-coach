/* 验证：Learner 的阈值是否真正影响 stylometry 的判定（闭环是否打通） */
const fs = require('fs');
const path = require('path');

const _store = {};
global.localStorage = {
  getItem: k => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};

function loadModule(file, varName) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'assets', file), 'utf8');
  const patched = src.replace(new RegExp('^const ' + varName + ' =', 'm'),
    'globalThis.' + varName + ' =');
  new Function(patched)();
  return globalThis[varName];
}

loadModule('learner.js', 'Learner');
const Stylometry = loadModule('stylometry.js', 'Stylometry');

// 一段"无套话命中的真人写作"——最容易触发纯统计限幅的场景
const humanText = `The deferred tax liability on AirAsia's balance sheet increased by 340 million ringgit between 2022 and 2023, which is odd given that the group reported a pre-tax loss that year. Working through note 14, most of the movement traces back to temporary differences on leased aircraft. My supervisor thinks this is aggressive but probably defensible. I'm less sure. The lease liabilities were reclassified in 2021 and I can't find where the corresponding deferred tax was recognised, which bothers me. Either way, the cash tax paid was only 12 million, so whatever the accounting says, they aren't handing over much to LHDN. The auditor signed off without qualification, which I find surprising given the disclosure gaps in the segment note.`;

const kb = { ai_tells: [] };   // 空词库 → 必然无套话命中

console.log('=== 闭环验证：阈值来自经验库 ===\n');

const t0 = Stylometry.analyze(humanText, kb);
console.log('默认阈值   statCap =', t0.tuningUsed.statCap);
console.log('  AI 倾向 =', t0.score, '| 套话分 =',
  (t0.signals.find(s => s.key === 'cliche') || {}).aiScore);
const s0 = t0.score;

// 模拟：用户反馈这条被误报 → 采纳建议下调 statCap
globalThis.Learner.applyTuning({ statCap: 35 }, '闭环测试');

const t1 = Stylometry.analyze(humanText, kb);
console.log('\n下调后     statCap =', t1.tuningUsed.statCap);
console.log('  AI 倾向 =', t1.score);
const s1 = t1.score;

console.log('\n=== 结论 ===');
console.log(`默认 ${s0} → 下调 statCap 后 ${s1}`);
if (s1 < s0) {
  console.log('✅ 闭环打通：经验库的阈值确实改变了判定结果（分数下降）');
} else if (s1 === s0) {
  console.log('⚠️  分数未变——可能该文本得分本就低于 statCap，未触及上限。');
  console.log('   这是正常的（限幅未生效≠闭环断裂）。为严格验证，需要一段得分高于 statCap 的文本。');
} else {
  console.log('❌ 异常：下调上限反而升高，逻辑有误');
}

// 额外：直接用一段高分纯统计文本（人为调高 lexical 触发）验证限幅
console.log('\n=== 补充：statCap 闭环验证（证据薄弱样本）===');
/* 注意：v0.4 起融合逻辑分四支，statCap 只在"强特征票数 < 2"时生效。
   因此必须选证据薄弱的样本才能验证该分支——用真人语料中票数 0 的样本最合适。 */
const fs2 = require('fs');
const hdir = require('path').join(__dirname, 'corpus', 'human');
let weakText = null, weakName = '';
if (fs2.existsSync(hdir)) {
  for (const f of fs2.readdirSync(hdir)) {
    if (!f.endsWith('.txt') || f.startsWith('_')) continue;
    const t = fs2.readFileSync(require('path').join(hdir, f), 'utf8').trim();
    const r = Stylometry.analyze(t, kb);
    const votes = r.signals.filter(x =>
      ['punct', 'burstiness', 'lexical', 'readability', 'starter'].includes(x.key)
      && x.aiScore >= 65).length;
    // 需要票数 0 且分数高于 statCap 下限，才能观察到限幅效果
    if (votes === 0 && r.score >= 20) { weakText = t; weakName = f; break; }
  }
}
if (!weakText) {
  console.log('⚠️  未找到票数为 0 的样本（需先运行 corpus/fetch_human.py）');
} else {
  console.log('使用样本:', weakName);
  globalThis.Learner.reset();
  globalThis.Learner.applyTuning({ statCap: 48 }, '测试起点');
  const s48 = Stylometry.analyze(weakText, kb).score;
  globalThis.Learner.applyTuning({ statCap: 15 }, '测试：大幅下调');
  const s15 = Stylometry.analyze(weakText, kb).score;
  console.log(`statCap 48 → ${s48}；statCap 15 → ${s15}`);
  if (s15 < s48) {
    console.log('✅ statCap 闭环生效：下调后分数被压得更低');
  } else {
    console.log('⚠️  分数未变——该样本得分可能低于所有上限，属正常');
  }
  globalThis.Learner.reset();
}
