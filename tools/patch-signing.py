#!/usr/bin/env python3
"""
patch-signing.py — Capacitor가 생성한 android/app/build.gradle 에
릴리스 서명 설정(signingConfigs.release)을 자동 주입한다.

사용법: python3 tools/patch-signing.py android/app/build.gradle
환경변수(빌드 시): HM_STORE_PASSWORD / HM_KEY_ALIAS / HM_KEY_PASSWORD
"""
import re
import sys

SIGNING_BLOCK = """
    signingConfigs {
        release {
            storeFile file("holdem.keystore")
            storePassword System.getenv("HM_STORE_PASSWORD") ?: "holdem123"
            keyAlias System.getenv("HM_KEY_ALIAS") ?: "holdem"
            keyPassword System.getenv("HM_KEY_PASSWORD") ?: "holdem123"
        }
    }
"""


def main(path: str) -> int:
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()

    if "signingConfigs" not in src:
        m = re.search(r"android\s*\{", src)
        if not m:
            print("ERROR: android { } 블록을 찾지 못했습니다.")
            return 1
        src = src[: m.end()] + SIGNING_BLOCK + src[m.end():]

    if "signingConfig signingConfigs.release" not in src:
        bt = re.search(r"buildTypes\s*\{", src)
        if bt:
            rel = re.search(r"release\s*\{", src[bt.end():])
            if rel:
                insert_at = bt.end() + rel.end()
                src = src[:insert_at] + "\n            signingConfig signingConfigs.release" + src[insert_at:]
            else:
                print("WARN: buildTypes 안에 release 블록이 없습니다.")
        else:
            print("WARN: buildTypes 블록이 없습니다.")

    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print("OK: signing config patched ->", path)
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python3 tools/patch-signing.py <android/app/build.gradle>")
        sys.exit(1)
    sys.exit(main(sys.argv[1]))
