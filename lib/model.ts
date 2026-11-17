// The token radar's model, radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other pre-token protocol the watchlist's own quality rule keeps, at any TVL: the early rows the
// radar exists to find. A protocol is pre-token when its record carries no token (no market cap, no
// CoinGecko id, no symbol); the snapshot's live-token protocols are kept apart and shown as the
// market's own values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures, and no protocol name is ever
// special-cased: the same function scores every row.
//
//   multiple   = the category's own market multiple: the median market-cap-to-TVL ratio of the
//                token-bearing protocols in the same category, where at least five such comparables
//                exist; otherwise the median of the category's family — a group of neighbouring
//                categories pooled the same way, where at least five pooled comparables exist;
//                otherwise the whole snapshot's median ratio. Clamped to [0.05, 1.0].
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   implied    = max(1, round(tvl_usd x multiple x growthMult x maturity))
//
// The multiple is what makes this model dynamic: it is computed from the snapshot at run time, so a
// future snapshot with different comparables re-ranks the board without a single name being touched.
// The dashboard states the multiple and its comparable count for every category and family it uses.
//
// The multiple is tested, not trusted: leave-one-out validation holds out one trading protocol at a
// time and predicts its market multiple from the others, by the same category-family-global rule the
// board uses; the dashboard reports how many were held out, the median absolute log error of the
// prediction, and the share predicted within 2x and 5x. A multiple the comparables cannot predict
// shows up there, in the open, rather than hiding inside the ranking.
//
// The ranking carries its own uncertainty: the model is refit 200 times, each time resampling the
// comparables with replacement (a seeded generator, so the build is deterministic), and every row
// gets an implied-value interval and a rank interval — the 10th and 90th percentiles of its 200
// refits. A row ranked 3rd with a rank interval of 2-7 is a strong row with an honest margin, not a
// false precision.
//
// The airdrop pool is a labelled assumption, never a promise: pool = implied x POOL_SHARE, the
// community's share of a launch at a typical 7.5% allocation. Farm cost is the capital the plan
// needs plus the gas the plan spends over its hold. The net is the pool minus that farm cost, and
// the verdict is per farmer: one farmer's expected take assumes the pool is split among
// ASSUMED_FARMERS farmers, so take = pool / ASSUMED_FARMERS; farm when the take clears the farm
// cost by at least THIN_NET_USD, thin when it clears it by less, skip when it does not clear it at
// all. The farmer count is a labelled assumption like the pool share, stated wherever the verdict
// appears; the whole-pool net and the per-farmer take are both shown, so the arithmetic can be
// checked either way.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_comps: number;
  multiple_floor: number;
  multiple_cap: number;
  pool_share: number;
  assumed_farmers: number;
  thin_net_usd: number;
  bootstrap_replicates: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_comps: 5,
  multiple_floor: 0.05,
  multiple_cap: 1.0,
  pool_share: 0.075,
  assumed_farmers: 1000,
  thin_net_usd: 100,
  bootstrap_replicates: 200,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 30;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  pool_usd: number;
  capital_usd: number;
  est_gas_usd: number;
  hold_days: number;
  implied_lo_usd: number;
  implied_hi_usd: number;
  rank_lo: number;
  rank_hi: number;
  net_usd: number;
  farmer_take_usd: number;
  farmer_net_usd: number;
  net_verdict: 'farm' | 'thin' | 'skip';
  model: {
    category_multiple: number;
    category_comps: number;
    family: string | null;
    family_multiple: number | null;
    family_comps: number;
    multiple_source: 'category' | 'family' | 'global';
    global_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  pool_usd: number;
  capital_usd: number;
  est_gas_usd: number;
  hold_days: number;
  implied_lo_usd: number;
  implied_hi_usd: number;
  rank_lo: number;
  rank_hi: number;
  net_usd: number;
  farmer_take_usd: number;
  farmer_net_usd: number;
  net_verdict: 'farm' | 'thin' | 'skip';
  category_multiple: number;
  category_comps: number;
  family: string | null;
  family_multiple: number | null;
  family_comps: number;
  multiple_source: 'category' | 'family' | 'global';
  growth_multiplier: number;
  maturity_multiplier: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's market multiple, as the dashboard's model panel shows it. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  comps: number;
  fallback: boolean;
}

/** One family's market multiple: the pooled median of its member categories' live ratios. */
export interface FamilyMultiple {
  family: string;
  multiple: number;
  comps: number;
}

/** Leave-one-out validation of the multiple estimator, computed from this snapshot at build time. */
export interface ValidationResult {
  /** Token-bearing protocols held out one at a time and predicted. */
  n: number;
  /** Median |ln(predicted multiple / actual multiple)| over the held-out protocols. */
  median_abs_log_error: number;
  /** Share of held-out protocols predicted within 2x (absolute log error under ln 2). */
  within_2x: number;
  /** Share of held-out protocols predicted within 5x (absolute log error under ln 5). */
  within_5x: number;
  /** How many held-out protocols each resolution source predicted. */
  by_source: { category: number; family: number; global: number };
}

/** One row's refit intervals: the 10th and 90th percentiles of its bootstrap refits. */
export interface RowUncertainty {
  implied_lo_usd: number;
  implied_hi_usd: number;
  rank_lo: number;
  rank_hi: number;
}

/** Everything the dashboard needs: the board, the live set, the multiples and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  multiples: CategoryMultiple[];
  families: FamilyMultiple[];
  validation: ValidationResult;
  bootstrap_replicates: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The families: neighbouring categories pooled when a category has too few live comparables of its
 * own. Each category sits in exactly one family; a family with no live comparables at all (Stable-like
 * here) simply has no multiple, and its rows fall through to the snapshot-wide one. The families are
 * named by what their members do — the multiples are computed from this snapshot at build time, never
 * written in: a future snapshot re-pools them without a single name being touched.
 */
export const FAMILIES: Record<string, string[]> = {
  'Lending-like': ['Lending', 'CDP', 'CDP Manager', 'Collateral Management', 'Collateral Markets', 'Uncollateralized Lending'],
  'Yield-like': ['Yield', 'Yield Aggregator', 'Risk Curators', 'Onchain Capital Allocator', 'Staking Pool', 'Farm'],
  'Bridge-like': ['Bridge', 'Canonical Bridge', 'Cross Chain Bridge'],
  'Staking-like': ['Liquid Staking', 'Restaking', 'Liquid Restaking', 'Restaked BTC'],
  'RWA-like': ['RWA', 'Basis Trading', 'Token Locker', 'Dual-Token Stablecoin'],
  'DEX-like': ['Dexs', 'Derivatives', 'Synthetics', 'Options', 'Options Vault', 'Interest Rate Derivatives', 'Leveraged Farming', 'Liquidity Manager'],
  'Stable-like': ['Algo-Stables', 'Stablecoin Issuer', 'Stablecoin Wrapper', 'Reserve Currency'],
  Other: ['Prediction Market', 'Privacy', 'Payments', 'Indexes', 'Launchpad', 'Chain', 'CeDeFi', 'AI Agents', 'Decentralized AI', 'NFT Marketplace', 'OTC Marketplace', 'Governance Incentives', 'DOR'],
};

/** A category's family, or null when no family claims it. */
export function familyOf(category: string | null): string | null {
  if (category === null) return null;
  for (const [family, members] of Object.entries(FAMILIES)) {
    if (members.includes(category)) return family;
  }
  return null;
}

/** Where one row's multiple came from: its own category, its family, or the snapshot-wide one. */
export interface MultipleResolution {
  multiple: number;
  comps: number;
  source: 'category' | 'family' | 'global';
  family: string | null;
  category: string;
}

export interface Multiples {
  byCategory: Map<string, CategoryMultiple>;
  byFamily: Map<string, FamilyMultiple>;
  global: number;
}

/**
 * The market multiples, computed from the snapshot's own token-bearing protocols: for each category
 * the median market-cap-to-TVL ratio of its protocols that already trade, where at least
 * `model.min_comps` such comparables exist; for each family the same median over its member
 * categories pooled, where at least `model.min_comps` pooled comparables exist; otherwise the
 * snapshot-wide median. All three are clamped to the model's multiple band. No name is ever
 * consulted here: only figures. A wild single comparable (one protocol trading at 400x its TVL)
 * cannot move a median, and a family below the floor never supplies one.
 */
export function marketMultiples(
  protocols: SnapshotProtocol[],
  model: ModelConstants,
): Multiples {
  const clamp = (m: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, m));
  const ratiosByCategory = new Map<string, number[]>();
  const allRatios: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    allRatios.push(ratio);
    const key = p.category ?? 'Other';
    const list = ratiosByCategory.get(key) ?? [];
    list.push(ratio);
    ratiosByCategory.set(key, list);
  }
  const global = allRatios.length > 0 ? clamp(median(allRatios)) : 0.2;
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [category, ratios] of ratiosByCategory) {
    if (ratios.length >= model.min_comps) {
      byCategory.set(category, { category, multiple: clamp(median(ratios)), comps: ratios.length, fallback: false });
    }
  }
  const byFamily = new Map<string, FamilyMultiple>();
  for (const [family, members] of Object.entries(FAMILIES)) {
    const pooled = members.flatMap((c) => ratiosByCategory.get(c) ?? []);
    if (pooled.length >= model.min_comps) {
      byFamily.set(family, { family, multiple: clamp(median(pooled)), comps: pooled.length });
    }
  }
  return { byCategory, byFamily, global };
}

/** A row's multiple: its category's own, where it has enough comparables, else its family's pooled one, else the snapshot-wide one. */
export function multipleFor(
  category: string | null,
  multiples: Multiples,
): MultipleResolution {
  const name = category ?? 'Other';
  const own = category === null ? undefined : multiples.byCategory.get(category);
  if (own !== undefined) return { multiple: own.multiple, comps: own.comps, source: 'category', family: null, category: name };
  const family = familyOf(category);
  const pooled = family === null ? undefined : multiples.byFamily.get(family);
  if (pooled !== undefined) return { multiple: pooled.multiple, comps: pooled.comps, source: 'family', family, category: name };
  return { multiple: multiples.global, comps: 0, source: 'global', family, category: name };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  multiples: Multiples,
): {
  implied: number;
  multiple: MultipleResolution;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const multiple = multipleFor(protocol.category, multiples);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple.multiple * growthMult * maturityMult));
  return { implied, multiple, growthPct, growthMult, maturityMult, age };
}

/** The raw market-cap-to-TVL ratio lists the multiples are medians of, by category, by family and snapshot-wide. */
function ratioLists(protocols: SnapshotProtocol[]): { byCategory: Map<string, number[]>; byFamily: Map<string, number[]>; global: number[] } {
  const byCategory = new Map<string, number[]>();
  const global: number[] = [];
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    global.push(ratio);
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(ratio);
    byCategory.set(key, list);
  }
  const byFamily = new Map<string, number[]>();
  for (const [family, members] of Object.entries(FAMILIES)) {
    const pooled = members.flatMap((c) => byCategory.get(c) ?? []);
    if (pooled.length > 0) byFamily.set(family, pooled);
  }
  return { byCategory, byFamily, global };
}

/** A copy of `list` with one occurrence of `value` removed (the first). */
function withoutOne(list: number[], value: number): number[] {
  const at = list.indexOf(value);
  if (at < 0) return [...list];
  const copy = [...list];
  copy.splice(at, 1);
  return copy;
}

/**
 * Leave-one-out validation of the multiple estimator: each token-bearing protocol is held out in
 * turn and its market multiple is predicted from the others, by the same category-family-global
 * rule the board uses (a category that drops below five comparables without it falls through to
 * its family, exactly as the board would). The error is the absolute log error of the predicted
 * multiple against the protocol's own market-cap-to-TVL ratio: a log error of 0.69 means a 2x miss.
 * Everything is computed from this snapshot at build time; nothing about the result is written in.
 */
export function validateModel(protocols: SnapshotProtocol[], model: ModelConstants): ValidationResult {
  const lists = ratioLists(protocols);
  const clamp = (m: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, m));
  const errors: number[] = [];
  const bySource = { category: 0, family: 0, global: 0 };
  for (const p of protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    const key = p.category ?? 'Other';
    const catList = withoutOne(lists.byCategory.get(key) ?? [], ratio);
    let predicted: number | null = null;
    let source: 'category' | 'family' | 'global';
    if (catList.length >= model.min_comps) {
      predicted = clamp(median(catList));
      source = 'category';
    } else {
      const fam = familyOf(p.category);
      const famList = fam === null ? [] : withoutOne(lists.byFamily.get(fam) ?? [], ratio);
      if (famList.length >= model.min_comps) {
        predicted = clamp(median(famList));
        source = 'family';
      } else {
        const globalList = withoutOne(lists.global, ratio);
        if (globalList.length === 0) continue;
        predicted = clamp(median(globalList));
        source = 'global';
      }
    }
    bySource[source]++;
    errors.push(Math.abs(Math.log(predicted / ratio)));
  }
  errors.sort((a, b) => a - b);
  const n = errors.length;
  const medianErr = n === 0 ? 0 : median(errors);
  const within = (bound: number): number => (n === 0 ? 0 : round4(errors.filter((e) => e < bound).length / n));
  return {
    n,
    median_abs_log_error: round4(medianErr),
    within_2x: within(Math.LN2),
    within_5x: within(Math.log(5)),
    by_source: bySource,
  };
}

/** A small deterministic generator (mulberry32): the refits are seeded, so the build is byte-identical run to run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One bootstrap resample of a list: the same length, drawn with replacement. */
function resample(list: number[], rand: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < list.length; i++) out.push(list[Math.floor(rand() * list.length)]!);
  return out;
}

/** The 10th and 90th percentiles of a sorted list, by nearest rank. */
function deciles(sorted: number[]): [number, number] {
  const lo = sorted[Math.floor(0.1 * (sorted.length - 1))]!;
  const hi = sorted[Math.floor(0.9 * (sorted.length - 1))]!;
  return [lo, hi];
}

/**
 * The board's refit intervals: the model is refit `replicates` times, each time resampling every
 * comparable list with replacement and recomputing the medians by the same rules, then every row is
 * re-scored and the board re-ranked. Each row's implied-value interval and rank interval are the
 * 10th and 90th percentiles of its refits. The point ranking never moves — only the intervals are
 * added — and the generator is seeded, so two builds agree byte for byte.
 */
export function bootstrapUncertainty(
  rows: { slug: string; category: string | null; tvl_usd: number; growthMult: number; maturityMult: number }[],
  protocols: SnapshotProtocol[],
  model: ModelConstants,
): Map<string, RowUncertainty> {
  const lists = ratioLists(protocols);
  const clamp = (m: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, m));
  const rand = mulberry32(0x9e3779b9);
  const replicates = model.bootstrap_replicates;
  const impliedRuns = new Map<string, number[]>();
  const rankRuns = new Map<string, number[]>();
  for (const r of rows) {
    impliedRuns.set(r.slug, []);
    rankRuns.set(r.slug, []);
  }
  const categories = [...lists.byCategory.keys()].sort();
  const families = [...lists.byFamily.keys()].sort();
  for (let b = 0; b < replicates; b++) {
    const bootCat = new Map<string, CategoryMultiple>();
    for (const c of categories) {
      const list = lists.byCategory.get(c)!;
      if (list.length >= model.min_comps) bootCat.set(c, { category: c, multiple: clamp(median(resample(list, rand))), comps: list.length, fallback: false });
    }
    const bootFam = new Map<string, FamilyMultiple>();
    for (const f of families) {
      const list = lists.byFamily.get(f)!;
      if (list.length >= model.min_comps) bootFam.set(f, { family: f, multiple: clamp(median(resample(list, rand))), comps: list.length });
    }
    const bootGlobal = lists.global.length > 0 ? clamp(median(resample(lists.global, rand))) : 0.2;
    const boot: Multiples = { byCategory: bootCat, byFamily: bootFam, global: bootGlobal };
    const scored = rows.map((r) => {
      const mult = multipleFor(r.category, boot).multiple;
      return { slug: r.slug, implied: Math.max(1, Math.round(r.tvl_usd * mult * r.growthMult * r.maturityMult)) };
    });
    for (const s of scored) impliedRuns.get(s.slug)!.push(s.implied);
    const ranked = [...scored].sort((a, z) => z.implied - a.implied || (a.slug < z.slug ? -1 : a.slug > z.slug ? 1 : 0));
    ranked.forEach((s, i) => rankRuns.get(s.slug)!.push(i + 1));
  }
  const out = new Map<string, RowUncertainty>();
  for (const r of rows) {
    const imp = [...impliedRuns.get(r.slug)!].sort((a, z) => a - z);
    const rk = [...rankRuns.get(r.slug)!].sort((a, z) => a - z);
    const [ilo, ihi] = deciles(imp);
    const [rlo, rhi] = deciles(rk);
    out.set(r.slug, { implied_lo_usd: ilo, implied_hi_usd: ihi, rank_lo: rlo, rank_hi: rhi });
  }
  return out;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** The watchlist's wrapped, staked and bridged exclusions, by category. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** The watchlist's exchange-name exclusion, by the name's first word. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
/** A whole wrapped, staked or staking word anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, and kept by the watchlist's own quality
 * rule (no exchange, no versioned pool, no wrapped, staked or bridged product of a token that
 * trades) — at any TVL. The watchlist's floor is a size line, not a quality line, so it is not
 * applied here: the early radar is exactly the protocols below it.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = marketMultiples(snapshot.protocols, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL. Never a replacement for a
  // watchlist row: a chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, multiple, growthPct, growthMult, maturityMult, age } = impliedValue(p, snapshot.as_of, model, multiples);
    const familyEntry = multiple.family !== null ? multiples.byFamily.get(multiple.family) : undefined;
    const capital = capitalFor(p);
    const hold = holdDaysFor(age);
    const weeks = Math.max(1, Math.ceil(hold / 7));
    return {
      p,
      implied,
      multiple,
      familyEntry,
      growthPct,
      growthMult,
      maturityMult,
      age,
      capital,
      hold,
      gas: 8 + 2 * weeks,
      pool: Math.max(1, Math.round(implied * model.pool_share)),
    };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const uncertainty = bootstrapUncertainty(
    scored.map((s) => ({ slug: s.p.slug, category: s.p.category, tvl_usd: s.p.tvl_usd, growthMult: s.growthMult, maturityMult: s.maturityMult })),
    snapshot.protocols,
    model,
  );
  return scored.map((s, i) => {
    const cost = s.capital + s.gas;
    const net = s.pool - cost;
    const take = Math.max(1, Math.round(s.pool / model.assumed_farmers));
    const farmerNet = take - cost;
    const verdict: 'farm' | 'thin' | 'skip' = farmerNet < 0 ? 'skip' : farmerNet < model.thin_net_usd ? 'thin' : 'farm';
    const u = uncertainty.get(s.p.slug)!;
    return {
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    pool_usd: s.pool,
    capital_usd: s.capital,
    est_gas_usd: s.gas,
    hold_days: s.hold,
    implied_lo_usd: u.implied_lo_usd,
    implied_hi_usd: u.implied_hi_usd,
    rank_lo: u.rank_lo,
    rank_hi: u.rank_hi,
    net_usd: net,
    farmer_take_usd: take,
    farmer_net_usd: farmerNet,
    net_verdict: verdict,
    model: {
      category_multiple: round4(s.multiple.multiple),
      category_comps: s.multiple.source === 'category' ? s.multiple.comps : 0,
      family: s.multiple.family,
      family_multiple: s.familyEntry !== undefined ? round4(s.familyEntry.multiple) : null,
      family_comps: s.familyEntry !== undefined ? s.familyEntry.comps : 0,
      multiple_source: s.multiple.source,
      global_multiple: multiples.global,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.capital, s.hold).map(stepText),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open, then borrow a small amount against it.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deposit $${capital} into ${name}'s highest-TVL vault on ${chain} and keep the shares.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} curated vault on ${chain} and keep the shares.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}, on an outcome you have researched.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('basis')) return `Deposit $${capital} into ${name}'s basis vault on ${chain} and keep the shares.`;
  if (c.includes('index')) return `Buy $${capital} of ${name}'s index on ${chain} and hold it.`;
  if (c.includes('privacy')) return `Deposit $${capital} into ${name}'s shielded pool on ${chain} and keep the receipt.`;
  if (c.includes('payment')) return `Route $${capital} of real payment volume through ${name} on ${chain} over the hold.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('btc')) return `Mint $${capital} of the BTC-pegged asset through ${name} on ${chain} and hold it.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} into a ${name} managed liquidity position on ${chain} and keep it in range.`;
  if (c.includes('farm')) return `Deposit $${capital} into the ${name} farm on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action: what counts as activity, week after week. */
function weeklyFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow at least $25 against the supply on ${name}, then repay it the same week so the loan counts as activity.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Swap at least $25 through ${name}'s main pool on ${chain}, on a different day each week.`;
  if (c.includes('yield aggregator') || c.includes('yield') || c.includes('curator') || c.includes('allocator')) return `Top up the ${name} vault by at least $25 or move the position to the vault with the highest yield that week.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge at least $25 through ${name} to a different chain than last week, and use the funds once they arrive.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Open and close one small hedged position on ${name} each week, keeping the margin above the liquidation price.`;
  if (c.includes('prediction')) return `Place one small position on a new ${name} market each week, on an outcome you have researched.`;
  if (c.includes('rwa') || c.includes('basis') || c.includes('index')) return `Add at least $25 to the ${name} position on ${chain} each week and leave it staked.`;
  if (c.includes('privacy')) return `Make one shielded deposit or withdrawal through ${name} each week, from the same farming wallet.`;
  if (c.includes('payment')) return `Send at least one real payment through ${name} on ${chain} each week, to a different counterparty.`;
  if (c.includes('btc')) return `Move at least $25 of the BTC-pegged position through ${name} each week — mint, redeem or bridge a small amount — so the position shows use.`;
  if (c.includes('staking') || c.includes('restak')) return `Restake the week's rewards on ${name}, or add at least $25 of the staking asset, so the staked balance grows every week.`;
  if (c.includes('stable')) return `Hold the stable balance through ${name} and swap at least $25 through its pool on ${chain} each week, so the position shows use.`;
  if (c.includes('insurance')) return `Check the ${name} policy each week and keep the cover funded; if the cover lapses, buy it again before the week's snapshot.`;
  if (c.includes('liquidity manager')) return `Rebalance the ${name} position on ${chain} each week, moving the range to where the fees are, and compound at least $25 of the fees earned.`;
  if (c.includes('farm')) return `Harvest the farm's rewards on ${name} each week and redeposit at least $25 of them, so the farmed balance compounds.`;
  return `Make one qualifying action on ${name} each week, such as a deposit, a swap, a vote or a claim.`;
}

/** The wallet to farm with: a Solana or Bitcoin wallet where the chain has its own, else a fresh wallet on that chain. */
function walletStep(chain: string): string {
  if (chain === 'Solana') return 'Use a fresh Solana wallet that holds only the funds you plan to farm, and keep its seed phrase offline.';
  if (chain === 'Bitcoin') return 'Use a fresh Bitcoin wallet that holds only the funds you plan to farm, and keep its seed phrase offline.';
  return `Use a fresh wallet on ${chain} that holds only the funds you plan to farm, and keep its seed phrase offline.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, capital: number, hold: number): FarmStep[] {
  const chain = chainOf(p);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyFor(p, capital, chain);
  return [
    {
      text: walletStep(chain),
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weekly,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Each week, open ${p.name}'s own points or rewards page and check the balance; claim only from a link the protocol itself publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes a week',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, set a reminder for the ${hold}-day mark, and plan how to unwind the position.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: Set<string>): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    pool_usd: row.pool_usd,
    capital_usd: row.capital_usd,
    est_gas_usd: row.est_gas_usd,
    hold_days: row.hold_days,
    implied_lo_usd: row.implied_lo_usd,
    implied_hi_usd: row.implied_hi_usd,
    rank_lo: row.rank_lo,
    rank_hi: row.rank_hi,
    net_usd: row.net_usd,
    farmer_take_usd: row.farmer_take_usd,
    farmer_net_usd: row.farmer_net_usd,
    net_verdict: row.net_verdict,
    category_multiple: row.model.category_multiple,
    category_comps: row.model.category_comps,
    family: row.model.family,
    family_multiple: row.model.family_multiple,
    family_comps: row.model.family_comps,
    multiple_source: row.model.multiple_source,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    watchlist: watchlist.has(row.slug),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const multiples = marketMultiples(snapshot.protocols, model);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const multiplesList: CategoryMultiple[] = [...multiples.byCategory.values()]
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  const familiesList: FamilyMultiple[] = [...multiples.byFamily.values()]
    .sort((a, b) => b.multiple - a.multiple || (a.family < b.family ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    global_multiple: multiples.global,
    multiples: multiplesList,
    families: familiesList,
    validation: validateModel(snapshot.protocols, model),
    bootstrap_replicates: model.bootstrap_replicates,
    rows: board.map((r) => radarRow(r, watchlist)),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
