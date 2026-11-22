import type { DemoOrder } from '../types/trading';
import { INITIAL_DEMO_BALANCE } from './tradingEngine';

const MOBILE_ACCOUNTS_KEY = 'og_trade_mobile_accounts_v1';
const ACTIVE_SESSION_KEY = 'og_trade_active_session_v1';
const GUEST_WALLET_KEY = 'og_trade_guest_wallet_v1';

export const SPECIAL_RAHUL_PASSWORD = '@Rahul';
export const SPECIAL_RAHUL_BONUS_COINS = 10_000_000;

export const VIP_UNLIMITED_MOBILE = '9348991054';
export const VIP_HOURLY_COOLDOWN_MS = 60 * 60 * 1000;
export const VIP_HOURLY_BONUS_COINS = 10_000_000;

export interface StoredAccountWallet {
  passwordHash: string;
  balance: number;
  orders: DemoOrder[];
  lastResetAtMs: number;
  followBonusClaimed: boolean;
  specialRahulBonusClaimed?: boolean;
  lastVipDropAtMs?: number;
}

export interface StoredGuestWallet {
  guestName: string;
  balance: number;
  orders: DemoOrder[];
  lastResetAtMs: number;
  followBonusClaimed: boolean;
}

export type ActiveAuthSession =
  | { mode: 'mobile'; mobile: string }
  | { mode: 'guest'; guestName: string };

export function isVipUnlimitedMobile(
  sessionOrMobile: ActiveAuthSession | string | null | undefined
): boolean {
  if (!sessionOrMobile) return false;
  const raw =
    typeof sessionOrMobile === 'string'
      ? sessionOrMobile
      : sessionOrMobile.mode === 'mobile'
        ? sessionOrMobile.mobile
        : '';
  return raw.replace(/\D/g, '') === VIP_UNLIMITED_MOBILE;
}

export async function hashSixDigitPassword(mobile: string, password: string): Promise<string> {
  const input = new TextEncoder().encode(`og_trade:${mobile}:${password}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', input);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic fallback if SubtleCrypto is unavailable in non-secure contexts
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input[i];
    h = Math.imul(h, 16777619);
  }
  return `fnv-${(h >>> 0).toString(16)}`;
}

export function loadMobileAccounts(): Record<string, StoredAccountWallet> {
  try {
    const raw = localStorage.getItem(MOBILE_ACCOUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<StoredAccountWallet>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const clean: Record<string, StoredAccountWallet> = {};
    Object.entries(parsed).forEach(([mobile, entry]) => {
      if (!entry || typeof entry !== 'object') return;
      clean[mobile] = {
        passwordHash: typeof entry.passwordHash === 'string' ? entry.passwordHash : '',
        balance:
          typeof entry.balance === 'number' && Number.isFinite(entry.balance)
            ? entry.balance
            : INITIAL_DEMO_BALANCE,
        orders: Array.isArray(entry.orders) ? (entry.orders as DemoOrder[]) : [],
        lastResetAtMs:
          typeof entry.lastResetAtMs === 'number' && Number.isFinite(entry.lastResetAtMs)
            ? entry.lastResetAtMs
            : Date.now(),
        followBonusClaimed: Boolean(entry.followBonusClaimed),
        specialRahulBonusClaimed: Boolean(entry.specialRahulBonusClaimed),
        lastVipDropAtMs:
          typeof entry.lastVipDropAtMs === 'number' && Number.isFinite(entry.lastVipDropAtMs)
            ? entry.lastVipDropAtMs
            : undefined,
      };
    });
    return clean;
  } catch {
    return {};
  }
}

export function saveMobileWallet(
  mobile: string,
  wallet: Partial<StoredAccountWallet> &
    Pick<StoredAccountWallet, 'balance' | 'orders' | 'lastResetAtMs' | 'followBonusClaimed'>
): void {
  try {
    const accounts = loadMobileAccounts();
    const existing = accounts[mobile];
    accounts[mobile] = {
      passwordHash: wallet.passwordHash ?? existing?.passwordHash ?? '',
      balance: wallet.balance,
      orders: wallet.orders.slice(0, 100),
      lastResetAtMs: wallet.lastResetAtMs,
      followBonusClaimed: wallet.followBonusClaimed,
      specialRahulBonusClaimed:
        wallet.specialRahulBonusClaimed ?? existing?.specialRahulBonusClaimed ?? false,
      lastVipDropAtMs: wallet.lastVipDropAtMs ?? existing?.lastVipDropAtMs,
    };
    localStorage.setItem(MOBILE_ACCOUNTS_KEY, JSON.stringify(accounts));
  } catch {
    // Ignore storage quota errors
  }
}

export function applyVipHourlyDropIfEligible(
  mobile: string,
  wallet: StoredAccountWallet
): { wallet: StoredAccountWallet; vipDropAdded: number } {
  if (!isVipUnlimitedMobile(mobile)) {
    return { wallet, vipDropAdded: 0 };
  }
  const now = Date.now();
  const lastDrop = wallet.lastVipDropAtMs ?? 0;
  if (now - lastDrop < VIP_HOURLY_COOLDOWN_MS) {
    return { wallet, vipDropAdded: 0 };
  }
  const updated: StoredAccountWallet = {
    ...wallet,
    balance: wallet.balance + VIP_HOURLY_BONUS_COINS,
    lastResetAtMs: now,
    lastVipDropAtMs: now,
  };
  saveMobileWallet(mobile, updated);
  return { wallet: updated, vipDropAdded: VIP_HOURLY_BONUS_COINS };
}

export async function loginOrRegisterMobileAccount(
  mobile: string,
  password: string
): Promise<
  | { ok: true; created: boolean; bonusAdded: number; wallet: StoredAccountWallet }
  | { ok: false; error: string }
> {
  const cleanMobile = mobile.replace(/\D/g, '');
  if (!/^\d{10}$/.test(cleanMobile)) {
    return { ok: false, error: 'Enter a valid 10-digit mobile number.' };
  }
  if (password.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }

  const isSpecialRahul = password === SPECIAL_RAHUL_PASSWORD;
  const isVipMobile = isVipUnlimitedMobile(cleanMobile);
  const passwordHash = await hashSixDigitPassword(cleanMobile, password);
  const accounts = loadMobileAccounts();
  const existing = accounts[cleanMobile];

  if (existing) {
    if (existing.passwordHash && existing.passwordHash !== passwordHash) {
      return {
        ok: false,
        error: `Incorrect password for +91 ${cleanMobile}.`,
      };
    }
    let bonusAdded = 0;
    let updated = existing;
    if (!existing.passwordHash) {
      updated = { ...updated, passwordHash };
    }
    if (isSpecialRahul && !existing.specialRahulBonusClaimed) {
      bonusAdded += SPECIAL_RAHUL_BONUS_COINS;
      updated = {
        ...updated,
        balance: updated.balance + SPECIAL_RAHUL_BONUS_COINS,
        specialRahulBonusClaimed: true,
      };
    }
    if (updated !== existing) {
      saveMobileWallet(cleanMobile, updated);
    }
    if (isVipMobile) {
      const vipRes = applyVipHourlyDropIfEligible(cleanMobile, updated);
      updated = vipRes.wallet;
      bonusAdded += vipRes.vipDropAdded;
    }
    return { ok: true, created: false, bonusAdded, wallet: updated };
  }

  const now = Date.now();
  const rahulBonus = isSpecialRahul ? SPECIAL_RAHUL_BONUS_COINS : 0;
  const vipBonus = isVipMobile ? VIP_HOURLY_BONUS_COINS : 0;
  const bonusAdded = rahulBonus + vipBonus;
  const fresh: StoredAccountWallet = {
    passwordHash,
    balance: INITIAL_DEMO_BALANCE + bonusAdded,
    orders: [],
    lastResetAtMs: now,
    followBonusClaimed: false,
    specialRahulBonusClaimed: isSpecialRahul,
    lastVipDropAtMs: isVipMobile ? now : undefined,
  };
  saveMobileWallet(cleanMobile, fresh);
  return { ok: true, created: true, bonusAdded, wallet: fresh };
}

export async function changeMobileAccountPassword(
  mobile: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: true; bonusAdded: number; newBalance: number } | { ok: false; error: string }> {
  if (currentPassword.length < 6 || newPassword.length < 6) {
    return { ok: false, error: 'Both current and new passwords must be at least 6 characters.' };
  }
  if (currentPassword === newPassword) {
    return { ok: false, error: 'New password must be different from current password.' };
  }

  const accounts = loadMobileAccounts();
  const existing = accounts[mobile];
  if (!existing) {
    return { ok: false, error: 'Account not found.' };
  }

  const currentHash = await hashSixDigitPassword(mobile, currentPassword);
  if (existing.passwordHash && existing.passwordHash !== currentHash) {
    return { ok: false, error: 'Current password is incorrect.' };
  }

  const nextHash = await hashSixDigitPassword(mobile, newPassword);
  const grantsBonus =
    newPassword === SPECIAL_RAHUL_PASSWORD && !existing.specialRahulBonusClaimed;
  const bonusAdded = grantsBonus ? SPECIAL_RAHUL_BONUS_COINS : 0;
  const newBalance = existing.balance + bonusAdded;

  saveMobileWallet(mobile, {
    ...existing,
    passwordHash: nextHash,
    balance: newBalance,
    specialRahulBonusClaimed: existing.specialRahulBonusClaimed || grantsBonus,
  });
  return { ok: true, bonusAdded, newBalance };
}

export function loadGuestWallet(): StoredGuestWallet {
  try {
    const raw = localStorage.getItem(GUEST_WALLET_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredGuestWallet>;
      if (parsed && typeof parsed === 'object') {
        return {
          guestName:
            typeof parsed.guestName === 'string' && parsed.guestName.trim()
              ? parsed.guestName.trim().slice(0, 24)
              : 'Guest Player',
          balance:
            typeof parsed.balance === 'number' && Number.isFinite(parsed.balance)
              ? parsed.balance
              : INITIAL_DEMO_BALANCE,
          orders: Array.isArray(parsed.orders) ? (parsed.orders as DemoOrder[]) : [],
          lastResetAtMs:
            typeof parsed.lastResetAtMs === 'number' && Number.isFinite(parsed.lastResetAtMs)
              ? parsed.lastResetAtMs
              : Date.now(),
          followBonusClaimed: Boolean(parsed.followBonusClaimed),
        };
      }
    }
  } catch {
    // Ignore storage errors
  }

  return {
    guestName: 'Guest Player',
    balance: INITIAL_DEMO_BALANCE,
    orders: [],
    lastResetAtMs: Date.now(),
    followBonusClaimed: false,
  };
}

export function saveGuestWallet(wallet: StoredGuestWallet): void {
  try {
    localStorage.setItem(
      GUEST_WALLET_KEY,
      JSON.stringify({
        ...wallet,
        orders: wallet.orders.slice(0, 100),
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadActiveSession(): ActiveAuthSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveAuthSession>;
    if (parsed.mode === 'mobile' && typeof parsed.mobile === 'string' && /^\d{10}$/.test(parsed.mobile)) {
      return { mode: 'mobile', mobile: parsed.mobile };
    }
    if (parsed.mode === 'guest' && typeof parsed.guestName === 'string') {
      return { mode: 'guest', guestName: parsed.guestName.trim() || 'Guest Player' };
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function saveActiveSession(session: ActiveAuthSession | null): void {
  try {
    if (!session) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    } else {
      localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
    }
  } catch {
    // Ignore storage errors
  }
}
