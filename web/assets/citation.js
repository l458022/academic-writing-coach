/* =========================================================================
   文献真实性溯源审查模块（Citation Audit）
   ---------------------------------------------------------------------
   要解决的问题：**AI 编造文献（幻觉引用）**。
   AI 写文章时会生成"看起来完全像真的"的引用：作者、年份、期刊名、DOI、
   页码一应俱全，但实际上这些文献根本不存在。这是 AI 写作最难被表面检查
   发现、也最容易导致学术不端指控的缺陷。

   ⚠️ 能力边界（必须向用户显式声明，不可省略）：
     本模块 **不做联网核验**。原因：
       (1) 产品是纯前端离线运行（无服务器、无后端代理）；
       (2) Crossref / doi.org / Google Scholar 均无免费开放的浏览器直连
           跨域接口，无法在页面里直接调用；
       (3) 即便能调用，也无法凭标题猜出"这篇到底存不存在"——必须人去看。
     所以本模块做的是 **可疑度筛查（triage）**：
       把"形态上像幻觉引用"的地方挑出来 → 给出核验方法 → 由人逐条核查。
     它输出的结论是「可疑 / 需人工核实」，**不是「确定为假」**。
   ========================================================================= */

const CitationAudit = (() => {

  /* ---------------- 基础工具 ---------------- */

  // 常见「万能姓氏」——AI 编造引用时高度偏好这些
  const COMMON_SURNAMES = new Set([
    'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis',
    'rodriguez', 'martinez', 'hernandez', 'lopez', 'gonzalez', 'wilson', 'anderson',
    'thomas', 'taylor', 'moore', 'jackson', 'martin', 'lee', 'perez', 'thompson',
    'white', 'harris', 'sanchez', 'clark', 'ramirez', 'lewis', 'robinson', 'walker',
    'young', 'allen', 'king', 'wright', 'scott', 'torres', 'nguyen', 'hill', 'flores',
    'green', 'adams', 'nelson', 'baker', 'hall', 'rivera', 'campbell', 'mitchell',
    'carter', 'roberts', 'wang', 'zhang', 'chen', 'liu', 'yang', 'huang', 'kim',
    'park', 'tanaka', 'suzuki', 'kumar', 'singh', 'patel', 'ahmed', 'hassan'
  ]);

  // 疑似"看起来权威但可能不存在"的期刊名词根
  const JOURNAL_ROOT_WORDS = [
    'journal', 'international', 'advanced', 'modern', 'contemporary', 'global',
    'research', 'studies', 'review', 'annals', 'proceedings', 'transactions',
    'frontiers', 'trends', 'quarterly', 'bulletin', 'archive'
  ];

  // 顶刊名单（被 AI 滥用作"权威背书"的高频目标）
  const TOP_JOURNALS = [
    'nature', 'science', 'cell', 'the lancet', 'lancet', 'new england journal of medicine',
    'nejm', 'jama', 'bmj', 'pnas', 'physical review letters'
  ];

  /* 引用标记形态
     ⚠️ 括号式引用必须支持「多条目并存」形态：
        (McNichols, 2002; Ball & Shivakumar, 2006)
        (Smith, 2019, 2020; Jones & Lee, 2021)
     否则一次括号引用里第 2 个及之后的条目全部漏抽 —— 实测踩坑，
     这正好导致"正文引了但列表对不上"的漏检（本该发现的悬空引用查不出来）。 */
  // 单个条目： Author (&|and Author)? (et al.)? , YEAR
  const CITE_ITEM = "([A-Z][A-Za-z'\\-]+)(?:\\s*(?:&|and)\\s*([A-Z][A-Za-z'\\-]+))?(?:\\s+et\\s+al\\.?)?\\s*,\\s*((?:19|20)\\d{2}[a-z]?)";
  // 整个括号：（条目(; 条目)*）
  const RE_PAREN_CITE = new RegExp("\\(\\s*" + CITE_ITEM + "(?:\\s*;\\s*" + CITE_ITEM + ")*\\s*\\)", 'g');
  // 方括号数字式 [1] / [1,2] / [3-5]
  const RE_NUM_CITE = /\[(\d+(?:\s*[,\-–]\s*\d+)*)\]/g;
  // 叙述式 Author (2020) / Author et al. (2020)
  // Author & Other (2020) / Author and Other (2020)
  /* ⚠️ 叙述式引用的作者归属（实测踩坑）：
     "Dechow and Dichev (2002)" 中 **第一作者是 Dechow**，APA/哈佛体例
     下索引时用第一作者姓氏。初版正则只抓了紧邻年份的那个姓（Dichev），
     导致与文献列表条目 "Dechow, P. M., & Dichev, I. D." 对不上，
     被误报为「孤立条目」。故显式捕获「姓 (and/&) 姓 (年)」整体，
     并优先取第一个姓。 */
  const RE_NARR_CITE = /\b([A-Z][A-Za-z'\-]+)(?:\s*(?:&|and)\s*([A-Z][A-Za-z'\-]+))?(?:\s+et\s+al\.?)?\s*\(((?:19|20)\d{2}[a-z]?)\)/g;
  // DOI
  const RE_DOI = /\b(?:doi:\s*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,5}\/[^\s,;)"'\]<>]+)/gi;

  function sentences(text) {
    return String(text)
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 2);
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  /* =====================================================================
     1) 参考文献列表检测
     ---------------------------------------------------------------------
     判断文本是否含参考文献区块。有引用标记却无列表 → 强可疑信号。
     ===================================================================== */
  const REF_HEADING_RE = /^[\s#*\-–—]*(references|reference list|bibliography|works cited|literature cited|参考文献|引用文献|参考书目)\s*[:：]?\s*$/im;

  function findReferenceSection(text) {
    const s = String(text);
    const m = s.match(REF_HEADING_RE);
    if (!m) return { has: false, heading: '', headingIndex: -1, bodyText: s, listText: '', entries: [] };
    const idx = s.indexOf(m[0]);
    const bodyText = s.slice(0, idx).trim();
    const listText = s.slice(idx + m[0].length).trim();
    const entries = parseEntries(listText);
    return { has: true, heading: m[0].trim(), headingIndex: idx, bodyText, listText, entries };
  }

  // 解析条目：以「新行 + 大写字母/数字」或空行分隔
  function parseEntries(listText) {
    const lines = String(listText).split(/\n/).map(l => l.trim()).filter(Boolean);
    const entries = [];
    let cur = '';
    for (const ln of lines) {
      // 新条目通常以 [1] / 1. / 或作者姓（大写字母）开头，且当前已有一条较完整的
      const isNew = /^(\[\d+\]|\d+[.)]|[A-Z][A-Za-z'\-]+,)/.test(ln);
      if (isNew && cur.length > 40) { entries.push(cur.trim()); cur = ln; }
      else { cur = cur ? cur + ' ' + ln : ln; }
    }
    if (cur.trim()) entries.push(cur.trim());
    return entries.filter(e => e.length > 25);
  }

  function yearOf(s) {
    const m = String(s).match(/\b((?:19|20)\d{2})[a-z]?\b/);
    return m ? parseInt(m[1], 10) : null;
  }

  function surnameOf(entry) {
    const m = String(entry).match(/^([A-Z][A-Za-z'\-]+)/);
    return m ? m[1] : '';
  }

  /* =====================================================================
     2) 正文引用抽取
     ===================================================================== */
  function extractInTextCitations(text) {
    const s = String(text);
    const out = [];

    let m;
    // 括号式：一个括号内可能有多条（用 ; 分隔），逐条展开
    const reParen = new RegExp(RE_PAREN_CITE.source, 'g');
    while ((m = reParen.exec(s)) !== null) {
      const whole = m[0];
      // 展开括号内所有条目
      const inner = whole.replace(/^\(\s*|\s*\)$/g, '');
      const items = inner.split(/\s*;\s*/);
      for (const it of items) {
        const im = it.match(new RegExp('^' + CITE_ITEM + '$'));
        if (!im) continue;
        out.push({
          raw: '(' + it.trim() + ')', kind: 'paren',
          author: im[1], second: im[2] || '', year: parseInt(im[3], 10),
          etAl: /et\s+al/i.test(it),
          index: m.index
        });
      }
    }
    const reNarr = new RegExp(RE_NARR_CITE.source, 'g');
    while ((m = reNarr.exec(s)) !== null) {
      // 叙述式：Author (2020)；若该位置已被括号式覆盖则跳过（避免重复计数）
      const covered = out.some(c => c.kind === 'paren' && Math.abs(c.index - m.index) < 2);
      if (covered) continue;
      out.push({
        raw: m[0], kind: 'narrative',
        // 取第一个姓作为索引作者（与 APA 文献列表的排序依据一致）
        author: m[1], second: m[2] || '', year: parseInt(m[3], 10),
        etAl: /et\s+al/i.test(m[0]),
        index: m.index
      });
    }
    const reNum = new RegExp(RE_NUM_CITE.source, 'g');
    while ((m = reNum.exec(s)) !== null) {
      out.push({ raw: m[0], kind: 'numeric', nums: m[1], index: m.index });
    }
    return out;
  }

  /* =====================================================================
     3) 幻觉形态模式匹配
     ===================================================================== */
  function matchHallucinationPatterns(text, rules) {
    const s = String(text);
    const hits = [];
    for (const r of rules) {
      let re;
      try { re = new RegExp(r.pattern, 'gi'); } catch (e) { continue; }
      const found = s.match(re);
      if (found && found.length) {
        hits.push({
          id: r.id, type: r.type, severity: r.severity,
          count: found.length,
          samples: [...new Set(found.map(x => x.trim()))].slice(0, 3),
          desc: r.desc, hint: r.hint
        });
      }
    }
    return hits.sort((a, b) => b.count - a.count);
  }

  /* =====================================================================
     4) 「研究表明」类空引 —— 需要上下文判断：有背书词但句中无出处
     ===================================================================== */
  const VAGUE_BACKING = /\b(studies|research|researchers|scholars|experts|evidence|literature|findings|data)\b[^.]{0,40}\b(show|shows|shown|suggest|suggests|suggested|indicate|indicates|indicated|find|finds|found|reveal|reveals|revealed|demonstrate|demonstrates|demonstrated|confirm|confirms|confirmed|prove|proves|proven)\b/i;
  const HAS_CITATION_NEAR = /\(([A-Z][A-Za-z'\-]+)/;

  function findUnsourcedClaims(text) {
    const sents = sentences(text);
    const out = [];
    for (let i = 0; i < sents.length; i++) {
      const s = sents[i];
      if (VAGUE_BACKING.test(s) && !HAS_CITATION_NEAR.test(s)) {
        out.push({ text: s.slice(0, 180), index: i + 1 });
      }
    }
    return out;
  }

  /* =====================================================================
     5) 数字无出处
     ---------------------------------------------------------------------
     学术写作中每个具体统计数字都应有来源。找出含具体数字但无引用标记的句子。
     ⚠️ 只针对**统计性数字**（百分比、金额、千分位、百万级），
        不把孤立的 4 位年份当成"数字"——否则 "Dechow and Dichev (2002) proposed..."
        会被误判为无出处数字（实测踩坑）。
     ===================================================================== */
  const RE_STAT = /(\b\d{1,3}(?:\.\d+)?\s*%|\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s*(?:million|billion|trillion|thousand)\b|\b\d{3,}\b(?!\s*[-–)]?\s*(?:s-1|pp?\.|pages)))/i;
  // 排除纯年份形态：19xx / 20xx 且不在百分比/金额语境
  function isPureYear(tok) {
    return /^(19|20)\d{2}$/.test(String(tok).replace(/[^\d]/g, ''));
  }
  // 句中出现引用标记（任意形态）就不算无出处
  const RE_ANY_CITE = /(\(\s*[A-Z][A-Za-z'\-]+(?:\s*(?:&|and)\s*[A-Z][A-Za-z'\-]+)?(?:\s+et\s+al\.?)?\s*,\s*(?:19|20)\d{2}|\[\d+\]|[A-Z][A-Za-z'\-]+\s+(?:et\s+al\.?\s+)?\((?:19|20)\d{2}\))/;

  function findUnsourcedNumbers(text) {
    const sents = sentences(text);
    const out = [];
    for (let i = 0; i < sents.length; i++) {
      const s = sents[i];
      if (RE_ANY_CITE.test(s)) continue;              // 该句已有引用，跳过
      if (!RE_STAT.test(s)) continue;
      const m = s.match(RE_STAT);
      if (!m) continue;
      const tok = m[0].trim();
      if (isPureYear(tok)) continue;                  // 孤立的 4 位年份不算统计数字
      out.push({ text: s.slice(0, 180), number: tok, index: i + 1 });
    }
    return out;
  }

  /* =====================================================================
     6) DOI 形态检查
     ===================================================================== */
  function checkDois(text) {
    const s = String(text);
    const found = [];
    const re = new RegExp(RE_DOI.source, 'gi');
    let m;
    while ((m = re.exec(s)) !== null) {
      const doi = m[1].replace(/[.,;)\]]+$/, '');
      const parts = doi.split('/');
      const suffix = parts[1] || '';
      // 形态判据：DOI 后缀一般较长且含数字或连字符；过短或纯字母高度可疑
      const healthy = suffix.length >= 6 && /\d/.test(suffix);
      found.push({
        doi,
        valid: healthy,
        reason: healthy ? '形态正常（仍需到 doi.org 实测）'
          : (suffix.length < 6 ? '后缀过短，AI 编造 DOI 的典型形态' : '后缀无数字，形态异常')
      });
    }
    return found;
  }

  /* =====================================================================
     7) 引用完整性：正文标记 ↔ 文献列表 双向对照
     ===================================================================== */
  function crossCheck(inText, entries) {
    const issues = [];

    // (a) 正文有标记，列表无对应 → dangling（最可疑）
    const entrySurnames = entries.map(e => ({
      entry: e, surname: surnameOf(e).toLowerCase(), year: yearOf(e)
    }));

    const dangling = [];
    for (const c of inText) {
      if (c.kind === 'numeric') continue;
      const a = (c.author || '').toLowerCase();
      if (!a) continue;
      const hit = entrySurnames.some(e =>
        (e.surname === a || e.entry.toLowerCase().includes(a)) &&
        (c.year == null || e.year == null || Math.abs(e.year - c.year) <= 1)
      );
      if (!hit) dangling.push(c);
    }

    // (b) 列表有条目，正文未引用 → orphan
    // 匹配时同时看「引用中的第一作者」与「引用的完整 raw」（含 &/and 第二作者），
    // 避免 "Dechow and Dichev (2002)" 因只比对一个姓而误报孤立条目。
    const orphan = [];
    for (const e of entrySurnames) {
      if (!e.surname) continue;
      const used = inText.some(c => {
        if (c.kind === 'numeric') return true;  // 数字式无法对照
        const raw = (c.raw || '').toLowerCase();
        const a = (c.author || '').toLowerCase();
        const b = (c.second || '').toLowerCase();
        if (!a) return false;
        return e.surname === a || e.surname.includes(a) || a.includes(e.surname)
          || (b && (e.surname === b || e.surname.includes(b) || b.includes(e.surname)))
          || raw.includes(e.surname);
      });
      if (!used) orphan.push(e.entry);
    }

    // (c) 作者集中度：引用中常见姓氏占比
    const names = inText.filter(c => c.kind !== 'numeric' && c.author)
      .map(c => (c.author || '').toLowerCase());
    const commonCount = names.filter(n => COMMON_SURNAMES.has(n)).length;
    const concentration = names.length >= 4 ? commonCount / names.length : 0;

    return { dangling, orphan, concentration, citedAuthorCount: names.length };
  }

  /* =====================================================================
     8) 年份异常
     ===================================================================== */
  function checkYearAnomalies(inText, entries) {
    const thisYear = new Date().getFullYear();
    const out = [];
    const all = [
      ...inText.filter(c => c.year).map(c => ({ y: c.year, src: '正文引用', raw: c.raw })),
      ...entries.map(e => ({ y: yearOf(e), src: '文献列表', raw: e.slice(0, 80) }))
    ];
    for (const x of all) {
      if (x.y == null) continue;
      if (x.y > thisYear) out.push({ ...x, reason: `年份 ${x.y} 晚于当前年份 ${thisYear}（未来文献）` });
      else if (x.y < 1800) out.push({ ...x, reason: `年份 ${x.y} 过早，需核实是否笔误` });
    }
    return out;
  }

  /* =====================================================================
     综合评估
     ===================================================================== */
  function analyze(text, kb) {
    const rules = (kb && kb.citation_checks && Array.isArray(kb.citation_checks.hallucination_patterns))
      ? kb.citation_checks.hallucination_patterns : [];

    const wordCount = (String(text).match(/[A-Za-z][A-Za-z'-]*/g) || []).length;

    const ref = findReferenceSection(text);
    /* ⚠️ 关键：正文特征（引用标记、数字、空引、模式）必须在**正文**上计算，
       不能把参考文献列表也算进去——列表里天然全是年份、卷期、页码，
       若一并扫描会把每一篇正常文献的卷期页码都误判为"无出处数字"。
       （实测踩坑：初版把列表一起扫，一篇规范引用的文本被检出 12 处
         "无出处数字"，全部来自 References 里的 77(s-1), 35-59 这类页码。） */
    const body = ref.has ? ref.bodyText : String(text);
    const inText = extractInTextCitations(body);
    const patternHits = matchHallucinationPatterns(body, rules);
    const dois = checkDois(String(text));   // DOI 两处都要看：正文可能给 DOI，列表里也会有
    const unsourcedNums = findUnsourcedNumbers(body);
    const unsourcedClaims = findUnsourcedClaims(body);
    const cross = crossCheck(inText, ref.entries);
    const yearIssues = checkYearAnomalies(inText, ref.entries);

    const hasAnyCitation = inText.length > 0 || ref.entries.length > 0 || dois.length > 0;

    /* ---- 编造风险分（0-100）----
       注意：这是"可疑度"，不是"造假概率"。宁可提示需要核实，不做定论。 */
    let score = 0;
    const items = [];
    const add = (key, pts, desc, evidence) => {
      score += pts;
      items.push({ key, pts, desc, evidence: evidence || '' });
    };

    // (1) 有引用标记但无参考文献列表 —— AI 幻觉的典型形态
    if (inText.length >= 3 && !ref.has) {
      add('no_reference_section', 18, '正文有引用标记，却没有参考文献列表',
        `检出 ${inText.length} 处正文引用标记，但未找到 References/Bibliography 区块`);
    }

    // (2) dangling：正文引了，列表里没有
    if (cross.dangling.length) {
      const pts = Math.min(22, 8 + cross.dangling.length * 4);
      add('dangling_marker', pts, '正文引用在文献列表中找不到对应条目',
        cross.dangling.slice(0, 5).map(c => c.raw).join('、'));
    }

    // (3) DOI 形态异常
    const badDois = dois.filter(d => !d.valid);
    if (badDois.length) {
      add('doi_unformatted', Math.min(16, 8 + badDois.length * 4), 'DOI 形态异常',
        badDois.slice(0, 4).map(d => `${d.doi}（${d.reason}）`).join('；'));
    }

    // (4) 数字无出处
    if (unsourcedNums.length) {
      add('unsourced_number', Math.min(20, 6 + unsourcedNums.length * 4), '具体统计数字未标注来源',
        `${unsourcedNums.length} 处，例如："${unsourcedNums[0].text.slice(0, 70)}…"`);
    }

    // (5) 「研究表明」空引
    if (unsourcedClaims.length) {
      add('vague_attribution', Math.min(14, 5 + unsourcedClaims.length * 3), '「研究表明」类空洞背书',
        `${unsourcedClaims.length} 处，例如："${unsourcedClaims[0].text.slice(0, 70)}…"`);
    }

    // (6) 作者集中度
    if (cross.concentration >= 0.5 && cross.citedAuthorCount >= 5) {
      add('author_concentration', 12, '引用作者过度集中在常见姓氏',
        `${cross.citedAuthorCount} 位引用作者中，${Math.round(cross.concentration * 100)}% 是 Smith/Johnson/Wang 这类高频姓氏`);
    }

    // (7) 年份异常
    if (yearIssues.length) {
      add('year_anomaly', Math.min(14, 6 + yearIssues.length * 4), '引用年份异常',
        yearIssues.slice(0, 3).map(y => `${y.raw}（${y.reason}）`).join('；'));
    }

    // (8) 幻觉形态模式
    const strongPatterns = patternHits.filter(h => h.severity === 'high');
    if (strongPatterns.length) {
      add('pattern_high', Math.min(16, strongPatterns.length * 6), '命中高危幻觉形态',
        strongPatterns.map(h => h.type).join('、'));
    }

    score = Math.round(Math.max(0, Math.min(100, score)));

    // 若整篇文章根本没有引用——本模块不适用（不是"低风险"，是"不适用"）
    const applicable = hasAnyCitation || ref.has;

    return {
      score,
      applicable,
      reliable: wordCount >= 150,
      wordCount,
      // 明细
      hasRefSection: ref.has,
      refEntries: ref.entries,
      inTextCitations: inText,
      dois,
      unsourcedNumbers: unsourcedNums,
      unsourcedClaims,
      dangling: cross.dangling,
      orphan: cross.orphan,
      authorConcentration: cross.concentration,
      yearIssues,
      patternHits,
      items,
      // 核验指引
      guide: (kb && kb.citation_checks && kb.citation_checks.verification_guide)
        ? kb.citation_checks.verification_guide : null,
      // 明确能力边界
      boundary: {
        covered: ['引用形态异常（编造形态特征）', '正文引用与文献列表不一致', 'DOI 格式异常', '无出处数字/空引'],
        notCovered: ['联网核验文献是否真实存在（离线环境无法访问 DOI/Crossref 数据库）', '判断文献内容是否被正确引用'],
        disclaimer: '本模块只做「可疑度筛查」，不联网核验，结论为「需人工核实」而非「确定为假」。请按核验清单逐条查证。'
      }
    };
  }

  return {
    analyze,
    findReferenceSection,
    extractInTextCitations,
    checkDois,
    findUnsourcedNumbers,
    findUnsourcedClaims,
    COMMON_SURNAMES
  };
})();
