#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
从 .docx 提取纯正文（批量转 .txt，供语料入库 / 快速预览）

为什么单独写一个而不是用现成库：
  · 本机没装 python-docx，且不想为一次性任务引入依赖
  · 关键在于**彻底**剥掉所有 XML 标签，只留 <w:t> 文本
  · 初版踩坑：按 </w:p> 切分会把 <w:tblPr> 等表格属性留在正文里
    （因为表格属性段里没有 </w:p>，会粘到下一个段落上），
    导致"字数虚高 5 倍 + 特征被污染"。
    正确做法：先把所有非 <w:t> 标签全部删除，再按段落边界重组。

用法：
  python extract_docx_text.py <输出目录> <docx1> [docx2 ...]

⚠️ 隐私提醒：如果你要处理的是**他人的作业或论文**，请勿把提取结果提交到
   公开仓库。本仓库的 `test/corpus/student/` 已被 .gitignore 排除，正是为此。
"""
import sys
import os
import re
import json
import hashlib
import zipfile
import io


def unescape(s):
    return (s.replace("&lt;", "\x00LT\x00")     # 先保护实体，避免与标签剥离混淆
             .replace("&gt;", "\x00GT\x00")
             .replace("&quot;", '"')
             .replace("&apos;", "'")
             .replace("&amp;", "&")
             .replace("\x00LT\x00", "<")
             .replace("\x00GT\x00", ">"))


def docx_text(path):
    raw = open(path, "rb").read()
    if raw[:2] != b"PK":
        # 有文件被存成了 .docx 扩展名的纯文本
        for enc in ("utf-8", "utf-16", "gbk"):
            try:
                return raw.decode(enc), "text/" + enc
            except Exception:
                continue
        return raw.decode("utf-8", "ignore"), "text/fallback"

    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")

    # 1) 段落与换行边界先标记出来
    xml = re.sub(r"<w:br\s*/>", "\n", xml)
    xml = re.sub(r"<w:tab\s*/>", " ", xml)
    xml = xml.replace("</w:p>", "\u0001")        # 段落边界

    # 2) 只抽取 <w:t> 文本；所有其他标签（含表格属性）彻底丢弃
    #    ⚠️ 踩坑：不能用 <w:t[^>]*> —— 它会匹配到 <w:tblPr> / <w:tblStyle>
    #       这类以 <w:t 开头的表格标签（[^>]* 吃掉了 "blPr"）。
    #       一旦错配，.*? 会一路吞到下一个真正的 </w:t>，把整段 XML 当正文读进来。
    #       必须要求标签名紧接 > 或空白：<w:t> 或 <w:t ...>
    TAG_TEXT = r"<w:t(?:\s[^>]*)?>(.*?)</w:t>"

    # 3) 重建：按段落标记把文本片段重新组织
    out_lines = []
    cur = []
    for m in re.finditer(TAG_TEXT + r"|(\u0001)", xml, re.S):
        if m.group(2):                            # 段落标记
            if cur:
                out_lines.append(unescape("".join(cur)).strip())
                cur = []
        else:
            cur.append(m.group(1))
    if cur:
        out_lines.append(unescape("".join(cur)).strip())

    lines = [l for l in out_lines if l]
    return "\n".join(lines), "docx"


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)

    manifest = []
    for path in sys.argv[2:]:
        name = os.path.basename(path)
        text, kind = docx_text(path)
        words = len(re.findall(r"[A-Za-z][A-Za-z'-]*", text))
        han = len(re.findall(r"[\u4e00-\u9fff]", text))
        resid = len(re.findall(r"<w:|</w:|w:val|tblPr|tblGrid", text))
        safe = re.sub(r"[^\w.\-]", "_", name.rsplit(".", 1)[0])[:40] + ".txt"
        with open(os.path.join(outdir, safe), "w", encoding="utf-8") as fh:
            fh.write(text)
        manifest.append({
            "source": name, "safe": safe, "kind": kind,
            "chars": len(text), "words": words, "han": han,
            "xml_residue": resid,
            "sha1": hashlib.sha1(text.encode()).hexdigest()[:12],
        })
        flag = "XML残留!" if resid else "干净"
        print(f"{name[:40]:42s} [{kind:10s}] {len(text):6d}字符 {words:5d}词 {han:4d}汉字  {flag}")

    with open(os.path.join(outdir, "_manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
    print(f"\n写入 {outdir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
