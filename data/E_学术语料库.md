# E. 学术英语语料与改写规则库（可读版）

> **文档目的**：为"马来西亚中国留学生学术写作辅导产品"提供本地可用的学术英语语料与改写规则。
> **产品定位**：**写作辅导工具**——帮助学生把"中式英语 / AI 腔"改写成更地道的学术英语，降低被 Turnitin 等 AI 检测误判的风险。帮助学生**自己修改**，不做代写。
> **创建日期**：2026-10-11
> **配套数据文件**（均通过 `json.load` 校验）：
> - `E_chinglish.json` — 中式英语错误模式库（48 条）
> - `E_ai_tells.json` — AI 腔特征词与句式库（55 条）
> - `E_rewrite_examples.json` — 学术英语改写范式库（36 组）
> - `E_terms.json` — 马来西亚本科专业术语表（8 专业 × 22 条 = 176 条）

---

## 目录

1. [中式英语（Chinglish）错误模式库](#1-中式英语chinglish错误模式库)
2. [AI 腔（AI-typical）特征词与句式库](#2-ai-腔ai-typical特征词与句式库)
3. [学术英语改写范式库（Before → After）](#3-学术英语改写范式库before--after)
4. [马来西亚本科专业术语表](#4-马来西亚本科专业术语表)
5. [本地规则引擎设计建议](#5-本地规则引擎设计建议)

---

## 1. 中式英语（Chinglish）错误模式库

**条数：48** | 9 大类：冗余表达、中式直译、搭配错误、连接词滥用、被动与名词化滥用、冠词与单复数、时态与语态、情态与语气、语序与句式

### 1.1 冗余表达（7 条）

| ID | 错误表达 | 问题 | 学术英语改法 |
|---|---|---|---|
| CH01 | In my opinion, I think that... | 观点引导语叠加，两种表态词重复 | 用 I argue / This paper argues，或删去引导语 |
| CH02 | very very important | 副词叠加强调，口语化 | crucial / pivotal / indispensable |
| CH03 | The reason is because... | reason 与 because 语义重叠 | The reason is that... / This is because... |
| CH04 | repeat again / return back | 动词已含方向或重复义 | repeat / return / advance / discuss |
| CH05 | In recent years, with the rapid development of society... | 万能开头套话，信息量为零 | 用具体时间/现象/数据切入 |
| CH17 | Nowadays, ... | 典型中式作文开头，空泛 | In contemporary Malaysia, ... / Since 2020, ... |
| CH32 | a lot of / lots of | 口语化量词 | many / numerous / a substantial number of |
| CH33 | good / bad / nice | 笼统评价词 | effective / beneficial / detrimental |
| CH34 | get / got | 过于口语，语义模糊 | obtain / receive / acquire / achieve |

### 1.2 中式直译（7 条）

| ID | 错误表达 | 问题 | 学术英语改法 |
|---|---|---|---|
| CH09 | learn knowledge | knowledge 不能 learn | acquire / gain knowledge |
| CH10 | open the light | 『开灯』直译 | turn on the light |
| CH11 | How to say this in English? | 疑问句缺主语 | How do you say this in English? |
| CH12 | I very like this theory. | very 不能修饰动词 | I like this theory very much. |
| CH13 | Although..., but... | 二者不能同现 | 二选一 |
| CH14 | Because..., so... | 二者不能同现 | 二选一 |
| CH15 | With the development of... | 模板化句式 | 以具体机制或证据开头 |
| CH16 | more and more students | 『越来越』直译，笼统 | a growing number of students |

### 1.3 搭配错误（8 条）

| ID | 错误表达 | 问题 | 学术英语改法 |
|---|---|---|---|
| CH07 | make a research | research 不可数，不与 make 搭配 | conduct research / carry out a study |
| CH08 | discuss about the issue | discuss 及物，无需 about | discuss the issue |
| CH18 | give an advice | advice 不可数 | offer a suggestion / provide advice |
| CH19 | pay attention on | 介词搭配错误 | pay attention to / focus on |
| CH20 | according to my opinion | 该短语只引他人/来源 | In my view / I believe |
| CH21 | affect to | affect 为及物动词 | affect the result |
| CH22 | play an important role in（滥用） | 模板填充无具体动词 | X drives / enables / constrains Y |

### 1.4 连接词滥用（5 条）

| ID | 错误表达 | 问题 | 学术英语改法 |
|---|---|---|---|
| CH06 | first of all, last but not least, in a word | 口语化套话堆砌 | First / Finally / In sum / Overall |
| CH23 | Firstly, Secondly, Thirdly, Lastly | 机械排列，沦为清单 | 用逻辑关系连接或省去显式标记 |
| CH24 | Moreover, Furthermore, In addition（连用） | 近义递进词堆叠 | 交替使用并让句子承载递进 |
| CH25 | In conclusion, as mentioned above, to sum up | 结论引导语叠加 | 一段一个收束表达 |
| CH26 | On the one hand... On the other hand... | 为对仗硬配 | 真对立时使用，否则 However / By contrast |
| CH27 | It is worth noting that（频繁） | 元话语稀释信息密度 | 直接陈述 / Notably, |

### 1.5 被动与名词化滥用（4 条）

| ID | 错误表达 | 问题 | 学术英语改法 |
|---|---|---|---|
| CH28 | The problem was solved by us. | 无必要被动 | We solved the problem. |
| CH29 | The implementation of the optimization of the system is necessary. | 名词化堆叠 | The system must be optimized. |
| CH30 | There is a growing tendency for... | there be + 抽象名词结构冗长 | Most students now... |
| CH31 | make an investigation of / conduct an analysis of | 轻动词 + 名词化 | investigate / analyze |

### 1.6 冠词与单复数（5 条）

| ID | 错误表达 | 问题 | 学术英语改法 |
|---|---|---|---|
| CH35 | the society / the nature | 泛指抽象名词误加冠词 | society / nature |
| CH36 | many researches / various informations | 不可数名词误用复数 | several studies / various pieces of information |
| CH37 | a research / an evidence | 不可数名词误加冠词 | a study / a piece of evidence |
| CH45 | some good advices about my study | advice 不可数误加 s | any advice on my studies |
| CH46 | The data shows that... | data 单复数需全篇一致 | The data show... / The dataset shows... |

### 1.7 时态与语态（2 条）

| ID | 错误表达 | 问题 | 学术英语改法 |
|---|---|---|---|
| CH43 | He didn't went | 助动词后误用过去式 | He didn't go |
| CH44 | In the past ten years, the technology change rapidly. | 时态与时间状语不匹配 | Over the past decade, technology has changed rapidly. |

### 1.8 情态与语气（4 条）

| ID | 错误表达 | 问题 | 学术英语改法 |
|---|---|---|---|
| CH39 | I think maybe probably it is... | 情态词叠加，立场含糊 | I argue that... / It is likely that... |
| CH40 | Everyone knows that... | 诉诸常识，无引用 | 删除或补充引用 |
| CH41 | It is undoubted that... | 绝对化断言，缺限定语 | The evidence strongly suggests that... |
| CH42 | The company should be responsible for... | 直接下判断，缺论证 | 补因：Because X, the company bears responsibility... |

### 1.9 语序与句式（3 条）

| ID | 错误表达 | 问题 | 学术英语改法 |
|---|---|---|---|
| CH38 | In this essay I will write about... | 声明『要写什么』而非直接写 | 直接进入论证 |
| CH47 | the theory which is proposed by Smith is very useful for us to solve... | 定语从句冗长、结构笨重 | Smith's theory offers a useful framework for... |
| CH48 | As a student, we should study hard. | 主谓人称不一致 | As students, we should... |

---

## 2. AI 腔（AI-typical）特征词与句式库

**条数：55** | 严重度分级：high（强信号，建议必改）/ medium（中信号，频繁出现才构成风险）/ low（弱信号，可酌情优化）

**类型：** 过渡词套话、模板句式、空洞总结、抽象名词堆砌、语义过度平衡、泛化修饰、元话语填充

### 2.1 高频高风险标志词（high，共 19 条）

| ID | 短语 | 类型 | 改写提示 |
|---|---|---|---|
| AI01 | It is important to note that | 元话语填充 | 直接陈述；或改用 Notably, |
| AI02 | In today's fast-paced world | 过渡词套话 | 替换为具体时空语境 |
| AI03 | plays a crucial role in | 泛化修饰 | drives / enables / underpins |
| AI04 | delve into | 泛化修饰 | examine / investigate / explore |
| AI05 | a rich tapestry of | 抽象名词堆砌 | 删比喻，列具体成分 |
| AI06 | underscores the importance of | 泛化修饰 | demonstrates / highlights |
| AI07 | In the realm of | 泛化修饰 | in / within / in the field of |
| AI08 | It is worth noting that | 元话语填充 | 删引导语，直接陈述 |
| AI09 | navigating the complexities of | 泛化修饰 | manage / address + 具体难题 |
| AI10 | In conclusion, it is clear that | 空洞总结 | In sum, + 具体结论 |
| AI11 | the key to success lies in | 模板句式 | 具体因果陈述 |
| AI12 | a testament to | 泛化修饰 | evidence of / illustrates |
| AI13 | unlock the potential of | 泛化修饰 | realise / develop |
| AI14 | embark on a journey | 泛化修饰 | begin / undertake |
| AI15 | In an era where | 过渡词套话 | When / As / Since + 具体条件 |
| AI16 | the ever-evolving landscape of | 抽象名词堆砌 | 删 landscape，用具体领域名词 |
| AI20 | This is not just about X, it's about Y | 模板句式 | 直陈 X and Y matter because... |
| AI22 | serves as a reminder that | 空洞总结 | This shows / demonstrates |
| AI23 | the importance of X cannot be overstated | 空洞总结 | X is critical because + 具体论据 |
| AI29 | It goes without saying that | 元话语填充 | 直接陈述或补充引用 |
| AI39 | the multifaceted nature of | 抽象名词堆砌 | 删 multifaceted，列各面 |
| AI40 | the intricate interplay between | 抽象名词堆砌 | the relationship between / how X and Y interact |
| AI52 | a myriad of / a plethora of | 泛化修饰 | many / numerous / a range of |
| AI55 | In conclusion... In summary... To conclude... | 空洞总结 | 结论段仅用一个收束表达 |

### 2.2 中风险标志词（medium，节选）

| ID | 短语 | 类型 | 改写提示 |
|---|---|---|---|
| AI17 | Moreover, Furthermore, Additionally（三段连用） | 过渡词套话 | 交替或省略 |
| AI18 | On the one hand... On the other hand... | 语义过度平衡 | 仅真对立时使用 |
| AI19 | Firstly... Secondly... Thirdly... Finally... | 模板句式 | 改为逻辑连接 |
| AI21 | not only... but also...（高频） | 模板句式 | X as well as Y |
| AI24 | opens up new avenues for | 泛化修饰 | enables / allows |
| AI25 | a double-edged sword | 模板句式 | has both benefits and costs |
| AI26 | sheds light on | 泛化修饰 | clarifies / explains / reveals |
| AI27 | paves the way for | 泛化修饰 | enables / facilitates |
| AI28 | In the digital age, ... | 过渡词套话 | 替换为具体语境 |
| AI30 | Needless to say | 元话语填充 | 删除 |
| AI31 | It is no exaggeration to say that | 元话语填充 | 直接陈述或数据支撑 |
| AI32 | Last but not least | 过渡词套话 | Finally / Ultimately |
| AI33 | In a nutshell | 空洞总结 | In sum / Overall |
| AI34 | When it comes to | 元话语填充 | Regarding / As for |
| AI35 | At the end of the day | 元话语填充 | Ultimately |
| AI36 | With that being said | 过渡词套话 | However / Nevertheless |
| AI37 | It is undeniable that | 空洞总结 | The evidence suggests |
| AI38 | This highlights the need for | 空洞总结 | Consequently, X should... |
| AI41 | a holistic approach | 泛化修饰 | an integrated approach |
| AI43 | transformative / groundbreaking（高频） | 泛化修饰 | significant / novel + 证据 |
| AI44 | seamlessly integrate | 泛化修饰 | integrate + 说明方式 |
| AI45 | robust and comprehensive framework | 抽象名词堆砌 | sound framework |
| AI46 | In essence, ... | 空洞总结 | 直接陈述核心结论 |
| AI48 | further research is needed（万能结尾） | 空洞总结 | Future work should test X in Y |
| AI49 | It is a widely held belief that | 元话语填充 | Many researchers argue that + 引用 |
| AI50 | This paper aims to explore/delve into | 模板句式 | This paper examines / argues that |
| AI51 | In order to better understand | 元话语填充 | To understand / To explain |
| AI53 | It should come as no surprise that | 空洞总结 | 直接陈述或省略 |
| AI54 | the ever-growing demand for | 泛化修饰 | the rising demand for |

### 2.3 低风险标志词（low）

| ID | 短语 | 类型 | 改写提示 |
|---|---|---|---|
| AI42 | paradigm shift | 泛化修饰 | 实质范式转移可保留，否则 major change |
| AI47 | Taken together, these findings suggest | 空洞总结 | 学术可用，避免与 In sum 连用 |

### 2.4 模板化结构（句式级，非单词级）

以下为**结构性 AI 痕迹**，无法靠替换单词解决，需从段落层面重构：

1. **三段式机械列举**：每个论点都以 Firstly / Secondly / Thirdly 开头，段落长度近乎相同。
2. **每段同构开头**：各段首句结构一致（如均为 "Another important aspect is..."）。
3. **过度平衡的对仗**：为凑 "On one hand... on the other hand" 而制造并不存在的对立。
4. **空洞总结段**：结论段反复用 In conclusion / In summary / To conclude 重申前文，无新增信息。
5. **句长高度均一**：缺少长短句交替，突发度（burstiness）低。

---

## 3. 学术英语改写范式库（Before → After）

**条数：36 组** | 改写手法：拆分长句 / 合并碎句 / 去套话 / 增加具体性 / 变换句式节奏 / 加入限定语 / 主动化 / 去名词化 / 精确化用词 / 调整语序 / 补充论证 / 删除冗余

| ID | Before | After | 手法 | 说明 |
|---|---|---|---|---|
| RW01 | In my opinion, I think that online learning is very very good for students. | Online learning benefits students in several concrete ways. | 去套话+具体化+删冗余 | 删观点引导词叠加，转为可展开论点句 |
| RW02 | With the rapid development of society, more and more people pay attention to mental health. | Public concern with mental health has grown sharply since 2015, when Malaysia's national health survey first reported a rise in diagnosed anxiety. | 增加具体性+去套话 | 以时间/事件/数据替换模板开头 |
| RW03 | Although the theory is old, but it is still useful for us. | Although the theory is dated, it still offers a useful analytical lens. | 精确化用词+删冗余 | 修正 although/but 同现；old → dated |
| RW04 | The research was done by our group, and we found that the result is very important. | Our group's study found the result to be significant. | 主动化+合并碎句+精确化 | 删无必要被动；important → significant |
| RW05 | Firstly, the cost is high. Secondly, the quality is not good. Thirdly, the service is slow. | Three linked problems undermine the service: high cost, poor quality and slow response. | 合并碎句+调整语序 | 清单合并为主题句+并列 |
| RW06 | It is important to note that the implementation of the optimization of the system is necessary. | The system needs to be optimized. | 去套话+去名词化 | 拆解名词化堆叠，还原动词 |
| RW07 | This paper will delve into the multifaceted nature of the intricate interplay between AI and education. | This paper examines how AI tools affect classroom assessment in Malaysian secondary schools. | 去套话+增加具体性 | 删 AI 腔抽象词，明确对象与范围 |
| RW08 | Technology plays a crucial role in modern society. | Digital payments now handle 60% of retail transactions in urban Malaysia. | 增加具体性+去套话 | 空洞论断 → 可核验事实 |
| RW09 | In today's fast-paced world, ... Moreover, ... Furthermore, ... | Students today must acquire knowledge rapidly and keep adapting as conditions shift. | 去套话+合并碎句+变换节奏 | 删开头套话与过渡词堆叠，合并三句 |
| RW10 | It is widely believed that exercise is good for health. Everyone knows that. | Regular exercise reduces the risk of cardiovascular disease (WHO, 2020). | 补充论证+去套话 | 诉诸常识 → 带引用的结论 |
| RW11 | I think maybe probably the government should do something... | The government could address the problem by tightening emission standards. | 加入限定语+补充论证 | 删情态叠加，具体化举措 |
| RW12 | The company should be responsible for the pollution. They must be punished. | Because the company knowingly discharged waste, it bears legal responsibility for the resulting pollution. | 补充论证+精确化 | 补因果前提，转价值判断为推论 |
| RW13 | There is a growing tendency for the majority of the students to use social media every day. | Most students now use social media daily. | 去名词化+删冗余 | there be 抽象结构 → 直陈主谓 |
| RW14 | We need to make an investigation of the causes and conduct an analysis of the data. | We investigated the causes and analysed the data. | 去名词化+精确化 | 轻动词+名词化 → 单一动词 |
| RW15 | As we all know, education is very important for a country's development. | Education strongly predicts a country's long-run economic growth (Hanushek & Woessmann, 2015). | 去套话+补充论证+具体化 | 空泛断言 → 可引用实证结论 |
| RW16 | The problem is very serious. It affects many people. It needs to be solved as soon as possible. | The problem affects millions and demands urgent attention. | 合并碎句+变换节奏+精确化 | 三短句合一，避免同构堆叠 |
| RW17 | In conclusion, in a nutshell, to sum up, AI is important for education. | Overall, AI is reshaping how students are assessed. | 删冗余+去套话+具体化 | 删重复收束语，落到具体作用 |
| RW18 | On the one hand, AI saves time. On the other hand, AI saves money. | AI cuts both time and cost. | 去套话+合并碎句 | 非对立两点不应套平衡句式 |
| RW19 | The reason is because the data was not collected properly. | The problem arose because the data were collected inconsistently. | 删冗余+精确化+主动化 | 修 reason/because 重复，data 复数一致 |
| RW20 | He didn't went to the library yesterday because he must prepare for the exam. | He did not go to the library yesterday because he had to prepare for the exam. | 精确化用词 | 修 didn't went；must → had to |
| RW21 | In recent years, with the development of the Internet, online shopping has become more and more popular... | Online shopping has grown fastest among young adults since 2018. | 去套话+具体化+变换节奏 | 删双重套话与 more and more |
| RW22 | The essay will discuss about the advantages and disadvantages... It is worth noting that this is a hot topic. | This essay weighs the benefits of remote work against its costs. | 拆分长句+去套话+精确化 | 修 discuss about；删元话语与空话 |
| RW23 | This is not just about saving money, it's about saving the environment. | The policy reduces both household costs and carbon emissions. | 去套话+增加具体性 | 删模板句式，直列两个效果 |
| RW24 | A myriad of studies have shed light on the importance of sleep. | Numerous studies have linked poor sleep to reduced academic performance. | 去套话+具体化+精确化 | myriad → numerous；shed light → 具体结论 |
| RW25 | As a student, we should study hard to get a bright future. | As students, we study hard partly because it widens our career options. | 调整语序+补充论证 | 修人称不一致；get a bright future → 可论证理由 |
| RW26 | The implementation of the new policy has caused a significant reduction in the number of accidents. | The new policy has significantly reduced accidents. | 去名词化+精确化 | 名词化链缩短，还原动词 |
| RW27 | Nowadays, many people think that the education system should be changed. I agree with it. | Public opinion increasingly favours reforming the education system. | 去套话+合并碎句+精确化 | 删 Nowadays 与表态句 |
| RW28 | The data shows that the result is statistically significant, and it proves our hypothesis is correct. | The data indicate a statistically significant result, which supports our hypothesis. | 精确化+加入限定语 | data 复数一致；proves → supports |
| RW29 | In order to better understand the problem, it is important to note that we need more research. | Understanding the problem requires further research into its causes. | 去套话+合并碎句 | 删双重填充，压缩为一句 |
| RW30 | The ever-evolving landscape of technology has transformed the way we live and work in today's digital age. | Mobile computing has changed how Malaysians shop, study and bank. | 去套话+具体化+变换节奏 | 抽象 → 具体技术/地域/活动 |
| RW31 | The theory which is proposed by Zhang is very useful for us to solve this problem. | Zhang's theory offers a workable solution to the problem. | 拆分长句+精确化+删冗余 | which is proposed by → 所有格 |
| RW32 | Many researches show that feedback is good for learning, but some researches disagree. | Most studies find that feedback improves learning, although findings on its timing remain mixed. | 精确化+加入限定语 | researches → studies；具体化分歧点 |
| RW33 | It is undeniable that climate change is a serious problem that we must face together. | Malaysia's mean temperature has risen about 0.9°C since 1970, intensifying flood risk along the east coast. | 去套话+具体化 | 删空话，用数据与后果替代 |
| RW34 | The study of the cultural influence on consumer behavior was carried out by the researcher, and the result obtained shows that culture has an important effect. | The study shows that culture strongly shapes consumer behaviour. | 主动化+去名词化+合并碎句 | 删 was carried out by，合并为一句 |
| RW35 | Last but not least, I want to say that protecting the environment is good. In a word, we should protect it. | Protecting the environment ultimately benefits both public health and the economy. | 去套话+删冗余+具体化 | 删三个套话，good → 具体受益面 |
| RW36 | With the development of the economy, the living standard of people becomes higher and higher... | Rising incomes have steadily improved living standards across Malaysian cities. | 去套话+合并碎句+精确化+变换节奏 | 删套话，合并分句，避免自证式收尾 |

---

## 4. 马来西亚本科专业术语表

**8 个专业方向，每专业 22 条术语，共 176 条。**

### 4.1 Business / Management 工商管理（22 条）

strategic management 战略管理 · competitive advantage 竞争优势 · core competency 核心竞争力 · market segmentation 市场细分 · value chain 价值链 · supply chain management 供应链管理 · stakeholder 利益相关者 · corporate governance 公司治理 · organisational behaviour 组织行为学 · SWOT analysis SWOT分析 · business model 商业模式 · economies of scale 规模经济 · market entry strategy 市场进入策略 · customer relationship management 客户关系管理 · brand equity 品牌资产 · human resource management 人力资源管理 · organisational culture 组织文化 · risk management 风险管理 · business ethics 商业伦理 · return on investment (ROI) 投资回报率 · break-even point 盈亏平衡点 · entrepreneurship 创业学

### 4.2 Computer Science / IT 计算机科学（22 条）

algorithm 算法 · data structure 数据结构 · time complexity 时间复杂度 · machine learning 机器学习 · neural network 神经网络 · database management system 数据库管理系统 · API 应用程序接口 · version control 版本控制 · software development life cycle 软件开发生命周期 · object-oriented programming 面向对象编程 · encryption 加密 · cloud computing 云计算 · operating system 操作系统 · compiler 编译器 · recursion 递归 · artificial intelligence 人工智能 · natural language processing 自然语言处理 · bandwidth 带宽 · latency 延迟 · debugging 调试 · UI/UX 用户界面/用户体验 · scalability 可扩展性

### 4.3 Engineering 工程学（22 条）

mechanical engineering 机械工程 · civil engineering 土木工程 · electrical engineering 电气工程 · tensile strength 抗拉强度 · stress and strain 应力与应变 · load-bearing capacity 承载能力 · finite element analysis 有限元分析 · tolerance 公差 · renewable energy 可再生能源 · energy efficiency 能效 · thermal conductivity 导热系数 · circuit design 电路设计 · prototype 原型 · quality assurance 质量保证 · structural integrity 结构完整性 · fluid dynamics 流体力学 · corrosion resistance 耐腐蚀性 · hydraulic system 液压系统 · manufacturing process 制造工艺 · design specification 设计规范 · maintenance schedule 维护计划 · sustainability 可持续性

### 4.4 Accounting / Finance 会计与金融（22 条）

financial statement 财务报表 · balance sheet 资产负债表 · income statement 利润表 · cash flow statement 现金流量表 · double-entry bookkeeping 复式记账 · accrual basis 权责发生制 · depreciation 折旧 · amortisation 摊销 · audit 审计 · internal control 内部控制 · liquidity ratio 流动比率 · profit margin 利润率 · accounts receivable 应收账款 · accounts payable 应付账款 · equity 所有者权益 · liability 负债 · asset valuation 资产估值 · cost accounting 成本会计 · financial ratio analysis 财务比率分析 · budgeting 预算编制 · taxation 税务 · capital structure 资本结构

### 4.5 Mass Communication 大众传播（22 条）

agenda-setting theory 议程设置理论 · framing 框架理论 · gatekeeping 把关人理论 · media literacy 媒介素养 · public relations 公共关系 · target audience 目标受众 · press release 新闻稿 · editorial 社论 · content analysis 内容分析法 · propaganda 宣传 · advertising campaign 广告活动 · broadcast media 广播媒体 · print media 印刷媒体 · digital media 数字媒体 · media convergence 媒介融合 · credibility 可信度 · audience segmentation 受众细分 · crisis communication 危机传播 · journalism ethics 新闻伦理 · social media engagement 社交媒体互动 · communication theory 传播理论 · two-step flow of communication 两级传播理论

### 4.6 Psychology 心理学（22 条）

cognitive psychology 认知心理学 · behaviourism 行为主义 · operant conditioning 操作性条件反射 · classical conditioning 经典条件反射 · attachment theory 依恋理论 · working memory 工作记忆 · bias 偏差/偏见 · reinforcement 强化 · perception 知觉 · personality trait 人格特质 · clinical psychology 临床心理学 · developmental psychology 发展心理学 · social psychology 社会心理学 · depression 抑郁症 · anxiety disorder 焦虑障碍 · coping mechanism 应对机制 · self-efficacy 自我效能 · empirical study 实证研究 · control group 对照组 · correlation 相关性 · validity and reliability 效度与信度 · qualitative method 定性方法

### 4.7 Nursing 护理学（22 条）

patient care 患者护理 · vital signs 生命体征 · infection control 感染控制 · medication administration 给药 · clinical practice 临床实践 · evidence-based practice 循证实践 · nursing assessment 护理评估 · care plan 护理计划 · postoperative care 术后护理 · triage 分诊 · hand hygiene 手卫生 · chronic illness management 慢性病管理 · patient safety 患者安全 · holistic care 整体护理 · informed consent 知情同意 · wound dressing 伤口换药 · pain management 疼痛管理 · intravenous therapy 静脉输液治疗 · health promotion 健康促进 · palliative care 临终关怀/姑息护理 · nurse-patient ratio 护患比 · clinical governance 临床治理

### 4.8 Education 教育学（22 条）

pedagogy 教学法 · curriculum design 课程设计 · learning outcomes 学习成果 · formative assessment 形成性评价 · summative assessment 终结性评价 · student-centred learning 以学生为中心的学习 · scaffolding 支架式教学 · blended learning 混合式学习 · differentiated instruction 差异化教学 · classroom management 课堂管理 · teaching methodology 教学方法论 · educational psychology 教育心理学 · cognitive load 认知负荷 · assessment rubric 评分标准 · inclusive education 融合教育 · lifelong learning 终身学习 · instructional design 教学设计 · peer feedback 同伴反馈 · motivation 学习动机 · educational policy 教育政策 · literacy 读写能力 · critical thinking 批判性思维

---

## 5. 本地规则引擎设计建议

> 本节供工程实现参考，说明如何用以上四类数据构建**本地可用**的写作分析工具。

### 5.1 匹配层（可 100% 本地实现）

| 数据 | 匹配方式 | 输出 |
|---|---|---|
| `E_chinglish.json` | 短语/正则精确匹配 + 词形变化匹配（research/researches） | 命中错误 + 改法建议 |
| `E_ai_tells.json` | 短语精确匹配 + 词频统计 | 命中短语 + 严重度 + 风险分 |
| `E_terms.json` | 中英对照查表 | 术语拼写与译法建议 |

### 5.2 评分启发式（可 100% 本地实现）

- **AI 腔风险分**：Σ(命中短语 × 严重度权重) / 总词数 × 100。high=3、medium=1.5、low=0.5。风险分越高越像 AI 文本。
- **句式单调度**：句长标准差 / 句长均值，值越低越平（低突发度）。
- **过渡词密度**：过渡词数 / 段落数，过高提示模板化。
- **名词化密度**：`-tion/-ment/-ance` 结尾名词占比，过高提示 AI 式抽象。

### 5.3 边界声明

- 本规则库仅用于**写作质量提升与误判防范**，帮助学生对**自己撰写**的文本做自查。
- 不提供"改写以规避检测"的一键代写服务；所有建议均以"示范改写思路、由学生自己改"为定位。
- 启发式评分只能提示"哪些段落读起来像 AI 腔"，不能替代 Turnitin 等真实检测结果。
