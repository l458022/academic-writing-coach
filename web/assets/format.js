/* =========================================================================
   FormatAudit —— 作业格式规范检查（v0.6）
   ---------------------------------------------------------------------
   职责（与 CitationAudit 严格区分）：
     · CitationAudit：怀疑**文献是假的**（幻觉引用）→ 输出「可疑度」
     · FormatAudit  ：检查**格式写得不规范**（APA/MLA/结构）→ 输出「建议核对」

   三块内容：
     1) 引用体系识别（APA 7 / MLA 9 / 无法判定）
     2) 引用格式合规检查（按识别到的体系查对应规则）
     3) 文章结构完整性（Introduction / Body / Conclusion）

   ⚠️ 能力边界：纯前端离线、**不联网**、不判分。
      输出是「建议核对」清单，不是评分结论；也不替代导师的 rubric。

   设计约束（沿用本项目既有教训）：
     · 正文特征只在正文算，参考文献列表单独处理（列表里全是年份/卷期，会污染）
     · 结构检测基于**段落**，不是整篇字符串（否则标记词会到处误命中）
     · 正则写在一处、可配置，规则来自 data/H_format_rules.json
   ========================================================================= */
const FormatAudit = (() => {

  /* ---------------- 工具 ---------------- */

  // 参考文献区标题（APA 用 References；MLA 用 Works Cited；也兼容 Bibliography）
  const REF_HEADING_RE =
    /^\s*(?:references|works\s+cited|work\s+cited|bibliography|reference\s+list|参考文献|引用文献)\s*:?\s*$/im;

  function splitSections(text) {
    const s = String(text || '');
    const m = REF_HEADING_RE.exec(s);
    if (!m) return { has: false, heading: null, headingIndex: -1, bodyText: s, listText: '' };
    return {
      has: true,
      heading: m[0].trim(),
      headingIndex: m.index,
      bodyText: s.slice(0, m.index),
      listText: s.slice(m.index),
    };
  }

  // 中文/全角标点归一，便于共用正则
  function normalize(s) {
    return String(s || '')
      .replace(/[（]/g, '(').replace(/[）]/g, ')')
      .replace(/[，]/g, ',').replace(/[：]/g, ':')
      .replace(/[；]/g, ';');
  }

  // 切段落：空行优先，其次按单换行（很多 docx 段落间无空行）
  function paragraphs(text) {
    const s = String(text || '').trim();
    if (!s) return [];
    let parts = s.split(/\n\s*\n+/);
    if (parts.length < 3) {
      // 无空行分隔 → 回退到单换行，再合并过短的碎片
      parts = s.split(/\n+/);
    }
    return parts
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map((p, i) => ({ idx: i, text: p, words: (p.match(/[A-Za-z][A-Za-z'\-]*/g) || []).length }));
  }

  /* ---------------- 引用体系识别 ----------------
     依据：正文括注形态 + 参考文献页标题 + 条目形态，加权投票。
     APA：括注带年份、用逗号（Smith, 2020）；页标题 References；条目含 (2020).
     MLA：括注只带页码、无逗号（Smith 15）；页标题 Works Cited；条目含 "标题." 容器
  ------------------------------------------------ */
  function detectStyle(bodyText, refHeading, listText) {
    const b = normalize(bodyText);
    const votes = { apa7: 0, mla9: 0 };
    const reasons = [];
    // 分别记录「正文证据」与「页标题证据」，用于检测二者冲突
    let bodyApa = 0, bodyMla = 0, titleStyle = null;

    // ① 正文括注：带 4 位年份 → APA；纯数字页码 → MLA
    const parenYear = (b.match(/\([^()]{0,60}?\b(?:19|20)\d{2}[a-z]?\b[^()]{0,30}?\)/g) || []).length;
    const parenPage = (b.match(/\([A-Z][A-Za-z'\-]+(?:\s+(?:and|&)\s+[A-Z][A-Za-z'\-]+)?(?:\s+et\s+al\.?)?\s+\d{1,4}(?:[-–]\d{1,4})?\)/g) || []).length;
    if (parenYear >= 1) { votes.apa7 += Math.min(3, parenYear); bodyApa += Math.min(3, parenYear); reasons.push(`正文有 ${parenYear} 处「(姓, 年份)」括注 → APA 特征`); }
    if (parenPage >= 1) { votes.mla9 += Math.min(3, parenPage); bodyMla += Math.min(3, parenPage); reasons.push(`正文有 ${parenPage} 处「(姓 页码)」括注 → MLA 特征`); }

    // ② 叙述式引用：Smith (2020) → APA
    const narrYear = (b.match(/\b[A-Z][A-Za-z'\-]+(?:\s+(?:and|&)\s+[A-Z][A-Za-z'\-]+)?\s*\((?:19|20)\d{2}[a-z]?\)/g) || []).length;
    if (narrYear >= 1) { votes.apa7 += Math.min(2, narrYear); bodyApa += Math.min(2, narrYear); reasons.push(`正文有 ${narrYear} 处「姓 (年份)」叙述式引用 → APA 特征`); }

    // ③ 参考文献页标题
    if (refHeading) {
      if (/^references?$/i.test(refHeading.replace(/:$/, '').trim())) {
        votes.apa7 += 3; titleStyle = 'apa7'; reasons.push('参考文献页标题为 References → APA');
      } else if (/^works?\s+cited$/i.test(refHeading.replace(/:$/, '').trim())) {
        votes.mla9 += 3; titleStyle = 'mla9'; reasons.push('参考文献页标题为 Works Cited → MLA');
      } else if (/bibliography/i.test(refHeading)) {
        votes.mla9 += 1; titleStyle = 'mla9'; reasons.push('参考文献页标题为 Bibliography（MLA 旧式/通用）');
      }
    }

    // ④ 条目形态
    const list = String(listText || '');
    if (list) {
      const apaEntries = (list.match(/^\s*[A-Z][A-Za-z'\-]+,\s*(?:[A-Z]\.\s*)+(?:,|&)?.*?\((?:19|20)\d{2}[a-z]?\)/gm) || []).length;
      const mlaEntries = (list.match(/\bvol\.\s*\d+|\bno\.\s*\d+|\bpp\.\s*\d+|\bWeb\.|\bPrint\./gi) || []).length;
      if (apaEntries >= 2) { votes.apa7 += 2; reasons.push(`参考文献有 ${apaEntries} 条形如「姓, 首字母. (年份).」→ APA`); }
      if (mlaEntries >= 1) { votes.mla9 += 2; reasons.push(`参考文献含 MLA 特有的 vol./no./pp. 标记 ${mlaEntries} 处 → MLA`); }
    }

    const total = votes.apa7 + votes.mla9;
    let style;
    if (total === 0) style = 'unknown';
    else if (votes.apa7 > votes.mla9) style = 'apa7';
    else if (votes.mla9 > votes.apa7) style = 'mla9';
    else style = 'mixed';

    /* ⑤ 体系冲突检测：正文形态与参考文献页标题指向不同体系。
       例：正文写（Smith 15）（MLA），页标题却是 References（APA）。
       这是学生最常见的混用错误，且投票会被页标题的高权重掩盖，故单独标出。 */
    let conflict = null;
    if (refHeading && titleStyle) {
      const bodyStyle = bodyApa > bodyMla ? 'apa7' : (bodyMla > bodyApa ? 'mla9' : null);
      if (bodyStyle && bodyStyle !== titleStyle) {
        conflict = {
          bodyStyle, titleStyle,
          hint: `正文引用是 ${bodyStyle === 'apa7' ? 'APA' : 'MLA'} 形态，` +
            `但参考文献页标题用的是 ${titleStyle === 'apa7' ? 'References（APA）' : 'Works Cited（MLA）'}，二者不匹配`,
        };
      }
    }

    return {
      style,
      votes,
      confidence: total === 0 ? 0 : Math.max(votes.apa7, votes.mla9) / total,
      reasons,
      conflict,
    };
  }

  /* ---------------- 引用格式合规检查 ---------------- */

  function checkDoiForm(text) {
    const issues = [];
    const s = String(text || '');
    // 裸 DOI（没写 https://doi.org/ 前缀）
    const bare = s.match(/(?<!https?:\/\/doi\.org\/)\b10\.\d{4,9}\/[^\s,;)]+/g) || [];
    // DOI 后跟句点
    const withPeriod = s.match(/https?:\/\/doi\.org\/[^\s]+\.(?=\s|$)/gm) || [];
    if (bare.length) issues.push({ id: 'DOI_BARE', count: bare.length, sample: bare.slice(0, 3), hint: 'APA 7 要求写成完整链接 https://doi.org/10.xxxx/yyyy' });
    if (withPeriod.length) issues.push({ id: 'DOI_PERIOD', count: withPeriod.length, sample: withPeriod.slice(0, 3), hint: 'APA 7 明确规定 DOI 后**不加句点**' });
    return issues;
  }

  function checkReferenceStyleRisks(listText) {
    const s = String(listText || '');
    const out = [];
    // APA 7 已取消 Retrieved from
    const retr = s.match(/Retrieved\s+(?:on\s+[^,]+,\s*)?from\b/gi) || [];
    if (retr.length) out.push({ id: 'RETRIEVED_FROM', count: retr.length, hint: 'APA 7 已取消 Retrieved from（第 6 版写法）' });
    // 参考文献列表里误用 et al.
    const etal = s.match(/^\s*[A-Z][A-Za-z'\-]+.*\bet\s+al\./gm) || [];
    if (etal.length) out.push({ id: 'REF_ETAL', count: etal.length, hint: 'APA 参考文献应列全作者，et al. 只用在正文引用' });
    // 裸 doi: 前缀（MLA 不建议）
    const doiPrefix = s.match(/\bdoi:\s*10\./gi) || [];
    if (doiPrefix.length) out.push({ id: 'DOI_PREFIX', count: doiPrefix.length, hint: '建议用 https://doi.org/… 而非 doi: 前缀' });
    return out;
  }

  // MLA 正文引用误用 APA 形态
  function checkMlaInText(bodyText) {
    const s = normalize(bodyText);
    const out = [];
    const apaLike = s.match(/\([A-Z][A-Za-z'\-]+,\s+(?:19|20)\d{2}/g) || [];
    if (apaLike.length) out.push({ id: 'MLAIN_TEXT_APA', count: apaLike.length, sample: apaLike.slice(0, 3), hint: 'MLA 正文引用不写年份，应为（Smith 15）' });
    const commaPage = s.match(/\([A-Z][A-Za-z'\-]+,\s+\d{1,4}(?:[-–]\d{1,4})?\)/g) || [];
    if (commaPage.length) out.push({ id: 'MLAIN_TEXT_COMMA', count: commaPage.length, sample: commaPage.slice(0, 3), hint: 'MLA 姓与页码之间不加逗号' });
    return out;
  }

  /* ---------------- 内置兜底规则 ----------------
     ⚠️ 关键设计：模块**不得依赖 kb 一定存在**。
     单独测试、或 build_db 未跑时，仍应有可用的默认规则。
     kb.format_rules 存在时用它覆盖（便于后续迭代规则无需改代码）。
  ------------------------------------------------ */
  const DEFAULT_DETECT = {
    conclusion_markers: [
      'in conclusion', 'to conclude', 'in summary', 'to sum up', 'in closing',
      'overall,', 'all in all', 'on the whole', 'in the final analysis',
      '综上所述', '总而言之', '总之'
    ],
    intro_markers: [
      'this essay', 'this report', 'this paper', 'this study', 'this assignment',
      'the purpose of this', 'in recent years', 'nowadays',
      'the aim of this', 'this analysis'
    ],
    body_markers: [
      'firstly', 'first,', 'first of all', 'secondly', 'second,', 'thirdly', 'third,',
      'moreover', 'furthermore', 'in addition', 'additionally', 'more importantly',
      'for example', 'for instance', 'on the other hand', 'however,', 'in contrast',
      'as a result', 'consequently', 'therefore,'
    ],
  };

  const DEFAULT_BOUNDARY =
    '本项为**启发式格式提示**，不联网核验、不判分，也不替代导师的评分标准（rubric）。' +
    '体系识别依据括注形态与参考文献标记，混排或样本过短时可能判不准，请以导师要求为准。';

  const DEFAULT_GUIDE = {
    title: '格式自查清单（打印出来对着改）',
    steps: [
      '确认导师要求的是 APA 还是 MLA、第几版（现存行为 APA 7 / MLA 9）',
      '检查正文引用括注：APA 带年份（Smith, 2020）；MLA 只带页码（Smith 15）',
      '检查参考文献页标题：APA 用 References；MLA 用 Works Cited',
      '检查条目是否按作者姓氏字母排序、是否设置 0.5 英寸悬挂缩进',
      '检查条目作者写法：APA 用首字母（Smith, J. A.）；MLA 只倒置第一位作者',
      '检查 DOI：APA 写成 https://doi.org/xxxx 且末尾无句点；MLA 不写 doi: 前缀',
      '逐条核对正文引用与参考文献是否一一对应（不悬空、不孤立）',
      '检查结构：有没有 Introduction、Body（≥2 段分论点）、Conclusion',
      '确保全文只用一种引用体系，不要 APA/MLA 混用'
    ]
  };

  /* ⚠️ 踩坑：规则 JSON 里 detect 是挂在 **structure** 下的
     （`rules.structure.detect`），而初版这里只读顶层 `rules.detect`，
     结果 JSON 中的标记词**永远不会被使用**——等于死数据。
     改配置改不动行为，是最难发现的一类「假可配置」。
     现同时兼容两种位置：structure.detect 优先，顶层 detect 兜底。 */
  function getDetect(rules) {
    if (!rules) return DEFAULT_DETECT;
    const src = (rules.structure && rules.structure.detect) || rules.detect || null;
    return src ? Object.assign({}, DEFAULT_DETECT, src) : DEFAULT_DETECT;
  }
  function getBoundary(rules) {
    return (rules && rules.boundary) || (rules && rules.meta && rules.meta.boundary) || DEFAULT_BOUNDARY;
  }
  function getGuide(rules) {
    return (rules && rules.guide) || DEFAULT_GUIDE;
  }

  /* ---------------- 结构完整性 ---------------- */

  function detectStructure(text, rules) {
    const paras = paragraphs(text);
    const det = getDetect(rules);
    const lower = (s) => String(s || '').toLowerCase();

    const conclusionMarkers = det.conclusion_markers || [];
    const introMarkers = det.intro_markers || [];
    const bodyMarkers = det.body_markers || [];

    const hitAny = (p, arr) => arr.some(m => lower(p).includes(lower(m)));

    /* 小标题识别（前置，因后续多处需要）
       ⚠️ 关键：小标题会被切成独立段落（往往只有 1-3 词）。
       若把它当普通段落，会同时污染「实质段落计数」与「总词数」，
       而**带小标题恰恰是作业最常见的形式**，不能因此判成"不适用"。

       ⚠️ 踩坑：不能用「短 + Title Case」推断标题 —— 财务报表/表格里的行标签
       （assets / cash / total / equity …）会全部中招，把正文段落吃光，
       导致误报「缺 Body」。**只认明确的章节名，不做风格推断。** */
    const HEADING_WORDS = [
      'introduction', 'background', 'literature review', 'methodology', 'methods',
      'results', 'findings', 'discussion', 'analysis', 'conclusion', 'conclusions',
      'recommendation', 'recommendations', 'references', 'works cited', 'bibliography',
      'appendix', 'body', 'abstract', 'executive summary', 'assignment brief',
    ];
    const headingRe = new RegExp('^(' + HEADING_WORDS.join('|') + ')\\s*[:.]?\\s*$', 'i');
    const headingPrefixRe = new RegExp('^(' + HEADING_WORDS.join('|') + ')\\b[:.]?\\s', 'i');
    const isHeading = (p) => {
      const first = p.text.split('\n')[0].trim();
      if (!first || first.length > 70) return false;
      // ① 整段就是章节名
      if (headingRe.test(first)) return true;
      // ② 「Introduction: xxx」形式（标题与少量内容同行，且该段很短）
      if (p.words <= 12 && headingPrefixRe.test(first)) return true;
      return false;
    };

    const allHeadings = [];
    const contentParas = [];      // 排除小标题后的实质段落
    for (const p of paras) {
      if (isHeading(p)) allHeadings.push(p.text.split('\n')[0].trim().toLowerCase());
      else contentParas.push(p);
    }

    const hasHeadingIntro = allHeadings.some(h => /^(introduction|background)/.test(h));
    const hasHeadingConclusion = allHeadings.some(h => /^(conclusion|recommendation)/.test(h));
    const hasHeadingBody = allHeadings.some(h => /^(methodology|methods|results|findings|discussion|analysis|literature review|body)/.test(h));

    // 用**排除标题后**的段落做判断
    const totalWords = contentParas.reduce((n, p) => n + p.words, 0);
    /* 适用性判定：
       ⚠️ 除了词数，还要防「表格/清单型文档」——它们段落极短、无叙述，
       按结构判会误报"缺主体"。此类判为**本项不适用**，而不是扣分。
       判据：排除标题后，若 ≥20 词的实质段落少于 2 个，视为非叙述文体。 */
    const substParas = contentParas.filter(p => p.words >= 20).length;
    const applicable = totalWords >= 100 && contentParas.length >= 3 && substParas >= 2;

    // 结论段落：优先取靠后段落里的标记词
    let conclusionPara = -1;
    for (let i = contentParas.length - 1; i >= 0; i--) {
      if (hitAny(contentParas[i].text, conclusionMarkers)) { conclusionPara = i; break; }
    }

    // 引言：看开头的实质段落（跳过标题/目录等短段）
    let introPara = -1;
    /* ⚠️ 踩坑：文档开头常是标题、目录、分隔线（都很短）。
       若直接看「第 1 段」，会把标题当引言段，导致真正的内容段判断错位。
       故先跳过开头的短段，再看是否有引言标记。

       ⚠️ 踩坑：跳过阈值不能设太高。曾用 <20 词，结果一段 **19 词的真正引言段**
       被当成「标题」跳掉，即使它含明确的引言标记词也检测不到。
       标题通常 ≤10 词（「Economic Development of Shanghai in 2024」= 6 词），
       故取 **12 词** 作为「这看起来像标题而非正文」的分界，兼顾两边。 */
    const MIN_PROSE_WORDS = 12;
    let firstSubstantial = -1;
    for (let i = 0; i < contentParas.length; i++) {
      if (contentParas[i].words >= MIN_PROSE_WORDS) { firstSubstantial = i; break; }
    }
    const introScan = firstSubstantial >= 0
      ? contentParas.slice(firstSubstantial, firstSubstantial + 2)
      : contentParas.slice(0, 2);
    for (const p of introScan) {
      if (hitAny(p.text, introMarkers)) { introPara = p.idx; break; }
    }
    // 弱判定：第一个实质段落存在且不太短，即视作有引言形态
    const hasIntroWeak = firstSubstantial >= 0 &&
      contentParas[firstSubstantial].words >= 25;

    // 主体：第一段之后、最后一段之前的段落
    /* ⚠️ 踩坑（v1）：body 定义为 slice(1, -1) 时，经典三段式作业
       （Intro / Body / Conclusion 各一段）只剩 **1 段**，误报「缺 Body」。
       ⚠️ 踩坑（v2）：改成「段落少时 slice(1)」又会把结论段算进 body，
       使 bodyParaCount 虚高、同时结论判定失效。
       正确做法：body 恒为 slice(1, -1)，但**显式识别三段式**——
       恰好 3 个实质段落时，中间那一段就是 body。 */
    const substIdx = [];
    for (let i = 0; i < contentParas.length; i++) {
      if (contentParas[i].words >= 20) substIdx.push(i);
    }
    const isClassicThree = substIdx.length === 3 &&
      substIdx[0] === 0 && substIdx[2] === contentParas.length - 1;

    let midParas;
    if (isClassicThree) {
      midParas = [contentParas[substIdx[1]]];                 // 三段式：中间段即主体
    } else {
      midParas = contentParas.slice(1, Math.max(1, contentParas.length - 1));
    }
    const bodyMarkerCount = midParas.reduce((n, p) => n + (hitAny(p.text, bodyMarkers) ? 1 : 0), 0);
    const bodyParaCount = midParas.filter(p => p.words >= 20).length;

    const introOk = hasHeadingIntro || introPara >= 0 || hasIntroWeak;
    /* 主体判定：
       ⚠️ 不能一律要求 ≥2 个中间段——**带小标题**的作业常见形态是
       「Body 标题 + 一段较长内容」，此时中间段只有 1 个。
       故：有显式主体小标题时，放宽为「≥1 个实质段 + 有论据标记」；
           无小标题时才要求 ≥2 段（靠段落排布推断主体）；
           三段式（Intro/Body/Conclusion）中间那 1 段即构成主体。 */
    const bodyOk = hasHeadingBody
      ? (bodyParaCount >= 1 && (bodyMarkerCount >= 1 || bodyParaCount >= 2))
      : isClassicThree
        ? (bodyParaCount >= 1)
        : (bodyParaCount >= 2 && (bodyMarkerCount >= 1 || bodyParaCount >= 3));

    /* 结论判定：
       ⚠️ 踩坑：只按「是不是最后一段」判会把**任何**收尾段都当结论，
       于是真正缺结论的文本被判为「齐全」（假阴性）。
       故要求**有区分力的证据**，不接受单纯的位置。
       判据（满足任一）：
         ① 有 Conclusion 小标题
         ② 末段含显式结论标记词
         ③ 末段明显短于正文其它段（≤ 前文均长的 0.8 倍）—— 收束段的典型特征
         ④ 末段含「展望未来 / 总结前文」类句式（this essay has / future research / overall 等） */
    const lastPara = contentParas[contentParas.length - 1];
    const preParas = contentParas.slice(1, contentParas.length - 1);
    const preAvg = preParas.length
      ? preParas.reduce((n, p) => n + p.words, 0) / preParas.length : 0;
    const lastShortVsPre = preParas.length >= 1 && !!lastPara &&
      lastPara.words <= preAvg * 0.8;
    const CONCL_PHRASES = [
      'this essay has', 'this paper has', 'this report has', 'this study has',
      'in this essay', 'to summarise', 'to summarize', 'taken together',
      'future research', 'in short', 'this essay argued', 'this paper argued',
      'these findings', 'to that end', 'the foregoing',
    ];
    const lastHasPhrase = !!lastPara && CONCL_PHRASES.some(m => lower(lastPara.text).includes(m));
    const lastLooksConclusive = !!lastPara && contentParas.length >= 3 &&
      (lastShortVsPre || lastHasPhrase);
    const lastIsConclusion = conclusionPara >= 0 || lastLooksConclusive;
    const conclusionOk = hasHeadingConclusion || conclusionPara >= 0 ||
      (contentParas.length >= 3 && lastLooksConclusive);


    const sections = [
      {
        key: 'introduction', name: 'Introduction 引言',
        ok: introOk,
        evidence: hasHeadingIntro ? '检测到 Introduction/Background 小标题'
          : introPara >= 0 ? `第 ${introPara + 1} 个正文段含引言标记词`
            : hasIntroWeak ? `首个实质段（${contentParas[firstSubstantial] ? contentParas[firstSubstantial].words : 0} 词）具备引言段落形态`
              : '未检测到引言段或引言标记',
      },
      {
        key: 'body', name: 'Body 主体',
        ok: bodyOk,
        evidence: `正文区间有 ${bodyParaCount} 个实质段落（≥20 词）` +
          (bodyMarkerCount ? `，${bodyMarkerCount} 段含分论点标记词` : '') +
          (hasHeadingBody ? '，含主体小标题' : ''),
      },
      {
        key: 'conclusion', name: 'Conclusion 结论',
        ok: conclusionOk,
        evidence: hasHeadingConclusion ? '检测到 Conclusion 小标题'
          : conclusionPara >= 0 ? `第 ${conclusionPara + 1} 个正文段含结论标记词`
            : (contentParas.length >= 3 && lastShortVsPre) ? `末段（${lastPara ? lastPara.words : 0} 词）短于正文段均长，符合收束段特征`
              : (contentParas.length >= 3 && lastHasPhrase) ? '末段含总结/展望类句式'
                : '未检测到结论段或结论标记',
      },
    ];

    const missing = sections.filter(s => !s.ok).map(s => s.name);
    let naReason = null;
    if (!applicable) {
      if (totalWords < 100) naReason = `正文仅 ${totalWords} 词，结构判断需 ≥100 词`;
      else if (substParas < 2) naReason = '未检测到足够的叙述段落（可能为表格、清单或数据型文档）';
      else naReason = '段落数不足，无法判断结构';
    }
    return {
      applicable,
      naReason,
      sections,
      missing: applicable ? missing : [],
      paragraphCount: paras.length,
      contentParagraphCount: contentParas.length,
      headingCount: allHeadings.length,
      totalWords,
      headings: allHeadings,
      score: applicable ? Math.round(100 * (sections.filter(s => s.ok).length / sections.length)) : null,
      boundary: getBoundary(rules),
    };
  }

  /* ---------------- 主入口 ---------------- */

  function analyze(text, kb) {
    const raw = String(text || '');
    const trimmed = raw.trim();
    const rules = (kb && kb.format_rules) || null;
    const wordCount = (trimmed.match(/[A-Za-z][A-Za-z'\-]*/g) || []).length;

    /* ⚠️ 门槛设计要分清两件事：
       · **引用格式检查**（DOI 写法、过时写法、MLA 括注形态）在很短的片段上就有意义——
         一句带引用的句子就能查出问题，故门槛应低。
       · **结构检查**（Intro/Body/Conclusion）才需要足量正文，
         这个由 detectStructure 内部的 <100 词 判 N/A 单独负责。
       踩坑：曾把整体门槛提到 40 词，导致 7 个「单规则」测试样本被判不适用。
       故整体门槛保持「极短」级别，只挡住真正无意义的输入。 */
    if (!trimmed || trimmed.length < 40 || wordCount < 12) {
      return {
        applicable: false,
        reason: '文本过短，无法判断格式与结构',
        style: null, styleName: '--', styleConfidence: 0, styleReasons: [],
        hasReferenceSection: false, refHeading: null,
        issues: [], issueCount: 0, structure: null, structureMissing: 0,
        guide: getGuide(rules), rulesVersion: (rules && rules.meta && rules.meta.version) || null,
        boundary: getBoundary(rules),
      };
    }

    const ref = splitSections(trimmed);
    const body = ref.has ? ref.bodyText : trimmed;

    // ① 体系识别
    const styleInfo = detectStyle(body, ref.heading, ref.listText);

    // ② 格式合规检查（按识别到的体系）
    let styleIssues = [];
    if (styleInfo.style === 'apa7' || styleInfo.style === 'unknown' || styleInfo.style === 'mixed') {
      styleIssues = styleIssues.concat(checkDoiForm(trimmed));
      if (ref.listText) styleIssues = styleIssues.concat(checkReferenceStyleRisks(ref.listText));
    }
    if (styleInfo.style === 'mla9' || styleInfo.style === 'mixed') {
      styleIssues = styleIssues.concat(checkMlaInText(body));
      if (ref.listText) styleIssues = styleIssues.concat(checkReferenceStyleRisks(ref.listText));
    }
    // mixed：额外提示体系混用
    if (styleInfo.style === 'mixed') {
      styleIssues.unshift({
        id: 'STYLE_MIXED', count: 1,
        hint: 'APA 与 MLA 特征同时出现，一篇作业只能用一种体系，请确认',
      });
    }
    // 体系冲突：正文形态与参考文献页标题不匹配（最常见混用错误）
    if (styleInfo.conflict) {
      styleIssues.unshift({
        id: 'STYLE_CONFLICT', count: 1,
        hint: styleInfo.conflict.hint,
        detail: { bodyStyle: styleInfo.conflict.bodyStyle, titleStyle: styleInfo.conflict.titleStyle },
      });
    }
    // MLA 但页标题写成 References（在无 conflict 时单独提示）
    if (styleInfo.style === 'mla9' && !styleInfo.conflict && ref.has && /^references?$/i.test(ref.heading.replace(/:$/, '').trim())) {
      styleIssues.push({ id: 'MLA_TITLE_WRONG', count: 1, hint: 'MLA 的参考文献页标题应为 Works Cited（不是 References）' });
    }
    if (styleInfo.style === 'apa7' && !styleInfo.conflict && ref.has && /works?\s+cited/i.test(ref.heading)) {
      styleIssues.push({ id: 'APA_TITLE_WRONG', count: 1, hint: 'APA 的参考文献页标题应为 References（不是 Works Cited）' });
    }
    // 有正文引用但完全没有参考文献区
    const bodyHasCite = /\([^()]{0,60}?\b(?:19|20)\d{2}[a-z]?\b[^()]{0,30}?\)/.test(normalize(body)) ||
      /\([A-Z][A-Za-z'\-]+\s+\d{1,4}\)/.test(normalize(body));
    if (bodyHasCite && !ref.has) {
      styleIssues.push({ id: 'NO_REF_SECTION', count: 1, hint: '正文有引用但未找到参考文献区（References / Works Cited）' });
    }

    // 去重（同 id 合并计数）
    const merged = [];
    const seen = new Map();
    for (const it of styleIssues) {
      if (seen.has(it.id)) { seen.get(it.id).count += it.count || 1; }
      else { const c = Object.assign({}, it); seen.set(it.id, c); merged.push(c); }
    }

    // ③ 结构完整性
    const structure = detectStructure(body, rules);

    // ④ 汇总
    const styleName = {
      apa7: 'APA 第 7 版', mla9: 'MLA 第 9 版',
      mixed: 'APA / MLA 混用（需确认）', unknown: '未能识别',
    }[styleInfo.style] || '未能识别';

    const totalIssues = merged.reduce((n, x) => n + (x.count || 1), 0);
    const structMissing = structure.applicable ? structure.missing.length : 0;

    return {
      applicable: true,
      style: styleInfo.style,
      styleName,
      styleConfidence: Math.round(styleInfo.confidence * 100),
      styleReasons: styleInfo.reasons,
      hasReferenceSection: ref.has,
      refHeading: ref.heading,
      issues: merged,
      issueCount: totalIssues,
      structure,
      structureMissing: structMissing,
      guide: getGuide(rules),
      rulesVersion: (rules && rules.meta && rules.meta.version) || null,
      boundary: getBoundary(rules),
    };
  }

  return {
    analyze,
    detectStyle,
    detectStructure,
    splitSections,
    paragraphs,
  };
})();
