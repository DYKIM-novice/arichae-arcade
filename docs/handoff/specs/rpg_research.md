# 아리채 오락실 「회귀 RPG」 사전 탐구 리포트

(조사와 분석만 했고 코드나 파일은 만들지 않았습니다. 출처가 있는 사실은 출처를 달았고, 출처 표시가 없는 설계 제안은 제 의견입니다.)

---

## (a) 공통점: 이런 게임이 사랑받고 계속 플레이되는 이유

1. **죽어도 남는 것이 있다.** Vampire Survivors는 판마다 골드를 모으고 판 사이에 영구 강화를 사기 때문에 "버린 판"이 없습니다. Dead Cells는 셀로 무기 설계도와 아이템 등급을 영구 해금하고, 죽으면 아직 맡기지 않은 셀만 잃습니다. Rogue Legacy는 상속자에게 금화와 업그레이드를 물려줍니다. 이 "죽음 = 투자" 구조가 핵심 엔진입니다.
2. **죽음이 이야기를 진행시킨다 (Hades).** 죽으면 집으로 돌아가고, 집의 캐릭터들이 방금 그 판에 대해 새로운 대사를 합니다. 리뷰어는 "죽음이 두렵다가 오히려 기다려졌다"고 썼습니다. 관계 쌓기와 성장도 같은 행동(넥타 선물 → 기념품 획득)으로 묶여 있습니다.
3. **아깝게 졌다 (near-miss).** Vampire Survivors는 "조금만 더 가면 레벨업, 상자, 업적"이라는 감각을 슬롯머신처럼 이용합니다. Balatro는 점수 공식이 다 보이게 해서 "왜 졌는지 아니까 한 판 더"를 만듭니다.
4. **파워 판타지와 쉬운 조작.** Vampire Survivors는 이동만 하면 공격은 자동입니다. Megabonk는 "말도 안 되게 강해지는" 맛으로 1인 개발작인데도 동시접속 11.7만 명을 찍었습니다.
5. **짧은 판, 매번 다른 판.** Brotato 모바일 리뷰의 핵심 표현은 "10분 때우기 좋다", "진짜 마지막 한 판"이었습니다. 반대로 맵이 하나뿐이라 반복된다는 불만도 같이 나왔습니다.
6. **선택의 연속.** Slay the Spire의 카드 3장 중 1장 고르기, Balatro의 상점이나 블라인드 스킵처럼 작은 결정이 계속 이어집니다.
7. **환생(prestige)의 사다리 쾌감.** 방치형 게임은 일부러 리셋하는 대신 큰 배율을 받습니다. AdVenture Capitalist는 누적 수입의 제곱근, Cookie Clicker는 세제곱근 공식을 써서 "배율 2배를 받으려면 3~8배를 더 벌어야 하는" 체감 곡선을 만듭니다.
8. **한국 시장 근거.** 한국에서 '키우기' 방치형 RPG가 매출 최상위권입니다. 메이플 키우기(출시 45일 만에 1억 달러), 갓깨비 키우기(한국 전체 매출 8위), 버섯커 키우기, 스톤에이지 키우기(2026.3 출시 후 앱스토어 1위)가 있습니다. 공통점은 짧은 조작, 큰 숫자, 친숙한 IP나 캐릭터입니다.

## (b) 회귀 판타지의 핵심 매력

- **"이번엔 제대로 하겠다".** 한경 칼럼은 회빙환이 인기 있는 이유를 '노력의 배신'에 대한 답으로 봅니다. 독자는 초능력보다 "다시 한 번의 기회, 그리고 제대로 하면 보상받는다는 확신"을 원한다는 분석입니다.
- **설명이 필요 없는 약속.** 경향 기사에 따르면 회귀는 이미 장르라 부르기 어려울 만큼 공유된 기본 설정입니다. "눈을 떠보니 과거였다" 한 줄이면 다 통합니다. 최근에는 여러 번 반복하는 '루프형'도 늘었습니다.
- **게임으로 옮기면 네 가지 맛이 됩니다.**
  1. **지식이 힘이다.** Outer Wilds는 아이템도 경험치도 없이 "아는 것"만 다음 루프로 가져갑니다. 열쇠가 아니라 여는 법을 기억하는 방식입니다.
  2. **남들은 모르는 걸 나만 안다.** Deathloop은 누가 루프를 기억하는지를 이야기 장치로 씁니다. 이전 회차의 자신이 남긴 메시지가 힌트가 됩니다.
  3. **복수.** 나를 죽인 적에게 갚아 주는 맛입니다.
  4. **압도적인 재시작.** 1회차에 나를 죽인 보스를 5회차에 가볍게 넘는 맛입니다.
- **회귀 웹툰을 키우기 게임으로 만든 사례**도 이미 있습니다. 카카오페이지 웹툰 '나 혼자 만렙 귀환자'가 '나 혼자 만렙 키우기'로 나왔습니다. 다만 방치형 성장일 뿐 회귀 자체를 메커니즘으로 만든 건 아닙니다. **"회귀를 진짜 규칙으로 만든 가족 게임"이 비어 있는 자리**라고 봅니다.

## (c) 실패 이유

1. **성장 벽.** 영구 강화 없이는 못 깨게 막으면 숙제가 됩니다. GMTK는 로그라이트 성장이 "처음이 제일 어렵고 나중엔 쉬워지는 뒤집힌 난이도"를 만든다고 지적합니다.
2. **매판이 똑같음.** Brotato는 맵 하나라 반복된다는 불만을 들었습니다. Loop Hero 리뷰의 부제는 "매일이 똑같다"였습니다. Rogue Legacy 2 디자이너는 1편의 특성(Trait)이 "신기함이 사라지자 아무도 고르지 않았다"고 말했습니다. 그래서 2편에서는 위험한 특성에 금화 보너스를 붙였습니다("모든 것에 트레이드오프를").
3. **파워 인플레.** 너무 강해져 긴장이 사라지면 숫자만 커지고 재미가 끝납니다. 방치형 수학 글도 "큰 숫자 자체는 금방 질린다"고 경고합니다.
4. **폰에서 너무 긴 판.** 모바일 세션 중앙값은 5~6분, 상위 25%도 8~9분입니다. 30분짜리 판은 가족 저녁 시간에 맞지 않습니다.
5. **복잡한 조작과 작은 UI.** Brotato 모바일은 화면에 안 맞는 UI와 작은 글씨로 비판받았습니다. Jackbox의 원칙은 "한 순간엔 한 가지 결정"과 "디자이너가 어려우면 친척은 더 어렵다"입니다.
6. **과금·확률 불신.** 메이플 키우기는 확률 오류를 몰래 고친 '잠수함 패치'로 전액 환불 사태가 났습니다. 앞으로 광고 수익화를 하더라도 성장에 과금이 개입하는 느낌은 가족 게임에 치명적입니다.
7. **클론이 망하는 이유.** 자동공격과 3택 업그레이드라는 겉모양만 베끼고, 그 게임만의 한 방(Hades의 대사, Balatro의 점수 폭발)과 타격감 연출이 없기 때문입니다.

## (d) 우리 조건(세로 폰, 버튼 3개, 가족)에 맞는 방향 추천

| 전투 방식 | 재미 | 깊이 | 아이 친화 | 아트 작업량 | 가족 동시 플레이 |
|---|---|---|---|---|---|
| **자동전투 + 3색 타이밍 스킬** | 상 | 중 | 상 | 중 | 상 (기다림 없음) |
| 턴제 3택 (StS 라이트) | 중 | 상 | 중 (글 읽기) | 하 | 하 (서로 기다림) |
| 레인/리듬 | 상 (짧게) | 하 | 상 | 하 | 중 |
| 횡스크롤 핵앤슬래시 | 중 | 중 | 하 (조작 어려움) | 상 | 하 (네트워크 지연에 취약) |

**추천: "자동전투 + 보스 색 신호 대응 + 방마다 3택 1" 혼합형**

- 캐릭터는 자동으로 싸웁니다. 버튼은 빨강 = 공격 스킬, 초록 = 방어/회복, 파랑 = 필살기(게이지)입니다.
- 보스가 색으로 패턴을 예고합니다(예: 빨간 불꽃이 차오름). 맞는 색을 누르면 막거나 반격합니다. 리듬 게임의 맛은 여기서 흡수합니다.
- 방을 깰 때마다 업그레이드 3개가 빨강/초록/파랑 카드로 나오고 버튼으로 바로 고릅니다. 버튼 3개가 곧 선택지 3개라서 아주 자연스럽습니다.
- 서버와 폰 사이의 지연을 생각해 예고는 1.5~2초, 입력 판정은 넉넉하게 잡는 게 좋습니다.

**솔로 vs 협동: "파티 공동 회귀"를 기본으로**

- 방에 들어온 사람들(최대 8명, 빈자리는 AI)이 같은 던전을 같이 돌고, 전멸하거나 보스를 깨면 다 같이 회귀합니다.
- 성장(회차, 기억 조각)은 개인별로 저장합니다. 혼자 하면 AI 동료가 채워 주므로 같은 모드가 곧 솔로 모드입니다.
- 업그레이드는 동시에 고르게 해서 기다리는 시간이 없게 합니다.

**한 판 길이:** 1루프 5~7분(방 5개 + 보스). 1회차는 일부러 방 3 근처에서 죽도록 설계해서 2~3분 만에 첫 회귀를 맛보게 합니다.

## (e) 킥 포인트 후보

1. **"죽었더니 강해졌다" 회귀 연출 (최우선 추천).** 죽는 순간 화면이 되감기며 "제 7회차 회귀"라는 큰 글씨가 뜹니다. 이어서 전생 정산 화면에서 "가져가는 것: 기억 조각 +4, 경험치 배율 ×1.7, 빨강 스킬 Lv2 기억"처럼 숫자가 하나씩 튀어 오릅니다. 죽음을 손해가 아니라 이벤트로 만드는 장치입니다(Hades 방식).
2. **"나는 이 패턴을 안다": 전생의 기억 예지 (최우선 추천).** 어떤 패턴에 한 번 맞아 죽으면, 다음 회차부터 그 패턴 직전에 "💭기억났다!" 아이콘과 정답 색이 0.5초 먼저 반짝입니다. 지식이 눈에 보이는 힘이 되는 것으로, 회귀물의 핵심 판타지를 그대로 옮긴 것입니다.
3. **가족 회귀 레이드와 회귀의 가호 (최우선 추천).** 다 같이 같은 보스에 도전합니다. 연속으로 죽은 사람에게는 피해 감소 가호가 쌓입니다(Hades 갓모드: 시작 20%, 사망마다 +2%). 아이가 자연스럽게 따라잡고, 부모는 "가호 없이 깨기"로 자존심을 챙깁니다.
4. **"보스도 회귀한다".** 보스를 깨고 회귀하면 그 보스도 기억을 갖고 돌아와 새 패턴을 하나 추가합니다("또 너냐?" 대사). 판이 반복되는 문제의 해결책이자 ★고난 단계의 스토리 이유가 됩니다.
5. **회귀자 칭호와 자랑 숫자 두 개.** 총 회귀 횟수(끈기)와 최소 회차 클리어(실력)를 따로 보여 줍니다. "3회차 만에 깼다"가 "50회차"보다 멋있게 만드는 겁니다. 고양이 상인 같은 NPC가 회차를 기억하고 "벌써 12번째구나…"라고 말해 줍니다.

## (f) 회귀 시스템 설계 초안

**두 종류의 회귀**

- **사망 회귀:** 기억 조각(= 1 + 도달한 방 수), 가호 누적, 죽은 패턴의 예지 해금
- **클리어 회귀:** 조각 대량(+10), ★고난 단계 +1, 스토리 조각 1장, 보스 진화

**넘어가는 것**

- 회차 수
- 경험치 배율
- 기억 조각으로 찍는 영구 트리(체력, 시작 스킬 레벨, 3택 리롤 1회 등)
- 해금 요소(새 동물 캐릭터, 새 업그레이드 카드가 뽑기 풀에 추가: Dead Cells 설계도 방식)
- 패턴 기억(예지)
- 스토리 조각
- "전생의 유품": 이번 판 업그레이드 중 1개를 골라 다음 판에 들고 가기(Into the Breach 방식)

**리셋되는 것:** 판 안의 레벨, 3택으로 고른 업그레이드, 판 안에서 모은 골드

**경험치 배율 곡선 예시:** 배율 = 1 + 0.33 × √(회차 − 1), 상한 ×4. 방치형 prestige처럼 제곱근을 써서 초반엔 확 오르고 후반엔 완만하게 만듭니다.

| 회차 | 1 | 2 | 3 | 5 | 10 | 20 | 50 |
|---|---|---|---|---|---|---|---|
| 배율 | ×1.0 | ×1.33 | ×1.47 | ×1.66 | ×1.99 | ×2.44 | ×3.31 |

**너무 쉬워지지 않게 하는 장치**

- 적의 강함은 회차가 아니라 방 깊이와 ★고난에 연동합니다.
- 판 안의 레벨에 방마다 상한을 둡니다.
- ★고난 1단계마다 적 체력 +15%, 그리고 변형 규칙 1개를 붙입니다(예: 초록 버튼 쿨타임 2배).
- 고난 규칙을 스스로 고르면 조각 보너스를 줍니다(RL2의 "위험 = 보상" 원칙).

**판마다 달라지는 요소**

- 방 종류 랜덤: 전투, 보물, 이벤트, 쉼터
- 업그레이드 3택
- 보스 변형
- 원수 표시: 나를 죽인 적이 다음 판에 "원수"로 나오고, 처치하면 보상 2배

## (g) 첫 버전(MVP) 범위: 가족 재미 테스트용

- **콘텐츠:** 스테이지 1개(방 4~5개 + 보스 1마리), 보스 색 패턴 3개, 치비 동물 2~3종, 업그레이드 카드 8~10종
- **3버튼 조작:** 공격 / 방어 / 필살, 그리고 3택 고르기
- **회귀 요소:** 회차 표시, 전생 정산 화면, 경험치 배율, 영구 트리 노드 3개, 가호, 패턴 예지(킥 포인트 1~3)
- **멀티:** 1~4인 + AI 채우기
- **제외:** 스토리 본편, 상점, ★2 이상 고난, 보스 진화, 과금이나 광고
- **테스트 질문:**
  - 죽었을 때 웃는지, 짜증 내는지
  - 첫 클리어까지 몇 회차가 걸리는지(목표: 아이 3~5회차, 30분 안)
  - 한 루프가 7분을 넘지 않는지
  - 끝나고 "한 판 더!"가 나오는지

## (h) Sources

- [Critical Play: Hades (Mechanics of Magic)](https://mechanicsofmagic.com/2026/05/11/critical-play-hades-2/)
- [Hades God Mode explained by Supergiant (Can I Play That)](https://caniplaythat.com/2021/08/11/hades-god-mode-explained-by-supergiant-games)
- [Roguelikes, Persistency, and Progression – Game Maker's Toolkit (transcript)](https://amara.org/subtitles/7doGHxwrhRpX/en/1/download/Roguelikes%20Persistency%20and%20Progression%20%20Game%20Makers%20Toolkit.en.txt)
- [Vampire Survivors and gambling psychology (Univ. of Portsmouth)](https://www.port.ac.uk/news-events-and-blogs/blogs/popular-culture/vampire-survivors-how-developers-used-gambling-psychology-to-create-a-bafta-winning-game)
- [Critical Play: Addiction by Design – Balatro](https://mechanicsofmagic.com/2025/05/23/critical-play-addiction-by-design)
- [Rogue Legacy 2 – Teddy Lee interview (Nintendo)](https://www.nintendo.com/whatsnew/indie-world-interview-rogue-legacy-2-game-designer-teddy-lee-talks-about-the-newly-available-heir/)
- [How Progression Works in Dead Cells](https://scienceinsights.org/how-progression-works-in-dead-cells/)
- [Loop Hero review (GameCritics)](https://gamecritics.com/damiano-gerli/loop-hero-review/)
- [Brotato – App Army Assemble (Pocket Gamer)](https://www.pocketgamer.com/brotato/app-army-assemble)
- [Megabonk 100k+ players (TweakTown)](https://www.tweaktown.com/news/108086/steams-new-big-game-attracts-100-000-players-who-want-to-grow-absurdly-powerful/index.html)
- [Slay the Spire metrics-driven balancing (Game Developer)](https://www.gamedeveloper.com/design/learn-i-slay-the-spire-i-s-metrics-driven-approach-to-game-balancing-at-gdc-2019)
- [The Math of Idle Games Part III (Game Developer)](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii)
- [Outer Wilds breaks gaming's unwritten rules (Kotaku)](https://kotaku.com/the-brilliant-outer-wilds-breaks-many-of-gamings-unwrit-1839065568)
- [Using time loop logic to shape Deathloop's narrative (Game Developer)](https://www.gamedeveloper.com/gdc2022/using-time-loop-logic-to-shape-deathloop-s-narrative)
- [Returnal: what carries over each loop (Twinfinite)](https://twinfinite.net/guides/returnal-carries-over-each-loop-what/)
- [여전히 핫한 회귀물, 롱런 비결은? (주간경향)](https://weekly.khan.co.kr/article/202202041549071)
- [회귀·빙의·환생, '노력의 배신'에 대한 답 (한국경제)](https://www.hankyung.com/article/2026030643571)
- [God Goblin Raising ranks No.1 in idle RPG revenue (Sensor Tower)](https://sensortower.com/ko/blog/God-Goblin-Raising-ranks-No-1-in-idle-RPG-revenue)
- ['키우기'가 달구는 게임 시장 (다음뉴스)](https://v.daum.net/v/362QjdmjWm)
- ['전액 환불' 승부수 던진 넥슨… 메이플 키우기 (디지털데일리)](https://www.ddaily.co.kr/page/view/2026020515124133614)
- [나 혼자 만렙 키우기 글로벌 퍼블리싱 (웹툰가이드)](https://www.webtoonguide.com/ko/board/news-column/19584)
- [GameAnalytics mobile gaming benchmarks](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)
- [Jackbox design principles (Built In)](https://builtin.com/media-gaming/jackbox-games-design-party-pack)