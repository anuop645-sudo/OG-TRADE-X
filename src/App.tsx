import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Dices,
  Download,
  ExternalLink,
  Gift,
  KeyRound,
  LogOut,
  Palette,
  Route,
  ShieldCheck,
  User,
  Volume2,
  VolumeX,
  Wallet,
  X,
} from 'lucide-react';
import { AdminPanel } from './components/AdminPanel';
import {
  ChickenDifficultyId,
  ChickenRoadGame,
  ChickenServerCashOutResult,
  ChickenServerStartResult,
  ChickenServerStepResult,
} from './components/ChickenRoadGame';
import { GuestLogin } from './components/GuestLogin';
import { HistoryLedger } from './components/HistoryLedger';
import {
  JhandiMundaGame,
  JhandiRollResult,
  JhandiSymbolId,
} from './components/JhandiMundaGame';
import { RulesSection } from './components/RulesSection';
import { TopBar } from './components/TopBar';
import { TradingDesk } from './components/TradingDesk';
import { OperationType, auth, buildFirestoreErrorInfo, db } from './firebase';
import { useYouTubeBgMusic } from './hooks/useYouTubeBgMusic';
import {
  DemoOrder,
  MarketId,
  RoundResult,
  SelectionType,
  SettlementBanner,
  UserProfile,
} from './types/trading';
import { ApiError, apiRequest } from './utils/apiClient';
import {
  ActiveAuthSession,
  StoredAccountWallet,
  VIP_HOURLY_BONUS_COINS,
  VIP_HOURLY_COOLDOWN_MS,
  applyVipHourlyDropIfEligible,
  changeMobileAccountPassword,
  isVipUnlimitedMobile,
  loadActiveSession,
  loadGuestWallet,
  loadMobileAccounts,
  saveActiveSession,
  saveGuestWallet,
  saveMobileWallet,
} from './utils/mobileAuth';
import {
  playClickSound,
  playOrderSound,
  playSettleSound,
  playTickSound,
  playWinSound,
} from './utils/soundFx';
import {
  FEE_RATE,
  INITIAL_DEMO_BALANCE,
  MARKETS,
  MAX_BET_LIMIT,
  RESET_COOLDOWN_MS,
  formatCurrency,
  formatPeriodId,
  formatRemainingCooldown,
  generateSeedHistory,
  getColoursForNumber,
  getInitialSequenceForMarket,
  getSizeForNumber,
  getWinStreakCutRate,
  roundCurrency,
  settleRoundOrders,
} from './utils/tradingEngine';

const INSTAGRAM_FOLLOW_URL =
  'https://www.instagram.com/shobhanrahul?xtok=MWZjcXE5N3B3a2ppcw==';
const FOLLOW_BONUS_COINS = 10000;

interface MarketRuntime {
  sequence: number;
  endTimeMs: number;
}

function buildInitialRuntimes(): Record<MarketId, MarketRuntime> {
  const now = Date.now();
  return {
    '30s': {
      sequence: getInitialSequenceForMarket('30s'),
      endTimeMs: now + 30 * 1000,
    },
    '1m': {
      sequence: getInitialSequenceForMarket('1m'),
      endTimeMs: now + 60 * 1000,
    },
    '3m': {
      sequence: getInitialSequenceForMarket('3m'),
      endTimeMs: now + 180 * 1000,
    },
    '5m': {
      sequence: getInitialSequenceForMarket('5m'),
      endTimeMs: now + 300 * 1000,
    },
  };
}

function buildInitialResults(): Record<MarketId, RoundResult[]> {
  return {
    '30s': generateSeedHistory('30s', 50),
    '1m': generateSeedHistory('1m', 50),
    '3m': generateSeedHistory('3m', 50),
    '5m': generateSeedHistory('5m', 50),
  };
}

function getInitialWalletState(session: ActiveAuthSession | null): {
  balance: number;
  orders: DemoOrder[];
  lastResetAtMs: number;
  followBonusClaimed: boolean;
} {
  if (session?.mode === 'mobile') {
    const accounts = loadMobileAccounts();
    const existing = accounts[session.mobile];
    if (existing) {
      const { wallet } = applyVipHourlyDropIfEligible(session.mobile, existing);
      return {
        balance: wallet.balance,
        orders: wallet.orders,
        lastResetAtMs: wallet.lastResetAtMs,
        followBonusClaimed: wallet.followBonusClaimed,
      };
    }
  }
  if (session?.mode === 'guest') {
    const guest = loadGuestWallet();
    return {
      balance: guest.balance,
      orders: guest.orders,
      lastResetAtMs: guest.lastResetAtMs,
      followBonusClaimed: guest.followBonusClaimed,
    };
  }
  return {
    balance: INITIAL_DEMO_BALANCE,
    orders: [],
    lastResetAtMs: Date.now(),
    followBonusClaimed: false,
  };
}

export default function App() {
  const [authSession, setAuthSession] = useState<ActiveAuthSession | null>(loadActiveSession);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [firebaseAuthBusy, setFirebaseAuthBusy] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminCheckComplete, setAdminCheckComplete] = useState<boolean>(false);
  const [profileLoaded, setProfileLoaded] = useState<boolean>(false);
  const [adminViewOpen, setAdminViewOpen] = useState<boolean>(false);
  const [backendAlert, setBackendAlert] = useState<string | null>(null);
  const [bootstrapRetryCount, setBootstrapRetryCount] = useState<number>(0);
  const [firebaseDisplayName, setFirebaseDisplayName] = useState<string>('');
  const [firebasePublicUid, setFirebasePublicUid] = useState<string>('');
  const [firebaseReferralCode, setFirebaseReferralCode] = useState<string>('');
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [copiedPublicUid, setCopiedPublicUid] = useState<boolean>(false);

  const [initialWallet] = useState(() => getInitialWalletState(authSession));

  const [demoBalance, setDemoBalance] = useState<number>(initialWallet.balance);
  const [orders, setOrders] = useState<DemoOrder[]>(initialWallet.orders);
  const [lastResetAtMs, setLastResetAtMs] = useState<number>(initialWallet.lastResetAtMs);
  const [followBonusClaimed, setFollowBonusClaimed] = useState<boolean>(
    initialWallet.followBonusClaimed
  );
  const [followVisited, setFollowVisited] = useState<boolean>(false);

  const [changePwOpen, setChangePwOpen] = useState<boolean>(false);
  const [currentPw, setCurrentPw] = useState<string>('');
  const [newPw, setNewPw] = useState<string>('');
  const [confirmPw, setConfirmPw] = useState<string>('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState<boolean>(false);

  const [activeGame, setActiveGame] = useState<'colour' | 'jhandi' | 'chicken'>('colour');
  const [activeMarketId, setActiveMarketId] = useState<MarketId>('1m');
  const [resultsByMarket, setResultsByMarket] = useState<Record<MarketId, RoundResult[]>>(
    buildInitialResults
  );
  const [runtimes, setRuntimes] = useState<Record<MarketId, MarketRuntime>>(buildInitialRuntimes);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [lastBanner, setLastBanner] = useState<SettlementBanner | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState<number>(0);
  const [onlineCount, setOnlineCount] = useState<number>(
    () => 1240 + Math.floor(Math.random() * 85)
  );

  const isFirebaseSession = Boolean(firebaseUser);
  const isAuthenticated = Boolean(firebaseUser || authSession);

  const bgMusic = useYouTubeBgMusic({
    videoId: 'aOysIaPMKvE',
    active: isAuthenticated && !adminViewOpen && activeGame === 'jhandi',
    soundEnabled,
  });

  const firebaseUserRef = useRef<FirebaseUser | null>(firebaseUser);
  firebaseUserRef.current = firebaseUser;

  const ordersRef = useRef<DemoOrder[]>(orders);
  ordersRef.current = orders;

  const demoBalanceRef = useRef<number>(demoBalance);
  demoBalanceRef.current = demoBalance;

  const soundRef = useRef<boolean>(soundEnabled);
  soundRef.current = soundEnabled;

  const activeMarketRef = useRef<MarketId>(activeMarketId);
  activeMarketRef.current = activeMarketId;

  const activeGameRef = useRef<'colour' | 'jhandi' | 'chicken'>(activeGame);
  activeGameRef.current = activeGame;

  const runtimesRef = useRef<Record<MarketId, MarketRuntime>>(runtimes);
  runtimesRef.current = runtimes;

  const settledKeysRef = useRef<Set<string>>(new Set());
  const bootstrappedUidRef = useRef<string | null>(null);
  const lastTickSecRef = useRef<number>(-1);
  const colourWinStreakRef = useRef<number>(0);
  const jhandiWinStreakRef = useRef<number>(0);

  const applyBootstrappedProfile = useCallback(
    (payload: {
      uid: string;
      created?: boolean;
      isAdmin?: boolean;
      profile?: UserProfile;
      fallbackEmail?: string | null;
    }) => {
      bootstrappedUidRef.current = payload.uid;
      if (payload.profile && typeof payload.profile === 'object') {
        setDemoBalance(
          typeof payload.profile.balance === 'number' && Number.isFinite(payload.profile.balance)
            ? payload.profile.balance
            : INITIAL_DEMO_BALANCE
        );
        setLastResetAtMs(
          typeof payload.profile.lastResetAtMs === 'number' &&
            Number.isFinite(payload.profile.lastResetAtMs)
            ? payload.profile.lastResetAtMs
            : Date.now()
        );
        setFollowBonusClaimed(Boolean(payload.profile.followBonusClaimed));
        setFirebaseDisplayName(
          String(payload.profile.displayName || payload.fallbackEmail || 'OG Player')
        );
        setFirebasePublicUid(
          typeof payload.profile.publicUid === 'string' ? payload.profile.publicUid : ''
        );
        setFirebaseReferralCode(
          typeof payload.profile.referralCode === 'string' ? payload.profile.referralCode : ''
        );
        colourWinStreakRef.current = payload.profile.colourWinStreak || 0;
        jhandiWinStreakRef.current = payload.profile.jhandiWinStreak || 0;
        setProfileLoaded(true);
        setBackendAlert(null);
        if (payload.created) {
          setToastMessage(
            `Welcome ${payload.profile.displayName || 'OG Player'}! 10K DC synced to your Firebase wallet.`
          );
        }
      }
      if (typeof payload.isAdmin === 'boolean') {
        setIsAdmin(payload.isAdmin);
        setAdminCheckComplete(true);
      }
    },
    []
  );

  // Firebase Auth listener
  useEffect(() => {
    let mounted = true;
    void auth.authStateReady().then(() => {
      if (mounted) {
        setAuthReady(true);
      }
    });

    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        bootstrappedUidRef.current = null;
        setIsAdmin(false);
        setAdminCheckComplete(false);
        setProfileLoaded(false);
        setAdminViewOpen(false);
        setBackendAlert(null);
        setFirebaseDisplayName('');
        setFirebasePublicUid('');
        setFirebaseReferralCode('');
        setProfileModalOpen(false);
      }
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Bootstrap Firebase user profile + real-time Firestore listeners for wallet, admin role, and Colour Trade orders
  useEffect(() => {
    if (!authReady || !firebaseUser || firebaseAuthBusy) return;

    let cancelled = false;
    const alreadyBootstrapped =
      bootstrappedUidRef.current === firebaseUser.uid && bootstrapRetryCount === 0;
    if (!alreadyBootstrapped) {
      setIsAdmin(false);
      setAdminCheckComplete(false);
      setProfileLoaded(false);
      setAdminViewOpen(false);
    }
    setBackendAlert(null);

    if (!alreadyBootstrapped) {
      void auth.authStateReady().then(() => {
        if (cancelled || auth.currentUser?.uid !== firebaseUser.uid) return;
        return apiRequest<{
          ok?: boolean;
          created?: boolean;
          isAdmin?: boolean;
          profile?: UserProfile;
        }>('/api/user/bootstrap', {
          method: 'POST',
          body: { displayName: firebaseUser.displayName || '' },
        })
          .then((res) => {
            if (cancelled) return;
            applyBootstrappedProfile({
              uid: firebaseUser.uid,
              created: res?.created,
              isAdmin: res?.isAdmin,
              profile: res?.profile,
              fallbackEmail: firebaseUser.email,
            });
          })
          .catch((err) => {
            if (cancelled) return;
            const msg =
              err instanceof ApiError || err instanceof Error
                ? err.message
                : 'Unable to reach backend wallet validator.';
            setBackendAlert(msg);
          });
      });
    }

    const userDocRef = doc(db, 'users', firebaseUser.uid);
    const unsubUser = onSnapshot(
      userDocRef,
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data() ?? {};
        if (typeof d.balance === 'number' && Number.isFinite(d.balance)) setDemoBalance(d.balance);
        if (typeof d.lastResetAtMs === 'number' && Number.isFinite(d.lastResetAtMs)) {
          setLastResetAtMs(d.lastResetAtMs);
        }
        if (typeof d.followBonusClaimed === 'boolean') {
          setFollowBonusClaimed(d.followBonusClaimed);
        }
        if (typeof d.displayName === 'string') setFirebaseDisplayName(d.displayName);
        if (typeof d.publicUid === 'string' && d.publicUid) setFirebasePublicUid(d.publicUid);
        if (typeof d.referralCode === 'string' && d.referralCode) {
          setFirebaseReferralCode(d.referralCode);
        }
        if (typeof d.colourWinStreak === 'number') {
          colourWinStreakRef.current = d.colourWinStreak;
        }
        if (typeof d.jhandiWinStreak === 'number') {
          jhandiWinStreakRef.current = d.jhandiWinStreak;
        }
        setProfileLoaded(true);
      },
      (error) => {
        const info = buildFirestoreErrorInfo(error, OperationType.GET, `users/${firebaseUser.uid}`);
        console.warn('User profile listener warning:', info.error);
      }
    );

    const adminDocRef = doc(db, 'admins', firebaseUser.uid);
    const unsubAdmin = onSnapshot(
      adminDocRef,
      (snap) => {
        const adminActive = snap.exists() && snap.data()?.role === 'admin';
        setIsAdmin(adminActive);
        setAdminCheckComplete(true);
        if (!adminActive) {
          setAdminViewOpen(false);
        }
      },
      (error) => {
        const info = buildFirestoreErrorInfo(error, OperationType.GET, `admins/${firebaseUser.uid}`);
        console.warn('Admin verification listener warning:', info.error);
        setIsAdmin(false);
        setAdminCheckComplete(true);
        setAdminViewOpen(false);
      }
    );

    const historyQuery = query(
      collection(db, 'users', firebaseUser.uid, 'gameHistory'),
      where('uid', '==', firebaseUser.uid),
      limit(60)
    );
    const unsubOrders = onSnapshot(
      historyQuery,
      (snap) => {
        const list: Array<{ createdAtMs: number; order: DemoOrder }> = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data() ?? {};
          if (d.game !== 'colour' || d.status === 'cancelled') return;
          if (!d.selectionPayload || typeof d.selectionPayload !== 'object') return;
          const createdAtMs = typeof d.createdAtMs === 'number' ? d.createdAtMs : 0;
          list.push({
            createdAtMs,
            order: {
              id: docSnap.id,
              periodId: String(d.periodId || ''),
              marketId: (d.marketId || '1m') as MarketId,
              selection: d.selectionPayload as SelectionType,
              stake: Number(d.stake || 0),
              multiplier: Number(d.multiplier || 1),
              totalAmount: Number(d.totalAmount || 0),
              fee: Number(d.fee || 0),
              contractAmount: Number(d.contractAmount || 0),
              status:
                d.status === 'won' || d.status === 'lost' ? d.status : 'pending',
              payout: Number(d.payout || 0),
              netProfit: Number(d.netProfit || 0),
              createdAt: createdAtMs
                ? new Date(createdAtMs).toLocaleTimeString('en-US', {
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : '',
              settledNumber:
                typeof d.outcomeNumber === 'number' && d.outcomeNumber >= 0
                  ? d.outcomeNumber
                  : undefined,
            },
          });
        });
        list.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setOrders(list.map((entry) => entry.order));
      },
      (error) => {
        const info = buildFirestoreErrorInfo(
          error,
          OperationType.LIST,
          `users/${firebaseUser.uid}/gameHistory`
        );
        console.warn('Order history listener warning:', info.error);
      }
    );

    return () => {
      cancelled = true;
      unsubUser();
      unsubAdmin();
      unsubOrders();
    };
  }, [authReady, firebaseUser, firebaseAuthBusy, bootstrapRetryCount, applyBootstrappedProfile]);

  // Persist active local session and corresponding wallet (Mobile / Guest modes only)
  useEffect(() => {
    if (firebaseUser) return;
    saveActiveSession(authSession);
    if (!authSession) return;

    if (authSession.mode === 'mobile') {
      saveMobileWallet(authSession.mobile, {
        balance: demoBalance,
        orders,
        lastResetAtMs,
        followBonusClaimed,
      });
    } else {
      saveGuestWallet({
        guestName: authSession.guestName,
        balance: demoBalance,
        orders,
        lastResetAtMs,
        followBonusClaimed,
      });
    }
  }, [firebaseUser, authSession, demoBalance, orders, lastResetAtMs, followBonusClaimed]);

  useEffect(() => {
    if (!toastMessage) return;
    const t = window.setTimeout(() => setToastMessage(null), 3500);
    return () => window.clearTimeout(t);
  }, [toastMessage]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setOnlineCount((prev) => {
        const delta = Math.floor(Math.random() * 10) - 4;
        return Math.min(1480, Math.max(1120, prev + delta));
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const settleMarketRound = useCallback(
    (marketId: MarketId, sequenceToSettle: number) => {
      const key = `${marketId}-${sequenceToSettle}`;
      if (settledKeysRef.current.has(key)) return;
      settledKeysRef.current.add(key);

      const market = MARKETS.find((m) => m.id === marketId)!;
      const periodId = formatPeriodId(marketId, sequenceToSettle);

      setRuntimes((prev) => ({
        ...prev,
        [marketId]: {
          sequence: sequenceToSettle + 1,
          endTimeMs: Date.now() + market.durationSec * 1000,
        },
      }));

      const hasPendingInRound = ordersRef.current.some(
        (o) =>
          o.periodId === periodId &&
          o.marketId === marketId &&
          o.status === 'pending'
      );

      // Server-validated Colour Trade settlement for Firebase sessions
      if (firebaseUserRef.current && (hasPendingInRound || marketId === activeMarketRef.current)) {
        void apiRequest<{
          ok: boolean;
          winningNumber: number;
          settledCount: number;
          totalPayout: number;
          totalStaked: number;
          netProfit: number;
          winStreak: number;
          streakCutRate: number;
          balance: number;
        }>('/api/game/colour/settle', {
          method: 'POST',
          body: { marketId, periodId },
        })
          .then((res) => {
            const winningNumber = res.winningNumber;
            const settledResult: RoundResult = {
              periodId,
              marketId,
              number: winningNumber,
              colours: getColoursForNumber(winningNumber),
              size: getSizeForNumber(winningNumber),
              settledAt: new Date().toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
            };

            setResultsByMarket((prev) => ({
              ...prev,
              [marketId]: [settledResult, ...prev[marketId]].slice(0, 60),
            }));

            colourWinStreakRef.current = res.winStreak;
            setDemoBalance(res.balance);

            if (res.settledCount > 0) {
              if (res.totalPayout > 0) {
                playWinSound(soundRef.current);
              } else {
                playSettleSound(soundRef.current);
              }
            } else if (
              marketId === activeMarketRef.current &&
              activeGameRef.current === 'colour'
            ) {
              playSettleSound(soundRef.current);
            }

            if (marketId === activeMarketRef.current || res.settledCount > 0) {
              setLastBanner({
                periodId,
                marketId,
                result: settledResult,
                userOrdersCount: res.settledCount,
                totalStaked: res.totalStaked,
                totalPayout: res.totalPayout,
                netProfit: res.netProfit,
                winStreak: res.winStreak,
                streakCutRate: res.streakCutRate,
              });
            }
          })
          .catch(() => {
            // Ignore transient settlement network errors; fallback visual tick still advances
          });
        return;
      }

      const winningNumber = Math.floor(Math.random() * 10);

      const settledResult: RoundResult = {
        periodId,
        marketId,
        number: winningNumber,
        colours: getColoursForNumber(winningNumber),
        size: getSizeForNumber(winningNumber),
        settledAt: new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };

      setResultsByMarket((prev) => ({
        ...prev,
        [marketId]: [settledResult, ...prev[marketId]].slice(0, 60),
      }));

      let nextStreak = colourWinStreakRef.current;
      const { updatedOrders, totalPayout, totalStaked, settledCount, streakCutRate } =
        settleRoundOrders(ordersRef.current, periodId, marketId, winningNumber, () => {
          nextStreak = colourWinStreakRef.current + 1;
          return getWinStreakCutRate(nextStreak);
        });

      if (settledCount > 0) {
        if (totalPayout > 0) {
          colourWinStreakRef.current = nextStreak >= 1 ? nextStreak : colourWinStreakRef.current + 1;
        } else {
          colourWinStreakRef.current = 0;
        }

        setOrders(updatedOrders);
        if (totalPayout > 0) {
          setDemoBalance((b) => roundCurrency(b + totalPayout));
          playWinSound(soundRef.current);
        } else {
          playSettleSound(soundRef.current);
        }
      } else if (
        marketId === activeMarketRef.current &&
        activeGameRef.current === 'colour'
      ) {
        playSettleSound(soundRef.current);
      }

      if (marketId === activeMarketRef.current || settledCount > 0) {
        setLastBanner({
          periodId,
          marketId,
          result: settledResult,
          userOrdersCount: settledCount,
          totalStaked,
          totalPayout,
          netProfit: roundCurrency(totalPayout - totalStaked),
          winStreak: colourWinStreakRef.current,
          streakCutRate,
        });
      }
    },
    []
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentNow = Date.now();
      setNowMs(currentNow);

      const currentRuntimes = runtimesRef.current;
      for (const m of MARKETS) {
        const rt = currentRuntimes[m.id];
        if (rt && currentNow >= rt.endTimeMs) {
          settleMarketRound(m.id, rt.sequence);
        }
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [settleMarketRound]);

  const activeMarket = MARKETS.find((m) => m.id === activeMarketId) ?? MARKETS[0];
  const activeRuntime = runtimes[activeMarketId] ?? {
    sequence: 1,
    endTimeMs: nowMs + activeMarket.durationSec * 1000,
  };
  const currentPeriodId = formatPeriodId(activeMarket.id, activeRuntime.sequence);
  const rawSecondsLeft = Math.ceil((activeRuntime.endTimeMs - nowMs) / 1000);
  const secondsLeft = Number.isFinite(rawSecondsLeft) ? Math.max(0, rawSecondsLeft) : 0;
  const isLocked = secondsLeft <= activeMarket.lockSec;

  useEffect(() => {
    if (
      activeGame === 'colour' &&
      !adminViewOpen &&
      secondsLeft > 0 &&
      secondsLeft <= activeMarket.lockSec
    ) {
      if (lastTickSecRef.current !== secondsLeft) {
        lastTickSecRef.current = secondsLeft;
        playTickSound(soundEnabled);
      }
    } else {
      lastTickSecRef.current = -1;
    }
  }, [activeGame, adminViewOpen, secondsLeft, activeMarket.lockSec, soundEnabled]);

  const isVipAccount = !isFirebaseSession && isVipUnlimitedMobile(authSession);
  const activeMaxBetLimit = isVipAccount ? Infinity : MAX_BET_LIMIT;
  const activeClaimCooldownMs = isVipAccount ? VIP_HOURLY_COOLDOWN_MS : RESET_COOLDOWN_MS;
  const activeClaimCoins = isVipAccount ? VIP_HOURLY_BONUS_COINS : INITIAL_DEMO_BALANCE;

  const handlePlaceOrder = async (
    selection: SelectionType,
    stake: number,
    multiplier: number
  ): Promise<{ ok: boolean; error?: string }> => {
    if (isLocked) {
      return { ok: false, error: 'Orders are locked during the last 5 seconds.' };
    }
    const totalAmount = roundCurrency(stake * multiplier);
    if (!Number.isFinite(totalAmount) || totalAmount < 1) {
      return { ok: false, error: 'Minimum order is 1 DC.' };
    }

    if (isFirebaseSession) {
      try {
        const res = await apiRequest<{ ok: boolean; balance: number; order: DemoOrder }>(
          '/api/game/colour/bet',
          {
            method: 'POST',
            body: {
              marketId: activeMarketId,
              periodId: currentPeriodId,
              selection,
              stake,
              multiplier,
            },
          }
        );
        setDemoBalance(res.balance);
        setOrders((prev) =>
          prev.some((o) => o.id === res.order.id) ? prev : [res.order, ...prev]
        );
        playOrderSound(soundEnabled);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof ApiError || err instanceof Error
              ? err.message
              : 'Failed to place order.',
        };
      }
    }

    const existingRoundStake = orders
      .filter(
        (o) =>
          o.periodId === currentPeriodId &&
          o.marketId === activeMarketId &&
          o.status === 'pending'
      )
      .reduce((sum, o) => sum + o.totalAmount, 0);
    if (
      Number.isFinite(activeMaxBetLimit) &&
      roundCurrency(existingRoundStake + totalAmount) > activeMaxBetLimit
    ) {
      return {
        ok: false,
        error: `Max bet limit is ${formatCurrency(activeMaxBetLimit)} DC per round.`,
      };
    }
    if (totalAmount > demoBalance) {
      return {
        ok: false,
        error: isVipAccount
          ? 'Insufficient balance. 1Cr DC claim unlocks every 1h.'
          : 'Insufficient balance. 10K DC claim unlocks every 24h.',
      };
    }

    const fee = roundCurrency(totalAmount * FEE_RATE);
    const contractAmount = roundCurrency(totalAmount - fee);

    const newOrder: DemoOrder = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      periodId: currentPeriodId,
      marketId: activeMarketId,
      selection,
      stake,
      multiplier,
      totalAmount,
      fee,
      contractAmount,
      status: 'pending',
      payout: 0,
      netProfit: 0,
      createdAt: new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    };

    setDemoBalance((prev) => roundCurrency(prev - totalAmount));
    setOrders((prev) => [newOrder, ...prev]);
    playOrderSound(soundEnabled);
    return { ok: true };
  };

  const handleCancelOrder = async (orderId: string) => {
    if (isLocked) return;

    if (isFirebaseSession) {
      try {
        const res = await apiRequest<{ ok: boolean; balance: number; refundedAmount: number }>(
          '/api/game/colour/cancel',
          {
            method: 'POST',
            body: { orderId },
          }
        );
        playClickSound(soundEnabled);
        setDemoBalance(res.balance);
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
        setToastMessage(
          `Order cancelled · Refunded ${formatCurrency(res.refundedAmount)} DC`
        );
      } catch (err) {
        setToastMessage(
          err instanceof ApiError || err instanceof Error
            ? err.message
            : 'Unable to cancel order.'
        );
      }
      return;
    }

    const target = orders.find((o) => o.id === orderId && o.status === 'pending');
    if (!target) return;

    playClickSound(soundEnabled);
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    setDemoBalance((prev) => roundCurrency(prev + target.totalAmount));
    setToastMessage(`Order cancelled · Refunded ${formatCurrency(target.totalAmount)} DC`);
  };

  const claimRemainingMs = Math.max(0, lastResetAtMs + activeClaimCooldownMs - nowMs);

  const handleClaim10k = async () => {
    const remaining = Math.max(0, lastResetAtMs + activeClaimCooldownMs - Date.now());
    if (remaining > 0) {
      playClickSound(soundEnabled);
      setToastMessage(
        `${isVipAccount ? '1Cr' : '10K'} DC claim unlocks after ${isVipAccount ? '1 hour' : '24 hours'} (${formatRemainingCooldown(remaining)} left).`
      );
      return;
    }

    if (isFirebaseSession) {
      try {
        const res = await apiRequest<{ ok: boolean; balance: number; lastResetAtMs: number }>(
          '/api/user/claim-daily',
          { method: 'POST' }
        );
        playWinSound(soundEnabled);
        setDemoBalance(res.balance);
        setLastResetAtMs(res.lastResetAtMs);
        setToastMessage('Claimed +10K DC! Next 10K DC claim in 24 hours.');
      } catch (err) {
        setToastMessage(
          err instanceof ApiError || err instanceof Error ? err.message : 'Claim failed.'
        );
      }
      return;
    }

    const now = Date.now();
    playWinSound(soundEnabled);
    setDemoBalance((prev) => roundCurrency(prev + activeClaimCoins));
    setLastResetAtMs(now);
    if (isVipAccount && authSession?.mode === 'mobile') {
      saveMobileWallet(authSession.mobile, {
        balance: roundCurrency(demoBalance + activeClaimCoins),
        orders,
        lastResetAtMs: now,
        followBonusClaimed,
        lastVipDropAtMs: now,
      });
    }
    setToastMessage(
      `Claimed +${formatCurrency(activeClaimCoins)} DC! Next ${isVipAccount ? '1Cr DC claim in 1 hour' : '10K DC claim in 24 hours'}.`
    );
  };

  const handleFastForwardSettle = () => {
    playClickSound(soundEnabled);
    settleMarketRound(activeMarketId, activeRuntime.sequence);
  };

  const handleSelectGame = (game: 'colour' | 'jhandi' | 'chicken') => {
    playClickSound(soundEnabled);
    setAdminViewOpen(false);
    setActiveGame(game);
    if (game === 'jhandi') {
      bgMusic.playNow();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleChickenBalanceChange = useCallback((delta: number) => {
    if (firebaseUserRef.current) return;
    setDemoBalance((prev) => roundCurrency(Math.max(0, prev + delta)));
  }, []);

  const handleChickenServerStart = useCallback(
    async (
      difficultyId: ChickenDifficultyId,
      stake: number
    ): Promise<ChickenServerStartResult> => {
      try {
        const res = await apiRequest<{
          ok: boolean;
          stake: number;
          netStake: number;
          balance: number;
        }>('/api/game/chicken/start', {
          method: 'POST',
          body: { difficultyId, stake },
        });
        setDemoBalance(res.balance);
        return { ok: true, stake: res.stake, netStake: res.netStake };
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof ApiError || err instanceof Error
              ? err.message
              : 'Unable to start crossing.',
        };
      }
    },
    []
  );

  const handleChickenServerStep = useCallback(async (): Promise<ChickenServerStepResult> => {
    try {
      const res = await apiRequest<
        ChickenServerStepResult & { ok: boolean; balance: number }
      >('/api/game/chicken/step', {
        method: 'POST',
      });
      if (typeof res.balance === 'number') {
        setDemoBalance(res.balance);
      }
      return { ...res, ok: true };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof ApiError || err instanceof Error
            ? err.message
            : 'Unable to advance lane.',
      };
    }
  }, []);

  const handleChickenServerCashOut = useCallback(async (): Promise<ChickenServerCashOutResult> => {
    try {
      const res = await apiRequest<
        ChickenServerCashOutResult & { ok: boolean; balance: number }
      >('/api/game/chicken/cashout', {
        method: 'POST',
      });
      if (typeof res.balance === 'number') {
        setDemoBalance(res.balance);
      }
      return { ...res, ok: true };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof ApiError || err instanceof Error
            ? err.message
            : 'Unable to cash out.',
      };
    }
  }, []);

  const handleNavigate = (sectionId: string) => {
    setAdminViewOpen(false);
    window.setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 30);
  };

  const handleMobileLogin = (
    mobile: string,
    wallet: StoredAccountWallet,
    created: boolean,
    bonusAdded: number
  ) => {
    if (bonusAdded > 0) {
      playWinSound(soundEnabled);
    } else {
      playOrderSound(soundEnabled);
    }
    colourWinStreakRef.current = 0;
    jhandiWinStreakRef.current = 0;
    setDemoBalance(wallet.balance);
    setOrders(wallet.orders);
    setLastResetAtMs(wallet.lastResetAtMs);
    setFollowBonusClaimed(wallet.followBonusClaimed);
    setFollowVisited(false);
    setLastBanner(null);
    setAdminViewOpen(false);
    setAuthSession({ mode: 'mobile', mobile });
    if (bonusAdded > 0) {
      setToastMessage(
        `${created ? 'Account created' : 'Logged in'} (+91 ${mobile}) · +${formatCurrency(bonusAdded)} DC Bonus added!`
      );
    } else {
      setToastMessage(
        created
          ? `Account created for +91 ${mobile} · ${formatCurrency(wallet.balance)} DC`
          : `Logged in as +91 ${mobile} · ${formatCurrency(wallet.balance)} DC`
      );
    }
  };

  const handleGuestLogin = (name: string) => {
    playOrderSound(soundEnabled);
    const guestWallet = loadGuestWallet();
    colourWinStreakRef.current = 0;
    jhandiWinStreakRef.current = 0;
    setDemoBalance(guestWallet.balance);
    setOrders(guestWallet.orders);
    setLastResetAtMs(guestWallet.lastResetAtMs);
    setFollowBonusClaimed(guestWallet.followBonusClaimed);
    setFollowVisited(false);
    setLastBanner(null);
    setAdminViewOpen(false);
    setAuthSession({ mode: 'guest', guestName: name });
    setToastMessage(`Logged in as ${name} · ${formatCurrency(guestWallet.balance)} DC`);
  };

  const handleLogout = async () => {
    playClickSound(soundEnabled);
    if (firebaseUser) {
      try {
        await signOut(auth);
      } catch {
        // Ignore signOut error
      }
    }
    bootstrappedUidRef.current = null;
    setFirebaseAuthBusy(false);
    setAuthSession(null);
    setFirebaseUser(null);
    setIsAdmin(false);
    setAdminCheckComplete(false);
    setProfileLoaded(false);
    setAdminViewOpen(false);
    setChangePwOpen(false);
    setProfileModalOpen(false);
    setFirebasePublicUid('');
    setFirebaseReferralCode('');
    setActiveGame('colour');
    setOrders([]);
    setLastBanner(null);
    setToastMessage(null);
    setResetKey((k) => k + 1);
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authSession || authSession.mode !== 'mobile') return;
    if (newPw !== confirmPw) {
      setPwError('New password and confirm password do not match.');
      return;
    }
    setPwError(null);
    setPwSaving(true);
    try {
      const res = await changeMobileAccountPassword(authSession.mobile, currentPw, newPw);
      if (!res.ok) {
        setPwError(res.error);
        return;
      }
      setChangePwOpen(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      if (res.bonusAdded > 0) {
        setDemoBalance((prev) => roundCurrency(prev + res.bonusAdded));
        playWinSound(soundEnabled);
        setToastMessage(
          `Password updated! +${formatCurrency(res.bonusAdded)} DC Bonus added!`
        );
      } else {
        playOrderSound(soundEnabled);
        setToastMessage('Password updated successfully.');
      }
    } finally {
      setPwSaving(false);
    }
  };

  const handleClaimFollowBonus = async () => {
    if (followBonusClaimed) {
      playClickSound(soundEnabled);
      setToastMessage('10K DC follow bonus already claimed for this account.');
      return;
    }
    if (!followVisited) {
      playClickSound(soundEnabled);
      setToastMessage('First click Follow @shobhanrahul on Instagram, then claim 10K DC coins.');
      return;
    }

    if (isFirebaseSession) {
      try {
        const res = await apiRequest<{
          ok: boolean;
          balance: number;
          followBonusClaimed: boolean;
        }>('/api/user/claim-follow', { method: 'POST' });
        playWinSound(soundEnabled);
        setDemoBalance(res.balance);
        setFollowBonusClaimed(res.followBonusClaimed);
        setToastMessage(`Free +${formatCurrency(FOLLOW_BONUS_COINS)} DC added for following!`);
      } catch (err) {
        setToastMessage(
          err instanceof ApiError || err instanceof Error ? err.message : 'Claim failed.'
        );
      }
      return;
    }

    playWinSound(soundEnabled);
    setDemoBalance((prev) => roundCurrency(prev + FOLLOW_BONUS_COINS));
    setFollowBonusClaimed(true);
    setToastMessage(`Free +${formatCurrency(FOLLOW_BONUS_COINS)} DC added for following!`);
  };

  const handleJhandiRoll = useCallback(
    async ({
      bets,
      roundNumber,
      windowBoostedSymbols,
      jackpotSymbols,
    }: {
      bets: Record<JhandiSymbolId, number>;
      roundNumber: number;
      windowBoostedSymbols: JhandiSymbolId[];
      jackpotSymbols: JhandiSymbolId[];
    }): Promise<JhandiRollResult> => {
      if (firebaseUserRef.current) {
        try {
          const res = await apiRequest<JhandiRollResult & { balance: number }>(
            '/api/game/jhandi/roll',
            {
              method: 'POST',
              body: { bets, roundNumber, windowBoostedSymbols, jackpotSymbols },
            }
          );
          if (res.ok && typeof res.balance === 'number') {
            setDemoBalance(res.balance);
          }
          if (res.ok && typeof res.winStreak === 'number') {
            jhandiWinStreakRef.current = res.winStreak;
          }
          return res;
        } catch (err) {
          return {
            ok: false,
            error:
              err instanceof ApiError || err instanceof Error
                ? err.message
                : 'Failed to roll Jhandi Munda.',
          };
        }
      }

      const SYMBOLS: JhandiSymbolId[] = [
        'club',
        'munda',
        'spade',
        'diamond',
        'jhandi',
        'heart',
      ];
      const betSum = SYMBOLS.reduce((sum, s) => sum + (bets[s] || 0), 0);

      if (betSum > demoBalanceRef.current) {
        return {
          ok: false,
          error: 'Insufficient demo balance. Clear bets or wait for 24h Claim 10K.',
        };
      }

      const activeJackpot = jackpotSymbols
        .filter((s) => (bets[s] || 0) > 0)
        .sort((a, b) => (bets[b] || 0) - (bets[a] || 0));
      const activeBoosted = windowBoostedSymbols
        .filter((s) => (bets[s] || 0) > 0)
        .sort((a, b) => (bets[b] || 0) - (bets[a] || 0));

      let finalDice: JhandiSymbolId[];
      if (roundNumber === 7 || roundNumber === 11) {
        finalDice = ['club', 'munda', 'spade', 'diamond', 'jhandi', 'heart'];
      } else if (activeJackpot.length >= 1 && activeJackpot[0]) {
        const target = activeJackpot[0];
        finalDice = [target, target, target, target, target, target];
      } else if (activeBoosted.length === 1 && activeBoosted[0]) {
        const target = activeBoosted[0];
        const others = SYMBOLS.filter((id) => id !== target);
        const remaining = Array.from(
          { length: 3 },
          () => others[Math.floor(Math.random() * others.length)] ?? 'club'
        );
        finalDice = [target, target, target, ...remaining];
      } else if (activeBoosted.length >= 2 && activeBoosted[0] && activeBoosted[1]) {
        const first = activeBoosted[0];
        const second = activeBoosted[1];
        finalDice = [first, first, first, second, second, second];
      } else {
        finalDice = Array.from(
          { length: 6 },
          () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
        );
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

      const netStake = roundCurrency(betSum * (1 - FEE_RATE));
      let rawPayout = 0;
      SYMBOLS.forEach((sym) => {
        const stake = bets[sym] || 0;
        if (stake > 0 && counts[sym] >= 2) {
          const netSymStake = roundCurrency(stake * (1 - FEE_RATE));
          const multiplier = counts[sym] === 6 ? 100 : counts[sym] + 1;
          rawPayout = roundCurrency(rawPayout + netSymStake * multiplier);
        }
      });

      let finalPayout = rawPayout;
      let streakCutRate = 0;
      if (rawPayout > 0) {
        jhandiWinStreakRef.current += 1;
        streakCutRate = getWinStreakCutRate(jhandiWinStreakRef.current);
        if (streakCutRate > 0) {
          finalPayout = roundCurrency(rawPayout * (1 - streakCutRate));
        }
      } else {
        jhandiWinStreakRef.current = 0;
      }

      const net = roundCurrency(finalPayout - betSum);
      setDemoBalance((prev) => roundCurrency(Math.max(0, prev + net)));

      return {
        ok: true,
        rolledDice: finalDice,
        staked: betSum,
        netStake,
        payout: finalPayout,
        net,
        winStreak: jhandiWinStreakRef.current,
        streakCutRate,
      };
    },
    []
  );

  const playerLabel = firebaseUser
    ? firebaseDisplayName || firebaseUser.email || 'Firebase User'
    : !authSession
      ? 'OG_PLAYER'
      : authSession.mode === 'mobile'
        ? `+91 ${authSession.mobile}`
        : authSession.guestName;

  const activeResults = resultsByMarket[activeMarket.id] ?? [];
  const currentRoundOrders = (Array.isArray(orders) ? orders : []).filter(
    (o) =>
      o.periodId === currentPeriodId &&
      o.marketId === activeMarket.id &&
      o.status === 'pending'
  );
  const canAccessAdmin = Boolean(
    authReady && firebaseUser && adminCheckComplete && isAdmin
  );

  if (!authReady && !authSession) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] flex items-center justify-center p-4 text-xs font-semibold text-slate-500">
        Connecting to OG TRADE...
      </div>
    );
  }

  return (
    <div id="top" className="min-h-screen bg-[#F4F7FB] text-slate-900">
      {/* Persistent offscreen YouTube player for instant Jhandi Munda background music */}
      <div
        ref={bgMusic.containerRef}
        aria-hidden="true"
        className="pointer-events-none fixed -left-[9999px] top-0 h-[200px] w-[200px] opacity-0"
      />
      {!isAuthenticated || firebaseAuthBusy ? (
        <GuestLogin
          onMobileLogin={handleMobileLogin}
          onGuestLogin={handleGuestLogin}
          onFirebaseAuthBusyChange={setFirebaseAuthBusy}
          onFirebaseBootstrapComplete={(payload) => {
            applyBootstrappedProfile({
              ...payload,
              fallbackEmail: auth.currentUser?.email,
            });
          }}
        />
      ) : (
        <>
          <TopBar
            onClaimCoins={handleClaim10k}
            claimRemainingMs={claimRemainingMs}
            claimAmountLabel={isVipAccount ? '1Cr' : '10K'}
            claimCooldownLabel={isVipAccount ? '1 hour' : '24 hours'}
            onlineCount={onlineCount}
            onSelectGame={handleSelectGame}
            onNavigateRules={() => handleNavigate('rules')}
            isAdmin={canAccessAdmin}
            isAdminView={adminViewOpen}
            onToggleAdminView={() => {
              if (!canAccessAdmin) return;
              playClickSound(soundEnabled);
              setAdminViewOpen((prev) => !prev);
            }}
          />

          {toastMessage && (
            <div
              role="status"
              className="fixed bottom-5 right-5 z-40 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 shadow-lg"
            >
              {toastMessage}
            </div>
          )}

          {changePwOpen && !isFirebaseSession && authSession?.mode === 'mobile' && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="change-pw-title"
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-xs"
            >
              <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-slate-800" aria-hidden="true" />
                    <h2 id="change-pw-title" className="font-display text-sm font-bold text-slate-900">
                      Change Password
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setChangePwOpen(false);
                      setPwError(null);
                    }}
                    aria-label="Close change password dialog"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <form onSubmit={handleChangePasswordSubmit} className="mt-4 space-y-3" noValidate>
                  <div>
                    <label htmlFor="cpw-current" className="block text-xs font-semibold text-slate-700">
                      Current Password
                    </label>
                    <input
                      id="cpw-current"
                      type="password"
                      maxLength={24}
                      value={currentPw}
                      onChange={(e) => {
                        setCurrentPw(e.target.value);
                        if (pwError) setPwError(null);
                      }}
                      placeholder="Current password"
                      className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm font-bold text-slate-900 placeholder:font-sans placeholder:font-normal focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                    />
                  </div>

                  <div>
                    <label htmlFor="cpw-new" className="block text-xs font-semibold text-slate-700">
                      New Password (6+ chars)
                    </label>
                    <input
                      id="cpw-new"
                      type="password"
                      maxLength={24}
                      value={newPw}
                      onChange={(e) => {
                        setNewPw(e.target.value);
                        if (pwError) setPwError(null);
                      }}
                      placeholder="New password (min 6 chars)"
                      className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm font-bold text-slate-900 placeholder:font-sans placeholder:font-normal focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                    />
                  </div>

                  <div>
                    <label htmlFor="cpw-confirm" className="block text-xs font-semibold text-slate-700">
                      Confirm New Password
                    </label>
                    <input
                      id="cpw-confirm"
                      type="password"
                      maxLength={24}
                      value={confirmPw}
                      onChange={(e) => {
                        setConfirmPw(e.target.value);
                        if (pwError) setPwError(null);
                      }}
                      placeholder="Repeat new password"
                      className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm font-bold text-slate-900 placeholder:font-sans placeholder:font-normal focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                    />
                  </div>

                  {pwError && (
                    <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                      {pwError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setChangePwOpen(false);
                        setPwError(null);
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={pwSaving}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {pwSaving ? 'Saving...' : 'Update Password'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {profileModalOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="player-profile-title"
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-xs"
              onClick={() => setProfileModalOpen(false)}
            >
              <div
                className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-800" aria-hidden="true" />
                    <h2 id="player-profile-title" className="font-display text-sm font-bold text-slate-900">
                      Player Profile
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfileModalOpen(false)}
                    aria-label="Close profile dialog"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-4 space-y-3 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold text-slate-500">Display Name</div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900 truncate">{playerLabel}</span>
                      {canAccessAdmin && (
                        <span className="inline-flex items-center gap-1 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                          ADMIN
                        </span>
                      )}
                    </div>
                    {firebaseUser?.email && (
                      <div className="mt-0.5 text-xs text-slate-600 truncate">{firebaseUser.email}</div>
                    )}
                  </div>

                  {isFirebaseSession && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                        User ID (6-Digit UID)
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="font-mono text-lg font-extrabold tracking-widest text-slate-900 tabular-nums">
                          {firebasePublicUid || '------'}
                        </span>
                        {firebasePublicUid && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(firebasePublicUid);
                                setCopiedPublicUid(true);
                                window.setTimeout(() => setCopiedPublicUid(false), 1500);
                              } catch {
                                // Ignore clipboard errors
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                          >
                            <Copy className="h-3 w-3" aria-hidden="true" />
                            <span>{copiedPublicUid ? 'Copied' : 'Copy UID'}</span>
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Your permanent unique 6-digit player ID.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Wallet Balance
                      </div>
                      <div className="mt-0.5 font-mono text-sm font-extrabold text-emerald-700 tabular-nums">
                        {formatCurrency(demoBalance)} DC
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {firebaseReferralCode ? 'Referral Code' : 'Account Mode'}
                      </div>
                      <div className="mt-0.5 font-mono text-xs font-bold text-slate-800 truncate">
                        {firebaseReferralCode || (isFirebaseSession ? 'Firebase' : authSession?.mode || 'Guest')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <main className="mx-auto max-w-[1160px] space-y-3.5 px-3 py-3 sm:px-6 sm:py-4">
            {backendAlert && (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
                  <span>{backendAlert}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBootstrapRetryCount((c) => c + 1)}
                  className="inline-flex w-fit shrink-0 items-center rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
                >
                  Retry Sync
                </button>
              </div>
            )}

            {/* Shared Game Switcher + Wallet + Sound Bar */}
            <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-3.5">
              <div
                role="tablist"
                aria-label="Game Modes"
                className="grid grid-cols-3 gap-1.5 sm:flex sm:items-center sm:gap-2"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!adminViewOpen && activeGame === 'colour'}
                  onClick={() => handleSelectGame('colour')}
                  className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    !adminViewOpen && activeGame === 'colour'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Palette className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Colour Trade</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={!adminViewOpen && activeGame === 'jhandi'}
                  onClick={() => handleSelectGame('jhandi')}
                  className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    !adminViewOpen && activeGame === 'jhandi'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Dices className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Jhandi Munda</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={!adminViewOpen && activeGame === 'chicken'}
                  onClick={() => handleSelectGame('chicken')}
                  className={`inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-2.5 sm:px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    !adminViewOpen && activeGame === 'chicken'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Route className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Chicken Road</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    playClickSound(soundEnabled);
                    setProfileModalOpen(true);
                  }}
                  title={
                    firebasePublicUid
                      ? `${playerLabel} · UID: ${firebasePublicUid} (Click for Profile)`
                      : `${playerLabel} (Click for Profile)`
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 max-w-[260px] hover:border-slate-300 hover:bg-slate-100 transition-colors"
                >
                  <User className="h-3.5 w-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                  <span
                    className={`truncate ${!isFirebaseSession && authSession?.mode === 'mobile' ? 'font-mono tabular-nums' : ''}`}
                  >
                    {playerLabel}
                  </span>
                  {isFirebaseSession && firebasePublicUid && (
                    <span className="rounded bg-slate-200/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800 tabular-nums shrink-0">
                      ID: {firebasePublicUid}
                    </span>
                  )}
                </button>

                {canAccessAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound(soundEnabled);
                      setAdminViewOpen((prev) => !prev);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                      adminViewOpen
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{adminViewOpen ? 'Admin Panel' : 'Open Admin'}</span>
                  </button>
                )}

                <div
                  className="flex items-center gap-2 rounded-lg border border-emerald-400/70 bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 px-3 py-1.5 text-white shadow-sm"
                  title={`${demoBalance.toLocaleString('en-US', { maximumFractionDigits: 2 })} DC`}
                >
                  <Wallet className="h-4 w-4 text-amber-300 shrink-0" aria-hidden="true" />
                  <span className="font-mono text-sm font-extrabold text-white tabular-nums">
                    {isFirebaseSession && !profileLoaded ? '...' : formatCurrency(demoBalance)}
                  </span>
                  <span className="rounded bg-amber-300/25 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-200">
                    DC
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const next = !soundEnabled;
                    setSoundEnabled(next);
                    if (next) playClickSound(true);
                  }}
                  aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  {soundEnabled ? (
                    <Volume2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  ) : (
                    <VolumeX className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  )}
                  <span>{soundEnabled ? 'Sound On' : 'Muted'}</span>
                </button>

                {!isFirebaseSession && authSession?.mode === 'mobile' && (
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound(soundEnabled);
                      setCurrentPw('');
                      setNewPw('');
                      setConfirmPw('');
                      setPwError(null);
                      setChangePwOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap shrink-0"
                  >
                    <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Change Password</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Logout</span>
                </button>
              </div>
            </div>

            {canAccessAdmin && adminViewOpen && firebaseUser ? (
              <AdminPanel
                adminUid={firebaseUser.uid}
                adminPublicUid={firebasePublicUid}
                adminEmail={firebaseUser.email || ''}
                adminVerified={canAccessAdmin}
                onBackToGames={() => setAdminViewOpen(false)}
                onToast={setToastMessage}
              />
            ) : (
              <>
                {/* Instagram Follow Reward Bar (+10K Free DC Coins) */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2">
                  <div className="flex items-center gap-2 text-xs text-slate-700">
                    <Gift className="h-4 w-4 text-rose-600 shrink-0" aria-hidden="true" />
                    <span>
                      Follow{' '}
                      <span className="font-bold text-slate-900">@shobhanrahul</span>{' '}
                      for <span className="font-bold text-emerald-700">Free 10K DC Coins</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={INSTAGRAM_FOLLOW_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        playClickSound(soundEnabled);
                        setFollowVisited(true);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 whitespace-nowrap shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Follow on Instagram</span>
                    </a>

                    {followBonusClaimed ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 whitespace-nowrap shrink-0">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>+10,000 Coins Claimed</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleClaimFollowBonus()}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                          followVisited
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                            : 'border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        <span>{followVisited ? 'Claim Free 10K Coins' : 'Claim 10K After Follow'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {activeGame === 'colour' ? (
                  <>
                    <TradingDesk
                      activeMarket={activeMarket}
                      onSelectMarket={setActiveMarketId}
                      currentPeriodId={currentPeriodId}
                      secondsLeft={secondsLeft}
                      isLocked={isLocked}
                      demoBalance={demoBalance}
                      soundEnabled={soundEnabled}
                      onFastForwardSettle={handleFastForwardSettle}
                      recentResults={activeResults}
                      lastBanner={lastBanner}
                      currentRoundOrders={currentRoundOrders}
                      onPlaceOrder={handlePlaceOrder}
                      onCancelOrder={handleCancelOrder}
                      onHowToPlay={() => handleNavigate('rules')}
                      maxBetLimit={activeMaxBetLimit}
                    />

                    <HistoryLedger
                      activeMarket={activeMarket}
                      results={activeResults}
                      orders={orders}
                      onJumpToDesk={() => handleNavigate('desk')}
                    />
                  </>
                ) : activeGame === 'jhandi' ? (
                  <JhandiMundaGame
                    demoBalance={demoBalance}
                    soundEnabled={soundEnabled}
                    onRollRound={handleJhandiRoll}
                    onShowRules={() => handleNavigate('rules')}
                    resetKey={resetKey}
                    playerLabel={playerLabel}
                    onlineCount={onlineCount}
                    maxBetLimit={activeMaxBetLimit}
                  />
                ) : (
                  <ChickenRoadGame
                    demoBalance={demoBalance}
                    soundEnabled={soundEnabled}
                    onBalanceChange={handleChickenBalanceChange}
                    onShowRules={() => handleNavigate('rules')}
                    resetKey={resetKey}
                    playerLabel={playerLabel}
                    onlineCount={onlineCount}
                    maxBetLimit={activeMaxBetLimit}
                    onServerStart={isFirebaseSession ? handleChickenServerStart : undefined}
                    onServerStep={isFirebaseSession ? handleChickenServerStep : undefined}
                    onServerCashOut={isFirebaseSession ? handleChickenServerCashOut : undefined}
                  />
                )}

                <RulesSection activeGame={activeGame} isVipUnlimited={isVipAccount} />
              </>
            )}
          </main>

          <footer className="border-t border-slate-200 bg-white py-5 text-xs text-slate-500">
            <div className="mx-auto flex max-w-[1160px] flex-col items-center justify-between gap-2.5 px-4 sm:flex-row sm:px-6">
              <span>OG TRADE · Demo Colour Trading, Jhandi Munda &amp; Chicken Road</span>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <span>10K Virtual DC Coins · No Real Money</span>
                <a
                  href="/og-trade-apk.zip"
                  download="og-trade-apk.zip"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span>Download APK Zip</span>
                </a>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
