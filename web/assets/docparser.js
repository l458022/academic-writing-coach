/* =========================================================================
   文档解析模块 —— 把拖入的文件转成纯文本
   支持：.txt .md .csv .json .docx .pdf .html .rtf（尽力）
   依赖：本地 vendor/jszip.min.js（docx）、vendor/pdf.min.js（pdf）
   ========================================================================= */

const DocParser = (() => {

  const TEXT_EXT = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'text'];

  function extOf(name) {
    const i = String(name).lastIndexOf('.');
    return i < 0 ? '' : String(name).slice(i + 1).toLowerCase();
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('读取文件失败'));
      r.readAsText(file, 'utf-8');
    });
  }

  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('读取文件失败'));
      r.readAsArrayBuffer(file);
    });
  }

  /* ---------- DOCX：本质是 zip，解出 word/document.xml 再抽 <w:t> ---------- */
  async function parseDocx(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip 未加载，无法解析 .docx（请确认 vendor/jszip.min.js 存在）');
    }
    const buf = await readAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(buf);
    const doc = zip.file('word/document.xml');
    if (!doc) throw new Error('不是有效的 .docx 文件');

    const xml = await doc.async('string');
    // <w:p> 是段落，</w:p> 处换行；<w:t>..</w:t> 是文本
    let text = xml
      .replace(/<w:p[ >]/g, '\n<w:p ')          // 段前换行
      .replace(/<w:tab\/>/g, '\t')               // 制表符
      .replace(/<w:br\/>/g, '\n');               // 手动换行
    const parts = [];
    // 抽取所有 <w:t ...>内容</w:t>
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let m;
    const segs = [];
    while ((m = re.exec(text)) !== null) segs.push(m[1]);
    // 更稳妥：按段落切，逐段取文本
    const paras = text.split(/<w:p[ >]/).slice(1);
    const out = [];
    for (const p of paras) {
      let s = '';
      let mm;
      const pre = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
      while ((mm = pre.exec(p)) !== null) s += mm[1];
      out.push(s);
    }
    let result = out.join('\n');
    if (!result.trim()) result = segs.join(' ');
    return decodeXmlEntities(result);
  }

  function decodeXmlEntities(s) {
    return s
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
      .replace(/&amp;/g, '&');
  }

  /* ---------- PDF：用 PDF.js 逐页取文本 ---------- */
  function withTimeout(promise, ms, msg) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))
    ]);
  }

  async function parsePdf(file) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js 未加载，无法解析 .pdf（请确认 vendor/pdf.min.js 存在）');
    }
    // 指定 worker 路径（本地）。
    // 注意：workerSrc 是相对「页面 URL」解析的，不能写死为 'assets/...'，
    // 否则页面不在 web/ 根目录时会解析成错误路径。
    // 这里用当前脚本自身的 URL 反推 assets/ 目录，保证任意页面位置都正确。
    try {
      const self = document.currentScript
        || (document.querySelector('script[src*="docparser.js"]'));
      if (self && self.src) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          new URL('vendor/pdf.worker.min.js', self.src).href;
      } else {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
      }
    } catch (e) { /* 忽略 */ }

    const buf = await readAsArrayBuffer(file);

    // PDF.js v3 需要 worker。worker 初始化有握手过程，某些受限环境（无头/沙箱）
    // 可能长时间不返回，这里加超时保护，避免界面永远卡在"解析中"。
    let pdf;
    try {
      pdf = await withTimeout(
        pdfjsLib.getDocument({ data: buf.slice(0) }).promise,
        20000,
        'PDF 解析超时（可能因环境限制无法启动解析线程）'
      );
    } catch (e) {
      throw new Error('PDF 解析失败：' + (e && e.message ? e.message : e) +
        '。可尝试将 PDF 另存为 .docx 或 .txt 后再拖入。');
    }
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let lastY = null;
      let line = '';
      const lines = [];
      for (const item of content.items) {
        const y = item.transform ? item.transform[5] : null;
        if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
          lines.push(line.trim());
          line = '';
        }
        line += (item.str || '') + ' ';
        lastY = y;
      }
      if (line.trim()) lines.push(line.trim());
      pages.push(lines.join('\n'));
    }
    return pages.join('\n\n');
  }

  /* ---------- HTML：去标签取正文 ---------- */
  function parseHtml(text) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    doc.querySelectorAll('script,style,noscript').forEach(el => el.remove());
    return (doc.body ? doc.body.textContent : '').replace(/\n{3,}/g, '\n\n');
  }

  /* ---------- RTF：粗暴去控制符（尽力） ---------- */
  function parseRtf(text) {
    return text
      .replace(/\\par[d]?/g, '\n')
      .replace(/\{\\\*[^}]*\}/g, '')
      .replace(/\\[a-z]+-?\d* ?/gi, '')
      .replace(/[{}]/g, '')
      .replace(/\n{3,}/g, '\n\n');
  }

  /* ---------- 统一入口 ---------- */
  async function parse(file) {
    const ext = extOf(file.name);
    const sizeMB = file.size / 1024 / 1024;
    if (sizeMB > 20) throw new Error(`文件过大（${sizeMB.toFixed(1)}MB），请控制在 20MB 以内`);

    let text = '';
    let kind = ext;

    if (TEXT_EXT.includes(ext)) {
      text = await readAsText(file);
    } else if (ext === 'docx') {
      text = await parseDocx(file);
    } else if (ext === 'pdf') {
      text = await parsePdf(file);
    } else if (ext === 'html' || ext === 'htm') {
      text = parseHtml(await readAsText(file));
    } else if (ext === 'rtf') {
      text = parseRtf(await readAsText(file));
    } else if (ext === 'doc') {
      throw new Error('旧版 .doc 不支持，请另存为 .docx 后再拖入');
    } else {
      // 未知类型：尝试按文本读
      const t = await readAsText(file);
      if (/[\x00-\x08\x0e-\x1f]/.test(t.slice(0, 2000))) {
        throw new Error(`不支持的文件格式 .${ext}`);
      }
      text = t;
      kind = ext + '(按文本)';
    }

    text = text.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
    return { text, kind, name: file.name, size: file.size };
  }

  return { parse, extOf, SUPPORTED: ['txt', 'md', 'csv', 'json', 'docx', 'pdf', 'html', 'rtf'] };
})();
