/* =========================================================================
   文献真实性溯源审查模块测试
   运行：node test/citation_test.js
   ========================================================================= */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? '  → ' + extra : ''}`); }
}
function section(t) { console.log('\n' + t); }

/* ---- 按浏览器的方式加载模块 ---- */
function loadModule(file, varName) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'assets', file), 'utf8');
  new Function(src.replace(new RegExp('^const ' + varName + ' =', 'm'),
    'globalThis.' + varName + ' ='))();
  return globalThis[varName];
}
const CitationAudit = loadModule('citation.js', 'CitationAudit');
const KB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'assets', 'knowledge_base.json'), 'utf8'));

/* ---------------- 测试样本 ---------------- */

// 典型 AI 幻觉引用：正文引了一堆，参考文献列表缺失；「研究表明」满天飞；数字无出处
const AI_FABRICATED = `Artificial intelligence has revolutionized modern education. Studies have shown that AI-assisted learning improves student outcomes by 47%. Research indicates that personalized learning increases engagement significantly. According to Smith et al. (2021), adaptive systems outperform traditional methods. Johnson and Lee (2022) found similar results in their longitudinal study. Moreover, a growing body of research suggests that AI tutors reduce dropout rates. In the International Journal of Modern Educational Research, Brown et al. (2023) demonstrated that AI feedback improves writing quality by 63%. These findings have been confirmed by numerous scholars. The doi: 10.1234/abc is frequently cited in this context.`;

// 真实引用（有完整 References 列表，正文与列表对应良好）
const REAL_CITED = `Financial reporting quality has been examined extensively in the accounting literature. Dechow and Dichev (2002) proposed a model linking accruals to cash flows. Subsequent work extended this framework (McNichols, 2002; Ball & Shivakumar, 2006). More recent evidence confirms that reporting quality affects capital allocation (Biddle et al., 2009).

References

Dechow, P. M., & Dichev, I. D. (2002). The quality of accruals and earnings. The Accounting Review, 77(s-1), 35-59. https://doi.org/10.2308/accr.2002.77.s-1.35

McNichols, M. F. (2002). Discussion of the quality of accruals and earnings. The Accounting Review, 77(s-1), 61-69. https://doi.org/10.2308/accr.2002.77.s-1.61

Ball, R., & Shivakumar, L. (2006). The role of accruals in asymmetrically timely gain and loss recognition. Journal of Accounting Research, 44(2), 207-242. https://doi.org/10.1111/j.1475-679X.2006.00198.x

Biddle, G. C., Hilary, G., & Verdi, R. S. (2009). How does financial reporting quality improve investment efficiency? Journal of Accounting and Economics, 48(2-3), 112-131. https://doi.org/10.1016/j.jacceco.2009.09.001`;

// 无引用文本（本模块不适用）
const NO_CITATION = `The accounting profession has evolved considerably over the past century. Practitioners today must navigate complex regulatory environments while maintaining professional scepticism. This essay examines the principal challenges facing auditors in emerging markets.`;

// DOI 形态异常
const BAD_DOI = `Several meta-analyses support this claim (Chen et al., 2020). The original study doi: 10.9999/xy can be found online. Later work doi:10.1111/j.9999 was also influential.`;

console.log('='.repeat(64));
console.log('文献真实性溯源审查 · 单元测试');
console.log('='.repeat(64));

/* ---------------- 1. 参考文献区块检测 ---------------- */
section('1) 参考文献区块检测');
const r1 = CitationAudit.findReferenceSection(AI_FABRICATED);
ok(!r1.has, 'AI 幻觉文本：未检测到参考文献区块');
const r2 = CitationAudit.findReferenceSection(REAL_CITED);
ok(r2.has, '真实引用文本：检测到参考文献区块');
ok(r2.entries.length === 4, '真实引用文本：解析出 4 条条目', `实际 ${r2.entries.length}`);

/* ---------------- 2. 正文引用抽取 ---------------- */
section('2) 正文引用标记抽取');
const c1 = CitationAudit.extractInTextCitations(AI_FABRICATED);
ok(c1.length >= 2, 'AI 文本：抽取出引用标记', `实际 ${c1.length}`);
const c2 = CitationAudit.extractInTextCitations(REAL_CITED.split('References')[0]);
ok(c2.length >= 4, '真实文本：抽取出引用标记（含括号内多条）', `实际 ${c2.length}`);
ok(c2.some(c => /McNichols/i.test(c.raw)) && c2.some(c => /Shivakumar/i.test(c.raw)),
  '多条目括号引用 (McNichols, 2002; Ball & Shivakumar, 2006) 被完整展开');

/* ---------------- 3. DOI 形态检查 ---------------- */
section('3) DOI 形态检查');
const d1 = CitationAudit.checkDois(BAD_DOI);
ok(d1.length === 2, '检出 2 个 DOI', `实际 ${d1.length}`);
ok(d1.some(d => !d.valid) && d1.some(d => d.valid),
  '短后缀 DOI 判可疑，长后缀 DOI 判正常（形态学分级）',
  JSON.stringify(d1.map(d => `${d.doi}:${d.valid}`)));
const d2 = CitationAudit.checkDois(REAL_CITED);
ok(d2.length === 4, '真实文本检出 4 个 DOI');
ok(d2.every(d => d.valid), '4 个 DOI 形态均正常');

/* ---------------- 4. 无出处数字 ---------------- */
section('4) 无出处数字检测');
const n1 = CitationAudit.findUnsourcedNumbers(AI_FABRICATED);
ok(n1.length >= 1, 'AI 文本：检出无出处数字', `实际 ${n1.length}`);
ok(n1.some(x => x.number.includes('47')), '检出 47% 这个无出处数字');

/* ---------------- 5. 空引检测 ---------------- */
section('5) 「研究表明」空引检测');
const v1 = CitationAudit.findUnsourcedClaims(AI_FABRICATED);
ok(v1.length >= 1, 'AI 文本：检出空引句', `实际 ${v1.length}`);

/* ---------------- 6. 综合评分：幻觉文本应高分 ---------------- */
section('6) 综合评分');
const a1 = CitationAudit.analyze(AI_FABRICATED, KB);
ok(a1.applicable, 'AI 幻觉文本：本项适用');
ok(a1.score >= 50, `AI 幻觉文本：可疑度 >= 50（实际 ${a1.score}）`);
ok(!a1.hasRefSection, 'AI 幻觉文本：确认无参考文献区块');
ok(a1.dangling.length >= 3, `AI 幻觉文本：检出 ≥3 条悬空引用（实际 ${a1.dangling.length}）`);

const a2 = CitationAudit.analyze(REAL_CITED, KB);
ok(a2.applicable, '真实引用文本：本项适用');
ok(a2.score < 30, `真实引用文本：可疑度 < 30（实际 ${a2.score}）`);
ok(a2.dangling.length === 0, `真实引用文本：无悬空引用（实际 ${a2.dangling.length}）`);

const a3 = CitationAudit.analyze(NO_CITATION, KB);
ok(!a3.applicable, '无引用文本：本项判为不适用（不当作低风险）');

/* ---------------- 7. 真实文本不应误报 ---------------- */
section('7) 误报检验');
ok(a2.unsourcedNumbers.length <= 1, `真实引用文本：无出处数字 ≤1（实际 ${a2.unsourcedNumbers.length}）`);
ok(a2.yearIssues.length === 0, `真实引用文本：无年份异常（实际 ${a2.yearIssues.length}）`);
ok(a2.orphan.length === 0, `真实引用文本：无孤立条目误报（实际 ${a2.orphan.length}）`);
// 「Dechow and Dichev (2002)」必须归属到第一作者 Dechow，否则会误报孤立条目
const cDechow = a2.inTextCitations.find(c => /Dechow/i.test(c.raw));
ok(!!cDechow && cDechow.author === 'Dechow',
  '「Dechow and Dichev (2002)」归属第一作者 Dechow（而非 Dichev）',
  cDechow ? `实际 author=${cDechow.author}` : '未抽取到该引用');

/* ---------------- 8. 边界与指引 ---------------- */
section('8) 能力边界与核验指引');
ok(!!a1.boundary && a1.boundary.notCovered.length >= 1, '返回了能力边界（明确声明查不到什么）');
ok(!!a1.guide && a1.guide.steps.length >= 4, '返回了核验指引步骤');
ok(a1.boundary.disclaimer.includes('不联网'), '免责声明明确说明不联网');

/* ---------------- 9. 幻觉形态模式 ---------------- */
section('9) 幻觉形态模式命中');
ok(a1.patternHits.length >= 2, `AI 幻觉文本命中 ≥2 类形态（实际 ${a1.patternHits.length}）`);
const types = a1.patternHits.map(p => p.type).join('、');
ok(/空引|研究|数字|期刊|作者/.test(types), `命中形态包含典型类型：${types}`);

/* ---------------- 汇总 ---------------- */
console.log('\n' + '='.repeat(64));
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log('='.repeat(64));
process.exit(fail ? 1 : 0);
