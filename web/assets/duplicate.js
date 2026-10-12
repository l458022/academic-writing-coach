/* =========================================================================
   重复检测模块（Duplicate / Similarity）
   ---------------------------------------------------------------------
   ⚠️ 重要边界（必须向用户显式声明，不可省略）：
     本模块**没有** Turnitin / iThenticate 的比对库（那是闭源付费资产，
     含数十亿网页、期刊、历年学生作业）。因此：
       · 它**不能**给出"Turnitin 相似度百分比"
       · 它**不能**预测"查重能不能过"
       · 它**只能**检测两类本地可见的重复：
           (1) 文内自身重复（自我抄袭式重复、段落间复制粘贴）
           (2) 与本地语料库（知识库模板句、常见学术套语）的重叠
     这两类都是**真实且高频**的扣分来源，值得检测；
     但"与外部论文库的重复"本模块无法覆盖，界面必须明说。
   ========================================================================= */

const DuplicateCheck = (() => {

  /* ---------- 文本规范化与 n-gram ---------- */
  function normTokens(text) {
    return (String(text).toLowerCase().match(/[a-z][a-z'-]*/g) || []);
  }

  // 生成 k-gram（默认 6-gram：足够长以降低巧合，又能捕获改写式抄袭）
  function ngrams(tokens, k) {
    const out = [];
    for (let i = 0; i + k <= tokens.length; i++) {
      out.push(tokens.slice(i, i + k).join(' '));
    }
    return out;
  }

  function sentences(text) {
    return String(text)
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 15);
  }

  /* =====================================================================
     检测 A：文内自身重复
     ---------------------------------------------------------------------
     方法：把每个句子切 6-gram，找不同句子间共享的 n-gram。
     若两段共享 >= 8 个连续词，几乎可确定是复制粘贴。
     ===================================================================== */
  function internalRepetition(text) {
    const sents = sentences(text);
    const K = 6;
    const sentGrams = sents.map(s => ({ s, grams: new Set(ngrams(normTokens(s), K)) }));
    const pairs = [];

    for (let i = 0; i < sentGrams.length; i++) {
      for (let j = i + 1; j < sentGrams.length; j++) {
        const a = sentGrams[i].grams, b = sentGrams[j].grams;
        if (!a.size || !b.size) continue;
        let shared = 0;
        for (const g of a) if (b.has(g)) shared++;
        if (shared >= 2) {                      // 至少 2 个 6-gram 共享 ≈ 8 词连续
          const overlap = shared / Math.min(a.size, b.size);
          pairs.push({
            a: sents[i], b: sents[j],
            sharedGrams: shared,
            overlap,
            aIdx: i + 1, bIdx: j + 1
          });
        }
      }
    }
    pairs.sort((x, y) => y.sharedGrams - x.sharedGrams);

    // 重复词占比估算
    const totalWords = normTokens(text).length || 1;
    const dupWords = pairs.reduce((s, p) => s + p.sharedGrams * K, 0);
    const ratio = Math.min(1, dupWords / totalWords);

    return { pairs: pairs.slice(0, 10), ratio, count: pairs.length, sentenceCount: sents.length };
  }

  /* =====================================================================
     检测 B：与本地语料库的重叠（模板句 / 常见套语）
     ---------------------------------------------------------------------
     数据源：知识库的 chinglish / ai_tells（都是高频"通用表达"），
     以及用户可粘贴的"参考库"。这里只做本地知识库比对。
     ===================================================================== */
  function corpusOverlap(text, kb) {
    if (!kb) return { usable: false };
    const t = normTokens(text);
    const tset = new Set(ngrams(t, 5));
    if (!tset.size) return { usable: false };

    const pools = [];
    (kb.ai_tells || []).forEach(p => pools.push({ src: 'AI 套语库', phrase: p.phrase }));
    (kb.chinglish || []).forEach(p => pools.push({ src: '中式英语库', phrase: p.wrong }));

    const hits = [];
    for (const p of pools) {
      const cleaned = String(p.phrase)
        .replace(/[（(][^）)]*[）)]/g, ' ')
        .replace(/\.{2,}/g, ' ')
        .replace(/[\/]/g, ' ')
        .replace(/\s+/g, ' ').trim();
      if (!cleaned) continue;
      const g = ngrams(normTokens(cleaned), 5);
      if (!g.length) continue;
      let shared = 0;
      for (const x of g) if (tset.has(x)) shared++;
      if (shared > 0) {
        hits.push({ src: p.src, phrase: p.phrase, shared, total: g.length, overlap: shared / g.length });
      }
    }
    hits.sort((a, b) => b.overlap - a.overlap);

    const best = hits.length ? hits[0].overlap : 0;
    return { usable: true, hits: hits.slice(0, 10), best, hitCount: hits.length };
  }

  /* =====================================================================
     检测 C：常见学术套语（无需语料库的内置清单）
     ---------------------------------------------------------------------
     这些是各学科通用的"万能句"，大量出现在学生作业里，
     也是教师/检测器最常看到的"雷同区"。
     ===================================================================== */
  const GENERIC_PHRASES = [
    'this essay will discuss', 'this paper will examine', 'in this essay i will',
    'the purpose of this essay', 'as we all know', 'with the development of',
    'with the rapid development of', 'in the contemporary world',
    'it is widely believed that', 'it is generally accepted that',
    'according to the above analysis', 'from the above discussion',
    'as mentioned above', 'last but not least', 'first of all',
    'on the one hand', 'on the other hand', 'in a nutshell',
    'take something as an example', 'to sum up', 'all in all'
  ];
  function genericPhrases(text) {
    const low = ' ' + String(text).toLowerCase().replace(/\s+/g, ' ') + ' ';
    const hits = [];
    for (const p of GENERIC_PHRASES) {
      const re = new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+') + '\\b', 'g');
      const m = low.match(re);
      if (m) hits.push({ phrase: p, count: m.length });
    }
    return hits.sort((a, b) => b.count - a.count);
  }

  /* =====================================================================
     综合
     ===================================================================== */
  function analyze(text, kb) {
    const wc = normTokens(text).length;
    const internal = internalRepetition(text);
    const corpus = corpusOverlap(text, kb);
    const generic = genericPhrases(text);

    // 风险分 0-100：文内重复权重最高（这是最接近"抄袭"的信号）
    const internalScore = Math.min(100, internal.ratio * 100 * 4);      // 25% 重复词即 100
    const corpusScore = corpus.usable ? Math.min(100, corpus.best * 100) : 0;
    const genericScore = Math.min(100, generic.reduce((s, h) => s + h.count, 0) * 12);

    const score = Math.round(
      internalScore * 0.55 + corpusScore * 0.25 + genericScore * 0.20
    );

    return {
      score,
      wordCount: wc,
      reliable: wc >= 120,
      internal, corpus, generic,
      // 明确的能力边界声明，供界面显示
      boundary: {
        covered: ['文内自身重复（复制粘贴/自我抄袭）', '与本地模板库重叠', '常见万能套语密度'],
        notCovered: ['与外部论文库/网页/期刊的重复（无 Turnitin 比对库）', '改写后的语义相似（无向量检索）'],
        disclaimer: '本项检测基于本地分析，不能替代 Turnitin/iThenticate，也不能预测查重结果。'
      }
    };
  }

  return { analyze, internalRepetition, corpusOverlap, genericPhrases, GENERIC_PHRASES };
})();
