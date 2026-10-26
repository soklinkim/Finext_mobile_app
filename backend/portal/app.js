// Finext Lender Portal: partner bank staff review SMEs that consented to share their data.
// Every value from the API is escaped with esc() before it is put into HTML.

const app = document.getElementById('app');
const account = document.getElementById('account');

const config = await fetch('config.json').then((r) => r.json());
if (!config.supabasePublishableKey) {
  app.innerHTML = '<div class="card login"><h2>Portal not configured</h2><p class="muted">Set SUPABASE_PUBLISHABLE_KEY in backend/.env and restart the API.</p></div>';
  throw new Error('missing SUPABASE_PUBLISHABLE_KEY');
}
const supabase = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'finext-lender-portal' },
});

let lender = null;

// ------------------------------------------------------------------ helpers
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function money(minor, currency) {
  if (minor == null) return '—';
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  if (currency === 'KHR') return `${sign}${abs.toLocaleString('en-US')} ៛`;
  return `${sign}$${(abs / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatValue(value, format) {
  if (value == null) return '—';
  if (format === 'percent') return `${(value * 100).toFixed(1)}%`;
  if (format === 'times') return `${value.toFixed(2)}×`;
  if (format === 'months') return `${value} mo`;
  if (format === 'days') return `${value} d`;
  return String(value);
}

const RATIO_FORMATS = {
  current_ratio: 'times', debt_to_equity: 'times', interest_coverage: 'times', dscr: 'times',
  gross_margin: 'percent', net_margin: 'percent', ebitda_margin: 'percent', revenue_growth: 'percent',
  operating_expense_ratio: 'percent', debt_to_asset: 'percent', inventory_days: 'days', receivable_days: 'days',
};

const date = (ms) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const LEVELS = {
  ready: 'Ready to apply',
  almost: 'Almost ready',
  not_ready: 'Not ready yet',
  insufficient_data: 'Not enough data',
};
const STATUS = { pass: 'Good', warn: 'Watch', fail: 'Weak', missing: 'No data' };
const DECISIONS = { new: 'New', reviewing: 'Reviewing', approved: 'Approved', declined: 'Declined' };
const SCOPE_LABELS = {
  readiness: 'Loan readiness', statements: 'Financial statements', health: 'Financial health ratios',
  trend: 'Monthly income & expenses', documents: 'Business documents',
};
const DOC_LABELS = { patent_tax: 'Patent Tax certificate', certificate_of_incorporation: 'Certificate of Incorporation' };

const chip = (cls, text) => `<span class="chip ${esc(cls)}">${esc(text)}</span>`;

async function api(path, init = {}) {
  const send = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return fetch(path, { ...init, headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  };
  let response = await send();
  if (response.status === 401) {
    await supabase.auth.refreshSession();
    response = await send();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(typeof body.detail === 'string' ? body.detail : `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response;
}

const loading = () => { app.innerHTML = '<p class="muted">Loading…</p>'; };

// ------------------------------------------------------------------ auth
function renderLogin(message = '') {
  account.innerHTML = '';
  app.innerHTML = `
    <form class="card login stack" id="login">
      <div><h1>Sign in</h1><p class="muted">For staff of Finext partner banks and MFIs.</p></div>
      <div><label for="email">Work email</label><input id="email" type="email" autocomplete="username" required /></div>
      <div><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" required /></div>
      <p class="error" id="login-error">${esc(message)}</p>
      <button type="submit">Sign in</button>
    </form>`;
  document.getElementById('login').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    const { error } = await supabase.auth.signInWithPassword({
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    });
    button.disabled = false;
    if (error) document.getElementById('login-error').textContent = error.message;
    else start();
  });
}

async function signOut() {
  await supabase.auth.signOut();
  lender = null;
  location.hash = '';
  renderLogin();
}

async function start() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return renderLogin();
  try {
    lender = (await (await api('/lender/me')).json()).lender;
  } catch (error) {
    await supabase.auth.signOut();
    return renderLogin(error.status === 403 ? 'This account is not linked to a partner bank. Ask Finext to add you.' : error.message);
  }
  account.innerHTML = `<span><strong>${esc(lender.name)}</strong> · ${esc(data.session.user.email)}</span><button class="soft" id="signout">Sign out</button>`;
  document.getElementById('signout').addEventListener('click', signOut);
  route();
}

// ------------------------------------------------------------------ applicant list
async function renderList() {
  loading();
  let applicants;
  try {
    applicants = (await (await api('/lender/applicants')).json()).applicants;
  } catch (error) {
    app.innerHTML = `<div class="card"><p class="error">${esc(error.message)}</p></div>`;
    return;
  }
  app.innerHTML = `
    <div class="stack">
      <div class="spread">
        <div><h1>Applicants</h1><p class="muted">Businesses that chose to share their Finext data with ${esc(lender.name)}.</p></div>
        <div class="row" style="flex:0 1 420px">
          <input id="search" type="search" placeholder="Search business" aria-label="Search business" />
          <select id="filter" aria-label="Filter by decision">
            <option value="">All decisions</option>
            ${Object.entries(DECISIONS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="card table-wrap" id="list"></div>
      <p class="muted small">Readiness scores are calculated from each business's own bookkeeping records. They support, and do not replace, your bank's credit assessment.</p>
    </div>`;

  const draw = () => {
    const q = document.getElementById('search').value.trim().toLowerCase();
    const decision = document.getElementById('filter').value;
    const rows = applicants
      .filter((a) => (!q || (a.businessName || '').toLowerCase().includes(q)) && (!decision || a.decision === decision))
      .sort((a, b) => (b.readinessScore ?? -1) - (a.readinessScore ?? -1));
    document.getElementById('list').innerHTML = rows.length === 0
      ? `<p class="muted">${applicants.length ? 'No applicants match.' : 'No businesses are sharing data with your bank yet.'}</p>`
      : `<table>
          <thead><tr><th>Business</th><th class="hide-sm">Industry · Location</th><th>Readiness</th><th>Decision</th><th class="hide-sm">Shared</th><th class="hide-sm">Access until</th></tr></thead>
          <tbody>${rows.map((a) => `
            <tr class="clickable" data-id="${esc(a.id)}" tabindex="0">
              <td><strong>${esc(a.businessName || 'Unnamed business')}</strong></td>
              <td class="hide-sm muted">${esc([a.industry, a.location].filter(Boolean).join(' · ') || '—')}</td>
              <td>${a.readinessScore != null ? `<strong>${esc(a.readinessScore)}</strong> ${chip(a.readinessLevel, LEVELS[a.readinessLevel] || '')}` : a.readinessLevel ? chip(a.readinessLevel, LEVELS[a.readinessLevel]) : '<span class="muted">Not shared</span>'}</td>
              <td>${chip(a.decision, DECISIONS[a.decision])}</td>
              <td class="hide-sm">${date(a.createdAt)}</td>
              <td class="hide-sm">${date(a.expiresAt)}</td>
            </tr>`).join('')}</tbody>
        </table>`;
    document.querySelectorAll('tr[data-id]').forEach((tr) => {
      const open = () => { location.hash = `#/applicant/${tr.dataset.id}`; };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    });
  };
  document.getElementById('search').addEventListener('input', draw);
  document.getElementById('filter').addEventListener('change', draw);
  draw();
}

// ------------------------------------------------------------------ applicant detail
const notShared = (title) => `<div class="card"><h2>${esc(title)}</h2><p class="muted">Not shared by the business.</p></div>`;

function readinessSection(r) {
  if (!r) return notShared('Loan readiness');
  const pct = r.score ?? 0;
  const ring = r.level === 'ready' ? 'var(--success)' : r.level === 'almost' ? 'var(--warning)' : r.level === 'not_ready' ? 'var(--danger)' : 'var(--neutral-300)';
  const byPillar = (id) => r.checks.filter((c) => c.pillar === id);
  return `
    <div class="card stack">
      <div class="spread"><h2>Loan readiness</h2><span class="muted small">Data coverage ${Math.round(r.coverage * 100)}%</span></div>
      <div class="score">
        <div class="score-ring" style="--pct:${pct};--ring:${ring}"><div>${r.score ?? '—'}</div></div>
        <div class="stack" style="gap:6px">
          ${chip(r.level, LEVELS[r.level])}
          <p class="muted small" style="margin:0">Weighted score from repayment ability (30%), financial strength (25%), profitability (20%), record keeping (15%) and documents (10%). Checks without enough data are left out. Below 50% data coverage, or with fewer than 3 months of entries, the result is "Not enough data".</p>
        </div>
      </div>
      ${r.level === 'insufficient_data' ? '<div class="notice warn">The business has too little recorded history for a reliable score. Treat the figures below with caution.</div>' : ''}
      <div>
        ${r.pillars.map((p) => `
          <div class="pillar">
            <span>${esc(p.label)} <span class="muted small">· ${p.weight}%</span></span>
            <div class="bar"><div style="width:${p.score ?? 0}%"></div></div>
            <strong style="text-align:right">${p.score ?? '—'}</strong>
          </div>`).join('')}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Check</th><th class="num">Value</th><th>Status</th><th class="hide-sm">Note</th></tr></thead>
          <tbody>${r.pillars.map((p) => byPillar(p.id).map((c) => `
            <tr><td>${esc(c.label)}</td><td class="num">${esc(formatValue(c.value, c.format))}</td><td>${chip(c.status, STATUS[c.status])}</td><td class="hide-sm muted small">${esc(c.note || '')}</td></tr>`).join('')).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function healthSection(h) {
  if (!h) return notShared('Financial health ratios');
  if (h.error) return `<div class="card"><h2>Financial health ratios</h2><p class="muted">${esc(h.error)}</p></div>`;
  return `
    <div class="card stack">
      <div class="spread"><h2>Financial health ratios</h2><span class="muted small">${esc(h.period)}</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Ratio</th><th class="num">Value</th><th class="num hide-sm">Benchmark</th><th>Status</th></tr></thead>
        <tbody>${h.ratios.map((r) => {
          const status = { green: 'pass', yellow: 'warn', red: 'fail', not_available: 'missing' }[r.status];
          const fmt = RATIO_FORMATS[r.id];
          return `<tr><td>${esc(r.label)}${r.message ? `<div class="muted small">${esc(r.message)}</div>` : ''}</td>
            <td class="num">${esc(formatValue(r.value, fmt))}</td>
            <td class="num hide-sm muted">${r.betterWhen === 'higher' ? '≥' : '≤'} ${esc(formatValue(r.benchmark, fmt))}</td>
            <td>${chip(status, STATUS[status])}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;
}

function trendSection(t) {
  if (!t) return notShared('Monthly income & expenses');
  const max = Math.max(1, ...t.history.flatMap((p) => [p.income, p.expense]));
  const w = 520, h = 160, slot = w / t.history.length, bar = Math.min(22, slot / 3);
  const bars = t.history.map((p, i) => {
    const x = i * slot + slot / 2;
    const ih = (p.income / max) * (h - 24), eh = (p.expense / max) * (h - 24);
    const label = new Date(`${p.month}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    return `<rect x="${x - bar - 1}" y="${h - 20 - ih}" width="${bar}" height="${ih}" rx="3" fill="var(--primary-500)"><title>Income ${esc(money(p.income, t.currency))}</title></rect>
      <rect x="${x + 1}" y="${h - 20 - eh}" width="${bar}" height="${eh}" rx="3" fill="var(--expense)" opacity=".55"><title>Expense ${esc(money(p.expense, t.currency))}</title></rect>
      <text x="${x}" y="${h - 4}" text-anchor="middle" font-size="11" fill="var(--neutral-600)">${esc(label)}</text>`;
  }).join('');
  const a = t.basicAnalysis;
  return `
    <div class="card stack">
      <div class="spread"><h2>Monthly income & expenses</h2><span class="muted small">${t.activeMonths} of the last ${t.history.length} months have entries</span></div>
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Monthly income and expenses" style="width:100%;max-height:220px">${bars}</svg>
      <div class="legend"><span><i style="background:var(--primary-500)"></i>Income</span><span><i style="background:var(--expense);opacity:.55"></i>Expense</span></div>
      <div class="row">
        <div><div class="muted small">Total income</div><strong>${esc(money(a.totalIncome, t.currency))}</strong></div>
        <div><div class="muted small">Total expense</div><strong>${esc(money(a.totalExpense, t.currency))}</strong></div>
        <div><div class="muted small">Net</div><strong>${esc(money(a.net, t.currency))}</strong></div>
      </div>
    </div>`;
}

function statementTable(s) {
  const prior = s.columnHeaders.length > 1;
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>${esc(s.title)} <span class="muted">· ${esc(s.periodLabel)}</span></th>${s.columnHeaders.map((c) => `<th class="num">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${s.sections.map((section) => `
        <tr><td colspan="${prior ? 3 : 2}"><strong class="muted small">${esc(section.heading.toUpperCase())}</strong></td></tr>
        ${section.lines.map((line) => `<tr class="${esc(line.style)}"><td>${esc(line.label)}</td><td class="num">${esc(money(line.current, s.currency))}</td>${prior ? `<td class="num muted">${esc(line.prior != null ? money(line.prior, s.currency) : '')}</td>` : ''}</tr>`).join('')}`).join('')}
      </tbody>
    </table></div>
    ${s.check ? `<p class="small ${s.check.difference === 0 ? 'muted' : 'error'}">${esc(s.check.label)}: ${s.check.difference === 0 ? 'balanced' : esc(money(s.check.difference, s.currency))}</p>` : ''}`;
}

function statementsSection(s) {
  if (!s) return notShared('Financial statements');
  if (s.error) return `<div class="card"><h2>Financial statements</h2><p class="muted">${esc(s.error)}</p></div>`;
  return `<div class="card stack"><h2>Financial statements</h2>${statementTable(s.income)}${statementTable(s.balance)}${statementTable(s.cashflow)}</div>`;
}

function documentsSection(docs, shareId) {
  if (!docs) return notShared('Business documents');
  const rows = Object.entries(DOC_LABELS).map(([kind, label]) => {
    const doc = docs.find((d) => d.kind === kind);
    return `<tr><td>${esc(label)}</td>
      <td>${doc ? `${esc(doc.fileName)} <span class="muted small">· ${date(doc.uploadedAt)}</span>` : '<span class="muted">Not uploaded</span>'}</td>
      <td class="num">${doc ? `<button class="soft" data-doc="${esc(kind)}">Open</button>` : ''}</td></tr>`;
  }).join('');
  setTimeout(() => document.querySelectorAll('button[data-doc]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const blob = await (await api(`/lender/applicants/${encodeURIComponent(shareId)}/documents/${b.dataset.doc}`)).blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      alert(error.message);
    } finally {
      b.disabled = false;
    }
  })));
  return `<div class="card stack"><h2>Business documents</h2><table><tbody>${rows}</tbody></table></div>`;
}

function decisionPanel(share) {
  return `
    <form class="card soft stack" id="decision">
      <h2>Your decision</h2>
      <p class="muted small" style="margin:0">Current: ${chip(share.decision, DECISIONS[share.decision])} ${share.decidedAt ? `· ${date(share.decidedAt)}` : ''}. The business sees this status and note in its app.</p>
      <div><label for="decision-status">Status</label>
        <select id="decision-status">
          ${['reviewing', 'approved', 'declined'].map((d) => `<option value="${d}" ${share.decision === d ? 'selected' : ''}>${DECISIONS[d]}</option>`).join('')}
        </select></div>
      <div><label for="decision-note">Note to the business (optional)</label>
        <textarea id="decision-note" rows="3" maxlength="1000" placeholder="e.g. Please visit a branch with your ID card.">${esc(share.decisionNote || '')}</textarea></div>
      <div class="spread"><span id="decision-msg" class="small muted"></span><button type="submit">Save decision</button></div>
    </form>`;
}

async function renderApplicant(shareId) {
  loading();
  let data;
  try {
    data = await (await api(`/lender/applicants/${encodeURIComponent(shareId)}`)).json();
  } catch (error) {
    app.innerHTML = `<div class="card stack"><p class="error">${esc(error.message)}</p><a href="#/">Back to applicants</a></div>`;
    return;
  }
  const b = data.business;
  const share = data.share;
  app.innerHTML = `
    <div class="stack">
      <a href="#/">← All applicants</a>
      <div class="card stack">
        <div class="spread">
          <div><h1>${esc(b.businessName || 'Unnamed business')}</h1>
            <p class="muted" style="margin:0">${esc([b.businessIndustry, b.location].filter(Boolean).join(' · '))}</p></div>
          ${data.readiness ? `<div>${chip(data.readiness.level, LEVELS[data.readiness.level])}</div>` : ''}
        </div>
        <div class="row">
          <div><div class="muted small">Owner</div>${esc(b.ownerName || '—')}</div>
          <div><div class="muted small">Contact</div>${esc([b.ownerPhone, b.ownerEmail].filter(Boolean).join(' · ') || '—')}</div>
          <div><div class="muted small">Registration</div>${esc(b.registrationStatus === 'registered' ? `Registered${b.registrationNumber ? ` · ${b.registrationNumber}` : ''}` : b.registrationStatus === 'unregistered' ? 'Not registered' : '—')}</div>
          <div><div class="muted small">Operating since</div>${esc(b.startOperationDate || '—')}</div>
        </div>
        <p class="muted small" style="margin:0">Shared with you: ${share.scopes.map((s) => esc(SCOPE_LABELS[s])).join(', ')} · access until ${date(share.expiresAt)}. Your views are logged and visible to the business.</p>
      </div>
      ${decisionPanel(share)}
      ${readinessSection(data.readiness)}
      ${healthSection(data.health)}
      ${trendSection(data.trend)}
      ${statementsSection(data.statements)}
      ${documentsSection(data.documents, share.id)}
      <p class="muted small">Figures come from the business's own records in Finext and have not been audited. Use them alongside your bank's own checks.</p>
    </div>`;

  document.getElementById('decision').addEventListener('submit', async (event) => {
    event.preventDefault();
    const msg = document.getElementById('decision-msg');
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      await api(`/lender/applicants/${encodeURIComponent(shareId)}/decision`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: document.getElementById('decision-status').value, note: document.getElementById('decision-note').value }),
      });
      msg.textContent = 'Saved.';
    } catch (error) {
      msg.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

// ------------------------------------------------------------------ routing
function route() {
  if (!lender) return;
  const match = location.hash.match(/^#\/applicant\/([0-9a-f-]{36})$/i);
  if (match) renderApplicant(match[1]);
  else renderList();
}

window.addEventListener('hashchange', route);
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') renderLogin();
});
start();
