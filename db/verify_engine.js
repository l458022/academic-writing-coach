// 离线验证分析引擎逻辑（Node 环境，模拟浏览器）
const fs = require('fs');
const path = require('path');

const KB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'assets', 'knowledge_base.json'), 'utf8'));

// ---- 复制 app.js 的核心算法 ----
function tokenize(t) { return (t.toLowerCase().match(/[a-z'-]+/g) || []); }
function splitSentences(t) {
  return t.replace(/\n+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 2);
}
function wordCount(t) { return tokenize(t).length; }

function stripAnnotations(s) {
  return String(s).replace(/[（(][^）)]*[）)]/g, ' ').replace(/\.{2,}/g, ' ')
    .replace(/[«»"“”]/g, ' ').replace(/\s+/g, ' ').trim();
}
function toPatterns(raw) {
  const cleaned = stripAnnotations(raw);
  if (!cleaned) return [];
  let variants = cleaned.split('/')
    .map(s => s.replace(/^[.,;:!?\s]+|[.,;:!?\s]+$/g, '').trim())
    .filter(s => s.length >= 3);
  variants = [...new Set(variants)];
  const filtered = variants.filter(v => {
    const vl = v.toLowerCase();
    return !variants.some(o => { const ol = o.toLowerCase(); return ol !== vl && ol.includes(vl); });
  });
  if (filtered.length > 1) {
    const lens = filtered.map(v => v.length);
    const minL = Math.min(...lens), maxL = Math.max(...lens);
    if (minL < maxL * 0.5) {
      return [filtered.reduce((a, b) => (a.length >= b.length ? a : b))];
    }
  }
  const multi = filtered.filter(v => v.trim().split(/\s+/).length >= 2);
  const single = filtered.filter(v => v.trim().split(/\s+/).length === 1);
  return (multi.length ? multi : single);
}
function patternToRegex(phrase) {
  const parts = phrase.toLowerCase().split(/\s+/).filter(Boolean)
    .map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!parts.length) return null;
  return new RegExp(parts.join('\\s+'), 'gi');
}
function countMatches(h, phrase) { const re = patternToRegex(phrase); if (!re) return 0; const m = h.match(re); return m ? m.length : 0; }

function analyzeAiTells(text, kb) {
  const lower = ' ' + text.toLowerCase().replace(/\s+/g, ' ') + ' ';
  const hits = []; let score = 0;
  const w = { high: 3, medium: 2, low: 1 };
  for (const p of kb.ai_tells) {
    let count = 0;
    for (const v of toPatterns(p.phrase)) count += countMatches(lower, v);
    if (count > 0) { score += count * (w[p.severity] || 1); hits.push({ phrase: p.phrase, count, severity: p.severity }); }
  }
  hits.sort((a, b) => (w[b.severity] * b.count) - (w[a.severity] * a.count));
  const wc = Math.max(wordCount(text), 1);
  return { hits, rawScore: score, score: Math.min(100, Math.round((score / wc) * 100 * 8)) };
}

function analyzeChinglish(text, kb) {
  const lower = ' ' + text.toLowerCase().replace(/\s+/g, ' ') + ' ';
  const hits = [];
  for (const p of kb.chinglish) {
    let total = 0, matchedVariant = '';
    for (const v of toPatterns(p.wrong)) {
      const c = countMatches(lower, v);
      if (c > 0) { total += c; if (!matchedVariant) matchedVariant = v; }
    }
    if (total > 0) hits.push({ wrong: p.wrong, matched: matchedVariant, count: total });
  }
  hits.sort((a, b) => b.count - a.count);
  const wc = Math.max(wordCount(text), 1);
  return { hits, score: Math.min(100, Math.round((hits.reduce((s, h) => s + h.count, 0) / wc) * 100 * 6)) };
}

function analyzeBurstiness(text) {
  const sentences = splitSentences(text);
  const lens = sentences.map(s => tokenize(s).length).filter(n => n > 0);
  if (lens.length < 2) return { lens, cv: 0, tooShort: true, score: 0 };
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  const std = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  const cv = mean > 0 ? std / mean : 0;
  return { lens, mean, std, cv, score: Math.min(100, Math.round(cv * 100)), tooShort: false };
}

// ---- 测试文本 ----
const DEMO = `In today's fast-paced world, artificial intelligence plays a crucial role in modern education. It is important to note that AI tools have fundamentally transformed the way students learn and write. Moreover, these technologies offer numerous benefits.

Firstly, AI can help students improve their writing skills. Secondly, it can provide instant feedback on grammar and style. Thirdly, it enables learners to delve into complex topics with ease. In my opinion, I think this is a very very important development.

On one hand, AI brings convenience and efficiency. On the other hand, it may also lead to over-reliance. Furthermore, some students may use it to make a research without proper thinking. Therefore, we should discuss about how to use it correctly.

In conclusion, AI is a double-edged sword that underscores the importance of digital literacy. It is essential to strike a balance between embracing innovation and maintaining academic integrity. Ultimately, the key is to leverage AI in a responsible manner.

The teacher said we must not open the light of cheating. We should learn knowledge by ourselves and improve our English level step by step. This is a good way to enhance the quality of our study.`;

console.log('='.repeat(60));
console.log('测试文本词数:', wordCount(DEMO));
console.log('='.repeat(60));

const ai = analyzeAiTells(DEMO, KB);
console.log(`\n【AI 腔】指数 ${ai.score}/100，命中 ${ai.hits.length} 类，权重点 ${ai.rawScore}`);
ai.hits.slice(0, 10).forEach(h => console.log(`  [${h.severity}] "${h.phrase}" × ${h.count}`));

const ch = analyzeChinglish(DEMO, KB);
console.log(`\n【中式英语】指数 ${ch.score}/100，命中 ${ch.hits.length} 类`);
ch.hits.slice(0, 10).forEach(h => console.log(`  "${h.wrong}" × ${h.count}`));

const b = analyzeBurstiness(DEMO);
console.log(`\n【句式节奏】CV=${b.cv.toFixed(3)} 均值=${b.mean.toFixed(1)} 标准差=${b.std.toFixed(1)} 分数=${b.score}`);
console.log(`  句长序列: ${b.lens.join(', ')}`);

console.log('\n' + '='.repeat(60));
const pass = ai.hits.length > 0 && ch.hits.length > 0 && !b.tooShort && b.lens.length > 5;
console.log(pass ? '✓ 引擎逻辑验证通过：各维度均能正常检出' : '✗ 验证失败');
console.log('='.repeat(60));
process.exit(pass ? 0 : 1);
