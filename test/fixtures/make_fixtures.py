#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成 E2E 测试用的 .docx 样本（**合成文本，不含任何真实学生作业**）

为什么需要这个脚本：
  `test/cdp_realdocx.js` 要验证「拖入 .docx → 解析 → 判分」整条链路，
  需要一份「真人写的」和一份「AI 写的」.docx 作为输入。

  ⚠️ 隐私红线：早期版本直接用了用户的真实作业副本（student_human.docx /
  student_ai.docx）。开源时那两份文件**必须移除**——它们是他人的课程作业。
  这里改用**合成文本**，不引用任何真实作业，同时保证测试仍能跑通。

  两份样本的文体是刻意设计的：
    · sample_human：第一人称、有犹豫与自我质疑、长短句交替、含具体细节
    · sample_ai   ：句式均匀、套话密集、无第一人称、段落等长
  这样它们才能稳定地落在检测器的「低风险」与「高风险」两端。

用法：
  python test/fixtures/make_fixtures.py

为什么手写 docx 而不用 python-docx：
  本机未安装该库，且一次性的 fixture 生成不值得引入依赖。
  .docx 本质是 zip + XML，最小结构只需 3 个文件。
"""
import os
import zipfile


# ---------------------------------------------------------------------------
# 合成语料
# ---------------------------------------------------------------------------

HUMAN_TEXT = """The thing that surprised me most about working through the accounting literature was how much disagreement there still is about something as basic as what earnings quality actually means. Dechow and Dichev (2002) treat it as the extent to which accruals map onto realised cash flows, but I am not convinced that this captures everything practitioners worry about when they use the phrase. When I looked at the disclosure notes in the annual reports of three Malaysian listed firms, the accrual to cash flow gap was small in all three, yet two of them had been criticised publicly for aggressive revenue recognition in the same period.

That said, the measure clearly has value. It is simple to compute, it relies on data that is already in the statements, and it seems to predict restatements reasonably well in the studies I read. Ball and Shivakumar (2006) extend the idea by bringing in asymmetric timeliness, which I found harder to follow, but which does address one of the obvious weaknesses of the original model. The original treats gains and losses as symmetric, and in practice auditors push back on losses much harder than they push back on gains.

What I take from all this is that no single number is going to tell you whether a set of accounts is trustworthy. The literature gives you several imperfect signals, and the judgement about which one matters in a particular case is still down to the analyst. That is an uncomfortable conclusion for anyone hoping for a formula, but it is the one the evidence supports."""

AI_TEXT = """In recent years, the rapid advancement of artificial intelligence has fundamentally transformed numerous industries and sectors. This paper aims to explore the multifaceted implications of machine learning algorithms in healthcare diagnostics. It is important to note that while these technologies offer significant potential for improving patient outcomes, they also raise important ethical considerations regarding data privacy and algorithmic bias. The analysis demonstrates that successful implementation requires not only technical expertise but also robust governance frameworks. Moreover, the integration of AI systems into clinical workflows necessitates careful attention to human factors and user acceptance. Ultimately, the key is to strike a balance between innovation and accountability. This research contributes to a growing body of scholarship on responsible AI deployment. Drawing on case studies from three healthcare systems, we identify several critical success factors. These include interdisciplinary collaboration, transparent validation protocols, and continuous monitoring of system performance. The findings suggest that regulatory frameworks must evolve to accommodate rapidly changing technological capabilities. Future work should examine the long-term consequences of algorithmic decision-making in clinical contexts."""


# ---------------------------------------------------------------------------
# 最小 .docx 结构（zip + XML）
# ---------------------------------------------------------------------------

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""


def esc(s):
    """XML 转义（& 必须最先替换）"""
    return (s.replace("&", "&amp;")
             .replace("<", "&lt;")
             .replace(">", "&gt;")
             .replace('"', "&quot;"))


def document_xml(text):
    """每个空行分段 → 一个 <w:p>；段内换行合成一段"""
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    body = "".join(
        "<w:p><w:r><w:t xml:space=\"preserve\">%s</w:t></w:r></w:p>" % esc(p)
        for p in paras
    )
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body>%s</w:body></w:document>" % body)


def write_docx(path, text):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document_xml(text))


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    for name, txt in (("sample_human.docx", HUMAN_TEXT), ("sample_ai.docx", AI_TEXT)):
        out = os.path.join(here, name)
        write_docx(out, txt)
        print("[OK] %s  (%d 词)" % (name, len(txt.split())))
