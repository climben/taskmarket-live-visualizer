'use strict';
var D = null;
var CHAIN = 'tempo';
var RANGE = '30d';
var BUCKET = 'day';

function q(id) { return document.getElementById(id); }
function el(tag, cls, txt) {
  var n = document.createElement(tag);
  if (cls) { n.className = cls; }
  if (txt !== undefined && txt !== null) { n.textContent = txt; }
  return n;
}
function svgEl(tag, attrs) {
  var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (var k in attrs) { if (attrs.hasOwnProperty(k)) { n.setAttribute(k, attrs[k]); } }
  return n;
}
function fmtInt(n) { return Math.round(Number(n) || 0).toLocaleString('en-US'); }
function fmtUsd(v) {
  var x = Number(v) || 0;
  if (x >= 1000000) { return '$' + (x / 1000000).toFixed(2) + 'M'; }
  if (x >= 1000) { return '$' + (x / 1000).toFixed(1) + 'k'; }
  if (x >= 1) { return '$' + x.toFixed(0); }
  return '$' + x.toFixed(2);
}
function shortAddr(a) { return a ? a.slice(0, 6) + '...' + a.slice(-4) : ''; }
function chainData() { return D.chains[CHAIN]; }
function series() { var s = chainData().series || {}; return s[RANGE + '_' + BUCKET] || []; }

function drawLine(host, pts, opt) {
  host.innerHTML = '';
  if (!pts || !pts.length) { host.appendChild(el('p', 'note', 'No data for this range.')); return; }
  var W = 660, H = 230, pl = 58, pr = 12, pt = 16, pb = 28;
  var max = 0, min = 0, i;
  for (i = 0; i < pts.length; i++) {
    if (pts[i].y > max) { max = pts[i].y; }
    if (pts[i].y < min) { min = pts[i].y; }
  }
  if (max === min) { max = min + 1; }
  var iw = W - pl - pr, ih = H - pt - pb;
  var xs = [], ys = [];
  var step = pts.length > 1 ? iw / (pts.length - 1) : 0;
  for (i = 0; i < pts.length; i++) {
    xs.push(pts.length > 1 ? pl + i * step : pl + iw / 2);
    ys.push(pt + ih - ((pts[i].y - min) / (max - min)) * ih);
  }
  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'plot' });
  for (var g = 0; g <= 4; g++) {
    var gy = pt + ih - (ih * g / 4);
    svg.appendChild(svgEl('line', { x1: pl, x2: W - pr, y1: gy, y2: gy, class: 'grid' }));
    var at = svgEl('text', { x: pl - 8, y: gy + 4, class: 'ax' });
    at.textContent = opt.fmt ? opt.fmt(max - (max - min) * (g / 4)) : fmtInt(max - (max - min) * (g / 4));
    svg.appendChild(at);
  }
  var d = '';
  for (i = 0; i < pts.length; i++) { d += (i ? ' L ' : 'M ') + xs[i].toFixed(1) + ' ' + ys[i].toFixed(1); }
  var by = (pt + ih).toFixed(1);
  svg.appendChild(svgEl('path', { d: d + ' L ' + xs[xs.length - 1].toFixed(1) + ' ' + by + ' L ' + xs[0].toFixed(1) + ' ' + by + ' Z', class: 'area' }));
  svg.appendChild(svgEl('path', { d: d, class: 'line' }));
  svg.appendChild(svgEl('circle', { cx: xs[xs.length - 1], cy: ys[ys.length - 1], r: 3.5, class: 'dot' }));
  var idx = [0, Math.floor((pts.length - 1) / 2), pts.length - 1];
  for (i = 0; i < idx.length; i++) {
    var xt = svgEl('text', { x: xs[idx[i]], y: H - 8, class: 'ax mid' });
    xt.textContent = pts[idx[i]].label;
    svg.appendChild(xt);
  }
  host.appendChild(svg);
}

function drawBars(host, pts, opt) {
  host.innerHTML = '';
  if (!pts || !pts.length) { host.appendChild(el('p', 'note', 'No data for this range.')); return; }
  var W = 660, H = 230, pl = 58, pr = 12, pt = 16, pb = 28;
  var max = 0, i;
  for (i = 0; i < pts.length; i++) { if (pts[i].y > max) { max = pts[i].y; } }
  if (max <= 0) { max = 1; }
  var iw = W - pl - pr, ih = H - pt - pb;
  var n = pts.length;
  var gap = Math.min(4, (iw / n) * 0.3);
  var bw = Math.max(1, (iw - (n - 1) * gap) / n);
  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'plot' });
  for (var g = 0; g <= 4; g++) {
    var gy = pt + ih - (ih * g / 4);
    svg.appendChild(svgEl('line', { x1: pl, x2: W - pr, y1: gy, y2: gy, class: 'grid' }));
    var at = svgEl('text', { x: pl - 8, y: gy + 4, class: 'ax' });
    at.textContent = opt.fmt ? opt.fmt(max * (4 - g) / 4) : fmtInt(max * (4 - g) / 4);
    svg.appendChild(at);
  }
  for (i = 0; i < n; i++) {
    var h = (pts[i].y / max) * ih;
    var x = pl + i * (bw + gap);
    var rect = svgEl('rect', { x: x, y: pt + ih - h, width: bw, height: Math.max(0.5, h), class: 'bar' });
    var ttl = svgEl('title', {});
    ttl.textContent = pts[i].label + ': ' + (opt.fmt ? opt.fmt(pts[i].y) : pts[i].y);
    rect.appendChild(ttl);
    svg.appendChild(rect);
  }
  var idx = [0, Math.floor((n - 1) / 2), n - 1];
  for (i = 0; i < idx.length; i++) {
    var xt = svgEl('text', { x: pl + idx[i] * (bw + gap) + bw / 2, y: H - 8, class: 'ax mid' });
    xt.textContent = pts[idx[i]].label;
    svg.appendChild(xt);
  }
  host.appendChild(svg);
}

function drawHBars(host, rows) {
  host.innerHTML = '';
  var max = 0, i;
  for (i = 0; i < rows.length; i++) { if (rows[i].count > max) { max = rows[i].count; } }
  if (!max) { max = 1; }
  for (i = 0; i < rows.length; i++) {
    var line = el('div', 'hrow');
    line.appendChild(el('span', 'hlabel', rows[i].label));
    var track = el('div', 'htrack');
    var fill = el('div', 'hfill');
    fill.style.width = ((rows[i].count / max) * 100).toFixed(1) + '%';
    track.appendChild(fill);
    line.appendChild(track);
    line.appendChild(el('span', 'hval', fmtInt(rows[i].count)));
    host.appendChild(line);
  }
}

function drawHeat(host, hm) {
  host.innerHTML = '';
  if (!hm || !hm.rowKeys || !hm.cells || !hm.cells.length) { host.appendChild(el('p', 'note', 'No heatmap data.')); return; }
  var map = {}, i;
  for (i = 0; i < hm.cells.length; i++) { map[hm.cells[i].row + '|' + hm.cells[i].col] = hm.cells[i].count; }
  var max = hm.maxCount || 1;
  var wrap = el('div', 'heatgrid');
  for (i = 0; i < hm.rowKeys.length; i++) {
    var rk = hm.rowKeys[i];
    var row = el('div', 'heatrow');
    row.appendChild(el('span', 'heatlab', rk));
    var strip = el('div', 'heatstrip');
    for (var j = 0; j < hm.colKeys.length; j++) {
      var v = map[rk + '|' + hm.colKeys[j]] || 0;
      var qv = v / max;
      var cell = el('span', 'heatcell');
      if (qv > 0) { cell.style.opacity = (0.2 + 0.8 * qv).toFixed(2); cell.style.background = 'var(--cream)'; }
      cell.title = rk + ' / ' + hm.colKeys[j] + ': ' + v + ' tasks';
      strip.appendChild(cell);
    }
    row.appendChild(strip);
    wrap.appendChild(row);
  }
  host.appendChild(wrap);
}

function renderChainSwitch() {
  var host = q('chainSwitch');
  host.innerHTML = '';
  var opts = [['tempo', 'Tempo (4217)'], ['base', 'Base (8453)']];
  for (var i = 0; i < opts.length; i++) {
    (function (key, label) {
      var b = el('button', 'tab' + (CHAIN === key ? ' on' : ''), label);
      b.onclick = function () { CHAIN = key; renderAll(); };
      host.appendChild(b);
    })(opts[i][0], opts[i][1]);
  }
}

function renderRangeSwitch() {
  var host = q('rangeSwitch');
  host.innerHTML = '';
  var ranges = [['7d', '7d'], ['30d', '30d'], ['90d', '90d'], ['all', 'all']];
  for (var i = 0; i < ranges.length; i++) {
    (function (key, label) {
      var b = el('button', 'tab' + (RANGE === key ? ' on' : ''), label);
      b.onclick = function () { RANGE = key; renderCharts(); renderRangeSwitch(); };
      host.appendChild(b);
    })(ranges[i][0], ranges[i][1]);
  }
  var buckets = [['day', 'daily'], ['week', 'weekly']];
  for (var j = 0; j < buckets.length; j++) {
    (function (key, label) {
      var b2 = el('button', 'tab' + (BUCKET === key ? ' on' : ''), label);
      b2.onclick = function () { BUCKET = key; renderCharts(); renderRangeSwitch(); };
      host.appendChild(b2);
    })(buckets[j][0], buckets[j][1]);
  }
}

function renderKpis() {
  var ch = chainData();
  var st = ch.stats || {};
  var completed = 0;
  var sd = (ch.breakdowns && ch.breakdowns.status) || [];
  for (var i = 0; i < sd.length; i++) { if (sd[i].status === 'completed') { completed = sd[i].count; } }
  var items = [['Open tasks', fmtInt(st.openTasks)], ['Active agents (7d)', fmtInt(st.activeAgents7d)],
    ['Registered workers', fmtInt(st.registeredWorkers)], ['Paid workers', fmtInt(st.paidWorkers)],
    ['Active wallets', fmtInt(st.activeWallets)], ['Completed tasks', fmtInt(completed)]];
  var host = q('kpis');
  host.innerHTML = '';
  for (i = 0; i < items.length; i++) {
    var c = el('div', 'kpi');
    c.appendChild(el('div', 'kv', items[i][1]));
    c.appendChild(el('div', 'kl', items[i][0]));
    host.appendChild(c);
  }
}

function renderCharts() {
  var s = series();
  drawLine(q('chartAgents'), s.map(function (r) { return { label: r.bucket, y: Number(r.activeAgents) || 0 }; }), null);
  drawBars(q('chartTasks'), s.map(function (r) { return { label: r.bucket, y: Number(r.tasksCreated) || 0 }; }), null);
  drawBars(q('chartReward'), s.map(function (r) { return { label: r.bucket, y: (Number(r.rewardVolume) || 0) / 1e6 }; }), { fmt: fmtUsd });
  drawBars(q('chartPaid'), s.map(function (r) { return { label: r.bucket, y: (Number(r.paidVolume) || 0) / 1e6 }; }), { fmt: fmtUsd });
  var wp = (chainData().weekly_posters || []).map(function (r) { return { label: String(r.week).replace('2026-', ''), y: r.posters }; });
  drawBars(q('chartPosters'), wp, null);
  var cn = chainData().task_counts || {};
  q('postersNote').textContent = 'Distinct requester addresses per ISO week, computed from the task list: ' +
    (cn.open || 0) + ' open and ' + (cn.expired_seen || 0) + ' expired tasks returned by the API.';
}

function renderBreakdowns() {
  var br = chainData().breakdowns || {};
  var md = (br.mode || []).map(function (r) { return { label: r.mode, count: r.count }; });
  var sd = (br.status || []).map(function (r) { return { label: r.status, count: r.count }; });
  drawHBars(q('barsMode'), md);
  drawHBars(q('barsStatus'), sd);
}

function renderHeat() {
  var hm = chainData().heatmap || {};
  drawHeat(q('heatMode'), hm.mode);
  drawHeat(q('heatHour'), hm.hourOfWeek);
}

function renderFeed() {
  var host = q('feed');
  host.innerHTML = '';
  var items = ((chainData().feed || {}).items) || [];
  for (var i = 0; i < Math.min(items.length, 20); i++) {
    var it = items[i];
    var li = el('li', 'fitem');
    var head = el('div', 'fhead');
    head.appendChild(el('span', 'ftype', it.type || 'event'));
    head.appendChild(el('span', 'ftime', (it.timestamp || '').replace('T', ' ').slice(0, 19) + 'Z'));
    li.appendChild(head);
    li.appendChild(el('div', 'ftitle', it.taskTitle || it.taskId || ''));
    var meta = el('div', 'fmeta');
    if (it.amount) { meta.appendChild(el('span', 'chip', fmtUsd(Number(it.amount) / 1e6))); }
    if (it.actorType) { meta.appendChild(el('span', 'chip dim', it.actorType)); }
    li.appendChild(meta);
    host.appendChild(li);
  }
}

function renderTasks() {
  var body = q('tasksBody');
  body.innerHTML = '';
  var rows = (chainData().tasks || []).slice(0, 60);
  for (var i = 0; i < rows.length; i++) {
    var t = rows[i];
    var tr = el('tr');
    var c1 = el('td');
    c1.appendChild(el('div', 'ttitle', t.title || ''));
    c1.appendChild(el('div', 'tref', t.ref || ''));
    tr.appendChild(c1);
    tr.appendChild(el('td', 'tnum', fmtUsd(t.reward_usd)));
    tr.appendChild(el('td', 'tnum', t.mode || ''));
    tr.appendChild(el('td', 'tnum', fmtInt(t.submissions)));
    var c5 = el('td');
    c5.appendChild(el('div', null, t.requester_name || ''));
    c5.appendChild(el('div', 'tref', shortAddr(t.requester)));
    tr.appendChild(c5);
    tr.appendChild(el('td', 'tnum', (t.expiry_at || '').slice(0, 10)));
    body.appendChild(tr);
  }
}

function renderMethods() {
  var host = q('methods');
  host.innerHTML = '';
  var ul = el('ul', 'mlist');
  var lines = [
    'GET /api/market/stats?chainId= - headline numbers: open tasks, registered and active workers, paid workers, active wallets.',
    'GET /api/stats/breakdowns?chainId= - tasks by status, by mode and by actor type.',
    'GET /api/stats/platform-time-series?chainId=&range=7d|30d|90d|all&bucket=day|week - daily active agents, tasks posted, rewards put up and rewards paid.',
    'GET /api/stats/activity-heatmap?chainId=&range=30d&dimension=mode|hourOfWeek - activity heatmap.',
    'GET /api/stats/activity-feed?chainId=&limit=40 - live activity feed.',
    'GET /api/tasks?chainId=&status=open|expired&sort=newest&limit=100 - task list. Distinct task posters per week are computed from it.'
  ];
  for (var i = 0; i < lines.length; i++) { ul.appendChild(el('li', null, lines[i])); }
  host.appendChild(ul);
  var ch = chainData();
  var cn = ch.task_counts || {};
  var p = el('p', 'note');
  p.textContent = 'Data as of ' + D.generated_at + '. The page is static and reads a cached data.json written by a scheduled job, so it never calls the API from a browser; the job refreshes it at least hourly. Rewards are the platform atomic reward units divided by 1e6. The API reports registered workers, active agents and open tasks as market-wide values, so those three are the same on both chains; paid workers and active wallets differ per chain. Distinct posters per week come from ' +
    ((cn.open || 0) + (cn.expired_seen || 0)) + ' tasks returned by the task list endpoint (' + (cn.open || 0) + ' open, ' + (cn.expired_seen || 0) + ' expired).';
  host.appendChild(p);
}

function renderAll() {
  renderChainSwitch();
  renderRangeSwitch();
  renderKpis();
  renderCharts();
  renderBreakdowns();
  renderHeat();
  renderFeed();
  renderTasks();
  renderMethods();
  q('asof').textContent = 'data as of ' + D.generated_at;
}

function boot() {
  var x = new XMLHttpRequest();
  x.open('GET', 'data.json', true);
  x.onload = function () {
    if (x.status === 200) {
      try { D = JSON.parse(x.responseText); renderAll(); }
      catch (e) { q('asof').textContent = 'data parse failed'; }
    } else { q('asof').textContent = 'data unavailable'; }
  };
  x.onerror = function () { q('asof').textContent = 'data unavailable'; };
  x.send();
}
boot();