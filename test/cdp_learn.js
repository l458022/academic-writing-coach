/* CDP 驱动：在真实页面上执行完整交互验证
   1. 启动本地静态服务器（若 8799 未在监听则自动拉起）
   2. 启动 Chrome（远程调试），打开 web/index.html?text=<AI样本>&run=1
   3. 通过 Runtime.evaluate 读取 DOM 状态、点击反馈按钮
   4. 汇总结果
   ⚠️ 踩坑：本测试原**不自带服务器**，依赖外部已跑起 8799。
      一旦没起，Page.navigate 会落到 chrome-error://chromewebdata/，
      表现为「#learnerFull 为 null / blocks=0」这种误导性报错。
      现改为自检 + 自动拉起，并在结束时回收。 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

/* 运行环境路径：优先读环境变量，便于在不同机器上跑。
   ⚠️ 不要硬编码个人绝对路径（开源时会泄露用户名与目录结构）。 */
const CHROME = process.env.WB_CHROME
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PY = process.env.WB_PYTHON || 'python';
const PORT = 9222;
const HTTP_PORT = 8799;
const ROOT = path.join(__dirname, '..');
const BASE = process.argv[2] || `http://127.0.0.1:${HTTP_PORT}/web/index.html`;

const AI_TEXT = "In today's rapidly evolving business environment, financial accounting plays a crucial role in ensuring the transparency and reliability of corporate financial reporting. It is important to note that the adoption of International Financial Reporting Standards has fundamentally transformed the way organizations prepare and present their financial statements. Moreover, this transformation underscores the importance of accurate revenue recognition and comprehensive disclosure practices. Firstly, the principle of revenue recognition requires entities to identify performance obligations and allocate transaction prices accordingly. Secondly, the measurement of assets and liabilities must reflect fair value where appropriate, which enhances comparability across jurisdictions. Furthermore, the role of internal controls cannot be overstated. It is essential to establish robust mechanisms that safeguard assets and ensure the integrity of financial data. In conclusion, financial accounting serves as a critical foundation for informed decision-making.";

/* ⚠️ 踩坑：本测试原来直接打开 BASE（无参数），却断言「AI 文本已分析」——
   页面根本没收到 AI_TEXT，`#scoreAi` 永远是 `--`，于是 5 条断言必失败。
   改为显式注入：?text=<urlencoded>&run=1（与 cdp_citation / cdp_format 一致）。 */
const TARGET = process.argv[2] && process.argv[2] !== BASE
  ? process.argv[2]
  : `${BASE}?text=${encodeURIComponent(AI_TEXT)}&run=1`;

function get(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
}

async function waitFor(fn, tries = 60, gap = 300) {
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v; } catch (e) {}
    await new Promise(r => setTimeout(r, gap));
  }
  return null;
}

/* 探测静态服务器是否已在监听；不在则拉起一个，并返回句柄（供收尾回收） */
async function ensureServer() {
  for (let i = 0; i < 4; i++) {
    const ok = await new Promise(res => {
      http.get({ host: '127.0.0.1', port: HTTP_PORT, path: '/web/index.html' }, r => {
        r.resume(); res(r.statusCode === 200);
      }).on('error', () => res(false));
    });
    if (ok) return { proc: null, spawned: false };
    await new Promise(r => setTimeout(r, 200));
  }
  const proc = spawn(PY, ['-m', 'http.server', String(HTTP_PORT), '--bind', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  const ready = await waitFor(async () => {
    return await new Promise(res => {
      http.get({ host: '127.0.0.1', port: HTTP_PORT, path: '/web/index.html' }, r => {
        r.resume(); res(r.statusCode === 200);
      }).on('error', () => res(false));
    });
  }, 40, 250);
  if (!ready) { try { proc.kill(); } catch (e) {} throw new Error('静态服务器启动失败 :' + HTTP_PORT); }
  return { proc, spawned: true };
}

(async () => {
  let exitCode = 0;
  const srv = await ensureServer();
  console.log('静态服务器:', srv.spawned ? `已自动拉起 :${HTTP_PORT}` : `复用已存在 :${HTTP_PORT}`);

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + require('os').tmpdir() + '\\cdp-learn-' + Date.now(),
    '--no-first-run', '--no-default-browser-check', TARGET,
  ], { stdio: 'ignore' });

  try {
    // 等调试端口就绪
    const ver = await waitFor(async () => JSON.parse(await get('/json/version')));
    if (!ver) throw new Error('Chrome 调试端口未就绪');
    console.log('Chrome:', ver['Browser']);

    // Chrome 新版本对 /json/new 有限制，改为在启动时直接传目标 URL，
    // 再从 /json/list 里取该标签页
    /* ⚠️ 踩坑：连上目标标签页后必须等它**真正导航完成**。
       实测：过早连接会拿到 `about:blank` 时代的执行上下文，
       之后所有 Runtime.evaluate 都作用在空文档上 → #learnerFull 为 null。
       故这里轮询等待目标 URL 出现且 result-block 渲染出来。 */
    let tab = null;
    for (let i = 0; i < 60; i++) {
      const tabs = JSON.parse(await get('/json/list'));
      const cand = tabs.find(t => t.type === 'page' && t.url && t.url.includes('index.html'));
      if (cand && cand.webSocketDebuggerUrl) { tab = cand; break; }
      await new Promise(r => setTimeout(r, 300));
    }
    if (!tab) {
      const tabs = JSON.parse(await get('/json/list'));
      throw new Error('未找到目标标签页: ' + JSON.stringify(tabs.map(t => t.url)));
    }
    console.log('标签页:', tab.url);
    const wsUrl = tab.webSocketDebuggerUrl;

    // 极简 CDP 客户端
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params = {}) => new Promise(res => {
      const mid = ++id; pending.set(mid, res);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const evaluate = async expr => {
      const r = await send('Runtime.evaluate', {
        expression: expr, returnByValue: true, awaitPromise: true,
      });
      if (r.result && r.result.exceptionDetails) {
        return { __err: r.result.exceptionDetails.text };
      }
      return r.result && r.result.result ? r.result.result.value : null;
    };

    await send('Runtime.enable');
    await send('Page.enable');
    /* ⚠️ 踩坑：本连接有时会绑到「导航尚未创建文档」的空 renderer。
       判据：location.href 为空 / result-block 数为 0。
       此时用 Page.navigate 显式导航并等待文档就绪。 */
    for (let i = 0; i < 40; i++) {
      const href = await evaluate('location.href');
      if (typeof href === 'string' && href.includes('index.html')) {
        // 再确认 DOM 真的建起来了
        const n = await evaluate("document.querySelectorAll('.result-block').length");
        if (typeof n === 'number' && n > 0) break;
        await evaluate("location.reload()").catch(() => {});
      } else {
        await send('Page.navigate', { url: TARGET });
      }
      await new Promise(r => setTimeout(r, 400));
    }
    await new Promise(r => setTimeout(r, 800));

    const out = [];
    const chk = (ok, msg) => out.push((ok ? 'PASS' : 'FAIL') + ' | ' + msg);

    // 模块加载
    chk(await evaluate('typeof Learner'), 'Learner 已加载 (' + await evaluate('typeof Learner') + ')');
    chk(await evaluate('typeof Stylometry'), 'Stylometry 已加载 (' + await evaluate('typeof Stylometry') + ')');

    // 等待自动分析结果
    await waitFor(async () => {
      const v = await evaluate("document.querySelector('#scoreAi').textContent");
      return v && v !== '--';
    }, 30, 400);

    const scoreAi = await evaluate("document.querySelector('#scoreAi').textContent");
    chk(+scoreAi >= 60, '纯 AI 文本判高危：AI 倾向 = ' + scoreAi);

    const fbVisible = await evaluate("(()=>{const b=document.querySelector('#feedbackBox');return !!b && !b.classList.contains('hidden')})()");
    chk(fbVisible, '反馈区已显示');

    // 点击「确实像 AI 写的」
    await evaluate("document.querySelector('#feedbackBox .fb-btn[data-fb=\"ai\"]').click(); true");
    await new Promise(r => setTimeout(r, 400));

    const st = await evaluate('JSON.stringify(Learner.summarize().total)');
    chk(+st >= 1, '经验库已记录（total=' + st + '）');
    const fbc = await evaluate('Learner.summarize().feedbackCount');
    chk(+fbc >= 1, '反馈已计入（feedbackCount=' + fbc + '）');

    const lbLen = await evaluate("document.querySelector('#learnerBox').innerHTML.length");
    chk(+lbLen > 50, '结果区经验速览已渲染（' + lbLen + ' 字符）');

    // 切到经验进化标签页（真实点击）
    await evaluate("document.querySelector('.tab[data-view=\"learn\"]').click(); true");
    await new Promise(r => setTimeout(r, 400));
    const fullHtml = await evaluate("document.querySelector('#learnerFull').innerHTML");
    chk(!!fullHtml && fullHtml.includes('当前生效阈值'), '经验进化页完整面板已渲染');
    chk(!!fullHtml && fullHtml.includes('恢复默认阈值'), '调参按钮已生成');
    chk(!!fullHtml && fullHtml.includes('累计分析'), '统计卡片已渲染');
    chk(!!fullHtml && fullHtml.includes('各特征判别力'), '判别力表格区块已渲染');

    // 阈值闭环
    await evaluate("Learner.applyTuning({statCap:33},'cdp'); true");
    const tun = await evaluate("(function(){var p=Stylometry.analyze('Furthermore the systematic implementation of standardized procedures ensures consistency across all operational domains. '.repeat(20),{ai_tells:[]});return p.tuningUsed.statCap})()");
    chk(+tun === 33, 'stylometry 读到新阈值 statCap=' + tun);

    // 隐私
    const leak = await evaluate("Learner.exportJSON().includes('rapidly evolving business environment')");
    chk(leak === false, '经验库未泄露原文');

    // 截图
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (shot.result && shot.result.data) {
      require('fs').writeFileSync(
        require('path').join(__dirname, 'learn_panel.png'),
        Buffer.from(shot.result.data, 'base64'));
      chk(true, '经验进化面板截图已保存');
    }

    const pass = out.filter(x => x.startsWith('PASS')).length;
    const fail = out.filter(x => x.startsWith('FAIL')).length;
    console.log('\n===== 结果 ' + pass + '/' + (pass + fail) + ' =====');
    out.forEach(l => console.log('  ', l));
    exitCode = fail ? 1 : 0;

    ws.close();
  } catch (e) {
    console.error('异常:', e.message);
    exitCode = 1;
  } finally {
    chrome.kill();
    if (srv && srv.proc) { try { srv.proc.kill(); } catch (e) {} }
    process.exit(exitCode);
  }
})();
