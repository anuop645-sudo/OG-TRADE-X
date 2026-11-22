import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { Eye, EyeOff, KeyRound, LogIn, Mail, Shield, Smartphone, User, UserCheck } from 'lucide-react';
import { auth } from '../firebase';
import {
  StoredAccountWallet,
  loginOrRegisterMobileAccount,
} from '../utils/mobileAuth';

interface GuestLoginProps {
  onMobileLogin: (
    mobile: string,
    wallet: StoredAccountWallet,
    created: boolean,
    bonusAdded: number
  ) => void;
  onGuestLogin: (guestName: string) => void;
}

function mapFirebaseAuthError(err: unknown): string {
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
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed.';
  }
}

export const GuestLogin: React.FC<GuestLoginProps> = ({
  onMobileLogin,
  onGuestLogin,
}) => {
  const [authTab, setAuthTab] = useState<'email' | 'mobile'>('email');
  const [emailMode, setEmailMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [showEmailPassword, setShowEmailPassword] = useState(false);

  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      if (emailMode === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, emailPassword);
        const cleanName = displayName.trim().slice(0, 40);
        if (cleanName) {
          await updateProfile(cred.user, { displayName: cleanName });
        }
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, emailPassword);
      }
      // App.tsx listens to onAuthStateChanged and bootstraps user profile + admin role
    } catch (err) {
      setError(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleMobileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await loginOrRegisterMobileAccount(mobile, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onMobileLogin(mobile.replace(/\D/g, ''), result.wallet, result.created, result.bonusAdded);
    } finally {
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
              <div className="mt-5 mb-5">
                <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                  <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Mobile &amp; Password Login</span>
                </div>
                <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-slate-900">
                  Account Login
                </h1>
                <p className="mt-1.5 text-sm text-slate-600">
                  Enter your 10-digit mobile number and password (6+ characters). New numbers automatically start with 10K DC coins.
                </p>
              </div>

              <form onSubmit={handleMobileSubmit} className="space-y-4" noValidate>
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
                      autoComplete="current-password"
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
                  <span>{submitting ? 'Signing in...' : 'Login with Mobile & Password'}</span>
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
            onClick={() => onGuestLogin('Guest Player')}
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
