import React from 'react';
import { Coins, ShieldCheck, Users } from 'lucide-react';
import { formatRemainingCooldown } from '../utils/tradingEngine';

interface TopBarProps {
  onClaimCoins: () => void;
  claimRemainingMs: number;
  claimAmountLabel?: string;
  claimCooldownLabel?: string;
  onlineCount: number;
  onSelectGame: (game: 'colour' | 'jhandi' | 'chicken') => void;
  onNavigateRules: () => void;
  isAdmin?: boolean;
  isAdminView?: boolean;
  onToggleAdminView?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onClaimCoins,
  claimRemainingMs,
  claimAmountLabel = '10K',
  claimCooldownLabel = '24 hours',
  onlineCount,
  onSelectGame,
  onNavigateRules,
  isAdmin = false,
  isAdminView = false,
  onToggleAdminView,
}) => {
  const isCooldown = claimRemainingMs > 0;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-2 px-3 py-2.5 sm:gap-6 sm:px-6">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              onSelectGame('colour');
            }}
            className="font-display text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-sm"
          >
            OG TRADE
          </a>

          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-mono text-[11px] font-bold text-emerald-800 tabular-nums whitespace-nowrap shrink-0"
            title="Active players online now"
          >
            <Users className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
            <span>{onlineCount.toLocaleString()} Online</span>
          </span>
        </div>

        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
        >
          <a
            href="#colour-trade"
            onClick={(e) => {
              e.preventDefault();
              onSelectGame('colour');
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Colour Trade
          </a>
          <a
            href="#jhandi-munda"
            onClick={(e) => {
              e.preventDefault();
              onSelectGame('jhandi');
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Jhandi Munda
          </a>
          <a
            href="#chicken-road"
            onClick={(e) => {
              e.preventDefault();
              onSelectGame('chicken');
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Chicken Road
          </a>
          <a
            href="#rules"
            onClick={(e) => {
              e.preventDefault();
              onNavigateRules();
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Rules
          </a>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && onToggleAdminView && (
            <button
              type="button"
              onClick={onToggleAdminView}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                isAdminView
                  ? 'bg-indigo-600 text-white shadow-xs hover:bg-indigo-700'
                  : 'border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{isAdminView ? 'Games' : 'Admin'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClaimCoins}
            title={
              isCooldown
                ? `${claimAmountLabel} DC claim unlocks in ${formatRemainingCooldown(claimRemainingMs)}`
                : `Claim +${claimAmountLabel} DC coins (every ${claimCooldownLabel})`
            }
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 sm:px-3.5 text-xs font-semibold transition-colors active:scale-[0.98] whitespace-nowrap shrink-0 tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
              isCooldown
                ? 'border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
            }`}
          >
            <Coins className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {isCooldown
                ? `Claim ${claimAmountLabel} · ${formatRemainingCooldown(claimRemainingMs, true)}`
                : `Claim ${claimAmountLabel}`}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
