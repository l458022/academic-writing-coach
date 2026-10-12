# C. AI 文本检测器工作原理与判定特征

> **文档目的**：为"帮助学生把学术英语写得更自然、降低被误判风险"的写作分析工具提供技术依据。
> **定位声明**：本调研服务于**误判防范与写作质量提升**，不是作弊工具。所有结论均标注来源等级。
>
> **来源等级约定**
> - 🟢 **官方文档**：检测器厂商/机构自己发布的产品文档、技术报告、官方博客。
> - 🟡 **二手分析**：第三方评测、媒体、行业博客的整理或实测。
> - 🔴 **推测**：基于公开信息的合理推断，未获官方确认（如厂商未公开阈值，由第三方反推）。
>
> **调研日期**：2026-10-11

---

## 目录

1. [总览：检测器的核心判定维度](#1-总览检测器的核心判定维度)
2. [GPTZero](#2-gptzero)
3. [Turnitin](#3-turnitin)
4. [Originality.ai](#4-originalityai)
5. [Pangram](#5-pangram)
6. [Copyleaks](#6-copyleaks)
7. [AI 文本的统计学特征（可量化清单）](#7-ai-文本的统计学特征可量化清单)
8. [人类文本的特征](#8-人类文本的特征)
9. [非英语母语者被误判问题（斯坦福研究）](#9-非英语母语者被误判问题斯坦福研究)
10. [可本地计算的 AI 痕迹指标](#10-可本地计算的-ai-痕迹指标)
11. [本地可算 vs 必须调 API](#11-本地可算-vs-必须调-api)
12. [参考来源汇总](#12-参考来源汇总)

---

## 1. 总览：检测器的核心判定维度

现代 AI 检测器（2025–2026）几乎都围绕**三大类信号**构建。理解这三类信号，就理解了所有检测器的判定逻辑：

| 信号类别 | 代表指标 | 直觉含义 | 来源等级 |
|---|---|---|---|
| **① 困惑度类（Perplexity）** | token 级预测概率、对数似然 | "这段话的用词有多可预测"——AI 用词高度可预测（低困惑度） | 🟢🟡 |
| **② 突发度类（Burstiness / 方差）** | 句长标准差、困惑度方差 | "写作节奏是否有起伏"——AI 节奏平稳（低突发度） | 🟢🟡 |
| **③ 模式/分类器类（Classifier & N-gram）** | 训练好的判别模型、AI 高频短语、句法偏好 | "是否带有 LLM 的'指纹'模式"——过渡词滥用、三段式、语义过度连贯 | 🟢🟡 |

**关键演变**：早期 GPTZero（2023 年 1 月）以 perplexity + burstiness 起家，但 2023 年秋已**迁移到深度学习架构**，统计指标退居为"7 个指标之一"（🟢 官方博客自述）。如今主流检测器以**训练好的 Transformer 判别器**为主，perplexity/burstiness 是可用近似但不再是唯一依据。

**共同的可靠性边界**（🟢 多方官方/🟡 评测一致）：
- **长文本更准**：短于 250–300 词准确率显著下降（Turnitin 硬性要求 ≥300 词；Pangram/OpenAI 研究指出 <50 词基本不可信）。
- **正式学术写作天然低困惑度**：即使人写的论文也可能被误标 AI。
- **非母语者（ESL）误判率系统性偏高**（见第 9 节）。
- **同一文本多次检测结果可能不一致**。

---

## 2. GPTZero

### 2.1 原理

**"七指标 + 深度学习"分层架构**（🟢 官方）：

- **历史起点（2023-01）**：论文式统计模型，核心是 **perplexity（困惑度）** + **burstiness（突发度）**。
- **现状（2023 秋起）**：迁移至深度学习架构，perplexity/burstiness 降级为七项指标之一，与"文本搜索""深度学习检测"并列为分层模型的一部分。
  - 官方技术报告：*GPTZero: Robust Detection of LLM-Generated Texts*（arXiv:2602.13042，2026-02-13）。摘要自述："hierarchical, multi-task architecture（分层多任务架构）"，强调对**改写（paraphrasing）与对抗攻击的鲁棒性**，通过"multi-tiered automated red teaming（多层自动红队测试）"实现。
- **句子级分类器**：逐句计算"由 AI 生成的概率"，同时给出文档级与句级结论（🟢 官方 FAQ）。
- **混合文档（MIXED）**：能识别"部分 AI、部分人类"的混合文本，官方称此类场景准确率 96.5%（🟢 官方，**厂商自测**）。

### 2.2 评分维度

- ⚙️ **困惑度（perplexity）**：衡量"AI 模型有多大可能选出完全相同的一组词"。句子像 AI、则低困惑度；出现人类式意外用词、则高困惑度。
- ⚙️ **突发度（burstiness）**：衡量"写作模式与逐句困惑度在整篇文档中的波动程度"。人类喜欢变化，模型倾向恒定（"AI-print"）。
- ⚙️ **深度学习特征**：句法/词汇结构、以及"文本搜索"与对抗鲁棒性特征。
- ⚙️ **Paraphraser Shield（改写盾）**：见 2.4。

### 2.3 阈值/分档

| 判据 | 数值 | 来源等级 |
|---|---|---|
| 困惑度"大概率出自人类"的参考线 | **perplexity > 85** | 🟢 官方博客（**注**：官方已声明 2023 秋后不再以 perplexity 为主判据，此阈值仅适用于早期统计模型/参考其他检测器） |
| API 文档分类标签 | `HUMAN_ONLY` / `MIXED` / `AI_ONLY` | 🟢 官方 developer 页 |
| 置信度分级 | `confidence_category`: `high` / `medium` / `low`；high 时错误率 <1% | 🟢 官方 FAQ |
| 混合文档准确率 | 96.5% | 🟢 官方（**厂商自测**，非独立验证） |
| 误报率（整体） | <1% | 🟢 官方（厂商自测） |
| TOEFL（ESL）误报率 | **1.1%** | 🟢 官方（厂商自测；对比第 9 节斯坦福 2023 研究的老检测器数据） |
| 改写检测准确率（beta） | ~95%；误报 <0.1% | 🟢 官方（2024-11 博客，厂商自测） |

> ⚠️ **务必区分**：GPTZero 宣称的 1.1% ESL 误报率是**2024–2026 年深度学习模型的自测值**；斯坦福 2023 研究测的是**含 ZeroGPT 等在内的旧检测器**，二者不可直接对比（见第 9 节）。

### 2.4 Paraphraser Shield（改写检测）

🟢 官方机制（2024-11 上线，2025 年持续增强）：

1. **先判"是否为 AI 原文"** —— 检测改写后的文本是否**源头就是 AI 生成**；
2. **再判"是否被工具改写"** —— 分析内容是否被"humanizer/bypasser"类工具加工过以伪装成人写。

- 针对的是"把 AI 文本自动换词、换句式以绕过检测"的工具（如 Phrasly、Undetectable、Quillbot 的 humanizer 模式），**不针对** Grammarly 这类正当写作辅助或改写**人类**文本的查重场景。
- 官方举例：绕过工具会产生语法/标点错误、生硬同义词，**文本质量反而下降**。
- 结果呈现：检测到中等/高置信度改写时，扫描页标记 **"possible AI paraphrasing detected"**。
- 来源等级：🟢 官方博客 + 🟢 官方支持文档（注明"beta，最终体验可能不同"）。

### 2.5 官方 API（api.gptzero.me）

🟢 官方 developer 页 + Stoplight 文档（v2.0.0）：

**Base URL**：`https://api.gptzero.me`

**端点**
- `POST /v2/predict/text` —— 文本输入
- `POST /v2/predict/file` —— 文件输入

**请求头**
```
Accept: application/json
Content-Type: application/json
x-api-key: <API_KEY>
```

**请求体（示例）**
```json
{
  "document": "string",
  "version": "string"
}
```

**响应字段**（🟢 官方 FAQ 明确 + 🟡 Stoplight 文档整理）

| 字段 | 含义 | 来源等级 |
|---|---|---|
| `document_classification` | 文档分类：`HUMAN_ONLY` / `MIXED` / `AI_ONLY` | 🟢 |
| `class_probabilities` | 各分类的概率：`ai` / `human` / `mixed` | 🟢 |
| `confidence_category` | 置信度：`high` / `medium` / `low` | 🟢 |
| `highlight_sentence_for_ai` | 句级高亮：哪些句子最像 AI | 🟢 |
| `sentences[]` | 句级结果数组（含逐句 generated 概率、perplexity） | 🟡 文档整理 |
| `average_generated_prob` | 文档平均"生成概率" | 🟡 文档整理 |
| `completely_generated_prob` | "完全由 AI 生成"的概率 | 🟡 文档整理 |
| `perplexity` / `burstiness` | 逐句与文档级统计值 | 🟡 文档整理 |
| `result_details` | 汇总详情（含上述统计） | 🟡 文档整理 |

> 说明：`average_generated_prob` 等具体字段名来自公开的 Stoplight API 文档与社区集成记录，官方 FAQ 只点名了 `document_classification`、`class_probabilities`、`confidence_category`、`highlight_sentence_for_ai`。字段以官方 Stoplight 页面为准。

**公开来源**
- 官方百科：https://gptzero.me/news/perplexity-and-burstiness-what-is-it/
- 官方开发者/API：https://gptzero.me/developers
- 官方 API 文档（Stoplight）：https://gptzero.stoplight.io/docs/gptzero-api/5bf295g49gwxp-gpt-zero-api
- 官方技术报告：https://arxiv.org/abs/2602.13042
- 改写检测博客：https://gptzero.me/news/ai-paraphrasing-detection/
- 改写检测支持文档：https://support.gptzero.me/articles/5593633457-how-does-gptzero-detect-ai-paraphrasing-and-ai-bypassers

---

## 3. Turnitin

### 3.1 原理

🟢 官方（Turnitin Guides）：

- **AI Writing Detection（AI 写作检测）** 独立于查重（Similarity）系统，**是两套独立评分**，AI 高亮**不会**出现在 Similarity Report 中。
- **只对"qualifying text（合格文本）"评分**：即**长篇写作格式（long-form）中的散文句子（prose sentences）**——论文、学位论文、文章等。
  - **不检测**：诗歌、剧本、代码等非散文；短格式/非常规写作如要点列表、表格、注释书目。
- **句级分割（per-sentence segmentation）**：模型逐句判断"是否可能由 LLM 生成"或"是否可能由 LLM 生成后被 AI 改写/绕过工具加工"。
- **改写/绕过检测**：官方明确 AI 检测模块能识别"AI 生成后经 AI paraphraser、AI bypasser、AI word spinner（如 Quillbot）进一步修改"的文本，在 breakdown 中用**蓝色**高亮。
  - ⚠️ **仅英文检测器**具备改写/绕过检测能力；西语、日语检测器**暂不支持**（🟢 官方）。
- 官方坦承：模型"may misidentify"，**不得作为处分学生的唯一依据**，须结合人工与学校政策（🟢 官方）。

### 3.2 评分维度（🟡 推测为主）

Turnitin 未公开其算法细节（官方明确说"方法很复杂"，指向 FAQ）。🟡 第三方普遍推测其基于**困惑度与突发度（perplexity/burstiness）的深度学习变体**，但**厂商从未确认**。判定为 **🔴 推测**。

可确认的**结构化维度**（🟢）：
- 逐句二分类 → 汇总为文档百分比；
- 分离"AI 生成"与"AI 改写"两类高亮；
- 与查重系统解耦。

### 3.3 阈值/分档（🟢 官方，非常重要）

| 情形 | 处理方式 | 来源等级 |
|---|---|---|
| **0–19%** | **不显示具体分数**，只显示 `*%`，官方称此区间**误报率更高**，故隐藏以降低误解 | 🟢 |
| **20–100%** | 正常显示百分比，代表"合格文本中疑似 AI 的比例" | 🟢 |
| 2024-07-08 之前的报告 | 可能仍显示 <20% 的数值 | 🟢 |
| 文件要求 | <100MB；**≥300 词散文**；≤30,000 词；支持英/西/日/阿；.docx/.pdf/.txt/.rtf | 🟢 |
| 句子级误报率 | 约 **4%**（第三方引用）；独立测试有不同数字 | 🟡 |

> **对工具设计的启示**：Turnitin 的"20% 以下不显示"机制说明**低分区间本身就是噪声区**。工具应提示学生：低于 20% 的分数无参考价值；目标是让文本**整体远离**容易堆积句级 AI 判定的模式。

**公开来源**
- 官方使用指南：https://guides.turnitin.com/hc/en-us/articles/22774058814093-Using-the-AI-Writing-Report
- 官方文件要求：https://guides.turnitin.com/hc/en-us/articles/28234943089933-File-requirements-for-an-AI-Writing-Report
- 官方模型说明：https://guides.turnitin.com/hc/en-us/articles/28294949544717-AI-writing-detection-model
- 第三方整理：https://theaileaderboard.org/posts/turnitin-ai-detection-guide

---

## 4. Originality.ai

### 4.1 原理（🟢 官方技术博客）

- **核心：改进版 BERT（判别式 Transformer）+ 自研预训练模型**，**不是**简单的 perplexity/burstiness 统计器。
- **架构细节**（🟢 官方）：
  - 用 **160GB 文本**训练了一个**全新架构**的预训练语言模型（Transformer 系）。
  - 训练技术**类似 ELECTRA**：**生成器（generator）+ 判别器（discriminator）双模型**训练，训练完成后**取判别器**作为检测模型。
  - 再在**百万级样本**的训练集上微调。
  - 结论：**判别式（bidirectional）架构比生成式架构更适合检测**；模型越大越准。
- **训练数据**：真实文本（多来源清洗）+ 多种采样方式生成的 AI 文本（temperature / Top-K / nucleus sampling），且**人工复核**，以让 AI 文本"尽可能贴近真实分布"、学到更细的判别边界。
- **二元分类 + 阈值**：输出"人写概率"vs"AI 概率"，用阈值（如 0.5）判定。
- **句/段落级高亮**：AI 句标深红，人写句标绿色（🟢 官方示例）。

### 4.2 评分维度

- 训练式判别特征（句法偏好、短语模式、结构倾向）——**不是**单一 perplexity。
- 官方称对**改写文本（adversarial data）**做主动对抗测试，持续更新以识别被 Quillbot/Grammarly 改过的文本。

### 4.3 阈值/分档（🟢/🟡）

| 指标 | 数值 | 来源等级 |
|---|---|---|
| AI 检测准确率 | 99%+（厂商） | 🟢 官方（**自测**） |
| 误报率 | 约 2% | 🟡 第三方实测 |
| 可靠文本长度下限 | **≥50 tokens** 才"可接受"；短文本是难点 | 🟢 官方 |
| 支持语言 | 30 种（2025 扩展） | 🟢 官方 |
| 独立评测准确率 | 92.3%（HATC-2025）/ 约 80%（ZDNet 实测） | 🟡 差异大 |

**其他功能维度**：AI Allowance（自定义允许的 AI 比例）、Deep Scan（解释"为何被标 AI"及如何改）、读性/查重/事实核查。

**公开来源**
- 官方检测器：https://originality.ai/ai-checker
- 官方技术博客：https://originality.ai/blog/how-does-ai-content-detection-work
- 官方 API：https://docs.originality.ai/api-v2-0-new

---

## 5. Pangram

### 5.1 原理（🟢 官方技术页）

- **类型**：**神经网络分类器（classifier model）**，采用**传统语言模型架构**——文本分词 → 每 token 转 embedding → 过神经网络 → 分类头输出 0（人）/ 1（AI）。
- **初始训练**：约 **100 万篇**文档（公开+授权的**人类文本** + GPT-4 等前沿模型生成的 **AI 文本**）。
- **降低误报的核心技术**（🟢 官方，差异化亮点）：
  1. **Hard Negative Mining（难负样本挖掘）**：用模型在大数据集里搜出**被误判的人类文本**，加回训练集再训练，反复迭代 → 误报率趋近于零。
  2. **Mirror Prompts（镜像提示）**：为每篇人类文档生成一篇**在风格、语气、语义上尽量匹配**的 AI 文档，迫使模型**只依据 LLM 特有的写作特征**做判断，而非依据主题/体裁。
- **Pangram 4**（🟡 官方博客/第三方转述）：误报率压到 **0.0041%**（约每 2.4 万份人写稿错标 1 次），可区分"轻微润色"与"完全 AI 生成"。

### 5.2 评分维度

- 训练式判别特征（embedding 空间中的 AI 指纹），**非**公开的 perplexity 公式。
- 强项：**极低误报** + 可**区分编辑程度**。

### 5.3 阈值/分档（🟡）

| 指标 | 数值 | 来源等级 |
|---|---|---|
| 误报率 | 1/10,000（厂商）→ Pangram 4 声称 0.0041% | 🟡 厂商声称，独立验证有限 |
| 独立评测 | 2025 芝加哥大学工作论文：在**严格 0.5% 误报上限**下，是唯一仍保持强检测力的检测器 | 🟡 独立研究 |
| 短文本 | <50 词所有商业检测器准确率都下降 | 🟡 独立研究 |

**公开来源**
- 官方原理页：https://www.pangram.com/research/how-it-works
- 官方 FAQ：https://www.pangram.com/knowledge-hub/how-does-pangram-work
- 技术报告 PDF：https://pangram-public.s3.us-east-1.amazonaws.com/pdf/pangram_4_technical_report.pdf

---

## 6. Copyleaks

### 6.1 原理（🟢 官方）

- **组合方法**：**语言建模 + 深度学习 + 自研 AI Logic**，基于**数万亿篇人类文档**训练，识别 LLM 留下的**统计模式**，能从**人机混写**中分离 AI 部分。
- **官方公开的具体信号**（🟢，难得地列出维度）：
  1. **频率比（Frequency ratios）**：对比大数据集，找出**比人类写作更常出现在 AI 文本中的短语**。
  2. **词性/句法（Parts of speech）**：分析语法结构与句法，找 AI 式模式。
  3. **音节离散度（Syllable dispersion）**：检查音节的**节奏与流动**（≈ 一种韵律/突发度信号）。
  4. **连字符用法（Hyphen usage）**：标记"不寻常或过度机械"的连字符模式。
- **AI Logic**：展示"**为什么**被标 AI"——AI Phrases（短语的 AI 统计频率）+ AI Source Match（是否与他人已发布内容重合）。

### 6.2 评分维度

- 频次模式、句法、音节韵律、标点（连字符）——**多信号组合**而非单一 perplexity。
- **多语言**是主打（30+ 语言）。

### 6.3 阈值/分档（🟢/🟡）

| 指标 | 数值 | 来源等级 |
|---|---|---|
| 准确率 | 99%+ | 🟢 官方（**自测**） |
| 误报率 | **0.03%** | 🟢 官方（**自测**） |
| 英文 | 人 99.97% / AI 99.20% | 🟢 官方测试方法页 |
| 支持语言 | 30+（英法德意葡西日中俄荷…） | 🟢 官方 |
| 免费额度 | 25,000 字符/次（免登录） | 🟢 官方 |
| 独立实测准确率 | 约 80%（ZDNet） | 🟡 |

**公开来源**
- 官方检测器：https://copyleaks.com/ai-content-detector
- 官方测试方法：https://copyleaks.com/ai-detector/testing-methodology
- 非母语者准确率说明：https://copyleaks.com/blog/accuracy-of-ai-detection-models-for-non-native-english-speakers

---

## 7. AI 文本的统计学特征（可量化清单）

> 🟡 本节数值区间主要来自第三方技术博客与评测的反推，**厂商未公开确切阈值**，请作为"经验区间"使用。

### 7.1 可量化特征表

| # | 特征 | 量化方式 | AI 典型值 | 人类典型值 | 来源等级 |
|---|---|---|---|---|---|
| 1 | **低困惑度** | 语言模型逐 token 平均负对数似然 → 困惑度 PPL | 5–30（越低越像 AI） | 50–200+ | 🟡 |
| 2 | **低突发度** | 句长标准差（见 §10.1） | 0.5–3 | 5–20 | 🟡 |
| 3 | **句长均匀** | 句长方差 / 变异系数 | 方差小、集中 | 长短交替、方差大 | 🟡🟢 |
| 4 | **词汇分布均匀** | 类符形符比 TTR（Type-Token Ratio） | 0.35–0.45 | 0.50–0.70 | 🟡 |
| 5 | **过渡词/连接词滥用** | "Furthermore/Moreover/Additionally/It is worth noting/In conclusion"每 100 词出现次数 | 3–8 次 | 0–2 次 | 🟡 |
| 6 | **AI 高频短语（N-gram）** | "it is important to note that""delve into the intricacies""plays a crucial role"等命中率 | 高 | 低 | 🟡🟢 |
| 7 | **句式模板化** | 主谓结构重复率、被动语态频率、从句位置一致性 | 结构高度一致 | 结构多变 | 🟡 |
| 8 | **三段式结构** | 段落数、每段句数、intro-body-conclusion 对称性 | 高度对称 | 不对称、跑题再回 | 🔴 推测 |
| 9 | **语义过度连贯** | 相邻句语义相似度（embedding cosine）均值的**高位稳定** | 句句紧密衔接、少跳跃 | 有跳跃、偶尔跑题 | 🟡 |
| 10 | **标点单一** | 标点种类数、连字符/破折号/分号频率 | 偏单一/机械 | 多样 | 🟢（Copyleaks 官方点名连字符） |
| 11 | **音节节奏均匀** | 音节离散度 / 音节的句内分布 | 均匀 | 起伏 | 🟢（Copyleaks 官方） |
| 12 | **标点前无空格等机械格式** | 格式一致性度 | 过度一致 | 偶有随意 | 🔴 推测 |
| 13 | **段落开头句式雷同** | 段首词/短语重复 | 常雷同 | 常各异 | 🔴 推测 |

### 7.2 三条"最可靠"的机械信号（🟡 多方一致）

1. **句长方差（burstiness）** —— 被公认为**最难造假**的机械信号（不真正重写结构就改不动）。
2. **词汇多样性（TTR）** —— AI 倾向于反复收敛到同一小撮词。
3. **过渡词密度** —— AI 过量生产的"连接组织"。

---

## 8. 人类文本的特征

🟡 综合多方评述（检测器**识别这些特征**即判为人写）：

| 特征 | 表现 | 对指标的影响 |
|---|---|---|
| **句式长短交替** | 3–5 词短句夹 25–40 词长句 | 抬高 burstiness（句长标准差） |
| **口语化插入 / 语气词** | "Honestly""The thing is""put simply" | 抬升困惑度、降低模板化 |
| **不完美表达** | 轻微冗余、思路回旋、非最优措辞 | 抬升困惑度 |
| **个人化细节** | 具体经历、一手观察、情境化例子 | 抬升困惑度、打破语义过度连贯 |
| **非常规搭配 / 意外用词** | 非常见隐喻、跨域联想 | 直接抬高困惑度（核心人类信号） |
| **跑题再回归** | 段落偏离主线后拉回 | 打破"过度连贯" |
| **多样标点** | 分号、破折号、省略号、括号插入语 | 标点多样性信号 |

> ⚠️ **给工具的重要提醒**：把上述特征"机械化堆砌"会制造新的模板（例如句句都插语气词）。工具应引导学生**真实地**丰富表达，而非替换成另一套模板。**现代检测器（2024 后）已对"加错别字/加噪声"做归一化，靠打错字不会降低 AI 判定**（🟡 技术博客一致）。

---

## 9. 非英语母语者被误判问题（斯坦福研究）

### 9.1 研究概况

🟢 论文：*GPT detectors are biased against non-native English writers*（Liang et al., 2023；arXiv:2304.02819；斯坦福 HAI 报道）。
被引核心结论：

- 测试了 **7 个广泛使用的 GPT 检测器**（含 GPTZero、Originality.ai、Sapling、Crossplag、OpenAI detector、ZeroGPT 等）。
- **数据集**：91 篇中国学生 TOEFL 练习作文（**写于 ChatGPT 之前**）+ 88 篇美国八年级学生作文。

### 9.2 核心数字（🟢 官方报道/论文）

| 结论 | 数值 |
|---|---|
| TOEFL（非母语）作文被**至少一个**检测器判为 AI | **97%**（89/91） |
| TOEFL 作文被**多数**检测器判为 AI | **61.22%** |
| TOEFL 作文被**全部 7 个**检测器一致判为 AI | **19%**（18/91） |
| 美国八年级（母语）作文 | **近乎完美**被判为人写 |

### 9.3 偏见的成因（🟢 论文/报道）

- 检测器核心依赖 **perplexity**，而 perplexity **与写作复杂度正相关**。
- 非母语者在**词汇丰富度（lexical richness）、词汇多样性（lexical diversity）、句法复杂度、语法复杂度**上天然偏低 → 被误读为"低困惑度 = AI"。
- 关键论断（James Zou，资深作者）："检测器**目前太不可靠、且太容易被绕过**，不应轻信。"

### 9.4 极容易被绕过（🟢）

- 对 AI 生成文本加一句提示"**Elevate the provided text by employing literary language**"重写后，检测率**从高降到约 3%**（近零）。
  - ⚠️ 这是**反例警示**：说明检测器可被"拔高文风"轻易击穿，也侧面说明**提升文本复杂度本身**会降低 AI 判定——这正是"降低误判"的机制基础（需**真实**提升，而非套路化）。

### 9.5 后续研究（🟡 第三方引用）

- 2025 年研究：非母语者误报率比母语者**高至多 35%**；检测器对非母语者仅 **67%** 准确率，对母语者 **92%**。
- **官方应对**：GPTZero 自 2022 起针对 ESL 去偏，称 TOEFL 误报降至 **1.1%**（🟢 厂商自测）；Copyleaks 专文说明其对非母语英语的低误报（🟢 官方）。

**公开来源**
- 斯坦福 HAI：https://hai.stanford.edu/news/ai-detectors-biased-against-non-native-english-writers
- 论文：https://arxiv.org/abs/2304.02819

---

## 10. 可本地计算的 AI 痕迹指标

> 本节所有公式**可用 Python + 常规库本地计算**，无需调用外部检测 API。
> 所需依赖：`nltk` / `spacy`（分句、词性）、`textstat`（读性）、`transformers` + `torch`（困惑度，需下载 GPT-2 等模型）、`scikit-learn`（方差、TTR）。

### 10.1 突发度（Burstiness）—— 最核心的本地指标

**定义**：句子长度的**变异程度**。人类写作长短句交替 → 高突发度；AI 句长均匀 → 低突发度。

**方法 A：句长标准差法（推荐，简单可靠）**
```python
import statistics
def burstiness(sent_lengths: list[int]) -> float:
    """句长标准差 / 均值，即变异系数 CV。"""
    mean = statistics.mean(sent_lengths)
    std  = statistics.pstdev(sent_lengths)
    return std / mean if mean else 0.0
```
- **绝对标准差**：人类经验区间 **5–20**（词），AI **0.5–3**。
- **变异系数 CV = σ / μ**（归一化，便于跨长度比较）：人类通常 **>0.4**，AI 常 **<0.25**（🟡 经验区间）。
- 判据：`σ < 4` 或 `CV < 0.25` → 疑似 AI 均匀（🟡）。

**方法 B：困惑度突发度法（GPTZero 原始定义，需 transformers）**
```python
# 伪代码：逐句用 GPT-2 计算句子平均困惑度，再求这些困惑度的标准差
sentence_ppls = [sentence_perplexity(s) for s in sentences]
burstiness_ppl = statistics.pstdev(sentence_ppls)
```
- 含义：句式/用词"意外程度"的**波动**。人类波动大，AI 波动小。

### 10.2 困惑度（Perplexity）—— 需下载语言模型（本地推理，非 API）

```python
import torch
from transformers import GPT2LMHeadModel, GPT2TokenizerFast

model_id = "gpt2"  # 或 gpt2-medium / distilgpt2
tok = GPT2TokenizerFast.from_pretrained(model_id)
mdl = GPT2LMHeadModel.from_pretrained(model_id)
mdl.eval()

def perplexity(text: str, stride: int = 512) -> float:
    enc = tok(text, return_tensors="pt")
    max_len = mdl.config.n_positions
    ids = enc.input_ids
    nlls, prev = [], 0
    for i in range(0, ids.size(1), stride):
        begin = max(i + stride - max_len, 0)
        end = min(i + stride, ids.size(1))
        tgt = ids[:, begin:end].clone()
        if end - begin < max_len:
            tgt[:, :-1] = -100  # 只算新增 token
        with torch.no_grad():
            out = mdl(ids[:, begin:end], labels=tgt)
        nlls.append(out.loss * (end - begin - 1))
        prev = end
    import math
    return math.exp(torch.stack(nlls).sum() / (ids.size(1) - 1))
```
- **参考**：GPTZero 早期称"困惑度 > 85 更可能来自人类"（🟢 官方，早期模型）。
- ⚠️ **口径提醒**：不同 LM（GPT-2 / GPT-3 / 自研）算出的 PPL **不可直接比较**。本地用 GPT-2 算的绝对值只能做**相对比较**（同一模型下，AI 文本 PPL 明显低于人写）。**不要**直接套用"85"这个数字，除非用 GPTZero 同款模型。

### 10.3 词汇多样性（TTR / MTLD）

```python
def type_token_ratio(tokens: list[str]) -> float:
    return len(set(tokens)) / len(tokens)   # 注意：TTR 随文本变长而下降
```
- 短文本用 **TTR**；长文本用 **MTLD**（建议用 `lexicalrichness` 库）避免长度偏差。
- AI 倾向 **0.35–0.45**，人类 **0.50–0.70**（🟡）。

### 10.4 过渡词/连接词密度

```python
TRANSITIONS = ["furthermore","moreover","additionally","in conclusion",
               "it is important to note","it is worth noting","in summary",
               "further","thus","hence","consequently","overall","notably"]
def transition_density(words: list[str]) -> float:
    n = len(words)
    hits = sum(1 for w in words if w.lower() in TRANSITIONS)
    return hits / n * 100   # 每 100 词命中次数
```
- AI 典型 **3–8 次/100 词**，人类 **0–2 次/100 词**；**>5 次** → 可疑（🟡）。

### 10.5 AI 高频短语 N-gram 命中率

```python
AI_PHRASES = ["it is important to note that","delve into the intricacies",
              "plays a crucial role","in today's fast-paced world",
              "a testament to","navigate the complexities","it is worth noting"]
def ai_phrase_hits(text: str) -> int:
    t = text.lower()
    return sum(t.count(p) for p in AI_PHRASES)
```
- 短语库可自建/扩展。命中数越高越像 AI（🟡）。

### 10.6 句长分布离散度（补充）

```python
import numpy as np
def sentence_stats(lengths: list[int]) -> dict:
    a = np.array(lengths, dtype=float)
    return {
        "mean": a.mean(),
        "std": a.std(ddof=0),
        "cv": a.std(ddof=0)/a.mean() if a.mean() else 0,
        "min": a.min(), "max": a.max(),
        "range": a.max()-a.min(),
        "skew": float(((a-a.mean())**3).mean()/(a.std()**3+1e-9)),
    }
```
- 人类：`range` 大、`skew` 偏正（偶有超长句）；AI：`range` 小、分布窄。

### 10.7 标点多样性

```python
PUNCTS = [",", ";", ":", "—", "-", "(", ")", "?", "!", "…", "\""]
def punctuation_variety(text: str) -> int:
    return sum(1 for p in PUNCTS if p in text)
```
- 人类种类更多；AI 偏单一（🟡，Copyleaks 官方点名连字符模式异常）。

### 10.8 句级语义连贯度（embedding 相似度）

```python
# 用 sentence-transformers 本地计算相邻句 cosine 相似度
from sentence_transformers import SentenceTransformer, util
m = SentenceTransformer("all-MiniLM-L6-v2")
def adjacent_coherence(sentences: list[str]) -> float:
    emb = m.encode(sentences, normalize_embeddings=True)
    sims = [float(util.cos_sim(emb[i], emb[i+1])) for i in range(len(emb)-1)]
    return sum(sims)/len(sims) if sims else 0.0
```
- AI 相邻句相似度**均值高且稳定**；人类有起伏（🟡）。

### 10.9 读性/复杂度代理

```python
import textstat
def complexity(text: str) -> dict:
    return {
        "flesch": textstat.flesch_reading_ease(text),
        "gunning_fog": textstat.gunning_fog(text),
        "avg_sent_len": textstat.avg_sentence_length(text),
    }
```
- 可作 perplexity 的**廉价代理**（不下载模型也能给参考），但**非精确**。

---

## 11. 本地可算 vs 必须调 API

| 维度 | 本地可算？ | 实现方式 | 说明 |
|---|---|---|---|
| 句长方差 / burstiness（CV、σ） | ✅ **完全可本地** | `statistics` / `numpy` | 最可靠、零成本、零依赖 API |
| 句长分布统计（range/skew） | ✅ | `numpy` | — |
| 词汇多样性 TTR / MTLD | ✅ | `lexicalrichness` / 自写 | 长文本用 MTLD |
| 过渡词密度 | ✅ | 词表匹配 | 词表需自建 |
| AI 高频短语命中 | ✅ | 字符串匹配 | 词表需自建、需持续更新 |
| 标点多样性 | ✅ | 正则 | — |
| 句级语义连贯度 | ✅ | `sentence-transformers`（本地推理） | 首次需下载模型 |
| 读性/复杂度代理 | ✅ | `textstat` | 近似，非检测器等价物 |
| **困惑度（PPL）** | ✅ **可本地**（需下载 LM） | `transformers` + GPT-2/自选模型 | 本地 GPT-2 算的 PPL 仅宜**相对比较**，绝对值不可直接套 GPTZero 的 85 |
| **训练式判别器打分**（GPTZero/Turnitin/Originality/Pangram 的真实判定） | ❌ **必须调 API** | 厂商闭源模型 | 无法本地复现其判别器 |
| **改写/humanizer 检测**（Paraphraser Shield 类） | ❌ **必须调 API** | 厂商闭源 | — |
| **厂商官方分数/百分比** | ❌ **必须调 API** | 见 §2.5 API 字段 | 本地只能给"风险指标"，不能给"官方分数" |

### 设计建议

- **工具核心走本地**：用 §10 的 8–9 个指标构建一个**"AI 痕迹风险面板"**（句长方差、TTR、过渡词密度、短语命中、标点多样性、相邻句连贯度、PPL 相对值）。
- **本地定位为"自查/改稿指引"**：给出"哪几句太均匀/过渡词太密"，引导学生**真实**改写，而非给出"通过率"。
- **官方分数留作可选**：如需与 Turnitin/GPTZero 对齐，调用其 API（§2.5 等），并在 UI 明确标注这是**外部判定、非本地结论**。
- **必须提示的边界**（保护学生）：短于 300 词不评；20% 以下不解读（Turnitin 官方逻辑）；非母语者天然偏高（§9），工具应**主动说明**这一点，避免学生自我怀疑。

---

## 12. 参考来源汇总

> 图例：🟢 官方 / 🟡 二手 / 🔴 推测

**GPTZero**
- 🟢 困惑度与突发度百科：https://gptzero.me/news/perplexity-and-burstiness-what-is-it/
- 🟢 开发者/API：https://gptzero.me/developers
- 🟢 API 文档（Stoplight）：https://gptzero.stoplight.io/docs/gptzero-api/5bf295g49gwxp-gpt-zero-api
- 🟢 技术报告 arXiv:2602.13042：https://arxiv.org/abs/2602.13042
- 🟢 改写检测博客：https://gptzero.me/news/ai-paraphrasing-detection/
- 🟢 改写检测支持文档：https://support.gptzero.me/articles/5593633457-how-does-gptzero-detect-ai-paraphrasing-and-ai-bypassers

**Turnitin**
- 🟢 AI Writing Report 指南：https://guides.turnitin.com/hc/en-us/articles/22774058814093-Using-the-AI-Writing-Report
- 🟢 文件要求：https://guides.turnitin.com/hc/en-us/articles/28234943089933-File-requirements-for-an-AI-Writing-Report
- 🟢 AI 检测模型页：https://guides.turnitin.com/hc/en-us/articles/28294949544717-AI-writing-detection-model
- 🟡 阈值整理：https://theaileaderboard.org/posts/turnitin-ai-detection-guide

**Originality.ai**
- 🟢 检测器：https://originality.ai/ai-checker
- 🟢 技术博客：https://originality.ai/blog/how-does-ai-content-detection-work
- 🟢 API：https://docs.originality.ai/api-v2-0-new

**Pangram**
- 🟢 原理页：https://www.pangram.com/research/how-it-works
- 🟢 FAQ：https://www.pangram.com/knowledge-hub/how-does-pangram-work
- 🟢 技术报告 PDF：https://pangram-public.s3.us-east-1.amazonaws.com/pdf/pangram_4_technical_report.pdf

**Copyleaks**
- 🟢 检测器：https://copyleaks.com/ai-content-detector
- 🟢 测试方法：https://copyleaks.com/ai-detector/testing-methodology
- 🟢 非母语者：https://copyleaks.com/blog/accuracy-of-ai-detection-models-for-non-native-english-speakers

**斯坦福非母语者误判研究**
- 🟢 HAI 报道：https://hai.stanford.edu/news/ai-detectors-biased-against-non-native-english-writers
- 🟢 论文：https://arxiv.org/abs/2304.02819

**统计特征 / 二手技术分析**
- 🟡 Burstiness & Perplexity 深挖（含数值区间与公式）：https://www.write-humanly.com/blog/burstiness-perplexity-deep-dive
- 🟡 检测工作原理与盲区：https://www.gethumanified.com/blog/ai-text-detection-how-it-works
- 🟡 多检测器对比与实测：https://www.runnwrite.com/best-ai-checker-of-2025-i-tested-17-detectors
- 🟡 Pangram/OpenAI 独立评测综述：https://www.itechguides.com/?p=354823

---

*文档结束。所有阈值均为 2025–2026 年公开信息，检测器更新频繁，实施前请复核最新官方文档。*
