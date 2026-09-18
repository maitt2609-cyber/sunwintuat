/**
 * server.js — Công Nghệ Vip HUYHOANG 2026
 * Dice Signal Analyzer — Phân loại Cầu Chi tiết
 * Developer: HUY HOANG
 *
 * Nguồn API: https://sunwin-taixiu-dulieu.onrender.com/data
 */

'use strict';

const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.API_URL || 'https://sunwin-taixiu-dulieu.onrender.com/data';

const HISTORY_LIMIT = 500;
const FETCH_INTERVAL_MS = 22000;
const FETCH_TIMEOUT_MS = 12000;
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

/* ---------- Normalize ---------- */
function normalizeSide(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['TAI', 'T', '1', 'TRUE'].includes(s)) return 'TAI';
  if (['XIU', 'X', '0', 'FALSE'].includes(s)) return 'XIU';
  return null;
}

function parseRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const phien = Number(r.phien);
  if (!Number.isFinite(phien) || phien <= 0) return null;
  const side = normalizeSide(r.ket_qua);
  if (!side) return null;

  const x1 = Number(r.xuc_xac_1);
  const x2 = Number(r.xuc_xac_2);
  const x3 = Number(r.xuc_xac_3);
  let tong = Number(r.tong);
  if (!Number.isFinite(tong)) tong = x1 + x2 + x3;

  return {
    phien, x1, x2, x3, tong, side,
    time: typeof r.thoi_gian === 'string' ? r.thoi_gian : vnNow(),
  };
}

/* ============================================================
 * CÁC HÀM PHÂN TÍCH CẦU
 * ============================================================ */

function maHoaRun(seq) {
  const runs = [];
  if (!seq.length) return runs;
  let side = seq[0], len = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === side) len++;
    else { runs.push({ side, length: len }); side = seq[i]; len = 1; }
  }
  runs.push({ side, length: len });
  return runs;
}

function thongKeTong(items) {
  const dem = {};
  items.forEach(x => {
    const tong = x.tong || (x.x1 + x.x2 + x.x3);
    if (tong) dem[tong] = (dem[tong] || 0) + 1;
  });
  return dem;
}

function cau11(seq, cuaSo = 20) {
  const data = seq.slice(-cuaSo);
  if (data.length < 5) return null;
  let xen = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i] !== data[i - 1]) xen++;
  }
  const tyLe = xen / (data.length - 1);
  if (tyLe >= 0.65) {
    return {
      ten: 'cầu 1-1',
      duDoan: data[data.length - 1] === 'TAI' ? 'XIU' : 'TAI',
      doTinCay: tyLe,
      moTa: `xen kẽ ${(tyLe * 100).toFixed(0)}%`
    };
  }
  return null;
}

function cau22(seq) {
  const runs = maHoaRun(seq);
  if (runs.length < 6) return null;
  const recent = runs.slice(-6);
  const lens = recent.map(r => r.length);
  const khop = lens.filter(l => l === 2).length;
  if (khop >= 4) {
    const last = recent[recent.length - 1];
    return {
      ten: 'cầu 2-2',
      duDoan: last.length === 2 ? (last.side === 'TAI' ? 'XIU' : 'TAI') : last.side,
      doTinCay: 0.7,
      moTa: '2-2 pattern'
    };
  }
  return null;
}

function cau33(seq) {
  const runs = maHoaRun(seq);
  if (runs.length < 6) return null;
  const recent = runs.slice(-6);
  const khop = recent.filter(r => r.length === 3).length;
  if (khop >= 4) {
    const last = recent[recent.length - 1];
    return {
      ten: 'cầu 3-3',
      duDoan: last.length === 3 ? (last.side === 'TAI' ? 'XIU' : 'TAI') : last.side,
      doTinCay: 0.7,
      moTa: '3-3 pattern'
    };
  }
  return null;
}

function cau44(seq) {
  const runs = maHoaRun(seq);
  if (runs.length < 6) return null;
  const recent = runs.slice(-6);
  const khop = recent.filter(r => r.length === 4).length;
  if (khop >= 3) {
    return {
      ten: 'cầu 4-4',
      duDoan: recent[recent.length - 1].side === 'TAI' ? 'XIU' : 'TAI',
      doTinCay: 0.7,
      moTa: '4-4 pattern'
    };
  }
  return null;
}

function cau121(seq) {
  const runs = maHoaRun(seq);
  if (runs.length < 3) return null;
  const lens = runs.slice(-3).map(r => r.length);
  if (lens[0] === 1 && lens[1] === 2 && lens[2] === 1) {
    return { ten: 'cầu 1-2-1', duDoan: runs[runs.length - 1].side === 'TAI' ? 'XIU' : 'TAI', doTinCay: 0.65, moTa: '1-2-1' };
  }
  if (lens[0] === 2 && lens[1] === 1 && lens[2] === 2) {
    return { ten: 'cầu 2-1-2', duDoan: runs[runs.length - 1].side === 'TAI' ? 'XIU' : 'TAI', doTinCay: 0.65, moTa: '2-1-2' };
  }
  return null;
}

function cau1221(seq) {
  const runs = maHoaRun(seq);
  if (runs.length < 4) return null;
  const lens = runs.slice(-4).map(r => r.length);
  if (lens[0] === 1 && lens[1] === 2 && lens[2] === 2 && lens[3] === 1) {
    return { ten: 'cầu 1-2-2-1', duDoan: runs[runs.length - 1].side === 'TAI' ? 'XIU' : 'TAI', doTinCay: 0.68, moTa: '1-2-2-1' };
  }
  if (lens[0] === 2 && lens[1] === 1 && lens[2] === 1 && lens[3] === 2) {
    return { ten: 'cầu 2-1-1-2', duDoan: runs[runs.length - 1].side === 'TAI' ? 'XIU' : 'TAI', doTinCay: 0.68, moTa: '2-1-1-2' };
  }
  return null;
}

function bacThang(seq) {
  const runs = maHoaRun(seq);
  if (runs.length < 4) return null;
  const recent = runs.slice(-5);
  const lens = recent.map(r => r.length);
  let tang = 0, giam = 0;
  for (let i = 1; i < lens.length; i++) {
    if (lens[i] > lens[i - 1]) tang++;
    if (lens[i] < lens[i - 1]) giam++;
  }
  const last = recent[recent.length - 1];
  if (tang >= 3) {
    return { ten: 'bậc thang tăng', duDoan: last.side === 'TAI' ? 'XIU' : 'TAI', doTinCay: 0.6, moTa: `tăng ${lens.join('-')}` };
  }
  if (giam >= 3) {
    return { ten: 'bậc thang giảm', duDoan: last.side, doTinCay: 0.55, moTa: `giảm ${lens.join('-')}` };
  }
  return null;
}

function markov1(seq) {
  let TT = 0, TX = 0, XT = 0, XX = 0;
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    if (a === 'TAI' && b === 'TAI') TT++;
    if (a === 'TAI' && b === 'XIU') TX++;
    if (a === 'XIU' && b === 'TAI') XT++;
    if (a === 'XIU' && b === 'XIU') XX++;
  }
  const last = seq[seq.length - 1];
  let p, support;
  if (last === 'TAI') {
    const t = TT + TX;
    p = t > 0 ? TT / t : 0.5;
    support = t;
  } else {
    const t = XT + XX;
    p = t > 0 ? XX / t : 0.5;
    support = t;
  }
  if (support < 10) return null;
  return {
    ten: 'Markov 1',
    duDoan: p > 0.5 ? 'TAI' : 'XIU',
    doTinCay: Math.abs(p - 0.5) * 2,
    moTa: `P(${last}→) support ${support}`
  };
}

function markovN(seq, bac) {
  if (seq.length < bac + 3) return null;
  const map = {};
  for (let i = bac; i < seq.length; i++) {
    const key = seq.slice(i - bac, i).join('');
    if (!map[key]) map[key] = { TAI: 0, XIU: 0 };
    map[key][seq[i]]++;
  }
  const k = seq.slice(-bac).join('');
  if (!map[k]) return null;
  const d = map[k];
  const t = d.TAI + d.XIU;
  if (t < 3) return null;
  const pT = d.TAI / t;
  return {
    ten: `Markov ${bac}`,
    duDoan: pT > 0.5 ? 'TAI' : 'XIU',
    doTinCay: Math.max(pT, 1 - pT) * 0.9,
    moTa: `M${bac}(${k}) support ${t}`
  };
}

function timPattern(seq, doDai) {
  if (seq.length < doDai + 2) return null;
  const pattern = seq.slice(-doDai).join('');
  let t = 0, x = 0;
  for (let i = doDai; i < seq.length; i++) {
    if (seq.slice(i - doDai, i).join('') === pattern) {
      if (seq[i] === 'TAI') t++;
      else x++;
    }
  }
  const tong = t + x;
  if (tong < 3) return null;
  const pT = t / tong;
  return {
    ten: `Pattern ${doDai}`,
    duDoan: pT > 0.5 ? 'TAI' : 'XIU',
    doTinCay: Math.max(pT, 1 - pT) * 0.9,
    moTa: `P${doDai}(${pattern}) support ${tong}`
  };
}

function tinhEntropy(seq) {
  if (!seq.length) return 0;
  const t = seq.filter(x => x === 'TAI').length / seq.length;
  const x = 1 - t;
  let h = 0;
  if (t > 0) h -= t * Math.log2(t);
  if (x > 0) h -= x * Math.log2(x);
  return h;
}

function duDoanEntropy(seq) {
  const data = seq.slice(-50);
  const h = tinhEntropy(data);
  if (h < 0.7) {
    const t = data.filter(x => x === 'TAI').length;
    return { ten: 'Entropy thấp', duDoan: t > 25 ? 'TAI' : 'XIU', doTinCay: 0.65, moTa: `H=${h.toFixed(3)}` };
  }
  if (h > 0.98) {
    return { ten: 'Entropy cao', duDoan: seq[seq.length - 1] === 'TAI' ? 'XIU' : 'TAI', doTinCay: 0.5, moTa: `H=${h.toFixed(3)}` };
  }
  return null;
}

function tanSuat(seq, cuaSo) {
  if (seq.length < cuaSo) return null;
  const data = seq.slice(-cuaSo);
  const t = data.filter(x => x === 'TAI').length;
  const x = data.length - t;
  const lech = Math.abs(t - x) / data.length;
  if (lech > 0.35) {
    return {
      ten: `Tần suất ${cuaSo}`,
      duDoan: t > x ? 'XIU' : 'TAI',
      doTinCay: 0.5 + lech * 0.3,
      moTa: `T${t}/X${x} lệch ${(lech * 100).toFixed(0)}%`
    };
  }
  return null;
}

function daoChieu(seq) {
  const runs = maHoaRun(seq);
  if (!runs.length) return null;
  const last = runs[runs.length - 1];
  if (last.length >= 5) {
    return { ten: 'Đảo chiều', duDoan: last.side === 'TAI' ? 'XIU' : 'TAI', doTinCay: 0.8, moTa: `chuỗi ${last.length}` };
  }
  if (last.length >= 4) {
    return { ten: 'Đảo chiều', duDoan: last.side === 'TAI' ? 'XIU' : 'TAI', doTinCay: 0.65, moTa: `chuỗi ${last.length}` };
  }
  return null;
}

function songNgan(seq) {
  if (seq.length < 5) return null;
  const d = seq.slice(-5);
  const t = d.filter(x => x === 'TAI').length;
  if (t >= 4) return { ten: 'Sóng ngắn', duDoan: 'XIU', doTinCay: 0.6, moTa: `5p ${t}T` };
  if (t <= 1) return { ten: 'Sóng ngắn', duDoan: 'TAI', doTinCay: 0.6, moTa: `5p ${t}T` };
  return null;
}

function momentum(seq) {
  if (seq.length < 10) return null;
  const s10 = seq.slice(-10), s5 = seq.slice(-5);
  const t10 = s10.filter(x => x === 'TAI').length / 10;
  const t5 = s5.filter(x => x === 'TAI').length / 5;
  if (t5 > t10 + 0.2) return { ten: 'Momentum T', duDoan: 'TAI', doTinCay: 0.55, moTa: 'tăng' };
  if (t5 < t10 - 0.2) return { ten: 'Momentum X', duDoan: 'XIU', doTinCay: 0.55, moTa: 'giảm' };
  return null;
}

function chuKy(seq) {
  if (seq.length < 20) return null;
  let best = null;
  for (let p = 2; p <= 12; p++) {
    let same = 0, tot = 0;
    for (let i = p; i < seq.length; i++) {
      tot++;
      if (seq[i] === seq[i - p]) same++;
    }
    const r = same / tot;
    if (!best || r > best.r) best = { p, r };
  }
  if (best && best.r >= 0.65) {
    const pred = seq[seq.length - best.p] || seq[seq.length - 1];
    return { ten: 'Chu kỳ', duDoan: pred, doTinCay: (best.r - 0.5) * 1.5, moTa: `CK${best.p} (${(best.r * 100).toFixed(0)}%)` };
  }
  return null;
}

function cau321(seq) {
  const runs = maHoaRun(seq);
  if (runs.length < 3) return null;
  const lens = runs.slice(-3).map(r => r.length);
  if (lens[0] === 3 && lens[1] === 2 && lens[2] === 1) {
    return { ten: 'Cầu 3-2-1', duDoan: runs[runs.length - 1].side === 'TAI' ? 'XIU' : 'TAI', doTinCay: 0.65, moTa: '3-2-1' };
  }
  if (lens[0] === 1 && lens[1] === 2 && lens[2] === 3) {
    return { ten: 'Cầu 1-2-3', duDoan: runs[runs.length - 1].side, doTinCay: 0.6, moTa: '1-2-3' };
  }
  return null;
}

function cau211(seq) {
  const runs = maHoaRun(seq);
  if (runs.length < 3) return null;
  const lens = runs.slice(-3).map(r => r.length);
  if (lens[0] === 2 && lens[1] === 1 && lens[2] === 1) {
    return { ten: 'Cầu 2-1-1', duDoan: runs[runs.length - 1].side, doTinCay: 0.6, moTa: '2-1-1' };
  }
  if (lens[0] === 1 && lens[1] === 1 && lens[2] === 2) {
    return { ten: 'Cầu 1-1-2', duDoan: runs[runs.length - 1].side === 'TAI' ? 'XIU' : 'TAI', doTinCay: 0.6, moTa: '1-1-2' };
  }
  return null;
}

/* ============================================================
 * TỔNG HỢP TẤT CẢ TÍN HIỆU & VOTING
 * ============================================================ */
function phanTichTongHop(seq) {
  const signals = [];
  const add = (s) => { if (s && s.duDoan) signals.push(s); };

  add(cau11(seq));
  add(cau22(seq));
  add(cau33(seq));
  add(cau44(seq));
  add(cau121(seq));
  add(cau1221(seq));
  add(bacThang(seq));
  add(markov1(seq));
  [2, 3, 4].forEach(b => add(markovN(seq, b)));
  [4, 5, 6, 7].forEach(l => add(timPattern(seq, l)));
  add(duDoanEntropy(seq));
  [10, 20, 30, 50].forEach(cs => add(tanSuat(seq, cs)));
  add(daoChieu(seq));
  add(songNgan(seq));
  add(momentum(seq));
  add(chuKy(seq));
  add(cau321(seq));
  add(cau211(seq));

  if (!signals.length) {
    return { duDoan: null, doTinCay: 0, signals: [], lyDo: 'không có tín hiệu' };
  }

  let diemTai = 0, diemXiu = 0, tongW = 0;
  signals.forEach(s => {
    const w = s.doTinCay;
    if (s.duDoan === 'TAI') diemTai += w;
    else diemXiu += w;
    tongW += w;
  });

  const duDoan = diemTai > diemXiu ? 'TAI' : 'XIU';
  const doTinCay = Math.max(diemTai, diemXiu) / tongW;
  const soTai = signals.filter(s => s.duDoan === 'TAI').length;
  const soXiu = signals.filter(s => s.duDoan === 'XIU').length;
  const dongThuan = Math.max(soTai, soXiu) / signals.length;

  return {
    duDoan,
    doTinCay: parseFloat(doTinCay.toFixed(4)),
    dongThuan: parseFloat(dongThuan.toFixed(4)),
    soTinHieu: signals.length,
    soTai,
    soXiu,
    diemTai: parseFloat(diemTai.toFixed(4)),
    diemXiu: parseFloat(diemXiu.toFixed(4)),
    signals: signals.sort((a, b) => b.doTinCay - a.doTinCay),
    lyDo: signals.slice(0, 5).map(s => `${s.ten}:${s.duDoan}(${(s.doTinCay * 100).toFixed(0)}%)`).join(' | ')
  };
}

/* ============================================================
 * STATE
 * ============================================================ */
const stats = {
  total: 0,
  correct: 0,
  wrong: 0,
  fallback_total: 0,
  fallback_correct: 0,
  start_time: vnNow(),
};

let lastData = [];
let lastPrediction = null;
let predictionLog = [];
let isFetching = false;
let errorStreak = 0;

/* ============================================================
 * FETCH
 * ============================================================ */
async function fetchAndAnalyze() {
  if (isFetching) return;
  isFetching = true;
  try {
    const res = await axios.get(API_URL, {
      timeout: FETCH_TIMEOUT_MS,
      headers: { 'Cache-Control': 'no-cache' }
    });
    const raw = res.data;

    let items = [];
    if (Array.isArray(raw)) items = raw;
    else if (raw && Array.isArray(raw.data)) items = raw.data;
    else if (raw && Array.isArray(raw.list)) items = raw.list;

    const parsed = [];
    for (const r of items) {
      const v = parseRecord(r);
      if (v) parsed.push(v);
    }

    const data = parsed
      .sort((a, b) => b.phien - a.phien)
      .slice(0, HISTORY_LIMIT);

    lastData = data;

    if (lastPrediction) {
      const match = data.find(d => d.phien === lastPrediction.phienDuDoan);
      if (match) {
        const actual = match.side;
        const isCorrect = lastPrediction.side === actual;

        predictionLog.unshift({
          phien: match.phien,
          predict: lastPrediction.side,
          actual,
          confidence: lastPrediction.confidence,
          tag: lastPrediction.tag,
          correct: isCorrect,
          fallback: lastPrediction.fallback,
          time: match.time,
        });
        if (predictionLog.length > LOG_LIMIT) predictionLog.pop();

        stats.total++;
        if (isCorrect) { stats.correct++; errorStreak = 0; }
        else { stats.wrong++; errorStreak++; }
        if (lastPrediction.fallback) {
          stats.fallback_total++;
          if (isCorrect) stats.fallback_correct++;
        }

        console.log(`[RESOLVED] #${match.phien} | ${lastPrediction.side} → ${actual} | ${isCorrect ? 'ĐÚNG' : 'SAI'}`);
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
            time: vnNow(),
          });
          if (predictionLog.length > LOG_LIMIT) predictionLog.pop();
          lastPrediction = null;
        }
      }
    }

    if (!lastPrediction && data.length >= 12) {
      const seq = data.map(x => x.side).reverse();
      const kq = phanTichTongHop(seq);

      if (kq.duDoan) {
        const nextPhien = data[0].phien + 1;
        const confPct = Math.round(Math.max(52, Math.min(91, 48 + kq.doTinCay * 40 + kq.dongThuan * 8)));

        lastPrediction = {
          phienDuDoan: nextPhien,
          side: kq.duDoan,
          confidence: confPct,
          tag: kq.lyDo || 'Phân tích tổng hợp',
          info: `${kq.soTinHieu} tín hiệu · T${kq.soTai}/X${kq.soXiu} · Đồng thuận ${(kq.dongThuan * 100).toFixed(0)}%`,
          fallback: false,
          timestamp: vnNow(),
          iso: new Date().toISOString(),
        };
        console.log(`[PREDICT] #${nextPhien} → ${kq.duDoan} (${confPct}%)`);
      }
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
 * UI — GIỮ NGUYÊN 100%
 * ============================================================ */
const HTML = String.raw`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Công Nghệ Vip HOANG 2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #020617;
  --card: rgba(15, 23, 42, 0.78);
  --card2: rgba(30, 41, 59, 0.65);
  --line: rgba(59, 130, 246, 0.18);
  --line2: rgba(96, 165, 250, 0.28);
  --txt: #f1f5f9;
  --dim: #94a3b8;
  --mute: #64748b;
  --blue: #3b82f6;
  --cyan: #22d3ee;
  --indigo: #818cf8;
  --ok: #34d399;
  --bad: #f87171;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Inter', system-ui, sans-serif;
  background: var(--bg);
  color: var(--txt);
  min-height: 100vh;
  background-image:
    radial-gradient(ellipse 90% 60% at 10% -10%, rgba(59,130,246,0.22), transparent),
    radial-gradient(ellipse 70% 50% at 90% 0%, rgba(34,211,238,0.12), transparent),
    radial-gradient(ellipse 50% 40% at 50% 100%, rgba(29,78,216,0.15), transparent);
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 26px 18px 60px; }

header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 14px; flex-wrap: wrap;
  padding-bottom: 22px; margin-bottom: 26px;
  border-bottom: 1px solid var(--line);
}
.brand { display: flex; align-items: center; gap: 14px; }
.logo {
  width: 48px; height: 48px; border-radius: 14px;
  background: linear-gradient(135deg, #2563eb, #0ea5e9, #22d3ee);
  display: grid; place-items: center;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 800; font-size: 13px; color: #fff;
  box-shadow: 0 0 28px rgba(59,130,246,0.5);
}
.brand h1 {
  font-size: 20px; font-weight: 800; letter-spacing: -0.02em;
  background: linear-gradient(90deg, #e0f2fe, #7dd3fc, #22d3ee);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.brand small {
  display: block; font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: var(--mute); letter-spacing: 0.08em; margin-top: 2px;
}
.status {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 15px; border-radius: 999px;
  background: var(--card); border: 1px solid var(--line2);
  font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--dim);
  backdrop-filter: blur(12px);
}
.status .dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--ok); box-shadow: 0 0 10px var(--ok);
  animation: pulse 2s infinite;
}
.status.off .dot { background: var(--bad); box-shadow: 0 0 10px var(--bad); animation: none; }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.55} }

.grid { display: grid; grid-template-columns: 1.25fr 1fr; gap: 18px; margin-bottom: 18px; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }

.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 20px;
  padding: 24px;
  backdrop-filter: blur(16px);
  box-shadow: 0 10px 40px rgba(0,0,0,0.35);
  position: relative; overflow: hidden;
}
.card::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(96,165,250,0.45), transparent);
}
.card-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: #60a5fa;
  letter-spacing: 0.15em; text-transform: uppercase;
  margin-bottom: 16px;
  display: flex; align-items: center; gap: 8px;
}
.card-title::before {
  content: ''; width: 6px; height: 6px; border-radius: 50%;
  background: #22d3ee; box-shadow: 0 0 8px #22d3ee;
}

.pred-side {
  font-size: 72px; font-weight: 800; line-height: 1;
  letter-spacing: -0.03em; margin-bottom: 12px;
  text-shadow: 0 0 40px currentColor;
}
.pred-side.tai { color: var(--cyan); }
.pred-side.xiu { color: var(--indigo); }
.pred-side.none { color: var(--mute); font-size: 46px; text-shadow: none; }

.pred-meta {
  display: flex; gap: 18px; flex-wrap: wrap;
  font-family: 'JetBrains Mono
