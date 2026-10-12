/* =========================================================================
   真实页面端到端验证：文献真实性溯源审查模块
   ---------------------------------------------------------------------
   做法（沿用本项目既有经验）：
     1) 在同一个 Python 进程里启动本地服务器 + Chrome（后台服务器跨 Bash 调用会被杀）
     2) Chrome 154 起 /json/new 受限 → 启动时直接在命令行传目标 URL
     3) app.js 的函数不在 window 上 → 通过 ?text=<urlencoded>&run=1 注入并触发真实点击
     4) 用 CDP Runtime.evaluate 读真实 DOM 文本做断言
   运行：node test/cdp_citation.js
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
const PORT = 8791;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, n, extra) {
  if (c) { pass++; console.log(`  PASS | ${n}`); }
  else { fail++; console.log(`  FAIL | ${n}${extra ? '  → ' + extra : ''}`); }
}

/* ---------------- 测试文本 ---------------- */
const FABRICATED = `Artificial intelligence has revolutionized modern education. Studies have shown that AI-assisted learning improves student outcomes by 47%. Research indicates that personalized learning increases engagement significantly. According to Smith et al. (2021), adaptive systems outperform traditional methods. Johnson and Lee (2022) found similar results in their longitudinal study. Moreover, a growing body of research suggests that AI tutors reduce dropout rates. In the International Journal of Modern Educational Research, Brown et al. (2023) demonstrated that AI feedback improves writing quality by 63%. These findings have been confirmed by numerous scholars. The doi: 10.1234/abc is frequently cited in this context.`;

const REAL = `Financial reporting quality has been examined extensively in the accounting literature. Dechow and Dichev (2002) proposed a model linking accruals to cash flows. Subsequent work extended this framework (McNichols, 2002; Ball & Shivakumar, 2006). More recent evidence confirms that reporting quality affects capital allocation (Biddle et al., 2009).

References

Dechow, P. M., & Dichev, I. D. (2002). The quality of accruals and earnings. The Accounting Review, 77(s-1), 35-59. https://doi.org/10.2308/accr.2002.77.s-1.35

McNichols, M. F. (2002). Discussion of the quality of accruals and earnings. The Accounting Review, 77(s-1), 61-69. https://doi.org/10.2308/accr.2002.77.s-1.61

Ball, R., & Shivakumar, L. (2006). The role of accruals in asymmetrically timely gain and loss recognition. Journal of Accounting Research, 44(2), 207-242. https://doi.org/10.1111/j.1475-679X.2006.00198.x

Biddle, G. C., Hilary, G., & Verdi, R. S. (2009). How does financial reporting quality improve investment efficiency? Journal of Accounting and Economics, 48(2-3), 112-131. https://doi.org/10.1016/j.jacceco.2009.09.001`;

/* ---------------- 启动服务器 + Chrome ---------------- */
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

async function chromeWs(chromeProc) {
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

/* ---------------- CDP 客户端 ---------------- */
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
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
}

/* ---------------- 主流程 ---------------- */
(async () => {
  console.log('='.repeat(64));
  console.log('文献真实性溯源审查 · 真实页面 CDP 端到端');
  console.log('='.repeat(64));

  // 1) 服务器
  const server = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  if (!await probe(PORT)) { console.log('❌ 服务器未就绪'); server.kill(); process.exit(1); }
  console.log('\n[1] 本地服务器已就绪 :' + PORT);

  // 2) Chrome —— 直接在命令行传 URL（154 起 /json/new 受限）
  const target = `http://127.0.0.1:${PORT}/web/index.html?text=${encodeURIComponent(FABRICATED)}&run=1`;
  const userDir = path.join(require('os').tmpdir(), 'cdp-cite-' + Date.now());
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=9222', `--user-data-dir=${userDir}`,
    '--window-size=1280,2000', target
  ], { stdio: 'ignore' });
  console.log('[2] Chrome 已启动（无头）');

  const wsUrl = await chromeWs(chrome);
  if (!wsUrl) { console.log('❌ 未取得 CDP 端点'); server.kill(); chrome.kill(); process.exit(1); }
  const cdp = await CDP.connect(wsUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await sleep(2200);   // 等知识库加载 + 自动分析完成

  console.log('[3] 页面已连接，开始断言\n');

  /* ===== 场景 A：AI 幻觉引用文本 ===== */
  console.log('--- 场景 A：AI 编造文献（应判高可疑）---');
  const a = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    const score = q('#scoreCite') ? q('#scoreCite').textContent.trim() : '';
    const block = q('#citeBlock') ? q('#citeBlock').innerText : '';
    const list = q('#citeList') ? q('#citeList').innerText : '';
    const guide = q('#citeGuide') ? q('#citeGuide').innerText : '';
    const summary = q('#citeSummary') ? q('#citeSummary').innerText : '';
    const visible = q('#citeBlock') ? !q('#citeBlock').classList.contains('hidden') : false;
    return { score, block, list, guide, summary, visible,
      hasBoundary: /本项查不到/.test(block), hasNoNet: /不联网/.test(block) };
  })()`);

  ok(a.visible, '文献审查区块已展示');
  ok(/^\d+$/.test(a.score) && parseInt(a.score) >= 50, `可疑度评分 ≥50（实际 ${a.score}）`);
  ok(/悬空引用/.test(a.list), '检出悬空引用（正文引了列表没有）');
  ok(/无出处数字/.test(a.list), '检出无出处数字');
  ok(/空引|研究表明/.test(a.list), '检出「研究表明」类空引');
  ok(/DOI/.test(a.block), '展示 DOI 核查区');
  ok(a.hasBoundary, '展示能力边界（本项查不到）');
  ok(a.hasNoNet, '明确声明不联网核验');
  ok(a.guide.length > 60, '渲染了核验指引清单');

  // 截图
  const shotA = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(SHOTS, 'cite_ai_fabricated.png'), Buffer.from(shotA.data, 'base64'));
  console.log('  [截图] cite_ai_fabricated.png');

  /* ===== 场景 B：规范引用文本（应低可疑）===== */
  console.log('\n--- 场景 B：规范引用（应低可疑、零误报）---');
  await cdp.eval(`(() => {
    const t = document.querySelector('#inputText');
    t.value = ${JSON.stringify(REAL)};
    t.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#btnAnalyze').click();
    return true;
  })()`);
  await sleep(1200);

  const b = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    return {
      score: q('#scoreCite') ? q('#scoreCite').textContent.trim() : '',
      list: q('#citeList') ? q('#citeList').innerText : '',
      block: q('#citeBlock') ? q('#citeBlock').innerText : ''
    };
  })()`);

  ok(/^\d+$/.test(b.score) && parseInt(b.score) < 30, `规范引用可疑度 <30（实际 ${b.score}）`);
  ok(!/悬空引用/.test(b.list), '规范引用：无悬空引用误报');
  ok(!/无出处数字/.test(b.list), '规范引用：无「无出处数字」误报（References 页码未被误判）');

  const shotB = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(SHOTS, 'cite_real_cited.png'), Buffer.from(shotB.data, 'base64'));
  console.log('  [截图] cite_real_cited.png');

  /* ===== 场景 C：无引用文本（应判"不适用"）===== */
  console.log('\n--- 场景 C：无引用文本（应判不适用）---');
  await cdp.eval(`(() => {
    const t = document.querySelector('#inputText');
    t.value = "The accounting profession has evolved considerably over the past century. Practitioners today must navigate complex regulatory environments while maintaining professional scepticism. This essay examines the principal challenges facing auditors in emerging markets today.";
    t.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#btnAnalyze').click();
    return true;
  })()`);
  await sleep(1200);

  const c = await cdp.eval(`(() => {
    const q = s => document.querySelector(s);
    return {
      score: q('#scoreCite') ? q('#scoreCite').textContent.trim() : '',
      block: q('#citeBlock') ? q('#citeBlock').innerText : ''
    };
  })()`);

  ok(c.score === 'N/A', `无引用文本：分数环显示 N/A（实际 ${c.score}）`);
  ok(/本项不适用/.test(c.block), '无引用文本：明确标注「本项不适用」而非判为低风险');

  /* ===== 场景 D：模块整体未破坏既有分析 ===== */
  console.log('\n--- 场景 D：既有模块未受影响 ---');
  const d = await cdp.eval(`(() => ({
    ai: document.querySelector('#scoreAi').textContent.trim(),
    dup: document.querySelector('#scoreDup').textContent.trim(),
    ching: document.querySelector('#scoreChing').textContent.trim(),
    storylo: document.querySelector('#styloList').children.length,
    feedback: !document.querySelector('#feedbackBox').classList.contains('hidden'),
    learner: document.querySelector('#learnerBox').innerHTML.length > 20
  }))()`);
  ok(/^\d+$/.test(d.ai), `AI 倾向分正常渲染（${d.ai}）`);
  ok(/^\d+$/.test(d.dup), `重复风险正常渲染（${d.dup}）`);
  ok(d.storylo > 0, `AI 特征明细正常渲染（${d.storylo} 项）`);
  ok(d.feedback, '反馈区正常展示');
  ok(d.learner, '经验面板正常展示');

  /* ---------------- 收尾 ---------------- */
  console.log('\n' + '='.repeat(64));
  console.log(`结果：${pass} / ${pass + fail}`);
  console.log('='.repeat(64));

  try { cdp.ws.close(); } catch (e) { /* 忽略 */ }
  chrome.kill(); server.kill();
  await sleep(400);
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('❌ 运行失败：', e && e.message ? e.message : e);
  process.exit(1);
});
