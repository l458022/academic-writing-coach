/* Learner 逻辑实跑测试（在 Node 里用 localStorage 桩替代浏览器存储）
   验证：记录指纹 / 反馈 / 总结 / 调参生效 / 重置 */
const fs = require('fs');
const path = require('path');

// ---- 造一个最小 localStorage 桩 ----
const _store = {};
global.localStorage = {
  getItem: k => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};

// ---- 加载 learner.js ----
const src = fs.readFileSync(
  path.join(__dirname, '..', 'web', 'assets', 'learner.js'), 'utf8');
const mod = { exports: {} };
// 把 const Learner = 改成 globalThis.Learner =
const patched = src.replace(/^const Learner =/m, 'globalThis.Learner =');
new Function(patched)();
const L = globalThis.Learner;

console.log('=== Learner 加载 ===');
console.log('DEFAULT_TUNING =', JSON.stringify(L.DEFAULT_TUNING));

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.log('  ❌', msg); }
}

// ---- 1. 初始状态 ----
console.log('\n=== 1. 初始状态 ===');
let s = L.summarize();
ok(s.total === 0, '初始 total = 0');
ok(s.facts.length === 1, '空库时给出一条引导语');

// ---- 2. 记录分析（模拟 stylo/dup 结果） ----
console.log('\n=== 2. 记录两次分析 ===');
const mkStylo = (score, sig) => ({
  score, wordCount: 200, reliable: true,
  signals: Object.entries(sig).map(([k, v]) => ({ key: k, aiScore: v })),
  cliche: { hits: [{ type: '空洞评价' }, { type: '空洞因果' }] },
});
L.observe('some text a', mkStylo(78, { cliche: 90, lexical: 60, burstiness: 80, starter: 30, punct: 70, readability: 65 }), { score: 30 }, 'UM');
L.observe('some text b', mkStylo(12, { cliche: 0, lexical: 10, burstiness: 5, starter: 8, punct: 60, readability: 70 }), { score: 0 }, 'UM');
s = L.summarize();
ok(s.total === 2, 'total = 2');

// ---- 3. 反馈：第一条确认 AI，第二条确认真人 ----
console.log('\n=== 3. 反馈标注 ===');
L.feedback(0, 'ai');
L.feedback(1, 'human');
s = L.summarize();
ok(s.feedbackCount === 2, 'feedbackCount = 2');
ok(s.aiConfirmed === 1, 'aiConfirmed = 1');
ok(s.humanConfirmed === 1, 'humanConfirmed = 1');

// ---- 4. 特征判别力表 ----
console.log('\n=== 4. 各特征判别力 ===');
const cf = s.perFeature.find(f => f.key === 'cliche');
const cx = s.perFeature.find(f => f.key === 'lexical');
ok(cf && cf.aiAvg === 90 && cf.humanAvg === 0, `套话特征：AI=${cf && cf.aiAvg} 人类=${cf && cf.humanAvg}`);
ok(cf && cf.sep === 90, `套话区分度 sep=${cf && cf.sep}`);
ok(cx && cx.sep > 0, `词汇特征区分度为正 sep=${cx && cx.sep}`);

// ---- 5. 误报检测：给一条"真人写的但被判高危"的样本 ----
console.log('\n=== 5. 误报检测 ===');
const mkH = sig => ({
  score: 52, wordCount: 200, reliable: true,
  signals: Object.entries(sig).map(([k, v]) => ({ key: k, aiScore: v })),
  cliche: { hits: [] },   // 无套话命中
});
L.observe('human text c', mkH({ cliche: 0, lexical: 45, burstiness: 70, starter: 20, punct: 88, readability: 75 }), { score: 0 }, '');
L.feedback(2, 'human');   // 用户说：这是真人写的，但你判了 52
s = L.summarize();
const hasFalseHigh = s.facts.some(f => f.includes('误报'));
ok(hasFalseHigh, '检测到误报并写入经验结论');
const hasSug = s.suggestions.length > 0;
ok(hasSug, '给出调参建议（不自动应用）');
console.log('  建议条数:', s.suggestions.length);
s.suggestions.forEach(g => console.log('   -', g.title));

// ---- 6. 阈值生效：改 statCap 后 stylometry 应读到新值 ----
console.log('\n=== 6. 调参生效验证 ===');
const before = L.getTuning().statCap;
L.applyTuning({ statCap: 40 }, '测试：下调统计上限');
const after = L.getTuning().statCap;
ok(before === 48 && after === 40, `statCap ${before} → ${after}`);
const s2 = L.summarize();
ok(s2.edits.length === 1, '调参历史记录了 1 条');

// ---- 7. 导出 / 导入 ----
console.log('\n=== 7. 导出与导入 ===');
const json = L.exportJSON();
ok(json.includes('"records"'), '导出 JSON 含 records');
const imp = L.importJSON(json);
ok(imp.ok, '导入成功：' + imp.msg);
const bad = L.importJSON('{"foo":1}');
ok(!bad.ok, '非法格式被拒绝：' + bad.msg);

// ---- 8. 重置 ----
console.log('\n=== 8. 重置 ===');
L.reset();
const s3 = L.summarize();
ok(s3.total === 0, '重置后 total = 0');
ok(L.getTuning().statCap === 48, '重置后阈值回默认 48');

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
