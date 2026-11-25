import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { Eye, EyeOff, KeyRound, LogIn, Mail, Shield, Smartphone, User, UserCheck } from 'lucide-react';
import { auth } from '../firebase';
import type { UserProfile } from '../types/trading';
import { ApiError, apiRequest } from '../utils/apiClient';
import type { StoredAccountWallet } from '../utils/mobileAuth';

interface GuestLoginProps {
  onMobileLogin?: (
    mobile: string,
    wallet: StoredAccountWallet,
    created: boolean,
    bonusAdded: number
  ) => void;
  onGuestLogin: (guestName: string) => void;
  onFirebaseAuthBusyChange?: (busy: boolean) => void;
  onFirebaseBootstrapComplete?: (payload: {
    uid: string;
    created?: boolean;
    isAdmin?: boolean;
    profile?: UserProfile;
  }) => void;
  initialError?: string | null;
}

function mapFirebaseAuthError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message;
  }
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Switch to Sign In.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled in Firebase Authentication settings.';
    case 'auth/user-disabled':
      return 'Your account has been suspended by an administrator.';
    case 'auth/network-request-failed':
      return 'Network error while contacting Firebase Authentication. Please check your connection.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed.';
  }
}

function buildMobileAuthEmail(cleanMobile: string): string {
  return `m91${cleanMobile}@mobile.ogtrade.app`;
}

export const GuestLogin: React.FC<GuestLoginProps> = ({
  onGuestLogin,
  onFirebaseAuthBusyChange,
  onFirebaseBootstrapComplete,
  initialError = null,
}) => {
  const [authTab, setAuthTab] = useState<'email' | 'mobile'>('email');
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  const [mobileMode, setMobileMode] = useState<'signin' | 'signup'>('signin');
  const [mobilePlayerName, setMobilePlayerName] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  React.useEffect(() => {
    if (initialError) {
      setError(initialError);
    }
  }, [initialError]);

  const clearIncompleteFirebaseAuth = async () => {
    if (auth.currentUser) {
      try {
        await signOut(auth);
      } catch {
        // Ignore signOut cleanup errors
      }
    }
    onFirebaseAuthBusyChange?.(false);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (emailPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    onFirebaseAuthBusyChange?.(true);
    let keepBusyForRetry = false;
    try {
      const cleanName = displayName.trim().slice(0, 40);
      let targetUser = auth.currentUser;

      if (emailMode === 'signup') {
        const sameEmailSignedIn =
          Boolean(targetUser?.email) &&
          targetUser!.email!.toLowerCase() === trimmedEmail.toLowerCase();

        if (!sameEmailSignedIn) {
          if (targetUser) {
            await signOut(auth);
          }
          const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, emailPassword);
          targetUser = cred.user;
        }

        if (targetUser && cleanName && targetUser.displayName !== cleanName) {
          await updateProfile(targetUser, { displayName: cleanName });
          await targetUser.reload();
        }
      } else {
        if (targetUser) {
          await signOut(auth);
        }
        const cred = await signInWithEmailAndPassword(auth, trimmedEmail, emailPassword);
        targetUser = cred.user;
      }

      if (!targetUser) {
        throw new Error('Firebase authentication session was not initialized.');
      }

      // Refresh token so updated displayName / email claims are sent to backend
      await targetUser.getIdToken(true);

      // Synchronize Firebase Auth user into Firestore users collection before leaving login
      const bootstrapRes = await apiRequest<{
        ok?: boolean;
        created?: boolean;
        isAdmin?: boolean;
        profile?: UserProfile;
      }>('/api/user/bootstrap', {
        method: 'POST',
        body: emailMode === 'signup' ? { displayName: cleanName } : {},
      });

      if (!bootstrapRes?.profile || typeof bootstrapRes.profile !== 'object') {
        throw new Error('Backend failed to initialize your user profile in Firestore.');
      }

      onFirebaseBootstrapComplete?.({
        uid: targetUser.uid,
        created: bootstrapRes.created,
        isAdmin: bootstrapRes.isAdmin,
        profile: bootstrapRes.profile,
      });
    } catch (err) {
      const isSuspendedErr =
        err instanceof ApiError &&
        err.status === 403 &&
        err.message.toLowerCase().includes('suspended');
      if (isSuspendedErr) {
        await clearIncompleteFirebaseAuth();
        keepBusyForRetry = false;
      } else if (auth.currentUser) {
        // Keep user on login screen to display the backend sync error and allow direct retry
        keepBusyForRetry = true;
      }
      setError(mapFirebaseAuthError(err));
    } finally {
      if (!keepBusyForRetry) {
        onFirebaseAuthBusyChange?.(false);
      }
      setSubmitting(false);
    }
  };

  const handleMobileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanMobile = mobile.replace(/\D/g, '');
    if (!/^\d{10}$/.test(cleanMobile)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const mobileAliasEmail = buildMobileAuthEmail(cleanMobile);
    const cleanPlayerName = mobilePlayerName.trim().slice(0, 40);
    const resolvedDisplayName =
      mobileMode === 'signup' && cleanPlayerName ? cleanPlayerName : `+91 ${cleanMobile}`;

    setSubmitting(true);
    onFirebaseAuthBusyChange?.(true);
    let keepBusyForRetry = false;
    try {
      let targetUser = auth.currentUser;

      if (mobileMode === 'signup') {
        const sameMobileSignedIn =
          Boolean(targetUser?.email) &&
          targetUser!.email!.toLowerCase() === mobileAliasEmail.toLowerCase();

        if (!sameMobileSignedIn) {
          if (targetUser) {
            await signOut(auth);
          }

          try {
            const cred = await createUserWithEmailAndPassword(auth, mobileAliasEmail, password);
            targetUser = cred.user;
          } catch (createErr) {
            const createCode = (createErr as { code?: string })?.code || '';
            if (createCode === 'auth/email-already-in-use') {
              throw new Error(
                `An account for +91 ${cleanMobile} already exists. Switch to Existing User Sign In.`
              );
            }
            throw createErr;
          }
        }

        if (targetUser && resolvedDisplayName && targetUser.displayName !== resolvedDisplayName) {
          await updateProfile(targetUser, { displayName: resolvedDisplayName });
          await targetUser.reload();
        }
      } else {
        if (targetUser) {
          await signOut(auth);
        }

        try {
          const signInCred = await signInWithEmailAndPassword(auth, mobileAliasEmail, password);
          targetUser = signInCred.user;
        } catch (signInErr) {
          const signInCode = (signInErr as { code?: string })?.code || '';
          if (
            signInCode === 'auth/user-not-found' ||
            signInCode === 'auth/wrong-password' ||
            signInCode === 'auth/invalid-credential' ||
            signInCode === 'auth/invalid-login-credentials'
          ) {
            throw new Error(
              `Invalid mobile number or password for +91 ${cleanMobile}. New user? Switch to New Account Register.`
            );
          }
          throw signInErr;
        }
      }

      if (!targetUser) {
        throw new Error('Firebase mobile authentication session was not initialized.');
      }

      await targetUser.getIdToken(true);

      const bootstrapRes = await apiRequest<{
        ok?: boolean;
        created?: boolean;
        isAdmin?: boolean;
        profile?: UserProfile;
      }>('/api/user/bootstrap', {
        method: 'POST',
        body: mobileMode === 'signup' ? { displayName: resolvedDisplayName } : {},
      });

      if (!bootstrapRes?.profile || typeof bootstrapRes.profile !== 'object') {
        throw new Error('Backend failed to initialize your mobile profile in Firestore.');
      }

      onFirebaseBootstrapComplete?.({
        uid: targetUser.uid,
        created: bootstrapRes.created,
        isAdmin: bootstrapRes.isAdmin,
        profile: bootstrapRes.profile,
      });
    } catch (err) {
      const isSuspendedErr =
        err instanceof ApiError &&
        err.status === 403 &&
        err.message.toLowerCase().includes('suspended');
      if (isSuspendedErr) {
        await clearIncompleteFirebaseAuth();
        keepBusyForRetry = false;
      } else if (auth.currentUser) {
        keepBusyForRetry = true;
      }
      setError(mapFirebaseAuthError(err));
    } finally {
      if (!keepBusyForRetry) {
        onFirebaseAuthBusyChange?.(false);
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900 flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-4 px-4 py-3 sm:gap-8 sm:px-6">
          <span className="font-display text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            OG TRADE
          </span>
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
            Demo Trading &amp; Jhandi Munda
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-3 py-6 sm:px-6 sm:py-10">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:p-8">
          {/* Auth Method Tabs */}
          <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setAuthTab('email');
                setError(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition-colors ${
                authTab === 'email'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" aria-hidden="true" />
              <span>Email Account</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthTab('mobile');
                setError(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-bold transition-colors ${
                authTab === 'mobile'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
              <span>Mobile (+91)</span>
            </button>
          </div>

          {authTab === 'email' ? (
            <>
              <div className="mt-5 mb-4">
                <div className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">
                  <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Cloud Synced · Email &amp; Admin Access</span>
                </div>
                <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-slate-900">
                  {emailMode === 'signin' ? 'Sign In' : 'Create Account'}
                </h1>
                <p className="mt-1.5 text-sm text-slate-600">
                  {emailMode === 'signin'
                    ? 'Sign in with your Firebase Email & Password to sync your live DC wallet.'
                    : 'Register a new account with 10K DC starting balance synced in real time.'}
                </p>
              </div>

              <div className="mb-4 flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setEmailMode('signin');
                    setError(null);
                  }}
                  className={`flex-1 rounded-lg border py-2 font-bold transition-colors ${
                    emailMode === 'signin'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Existing User Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmailMode('signup');
                    setError(null);
                  }}
                  className={`flex-1 rounded-lg border py-2 font-bold transition-colors ${
                    emailMode === 'signup'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  New Account Register
                </button>
              </div>

              <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
                {emailMode === 'signup' && (
                  <div>
                    <label
                      htmlFor="login-display-name"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Player Name (Optional)
                    </label>
                    <div className="relative mt-1.5 flex items-center">
                      <User
                        className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        id="login-display-name"
                        type="text"
                        maxLength={40}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        disabled={submitting}
                        placeholder="e.g. Rahul"
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 disabled:bg-slate-50"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Email Address
                  </label>
                  <div className="relative mt-1.5 flex items-center">
                    <Mail
                      className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (error) setError(null);
                      }}
                      disabled={submitting}
                      placeholder="you@example.com"
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-email-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Password (6+ chars)
                  </label>
                  <div className="relative mt-1.5 flex items-center">
                    <KeyRound
                      className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="login-email-password"
                      type={showEmailPassword ? 'text' : 'password'}
                      autoComplete={emailMode === 'signin' ? 'current-password' : 'new-password'}
                      value={emailPassword}
                      onChange={(e) => {
                        setEmailPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      disabled={submitting}
                      placeholder="Enter password (min 6 chars)"
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-10 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 disabled:bg-slate-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEmailPassword((prev) => !prev)}
                      aria-label={showEmailPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showEmailPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white transition-colors hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {submitting
                      ? emailMode === 'signin'
                        ? 'Signing in...'
                        : 'Creating account...'
                      : emailMode === 'signin'
                        ? 'Sign In with Email'
                        : 'Create Firebase Account'}
                  </span>
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mt-5 mb-4">
                <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                  <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Cloud Synced · Mobile (+91) &amp; Password</span>
                </div>
                <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-slate-900">
                  {mobileMode === 'signin' ? 'Sign In with Mobile' : 'Create Mobile Account'}
                </h1>
                <p className="mt-1.5 text-sm text-slate-600">
                  {mobileMode === 'signin'
                    ? 'Sign in with your 10-digit mobile number and password to sync your live DC wallet.'
                    : 'Create a new account with your +91 mobile number and get 10K DC starting balance.'}
                </p>
              </div>

              <div className="mb-4 flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMode('signin');
                    setError(null);
                  }}
                  className={`flex-1 rounded-lg border py-2 font-bold transition-colors ${
                    mobileMode === 'signin'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Existing User Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMode('signup');
                    setError(null);
                  }}
                  className={`flex-1 rounded-lg border py-2 font-bold transition-colors ${
                    mobileMode === 'signup'
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  New Account Register
                </button>
              </div>

              <form onSubmit={handleMobileSubmit} className="space-y-4" noValidate>
                {mobileMode === 'signup' && (
                  <div>
                    <label
                      htmlFor="login-mobile-display-name"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Player Name (Optional)
                    </label>
                    <div className="relative mt-1.5 flex items-center">
                      <User
                        className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        id="login-mobile-display-name"
                        type="text"
                        maxLength={40}
                        value={mobilePlayerName}
                        onChange={(e) => setMobilePlayerName(e.target.value)}
                        disabled={submitting}
                        placeholder="e.g. Rahul"
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 disabled:bg-slate-50"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="login-mobile"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Mobile Number (+91)
                  </label>
                  <div className="relative mt-1.5 flex items-center">
                    <span className="inline-flex h-11 items-center gap-1.5 rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 font-mono text-xs font-bold text-slate-700 shrink-0">
                      <Smartphone className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                      +91
                    </span>
                    <input
                      id="login-mobile"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      value={mobile}
                      onChange={(e) => {
                        setMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
                        if (error) setError(null);
                      }}
                      disabled={submitting}
                      placeholder="10-digit mobile number"
                      className="h-11 w-full rounded-r-lg border border-slate-300 bg-white px-3.5 font-mono text-sm font-semibold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 tabular-nums focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 disabled:bg-slate-50"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Password (6+ chars)
                    </label>
                    <span className="font-mono text-[11px] font-medium text-slate-500 tabular-nums">
                      {password.length} chars
                    </span>
                  </div>
                  <div className="relative mt-1.5 flex items-center">
                    <KeyRound
                      className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mobileMode === 'signin' ? 'current-password' : 'new-password'}
                      maxLength={24}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (error) setError(null);
                      }}
                      disabled={submitting}
                      placeholder="Enter password (min 6 chars)"
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-10 font-mono text-sm font-bold text-slate-900 placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15 disabled:bg-slate-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700"
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white transition-colors hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {submitting
                      ? mobileMode === 'signin'
                        ? 'Signing in...'
                        : 'Creating mobile account...'
                      : mobileMode === 'signin'
                        ? 'Sign In with Mobile & Password'
                        : 'Create Account with Mobile (+91)'}
                  </span>
                </button>
              </form>
            </>
          )}

          <div className="my-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            <span>or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={() => {
              void clearIncompleteFirebaseAuth().then(() => {
                onGuestLogin('Guest Player');
              });
            }}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 transition-colors hover:bg-slate-50"
          >
            <UserCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <span>Continue as Guest</span>
          </button>

          <div className="mt-5 border-t border-slate-200 pt-4 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
            <span>10,000 Virtual Demo Coins</span>
            <span>No Real Money</span>
          </div>
        </div>
      </main>
    </div>
  );
};
