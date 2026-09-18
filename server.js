/**
 * server.js — Công Nghệ Vip PAK 2026
 * Dice Signal Analyzer — Omega Bridge v4 Engine
 * Developer: Anh Khôi
 *
 * Nguồn API: https://sunwin-taixiu-dulieu.onrender.com/data
 */

'use strict';

const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'https://sunwin-taixiu-dulieu.onrender.com/data';

const HISTORY_LIMIT = 3000;
const FETCH_INTERVAL_MS = 22000;
const FETCH_TIMEOUT_MS = 15000;
const PREDICTION_TTL_MS = 6 * 60 * 1000;
const LOG_LIMIT = 150;

/* ---------- Time ---------- */
const VN_FMT = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});
function vnNow() {
  return VN_FMT.format(new Date()).replace('T', ' ');
}

/* ============================================================
   OMEGA CONFIG
   ============================================================ */
const OMEGA_CONFIG = {
  minHistory: 120,
  maxOrder: 6,
  windows: [8, 12, 16, 20, 30, 50, 80, 120, 250, 500],
  similarityLengths: [5, 6, 7, 8, 10, 12],
  minSupport: 12,
  strongSupport: 30,
  alpha: 1,
  signalThreshold: 0.56,
  strongThreshold: 0.68,
  probabilityFloor: 0.05,
  probabilityCeil: 0.95,
  similarityLimit: 4000,
  conflictPenalty: 0.65,
  noisyPenalty: 0.55,
  probabilityCompression: 0.82
};

/* ============================================================
   OMEGA MATH
   ============================================================ */
const OmegaMath = {
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
  safeNumber(v, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb; },
  probability(t, x, alpha = 1) {
    const total = t + x;
    if (total <= 0) return 0.5;
    return (t + alpha) / (total + alpha * 2);
  },
  edge(p) { return Math.abs(p - 0.5) * 2; },
  entropy(p) {
    p = this.clamp(p, 1e-12, 1 - 1e-12);
    return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
  },
  direction(p) { return p >= 0.5 ? 'T' : 'X'; },
  opposite(s) { return s === 'T' ? 'X' : 'T'; },
  weightedAverage(items) {
    let n = 0, d = 0;
    for (const it of items) {
      if (!Number.isFinite(it.value)) continue;
      if (!Number.isFinite(it.weight) || it.weight <= 0) continue;
      n += it.value * it.weight;
      d += it.weight;
    }
    return d <= 0 ? 0.5 : n / d;
  },
  average(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  },
  seqKey(seq) { return seq.join(''); }
};

/* ============================================================
   NORMALIZE
   ============================================================ */
function parseRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const phien = Number(r.phien);
  if (!Number.isFinite(phien) || phien <= 0) return null;

  const x1 = Number(r.xuc_xac_1);
  const x2 = Number(r.xuc_xac_2);
  const x3 = Number(r.xuc_xac_3);
  let tong = Number(r.tong);
  if (!Number.isFinite(tong)) tong = x1 + x2 + x3;

  if (x1 < 1 || x1 > 6 || x2 < 1 || x2 > 6 || x3 < 1 || x3 > 6) return null;

  const raw = String(r.ket_qua || '').trim().toUpperCase();
  let side;
  if (raw === 'TÀI' || raw === 'TAI' || raw === 'T') side = 'T';
  else if (raw === 'XỈU' || raw === 'XIU' || raw === 'X') side = 'X';
  else side = tong >= 11 ? 'T' : 'X';

  return {
    phien, x1, x2, x3, tong, side,
    time: typeof r.thoi_gian === 'string' ? r.thoi_gian : vnNow(),
  };
}

function parseAll(records) {
  if (!Array.isArray(records)) return [];
  const result = [];
  const seen = new Set();
  for (const r of records) {
    const v = parseRecord(r);
    if (!v) continue;
    if (seen.has(v.phien)) continue;
    seen.add(v.phien);
    result.push(v);
  }
  result.sort((a, b) => a.phien - b.phien);
  return result;
}

/* ============================================================
   SEQUENCE
   ============================================================ */
function encodeRuns(seq) {
  if (!seq.length) return [];
  const runs = [];
  let side = seq[0], len = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === side) len++;
    else { runs.push({ side, length: len }); side = seq[i]; len = 1; }
  }
  runs.push({ side, length: len });
  return runs;
}

/* ============================================================
   SIGNAL ANALYZERS
   ============================================================ */
function sigEqualBlock(seq) {
  const runs = encodeRuns(seq);
  if (runs.length < 2) return { name: 'EQUAL_BLOCK', probability: 0.5, strength: 0, support: 0 };
  const cur = runs[runs.length - 1];
  const cands = [];
  for (let i = 0; i < runs.length - 1; i++) {
    if (runs[i].length === cur.length) cands.push(runs[i + 1] ? runs[i + 1].side : null);
  }
  const valid = cands.filter(Boolean);
  let t = 0, x = 0;
  for (const s of valid) { if (s === 'T') t++; else x++; }
  const p = OmegaMath.probability(t, x, OMEGA_CONFIG.alpha);
  return {
    name: 'EQUAL_BLOCK_' + cur.length,
    probability: p,
    strength: valid.length >= OMEGA_CONFIG.minSupport ? OmegaMath.edge(p) : 0,
    support: valid.length
  };
}

function sigAlternating(seq, window) {
  const data = seq.slice(-window);
  if (data.length < 4) return { name: 'ALT_' + window, probability: 0.5, strength: 0, support: 0 };
  let alt = 0;
  for (let i = 1; i < data.length; i++) if (data[i] !== data[i - 1]) alt++;
  const ratio = alt / (data.length - 1);
  const last = data[data.length - 1];
  const pred = OmegaMath.opposite(last);
  const edge = ratio * 0.42;
  const p = pred === 'T' ? 0.5 + edge : 0.5 - edge;
  return {
    name: 'ALT_' + window,
    probability: OmegaMath.clamp(p, 0.05, 0.95),
    strength: ratio * 0.90,
    support: data.length - 1
  };
}

function sigBlock(seq, blockSize) {
  const runs = encodeRuns(seq);
  if (runs.length < 4) return { name: 'BLOCK_' + blockSize, probability: 0.5, strength: 0, support: 0 };
  let t = 0, x = 0;
  for (let i = 0; i < runs.length - 1; i++) {
    if (runs[i].length !== blockSize) continue;
    if (runs[i + 1].side === 'T') t++; else x++;
  }
  const p = OmegaMath.probability(t, x, OMEGA_CONFIG.alpha);
  return {
    name: 'BLOCK_' + blockSize,
    probability: p,
    strength: (t + x) >= OMEGA_CONFIG.minSupport ? OmegaMath.edge(p) : 0,
    support: t + x
  };
}

function sigRunContinuation(seq) {
  const runs = encodeRuns(seq);
  const cur = runs[runs.length - 1];
  if (!cur) return { name: 'RUN_CONT', probability: 0.5, strength: 0, support: 0 };
  let t = 0, x = 0;
  for (let i = 0; i < runs.length - 1; i++) {
    const r = runs[i];
    if (r.side === cur.side && r.length === cur.length) {
      if (runs[i + 1].side === 'T') t++; else x++;
    }
  }
  const support = t + x;
  const p = OmegaMath.probability(t, x, OMEGA_CONFIG.alpha);
  return {
    name: 'RUN_CONT',
    probability: p,
    strength: support >= OMEGA_CONFIG.minSupport ? OmegaMath.edge(p) : 0,
    support
  };
}

function sigRunShape(seq) {
  const runs = encodeRuns(seq);
  const shapes = [
    [1,2,1],[2,1,2],[1,2,2,1],[2,1,1,2],
    [1,3,1],[3,1,3],[2,2,1,2],[2,1,2,2]
  ];
  const sigs = [];
  for (const shape of shapes) {
    if (runs.length < shape.length) continue;
    const curShape = runs.slice(-shape.length).map(r => r.length);
    if (OmegaMath.seqKey(curShape) !== OmegaMath.seqKey(shape)) continue;
    let t = 0, x = 0;
    for (let i = shape.length; i < runs.length; i++) {
      const cand = runs.slice(i - shape.length, i).map(r => r.length);
      if (OmegaMath.seqKey(cand) !== OmegaMath.seqKey(shape)) continue;
      if (runs[i].side === 'T') t++; else x++;
    }
    const p = OmegaMath.probability(t, x, OMEGA_CONFIG.alpha);
    sigs.push({ probability: p, support: t + x });
  }
  if (!sigs.length) return { name: 'RUN_SHAPE', probability: 0.5, strength: 0, support: 0 };
  const usable = sigs.filter(s => s.support > 0);
  if (!usable.length) return { name: 'RUN_SHAPE', probability: 0.5, strength: 0, support: 0 };
  const p = OmegaMath.weightedAverage(usable.map(s => ({
    value: s.probability, weight: Math.log1p(s.support)
  })));
  return {
    name: 'RUN_SHAPE',
    probability: p,
    strength: OmegaMath.edge(p),
    support: usable.reduce((sum, s) => sum + s.support, 0)
  };
}

function sigStaircase(seq) {
  const runs = encodeRuns(seq);
  if (runs.length < 3) return { name: 'STAIRCASE', probability: 0.5, strength: 0, support: 0 };
  const recent = runs.slice(-5);
  const lens = recent.map(r => r.length);
  let inc = 0, dec = 0;
  for (let i = 1; i < lens.length; i++) {
    if (lens[i] > lens[i - 1]) inc++;
    if (lens[i] < lens[i - 1]) dec++;
  }
  const cmp = Math.max(1, lens.length - 1);
  const incR = inc / cmp, decR = dec / cmp;
  const last = recent[recent.length - 1];
  let p = 0.5;
  if (incR >= 0.75) p = last.side === 'T' ? 0.54 : 0.46;
  else if (decR >= 0.75) p = last.side === 'T' ? 0.46 : 0.54;
  return {
    name: 'STAIRCASE',
    probability: p,
    strength: Math.max(incR, decR) * 0.25,
    support: cmp
  };
}

function sigMirror(seq) {
  const L = 4;
  if (seq.length < L * 2) return { name: 'MIRROR', probability: 0.5, strength: 0, support: 0 };
  const left = seq.slice(-L * 2, -L);
  const right = seq.slice(-L);
  let m = 0;
  for (let i = 0; i < L; i++) if (right[i] === left[L - 1 - i]) m++;
  const ratio = m / L;
  if (ratio < 0.75) return { name: 'MIRROR', probability: 0.5, strength: 0, support: L };
  const pred = left[0];
  const p = pred === 'T' ? 0.5 + ratio * 0.18 : 0.5 - ratio * 0.18;
  return {
    name: 'MIRROR',
    probability: OmegaMath.clamp(p, 0.05, 0.95),
    strength: ratio * 0.25,
    support: L
  };
}

function sigCycle(seq) {
  let best = null;
  const maxP = Math.min(16, Math.floor(seq.length / 4));
  for (let period = 2; period <= maxP; period++) {
    let same = 0, total = 0;
    for (let i = period; i < seq.length; i++) {
      total++;
      if (seq[i] === seq[i - period]) same++;
    }
    if (total <= 0) continue;
    const ratio = same / total;
    if (!best || ratio > best.ratio) best = { period, ratio, support: total };
  }
  if (!best || best.ratio < 0.65) return { name: 'CYCLE', probability: 0.5, strength: 0, support: 0 };
  const pred = seq[seq.length - best.period];
  const p = pred === 'T'
    ? 0.5 + (best.ratio - 0.5) * 0.45
    : 0.5 - (best.ratio - 0.5) * 0.45;
  return {
    name: 'CYCLE',
    probability: OmegaMath.clamp(p, 0.05, 0.95),
    strength: (best.ratio - 0.5) * 1.4,
    support: best.support
  };
}

function sigMarkov(seq, order) {
  if (seq.length <= order) return { name: 'MARKOV_' + order, probability: 0.5, strength: 0, support: 0 };
  const ctx = seq.slice(-order);
  let t = 0, x = 0;
  for (let i = order; i < seq.length; i++) {
    const prev = seq.slice(i - order, i);
    if (OmegaMath.seqKey(prev) !== OmegaMath.seqKey(ctx)) continue;
    if (seq[i] === 'T') t++; else x++;
  }
  const support = t + x;
  const p = OmegaMath.probability(t, x, OMEGA_CONFIG.alpha);
  const usable = support >= OMEGA_CONFIG.minSupport;
  return {
    name: 'MARKOV_' + order,
    probability: usable ? p : 0.5,
    strength: usable ? OmegaMath.edge(p) : 0,
    support
  };
}

function sigSimilarity(seq, length) {
  if (seq.length <= length + 1) return { name: 'SIM_' + length, probability: 0.5, strength: 0, support: 0 };
  const target = seq.slice(-length);
  const start = Math.max(length, seq.length - OMEGA_CONFIG.similarityLimit);
  let wt = 0, wx = 0, matches = 0;
  for (let i = start; i < seq.length; i++) {
    const cand = seq.slice(i - length, i);
    if (cand.length !== length) continue;
    const actual = seq[i];
    let d = 0;
    for (let j = 0; j < length; j++) if (target[j] !== cand[j]) d++;
    const w = Math.exp(-0.70 * d);
    if (w < 0.015) continue;
    if (actual === 'T') wt += w; else wx += w;
    matches++;
  }
  const total = wt + wx;
  if (total <= 0) return { name: 'SIM_' + length, probability: 0.5, strength: 0, support: 0 };
  const p = wt / total;
  return {
    name: 'SIM_' + length,
    probability: OmegaMath.clamp(p, 0.05, 0.95),
    strength: OmegaMath.edge(p),
    support: matches
  };
}

function sigRecency(seq) {
  const wins = [];
  for (const size of OMEGA_CONFIG.windows) {
    if (seq.length < size) continue;
    const data = seq.slice(-size);
    const t = data.filter(x => x === 'T').length;
    const p = OmegaMath.probability(t, size - t, OMEGA_CONFIG.alpha);
    const w = 1 / Math.sqrt(size);
    wins.push({ probability: p, support: size, weight: w });
  }
  if (!wins.length) return { name: 'RECENCY', probability: 0.5, strength: 0, support: 0 };
  const p = OmegaMath.weightedAverage(wins.map(w => ({ value: w.probability, weight: w.weight })));
  return {
    name: 'RECENCY',
    probability: p,
    strength: OmegaMath.edge(p),
    support: wins.reduce((s, w) => s + w.support, 0)
  };
}

function sigMomentum(seq) {
  if (seq.length < 30) return { name: 'MOMENTUM', probability: 0.5, strength: 0, support: 0 };
  const s = seq.slice(-10), m = seq.slice(-30), l = seq.slice(-100);
  const r = arr => arr.filter(x => x === 'T').length / arr.length;
  const ps = r(s), pm = r(m), pl = r(l);
  const delta = (ps * 0.55 + pm * 0.30 + pl * 0.15) - 0.5;
  const p = OmegaMath.clamp(0.5 + delta * 0.75, 0.05, 0.95);
  return {
    name: 'MOMENTUM',
    probability: p,
    strength: Math.abs(delta) * 1.5,
    support: s.length + m.length + l.length
  };
}

function sigTransition(seq) {
  let TT = 0, TX = 0, XT = 0, XX = 0;
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    if (a === 'T' && b === 'T') TT++;
    if (a === 'T' && b === 'X') TX++;
    if (a === 'X' && b === 'T') XT++;
    if (a === 'X' && b === 'X') XX++;
  }
  const cur = seq[seq.length - 1];
  let p, support;
  if (cur === 'T') { p = OmegaMath.probability(TT, TX); support = TT + TX; }
  else { p = OmegaMath.probability(XT, XX); support = XT + XX; }
  return {
    name: 'TRANSITION',
    probability: p,
    strength: OmegaMath.edge(p),
    support
  };
}

function analyzeRegime(seq) {
  const data = seq.slice(-60);
  if (data.length < 20) return { type: 'UNKNOWN', confidence: 0 };
  const runs = encodeRuns(data);
  const avgRun = OmegaMath.average(runs.map(r => r.length));
  let tr = 0;
  for (let i = 1; i < data.length; i++) if (data[i] !== data[i - 1]) tr++;
  const alt = tr / (data.length - 1);
  const t = data.filter(x => x === 'T').length;
  const bias = Math.abs(t / data.length - 0.5);
  let type = 'BALANCED';
  if (alt >= 0.82) type = 'STRONG_ALTERNATING';
  else if (alt >= 0.70) type = 'ALTERNATING';
  else if (avgRun >= 4) type = 'LONG_RUN';
  else if (avgRun >= 2.2) type = 'SHORT_RUN';
  const H = OmegaMath.entropy(t / data.length);
  if (H >= 0.995 && alt > 0.42 && alt < 0.62) type = 'NOISY';
  const conf = OmegaMath.clamp(Math.max(alt, 1 - alt, bias * 2), 0, 1);
  return { type, confidence: conf, averageRun: avgRun, alternation: alt, bias, entropy: H, sample: data.length };
}

function analyzeEntropy(seq) {
  const wins = [20, 50, 100];
  const res = [];
  for (const size of wins) {
    if (seq.length < size) continue;
    const data = seq.slice(-size);
    const p = data.filter(x => x === 'T').length / data.length;
    const H = OmegaMath.entropy(p);
    res.push({ entropy: H, predictability: 1 - H });
  }
  if (!res.length) return { entropy: 1, predictability: 0 };
  return {
    entropy: OmegaMath.average(res.map(x => x.entropy)),
    predictability: OmegaMath.average(res.map(x => x.predictability))
  };
}

/* ============================================================
   OMEGA PREDICT
   ============================================================ */
function omegaPredict(history) {
  if (history.length < OMEGA_CONFIG.minHistory) {
    return {
      status: 'INSUFFICIENT_DATA',
      side: null,
      probability: 0.5,
      confidence: 0,
      historySize: history.length,
      signals: [],
      regime: null
    };
  }

  const seq = history.map(x => x.side);
  const signals = [];

  const add = (sig, baseWeight) => {
    if (!sig) return;
    const support = Number(sig.support || 0);
    const supF = OmegaMath.clamp(
      Math.log1p(support) / Math.log1p(OMEGA_CONFIG.strongSupport), 0, 1
    );
    const strength = OmegaMath.clamp(Number(sig.strength || 0), 0, 1);
    const evidence = 0.25 + 0.45 * supF + 0.30 * strength;
    signals.push({ ...sig, effectiveWeight: baseWeight * evidence });
  };

  add(sigEqualBlock(seq), 1.15);
  for (const w of [12, 20, 30, 50]) add(sigAlternating(seq, w), 0.90);
  for (const bs of [2, 3, 4, 5]) add(sigBlock(seq, bs), 0.82);
  add(sigRunShape(seq), 1.00);
  add(sigStaircase(seq), 0.55);
  add(sigMirror(seq), 0.45);
  add(sigCycle(seq), 0.65);
  add(sigRunContinuation(seq), 0.90);
  for (let order = 1; order <= OMEGA_CONFIG.maxOrder; order++) {
    add(sigMarkov(seq, order), 1.00 - (order - 1) * 0.09);
  }
  for (const length of OMEGA_CONFIG.similarityLengths) {
    add(sigSimilarity(seq, length), 0.95);
  }
  add(sigRecency(seq), 0.65);
  add(sigMomentum(seq), 0.48);
  add(sigTransition(seq), 0.70);

  const regime = analyzeRegime(seq);
  const entropy = analyzeEntropy(seq);

  let sum = 0, weight = 0;
  for (const s of signals) {
    let w = s.effectiveWeight;
    const edge = OmegaMath.edge(s.probability);
    w *= 0.45 + 0.55 * edge;
    sum += s.probability * w;
    weight += w;
  }
  let p = weight > 0 ? sum / weight : 0.5;

  let tw = 0, xw = 0;
  for (const s of signals) {
    if (s.effectiveWeight <= 0) continue;
    if (s.probability >= 0.5) tw += s.effectiveWeight;
    else xw += s.effectiveWeight;
  }
  const tot = tw + xw;
  const agreement = tot > 0 ? Math.max(tw, xw) / tot : 0;
  const conflict = 1 - agreement;

  let regimeFactor = 1;
  switch (regime.type) {
    case 'STRONG_ALTERNATING': regimeFactor = 0.94; break;
    case 'ALTERNATING': regimeFactor = 0.90; break;
    case 'LONG_RUN': regimeFactor = 0.88; break;
    case 'SHORT_RUN': regimeFactor = 0.82; break;
    case 'NOISY': regimeFactor = OMEGA_CONFIG.noisyPenalty; break;
    default: regimeFactor = 0.75;
  }

  p = 0.5 + (p - 0.5) * regimeFactor * OMEGA_CONFIG.probabilityCompression;

  const entF = OmegaMath.clamp(entropy.predictability * 0.75 + 0.25, 0.25, 1);
  const finalEdge = OmegaMath.edge(p);
  let confidence = finalEdge * (0.42 + 0.38 * agreement + 0.20 * entF);
  confidence *= 1 - conflict * OMEGA_CONFIG.conflictPenalty;
  confidence = OmegaMath.clamp(confidence, 0, 1);

  let status = 'NO_SIGNAL';
  if (confidence >= OMEGA_CONFIG.strongThreshold) status = 'STRONG_SIGNAL';
  else if (confidence >= OMEGA_CONFIG.signalThreshold) status = 'SIGNAL';

  p = OmegaMath.clamp(p, OMEGA_CONFIG.probabilityFloor, OMEGA_CONFIG.probabilityCeil);

  const side = OmegaMath.direction(p) === 'T' ? 'TAI' : 'XIU';

  const ranked = [...signals].sort((a, b) =>
    (b.effectiveWeight * b.strength) - (a.effectiveWeight * a.strength)
  );

  return {
    status,
    side,
    direction: OmegaMath.direction(p),
    probability: p,
    confidence,
    agreement,
    conflict,
    regime: regime.type,
    regimeConfidence: regime.confidence,
    historySize: history.length,
    signals: ranked.slice(0, 10).map(s => ({
      name: s.name,
      direction: OmegaMath.direction(s.probability) === 'T' ? 'TAI' : 'XIU',
      probability: s.probability,
      strength: s.strength,
      support: s.support
    }))
  };
}

/* ============================================================
   STATE
   ============================================================ */
const stats = {
  total: 0,
  correct: 0,
  wrong: 0,
  fallback_total: 0,
  fallback_correct: 0,
  noSignal_total: 0,
  start_time: vnNow()
};

let lastData = [];
let lastPrediction = null;
let predictionLog = [];
let isFetching = false;
let errorStreak = 0;

/* ============================================================
   FETCH
   ============================================================ */
async function fetchAndAnalyze() {
  if (isFetching) return;
  isFetching = true;
  try {
    const res = await axios.get(API_URL, { timeout: FETCH_TIMEOUT_MS });
    const raw = res.data;
    if (!raw) { console.warn('[WARN] payload rỗng'); return; }

    let recordsRaw = [];
    if (Array.isArray(raw)) recordsRaw = raw;
    else if (Array.isArray(raw.data)) recordsRaw = raw.data;
    else if (Array.isArray(raw.history)) recordsRaw = raw.history;
    else if (Array.isArray(raw.results)) recordsRaw = raw.results;

    const normalized = parseAll(recordsRaw);
    const dataDesc = [...normalized].sort((a, b) => b.phien - a.phien).slice(0, HISTORY_LIMIT);
    lastData = dataDesc;

    if (lastPrediction) {
      const match = dataDesc.find(d => d.phien === lastPrediction.phienDuDoan);
      if (match) {
        const actual = match.side === 'T' ? 'TAI' : 'XIU';
        const isCorrect = lastPrediction.side === actual;

        predictionLog.unshift({
          phien: match.phien,
          predict: lastPrediction.side,
          actual,
          confidence: lastPrediction.confidence,
          tag: lastPrediction.tag,
          correct: isCorrect,
          fallback: lastPrediction.fallback,
          time: match.time
        });
        if (predictionLog.length > LOG_LIMIT) predictionLog.pop();

        if (!lastPrediction.fallback) {
          stats.total++;
          if (isCorrect) { stats.correct++; errorStreak = 0; }
          else { stats.wrong++; errorStreak++; }
        } else {
          stats.fallback_total++;
          if (isCorrect) stats.fallback_correct++;
        }

        console.log('[RESOLVED] #' + match.phien + ' | ' + lastPrediction.side + ' -> ' + actual + ' | ' + (isCorrect ? 'DUNG' : 'SAI'));
        lastPrediction = null;
      } else {
        const age = Date.now() - new Date(lastPrediction.iso).getTime();
        if (age > PREDICTION_TTL_MS) {
          predictionLog.unshift({
            phien: lastPrediction.phienDuDoan,
            predict: lastPrediction.side,
            actual: null,
            confidence: lastPrediction.confidence,
            tag: lastPrediction.tag,
            correct: false,
            fallback: lastPrediction.fallback,
            miss: true,
            time: vnNow()
          });
          if (predictionLog.length > LOG_LIMIT) predictionLog.pop();
          lastPrediction = null;
        }
      }
    }

    if (!lastPrediction && normalized.length >= OMEGA_CONFIG.minHistory) {
      const omega = omegaPredict(normalized);
      const nextPhien = dataDesc[0].phien + 1;

      const side = omega.side;
      const confPct = Math.round(omega.confidence * 100);

      const tagParts = [];
      if (omega.status === 'NO_SIGNAL') tagParts.push('NO_SIGNAL');
      else if (omega.status === 'STRONG_SIGNAL') tagParts.push('STRONG');
      else tagParts.push('SIGNAL');
      if (omega.regime) tagParts.push(omega.regime);

      const topSig = omega.signals.slice(0, 3)
        .map(s => s.name + ':' + s.direction + '(' + (s.probability * 100).toFixed(0) + '%)')
        .join(' · ');

      lastPrediction = {
        phienDuDoan: nextPhien,
        side: side || (omega.direction === 'T' ? 'TAI' : 'XIU'),
        confidence: Math.max(1, Math.min(99, confPct)),
        tag: tagParts.join(' · '),
        info: 'P(TAI)=' + (omega.probability * 100).toFixed(1) + '% · ' + (topSig || 'no strong pattern'),
        fallback: omega.status === 'NO_SIGNAL',
        timestamp: vnNow(),
        iso: new Date().toISOString()
      };

      console.log('[PREDICT] #' + nextPhien + ' -> ' + lastPrediction.side + ' (' + lastPrediction.confidence + '%) | ' + lastPrediction.tag);
    }
  } catch (err) {
    console.error('[FETCH ERROR]', err.message);
  } finally {
    isFetching = false;
  }
}

process.on('unhandledRejection', r => console.error('[UNHANDLED]', r));
process.on('uncaughtException', e => console.error('[UNCAUGHT]', e));

/* ============================================================
 * UI HOÀN TOÀN MỚI — 2026 Full Blue
 * (GIỮ NGUYÊN 100% NHƯ FILE GỐC CỦA BẠN)
 * ============================================================ */
const HTML = String.raw`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Công Nghệ Vip PAK 2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family
