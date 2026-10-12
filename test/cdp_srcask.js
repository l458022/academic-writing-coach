/* =========================================================================
   上传后「来源标注」端到端验证
   ---------------------------------------------------------------------
   背景：只有特征指纹、没有「真人 / AI」标注的数据，对校准阈值毫无用处。
   而事后回去点反馈按钮的转化率极低 —— 所以在上传完成、用户最清楚
   来源的时候问一句，一次点击即可。

   本测试验证整条链路：
     上传 .docx → 标注条出现 → 点「我写的」→ 开始分析
     → 经验记录的 verdict 被写上 → 贡献包里带上该标注

   运行：node test/cdp_srcask.js
   （自带静态服务器，无需外部准备；需要本机装有 Chrome）
   ========================================================================= */
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
const PY = process.env.WB_PYTHON || 'python';
const CHROME = process.env.WB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8813, ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  PASS | ' + msg); } else { fail++; console.log('  FAIL | ' + msg); } };

(async () => {
  console.log('='.repeat(64));
  console.log('上传后来源标注 · 真实页面 CDP 端到端');
  console.log('='.repeat(64));

  const server = spawn(PY, ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/web/index.html`); if (r.ok) break; } catch (e) { } await sleep(250); }

  const target = `http://127.0.0.1:${PORT}/web/index.html`;
  const ud = path.join(require('os').tmpdir(), 'srcask-' + Date.now());
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9240', `--user-data-dir=${ud}`, '--window-size=1180,1600', target], { stdio: 'ignore' });

  let ws = null;
  for (let i = 0; i < 40; i++) { try { const r = await fetch('http://127.0.0.1:9240/json/list'); const l = await r.json(); const p = l.find(t => t.type === 'page' && t.url.includes('index.html')); if (p) { ws = p.webSocketDebuggerUrl; break; } } catch (e) { } await sleep(300); }
  if (!ws) { console.error('❌ 未找到调试目标'); server.kill(); process.exit(1); }

  const sock = new WebSocket(ws); await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  let id = 0; const pend = new Map();
  sock.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Page.javascriptDialogOpening') { sock.send(JSON.stringify({ id: ++id, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); return; }
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (method, params, to) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); sock.send(JSON.stringify({ id: i, method, params: params || {} })); setTimeout(() => { if (pend.has(i)) { pend.delete(i); rej(new Error('TIMEOUT ' + method)); } }, to || 12000); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };

  try {
    await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable'); await sleep(2600);

    /* 1) 初始状态 */
    console.log('\n--- 1. 初始状态 ---');
    ok(await ev(`!!document.querySelector('#srcAsk')`), '标注条元素存在');
    ok(await ev(`document.querySelector('#srcAsk').classList.contains('hidden')`), '未上传时标注条隐藏');

    /* 2) 上传文件 → 标注条出现 */
    console.log('\n--- 2. 上传 sample_human.docx ---');
    const doc = await send('DOM.getDocument', { depth: -1 });
    const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#fileInput' });
    await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [path.join(__dirname, 'fixtures', 'sample_human.docx')] });
    await sleep(1200);

    ok(await ev(`!document.querySelector('#srcAsk').classList.contains('hidden')`), '上传后标注条显示');
    ok(await ev(`document.querySelectorAll('#srcAsk .src-btns button').length`) === 3, '提供 3 个选项');
    const q = await ev(`document.querySelector('#srcAsk .src-q').textContent`);
    ok(/你自己写的/.test(q), `询问文案正确（"${q}"）`);
    ok(await ev(`document.querySelectorAll('#srcAsk button[data-src]').length`) === 3,
      '选项含 data-src（human / ai / skip）');
    const note = await ev(`document.querySelector('#srcAsk .src-note').textContent`);
    ok(/不会保存原文/.test(note), '明示「不会保存原文」');

    /* 3) 点「我写的」 */
    console.log('\n--- 3. 点「我写的」 ---');
    await ev(`document.querySelector('#srcAsk button[data-src="human"]').click()`);
    await sleep(600);
    ok(await ev(`document.querySelector('#srcAsk').classList.contains('hidden')`), '选择后标注条收起');

    /* 4) 分析 → 标注被写入记录 */
    console.log('\n--- 4. 开始分析 ---');
    await ev(`document.querySelector('#btnAnalyze').click()`);
    await sleep(1500);

    const rec = await ev(`(() => {
      const d = Learner.load();
      const r = d.records[d.records.length - 1];
      return { verdict: r.verdict, hasRaw: !!r.raw, wc: r.wc,
               fb: d.stats.feedbackCount, human: d.stats.humanConfirmed };
    })()`);
    ok(rec.verdict === 'human', `记录被写上标注（verdict=${rec.verdict}）`);
    ok(rec.hasRaw, '同时记录了原始特征（重标定前提）');
    ok(rec.fb >= 1, `反馈计数同步（feedbackCount=${rec.fb}）`);
    ok(rec.human >= 1, `真人数同步（humanConfirmed=${rec.human}）`);

    /* 5) 贡献包带上标注 */
    console.log('\n--- 5. 贡献包 ---');
    const pkg = JSON.parse(await ev(`Learner.exportContribution()`));
    const last = pkg.samples[pkg.samples.length - 1];
    ok(last.label === 'human', `贡献包带上该标注（label=${last.label}）`);
    ok(!!last.raw, '贡献包含原始特征');

    /* 6) 「跳过」不应写入标注 */
    console.log('\n--- 6. 跳过不应写入标注 ---');
    await ev(`document.querySelector('#btnClear').click()`);
    await sleep(400);
    await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [path.join(__dirname, 'fixtures', 'sample_ai.docx')] });
    await sleep(1200);
    await ev(`document.querySelector('#srcAsk button[data-src="skip"]').click()`);
    await sleep(500);
    await ev(`document.querySelector('#btnAnalyze').click()`);
    await sleep(1500);
    const rec2 = await ev(`(() => { const d = Learner.load(); return d.records[d.records.length - 1].verdict; })()`);
    ok(rec2 === null, `「跳过」不写入标注（verdict=${rec2}）`);

    /* 7) 清空后标注条应隐藏 */
    await ev(`document.querySelector('#btnClear').click()`);
    await sleep(400);
    ok(await ev(`document.querySelector('#srcAsk').classList.contains('hidden')`), '清空后标注条隐藏');
  } catch (e) {
    console.error('异常:', e.message);
    fail++;
  } finally {
    console.log('\n' + '='.repeat(64));
    console.log(`结果：${pass} 通过 / ${fail} 失败`);
    console.log('='.repeat(64));
    sock.close(); chrome.kill(); server.kill(); await sleep(300);
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { }
    process.exit(fail ? 1 : 0);
  }
})();
