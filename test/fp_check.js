const fs=require('fs'),path=require('path');
let src=fs.readFileSync(path.join(__dirname,'..','web','assets','stylometry.js'),'utf8');
src=src.replace(/^const Stylometry =/m,'globalThis.Stylometry =');
new Function(src)();
const S=globalThis.Stylometry;
const KB=JSON.parse(fs.readFileSync(path.join(__dirname,'..','web','assets','knowledge_base.json'),'utf8'));

// 5 段真实风格的人类写作（非母语留学生 + 母语者混），检查误报
const HUMANS = {
  'H1 非母语学生（语法瑕疵）': `In my opinion I think the company have a big problem with cash flow. Their revenue increase but the cost also increase more faster. So the profit become smaller. My friend said this is because management not efficient. But I think maybe is because of the economic condition in Malaysia last year. Many shop close down so the company also affected. So they must reduce the cost or find new market.`,
  'H2 母语学术（正式但有犹豫）': `The evidence here is mixed, and I want to be careful not to overclaim. Three of the five studies I reviewed report a positive relationship, but two of those have small samples and rely on a single industry. It's possible the effect is real but modest, and simply harder to detect in noisy panel data. I'd want more sector-level variation before drawing a firm conclusion.`,
  'H3 商业报告（人类写的正式文）': `Our audit identified two material weaknesses in the client's revenue cycle. First, the system permits posting to closed periods without supervisory approval. Second, the reconciliation between the subledger and general ledger is performed quarterly rather than monthly, creating a window in which misstatements could remain undetected. We have communicated these findings to management and the audit committee.`,
  'H4 学生实证（带数据与困惑）': `I collected 120 observations from Bursa Malaysia between 2019 and 2023. The mean debt-to-equity ratio is 0.68, which is higher than I expected. The regression gave me a negative coefficient but the p-value was 0.11 so I can't reject the null at 5%. My supervisor suggested I check for multicollinearity, and the VIF was 3.2, which seems fine. I'm still not sure why the result is weak.`,
  'H5 混合语言风格（留学生常见）': `Actually the main issue is that IFRS requires fair value but in Malaysia many assets don't have active market, right. So the company just use the model approach. This is a problem because the assumption can be manipulated. I read one article from 2022 that say this. So maybe the regulator should give more guidance instead of just let the company decide.`,
};
let fails = 0;
console.log('样本'.padEnd(30),'词数'.padStart(5),'总分'.padStart(5),' 判定');
console.log('─'.repeat(56));
for(const [n,t] of Object.entries(HUMANS)){
  const r=S.analyze(t,KB);
  const bad = r.score>=48;
  if(bad) fails++;
  console.log(n.padEnd(30), String(r.wordCount).padStart(5), String(r.score).padStart(5), '  '+(bad?'❌误报':r.score>=35?'🟠偏中':'🟢低'));
}
console.log('\n误报数:', fails, fails===0?'✅ 无人类误报':'⚠️ 需修');
