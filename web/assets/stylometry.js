/* =========================================================================
   文体计量检测模块（Stylometry）
   —— 补齐"纯 AI 文本漏检"缺陷
   ---------------------------------------------------------------------
   设计依据（有据可查，非拍脑袋）：
   1. GPTZero 原始统计层：perplexity + burstiness。官方给出的经验值：
      perplexity > 85 更可能是人类；burstiness = 句长/句子困惑度的波动程度，
      AI 稳定、人类波动大。
      (gptzero.me/news/perplexity-and-burstiness-what-is-it/)
   2. AI 与人类写作的语言学差异研究中，**词汇丰富度（lexical richness）
      是跨模型、跨领域最稳健的信号**，含 TTR（类符/形符比）、
      hapax legomena（仅出现一次的词）、lexical density（实词占比）。
      (El Attar et al., "A Systematic Analysis of Linguistic Features in
       AI-Generated Text Detection", arXiv:2606.04177 — 284 个可解释特征)
   3. 功能词频率、标点分布、句式多样性属 stylometry 常规特征
      （作者归属研究中长期使用）。

   ⚠️ 本模块产出的是**可解释的启发式风险信号**，不是 GPTZero/Turnitin
      的输出，也不能预测"能否通过检测"。见每项 signal 的 note 字段。
   ========================================================================= */

const Stylometry = (() => {

  /* ---------------- 基础工具 ---------------- */
  const FUNCTION_WORDS = new Set([
    'the','a','an','and','or','but','if','then','than','so','because','as','while',
    'of','in','on','at','to','for','with','by','from','into','about','over','under',
    'between','among','during','before','after','above','below','across','through',
    'is','are','was','were','be','been','being','am',
    'do','does','did','have','has','had','will','would','shall','should','can','could',
    'may','might','must','it','its','this','that','these','those','they','them','their',
    'he','she','his','her','we','our','you','your','i','my','me','us',
    'not','no','only','also','such','which','who','whom','whose','where','when','why','how',
    'there','here','more','most','very','much','many','some','any','all','both','each',
    'other','another','same','own','just','even','still','yet','however','therefore',
    'thus','hence','moreover','furthermore','nevertheless','whereas','although','though'
  ]);

  function words(text) {
    return (String(text).toLowerCase().match(/[a-z][a-z'-]*/g) || []);
  }

  function sentences(text) {
    return String(text)
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 2);
  }

  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
  function std(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length);
  }
  // 简单线性回归斜率（用于句子长度随位置漂移）
  function slope(ys) {
    const n = ys.length;
    if (n < 3) return 0;
    const xs = ys.map((_, i) => i);
    const mx = mean(xs), my = mean(ys);
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    return den === 0 ? 0 : num / den;
  }

  /* =====================================================================
     特征 1：词汇丰富度（research 认定最稳健的跨领域信号）
     ===================================================================== */
  function lexicalRichness(text) {
    const w = words(text);
    const n = w.length;
    if (n < 30) return { usable: false };

    const types = new Set(w);
    const ttr = types.size / n;                       // 类符/形符比

    // 频率分布
    const freq = {};
    for (const x of w) freq[x] = (freq[x] || 0) + 1;
    const hapax = Object.values(freq).filter(c => c === 1).length;  // 仅出现一次
    const hapaxRatio = hapax / n;

    // 实词占比（非功能词）
    const content = w.filter(x => !FUNCTION_WORDS.has(x)).length;
    const lexicalDensity = content / n;

    // 平均词长（AI 倾向稍长、更"教科书"的词）
    const avgWordLen = mean(w.map(x => x.length));

    return {
      usable: true,
      ttr, hapaxRatio, lexicalDensity, avgWordLen,
      uniqueTypes: types.size, tokenCount: n
    };
  }

  /* =====================================================================
     特征 2：句式波动（burstiness 的本地近似）
     ===================================================================== */
  function burstiness(text) {
    const sents = sentences(text);
    const lens = sents.map(s => words(s).length).filter(n => n > 0);
    if (lens.length < 3) return { usable: false, sentenceCount: lens.length };

    const m = mean(lens);
    const sd = std(lens);
    const cv = m > 0 ? sd / m : 0;                    // 变异系数

    // 相邻句长差（局部波动）
    const deltas = [];
    for (let i = 1; i < lens.length; i++) deltas.push(Math.abs(lens[i] - lens[i - 1]));
    const meanDelta = mean(deltas);

    // 句长随位置的漂移（人类会随论述推进自然变化）
    const drift = slope(lens);

    return {
      usable: true, cv, mean: m, sd, meanDelta, drift,
      sentenceCount: lens.length,
      lens
    };
  }

  /* =====================================================================
     特征 3：功能词与句式多样性
     ===================================================================== */
  function functionWordProfile(text) {
    const w = words(text);
    const n = w.length;
    if (n < 50) return { usable: false };

    const fwCount = w.filter(x => FUNCTION_WORDS.has(x)).length;
    const fwRatio = fwCount / n;

    // 句首词多样性：AI 常反复用同一批引导词
    const sents = sentences(text);
    const starters = sents.map(s => (words(s)[0] || '')).filter(Boolean);
    const starterTypes = new Set(starters);
    const starterDiversity = starters.length ? starterTypes.size / starters.length : 0;

    // 句首引导词高频集中度
    const sFreq = {};
    for (const s of starters) sFreq[s] = (sFreq[s] || 0) + 1;
    const maxStarterRepeat = Object.values(sFreq).length ? Math.max(...Object.values(sFreq)) : 0;

    return { usable: true, fwRatio, starterDiversity, maxStarterRepeat, sentenceCount: sents.length };
  }

  /* =====================================================================
     特征 4：标点与形式特征
     ===================================================================== */
  function punctuationProfile(text) {
    const len = text.length || 1;
    const count = ch => (text.match(new RegExp('\\' + ch, 'g')) || []).length;
    // 分号、破折号、括号、冒号 —— 人类更爱用这些"非对称"标点
    const semicolon = count(';');
    const dash = (text.match(/[—–]|--/g) || []).length;
    const paren = (text.match(/[()（）]/g) || []).length;
    const colon = count(':');
    const comma = count(',');
    const excl = count('!');
    const question = count('?');

    // 段落长度波动
    const paras = String(text).split(/\n\s*\n/).map(p => words(p).length).filter(n => n > 0);

    return {
      semicolonPer1k: semicolon / len * 1000,
      dashPer1k: dash / len * 1000,
      parenPer1k: paren / len * 1000,
      colonPer1k: colon / len * 1000,
      commaPer1k: comma / len * 1000,
      exclPer1k: excl / len * 1000,
      questionPer1k: question / len * 1000,
      paraCount: paras.length,
      paraLenCv: paras.length > 1 ? std(paras) / (mean(paras) || 1) : 0
    };
  }

  /* =====================================================================
     特征 5：可读性与复杂度（Flesch 近似 + 长词占比）
     ===================================================================== */
  function readability(text) {
    const sents = sentences(text);
    const w = words(text);
    if (w.length < 30 || sents.length < 2) return { usable: false };

    const syllables = w.reduce((s, x) => s + countSyllables(x), 0);
    const asl = w.length / sents.length;              // 平均句长
    const asw = syllables / w.length;                 // 平均词音节
    // Flesch Reading Ease
    const fre = 206.835 - 1.015 * asl - 84.6 * asw;
    // 长词占比（>= 8 字母）
    const longWords = w.filter(x => x.length >= 8).length / w.length;

    return { usable: true, flesch: fre, asl, asw, longWordRatio: longWords };
  }

  function countSyllables(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (w.length <= 3) return 1;
    const m = w
      .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
      .replace(/^y/, '')
      .match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }

  /* =====================================================================
     特征 6：AI 套话密度（需传入知识库 ai_tells）
     ---------------------------------------------------------------------
     这是唯一"看内容"而非"看统计"的信号。单靠统计特征对
     "术语丰富但句式为 AI 模板"的文本（如专业领域 AI 写作）判别力不足，
     必须叠加套话模式匹配。
     ===================================================================== */
  function phraseMatcher(kb) {
    if (!kb || !Array.isArray(kb.ai_tells)) return null;
    // 复用 app.js 的模式拆分逻辑（此处内联，保持模块自足）
    const strip = s => String(s)
      .replace(/[（(][^）)]*[）)]/g, ' ')
      .replace(/\.{2,}/g, ' ')
      .replace(/[«»"“”]/g, ' ')
      .replace(/\s+/g, ' ').trim();

    const pats = [];
    for (const p of kb.ai_tells) {
      const cleaned = strip(p.phrase);
      if (!cleaned) continue;
      let variants = cleaned.split('/')
        .map(s => s.replace(/^[.,;:!?\s]+|[.,;:!?\s]+$/g, '').trim())
        .filter(s => s.length >= 3);
      variants = [...new Set(variants)];
      const filtered = variants.filter(v => {
        const vl = v.toLowerCase();
        return !variants.some(o => { const ol = o.toLowerCase(); return ol !== vl && ol.includes(vl); });
      });
      let chosen = filtered;
      if (filtered.length > 1) {
        const lens = filtered.map(v => v.length);
        if (Math.min(...lens) < Math.max(...lens) * 0.5) {
          chosen = [filtered.reduce((a, b) => (a.length >= b.length ? a : b))];
        }
      }
      const multi = chosen.filter(v => v.trim().split(/\s+/).length >= 2);
      const use = multi.length ? multi : chosen;
      for (const v of use) pats.push({ phrase: p.phrase, v, severity: p.severity || 'medium', type: p.type || '套话' });
    }
    return pats;
  }

  function clicheDensity(text, kb) {
    const pats = phraseMatcher(kb);
    if (!pats) return { usable: false };
    const lower = ' ' + String(text).toLowerCase().replace(/\s+/g, ' ') + ' ';
    const w = words(text);
    const n = w.length || 1;
    const W = { high: 3, medium: 2, low: 1 };

    const hits = [];
    let weighted = 0;
    for (const p of pats) {
      const re = new RegExp(
        p.v.toLowerCase().split(/\s+/).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'gi');
      const m = lower.match(re);
      if (m && m.length) {
        weighted += m.length * (W[p.severity] || 1);
        hits.push({ phrase: p.phrase, count: m.length, severity: p.severity, type: p.type });
      }
    }
    // 每 100 词的加权命中数 → 0-100
    const density = weighted / n * 100;
    const aiScore = clamp01(density / 9) * 100;   // 约 9 个权重点/100词 趋满
    return {
      usable: true,
      weighted, hits: hits.sort((a, b) => b.count * W[b.severity] - a.count * W[a.severity]),
      density, aiScore: Math.round(aiScore), wordCount: n
    };
  }

  /* =====================================================================
     综合：把各特征折算成"AI 倾向分"（0-100）
     ---------------------------------------------------------------------
     每项返回 { key, label, value, aiScore, weight, note, evidence }
     aiScore 越高 = 越像 AI。权重依据研究稳健性分配：
       lexical richness 权重最高（跨领域最稳健），burstiness 次之。
     ===================================================================== */
  function analyze(text, kb) {
    /* 词数在开头即计算：多个特征需要按长度做可靠性衰减（见标点特征） */
    const wordCount = words(text).length;
    const lr = lexicalRichness(text);
    const bu = burstiness(text);
    const fw = functionWordProfile(text);
    const pu = punctuationProfile(text);
    const rd = readability(text);
    const cl = clicheDensity(text, kb);

    const signals = [];

    /* --- AI 套话密度（有 KB 时权重最高：这是最直接的"内容级"证据） --- */
    if (cl.usable) {
      signals.push({
        key: 'cliche', label: 'AI 套话密度', weight: 0.12,
        aiScore: cl.aiScore,
        value: `加权命中 ${cl.weighted} 点 / ${cl.wordCount} 词（${cl.hits.length} 类）`,
        evidence: cl.hits.slice(0, 8).map(h => `${h.type}："${h.phrase}" × ${h.count}`),
        note: '直接匹配 AI 高频套话/模板句式。⚠️ 实测局限：本批 9 篇 AI 中 5 篇零命中，均分仅 14.9，判别力弱——原因是词库覆盖不足，且现代 AI 已很少用这些老套话。故权重已从 0.34 降至 0.12，不再作为主判据。'
      });
    }

    /* --- 词汇丰富度 --- */
    if (lr.usable) {
      /* ⚠️ 标定依据已修正（v0.4，基于 72 篇真人 + 9 篇 AI 实测）：
         -----------------------------------------------------------------
         上一版照搬了 El Attar et al. (arXiv:2606.04177) 的结论
         "人类 TTR/hapax/实词密度 一致高于 AI"，但**实测方向相反**：

           指标        AI 均值    真人均值    实测方向
           TTR          0.759      0.579      AI 更高
           hapax        0.635      0.436      AI 更高
           实词密度      0.714      0.464      AI 更高
           平均词长       6.89       4.70      AI 更高

         原因：该论文测的是**等长、同领域**文本；本项目的对照组是
         "古典学术文 vs 现代 AI"，存在时代/文体偏差——19 世纪英文
         重复率高、虚词多、句子长，天然拉低 TTR。

         结论：**以本项目的实测数据为准**，不再引用论文方向。
         重叠比例 TTR 0.000 / hapax 0.020，说明分离度极高，是可靠信号。 */
      const clamp01 = x => Math.max(0, Math.min(1, x));
      // 实测 AI 10 分位：TTR 0.662 起算，人类 90 分位 0.629 封顶
      const ttrAi = clamp01((lr.ttr - 0.60) / 0.15) * 100;
      // 实测 AI 10 分位：hapax 0.502 起算，人类 90 分位 0.509
      const hapaxAi = clamp01((lr.hapaxRatio - 0.44) / 0.15) * 100;
      // 实测 AI 10 分位：实词密度 0.670 起算，人类 90 分位 0.508
      const densityAi = clamp01((lr.lexicalDensity - 0.55) / 0.15) * 100;
      // 实测 AI 10 分位：平均词长 6.258 起算，人类 90 分位 5.013
      const wordLenAi = clamp01((lr.avgWordLen - 5.0) / 1.6) * 100;

      const combined = ttrAi * 0.30 + hapaxAi * 0.25 + densityAi * 0.25 + wordLenAi * 0.20;
      signals.push({
        key: 'lexical', label: '词汇丰富度', weight: 0.18,
        aiScore: Math.round(combined),
        value: `TTR ${lr.ttr.toFixed(3)} · hapax ${(lr.hapaxRatio * 100).toFixed(1)}% · 实词 ${(lr.lexicalDensity * 100).toFixed(1)}% · 词长 ${lr.avgWordLen.toFixed(2)}`,
        evidence: [
          `类符/形符比（TTR）= ${lr.ttr.toFixed(3)}（${lr.uniqueTypes} 类 / ${lr.tokenCount} 形）`,
          `仅出现一次的词占比 = ${(lr.hapaxRatio * 100).toFixed(1)}%`,
          `实词（去除功能词）占比 = ${(lr.lexicalDensity * 100).toFixed(1)}%`,
          `平均词长 = ${lr.avgWordLen.toFixed(2)} 字母`
        ],
        note: 'AI 文本倾向于"每句都换新词"（TTR/hapax 偏高）、堆砌实词与长词；人类写作（尤其学术）会自然重复核心术语、虚词占比更高。注：短文本 TTR 天然偏高，本项在 <120 词时仅供参考。'
      });
    }

    /* --- 句式波动 --- */
    if (bu.usable) {
      /* ⚠️ v0.6 重标定（关键修复）：
         原 v0.4 标定基于「19 世纪公版文本 vs 现代 AI」，真人 CV 仅 0.495。
         用户提供 4 篇现代学生作业后实测：
           句长 CV      现代AI 0.248  / 现代真人 0.682~1.438（中位 0.806）
           相邻句长差    现代AI 4.561  / 现代真人 9.096~42.402
         结论：现代真人的句长波动**比 19 世纪文本更大**，旧阈值 0.32 起算
         严重偏低——现代 AI（CV 0.248）在原公式下只拿到 40 分，导致纯 AI
         文本漏报（实测 41 分）。故把 CV 起算点从 0.32 上移到 0.60
         （低于现代真人 10 分位 0.682，留出安全边际）。

         证据强度说明：现代 AI 样本仅 1 篇，本调整属**方向性校正**而非
         精确标定；阈值取"现代真人区间下沿再留 8% 余量"，宁可偏向保守。*/
      const clamp01 = x => Math.max(0, Math.min(1, x));
      // 现代真人 CV 下沿 0.682 → 起算点取 0.60，0.24 以下趋满
      const cvAi = clamp01((0.60 - bu.cv) / 0.36) * 100;
      // 现代真人相邻差下沿 9.096 → 起算点取 8.5，1.5 以下趋满
      const deltaAi = clamp01((8.5 - bu.meanDelta) / 7.0) * 100;
      /* ⚠️ v0.6 已**剔除**"平均句长"子项。
         现代语料实测：AI 18.5 词落进真人区间 15.2~36.0 之内，零判别力；
         保留它只会给纯 AI 文本贡献 45 分的**噪声**（把句子偏短的真人
         反而推高），属净负收益。故完全移除，权重并入 cvAi。
         句长仅作展示，不参与打分。 */
      const combined = cvAi * 0.62 + deltaAi * 0.38;
      signals.push({
        key: 'burstiness', label: '句式波动（Burstiness）', weight: 0.26,
        aiScore: Math.round(combined),
        value: `CV ${bu.cv.toFixed(3)} · 平均句长 ${bu.mean.toFixed(1)} 词 · 相邻差 ${bu.meanDelta.toFixed(1)}`,
        evidence: [
          `句长变异系数 CV = ${bu.cv.toFixed(3)}（SD ${bu.sd.toFixed(2)} / 均值 ${bu.mean.toFixed(2)}）`,
          `相邻句长平均绝对差 = ${bu.meanDelta.toFixed(2)} 词`,
          `句长随位置漂移斜率 = ${bu.drift.toFixed(3)}`,
          `共 ${bu.sentenceCount} 句`
        ],
        note: 'GPTZero 原始统计层核心指标之一。人类写作长短句交替、波动大；AI 输出节奏高度均匀。CV 越低越可疑。v0.6 已按现代学生语料重标定阈值（原阈值为 19 世纪语料，偏低）。'
      });
    }

    /* --- 句式与句首多样性 --- */
    if (fw.usable) {
      /* ⚠️ v0.4 实测：本项**判别力最弱**（starterDiv 重叠比例 0.800）。
         实测 句首多样性  AI 0.873 / 真人 0.820 —— 几乎无差异。
         故权重从 0.10 降到 0.05，且改用更强的子指标：
         功能词占比（AI 0.286 / 真人 0.536，重叠 0.000，强信号）。 */
      const fwAi = clamp01((0.38 - fw.fwRatio) / 0.14) * 100;      // 0.38 起算
      const starterAi = clamp01((0.72 - fw.starterDiversity) / 0.35) * 100;
      const combined = fwAi * 0.75 + starterAi * 0.25;
      signals.push({
        key: 'starter', label: '虚词占比与句首多样性', weight: 0.08,
        aiScore: Math.round(combined),
        value: `虚词占比 ${(fw.fwRatio * 100).toFixed(1)}% · 句首多样性 ${(fw.starterDiversity * 100).toFixed(0)}%`,
        evidence: [
          `功能词（虚词）占比 = ${(fw.fwRatio * 100).toFixed(1)}%  ← 实测 AI 显著偏低`,
          `句首词多样性 = ${(fw.starterDiversity * 100).toFixed(1)}%（共 ${fw.sentenceCount} 句）`,
          `同一句首词最多重复 ${fw.maxStarterRepeat} 次`
        ],
        note: '实测：人类学术写作虚词（the/of/and/is 等）占比约 54%，AI 仅约 29% —— AI 更爱堆实词。此项以虚词占比为主判据（句首多样性实测区分度很低，仅作辅助）。'
      });
    }

    /* --- 标点形式特征 --- */
    {
      /* ⚠️ v0.4 实测：这是**最强信号之一**（重叠比例 0.000）。
         分号  AI 0.000 / 真人 1.972
         破折号 AI 0.000 / 真人 0.190
         括号  AI 0.000 / 真人 0.211
         AI 在本次 9 篇样本中 分号/破折号/括号 **全部为 0**。
         故权重从 0.08 提升到 0.16。 */
      const richPunct = pu.semicolonPer1k + pu.dashPer1k + pu.parenPer1k;
      const punctAi = clamp01((0.60 - richPunct) / 0.60) * 100;   // 0.6‰ 以下趋满
      const colonAi = clamp01((0.20 - pu.colonPer1k) / 0.20) * 100;
      const paraAi = pu.paraCount > 1 ? clamp01((0.55 - pu.paraLenCv) / 0.45) * 100 : 40;
      /* ⚠️ 短文本鲁棒性修正（实测：60 词的真人段落也会因"零分号"拿 88 分）：
         标点密度在 <150 词时方差极大——任何短段落都几乎不会出现分号/破折号。
         此时该信号区分的是"文本长度"而非"作者身份"，会造成针对短文的误报，
         而非母语学生的简短写作尤其容易中招（Stanford：误判 61.22%）。
         故按词数对该特征做衰减：>=200 词全额，<100 词衰减到 40%。 */
      /* 曲线设计（实测调优）：
           200 词以上 → 1.0（全额，长文本标点密度可靠）
           150 词      → 0.85
           100 词      → 0.6
           60 词以下   → 0.4（几乎不计）
         目的：既防短文本误报，又不削弱长 AI 文本的强信号。 */
      const punctReliability = wordCount >= 200 ? 1.0
        : clamp01((wordCount - 40) / 160) * 0.6 + 0.4;
      const combined = (punctAi * 0.65 + colonAi * 0.15 + paraAi * 0.20) * punctReliability;
      signals.push({
        key: 'punct', label: '标点与段落形态', weight: 0.05,
        aiScore: Math.round(combined),
        value: `分号/破折号/括号 ${richPunct.toFixed(2)}‰ · 冒号 ${pu.colonPer1k.toFixed(2)}‰ · 段落 ${pu.paraCount} 段`,
        evidence: [
          `分号 = ${pu.semicolonPer1k.toFixed(2)}‰，破折号 = ${pu.dashPer1k.toFixed(2)}‰，括号 = ${pu.parenPer1k.toFixed(2)}‰`,
          `逗号 = ${pu.commaPer1k.toFixed(1)}‰，冒号 = ${pu.colonPer1k.toFixed(2)}‰`,
          `段落数 = ${pu.paraCount}，段长变异系数 = ${pu.paraLenCv.toFixed(3)}`
        ],
        /* ⚠️ v0.7：权重 0.16 → 0.05，且已移出强证据名单。
           该特征在 19 世纪语料上很强（AI 全 0 / 真人 1.97‰），
           但现代学生写作同样不用富标点，导致对两类都给高分。
           保留低权重是作为**辅助**信号（不参与判定票数），不再主导结论。 */
        note: '历史信号：人类学术写作会用分号、破折号、插入语制造停顿，AI 正式文体几乎不用。⚠️ 但现代学生（尤其非母语）同样很少使用，本项在现代语料上已失去区分力，仅作辅助参考。'
      });
    }

    /* --- 可读性与复杂度 --- */
    if (rd.usable) {
      /* ⚠️ v0.6 重标定：
         现代语料实测（关键）：
           长词占比  现代AI 0.385 / 现代真人 0.158~0.263 → **完全分离**
           平均音节  现代AI 2.106 / 现代真人 1.534~1.840 → **完全分离**
           平均词长  现代AI 6.264 / 现代真人 4.851~5.590 → **完全分离**
         这三项在**现代**语料上依然可靠，是少数未被时代偏差污染的特征。
         故权重从 0.10 提到 0.14，与它的实际判别力相称。
         仍需注意：Flesch 与平均句长方向相反（真人句子更长），
         不参与打分，仅作展示。 */
      /* ⚠️ v0.6：起算点维持 0.22，**不**采用现代 4 样本区间的上沿做边界。
         原因：现代真人样本仅 4 篇（区间 0.158~0.263），用它反推硬边界会把
         AI 的长词占比（0.307~0.385）大面积挤进过渡带，实测反而把纯 AI 文本
         从 95 分压到 47 分、总分明跌 31 分 —— 属于用单薄样本过度拟合。
         故保留旧语料标定的 0.22 起算点（它对现代 AI 0.307+ 仍给出高分），
         仅把过渡带略收窄，让长词明显超标者更快趋满。 */
      const longWordAi = clamp01((rd.longWordRatio - 0.22) / 0.16) * 100;
      const syllableAi = clamp01((rd.asw - 1.70) / 0.50) * 100;            // 音节数辅助
      const combined = longWordAi * 0.75 + syllableAi * 0.25;
      signals.push({
        key: 'readability', label: '词形复杂度', weight: 0.14,
        aiScore: Math.round(combined),
        value: `长词 ${(rd.longWordRatio * 100).toFixed(1)}% · 平均词音节 ${rd.asw.toFixed(2)}`,
        evidence: [
          `8 字母以上长词占比 = ${(rd.longWordRatio * 100).toFixed(1)}%`,
          `平均词音节 = ${rd.asw.toFixed(2)}`,
          `（仅供参考，不参与判定）Flesch ${rd.flesch.toFixed(0)} · 平均句长 ${rd.asl.toFixed(1)} 词`
        ],
        note: '实测：AI 长词占比约 38%、现代真人均值约 22%（现代学生语料）——方向明确且完全分离。注：本项是现代语料上少数未被时代偏差污染的特征，v0.6 已上调权重。'
      });
    }

    /* --- 汇总 ---
       ⚠️ v0.4 融合策略已重构（依据 72 真人 + 9 AI 实测）：

       旧策略的问题：把 cliche（套话）当作唯一的"内容级证据"闸门，
       无套话命中时一律限幅在 statCap=48。实测发现——
         · 本批 9 篇 AI 中，5 篇套话完全为 0
         · 套话特征实测 AI 均分仅 14.9，判别力很弱
       结果：**88.9% 的 AI 文本被限幅压到 48 以下 → 全部漏报**。

       新策略：用"实测重叠比例 0.000"的强特征组成**证据组**。
       只要多个强特征同时指向 AI，即使没有套话命中，也允许突破限幅。
       这样既不依赖覆盖度不足的套话库，又能避免单一特征误报。

       强特征组（实测重叠比例 < 0.05）：
         punct(0.000) burstiness(0.000) lexical(0.000) readability(0.000) starter(0.000)
       —— 五项都已重标定方向，任一为高都可信。 */
    const totalWeight = signals.reduce((s, x) => s + x.weight, 0) || 1;
    const weighted = signals.reduce((s, x) => s + x.aiScore * x.weight, 0) / totalWeight;
    const clicheSig = signals.find(x => x.key === 'cliche');
    const clicheScore = clicheSig ? clicheSig.aiScore : 0;
    const peak = signals.length ? Math.max(...signals.map(x => x.aiScore)) : 0;

    // 统计强特征中"高分"的个数（>=65 视为明确指向 AI）
    /* ⚠️ v0.7 修正：`punct` 已从强证据名单移除。
       原因（304 篇现代真人语料 + 16 篇 AI 的实测）：
         · 现代学生写作（尤其非母语）**同样几乎不用**分号/破折号/括号，
           于是 punct 对「真人」和「AI」**都给高分** → 零区分力。
         · 但它却帮真人样本凑够 2 票，触发 `strongVotes === 2` 的 64 分封顶，
           实测造成 5 篇真人被判「高」（分数清一色 64）。
       这属于「时代伪信号」的**人群变体**：v0.4 的对照组是 19 世纪学者
       （大量使用分号破折号），而现代学生的标点习惯碰巧与 AI 一致。
       详见 test/corpus/_recalibration_modern.json 与 evaluate_modern.js。 */
    const strongKeys = ['burstiness', 'lexical', 'readability', 'starter'];
    const strongHigh = signals
      .filter(x => strongKeys.includes(x.key) && x.aiScore >= 65)
      .sort((a, b) => b.aiScore - a.aiScore);
    const strongVotes = strongHigh.length;
    /* ⚠️ v0.6 关键修正：证据分只统计**高分特征**，不能把低分特征拉进来稀释。
       原实现对所有强特征做加权平均，导致 AI 文本的 burstiness=78/readability=95
       被 punct=23/starter=33 稀释成 56，明明两项铁证却拿不到高分。
       改为：① 全部 5 项都高 → 用 5 项加权均值（最稳）；
             ② 仅部分高 → 用**高分项自身**的加权均值 + 峰值，反映真实证据强度。 */
    const strongSigs = signals.filter(x => strongKeys.includes(x.key));
    const sw = strongSigs.reduce((s, x) => s + x.weight, 0) || 1;
    const strongAvgAll = strongSigs.reduce((s, x) => s + x.aiScore * x.weight, 0) / sw;
    const hw = strongHigh.reduce((s, x) => s + x.weight, 0) || 1;
    const highAvg = strongHigh.reduce((s, x) => s + x.aiScore * x.weight, 0) / hw;
    // 综合风格分：强特征高时以"高分项证据强度"为准，否则退回全项均值
    const strongAvg = strongHigh.length >= 2
      ? Math.max(strongAvgAll, highAvg * 0.96)
      : strongAvgAll;

    /* 阈值从"经验库"读取（Learner 若可用），使被采纳的调参建议真正生效。
       若 Learner 不存在（如单独测试本模块），回退到内置默认值。 */
    const T = (typeof Learner !== 'undefined' && Learner.getTuning)
      ? Learner.getTuning()
      : { clicheGate: 20, statCap: 48, boostFactor: 0.35, boostMax: 18, minWords: 120 };

    let score;
    if (clicheScore >= T.clicheGate) {
      // 有套话级证据 → 加权平均 + 峰值加成
      const boost = Math.min(T.boostMax, Math.max(0, (peak - weighted) * T.boostFactor));
      score = weighted + boost;
    } else if (strongVotes >= 3) {
      /* 无套话，但 3 个以上强特征同时高 → 证据充分，允许突破限幅。
         实测：AI 样本通常 3-5 个强特征同时高分；真人样本极少出现。
         这正是修复"纯 AI 文本漏报"的关键放行条件。 */
      score = Math.max(weighted, strongAvg);
    } else if (strongVotes === 2) {
      /* 2 个强特征高 → 证据接近充分。
         v0.6 修正：原封顶 64 会把"1 项趋满 + 1 项偏高"的纯 AI 文本卡在
         「中等」区间（实测：现代 AI 文本 readability=95 + burstiness=78，
         却被压到 56）。改为**按强特征分档释放**：
           两项都 >=80 → 封顶 82（证据很强，仅留少量保守余量）
           其余 2 项情况 → 封顶 64（维持原保守度）
         现代真人样本实测满分 18，离 64 尚有充足距离，故不增加误报风险。 */
      const bothVeryHigh = strongHigh.length >= 2 &&
        strongHigh[0].aiScore >= 80 && strongHigh[1].aiScore >= 80;
      const cap2 = bothVeryHigh ? 82 : 64;
      score = Math.min(Math.max(weighted, strongAvg * 0.95), cap2);
    } else if (strongVotes === 1 && strongHigh[0].aiScore >= 92) {
      /* v0.6 新增：**单项极强**的放行通道。
         实测现代 AI 文本 readability 高达 95，属于"信号接近饱和"的强证据；
         此时若再叠加第二项 >=65（由其进入本分支前的 strongVotes 判定保证
         至少处于本档），单靠"票数"压制会系统性漏报。
         保守起见：封顶 72，并要求该项 >=92（现代真人样本最高单项仅 56，
         不存在误报风险）。 */
      score = Math.min(Math.max(weighted, strongAvg), 72);
    } else {
      /* 强特征不足 → 证据薄弱。保持保守限幅（Stanford 研究：
         检测器把 61.22% 的非母语 TOEFL 作文误判为 AI）。 */
      score = Math.min(weighted, T.statCap);
    }
    /* ⚠️ 短文本置信度惩罚（实测：60-100 词的真人样本会因特征不稳定
       落在 35-40 的"中等"区间）。统计特征在短文本上方差大，
       按 n 的比例向"中性低分"收缩，避免对短文过度自信。
       100 词 → 收缩到 88%；70 词 → 80%；40 词以下 → 65%。 */
    if (wordCount < 120) {
      const shrink = 0.65 + clamp01((wordCount - 40) / 80) * 0.35;
      score = score * shrink;
    }
    score = Math.round(Math.max(0, Math.min(100, score)));

    const wc = wordCount;
    return {
      signals,
      score,
      usable: signals.length > 0,
      reliable: wc >= T.minWords,     // 低于此词数的统计特征不可靠，界面须显著提示
      tuningUsed: T,                  // 记录本次实际生效的阈值，便于追溯
      wordCount: wc,
      sentenceCount: sentences(text).length,
      cliche: cl.usable ? cl : null,
      lexical: lr.usable ? lr : null,
      burst: bu.usable ? bu : null
    };
  }

  function clamp01(x) { return Math.max(0, Math.min(1, x)); }

  return { analyze, lexicalRichness, burstiness, functionWordProfile, punctuationProfile, readability };
})();
