import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Car,
  CheckCircle2,
  Coins,
  HelpCircle,
  Music,
  Play,
  RotateCcw,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  playBarrierSound,
  playCarHornSound,
  playChickenLaughSound,
  playChickenStartSound,
  playChickenWinSound,
  playClickSound,
  playCrashSound,
  playHopSound,
  startChickenRoadBgMusic,
  stopChickenRoadBgMusic,
} from '../utils/soundFx';
import {
  FEE_RATE,
  MAX_BET_LIMIT,
  formatCurrency,
  getWinStreakCutRate,
  roundCurrency,
} from '../utils/tradingEngine';

export type ChickenDifficultyId = 'easy' | 'medium' | 'hard' | 'hardcore';

interface DifficultyConfig {
  id: ChickenDifficultyId;
  label: string;
  trapChance: number;
  summary: string;
  multipliers: number[];
}

const DIFFICULTIES: DifficultyConfig[] = [
  {
    id: 'easy',
    label: 'Easy',
    trapChance: 0.12,
    summary: '12 lanes · Low traffic',
    multipliers: [1.15, 1.32, 1.54, 1.82, 2.18, 2.65, 3.25, 4.10, 5.25, 6.80, 9.00, 12.00],
  },
  {
    id: 'medium',
    label: 'Medium',
    trapChance: 0.22,
    summary: '10 lanes · Fast traffic',
    multipliers: [1.30, 1.65, 2.15, 2.85, 3.85, 5.30, 7.50, 11.00, 17.50, 30.00],
  },
  {
    id: 'hard',
    label: 'Hard',
    trapChance: 0.34,
    summary: '8 lanes · Rush hour',
    multipliers: [1.65, 2.45, 3.75, 5.90, 9.50, 16.00, 32.00, 75.00],
  },
  {
    id: 'hardcore',
    label: 'Hardcore',
    trapChance: 0.48,
    summary: '6 lanes · Max 150x',
    multipliers: [2.25, 4.20, 8.50, 18.00, 45.00, 150.00],
  },
];

const QUICK_STAKES = [10, 50, 200, 500, 1000, 5000];

const CAR_THEMES = [
  { body: '#EF4444', roof: '#FCA5A5', trim: '#991B1B', label: 'Sports' },
  { body: '#F59E0B', roof: '#FDE68A', trim: '#B45309', label: 'Taxi' },
  { body: '#3B82F6', roof: '#93C5FD', trim: '#1D4ED8', label: 'Sedan' },
  { body: '#F97316', roof: '#FDBA74', trim: '#C2410C', label: 'Truck' },
  { body: '#A855F7', roof: '#D8B4FE', trim: '#6B21A8', label: 'Coupe' },
  { body: '#10B981', roof: '#6EE7B7', trim: '#047857', label: 'SUV' },
];

const LANE_SPEEDS = ['2.3s', '2.9s', '2.1s', '3.1s', '2.5s', '2.7s'];
const LANE_DELAYS = ['-0.4s', '-1.5s', '-0.9s', '-2.1s', '-1.2s', '-0.2s'];

interface CrossingRecord {
  id: string;
  difficultyLabel: string;
  stake: number;
  netStake: number;
  laneReached: number;
  totalLanes: number;
  multiplier: number;
  payout: number;
  net: number;
  outcome: 'won' | 'crashed';
  time: string;
}

export interface ChickenServerStartResult {
  ok: boolean;
  error?: string;
  stake?: number;
  netStake?: number;
}

export interface ChickenServerStepResult {
  ok: boolean;
  error?: string;
  outcome?: 'safe' | 'crashed' | 'won';
  laneIndex?: number;
  laneReached?: number;
  multiplier?: number;
  traps?: boolean[];
  winStreak?: number;
  streakCutRate?: number;
  payout?: number;
  net?: number;
}

export interface ChickenServerCashOutResult {
  ok: boolean;
  error?: string;
  laneReached?: number;
  multiplier?: number;
  traps?: boolean[];
  winStreak?: number;
  streakCutRate?: number;
  payout?: number;
  net?: number;
}

interface ChickenRoadGameProps {
  demoBalance: number;
  soundEnabled: boolean;
  onBalanceChange: (delta: number) => void;
  onShowRules?: () => void;
  resetKey: number;
  playerLabel?: string;
  onlineCount?: number;
  onServerStart?: (difficultyId: ChickenDifficultyId, stake: number) => Promise<ChickenServerStartResult>;
  onServerStep?: () => Promise<ChickenServerStepResult>;
  onServerCashOut?: () => Promise<ChickenServerCashOutResult>;
}

const CarSprite: React.FC<{
  variantIndex: number;
  isTruck?: boolean;
  headlights?: boolean;
  className?: string;
}> = ({ variantIndex, isTruck = false, headlights = true, className = 'h-16 w-10' }) => {
  const theme = CAR_THEMES[variantIndex % CAR_THEMES.length];

  return (
    <svg viewBox="0 0 48 80" className={className} aria-hidden="true">
      {/* Headlight beams shining downward */}
      {headlights && (
        <g opacity="0.28">
          <polygon points="8,72 2,80 18,80 15,72" fill="#FEF08A" />
          <polygon points="33,72 30,80 46,80 40,72" fill="#FEF08A" />
        </g>
      )}
      {/* Ground shadow */}
      <rect x="6" y="7" width="36" height="67" rx="9" fill="rgba(0,0,0,0.4)" />
      {/* Wheels */}
      <rect x="3" y="14" width="5" height="13" rx="2" fill="#0F172A" />
      <rect x="40" y="14" width="5" height="13" rx="2" fill="#0F172A" />
      <rect x="3" y="51" width="5" height="13" rx="2" fill="#0F172A" />
      <rect x="40" y="51" width="5" height="13" rx="2" fill="#0F172A" />
      {/* Chassis */}
      <rect
        x="7"
        y="6"
        width="34"
        height="66"
        rx={isTruck ? '5' : '9'}
        fill={theme.body}
        stroke="#0F172A"
        strokeWidth="2.2"
      />
      {/* Racing stripe or truck bed */}
      {isTruck ? (
        <rect x="10" y="9" width="28" height="29" rx="3" fill={theme.trim} stroke="#0F172A" strokeWidth="1.4" />
      ) : (
        <rect x="21" y="8" width="6" height="62" fill={theme.roof} opacity="0.5" />
      )}
      {/* Rear window */}
      {!isTruck && <rect x="12" y="14" width="24" height="11" rx="3" fill="#0F172A" />}
      {/* Roof */}
      <rect
        x="11"
        y={isTruck ? '40' : '27'}
        width="26"
        height={isTruck ? '13' : '19'}
        rx="4"
        fill={theme.roof}
        stroke="#0F172A"
        strokeWidth="1.6"
      />
      {/* Front windshield (facing down) */}
      <polygon
        points={isTruck ? '12,53 36,53 34,63 14,63' : '12,47 36,47 34,58 14,58'}
        fill="#0F172A"
      />
      {/* Taillights (top) */}
      <rect x="9" y="6" width="7" height="3" rx="1" fill="#DC2626" />
      <rect x="32" y="6" width="7" height="3" rx="1" fill="#DC2626" />
      {/* Headlights (bottom) */}
      <rect x="9" y="69" width="7" height="3" rx="1" fill="#FEF08A" />
      <rect x="32" y="69" width="7" height="3" rx="1" fill="#FEF08A" />
    </svg>
  );
};

const ChickenSprite: React.FC<{ laughing?: boolean; hopping?: boolean }> = ({
  laughing = false,
  hopping = false,
}) => (
  <svg
    viewBox="0 0 64 64"
    className={`h-14 w-14 drop-shadow-lg ${
      laughing ? 'animate-cr-laugh' : hopping ? 'animate-cr-hop' : ''
    }`}
    aria-hidden="true"
  >
    {/* Ground shadow */}
    <ellipse cx="31" cy="58" rx="15" ry="3.8" fill="rgba(0,0,0,0.42)" />

    {/* Orange webbed feet */}
    <path
      d="M25 49 V55 M21 55 H28 M38 49 V55 M35 55 H42"
      stroke="#F59E0B"
      strokeWidth="3.2"
      strokeLinecap="round"
    />

    {/* Fluffy tail feathers */}
    <path
      d="M16 34 C9 30, 8 22, 15 24 C12 19, 17 16, 21 22 C20 18, 24 18, 25 23"
      fill="#F8FAFC"
      stroke="#0F172A"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />

    {/* Plump body with subtle cream shading */}
    <ellipse
      cx="31"
      cy="37"
      rx="16"
      ry="13.5"
      fill="#FFFFFF"
      stroke="#0F172A"
      strokeWidth="2.4"
    />
    <path
      d="M17 39 C20 47, 42 47, 45 39 C41 44, 21 44, 17 39 Z"
      fill="#E2E8F0"
    />

    {/* Animated wing (raised & flapping when laughing or hopping) */}
    <path
      d={
        laughing
          ? 'M18 33 C11 23, 18 16, 27 25 C28 31, 22 36, 18 33 Z'
          : hopping
            ? 'M20 33 C14 26, 20 20, 28 26 C29 31, 24 35, 20 33 Z'
            : 'M21 35 C17 40, 23 45, 31 40 C32 36, 26 33, 21 35 Z'
      }
      fill="#F1F5F9"
      stroke="#0F172A"
      strokeWidth="2.1"
      strokeLinejoin="round"
    />

    {/* Glossy 3-lobe red comb */}
    <path
      d="M26 15 C25 9, 31 8, 33 12 C35 7, 41 8, 40 13 C44 12, 46 16, 42 19 L28 19 Z"
      fill="#EF4444"
      stroke="#0F172A"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="31" cy="12" r="1.2" fill="#FCA5A5" />

    {/* Head */}
    <circle
      cx="36"
      cy="23"
      r="10.5"
      fill="#FFFFFF"
      stroke="#0F172A"
      strokeWidth="2.4"
    />

    {/* Rosy cheek blush */}
    <ellipse
      cx="35"
      cy="27.2"
      rx="3"
      ry="1.8"
      fill={laughing ? '#FB7185' : '#FDA4AF'}
      opacity={laughing ? '0.85' : '0.65'}
    />

    {/* Red wattle */}
    <ellipse
      cx="40.5"
      cy="31"
      rx="2.6"
      ry="3.4"
      fill="#EF4444"
      stroke="#0F172A"
      strokeWidth="1.6"
    />

    {/* Beak: wide-open laughing beak with tongue vs cute smiling beak */}
    {laughing ? (
      <g>
        <polygon
          points="44,21 56,19 46,25"
          fill="#F59E0B"
          stroke="#0F172A"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <polygon
          points="45,25 55,29 44,30"
          fill="#F59E0B"
          stroke="#0F172A"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path
          d="M45 24.5 L52 25 L45 28 Z"
          fill="#FB7185"
          stroke="#0F172A"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </g>
    ) : (
      <polygon
        points="45,21.5 55,25 45,28.5"
        fill="#F59E0B"
        stroke="#0F172A"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    )}

    {/* Eye: cheerful squinting laugh arc vs bright expressive eye */}
    {laughing ? (
      <path
        d="M36.5 22 Q39.5 18 42.5 22"
        fill="none"
        stroke="#0F172A"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    ) : (
      <>
        <circle cx="39.5" cy="21.5" r="2.6" fill="#0F172A" />
        <circle cx="40.4" cy="20.6" r="0.95" fill="#FFFFFF" />
      </>
    )}
  </svg>
);

function generateTraps(count: number, trapChance: number): boolean[] {
  const traps = Array.from({ length: count }, () => Math.random() < trapChance);
  if (!traps.some(Boolean)) {
    traps[Math.floor(Math.random() * count)] = true;
  }
  return traps;
}

export const ChickenRoadGame: React.FC<ChickenRoadGameProps & { maxBetLimit?: number }> = ({
  demoBalance,
  soundEnabled,
  onBalanceChange,
  onShowRules,
  resetKey,
  playerLabel,
  onlineCount,
  maxBetLimit = MAX_BET_LIMIT,
  onServerStart,
  onServerStep,
  onServerCashOut,
}) => {
  const hasBetCap = Number.isFinite(maxBetLimit);
  const [difficultyId, setDifficultyId] = useState<ChickenDifficultyId>('medium');
  const [stakeInput, setStakeInput] = useState<string>('100');
  const [phase, setPhase] = useState<'idle' | 'running' | 'cashed_out' | 'crashed'>('idle');
  const [serverBusy, setServerBusy] = useState<boolean>(false);
  const [activeStake, setActiveStake] = useState<number>(0);
  const [activeNetStake, setActiveNetStake] = useState<number>(0);
  const [traps, setTraps] = useState<boolean[]>([]);
  const [currentLane, setCurrentLane] = useState<number>(-1);
  const [hopTick, setHopTick] = useState<number>(0);
  const [showRulesDrawer, setShowRulesDrawer] = useState<boolean>(false);
  const [musicEnabled, setMusicEnabled] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [winStreak, setWinStreak] = useState<number>(0);
  const [lastSummary, setLastSummary] = useState<{
    outcome: 'won' | 'crashed';
    staked: number;
    netStake: number;
    payout: number;
    net: number;
    multiplier: number;
    laneReached: number;
    winStreak: number;
    streakCutRate: number;
  } | null>(null);
  const [history, setHistory] = useState<CrossingRecord[]>([]);

  const laneRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const winStreakRef = useRef<number>(0);

  const difficulty = useMemo(
    () => DIFFICULTIES.find((d) => d.id === difficultyId) ?? DIFFICULTIES[1],
    [difficultyId]
  );

  const parsedStake = useMemo(() => {
    const num = Number(stakeInput);
    return Number.isFinite(num) && num > 0 ? roundCurrency(num) : 0;
  }, [stakeInput]);

  const previewNetStake = useMemo(
    () => roundCurrency(parsedStake * (1 - FEE_RATE)),
    [parsedStake]
  );

  useEffect(() => {
    if (resetKey > 0) {
      winStreakRef.current = 0;
      setWinStreak(0);
      setPhase('idle');
      setCurrentLane(-1);
      setTraps([]);
      setActiveStake(0);
      setActiveNetStake(0);
      setLastSummary(null);
      setErrorMsg(null);
    }
  }, [resetKey]);

  useEffect(() => {
    const targetIdx = currentLane + 1;
    const targetEl = laneRefs.current[Math.min(targetIdx, difficulty.multipliers.length - 1)];
    if (phase === 'running' && targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [currentLane, phase, difficulty.multipliers.length]);

  // Chicken Road arcade background music lifecycle
  useEffect(() => {
    if (!soundEnabled || !musicEnabled) {
      stopChickenRoadBgMusic();
      return;
    }

    startChickenRoadBgMusic();

    const unlockAudio = () => {
      if (soundEnabled && musicEnabled) {
        startChickenRoadBgMusic();
      }
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      stopChickenRoadBgMusic();
    };
  }, [soundEnabled, musicEnabled]);

  // Occasional subtle highway car horn while actively crossing
  useEffect(() => {
    if (phase !== 'running' || !soundEnabled) return;
    const timer = window.setInterval(() => {
      if (Math.random() < 0.6) {
        playCarHornSound(true);
      }
    }, 4800);
    return () => window.clearInterval(timer);
  }, [phase, soundEnabled]);

  const currentMultiplier =
    currentLane >= 0 ? (difficulty.multipliers[currentLane] ?? 1) : 1;
  const nextLaneIndex = currentLane + 1;
  const nextMultiplier =
    nextLaneIndex >= 0 && nextLaneIndex < difficulty.multipliers.length
      ? (difficulty.multipliers[nextLaneIndex] ?? null)
      : null;

  const liveCashoutAmount =
    phase === 'running' && currentLane >= 0
      ? roundCurrency(activeNetStake * currentMultiplier)
      : 0;

  const finishWithWin = (laneIdx: number, stakeVal: number, netStakeVal: number) => {
    const mult = difficulty.multipliers[laneIdx] ?? 1;
    const rawPayout = roundCurrency(netStakeVal * mult);
    const nextStreak = winStreakRef.current + 1;
    winStreakRef.current = nextStreak;
    setWinStreak(nextStreak);

    const streakCutRate = getWinStreakCutRate(nextStreak);
    const finalPayout =
      streakCutRate > 0 ? roundCurrency(rawPayout * (1 - streakCutRate)) : rawPayout;
    const net = roundCurrency(finalPayout - stakeVal);

    onBalanceChange(finalPayout);
    playChickenWinSound(soundEnabled);

    setCurrentLane(laneIdx);
    setPhase('cashed_out');
    setLastSummary({
      outcome: 'won',
      staked: stakeVal,
      netStake: netStakeVal,
      payout: finalPayout,
      net,
      multiplier: mult,
      laneReached: laneIdx + 1,
      winStreak: nextStreak,
      streakCutRate,
    });

    setHistory((prev) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          difficultyLabel: difficulty.label,
          stake: stakeVal,
          netStake: netStakeVal,
          laneReached: laneIdx + 1,
          totalLanes: difficulty.multipliers.length,
          multiplier: mult,
          payout: finalPayout,
          net,
          outcome: 'won' as const,
          time: new Date().toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        },
        ...prev,
      ].slice(0, 10)
    );
  };

  const handleStartCrossing = async () => {
    if (serverBusy) return;
    setErrorMsg(null);
    if (!Number.isFinite(parsedStake) || parsedStake < 1) {
      setErrorMsg('Minimum bet is 1 DC.');
      return;
    }
    if (hasBetCap && parsedStake > maxBetLimit) {
      setErrorMsg(`Max bet limit is ${formatCurrency(maxBetLimit)} DC per crossing.`);
      return;
    }
    if (parsedStake > demoBalance) {
      setErrorMsg(
        `Insufficient balance. Lower bet or wait for ${hasBetCap ? '24h Claim 10K' : '1h Claim 1Cr'}.`
      );
      return;
    }

    if (onServerStart) {
      setServerBusy(true);
      try {
        const res = await onServerStart(difficultyId, parsedStake);
        if (!res.ok) {
          setErrorMsg(res.error || 'Could not start crossing.');
          return;
        }
        playChickenStartSound(soundEnabled);
        setActiveStake(res.stake ?? parsedStake);
        setActiveNetStake(res.netStake ?? roundCurrency(parsedStake * (1 - FEE_RATE)));
        setTraps([]);
        setCurrentLane(-1);
        setHopTick((t) => t + 1);
        setLastSummary(null);
        setPhase('running');
      } finally {
        setServerBusy(false);
      }
      return;
    }

    const netStake = roundCurrency(parsedStake * (1 - FEE_RATE));
    const generatedTraps = generateTraps(difficulty.multipliers.length, difficulty.trapChance);

    onBalanceChange(-parsedStake);
    playChickenStartSound(soundEnabled);

    setActiveStake(parsedStake);
    setActiveNetStake(netStake);
    setTraps(generatedTraps);
    setCurrentLane(-1);
    setHopTick((t) => t + 1);
    setLastSummary(null);
    setPhase('running');
  };

  const handleStepNext = async () => {
    if (phase !== 'running' || serverBusy) return;
    const targetIdx = currentLane + 1;
    if (targetIdx >= difficulty.multipliers.length) return;

    if (onServerStep) {
      setServerBusy(true);
      try {
        const res = await onServerStep();
        if (!res.ok) {
          setErrorMsg(res.error || 'Could not advance lane.');
          return;
        }
        if (res.outcome === 'crashed') {
          playCrashSound(soundEnabled);
          playChickenLaughSound(soundEnabled);
          winStreakRef.current = 0;
          setWinStreak(0);
          if (res.traps) setTraps(res.traps);
          setCurrentLane(res.laneIndex ?? targetIdx);
          setPhase('crashed');
          const net = res.net ?? roundCurrency(-activeStake);
          const mult = res.multiplier ?? difficulty.multipliers[targetIdx];
          setLastSummary({
            outcome: 'crashed',
            staked: activeStake,
            netStake: activeNetStake,
            payout: 0,
            net,
            multiplier: mult,
            laneReached: res.laneReached ?? targetIdx + 1,
            winStreak: 0,
            streakCutRate: 0,
          });
          setHistory((prev) =>
            [
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                difficultyLabel: difficulty.label,
                stake: activeStake,
                netStake: activeNetStake,
                laneReached: res.laneReached ?? targetIdx + 1,
                totalLanes: difficulty.multipliers.length,
                multiplier: 0,
                payout: 0,
                net,
                outcome: 'crashed' as const,
                time: new Date().toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
              },
              ...prev,
            ].slice(0, 10)
          );
          return;
        }

        setHopTick((t) => t + 1);
        if (res.outcome === 'won') {
          playChickenWinSound(soundEnabled);
          const nextStreak = res.winStreak ?? winStreakRef.current + 1;
          winStreakRef.current = nextStreak;
          setWinStreak(nextStreak);
          if (res.traps) setTraps(res.traps);
          setCurrentLane(res.laneIndex ?? targetIdx);
          setPhase('cashed_out');
          const payout = res.payout ?? 0;
          const net = res.net ?? roundCurrency(payout - activeStake);
          const mult = res.multiplier ?? difficulty.multipliers[targetIdx];
          setLastSummary({
            outcome: 'won',
            staked: activeStake,
            netStake: activeNetStake,
            payout,
            net,
            multiplier: mult,
            laneReached: res.laneReached ?? targetIdx + 1,
            winStreak: nextStreak,
            streakCutRate: res.streakCutRate ?? 0,
          });
          setHistory((prev) =>
            [
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                difficultyLabel: difficulty.label,
                stake: activeStake,
                netStake: activeNetStake,
                laneReached: res.laneReached ?? targetIdx + 1,
                totalLanes: difficulty.multipliers.length,
                multiplier: mult,
                payout,
                net,
                outcome: 'won' as const,
                time: new Date().toLocaleTimeString('en-US', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
              },
              ...prev,
            ].slice(0, 10)
          );
          return;
        }

        playHopSound(soundEnabled);
        playBarrierSound(soundEnabled);
        setCurrentLane(res.laneIndex ?? targetIdx);
      } finally {
        setServerBusy(false);
      }
      return;
    }

    const hitTrap = traps[targetIdx];
    if (hitTrap) {
      playCrashSound(soundEnabled);
      playChickenLaughSound(soundEnabled);
      winStreakRef.current = 0;
      setWinStreak(0);
      setCurrentLane(targetIdx);
      setPhase('crashed');

      const net = roundCurrency(-activeStake);
      setLastSummary({
        outcome: 'crashed',
        staked: activeStake,
        netStake: activeNetStake,
        payout: 0,
        net,
        multiplier: difficulty.multipliers[targetIdx],
        laneReached: targetIdx + 1,
        winStreak: 0,
        streakCutRate: 0,
      });

      setHistory((prev) =>
        [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            difficultyLabel: difficulty.label,
            stake: activeStake,
            netStake: activeNetStake,
            laneReached: targetIdx + 1,
            totalLanes: difficulty.multipliers.length,
            multiplier: 0,
            payout: 0,
            net,
            outcome: 'crashed' as const,
            time: new Date().toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          },
          ...prev,
        ].slice(0, 10)
      );
      return;
    }

    setHopTick((t) => t + 1);
    if (targetIdx === difficulty.multipliers.length - 1) {
      finishWithWin(targetIdx, activeStake, activeNetStake);
    } else {
      playHopSound(soundEnabled);
      playBarrierSound(soundEnabled);
      setCurrentLane(targetIdx);
    }
  };

  const handleCashOut = async () => {
    if (phase !== 'running' || currentLane < 0 || serverBusy) return;
    if (onServerCashOut) {
      setServerBusy(true);
      try {
        const res = await onServerCashOut();
        if (!res.ok) {
          setErrorMsg(res.error || 'Could not cash out.');
          return;
        }
        playChickenWinSound(soundEnabled);
        const nextStreak = res.winStreak ?? winStreakRef.current + 1;
        winStreakRef.current = nextStreak;
        setWinStreak(nextStreak);
        if (res.traps) setTraps(res.traps);
        setPhase('cashed_out');
        const payout = res.payout ?? 0;
        const net = res.net ?? roundCurrency(payout - activeStake);
        const mult = res.multiplier ?? currentMultiplier;
        setLastSummary({
          outcome: 'won',
          staked: activeStake,
          netStake: activeNetStake,
          payout,
          net,
          multiplier: mult,
          laneReached: res.laneReached ?? currentLane + 1,
          winStreak: nextStreak,
          streakCutRate: res.streakCutRate ?? 0,
        });
        setHistory((prev) =>
          [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              difficultyLabel: difficulty.label,
              stake: activeStake,
              netStake: activeNetStake,
              laneReached: res.laneReached ?? currentLane + 1,
              totalLanes: difficulty.multipliers.length,
              multiplier: mult,
              payout,
              net,
              outcome: 'won' as const,
              time: new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
            },
            ...prev,
          ].slice(0, 10)
        );
      } finally {
        setServerBusy(false);
      }
      return;
    }
    finishWithWin(currentLane, activeStake, activeNetStake);
  };

  const handleSelectDifficulty = (id: ChickenDifficultyId) => {
    if (phase === 'running') return;
    playClickSound(soundEnabled);
    setDifficultyId(id);
    setTraps([]);
    setCurrentLane(-1);
    setLastSummary(null);
    setPhase('idle');
    setErrorMsg(null);
  };

  const handleQuickStake = (amount: number) => {
    if (phase === 'running') return;
    playClickSound(soundEnabled);
    setStakeInput(String(hasBetCap ? Math.min(maxBetLimit, amount) : amount));
    setErrorMsg(null);
  };

  const handleMaxStake = () => {
    if (phase === 'running') return;
    playClickSound(soundEnabled);
    const maxAllowed = Math.floor(hasBetCap ? Math.min(maxBetLimit, demoBalance) : demoBalance);
    setStakeInput(String(Math.max(10, maxAllowed)));
    setErrorMsg(null);
  };

  const showAllTraps = phase === 'crashed' || phase === 'cashed_out';

  return (
    <section id="chicken-road" className="mx-auto w-full max-w-[460px] space-y-3">
      {/* Mobile-First Game Shell */}
      <div className="rounded-2xl border border-slate-200 bg-slate-900 p-3 text-white shadow-lg">
        {/* Top Bar: Help + Title + Online */}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                playClickSound(soundEnabled);
                setShowRulesDrawer((prev) => !prev);
              }}
              aria-expanded={showRulesDrawer}
              title="Chicken Road Rules"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-400/50 bg-amber-500/20 text-amber-200 transition-colors hover:bg-amber-500/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="min-w-0">
              <h2 className="font-display text-sm font-extrabold tracking-tight text-white truncate">
                Chicken Road
              </h2>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
                <span>{difficulty.label}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-bold text-amber-300 tabular-nums">
                  Max {difficulty.multipliers[difficulty.multipliers.length - 1]}x
                </span>
                {winStreak > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-bold text-emerald-300 tabular-nums">
                      x{winStreak}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                playClickSound(soundEnabled);
                setMusicEnabled((prev) => !prev);
              }}
              aria-pressed={soundEnabled && musicEnabled}
              title={
                !soundEnabled
                  ? 'Unmute global sound first'
                  : musicEnabled
                    ? 'Turn off Chicken Road background music'
                    : 'Turn on Chicken Road background music'
              }
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 ${
                soundEnabled && musicEnabled
                  ? 'border-amber-400/45 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25'
                  : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Music className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{soundEnabled && musicEnabled ? 'Music On' : 'Music Off'}</span>
            </button>

            {typeof onlineCount === 'number' && (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/35 bg-emerald-500/15 px-2 py-1 font-mono text-[11px] font-bold text-emerald-200 tabular-nums shrink-0">
                <Users className="h-3 w-3 text-emerald-300 shrink-0" aria-hidden="true" />
                <span>{onlineCount.toLocaleString()}</span>
              </span>
            )}
          </div>
        </div>

        {/* Collapsible Quick Rules Drawer */}
        {showRulesDrawer && (
          <div className="mb-2.5 rounded-xl border border-slate-700 bg-white p-3 text-slate-900 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="font-display text-xs font-bold text-slate-900">
                Chicken Road Rules
              </h3>
              <div className="flex items-center gap-2.5">
                {onShowRules && (
                  <button
                    type="button"
                    onClick={onShowRules}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    Full Rules
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    playClickSound(soundEnabled);
                    setShowRulesDrawer(false);
                  }}
                  aria-label="Close Chicken Road Rules"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-1.5 text-[11px]">
              <div className="rounded-lg bg-emerald-50 px-2.5 py-1.5">
                <span className="font-bold text-emerald-800">Stop Cars &amp; Cross:</span>{' '}
                <span className="text-slate-600">
                  Har safe lane par barrier car ko rokta hai. Car hit hone se pehle Cash Out karein.
                </span>
              </div>
              <div className="rounded-lg bg-rose-50 px-2.5 py-1.5">
                <span className="font-bold text-rose-800">
                  {hasBetCap ? '30% Cut · Max 25K:' : '30% Cut · No Bet Limit:'}
                </span>{' '}
                <span className="text-slate-600">
                  Net 70% stake multiply hota hai. Lagatar 2–5 wins par 9% aur 6+ par 50% cut lagta hai.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Multi-Lane Highway Board with Live Driving Cars */}
        <div className="relative overflow-hidden rounded-xl border-2 border-slate-700 bg-[#1B2230] shadow-inner">
          {/* Top Highway Guardrail */}
          <div className="flex items-center justify-between border-b border-slate-700/80 bg-[#131924] px-2.5 py-1 text-[10px] font-semibold text-slate-300">
            <span>Start</span>
            <span className="font-mono tabular-nums text-amber-300">
              {phase === 'running'
                ? currentLane >= 0
                  ? `Lane ${currentLane + 1}/${difficulty.multipliers.length} · ${currentMultiplier.toFixed(2)}x`
                  : `Tap GO · Next ${nextMultiplier?.toFixed(2)}x`
                : difficulty.summary}
            </span>
            <span>Finish</span>
          </div>

          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max items-stretch">
              {/* Left Grass / Sidewalk Start Pad */}
              <div className="flex w-[76px] shrink-0 flex-col items-center justify-between border-r-4 border-amber-400/80 bg-gradient-to-b from-emerald-800 to-emerald-950 px-1.5 py-3">
                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-200">
                  Curb
                </span>

                <div className="flex h-16 items-center justify-center">
                  {currentLane === -1 && phase !== 'crashed' ? (
                    <ChickenSprite key={`curb-${hopTick}`} hopping={phase === 'running'} />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-900/60 text-emerald-200">
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                  )}
                </div>

                <span className="font-mono text-[10px] font-bold text-emerald-200 tabular-nums">
                  1.00x
                </span>
              </div>

              {/* Asphalt Traffic Lanes with Moving Cars */}
              {difficulty.multipliers.map((mult, idx) => {
                const isCleared = idx < currentLane || (idx === currentLane && phase !== 'crashed');
                const isChickenHere = idx === currentLane;
                const isNextStep = phase === 'running' && idx === currentLane + 1;
                const isTrap = traps[idx] === true;
                const revealTrap = showAllTraps && isTrap && !isChickenHere;
                const revealSafe = showAllTraps && !isTrap && idx > currentLane;
                const showAmbientTraffic =
                  !isCleared && !(isChickenHere && phase === 'crashed') && !showAllTraps;

                const carSpeed = LANE_SPEEDS[idx % LANE_SPEEDS.length];
                const carDelay = LANE_DELAYS[idx % LANE_DELAYS.length];

                return (
                  <button
                    key={`${difficulty.id}-${idx}`}
                    ref={(el) => {
                      laneRefs.current[idx] = el;
                    }}
                    type="button"
                    disabled={!isNextStep}
                    onClick={isNextStep ? handleStepNext : undefined}
                    aria-label={`Lane ${idx + 1}, ${mult.toFixed(2)}x multiplier`}
                    className={`group relative flex min-h-[214px] w-[78px] shrink-0 flex-col items-center justify-between overflow-hidden border-r border-dashed border-slate-500/70 px-1 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                      isChickenHere && phase === 'crashed'
                        ? 'bg-rose-950/90'
                        : isNextStep
                          ? 'cursor-pointer bg-slate-800 hover:bg-slate-700/95'
                          : isCleared
                            ? 'bg-[#172A2B]'
                            : 'cursor-default bg-[#1E2636]'
                    }`}
                  >
                    {/* Center Asphalt Dashed Markings */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 border-l-2 border-dashed border-slate-600/45"
                    />

                    {/* Crosswalk Stripes at Chicken Crossing Level */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-1.5 top-[56%] flex h-7 -translate-y-1/2 justify-between opacity-25"
                    >
                      <span className="h-full w-2 rounded-xs bg-white" />
                      <span className="h-full w-2 rounded-xs bg-white" />
                      <span className="h-full w-2 rounded-xs bg-white" />
                    </div>

                    {/* Ambient Oncoming Cars Driving Down Active/Upcoming Lanes */}
                    {showAmbientTraffic && (
                      <div
                        aria-hidden="true"
                        style={
                          {
                            '--cr-speed': carSpeed,
                            '--cr-delay': carDelay,
                          } as React.CSSProperties
                        }
                        className="pointer-events-none absolute top-0 left-1/2 z-0 -translate-x-1/2 animate-cr-car-drive"
                      >
                        <CarSprite
                          variantIndex={idx}
                          isTruck={idx % 4 === 3}
                          className="h-14 w-9 opacity-90"
                        />
                      </div>
                    )}

                    {/* Speeding Car Slamming Into Chicken on Crash */}
                    {isChickenHere && phase === 'crashed' && (
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute top-0 left-1/2 z-20 -translate-x-1/2 animate-cr-car-hit"
                      >
                        <CarSprite
                          variantIndex={idx}
                          isTruck={idx % 3 === 1}
                          className="h-16 w-10 drop-shadow-lg"
                        />
                      </div>
                    )}

                    {/* Top Lane Sign OR Blocked Car Behind Barrier */}
                    <div className="relative z-10 flex min-h-[38px] w-full flex-col items-center justify-start">
                      <span
                        className={`font-mono text-[9px] font-bold tabular-nums ${
                          isNextStep
                            ? 'text-amber-300'
                            : isCleared
                              ? 'text-emerald-300'
                              : 'text-slate-400'
                        }`}
                      >
                        L{idx + 1}
                      </span>

                      {isCleared && (
                        <div className="mt-0.5 flex flex-col items-center animate-cr-barrier-drop">
                          <div className="h-2.5 w-7 rounded-t-md border border-slate-900 bg-slate-500/80" />
                          <div
                            className="h-2 w-12 rounded-xs border border-slate-950 shadow-sm"
                            style={{
                              backgroundImage:
                                'repeating-linear-gradient(-45deg, #FACC15 0 5px, #0F172A 5px 10px)',
                            }}
                          />
                        </div>
                      )}

                      {revealTrap && (
                        <div className="mt-1 flex flex-col items-center">
                          <CarSprite
                            variantIndex={idx}
                            isTruck={idx % 4 === 3}
                            className="h-12 w-8 drop-shadow-md"
                          />
                        </div>
                      )}
                    </div>

                    {/* Center Crossing Zone */}
                    <div className="relative z-10 flex h-20 w-full flex-col items-center justify-center">
                      {isChickenHere ? (
                        <div className="relative flex flex-col items-center">
                          {phase === 'crashed' && (
                            <span className="mb-0.5 rounded-full border border-slate-900 bg-amber-300 px-2 py-0.5 text-[9px] font-extrabold tracking-wide text-slate-950 shadow-sm animate-cr-haha-pop">
                              HAHA!
                            </span>
                          )}
                          <ChickenSprite
                            key={`lane-${idx}-${hopTick}`}
                            laughing={phase === 'crashed'}
                            hopping={phase === 'running'}
                          />
                        </div>
                      ) : revealTrap ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-rose-600/90 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                          <Car className="h-2.5 w-2.5" aria-hidden="true" />
                          Trap
                        </span>
                      ) : isCleared ? (
                        <div className="flex flex-col items-center gap-0.5 rounded-md border border-emerald-400/40 bg-emerald-950/75 px-1.5 py-0.5">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden="true" />
                          <span className="text-[9px] font-bold text-emerald-200">Safe</span>
                        </div>
                      ) : (
                        <div
                          className={`flex h-11 w-11 items-center justify-center rounded-full border-2 font-mono text-[11px] font-extrabold tabular-nums transition-transform shadow-md ${
                            isNextStep
                              ? 'scale-105 border-amber-200 bg-amber-400 text-slate-950 ring-4 ring-amber-400/30 group-hover:scale-110'
                              : revealSafe
                                ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                                : 'border-slate-500/90 bg-slate-900/90 text-slate-100'
                          }`}
                        >
                          {mult >= 10 ? `${mult.toFixed(0)}x` : `${mult.toFixed(2)}x`}
                        </div>
                      )}
                    </div>

                    {/* Bottom Multiplier Plate */}
                    <span
                      className={`relative z-10 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-extrabold tabular-nums ${
                        isChickenHere && phase === 'crashed'
                          ? 'bg-rose-600 text-white'
                          : isCleared
                            ? 'bg-emerald-500/30 text-emerald-200'
                            : isNextStep
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-slate-900/90 text-slate-200'
                      }`}
                    >
                      {mult.toFixed(2)}x
                    </span>
                  </button>
                );
              })}

              {/* Right Checkered Finish Curb */}
              <div className="flex w-[76px] shrink-0 flex-col items-center justify-between border-l-4 border-amber-400/80 bg-gradient-to-b from-amber-600/35 to-amber-900/50 px-1.5 py-3">
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-200">
                  Finish
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-300 bg-amber-400/20 text-amber-300">
                  <Trophy className="h-5 w-5" aria-hidden="true" />
                </div>
                <span className="font-mono text-[10px] font-extrabold text-amber-200 tabular-nums">
                  {difficulty.multipliers[difficulty.multipliers.length - 1].toFixed(2)}x
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Status / Result Feedback Banner */}
        {phase === 'running' && (
          <div
            role="status"
            className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-bold text-amber-100"
          >
            <span>
              Stake {formatCurrency(activeStake)} (Net {formatCurrency(activeNetStake)})
            </span>
            <span className="font-mono tabular-nums text-emerald-300">
              {currentLane >= 0
                ? `Win: ${formatCurrency(liveCashoutAmount)} (${currentMultiplier.toFixed(2)}x)`
                : `Tap GO (${nextMultiplier?.toFixed(2)}x)`}
            </span>
          </div>
        )}

        {lastSummary && phase !== 'running' && (
          <div
            role="status"
            className={`mt-2.5 flex flex-wrap items-center justify-between gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-bold ${
              lastSummary.outcome === 'won'
                ? 'border-emerald-400/45 bg-emerald-500/20 text-emerald-200'
                : 'border-rose-400/40 bg-rose-500/15 text-rose-200'
            }`}
          >
            <span>
              {lastSummary.outcome === 'won'
                ? `Cashed Out at ${lastSummary.multiplier.toFixed(2)}x`
                : `Hit by Car on L${lastSummary.laneReached}`}
              {lastSummary.streakCutRate > 0
                ? ` · Streak ${Math.round(lastSummary.streakCutRate * 100)}% Cut`
                : ''}
            </span>
            <span className="font-mono tabular-nums">
              {lastSummary.outcome === 'won'
                ? `+${formatCurrency(lastSummary.payout)} DC`
                : `-${formatCurrency(lastSummary.staked)} DC`}
            </span>
          </div>
        )}

        {/* Mobile Action, Difficulty & Stake Controls Inside the Same Card */}
        <div className="mt-2.5 space-y-2.5 rounded-xl border border-slate-700/80 bg-slate-800/70 p-2.5">
          {errorMsg && (
            <p
              role="alert"
              className="rounded-lg border border-rose-400/50 bg-rose-950/70 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200"
            >
              {errorMsg}
            </p>
          )}

          {/* Primary Action Buttons (Directly Above Easy/Medium Difficulty Row) */}
          {phase === 'running' ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={currentLane < 0}
                onClick={handleCashOut}
                className={`inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs sm:text-sm font-extrabold shadow-sm transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                  currentLane >= 0
                    ? 'bg-amber-400 text-slate-950 hover:bg-amber-300 active:scale-[0.98]'
                    : 'cursor-not-allowed border border-slate-700 bg-slate-900/70 text-slate-400'
                }`}
              >
                <Coins className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {currentLane >= 0
                    ? `Cash Out ${formatCurrency(liveCashoutAmount)}`
                    : 'Step 1 First'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleStepNext}
                className="inline-flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs sm:text-sm font-extrabold text-slate-950 shadow-sm transition-colors hover:bg-emerald-400 active:scale-[0.98] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              >
                <span>
                  GO {nextMultiplier ? `· ${nextMultiplier.toFixed(2)}x` : ''}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleStartCrossing}
              className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-extrabold text-slate-950 shadow-sm transition-colors hover:bg-emerald-400 active:scale-[0.98] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              {phase === 'idle' ? (
                <Play className="h-4 w-4 shrink-0 fill-current" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
              <span>
                {phase === 'idle' ? 'Start Crossing' : 'Play Again'} ·{' '}
                {formatCurrency(parsedStake)} DC
              </span>
            </button>
          )}

          {/* 4-Column Difficulty Row */}
          <div className="grid grid-cols-4 gap-1 rounded-lg bg-slate-900/90 p-1">
            {DIFFICULTIES.map((diff) => {
              const active = diff.id === difficultyId;
              return (
                <button
                  key={diff.id}
                  type="button"
                  disabled={phase === 'running'}
                  onClick={() => handleSelectDifficulty(diff.id)}
                  className={`min-h-[36px] rounded-md px-1.5 py-1 text-[11px] font-bold transition-colors whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? 'bg-amber-400 text-slate-950 shadow-xs'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {diff.label}
                </button>
              );
            })}
          </div>

          {/* Bet Input + Max + Quick Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <label htmlFor="chicken-stake" className="font-bold text-white">
                {hasBetCap ? 'Bet (Max 25K)' : 'Bet (No Limit)'}
              </label>
              <span className="font-mono tabular-nums text-slate-300">
                Net 70%: {formatCurrency(previewNetStake)}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  id="chicken-stake"
                  type="number"
                  min={1}
                  max={hasBetCap ? maxBetLimit : undefined}
                  step="10"
                  disabled={phase === 'running'}
                  value={stakeInput}
                  onChange={(e) => {
                    setStakeInput(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  className="h-10 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 pr-14 font-mono text-sm font-bold text-white tabular-nums focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 disabled:opacity-60"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                  DC
                </span>
              </div>

              <button
                type="button"
                disabled={phase === 'running'}
                onClick={handleMaxStake}
                className="h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-xs font-bold text-amber-300 hover:bg-slate-700 whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                Max
              </button>
            </div>

            <div className="grid grid-cols-6 gap-1">
              {QUICK_STAKES.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  disabled={phase === 'running'}
                  onClick={() => handleQuickStake(amt)}
                  className={`min-h-[34px] rounded-md border px-1 py-1 font-mono text-[11px] font-bold tabular-nums transition-colors disabled:opacity-50 ${
                    parsedStake === amt
                      ? 'border-amber-400 bg-amber-400 text-slate-950'
                      : 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {amt >= 1000 ? `${amt / 1000}K` : amt}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-emerald-400/35 bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-amber-500/20 px-2.5 py-1.5 text-[11px] text-emerald-100">
              <span className="font-semibold">{playerLabel || 'OG_PLAYER'}</span>
              <span className="font-mono font-extrabold text-amber-300 tabular-nums">
                {formatCurrency(demoBalance)} DC
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Crossings History */}
      {history.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-xs font-bold text-slate-900">
              Recent Crossings
            </h3>
            <span className="text-[11px] text-slate-500">Last {history.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-1.5 font-medium">Mode</th>
                  <th className="py-1.5 font-medium">Lane</th>
                  <th className="py-1.5 font-medium text-right">Stake</th>
                  <th className="py-1.5 font-medium text-right">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="py-1.5 font-semibold text-slate-800">
                      {item.difficultyLabel}
                    </td>
                    <td className="py-1.5 font-mono tabular-nums text-slate-700">
                      {item.outcome === 'won' ? (
                        <span className="inline-flex items-center gap-1 font-bold text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          L{item.laneReached} · {item.multiplier.toFixed(2)}x
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-600">
                          <Car className="h-3 w-3" aria-hidden="true" />
                          Hit L{item.laneReached}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-slate-700">
                      {formatCurrency(item.stake)}
                    </td>
                    <td
                      className={`py-1.5 text-right font-mono font-bold tabular-nums ${
                        item.outcome === 'won' ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {item.outcome === 'won'
                        ? `+${formatCurrency(item.payout)}`
                        : `-${formatCurrency(item.stake)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
