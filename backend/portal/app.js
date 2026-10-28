// Finext Lender Portal: partner bank staff review SMEs that consented to share their data.
// Every value from the API is escaped with esc() before it is put into HTML.

const app = document.getElementById('app');
const account = document.getElementById('account');
const partner = document.getElementById('partner');
const nav = document.getElementById('nav');

// An invite or password-reset email opens the portal with what it is for in the address (#...&type=invite), or
// with why the link failed (#error_description=...). Read it before Supabase signs in from it and tidies the address.
const linkParams = new URLSearchParams(location.hash.slice(1));
const linkType = linkParams.get('type');
const linkError = linkParams.get('error_description');
let settingPassword = linkType === 'invite' || linkType === 'recovery';

const config = await fetch('config.json').then((r) => r.json());
if (!config.supabasePublishableKey) {
  app.innerHTML = '<div class="card login"><h2>Portal not configured</h2><p class="muted">Set SUPABASE_PUBLISHABLE_KEY in backend/.env and restart the API.</p></div>';
  throw new Error('missing SUPABASE_PUBLISHABLE_KEY');
}
const supabase = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'finext-lender-portal' },
});

let lender = null;

// Partner banks' own branding, used with their permission: their logo and colour join FINEXT's once their staff
// sign in, and the sign-in page lists them as supporters. Keyed by the bank's name in the lenders table.
const PARTNER_BRANDS = {
  'KB PRASAC Bank': { short: 'KB PRASAC', logo: 'assets/lenders/kb-prasac.png', color: '#FFCC00', ink: '#221F1F' },
};
const brandOf = (name) => PARTNER_BRANDS[name] || null;

// Signed out: the sign-in pages fill the window. Signed in: the sidebar workspace.
function setSignedIn(signedIn) {
  document.body.classList.toggle('signed-out', !signedIn);
  if (!signedIn) { account.innerHTML = ''; partner.innerHTML = ''; nav.innerHTML = ''; }
}

function applyPartnerTheme(brand) {
  document.body.classList.toggle('partnered', Boolean(brand));
  // Without a partner brand: FINEXT's light blue, with navy text on it.
  document.body.style.setProperty('--partner', brand ? brand.color : 'var(--primary-200)');
  document.body.style.setProperty('--partner-ink', brand ? brand.ink : 'var(--navy-900)');
}

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
// Same labels as the app's industry picker (profile.industry options).
const INDUSTRY_LABELS = {
  convenience: 'Mini Mart / Convenience Store', restaurant: 'Restaurant or Café', retail: 'Retail',
  wholesale: 'Wholesale', services: 'Services', manufacturing: 'Manufacturing', other: 'Other',
};
const industry = (code) => INDUSTRY_LABELS[code] || code;
const DOC_LABELS = { patent_tax: 'Patent Tax certificate', certificate_of_incorporation: 'Certificate of Incorporation' };

const chip = (cls, text) => `<span class="chip ${esc(cls)}">${esc(text)}</span>`;

// Line icons (24 × 24, stroke = currentColor), in the style of the app's icon set.
const ICON_PATHS = {
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  file: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  gauge: '<path d="M12 14l4-4"/><path d="M3.3 17a9 9 0 1117.4 0"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  next: '<path d="M9 18l6-6-6-6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6z"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/><path d="M17 4a4 4 0 010 8M22 21c0-3-1.8-5.6-4.5-6.6"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
const sectionTitle = (name, title) => `<h2><span class="icon">${icon(name)}</span>${esc(title)}</h2>`;
// Initials for an avatar: "Bakery 123" -> "B1", "KB PRASAC Bank" -> "KP".
const initials = (name) => (String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('') || '?').toUpperCase();

// Sign-in pages: the FINEXT side on the left, the form on the right.
function authLayout(form) {
  return `
    <div class="auth">
      <aside class="auth-brand">
        <div class="logo-pair">
          <img src="assets/logo.png" alt="Finext" />
          ${Object.values(PARTNER_BRANDS).map((b) => `<span class="times" aria-hidden="true">×</span><img src="${esc(b.logo)}" alt="${esc(b.short)}" />`).join('')}
        </div>
        <span class="eyebrow">Lender Portal</span>
        <h2>Review MSME loan applicants with the evidence their books provide.</h2>
        <ul class="auth-points">
          <li><span class="icon">${icon('shield')}</span><div>Only what each business consents to share<small>Access ends when they stop sharing or the period runs out.</small></div></li>
          <li><span class="icon">${icon('gauge')}</span><div>Loan readiness, statements and health ratios<small>Built from the business's own bookkeeping.</small></div></li>
          <li><span class="icon">${icon('eye')}</span><div>Every view is logged<small>The business sees when its report was opened.</small></div></li>
        </ul>
      </aside>
      <section class="auth-form">${form}</section>
    </div>`;
}

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
  setSignedIn(false);
  // The sign-in pages carry the supporting bank's colour next to FINEXT's.
  applyPartnerTheme(Object.values(PARTNER_BRANDS)[0] ?? null);
  app.innerHTML = authLayout(`
    <form id="login">
      <div><h1>Sign in</h1><p class="muted" style="margin:4px 0 0">For staff of Finext partner banks and MFIs.</p></div>
      <div><label for="email">Work email</label><input id="email" type="email" autocomplete="username" placeholder="name@bank.com" required /></div>
      <div>
        <div class="spread" style="margin-bottom:6px"><label for="password" style="margin:0">Password</label><button type="button" class="link small" id="forgot">Forgot password?</button></div>
        <input id="password" type="password" autocomplete="current-password" required />
      </div>
      <p class="error" id="login-error">${esc(message)}</p>
      <button type="submit">Sign in</button>
      <p class="auth-note">No account? Portal access is by invitation only. Ask FINEXT to invite your work email.</p>
    </form>`);
  document.getElementById('forgot').addEventListener('click', () => renderForgot(document.getElementById('email').value.trim()));
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

// Staff reset their own password: Supabase emails a link back to this page, which then asks for a new password.
function renderForgot(email = '') {
  setSignedIn(false);
  app.innerHTML = authLayout(`
    <form id="forgot-form">
      <div><h1>Reset your password</h1><p class="muted" style="margin:4px 0 0">Enter your work email. If it has portal access, we will email you a link to choose a new password.</p></div>
      <div><label for="forgot-email">Work email</label><input id="forgot-email" type="email" autocomplete="username" required value="${esc(email)}" /></div>
      <p class="error" id="forgot-error"></p>
      <button type="submit">Send reset link</button>
      <button type="button" class="link center" id="back">Back to sign in</button>
    </form>`);
  document.getElementById('back').addEventListener('click', () => renderLogin());
  document.getElementById('forgot-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button[type=submit]');
    button.disabled = true;
    const { error } = await supabase.auth.resetPasswordForEmail(document.getElementById('forgot-email').value.trim(), {
      redirectTo: `${location.origin}${location.pathname}`,
    });
    button.disabled = false;
    if (error) {
      document.getElementById('forgot-error').textContent = error.message;
      return;
    }
    // The same answer whether or not the email has an account, so the page cannot be used to find staff emails.
    app.innerHTML = authLayout(`
      <div class="check-mail">${icon('mail')}</div>
      <h1>Check your email</h1>
      <p class="muted" style="margin:0">If this email has portal access, a link to reset the password is on its way. The link works once.</p>
      <button type="button" class="link" id="back" style="align-self:flex-start">Back to sign in</button>`);
    document.getElementById('back').addEventListener('click', () => renderLogin());
  });
}

// After opening an invite or reset link: choose a password, then straight into the portal.
function renderSetPassword(email) {
  setSignedIn(false);
  const invited = linkType === 'invite';
  app.innerHTML = authLayout(`
    <form id="set-password">
      <div><h1>${invited ? 'Welcome to the FINEXT Lender Portal' : 'Choose a new password'}</h1>
        <p class="muted">${invited ? 'Choose a password for' : 'New password for'} <strong>${esc(email)}</strong>.</p></div>
      <div><label for="new-password">Password (at least 8 characters)</label><input id="new-password" type="password" autocomplete="new-password" minlength="8" required /></div>
      <div><label for="confirm-password">Type it again</label><input id="confirm-password" type="password" autocomplete="new-password" minlength="8" required /></div>
      <p class="error" id="set-error"></p>
      <button type="submit">${invited ? 'Set password and continue' : 'Save password and continue'}</button>
    </form>`);
  document.getElementById('set-password').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.getElementById('new-password').value;
    const message = document.getElementById('set-error');
    if (password.length < 8) { message.textContent = 'Use at least 8 characters.'; return; }
    if (password !== document.getElementById('confirm-password').value) { message.textContent = 'The two passwords are different.'; return; }
    const button = event.target.querySelector('button');
    button.disabled = true;
    const { error } = await supabase.auth.updateUser({ password });
    button.disabled = false;
    if (error) { message.textContent = error.message; return; }
    settingPassword = false;
    history.replaceState(null, '', location.pathname);
    start();
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
  if (!data.session) {
    return renderLogin(linkError ? `This link did not work (${linkError}). Ask FINEXT for a new invite, or use "Forgot password?".` : '');
  }
  if (settingPassword) return renderSetPassword(data.session.user.email);
  try {
    lender = (await (await api('/lender/me')).json()).lender;
  } catch (error) {
    await supabase.auth.signOut();
    return renderLogin(error.status === 403 ? 'This account is not linked to a partner bank. Ask Finext to add you.' : error.message);
  }
  const brand = brandOf(lender.name);
  applyPartnerTheme(brand);
  setSignedIn(true);
  partner.innerHTML = `
    <div class="partner-card">
      ${brand ? `<img src="${esc(brand.logo)}" alt="" />` : `<span class="avatar" aria-hidden="true">${esc(initials(lender.name))}</span>`}
      <div><small>Partner bank</small><strong>${esc(lender.name)}</strong></div>
    </div>`;
  const email = data.session.user.email;
  account.innerHTML = `
    <span class="avatar soft" aria-hidden="true">${esc(initials(email.split('@')[0].replace(/[._-]+/g, ' ')))}</span>
    <span class="who-text"><strong>Signed in</strong><span class="who-email" title="${esc(email)}">${esc(email)}</span></span>
    <button class="icon-button" id="signout" aria-label="Sign out" title="Sign out">${icon('logout')}</button>`;
  document.getElementById('signout').addEventListener('click', signOut);
  renderNav();
  route();
}

// ------------------------------------------------------------------ applicant list
// Sidebar menu: all applicants, then one entry per decision with its count (filled in once the list has loaded).
let counts = null;
function renderNav(active = location.hash) {
  const items = [
    { href: '#/', label: 'All applicants', icon: 'users', count: counts?.all },
    { href: '#/filter/new', label: 'New', icon: 'spark', count: counts?.new },
    { href: '#/filter/reviewing', label: 'Reviewing', icon: 'clock', count: counts?.reviewing },
    { href: '#/filter/approved', label: 'Approved', icon: 'check', count: counts?.approved },
    { href: '#/filter/declined', label: 'Declined', icon: 'x', count: counts?.declined },
  ];
  const current = active.startsWith('#/filter/') ? active : '#/';
  nav.innerHTML = `<span class="nav-label">Applications</span>${items.map((item) => `
    <a href="${item.href}" class="${item.href === current ? 'active' : ''}" ${item.href === current ? 'aria-current="page"' : ''}>
      ${icon(item.icon)}<span>${esc(item.label)}</span>${item.count != null ? `<b>${item.count}</b>` : ''}
    </a>`).join('')}`;
}

const today = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

async function renderList(initialDecision = '') {
  loading();
  let applicants;
  try {
    applicants = (await (await api('/lender/applicants')).json()).applicants;
  } catch (error) {
    app.innerHTML = `<div class="card"><p class="error">${esc(error.message)}</p></div>`;
    return;
  }
  const count = (decision) => applicants.filter((a) => a.decision === decision).length;
  counts = { all: applicants.length, new: count('new'), reviewing: count('reviewing'), approved: count('approved'), declined: count('declined') };
  renderNav();
  const stats = [
    { label: 'All applicants', value: applicants.length, icon: 'users', tone: 'blue' },
    { label: 'New', value: count('new'), icon: 'spark', tone: 'partner' },
    { label: 'Reviewing', value: count('reviewing'), icon: 'clock', tone: 'amber' },
    { label: 'Approved', value: count('approved'), icon: 'check', tone: 'green' },
  ];
  const brand = brandOf(lender.name);
  app.innerHTML = `
    <div class="stack">
      <div class="page-head hero">
        <div><span class="eyebrow">${esc(today())}</span><h1>${initialDecision ? esc(DECISIONS[initialDecision] || 'Applicants') : 'Applicants'}</h1>
          <p class="muted" style="margin:0">Businesses that chose to share their Finext data with ${esc(lender.name)}.</p></div>
        ${brand ? `<span class="cobrand"><img src="assets/feather.png" alt="" />Finext <i>×</i> <img src="${esc(brand.logo)}" alt="" />${esc(brand.short)}</span>` : ''}
      </div>
      <div class="stats">${stats.map((s) => `<div class="stat ${s.tone}"><span class="stat-icon">${icon(s.icon)}</span><div><div class="label">${esc(s.label)}</div><div class="value">${s.value}</div></div></div>`).join('')}</div>
      <div class="toolbar">
        <div class="search">${icon('search')}<input id="search" type="search" placeholder="Search business" aria-label="Search business" /></div>
        <select id="filter" aria-label="Filter by decision">
          <option value="">All decisions</option>
          ${Object.entries(DECISIONS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
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
      ? `<div class="empty"><div class="avatar soft">${icon('inbox')}</div>
          <h3>${applicants.length ? 'No applicants match' : 'No applicants yet'}</h3>
          <p class="muted" style="margin:4px 0 0">${applicants.length ? 'Try another search or decision.' : 'When a business shares its Finext data with your bank, it appears here.'}</p></div>`
      : `<table>
          <thead><tr><th>Business</th><th>Readiness</th><th>Decision</th><th class="hide-sm">Shared</th><th class="hide-sm">Access until</th><th aria-hidden="true"></th></tr></thead>
          <tbody>${rows.map((a) => `
            <tr class="clickable" data-id="${esc(a.id)}" tabindex="0">
              <td><div class="biz"><span class="avatar soft" aria-hidden="true">${esc(initials(a.businessName))}</span>
                <div class="meta"><strong>${esc(a.businessName || 'Unnamed business')}</strong><span>${esc([industry(a.industry), a.location].filter(Boolean).join(' · ') || '—')}</span></div></div></td>
              <td>${a.readinessScore != null && a.readinessLevel !== 'insufficient_data'
                ? `<div class="mini"><strong>${esc(a.readinessScore)}</strong><div class="bar hide-sm"><div style="width:${Number(a.readinessScore) || 0}%"></div></div>${chip(a.readinessLevel, LEVELS[a.readinessLevel] || '')}</div>`
                : a.readinessLevel ? chip(a.readinessLevel, LEVELS[a.readinessLevel]) : '<span class="muted">Not shared</span>'}</td>
              <td>${chip(a.decision, DECISIONS[a.decision])}</td>
              <td class="hide-sm">${date(a.createdAt)}</td>
              <td class="hide-sm">${date(a.expiresAt)}</td>
              <td class="num" aria-hidden="true">${icon('next').replace('<svg ', '<svg width="18" height="18" ')}</td>
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
  document.getElementById('filter').value = initialDecision;
  draw();
}

// ------------------------------------------------------------------ applicant detail
const SECTION_ICONS = { 'Loan readiness': 'gauge', 'Financial health ratios': 'pulse', 'Monthly income & expenses': 'chart', 'Financial statements': 'table', 'Business documents': 'file' };
const titled = (title) => sectionTitle(SECTION_ICONS[title] || 'file', title);
const notShared = (title) => `<div class="card stack">${titled(title)}<p class="muted" style="margin:0">${icon('lock').replace('<svg ', '<svg width="14" height="14" style="vertical-align:-2px;margin-right:6px" ')}Not shared by the business.</p></div>`;

function readinessSection(r) {
  if (!r) return notShared('Loan readiness');
  const thin = r.level === 'insufficient_data';  // the app shows no number either
  const pct = thin ? 0 : r.score ?? 0;
  const ring = r.level === 'ready' ? 'var(--success)' : r.level === 'almost' ? 'var(--warning)' : r.level === 'not_ready' ? 'var(--danger)' : 'var(--neutral-300)';
  const byPillar = (id) => r.checks.filter((c) => c.pillar === id);
  return `
    <div class="card stack">
      <div class="spread">${titled('Loan readiness')}<span class="muted small">Data coverage ${Math.round(r.coverage * 100)}%</span></div>
      <div class="score">
        <div class="score-ring" style="--pct:${pct};--ring:${ring}"><div>${thin ? '—' : r.score ?? '—'}</div></div>
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
  if (h.error) return `<div class="card stack">${titled('Financial health ratios')}<p class="muted">${esc(h.error)}</p></div>`;
  return `
    <div class="card stack">
      <div class="spread">${titled('Financial health ratios')}<span class="muted small">${esc(h.period)}</span></div>
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
      <div class="spread">${titled('Monthly income & expenses')}<span class="muted small">${t.activeMonths} of the last ${t.history.length} months have entries</span></div>
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
  // Formal heading (business, statement name, period); older responses only have a title.
  const heading = s.heading ? `<div class="statement-heading">${s.heading.map((line) => `<div>${esc(line)}</div>`).join('')}</div>` : '';
  return `
    ${heading}
    <div class="table-wrap"><table>
      <thead><tr><th>${s.heading ? '' : `${esc(s.title)} <span class="muted">· ${esc(s.periodLabel)}</span>`}</th>${s.columnHeaders.map((c) => `<th class="num">${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${s.sections.map((section) => `
        <tr><td colspan="${prior ? 3 : 2}"><strong class="muted small">${esc(section.heading.toUpperCase())}</strong></td></tr>
        ${section.lines.map((line) => `<tr class="${esc(line.style)}"><td>${esc(line.label)}</td><td class="num">${esc(money(line.current, s.currency))}</td>${prior ? `<td class="num muted">${esc(line.prior != null ? money(line.prior, s.currency) : '')}</td>` : ''}</tr>`).join('')}`).join('')}
      </tbody>
    </table></div>
    ${s.check ? `<p class="small ${s.check.difference === 0 ? 'muted' : 'error'}">${esc(s.check.label)}: ${s.check.difference === 0 ? 'balanced' : esc(money(s.check.difference, s.currency))}</p>` : ''}`;
}

function statementsSection(s) {
  if (!s) return notShared('Financial statements');
  if (s.error) return `<div class="card stack">${titled('Financial statements')}<p class="muted">${esc(s.error)}</p></div>`;
  return `<div class="card stack">${titled('Financial statements')}${statementTable(s.income)}${statementTable(s.balance)}${statementTable(s.cashflow)}</div>`;
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
  return `<div class="card stack">${titled('Business documents')}<table><tbody>${rows}</tbody></table></div>`;
}

function decisionPanel(share) {
  return `
    <form class="card soft stack decision" id="decision">
      ${sectionTitle('check', 'Your decision')}
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
    app.innerHTML = `<div class="card stack"><p class="error">${esc(error.message)}</p><a class="back" href="#/">${icon('back').replace('<svg ', '<svg width="16" height="16" ')}Back to applicants</a></div>`;
    return;
  }
  const b = data.business;
  const share = data.share;
  app.innerHTML = `
    <div class="stack">
      <a class="back" href="#/">${icon('back').replace('<svg ', '<svg width="16" height="16" ')}All applicants</a>
      <div class="card profile">
        <div class="profile-top">
          <span class="avatar" aria-hidden="true">${esc(initials(b.businessName))}</span>
          <div class="grow"><h1>${esc(b.businessName || 'Unnamed business')}</h1>
            <p class="muted" style="margin:0">${esc([industry(b.businessIndustry), b.location].filter(Boolean).join(' · '))}</p></div>
          <div class="row" style="flex:0 0 auto;gap:8px">${data.readiness ? chip(data.readiness.level, LEVELS[data.readiness.level]) : ''}${chip(share.decision, DECISIONS[share.decision])}</div>
        </div>
        <div class="facts">
          <div><div class="label">Owner</div>${esc(b.ownerName || '—')}</div>
          <div><div class="label">Contact</div>${esc([b.ownerPhone, b.ownerEmail].filter(Boolean).join(' · ') || '—')}</div>
          <div><div class="label">Registration</div>${esc(b.registrationStatus === 'registered' ? `Registered${b.registrationNumber ? ` · ${b.registrationNumber}` : ''}` : b.registrationStatus === 'unregistered' ? 'Not registered' : '—')}</div>
          <div><div class="label">Operating since</div>${esc(b.startOperationDate || '—')}</div>
        </div>
        <div class="consent">${icon('shield')}<span>Shared with you: ${share.scopes.map((s) => esc(SCOPE_LABELS[s])).join(', ')} · access until ${date(share.expiresAt)}. Your views are logged and visible to the business.</span></div>
      </div>
      <!-- Read, then decide: the evidence on the left, the decision beside it (it stays in view while scrolling). -->
      <div class="review">
        <div class="stack">
          ${readinessSection(data.readiness)}
          ${healthSection(data.health)}
          ${trendSection(data.trend)}
          ${statementsSection(data.statements)}
          ${documentsSection(data.documents, share.id)}
          <p class="muted small">Figures come from the business's own records in Finext and have not been audited. Use them alongside your bank's own checks.</p>
        </div>
        <aside class="review-side">${decisionPanel(share)}</aside>
      </div>
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
  const filter = location.hash.match(/^#\/filter\/(new|reviewing|approved|declined)$/);
  renderNav();
  if (match) renderApplicant(match[1]);
  else renderList(filter ? filter[1] : '');
}

window.addEventListener('hashchange', route);
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') renderLogin();
  if (event === 'PASSWORD_RECOVERY') settingPassword = true;
});
start();
