#!/usr/bin/env node
/* =========================================================================
   现代语料评估：检测器在真实现代英语上的实际表现
   ---------------------------------------------------------------------
   与 evaluate.js 的区别：
     · evaluate.js 跑的是 human/（19 世纪公版）vs ai/（人工模拟），
       测的是"旧语料上的表现"。
     · 本脚本跑 student/（现代真实语料），测的是**真实使用场景**下的表现。

   为什么必须有这一步：项目踩过最贵的坑就是「时代偏差」——
   在旧语料上指标漂亮，一到现代文本就失效。
   所以任何阈值改动，都要先看它在这里的表现。

   语料约定（与 recalibrate_modern.js 一致）：
     · 文件名含 ai / AI 的  → AI 样本
     · 其余 .txt            → 真人样本

   运行：node test/corpus/evaluate_modern.js
   ========================================================================= */
const fs = require('fs');
const path = require('path');

function loadModule(file, varName) {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'web', 'assets', file), 'utf8');
  new Function(src.replace(new RegExp('^const ' + varName + ' =', 'm'),
    'globalThis.' + varName + ' ='))();
  return globalThis[varName];
}
const S = loadModule('stylometry.js', 'Stylometry');
const kb = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', 'web', 'assets', 'knowledge_base.json'), 'utf8'));

const S_DIR = path.join(__dirname, 'student');
if (!fs.existsSync(S_DIR)) {
  console.log('未找到 test/corpus/student/ —— 请先按「合法语料获取指南.md」准备语料。');
  process.exit(0);
}

function quant(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

const files = fs.readdirSync(S_DIR).filter(f => f.endsWith('.txt'));
const human = [], ai = [];

/* 真人：student/ 里不含 ai 的（用户自备，有许可限制不入库） */
for (const f of files) {
  const t = fs.readFileSync(path.join(S_DIR, f), 'utf8');
  if (t.trim().split(/\s+/).length < 60) continue;      // 太短的样本不参与
  const r = S.analyze(t, kb);
  if (/ai/i.test(f)) ai.push({ f, score: r.score, words: r.wordCount });
  else human.push({ f, score: r.score, words: r.wordCount });
}

/* AI：student/ 里含 ai 的（已在上面的循环收集）+ ai_modern/（仓库自带） */
const MODERN_AI_DIR = path.join(__dirname, 'ai_modern');
if (fs.existsSync(MODERN_AI_DIR)) {
  for (const f of fs.readdirSync(MODERN_AI_DIR).filter(x => x.endsWith('.txt'))) {
    const t = fs.readFileSync(path.join(MODERN_AI_DIR, f), 'utf8');
    if (t.trim().split(/\s+/).length < 60) continue;
    const r = S.analyze(t, kb);
    ai.push({ f: 'ai_modern/' + f, score: r.score, words: r.wordCount });
  }
}

/* 判定阈值与 stylometry.js 的保守融合保持一致：
   ≥60 高 · 35-59 中 · <35 低 */
const HIGH = 60, MID = 35;

const hs = human.map(r => r.score).sort((a, b) => a - b);
const as = ai.map(r => r.score).sort((a, b) => a - b);

console.log('='.repeat(72));
console.log('现代语料评估（真实使用场景）');
console.log('='.repeat(72));
console.log(`真人 ${human.length} 篇 · AI ${ai.length} 篇`);
console.log('');

function dist(name, arr) {
  if (!arr.length) { console.log(`${name}: 无样本`); return; }
  console.log(`${name} 分数分布：`);
  console.log(`  最小 ${arr[0]} · P10 ${Math.round(quant(arr, 0.1))} · 中位 ${Math.round(quant(arr, 0.5))}` +
    ` · P90 ${Math.round(quant(arr, 0.9))} · 最大 ${arr[arr.length - 1]}`);
}
dist('真人', hs);
dist('AI  ', as);

/* 误报：真人被判中/高 */
const fp = human.filter(r => r.score >= MID);
const fpHigh = human.filter(r => r.score >= HIGH);
/* 漏报：AI 被判低 */
const fn = ai.filter(r => r.score < HIGH);
const fnLow = ai.filter(r => r.score < MID);

console.log('');
console.log('--- 关键指标 ---');
if (human.length) {
  console.log(`真人误报率（判中/高，≥${MID}）：${fp.length} / ${human.length} = ` +
    `${(fp.length / human.length * 100).toFixed(1)}%` +
    (fpHigh.length ? `  （其中判高 ≥${HIGH}：${fpHigh.length} 篇 🔴）` : '  ✅ 无判高'));
} else console.log('真人误报率：无真人样本');

if (ai.length) {
  console.log(`AI 漏报率（判低，<${HIGH}）：${fn.length} / ${ai.length} = ` +
    `${(fn.length / ai.length * 100).toFixed(1)}%` +
    (fnLow.length ? `  （其中判低 <${MID}：${fnLow.length} 篇 🔴）` : ''));
} else console.log('AI 漏报率：无 AI 样本');

/* 列出误报个案，便于归因 */
if (fp.length) {
  console.log('');
  console.log(`--- 误报个案（真人被判 ≥${MID}，共 ${fp.length} 篇）---`);
  fp.sort((a, b) => b.score - a.score).slice(0, 10).forEach(r => {
    console.log(`  ${String(r.score).padStart(3)} 分  ${String(r.words).padStart(4)} 词  ${r.f}`);
  });
  if (fp.length > 10) console.log(`  …另有 ${fp.length - 10} 篇`);
}

if (fn.length) {
  console.log('');
  console.log(`--- 漏报个案（AI 被判 <${HIGH}，共 ${fn.length} 篇）---`);
  fn.sort((a, b) => a.score - b.score).slice(0, 10).forEach(r => {
    console.log(`  ${String(r.score).padStart(3)} 分  ${String(r.words).padStart(4)} 词  ${r.f}`);
  });
}

console.log('');
console.log('⚠️ 解读注意：');
console.log('   · 本语料的人群与目标用户可能不同（如 ELLIPSE 是美国 8-12 年级，');
console.log('     目标用户是马来西亚中国留学生），结论有领域偏差，不可直接外推。');
console.log('   · 样本量小时（<20）分布不稳定，不要据此下结论。');
console.log('   · 改 stylometry.js 后必须重跑本脚本，确认指标没有变差。');
