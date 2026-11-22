import {
  ColourType,
  DemoOrder,
  MarketConfig,
  MarketId,
  RoundResult,
  SelectionType,
  SizeType,
} from '../types/trading';

export const MARKETS: MarketConfig[] = [
  { id: '30s', label: '30s Fast', shortLabel: '30s', durationSec: 30, lockSec: 5 },
  { id: '1m', label: '1m Classic', shortLabel: '1m', durationSec: 60, lockSec: 5 },
  { id: '3m', label: '3m Standard', shortLabel: '3m', durationSec: 180, lockSec: 5 },
  { id: '5m', label: '5m Macro', shortLabel: '5m', durationSec: 300, lockSec: 5 },
];

export const INITIAL_DEMO_BALANCE = 10000;
export const MAX_BET_LIMIT = 25000;
export const FEE_RATE = 0.30;
export const RESET_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function getColoursForNumber(num: number): ColourType[] {
  if (num === 0) return ['red', 'violet'];
  if (num === 5) return ['green', 'violet'];
  return num % 2 === 1 ? ['green'] : ['red'];
}

export function getSizeForNumber(num: number): SizeType {
  return num >= 5 ? 'big' : 'small';
}

export function formatSelectionLabel(selection: SelectionType | null | undefined): string {
  if (!selection || typeof selection !== 'object') return 'Unknown';
  if (selection.kind === 'colour') {
    const val = typeof selection.value === 'string' ? selection.value : '';
    return val ? val.charAt(0).toUpperCase() + val.slice(1) : 'Colour';
  }
  if (selection.kind === 'size') {
    return selection.value === 'big' ? 'Big (5–9)' : 'Small (0–4)';
  }
  return `Number ${selection.value ?? 0}`;
}

export function getMaxMultiplierForSelection(selection: SelectionType): number {
  if (selection.kind === 'number') return 9;
  if (selection.kind === 'colour' && selection.value === 'violet') return 4.5;
  return 2;
}

export function calculateOrderPayout(
  selection: SelectionType,
  contractAmount: number,
  winningNumber: number
): number {
  const winningColours = getColoursForNumber(winningNumber);
  const winningSize = getSizeForNumber(winningNumber);

  if (selection.kind === 'number') {
    return selection.value === winningNumber ? roundCurrency(contractAmount * 9) : 0;
  }

  if (selection.kind === 'size') {
    return selection.value === winningSize ? roundCurrency(contractAmount * 2) : 0;
  }

  // Colour selection
  if (selection.value === 'violet') {
    return winningColours.includes('violet') ? roundCurrency(contractAmount * 4.5) : 0;
  }

  if (selection.value === 'green') {
    if (winningNumber === 5) return roundCurrency(contractAmount * 1.5);
    if (winningColours.includes('green')) return roundCurrency(contractAmount * 2);
    return 0;
  }

  if (selection.value === 'red') {
    if (winningNumber === 0) return roundCurrency(contractAmount * 1.5);
    if (winningColours.includes('red')) return roundCurrency(contractAmount * 2);
    return 0;
  }

  return 0;
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  const trimDecimals = (num: number, maxDecimals = 2): string =>
    num.toFixed(maxDecimals).replace(/\.?0+$/, '');

  if (abs >= 10_000_000) {
    return `${sign}${trimDecimals(abs / 10_000_000, 2)}Cr`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${trimDecimals(abs / 1_000_000, 2)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${trimDecimals(abs / 1_000, 2)}K`;
  }
  return `${sign}${trimDecimals(abs, 2)}`;
}

export function formatRemainingCooldown(remainingMs: number, compact = false): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (compact) {
    return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
  }
  return `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
}

export function formatPeriodId(marketId: MarketId, sequenceNumber: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const marketCode =
    marketId === '30s' ? '1' : marketId === '1m' ? '2' : marketId === '3m' ? '3' : '4';
  const seq = String(sequenceNumber).padStart(4, '0');
  return `${y}${m}${d}${marketCode}${seq}`;
}

export function getInitialSequenceForMarket(marketId: MarketId): number {
  const now = new Date();
  const secondsSinceMidnight =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const market = MARKETS.find((m) => m.id === marketId)!;
  return Math.max(50, Math.floor(secondsSinceMidnight / market.durationSec) + 1);
}

export function generateSeedHistory(marketId: MarketId, count = 48): RoundResult[] {
  const currentSeq = getInitialSequenceForMarket(marketId);
  const market = MARKETS.find((m) => m.id === marketId)!;
  const results: RoundResult[] = [];
  const nowMs = Date.now();

  // Deterministic pseudo-random seed per market + sequence so initial chart feels realistic
  for (let i = 1; i <= count; i++) {
    const seq = currentSeq - i;
    const seed =
      (seq * 9301 + marketId.charCodeAt(0) * 49297 + marketId.charCodeAt(1) * 233) % 233280;
    const num = Math.abs(seed) % 10;
    const settledTime = new Date(nowMs - i * market.durationSec * 1000);

    results.push({
      periodId: formatPeriodId(marketId, seq),
      marketId,
      number: num,
      colours: getColoursForNumber(num),
      size: getSizeForNumber(num),
      settledAt: settledTime.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    });
  }

  return results;
}

export function getWinStreakCutRate(winStreak: number): number {
  if (winStreak > 5) return 0.5;
  if (winStreak >= 2) return 0.09;
  return 0;
}

export function settleRoundOrders(
  orders: DemoOrder[],
  periodId: string,
  marketId: MarketId,
  winningNumber: number,
  getStreakCutRate?: (rawTotalPayout: number) => number
): {
  updatedOrders: DemoOrder[];
  totalPayout: number;
  totalStaked: number;
  settledCount: number;
  streakCutRate: number;
} {
  let rawTotalPayout = 0;
  let totalStaked = 0;
  let settledCount = 0;

  // First pass: calculate raw payouts for pending orders in this period
  const pendingIds = new Set<string>();
  const rawPayoutById = new Map<string, number>();

  orders.forEach((order) => {
    if (order.periodId === periodId && order.marketId === marketId && order.status === 'pending') {
      const rawPayout = calculateOrderPayout(
        order.selection,
        order.contractAmount,
        winningNumber
      );
      pendingIds.add(order.id);
      rawPayoutById.set(order.id, rawPayout);
      rawTotalPayout = roundCurrency(rawTotalPayout + rawPayout);
      totalStaked = roundCurrency(totalStaked + order.totalAmount);
      settledCount += 1;
    }
  });

  const streakCutRate =
    settledCount > 0 && rawTotalPayout > 0 && getStreakCutRate
      ? getStreakCutRate(rawTotalPayout)
      : 0;
  const scale = 1 - streakCutRate;

  let totalPayout = 0;
  const updatedOrders = orders.map((order) => {
    if (pendingIds.has(order.id)) {
      const rawPayout = rawPayoutById.get(order.id) || 0;
      const payout = roundCurrency(rawPayout * scale);
      const netProfit = roundCurrency(payout - order.totalAmount);
      totalPayout = roundCurrency(totalPayout + payout);

      return {
        ...order,
        status: payout > 0 ? ('won' as const) : ('lost' as const),
        payout,
        netProfit,
        settledNumber: winningNumber,
      };
    }
    return order;
  });

  return { updatedOrders, totalPayout, totalStaked, settledCount, streakCutRate };
}
