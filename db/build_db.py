#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
查重降AI项目 - 数据库构建脚本
把 data/ 下散落的调研数据，整合成 web/ 可直接读取的统一数据库 db/knowledge_base.json
"""
import json
import os
import sys
from datetime import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(BASE, "data")
DB = os.path.join(BASE, "db")


def load(name):
    p = os.path.join(DATA, name)
    if not os.path.exists(p):
        print(f"  [!] 缺失: {name}")
        return None
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def norm_list(obj, key):
    """从 dict 里安全取出 list 字段"""
    if obj is None:
        return []
    if isinstance(obj, list):
        return obj
    if isinstance(obj, dict):
        return obj.get(key, []) or []
    return []


# ---------------------------------------------------------------------------
# A 类：马来西亚高校 AI 政策库（人工结构化，来源见 A_马来西亚高校AI政策.md）
# 严格依据调研报告，未查到者标注 status=unknown，不编造
# ---------------------------------------------------------------------------
UNIVERSITIES = [
    {
        "id": "UM", "name_zh": "马来亚大学", "name_en": "Universiti Malaya", "abbr": "UM",
        "type": "公立", "city": "吉隆坡", "has_policy": "明确",
        "ai_stance": "允许辅助，需声明",
        "framework": "0-4 五级 AI 使用框架（L0禁止/L1极少量语法拼写/L2有限生成想法/L3开放须透明报告/L4整合AI为评估必需）",
        "exam_rule": "笔试原则上禁用 AI；口试/Viva 一律禁止；论文需导师授权并正式声明",
        "penalty": "未在AI政策中单列罚则，纳入既有《学术不端/抄袭》规章处理；未声明AI可能被认定为学术不端",
        "detection": "Turnitin（含AI Detector）、GPTZero、Originality.AI",
        "threshold": "未公布统一相似度阈值",
        "key_note": "明确「检测软件不得作为学术不端的唯一定案证据」",
        "source_url": "https://spm.um.edu.my/policy-on-the-use-of-artificial-intelligence-ai-in-teaching-and-learning/"
    },
    {
        "id": "UKM", "name_zh": "马来西亚国立大学", "name_en": "Universiti Kebangsaan Malaysia", "abbr": "UKM",
        "type": "公立", "city": "万宜", "has_policy": "明确",
        "ai_stance": "允许辅助，需声明",
        "framework": "L1无AI/L2规划用途/L3协作/L4全程使用/L5探索（改制自 AI Assessment Scale）",
        "exam_rule": "形成性评估可获批使用AI辅助；总结性评估除明确许可外默认禁止",
        "penalty": "三级递进：①书面警告+学术诚信模块可重交扣分；②该作业甚至整门课判零分+上报；③反复/恶劣=停学或开除",
        "detection": "Turnitin（含 AI Writing 检测）",
        "threshold": "AI 检测 <20% 视为低风险（Level 1）",
        "key_note": "明确AI检测分数为概率性信号，可能误报，不得作为唯一依据；66页指引，全马最详尽之一",
        "source_url": "https://www.ukm.my/kita/wp-content/uploads/Garis-Panduan-GEN-AI-Universiti-Kebangsaan-Malaysia-2025.pdf"
    },
    {
        "id": "USM", "name_zh": "马来西亚理科大学", "name_en": "Universiti Sains Malaysia", "abbr": "USM",
        "type": "公立", "city": "槟城", "has_policy": "部分",
        "ai_stance": "在高校指引框架下审慎、合乎伦理使用，定位「支持而非替代学生角色」",
        "framework": "校层面为通用高教指引；期刊层面 AI 仅可用于提升可读性与语言",
        "exam_rule": "未查到校级单列条款",
        "penalty": "沿用既有学术不端规章",
        "detection": "图书馆提供 Turnitin",
        "threshold": "未查到统一阈值",
        "key_note": "查到的多为期刊出版政策与通用高教指引，未检索到校级《学生GenAI使用政策》原文",
        "source_url": "https://cdae.usm.my/images/DownloadPDF/GARIS%20PANDUAN%20PENGGUNAAN%20TEKNOLOGI%20KECERDASAN%20BUATAN%20GENERATIF%20KBG%20DALAM%20PENGAJARAN%20DAN%20PEMBELAJARAN%20PdP%20PENDIDIKAN%20TINGGI.pdf"
    },
    {
        "id": "UPM", "name_zh": "马来西亚博特拉大学", "name_en": "Universiti Putra Malaysia", "abbr": "UPM",
        "type": "公立", "city": "沙登", "has_policy": "明确",
        "ai_stance": "允许作辅助工具，须正式声明",
        "framework": "研究生论文明确：AI为「辅助写作工具，而非原创思考/分析/研究的替代」",
        "exam_rule": "口头答辩时须当场声明AI使用情况",
        "penalty": "未查到专门罚则，违规按学术规章处理",
        "detection": "未查到统一检测工具说明",
        "threshold": "未查到统一阈值",
        "key_note": "须说明在何处、为何使用AI，区分AI生成内容与学生本人贡献；主要覆盖研究生论文/答辩",
        "source_url": "https://ai.upm.edu.my/guideline.php"
    },
    {
        "id": "UTM", "name_zh": "马来西亚理工大学", "name_en": "Universiti Teknologi Malaysia", "abbr": "UTM",
        "type": "公立", "city": "新山/吉隆坡", "has_policy": "明确",
        "ai_stance": "允许使用，须逐项声明",
        "framework": "Pekeliling Akademik Bil.3/2024（2024-03-27生效），适用本科与研究生课程",
        "exam_rule": "作业须标注工具开发商、名称、版本、访问日期、URL；优先采用持续性评估（演示/汇报/辩论/面试）",
        "penalty": "未声明=可归类为抄袭，按《UTM学术规章》处理",
        "detection": "未查到统一阈值",
        "threshold": "未查到统一阈值",
        "key_note": "AI不得列为共同作者；政策覆盖教学+科研+出版",
        "source_url": "https://cdex-apps.utm.my/files/guidelines/GP-KBG-PP-Terkini-1.pdf"
    },
    {
        "id": "UUM", "name_zh": "马来西亚北方大学", "name_en": "Universiti Utara Malaysia", "abbr": "UUM",
        "type": "公立", "city": "新笃", "has_policy": "未知",
        "ai_stance": "未查到校级统一GenAI成文政策",
        "framework": "未查到",
        "exam_rule": "闭卷在线期末考试：禁止协作、须签诚信声明表",
        "penalty": "未查到",
        "detection": "在线考试场景提及 Turnitin",
        "threshold": "未查到统一阈值",
        "key_note": "政策模糊/未公开，未检索到校级《生成式AI使用政策》明文",
        "source_url": "http://hea.uum.edu.my/images/2020/10/19/GL_TAKE_HOME_4_JULY_2020.pdf"
    },
    {
        "id": "Taylor", "name_zh": "泰莱大学", "name_en": "Taylor's University", "abbr": "Taylor's",
        "type": "私立", "city": "梳邦再也", "has_policy": "部分",
        "ai_stance": "明确鼓励使用 GenAI（含ChatGPT）支持学习",
        "framework": "有学生指引，非完整成文政策；学术诚信定为全校「共同体责任」",
        "exam_rule": "未查到",
        "penalty": "Turnitin AI 高分不会自动触发不端处理，且 AI 分数通常不作为唯一证据",
        "detection": "Turnitin（含 AI Writing Detector）",
        "threshold": "未查到统一阈值",
        "key_note": "态度最开放之一；公开页需校内账号访问",
        "source_url": "https://mytimes.taylors.edu.my/mod/forum/discuss.php?d=104875"
    },
    {
        "id": "Monash", "name_zh": "莫纳什大学马来西亚分校", "name_en": "Monash University Malaysia", "abbr": "Monash MY",
        "type": "海外分校", "city": "双威镇", "has_policy": "明确",
        "ai_stance": "按考核逐项规定（必需/可选/禁止）",
        "framework": "每门考核在Moodle明确AI为「必需/可选/禁止」；允许时须书面声明并保留记录/对话日志",
        "exam_rule": "禁止使用时使用=违反考核条件（学术不端）；论文评审人禁止用GenAI写评审报告",
        "penalty": "未声明AI或违规使用=违反《Student Academic Integrity Procedure》，可至停学/开除",
        "detection": "Turnitin（含 Similarity Report）",
        "threshold": "未查到统一阈值",
        "key_note": "入学须完成必修学术诚信模块；本部自2026-01-01关闭 Turnitin GenAI 检测",
        "source_url": "https://www.monash.edu.my/education-excellence/Education-Policy-and-Procedure/academic-integrity"
    },
    {
        "id": "UCSI", "name_zh": "思特雅大学", "name_en": "UCSI University", "abbr": "UCSI",
        "type": "私立", "city": "吉隆坡", "has_policy": "部分",
        "ai_stance": "论文层面须声明GenAI使用",
        "framework": "论文/研究生层面成文；本科手册以纪律条款为主",
        "exam_rule": "AI不得用于绕过学习或替代原创研究/数据解读/论证；机密或敏感数据不得输入第三方AI工具；考试禁用电子设备",
        "penalty": "重复抄袭：该课程模块自动判不及格，屡犯可至停学/开除",
        "detection": "Turnitin（图书馆提供）",
        "threshold": "未查到统一阈值",
        "key_note": "本科层面未见专门GenAI政策页",
        "source_url": "https://www.ucsiuniversity.edu.my/sites/default/files/thesisguidelines.pdf"
    },
    {
        "id": "APU", "name_zh": "亚太科技大学", "name_en": "Asia Pacific University", "abbr": "APU",
        "type": "私立", "city": "吉隆坡", "has_policy": "未知",
        "ai_stance": "未查到校级成文AI政策",
        "framework": "未查到",
        "exam_rule": "未查到",
        "penalty": "未查到校级GenAI罚则",
        "detection": "所属期刊 JATI（非校级）用 iThenticate",
        "threshold": "JATI期刊（非校级）：总相似≤15%、单一来源≤2%、AI辅助≤20%",
        "key_note": "未查到公开政策；网传「APU AI政策」多为日本立命馆APU，勿混淆",
        "source_url": "https://jati.apu.edu.my/index.php/jati/plagiarismpolicy"
    },
    {
        "id": "INTI", "name_zh": "英迪国际大学", "name_en": "INTI International University", "abbr": "INTI",
        "type": "私立", "city": "汝来", "has_policy": "明确",
        "ai_stance": "鼓励合乎伦理地负责任使用 GenAI",
        "framework": "《Student Guidelines for Using Generative AI (GenAI) in Academic Work V4》+ 声明表",
        "exam_rule": "须参照校方指引并在作业中作 AI 使用声明",
        "penalty": "未查到公开罚则细则，沿用校学术诚信/纪律程序",
        "detection": "未查到统一阈值",
        "threshold": "未查到统一阈值",
        "key_note": "有专门的学生GenAI指引与声明表；指引PDF需校内权限",
        "source_url": "https://canvasguides.newinti.edu.my/genai-academic-integrity"
    },
    {
        "id": "Sunway", "name_zh": "双威大学", "name_en": "Sunway University", "abbr": "Sunway",
        "type": "私立", "city": "双威镇", "has_policy": "未知",
        "ai_stance": "仅查到宣导性文章，非正式政策",
        "framework": "未查到",
        "exam_rule": "未查到",
        "penalty": "未查到",
        "detection": "未查到",
        "threshold": "未查到",
        "key_note": "开放政策库仅含HR/运营类，无学术诚信或AI政策；政策模糊/未公开",
        "source_url": "https://sunwayuniversity.edu.my/about/open-policies"
    },
    {
        "id": "MMU", "name_zh": "多媒体大学", "name_en": "Multimedia University", "abbr": "MMU",
        "type": "私立", "city": "赛城/马六甲", "has_policy": "无",
        "ai_stance": "2023版学术手册无GenAI条款，仅有传统抄袭/学术不端规定",
        "framework": "未查到",
        "exam_rule": "未经授权翻译他人作品、代交等列为抄袭",
        "penalty": "抄袭等学术不端最高可开除（《MMU Students' Discipline Rule》第53条）",
        "detection": "图书馆提供 Turnitin",
        "threshold": "未查到统一阈值",
        "key_note": "截至所查2023版手册无GenAI政策；第三方博客说法未见官方原文佐证，不采信",
        "source_url": "https://creative.mmu.edu.my/wp-content/uploads/2024/03/i2296_Academic-Handbook-MMU-July-2023.pdf"
    },
    {
        "id": "UTAR", "name_zh": "拉曼大学", "name_en": "Universiti Tunku Abdul Rahman", "abbr": "UTAR",
        "type": "私立", "city": "金宝/双溪龙", "has_policy": "部分",
        "ai_stance": "未查到成文使用政策，工具层面已覆盖AI检测",
        "framework": "未查到成文政策",
        "exam_rule": "未查到",
        "penalty": "未查到AI专门罚则",
        "detection": "Turnitin（相似度比对 + AI写作检测）",
        "threshold": "AI写作分数<20%标记为较不可靠",
        "key_note": "工具层面已覆盖AI检测；制度层面成文政策未公开",
        "source_url": "https://library.utar.edu.my/documents/Lib-Announcement-2026/Announcement/Turnitin_202603.pdf"
    },
    {
        "id": "HELP", "name_zh": "HELP大学", "name_en": "HELP University", "abbr": "HELP",
        "type": "私立", "city": "吉隆坡", "has_policy": "明确",
        "ai_stance": "允许审慎使用 ChatGPT/Bing/Bard 等",
        "framework": "本科生手册明文含AI条款+三份配套文件（AI政策与实践指引/高级AI工具使用指南/AI禁用课程清单）",
        "exam_rule": "参照 MQA 2/2023 通函；有AI禁用课程清单",
        "penalty": "三级递进：①强制心理咨询；②该课程不及格+停学1学期+强制咨询；③开除",
        "detection": "Turnitin",
        "threshold": "本科项目可接受相似度上限 ≤ 20%（第4.12条）",
        "key_note": "政策+阈值最明确之一",
        "source_url": "https://university.help.edu.my/wp-content/uploads/2026/02/Undergraduate-Handbook-2026.pdf"
    },
    {
        "id": "Curtin", "name_zh": "科廷大学马来西亚分校", "name_en": "Curtin University Malaysia", "abbr": "Curtin MY",
        "type": "海外分校", "city": "美里", "has_policy": "明确",
        "ai_stance": "支持「教会学生恰当使用GenAI」理念，分课程规定使用范围",
        "framework": "沿用澳洲本部GenAI政策",
        "exam_rule": "分课程规定使用范围",
        "penalty": "未单独查到马来西亚分校罚则，沿用科廷学术诚信程序",
        "detection": "Turnitin Gen-AI writing indicator",
        "threshold": "未查到统一阈值",
        "key_note": "本部自2026-01-01关闭 Turnitin GenAI 检测",
        "source_url": "https://curtin.edu.my/about/learning-and-teaching/office-learning-teaching/academic-integrity/"
    },
    {
        "id": "Swinburne", "name_zh": "斯威本大学砂拉越分校", "name_en": "Swinburne University Sarawak", "abbr": "Swinburne SWK",
        "type": "海外分校", "city": "古晋", "has_policy": "明确",
        "ai_stance": "允许在任课教师指示下使用 GenAI 并须恰当致谢",
        "framework": "学生GenAI使用指引（沿用本部）；提交时须附 GenAI 提示与输出清单作为附录",
        "exam_rule": "未获许可或未声明的AI生成作业=学术不端",
        "penalty": "课程不及格、停学或除名；国际学生若被停学/除名可能影响签证",
        "detection": "Turnitin（Similarity Report）",
        "threshold": "未查到统一阈值",
        "key_note": "有专门学生GenAI指南（需校内Canvas访问）",
        "source_url": "https://www.swinburne.edu.my/current-students/manage-course/exams-results-assessment/academic-integrity/"
    },
    {
        "id": "Nottingham", "name_zh": "诺丁汉大学马来西亚分校", "name_en": "University of Nottingham Malaysia", "abbr": "Nottingham MY",
        "type": "海外分校", "city": "士毛月", "has_policy": "明确",
        "ai_stance": "按考核逐项规定「必需/可选/禁止」",
        "framework": "沿用英国本部政策；允许时须致谢并保留AI对话记录",
        "exam_rule": "禁止使用却使用=「虚假署名（False Authorship）」=学术不端",
        "penalty": "使用违规可构成 False Authorship 学术不端，按校《学术不端规章》处理",
        "detection": "未查到统一阈值",
        "threshold": "未查到统一阈值",
        "key_note": "推荐使用校内登录的 Microsoft Copilot",
        "source_url": "https://www.nottingham.ac.uk/studyingeffectively/ai/ai-assessment.aspx"
    },
]


def build():
    print("=" * 60)
    print("构建整合数据库 knowledge_base.json")
    print("=" * 60)

    kb = {
        "meta": {
            "name": "查重降AI · 马来西亚中国留学生学术写作辅导知识库",
            "version": "0.1.0",
            "built_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "scope": "中国留学生 · 本科 · 马来西亚",
            "positioning": "写作辅导工具（帮学生自己改），非代写工具",
        },
        "universities": UNIVERSITIES,
        "pain_points": norm_list(load("B_痛点数据.json"), "pain_points"),
        "competitors": norm_list(load("D_竞品数据.json"), "competitors"),
        "risk_cases": norm_list(load("D_竞品数据.json"), "risk_cases"),
        "chinglish": norm_list(load("E_chinglish.json"), "patterns"),
        "ai_tells": norm_list(load("E_ai_tells.json"), "patterns"),
        "rewrite_examples": norm_list(load("E_rewrite_examples.json"), "examples"),
        "majors": norm_list(load("E_terms.json"), "majors"),
        # F 类：文献真实性溯源审查（幻觉引用形态库 + 核验指引）
        "citation_checks": load("F_citation_checks.json") or {},
        # G 类：格式规范检查（APA 7 / MLA 9 引用格式 + 文章结构完整性）
        "format_rules": load("H_format_rules.json") or {},
    }

    # 统计
    stats = {
        "universities": len(kb["universities"]),
        "universities_with_policy": sum(1 for u in kb["universities"] if u["has_policy"] == "明确"),
        "pain_points": len(kb["pain_points"]),
        "competitors": len(kb["competitors"]),
        "chinglish": len(kb["chinglish"]),
        "ai_tells": len(kb["ai_tells"]),
        "rewrite_examples": len(kb["rewrite_examples"]),
        "majors": len(kb["majors"]),
        "citation_patterns": len((kb.get("citation_checks") or {}).get("hallucination_patterns", [])),
        "format_styles": len((kb.get("format_rules") or {}).get("styles", [])),
        "format_structure_sections": len(
            ((kb.get("format_rules") or {}).get("structure") or {}).get("core_sections", [])),
    }
    kb["meta"]["stats"] = stats

    out = os.path.join(DB, "knowledge_base.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(kb, f, ensure_ascii=False, indent=2)

    # 同步一份到 web/assets 供前端 fetch
    web_out = os.path.join(BASE, "web", "assets", "knowledge_base.json")
    with open(web_out, "w", encoding="utf-8") as f:
        json.dump(kb, f, ensure_ascii=False, indent=2)

    print(f"\n[OK] 写入 {out}")
    print(f"[OK] 同步 {web_out}")
    print("\n统计:")
    for k, v in stats.items():
        print(f"  {k:28s} {v}")
    print("=" * 60)
    return True


if __name__ == "__main__":
    build()
