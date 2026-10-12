"""抓取公版英文语料（Project Gutenberg, public domain）并切分为检测器可用的样本段。

用途：为检测器提供"真人写作"对照组，用于验证漏报率/误报率。
合规说明：全部来自 Project Gutenberg（公版，无版权限制），仅本地使用，不对外分发。
"""
import urllib.request
import socket
import re
import os
import json

socket.setdefaulttimeout(30)

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "human")
os.makedirs(OUT_DIR, exist_ok=True)

BOOKS = [
    ("darwin_origin", 1228, "On the Origin of Species", "Charles Darwin", "科学论述"),
    ("descartes_method", 59, "Discourse on the Method", "Rene Descartes", "哲学论证"),
    ("darwin_voyage", 944, "The Voyage of the Beagle", "Charles Darwin", "科学观察"),
    ("mill_liberty", 34901, "On Liberty", "John Stuart Mill", "社会论述"),
    ("machiavelli_prince", 1232, "The Prince", "Niccolo Machiavelli", "政治论述"),
    ("hume_understanding", 9662, "An Enquiry Concerning Human Understanding", "David Hume", "哲学论证"),
]

UA = {"User-Agent": "Mozilla/5.0 (local research; contact: local)"}


def fetch(gid):
    urls = [
        f"https://www.gutenberg.org/cache/epub/{gid}/pg{gid}.txt",
        f"https://www.gutenberg.org/files/{gid}/{gid}-0.txt",
    ]
    last = None
    for u in urls:
        try:
            req = urllib.request.Request(u, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:
            last = e
    raise last


def strip_gutenberg_boilerplate(text):
    """去掉 Gutenberg 页眉页脚（*** START/END OF ... ***之间的才是正文）"""
    s = re.search(r"\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG.*?\*\*\*", text, re.I | re.S)
    e = re.search(r"\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG.*?\*\*\*", text, re.I | re.S)
    if s:
        text = text[s.end():]
    if e:
        text = text[:e.start()]
    return text


def clean(text):
    """清掉 Gutenberg 常见的排版噪声：页码、脚注标记、全大写的章节标题等"""
    lines = []
    for ln in text.split("\n"):
        s = ln.strip()
        if not s:
            lines.append("")
            continue
        # 跳过纯页码、纯符号行
        if re.fullmatch(r"[\d\W_]+", s):
            continue
        # 跳过全大写短行（章节标题）
        if len(s) < 60 and s.isupper():
            continue
        # 去掉行内的 [123] 脚注标记
        s = re.sub(r"\[\d{1,4}\]", "", s)
        # 去掉多余空格
        s = re.sub(r"\s+", " ", s)
        lines.append(s)
    return "\n".join(lines)


def paragraphs(text):
    """按空行切段，合并被硬换行拆开的段落"""
    raw = re.split(r"\n\s*\n", text)
    out = []
    for p in raw:
        p = " ".join(p.split())
        if len(p) < 80:
            continue
        # 排除疑似目录/索引行（大量点号或短横）
        if p.count(".") > len(p) * 0.15:
            continue
        out.append(p)
    return out


def split_long(p, min_w=180, max_w=420):
    """把过长段落按句子边界切成 180-420 词的片段"""
    words = p.split()
    if len(words) <= max_w:
        return [p] if len(words) >= min_w else []
    # 按句子切
    sents = re.split(r"(?<=[.!?])\s+", p)
    out, cur = [], ""
    for s in sents:
        if len((cur + " " + s).split()) > max_w:
            if len(cur.split()) >= min_w:
                out.append(cur.strip())
            cur = s
        else:
            cur = (cur + " " + s).strip()
    if len(cur.split()) >= min_w:
        out.append(cur.strip())
    return out


def main():
    manifest = []
    total_segs = 0
    for key, gid, title, author, genre in BOOKS:
        try:
            raw = fetch(gid)
        except Exception as e:
            print(f"  下载失败 {key}: {type(e).__name__}: {e}")
            continue
        body = clean(strip_gutenberg_boilerplate(raw))
        paras = paragraphs(body)
        segs = []
        for p in paras:
            for s in split_long(p):
                segs.append(s)
        # 每本书取前 12 段（避免单本书占比过大）
        segs = segs[:12]
        for i, s in enumerate(segs):
            fn = f"{key}_{i+1:02d}.txt"
            with open(os.path.join(OUT_DIR, fn), "w", encoding="utf-8") as f:
                f.write(s)
        total_segs += len(segs)
        manifest.append({
            "key": key, "gutenberg_id": gid, "title": title,
            "author": author, "genre": genre, "segments": len(segs),
            "license": "Public Domain (Project Gutenberg)",
        })
        print(f"  OK {key}: {len(segs)} 段  ({title[:40]})")

    with open(os.path.join(OUT_DIR, "_manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print(f"\n合计 {total_segs} 段，来自 {len(manifest)} 本公版书")


if __name__ == "__main__":
    print("=== 抓取 Project Gutenberg 公版语料 ===\n")
    main()
