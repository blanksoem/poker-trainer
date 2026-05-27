#!/usr/bin/env node
// 6-max NL Hold'em ターミナル学習アプリ (呂さん専用)
// 起動: node poker.js
// 操作: f=fold / c=call(check) / r [amount]=raise / a=all-in / q=quit

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ──────────────────────────────────────────────
// 1. Cards & Deck
// ──────────────────────────────────────────────

const RANKS = '23456789TJQKA';
const SUITS = 'cdhs';
const SUIT_GLYPH = { c: '♣', d: '♦', h: '♥', s: '♠' };
const RANK_NAMES = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];

function makeDeck() {
  const deck = [];
  for (let r = 0; r < 13; r++) {
    for (let s = 0; s < 4; s++) {
      deck.push({ rank: r, suit: s, code: RANKS[r] + SUITS[s] });
    }
  }
  return deck;
}

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const cardStr = (c) => RANKS[c.rank] + SUIT_GLYPH[SUITS[c.suit]];
const cardsStr = (arr) => arr.map(cardStr).join(' ');

// ──────────────────────────────────────────────
// 2. 7-card Hand Evaluator
//    Returns score array, compared lexicographically.
//    Category: 8=StrFlush 7=Quads 6=FH 5=Flush 4=Str 3=Trips 2=2P 1=1P 0=High
// ──────────────────────────────────────────────

function bestStraightHigh(rankSet) {
  for (let high = 12; high >= 4; high--) {
    if (rankSet.has(high) && rankSet.has(high - 1) && rankSet.has(high - 2) &&
        rankSet.has(high - 3) && rankSet.has(high - 4)) {
      return high;
    }
  }
  // Wheel: A-2-3-4-5 (5-high)
  if (rankSet.has(12) && rankSet.has(0) && rankSet.has(1) && rankSet.has(2) && rankSet.has(3)) {
    return 3;
  }
  return -1;
}

function evaluate7(cards) {
  const rankCnt = new Array(13).fill(0);
  const suitCnt = new Array(4).fill(0);
  const ranksBySuit = [[], [], [], []];
  for (const c of cards) {
    rankCnt[c.rank]++;
    suitCnt[c.suit]++;
    ranksBySuit[c.suit].push(c.rank);
  }
  const allRankSet = new Set(cards.map(c => c.rank));

  // Straight flush
  for (let s = 0; s < 4; s++) {
    if (suitCnt[s] >= 5) {
      const suitRankSet = new Set(ranksBySuit[s]);
      const sfHigh = bestStraightHigh(suitRankSet);
      if (sfHigh >= 0) return [8, sfHigh];
    }
  }

  // Four of a kind
  for (let r = 12; r >= 0; r--) {
    if (rankCnt[r] === 4) {
      let kicker = -1;
      for (let k = 12; k >= 0; k--) {
        if (k !== r && rankCnt[k] > 0) { kicker = k; break; }
      }
      return [7, r, kicker];
    }
  }

  // Full house (best trips + best other pair-or-higher)
  let trips = -1, pairForFH = -1;
  for (let r = 12; r >= 0; r--) {
    if (rankCnt[r] >= 3 && trips < 0) { trips = r; continue; }
    if (rankCnt[r] >= 2 && pairForFH < 0) { pairForFH = r; }
  }
  if (trips >= 0 && pairForFH >= 0) return [6, trips, pairForFH];

  // Flush
  for (let s = 0; s < 4; s++) {
    if (suitCnt[s] >= 5) {
      const top5 = ranksBySuit[s].sort((a, b) => b - a).slice(0, 5);
      return [5, ...top5];
    }
  }

  // Straight
  const stHigh = bestStraightHigh(allRankSet);
  if (stHigh >= 0) return [4, stHigh];

  // Three of a kind
  if (trips >= 0) {
    const kickers = [];
    for (let k = 12; k >= 0 && kickers.length < 2; k--) {
      if (k !== trips && rankCnt[k] > 0) kickers.push(k);
    }
    return [3, trips, ...kickers];
  }

  // Two pair / One pair
  const pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (rankCnt[r] === 2) pairs.push(r);
  }
  if (pairs.length >= 2) {
    const [p1, p2] = pairs;
    let kicker = -1;
    for (let k = 12; k >= 0; k--) {
      if (k !== p1 && k !== p2 && rankCnt[k] > 0) { kicker = k; break; }
    }
    return [2, p1, p2, kicker];
  }
  if (pairs.length === 1) {
    const p = pairs[0];
    const kickers = [];
    for (let k = 12; k >= 0 && kickers.length < 3; k--) {
      if (k !== p && rankCnt[k] > 0) kickers.push(k);
    }
    return [1, p, ...kickers];
  }

  // High card
  const top5 = [];
  for (let r = 12; r >= 0 && top5.length < 5; r--) {
    if (rankCnt[r] > 0) top5.push(r);
  }
  return [0, ...top5];
}

function compareScores(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? -1;
    const bv = b[i] ?? -1;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function handDescription(score) {
  if (!score) return '?';
  const cat = score[0];
  if (cat === 8) return `ストレートフラッシュ (${RANK_NAMES[score[1]]}-high)`;
  if (cat === 7) return `フォーカード (${RANK_NAMES[score[1]]}s)`;
  if (cat === 6) return `フルハウス (${RANK_NAMES[score[1]]}s over ${RANK_NAMES[score[2]]}s)`;
  if (cat === 5) return `フラッシュ (${RANK_NAMES[score[1]]}-high)`;
  if (cat === 4) return `ストレート (${RANK_NAMES[score[1]]}-high)`;
  if (cat === 3) return `スリーカード (${RANK_NAMES[score[1]]}s)`;
  if (cat === 2) return `ツーペア (${RANK_NAMES[score[1]]}s & ${RANK_NAMES[score[2]]}s)`;
  if (cat === 1) return `ワンペア (${RANK_NAMES[score[1]]}s)`;
  return `ハイカード (${RANK_NAMES[score[1]]}-high)`;
}

// ──────────────────────────────────────────────
// 3. Game state
// ──────────────────────────────────────────────

function createGame(difficulty = 'medium') {
  const numPlayers = 6;
  const startStack = 200;
  const sb = 1, bb = 2;
  const typeAssign = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const players = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push({
      idx: i,
      name: i === 0 ? 'Hero' : `Villain${i}`,
      isHero: i === 0,
      aiType: i === 0 ? null : typeAssign[i - 1],
      stack: startStack,
      cards: [],
      folded: false,
      allIn: false,
      committedThisStreet: 0,
      totalCommitted: 0,
      handScore: null,
    });
  }
  return {
    numPlayers, startStack, sb, bb,
    difficulty,
    handCount: 0,
    btnIdx: 0,
    heroIdx: 0,
    players,
    pot: 0,
    board: [],
    actions: [],
    street: 'preflop',
    currentBet: 0,
    lastRaiseSize: bb,
  };
}

function positionName(state, p) {
  const offset = (p.idx - state.btnIdx + state.numPlayers) % state.numPlayers;
  return ['BTN', 'SB', 'BB', 'UTG', 'MP', 'CO'][offset];
}

// ──────────────────────────────────────────────
// 4. AI logic (preflop ranges + postflop simplified GTO)
// ──────────────────────────────────────────────

// プレイヤータイプ定義（難易度＝相手の多様性で表現）
// openTh/threebetTh/callTh: プリフロップ強度の閾値（低いほどルース）
// cbetFreq: 中堅手でのベット頻度 / bluffFreq: ドロー・空気でのブラフ頻度
// valueAggro: バリュー時の積極性 / foldToBet: ベットへの降りやすさ（低い=降りない）
// raiseFreq: 強い手をレイズに回す頻度
const AI_TYPES = {
  TAG: {
    label: 'TAG（タイト・アグレッシブ／標準的な強敵）',
    openTh: 75, threebetTh: 100, callTh: 72,
    cbetFreq: 0.70, bluffFreq: 0.35, valueAggro: 0.60, foldToBet: 0.55, raiseFreq: 0.55,
  },
  LAG: {
    label: 'LAG（ルース・アグレッシブ／上級者風）',
    openTh: 65, threebetTh: 88, callTh: 62,
    cbetFreq: 0.85, bluffFreq: 0.55, valueAggro: 0.75, foldToBet: 0.40, raiseFreq: 0.70,
  },
  NIT: {
    label: 'NIT（超タイト・パッシブ／慎重派カモ）',
    openTh: 85, threebetTh: 108, callTh: 80,
    cbetFreq: 0.50, bluffFreq: 0.10, valueAggro: 0.40, foldToBet: 0.70, raiseFreq: 0.35,
  },
  STATION: {
    label: 'STATION（コール魔／最大のカモ・降りない）',
    openTh: 72, threebetTh: 110, callTh: 55,
    cbetFreq: 0.35, bluffFreq: 0.08, valueAggro: 0.35, foldToBet: 0.20, raiseFreq: 0.20,
  },
  MANIAC: {
    label: 'MANIAC（暴れ馬／超アグレッシブ・ブラフ乱発）',
    openTh: 55, threebetTh: 78, callTh: 48,
    cbetFreq: 0.90, bluffFreq: 0.70, valueAggro: 0.85, foldToBet: 0.30, raiseFreq: 0.80,
  },
};

// 難易度別の villain 構成（5人分）
const DIFFICULTY = {
  easy:   ['STATION', 'STATION', 'NIT', 'MANIAC', 'STATION'], // カモだらけ・エクスプロイト練習
  medium: ['TAG', 'STATION', 'LAG', 'NIT', 'TAG'],            // リアルなミックス（Round 1-2推奨）
  hard:   ['TAG', 'TAG', 'LAG', 'TAG', 'LAG'],                // 強敵だらけ・GTO練習
};

function preflopHandStrength(c1, c2) {
  const r1 = c1.rank, r2 = c2.rank;
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const suited = c1.suit === c2.suit;
  const pair = r1 === r2;
  let score;
  if (pair) {
    // 22=50+0=50, AA=50+12*5=110
    score = 50 + r1 * 5;
  } else {
    // base
    score = high * 3 + low * 1.5;
    if (suited) score += 8;
    const gap = high - low - 1;
    if (gap === 0) score += 6;
    else if (gap === 1) score += 3;
    else if (gap === 2) score += 1;
    if (high === 12) score += 5; // ace
    if (high === 11) score += 2; // king
  }
  return score;
}

function positionBonusPreflop(pos) {
  return { UTG: 0, MP: 4, CO: 9, BTN: 14, SB: 4, BB: 12 }[pos] || 0;
}

function postflopStrengthCategory(handScore, board, hole) {
  const cat = handScore[0];
  if (cat >= 4) return 4; // straight+, monster
  if (cat === 3) return 4; // trips/set
  if (cat === 2) return 3; // two pair
  if (cat === 1) {
    const pairRank = handScore[1];
    const boardRanks = board.map(c => c.rank).sort((a, b) => b - a);
    const topBoard = boardRanks[0];
    const r1 = hole[0].rank, r2 = hole[1].rank;
    if (r1 === r2 && r1 > topBoard) return 3; // overpair
    if (pairRank === topBoard) {
      const kicker = (r1 === pairRank) ? r2 : r1;
      return kicker >= 10 ? 3 : 2;
    }
    return 2; // mid/bottom pair
  }
  if (hasFlushDraw(board, hole) || hasOESD(board, hole)) return 1;
  return 0;
}

function hasFlushDraw(board, hole) {
  const suitCnt = [0, 0, 0, 0];
  for (const c of [...board, ...hole]) suitCnt[c.suit]++;
  return suitCnt.some(c => c === 4);
}

function hasOESD(board, hole) {
  const ranks = new Set([...board, ...hole].map(c => c.rank));
  for (let r = 12; r >= 3; r--) {
    if (ranks.has(r) && ranks.has(r-1) && ranks.has(r-2) && ranks.has(r-3)) return true;
  }
  return false;
}

function aiDecide(state, p) {
  const t = AI_TYPES[p.aiType] || AI_TYPES.TAG;
  const isPreflop = state.street === 'preflop';
  const toCall = state.currentBet - p.committedThisStreet;
  const pos = positionName(state, p);

  if (isPreflop) {
    const base = preflopHandStrength(p.cards[0], p.cards[1]);
    const strength = base + positionBonusPreflop(pos);

    // Facing a raise (someone bet more than BB)
    if (state.currentBet > state.bb) {
      if (strength > t.threebetTh) {
        // 3-bet
        const target = Math.min(state.currentBet * 3, p.committedThisStreet + p.stack);
        return { type: 'raise', amount: target };
      }
      if (strength > t.callTh + 6) return { type: 'call' };
      if (strength > t.callTh && toCall <= state.bb * 4) return { type: 'call' };
      // STATION/MANIAC は分の悪いコールもしがち
      if (strength > t.callTh - 6 && toCall <= state.bb * 4 && Math.random() > t.foldToBet) return { type: 'call' };
      return { type: 'fold' };
    }

    // First in / limped pot
    if (strength > t.openTh) {
      const target = Math.min(state.bb * 3, p.committedThisStreet + p.stack);
      return { type: 'raise', amount: target };
    }
    if (toCall === 0) {
      // BB option or SB completed pot
      if (strength > t.openTh - 15 && Math.random() < t.raiseFreq) {
        const target = Math.min(state.bb * 3, p.committedThisStreet + p.stack);
        return { type: 'raise', amount: target };
      }
      return { type: 'check' };
    }
    // SB/limp facing small bet: complete or fold
    if (strength > t.callTh && toCall <= state.bb) return { type: 'call' };
    // ルース系は弱くてもlimp-call
    if (strength > t.callTh - 8 && toCall <= state.bb && Math.random() > t.foldToBet) return { type: 'call' };
    return { type: 'fold' };
  }

  // ── Postflop ──
  const handScore = evaluate7([...p.cards, ...state.board]);
  const cat = postflopStrengthCategory(handScore, state.board, p.cards);

  // No bet to face
  if (toCall === 0) {
    if (cat === 4) {
      const bet = Math.min(Math.max(Math.round(state.pot * 0.7), state.bb), p.stack);
      return bet >= p.stack ? { type: 'raise', amount: p.committedThisStreet + p.stack }
                            : { type: 'bet', amount: p.committedThisStreet + bet };
    }
    if (cat === 3 && Math.random() < t.cbetFreq + 0.05) {
      const bet = Math.min(Math.round(state.pot * 0.6), p.stack);
      return { type: 'bet', amount: p.committedThisStreet + Math.max(bet, state.bb) };
    }
    if (cat === 2 && Math.random() < t.valueAggro * 0.55) {
      const bet = Math.min(Math.round(state.pot * 0.5), p.stack);
      return { type: 'bet', amount: p.committedThisStreet + Math.max(bet, state.bb) };
    }
    if (cat === 1 && Math.random() < t.bluffFreq) {
      // semi-bluff
      const bet = Math.min(Math.round(state.pot * 0.5), p.stack);
      return { type: 'bet', amount: p.committedThisStreet + Math.max(bet, state.bb) };
    }
    if (cat === 0 && Math.random() < t.bluffFreq * 0.4) {
      // 空気からの純ブラフ（MANIAC/LAG だけ高頻度）
      const bet = Math.min(Math.round(state.pot * 0.5), p.stack);
      return { type: 'bet', amount: p.committedThisStreet + Math.max(bet, state.bb) };
    }
    return { type: 'check' };
  }

  // Facing a bet/raise
  const potOdds = toCall / (state.pot + toCall);
  if (cat === 4) {
    if (Math.random() < t.raiseFreq) {
      const target = Math.min(state.currentBet * 3, p.committedThisStreet + p.stack);
      return { type: 'raise', amount: target };
    }
    return { type: 'call' };
  }
  if (cat === 3) {
    if (toCall > p.stack * 0.6 && Math.random() < t.foldToBet) return { type: 'fold' };
    return { type: 'call' };
  }
  if (cat === 2) {
    if (potOdds < 0.28) return { type: 'call' };
    // STATION は降りない／NIT はよく降りる
    if (Math.random() > t.foldToBet) return { type: 'call' };
    return { type: 'fold' };
  }
  if (cat === 1) {
    if (potOdds < 0.22) return { type: 'call' };
    if (Math.random() > t.foldToBet + 0.2) return { type: 'call' };
    return { type: 'fold' };
  }
  // trash — STATION/MANIAC はたまにブラフキャッチ
  if (potOdds < 0.15 && Math.random() > t.foldToBet + 0.25) return { type: 'call' };
  return { type: 'fold' };
}

// ──────────────────────────────────────────────
// 5. Action application
// ──────────────────────────────────────────────

function recordAction(state, p, type, amount) {
  state.actions.push({
    street: state.street,
    player: p.name,
    position: positionName(state, p),
    action: type,
    ...(amount !== undefined ? { amount } : {}),
  });
}

function applyAction(state, p, action) {
  if (action.type === 'fold') {
    p.folded = true;
    recordAction(state, p, 'fold');
    return;
  }
  if (action.type === 'check') {
    recordAction(state, p, 'check');
    return;
  }
  if (action.type === 'call') {
    const toCall = state.currentBet - p.committedThisStreet;
    const amount = Math.min(toCall, p.stack);
    p.stack -= amount;
    p.committedThisStreet += amount;
    p.totalCommitted += amount;
    state.pot += amount;
    if (p.stack === 0) p.allIn = true;
    recordAction(state, p, 'call', amount);
    return;
  }
  if (action.type === 'bet' || action.type === 'raise') {
    const target = action.amount; // total committed-this-street after
    const toCommit = Math.min(target - p.committedThisStreet, p.stack);
    const prevBet = state.currentBet;
    p.stack -= toCommit;
    p.committedThisStreet += toCommit;
    p.totalCommitted += toCommit;
    state.pot += toCommit;
    if (p.committedThisStreet > state.currentBet) {
      state.lastRaiseSize = p.committedThisStreet - prevBet;
      state.currentBet = p.committedThisStreet;
    }
    if (p.stack === 0) p.allIn = true;
    recordAction(state, p, action.type, p.committedThisStreet);
    return;
  }
  throw new Error('Unknown action: ' + JSON.stringify(action));
}

function postBlind(state, idx, amount) {
  const p = state.players[idx];
  const amt = Math.min(amount, p.stack);
  p.stack -= amt;
  p.committedThisStreet += amt;
  p.totalCommitted += amt;
  state.pot += amt;
  if (p.stack === 0) p.allIn = true;
}

// ──────────────────────────────────────────────
// 6. Rendering
// ──────────────────────────────────────────────

function renderState(state) {
  console.log('');
  console.log('═'.repeat(64));
  console.log(`[Hand #${state.handCount}]  Pot: $${state.pot}  Street: ${state.street.toUpperCase()}`);
  if (state.board.length > 0) {
    console.log(`Board: [ ${cardsStr(state.board)} ]`);
  }
  console.log('─'.repeat(64));
  for (let i = 1; i <= state.numPlayers; i++) {
    const idx = (state.btnIdx + i) % state.numPlayers;
    const p = state.players[idx];
    const pos = positionName(state, p);
    const you = p.isHero ? ' (You)' : '';
    let status = '';
    if (p.folded) status = ' [FOLD]';
    else if (p.allIn) status = ' [ALL-IN]';
    const bet = p.committedThisStreet > 0 ? `  bet:$${p.committedThisStreet}` : '';
    console.log(`  ${pos.padEnd(4)}${p.name.padEnd(10)} $${p.stack}${bet}${status}${you}`);
  }
  console.log('─'.repeat(64));
  const hero = state.players[state.heroIdx];
  if (!hero.folded) {
    console.log(`Your hand: [ ${cardsStr(hero.cards)} ]   Pos: ${positionName(state, hero)}`);
  }
}

function renderActionsThisStreet(state) {
  const recent = state.actions.filter(a => a.street === state.street);
  if (recent.length === 0) return;
  console.log('Actions:');
  for (const a of recent) {
    let line = `  ${a.position.padEnd(4)}${a.player.padEnd(10)} ${a.action}`;
    if (a.amount !== undefined) line += ` → $${a.amount}`;
    console.log(line);
  }
}

// ──────────────────────────────────────────────
// 7. Hero input
// ──────────────────────────────────────────────

function question(rl, prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

function minRaiseTotal(state, p) {
  // total committed-this-street the player must reach to make a min raise
  const inc = Math.max(state.lastRaiseSize, state.bb);
  return state.currentBet + inc;
}

async function getHeroAction(state, rl) {
  const hero = state.players[state.heroIdx];
  const toCall = state.currentBet - hero.committedThisStreet;
  const canCheck = toCall === 0;
  const minR = minRaiseTotal(state, hero);
  const maxR = hero.committedThisStreet + hero.stack;

  let prompt = '\n[ ';
  prompt += 'f=fold  ';
  prompt += canCheck ? 'c=check  ' : `c=call $${toCall}  `;
  if (maxR > state.currentBet) {
    prompt += `r [amount]=raise (min $${Math.min(minR, maxR)})  `;
  }
  prompt += `a=all-in ($${hero.stack})  q=quit ]\n> `;

  while (true) {
    const raw = (await question(rl, prompt)).trim().toLowerCase();
    if (raw === 'q' || raw === 'quit') return { type: 'quit' };
    if (raw === 'f' || raw === 'fold') {
      if (canCheck) {
        const conf = (await question(rl, 'Check is free — fold anyway? [y/N] ')).trim().toLowerCase();
        if (!conf.startsWith('y')) continue;
      }
      return { type: 'fold' };
    }
    if (raw === 'c' || raw === 'call' || raw === 'check') {
      return canCheck ? { type: 'check' } : { type: 'call' };
    }
    if (raw === 'a' || raw === 'allin' || raw === 'all-in') {
      const target = hero.committedThisStreet + hero.stack;
      return target <= state.currentBet ? { type: 'call' } : { type: 'raise', amount: target };
    }
    const m = raw.match(/^r(?:aise)?\s*([0-9]+)?$/);
    if (m) {
      let amt = m[1] ? parseInt(m[1]) : Math.min(minR, maxR);
      if (amt < minR && amt < maxR) {
        console.log(`最小レイズは $${minR} です（all-inの場合のみ例外）。`);
        continue;
      }
      if (amt > maxR) {
        console.log(`スタックを超えています。最大 $${maxR}（all-in）。`);
        continue;
      }
      return amt >= maxR ? { type: 'raise', amount: maxR } : { type: 'raise', amount: amt };
    }
    console.log('入力が不正です。 f / c / r [amount] / a / q から選んでください。');
  }
}

// ──────────────────────────────────────────────
// 8. Betting round
// ──────────────────────────────────────────────

async function bettingRound(state, rl) {
  const isPreflop = state.street === 'preflop';

  // Build action order
  const actionOrder = [];
  if (isPreflop) {
    for (let i = 3; i < 3 + state.numPlayers; i++) {
      const idx = (state.btnIdx + i) % state.numPlayers;
      const p = state.players[idx];
      if (!p.folded) actionOrder.push(p);
    }
  } else {
    for (let i = 1; i <= state.numPlayers; i++) {
      const idx = (state.btnIdx + i) % state.numPlayers;
      const p = state.players[idx];
      if (!p.folded && !p.allIn) actionOrder.push(p);
    }
  }

  if (bettingComplete(state)) return false;

  const queue = actionOrder.filter(p => !p.allIn).slice();
  while (queue.length > 0) {
    if (state.players.filter(p => !p.folded).length <= 1) return true;
    const p = queue.shift();
    if (p.folded || p.allIn) continue;

    // If everyone else already all-in or folded and this player has matched, skip
    if (bettingComplete(state) && state.currentBet === p.committedThisStreet) continue;

    let action;
    if (p.isHero) {
      renderActionsThisStreet(state);
      action = await getHeroAction(state, rl);
      if (action.type === 'quit') return 'quit';
    } else {
      action = aiDecide(state, p);
    }
    applyAction(state, p, action);

    // Print AI action live
    if (!p.isHero) {
      const last = state.actions[state.actions.length - 1];
      let line = `  ${last.position.padEnd(4)}${last.player.padEnd(10)} ${last.action}`;
      if (last.amount !== undefined) line += ` → $${last.amount}`;
      console.log(line);
    }

    if (action.type === 'bet' || action.type === 'raise') {
      for (let i = 1; i < state.numPlayers; i++) {
        const idx = (p.idx + i) % state.numPlayers;
        const other = state.players[idx];
        if (other.idx === p.idx) continue;
        if (other.folded || other.allIn) continue;
        if (other.committedThisStreet < state.currentBet && !queue.includes(other)) {
          queue.push(other);
        }
      }
    }
  }
  return false;
}

function bettingComplete(state) {
  const inHand = state.players.filter(p => !p.folded);
  const canBet = inHand.filter(p => !p.allIn);
  return canBet.length <= 1;
}

function onlyOneLeft(state) {
  return state.players.filter(p => !p.folded).length <= 1;
}

function resetStreetCommits(state) {
  for (const p of state.players) p.committedThisStreet = 0;
  state.currentBet = 0;
  state.lastRaiseSize = state.bb;
}

// ──────────────────────────────────────────────
// 9. Pot distribution (with side pots)
// ──────────────────────────────────────────────

function distributePot(state) {
  const stillIn = state.players.filter(p => !p.folded);
  // Uncontested
  if (stillIn.length === 1) {
    stillIn[0].stack += state.pot;
    return [{ type: 'main', amount: state.pot, winners: [stillIn[0].name], best: null }];
  }
  for (const p of stillIn) p.handScore = evaluate7([...p.cards, ...state.board]);

  // Side-pot levels come from non-folded players' commitments only.
  // Folded-player contributions get folded into pots at the level they paid into.
  const levels = [...new Set(stillIn.map(p => p.totalCommitted))].sort((a, b) => a - b);
  const results = [];
  let prev = 0;
  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
    let potSize = 0;
    for (const p of state.players) {
      potSize += Math.max(0, Math.min(p.totalCommitted, level) - prev);
    }
    if (potSize === 0) { prev = level; continue; }
    const eligible = stillIn.filter(p => p.totalCommitted >= level);
    eligible.sort((a, b) => compareScores(b.handScore, a.handScore));
    const winners = eligible.filter(p => compareScores(p.handScore, eligible[0].handScore) === 0);
    const share = Math.floor(potSize / winners.length);
    const remainder = potSize - share * winners.length;
    winners.forEach((w, i) => { w.stack += share + (i === 0 ? remainder : 0); });
    results.push({
      type: li === 0 ? 'main' : `side-${li}`,
      amount: potSize,
      winners: winners.map(w => w.name),
      best: handDescription(winners[0].handScore),
    });
    prev = level;
  }
  return results;
}

// ──────────────────────────────────────────────
// 10. Hand history save
// ──────────────────────────────────────────────

function saveHandHistory(state, stacksStart, stacksEnd, results) {
  const dir = path.join(__dirname, 'hands');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `hand_${ts}_${String(state.handCount).padStart(4, '0')}.json`);
  const data = {
    hand_id: state.handCount,
    timestamp: new Date().toISOString(),
    hero_position: positionName(state, state.players[state.heroIdx]),
    hero_cards: state.players[state.heroIdx].cards.map(c => c.code),
    board: state.board.map(c => c.code),
    stacks_start: stacksStart,
    stacks_end: stacksEnd,
    actions: state.actions,
    showdown: !onlyOneLeft(state)
      ? state.players.filter(p => !p.folded).map(p => ({
          player: p.name,
          position: positionName(state, p),
          cards: p.cards.map(c => c.code),
          hand: handDescription(p.handScore),
        }))
      : null,
    results,
    hero_net: stacksEnd['Hero'] - stacksStart['Hero'],
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

// ──────────────────────────────────────────────
// 11. Hand orchestration
// ──────────────────────────────────────────────

async function playHand(state, rl) {
  state.handCount++;
  state.pot = 0;
  state.board = [];
  state.actions = [];
  state.street = 'preflop';
  state.currentBet = 0;
  state.lastRaiseSize = state.bb;
  for (const p of state.players) {
    p.cards = [];
    p.folded = p.stack <= 0; // sit out if no chips
    p.allIn = false;
    p.committedThisStreet = 0;
    p.totalCommitted = 0;
    p.handScore = null;
  }
  const active = state.players.filter(p => !p.folded);
  if (active.length < 2) {
    console.log('Not enough players with chips.');
    return 'quit';
  }

  // Move button to next chipped player
  // (For MVP we just advance even if seat is sit-out; nextActive ensures blinds work)
  const nextActive = (from) => {
    let i = from;
    for (let k = 0; k < state.numPlayers; k++) {
      i = (i + 1) % state.numPlayers;
      if (!state.players[i].folded) return i;
    }
    return from;
  };

  const sbIdx = nextActive(state.btnIdx);
  const bbIdx = nextActive(sbIdx);
  postBlind(state, sbIdx, state.sb);
  postBlind(state, bbIdx, state.bb);
  state.currentBet = state.bb;
  state.lastRaiseSize = state.bb;

  const deck = shuffle(makeDeck());
  for (let r = 0; r < 2; r++) {
    for (const p of state.players) {
      if (!p.folded) p.cards.push(deck.pop());
    }
  }

  const stacksStart = {};
  for (const p of state.players) stacksStart[p.name] = p.stack + p.totalCommitted;

  renderState(state);

  let res = await bettingRound(state, rl);
  if (res === 'quit') return 'quit';

  // Subsequent streets
  for (const street of ['flop', 'turn', 'river']) {
    if (onlyOneLeft(state)) break;
    resetStreetCommits(state);
    state.street = street;
    deck.pop(); // burn
    if (street === 'flop') {
      state.board.push(deck.pop(), deck.pop(), deck.pop());
    } else {
      state.board.push(deck.pop());
    }
    renderState(state);
    if (bettingComplete(state)) {
      console.log('(全員 all-in / 行動不能 — ベッティングをスキップしてラン・イット・アウト)');
      continue;
    }
    res = await bettingRound(state, rl);
    if (res === 'quit') return 'quit';
  }

  // Resolve
  const results = distributePot(state);
  console.log('');
  console.log('━━━━━━━━━━━━━━ RESULT ━━━━━━━━━━━━━━');
  if (!onlyOneLeft(state)) {
    console.log('Showdown:');
    for (const p of state.players.filter(p => !p.folded)) {
      console.log(`  ${positionName(state, p).padEnd(4)}${p.name.padEnd(10)} [${cardsStr(p.cards)}]  → ${handDescription(p.handScore)}`);
    }
  }
  for (const r of results) {
    const desc = r.best ? ` (${r.best})` : '';
    console.log(`  ${r.type === 'main' ? 'Pot' : r.type}: $${r.amount} → ${r.winners.join(', ')}${desc}`);
  }
  const stacksEnd = {};
  for (const p of state.players) stacksEnd[p.name] = p.stack;
  const net = stacksEnd['Hero'] - stacksStart['Hero'];
  console.log('');
  console.log(`Your net: ${net >= 0 ? '+' : ''}$${net}   Stack: $${stacksEnd['Hero']}`);
  const file = saveHandHistory(state, stacksStart, stacksEnd, results);
  console.log(`(saved: ${path.relative(process.cwd(), file)})`);

  state.btnIdx = nextActive(state.btnIdx);
  return 'continue';
}

// ──────────────────────────────────────────────
// 12. Main loop
// ──────────────────────────────────────────────

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   6-max NL Hold\'em ターミナル学習アプリ  (NL2 / $1-$2)         ║');
  console.log('║   Hero = You.  AI 5人 vs You.                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('難易度を選んでください:');
  console.log('  1) easy    初心者だらけ（カモ多め・エクスプロイト練習向け）');
  console.log('  2) medium  ミックス（TAG/カモ/LAG混在・標準練習）★推奨');
  console.log('  3) hard    強敵だらけ（TAG/LAG中心・GTO練習向け）');
  const diffInput = (await question(rl, '選択 [1/2/3, 既定=2]: ')).trim();
  const difficulty = diffInput === '1' ? 'easy' : diffInput === '3' ? 'hard' : 'medium';

  const state = createGame(difficulty);

  console.log('');
  console.log(`難易度: ${difficulty.toUpperCase()}`);
  console.log('── テーブル構成（相手のタイプ）──');
  for (const p of state.players) {
    if (!p.isHero) console.log(`  ${p.name.padEnd(9)} ${AI_TYPES[p.aiType].label}`);
  }
  console.log('───────────────────────────────');
  console.log('操作: f=fold  c=call/check  r [amount]=raise  a=all-in  q=quit');
  console.log(`スタック: $${state.startStack}   ブラインド: $${state.sb}/$${state.bb}`);
  console.log('');

  while (true) {
    if (state.players[state.heroIdx].stack <= 0) {
      const a = (await question(rl, 'チップ切れ。 $200 reload? [y/n] ')).trim().toLowerCase();
      if (!a.startsWith('y')) break;
      state.players[state.heroIdx].stack = state.startStack;
    }
    for (const p of state.players) {
      if (!p.isHero && p.stack < state.bb) p.stack = state.startStack; // auto-rebuy villains
    }

    const r = await playHand(state, rl);
    if (r === 'quit') break;

    const next = (await question(rl, '\n次のハンド? [Enter=Yes / q=quit] ')).trim().toLowerCase();
    if (next === 'q' || next === 'quit') break;
  }

  console.log('\nお疲れさまでした。 hands/ に履歴が保存されています。');
  rl.close();
}

main().catch(err => { console.error(err); process.exit(1); });
