#!/usr/bin/env python3
"""www/ → 단일 HTML 번들 (CSS/JS 인라인, 이미지도 data URI 로 이미 내장)"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WWW = os.path.join(ROOT, "www")
OUT = os.path.abspath(os.path.join(ROOT, "..", "..", "downloads", "holdem_poker_play.html"))

def read(rel):
    with open(os.path.join(WWW, rel), encoding="utf-8") as f:
        return f.read()

html = read("index.html")

# CSS 인라인
def css_sub(m):
    return "<style>\n" + read(m.group(1)) + "\n</style>"
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css_sub, html)

# JS 인라인
def js_sub(m):
    code = read(m.group(1))
    if "</script" in code:
        raise SystemExit("script src contains </script: " + m.group(1))
    return "<script>\n" + code + "\n</script>"
html = re.sub(r'<script src="([^"]+)"></script>', js_sub, html)

assert "<script src=" not in html and '<link rel="stylesheet"' not in html, "inline 실패"

if len(sys.argv) > 1:
    OUT = sys.argv[1]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)
print("bundled:", OUT, os.path.getsize(OUT) // 1024, "KB")
