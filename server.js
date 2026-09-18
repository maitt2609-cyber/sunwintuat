
/**
 * server.js — Sunwin Viewer đơn giản
 * Chỉ đọc API + hiển thị. Không dự đoán.
 */

'use strict';

const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = 'https://sunwin-taixiu-dulieu.onrender.com/data';

// Lấy dữ liệu từ API gốc
async function layDuLieu() {
  const res = await axios.get(API_URL, { timeout: 15000 });
  const raw = res.data;

  let items = [];
  if (Array.isArray(raw)) items = raw;
  else if (raw && Array.isArray(raw.data)) items = raw.data;

  // Chuẩn hóa
  const sach = items.map(x => ({
    phien: Number(x.phien),
    x1: Number(x.xuc_xac_1),
    x2: Number(x.xuc_xac_2),
    x3: Number(x.xuc_xac_3),
    tong: Number(x.tong),
    ket_qua: String(x.ket_qua || '').trim().toUpperCase(),
    thoi_gian: String(x.thoi_gian || '')
  })).filter(x => x.phien > 0 && x.ket_qua);

  // Mới nhất lên đầu
  sach.sort((a, b) => b.phien - a.phien);

  return sach;
}

// Trang chính
app.get('/', async (req, res) => {
  try {
    const data = await layDuLieu();
    const homNay = data.slice(0, 30);

    // Đếm Tài/Xỉu 100 phiên
    const tram = data.slice(0, 100);
    const tai = tram.filter(x => x.ket_qua === 'TÀI').length;
    const xiu = tram.filter(x => x.ket_qua === 'XỈU').length;

    // Đếm chuỗi hiện tại
    let chuoi = 1;
    if (data.length > 1) {
      const dau = data[0].ket_qua;
      for (let i = 1; i < data.length; i++) {
        if (data[i].ket_qua === dau) chuoi++;
        else break;
      }
    }

    // Render HTML
    const rows = homNay.map(x => {
      const cls = x.ket_qua === 'TÀI' ? 'tai' : 'xiu';
      return `<tr>
        <td>#${x.phien}</td>
        <td>${x.x1} - ${x.x2} - ${x.x3}</td>
        <td><b>${x.tong}</b></td>
        <td><span class="${cls}">${x.ket_qua}</span></td>
        <td>${x.thoi_gian}</td>
      </tr>`;
    }).join('');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.set

/* ============================================================
 * UI HOÀN TOÀN MỚI — 2026 Full Blue
 * ============================================================ */
const HTML = String.raw`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Công Nghệ Vip PAK 2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
 {
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
      <div class="logo">PAK</div>
      <div>
        <h1>Công Nghệ Vip PAK</h1>
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
  console.log('[PAK] Công Nghệ Vip K  2026 — Phân loại Cầu Chi tiết');
  console.log('[PAK] Server: http://localhost:' + PORT);
  console.log('[PAK] Developer: VIP');
});

fetchAndAnalyze();
setInterval(fetchAndAnalyze, FETCH_INTERVAL_MS);
