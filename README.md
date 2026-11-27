# 🃏 REAL HOLDEM POKER — 리얼 홀덤 포커

실사풍 텍사스 홀덤(No-Limit Hold'em) 모바일 게임. **HTML5 + Canvas/CSS 3D**, **Capacitor Android**, **GitHub Actions 원클릭 APK/AAB 빌드**.
세로 9:16 모바일과 갤럭시 Z Fold7(펼친 화면)까지 대응.

```
projects/holdem-poker/
├─ www/                    # 게임 본체 (웹 자산)
│  ├─ index.html
│  ├─ css/style.css        # 실사풍 카지노 UI · 카드 · 칩 · 이펙트 · 스킨
│  ├─ js/
│  │  ├─ poker-engine.js   # 홀덤 엔진 (7장 최고5장, 사이드팟, 스플릿팟)
│  │  ├─ ai.js             # 4등급 AI (뉴비/초보/고수/프로) + 익스플로잇
│  │  ├─ cards.js          # 카드/칩 그래픽 (페이퍼 질감, 코트 카드, 스킨)
│  │  ├─ effects.js        # 캔버스 파티클 · 족보 배너 · 칩 샤워
│  │  ├─ audio.js          # WebAudio 합성 사운드 + 로파이 BGM + 진동
│  │  ├─ dealers.js        # 여성 딜러 10종 (200×200 JPEG · base64 내장)
│  │  ├─ progress.js       # 뱅크롤 · VIP · 스킨 · 칭호 · 통계
│  │  ├─ game.js           # 게임 러너 (턴 진행 · AI 템포 · 휴먼 대기)
│  │  ├─ net.js            # 전송 계층 (BroadcastChannel / PeerJS / WebSocket)
│  │  ├─ mp.js             # 멀티플레이 세션 (호스트 권한 모델)
│  │  ├─ table.js          # 스냅샷 렌더러 (좌석 · 카드 플립 · 스퀴즈)
│  │  ├─ tutorial.js       # 초보자 튜토리얼 (스킵 가능)
│  │  └─ main.js           # 앱 컨트롤러 (로비 · GM · 설정)
│  ├─ vendor/peerjs.min.js # WebRTC P2P
│  └─ ...
├─ server/relay.js         # 의존성 없는 초경량 WebSocket 릴레이
├─ tools/                  # E2E/엔진 검증 스크립트(bundle.py = 단일 HTML 번들), 서명 패치
├─ .github/workflows/build-android.yml
├─ capacitor.config.json   # appId com.juho.holdempoker
└─ package.json
```

---

## 1. 로컬에서 바로 실행

```bash
npm run serve          # python3 -m http.server 8080 --directory www
# 브라우저에서 http://localhost:8080

python3 tools/bundle.py   # www/ → downloads/holdem_poker_play.html (단일 HTML, 이미지도 data URI)
```

> Capacitor 앱은 `www/` 를 그대로 번들하므로 별도 빌드 과정이 없다.

---

## 2. 게임 내용

### 테이블 & 비주얼
- 짙은 마호가니 레일 + 리치 에메랄드 펠트(노이즈 텍스처) + 스포트라이트/비네트
- **6인 / 헤즈업 / 9인** 테이블, 실사풍 카드(페이퍼 질감·핍 배치·코트 카드·금박 프레임)
- **3D 플립 · 딜링 슬라이드 · 스퀴즈(모서리 쪼아보기) · 탭 오픈**
- 칩 5종($1/$5/$25/$100/$500) 스택, 팟 적립, 승자에게 칩 샤워
- 딜러 버튼 `D`, `SB`/`BB`, 액션 배지(`CHECK`/`CALL`/`RAISE`/`FOLD`/`ALL-IN`)
- **테이블 상단 중앙은 여성 딜러 자리** — 예쁜 딜러 10종(후드·블랙 베스트·교복·칵테일 드레스·니트·라이더·테니스·트렌치·터틀넥·퓨전 한복) 중 **방에 들어올 때마다 랜덤 1명**이 이름표(`DEALER 지수`)와 함께 등장 (200×200 JPEG base64 내장)
- 내 최고 족보 실시간 표시 (`원 페어 · 에이스`, `플러시 드로우` …)
- 족보 완성 시: 5장 황금 글로우 + 대형 족보 배너 + 별/금화 파티클 + 팟 칩 폭포
- WebAudio 합성 사운드(딜링/칩/체크/올인/승리/팬파레) + 음소거
- **BGM 3스타일** — `lofi`(기본, 78 BPM 로즈 피아노 + 서브 베이스 + 부드러운 킥/브러시 스네어 + 바이닐 노이즈) · `synth` · `bossa`. `Sound.setBgmStyle('lofi'|'synth'|'bossa')` 로 교체, `Progress.data.bgmStyle` 에 저장
- **진동 피드백** — 내 턴 `35ms`, 베팅/레이즈/올인 `[25,30,45]`, 족보 완성·쇼다운 승리 `[40,40,80]` (게임 메뉴에서 끄기)`

### 엔진 (정확성 검증됨)
- 프리플랍 → 플랍 → 턴 → 리버 → 쇼다운, 7장 중 최고 5장 판정
- 로열 플러시 ~ 하이카드, 키커 비교, 휠(A-2-3-4-5) 스트레이트
- **사이드팟 · 스플릿팟 · 언콜드 벳 반환 · 홀수 칩 처리**
- 헤즈업 규칙(SB=딜러, 프리플랍 SB 선행), BB 옵션, 최소 레이즈/재오픈 규칙

`tools/engine_test.py` — 26개 항목 통과 (족보/키커/사이드팟/400핸드 칩 보존/AI 행동 유효성 889회)

### AI 4등급
| 등급 | 성향 | 특징 |
|---|---|---|
| 뉴비 | 루즈-패시브 (VPIP ~65%) | 7-2o도 콜, 팟 오즈 무시, 블러프 거의 없음 |
| 초보 | 기본 핸드만 (VPIP ~40%) | 맞으면 콜/소액 벳, 포지션·드로우 계산 미흡 |
| 고수 | 포지션 레인지 · 팟 오즈 | 몬테카를로 에퀴티, 세미블러프, 체크레이즈 |
| 프로 | TAG/LAG + 익스플로잇 | 내 VPIP/PFR/폴드율 추적, 트랩, 폴라라이즈드 블러프, SPR 올인 압박 |

- 방별 등급 구성: 뉴비방 / 초보방 / 고수방 / 프로방 / 혼합방
- **상대 AI 수준 직접 선택**: 방 기본 / 뉴비 / 초보 / 고수 / 프로 / 혼합
- AI 생각 시간 0.4~1.2초, 게임 속도(보통/빠름) 토글

### 성장 · 보상
- 뱅크롤 localStorage 저장, 파산 시 리필
- **VIP 등급**: 브론즈 → 실버(7.5만) → 골드(20만) → VIP 다이아(50만) — 최고 뱅크롤 기준
  - 고수방·혼합방·토너먼트(실버), 프로방(골드), 하이롤러 VIP 500/1K(다이아) 해금
- **스킨**: 카드 뒷면(클래식/블랙골드/네온로열), 펠트(에메랄드/크림슨 VIP/미드나잇 골드) — 칩 구매 후 장착
- **칭호**: WSOP 루키(토너먼트 첫 우승), 블러핑 마스터(폴드승 30), 홀덤 황제(토너먼트 3회 우승), 그라인더(100핸드), 테이블 샤크(뱅크롤 20만)
- **토너먼트(Sit & Go)**: 6인 · 5,000칩 · 6핸드마다 블라인드 상승 · 우승 상금 + 트로피

---

## 3. 친구와 함께 (멀티플레이)

로비 → **친구와 함께** → `방 만들기` 로 4자리 코드 생성 → 친구가 코드 입력으로 참가.

- **하이브리드 연결**: 같은 기기(탭)는 `BroadcastChannel`, 인터넷은 `PeerJS(WebRTC)`, 사내망 등 P2P가 막히면 `서버/relay.js` WebSocket 릴레이
- **호스트 권한 모델**: 호스트가 덱 셔플·홀카드 분배·턴 진행·쇼다운 판정을 전담
- **프라이버시**: 각 클라이언트에는 자기 홀카드만 전송. 남의 카드는 뒷면(쇼다운에서만 공개)
- **빈 자리 AI 채우기**: 뉴비/초보/고수/프로/혼합 선택 가능
- 참가자 연결이 끊기면 그 좌석은 AI가 이어받음

```bash
npm run relay                    # ws://localhost:8080
PORT=9000 npm run relay          # 포트 변경
# 로비 → 릴레이 → ws://내서버:9000
```
`/health` 로 상태 확인. 방·참가자 수는 메모리에서만 관리(디스크 저장 없음).

---

## 4. 운영자(GM) 모드 — PIN `7073`

상단 `GM` 버튼 → PIN 입력(기본 `7073`, 패널에서 변경 가능). **싱글/호스트에서만 동작**하고 친구 화면에는 노출되지 않음.

- **상대 홀카드 엿보기** — 모든 AI/참가자 카드 실시간 공개(청록 테두리) + **각 좌석 카드 위에 현재 보드 기준 실시간 족보 배지**(원페어·투페어·트리플·스트레이트·플러시…)
- **AUTO 대리 플레이** — 내 턴을 AI가 대신 플레이. **등급 선택(뉴비/초보/고수/프로)**
- **칩 즉시 지급** +10,000 / +100,000 / 직접 입력
- **AI 강제 폴드 / 강제 블러프** (다음 행동 1회)
- **게임 속도** 조절, **PIN 변경**

---

## 5. 턴 제한시간

- 내 턴 **20초**, 액션 바 위에 남은 시간 프로그레스 바 + 숫자(`20s`→`0s`) 표시
- 0초가 되면 **자동으로 체크(가능 시) 또는 폴드** — 끊긴 판이 멈추지 않음
- 설정: `GameRunner({ turnSeconds: 20 })` (싱글/친구방 공통)

---

## 6. 베팅 커스터마이즈

- **블라인드 프리셋**: 방 기본 / 5-10 / 25-50 / 100-200 / 500-1K (로비)
- **퀵 베팅 버튼**: 최소 · 1/3팟 · 1/2팟 · 3/4팟 · 팟 · 2배팟 · 올인 중 최대 5개 선택 (로비 + 게임 메뉴)

---

## 6. Android 빌드 (GitHub Actions 원클릭)

저장소: <https://github.com/wkdwnghh13-star/real-holdem-poker> (비공개)

**최신 빌드 바로 받기:** <https://github.com/wkdwnghh13-star/real-holdem-poker/releases>
- `real-holdem-poker-vX-debug.apk` — 휴대폰에 받아서 바로 설치(테스트용, 안드로이드 5.1+)
- `real-holdem-poker-vX-release.aab` — 스토어 업로드용

1. **Actions → Build Android APK & AAB → Run workflow** (산출물 선택: `both` / `apk` / `aab`)
2. 실행이 끝나면 그 실행 화면 아래 **Artifacts** 에서 `real-holdem-apk` / `real-holdem-aab` 다운로드 (보관 30일)
3. `v1.0.0` 같은 **태그를 push** 하면 같은 빌드가 **Releases** 에도 첨부되어 만료 없이 받을 수 있음

```bash
git tag v1.0.0 && git push origin v1.0.0
```

- `main` 브랜치 push / `v*` 태그 push 로도 자동 실행됩니다.
- APK = 테스트 설치용(디버그 서명), AAB = 스토어 업로드용(릴리스 서명).
- 서명: 저장소 시크릿 `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` 를 넣으면 그 키로 서명. 없으면 빌드마다 임시 키(`holdem123`)를 새로 만들어 서명하므로 **Play 스토어 제출 후 업데이트에는 쓸 수 없습니다**.
  - 키스토어 만들기: `keytool -genkeypair -v -keystore holdem-upload.keystore -alias holdem -keyalg RSA -keysize 2048 -validity 10000`
  - 시크릿 값: `base64 -w0 holdem-upload.keystore` 결과를 `ANDROID_KEYSTORE_BASE64` 에, 나머지 3개는 생성할 때 쓴 비밀번호/별칭.
- 로컬 빌드: `npm i && npx cap add android && npm run android:debug`
- 저장소에는 `art/`(딜러 원본 19MB)와 `screenshots/`(검증 캡처)를 올리지 않습니다. `www/js/dealers.js`·`www/img/dealers/` 로 이미 변환되어 있어 실행에는 영향이 없고, 원본에서 다시 만들려면 `python3 tools/build_dealers.py`.

---

## 7. 검증 스크립트

```bash
python3 tools/engine_test.py   # 엔진 정확성 26항목
python3 tools/e2e.py           # 실플레이 E2E + 스크린샷(screenshots/)
python3 tools/smoke.py         # 콘솔 에러 0 확인
```
