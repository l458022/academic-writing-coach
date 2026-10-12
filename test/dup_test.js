const fs=require('fs'),path=require('path');
function load(f,name){let s=fs.readFileSync(path.join(__dirname,'..','web','assets',f),'utf8');
 s=s.replace(new RegExp('^const '+name+' =','m'),'globalThis.'+name+' =');new Function(s)();return globalThis[name];}
const D=load('duplicate.js','DuplicateCheck');
const KB=JSON.parse(fs.readFileSync(path.join(__dirname,'..','web','assets','knowledge_base.json'),'utf8'));

// 案例：含明显文内复制粘贴 + 万能句
const DUP_SAMPLE=`With the development of international accounting standards, companies must follow the rules. This essay will discuss the importance of financial reporting.

Financial reporting is very important for companies. It helps investors make decisions. It also helps regulators understand the market. Financial reporting is very important for companies and it helps them.

In conclusion, financial reporting is very important for companies. It helps investors make decisions. As we all know, this is a key issue.`;

const CLEAN=`The deferred tax liability on AirAsia's balance sheet increased by 340 million ringgit between 2022 and 2023, which is unusual given that the group reported a pre-tax loss that year. Working through note 14, most of the movement traces back to temporary differences on leased aircraft.`;

console.log('═══ 重复检测实测 ═══\n');
for(const [n,t] of [['含复制粘贴+万能句',DUP_SAMPLE],['干净原创',CLEAN]]){
  const r=D.analyze(t,KB);
  console.log('样本:',n,'| 词数',r.wordCount);
  console.log('  重复风险分:',r.score,'/100', r.score>=60?'🔴高':r.score>=35?'🟠中':'🟢低');
  console.log('  文内重复:',r.internal.count,'对，重复词占比',(r.internal.ratio*100).toFixed(1)+'%');
  r.internal.pairs.slice(0,2).forEach(p=>console.log('    - 句#'+p.aIdx+' 与 #'+p.bIdx+' 共享',p.sharedGrams,'个6-gram'));
  console.log('  语料库重叠: 最高',(r.corpus.best*100).toFixed(0)+'%', r.corpus.hitCount,'条');
  console.log('  万能套语:',r.generic.map(g=>g.phrase+'×'+g.count).join(', ')||'无');
  console.log();
}
