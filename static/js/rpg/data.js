/* 아리채 오락실 · 회귀 RPG 「되감기 용사단」 숫자 표
   - 화면(sim.js)과 서버(rpg.py)가 같은 숫자를 쓰도록 여기 한 곳에만 적어요
   - 서버는 아래 JSON 부분(JSON 시작 ~ 끝 표시 사이)만 잘라 읽어요 → 그 안에는 주석·끝 쉼표를 쓰면 안 돼요
   - 시간은 모두 밀리초(ms), 피해·체력은 정수 근처 숫자예요 */
(function (root) {
  'use strict';
  const DATA = /*JSON*/{
    "v": 1,
    "hero": {
      "hp": 100, "atk": 12,
      "combo": [
        {"start": 80, "rec": 210, "mult": 1.0, "kb": 7, "stop": 55},
        {"start": 80, "rec": 210, "mult": 1.15, "kb": 8, "stop": 60},
        {"start": 120, "rec": 330, "mult": 1.7, "kb": 18, "stop": 85}
      ],
      "comboKeep": 420, "tapBuffer": 260,
      "chargeAt": 320, "chargeFull": 780, "chargeHalf": 160,
      "heavy": {"start": 100, "rec": 320, "mult": 3.2, "half": 1.9, "kb": 28, "stop": 90},
      "guardTake": 0.25,
      "parryPre": 160, "parryPost": 70, "parryLock": 380,
      "counterMult": 3.0, "counterDelay": 150,
      "slowmo": 300, "slowScale": 0.22, "parryStop": 120,
      "hurtMs": 300,
      "gaugeMax": 100, "gaugeHit": 6, "gaugeParry": 30, "gaugeGuard": 5, "gaugeHurt": 4,
      "spec": {"dur": 1150, "hits": 5, "gap": 170, "first": 260, "mult": 2.0, "invuln": 1350},
      "lvAtk": 0.12, "lvHp": 10, "lvHeal": 0.3,
      "xpBase": 20, "xpGrow": 5,
      "roomHeal": 0.25, "reviveHp": 0.4
    },
    "scale": {"hp": 0.38, "dmg": 0.34, "xp": 0.3, "party": 0.7, "star": 0.15},
    "flow": {"firstWalk": 1500, "nextWalk": 1300, "roomWalk": 2200, "dieAnim": 650, "cardMax": 12000, "readyMax": 30000},
    "enemies": {
      "mushroom": {
        "name": "버섯돌이", "hp": 600, "xp": 6, "size": 1.0, "first": 1000, "gap": [1400, 2200], "stun": 900,
        "pats": [
          {"id": "bonk", "name": "머리 박치기", "w": 1, "wind": 1050, "hits": [0], "dmg": 11, "icon": "g", "rec": 350}
        ]
      },
      "bat": {
        "name": "찍찍 박쥐", "hp": 480, "xp": 7, "size": 0.9, "first": 800, "gap": [1150, 1800], "stun": 900,
        "pats": [
          {"id": "double", "name": "두 번 할퀴기", "w": 2, "wind": 900, "hits": [0, 420], "dmg": 8, "icon": "g", "rec": 300},
          {"id": "swoop", "name": "급강하", "w": 1, "wind": 1150, "hits": [0], "dmg": 12, "icon": "g", "rec": 350}
        ]
      },
      "golem": {
        "name": "바위돌이", "hp": 1150, "xp": 12, "size": 1.25, "first": 1200, "gap": [1700, 2500], "stun": 1000,
        "pats": [
          {"id": "slam", "name": "바위 내려찍기", "w": 2, "wind": 1500, "hits": [0], "dmg": 21, "icon": "g", "rec": 400, "vuln": 1700},
          {"id": "poke", "name": "돌주먹", "w": 1, "wind": 1000, "hits": [0], "dmg": 10, "icon": "g", "rec": 300}
        ]
      },
      "boss": {
        "name": "도깨비 대왕", "hp": 9000, "xp": 60, "size": 2.0, "first": 1600, "gap": [900, 1500], "stun": 750, "boss": true,
        "rage": 0.5, "rageWind": 0.85, "rageGap": 0.8,
        "pats": [
          {"id": "triple", "name": "방망이 3연타", "w": 3, "wind": 1300, "hits": [0, 460, 920], "dmg": 14, "icon": "g", "rec": 450},
          {"id": "smash", "name": "뚝딱 내려찍기", "w": 2, "wind": 2000, "hits": [0], "dmg": 44, "icon": "r", "brk": 0.08, "brkStun": 1900, "rec": 600, "vuln": 1300},
          {"id": "fire", "name": "도깨비불", "w": 2, "wind": 1600, "hits": [0, 320], "dmg": 16, "icon": "g", "all": true, "rec": 400, "vuln": 1500}
        ]
      }
    },
    "rooms": [
      [["mushroom", "mushroom"]],
      [["mushroom", "bat", "mushroom"], ["bat", "mushroom", "bat"]],
      [["bat", "golem", "mushroom"], ["mushroom", "golem", "bat"]],
      [["golem", "bat", "golem"], ["bat", "mushroom", "golem"]],
      [["golem", "mushroom", "bat", "golem"], ["bat", "golem", "bat", "golem"]],
      [["boss"]]
    ],
    "cards": [
      {"id": "slash", "c": "r", "name": "연속 베기", "desc": "콤보 공격력 +20%", "max": 5},
      {"id": "heavy", "c": "r", "name": "모아 베기", "desc": "꾹 모아 베기 +40%·더 빨리 모아요", "max": 3},
      {"id": "vamp", "c": "r", "name": "회복 베기", "desc": "3번째 베기마다 체력 +3", "max": 3},
      {"id": "wall", "c": "g", "name": "철벽 가드", "desc": "막을 때 받는 피해 -30%", "max": 3},
      {"id": "parry", "c": "g", "name": "번개 패링", "desc": "패링 판정 넉넉히·반격 +30%", "max": 3},
      {"id": "calm", "c": "g", "name": "반격 회복", "desc": "패링하면 체력 +6", "max": 3},
      {"id": "charge", "c": "b", "name": "필살 충전", "desc": "필살 게이지가 30% 빨리 차요", "max": 3},
      {"id": "nova", "c": "b", "name": "필살 강화", "desc": "필살기 공격력 +35%", "max": 3},
      {"id": "tough", "c": "b", "name": "튼튼 몸", "desc": "최대 체력 +20·모두 회복", "max": 5},
      {"id": "star", "c": "b", "name": "행운 별", "desc": "경험치 +30%", "max": 3},
      {"id": "potion", "c": "x", "name": "회복 물약", "desc": "체력 40% 회복", "max": 99}
    ],
    "meta": {
      "xpK": 0.33, "xpCap": 4, "clearBonus": 10,
      "nodes": [
        {"id": "combo", "c": "r", "name": "전생의 검술", "desc": "연속 베기를 배운 채로 시작", "max": 2, "cost": [6, 14]},
        {"id": "hp", "c": "g", "name": "튼튼한 영혼", "desc": "최대 체력 +15%", "max": 5, "cost": [3, 5, 8, 12, 16]},
        {"id": "reroll", "c": "b", "name": "운명 다시 뽑기", "desc": "카드 다시 뽑기 +1번", "max": 2, "cost": [5, 12]}
      ]
    }
  }/*END*/;
  root.RpgData = DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
