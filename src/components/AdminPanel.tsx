import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Copy,
  History,
  MinusCircle,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { auth, db } from '../firebase';
import type {
  AdminTransactionRecord,
  AdminUserSummary,
  WalletTransaction,
} from '../types/trading';
import { ApiError, apiRequest } from '../utils/apiClient';
import { formatCurrency } from '../utils/tradingEngine';

interface AdminPanelProps {
  adminUid: string;
  adminPublicUid?: string;
  adminEmail: string;
  adminVerified?: boolean;
  onBackToGames: () => void;
  onToast?: (msg: string) => void;
}

const QUICK_AMOUNTS = [1_000, 10_000, 100_000, 1_000_000, 10_000_000];
const QUICK_REASONS = [
  'Bonus Reward',
  'Event Prize Credit',
  'Balance Correction',
  'Admin Deduction',
];

function formatDateTime(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  adminUid,
  adminPublicUid,
  adminEmail,
  adminVerified = false,
  onBackToGames,
  onToast,
}) => {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [adminTransactions, setAdminTransactions] = useState<AdminTransactionRecord[]>([]);
  const [selectedUserTransactions, setSelectedUserTransactions] = useState<WalletTransaction[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [loadingTx, setLoadingTx] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userTxError, setUserTxError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedUid, setSelectedUid] = useState<string>('');
  const selectedUidRef = useRef<string>('');
  selectedUidRef.current = selectedUid;

  const [operation, setOperation] = useState<'add' | 'deduct'>('add');
  const [amountInput, setAmountInput] = useState<string>('10000');
  const [reasonInput, setReasonInput] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);
  const [historyView, setHistoryView] = useState<'admin' | 'user'>('admin');
  const [copiedUid, setCopiedUid] = useState<string | null>(null);

  const fetchAdminData = useCallback(
    async (targetUidForTx?: string, silent = false) => {
      if (!adminVerified || !adminUid) {
        setLoadingUsers(false);
        setLoadingTx(false);
        return;
      }

      await auth.authStateReady();
      if (!auth.currentUser || auth.currentUser.uid !== adminUid) {
        setLoadingUsers(false);
        setLoadingTx(false);
        setLoadError('Please sign in with your verified admin Firebase account.');
        return;
      }

      if (!silent) {
        setLoadingUsers(true);
        setLoadingTx(true);
      }
      setLoadError(null);
      try {
        const uidParam = targetUidForTx || selectedUidRef.current || undefined;
        const txQuery = uidParam
          ? `/api/admin/transactions?uid=${encodeURIComponent(uidParam)}`
          : '/api/admin/transactions';

        const [usersRes, txRes] = await Promise.all([
          apiRequest<{ ok?: boolean; users?: AdminUserSummary[] }>('/api/admin/users', {
            method: 'GET',
          }),
          apiRequest<{
            ok?: boolean;
            adminTransactions?: AdminTransactionRecord[];
            userTransactions?: WalletTransaction[];
          }>(txQuery, { method: 'GET' }),
        ]);

        const safeUsers = Array.isArray(usersRes?.users)
          ? usersRes.users.filter(
              (u): u is AdminUserSummary =>
                Boolean(u && typeof u === 'object' && typeof u.uid === 'string' && u.uid.length > 0)
            )
          : [];
        const safeAdminTx = Array.isArray(txRes?.adminTransactions)
          ? txRes.adminTransactions
          : [];
        const safeUserTx = Array.isArray(txRes?.userTransactions)
          ? txRes.userTransactions
          : [];

        setUsers(safeUsers);
        setAdminTransactions(safeAdminTx);
        if (uidParam) {
          setSelectedUserTransactions(safeUserTx);
        }

        const nextSelectedUid =
          selectedUidRef.current && safeUsers.some((u) => u.uid === selectedUidRef.current)
            ? selectedUidRef.current
            : (safeUsers[0]?.uid ?? '');
        setSelectedUid(nextSelectedUid);
      } catch (err) {
        const msg =
          err instanceof ApiError || err instanceof Error
            ? err.message
            : 'Failed to load Admin Panel data.';
        setLoadError(msg);
      } finally {
        setLoadingUsers(false);
        setLoadingTx(false);
      }
    },
    [adminVerified, adminUid]
  );

  useEffect(() => {
    if (!adminVerified || !adminUid) return;
    void fetchAdminData(selectedUidRef.current || undefined, false);
  }, [fetchAdminData, adminVerified, adminUid]);

  // Real-time refresh interval for registered user list & global ledger
  useEffect(() => {
    if (!adminVerified || !adminUid) return;
    const id = window.setInterval(() => {
      void fetchAdminData(selectedUidRef.current || undefined, true);
    }, 10000);
    return () => window.clearInterval(id);
  }, [fetchAdminData, adminVerified, adminUid]);

  // Real-time Firestore listener for the currently selected user's wallet balance
  useEffect(() => {
    if (!adminVerified || !adminUid || !selectedUid) {
      setSelectedUserTransactions([]);
      return;
    }

    let cancelled = false;
    const userDocRef = doc(db, 'users', selectedUid);
    const unsub = onSnapshot(
      userDocRef,
      (snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data() ?? {};
        const liveBalance =
          typeof data.balance === 'number' && Number.isFinite(data.balance) ? data.balance : 0;
        setUsers((prev) =>
          prev.map((u) =>
            u.uid === selectedUid
              ? {
                  ...u,
                  balance: liveBalance,
                  publicUid:
                    typeof data.publicUid === 'string' && data.publicUid
                      ? data.publicUid
                      : u.publicUid,
                  displayName: String(data.displayName || u.displayName || 'Player'),
                  email: String(data.email || u.email || ''),
                }
              : u
          )
        );
      },
      () => {
        // Ignore snapshot error if selected user only exists in Auth without Firestore wallet yet
      }
    );

    void auth.authStateReady().then(() => {
      if (cancelled || auth.currentUser?.uid !== adminUid) return;
      setUserTxError(null);
      return apiRequest<{
        ok?: boolean;
        adminTransactions?: AdminTransactionRecord[];
        userTransactions?: WalletTransaction[];
      }>(`/api/admin/transactions?uid=${encodeURIComponent(selectedUid)}`, { method: 'GET' })
        .then((res) => {
          if (!cancelled) {
            setSelectedUserTransactions(
              Array.isArray(res?.userTransactions) ? res.userTransactions : []
            );
          }
        })
        .catch((err) => {
          if (!cancelled) {
            setSelectedUserTransactions([]);
            setUserTxError(
              err instanceof ApiError || err instanceof Error
                ? err.message
                : 'Failed to load user transaction ledger.'
            );
          }
        });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [adminVerified, adminUid, selectedUid]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.publicUid || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.uid || '').toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  const selectedUser = useMemo(
    () => users.find((u) => u.uid === selectedUid) || null,
    [users, selectedUid]
  );

  const totalCoinsAcrossUsers = useMemo(
    () => users.reduce((sum, u) => sum + (Number.isFinite(u?.balance) ? u.balance : 0), 0),
    [users]
  );

  const parsedAmount = Number(amountInput);
  const isValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const selectedBalance =
    selectedUser && Number.isFinite(selectedUser.balance) ? selectedUser.balance : 0;
  const previewBalance = selectedUser
    ? operation === 'add'
      ? selectedBalance + (isValidAmount ? parsedAmount : 0)
      : selectedBalance - (isValidAmount ? parsedAmount : 0)
    : 0;

  const handleCopyUid = async (uid: string) => {
    try {
      await navigator.clipboard.writeText(uid);
      setCopiedUid(uid);
      window.setTimeout(() => setCopiedUid((cur) => (cur === uid ? null : cur)), 1500);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleWalletAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError(null);
    setAdjustSuccess(null);

    if (!selectedUser) {
      setAdjustError('Select a registered user first.');
      return;
    }
    if (!isValidAmount) {
      setAdjustError('Enter a valid positive coin amount.');
      return;
    }
    const cleanReason = reasonInput.trim();
    if (cleanReason.length < 3) {
      setAdjustError('Enter a reason (at least 3 characters).');
      return;
    }
    if (operation === 'deduct' && previewBalance < 0) {
      setAdjustError(
        `Cannot deduct ${formatCurrency(parsedAmount)} DC — user balance is ${formatCurrency(selectedUser.balance)} DC.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        balance: number;
        transaction: AdminTransactionRecord;
      }>('/api/admin/wallet-adjust', {
        method: 'POST',
        body: {
          targetUid: selectedUser.uid,
          operation,
          amount: parsedAmount,
          reason: cleanReason,
        },
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.uid === selectedUser.uid ? { ...u, balance: res.balance, updatedAtMs: Date.now() } : u
        )
      );
      if (res?.transaction) {
        setAdminTransactions((prev) => [res.transaction, ...prev]);
      }
      setReasonInput('');
      const updatedBalance =
        typeof res?.balance === 'number' && Number.isFinite(res.balance) ? res.balance : selectedBalance;
      const msg = `${operation === 'add' ? 'Added' : 'Deducted'} ${formatCurrency(parsedAmount)} DC ${operation === 'add' ? 'to' : 'from'} ${selectedUser.email || selectedUser.displayName}. New balance: ${formatCurrency(updatedBalance)} DC`;
      setAdjustSuccess(msg);
      onToast?.(msg);
      void fetchAdminData(selectedUser.uid, true);
    } catch (err) {
      const msg =
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'Failed to update wallet balance.';
      setAdjustError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!adminVerified || !adminUid) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs font-semibold text-slate-600">
        Verifying administrator permissions...
      </section>
    );
  }

  return (
    <section id="admin-panel" className="space-y-4">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Verified Admin Panel · Server-Validated</span>
          </div>
          <h1 className="font-display text-lg font-extrabold tracking-tight sm:text-xl">
            Wallet &amp; User Administration
          </h1>
          <p className="text-xs text-slate-300 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              Signed in as <span className="font-semibold text-white">{adminEmail || adminUid}</span>
            </span>
            {adminPublicUid && (
              <span className="inline-flex items-center rounded bg-indigo-500/30 border border-indigo-400/40 px-1.5 py-0.5 font-mono text-[11px] font-bold text-indigo-100">
                ID: {adminPublicUid}
              </span>
            )}
            <span className="text-slate-400">
              · Auth UID: <span className="font-mono text-[11px] text-indigo-200">{adminUid}</span>
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchAdminData(selectedUid || undefined, false)}
            disabled={loadingUsers}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/20 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh Live Data</span>
          </button>

          <button
            type="button"
            onClick={onBackToGames}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-900 transition-colors hover:bg-slate-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Games</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void fetchAdminData(selectedUid || undefined, false)}
            disabled={loadingUsers}
            className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Registered Users</span>
            <Users className="h-4 w-4 text-blue-600" aria-hidden="true" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-extrabold text-slate-900 tabular-nums">
            {loadError && users.length === 0 ? '—' : users.length.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total User Balances</span>
            <Wallet className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-extrabold text-emerald-700 tabular-nums">
            {loadError && users.length === 0 ? '—' : `${formatCurrency(totalCoinsAcrossUsers)} DC`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Admin Adjustments</span>
            <History className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          </div>
          <p className="mt-1.5 font-mono text-2xl font-extrabold text-indigo-700 tabular-nums">
            {loadError && adminTransactions.length === 0 ? '—' : adminTransactions.length.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Main Responsive Grid: Users Directory + Coin Adjustment Form */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Registered Users List & Search */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Registered Users
              </h2>
              <p className="text-xs text-slate-500">
                Tap any user to view live balance and add or deduct coins.
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-md bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-700">
              {filteredUsers.length} shown
            </span>
          </div>

          <div className="relative mt-3">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by 6-digit UID, email, display name, or Auth UID..."
              aria-label="Search registered users"
              className="h-10 w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
            />
          </div>

          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {loadingUsers && users.length === 0 ? (
              <p className="py-8 text-center text-xs font-medium text-slate-500">
                Loading registered users...
              </p>
            ) : filteredUsers.length === 0 ? (
              <p className="py-8 text-center text-xs font-medium text-slate-500">
                {users.length === 0 ? 'No registered users yet.' : 'No matching users found.'}
              </p>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = u.uid === selectedUid;
                return (
                  <div
                    key={u.uid}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedUid(u.uid);
                      setAdjustError(null);
                      setAdjustSuccess(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedUid(u.uid);
                      }
                    }}
                    className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors cursor-pointer sm:flex-row sm:items-center sm:justify-between ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-900 truncate">
                          {u.displayName || 'OG Player'}
                        </span>
                        {u.publicUid && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-extrabold text-slate-900 tabular-nums">
                            <span>ID: {u.publicUid}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleCopyUid(u.publicUid!);
                              }}
                              title="Copy 6-digit UID"
                              className="inline-flex items-center text-slate-500 hover:text-slate-900"
                            >
                              <Copy className="h-3 w-3" aria-hidden="true" />
                            </button>
                            {copiedUid === u.publicUid && (
                              <span className="font-sans text-[10px] font-bold text-emerald-700">
                                Copied
                              </span>
                            )}
                          </span>
                        )}
                        {u.isAdmin && (
                          <span className="inline-flex items-center gap-1 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                            ADMIN
                          </span>
                        )}
                        {isSelected && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            <UserCheck className="h-3 w-3" aria-hidden="true" />
                            Selected
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-slate-600 truncate">
                        {u.email || 'No email'}
                      </p>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                        <span className="truncate max-w-[180px] sm:max-w-[230px]">Auth: {u.uid}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopyUid(u.uid);
                          }}
                          title="Copy Firebase Auth UID"
                          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-sans font-semibold text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                        >
                          <Copy className="h-3 w-3" aria-hidden="true" />
                          <span>{copiedUid === u.uid ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 sm:border-t-0 sm:pt-0 sm:text-right">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Wallet Balance
                        </div>
                        <div className="font-mono text-sm font-extrabold text-emerald-700 tabular-nums">
                          {formatCurrency(u.balance)} DC
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 tabular-nums">
                          {u.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} DC
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Atomic Coin Add / Deduct Control */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Coins className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900">
              Adjust User Wallet
            </h2>
          </div>

          {!selectedUser ? (
            <p className="py-10 text-center text-xs text-slate-500">
              Select a user from the list to add or deduct coins.
            </p>
          ) : (
            <form onSubmit={handleWalletAdjust} className="mt-3 space-y-3.5" noValidate>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold text-slate-500">Selected User</div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {selectedUser.displayName}
                      </span>
                      {selectedUser.publicUid && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-800 tabular-nums">
                          ID: {selectedUser.publicUid}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 truncate">{selectedUser.email}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-semibold text-slate-400">Live Balance</div>
                    <div className="font-mono text-sm font-extrabold text-emerald-700 tabular-nums">
                      {formatCurrency(selectedUser.balance)} DC
                    </div>
                  </div>
                </div>
              </div>

              {/* Operation Selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOperation('add');
                    setAdjustError(null);
                  }}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border text-xs font-bold transition-colors ${
                    operation === 'add'
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <PlusCircle className="h-4 w-4" aria-hidden="true" />
                  <span>Add Coins</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOperation('deduct');
                    setAdjustError(null);
                  }}
                  className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border text-xs font-bold transition-colors ${
                    operation === 'deduct'
                      ? 'border-rose-600 bg-rose-600 text-white shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <MinusCircle className="h-4 w-4" aria-hidden="true" />
                  <span>Deduct Coins</span>
                </button>
              </div>

              {/* Amount Input + Quick Chips */}
              <div>
                <label htmlFor="admin-coin-amount" className="block text-xs font-semibold text-slate-700">
                  Coin Amount (DC)
                </label>
                <input
                  id="admin-coin-amount"
                  type="number"
                  min={1}
                  step="any"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    if (adjustError) setAdjustError(null);
                    if (adjustSuccess) setAdjustSuccess(null);
                  }}
                  disabled={submitting}
                  placeholder="Enter amount (e.g. 10000)"
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-sm font-bold text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_AMOUNTS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setAmountInput(String(amt));
                        setAdjustError(null);
                      }}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                    >
                      {formatCurrency(amt)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason Input */}
              <div>
                <label htmlFor="admin-coin-reason" className="block text-xs font-semibold text-slate-700">
                  Transaction Reason (Required)
                </label>
                <input
                  id="admin-coin-reason"
                  type="text"
                  maxLength={200}
                  value={reasonInput}
                  onChange={(e) => {
                    setReasonInput(e.target.value);
                    if (adjustError) setAdjustError(null);
                  }}
                  disabled={submitting}
                  placeholder="e.g. Bonus reward, manual adjustment..."
                  className="mt-1.5 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUICK_REASONS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setReasonInput(preset);
                        setAdjustError(null);
                      }}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Balance Preview */}
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <span className="font-semibold text-slate-600">New Balance Preview:</span>
                <span
                  className={`font-mono font-extrabold tabular-nums ${
                    previewBalance < 0 ? 'text-rose-600' : 'text-slate-900'
                  }`}
                >
                  {formatCurrency(previewBalance)} DC
                </span>
              </div>

              {adjustError && (
                <p
                  role="alert"
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                >
                  {adjustError}
                </p>
              )}

              {adjustSuccess && (
                <p
                  role="status"
                  className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
                  <span>{adjustSuccess}</span>
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-white transition-colors disabled:opacity-60 ${
                  operation === 'add'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {operation === 'add' ? (
                  <PlusCircle className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <MinusCircle className="h-4 w-4" aria-hidden="true" />
                )}
                <span>
                  {submitting
                    ? 'Processing Atomic Update...'
                    : operation === 'add'
                      ? 'Confirm Add Coins'
                      : 'Confirm Deduct Coins'}
                </span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Transaction History Ledger */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col gap-2.5 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Transaction History
            </h2>
            <p className="text-xs text-slate-500">
              Immutable ledger recording amount, reason, timestamp, and admin UID.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center">
            <button
              type="button"
              onClick={() => setHistoryView('admin')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                historyView === 'admin'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Admin Adjustments ({adminTransactions.length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryView('user')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                historyView === 'user'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              Selected User Ledger ({selectedUserTransactions.length})
            </button>
          </div>
        </div>

        {historyView === 'admin' ? (
          loadingTx && adminTransactions.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Loading transaction history...</p>
          ) : adminTransactions.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No admin coin adjustments recorded yet.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-3 py-2.5 font-bold">Time</th>
                    <th className="px-3 py-2.5 font-bold">User</th>
                    <th className="px-3 py-2.5 font-bold">Amount</th>
                    <th className="px-3 py-2.5 font-bold">Balance Before → After</th>
                    <th className="px-3 py-2.5 font-bold">Reason</th>
                    <th className="px-3 py-2.5 font-bold">Admin UID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adminTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {formatDateTime(tx.createdAtMs)}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-slate-900">{tx.targetName || 'Player'}</span>
                          {tx.targetPublicUid && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700 tabular-nums">
                              ID: {tx.targetPublicUid}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">{tx.targetEmail}</div>
                      </td>
                      <td
                        className={`px-3 py-2.5 font-mono font-extrabold whitespace-nowrap tabular-nums ${
                          tx.type === 'add' ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {tx.type === 'add' ? '+' : '-'}
                        {formatCurrency(tx.amount)} DC
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap tabular-nums">
                        {formatCurrency(tx.balanceBefore)} →{' '}
                        <span className="font-bold text-slate-900">
                          {formatCurrency(tx.balanceAfter)} DC
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-800">{tx.reason}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                        {tx.adminUid}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : userTxError ? (
          <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
            {userTxError}
          </p>
        ) : selectedUserTransactions.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">
            No transactions found for the selected user.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-2.5 font-bold">Time</th>
                  <th className="px-3 py-2.5 font-bold">Type</th>
                  <th className="px-3 py-2.5 font-bold">Amount</th>
                  <th className="px-3 py-2.5 font-bold">Balance Before → After</th>
                  <th className="px-3 py-2.5 font-bold">Description / Reason</th>
                  <th className="px-3 py-2.5 font-bold">Admin UID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedUserTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                      {formatDateTime(tx.createdAtMs)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] font-semibold text-slate-700">
                      {tx.type}
                    </td>
                    <td
                      className={`px-3 py-2.5 font-mono font-extrabold whitespace-nowrap tabular-nums ${
                        tx.amount >= 0 ? 'text-emerald-700' : 'text-rose-600'
                      }`}
                    >
                      {tx.amount >= 0 ? '+' : ''}
                      {formatCurrency(tx.amount)} DC
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-700 whitespace-nowrap tabular-nums">
                      {formatCurrency(tx.balanceBefore)} →{' '}
                      <span className="font-bold text-slate-900">
                        {formatCurrency(tx.balanceAfter)} DC
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-800">{tx.reason || tx.description}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
                      {tx.adminUid || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
