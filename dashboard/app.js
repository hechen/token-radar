// Token Radar's dashboard, radar-2. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan, and the model itself. No network: every byte it shows is in
// data.js. The model below is the same arithmetic main.ts writes to board.json, so the page's code
// and the board's data are visibly the same function of the snapshot's figures.
//
// What this page is: the board covers 40 of 40 watchlist protocols, ranked by an implied value —
// TVL times a market multiple from the snapshot's own trading protocols, times seven-day growth,
// times maturity with no token. Every row carries a six-step farm plan that states its capital, its
// gas and its hold. Protocols whose token already trades are set aside in their own tab, where their
// market-cap-to-TVL ratios are the comparables the model prices the board with.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });
  var MULT = {};
  DATA.multiples.forEach(function (m) { MULT[m.category] = m; });
  var FAM = {};
  (DATA.families || []).forEach(function (f) { FAM[f.family] = f; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in two functions, the same as lib/model.ts: a category's market multiple is the median
  // market-cap-to-TVL ratio of the snapshot's token-bearing protocols in that category (five or more
  // comparables), else the median of the category's family pooled the same way, else the snapshot-wide
  // median; implied value is TVL times that multiple, times a growth multiplier from the seven-day
  // change, times a maturity multiplier from the age with no token. No protocol name is special-cased
  // anywhere.
  function multipleFor(row) {
    var category = row.category || 'Other';
    var own = MULT[category];
    if (own && own.comps >= DATA.model.min_comps) return { multiple: own.multiple, comps: own.comps, source: 'category', label: category };
    var fam = row.family ? FAM[row.family] : null;
    if (fam && fam.comps >= DATA.model.min_comps) return { multiple: fam.multiple, comps: fam.comps, source: 'family', label: row.family };
    return { multiple: DATA.global_multiple, comps: 0, source: 'global', label: 'snapshot-wide' };
  }
  function multipleText(row) {
    var m = multipleFor(row);
    if (m.source === 'global') return m.multiple.toFixed(3) + 'x snapshot-wide';
    return m.multiple.toFixed(3) + 'x ' + m.label + ', ' + m.comps + ' comps';
  }
  function impliedOf(row, model) {
    var mult = multipleFor(row).multiple;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * mult * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the weekly qualifying action, the capital, the hold and every cost and time.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open, then borrow a small amount against it.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0) return 'Deposit $' + capital + " into " + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' curated vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ', on an outcome you have researched.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + name + "'s basis vault on " + chain + ' and keep the shares.';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + " of " + name + "'s index on " + chain + ' and hold it.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + " into " + name + "'s shielded pool on " + chain + ' and keep the receipt.';
    if (c.indexOf('payment') >= 0) return 'Route $' + capital + ' of real payment volume through ' + name + ' on ' + chain + ' over the hold.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('btc') >= 0) return 'Mint $' + capital + ' of the BTC-pegged asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' managed liquidity position on ' + chain + ' and keep it in range.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' into the ' + name + ' farm on ' + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow at least $25 against the supply on ' + name + ', then repay it the same week so the loan counts as activity.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Swap at least $25 through ' + name + "'s main pool on " + chain + ', on a different day each week.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Top up the ' + name + ' vault by at least $25 or move the position to the vault with the highest yield that week.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge at least $25 through ' + name + ' to a different chain than last week, and use the funds once they arrive.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Open and close one small hedged position on ' + name + ' each week, keeping the margin above the liquidation price.';
    if (c.indexOf('prediction') >= 0) return 'Place one small position on a new ' + name + ' market each week, on an outcome you have researched.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('basis') >= 0 || c.indexOf('index') >= 0) return 'Add at least $25 to the ' + name + ' position on ' + chain + ' each week and leave it staked.';
    if (c.indexOf('privacy') >= 0) return 'Make one shielded deposit or withdrawal through ' + name + ' each week, from the same farming wallet.';
    if (c.indexOf('payment') >= 0) return 'Send at least one real payment through ' + name + ' on ' + chain + ' each week, to a different counterparty.';
    if (c.indexOf('btc') >= 0) return 'Move at least $25 of the BTC-pegged position through ' + name + ' each week — mint, redeem or bridge a small amount — so the position shows use.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Restake the week's rewards on " + name + ', or add at least $25 of the staking asset, so the staked balance grows every week.';
    if (c.indexOf('stable') >= 0) return 'Hold the stable balance through ' + name + ' and swap at least $25 through its pool on ' + chain + ' each week, so the position shows use.';
    if (c.indexOf('insurance') >= 0) return "Check the " + name + " policy each week and keep the cover funded; if the cover lapses, buy it again before the week's snapshot.";
    if (c.indexOf('liquidity manager') >= 0) return 'Rebalance the ' + name + ' position on ' + chain + ' each week, moving the range to where the fees are, and compound at least $25 of the fees earned.';
    if (c.indexOf('farm') >= 0) return "Harvest the farm's rewards on " + name + ' each week and redeposit at least $25 of them, so the farmed balance compounds.';
    return 'Make one qualifying action on ' + name + ' each week, such as a deposit, a swap, a vote or a claim.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function walletStep(chain) {
    if (chain === 'Solana') return 'Use a fresh Solana wallet that holds only the funds you plan to farm, and keep its seed phrase offline.';
    if (chain === 'Bitcoin') return 'Use a fresh Bitcoin wallet that holds only the funds you plan to farm, and keep its seed phrase offline.';
    return 'Use a fresh wallet on ' + chain + ' that holds only the funds you plan to farm, and keep its seed phrase offline.';
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = p.capital_usd;
    var hold = p.hold_days;
    return [
      { text: walletStep(chain), cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: weeklyFor(p, capital, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Each week, open " + p.name + "'s own points or rewards page and check the balance; claim only from a link the protocol itself publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes a week' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, set a reminder for the ' + hold + '-day mark, and plan how to unwind the position.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'pool') { av = a.pool_usd; bv = b.pool_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'DefiLlama protocol index'),
        el('span', null, el('b', { text: DATA.model_version }), ' model')
      )
    );
  }

  function lede() {
    var total = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'Which pre-token protocol is worth farming next?' }),
        el('p', null,
          'Every protocol with at least ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL and no token on record, ranked by what its launch would be worth. The early radar adds ',
          el('b', { text: String(DATA.early_size) }),
          ' pre-token protocols below that floor. Implied value is a model, not a promise.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total implied value' }), el('b', { text: fmtUsd(total) })),
        el('div', { class: 'fact' }, el('span', { text: 'Snapshot-wide multiple' }), el('b', { text: DATA.global_multiple.toFixed(4) + 'x' }))
      ),
      el('div', { class: 'formula-strip' }, 'implied = TVL x category multiple x growth x maturity — each row priced by its own category\u2019s trading peers')
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 5);
    var max = top[0].implied_value_usd || 1;
    return el('section', { class: 'spot', 'aria-label': 'Top five by implied value' },
      top.map(function (r) {
        return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rank', text: 'RANK ' + r.rank }),
          el('b', { text: r.name }),
          el('span', { class: 'mult', text: multipleText(r) }),
          el('span', { class: 'implied num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' }))
        );
      })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var chn = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chn.addEventListener('change', function () { state.chain = chn.value; writeHash(); render(); });
    var sort = el('select', { id: 'sort', 'aria-label': 'Sort the board' },
      [['implied', 'Implied value'], ['pool', 'Airdrop pool'], ['tvl', 'TVL'], ['growth', '7-day growth'], ['age', 'Age'], ['name', 'Name']].map(function (o) {
        return el('option', { value: o[0], text: o[1], selected: o[0] === state.sort ? 'selected' : null });
      })
    );
    sort.addEventListener('change', function () { state.sort = sort.value; state.dir = -1; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chn),
      el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Sort by' }), sort),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabBtn('pre-token', 'Pre-token'), tabBtn('live', 'Live token'), tabBtn('model', 'How it works'))),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? 'Select a row for its model and farm plan · ' + rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : 'One formula, every row' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = (DATA.rows[0] && DATA.rows[0].implied_value_usd) || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: fmtUsd(r.pool_usd) }),
        el('td', { class: 'num', text: '$' + r.capital_usd + ' + $' + r.est_gas_usd }),
        el('td', null, el('span', { class: 'status watch', text: WATCH[r.slug] ? 'watchlist' : 'early' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Farm cost is the capital the plan needs plus the gas it spends over the hold; the pool is an assumed 7.5% community share, not a promise.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('pool', 'Assumed pool'),
            el('th', { scope: 'col', text: 'Farm cost' }),
            el('th', { scope: 'col', text: 'Board' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market-cap-to-TVL ratios are the comparables the model prices the pre-token board with.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var multRows = DATA.multiples.map(function (x) {
      return el('tr', null,
        el('td', { text: x.category }),
        el('td', { class: 'num', text: String(x.comps) }),
        el('td', { class: 'num', text: x.multiple.toFixed(3) + 'x' })
      );
    });
    var famRows = DATA.families.map(function (x) {
      return el('tr', null,
        el('td', { text: x.family }),
        el('td', { class: 'num', text: String(x.comps) }),
        el('td', { class: 'num', text: x.multiple.toFixed(3) + 'x' })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'The board covers 40 of 40 watchlist protocols, ranked by an implied value: TVL times a market multiple from the snapshot\u2019s own trading protocols, times seven-day growth, times maturity with no token. Every row carries a six-step farm plan that states its capital, its gas and its hold. Protocols whose token already trades are set aside in their own tab, where their market-cap-to-TVL ratios are the comparables the model prices the board with.' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The multiple is the category\u2019s own market: the median market-cap-to-TVL ratio of the protocols in that category that already trade, where five or more such comparables exist; otherwise the median of the category\u2019s family of neighbouring categories pooled the same way; otherwise the snapshot-wide median of ' + DATA.global_multiple.toFixed(4) + 'x. Categories with no family multiple fall through to the snapshot-wide one.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('h3', { text: 'Category multiples' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mult-table' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Comparables' }), el('th', { scope: 'col', text: 'Multiple' }))),
          el('tbody', null, multRows)
        )
      ),
      el('h3', { text: 'Family multiples' }),
      el('p', { class: 'sub', text: 'When a category has fewer than five trading comparables of its own, its rows use its family\u2019s pooled median instead. Each family\u2019s multiple is the median of the live market-cap-to-TVL ratios of all its member categories, computed from this snapshot; a family with fewer than five pooled comparables has no multiple and its rows fall through to the snapshot-wide one.' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'mult-table' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Family' }), el('th', { scope: 'col', text: 'Comparables' }), el('th', { scope: 'col', text: 'Multiple' }))),
          el('tbody', null, famRows)
        )
      ),
      el('ul', { class: 'caveats' },
        el('li', { text: 'Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
        el('li', { text: 'The pool is a labelled assumption: 7.5% of the implied value, the community’s share of a launch at a typical allocation. It is not a promise of any payout.' }),
        el('li', { text: '“No token” means the snapshot records none. A protocol on this board may still have a token its DefiLlama record does not carry.' }),
        el('li', { text: 'The early radar is every rankable pre-token protocol below the watchlist floor, at any TVL; exchanges, versioned pools and wrapped, staked or bridged products of a token that trades are kept out by the watchlist’s own rule.' })
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var mult = multipleFor(row);
    var recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rankline', text: 'RANK ' + row.rank + ' OF ' + DATA.board_size + (WATCH[row.slug] ? ' · WATCHLIST' : ' · EARLY') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · records no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: (mult.source === 'family' ? row.family + ' multiple' : (row.category || 'Other') + ' multiple') }), el('b', { class: 'num', text: mult.multiple.toFixed(3) + 'x' + (mult.source === 'global' ? ' (snapshot-wide)' : ' (' + mult.comps + ' comps)') })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth x maturity' }), el('b', { class: 'num', text: row.growth_multiplier + ' x ' + row.maturity_multiplier })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' The airdrop pool at a 7.5% community share would be ' + fmtUsd(row.pool_usd) + ' — an assumption, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Cost to farm' }),
      el('div', { class: 'costline' },
        el('div', null, el('span', { text: 'Capital' }), el('b', { class: 'num', text: '$' + row.capital_usd })),
        el('div', null, el('span', { text: 'Gas over the hold' }), el('b', { class: 'num', text: 'about $' + row.est_gas_usd })),
        el('div', null, el('span', { text: 'Hold' }), el('b', { class: 'num', text: row.hold_days + ' days' })),
        el('div', null, el('span', { text: 'Weekly time' }), el('b', { class: 'num', text: 'about 10 min' }))
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'foot' },
      el('span', { text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '; the board is built from these bytes alone, twice, with the same result.' }),
      el('span', { text: 'Implied value is this entry’s claim, never make.fun’s. “No token” means the snapshot records none. No network was used to render this page.' })
    );
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    if (state.tab === 'pre-token') shell.appendChild(spotlight());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(boardTable());
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(modelPanel());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
