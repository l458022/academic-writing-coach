/* =========================================================================
   经验学习模块（Learner）—— 浏览器内的自我校准
   ---------------------------------------------------------------------
   定位说明（必须先读，否则会误解本模块的能力边界）：

   1. 本模块**不是模型训练**。纯前端网页无服务器、无算力，不可能在浏览器里
      训练神经网络。它做的是「**经验积累 + 规则校准**」：
      记录每次分析的特征分布 → 收集用户对判定的对错反馈 →
      统计出哪些特征在误报/漏报 → 给出可解释的调参建议。

   2. **绝不记录用户原文**。只存脱敏后的统计量（分数、特征值、命中模式名、
      文本长度档位）。原因有二：
        (a) 用户粘贴的是自己的作业/论文，属个人文稿，存原文侵犯隐私；
        (b) 把别人的作业存进"学习库"，本质上就是在攒一份论文语料库，
            这偏离了本工具"写作教练"的定位。

   3. **不自动改阈值**。经验只产出「建议」，须用户确认后才写入；
      任何时候可一键重置回默认。理由：连续几条错误反馈就能把判定带偏，
      而检测器的首要危害是误报真人（Stanford 研究：误判 61.22% 非母语作文）。

   存储：localStorage，键名 wb_learner_v1。数据不出本机。
   ========================================================================= */

const Learner = (() => {

  const STORE_KEY = 'wb_learner_v1';
  const MAX_RECORDS = 400;          // 经验条目上限（超出淘汰最旧的）
  const MAX_EDITS = 60;             // 调参历史上限

  /* 默认阈值（与 stylometry.js 的保守融合保持一致） */
  const DEFAULT_TUNING = {
    clicheGate: 20,      // 套话命中达到此值才允许峰值加成
    statCap: 48,         // 无套话证据时，纯统计信号的上限
    boostFactor: 0.35,   // 峰值加成系数
    boostMax: 18,        // 峰值加成上限
    minWords: 120        // 低于此词数判定为"不可靠"
  };

  function now() { return Date.now(); }

  /* ---------------- 读写存储 ---------------- */
  function blank() {
    return {
      version: 1,
      created: now(),
      records: [],        // 经验条目
      tuning: { ...DEFAULT_TUNING },
      edits: [],          // 调参历史（含时间、原因、前后值）
      stats: { total: 0, aiConfirmed: 0, humanConfirmed: 0, feedbackCount: 0 }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return blank();
      const d = JSON.parse(raw);
      if (!d || typeof d !== 'object') return blank();
      // 容错：补齐缺失字段，避免旧版本数据导致崩溃
      const b = blank();
      const merged = {
        ...b, ...d,
        tuning: { ...DEFAULT_TUNING, ...(d.tuning || {}) },
        stats: { ...b.stats, ...(d.stats || {}) },
        records: Array.isArray(d.records) ? d.records : [],
        edits: Array.isArray(d.edits) ? d.edits : []
      };
      return merged;
    } catch (e) {
      return blank();
    }
  }

  function save(d) {
    try {
      // 裁剪，防无限膨胀
      if (d.records.length > MAX_RECORDS) {
        d.records = d.records.slice(d.records.length - MAX_RECORDS);
      }
      if (d.edits.length > MAX_EDITS) {
        d.edits = d.edits.slice(d.edits.length - MAX_EDITS);
      }
      localStorage.setItem(STORE_KEY, JSON.stringify(d));
      return true;
    } catch (e) {
      // 配额满或隐私模式：静默降级，不阻断主流程
      return false;
    }
  }

  /* ---------------- 经验条目：脱敏指纹 ---------------- */
  /* 只抽取统计量，绝不保留任何原文片段 */
  function fingerprint(text, stylo, dup, uniId) {
    const wc = (stylo && stylo.wordCount) || 0;
    const sig = {};
    if (stylo && Array.isArray(stylo.signals)) {
      for (const s of stylo.signals) {
        // 只存 key 与折算分，不存 evidence 里的原文
        sig[s.key] = Math.round(s.aiScore);
      }
    }
    // 命中模式：只记"模式名/类型"，不记文中上下文
    let clicheTypes = [];
    try {
      if (stylo && stylo.cliche && Array.isArray(stylo.cliche.hits)) {
        clicheTypes = [...new Set(stylo.cliche.hits.map(h => h.type))].slice(0, 6);
      }
    } catch (e) { /* 忽略 */ }

    return {
      t: now(),
      wc,                                             // 词数
      band: wc < 120 ? 'S' : (wc < 400 ? 'M' : 'L'),  // 长度档位
      ai: stylo ? Math.round(stylo.score) : null,     // AI 倾向分
      dup: dup ? Math.round(dup.score) : null,        // 重复风险分
      reliable: stylo ? !!stylo.reliable : false,
      signals: sig,                                   // 各特征分
      clicheTypes,                                    // 命中的套话类别（非原文）
      uni: uniId || '',                               // 院校（便于分组）
      verdict: null                                   // 用户反馈：'ai' | 'human' | null
    };
  }

  /* 记录一次分析（每次点「开始分析」调用） */
  function observe(text, stylo, dup, uniId) {
    const d = load();
    const rec = fingerprint(text, stylo, dup, uniId);
    d.records.push(rec);
    d.stats.total += 1;
    save(d);
    return rec;
  }

  /* ---------------- 用户反馈：这是本模块的"学习信号" ---------------- */
  /* kind: 'ai' = 用户确认这篇确实是 AI 写的
           'human' = 用户确认这篇是真人写的（即工具误报）
           也支持 'unclear' = 说不准，仅记录不计入校准 */
  function feedback(recordIndex, kind) {
    const d = load();
    // 默认标注最近一条
    let i = (recordIndex === undefined || recordIndex === null)
      ? d.records.length - 1 : recordIndex;
    if (i < 0 || i >= d.records.length) return null;
    const rec = d.records[i];
    const prev = rec.verdict;
    rec.verdict = kind;

    // 修正统计计数
    if (prev === 'ai') d.stats.aiConfirmed -= 1;
    if (prev === 'human') d.stats.humanConfirmed -= 1;
    if (kind === 'ai') d.stats.aiConfirmed += 1;
    if (kind === 'human') d.stats.humanConfirmed += 1;
    if (kind === 'ai' || kind === 'human') d.stats.feedbackCount += 1;

    save(d);
    return { index: i, kind, record: rec };
  }

  /* ---------------- 总结：从经验里提炼规律 ---------------- */
  /* 返回可读的经验结论 + 调参建议，但**不直接改**任何阈值 */
  function summarize() {
    const d = load();
    const recs = d.records;
    const withFb = recs.filter(r => r.verdict === 'ai' || r.verdict === 'human');

    const out = {
      total: d.stats.total,
      feedbackCount: d.stats.feedbackCount,
      aiConfirmed: d.stats.aiConfirmed,
      humanConfirmed: d.stats.humanConfirmed,
      facts: [],        // 经验事实（陈述句）
      suggestions: [],  // 调参建议（需用户确认）
      tuning: { ...d.tuning },
      edits: d.edits.slice(-10).reverse(),
      perFeature: []    // 各特征在两类样本上的均值对比
    };

    if (recs.length === 0) {
      out.facts.push('还没有经验记录。每分析一篇文章，系统就会记住它的特征分布（不记原文）。');
      return out;
    }

    /* 1) 各特征在"确认 AI"与"确认真人"两类上的均值 */
    const keys = new Set();
    for (const r of withFb) for (const k in (r.signals || {})) keys.add(k);

    const FEATURE_CN = {
      cliche: 'AI 套话密度', lexical: '词汇丰富度', burstiness: '句式波动',
      starter: '句首多样性', punct: '标点形式', readability: '可读性'
    };

    for (const k of keys) {
      const aiVals = withFb.filter(r => r.verdict === 'ai' && r.signals[k] != null)
        .map(r => r.signals[k]);
      const huVals = withFb.filter(r => r.verdict === 'human' && r.signals[k] != null)
        .map(r => r.signals[k]);
      if (!aiVals.length && !huVals.length) continue;
      const m = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
      const mA = m(aiVals), mH = m(huVals);
      out.perFeature.push({
        key: k, name: FEATURE_CN[k] || k,
        aiAvg: mA, humanAvg: mH, aiN: aiVals.length, humanN: huVals.length,
        // 判别力：AI 均值应显著高于人类均值，差值越大越有用
        sep: (mA != null && mH != null) ? (mA - mH) : null
      });
    }

    /* 2) 误报检测：被确认为"真人写的"但工具判中/高危 */
    const falseHigh = withFb.filter(r => r.verdict === 'human' && r.ai != null && r.ai >= 35);
    if (falseHigh.length) {
      out.facts.push(`已记录 ${falseHigh.length} 例**误报**：真人写的文本被判为中/高风险` +
        `（分数 ${falseHigh.map(r => r.ai).join('、')}）。`);

      /* 归因前先算出每个特征的"判别方向"：
         sep = AI均分 − 真人均分。只有 sep > 0 的特征，才意味着
         "该项分数高 → 更像 AI"，此时它在误报样本里偏高才构成元凶。
         若 sep < 0（如词汇丰富度，实测 AI 低于真人），该项分数高
         恰恰是"人类"的证据，不该被当作误报原因——这是本模块
         与直觉相反、但必须遵守的一点。 */
      const dir = {};
      for (const f of out.perFeature) dir[f.key] = f.sep;

      const culprit = {};
      const inverted = {};   // 方向相反却在误报中偏高的特征（需提示，但不是元凶）
      for (const r of falseHigh) {
        for (const k in (r.signals || {})) {
          if (r.signals[k] >= 60) {
            const sep = dir[k];
            if (sep == null) { culprit[k] = (culprit[k] || 0) + 1; }        // 无对比数据，暂计
            else if (sep > 5) { culprit[k] = (culprit[k] || 0) + 1; }       // 方向一致 → 元凶
            else if (sep < -5) { inverted[k] = (inverted[k] || 0) + 1; }    // 方向相反 → 非元凶
          }
        }
      }

      const top = Object.entries(culprit).sort((a, b) => b[1] - a[1])[0];
      if (top) {
        out.facts.push(`误报主要由「${FEATURE_CN[top[0]] || top[0]}」贡献` +
          `（${top[1]}/${falseHigh.length} 例该项 ≥60，且该特征判别方向为"越高越像AI"）。`);
        out.suggestions.push({
          target: top[0], kind: 'loosen',
          title: `考虑调低「${FEATURE_CN[top[0]] || top[0]}」的权重或判定强度`,
          reason: `该特征在 ${top[1]} 例误报中均 ≥60 分，且样本数据显示它确实"高分指向 AI"，` +
            `说明它对真人写作也容易给高分。`,
          action: '建议：降低该特征权重，或提高它的触发门槛。需你确认后手动调整。'
        });
      } else {
        out.facts.push('这些误报中**没有单一特征稳定偏高**——说明是多项中分叠加所致，' +
          '而非某个特征特别激进。');
      }

      if (Object.keys(inverted).length) {
        const invList = Object.keys(inverted)
          .map(k => `${FEATURE_CN[k] || k}(${inverted[k]}例)`).join('、');
        out.facts.push(`注：${invList} 在误报样本中偏高，但该特征实测"人类 > AI"，` +
          '属正常人类特征，**不计入误报归因**。');
      }

      if (falseHigh.some(r => (r.signals.cliche || 0) === 0)) {
        out.facts.push('其中存在**无任何套话命中**却被判高风险的案例——' +
          '这类最危险，说明纯统计信号把真人写作误伤。现有 `statCap` 限幅可能仍不够。');
        out.suggestions.push({
          target: 'statCap', kind: 'loosen',
          title: '考虑下调"无套话证据时的分数上限"',
          reason: '已有真人在零套话命中的情况下被判中/高风险，需更保守的限幅。',
          action: `当前 statCap = ${d.tuning.statCap}，可考虑降到 ${Math.max(30, d.tuning.statCap - 8)}。`
        });
      }
    } else if (withFb.filter(r => r.verdict === 'human').length >= 3) {
      out.facts.push('目前**没有误报记录**：所有被确认为真人写的文本均判为低风险。' +
        '保守策略运行良好。');
    }

    /* 3) 漏报检测：被确认为"AI 写的"但工具判低风险 */
    const missLow = withFb.filter(r => r.verdict === 'ai' && r.ai != null && r.ai < 35);
    if (missLow.length) {
      out.facts.push(`已记录 ${missLow.length} 例**漏报**：确认是 AI 写的却被判为低风险` +
        `（分数 ${missLow.map(r => r.ai).join('、')}）。`);
      const noCliche = missLow.filter(r => (r.signals.cliche || 0) < 20).length;
      if (noCliche) {
        out.facts.push(`其中 ${noCliche} 例**几乎没有命中套话**——` +
          '说明 AI 套话库覆盖不足，是数据问题（需补词库），不是算法问题。');
        out.suggestions.push({
          target: 'clicheLibrary', kind: 'expand',
          title: '扩充 AI 套话库',
          reason: `${noCliche} 例漏报样本未被套话库命中，导致缺乏"内容级证据"而无法判高危。`,
          action: '建议补充 data/E_ai_tells.json 的模式（这是数据扩充，非调参）。'
        });
      }
    }

    /* 4) 样本量提示 */
    if (d.stats.feedbackCount < 5) {
      out.facts.push(`反馈样本较少（${d.stats.feedbackCount} 条）。` +
        '少于 5 条时统计规律不稳定，建议多标注几篇再参考建议。');
    }

    /* 5) 长度档位分布（便于发现样本偏斜） */
    const byBand = { S: 0, M: 0, L: 0 };
    for (const r of recs) if (byBand[r.band] != null) byBand[r.band] += 1;
    out.facts.push(`经验库长度分布：短(<120词) ${byBand.S} 篇 · ` +
      `中(120-399) ${byBand.M} 篇 · 长(≥400) ${byBand.L} 篇。`);

    /* 6) 一致性检查：确认 AI 的样本平均分应高于确认真人的 */
    const aiScores = withFb.filter(r => r.verdict === 'ai' && r.ai != null).map(r => r.ai);
    const huScores = withFb.filter(r => r.verdict === 'human' && r.ai != null).map(r => r.ai);
    if (aiScores.length >= 2 && huScores.length >= 2) {
      const mA = Math.round(aiScores.reduce((a, b) => a + b, 0) / aiScores.length);
      const mH = Math.round(huScores.reduce((a, b) => a + b, 0) / huScores.length);
      const gap = mA - mH;
      out.facts.push(`已确认 AI 样本均分 ${mA}，确认真人样本均分 ${mH}，区分度 ${gap} 分。`);
      if (gap < 15) {
        out.suggestions.push({
          target: 'separation', kind: 'review',
          title: '区分度过低，建议人工复核特征权重',
          reason: `AI 与真人的均分只差 ${gap} 分（<15），说明当前特征组合区分力不足。`,
          action: '建议回看上方「各特征均值对比」，找出区分度（sep）最低的特征并降权。'
        });
      } else {
        out.facts.push(`区分度 ${gap} 分，属健康区间（≥15）。`);
      }
    }

    return out;
  }

  /* ---------------- 应用建议（须显式确认） ---------------- */
  function applyTuning(patch, reason) {
    const d = load();
    const before = { ...d.tuning };
    const next = { ...d.tuning };
    for (const k in patch) {
      if (k in DEFAULT_TUNING && typeof patch[k] === 'number' && isFinite(patch[k])) {
        next[k] = patch[k];
      }
    }
    d.tuning = next;
    d.edits.push({ t: now(), reason: reason || '', before, after: { ...next } });
    save(d);
    return { before, after: next };
  }

  function reset() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* 忽略 */ }
    return blank();
  }

  /* 清空经验但保留调参（用于重新开始积累样本） */
  function clearRecords() {
    const d = load();
    d.records = [];
    d.stats = { total: 0, aiConfirmed: 0, humanConfirmed: 0, feedbackCount: 0 };
    save(d);
    return d;
  }

  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(str) {
    try {
      const d = JSON.parse(str);
      if (!d || typeof d !== 'object' || !Array.isArray(d.records)) {
        return { ok: false, msg: '格式不正确：缺少 records 数组' };
      }
      const b = blank();
      const merged = {
        ...b, ...d,
        tuning: { ...DEFAULT_TUNING, ...(d.tuning || {}) },
        stats: { ...b.stats, ...(d.stats || {}) }
      };
      save(merged);
      return { ok: true, msg: `已导入 ${merged.records.length} 条经验` };
    } catch (e) {
      return { ok: false, msg: 'JSON 解析失败：' + (e && e.message ? e.message : e) };
    }
  }

  return {
    DEFAULT_TUNING,
    observe, feedback, summarize,
    applyTuning, reset, clearRecords,
    exportJSON, importJSON,
    getTuning: () => load().tuning,
    load, save
  };
})();
