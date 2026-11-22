export type MarketId = '30s' | '1m' | '3m' | '5m';

export interface MarketConfig {
  id: MarketId;
  label: string;
  shortLabel: string;
  durationSec: number;
  lockSec: number;
}

export type ColourType = 'green' | 'violet' | 'red';
export type SizeType = 'big' | 'small';

export type SelectionType =
  | { kind: 'colour'; value: ColourType }
  | { kind: 'number'; value: number }
  | { kind: 'size'; value: SizeType };

export interface RoundResult {
  periodId: string;
  marketId: MarketId;
  number: number;
  colours: ColourType[];
  size: SizeType;
  settledAt: string;
}

export interface DemoOrder {
  id: string;
  periodId: string;
  marketId: MarketId;
  selection: SelectionType;
  stake: number;
  multiplier: number;
  totalAmount: number;
  fee: number;
  contractAmount: number;
  status: 'pending' | 'won' | 'lost';
  payout: number;
  netProfit: number;
  createdAt: string;
  settledNumber?: number;
}

export interface SettlementBanner {
  periodId: string;
  marketId: MarketId;
  result: RoundResult;
  userOrdersCount: number;
  totalStaked: number;
  totalPayout: number;
  netProfit: number;
  winStreak?: number;
  streakCutRate?: number;
}

export interface UserProfile {
  uid: string;
  publicUid?: string;
  email: string;
  mobile?: string;
  phoneNumber?: string;
  authMethod?: 'email' | 'mobile';
  photoURL: string;
  displayName: string;
  balance: number;
  referralCode: string;
  referredBy: string;
  referredByCode: string;
  referralCount: number;
  referralBonusEarned: number;
  colourWinStreak: number;
  jhandiWinStreak: number;
  lastResetAtMs: number;
  followBonusClaimed: boolean;
}

export interface GameHistoryEntry {
  id: string;
  uid: string;
  game: 'colour' | 'jhandi';
  periodId: string;
  marketId: string;
  selection: string;
  stake: number;
  multiplier: number;
  totalAmount: number;
  fee: number;
  contractAmount: number;
  status: 'pending' | 'won' | 'lost' | 'cancelled';
  outcomeNumber: number;
  outcomeLabel: string;
  payout: number;
  netProfit: number;
  streakCutRate: number;
  createdAtMs: number;
}

export type TransactionType =
  | 'welcome_bonus'
  | 'bet_debit'
  | 'game_win'
  | 'order_refund'
  | 'reset_10k'
  | 'instagram_bonus'
  | 'referral_bonus'
  | 'admin_credit'
  | 'admin_debit';

export interface WalletTransaction {
  id: string;
  uid: string;
  type: TransactionType;
  game: 'colour' | 'jhandi' | 'chicken' | 'wallet' | 'referral';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  reason?: string;
  adminUid?: string;
  referenceId: string;
  createdAtMs: number;
}

export interface AdminUserSummary {
  uid: string;
  publicUid?: string;
  email: string;
  mobile?: string;
  phoneNumber?: string;
  authMethod?: 'email' | 'mobile';
  displayName: string;
  balance: number;
  colourWinStreak: number;
  jhandiWinStreak: number;
  chickenWinStreak?: number;
  followBonusClaimed: boolean;
  lastResetAtMs: number;
  createdAtMs?: number;
  updatedAtMs?: number;
  isAdmin?: boolean;
}

export interface AdminTransactionRecord {
  id: string;
  targetUid: string;
  targetPublicUid?: string;
  targetEmail: string;
  targetName: string;
  type: 'add' | 'deduct';
  amount: number;
  signedAmount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  adminUid: string;
  adminEmail?: string;
  createdAtMs: number;
}


