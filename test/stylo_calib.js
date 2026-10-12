const fs=require('fs'),path=require('path');
let src=fs.readFileSync(path.join(__dirname,'..','web','assets','stylometry.js'),'utf8');
src=src.replace(/^const Stylometry =/m,'globalThis.Stylometry =');
new Function(src)();
const S=globalThis.Stylometry;
const KB=JSON.parse(fs.readFileSync(path.join(__dirname,'..','web','assets','knowledge_base.json'),'utf8'));

// 多样化样本，检验是否过拟合
const CASES = {
  'AI-1 学术套话': `In today's rapidly evolving business environment, financial accounting plays a crucial role in ensuring the transparency and reliability of corporate financial reporting. It is important to note that the adoption of International Financial Reporting Standards has fundamentally transformed the way organizations prepare and present their financial statements. Moreover, this transformation underscores the importance of accurate revenue recognition and comprehensive disclosure practices. Firstly, the principle of revenue recognition requires entities to identify performance obligations. Secondly, the measurement of assets must reflect fair value where appropriate. Thirdly, the concept of materiality guides preparers in determining which information is significant. Furthermore, the role of internal controls cannot be overstated. It is essential to establish robust mechanisms that safeguard assets. In conclusion, financial accounting serves as a critical foundation for decision-making.`,

  'AI-2 空话模板': `Corporate governance is important. It affects many things in business. Good governance leads to better performance. It also improves investor confidence. There are many benefits of good corporate governance. First, it increases transparency. Second, it reduces risk. Third, it attracts investment. These benefits are very important for companies. In conclusion, corporate governance plays a vital role in modern business. Companies should pay attention to it. This will help them achieve success.`,

  'AI-3 会计师分析（带数据）': `The company reported total revenue of 45.2 million ringgit for the fiscal year 2023. This represents a significant increase compared to the previous year. The management team has implemented several strategic initiatives to improve operational efficiency. These initiatives have resulted in better cost control and improved margins. The balance sheet shows a healthy cash position. This provides flexibility for future investments. The company continues to invest in technology and innovation. This is crucial for maintaining competitive advantage in the market. Overall, the financial performance demonstrates the effectiveness of the company strategy.`,

  '人类-1 学术（有引用有犹豫）': `The relationship between leverage and profitability in Malaysian listed firms is, I think, less clear than the textbooks suggest. Woo (2022) found a negative association using fixed-effects on 340 firms, but her sample excludes the plantation sector entirely, which seems like a real omission given how capital-intensive those firms are. I ran the same specification on my own data (2018-2023, n=118) and got a coefficient of about -0.03, though it wasn't significant at conventional levels, so I wouldn't overstate it. Honestly the whole literature feels under-specified.`,

  '人类-2 学生口语化': `Okay so basically what happened was the company kept changing its depreciation method, like every two years, which is weird right? I mean nobody does that unless they are hiding something. My lecturer said this is a classic earnings management signal. I looked it up and yeah, there is research on this. But also maybe they just had a new CFO. I do not know, it is hard to tell from the outside. Either way the cash flows tell a different story than the profit numbers, and that is what I would focus on.`,

  '人类-3 短学术（母语感强）': `My argument is simple: the auditor's going-concern paragraph contradicts the board's own statement three pages earlier. That's not a mistake. It's a choice. Whoever drafted the MD&A knew what the audit committee had signed off on, and they wrote around it anyway. Follow the drafting, not the disclosure.`,

  '灰色-AI改写（人机混合）': `The literature on earnings management is extensive. Prior studies have examined accruals-based manipulation, focusing on managerial discretion over accounting estimates. However, comparatively less attention has been paid to real activities manipulation, despite growing evidence that firms increasingly shift toward this channel. This study addresses that gap by examining Malaysian listed firms over 2015 to 2023.`,

  '灰色-AI短碎片': `Artificial intelligence is transforming many industries. It has become increasingly common in recent years.`,

  '人类-极短': `The numbers don't add up.`,
};

const rows=[];
for (const [name,text] of Object.entries(CASES)){
  const r=S.analyze(text, KB);
  rows.push({name, wc:r.wordCount, sc:r.score, cli:r.signals.find(x=>x.key==='cliche')?.aiScore, lex:r.signals.find(x=>x.key==='lexical')?.aiScore});
}
console.log('样本'.padEnd(26),'词数'.padStart(5),'总分'.padStart(5),' 套话'.padStart(5),' 词汇'.padStart(5),'  判定');
console.log('─'.repeat(62));
for(const r of rows){
  const v = r.wc<30 ? '(样本过短，不判)' : r.sc>=60?'🔴高':r.sc>=35?'🟠中':'🟢低';
  console.log(r.name.padEnd(26), String(r.wc).padStart(5), String(r.sc).padStart(5), String(r.cli??'-').padStart(5), String(r.lex??'-').padStart(5), '  '+v);
}
