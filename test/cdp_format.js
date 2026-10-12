/* =========================================================================
   真实页面端到端验证：格式规范检查模块（APA/MLA + 三段结构）
   ---------------------------------------------------------------------
   做法（沿用本项目既有经验）：
     1) 同一个 Python 进程里启动本地服务器 + Chrome
     2) Chrome 154 起 /json/new 受限 → 启动时命令行直接传目标 URL
     3) app.js 的函数不在 window 上 → 用 ?text=<urlencoded>&run=1 注入并真实点击
     4) 用 CDP Runtime.evaluate 读真实 DOM 做断言，并截图
   运行：node test/cdp_format.js
   ========================================================================= */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/* 运行环境路径：优先读环境变量，便于在不同机器上跑。
   ⚠️ 不要硬编码个人绝对路径（开源时会泄露用户名与目录结构）。 */
const PY = process.env.WB_PYTHON || 'python';
const CHROME = process.env.WB_CHROME
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOTS = path.join(__dirname);
const PORT = 8793;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, n, extra) {
  if (c) { pass++; console.log(`  PASS | ${n}`); }
  else { fail++; console.log(`  FAIL | ${n}${extra ? '  → ' + extra : ''}`); }
}

/* ---------------- 测试文本 ---------------- */

/* A. APA 7，三段结构齐全，但 DOI 写法不规范（裸 DOI + 结尾句点 + 过时 Retrieved from）+ MLA 混入 */
const APA_BAD_FORMAT = `Financial reporting quality has been examined extensively in the accounting literature over the past several decades. Dechow and Dichev (2002) proposed a model linking accruals to cash flows, and subsequent work extended this framework considerably.

Prior research has established that accrual quality reflects managerial discretion and the information environment of the firm. McNichols (2002) provided a critical discussion of the original model, while Ball and Shivakumar (2006) extended the framework to incorporate asymmetric timeliness of gain and loss recognition. Biddle, Hilary, and Verdi (2009) further demonstrated that financial reporting quality improves investment efficiency by reducing information asymmetries between managers and outside capital providers.

Taken together, the extant literature suggests that reporting quality has real economic consequences. This essay has argued that accrual-based measures capture a meaningful dimension of reporting quality, and that the effect on capital allocation is both statistically and economically significant. Future research should examine how these relationships vary across institutional settings.

References

Dechow, P. M., & Dichev, I. D. (2002). The quality of accruals and earnings. The Accounting Review, 77(s-1), 35-59. doi: 10.2308/accr.2002.77.s-1.35.

McNichols, M. F. (2002). Discussion of the quality of accruals and earnings. The Accounting Review, 77(s-1), 61-69. Retrieved from http://www.jstor.org/stable/3203330

Ball, R., & Shivakumar, L. (2006). The role of accruals in asymmetrically timely gain and loss recognition. Journal of Accounting Research, 44(2), 207-242. https://doi.org/10.1111/j.1475-679X.2006.00198.x`;

/* B. APA 7，全部规范写法，三段齐全 → 应为 0 处格式问题 */
const APA_CLEAN = `Financial reporting quality has been examined extensively in the accounting literature over the past several decades. Dechow and Dichev (2002) proposed a model linking accruals to cash flows, and subsequent work extended this framework considerably (McNichols, 2002).

Prior research has established that accrual quality reflects managerial discretion and the information environment of the firm. Ball and Shivakumar (2006) extended the framework to incorporate asymmetric timeliness of gain and loss recognition. Biddle et al. (2009) further demonstrated that financial reporting quality improves investment efficiency by reducing information asymmetries.

Taken together, the extant literature suggests that reporting quality has real economic consequences. This essay has argued that accrual-based measures capture a meaningful dimension of reporting quality. Future research should examine how these relationships vary across institutional settings.

References

Dechow, P. M., & Dichev, I. D. (2002). The quality of accruals and earnings: The role of accrual estimation errors. The Accounting Review, 77(s-1), 35-59. https://doi.org/10.2308/accr.2002.77.s-1.35

McNichols, M. F. (2002). Discussion of the quality of accruals and earnings. The Accounting Review, 77(s-1), 61-69. https://doi.org/10.2308/accr.2002.77.s-1.61

Ball, R., & Shivakumar, L. (2006). The role of accruals in asymmetrically timely gain and loss recognition. Journal of Accounting Research, 44(2), 207-242. https://doi.org/10.1111/j.1475-679X.2006.00198.x

Biddle, G. C., Hilary, G., & Verdi, R. S. (2009). How does financial reporting quality improve investment efficiency? Journal of Accounting and Economics, 48(2-3), 112-131. https://doi.org/10.1016/j.jacceco.2009.09.001`;

/* C. 结构缺失：只有 Body，没有 Introduction 收束 / 没有 Conclusion 信号 */
const STRUCT_MISSING = `Revenue recognition under IFRS 15 requires entities to identify performance obligations and allocate the transaction price to those obligations. The standard replaced the previous risk-and-reward approach with a control-based model that applies across industries and transaction types.

Entities operating in multi-element arrangements must exercise significant judgement when determining whether promised goods or services are distinct. Where obligations are not distinct, they are combined until a distinct bundle emerges. This judgement directly affects the timing of revenue and therefore reported earnings in each period.

Contract costs that are incremental to obtaining a contract are capitalised where the entity expects to recover them. Subsequent amortisation follows the pattern of transfer of the related goods or services, which introduces further estimation into the reported figures.

Disclosure requirements expanded materially under the new standard, requiring disaggregation of revenue and information about contract balances. Preparers report that the cost of compliance has increased, although comparability across entities has arguably improved as a result of the single control-based model.

References

IFRS 15 (2014). Revenue from Contracts with Customers. London: IFRS Foundation.`;

/* D. MLA 9：Works Cited + 括号页码（无年份、无逗号） */
const MLA_DOC = `The question of what makes a literary text modern has occupied critics for well over a century. Eliot argues that tradition is not inherited but earned through labour, and that a poet must acquire the past in order to produce anything of value. The essay that follows examines how that claim operates in practice.

Critics have generally read Eliot's formulation as conservative, and there is textual support for that reading. Yet the emphasis on labour and acquisition complicates any simple account of inheritance. The poet, on Eliot's account, must actively reconstruct the tradition rather than passively receive it (Eliot 15).

Later critics extended this argument in directions Eliot did not anticipate, and the resulting body of work is large. What unites it is a shared assumption that literary value is produced rather than discovered. This essay has argued that this assumption remains productive for reading twentieth-century poetry, and that Eliot's own formulation is best understood as a provocation rather than a doctrine.

Works Cited

Eliot, T. S. "Tradition and the Individual Talent." The Sacred Wood, Methuen, 1920, pp. 42-53.

Wellek, Rene. A History of Modern Criticism. Yale UP, 1955.`;

/* E. 过短文本 → 应判「不适用」 */
const TOO_SHORT = `Auditors in emerging markets face unusual pressures. This short note considers two of them briefly.`;

/* ---------------- 基础设施 ---------------- */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function probe(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/web/index.html`);
      if (r.ok) return true;
    } catch (e) { /* 未就绪 */ }
    await sleep(250);
  }
  return false;
}

async function chromeWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:9222/json/list`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.url.includes('index.html'));
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch (e) { /* 未就绪 */ }
    await sleep(300);
  }
  return null;
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      /* ⚠️ 踩坑：app.js 的 btnAnalyze 处理器在 <20 词时调 alert()。
         无头 Chrome 下 alert 会**永久阻塞主线程**，导致后续所有
         Runtime.evaluate / captureScreenshot 全部超时（表现为“页面卡死”）。
         不是产品 bug，但测试必须自动关掉对话框，否则永远测不下去。 */
      if (msg.method === 'Page.javascriptDialogOpening') {
        c.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
        if (c.lastDialog) c.lastDialog(msg.params);
        return;
      }
      if (msg.id && c.pending.has(msg.id)) {
        const { res, rej } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    };
    return c;
  }
  send(method, params) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('timeout ' + method)); } }, 30000);
    });
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + JSON.stringify(r.exceptionDetails.exception));
    return r.result.value;
  }
  async setText(txt) {
    await this.eval(`(() => {
      const t = document.querySelector('#inputText');
      t.value = ${JSON.stringify(txt)};
      t.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    // 分析可能因文本过短而走「不适用」分支；单独点击并容错，避免 promise 抛错导致 CDP 超时
    await this.eval(`(() => { try { document.querySelector('#btnAnalyze').click(); } catch (e) { return String(e); } return 'clicked'; })()`);
    return true;
  }
  async snapshot() {
    return this.eval(`(() => {
      const q = s => document.querySelector(s);
      const txt = s => q(s) ? q(s).innerText : '';
      return {
        score: q('#scoreFmt') ? q('#scoreFmt').textContent.trim() : '',
        visible: q('#fmtBlock') ? !q('#fmtBlock').classList.contains('hidden') : false,
        summary: txt('#fmtSummary'),
        structure: txt('#fmtStructure'),
        issues: txt('#fmtIssues'),
        guide: txt('#fmtGuide'),
        secRows: q('#fmtStructure') ? Array.from(q('#fmtStructure').querySelectorAll('.fmt-sec')).map(e => e.innerText.replace(/\\s+/g,' ').trim()) : [],
        secOk: q('#fmtStructure') ? Array.from(q('#fmtStructure').querySelectorAll('.fmt-sec.ok')).map(e => e.innerText.replace(/\\s+/g,' ').trim()) : [],
        secBad: q('#fmtStructure') ? Array.from(q('#fmtStructure').querySelectorAll('.fmt-sec.bad')).map(e => e.innerText.replace(/\\s+/g,' ').trim()) : [],
        issueHits: q('#fmtIssues') ? q('#fmtIssues').querySelectorAll('.hit').length : 0,
        guideSteps: q('#fmtGuide') ? q('#fmtGuide').querySelectorAll('.cg-steps li').length : 0
      };
    })()`);
  }
}

/* ---------------- 主流程 ---------------- */
(async () => {
  console.log('='.repeat(64));
  console.log('格式规范检查（APA/MLA + 三段结构） · 真实页面 CDP 端到端');
  console.log('='.repeat(64));

  const server = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  if (!await probe(PORT)) { console.log('❌ 服务器未就绪'); server.kill(); process.exit(1); }
  console.log('\n[1] 本地服务器已就绪 :' + PORT);

  const target = `http://127.0.0.1:${PORT}/web/index.html?text=${encodeURIComponent(APA_BAD_FORMAT)}&run=1`;
  const userDir = path.join(require('os').tmpdir(), 'cdp-fmt-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=9222', `--user-data-dir=${userDir}`,
    '--window-size=1280,2400', target
  ], { stdio: 'ignore' });
  console.log('[2] Chrome 已启动（无头）');

  const wsUrl = await chromeWs();
  if (!wsUrl) { console.log('❌ 未取得 CDP 端点'); server.kill(); chrome.kill(); process.exit(1); }
  const cdp = await CDP.connect(wsUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await sleep(2400);
  console.log('[3] 页面已连接，开始断言\n');

  /* ===== 场景 A：APA + 结构齐全 + 多处格式问题 ===== */
  console.log('--- 场景 A：APA 体系 · 三段齐全 · DOI/过时写法有问题 ---');
  const a = await cdp.snapshot();
  ok(a.visible, '格式检查区块已展示');
  ok(/APA/.test(a.summary), `识别为 APA 体系（摘要含 APA）`);
  ok(!/MLA 特征/.test(a.summary) || !/混用/.test(a.summary), '未误报体系混用');
  ok(/参考文献区块：有/.test(a.summary.replace(/\s+/g, '')) || /参考文献区块/.test(a.summary), '检出参考文献区块');
  ok(a.secRows.length === 3, `结构渲染出 3 段（实际 ${a.secRows.length}）`);
  ok(a.secOk.length === 3, `三段式结构齐全，3 段全 OK（实际 ${a.secOk.length}）`);
  ok(/Introduction/.test(a.structure), '结构区含 Introduction');
  ok(/Body/.test(a.structure), '结构区含 Body');
  ok(/Conclusion/.test(a.structure), '结构区含 Conclusion');
  ok(a.issueHits >= 2, `检出 ≥2 处格式问题（实际 ${a.issueHits}）`);
  ok(/DOI/.test(a.issues), '检出 DOI 写法问题');
  ok(/过时|Retrieved|陈旧/.test(a.issues), '检出过时写法（Retrieved from）');
  ok(a.guideSteps >= 5, `自查清单渲染 ≥5 步（实际 ${a.guideSteps}）`);
  ok(/不联网|rubric|不判分|核对清单/.test(a.summary + a.guide), '声明了能力边界');
  ok(parseInt(a.score) >= 0 && parseInt(a.score) <= 100, `格式规范度分数在 0-100（实际 ${a.score}）`);

  const shotA = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(SHOTS, 'fmt_apa_issues.png'), Buffer.from(shotA.data, 'base64'));
  console.log('  [截图] fmt_apa_issues.png');

  /* ===== 场景 B：规范 APA → 零格式问题 ===== */
  console.log('\n--- 场景 B：规范 APA 写法（应 0 处问题）---');
  await cdp.setText(APA_CLEAN);
  await sleep(1300);
  const b = await cdp.snapshot();
  ok(/APA/.test(b.summary), '识别为 APA 体系');
  ok(b.issueHits === 0, `规范写法：0 处格式问题（实际 ${b.issueHits}）`);
  ok(b.secRows.length === 3 && b.secBad.length === 0, `规范写法：三段齐全无缺失（bad=${b.secBad.length}）`);
  ok(parseInt(b.score) >= 85, `规范写法分数 ≥85（实际 ${b.score}）`);

  const shotB = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(SHOTS, 'fmt_apa_clean.png'), Buffer.from(shotB.data, 'base64'));
  console.log('  [截图] fmt_apa_clean.png');

  /* ===== 场景 C：结构缺失（无 Introduction / 无 Conclusion 信号）===== */
  console.log('\n--- 场景 C：结构缺失（应指出缺 Introduction / Conclusion）---');
  await cdp.setText(STRUCT_MISSING);
  await sleep(1300);
  const c = await cdp.snapshot();
  ok(c.secRows.length === 3, `结构仍渲染 3 行（实际 ${c.secRows.length}）`);
  ok(c.secBad.length >= 1, `至少 1 段判为缺失（实际 bad=${c.secBad.length}）`);
  ok(/缺少/.test(c.structure), '结构区给出「缺少：…」提示');
  ok(/\bBody\b/.test(c.structure), '仍能识别 Body（正文段落存在）');

  /* ===== 场景 D：MLA 9 ===== */
  console.log('\n--- 场景 D：MLA 9（Works Cited + 括号页码）---');
  await cdp.setText(MLA_DOC);
  await sleep(1300);
  const d = await cdp.snapshot();
  ok(/MLA/.test(d.summary), '识别为 MLA 体系');
  ok(!/混用/.test(d.summary), 'MLA 文本未误报体系混用');
  ok(d.secRows.length === 3, `MLA 文本结构渲染 3 段（实际 ${d.secRows.length}）`);

  const shotD = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(SHOTS, 'fmt_mla.png'), Buffer.from(shotD.data, 'base64'));
  console.log('  [截图] fmt_mla.png');

  /* ===== 场景 E：过短文本 → 不适用 / 被词数门槛拦下 ===== */
  console.log('\n--- 场景 E：过短文本（应被拦下或判不适用，不得给满分）---');
  let dialogMsg = '';
  cdp.lastDialog = (p) => { dialogMsg = p && p.message ? p.message : '(dialog)'; };
  await cdp.setText(TOO_SHORT);
  await sleep(1300);
  const e = await cdp.snapshot();
  /* 15 词文本会被 app 的「<20 词」守卫拦下（弹 alert）——这也是可接受的正确行为；
     若守卫不存在，则应由模块判「本项不适用」。两种情况都不得给出高分。 */
  const blocked = /至少输入|20 个英文单词/.test(dialogMsg);
  ok(blocked || /本项不适用/.test(e.summary),
    `过短文本被拦下或判不适用（dialog="${dialogMsg.slice(0, 40)}"）`);
  /* 注意：被 <20 词守卫拦下时，页面不会重新分析，分数环保留**上一篇**的结果。
     这是正确行为（早退，不产生新判断），故此处只断言「没有对这段短文给出判断」，
     不去断言残留的上一次分数。 */
  ok(blocked || e.score === 'N/A' || e.score === '--',
    `过短文本未产生新的格式判断（blocked=${blocked}, score 残留=${e.score}）`);

  /* ===== 场景 F：未破坏既有模块 ===== */
  console.log('\n--- 场景 F：既有模块未受影响 ---');
  const f = await cdp.eval(`(() => ({
    ai: document.querySelector('#scoreAi').textContent.trim(),
    dup: document.querySelector('#scoreDup').textContent.trim(),
    ching: document.querySelector('#scoreChing').textContent.trim(),
    cite: document.querySelector('#scoreCite').textContent.trim(),
    storylo: document.querySelector('#styloList').children.length,
    blocks: document.querySelectorAll('#results .result-block').length,
    feedback: !document.querySelector('#feedbackBox').classList.contains('hidden'),
    learner: document.querySelector('#learnerBox').innerHTML.length > 20
  }))()`);
  ok(/^\d+$/.test(f.ai), `AI 倾向分正常（${f.ai}）`);
  ok(/^\d+$/.test(f.dup), `重复风险正常（${f.dup}）`);
  ok(/^\d+$|N\/A/.test(f.cite), `文献可疑度正常（${f.cite}）`);
  ok(f.storylo > 0, `AI 特征明细正常（${f.storylo} 项）`);
  ok(f.blocks >= 11, `结果区块数量 ≥11（实际 ${f.blocks}）`);
  ok(f.feedback, '反馈区正常展示');
  ok(f.learner, '经验面板正常展示');

  /* ---------------- 收尾 ---------------- */
  console.log('\n' + '='.repeat(64));
  console.log(`结果：${pass} / ${pass + fail}`);
  console.log('='.repeat(64));

  try { cdp.ws.close(); } catch (err) { /* 忽略 */ }
  chrome.kill(); server.kill();
  await sleep(400);
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (err) { /* 忽略 */ }
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('❌ 运行失败：', e && e.message ? e.message : e);
  process.exit(1);
});
