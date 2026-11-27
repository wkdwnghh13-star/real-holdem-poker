#!/usr/bin/env python3
"""www/img/dealers/*.jpg (200x200) → www/js/dealers.js (base64 data URI) 재생성.
   딜러를 추가하려면 www/img/dealers/dealer_<id>.jpg 를 넣고 META 에 항목을 추가한 뒤 실행:
     python3 tools/build_dealers.py && python3 tools/bundle.py
"""
import base64, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "www", "img", "dealers")
OUT = os.path.join(ROOT, "www", "js", "dealers.js")

# (파일 id, 이름, 의상 설명) — 이 순서대로 랜덤 풀에 들어간다
META = [
    ("hoodie", "지수", "캐주얼 후드"),
    ("suit", "서연", "블랙 베스트"),
    ("student", "하린", "프레피 교복"),
    ("cocktail", "유나", "버건디 드레스"),
    ("cardigan", "채원", "아이보리 니트"),
    ("rider", "다인", "레더 라이더"),
    ("tennis", "수아", "테니스 룩"),
    ("trench", "예린", "베이지 트렌치"),
    ("turtleneck", "나윤", "블랙 터틀넥"),
    ("hanbok", "지아", "퓨전 한복"),
]

HEAD = """/* =============================================================================
 *  REAL HOLDEM POKER — 여성 딜러 %d종 (200x200 JPEG · base64 내장)
 *  단일 HTML 번들에서도 100%% 표시되도록 data URI 로 보관한다.
 *  생성: python3 tools/build_dealers.py
 * ========================================================================== */
(function (global) {
  'use strict';

  const LIST = ["""

TAIL = """  ];

  const Dealers = {
    list: LIST,
    byId(id) {
      for (let i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
      return LIST[0];
    },
    /* 방에 들어올 때마다 10종 중 랜덤 1명 (직전 딜러는 피한다) */
    random(excludeId) {
      const pool = LIST.filter(function (d) { return d.id !== excludeId; });
      return pool[Math.floor(Math.random() * pool.length)] || LIST[0];
    },
    preload() {
      LIST.forEach(function (d) { const im = new global.Image(); im.src = d.src; });
    }
  };

  global.Dealers = Dealers;
})(window);
"""


def main():
    rows = []
    total = 0
    for i, (pid, name, outfit) in enumerate(META):
        path = os.path.join(IMG, "dealer_%s.jpg" % pid)
        raw = open(path, "rb").read()
        total += len(raw)
        b64 = base64.b64encode(raw).decode()
        rows.append("    { id: '%s', name: '%s', outfit: '%s', src: 'data:image/jpeg;base64,%s' }%s"
                    % (pid, name, outfit, b64, "," if i < len(META) - 1 else ""))
    js = HEAD % len(META) + "\n" + "\n".join(rows) + "\n" + TAIL
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(js)
    print("dealers.js: %d종, 이미지 %.1fKB, 파일 %.1fKB" % (len(META), total / 1024, os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
