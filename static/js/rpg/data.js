/* 아리채 오락실 · 회귀 RPG 「되감기 용사단」 숫자 표
   - 화면(sim.js)과 서버(rpg.py)가 같은 숫자를 쓰도록 여기 한 곳에만 적어요
   - 서버는 아래 JSON 부분(JSON 시작 ~ 끝 표시 사이)만 잘라 읽어요 → 그 안에는 주석·끝 쉼표를 쓰면 안 돼요
   - 시간은 모두 밀리초(ms), 피해·체력은 정수 근처 숫자예요
   - 1인칭 색 패링 (docs/handoff/specs/rpg_fp.md)
       · 적 공격 한 타마다 색(빨·초·파) 하나 → 닿는 순간 그 색 버튼을 누르면 패링, 아니면 맞음
       · parry = 판정 폭(win, 닿는 순간 앞 60%·뒤 40%) · 한 공격 최대 연타 수 · 연타 사이 최소 간격 · 고리가 줄어드는 시간(lead) · 색이 보이는 시간(reveal)
         (난이도 고르기는 없어요: 회귀할수록 쉬워지니까 한 가지로 충분해요)
       · 적 공격의 hits 는 '타 수'예요 (서버 rpg.py 도 그대로 읽어요). 실제 시각·간격·색은 sim.js 가 만들어요
   - 1장 「꽃비 항구와 울음곶」 (rpg_story.md 6절): 적 열쇠(mushroom·bat·golem·boss)는 저장·서버·시험과 맞추려고 그대로 두고
     이름과 그림(art = static/img/rpg/<화풍>/<art>.webp)만 바꿨어요 · 집게 게 · 갈매기 떼 · 작은 적 범선 · 적 캐럭선(중간 보스, mid) · 폭풍 문어
       · 3단계(사용자 결정): 구르는 대포(golem)·짐 상자(crates)는 빼고, 그 두 자리(체력·경험치·조개·간격은 그대로)를 '작은 적 범선'(그림 e_sloop, 옆에서 나타나 색 포탄을 왼·가운데·오른쪽에서 연달아 쏨)이 써요
         · 열쇠 golem = 튼튼한 범선 · crates = 가벼운 범선 · 여러 발 포격은 패링 반격이 여러 번 나가 쉬워지므로 한 발 피해를 조금 올려 예전 밸런스(아이 6 · 중학생 2 · 어른 1회차, harness 중앙값)에 맞췄어요
         · ship = 배(포탄 격추 연출 · 일제 사격으로 끝내면 격침) · e_sloop 그림이 아직 없으면 e_caravel 을 작게 옆으로 그려요 (art.js)
   - 2단계 돈·장비·스탯 (rpg_story.md 6절)
       · 적의 shell = 쓰러뜨리면 받는 조개껍데기 · pts = 쓰러뜨리면 받는 스탯 점수 (캐럭선·문어)
       · econ: 패링 한 번 조개 = parry + ⌊comboStep × (콤보 − 1)⌋ (최대 comboMax) · 상점은 shopAfter 번 방(0 = 부두)을 지나 출항 전
               weapons atk = 반격·강반격 피해 +비율 · armors def = 받는 피해 −비율 · price = 조개 값 (회귀하면 돈·장비 0)
       · stats: 처음 base · 힘 str = 반격 +비율/점 · 민첩 agi = 판정 +ms/점 (agiCap 까지) · 체력 vit = 최대 HP +/점 · keep = 회귀 때 남는 비율(50%)
       · 2단계 밸런스(자동 플레이어 중앙값 아이 5 · 중학생 2 · 어른 1회차)에 맞춰 적 피해를 약 20% 올렸어요 (스콜 빗줄기 합 36은 그대로)
   - 3단계 범선 전투 (rpg_story.md 6절 '범선 전투') — 1장 화면(makeWorld 의 cannon: true)에서만 켜져요 (다른 화면은 예전 필살 그대로)
       · hero.cannon = 대포 게이지 · 일제 사격: max 게이지 끝 · parry 패링 한 번에 차는 양(필살 충전 카드 배율 적용)
               · 반격·자동 공격·맞음으로는 안 차요 · 맞아도 줄지 않아요(아이들이 모은 게 사라지지 않게) · 쏘면 0
               · win 세 버튼을 이 시간(ms) 안에 다 누르면 일제 사격 · mult 일제 사격 피해 배율(공격력 × mult, 필살 강화 카드 배율 적용)
               · delay 포탄이 날아가 닿는 시간 · inv 쏘는 동안 적 공격이 빗나가는 시간 · stop 맞은 적이 멈칫하는 시간
       · 강반격(3연속 패링)은 화면에서 '우리 대포 한 발'로 보여 줘요 (숫자는 strong 그대로)
       · 적의 sinkShell = 일제 사격으로 끝내면(격침) 더 받는 조개 · econ.kong = 숨은 콩게를 찾으면 받는 조개 (한 회차 한 번) */
(function (root) {
  'use strict';
  const DATA = /*JSON*/{
    "v": 2,
    "hero": {
      "hp": 100, "atk": 12,
      "combo": [
        {"start": 80, "rec": 230, "mult": 1.0, "kb": 7, "stop": 55},
        {"start": 80, "rec": 230, "mult": 1.15, "kb": 8, "stop": 60},
        {"start": 120, "rec": 350, "mult": 1.7, "kb": 18, "stop": 85}
      ],
      "autoRest": 180, "chanceSpeed": 2,
      "parrySplit": 0.6, "tryEarly": 250, "lateShow": 220, "parryLock": 380,
      "counterMult": 3.0, "counterDelay": 150,
      "strong": {"need": 3, "mult": 5.0, "kb": 28, "stop": 110},
      "parryCombo": {"step": 0.3, "cap": 0},
      "slowmo": 300, "slowScale": 0.22, "parryStop": 120,
      "hurtMs": 300, "wallCut": 0.15,
      "gaugeMax": 250, "gaugeHit": 2, "gaugeParry": 30, "gaugeHurt": 4,
      "cannon": {"max": 100, "parry": 15, "win": 200, "mult": 20, "delay": 260, "inv": 0, "stop": 160},
      "spec": {"dur": 1150, "hits": 5, "gap": 170, "first": 260, "mult": 2.0, "invuln": 1350, "win": 120},
      "lvAtk": 0.15, "lvHp": 20, "lvHeal": 0.3,
      "xpBase": 20, "xpGrow": 5,
      "roomHeal": 0.25, "reviveHp": 0.4
    },
    "parry": {"win": 230, "maxHits": 3, "gapMin": 450, "lead": 1300, "reveal": 800},
    "scale": {"hp": 0.38, "dmg": 0.8, "xp": 0.3, "party": 0.7, "star": 0.15},
    "flow": {"firstWalk": 1500, "nextWalk": 1300, "roomWalk": 2200, "dieAnim": 650, "cardMax": 12000, "readyMax": 30000},
    "enemies": {
      "mushroom": {
        "name": "집게 게", "art": "e_crab", "hp": 840, "xp": 6, "shell": 6, "size": 1.0, "first": 1000, "gap": [1400, 2200], "stun": 900,
        "pats": [
          {"id": "bonk", "name": "집게 찍기", "w": 1, "wind": 1050, "hits": [0], "dmg": 14, "icon": "g", "rec": 350}
        ]
      },
      "bat": {
        "name": "갈매기 떼", "art": "e_gulls", "hp": 670, "xp": 7, "shell": 6, "size": 0.9, "first": 800, "gap": [1150, 1800], "stun": 900,
        "pats": [
          {"id": "double", "name": "두 번 쪼기", "w": 2, "wind": 900, "hits": [0, 420], "dmg": 11, "icon": "g", "rec": 300},
          {"id": "swoop", "name": "급강하", "w": 1, "wind": 1150, "hits": [0], "dmg": 16, "icon": "g", "rec": 350}
        ]
      },
      "golem": {
        "name": "작은 적 범선", "art": "e_sloop", "hp": 1610, "xp": 12, "shell": 10, "sinkShell": 8, "size": 1.25, "first": 1200, "gap": [1700, 2500], "stun": 1000, "ship": true,
        "pats": [
          {"id": "slam", "name": "세 발 연속 포격", "w": 2, "wind": 1500, "hits": [0, 450, 900], "dmg": 12, "icon": "g", "rec": 400, "vuln": 1700},
          {"id": "poke", "name": "한 발 포격", "w": 1, "wind": 1000, "hits": [0], "dmg": 16, "icon": "g", "rec": 300}
        ]
      },
      "crates": {
        "name": "작은 적 범선", "art": "e_sloop", "hp": 760, "xp": 7, "shell": 7, "sinkShell": 5, "size": 1.0, "first": 900, "gap": [1300, 2000], "stun": 900, "ship": true,
        "pats": [
          {"id": "slide", "name": "두 발 포격", "w": 2, "wind": 1000, "hits": [0, 450], "dmg": 10, "icon": "g", "rec": 320},
          {"id": "pile", "name": "세 발 연속 포격", "w": 1, "wind": 1100, "hits": [0, 450, 900], "dmg": 9, "icon": "g", "rec": 350}
        ]
      },
      "caravel": {
        "name": "적 캐럭선", "art": "e_caravel", "hp": 1600, "xp": 24, "shell": 25, "sinkShell": 20, "pts": 4, "size": 1.4, "first": 1400, "gap": [1300, 2000], "stun": 900, "mid": true, "ship": true,
        "pats": [
          {"id": "volley", "name": "일제 포격", "w": 2, "wind": 1300, "hits": [0, 450, 900], "dmg": 11, "icon": "g", "rec": 450},
          {"id": "ram", "name": "뱃머리 들이받기", "w": 1, "wind": 1600, "hits": [0], "dmg": 22, "icon": "g", "rec": 500, "vuln": 1500}
        ]
      },
      "boss": {
        "name": "울음곶의 폭풍 문어", "art": "e_octopus", "hp": 12000, "xp": 60, "shell": 60, "pts": 6, "size": 2.0, "first": 1600, "gap": [900, 1500], "stun": 750, "boss": true,
        "rage": 0.5, "rageWind": 0.85, "rageGap": 0.8,
        "pats": [
          {"id": "triple", "name": "촉수 3연타", "w": 3, "wind": 1300, "hits": [0, 460, 920], "dmg": 18, "icon": "g", "rec": 450},
          {"id": "smash", "name": "돛대 내려찍기", "w": 2, "wind": 2000, "hits": [0], "dmg": 56, "icon": "r", "brk": 0.08, "brkStun": 1900, "rec": 600, "vuln": 1300, "seq": ["r", "g", "b"]},
          {"id": "fire", "name": "스콜 빗줄기", "w": 2, "wind": 1600, "hits": [0, 320, 640], "dmg": 12, "icon": "g", "all": true, "rec": 400, "vuln": 1500}
        ]
      }
    },
    "rooms": [
      [["mushroom", "mushroom"]],
      [["mushroom", "bat", "mushroom"], ["bat", "mushroom", "bat"]],
      [["crates", "golem", "caravel"], ["golem", "crates", "caravel"]],
      [["golem", "bat", "crates"], ["crates", "mushroom", "golem"]],
      [["golem", "mushroom", "bat", "golem"], ["bat", "golem", "bat", "golem"]],
      [["boss"]]
    ],
    "cards": [
      {"id": "slash", "c": "r", "name": "연속 베기", "desc": "자동 공격 +20%", "max": 5},
      {"id": "heavy", "c": "r", "name": "모아 베기", "desc": "강반격 +40%·연속 패링 2번이면 강반격", "max": 3},
      {"id": "vamp", "c": "r", "name": "회복 베기", "desc": "자동 공격 3번째마다 체력 +3", "max": 3},
      {"id": "wall", "c": "g", "name": "철벽 가드", "desc": "맞을 때 받는 피해 -15%", "max": 3},
      {"id": "parry", "c": "g", "name": "번개 패링", "desc": "패링 판정 넉넉히·반격 +30%", "max": 3},
      {"id": "calm", "c": "g", "name": "반격 회복", "desc": "패링하면 체력 +6", "max": 3},
      {"id": "charge", "c": "b", "name": "필살 충전", "desc": "필살 게이지가 30% 빨리 차요", "max": 3},
      {"id": "nova", "c": "b", "name": "필살 강화", "desc": "필살기 공격력 +35%", "max": 3},
      {"id": "tough", "c": "b", "name": "튼튼 몸", "desc": "최대 체력 +20·모두 회복", "max": 5},
      {"id": "star", "c": "b", "name": "행운 별", "desc": "경험치 +30%", "max": 3},
      {"id": "potion", "c": "x", "name": "회복 물약", "desc": "체력 40% 회복", "max": 99}
    ],
    "econ": {
      "shopAfter": 0, "parry": 1, "comboStep": 0.5, "comboMax": 6, "kong": 5,
      "weapons": [
        {"id": "w1", "name": "녹슨 커틀러스", "desc": "반격 피해 +20%", "atk": 0.2, "price": 20},
        {"id": "w2", "name": "선원의 세이버", "desc": "반격 피해 +40%", "atk": 0.4, "price": 45},
        {"id": "w3", "name": "별빛 레이피어", "desc": "반격 피해 +65%", "atk": 0.65, "price": 80}
      ],
      "armors": [
        {"id": "a1", "name": "가죽 조끼", "desc": "받는 피해 -12%", "def": 0.12, "price": 20},
        {"id": "a2", "name": "사슬 갑옷", "desc": "받는 피해 -22%", "def": 0.22, "price": 45},
        {"id": "a3", "name": "별철 흉갑", "desc": "받는 피해 -32%", "def": 0.32, "price": 80}
      ]
    },
    "stats": {"base": 10, "keep": 0.5, "str": 0.05, "agi": 6, "agiCap": 36, "vit": 6},
    "meta": {
      "xpK": 0.33, "xpCap": 4, "clearBonus": 10, "foreMs": 400, "foreKeep": 6,
      "nodes": [
        {"id": "combo", "c": "r", "name": "전생의 검술", "desc": "연속 베기를 배운 채로 시작", "max": 2, "cost": [6, 14]},
        {"id": "hp", "c": "g", "name": "튼튼한 영혼", "desc": "최대 체력 +15%", "max": 5, "cost": [2, 3, 5, 7, 10]},
        {"id": "reroll", "c": "b", "name": "운명 다시 뽑기", "desc": "카드 다시 뽑기 +1번", "max": 2, "cost": [5, 12]}
      ]
    }
  }/*END*/;
  root.RpgData = DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
