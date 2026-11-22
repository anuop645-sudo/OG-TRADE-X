import React, { useState } from 'react';
import {
  Clock,
  FastForward,
  HelpCircle,
  Lock,
  Shuffle,
  X,
} from 'lucide-react';
import {
  ColourType,
  DemoOrder,
  MarketConfig,
  MarketId,
  RoundResult,
  SelectionType,
  SettlementBanner,
  SizeType,
} from '../types/trading';
import { playClickSound } from '../utils/soundFx';
import {
  FEE_RATE,
  MARKETS,
  MAX_BET_LIMIT,
  formatCurrency,
  formatSelectionLabel,
  getMaxMultiplierForSelection,
  roundCurrency,
} from '../utils/tradingEngine';
import { ColourDots, LotteryBall } from './ColourVisuals';

interface TradingDeskProps {
  activeMarket: MarketConfig;
  onSelectMarket: (marketId: MarketId) => void;
  currentPeriodId: string;
  secondsLeft: number;
  isLocked: boolean;
  demoBalance: number;
  soundEnabled: boolean;
  onFastForwardSettle: () => void;
  recentResults: RoundResult[];
  lastBanner: SettlementBanner | null;
  currentRoundOrders: DemoOrder[];
  onPlaceOrder: (
    selection: SelectionType,
    stake: number,
    multiplier: number
  ) => Promise<{ ok: boolean; error?: string }>;
  onCancelOrder: (orderId: string) => void;
  onHowToPlay: () => void;
  maxBetLimit?: number;
}

const BASE_AMOUNTS = [1, 10, 100, 500, 1000];
const MULTIPLIERS = [1, 5, 10, 20, 50, 100];
const NUMBERS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export const TradingDesk: React.FC<TradingDeskProps> = ({
  activeMarket,
  onSelectMarket,
  currentPeriodId,
  secondsLeft,
  isLocked,
  demoBalance,
  soundEnabled,
  onFastForwardSettle,
  recentResults,
  lastBanner,
  currentRoundOrders,
  onPlaceOrder,
  onCancelOrder,
  onHowToPlay,
  maxBetLimit = MAX_BET_LIMIT,
}) => {
  const [selection, setSelection] = useState<SelectionType>({ kind: 'colour', value: 'green' });
  const [stakeInput, setStakeInput] = useState<string>('100');
  const [multiplier, setMultiplier] = useState<number>(1);
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);
  const [orderFeedback, setOrderFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const parsedStake = Math.max(0, Number(stakeInput) || 0);
  const totalAmount = roundCurrency(parsedStake * multiplier);
  const fee = roundCurrency(totalAmount * FEE_RATE);
  const contractAmount = roundCurrency(totalAmount - fee);
  const maxOdds = getMaxMultiplierForSelection(selection);
  const potentialPayout = roundCurrency(contractAmount * maxOdds);

  const safeResults = Array.isArray(recentResults) ? recentResults : [];
  const safeRoundOrders = Array.isArray(currentRoundOrders) ? currentRoundOrders : [];
  const safeSecondsLeft = Number.isFinite(secondsLeft) ? Math.max(0, Math.floor(secondsLeft)) : 0;
  const mins = String(Math.floor(safeSecondsLeft / 60)).padStart(2, '0');
  const secs = String(safeSecondsLeft % 60).padStart(2, '0');
  const timerChars = [mins[0] ?? '0', mins[1] ?? '0', ':', secs[0] ?? '0', secs[1] ?? '0'];

  const lastFive = safeResults.slice(0, 5);

  const isSelected = (candidate: SelectionType): boolean => {
    if (candidate.kind !== selection.kind) return false;
    return candidate.value === selection.value;
  };

  const handleRandomPick = () => {
    const randomNum = Math.floor(Math.random() * 10);
    playClickSound(soundEnabled);
    setSelection({ kind: 'number', value: randomNum });
    setOrderFeedback(null);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingOrder) return;
    setSubmittingOrder(true);
    try {
      const res = await onPlaceOrder(selection, parsedStake, multiplier);
      if (res.ok) {
        setOrderFeedback({
          type: 'success',
          message: `Order placed: ${formatSelectionLabel(selection)} (${formatCurrency(totalAmount)} DC)`,
        });
      } else {
        setOrderFeedback({
          type: 'error',
          message: res.error || 'Unable to place order',
        });
      }
    } finally {
      setSubmittingOrder(false);
    }
  };

  const selectColour = (value: ColourType) => {
    playClickSound(soundEnabled);
    setSelection({ kind: 'colour', value });
    setOrderFeedback(null);
  };

  const selectNumber = (value: number) => {
    playClickSound(soundEnabled);
    setSelection({ kind: 'number', value });
    setOrderFeedback(null);
  };

  const selectSize = (value: SizeType) => {
    playClickSound(soundEnabled);
    setSelection({ kind: 'size', value });
    setOrderFeedback(null);
  };

  const currentRoundTotal = safeRoundOrders.reduce(
    (sum, o) => sum + (Number.isFinite(o?.totalAmount) ? o.totalAmount : 0),
    0
  );
  const hasBetCap = Number.isFinite(maxBetLimit);
  const exceedsMaxBet = hasBetCap && roundCurrency(currentRoundTotal + totalAmount) > maxBetLimit;

  const canPlaceOrder =
    !submittingOrder && !isLocked && totalAmount >= 1 && !exceedsMaxBet && totalAmount <= demoBalance;

  return (
    <section id="desk" className="space-y-3">
      {/* Market Interval Selector */}
      <div className="rounded-xl border border-slate-200 bg-white p-2">
        <div
          role="tablist"
          aria-label="Trading Intervals"
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
        >
          {MARKETS.map((m) => {
            const active = m.id === activeMarket.id;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  playClickSound(soundEnabled);
                  onSelectMarket(m.id);
                }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  active
                    ? 'bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Settlement Notification Banner */}
      {lastBanner && lastBanner.marketId === activeMarket.id && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-2.5"
        >
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="font-semibold text-blue-800">Round Result</span>
            <span className="font-mono font-semibold text-slate-700 tabular-nums">
              {lastBanner.periodId}
            </span>
            <LotteryBall num={lastBanner.result.number} size="xs" />
            <ColourDots colours={lastBanner.result.colours} />
            <span className="font-bold capitalize text-slate-800">
              {lastBanner.result.size}
            </span>
          </div>

          {lastBanner.userOrdersCount > 0 ? (
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs font-bold tabular-nums">
              {(lastBanner.streakCutRate ?? 0) > 0 && (
                <span className="text-[11px] font-semibold text-amber-700">
                  Win Streak x{lastBanner.winStreak} · {Math.round((lastBanner.streakCutRate ?? 0) * 100)}% Cut
                </span>
              )}
              <span
                className={
                  lastBanner.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                }
              >
                {lastBanner.netProfit >= 0 ? 'Won +' : 'Lost '}
                {formatCurrency(lastBanner.netProfit)} DC
              </span>
            </div>
          ) : (
            <span className="text-xs text-slate-600">No orders in settled period</span>
          )}
        </div>
      )}

      {/* Main 2-Column Trading Terminal */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-stretch">
        {/* Left: Blue Ticket Header + Selection Board */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white overflow-hidden lg:col-span-7">
          {/* Blue Period Ticket Banner */}
          <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 p-3.5 text-white sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Left side: How to play + 5 recent balls */}
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onHowToPlay}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/15 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/25 whitespace-nowrap"
                  >
                    <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>How to play</span>
                  </button>
                  <span className="text-xs font-semibold text-blue-100">
                    {activeMarket.label}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {lastFive.map((item) => (
                    <LotteryBall key={item.periodId} num={item.number} size="xs" />
                  ))}
                </div>
              </div>

              {/* Right side: Time remaining digit boxes + Period ID */}
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-blue-50">
                    Time remaining
                  </span>
                  <button
                    type="button"
                    onClick={onFastForwardSettle}
                    title="Settle round right now"
                    className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-white/30 transition-colors"
                  >
                    <FastForward className="h-3 w-3" aria-hidden="true" />
                    <span>Settle Now</span>
                  </button>
                </div>

                {/* Split 4-digit white flip boxes */}
                <div className="flex items-center gap-1 font-mono" aria-label={`Time remaining ${mins}:${secs}`}>
                  {timerChars.map((ch, idx) =>
                    ch === ':' ? (
                      <span
                        key={idx}
                        className="px-0.5 text-lg font-extrabold text-white"
                      >
                        :
                      </span>
                    ) : (
                      <span
                        key={idx}
                        className={`inline-flex h-9 w-7 items-center justify-center rounded-md bg-white text-lg font-extrabold shadow-xs tabular-nums ${
                          isLocked ? 'text-rose-600' : 'text-slate-900'
                        }`}
                      >
                        {ch}
                      </span>
                    )
                  )}
                </div>

                <div className="font-mono text-sm font-bold tracking-wide text-white tabular-nums">
                  {currentPeriodId}
                </div>
              </div>
            </div>
          </div>

          {/* Selection Pad with 5s Lock Overlay */}
          <div className="relative space-y-3.5 p-3.5 sm:p-4">
            {isLocked && (
              <div
                aria-live="polite"
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-900/55 backdrop-blur-[2px]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-20 w-16 items-center justify-center rounded-xl bg-white font-mono text-5xl font-extrabold text-blue-600 shadow-lg tabular-nums">
                    {secs[0] ?? '0'}
                  </span>
                  <span className="flex h-20 w-16 items-center justify-center rounded-xl bg-white font-mono text-5xl font-extrabold text-blue-600 shadow-lg tabular-nums">
                    {secs[1] ?? '0'}
                  </span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-md bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white">
                  <Lock className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                  <span>Orders Locked · Settling Round</span>
                </div>
              </div>
            )}

            {/* 1. Green / Violet / Red Solid Buttons */}
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => selectColour('green')}
                className={`rounded-lg py-2.5 text-sm font-bold text-white shadow-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                  isSelected({ kind: 'colour', value: 'green' })
                    ? 'bg-emerald-600 ring-2 ring-slate-900 ring-offset-2 ring-offset-white'
                    : 'bg-emerald-500 hover:bg-emerald-600'
                }`}
              >
                Green
              </button>

              <button
                type="button"
                onClick={() => selectColour('violet')}
                className={`rounded-lg py-2.5 text-sm font-bold text-white shadow-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 ${
                  isSelected({ kind: 'colour', value: 'violet' })
                    ? 'bg-violet-700 ring-2 ring-slate-900 ring-offset-2 ring-offset-white'
                    : 'bg-violet-600 hover:bg-violet-700'
                }`}
              >
                Violet
              </button>

              <button
                type="button"
                onClick={() => selectColour('red')}
                className={`rounded-lg py-2.5 text-sm font-bold text-white shadow-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 ${
                  isSelected({ kind: 'colour', value: 'red' })
                    ? 'bg-rose-600 ring-2 ring-slate-900 ring-offset-2 ring-offset-white'
                    : 'bg-rose-500 hover:bg-rose-600'
                }`}
              >
                Red
              </button>
            </div>

            {/* 2. Circular Ringed Ball Grid (0–9) */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-2.5">
              <div className="grid grid-cols-5 place-items-center gap-y-2 gap-x-2">
                {NUMBERS.map((num) => {
                  const active = isSelected({ kind: 'number', value: num });
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => selectNumber(num)}
                      aria-label={`Select number ${num}`}
                      className="rounded-full p-1 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <LotteryBall num={num} size="md" active={active} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Random + Multiplier Row */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleRandomPick}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-50 whitespace-nowrap shrink-0"
              >
                <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Random</span>
              </button>

              <div className="flex flex-wrap items-center gap-1.5">
                {MULTIPLIERS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      playClickSound(soundEnabled);
                      setMultiplier(m);
                      setOrderFeedback(null);
                    }}
                    className={`rounded-md px-2.5 py-1.5 font-mono text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                      multiplier === m
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    x{m}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Big (Orange) / Small (Blue) Dual Split Bar */}
            <div className="grid grid-cols-2 overflow-hidden rounded-full shadow-xs">
              <button
                type="button"
                onClick={() => selectSize('big')}
                className={`py-3 text-center text-sm font-bold text-white transition-all focus-visible:outline-none ${
                  isSelected({ kind: 'size', value: 'big' })
                    ? 'bg-amber-600 ring-2 ring-inset ring-slate-900'
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                Big
              </button>
              <button
                type="button"
                onClick={() => selectSize('small')}
                className={`py-3 text-center text-sm font-bold text-white transition-all focus-visible:outline-none ${
                  isSelected({ kind: 'size', value: 'small' })
                    ? 'bg-blue-700 ring-2 ring-inset ring-slate-900'
                    : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                Small
              </button>
            </div>
          </div>
        </div>

        {/* Right: Order Confirmation Ticket & Active Round Orders */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 lg:col-span-5">
          <form onSubmit={handleSubmitOrder} className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-xs font-medium text-slate-500">Your Selection</div>
                <div className="font-display text-lg font-extrabold text-slate-900">
                  {formatSelectionLabel(selection)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium text-slate-500">Payout Odds</div>
                <div className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
                  {maxOdds}x
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <label htmlFor="stake-amount" className="block text-xs font-semibold text-slate-700">
                Base Balance Unit (DC)
              </label>

              <input
                id="stake-amount"
                type="number"
                min={1}
                step={1}
                value={stakeInput}
                onChange={(e) => {
                  setStakeInput(e.target.value);
                  setOrderFeedback(null);
                }}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 font-mono text-base font-bold text-slate-900 tabular-nums focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600"
              />

              <div className="grid grid-cols-5 gap-1.5">
                {BASE_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      playClickSound(soundEnabled);
                      setStakeInput(String(amt));
                      setOrderFeedback(null);
                    }}
                    className={`rounded-md border py-1.5 font-mono text-xs font-bold transition-colors ${
                      parsedStake === amt
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {amt}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-200 pt-4 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Selected Multiplier</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  x{multiplier}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Total Amount</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">
                  {formatCurrency(totalAmount)} DC
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500">
                <span>Bet Deduction (30%)</span>
                <span className="font-mono tabular-nums">{formatCurrency(fee)} DC</span>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
                <span className="font-bold text-slate-900">Potential Win</span>
                <span className="font-mono font-extrabold text-emerald-700 tabular-nums">
                  {formatCurrency(potentialPayout)} DC
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="submit"
                disabled={!canPlaceOrder}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {submittingOrder
                  ? 'Confirming Order...'
                  : isLocked
                    ? 'Round Locked · Settling'
                    : exceedsMaxBet
                      ? `Max Bet Limit ${formatCurrency(maxBetLimit)} DC`
                      : totalAmount > demoBalance
                        ? `Insufficient Balance (${hasBetCap ? '24h' : '1h'} Claim)`
                        : totalAmount < 1
                          ? 'Enter Amount >= 1 DC'
                          : `Total Amount ${formatCurrency(totalAmount)} DC · Confirm`}
              </button>

              {orderFeedback && (
                <p
                  role="status"
                  className={`text-xs font-semibold ${
                    orderFeedback.type === 'success' ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {orderFeedback.message}
                </p>
              )}
            </div>
          </form>

          {/* Active Orders for this Period */}
          <div className="mt-4 border-t border-slate-200 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700">
                Active Orders ({safeRoundOrders.length})
              </h3>
              <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                {currentPeriodId}
              </span>
            </div>

            {safeRoundOrders.length === 0 ? (
              <p className="py-2 text-xs text-slate-500">
                Pick Green, Violet, Red, a ball (0–9), or Big/Small to place a demo trade.
              </p>
            ) : (
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {safeRoundOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between border-b border-slate-100 py-2 text-xs last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">
                        {formatSelectionLabel(order.selection)}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="font-mono text-slate-700 tabular-nums">
                        {formatCurrency(order.totalAmount)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-amber-600">
                        Pending
                      </span>
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => onCancelOrder(order.id)}
                          title="Cancel order"
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
