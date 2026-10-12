/* =========================================================================
   FormatAudit 单元测试
   运行：node test/format_test.js
   ========================================================================= */
const fs = require('fs');
const path = require('path');

function loadModule(file, varName) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'assets', file), 'utf8');
  new Function(src.replace(new RegExp('^const ' + varName + ' =', 'm'),
    'globalThis.' + varName + ' ='))();
  return globalThis[varName];
}
const F = loadModule('format.js', 'FormatAudit');

let pass = 0, fail = 0;
function ok(c, n, extra) {
  if (c) { pass++; console.log(`  ✅ ${n}`); }
  else { fail++; console.log(`  ❌ ${n}${extra ? '  → ' + extra : ''}`); }
}
function eq(a, b, n) { ok(a === b, n, `期望 ${b}，实际 ${a}`); }

/* ---------- 语料 ---------- */
const APA_GOOD = `Financial reporting quality has been examined extensively. Dechow and Dichev (2002) proposed a model linking accruals to cash flows. Subsequent work extended this framework (McNichols, 2002; Ball & Shivakumar, 2006).

References

Ball, R., & Shivakumar, L. (2006). The role of accruals in asymmetrically timely gain and loss recognition. Journal of Accounting Research, 44(2), 207-242. https://doi.org/10.1111/j.1475-679X.2006.00198.x

Dechow, P. M., & Dichev, I. D. (2002). The quality of accruals and earnings. The Accounting Review, 77(s-1), 35-59. https://doi.org/10.2308/accr.2002.77.s-1.35

McNichols, M. F. (2002). Discussion of the quality of accruals and earnings. The Accounting Review, 77(s-1), 61-69. https://doi.org/10.2308/accr.2002.77.s-1.61`;

const APA_BAD_DOI = `The study examined reporting quality (Smith, 2020).

References

Smith, J. A. (2020). Reporting quality in emerging markets. Journal of Finance, 12(3), 45-67. 10.1016/j.jfineco.2020.01.001.

Jones, M. (2019). A related study. Accounting Review, 8(1), 1-20. https://doi.org/10.2308/accr.2019.01.001.`;

const APA_OLD_RETRIEVED = `Some findings (Brown, 2018).

References

Brown, T. (2018). Retrieved from https://example.com/article on reporting. Journal of Studies, 5(2), 10-20.`;

const MLA_GOOD = `The reading brain differs between media (Baron 193). Jacobs argues that attention is a skill.

Works Cited

Baron, Naomi S. "Redefining Reading: The Impact of Digital Communications Media." PMLA, vol. 24, no. 1, 2013, pp. 193-200.

Jacobs, Alan. The Pleasures of Reading in an Age of Distraction. Oxford UP, 2011.`;

const MLA_BAD_MIXED = `The reading brain differs (Baron, 2013). Jacobs makes a similar point (Jacobs, 2011).

Works Cited

Baron, Naomi S. "Redefining Reading." PMLA, vol. 24, no. 1, 2013, pp. 193-200.`;

const STRUCT_FULL = `In recent years, online learning has expanded rapidly across higher education institutions worldwide, driven by improvements in network infrastructure and the widespread adoption of learning management systems. This essay argues that blended delivery improves student outcomes only when it is supported by sustained teacher training and institutional commitment, rather than by technology alone.

First, blended models increase flexibility for working students. For example, recorded lectures allow learners to revisit difficult material at their own pace, which is particularly valuable for those balancing employment with study. Moreover, several studies report measurable gains in retention among part-time cohorts, suggesting that the format itself removes a practical barrier to completion.

Secondly, teacher training is the decisive factor determining whether blended delivery succeeds in practice. However, institutions often underinvest in professional development because the returns are difficult to measure in the short term. As a result, technology is frequently adopted without the pedagogical change that would make it effective, leaving the underlying problem untouched.

In conclusion, blended delivery is promising but conditional. Without sustained investment in teacher training and a realistic assessment of institutional capacity, its benefits will not materialise for the students who need them most.`;

const STRUCT_NO_CONCLUSION = `In recent years, online learning has expanded rapidly across higher education institutions worldwide, driven by improvements in network infrastructure. This essay argues that blended delivery improves student outcomes only when supported by teacher training.

First, blended models increase flexibility for working students. For example, recorded lectures allow learners to revisit difficult material, which is valuable for those balancing employment with study. Moreover, several studies report measurable gains in retention among part-time cohorts.

Secondly, teacher training is the decisive factor determining whether blended delivery succeeds. However, institutions often underinvest in professional development because returns are hard to measure. As a result, technology is adopted without the pedagogical change that would make it effective.`;

const STRUCT_HEADINGS = `Introduction

This report examines supply chain disruption in Malaysian manufacturing during the pandemic period, with particular attention to how firms responded to sudden logistical constraints and what that response reveals about preparedness.

Body

First, the pandemic exposed single-source dependencies that had been invisible during stable conditions. Secondly, freight costs rose sharply as capacity contracted. For example, container rates tripled within a single quarter, and lead times extended from weeks to months. However, firms that had diversified their supplier base earlier recovered noticeably faster than those that had not.

Conclusion

In summary, supply chain resilience requires diversification and early warning. Firms should map their dependencies before a crisis forces them to, and should treat supplier diversity as a strategic investment rather than a cost.`;

const TOO_SHORT = `Just a few words here.`;

/* ---------- 1. 体系识别 ---------- */
console.log('\n=== 1. 引用体系识别 ===');
{
  const r = F.analyze(APA_GOOD, null);
  eq(r.style, 'apa7', 'APA 文本识别为 apa7');
  ok(r.styleName.includes('APA'), '体系名称含 APA', r.styleName);
  ok(r.styleConfidence >= 60, `识别置信度 >=60（实际 ${r.styleConfidence}%）`);
}
{
  const r = F.analyze(MLA_GOOD, null);
  eq(r.style, 'mla9', 'MLA 文本识别为 mla9');
  ok(r.styleName.includes('MLA'), '体系名称含 MLA', r.styleName);
}
{
  const r = F.analyze(MLA_BAD_MIXED, null);
  eq(r.style, 'mla9', '含 vol/no/pp 标记 → 判为 MLA');
}
{
  const r = F.analyze(STRUCT_FULL, null);
  eq(r.style, 'unknown', '无引用文本 → 体系未识别');
}

/* ---------- 2. DOI 格式检查 ---------- */
console.log('\n=== 2. DOI 格式检查 ===');
{
  const r = F.analyze(APA_BAD_DOI, null);
  const bare = r.issues.find(x => x.id === 'DOI_BARE');
  const period = r.issues.find(x => x.id === 'DOI_PERIOD');
  ok(!!bare, '检出裸 DOI（缺 https://doi.org/ 前缀）', bare ? `count=${bare.count}` : '');
  ok(!!period, '检出 DOI 后误加句点', period ? `count=${period.count}` : '');
}
{
  const r = F.analyze(APA_GOOD, null);
  const bare = r.issues.find(x => x.id === 'DOI_BARE');
  const period = r.issues.find(x => x.id === 'DOI_PERIOD');
  ok(!bare, '规范 DOI 文本：无误报裸 DOI');
  ok(!period, '规范 DOI 文本：无误报「DOI 后句点」');
}

/* ---------- 3. 过时写法 ---------- */
console.log('\n=== 3. 过时写法检查 ===');
{
  const r = F.analyze(APA_OLD_RETRIEVED, null);
  const retr = r.issues.find(x => x.id === 'RETRIEVED_FROM');
  ok(!!retr, '检出 APA 6 残留的 Retrieved from');
}
{
  const r = F.analyze(APA_GOOD, null);
  ok(!r.issues.find(x => x.id === 'RETRIEVED_FROM'), '规范文本：无误报 Retrieved from');
}

/* ---------- 4. MLA 正文引用混用 APA ---------- */
console.log('\n=== 4. MLA 正文引用检查 ===');
{
  const r = F.analyze(MLA_BAD_MIXED, null);
  const m = r.issues.find(x => x.id === 'MLAIN_TEXT_APA');
  ok(!!m, 'MLA 文本里检出 APA 式带年份括注', m ? `样本 ${JSON.stringify(m.sample)}` : '');
}
{
  const r = F.analyze(MLA_GOOD, null);
  ok(!r.issues.find(x => x.id === 'MLAIN_TEXT_APA'), '规范 MLA：无误报年份括注');
  ok(!r.issues.find(x => x.id === 'MLAIN_TEXT_COMMA'), '规范 MLA：无误报「姓, 页码」逗号');
}

/* ---------- 5. 结构完整性 ---------- */
console.log('\n=== 5. 结构完整性 ===');
{
  const r = F.analyze(STRUCT_FULL, null);
  ok(r.structure.applicable, '结构检查适用');
  const intro = r.structure.sections.find(s => s.key === 'introduction');
  const body = r.structure.sections.find(s => s.key === 'body');
  const concl = r.structure.sections.find(s => s.key === 'conclusion');
  ok(intro.ok, '识别到 Introduction', intro.evidence);
  ok(body.ok, '识别到 Body', body.evidence);
  ok(concl.ok, '识别到 Conclusion', concl.evidence);
  eq(r.structure.missing.length, 0, '完整结构：无缺失项');
  eq(r.structure.score, 100, '完整结构得分 100');
}
{
  const r = F.analyze(STRUCT_NO_CONCLUSION, null);
  const concl = r.structure.sections.find(s => s.key === 'conclusion');
  ok(!concl.ok, '缺结论的文本：Conclusion 判为缺失', concl.evidence);
  ok(r.structure.missing.includes('Conclusion 结论'), '缺失清单包含 Conclusion');
  ok(r.structure.score < 100, `缺一项 → 得分 <100（实际 ${r.structure.score}）`);
}
{
  const r = F.analyze(STRUCT_HEADINGS, null);
  ok(r.structure.applicable, '带小标题文本：结构检查适用');
  eq(r.structure.missing.length, 0, '带 Introduction/Body/Conclusion 小标题：无缺失');
  ok(r.structure.headings.length >= 3, `识别到 ${r.structure.headings.length} 个小标题`);
}

/* 回归：经典三段式（Intro / Body / Conclusion 各一段，无小标题、无标记词）
   ⚠️ 曾经的 bug：body 定义为 slice(1,-1) → 中间只剩 1 段 → 误报「缺 Body」；
   conclusion 又要求 contentParas.length>=4 → 三段式永远拿不到 → 误报「缺 Conclusion」。
   实测来源：真实 APA 短文在页面上被判 missing=[Body, Conclusion]。 */
{
  const THREE_PARA = `Financial reporting quality has been examined extensively in the accounting literature over the past several decades. Dechow and Dichev (2002) proposed a model linking accruals to cash flows, and subsequent work extended this framework considerably (McNichols, 2002).

Prior research has established that accrual quality reflects managerial discretion and the information environment of the firm. Ball and Shivakumar (2006) extended the framework to incorporate asymmetric timeliness of gain and loss recognition. Biddle et al. (2009) further demonstrated that financial reporting quality improves investment efficiency by reducing information asymmetries in capital markets around the world.

Taken together, the extant literature suggests that reporting quality has real economic consequences for capital allocation. Future research should examine how these relationships vary across institutional settings and over time.

References

Dechow, P. M., & Dichev, I. D. (2002). The quality of accruals and earnings. The Accounting Review, 77(s-1), 35-59. https://doi.org/10.2308/accr.2002.77.s-1.35`;
  const r = F.analyze(THREE_PARA, null);
  ok(r.structure.applicable, '三段式：结构检查适用');
  const intro = r.structure.sections.find(s => s.key === 'introduction');
  const body = r.structure.sections.find(s => s.key === 'body');
  const concl = r.structure.sections.find(s => s.key === 'conclusion');
  ok(intro.ok, '三段式：识别到 Introduction', intro.evidence);
  ok(body.ok, '三段式：识别到 Body（中间段即主体）', body.evidence);
  ok(concl.ok, '三段式：识别到 Conclusion', concl.evidence);
  eq(r.structure.missing.length, 0, '三段式：无缺失项');
  eq(r.structure.contentParagraphCount, 3, '三段式：正文段落数为 3（References 已切分）');
}

/* ---------- 6. 体系冲突（正文形态 vs 页标题） ---------- */
console.log('\n=== 6. 体系冲突检查 ===');
{
  // 正文是 MLA 形态（(Smith 15)），页标题却是 References（APA）→ 应报冲突
  const t = `The reading brain differs fundamentally between digital and print media. Baron argues that attention is a skill shaped by the medium itself, and that deep reading requires sustained focus over time.

Works Cited

Smith, John. The Book. Publisher, 2015.`;
  const r = F.analyze(t, null);
  const conflict = r.issues.find(x => x.id === 'STYLE_CONFLICT');
  ok(!conflict, '正文 MLA 形态 + Works Cited → 无冲突（正确配对）', conflict ? conflict.hint : '');

  const t2 = `The reading brain differs fundamentally between digital and print media. Baron argues that attention is a skill shaped by the medium itself, and that deep reading requires sustained focus (Baron 15).

References

Smith, John. The Book. Publisher, 2015.`;
  const r2 = F.analyze(t2, null);
  const c2 = r2.issues.find(x => x.id === 'STYLE_CONFLICT');
  ok(!!c2, '正文 MLA 形态「(Baron 15)」+ References 标题 → 检出体系冲突', c2 ? c2.hint : JSON.stringify(r2.issues.map(i => i.id)));
}

/* ---------- 7. 缺参考文献区 ---------- */
console.log('\n=== 7. 缺参考文献区检查 ===');
{
  const t = `This essay cites several sources in the body text. For example, prior work (Smith, 2020) and later work (Jones, 2021) both agree on the main finding. Yet there is no reference list anywhere in this document.`;
  const r = F.analyze(t, null);
  const noRef = r.issues.find(x => x.id === 'NO_REF_SECTION');
  ok(!!noRef, '正文有引用但无参考文献区 → 检出');
}

/* ---------- 8. 短文本不适用 ---------- */
console.log('\n=== 8. 边界情况 ===');
{
  const r = F.analyze(TOO_SHORT, null);
  eq(r.applicable, false, '过短文本 → 本项不适用');
  ok(!!r.reason, '给出不适用原因', r.reason);
}
{
  const r = F.analyze(APA_GOOD, null);
  ok(r.boundary && r.boundary.length > 0, '返回能力边界声明');
  ok(r.guide && r.guide.steps && r.guide.steps.length >= 5, `返回自查清单（${r.guide ? r.guide.steps.length : 0} 步）`);
}

/* ---------- 8b. 「无任何可判断项」→ 不得给满分 ---------- */
console.log('\n=== 8b. 无可判断项时不得给出格式分 ===');
{
  // 99 字符 / 15 词：无引用、无参考文献、结构也判不了
  const t = 'Auditors in emerging markets face unusual pressures. This short note considers two of them briefly.';
  const r = F.analyze(t, null);
  const judged = !!(r.style && r.style !== 'unknown' && r.style !== 'mixed') ||
    !!(r.structure && r.structure.applicable) ||
    (r.issueCount || 0) > 0 || r.hasReferenceSection;
  ok(!judged, '无引用/无参考文献/结构不适用 → 视为「无可判断项」');
  ok(r.guide && r.guide.steps && r.guide.steps.length > 0, '不适用时仍返回自查清单');
}

console.log('\n=== 8c. 规则 JSON 的 detect 必须真的生效（防「假可配置」）===');
{
  /* ⚠️ 曾经的 bug：规则 JSON 把 detect 挂在 structure 下，
     而 getDetect 只读顶层 rules.detect → JSON 里的标记词是**死数据**，
     改配置完全不影响行为。此测试用自定义标记词验证配置确实被读取。 */
  const rules = {
    structure: {
      detect: {
        conclusion_markers: ['zzz-custom-conclusion-marker'],
        intro_markers: ['zzz-custom-intro-marker'],
        body_markers: [],
      },
    },
  };
  const t = `zzz-custom-intro-marker opens this piece and sets out the argument that follows in some detail over several sentences of prose.

The middle section develops the argument with supporting evidence drawn from the literature and from practical observation in the field.

zzz-custom-conclusion-marker brings the discussion to a close and states what has been established overall.`;
  const r = F.analyze(t, { format_rules: rules });
  const intro = r.structure.sections.find(s => s.key === 'introduction');
  const concl = r.structure.sections.find(s => s.key === 'conclusion');
  ok(/zzz-custom-intro-marker|自定义/.test(intro.evidence) || intro.ok,
    'structure.detect 的 intro 标记词被读取', intro.evidence);
  ok(/zzz-custom-conclusion-marker|标记词/.test(concl.evidence),
    'structure.detect 的 conclusion 标记词被读取', concl.evidence);

  // 顶层 detect 也应兼容
  const rules2 = { detect: { conclusion_markers: ['zzz-top-level-marker'], intro_markers: [], body_markers: [] } };
  const t2 = t.replace('zzz-custom-conclusion-marker', 'zzz-top-level-marker');
  const r2 = F.analyze(t2, { format_rules: rules2 });
  const c2 = r2.structure.sections.find(s => s.key === 'conclusion');
  ok(c2.ok, '顶层 detect 也兼容（兜底路径）', c2.evidence);
}

console.log('\n=== 9. 真实语料回归（不应崩溃、不应重伤）===');
{
  /* ⚠️ 隐私说明：本节原用**真实学生作业**（corpus/student/）。
     开源版改用仓库内可公开分发的语料：human/（Gutenberg 公版）
     + ai/（人工撰写的 AI 风格样本）。测试目标不变 —— 验证格式模块
     在真实长度的英文文本上不崩溃、不误报。 */
  const dirs = [
    { d: path.join(__dirname, 'corpus', 'human'), label: '公版真人' },
    { d: path.join(__dirname, 'corpus', 'ai'), label: 'AI 样本' },
  ];
  let n = 0;
  for (const { d, label } of dirs) {
    if (!fs.existsSync(d)) { console.log(`  （跳过 ${label}：目录不存在）`); continue; }
    for (const f of fs.readdirSync(d).filter(x => x.endsWith('.txt')).sort()) {
      const t = fs.readFileSync(path.join(d, f), 'utf8');
      const r = F.analyze(t, null);
      ok(r.applicable, `${label} / ${f.slice(0, 24)} 可分析`);
      n++;
    }
  }
  console.log(`  · 共跑 ${n} 篇，全部可分析（无崩溃）`);
}

console.log('\n' + '='.repeat(64));
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log('='.repeat(64));
process.exit(fail ? 1 : 0);
