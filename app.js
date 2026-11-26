'use strict';
var D = null;
var CHAIN = 'tempo';
var RANGE = '30d';
var BUCKET = 'day';
var VIEW = 'overview';
var VIEWS = [['overview', 'Overview', 'index.html'],
             ['flow', 'Where the money goes', 'flow.html'],
             ['swarm', 'The swarm', 'swarm.html'],
             ['insight', 'What is not obvious', 'insight.html']];

/* Freshness. The API sends no CORS header, so the browser never calls it:
   the page reads a published data.json. Say how old that file is, call a
   stale snapshot stale, and never let a missing field render as a zero. */
var STALE_MIN = 45;          // a snapshot older than this is flagged as stale
var LIVE_ENDPOINT = '';      // optional always-live JSON endpoint, same schema as data.json
var LIVE_TRIED = false;

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
function fmtInt(n) {
  if (n === null || n === undefined || n === '') { return '\u2014'; }
  var x = Number(n);
  if (!isFinite(x)) { return '\u2014'; }
  return Math.round(x).toLocaleString('en-US');
}
function fmtUsd(v) {
  if (v === null || v === undefined || v === '') { return '\u2014'; }
  var x = Number(v);
  if (!isFinite(x)) { return '\u2014'; }
  if (Math.abs(x) >= 1000000) { return '$' + (x / 1000000).toFixed(2) + 'M'; }
  var s = x.toFixed(4);
  s = s.replace(/0+$/, '');
  if (s.charAt(s.length - 1) === '.') { s = s.slice(0, -1); }
  return '$' + s;
}
function shortAddr(a) { return a ? a.slice(0, 6) + '...' + a.slice(-4) : ''; }
function chainData() { return D.chains[CHAIN]; }
function series() { var s = chainData().series || {}; return s[RANGE + '_' + BUCKET] || []; }

function drawLine(host, pts, opt) {
  if (!opt) { opt = {}; }
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
    var gy = pt + (ih * g / 4);
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
  if (!opt) { opt = {}; }
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
    var gy = pt + (ih * g / 4);
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
  var completed = null;
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
  q('postersNote').textContent = 'Distinct requester addresses per ISO week, computed from the open + expired task list (the only statuses the API exposes): ' +
    (cn.open || 0) + ' open and ' + (cn.expired_seen || 0) + ' expired tasks returned by the API. data.json carries the minimal fields of every expired task, so this figure can be recomputed from the published file alone.';
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
    'GET /api/tasks?chainId=&status=open|expired&sort=newest&limit=100 - task list. Distinct task posters per week and the expired tasks with no claimant are computed from it.',
    'GET /api/ecosystem/snapshot?chainId=&windowDays=30 - requester-worker graph: payment routes from poster to worker, lifetime totals, weekly settled amount.',
    'GET /api/ecosystem/events?chainId=&type=task_created|task_submitted|task_accepted|task_paid&limit=200 - public event log, used for the recent payments list and for time to a decision.'
  ];
  for (var i = 0; i < lines.length; i++) { ul.appendChild(el('li', null, lines[i])); }
  host.appendChild(ul);
  var ch = chainData();
  var cn = ch.task_counts || {};
  var p = el('p', 'note');
  p.textContent = 'Data as of ' + D.generated_at + '. The page is static and reads a cached data.json published by a GitHub Actions job that is scheduled to run every 5 minutes, so it never calls the API from a browser and no local machine has to be awake. The stamp is the moment that job fetched the data, and the age in the header is how long ago that was; past 45 minutes the page says the snapshot is stale instead of presenting it as live. Rewards are the platform atomic reward units divided by 1e6. The API reports registered workers, active agents and open tasks as market-wide values, so those three are the same on both chains; paid workers and active wallets differ per chain. Distinct posters per week come from ' +
    ((cn.open || 0) + (cn.expired_seen || 0)) + ' tasks returned by the task list endpoint (' + (cn.open || 0) + ' open, ' + (cn.expired_seen || 0) + ' expired). Amounts are shown exactly as the API reports them, in dollars, so any figure can be compared with the API directly. Names are the display names the API itself returns for those addresses; nothing is inferred.';
  host.appendChild(p);
}

function stampMs() {
  var t = Date.parse((D && D.generated_at) || '');
  return isFinite(t) ? t : null;
}
function dataAgeMs() {
  var t = stampMs();
  return t === null ? null : (Date.now() - t);
}
function fmtAge(ms) {
  if (ms === null) { return 'age unknown'; }
  if (ms < 60000) { return 'just now'; }
  var m = Math.floor(ms / 60000);
  if (m < 60) { return m + ' min old'; }
  var h = Math.floor(m / 60), rm = m % 60;
  if (h < 48) { return h + ' h' + (rm ? ' ' + rm + ' min' : '') + ' old'; }
  var d = Math.floor(h / 24), hd = h % 24;
  return d + ' d' + (hd ? ' ' + hd + ' h' : '') + ' old';
}
function isStale() {
  var ms = dataAgeMs();
  return ms === null || ms > STALE_MIN * 60000;
}
function renderFreshness() {
  var asof = q('asof'), box = q('freshness');
  var t = (D && D.generated_at) || 'unknown';
  var via = (D && D.source === 'live endpoint') ? 'live endpoint \u00b7 ' : '';
  if (asof) { asof.textContent = via + 'data as of ' + t + ' \u00b7 ' + fmtAge(dataAgeMs()); }
  if (!box) { return; }
  if (!isStale()) {
    box.hidden = true;
    box.textContent = '';
    document.body.removeAttribute('data-stale');
    return;
  }
  var ms = dataAgeMs();
  box.hidden = false;
  box.textContent = ms === null
    ? 'Data age unknown: this snapshot carries no usable timestamp, so treat every figure below as unverified.'
    : 'This snapshot is ' + fmtAge(ms) + ' \u2014 last published ' + t + '. Nothing newer has been published, so the figures below are the last published snapshot, not live.';
  document.body.setAttribute('data-stale', '1');
}
/* Fallback: when the published snapshot has aged past STALE_MIN, ask the
   always-live endpoint for a fresh copy. Only a complete payload is swapped
   in, and a failed fallback leaves the stale marker in place. */
function tryLive() {
  if (!LIVE_ENDPOINT || LIVE_TRIED) { return; }
  LIVE_TRIED = true;
  var x = new XMLHttpRequest();
  x.open('GET', LIVE_ENDPOINT, true);
  x.timeout = 20000;
  x.onload = function () {
    if (x.status !== 200) { return; }
    var j = null;
    try { j = JSON.parse(x.responseText); } catch (e) { return; }
    if (!j || !j.generated_at || !j.chains || !j.chains.tempo || !j.chains.base) { return; }
    D = j;
    D.source = 'live endpoint';
    renderAll();
  };
  x.onerror = function () {};
  x.send();
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
  renderHeroPulse();
  renderView();
  renderFreshness();
}

/* ---------------- views, share links, hero ---------------- */
var VIEW = 'overview';
var VIEWS = [['overview', 'Overview', 'index.html'],
             ['flow', 'Where the money goes', 'flow.html'],
             ['swarm', 'The swarm', 'swarm.html'],
             ['insight', 'What is not obvious', 'insight.html']];

function num(v) { return (v === null || v === undefined || v === '') ? '\u2014' : fmtInt(v); }
function money(v) { return (v === null || v === undefined) ? '\u2014' : fmtUsd(v); }
function whoLabel(name, addr) { return name ? name : (shortAddr(addr) + ' (address)'); }
function fmtHours(h) {
  if (h === null || h === undefined) { return '\u2014'; }
  if (h < 1) { return Math.round(h * 60) + ' min'; }
  if (h < 48) { return h.toFixed(1) + ' h'; }
  return (h / 24).toFixed(1) + ' d';
}

function viewFromUrl() {
  var m = /[?&]view=([a-z]+)/.exec(window.location.search || '');
  var v = m ? m[1] : 'overview';
  for (var i = 0; i < VIEWS.length; i++) { if (VIEWS[i][0] === v) { return v; } }
  return 'overview';
}
function shareUrl() {
  var dir = (window.location.pathname || '/').replace(/[^/]*$/, '');
  var file = 'index.html';
  for (var i = 0; i < VIEWS.length; i++) { if (VIEWS[i][0] === VIEW) { file = VIEWS[i][2]; } }
  return window.location.origin + dir + file;
}
function copyShare() {
  var url = shareUrl();
  var btn = document.getElementById('shareBtn');
  function done(ok) { if (btn) { btn.textContent = ok ? 'Link copied' : 'Copy: ' + url; } }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () { done(true); }, function () { done(false); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(true); } catch (e) { done(false); }
    document.body.removeChild(ta);
  }
}
function renderViewNav() {
  var host = q('viewNav');
  host.innerHTML = '';
  for (var i = 0; i < VIEWS.length; i++) {
    (function (key, label) {
      var b = el('button', 'tab' + (VIEW === key ? ' on' : ''), label);
      b.onclick = function () { setView(key); };
      host.appendChild(b);
    })(VIEWS[i][0], VIEWS[i][1]);
  }
  var sh = el('button', 'tab share', 'Copy link to this view');
  sh.id = 'shareBtn';
  sh.onclick = copyShare;
  host.appendChild(sh);
}
function setView(key) {
  VIEW = key;
  var u = (window.location.pathname || 'index.html') + '?view=' + key;
  try { window.history.replaceState({}, '', u); } catch (e) {}
  renderView();
}
function renderView() {
  var names = ['overview', 'flow', 'swarm', 'insight'];
  for (var i = 0; i < names.length; i++) {
    var n = q('view-' + names[i]);
    if (n) { n.hidden = (names[i] !== VIEW); }
  }
  renderViewNav();
  if (VIEW === 'flow') { renderFlow(); }
  else if (VIEW === 'swarm') { renderSwarm(); }
  else if (VIEW === 'insight') { renderInsight(); }
}
function statCards(host, items) {
  host.innerHTML = '';
  for (var i = 0; i < items.length; i++) {
    var c = el('div', 'kpi');
    c.appendChild(el('div', 'kv', items[i][0]));
    c.appendChild(el('div', 'kl', items[i][1]));
    host.appendChild(c);
  }
}

function renderHeroPulse() {
  var host = q('heroPulse');
  if (!host) { return; }
  host.innerHTML = '';
  var ch = chainData() || {};
  var fl = ch.flow || {};
  var tot = fl.totals || {};
  var st = ch.stats || {};
  var items = [[money(tot.paidAmount), 'paid out in the last 30 days'],
               [num(tot.settlements), 'settlements recorded'],
               [num((fl.lifetime || {}).paidWorkers), 'workers paid'],
               [num(st.activeAgents7d), 'active agents, 7 days']];
  for (var i = 0; i < items.length; i++) {
    var c = el('div', 'pv');
    c.appendChild(el('div', 'pvv', items[i][0]));
    c.appendChild(el('div', 'pvl', items[i][1]));
    host.appendChild(c);
  }
}

/* ---------------- money flow view ---------------- */
function drawSankey(host, links) {
  host.innerHTML = '';
  if (!links || !links.length) { host.appendChild(el('p', 'note', 'No payment routes recorded in this window.')); return; }
  var i, j, k, l;
  var srcs = {}, tgts = {};
  for (i = 0; i < links.length; i++) {
    l = links[i];
    if (!srcs[l.from]) { srcs[l.from] = {addr: l.from, name: l.from_name, links: []}; }
    if (!tgts[l.to]) { tgts[l.to] = {addr: l.to, name: l.to_name, links: []}; }
  }
  function rank(map, n) {
    var arr = [], k;
    for (k in map) { if (map.hasOwnProperty(k)) { arr.push(map[k]); } }
    arr.sort(function (a, b) { return b.total - a.total; });
    return arr.slice(0, n);
  }
  // first pass: totals over every route, to pick the biggest ends
  var tmap = {};
  for (i = 0; i < links.length; i++) {
    l = links[i];
    if (!tmap[l.from]) { tmap[l.from] = 0; }
    if (!tmap[l.to]) { tmap[l.to] = 0; }
    tmap[l.from] += (l.usd || 0); tmap[l.to] += (l.usd || 0);
  }
  for (k in srcs) { if (srcs.hasOwnProperty(k)) { srcs[k].total = tmap[k] || 0; } }
  for (k in tgts) { if (tgts.hasOwnProperty(k)) { tgts[k].total = tmap[k] || 0; } }
  var L = rank(srcs, 8), R = rank(tgts, 8);
  var keepL = {}, keepR = {};
  for (i = 0; i < L.length; i++) { keepL[L[i].addr] = 1; }
  for (i = 0; i < R.length; i++) { keepR[R[i].addr] = 1; }
  var use = [];
  for (i = 0; i < links.length; i++) {
    l = links[i];
    if (keepL[l.from] && keepR[l.to]) { use.push(l); }
  }
  use.sort(function (a, b) { return (b.usd || 0) - (a.usd || 0); });
  use = use.slice(0, 26);
  if (!use.length) { host.appendChild(el('p', 'note', 'No route connects the largest requesters and workers in this window.')); return; }
  // second pass: totals over the routes actually drawn, so heights match ribbons
  var totL = {}, totR = {}, sumL = 0, sumR = 0;
  for (i = 0; i < use.length; i++) {
    l = use[i];
    totL[l.from] = (totL[l.from] || 0) + (l.usd || 0);
    totR[l.to] = (totR[l.to] || 0) + (l.usd || 0);
    sumL += (l.usd || 0); sumR += (l.usd || 0);
  }
  var Ln = [], Rn = [];
  for (k in srcs) { if (srcs.hasOwnProperty(k) && totL[k]) { srcs[k].total = totL[k]; Ln.push(srcs[k]); } }
  for (k in tgts) { if (tgts.hasOwnProperty(k) && totR[k]) { tgts[k].total = totR[k]; Rn.push(tgts[k]); } }
  Ln.sort(function (a, b) { return b.total - a.total; });
  Rn.sort(function (a, b) { return b.total - a.total; });
  var W = 960, H = 540, pad = 24, gap = 34, nodeW = 11;
  var xL = 196, xR = W - 196;
  var avail = H - pad * 2 - gap * (Math.max(Ln.length, Rn.length) - 1);
  function place(arr, total) {
    var out = [], y = pad;
    for (var k = 0; k < arr.length; k++) {
      var h = total > 0 ? Math.max(4, (arr[k].total / total) * avail) : 4;
      out.push({node: arr[k], y: y, h: h, used: 0});
      y += h + gap;
    }
    return out;
  }
  var Lp = place(Ln, sumL), Rp = place(Rn, sumR);
  var mapL = {}, mapR = {};
  for (i = 0; i < Lp.length; i++) { mapL[Lp[i].node.addr] = Lp[i]; }
  for (i = 0; i < Rp.length; i++) { mapR[Rp[i].node.addr] = Rp[i]; }
  var svg = svgEl('svg', {viewBox: '0 0 ' + W + ' ' + H, class: 'plot sankey'});
  var maxU = 0;
  for (i = 0; i < use.length; i++) { if ((use[i].usd || 0) > maxU) { maxU = use[i].usd || 0; } }
  for (i = 0; i < use.length; i++) {
    l = use[i];
    var sn = mapL[l.from], tn = mapR[l.to];
    if (!sn || !tn) { continue; }
    var frac = sumL > 0 ? (l.usd || 0) / sumL : 0;
    var sy0 = sn.y + sn.used, sy1 = sy0 + frac * sn.h;
    var tf = sumR > 0 ? (l.usd || 0) / sumR : 0;
    var ty0 = tn.y + tn.used, ty1 = ty0 + tf * tn.h;
    sn.used += frac * sn.h; tn.used += tf * tn.h;
    var x0 = xL + nodeW, x1 = xR, cx0 = x0 + (x1 - x0) * 0.45, cx1 = x1 - (x1 - x0) * 0.45;
    var d = 'M ' + x0 + ' ' + sy0.toFixed(1) +
            ' C ' + cx0.toFixed(1) + ' ' + sy0.toFixed(1) + ' ' + cx1.toFixed(1) + ' ' + ty0.toFixed(1) + ' ' + x1 + ' ' + ty0.toFixed(1) +
            ' L ' + x1 + ' ' + ty1.toFixed(1) +
            ' C ' + cx1.toFixed(1) + ' ' + ty1.toFixed(1) + ' ' + cx0.toFixed(1) + ' ' + sy1.toFixed(1) + ' ' + x0 + ' ' + sy1.toFixed(1) + ' Z';
    var path = svgEl('path', {d: d, class: 'ribbon'});
    path.setAttribute('fill-opacity', (0.16 + 0.34 * (maxU > 0 ? (l.usd || 0) / maxU : 0)).toFixed(2));
    var tt = svgEl('title', {});
    tt.textContent = whoLabel(l.from_name, l.from) + ' \u2192 ' + whoLabel(l.to_name, l.to) + ': ' + fmtUsd(l.usd) + ' over ' + (l.tasks || 0) + ' tasks';
    path.appendChild(tt);
    svg.appendChild(path);
  }
  function labels(arr, side) {
    for (var k = 0; k < arr.length; k++) {
      var nd = arr[k].node;
      var cy = arr[k].y + arr[k].h / 2;
      var name = whoLabel(nd.name, nd.addr);
      if (name.length > 22) { name = name.slice(0, 21) + '\u2026'; }
      var x = side === 'L' ? xL - 10 : xR + nodeW + 10;
      var anchor = side === 'L' ? 'end' : 'start';
      var t1 = svgEl('text', {x: x, y: cy - 2, class: 'snlabel', 'text-anchor': anchor});
      t1.textContent = name;
      svg.appendChild(t1);
      var t2 = svgEl('text', {x: x, y: cy + 14, class: 'snval', 'text-anchor': anchor});
      t2.textContent = fmtUsd(arr[k].node.total);
      svg.appendChild(t2);
    }
  }
  labels(Lp, 'L');
  labels(Rp, 'R');
  host.appendChild(svg);
  var cap = el('p', 'note', 'Left: requesters who paid the most. Right: workers who were paid the most. Ribbon width is the amount paid.');
  host.appendChild(cap);
}

function renderFlow() {
  var ch = chainData() || {};
  var fl = ch.flow || {};
  var tot = fl.totals || {}, life = fl.lifetime || {};
  var con = fl.concentration || {};
  statCards(q('flowStats'), [
    [money(tot.paidAmount), 'paid in the last 30 days'],
    [num(tot.settlements), 'settlements in the last 30 days'],
    [num(con.payers), 'requesters that paid, 30 days'],
    [num(life.paidWorkers), 'workers paid, all time'],
    [money(life.medianPayout), 'median payout, all time'],
    [money(life.largestPayout), 'largest payout, all time']]);
  var win = fl.window || {};
  q('flowNote').textContent = 'Window ' + (win.from || '\u2014') + ' to ' + (win.to || '\u2014') + '. The API returns ' +
    (con.routes || 0) + ' payment routes for this chain; the ' + (fl.paid_links || []).length +
    ' largest are drawn here, out of ' + (tot.relationships || 0) + ' requester-worker relationships in the same window.';
  drawSankey(q('flowSankey'), fl.paid_links || []);
  var wk = fl.weekly || [];
  var rows = [];
  for (var i = 0; i < wk.length; i++) { rows.push({label: (wk[i].start || '').slice(5, 10), y: wk[i].usd || 0}); }
  drawBars(q('flowWeekly'), rows, {fmt: fmtUsd});
  q('flowWeeklyNote').textContent = 'Weekly settled amount, all time on this chain, straight from the API snapshot.';
  var pay = fl.swarm || [];
  var host = q('flowPayments');
  host.innerHTML = '';
  if (!pay.length) { host.appendChild(el('li', 'fitem', 'No payments in the fetched window.')); }
  for (i = 0; i < Math.min(pay.length, 15); i++) {
    var p = pay[i];
    var li = el('li', 'fitem');
    var head = el('div', 'fhead');
    head.appendChild(el('span', 'ftype', 'paid'));
    head.appendChild(el('span', 'ftime', (p.at || '').replace('T', ' ').slice(0, 19) + 'Z'));
    li.appendChild(head);
    li.appendChild(el('div', 'ftitle', p.title || p.ref || p.task_id || ''));
    var meta = el('div', 'fmeta');
    meta.appendChild(el('span', 'chip', fmtUsd(p.amount_usd)));
    meta.appendChild(el('span', 'chip dim', whoLabel(p.requester_name, p.requester) + ' \u2192 ' + whoLabel(p.worker_name, p.worker)));
    li.appendChild(meta);
    host.appendChild(li);
  }
  var body = q('flowTable');
  body.innerHTML = '';
  var links = fl.paid_links || [];
  for (i = 0; i < Math.min(links.length, 25); i++) {
    var l = links[i];
    var tr = el('tr');
    var a = el('td');
    a.appendChild(el('div', null, whoLabel(l.from_name, l.from)));
    a.appendChild(el('div', 'tref', shortAddr(l.from)));
    tr.appendChild(a);
    var b = el('td');
    b.appendChild(el('div', null, whoLabel(l.to_name, l.to)));
    b.appendChild(el('div', 'tref', shortAddr(l.to)));
    tr.appendChild(b);
    tr.appendChild(el('td', 'tnum', fmtUsd(l.usd)));
    tr.appendChild(el('td', 'tnum', fmtInt(l.tasks)));
    tr.appendChild(el('td', 'tnum', (l.last_at || '').slice(0, 10)));
    body.appendChild(tr);
  }
}

/* ---------------- swarm view ---------------- */
function drawStacked(host, rows, legend) {
  host.innerHTML = '';
  if (!rows || !rows.length) { host.appendChild(el('p', 'note', 'No data.')); return; }
  var W = 660, H = 230, pl = 58, pr = 12, pt = 16, pb = 28;
  var max = 0, i, j;
  for (i = 0; i < rows.length; i++) {
    var s = 0;
    for (j = 0; j < rows[i].parts.length; j++) { s += rows[i].parts[j].v || 0; }
    if (s > max) { max = s; }
  }
  if (max <= 0) { max = 1; }
  var iw = W - pl - pr, ih = H - pt - pb;
  var n = rows.length;
  var gap = Math.min(3, (iw / n) * 0.25);
  var bw = Math.max(1, (iw - (n - 1) * gap) / n);
  var svg = svgEl('svg', {viewBox: '0 0 ' + W + ' ' + H, class: 'plot'});
  for (var g = 0; g <= 4; g++) {
    var gy = pt + (ih * g / 4);
    svg.appendChild(svgEl('line', {x1: pl, x2: W - pr, y1: gy, y2: gy, class: 'grid'}));
    var at = svgEl('text', {x: pl - 8, y: gy + 4, class: 'ax'});
    at.textContent = fmtInt(max * (4 - g) / 4);
    svg.appendChild(at);
  }
  for (i = 0; i < n; i++) {
    var y = pt + ih;
    for (j = 0; j < rows[i].parts.length; j++) {
      var v = rows[i].parts[j].v || 0;
      if (v <= 0) { continue; }
      var h = (v / max) * ih;
      y -= h;
      var rect = svgEl('rect', {x: pl + i * (bw + gap), y: y, width: bw, height: Math.max(0.5, h), class: rows[i].parts[j].cls});
      var ttl = svgEl('title', {});
      ttl.textContent = rows[i].label + ' ' + rows[i].parts[j].name + ': ' + fmtInt(v);
      rect.appendChild(ttl);
      svg.appendChild(rect);
    }
  }
  var idx = [0, Math.floor((n - 1) / 2), n - 1];
  for (i = 0; i < idx.length; i++) {
    var xt = svgEl('text', {x: pl + idx[i] * (bw + gap) + bw / 2, y: H - 8, class: 'ax mid'});
    xt.textContent = rows[idx[i]].label;
    svg.appendChild(xt);
  }
  host.appendChild(svg);
  if (legend && legend.length) {
    var lg = el('div', 'legend');
    for (i = 0; i < legend.length; i++) {
      var item = el('span', 'lgi');
      var sw = el('span', 'lgd ' + legend[i].cls);
      item.appendChild(sw);
      item.appendChild(el('span', null, legend[i].name));
      lg.appendChild(item);
    }
    host.appendChild(lg);
  }
}

function renderSwarm() {
  var ch = chainData() || {};
  var fl = ch.flow || {};
  var life = fl.lifetime || {}, dec = fl.decision || {}, counts = fl.event_counts || {};
  statCards(q('swarmStats'), [
    [num(life.tasks), 'tasks created, all time'],
    [num(life.submissions), 'submissions, all time'],
    [num(life.settlements), 'settlements, all time'],
    [money(life.paidAmount), 'paid out, all time'],
    [dec.n ? fmtHours(dec.median_hours) : '\u2014', 'median time to a decision'],
    [num(counts.task_paid), 'payments in the event window']]);
  var body = q('swarmTable');
  body.innerHTML = '';
  var rows = fl.converged || [];
  if (!rows.length) {
    var tr0 = el('tr');
    var td0 = el('td', 'tnum', 'No task with recorded submissions in the fetched lists.');
    tr0.appendChild(td0);
    body.appendChild(tr0);
  }
  for (var i = 0; i < rows.length; i++) {
    var t = rows[i];
    var tr = el('tr');
    var c1 = el('td');
    c1.appendChild(el('div', 'ttitle', t.title || ''));
    c1.appendChild(el('div', 'tref', t.ref || ''));
    tr.appendChild(c1);
    tr.appendChild(el('td', 'tnum strong', fmtInt(t.submissions)));
    var c3 = el('td');
    c3.appendChild(el('div', null, whoLabel(t.requester_name, t.requester)));
    c3.appendChild(el('div', 'tref', shortAddr(t.requester)));
    tr.appendChild(c3);
    tr.appendChild(el('td', 'tnum', t.status || '\u2014'));
    tr.appendChild(el('td', 'tnum', t.paid_usd !== null && t.paid_usd !== undefined ? fmtUsd(t.paid_usd) : (t.reward_usd !== null && t.reward_usd !== undefined ? fmtUsd(t.reward_usd) : '\u2014')));
    var c6 = el('td');
    if (t.worker_name || t.claimed_by) {
      c6.appendChild(el('div', null, whoLabel(t.worker_name, t.claimed_by)));
      c6.appendChild(el('div', 'tref', shortAddr(t.claimed_by)));
    } else { c6.appendChild(el('div', 'dim', '\u2014')); }
    tr.appendChild(c6);
    body.appendChild(tr);
  }
  var hist = fl.histogram || [];
  var hrows = [];
  for (i = 0; i < hist.length; i++) {
    hrows.push({label: (hist[i].start || '').slice(5, 10), parts: [
      {v: hist[i].work || 0, cls: 'swork', name: 'work'},
      {v: hist[i].paid || 0, cls: 'spaid', name: 'paid'},
      {v: hist[i].created || 0, cls: 'screated', name: 'created'}]});
  }
  drawStacked(q('swarmHist'), hrows, [{name: 'worker-task relationships', cls: 'swork'},
                                        {name: 'payments', cls: 'spaid'},
                                        {name: 'tasks created', cls: 'screated'}]);
  q('swarmHistNote').textContent = 'Public marketplace events per bucket across the window the API returns, in the API\u2019s own buckets of roughly 12 hours.';
  var db = dec.buckets || [];
  var bars = [];
  for (i = 0; i < db.length; i++) { bars.push({label: db[i].label, count: db[i].count}); }
  drawHBars(q('swarmDecision'), bars);
  q('swarmDecisionNote').textContent = 'Hours between a task being created and the payment that settles it, over the ' +
    (dec.n || 0) + ' tasks where both events are in the fetched event window. Median ' +
    (dec.n ? fmtHours(dec.median_hours) : '\u2014') + ', a quarter to three quarters of decisions took ' +
    (dec.n ? fmtHours(dec.p25_hours) : '\u2014') + ' to ' + (dec.n ? fmtHours(dec.p75_hours) : '\u2014') + '.';
}

/* ---------------- insight view ---------------- */
function drawAmountBars(host, rows) {
  host.innerHTML = '';
  if (!rows || !rows.length) { host.appendChild(el('p', 'note', 'No data.')); return; }
  var max = 0, i;
  for (i = 0; i < rows.length; i++) { if ((rows[i].usd || 0) > max) { max = rows[i].usd || 0; } }
  if (!max) { max = 1; }
  for (i = 0; i < rows.length; i++) {
    var line = el('div', 'hrow');
    line.appendChild(el('span', 'hlabel', rows[i].label));
    var track = el('div', 'htrack');
    var fill = el('div', 'hfill');
    fill.style.width = (((rows[i].usd || 0) / max) * 100).toFixed(1) + '%';
    track.appendChild(fill);
    line.appendChild(track);
    line.appendChild(el('span', 'hval', fmtUsd(rows[i].usd)));
    host.appendChild(line);
  }
}

function renderInsight() {
  var ch = chainData() || {};
  var fl = ch.flow || {};
  var con = fl.concentration || {};
  var es = ch.expired_summary || {};
  var life = fl.lifetime || {};
  statCards(q('insightStats'), [
    [con.top1_share !== null && con.top1_share !== undefined ? (con.top1_share * 100).toFixed(1) + '%' : '\u2014', 'of payments from the top requester'],
    [con.top3_share !== null && con.top3_share !== undefined ? (con.top3_share * 100).toFixed(1) + '%' : '\u2014', 'from the top three requesters'],
    [num(con.payers), 'requesters that paid at all'],
    [num((fl.totals || {}).agents), 'agents in the graph'],
    [num(es.unclaimed), 'expired tasks with no claimant'],
    [money(es.unclaimed_reward_usd), 'reward value that expired unclaimed']]);
  q('insightNote').textContent = 'Concentration is measured over the ' + (con.paid_total_usd !== null && con.paid_total_usd !== undefined ? fmtUsd(con.paid_total_usd) : '\u2014') +
    ' of payments in the route list the API returns for this chain over the last 30 days, split by the address that sent the money. The platform total for the same window is ' +
    fmtUsd((fl.totals || {}).paidAmount) + '.';
  var payers = fl.top_payers || [];
  var rows = [];
  for (var i = 0; i < payers.length; i++) {
    rows.push({label: whoLabel(payers[i].name, payers[i].address), usd: payers[i].usd});
  }
  drawAmountBars(q('insightPayers'), rows);
  q('insightPayersNote').textContent = 'Top requesters by reward posted, from the API snapshot nodes.';
  drawHBars(q('insightDead'), [
    {label: 'expired, claimed', count: es.claimed || 0},
    {label: 'expired, no claim', count: es.unclaimed || 0}]);
  q('insightDeadNote').textContent = 'Of ' + (es.expired || 0) + ' expired tasks the API returns for this chain, ' +
    (es.unclaimed || 0) + ' expired with no claimant, carrying ' + fmtUsd(es.unclaimed_reward_usd || 0) +
    ' of reward value that no worker collected. Claimed tasks carry ' + fmtUsd(es.claimed_reward_usd || 0) + '.';
  var wk = fl.weekly || [];
  var wrows = [];
  for (i = 0; i < wk.length; i++) { wrows.push({label: (wk[i].start || '').slice(5, 10), y: wk[i].usd || 0}); }
  drawBars(q('insightWeekly'), wrows, {fmt: fmtUsd});
  var growth = '';
  if (wk.length >= 2) {
    var a = wk[wk.length - 2].usd || 0, b = wk[wk.length - 1].usd || 0;
    growth = a > 0 ? ' The last week settled ' + fmtUsd(b) + ' against ' + fmtUsd(a) + ' the week before, ' +
            (b >= a ? 'up ' : 'down ') + Math.abs(Math.round((b - a) / a * 1000) / 10) + '%.' : '';
  }
  q('insightWeeklyNote').textContent = 'Weekly settled amount on this chain, straight from the API snapshot.' + growth;
}

function boot() {
  var x = new XMLHttpRequest();
  x.open('GET', 'data.json', true);
  x.onload = function () {
    if (x.status === 200) {
      try { D = JSON.parse(x.responseText); }
      catch (e) { q('asof').textContent = 'data parse failed'; return; }
      VIEW = viewFromUrl();
      renderAll();
      setInterval(renderFreshness, 30000);
      if (isStale()) { tryLive(); }
    } else { q('asof').textContent = 'data unavailable'; }
  };
  x.onerror = function () { q('asof').textContent = 'data unavailable'; };
  x.send();
}
boot();