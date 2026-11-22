import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HelpCircle, RotateCcw, Trash2, Users, X } from 'lucide-react';
import {
  playClickSound,
  playDiceRollSound,
  playSettleSound,
  playTickSound,
  playWinSound,
} from '../utils/soundFx';
import {
  MAX_BET_LIMIT,
  formatCurrency,
} from '../utils/tradingEngine';

export type JhandiSymbolId =
  | 'club'
  | 'munda'
  | 'spade'
  | 'diamond'
  | 'jhandi'
  | 'heart';

interface SymbolZoneDef {
  id: JhandiSymbolId;
  title: string;
  hindi: string;
}

// Exact 3x2 order matching the classic Jhandi Munda felt table:
// Top row: Club (Chidi), Crown (Munda), Spade (Hukum)
// Bottom row: Diamond (Eent), Flag (Jhandi), Heart (Paan)
const TABLE_ZONES: SymbolZoneDef[] = [
  { id: 'club', title: 'Club', hindi: 'Chidi' },
  { id: 'munda', title: 'Crown', hindi: 'Munda' },
  { id: 'spade', title: 'Spade', hindi: 'Hukum' },
  { id: 'diamond', title: 'Diamond', hindi: 'Eent' },
  { id: 'jhandi', title: 'Flag', hindi: 'Jhandi' },
  { id: 'heart', title: 'Heart', hindi: 'Paan' },
];

const CASINO_CHIPS = [
  { value: 10, bg: 'bg-emerald-600', ring: 'border-emerald-300', label: '10' },
  { value: 50, bg: 'bg-lime-600', ring: 'border-lime-200', label: '50' },
  { value: 200, bg: 'bg-amber-500', ring: 'border-amber-200', label: '200' },
  { value: 1000, bg: 'bg-purple-600', ring: 'border-purple-200', label: '1000' },
  { value: 5000, bg: 'bg-orange-600', ring: 'border-orange-200', label: '5000' },
];

const DEMO_PLAYERS_LEFT = [
  { name: 'Sanjay P.', initials: 'SP', balance: 2375, badge: 'Top' },
  { name: 'Rahul B.', initials: 'RB', balance: 39362, badge: '' },
  { name: 'Rohan R.', initials: 'RR', balance: 2714, badge: '' },
];

const DEMO_PLAYERS_RIGHT = [
  { name: 'Vanraj', initials: 'VR', balance: 610, badge: 'Lucky' },
  { name: 'Sulandar', initials: 'SL', balance: 6420, badge: '' },
  { name: 'Pawan', initials: 'PW', balance: 7538, badge: '' },
];

const EMPTY_BETS: Record<JhandiSymbolId, number> = {
  club: 0,
  munda: 0,
  spade: 0,
  diamond: 0,
  jhandi: 0,
  heart: 0,
};

function generateInitialZoneHistory(): Record<JhandiSymbolId, number[]> {
  const result: Record<JhandiSymbolId, number[]> = {
    club: [],
    munda: [],
    spade: [],
    diamond: [],
    jhandi: [],
    heart: [],
  };
  for (let r = 0; r < 12; r++) {
    const rollCounts: Record<JhandiSymbolId, number> = {
      club: 0,
      munda: 0,
      spade: 0,
      diamond: 0,
      jhandi: 0,
      heart: 0,
    };
    for (let d = 0; d < 6; d++) {
      const idx = (r * 7 + d * 13 + 3) % TABLE_ZONES.length;
      const zone = TABLE_ZONES[idx];
      if (zone) rollCounts[zone.id] += 1;
    }
    TABLE_ZONES.forEach((z) => {
      result[z.id].push(rollCounts[z.id]);
    });
  }
  return result;
}

function generateTableTotals(): Record<JhandiSymbolId, number> {
  return {
    club: 24970,
    munda: 25560,
    spade: 14360,
    diamond: 13510,
    jhandi: 21570,
    heart: 35140,
  };
}

const JhandiSymbolIcon: React.FC<{
  id: JhandiSymbolId;
  className?: string;
  variant?: 'felt' | 'dice';
}> = ({ id, className = 'h-14 w-14', variant = 'felt' }) => {
  const isFelt = variant === 'felt';
  const black = isFelt ? 'currentColor' : '#111827';
  const red = isFelt ? 'currentColor' : '#DC2626';
  const accentDetail = isFelt ? 'rgba(13, 92, 49, 0.45)' : '#FFFFFF';

  if (id === 'jhandi') {
    // Crossed twin red flags on crossed black poles (matching traditional Jhandi Munda dice)
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
        {/* Left waving flag */}
        <path
          d="M29 19 C22 14, 15 21, 9 18 L12 35 C18 37, 24 31, 31 35 Z"
          fill={red}
          stroke={black}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Right waving flag */}
        <path
          d="M35 19 C42 14, 49 21, 55 18 L52 35 C46 37, 40 31, 33 35 Z"
          fill={red}
          stroke={black}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Tiny pattern dots on flags */}
        <circle cx="17" cy="24" r="1.4" fill={accentDetail} />
        <circle cx="22" cy="26" r="1.4" fill={accentDetail} />
        <circle cx="16" cy="29" r="1.4" fill={accentDetail} />
        <circle cx="47" cy="24" r="1.4" fill={accentDetail} />
        <circle cx="42" cy="26" r="1.4" fill={accentDetail} />
        <circle cx="48" cy="29" r="1.4" fill={accentDetail} />
        {/* Crossed poles */}
        <line x1="25" y1="12" x2="43" y2="54" stroke={black} strokeWidth="3.2" strokeLinecap="round" />
        <line x1="39" y1="12" x2="21" y2="54" stroke={black} strokeWidth="3.2" strokeLinecap="round" />
        <circle cx="43" cy="54" r="2.2" fill={black} />
        <circle cx="21" cy="54" r="2.2" fill={black} />
      </svg>
    );
  }

  if (id === 'munda') {
    // Ornate royal crown with beaded arch, top cross, and crimson inner fill
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
        {/* Top cross */}
        <path d="M32 6 V15 M28 10 H36" stroke={black} strokeWidth="3.2" strokeLinecap="round" />
        {/* Beaded arch */}
        <circle cx="11" cy="30" r="2.3" fill={black} />
        <circle cx="13" cy="24" r="2.4" fill={black} />
        <circle cx="18" cy="19" r="2.5" fill={black} />
        <circle cx="25" cy="16" r="2.5" fill={black} />
        <circle cx="32" cy="18" r="2.6" fill={black} />
        <circle cx="39" cy="16" r="2.5" fill={black} />
        <circle cx="46" cy="19" r="2.5" fill={black} />
        <circle cx="51" cy="24" r="2.4" fill={black} />
        <circle cx="53" cy="30" r="2.3" fill={black} />
        {/* Crown body */}
        <path
          d="M14 45 L15 29 C20 26, 26 28, 32 34 C38 28, 44 26, 49 29 L50 45 Z"
          fill={red}
          stroke={black}
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {/* Inner crown ribs */}
        <path d="M23 30 V43 M32 34 V43 M41 30 V43" stroke={accentDetail} strokeWidth="2" />
        {/* Crown base band */}
        <rect x="14" y="45" width="36" height="7" rx="2" fill={black} />
        <circle cx="22" cy="48.5" r="1.4" fill={accentDetail} />
        <circle cx="32" cy="48.5" r="1.4" fill={accentDetail} />
        <circle cx="42" cy="48.5" r="1.4" fill={accentDetail} />
      </svg>
    );
  }

  if (id === 'heart') {
    // Ornate red heart with concentric upper lobes and dotted tip
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
        <path
          d="M32 56 C18 46, 8 36, 8 23 C8 14.5, 14.5 9, 22 9 C27 9, 30.5 11.5, 32 15 C33.5 11.5, 37 9, 42 9 C49.5 9, 56 14.5, 56 23 C56 36, 46 46, 32 56 Z"
          fill={red}
        />
        {/* Concentric rings on lobes */}
        <circle cx="20.5" cy="22" r="7" fill="none" stroke={accentDetail} strokeWidth="2.2" />
        <circle cx="20.5" cy="22" r="3" fill="none" stroke={accentDetail} strokeWidth="2" />
        <circle cx="43.5" cy="22" r="7" fill="none" stroke={accentDetail} strokeWidth="2.2" />
        <circle cx="43.5" cy="22" r="3" fill="none" stroke={accentDetail} strokeWidth="2" />
        {/* Dotted lower tip */}
        <circle cx="32" cy="33" r="1.8" fill={accentDetail} />
        <circle cx="27" cy="38" r="1.7" fill={accentDetail} />
        <circle cx="37" cy="38" r="1.7" fill={accentDetail} />
        <circle cx="32" cy="43" r="1.7" fill={accentDetail} />
        <circle cx="32" cy="49" r="1.5" fill={accentDetail} />
      </svg>
    );
  }

  if (id === 'diamond') {
    // Ornate faceted red diamond with hollow center and spokes
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
        <polygon
          points="32,6 56,32 32,58 8,32"
          fill="none"
          stroke={red}
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <polygon
          points="32,16 46,32 32,48 18,32"
          fill="none"
          stroke={red}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="32" r="6.5" fill="none" stroke={red} strokeWidth="3" />
        {/* Facet spokes */}
        <line x1="32" y1="6" x2="32" y2="25.5" stroke={red} strokeWidth="2.6" />
        <line x1="32" y1="38.5" x2="32" y2="58" stroke={red} strokeWidth="2.6" />
        <line x1="8" y1="32" x2="25.5" y2="32" stroke={red} strokeWidth="2.6" />
        <line x1="38.5" y1="32" x2="56" y2="32" stroke={red} strokeWidth="2.6" />
        <line x1="20" y1="20" x2="27.5" y2="27.5" stroke={red} strokeWidth="2.2" />
        <line x1="44" y1="20" x2="36.5" y2="27.5" stroke={red} strokeWidth="2.2" />
        <line x1="20" y1="44" x2="27.5" y2="36.5" stroke={red} strokeWidth="2.2" />
        <line x1="44" y1="44" x2="36.5" y2="36.5" stroke={red} strokeWidth="2.2" />
      </svg>
    );
  }

  if (id === 'spade') {
    // Ornate black spade with patterned pointed top, concentric lower lobes, and triangular stem
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
        <path
          d="M32 7 C20 19, 10 28, 10 38 C10 45, 16 49, 22 49 C26.5 49, 30 46.5, 32 43.5 C34 46.5, 37.5 49, 42 49 C48 49, 54 45, 54 38 C54 28, 44 19, 32 7 Z"
          fill={black}
        />
        {/* Concentric rings on lower lobes */}
        <circle cx="21" cy="38" r="7" fill="none" stroke={accentDetail} strokeWidth="2.2" />
        <circle cx="21" cy="38" r="3" fill="none" stroke={accentDetail} strokeWidth="2" />
        <circle cx="43" cy="38" r="7" fill="none" stroke={accentDetail} strokeWidth="2.2" />
        <circle cx="43" cy="38" r="3" fill="none" stroke={accentDetail} strokeWidth="2" />
        {/* Lattice dots at top tip */}
        <circle cx="32" cy="17" r="1.6" fill={accentDetail} />
        <circle cx="28" cy="22" r="1.6" fill={accentDetail} />
        <circle cx="36" cy="22" r="1.6" fill={accentDetail} />
        <circle cx="32" cy="27" r="1.6" fill={accentDetail} />
        {/* Triangular stem */}
        <polygon points="32,44 25,57 39,57" fill={black} />
      </svg>
    );
  }

  // Club (Chidi): Three concentric target-ring lobes + triangular stem
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* Top lobe */}
      <circle cx="32" cy="18" r="11" fill={black} />
      <circle cx="32" cy="18" r="7" fill="none" stroke={accentDetail} strokeWidth="2" />
      <circle cx="32" cy="18" r="3" fill="none" stroke={accentDetail} strokeWidth="1.8" />
      {/* Left lobe */}
      <circle cx="19" cy="36" r="11" fill={black} />
      <circle cx="19" cy="36" r="7" fill="none" stroke={accentDetail} strokeWidth="2" />
      <circle cx="19" cy="36" r="3" fill="none" stroke={accentDetail} strokeWidth="1.8" />
      {/* Right lobe */}
      <circle cx="45" cy="36" r="11" fill={black} />
      <circle cx="45" cy="36" r="7" fill="none" stroke={accentDetail} strokeWidth="2" />
      <circle cx="45" cy="36" r="3" fill="none" stroke={accentDetail} strokeWidth="1.8" />
      {/* Triangular stem */}
      <polygon points="32,41 25,56 39,56" fill={black} />
    </svg>
  );
};

const DICE_FALL_VARIATIONS = [
  { startX: '-14px', startRot: '-42deg', midRot: '-18deg', restRot: '-8deg' },
  { startX: '12px', startRot: '38deg', midRot: '14deg', restRot: '7deg' },
  { startX: '-8px', startRot: '-32deg', midRot: '-12deg', restRot: '5deg' },
  { startX: '16px', startRot: '46deg', midRot: '20deg', restRot: '-6deg' },
  { startX: '-18px', startRot: '-48deg', midRot: '-22deg', restRot: '8deg' },
  { startX: '10px', startRot: '34deg', midRot: '12deg', restRot: '-5deg' },
];

const WhiteDiceFace: React.FC<{
  id: JhandiSymbolId;
  tilted?: boolean;
  animateIndex?: number;
  tumbling?: boolean;
  exiting?: boolean;
}> = ({ id, tilted = false, animateIndex = 0, tumbling = false, exiting = false }) => {
  const variant = DICE_FALL_VARIATIONS[animateIndex % DICE_FALL_VARIATIONS.length];
  const restRot = tilted ? variant.restRot : `${parseInt(variant.restRot, 10) * -1}deg`;

  const diceStyle = {
    animationDelay: exiting ? '0ms' : tumbling ? `${animateIndex * 65}ms` : `${animateIndex * 75}ms`,
    '--jm-start-x': variant.startX,
    '--jm-start-rot': variant.startRot,
    '--jm-mid-rot': variant.midRot,
    '--jm-rest-rot': restRot,
  } as React.CSSProperties;

  return (
    <span className="relative inline-flex items-center justify-center">
      {!tumbling && (
        <span
          aria-hidden="true"
          style={{
            animationDelay: exiting ? '0ms' : `${animateIndex * 75}ms`,
          }}
          className={`pointer-events-none absolute -bottom-1 left-1/2 h-1.5 w-6 -translate-x-1/2 rounded-full bg-black/50 blur-[1.5px] transition-opacity duration-200 ${
            exiting ? 'opacity-0' : 'animate-jm-dice-shadow'
          }`}
        />
      )}
      <span
        style={diceStyle}
        className={`relative inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg border-2 border-slate-300 bg-gradient-to-br from-white via-slate-50 to-slate-200 shadow-md ${
          tumbling
            ? 'animate-jm-dice-tumble'
            : exiting
              ? 'animate-jm-dice-exit'
              : 'animate-jm-dice-land'
        }`}
      >
        <JhandiSymbolIcon id={id} variant="dice" className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
    </span>
  );
};

export interface JhandiRollResult {
  ok: boolean;
  error?: string;
  rolledDice?: JhandiSymbolId[];
  staked?: number;
  netStake?: number;
  payout?: number;
  net?: number;
  winStreak?: number;
  streakCutRate?: number;
}

interface JhandiMundaGameProps {
  demoBalance: number;
  soundEnabled: boolean;
  onRollRound: (payload: {
    bets: Record<JhandiSymbolId, number>;
    roundNumber: number;
    windowBoostedSymbols: JhandiSymbolId[];
    jackpotSymbols: JhandiSymbolId[];
  }) => Promise<JhandiRollResult>;
  onShowRules?: () => void;
  resetKey: number;
  playerLabel?: string;
  onlineCount?: number;
  maxBetLimit?: number;
}

export const JhandiMundaGame: React.FC<JhandiMundaGameProps> = ({
  demoBalance,
  soundEnabled,
  onRollRound,
  onShowRules,
  resetKey,
  playerLabel,
  onlineCount,
  maxBetLimit = MAX_BET_LIMIT,
}) => {
  const hasBetCap = Number.isFinite(maxBetLimit);
  const [selectedChip, setSelectedChip] = useState<number>(10);
  const [bets, setBets] = useState<Record<JhandiSymbolId, number>>(EMPTY_BETS);
  const [lastBets, setLastBets] = useState<Record<JhandiSymbolId, number> | null>(null);
  const [tableTotals, setTableTotals] = useState<Record<JhandiSymbolId, number>>(
    generateTableTotals
  );
  const [zoneHistory, setZoneHistory] = useState<Record<JhandiSymbolId, number[]>>(
    generateInitialZoneHistory
  );
  const [rolledDice, setRolledDice] = useState<JhandiSymbolId[]>([
    'club',
    'munda',
    'jhandi',
    'jhandi',
    'jhandi',
    'heart',
  ]);
  const [phase, setPhase] = useState<'betting' | 'shaking' | 'revealed' | 'clearing'>('betting');
  const [roundSeconds, setRoundSeconds] = useState<number>(15);
  const [showRules, setShowRules] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    staked: number;
    netStake: number;
    payout: number;
    net: number;
    winStreak: number;
    streakCutRate: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const betsRef = useRef(bets);
  betsRef.current = bets;
  const demoBalanceRef = useRef(demoBalance);
  demoBalanceRef.current = demoBalance;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;
  const isRollingRef = useRef(false);
  const roundEndMsRef = useRef<number>(Date.now() + 15 * 1000);
  const lastTickSecRef = useRef<number>(-1);
  const roundSecondsRef = useRef<number>(15);
  roundSecondsRef.current = roundSeconds;
  const roundCountRef = useRef<number>(1);
  const windowBetSymbolsRef = useRef<Set<JhandiSymbolId>>(new Set());
  const jackpotSixSymbolsRef = useRef<Set<JhandiSymbolId>>(new Set());
  const winStreakRef = useRef<number>(0);
  const revealTimerRef = useRef<number | null>(null);

  const clearDiceTimers = useCallback(() => {
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearDiceTimers();
    };
  }, [clearDiceTimers]);

  useEffect(() => {
    if (phase !== 'clearing') return;
    const timer = window.setTimeout(() => {
      setPhase((c) => (c === 'clearing' ? 'betting' : c));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (resetKey > 0) {
      clearDiceTimers();
      roundCountRef.current = 1;
      winStreakRef.current = 0;
      setPhase('betting');
      setStatusBanner(null);
      setBets(EMPTY_BETS);
      windowBetSymbolsRef.current.clear();
      jackpotSixSymbolsRef.current.clear();
    }
  }, [resetKey, clearDiceTimers]);

  const totalBet = useMemo(
    () => Object.values(bets).reduce((sum, v) => sum + v, 0),
    [bets]
  );

  // Count how many rolled dice landed in each symbol zone
  const diceCounts = useMemo(() => {
    const counts: Record<JhandiSymbolId, number> = {
      club: 0,
      munda: 0,
      spade: 0,
      diamond: 0,
      jhandi: 0,
      heart: 0,
    };
    rolledDice.forEach((d) => {
      counts[d] += 1;
    });
    return counts;
  }, [rolledDice]);

  const executeRoll = useCallback(async () => {
    if (isRollingRef.current) return;
    const currentBets = betsRef.current;
    const betSum = Object.values(currentBets).reduce((s, v) => s + v, 0);

    if (betSum > demoBalanceRef.current) {
      setErrorMsg('Insufficient demo balance. Clear bets or wait for 24h Claim 10K.');
      roundEndMsRef.current = Date.now() + 15 * 1000;
      setRoundSeconds(15);
      return;
    }

    clearDiceTimers();
    isRollingRef.current = true;
    setErrorMsg(null);
    setPhase('shaking');
    if (betSum > 0) {
      setLastBets({ ...currentBets });
    }
    playDiceRollSound(soundRef.current);

    const jackpotSymbols = Array.from(jackpotSixSymbolsRef.current)
      .filter((sym) => currentBets[sym] > 0)
      .sort((a, b) => currentBets[b] - currentBets[a]);
    jackpotSixSymbolsRef.current.clear();

    const boostedSymbols = Array.from(windowBetSymbolsRef.current)
      .filter((sym) => currentBets[sym] > 0)
      .sort((a, b) => currentBets[b] - currentBets[a]);
    windowBetSymbolsRef.current.clear();

    const currentRoundNumber = roundCountRef.current;

    const shakeDelayPromise = new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1200);
    });

    let serverRoll: JhandiRollResult | null = null;
    if (betSum > 0) {
      try {
        const [rollRes] = await Promise.all([
          onRollRound({
            bets: currentBets,
            roundNumber: currentRoundNumber,
            windowBoostedSymbols: boostedSymbols,
            jackpotSymbols,
          }),
          shakeDelayPromise,
        ]);
        serverRoll = rollRes;
      } catch (err) {
        serverRoll = {
          ok: false,
          error: err instanceof Error ? err.message : 'Server roll failed.',
        };
      }
    } else {
      await shakeDelayPromise;
    }

    if (betSum > 0 && (!serverRoll || !serverRoll.ok || !serverRoll.rolledDice)) {
      isRollingRef.current = false;
      roundEndMsRef.current = Date.now() + 15 * 1000;
      lastTickSecRef.current = -1;
      setRoundSeconds(15);
      setPhase('betting');
      setErrorMsg(serverRoll?.error || 'Unable to validate roll on server.');
      return;
    }

    let finalDice: JhandiSymbolId[];
    if (serverRoll && serverRoll.rolledDice) {
      finalDice = serverRoll.rolledDice;
    } else if (currentRoundNumber === 7 || currentRoundNumber === 11) {
      finalDice = ['club', 'munda', 'spade', 'diamond', 'jhandi', 'heart'];
    } else {
      finalDice = Array.from({ length: 6 }, () => {
        const idx = Math.floor(Math.random() * TABLE_ZONES.length);
        return TABLE_ZONES[idx]?.id ?? 'club';
      });
    }

    const counts: Record<JhandiSymbolId, number> = {
      club: 0,
      munda: 0,
      spade: 0,
      diamond: 0,
      jhandi: 0,
      heart: 0,
    };
    finalDice.forEach((d) => {
      counts[d] += 1;
    });

    if (betSum > 0 && serverRoll) {
      const payout = serverRoll.payout ?? 0;
      winStreakRef.current = serverRoll.winStreak ?? 0;
      if (payout > 0) {
        playWinSound(soundRef.current);
      } else {
        playSettleSound(soundRef.current);
      }
      setStatusBanner({
        staked: serverRoll.staked ?? betSum,
        netStake: serverRoll.netStake ?? betSum,
        payout,
        net: serverRoll.net ?? -betSum,
        winStreak: serverRoll.winStreak ?? 0,
        streakCutRate: serverRoll.streakCutRate ?? 0,
      });
    } else {
      playSettleSound(soundRef.current);
      setStatusBanner(null);
    }

    setRolledDice(finalDice);
    setZoneHistory((prev) => {
      const next = { ...prev };
      TABLE_ZONES.forEach((z) => {
        const prevStrip = Array.isArray(prev[z.id]) ? prev[z.id] : [];
        next[z.id] = [...prevStrip.slice(1), counts[z.id] ?? 0];
      });
      return next;
    });

    // Refresh simulated table pool numbers for next round feel
    setTableTotals({
      club: 12000 + Math.floor(Math.random() * 22000),
      munda: 14000 + Math.floor(Math.random() * 22000),
      spade: 11000 + Math.floor(Math.random() * 19000),
      diamond: 10000 + Math.floor(Math.random() * 18000),
      jhandi: 15000 + Math.floor(Math.random() * 24000),
      heart: 16000 + Math.floor(Math.random() * 25000),
    });

    setBets(EMPTY_BETS);
    isRollingRef.current = false;
    roundEndMsRef.current = Date.now() + 15 * 1000;
    lastTickSecRef.current = -1;
    setRoundSeconds(15);
    roundCountRef.current += 1;
    setPhase('revealed');

    // 4-second total dice animation: 1200ms shake + 2500ms smooth gravity drop & reveal + 300ms smooth exit
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null;
      setPhase((current) => (current === 'revealed' ? 'clearing' : current));
    }, 2500);
  }, [onRollRound, clearDiceTimers]);

  // Automatic 15-second round countdown timer
  useEffect(() => {
    roundEndMsRef.current = Date.now() + 15 * 1000;

    const timer = window.setInterval(() => {
      if (isRollingRef.current) return;
      const left = Math.max(0, Math.ceil((roundEndMsRef.current - Date.now()) / 1000));
      setRoundSeconds(left);

      if (left > 0 && left <= 3 && lastTickSecRef.current !== left) {
        lastTickSecRef.current = left;
        playTickSound(soundRef.current);
      }

      if (left <= 0) {
        executeRoll();
      }
    }, 200);

    return () => window.clearInterval(timer);
  }, [executeRoll]);

  const handleZoneTap = (zoneId: JhandiSymbolId) => {
    if (phase === 'shaking') return;
    setErrorMsg(null);
    if (hasBetCap && totalBet + selectedChip > maxBetLimit) {
      setErrorMsg(`Max bet limit is ${formatCurrency(maxBetLimit)} DC per round.`);
      return;
    }
    if (totalBet + selectedChip > demoBalance) {
      setErrorMsg(`Insufficient balance. Lower chip or wait for ${hasBetCap ? '24h Claim 10K' : '1h Claim 1Cr'}.`);
      return;
    }
    playClickSound(soundEnabled);
    if (phase === 'revealed' || phase === 'clearing') {
      clearDiceTimers();
      setPhase('betting');
    }
    if (roundSecondsRef.current >= 1 && roundSecondsRef.current <= 2) {
      jackpotSixSymbolsRef.current.add(zoneId);
    } else if (roundSecondsRef.current >= 6 && roundSecondsRef.current <= 9) {
      windowBetSymbolsRef.current.add(zoneId);
    }
    setBets((prev) => ({
      ...prev,
      [zoneId]: prev[zoneId] + selectedChip,
    }));
  };

  const handleClear = () => {
    if (phase === 'shaking') return;
    playClickSound(soundEnabled);
    jackpotSixSymbolsRef.current.clear();
    windowBetSymbolsRef.current.clear();
    setBets(EMPTY_BETS);
    setErrorMsg(null);
  };

  const handleRepeat = () => {
    if (phase === 'shaking' || !lastBets) return;
    const needed = Object.values(lastBets).reduce((s, v) => s + v, 0);
    if (needed <= 0) return;
    if (hasBetCap && needed > maxBetLimit) {
      setErrorMsg(`Max bet limit is ${formatCurrency(maxBetLimit)} DC per round.`);
      return;
    }
    if (needed > demoBalance) {
      setErrorMsg('Insufficient balance to repeat last bets.');
      return;
    }
    playClickSound(soundEnabled);
    if (roundSecondsRef.current >= 1 && roundSecondsRef.current <= 2) {
      (Object.keys(lastBets) as JhandiSymbolId[]).forEach((sym) => {
        if (lastBets[sym] > 0) {
          jackpotSixSymbolsRef.current.add(sym);
        }
      });
    } else if (roundSecondsRef.current >= 6 && roundSecondsRef.current <= 9) {
      (Object.keys(lastBets) as JhandiSymbolId[]).forEach((sym) => {
        if (lastBets[sym] > 0) {
          windowBetSymbolsRef.current.add(sym);
        }
      });
    }
    clearDiceTimers();
    setBets({ ...lastBets });
    setPhase('betting');
    setErrorMsg(null);
  };

  return (
    <section className="space-y-3">
      {/* Casino Felt Table Container */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-[#2B1710] via-[#1C0F0A] to-[#140A07] p-2.5 text-white shadow-lg sm:p-3.5">
        {/* Top Table Bar: Help + Dice Shaker Cup + 15s Timer */}
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                playClickSound(soundEnabled);
                setShowRules((prev) => !prev);
              }}
              aria-expanded={showRules}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-700 text-white hover:bg-emerald-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
              title="Jhandi Munda Rules"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="font-display text-sm font-bold tracking-wide text-amber-200 sm:text-base">
              Jhandi Munda Table
            </span>
            {typeof onlineCount === 'number' && (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-200 tabular-nums">
                <Users className="h-3 w-3 text-emerald-300 shrink-0" aria-hidden="true" />
                <span>{onlineCount.toLocaleString()} Online</span>
              </span>
            )}
          </div>

          {/* Dice Shaker Cup Status + 15s Auto Timer */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div
              className={`inline-flex items-center gap-2 rounded-full border border-amber-300/60 bg-gradient-to-b from-slate-700 to-slate-900 px-3.5 py-1.5 text-xs font-bold text-amber-100 shadow-sm ${
                phase === 'shaking' ? 'animate-jm-cup-shake border-amber-300 ring-2 ring-amber-400/50' : ''
              }`}
            >
              <span
                className="inline-block h-4 w-3.5 rounded-t-full border border-slate-400 bg-gradient-to-b from-slate-500 to-slate-900"
                aria-hidden="true"
              />
              <span>
                {phase === 'shaking'
                  ? 'Shaking Cup...'
                  : totalBet > 0
                    ? `Bet: ${formatCurrency(totalBet)} DC`
                    : 'Place Chips'}
              </span>
            </div>

            <div
              className={`rounded-full border px-3.5 py-1.5 font-mono text-xs font-extrabold tabular-nums ${
                phase === 'shaking'
                  ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                  : roundSeconds <= 3
                    ? 'border-rose-400 bg-rose-500/25 text-rose-200'
                    : 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
              }`}
            >
              {phase === 'shaking'
                ? 'Rolling...'
                : `00:${String(roundSeconds).padStart(2, '0')}`}
            </div>
          </div>
        </div>

        {/* Colourful Jhandi Munda Rules Drawer (toggled by ? button) */}
        {showRules && (
          <div className="mb-3 rounded-xl border border-amber-300/40 bg-white p-3.5 text-slate-900 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="font-display text-sm font-bold text-emerald-800">
                Jhandi Munda Rules
              </h3>
              <div className="flex items-center gap-3">
                {onShowRules && (
                  <button
                    type="button"
                    onClick={onShowRules}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Full Rules
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    playClickSound(soundEnabled);
                    setShowRules(false);
                  }}
                  aria-label="Close Jhandi Munda Rules"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="mt-2.5 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg bg-emerald-50 px-3 py-2">
                <span className="font-bold text-emerald-700">2 Dice = 3x · 6 Dice = 100x</span>
                <p className="mt-0.5 text-slate-600">
                  3 Dice = 4x, 4 Dice = 5x, 5 Dice = 6x, aur 6 matching dice par 100x jackpot payout milta hai.
                </p>
              </div>
              <div className="rounded-lg bg-rose-50 px-3 py-2">
                <span className="font-bold text-rose-700">30% Bet Deduction</span>
                <p className="mt-0.5 text-slate-600">
                  Har bet se 30% deduction ke baad net 70% stake par payout calculate hota hai.
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 px-3 py-2">
                <span className="font-bold text-amber-700">Win Streak: 9% / 50% Cut</span>
                <p className="mt-0.5 text-slate-600">
                  Lagatar 2–5 wins par 9% cut aur 5 se zyada baar win hone par 50% cut lagta hai.
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 px-3 py-2">
                <span className="font-bold text-blue-700">
                  {hasBetCap ? `Max Bet Limit ${formatCurrency(maxBetLimit)} DC` : 'No Bet Limit (VIP)'}
                </span>
                <p className="mt-0.5 text-slate-600">
                  {hasBetCap
                    ? 'Ek round me 25K DC se zyada total bet nahi laga sakte.'
                    : 'VIP account par koi bet limit nahi hai — full balance tak bet laga sakte hain.'}
                </p>
              </div>
              <div className="rounded-lg bg-violet-50 px-3 py-2">
                <span className="font-bold text-violet-700">Round 7 &amp; 11 Single Dice</span>
                <p className="mt-0.5 text-slate-600">
                  Sirf 7th aur 11th round me har box me 1-1 single dice aata hai.
                </p>
              </div>
              <div className="rounded-lg bg-indigo-50 px-3 py-2">
                <span className="font-bold text-indigo-700">
                  {hasBetCap ? '15s Auto Roll · 24h 10K Claim' : '15s Auto Roll · 1h 1Cr Claim'}
                </span>
                <p className="mt-0.5 text-slate-600">
                  {hasBetCap
                    ? 'Har 15 sec me auto dice roll aur har 24 hours ke baad 10K DC claim unlock hota hai.'
                    : 'Har 15 sec me auto dice roll aur har 1 hour me 1Cr DC coins login/claim par milte hain.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Table Grid with Optional Side Demo Seats on XL Screens */}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[120px_1fr_120px] items-center">
          {/* Left Simulated Table Seats */}
          <div className="hidden xl:flex flex-col gap-3">
            {DEMO_PLAYERS_LEFT.map((p) => (
              <div
                key={p.name}
                className="flex flex-col items-center rounded-xl border border-amber-500/20 bg-black/35 p-2 text-center"
              >
                {p.badge && (
                  <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                    {p.badge}
                  </span>
                )}
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-400/70 bg-gradient-to-b from-slate-700 to-slate-900 text-xs font-bold text-white">
                  {p.initials}
                </div>
                <span className="mt-1 truncate max-w-[100px] text-[11px] font-medium text-slate-200">
                  {p.name}
                </span>
                <span className="font-mono text-[11px] font-bold text-amber-300 tabular-nums">
                  {p.balance.toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {/* 3x2 Emerald Green Felt Board with Polished Gold Frame */}
          <div className="relative rounded-xl border-4 border-amber-400 bg-gradient-to-b from-[#17874A] to-[#0D5C31] p-1 shadow-inner">
            {phase === 'shaking' && (
              <div
                aria-live="polite"
                className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/35 backdrop-blur-[1px]"
              >
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {TABLE_ZONES.map((z, idx) => (
                    <WhiteDiceFace key={z.id} id={z.id} tumbling animateIndex={idx} />
                  ))}
                </div>
                <span className="rounded-full border border-amber-300/50 bg-slate-950/80 px-3 py-0.5 text-[11px] font-bold text-amber-200 shadow-sm">
                  Rolling Dice...
                </span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-[2px] bg-amber-300/35">
              {TABLE_ZONES.map((zone) => {
                const userBet = bets[zone.id];
                const showDice = phase === 'revealed' || phase === 'clearing';
                const diceCount = showDice ? diceCounts[zone.id] ?? 0 : 0;
                const isWinningZone = diceCount >= 2;
                const historyStrip = Array.isArray(zoneHistory[zone.id]) ? zoneHistory[zone.id] : [];

                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => handleZoneTap(zone.id)}
                    className={`group relative flex min-h-[112px] sm:min-h-[128px] flex-col justify-between p-1.5 sm:p-2 text-left transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                      isWinningZone
                        ? 'bg-gradient-to-b from-amber-500/35 via-[#198C4E] to-[#0F6937] ring-2 ring-inset ring-amber-300'
                        : userBet > 0
                          ? 'bg-[#1A9352]'
                          : 'bg-[#12723E] hover:bg-[#168147]'
                    }`}
                  >
                    {/* Top row: Table pool + User bet badge */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[10px] sm:text-xs font-bold text-white/90 tabular-nums truncate">
                        {(tableTotals[zone.id] + userBet).toLocaleString()}
                      </span>

                      {userBet > 0 ? (
                        <span className="rounded bg-amber-400 px-1 sm:px-1.5 py-0.5 font-mono text-[10px] sm:text-[11px] font-extrabold text-slate-950 shadow-xs tabular-nums shrink-0 transition-transform group-active:scale-110">
                          +{userBet}
                        </span>
                      ) : (
                        <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-100/80 shrink-0">
                          {zone.hindi}
                        </span>
                      )}
                    </div>

                    {/* Center: Etched Felt Watermark + Falling/Landed Dice */}
                    <div className="relative my-1 flex flex-1 items-center justify-center">
                      <JhandiSymbolIcon
                        id={zone.id}
                        variant="felt"
                        className={`h-12 w-12 sm:h-15 sm:w-15 transition-opacity duration-300 ${
                          diceCount > 0 ? 'text-emerald-950/30' : 'text-emerald-950/55 group-hover:text-emerald-950/75'
                        }`}
                      />

                      {diceCount > 0 && (
                        <div className="pointer-events-none absolute inset-0 z-10 mx-auto flex max-w-[104px] sm:max-w-[124px] flex-wrap items-center justify-center content-center gap-1.5">
                          {Array.from({ length: diceCount }).map((_, idx) => (
                            <WhiteDiceFace
                              key={`${zone.id}-${idx}`}
                              id={zone.id}
                              tilted={idx % 2 === 0}
                              animateIndex={idx}
                              exiting={phase === 'clearing'}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom: 12-Round Per-Symbol Match Strip */}
                    <div className="grid grid-cols-6 sm:grid-cols-12 gap-[2px] rounded bg-black/30 p-0.5 sm:p-1">
                      {historyStrip.map((cnt, idx) => (
                        <span
                          key={idx}
                          className={`flex h-3.5 sm:h-4 items-center justify-center rounded-[2px] font-mono text-[9px] sm:text-[10px] font-bold tabular-nums ${
                            cnt >= 2
                              ? 'bg-orange-500 text-white'
                              : cnt === 1
                                ? 'bg-slate-400/70 text-slate-950'
                                : 'bg-slate-700/70 text-slate-300'
                          }`}
                        >
                          {cnt === 0 ? '-' : cnt}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Simulated Table Seats */}
          <div className="hidden xl:flex flex-col gap-3">
            {DEMO_PLAYERS_RIGHT.map((p) => (
              <div
                key={p.name}
                className="flex flex-col items-center rounded-xl border border-amber-500/20 bg-black/35 p-2 text-center"
              >
                {p.badge && (
                  <span className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                    {p.badge}
                  </span>
                )}
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-400/70 bg-gradient-to-b from-slate-700 to-slate-900 text-xs font-bold text-white">
                  {p.initials}
                </div>
                <span className="mt-1 truncate max-w-[100px] text-[11px] font-medium text-slate-200">
                  {p.name}
                </span>
                <span className="font-mono text-[11px] font-bold text-amber-300 tabular-nums">
                  {p.balance.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Result & Error Feedback Strip */}
        {statusBanner && phase !== 'shaking' && (
          <div
            role="status"
            className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg px-3.5 py-2 text-xs font-bold ${
              statusBanner.payout > 0
                ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                : 'bg-white/10 text-slate-200 border border-white/15'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Staked {formatCurrency(statusBanner.staked)} DC (30% Cut · Net{' '}
                {formatCurrency(statusBanner.netStake)})
              </span>
              {statusBanner.streakCutRate > 0 && (
                <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[11px] text-amber-200">
                  Win Streak x{statusBanner.winStreak} · {Math.round(statusBanner.streakCutRate * 100)}% Amount Cut Applied
                </span>
              )}
            </div>
            <span className="font-mono tabular-nums">
              {statusBanner.payout > 0
                ? `Won +${formatCurrency(statusBanner.payout)} DC (Net +${formatCurrency(statusBanner.net)})`
                : `No 2+ matches · ${formatCurrency(statusBanner.net)} DC`}
            </span>
          </div>
        )}

        {errorMsg && (
          <p role="alert" className="mt-2 text-xs font-semibold text-amber-300">
            {errorMsg}
          </p>
        )}

        {/* Bottom Casino Chip Bar (10, 50, 200, 1000, 5000) + Controls */}
        <div className="mt-2.5 flex flex-col gap-2.5 border-t border-white/10 pt-2.5 md:flex-row md:items-center md:justify-between">
          {/* Player Demo Pill */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-amber-400 bg-gradient-to-b from-amber-500 to-amber-700 text-xs font-extrabold text-white">
              OG
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200">
                {playerLabel || 'OG_PLAYER'} · {hasBetCap ? 'Max 25K/Round' : 'No Bet Limit'}
              </div>
              <div className="font-mono text-xs font-extrabold text-amber-300 tabular-nums">
                {formatCurrency(demoBalance)} DC
              </div>
            </div>
          </div>

          {/* Glossy Circular Casino Chips */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {CASINO_CHIPS.map((chip) => {
              const active = selectedChip === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => {
                    playClickSound(soundEnabled);
                    setSelectedChip(chip.value);
                  }}
                  className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full border-[3px] border-dashed font-mono text-[11px] sm:text-xs font-extrabold text-white shadow-md transition-transform ${
                    chip.bg
                  } ${chip.ring} ${
                    active
                      ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#190D09]'
                      : 'opacity-85 hover:scale-105 hover:opacity-100'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {/* Clear / Repeat / Roll */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClear}
              disabled={phase === 'shaking' || totalBet === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Clear</span>
            </button>

            <button
              type="button"
              onClick={handleRepeat}
              disabled={phase === 'shaking' || !lastBets}
              className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Repeat</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
