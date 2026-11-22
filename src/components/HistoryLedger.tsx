import React, { useMemo, useState } from 'react';
import { DemoOrder, MarketConfig, RoundResult } from '../types/trading';
import { formatCurrency, formatSelectionLabel } from '../utils/tradingEngine';
import { ColourDots, LotteryBall } from './ColourVisuals';

interface HistoryLedgerProps {
  activeMarket: MarketConfig;
  results: RoundResult[];
  orders: DemoOrder[];
  onJumpToDesk: () => void;
}

type LedgerTab = 'game' | 'chart' | 'my';

export const HistoryLedger: React.FC<HistoryLedgerProps> = ({
  activeMarket,
  results,
  orders,
  onJumpToDesk,
}) => {
  const [tab, setTab] = useState<LedgerTab>('game');
  const safeResults = useMemo(() => (Array.isArray(results) ? results : []), [results]);
  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);

  const tableResults = useMemo(() => safeResults.slice(0, 15), [safeResults]);
  const chartResults = useMemo(() => safeResults.slice(0, 12), [safeResults]);

  const chartStats = useMemo(() => {
    const sample = safeResults.slice(0, 50);
    const freq = Array(10).fill(0);
    const missing = Array(10).fill(sample.length);

    sample.forEach((r, idx) => {
      if (!r || typeof r.number !== 'number' || r.number < 0 || r.number > 9) return;
      freq[r.number] += 1;
      if (missing[r.number] === sample.length) {
        missing[r.number] = idx;
      }
    });

    return { freq, missing };
  }, [safeResults]);

  // Calculate SVG trend line coordinates for the Chart tab (0-9 columns)
  const svgPoints = useMemo(() => {
    return chartResults
      .map((row, rowIdx) => {
        const x = row.number * 32 + 16;
        const y = rowIdx * 40 + 20;
        return `${x},${y}`;
      })
      .join(' ');
  }, [chartResults]);

  return (
    <section id="history" className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Exact 3-Tab Header: Game History | Chart | My History */}
      <div
        role="tablist"
        aria-label="History Tabs"
        className="grid grid-cols-3 gap-2 border-b border-slate-200 bg-slate-50 p-2.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'game'}
          onClick={() => setTab('game')}
          className={`rounded-lg py-2.5 text-xs font-bold transition-colors sm:text-sm ${
            tab === 'game'
              ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          Game History
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === 'chart'}
          onClick={() => setTab('chart')}
          className={`rounded-lg py-2.5 text-xs font-bold transition-colors sm:text-sm ${
            tab === 'chart'
              ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          Chart
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={tab === 'my'}
          onClick={() => setTab('my')}
          className={`rounded-lg py-2.5 text-xs font-bold transition-colors sm:text-sm ${
            tab === 'my'
              ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          My History ({safeOrders.length})
        </button>
      </div>

      {/* Tab 1: Game History (Blue Header Table like screenshot) */}
      {tab === 'game' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th className="px-4 py-3 font-bold">Period</th>
                <th className="px-4 py-3 text-center font-bold">Number</th>
                <th className="px-4 py-3 text-center font-bold">Big / Small</th>
                <th className="px-4 py-3 text-right font-bold">Colour</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableResults.map((row) => {
                const numColor =
                  row.number === 0 || row.number % 2 === 0
                    ? 'text-rose-600'
                    : 'text-emerald-600';

                return (
                  <tr key={row.periodId} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-700 tabular-nums sm:text-sm">
                      {row.periodId}
                    </td>
                    <td className={`px-4 py-2.5 text-center font-mono text-lg font-extrabold tabular-nums ${numColor}`}>
                      {row.number}
                    </td>
                    <td className="px-4 py-2.5 text-center font-semibold capitalize text-slate-700">
                      {row.size}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <ColourDots colours={row.colours} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Digit Trend Chart */}
      {tab === 'chart' && (
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              {activeMarket.label} · Statistic (last 50 periods)
            </span>
            <span>Connected trend across digits 0–9</span>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[540px]">
              {/* Summary Stats */}
              <div className="grid grid-cols-[140px_320px] items-center border-b border-slate-200 py-2 text-xs">
                <span className="font-semibold text-slate-700">Missing</span>
                <div className="grid grid-cols-10 text-center font-mono text-slate-600 tabular-nums">
                  {chartStats.missing.map((val, i) => (
                    <span key={i}>{val}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[140px_320px] items-center border-b border-slate-200 py-2 text-xs">
                <span className="font-semibold text-slate-700">Frequency (50)</span>
                <div className="grid grid-cols-10 text-center font-mono font-bold text-slate-800 tabular-nums">
                  {chartStats.freq.map((val, i) => (
                    <span key={i}>{val}</span>
                  ))}
                </div>
              </div>

              {/* Column Header */}
              <div className="grid grid-cols-[140px_320px_1fr] items-center bg-blue-600 px-2 py-2 text-xs font-bold text-white">
                <span>Period</span>
                <div className="grid grid-cols-10 text-center font-mono">
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <span className="text-right pr-2">Size</span>
              </div>

              {/* Rows + SVG Line Overlay */}
              <div className="relative divide-y divide-slate-100">
                <svg
                  className="pointer-events-none absolute left-[140px] top-0 z-0"
                  width={320}
                  height={chartResults.length * 40}
                >
                  <polyline
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth="1.75"
                    points={svgPoints}
                  />
                </svg>

                {chartResults.map((row) => (
                  <div
                    key={row.periodId}
                    className="relative z-10 grid h-[40px] grid-cols-[140px_320px_1fr] items-center px-2 text-xs"
                  >
                    <span className="font-mono text-slate-700 tabular-nums">
                      {row.periodId}
                    </span>

                    <div className="grid grid-cols-10 place-items-center">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) =>
                        d === row.number ? (
                          <LotteryBall key={d} num={d} size="xs" />
                        ) : (
                          <span
                            key={d}
                            className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white font-mono text-[10px] text-slate-400"
                          >
                            {d}
                          </span>
                        )
                      )}
                    </div>

                    <div className="text-right pr-2">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                          row.size === 'big' ? 'bg-amber-500' : 'bg-blue-500'
                        }`}
                      >
                        {row.size === 'big' ? 'B' : 'S'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: My History */}
      {tab === 'my' &&
        (safeOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
            <p className="text-sm font-semibold text-slate-700">
              No demo orders in My History yet
            </p>
            <p className="max-w-md text-xs text-slate-500">
              Select Green, Violet, Red, a ball (0–9), or Big/Small above to place your first 10K demo trade.
            </p>
            <button
              type="button"
              onClick={onJumpToDesk}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700"
            >
              Go to Trading Board
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="px-4 py-3 font-bold">Period</th>
                  <th className="px-4 py-3 font-bold">Selection</th>
                  <th className="px-4 py-3 text-center font-bold">Result</th>
                  <th className="px-4 py-3 text-right font-bold">Stake</th>
                  <th className="px-4 py-3 text-right font-bold">Status / Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {safeOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700 tabular-nums">
                      {order.periodId}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                      {formatSelectionLabel(order.selection)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {typeof order.settledNumber === 'number' ? (
                        <LotteryBall num={order.settledNumber} size="xs" />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-700 tabular-nums">
                      {formatCurrency(order.totalAmount)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums">
                      {order.status === 'pending' && (
                        <span className="text-amber-600">Pending</span>
                      )}
                      {order.status === 'won' && (
                        <span className="text-emerald-700">
                          +{formatCurrency(order.netProfit)}
                        </span>
                      )}
                      {order.status === 'lost' && (
                        <span className="text-rose-600">
                          {formatCurrency(order.netProfit)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
};
