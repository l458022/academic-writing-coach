/* =========================================================================
   真实 docx 端到端验证（v0.6 重标定后）
   ---------------------------------------------------------------------
   目的：验证用户提供的**真实学生作业 .docx** 走完整前端链路
   （拖入 → JSZip 解包 → docparser 抽文本 → stylometry 打分 → 渲染）
   的最终分数，与 Node 侧直接喂 .txt 的结果一致。

   做法（沿用本项目既有经验）：
     1) 同一进程内启动本地服务器 + Chrome（后台服务器跨 Bash 调用会被杀）
     2) Chrome 154 起 /json/new 受限 → 启动时命令行直接传目标 URL
     3) 通过 DataTransfer 构造真实 drop 事件，触发前端 file input 流程
     4) CDP Runtime.evaluate 读 DOM 断言

   硬约束：真人作业必须判低（<=35），AI 作业必须判高（>=65）。
   运行：node test/cdp_realdocx.js
   ========================================================================= */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/* 运行环境路径：优先读环境变量，便于在不同机器上跑。
   ⚠️ 不要硬编码个人绝对路径（开源时会泄露用户名与目录结构）。 */
const PY = process.env.WB_PYTHON || 'python';
const CHROME = process.env.WB_CHROME
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8796;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, n, extra) {
  if (c) { pass++; console.log(`  PASS | ${n}`); }
  else { fail++; console.log(`  FAIL | ${n}${extra ? '  → ' + extra : ''}`); }
}

/* ---------- 启动静态服务器（Python 单进程托管，避免被回收） ---------- */
function startServer() {
  const code = `
import http.server, socketserver, os, functools
os.chdir(r"${ROOT.replace(/\\/g, '\\\\')}")
H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=r"${ROOT.replace(/\\/g, '\\\\')}")
class Q(socketserver.TCPServer):
    allow_reuse_address = True
with Q(("127.0.0.1", ${PORT}), H) as httpd:
    httpd.serve_forever()
`;
  return spawn(PY, ['-c', code], { stdio: 'ignore' });
}

/* ---------- 极简 CDP 客户端（Node 22 内置 WebSocket / fetch） ---------- */
async function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((res, rej) => {
    ws.onopen = res; ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expr, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const srv = startServer();
  await sleep(1200);

  const url = `http://127.0.0.1:${PORT}/web/index.html`;
  const userDataDir = path.join(require('os').tmpdir(), 'cdp_realdocx_' + Date.now());

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT + 1}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1400,1000',
    url,
  ], { stdio: 'ignore' });

  let targets = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT + 1}/json/list`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) { targets = page; break; }
    } catch (_) { /* 还没起来 */ }
  }
  if (!targets) {
    console.log('❌ 无法连上 Chrome 调试端口');
    chrome.kill(); srv.kill(); process.exit(1);
  }

  const cdp = await cdpSession(targets.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  // 等页面脚本就绪
  for (let i = 0; i < 30; i++) {
    const ready = await cdp.evaluate('typeof Stylometry !== "undefined" && typeof DocParser !== "undefined"');
    if (ready) break;
    await sleep(300);
  }

  const libs = await cdp.evaluate('JSON.stringify({Stylometry: typeof Stylometry, DocParser: typeof DocParser, JSZip: typeof JSZip})');
  console.log('依赖检查：', libs);
  ok(libs.includes('"Stylometry":"object"'), 'Stylometry 已加载');
  ok(libs.includes('"DocParser":"object"'), 'DocParser 已加载');
  // JSZip 是构造函数，typeof 为 function
  ok(/"JSZip":"(object|function)"/.test(libs), 'JSZip 已加载');

  /* ---------- 用真实 drop 事件喂 docx，再点「开始分析」 ---------- */
  async function dropDocx(filePath) {
    const b64 = fs.readFileSync(filePath).toString('base64');
    const name = path.basename(filePath);
    const expr = `
(async () => {
  const b64 = ${JSON.stringify(b64)};
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const file = new File([arr], ${JSON.stringify(name)},
    { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

  const dt = new DataTransfer();
  dt.items.add(file);

  // 走真实 drop 事件（app.js 绑定在 #dropZone 上）
  const zone = document.getElementById('dropZone');
  zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));

  // 等解析完成（#inputText 被填充）
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 150));
    if ((document.getElementById('inputText').value || '').trim().length > 0) break;
  }
  const extracted = (document.getElementById('inputText').value || '').trim();

  // 点「开始分析」，走完整前端打分链路
  document.getElementById('btnAnalyze').click();

  // 等结果区出现分数
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 150));
    const s = document.getElementById('scoreAi').textContent.trim();
    if (s && s !== '--') break;
  }
  return JSON.stringify({
    name: ${JSON.stringify(name)},
    extractedWords: extracted ? extracted.split(/\\s+/).filter(Boolean).length : 0,
    score: document.getElementById('scoreAi').textContent.trim(),
  });
})()`;
    return cdp.evaluate(expr, true);
  }

  async function readResult() {
    return cdp.evaluate(`
JSON.stringify({
  score: (document.getElementById('scoreAi')||{}).textContent || null,
  words: (document.getElementById('fmInfo')||{}).textContent || null,
  sig: (document.getElementById('scoreBurst')||{}).textContent || null
})`);
  }

  const FIX = path.join(__dirname, 'fixtures');

  /* ===== 场景 A：真人写作样本（必须判低） ===== */
  console.log('\n--- 场景 A：真人写作样本 sample_human.docx（应判低）---');
  /* ⚠️ 隐私说明：本测试原先使用用户的**真实课程作业**副本。
     开源版本已替换为 `fixtures/sample_human.docx` —— 一份**合成**的真人风格文本，
     由 `fixtures/make_fixtures.py` 生成。测试目标不变（验证 docx 解析 + 判分链路），
     但不含任何他人作业内容。 */
  let raw = await dropDocx(path.join(FIX, 'sample_human.docx'));
  let parsed = JSON.parse(raw);
  console.log('   提取词数：', parsed.extractedWords, '| 分数：', parsed.score);
  const humanScore = parseInt(String(parsed.score).replace(/[^\d]/g, ''), 10);
  ok(parsed.extractedWords > 100, `真实 docx 成功提取文本（${parsed.extractedWords} 词）`);
  ok(Number.isFinite(humanScore), '真人样本解析出分数', parsed.score);
  ok(humanScore <= 35, `真人样本判低（<=35，实际 ${humanScore}）`);

  /* ===== 场景 B：AI 写作样本（必须判高） ===== */
  console.log('\n--- 场景 B：AI 写作样本 sample_ai.docx（应判高）---');
  // 清空后重来（走真实「清空」按钮）
  await cdp.evaluate(`(() => { document.getElementById('btnClear').click(); return 1; })()`);
  await sleep(500);
  raw = await dropDocx(path.join(FIX, 'sample_ai.docx'));
  parsed = JSON.parse(raw);
  console.log('   提取词数：', parsed.extractedWords, '| 分数：', parsed.score);
  const aiScore = parseInt(String(parsed.score).replace(/[^\d]/g, ''), 10);
  ok(parsed.extractedWords > 100, `真实 docx 成功提取文本（${parsed.extractedWords} 词）`);
  ok(Number.isFinite(aiScore), 'AI 样本解析出分数', parsed.score);
  ok(aiScore >= 65, `AI 样本判高（>=65，实际 ${aiScore}）`);

  /* ===== 场景 C：分数差必须拉开 ===== */
  console.log('\n--- 场景 C：判别间隔 ---');
  console.log(`   真人 ${humanScore} vs AI ${aiScore}，间隔 ${aiScore - humanScore}`);
  ok(aiScore - humanScore >= 30, `真人与 AI 间隔 >=30（实际 ${aiScore - humanScore}）`);

  /* 截图留证 */
  await cdp.send('Page.captureScreenshot', { format: 'png' }).then(async (res) => {
    fs.writeFileSync(path.join(__dirname, 'realdocx_ai.png'), Buffer.from(res.data, 'base64'));
    console.log('  [截图] realdocx_ai.png');
  });

  console.log('\n' + '='.repeat(64));
  console.log(`结果：${pass} 通过 / ${fail} 失败`);
  console.log('='.repeat(64));

  cdp.close();
  chrome.kill();
  srv.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('测试异常：', e);
  process.exit(1);
});
