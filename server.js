/**
 * server.js — Công Nghệ Vip HOÀNG 2026
 * Dice Signal Analyzer — Phân loại Cầu Chi tiết
 * Developer: HUY HOÀNG
 *
 * Nguồn API: https://sunwin-taixiu-dulieu.onrender.com/data
 *
 * Lưu ý quan trọng:
 * - Dữ liệu xúc xắc là ngẫu nhiên độc lập.
 * - Engine này phân loại nhiều loại cầu + weighted vote + contrarian.
 * - Không có cam kết thắng tuyệt đối.
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
  const s = raw.trim().toUpperCase();
  if (s === 'TÀI' || s === 'TAI') return 'TAI';
  if (s === 'XỈU' || s === 'XIU') return 'XIU';
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
 * UI HOÀN TOÀN MỚI — 2026 Full Blue
 * ============================================================ */
const HTML = String.raw`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Công Nghệ Vip HUY HOÀNG 2026</title>
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
  font-weight: 800; font-size: 15px; color: #fff;
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
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px; color: var(--dim); margin-bottom: 14px;
}
.pred-meta strong { color: var(--txt); }

.pred-tag {
  display: inline-block;
  padding: 6px 13px; border-radius: 8px;
  background: linear-gradient(135deg, rgba(59,130,246,0.18), rgba(14,165,233,0.1));
  border: 1px solid rgba(96,165,250,0.32);
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px; color: #7dd3fc; margin-bottom: 12px;
}
.pred-info {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px; color: var(--mute); line-height: 1.7;
}

.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
.stat {
  background: var(--card2);
  border: 1px solid var(--line);
  border-radius: 14px; padding: 14px;
}
.stat-n {
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px; font-weight: 700;
}
.stat-n.ok { color: var(--ok); }
.stat-n.bad { color: var(--bad); }
.stat-n.acc { color: #60a5fa; }
.stat-k {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: var(--mute);
  letter-spacing: 0.12em; text-transform: uppercase; margin-top: 3px;
}
.streak {
  margin-top: 13px; display: flex; justify-content: space-between;
  padding: 11px 14px; border-radius: 12px;
  background: rgba(129,140,248,0.08);
  border: 1px solid rgba(129,140,248,0.22);
  font-family: 'JetBrains Mono', monospace; font-size: 13px;
}
.streak .v { color: var(--indigo); font-weight: 700; font-size: 15px; }
.foot {
  margin-top: 12px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; color: var(--mute); line-height: 1.6;
}

.tbl-wrap {
  overflow-x: auto; border-radius: 14px;
  border: 1px solid var(--line); background: var(--card2);
}
table { width: 100%; border-collapse: collapse; }
thead th {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase;
  color: #60a5fa; font-weight: 500;
  text-align: left; padding: 13px 15px;
  background: rgba(15,23,42,0.7);
  border-bottom: 1px solid var(--line);
}
tbody td {
  padding: 12px 15px; border-bottom: 1px solid var(--line);
  font-family: 'JetBrains Mono', monospace; font-size: 12.5px;
}
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: rgba(59,130,246,0.06); }
.tag {
  display: inline-block; padding: 3px 9px; border-radius: 6px;
  font-size: 11.5px; font-weight: 600;
}
.tag.tai { color: var(--cyan); background: rgba(34,211,238,0.12); border: 1px solid rgba(34,211,238,0.25); }
.tag.xiu { color: var(--indigo); background: rgba(129,140,248,0.12); border: 1px solid rgba(129,140,248,0.25); }
.tag.miss { color: var(--mute); background: rgba(100,116,139,0.15); }
.r-ok { color: var(--ok); font-weight: 700; }
.r-bad { color: var(--bad); font-weight: 700; }
.r-miss { color: var(--mute); }
.empty {
  text-align: center; padding: 32px; color: var(--mute);
  font-family: 'JetBrains Mono', monospace; font-size: 13px;
}

footer {
  margin-top: 32px; padding-top: 18px;
  border-top: 1px solid var(--line);
  display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px;
  font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--mute);
}
footer strong { color: #7dd3fc; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <div class="logo">HOÀNG</div>
      <div>
        <h1>Công Nghệ Vip HOÀNG</h1>
        <small>PHÂN LOẠI CẦU CHI TIẾT · 2026</small>
      </div>
    </div>
    <div id="status" class="status"><span class="dot"></span><span id="statusText">Đang kết nối</span></div>
  </header>

  <div class="grid">
    <div class="card">
      <div class="card-title">Dự đoán phiên kế tiếp</div>
      <div id="pSide" class="pred-side none">--</div>
      <div class="pred-meta">
        <span>Độ tin cậy: <strong id="pConf">--%</strong></span>
        <span>Phiên: <strong id="pPhien">#--</strong></span>
      </div>
      <div id="pTag" class="pred-tag">--</div>
      <div id="pInfo" class="pred-info">Đang chờ dữ liệu...</div>
    </div>

    <div class="card">
      <div class="card-title">Thống kê realtime</div>
      <div class="stats">
        <div class="stat"><div id="sTotal" class="stat-n">0</div><div class="stat-k">Tổng</div></div>
        <div class="stat"><div id="sCorrect" class="stat-n ok">0</div><div class="stat-k">Đúng</div></div>
        <div class="stat"><div id="sWrong" class="stat-n bad">0</div><div class="stat-k">Sai</div></div>
        <div class="stat"><div id="sAcc" class="stat-n acc">0%</div><div class="stat-k">Tỷ lệ đúng</div></div>
      </div>
      <div class="streak">
        <span style="color:var(--mute)">CHUỖI SAI</span>
        <span id="sStreak" class="v">0</span>
      </div>
      <div class="foot" id="footNote">--</div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Lịch sử dự đoán</div>
    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Phiên</th><th>Dự đoán</th><th>Thực tế</th><th>Tin cậy</th><th>Cầu / Signal</th><th>Kết quả</th>
          </tr>
        </thead>
        <tbody id="tbody">
          <tr><td colspan="6" class="empty">Chưa có dữ liệu.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <footer>
    <div>Developer: <strong>Anh Khôi</strong> · Công Nghệ Vip PAK 2026</div>
    <div id="footTime">--</div>
  </footer>
</div>

<script>
const $ = id => document.getElementById(id);
const set = (id, v) => { const el = $(id); if (el) el.textContent = v == null ? '' : String(v); };

function setSide(el, side) {
  el.classList.remove('tai', 'xiu', 'none');
  if (side === 'TAI') { el.classList.add('tai'); el.textContent = 'TÀI'; }
  else if (side === 'XIU') { el.classList.add('xiu'); el.textContent = 'XỈU'; }
  else { el.classList.add('none'); el.textContent = '--'; }
}

function renderLog(rows) {
  const tb = $('tbody');
  while (tb.firstChild) tb.removeChild(tb.firstChild);
  if (!rows || rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6; td.className = 'empty';
    td.textContent = 'Chưa có phiên nào được chốt.';
    tr.appendChild(td); tb.appendChild(tr);
    return;
  }
  for (const r of rows) {
    const tr = document.createElement('tr');

    const td1 = document.createElement('td');
    td1.textContent = '#' + r.phien;
    tr.appendChild(td1);

    const td2 = document.createElement('td');
    const sp = document.createElement('span');
    sp.className = 'tag ' + (r.predict === 'TAI' ? 'tai' : 'xiu');
    sp.textContent = r.predict === 'TAI' ? 'TÀI' : 'XỈU';
    td2.appendChild(sp);
    tr.appendChild(td2);

    const td3 = document.createElement('td');
    if (r.actual) {
      const sa = document.createElement('span');
      sa.className = 'tag ' + (r.actual === 'TAI' ? 'tai' : 'xiu');
      sa.textContent = r.actual === 'TAI' ? 'TÀI' : 'XỈU';
      td3.appendChild(sa);
    } else {
      const sa = document.createElement('span');
      sa.className = 'tag miss';
      sa.textContent = 'MISS';
      td3.appendChild(sa);
    }
    tr.appendChild(td3);

    const td4 = document.createElement('td');
    td4.textContent = (r.confidence != null ? r.confidence : '--') + '%';
    tr.appendChild(td4);

    const td5 = document.createElement('td');
    td5.textContent = r.tag || '';
    td5.style.color = 'var(--dim)';
    td5.style.maxWidth = '240px';
    td5.style.overflow = 'hidden';
    td5.style.textOverflow = 'ellipsis';
    td5.style.whiteSpace = 'nowrap';
    tr.appendChild(td5);

    const td6 = document.createElement('td');
    if (r.miss) { td6.className = 'r-miss'; td6.textContent = 'MISS'; }
    else if (r.correct) { td6.className = 'r-ok'; td6.textContent = 'ĐÚNG'; }
    else { td6.className = 'r-bad'; td6.textContent = 'SAI'; }
    tr.appendChild(td6);

    tb.appendChild(tr);
  }
}

async function pull() {
  try {
    const res = await fetch('/api/dashboard', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();

    if (d.prediction) {
      setSide($('pSide'), d.prediction.side);
      set('pConf', d.prediction.confidence + '%');
      set('pPhien', '#' + d.prediction.phienDuDoan);
      set('pTag', d.prediction.tag || '--');
      set('pInfo', d.prediction.info || '');
    } else {
      setSide($('pSide'), null);
      set('pConf', '--%');
      set('pPhien', '#--');
      set('pTag', '--');
      set('pInfo', 'Cần ít nhất 12 phiên dữ liệu để phân tích cầu.');
    }

    set('sTotal', d.stats.total);
    set('sCorrect', d.stats.correct);
    set('sWrong', d.stats.wrong);
    const acc = d.stats.total > 0 ? ((d.stats.correct / d.stats.total) * 100).toFixed(1) : '0.0';
    set('sAcc', acc + '%');
    set('sStreak', d.error_streak);

    set('footNote', 'Fallback: ' + d.stats.fallback_correct + '/' + d.stats.fallback_total + ' · Dữ liệu: ' + d.dataCount + ' phiên');
    set('footTime', 'Cập nhật: ' + d.lastUpdate);

    renderLog(d.log);

    const st = $('status');
    st.classList.remove('off');
    set('statusText', 'Đang hoạt động');
  } catch (e) {
    $('status').classList.add('off');
    set('statusText', 'Mất kết nối');
    console.error('[UI]', e);
  }
}

pull();
setInterval(pull, 7500);
</script>
</body>
</html>`;

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(HTML);
});

app.get('/api/dashboard', (req, res) => {
  res.json({
    prediction: lastPrediction,
    stats,
    log: predictionLog.slice(0, 70),
    error_streak: engine.errorStreak,
    lastUpdate: vnNow(),
    dataCount: lastData.length,
  });
});

app.get('/api/raw', (req, res) => {
  res.json({ data: lastData.slice(0, 80) });
});

app.listen(PORT, () => {
  console.log('[PAK] Công Nghệ Vip  2026 — Phân loại Cầu Chi tiết');
  console.log('[PAK] Server: http://localhost:' + PORT);
  console.log('[PAK] Developer: HUYHOANG');
});

fetchAndAnalyze();
setInterval(fetchAndAnalyze, FETCH_INTERVAL_MS);
