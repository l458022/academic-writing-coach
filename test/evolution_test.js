/* 进化能力验证：灌入一批带标注的样本，看系统能否总结出有价值的规律
   场景：模拟 6 篇 AI + 6 篇真人（其中 2 篇真人被误报），
        检验系统是否能：(a) 算出各特征判别力 (b) 发现误报 (c) 给出针对性建议 */
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
  new Function(src.replace(new RegExp('^const ' + varName + ' =', 'm'),
    'globalThis.' + varName + ' ='))();
  return globalThis[varName];
}
const Learner = loadModule('learner.js', 'Learner');

// 构造样本特征（模拟 stylometry 的输出）
const mk = (sig, score, wc = 200) => ({
  score, wordCount: wc, reliable: wc >= 120,
  signals: Object.entries(sig).map(([k, v]) => ({ key: k, aiScore: v })),
  cliche: { hits: sig.cliche >= 20 ? [{ type: '空洞评价' }] : [] },
});

console.log('=== 灌入 12 篇样本（6 AI + 6 真人，其中 2 篇真人误报）===\n');

// AI 样本：套话高、词汇低、句式波动高
const aiSamples = [
  [ { cliche: 95, lexical: 40, burstiness: 75, starter: 15, punct: 85, readability: 90 }, 82 ],
  [ { cliche: 88, lexical: 45, burstiness: 70, starter: 20, punct: 80, readability: 88 }, 78 ],
  [ { cliche: 92, lexical: 38, burstiness: 80, starter: 12, punct: 90, readability: 92 }, 85 ],
  [ { cliche: 30, lexical: 35, burstiness: 65, starter: 18, punct: 78, readability: 85 }, 42 ], // 难例
  [ { cliche: 85, lexical: 42, burstiness: 72, starter: 22, punct: 82, readability: 87 }, 76 ],
  [ { cliche: 90, lexical: 36, burstiness: 68, starter: 10, punct: 88, readability: 91 }, 80 ],
];

// 真人样本：套话 0、词汇高、句式波动不稳定
const humanSamples = [
  [ { cliche: 0, lexical: 78, burstiness: 30, starter: 45, punct: 40, readability: 45 }, 12 ],
  [ { cliche: 0, lexical: 82, burstiness: 25, starter: 50, punct: 35, readability: 40 }, 10 ],
  [ { cliche: 0, lexical: 75, burstiness: 35, starter: 42, punct: 55, readability: 50 }, 18 ],
  [ { cliche: 0, lexical: 70, burstiness: 68, starter: 25, punct: 88, readability: 78 }, 45 ], // 误报1
  [ { cliche: 0, lexical: 72, burstiness: 72, starter: 20, punct: 90, readability: 80 }, 50 ], // 误报2
  [ { cliche: 0, lexical: 80, burstiness: 28, starter: 48, punct: 38, readability: 42 }, 11 ],
];

let idx = 0;
for (const [sig, score] of aiSamples) { Learner.observe('x', mk(sig, score), { score: 0 }, 'UM'); Learner.feedback(idx++, 'ai'); }
for (const [sig, score] of humanSamples) { Learner.observe('x', mk(sig, score), { score: 0 }, 'UM'); Learner.feedback(idx++, 'human'); }

const s = Learner.summarize();
console.log('--- 统计 ---');
console.log(`累计分析 ${s.total} · 已反馈 ${s.feedbackCount} · 确认AI ${s.aiConfirmed} · 确认真人 ${s.humanConfirmed}\n`);

console.log('--- 各特征判别力（按区分度排序）---');
console.log('  特征'.padEnd(16) + 'AI均分  真人均分  区分度');
for (const f of s.perFeature.sort((a, b) => (b.sep ?? -999) - (a.sep ?? -999))) {
  console.log('  ' + f.name.padEnd(14) + String(f.aiAvg).padStart(4) + '   '
    + String(f.humanAvg).padStart(6) + '   ' + (f.sep > 0 ? '+' : '') + f.sep);
}

console.log('\n--- 系统总结出的经验结论 ---');
s.facts.forEach(f => console.log('  • ' + f));

console.log('\n--- 系统给出的调参建议 ---');
if (!s.suggestions.length) console.log('  （无）');
s.suggestions.forEach(g => {
  console.log('  💡 ' + g.title);
  console.log('     理由: ' + g.reason);
  console.log('     行动: ' + g.action);
});

console.log('\n=== 评估 ===');
const checks = [];
checks.push([s.perFeature.length > 0, '能算出各特征判别力']);
checks.push([s.facts.some(f => f.includes('误报')), '能发现误报（2 例真人被判中/高危）']);
checks.push([s.perFeature.some(f => f.key === 'cliche' && f.sep > 60), '识别出套话特征判别力最强']);
checks.push([s.suggestions.length > 0, '给出了可执行的调参建议']);
checks.push([s.facts.some(f => f.includes('区分度')), '报告了整体区分度']);

let pass = 0;
for (const [ok, msg] of checks) { console.log('  ' + (ok ? '✅' : '❌') + ' ' + msg); if (ok) pass++; }
console.log(`\n${pass}/${checks.length} 项进化能力验证通过`);
