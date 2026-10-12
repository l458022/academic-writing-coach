/* =========================================================================
   写作助手 v0.1 — 前端分析引擎
   定位：学术写作辅导（发现问题 + 给修改建议），非代写，不承诺过检测
   ========================================================================= */

let KB = null;

/* ---------------- 匹配工具：把库里的"错误表达"拆成可匹配的模式 ---------------- */
/*
  库里 wrong/phrase 字段有多种形态：
    "make a research / do a research"        → 斜杠分隔多个变体
    "In my opinion, I think that..."         → 带省略号
    "transformative / groundbreaking（高频叠加）" → 带中文括注
    "This paper aims to explore/delve into"  → 斜杠两侧是同一短语的组成部分（不能拆！）
  策略：
    1. 去中文括注、省略号、首尾标点
    2. 按 / 拆分，但若某变体是另一变体的子串（子片段），丢弃它以避免过宽匹配
    3. 只保留 >=2 词的短语；单词模式仅当它与整条短语等长时才使用
*/
function stripAnnotations(s) {
  return String(s)
    .replace(/[（(][^）)]*[）)]/g, ' ')   // 去中英文括号注释
    .replace(/\.{2,}/g, ' ')
    .replace(/[«»"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toPatterns(raw) {
  const cleaned = stripAnnotations(raw);
  if (!cleaned) return [];
  let variants = cleaned.split('/')
    .map(s => s.replace(/^[.,;:!?\s]+|[.,;:!?\s]+$/g, '').trim())
    .filter(s => s.length >= 3);

  // 去重
  variants = [...new Set(variants)];

  // 丢弃"是更长的变体的一部分"的碎片（防止 delve into 这种子片段过宽匹配）
  const filtered = variants.filter(v => {
    const vl = v.toLowerCase();
    return !variants.some(o => {
      const ol = o.toLowerCase();
      return ol !== vl && ol.includes(vl);
    });
  });

  // 关键：若最短变体远短于最长变体（<50%），说明 / 是"短语内或"，短片段单独匹配会误报
  // 例："This paper aims to explore/delve into" → 保留含上下文的完整形式
  if (filtered.length > 1) {
    const lens = filtered.map(v => v.length);
    const minL = Math.min(...lens), maxL = Math.max(...lens);
    if (minL < maxL * 0.5) {
      // 只保留最长的变体（它自带上下文），避免短片段过宽命中
      const longest = filtered.reduce((a, b) => (a.length >= b.length ? a : b));
      return [longest];
    }
  }

  // 过滤过短（单词）且整条不止一个词的情况
  const multi = filtered.filter(v => v.trim().split(/\s+/).length >= 2);
  const single = filtered.filter(v => v.trim().split(/\s+/).length === 1);
  // 单品词仅在整条就是单个词时才采用
  return (multi.length ? multi : single);
}

/* 生成灵活正则：允许词之间任意空白，忽略末尾标点 */
function patternToRegex(phrase) {
  const parts = phrase.toLowerCase().split(/\s+/).filter(Boolean)
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!parts.length) return null;
  return new RegExp(parts.join('\\s+'), 'gi');
}

function countMatches(haystack, phrase) {
  const re = patternToRegex(phrase);
  if (!re) return 0;
  const m = haystack.match(re);
  return m ? m.length : 0;
}
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z'-]+/g) || []);
}
function splitSentences(text) {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 2);
}
function wordCount(text) {
  return tokenize(text).length;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

/* ---------------- 分析：AI 腔 ---------------- */
function analyzeAiTells(text, kb) {
  const lower = ' ' + text.toLowerCase().replace(/\s+/g, ' ') + ' ';
  const hits = [];
  let score = 0;
  const severityWeight = { high: 3, medium: 2, low: 1 };

  for (const p of kb.ai_tells) {
    const variants = toPatterns(p.phrase);
    let count = 0;
    for (const v of variants) count += countMatches(lower, v);
    if (count > 0) {
      const w = severityWeight[p.severity] || 1;
      score += count * w;
      hits.push({
        phrase: p.phrase,
        count,
        severity: p.severity || 'medium',
        type: p.type || '套话',
        hint: p.rewrite_hint || '考虑删去或改写为具体表达'
      });
    }
  }
  hits.sort((a, b) => (severityWeight[b.severity] * b.count) - (severityWeight[a.severity] * a.count));

  // 归一化到 0-100（按每 100 词命中权重）
  const wc = Math.max(wordCount(text), 1);
  const density = (score / wc) * 100;
  const idx = Math.min(100, Math.round(density * 8));
  return { hits, score: idx, rawScore: score };
}

/* ---------------- 分析：中式英语 ---------------- */
function analyzeChinglish(text, kb) {
  const lower = ' ' + text.toLowerCase().replace(/\s+/g, ' ') + ' ';
  const hits = [];

  for (const p of kb.chinglish) {
    const variants = toPatterns(p.wrong);
    let total = 0;
    let matchedVariant = '';
    for (const v of variants) {
      const c = countMatches(lower, v);
      if (c > 0) { total += c; if (!matchedVariant) matchedVariant = v; }
    }
    if (total > 0) {
      hits.push({
        wrong: p.wrong,
        matched: matchedVariant,
        count: total,
        issue: p.issue || '',
        suggestion: p.suggestion || '',
        category: p.category || '表达'
      });
    }
  }
  hits.sort((a, b) => b.count - a.count);
  const wc = Math.max(wordCount(text), 1);
  const idx = Math.min(100, Math.round((hits.reduce((s, h) => s + h.count, 0) / wc) * 100 * 6));
  return { hits, score: idx };
}

/* ---------------- 分析：句式节奏（Burstiness） ---------------- */
function analyzeBurstiness(text) {
  const sentences = splitSentences(text);
  const lens = sentences.map(s => tokenize(s).length).filter(n => n > 0);
  if (lens.length < 2) {
    return { sentences, lens, cv: 0, mean: lens[0] || 0, std: 0, score: 0, tooShort: true };
  }
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;   // 变异系数

  // 人类写作 CV 通常 > 0.5；AI 趋于平稳（CV 低）
  // 映射到 0-100 的"句式变化度"
  const score = Math.min(100, Math.round(cv * 100));
  return { sentences, lens, cv, mean, std, score, tooShort: false };
}

/* ---------------- 分析：重复/模板化结构 ---------------- */
function analyzeStructure(text) {
  const sentences = splitSentences(text);
  const findings = [];

  // 句首重复
  const starts = {};
  sentences.forEach(s => {
    const first = tokenize(s).slice(0, 2).join(' ');
    if (first) starts[first] = (starts[first] || 0) + 1;
  });
  const repeated = Object.entries(starts).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
  repeated.slice(0, 5).forEach(([phrase, count]) => {
    findings.push({
      type: '句首重复',
      detail: `${count} 个句子以 "${phrase}" 开头`,
      hint: '人类写作很少连续用同一句式开头，尝试变化'
    });
  });

  // 连续同长度句（节奏单一）
  const lens = sentences.map(s => tokenize(s).length);
  let run = 1, maxRun = 1;
  for (let i = 1; i < lens.length; i++) {
    if (Math.abs(lens[i] - lens[i - 1]) <= 2) { run++; maxRun = Math.max(maxRun, run); }
    else run = 1;
  }
  if (maxRun >= 4) {
    findings.push({
      type: '节奏单一',
      detail: `连续 ${maxRun} 句长度接近`,
      hint: '刻意插入一个短句或长句，制造节奏起伏'
    });
  }
  return findings;
}

/* ---------------- 分析：改写示范匹配 ---------------- */
function pickRewriteExamples(text, kb) {
  const lower = text.toLowerCase();
  const scored = kb.rewrite_examples.map(e => {
    const before = (e.before || '').toLowerCase();
    const words = tokenize(before);
    // 简单相似：before 中的实词在文中出现比例
    const keyWords = words.filter(w => w.length > 4);
    const overlap = keyWords.filter(w => lower.includes(w)).length;
    return { ex: e, sim: keyWords.length ? overlap / keyWords.length : 0 };
  }).sort((a, b) => b.sim - a.sim);

  const matched = scored.filter(s => s.sim > 0.5).slice(0, 3).map(s => s.ex);
  if (matched.length >= 2) return matched;
  // 否则给通用示范（按 technique 多样化）
  const seen = new Set();
  const generic = [];
  for (const e of kb.rewrite_examples) {
    const t = e.technique || 'x';
    if (!seen.has(t)) { seen.add(t); generic.push(e); }
    if (generic.length >= 3) break;
  }
  return matched.concat(generic).slice(0, 3);
}

/* ---------------- 渲染 ---------------- */
function ringStyle(el, pct, color) {
  const deg = Math.round(pct * 3.6);
  el.style.background = `conic-gradient(${color} 0deg ${deg}deg, var(--bg3) ${deg}deg 360deg)`;
}

function renderAnalysis(text, uniId) {
  const kb = KB;
  const ai = analyzeAiTells(text, kb);
  const ching = analyzeChinglish(text, kb);
  const burst = analyzeBurstiness(text);
  const struct = analyzeStructure(text);

  // 新检测模块
  const stylo = (typeof Stylometry !== 'undefined')
    ? Stylometry.analyze(text, kb)
    : { score: 0, signals: [], reliable: false, wordCount: 0 };
  const dup = (typeof DuplicateCheck !== 'undefined')
    ? DuplicateCheck.analyze(text, kb)
    : { score: 0, internal: { pairs: [], count: 0, ratio: 0 }, corpus: { usable: false, hits: [] }, generic: [], boundary: null, reliable: false };
  const cite = (typeof CitationAudit !== 'undefined')
    ? CitationAudit.analyze(text, kb)
    : { score: 0, applicable: false, items: [], patternHits: [], dois: [], unsourcedNumbers: [], unsourcedClaims: [], dangling: [], orphan: [], yearIssues: [], refEntries: [], inTextCitations: [], boundary: null, guide: null };
  const fmt = (typeof FormatAudit !== 'undefined')
    ? FormatAudit.analyze(text, kb)
    : { applicable: false, reason: '格式模块未加载', style: null, styleName: '--', issues: [], issueCount: 0, structure: null, structureMissing: 0, guide: null, boundary: '' };

  /* ---- 经验学习：记录本次分析的特征指纹（不存原文） ---- */
  let _lastRecordIndex = -1;
  if (typeof Learner !== 'undefined') {
    try {
      const before = Learner.load().records.length;
      Learner.observe(text, stylo, dup, uniId);
      _lastRecordIndex = before;   // 新条目就是原长度对应的下标
    } catch (e) { /* 学习模块失败不得影响分析主流程 */ }
  }

  // ---- 总分环 ----
  const aiColor = stylo.score >= 60 ? 'var(--red)' : stylo.score >= 35 ? 'var(--orange)' : 'var(--green)';
  const dColor  = dup.score >= 60 ? 'var(--red)' : dup.score >= 35 ? 'var(--orange)' : 'var(--green)';
  const bColor  = burst.score <= 35 ? 'var(--orange)' : 'var(--green)';
  const cColor  = ching.score >= 40 ? 'var(--red)' : ching.score >= 15 ? 'var(--orange)' : 'var(--green)';
  const ciColor = !cite.applicable ? 'var(--fg3)' : cite.score >= 50 ? 'var(--red)' : cite.score >= 25 ? 'var(--orange)' : 'var(--green)';
  // 格式规范度：是「规范度」越高越好，故颜色逻辑与风险类相反
  /* ⚠️ 踩坑：只要 fmt.applicable 就计算分数，会让「体系识别不出 + 结构不适用」
     的文本拿到「格式规范度 100」——等于给一段无法判断的文本打满分。
     故：只有在**确实做出了判断**（识别出体系，或结构可判，或查出问题时）才给分，
     否则显示 N/A。 */
  const fmtJudged = fmt.applicable && (
    (fmt.style && fmt.style !== 'unknown' && fmt.style !== 'mixed') ||
    (fmt.structure && fmt.structure.applicable) ||
    (fmt.issueCount || 0) > 0 ||
    fmt.hasReferenceSection
  );
  const fmtScore = fmtJudged ? (() => {
    const issues = fmt.issueCount || 0;
    const missing = fmt.structure && fmt.structure.applicable ? fmt.structureMissing : 0;
    return Math.max(0, 100 - issues * 12 - missing * 18);
  })() : null;
  const fmColor = fmtScore == null ? 'var(--fg3)'
    : fmtScore >= 85 ? 'var(--green)' : fmtScore >= 60 ? 'var(--orange)' : 'var(--red)';

  $('#scoreAi').textContent = stylo.score;
  ringStyle($('#ringAi'), stylo.score, aiColor);
  $('#scoreDup').textContent = dup.score;
  ringStyle($('#ringDup'), dup.score, dColor);
  $('#scoreBurst').textContent = burst.tooShort ? '--' : burst.score;
  ringStyle($('#ringBurst'), burst.score, bColor);
  $('#scoreChing').textContent = ching.score;
  ringStyle($('#ringChing'), ching.score, cColor);
  $('#scoreCite').textContent = cite.applicable ? cite.score : 'N/A';
  ringStyle($('#ringCite'), cite.applicable ? cite.score : 0, ciColor);
  $('#scoreFmt').textContent = fmtScore == null ? 'N/A' : fmtScore;
  ringStyle($('#ringFmt'), fmtScore == null ? 0 : fmtScore, fmColor);

  // ---- 可靠性提示 ----
  const warn = $('#reliableWarn');
  if (stylo.wordCount < 120) { warn.classList.remove('hidden'); } else { warn.classList.add('hidden'); }

  // ---- 综合判定（明确标注为启发式，非检测器结论）----
  const vLabel = $('#verdictLabel'), vSub = $('#verdictSub'), vNote = $('#verdictNote'), vBox = $('#verdictBox');
  let lvl, cls, sub, note;
  const hi = Math.max(stylo.score, dup.score);
  if (hi >= 60) {
    lvl = '检测到较多可疑特征'; cls = 'high';
    sub = `AI 倾向 ${stylo.score} · 重复风险 ${dup.score}`;
    note = '这表示文本中存在较多 AI 套话或重复表述，值得逐条核对修改。**这不等于真实检测器的结论，也不能预测能否通过。**';
  } else if (hi >= 35) {
    lvl = '检测到部分可疑特征'; cls = 'mid';
    sub = `AI 倾向 ${stylo.score} · 重复风险 ${dup.score}`;
    note = '存在一些模板化表达或重复，建议按下方明细逐项检查。本地分析覆盖有限，未命中的问题依然可能存在。';
  } else {
    lvl = '未检测到明显问题'; cls = 'low';
    sub = `AI 倾向 ${stylo.score} · 重复风险 ${dup.score}`;
    note = '在你提交的文本中，本地可见的特征未见异常。**但请注意：本地工具无法覆盖外部比对库与真实检测器，这不代表一定能通过。**';
  }
  vBox.className = 'verdict ' + cls;
  vLabel.textContent = lvl;
  vSub.textContent = sub;
  vNote.innerHTML = note;

  // ---- 反馈区：让用户标注对错，作为"学习信号" ----
  renderFeedback(_lastRecordIndex, { ai: stylo.score, dup: dup.score });
  // ---- 经验进化面板 ----
  renderLearner();

  // ---- ① AI 特征明细（可解释）----
  const sl = $('#styloList');
  if (!stylo.signals.length) {
    sl.innerHTML = '<div class="empty-hint">文本过短，无法提取统计特征。</div>';
  } else {
    const bars = stylo.signals.map(sg => {
      const c = sg.aiScore >= 60 ? 'var(--red)' : sg.aiScore >= 35 ? 'var(--orange)' : 'var(--green)';
      return `
      <div class="stylo-item">
        <div class="stylo-head">
          <span class="stylo-name">${esc(sg.label)}</span>
          <span class="stylo-val" style="color:${c}">${sg.aiScore}<span class="stylo-max">/100</span></span>
        </div>
        <div class="stylo-track"><div class="stylo-fill" style="width:${sg.aiScore}%;background:${c}"></div></div>
        <div class="stylo-metrics">${esc(sg.value)}</div>
        <ul class="stylo-evidence">${sg.evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
        <div class="stylo-note">📌 ${esc(sg.note)}</div>
      </div>`;
    }).join('');
    sl.innerHTML = bars;
  }

  // ---- ② 重复检测 ----
  const dl = $('#dupList');
  $('#dupSummary').textContent = dup.wordCount < 120
    ? `当前文本 ${dup.wordCount} 词（偏短，重复检测需 120 词以上更可靠）。`
    : `文内重复 ${dup.internal.count} 处 · 本地模板重叠 ${dup.corpus && dup.corpus.hitCount || 0} 条 · 万能套语 ${dup.generic.length} 种`;

  if (dup.boundary) {
    $('#dupBoundary').innerHTML =
      `<div class="bd-row"><b>本项能查：</b>${dup.boundary.covered.map(x => `<span class="chip ok">${esc(x)}</span>`).join('')}</div>` +
      `<div class="bd-row"><b>本项查不到：</b>${dup.boundary.notCovered.map(x => `<span class="chip no">${esc(x)}</span>`).join('')}</div>` +
      `<div class="bd-note">${esc(dup.boundary.disclaimer)}</div>`;
  }

  let dh = '';
  if (dup.internal.pairs.length) {
    dh += dup.internal.pairs.slice(0, 6).map(p => `
      <div class="hit high">
        <span class="tag">文内重复</span>
        第 ${p.aIdx} 句 与 第 ${p.bIdx} 句 共享 <b>${p.sharedGrams}</b> 个连续片段（约 ${p.sharedGrams * 6} 词）
        <span class="fix">两处高度雷同，很可能是复制粘贴或改写不充分。<br>→ 其中一句：${esc(p.a.slice(0, 90))}…</span>
      </div>`).join('');
  }
  if (dup.corpus && dup.corpus.hits && dup.corpus.hits.length) {
    dh += dup.corpus.hits.slice(0, 6).map(h => `
      <div class="hit medium">
        <span class="tag">${esc(h.src)}</span>
        与本地模板「<span class="found">${esc(h.phrase)}</span>」重叠 ${(h.overlap * 100).toFixed(0)}%
        <span class="fix">该表达过于通用，建议改为结合你素材的具体表述。</span>
      </div>`).join('');
  }
  if (dup.generic.length) {
    dh += dup.generic.map(g => `
      <div class="hit low">
        <span class="tag">万能套语</span>
        「<span class="found">${esc(g.phrase)}</span>」 × ${g.count}
        <span class="fix">这类句式在各科作业中极常见，是雷同高发区，建议改写或删除。</span>
      </div>`).join('');
  }
  dl.innerHTML = dh || '<div class="empty-hint">✓ 未检测到文内重复或明显模板重叠</div>';

  // ---- ③ AI 套话命中 ----
  const aiList = $('#aiTellList');
  $('#aiTellSummary').textContent = ai.hits.length
    ? `命中 ${ai.hits.length} 类 AI 高频套话（共 ${ai.rawScore} 个权重点）。人是不会这样反复写"重要""关键""随着…的发展"的。`
    : '未命中知识库中的 AI 套话。注意：语料库覆盖有限，未命中不等于没有。';
  aiList.innerHTML = ai.hits.length
    ? ai.hits.slice(0, 20).map(h => `
        <div class="hit ${h.severity}">
          <span class="tag">${esc(h.type)}</span>
          命中 <span class="found">"${esc(h.phrase)}"</span> × ${h.count}
          <span class="fix">💡 ${esc(h.hint)}</span>
        </div>`).join('')
    : '<div class="empty-hint">未命中知识库中的 AI 套话</div>';

  // ---- ④ 中式英语 ----
  const chList = $('#chingList');
  $('#chingSummary').textContent = ching.hits.length
    ? `命中 ${ching.hits.length} 类中式英语/搭配问题。这类问题是非母语写作的常见病灶。`
    : '未命中常见中式英语模式。';
  chList.innerHTML = ching.hits.length
    ? ching.hits.slice(0, 20).map(h => `
        <div class="hit medium">
          <span class="tag">${esc(h.category)}</span>
          <span class="found">"${esc(h.wrong)}"</span> × ${h.count}
          <span class="fix">问题：${esc(h.issue)}<br><b>→ 改法：${esc(h.suggestion)}</b></span>
        </div>`).join('')
    : '<div class="empty-hint">未发现常见中式英语模式</div>';

  // ---- ⑤ 句式节奏 ----
  const chart = $('#burstChart');
  if (burst.tooShort) {
    chart.innerHTML = '';
    $('#burstSummary').textContent = '句子太少，无法分析节奏。建议粘贴 150 词以上。';
  } else {
    const maxLen = Math.max(...burst.lens, 1);
    chart.innerHTML = burst.lens.map((l, i) => {
      const h = Math.max(6, (l / maxLen) * 100);
      const cls = l >= burst.mean + burst.std ? 'long' : l <= burst.mean - burst.std ? 'short' : '';
      return `<div class="burst-bar ${cls}" style="height:${h}%" title="第${i+1}句: ${l}词"></div>`;
    }).join('');
    $('#burstSummary').innerHTML =
      `句长：均值 ${burst.mean.toFixed(1)} 词 · 标准差 ${burst.std.toFixed(1)} · 变异系数 CV=${burst.cv.toFixed(2)}<br>` +
      (burst.cv < 0.45
        ? '<span style="color:var(--orange)">节奏偏平稳——人类写作通常长短句交替更明显，建议插入短句打破均匀感。</span>'
        : '<span style="color:var(--green)">节奏自然，长短句有交替。</span>');
  }

  // ---- 结构发现并入 AI 特征区 ----
  if (struct.length && sl) {
    sl.innerHTML += struct.map(f => `
      <div class="hit medium">
        <span class="tag">${esc(f.type)}</span>${esc(f.detail)}
        <span class="fix">💡 ${esc(f.hint)}</span>
      </div>`).join('');
  }

  // ---- ⑥ 改写示范 ----
  const rw = pickRewriteExamples(text, kb);
  $('#rewriteList').innerHTML = rw.map(e => `
    <div class="rewrite-item">
      <div class="rw-before"><div class="rw-label">原句</div><div class="rw-text">${esc(e.before)}</div></div>
      <div class="rw-after"><div class="rw-label">改写后</div><div class="rw-text">${esc(e.after)}</div></div>
      <div class="rw-note">手法：<b>${esc(e.technique || '')}</b>${e.note ? ' · ' + esc(e.note) : ''}</div>
    </div>`).join('');

  // ---- ⑦ 院校政策 ----
  const pb = $('#policyBlock'), pd = $('#policyDetail');
  const uni = uniId ? kb.universities.find(u => u.id === uniId) : null;
  if (!uni) {
    pb.classList.add('hidden');
  } else {
    pb.classList.remove('hidden');
    pd.innerHTML = `
      <div class="pv-row"><div class="pv-key">院校</div><div class="pv-val">${esc(uni.name_zh)} (${esc(uni.name_en)}) · ${esc(uni.type)}</div></div>
      <div class="pv-row"><div class="pv-key">AI 政策</div><div class="pv-val">${esc(uni.ai_stance)}</div></div>
      <div class="pv-row"><div class="pv-key">评估框架</div><div class="pv-val">${esc(uni.framework)}</div></div>
      <div class="pv-row"><div class="pv-key">考试规定</div><div class="pv-val">${esc(uni.exam_rule)}</div></div>
      <div class="pv-row"><div class="pv-key">相似度红线</div><div class="pv-val" style="color:var(--orange)">${esc(uni.threshold)}</div></div>
      <div class="pv-row"><div class="pv-key">违规处罚</div><div class="pv-val">${esc(uni.penalty)}</div></div>
      <div class="pv-row"><div class="pv-key">检测工具</div><div class="pv-val">${esc(uni.detection)}</div></div>
      <div class="pv-row"><div class="pv-key">关键提示</div><div class="pv-val" style="color:var(--accent2)">${esc(uni.key_note)}</div></div>
      <div class="pv-row"><div class="pv-key">官方来源</div><div class="pv-val"><a href="${esc(uni.source_url)}" target="_blank" rel="noopener">${esc(uni.source_url)}</a></div></div>`;
  }

  // ---- ⑧ 文献真实性溯源审查 ----
  renderCitationAudit(cite);

  // ---- ⑨ 格式规范检查 ----
  renderFormatAudit(fmt);

  $('#results').classList.remove('hidden');
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------------- 渲染：格式规范检查（APA/MLA + 结构） ---------------- */
function renderFormatAudit(fmt) {
  const sum = $('#fmtSummary');
  if (!sum) return;

  // 不适用：① 模块整体不可用 ② 整体可用但无任何可判断项
  const nothingJudged = fmt.applicable &&
    !(fmt.style && fmt.style !== 'unknown' && fmt.style !== 'mixed') &&
    !(fmt.structure && fmt.structure.applicable) &&
    !(fmt.issueCount || 0) && !fmt.hasReferenceSection;
  if (!fmt.applicable || nothingJudged) {
    const why = !fmt.applicable
      ? (fmt.reason || '文本过短或文体不适用')
      : '未识别到引用体系、参考文献区，正文也不足以判断结构';
    sum.innerHTML = `<div class="cite-na">
      <b>本项不适用</b>：${esc(why)}。
      <span class="muted">格式与结构检查需要包含引用或一定篇幅的英文作业文本才能给出有意义的提示。</span>
    </div>`;
    $('#fmtStructure').innerHTML = '';
    $('#fmtIssues').innerHTML = '';
    $('#fmtGuide').innerHTML = '';
    return;
  }

  /* ---- ① 体系识别 ---- */
  const styleColor = fmt.style === 'apa7' ? 'var(--accent2)'
    : fmt.style === 'mla9' ? 'var(--accent2)'
      : fmt.style === 'mixed' ? 'var(--red)' : 'var(--fg2)';
  const confNote = fmt.style === 'unknown'
    ? '未检测到可识别的引用体系（可能没引用，或引用形态不典型）'
    : fmt.style === 'mixed'
      ? '⚠️ 同时出现 APA 与 MLA 特征，一篇作业<b>只能用一种体系</b>'
      : `识别依据：${fmt.styleReasons.slice(0, 3).map(esc).join('；') || '—'}`;

  sum.innerHTML = `
    <div class="cite-head">
      <span class="cite-score" style="color:${styleColor}">${esc(fmt.styleName)}</span>
      ${fmt.style !== 'unknown' && fmt.style !== 'mixed'
        ? `<span class="cite-lvl" style="color:var(--fg3)">识别置信 ${fmt.styleConfidence}%</span>` : ''}
    </div>
    <div class="cite-facts">
      <span class="chip">参考文献区块：${fmt.hasReferenceSection ? `有（<b>${esc(fmt.refHeading)}</b>）` : '<b style="color:var(--orange)">未检测到</b>'}</span>
      <span class="chip">格式问题：${fmt.issueCount ? `<b style="color:${fmt.issueCount >= 3 ? 'var(--red)' : 'var(--orange)'}">${fmt.issueCount} 处</b>` : '<b style="color:var(--green)">0 处</b>'}</span>
      ${fmt.structure && fmt.structure.applicable
        ? `<span class="chip">结构：${fmt.structureMissing ? `<b style="color:var(--orange)">缺 ${fmt.structureMissing} 项</b>` : '<b style="color:var(--green)">三段齐全</b>'}</span>`
        : '<span class="chip">结构：本项不适用</span>'}
    </div>
    <p class="cite-disclaim">${confNote}</p>
    <p class="cite-disclaim">
      ⚠️ <b>本项是「建议核对清单」，不是判分</b>。规则依据 APA 第 7 版与 MLA 第 9 版官方规范，
      但各校/各导师要求可能有差异，<b>请以你的 rubric 为准</b>。
    </p>`;

  /* ---- ② 结构完整性 ---- */
  const st = fmt.structure;
  if (st && st.applicable) {
    const rows = st.sections.map(s => `
      <div class="fmt-sec ${s.ok ? 'ok' : 'bad'}">
        <span class="fmt-sec-ico">${s.ok ? '✓' : '✗'}</span>
        <span class="fmt-sec-name">${esc(s.name)}</span>
        <span class="fmt-sec-note">${esc(s.evidence)}</span>
      </div>`).join('');
    const missingTip = st.missing.length
      ? `<p class="cite-disclaim" style="color:var(--orange)">
           <b>缺少：${st.missing.map(esc).join('、')}</b> —— 多数评分标准把这三段列为硬性要求，
           建议补齐后再交。</p>`
      : `<p class="cite-disclaim" style="color:var(--green)"><b>三段结构齐全</b>，符合 Introduction / Body / Conclusion 的基本要求。</p>`;
    $('#fmtStructure').innerHTML = `
      <h3 class="fmt-h3">文章结构检查（共 ${st.contentParagraphCount} 个正文段 · ${st.totalWords} 词）</h3>
      <div class="fmt-sec-list">${rows}</div>
      ${missingTip}`;
  } else {
    $('#fmtStructure').innerHTML = st ? `
      <h3 class="fmt-h3">文章结构检查</h3>
      <div class="cite-na"><b>本项不适用</b>：${esc(st.naReason || '文体非叙述型')}。
      <span class="muted">分段结构的判断只适用于 essay / report 类叙述文本。</span></div>` : '';
  }

  /* ---- ③ 格式问题清单 ---- */
  if (fmt.issues.length) {
    const issueHtml = fmt.issues.map(it => `
      <div class="hit">
        <div class="hit-head">
          <span class="tag" style="background:rgba(239,68,68,.14);color:var(--red)">格式</span>
          <span class="hit-title">${esc(fmtIssueTitle(it.id))}</span>
          ${it.count > 1 ? `<span class="muted">（${it.count} 处）</span>` : ''}
        </div>
        <div class="hit-body">${esc(it.hint || '')}</div>
        ${it.sample && it.sample.length
          ? `<div class="hit-ev">例：${it.sample.slice(0, 3).map(s => `<code class="cite-code">${esc(String(s).slice(0, 80))}</code>`).join(' ')}</div>`
          : ''}
      </div>`).join('');
    $('#fmtIssues').innerHTML = `<h3 class="fmt-h3">引用格式问题（${fmt.issueCount} 处）</h3>${issueHtml}`;
  } else {
    $('#fmtIssues').innerHTML = fmt.style === 'unknown'
      ? ''
      : `<h3 class="fmt-h3">引用格式问题</h3>
         <p class="muted" style="color:var(--green)">未发现常见格式问题（DOI 写法、过时写法、体系混用等）。</p>`;
  }

  /* ---- ④ 自查清单 ---- */
  if (fmt.guide && fmt.guide.steps && fmt.guide.steps.length) {
    $('#fmtGuide').innerHTML = `
      <div class="cite-guide-box">
        <div class="cg-title">📋 ${esc(fmt.guide.title || '格式自查清单')}</div>
        <ol class="cg-steps">${fmt.guide.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        <div class="cg-note">${esc(fmt.boundary || '')}</div>
      </div>`;
  } else {
    $('#fmtGuide').innerHTML = '';
  }
}

/* 格式问题 id → 中文标题 */
function fmtIssueTitle(id) {
  const M = {
    DOI_BARE: 'DOI 未写成完整链接',
    DOI_PERIOD: 'DOI 后误加句点',
    DOI_PREFIX: 'DOI 使用了 doi: 前缀',
    RETRIEVED_FROM: '使用了过时的 Retrieved from',
    REF_ETAL: '参考文献列表误用 et al.',
    MLAIN_TEXT_APA: 'MLA 正文混入 APA 式年份',
    MLAIN_TEXT_COMMA: 'MLA 正文引用误加逗号',
    STYLE_MIXED: 'APA 与 MLA 混用',
    STYLE_CONFLICT: '正文引用形态与参考文献页标题不匹配',
    MLA_TITLE_WRONG: '参考文献页标题与体系不符',
    APA_TITLE_WRONG: '参考文献页标题与体系不符',
    NO_REF_SECTION: '正文有引用但缺参考文献区',
  };
  return M[id] || id;
}

/* ---------------- 渲染：文献真实性溯源审查 ---------------- */
function renderCitationAudit(cite) {
  const sum = $('#citeSummary');
  if (!sum) return;

  // 不适用：整篇文章没有任何引用 —— 明确说明，不当作"低风险"
  if (!cite.applicable) {
    sum.innerHTML = `<div class="cite-na">
      <b>本项不适用</b>：这篇文章没有检测到任何引用标记或参考文献区块。
      <span class="muted">（这不代表"安全"，只代表本模块没有可审查的对象。若你的作业要求引用文献却没有引用，本身也是问题。）</span>
    </div>`;
    $('#citeBoundary').innerHTML = '';
    $('#citeList').innerHTML = '';
    $('#citeGuide').innerHTML = '';
    return;
  }

  // 概览
  const lvl = cite.score >= 50 ? { t: '可疑度较高', c: 'var(--red)' }
    : cite.score >= 25 ? { t: '存在可疑点', c: 'var(--orange)' }
      : { t: '未见明显异常', c: 'var(--green)' };

  sum.innerHTML = `
    <div class="cite-head">
      <span class="cite-score" style="color:${lvl.c}">${cite.score}<span class="cite-max">/100</span></span>
      <span class="cite-lvl" style="color:${lvl.c}">${esc(lvl.t)}</span>
    </div>
    <div class="cite-facts">
      <span class="chip">参考文献区块：${cite.hasRefSection ? `有（${cite.refEntries.length} 条）` : '<b style="color:var(--orange)">未检测到</b>'}</span>
      <span class="chip">正文引用标记：${cite.inTextCitations.length} 处</span>
      <span class="chip">DOI：${cite.dois.length} 个${cite.dois.filter(d => !d.valid).length ? `（<b style="color:var(--red)">${cite.dois.filter(d => !d.valid).length} 个形态异常</b>）` : ''}</span>
    </div>
    <p class="cite-disclaim">
      ⚠️ <b>本分数是「可疑度」不是「造假概率」</b>。本工具<b>不联网核验</b>，
      无法判断文献是否真实存在，只把形态可疑的挑出来供你人工核查。
    </p>`;

  // 能力边界
  if (cite.boundary) {
    $('#citeBoundary').innerHTML =
      `<div class="bd-row"><b>本项能查：</b>${cite.boundary.covered.map(x => `<span class="chip ok">${esc(x)}</span>`).join('')}</div>` +
      `<div class="bd-row"><b>本项查不到：</b>${cite.boundary.notCovered.map(x => `<span class="chip no">${esc(x)}</span>`).join('')}</div>` +
      `<div class="bd-note">${esc(cite.boundary.disclaimer)}</div>`;
  }

  // 明细
  let h = '';

  // (1) 判定依据（加权项）
  if (cite.items.length) {
    h += cite.items.map(it => `
      <div class="hit ${it.pts >= 14 ? 'high' : 'medium'}">
        <span class="tag">+${it.pts} 可疑度</span>
        ${esc(it.desc)}
        ${it.evidence ? `<span class="fix">证据：${esc(it.evidence)}</span>` : ''}
      </div>`).join('');
  } else {
    h += '<div class="empty-hint">✓ 未检出明显的引用形态异常</div>';
  }

  // (2) DOI 逐条
  if (cite.dois.length) {
    h += `<div class="cite-sub">DOI 核查（请逐条粘到 doi.org 验证）</div>`;
    h += cite.dois.map(d => `
      <div class="hit ${d.valid ? 'low' : 'high'}">
        <span class="tag">${d.valid ? '✓ 形态正常' : '⚠ 形态可疑'}</span>
        <code class="cite-code">${esc(d.doi)}</code>
        <span class="fix">${esc(d.reason)} → 打开 <a href="https://doi.org/${esc(d.doi)}" target="_blank" rel="noopener">doi.org 核验</a></span>
      </div>`).join('');
  }

  // (3) 正文引了但列表没有
  if (cite.dangling.length) {
    h += `<div class="cite-sub">正文引用在文献列表中找不到对应条目（最可疑）</div>`;
    h += cite.dangling.slice(0, 8).map(c => `
      <div class="hit high">
        <span class="tag">悬空引用</span>
        正文引用了 <span class="found">${esc(c.raw)}</span>
        <span class="fix">文献列表中没有找到 ${esc(c.author || '')}${c.year ? ' (' + c.year + ')' : ''} 对应条目。这正是 AI 幻觉引用的典型形态——正文生成得像有出处，列表里却对不上。</span>
      </div>`).join('');
  }

  // (4) 列表有但正文没引
  if (cite.orphan.length) {
    h += `<div class="cite-sub">文献列表条目未被正文引用</div>`;
    h += cite.orphan.slice(0, 5).map(e => `
      <div class="hit low">
        <span class="tag">孤立条目</span>
        ${esc(e.slice(0, 110))}…
        <span class="fix">该条目在正文中未找到引用。可能是遗漏引用，也可能是凑数条目。</span>
      </div>`).join('');
  }

  // (5) 无出处数字
  if (cite.unsourcedNumbers.length) {
    h += `<div class="cite-sub">具体数字未标注来源</div>`;
    h += cite.unsourcedNumbers.slice(0, 6).map(n => `
      <div class="hit high">
        <span class="tag">无出处数字</span>
        出现 <span class="found">${esc(n.number)}</span> 但句中无引用标记
        <span class="fix">"${esc(n.text)}…"<br>学术写作中每个具体数据都应有来源。找不到出处必须删除或补引用。</span>
      </div>`).join('');
  }

  // (6) 空引
  if (cite.unsourcedClaims.length) {
    h += `<div class="cite-sub">「研究表明」类空洞背书</div>`;
    h += cite.unsourcedClaims.slice(0, 6).map(c => `
      <div class="hit medium">
        <span class="tag">空引</span>
        "${esc(c.text)}…"
        <span class="fix">说了"研究/学者/证据表明"但没说是谁的研究。补上具体作者与年份，或删去该论断。</span>
      </div>`).join('');
  }

  // (7) 年份异常
  if (cite.yearIssues.length) {
    h += `<div class="cite-sub">引用年份异常</div>`;
    h += cite.yearIssues.slice(0, 5).map(y => `
      <div class="hit medium">
        <span class="tag">${esc(y.src)}</span>
        ${esc(y.raw)}
        <span class="fix">${esc(y.reason)}</span>
      </div>`).join('');
  }

  // (8) 幻觉形态
  if (cite.patternHits.length) {
    h += `<div class="cite-sub">命中的编造形态</div>`;
    h += cite.patternHits.map(p => `
      <div class="hit ${p.severity === 'high' ? 'high' : 'medium'}">
        <span class="tag">${esc(p.type)}</span>
        命中 ${p.count} 处：${p.samples.map(s => `<span class="found">${esc(s.slice(0, 60))}</span>`).join('、')}
        <span class="fix">${esc(p.desc)}<br><b>→ ${esc(p.hint)}</b></span>
      </div>`).join('');
  }

  $('#citeList').innerHTML = h;

  // 核验指引
  if (cite.guide) {
    $('#citeGuide').innerHTML = `
      <div class="cite-guide-box">
        <div class="cg-title">📋 ${esc(cite.guide.title)}</div>
        <ol class="cg-steps">${cite.guide.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        <div class="cg-note">${esc(cite.guide.disclaimer)}</div>
      </div>`;
  }
}

/* ---------------- 反馈区：收集"学习信号" ---------------- */
function renderFeedback(recIndex, conf) {
  const box = $('#feedbackBox');
  if (!box) return;
  if (typeof Learner === 'undefined') { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');

  const exists = recIndex >= 0;
  box.innerHTML = `
    <div class="fb-head">
      <span class="fb-title">这篇的判断准吗？</span>
      <span class="fb-sub muted">你的标注是系统进化的唯一依据（只记特征，不记原文）</span>
    </div>
    <div class="fb-btns">
      <button class="fb-btn" data-fb="ai" ${exists ? '' : 'disabled'}>✓ 确实像 AI 写的</button>
      <button class="fb-btn" data-fb="human" ${exists ? '' : 'disabled'}>✗ 这是真人写的（误报）</button>
      <button class="fb-btn" data-fb="unclear" ${exists ? '' : 'disabled'}>? 说不准</button>
    </div>
    <div class="fb-result muted" id="fbResult"></div>`;

  box.querySelectorAll('.fb-btn').forEach(b => {
    b.addEventListener('click', () => {
      const kind = b.dataset.fb;
      const r = Learner.feedback(recIndex, kind);
      const txt = { ai: '已记录：确认 AI 写作', human: '已记录：确认为真人写作（计入误报统计）', unclear: '已记录：暂不参与校准' };
      const fr = $('#fbResult');
      if (fr) fr.textContent = (r ? txt[kind] : '记录失败') + ' · 可到「经验进化」区查看汇总';
      renderLearner();   // 立即刷新学习面板，让用户看到反馈的效果
    });
  });
}

/* ---------------- 经验进化面板 ---------------- */
function renderLearner() {
  if (typeof Learner === 'undefined') return;
  let s;
  try { s = Learner.summarize(); } catch (e) { return; }
  // 结果区速览与独立标签页共用同一套数据，full=true 时展示完整内容
  paintLearner($('#learnerBox'), s, false);
  paintLearner($('#learnerFull'), s, true);
}

function paintLearner(box, s, full) {
  if (!box) return;

  const pct = (v) => v == null ? '--' : v;

  const factHtml = s.facts.length
    ? '<ul class="ln-facts">' + s.facts.map(f => `<li>${esc(f).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`).join('') + '</ul>'
    : '<div class="empty-hint">暂无经验结论。</div>';

  // 各特征在两类的均值对比（判别力）
  let featHtml = '';
  if (s.perFeature.length) {
    const rows = s.perFeature
      .sort((a, b) => (b.sep == null ? -1 : b.sep) - (a.sep == null ? -1 : a.sep))
      .map(f => {
        const sepTxt = f.sep == null ? '样本不足'
          : (f.sep >= 20 ? `<span style="color:var(--green)">判别力强（+${f.sep}）</span>`
            : f.sep >= 8 ? `<span style="color:var(--orange)">判别力中（+${f.sep}）</span>`
              : `<span style="color:var(--red)">判别力弱（${f.sep >= 0 ? '+' : ''}${f.sep}）</span>`);
        return `<tr>
          <td>${esc(f.name)}</td>
          <td class="num">${pct(f.aiAvg)} <span class="muted">(${f.aiN})</span></td>
          <td class="num">${pct(f.humanAvg)} <span class="muted">(${f.humanN})</span></td>
          <td>${sepTxt}</td>
        </tr>`;
      }).join('');
    featHtml = `
      <table class="ln-table">
        <thead><tr><th>特征</th><th>确认 AI 均分</th><th>确认真人均分</th><th>区分度</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } else {
    featHtml = '<div class="empty-hint">还没有足够的反馈样本。给几篇文章标注对错后，这里会显示每个特征的实际判别力。</div>';
  }

  // 调参建议（只展示，不自动应用）
  const sugHtml = s.suggestions.length
    ? s.suggestions.map(g => `
      <div class="ln-sug">
        <div class="ln-sug-title">💡 ${esc(g.title)}</div>
        <div class="ln-sug-reason">${esc(g.reason)}</div>
        <div class="ln-sug-action">${esc(g.action)}</div>
      </div>`).join('')
    : '<div class="empty-hint">暂无调参建议。样本增多后，若发现误报/漏报规律，这里会给出建议。</div>';

  // 调参历史
  const editHtml = s.edits.length
    ? '<ul class="ln-edits">' + s.edits.map(e => {
      const d = new Date(e.t);
      const diffs = Object.keys(e.after || {})
        .filter(k => e.before[k] !== e.after[k])
        .map(k => `${k}: ${e.before[k]} → ${e.after[k]}`);
      return `<li><span class="muted">${d.toLocaleString('zh-CN')}</span> · ${esc(diffs.join('；') || '无变化')}${e.reason ? ` · <i>${esc(e.reason)}</i>` : ''}</li>`;
    }).join('') + '</ul>'
    : '<div class="empty-hint">尚未调整过阈值，当前使用默认保守参数。</div>';

  const T = s.tuning;

  if (!full) {
    // 结果区速览：极简版，避免结果页过长
    box.innerHTML = `
      <div class="ln-stats">
        <div class="ln-stat"><b>${s.total}</b><span>累计分析</span></div>
        <div class="ln-stat"><b>${s.feedbackCount}</b><span>已反馈</span></div>
        <div class="ln-stat"><b>${s.humanConfirmed}</b><span>确认真人</span></div>
      </div>
      ${s.facts.length ? '<ul class="ln-facts">' + s.facts.slice(0, 3).map(f => `<li>${esc(f).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</li>`).join('') + '</ul>' : ''}
      <p class="muted ln-tip">完整经验面板与调参建议见顶部「经验进化」标签。</p>`;
    return;
  }

  box.innerHTML = `
    <div class="ln-stats">
      <div class="ln-stat"><b>${s.total}</b><span>累计分析</span></div>
      <div class="ln-stat"><b>${s.feedbackCount}</b><span>已反馈</span></div>
      <div class="ln-stat"><b>${s.aiConfirmed}</b><span>确认 AI</span></div>
      <div class="ln-stat"><b>${s.humanConfirmed}</b><span>确认真人</span></div>
    </div>

    <h3 class="ln-h">经验结论</h3>
    ${factHtml}

    <h3 class="ln-h">各特征判别力（AI 均分 vs 真人均分）</h3>
    <p class="muted ln-tip">区分度 = AI 均分 − 真人均分。差值越大的特征越能区分两者；差值接近 0 或为负的特征，说明它可能在误伤真人。</p>
    ${featHtml}

    <h3 class="ln-h">调参建议（需你确认，系统不自动改）</h3>
    ${sugHtml}

    <h3 class="ln-h">当前生效阈值</h3>
    <div class="ln-tuning">
      <span class="ln-t">套话门槛 clicheGate= <b>${T.clicheGate}</b></span>
      <span class="ln-t">统计上限 statCap= <b>${T.statCap}</b></span>
      <span class="ln-t">加成系数 boostFactor= <b>${T.boostFactor}</b></span>
      <span class="ln-t">加成上限 boostMax= <b>${T.boostMax}</b></span>
      <span class="ln-t">最小词数 minWords= <b>${T.minWords}</b></span>
    </div>
    <div class="ln-actions">
      <button class="ghost" id="lnReset">恢复默认阈值</button>
      <button class="ghost" id="lnExport">导出经验</button>
      <button class="ghost" id="lnImport">导入经验</button>
      <button class="ghost danger" id="lnClear">清空经验记录</button>
    </div>

    <h3 class="ln-h">调参历史</h3>
    ${editHtml}`;

  // 事件绑定
  const reset = $('#lnReset');
  if (reset) reset.addEventListener('click', () => {
    if (confirm('恢复默认阈值？经验记录不会被删除。')) {
      Learner.applyTuning(Learner.DEFAULT_TUNING, '用户手动恢复默认');
      renderLearner();
    }
  });
  const exp = $('#lnExport');
  if (exp) exp.addEventListener('click', () => {
    const blob = new Blob([Learner.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'writer-helper-experience.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  });
  const imp = $('#lnImport');
  if (imp) imp.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        const r = Learner.importJSON(String(fr.result));
        alert(r.msg);
        if (r.ok) renderLearner();
      };
      fr.readAsText(f);
    });
    inp.click();
  });
  const clr = $('#lnClear');
  if (clr) clr.addEventListener('click', () => {
    if (confirm('清空所有经验记录？（阈值设置会保留）此操作不可撤销。')) {
      Learner.clearRecords();
      renderLearner();
    }
  });
}

/* ---------------- 渲染：院校政策库 ---------------- */
function renderUniversities() {
  const kb = KB;
  const q = ($('#uniSearch').value || '').toLowerCase();
  const type = $('#uniType').value;
  const pol = $('#uniPolicy').value;

  const list = kb.universities.filter(u => {
    if (q && !(u.name_zh + u.name_en + u.abbr).toLowerCase().includes(q)) return false;
    if (type && u.type !== type) return false;
    if (pol && u.has_policy !== pol) return false;
    return true;
  });

  const badgeCls = { '明确': 'ok', '部分': 'part', '未知': 'unk', '无': 'none' };
  const badgeTxt = { '明确': '有明确政策', '部分': '部分政策', '未知': '未查到', '无': '无 AI 条款' };

  $('#uniGrid').innerHTML = list.map(u => `
    <div class="uni-card">
      <div class="uni-head">
        <div>
          <div class="uni-name">${esc(u.name_zh)}</div>
          <div class="uni-en">${esc(u.name_en)}</div>
        </div>
        <span class="badge ${badgeCls[u.has_policy] || 'unk'}">${badgeTxt[u.has_policy] || u.has_policy}</span>
      </div>
      <div class="uni-meta">
        <span class="chip">${esc(u.type)}</span>
        <span class="chip">${esc(u.city)}</span>
      </div>
      <div class="uni-row"><span class="k">AI 态度</span><span class="v">${esc(u.ai_stance)}</span></div>
      <div class="uni-row"><span class="k">相似度</span><span class="v" style="color:var(--orange)">${esc(u.threshold)}</span></div>
      <div class="uni-row"><span class="k">处罚</span><span class="v">${esc(u.penalty.slice(0, 60))}${u.penalty.length > 60 ? '…' : ''}</span></div>
      <div class="uni-note">${esc(u.key_note)}</div>
      <div class="uni-row" style="margin-top:10px"><span class="k">来源</span><span class="v"><a href="${esc(u.source_url)}" target="_blank" rel="noopener" style="color:var(--accent2);font-size:11.5px;word-break:break-all">${esc(u.source_url.slice(0, 55))}…</a></span></div>
    </div>`).join('') || '<p class="muted">没有匹配的院校。</p>';
}

/* ---------------- 渲染：知识库 ---------------- */
function renderKbStats() {
  const s = KB.meta.stats;
  const items = [
    ['院校政策', s.universities, '所'],
    ['明确政策', s.universities_with_policy, '所'],
    ['用户痛点', s.pain_points, '条'],
    ['竞品', s.competitors, '个'],
    ['中式英语', s.chinglish, '条'],
    ['AI 腔特征', s.ai_tells, '条'],
    ['改写范式', s.rewrite_examples, '组'],
    ['专业术语', s.majors, '专业'],
  ];
  $('#kbStats').innerHTML = items.map(([l, n, u]) =>
    `<div class="stat-card"><div class="stat-num">${n}</div><div class="stat-label">${l}（${u}）</div></div>`
  ).join('');
  $('#buildTime').textContent = KB.meta.built_at;
}

function renderKbTable(key) {
  const data = KB[key] || [];
  const el = $('#kbContent');
  if (!data.length) { el.innerHTML = '<p class="muted">无数据</p>'; return; }

  let html = '';
  const table = (head, rows) => `<div style="max-height:560px;overflow:auto;border:1px solid var(--line);border-radius:8px">
      <table><thead><tr><th class="num">#</th>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr><td class="num">${i + 1}</td>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  if (key === 'chinglish') {
    html = table(['错误表达', '问题', '建议改法', '类别'],
      data.map(d => [`<span style="color:var(--orange);font-weight:600">${esc(d.wrong)}</span>`, esc(d.issue), esc(d.suggestion), `<span class="chip">${esc(d.category)}</span>`]));
  } else if (key === 'ai_tells') {
    const sev = { high: 'var(--red)', medium: 'var(--orange)', low: 'var(--green)' };
    html = table(['AI 表达', '类型', '严重度', '改写提示'],
      data.map(d => [`<span style="color:var(--orange);font-weight:600">${esc(d.phrase)}</span>`, esc(d.type), `<span style="color:${sev[d.severity] || 'var(--fg2)'};font-weight:600">${esc(d.severity)}</span>`, esc(d.rewrite_hint)]));
  } else if (key === 'rewrite_examples') {
    html = table(['原句', '改写后', '手法'],
      data.map(d => [`<span style="color:var(--fg2)">${esc(d.before)}</span>`, `<span style="color:var(--green)">${esc(d.after)}</span>`, `<span class="chip">${esc(d.technique)}</span>`]));
  } else if (key === 'pain_points') {
    html = table(['痛点', '场景', '类别', '来源'],
      data.map(d => [esc(d.pain_point), esc(d.scene || ''), `<span class="chip">${esc(d.category || '')}</span>`, esc((d.source || '').slice(0, 50))]));
  } else if (key === 'competitors') {
    const feat = (d) => {
      const cf = d.core_features;
      if (!cf || typeof cf !== 'object') return esc(d.category || '');
      const on = Object.keys(cf).filter(k => cf[k]);
      return on.length ? on.map(k => `<span class="chip">${esc(k)}</span>`).join(' ') : '—';
    };
    const price = (d) => {
      const p = d.pricing;
      if (!p) return '—';
      if (typeof p === 'string') return esc(p);
      // 形态1：{currency, plans:[...]}
      if (Array.isArray(p.plans)) {
        return p.plans.map(pl => {
          const v = pl.price_annual != null ? pl.price_annual
            : pl.price_annual_effective_monthly != null ? pl.price_annual_effective_monthly
            : pl.price_monthly != null ? pl.price_monthly : null;
          if (v != null) {
            const unit = pl.price_annual_effective_monthly != null ? '/mo(年付)'
              : pl.price_monthly != null ? '/mo' : '';
            return `${esc(pl.name)}: $${v}${unit}`;
          }
          return `${esc(pl.name)}: ${esc(pl.price || pl.note || '')}`;
        }).join('<br>');
      }
      // 形态2：扁平对象 {currency, note, institutional_price, plans_note, indicative, ...}
      const labelMap = {
        currency: '币种', note: '说明', institutional_price: '机构价', institutional_pricing: '机构价',
        plans_note: '套餐说明', indicative: '参考价', student_price: '学生价', free_tier: '免费档'
      };
      const known = Object.keys(labelMap);
      const parts = [];
      for (const k of known) {
        if (p[k] != null && p[k] !== '') parts.push(`<b>${labelMap[k]}</b> ${esc(p[k])}`);
      }
      for (const [k, v] of Object.entries(p)) {
        if (known.includes(k) || k === 'plans') continue;
        if (typeof v === 'string' || typeof v === 'number') parts.push(`${esc(k)}: ${esc(v)}`);
      }
      return parts.length ? parts.join('<br>') : '—';
    };
    const li = (arr) => (Array.isArray(arr) ? arr.slice(0, 4).map(x => `· ${esc(x)}`).join('<br>') : esc(arr || '—'));
    html = table(['竞品', '核心功能', '定价', '目标用户', '优势', '劣势'],
      data.map(d => [`<b>${esc(d.name || '')}</b><br><span class="muted">${esc(d.category || '')}</span>`,
        feat(d), price(d), esc(d.target_users || ''), li(d.strengths), li(d.weaknesses)]));
  } else if (key === 'majors') {
    html = data.map(m => `<h3>${esc(m.major)}</h3>` + table(['英文', '中文'],
      (m.terms || []).map(t => [esc(t.en), esc(t.zh)]))).join('<div style="height:16px"></div>');
  }
  el.innerHTML = html;
}

/* ---------------- 初始化 ---------------- */
async function init() {
  try {
    const res = await fetch('assets/knowledge_base.json');
    KB = await res.json();
  } catch (e) {
    document.body.innerHTML = '<div style="padding:40px;color:#f85149;font-family:sans-serif">⚠️ 无法加载 knowledge_base.json。<br>请通过本地服务器访问（见 README 启动方式），不要直接双击打开 HTML。</div>';
    return;
  }

  // 填充院校下拉
  const us = $('#uniSelect');
  KB.universities.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id; o.textContent = `${u.name_zh} (${u.abbr})`;
    us.appendChild(o);
  });
  // 专业下拉
  const ms = $('#majorSelect');
  KB.majors.forEach(m => {
    const o = document.createElement('option');
    o.value = m.major; o.textContent = m.major;
    ms.appendChild(o);
  });

  $('#uniCount').textContent = KB.universities.length;
  renderKbStats();
  renderKbTable('chinglish');
  renderUniversities();

  // Tab 切换
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + t.dataset.view).classList.add('active');
    if (t.dataset.view === 'policies') renderUniversities();
    if (t.dataset.view === 'learn') renderLearner();
  }));

  // KB 子 tab
  $$('.kb-tab').forEach(t => t.addEventListener('click', () => {
    $$('.kb-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    renderKbTable(t.dataset.kb);
  }));

  // 分析
  $('#btnAnalyze').addEventListener('click', () => {
    const text = $('#inputText').value.trim();
    if (wordCount(text) < 20) { alert('请至少输入 20 个英文单词，建议 150 词以上以获得有意义的结果。'); return; }
    renderAnalysis(text, $('#uniSelect').value);
  });

  $('#btnClear').addEventListener('click', () => {
    $('#inputText').value = ''; $('#wordCount').textContent = '0 词';
    $('#results').classList.add('hidden');
  });

  $('#btnDemo').addEventListener('click', () => {
    $('#inputText').value = DEMO_TEXT;
    updateCount();
  });

  // 院校筛选
  $('#uniSearch').addEventListener('input', renderUniversities);
  $('#uniType').addEventListener('change', renderUniversities);
  $('#uniPolicy').addEventListener('change', renderUniversities);

  $('#inputText').addEventListener('input', updateCount);
  $('#inputText').addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') $('#btnAnalyze').click();
  });

  function updateCount() {
    $('#wordCount').textContent = wordCount($('#inputText').value) + ' 词';
  }
  updateCount();

  /* ---------------- 文档拖入 / 选择识别 ---------------- */
  const dropZone = $('#dropZone');
  const fileInput = $('#fileInput');
  const fileMeta = $('#fileMeta');
  let dragDepth = 0;

  function setStatus(msg, cls) {
    dropZone.classList.remove('loading', 'error');
    if (msg) { dropZone.classList.add(cls || 'loading'); }
    let st = dropZone.querySelector('.drop-status');
    if (!st) { st = document.createElement('div'); st.className = 'drop-status'; dropZone.appendChild(st); }
    st.textContent = msg || '';
  }

  function clearFile(silent) {
    fileMeta.classList.add('hidden');
    fileInput.value = '';
    setStatus('');
    if (!silent) { dropZone.classList.remove('error'); }
  }

  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  async function handleFile(file) {
    if (!file) return;
    dropZone.classList.remove('error');
    setStatus('正在解析 ' + file.name + ' …', 'loading');
    try {
      const r = await DocParser.parse(file);
      const text = (r.text || '').trim();
      if (!text) throw new Error('未能从该文件中提取到文本（可能是扫描版 PDF 或空文档）');
      $('#inputText').value = text;
      updateCount();
      $('#fmName').textContent = r.name;
      $('#fmInfo').textContent = `${fmtSize(r.size)} · ${r.kind.toUpperCase()} · 提取 ${wordCount(text)} 词`;
      fileMeta.classList.remove('hidden');
      dropZone.classList.remove('error', 'loading');
      setStatus('✅ 已识别 ' + r.name + '，可直接点「开始分析」', '');
      $('#results').classList.add('hidden');
    } catch (err) {
      dropZone.classList.add('error');
      setStatus('❌ ' + (err && err.message ? err.message : '解析失败'), 'error');
    }
  }

  if (dropZone) {
    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, e => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.add('dragover');
    }));
    dropZone.addEventListener('dragleave', e => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      dropZone.classList.remove('dragover');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleFile(f);
    });
  }

  // 阻止浏览器在页面其他区域直接打开被拖入的文件
  ['dragover', 'drop'].forEach(ev => window.addEventListener(ev, e => {
    if (!dropZone || !dropZone.contains(e.target)) { e.preventDefault(); }
  }));

  if (fileInput) fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  const fmClear = $('#fmClear');
  if (fmClear) fmClear.addEventListener('click', e => {
    e.stopPropagation();
    clearFile();
    $('#inputText').value = ''; updateCount();
    $('#results').classList.add('hidden');
  });

  // 支持 URL 参数自动填充与运行（便于自动化验证/分享）：?demo=1&run=1&uni=HELP
  const params = new URLSearchParams(location.search);
  if (params.get('uni')) { $('#uniSelect').value = params.get('uni'); }
  if (params.get('demo') === '1') { $('#inputText').value = DEMO_TEXT; updateCount(); }
  // 支持用 ?text=<urlencoded> 直接注入文本（供自动化验证 / 分享）
  if (params.get('text')) {
    try {
      const raw = params.get('text');
      // 优先按 URL 解码，失败则原样使用
      let t = raw;
      try { t = decodeURIComponent(raw); } catch (e) { /* 保持原样 */ }
      // 允许用 \n 字面量表示换行
      t = t.replace(/\\n/g, '\n');
      $('#inputText').value = t;
      updateCount();
    } catch (e) { /* 忽略 */ }
  }
  if (params.get('run') === '1') { setTimeout(() => $('#btnAnalyze').click(), 150); }
  if (params.get('view')) {
    const t = document.querySelector(`.tab[data-view="${params.get('view')}"]`);
    if (t) t.click();
  }
  if (params.get('kb')) {
    const k = document.querySelector(`.kb-tab[data-kb="${params.get('kb')}"]`);
    if (k) k.click();
  }
}

const DEMO_TEXT = `In today's rapidly evolving business environment, financial accounting plays a crucial role in ensuring the transparency and reliability of corporate financial reporting. It is important to note that the adoption of International Financial Reporting Standards has fundamentally transformed the way organizations prepare and present their financial statements. Moreover, this transformation underscores the importance of accurate revenue recognition and comprehensive disclosure practices.

Firstly, the principle of revenue recognition requires entities to identify performance obligations and allocate transaction prices accordingly. Secondly, the measurement of assets and liabilities must reflect fair value where appropriate, which enhances comparability across jurisdictions. Thirdly, the concept of materiality guides preparers in determining which information is significant enough to influence the decisions of users.

Furthermore, the role of internal controls cannot be overstated. It is essential to establish robust mechanisms that safeguard assets and ensure the integrity of financial data. In addition, management must exercise professional judgment when applying accounting estimates, particularly in areas such as impairment testing and provisions.

In conclusion, financial accounting serves as a critical foundation for informed decision-making. It is essential to strike a balance between regulatory compliance and the provision of decision-useful information. Ultimately, the key is to leverage technology and professional expertise in a responsible manner to enhance the quality of financial reporting.`;

document.addEventListener('DOMContentLoaded', init);
