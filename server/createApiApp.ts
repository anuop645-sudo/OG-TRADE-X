import { randomInt } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import type { NextFunction, Request, Response, Router } from 'express';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import type { Credential, ServiceAccount } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import type { DecodedIdToken } from 'firebase-admin/auth';
import {
  FieldValue,
  getFirestore as getAdminFirestore,
  initializeFirestore,
} from 'firebase-admin/firestore';
import type { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';

export interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const candidates = [
    resolve(process.cwd(), 'firebase-applet-config.json'),
    resolve(process.cwd(), '..', 'firebase-applet-config.json'),
    resolve(process.cwd(), '..', '..', 'firebase-applet-config.json'),
  ];
  if (typeof __dirname !== 'undefined') {
    candidates.push(resolve(__dirname, 'firebase-applet-config.json'));
    candidates.push(resolve(__dirname, '..', 'firebase-applet-config.json'));
    candidates.push(resolve(__dirname, '..', '..', 'firebase-applet-config.json'));
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return JSON.parse(readFileSync(candidate, 'utf-8')) as FirebaseAppletConfig;
    }
  }

  return {
    projectId:
      process.env.FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      'gamelog-21c7d',
    firestoreDatabaseId:
      process.env.FIREBASE_DATABASE_ID ||
      process.env.VITE_FIREBASE_DATABASE_ID ||
      'ai-studio-chromatradedemo-bbfbe572-8712-497b-9a7f-67e257daf7e7',
  };
}

const firebaseConfig = loadFirebaseConfig();

let credentialParseError: string | null = null;
let credentialMode: 'service-account-env' | 'adc' = 'adc';
let resolvedProjectId = firebaseConfig.projectId;

function stripOuterQuotesAndBom(value: string): string {
  let clean = value.replace(/^\uFEFF/, '').trim();
  if (
    (clean.startsWith("'") && clean.endsWith("'") && clean.length >= 2) ||
    (clean.startsWith('"') && clean.endsWith('"') && clean.length >= 2)
  ) {
    const inner = clean.slice(1, -1).trim();
    if (inner.startsWith('{') || /^[A-Za-z0-9+/=_-]+$/.test(inner)) {
      clean = inner;
    }
  }
  return clean;
}

function normalizePrivateKey(rawKey: string): string {
  let key = stripOuterQuotesAndBom(rawKey);
  key = key
    .replace(/\\\\r\\\\n/g, '\n')
    .replace(/\\\\n/g, '\n')
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();
  return key;
}

function parseServiceAccountJson(rawEnv: string): Record<string, unknown> {
  const cleaned = stripOuterQuotesAndBom(rawEnv);
  const candidates: string[] = [];

  if (cleaned.startsWith('{')) {
    candidates.push(cleaned);
  } else {
    try {
      const decoded = stripOuterQuotesAndBom(Buffer.from(cleaned, 'base64').toString('utf-8'));
      if (decoded.startsWith('{')) {
        candidates.push(decoded);
      }
    } catch {
      // Ignore base64 decode errors; raw candidate will report JSON error
    }
    candidates.push(cleaned);
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch (err) {
      lastError = err;
      // Handle raw multiline JSON where newlines inside private_key were pasted unescaped
      try {
        const escapedNewlines = candidate.replace(/"((?:[^"\\]|\\.)*)"/g, (match) =>
          match.replace(/\r/g, '\\r').replace(/\n/g, '\\n')
        );
        const parsedFallback = JSON.parse(escapedNewlines) as unknown;
        if (parsedFallback && typeof parsedFallback === 'object') {
          return parsedFallback as Record<string, unknown>;
        }
      } catch {
        // Keep lastError from primary parse
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Malformed JSON.');
}

function resolveAdminCredential(): Credential | undefined {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    try {
      const parsed = parseServiceAccountJson(rawJson);
      const clientEmail = String(parsed.client_email || parsed.clientEmail || '').trim();
      const rawKey = String(parsed.private_key || parsed.privateKey || '');
      const projectId = String(
        parsed.project_id || parsed.projectId || firebaseConfig.projectId
      ).trim();

      if (!clientEmail || !rawKey) {
        credentialParseError =
          'FIREBASE_SERVICE_ACCOUNT_JSON is missing required client_email or private_key fields.';
        return undefined;
      }

      const privateKey = normalizePrivateKey(rawKey);
      if (!privateKey.includes('-----BEGIN') || !privateKey.includes('PRIVATE KEY-----')) {
        credentialParseError =
          'FIREBASE_SERVICE_ACCOUNT_JSON private_key is not a valid PEM private key.';
        return undefined;
      }

      if (projectId) {
        resolvedProjectId = projectId;
      }
      credentialMode = 'service-account-env';
      const serviceAccount: ServiceAccount = {
        projectId: resolvedProjectId,
        clientEmail,
        privateKey,
      };
      return cert(serviceAccount);
    } catch {
      credentialParseError =
        'FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed as valid JSON or base64 service account JSON.';
      return undefined;
    }
  }

  const clientEmail = stripOuterQuotesAndBom(process.env.FIREBASE_CLIENT_EMAIL || '');
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  if (clientEmail && rawPrivateKey.trim()) {
    const privateKey = normalizePrivateKey(rawPrivateKey);
    if (!privateKey.includes('-----BEGIN') || !privateKey.includes('PRIVATE KEY-----')) {
      credentialParseError = 'FIREBASE_PRIVATE_KEY is not a valid PEM private key.';
      return undefined;
    }
    const envProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
    if (envProjectId) {
      resolvedProjectId = envProjectId;
    }
    credentialMode = 'service-account-env';
    const serviceAccount: ServiceAccount = {
      projectId: resolvedProjectId,
      clientEmail,
      privateKey,
    };
    return cert(serviceAccount);
  }

  return undefined;
}

const adminCredential = resolveAdminCredential();
const adminApp = getApps().length
  ? getApp()
  : initializeApp(
      adminCredential
        ? { projectId: resolvedProjectId, credential: adminCredential }
        : { projectId: resolvedProjectId }
    );

const adminAuth = getAdminAuth(adminApp);

function initAdminFirestore(): Firestore {
  const dbId =
    firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
      ? firebaseConfig.firestoreDatabaseId
      : undefined;
  try {
    return dbId
      ? initializeFirestore(adminApp, { preferRest: true }, dbId)
      : initializeFirestore(adminApp, { preferRest: true });
  } catch {
    return dbId ? getAdminFirestore(adminApp, dbId) : getAdminFirestore(adminApp);
  }
}

const adminDb = initAdminFirestore();

const INITIAL_BALANCE = 10_000;
const MAX_BET_LIMIT = 25_000;
const FEE_RATE = 0.3;
const RESET_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FOLLOW_BONUS_COINS = 10_000;

const JHANDI_SYMBOLS = ['club', 'munda', 'spade', 'diamond', 'jhandi', 'heart'] as const;
type JhandiSymbolId = (typeof JHANDI_SYMBOLS)[number];

type ChickenDifficultyId = 'easy' | 'medium' | 'hard' | 'hardcore';
const CHICKEN_DIFFICULTIES: Record<
  ChickenDifficultyId,
  { label: string; trapChance: number; multipliers: number[] }
> = {
  easy: {
    label: 'Easy',
    trapChance: 0.12,
    multipliers: [1.15, 1.32, 1.54, 1.82, 2.18, 2.65, 3.25, 4.1, 5.25, 6.8, 9.0, 12.0],
  },
  medium: {
    label: 'Medium',
    trapChance: 0.22,
    multipliers: [1.3, 1.65, 2.15, 2.85, 3.85, 5.3, 7.5, 11.0, 17.5, 30.0],
  },
  hard: {
    label: 'Hard',
    trapChance: 0.34,
    multipliers: [1.65, 2.45, 3.75, 5.9, 9.5, 16.0, 32.0, 75.0],
  },
  hardcore: {
    label: 'Hardcore',
    trapChance: 0.48,
    multipliers: [2.25, 4.2, 8.5, 18.0, 45.0, 150.0],
  },
};

const VALID_MARKETS = new Set(['30s', '1m', '3m', '5m']);
const roundOutcomeCache = new Map<string, number>();

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function getWinStreakCutRate(winStreak: number): number {
  if (winStreak > 5) return 0.5;
  if (winStreak >= 2) return 0.09;
  return 0;
}

function getColoursForNumber(num: number): Array<'green' | 'violet' | 'red'> {
  if (num === 0) return ['red', 'violet'];
  if (num === 5) return ['green', 'violet'];
  return num % 2 === 1 ? ['green'] : ['red'];
}

function getSizeForNumber(num: number): 'big' | 'small' {
  return num >= 5 ? 'big' : 'small';
}

type ColourSelection =
  | { kind: 'colour'; value: 'green' | 'violet' | 'red' }
  | { kind: 'number'; value: number }
  | { kind: 'size'; value: 'big' | 'small' };

function isValidColourSelection(sel: unknown): sel is ColourSelection {
  if (!sel || typeof sel !== 'object') return false;
  const candidate = sel as { kind?: unknown; value?: unknown };
  if (candidate.kind === 'colour') {
    return candidate.value === 'green' || candidate.value === 'violet' || candidate.value === 'red';
  }
  if (candidate.kind === 'size') {
    return candidate.value === 'big' || candidate.value === 'small';
  }
  if (candidate.kind === 'number') {
    return (
      typeof candidate.value === 'number' &&
      Number.isInteger(candidate.value) &&
      candidate.value >= 0 &&
      candidate.value <= 9
    );
  }
  return false;
}

function formatSelectionLabel(selection: ColourSelection): string {
  if (selection.kind === 'colour') {
    return selection.value.charAt(0).toUpperCase() + selection.value.slice(1);
  }
  if (selection.kind === 'size') {
    return selection.value === 'big' ? 'Big (5–9)' : 'Small (0–4)';
  }
  return `Number ${selection.value}`;
}

function calculateColourPayout(
  selection: ColourSelection,
  contractAmount: number,
  winningNumber: number
): number {
  const winningColours = getColoursForNumber(winningNumber);
  const winningSize = getSizeForNumber(winningNumber);

  if (selection.kind === 'number') {
    return selection.value === winningNumber ? roundCurrency(contractAmount * 9) : 0;
  }
  if (selection.kind === 'size') {
    return selection.value === winningSize ? roundCurrency(contractAmount * 2) : 0;
  }
  if (selection.value === 'violet') {
    return winningColours.includes('violet') ? roundCurrency(contractAmount * 4.5) : 0;
  }
  if (selection.value === 'green') {
    if (winningNumber === 5) return roundCurrency(contractAmount * 1.5);
    if (winningColours.includes('green')) return roundCurrency(contractAmount * 2);
    return 0;
  }
  if (selection.value === 'red') {
    if (winningNumber === 0) return roundCurrency(contractAmount * 1.5);
    if (winningColours.includes('red')) return roundCurrency(contractAmount * 2);
    return 0;
  }
  return 0;
}

function isValidDocId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(id);
}

const PUBLIC_UID_REGEX = /^[1-9][0-9]{5}$/;

function isValidPublicUid(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_UID_REGEX.test(value);
}

function generateCandidatePublicUid(): string {
  return String(randomInt(100_000, 1_000_000));
}

async function reserveUniquePublicUidInTx(
  tx: Transaction,
  firebaseUid: string,
  maxAttempts = 25
): Promise<{ publicUid: string; publicUidRef: DocumentReference }> {
  const publicIdsCol = adminDb.collection('publicUserIds');
  const usersCol = adminDb.collection('users');

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateCandidatePublicUid();
    const publicUidRef = publicIdsCol.doc(candidate);
    const [idSnap, dupUsersSnap] = await Promise.all([
      tx.get(publicUidRef),
      tx.get(usersCol.where('publicUid', '==', candidate).limit(1)),
    ]);

    const claimedInDirectory = idSnap.exists && idSnap.data()?.uid !== firebaseUid;
    const claimedInUsers = dupUsersSnap.docs.some((d) => d.id !== firebaseUid);
    if (!claimedInDirectory && !claimedInUsers) {
      return { publicUid: candidate, publicUidRef };
    }
  }

  throw new HttpError(500, 'Unable to allocate a unique 6-digit user ID. Please retry.');
}

async function ensureUserPublicUid(firebaseUid: string): Promise<string> {
  const userRef = adminDb.collection('users').doc(firebaseUid);
  return adminDb.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new HttpError(404, 'User profile not found.');
    }
    const existingData = userSnap.data()!;
    if (isValidPublicUid(existingData.publicUid)) {
      return existingData.publicUid;
    }

    const { publicUid, publicUidRef } = await reserveUniquePublicUidInTx(tx, firebaseUid);
    tx.set(publicUidRef, {
      publicUid,
      uid: firebaseUid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(userRef, {
      publicUid,
    });
    return publicUid;
  });
}

function generateReferralCode(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const prefix = (clean.slice(0, 6) || 'OGTRAD').padEnd(6, 'X');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '7');
  return `${prefix}${suffix}`.slice(0, 10);
}

function generateChickenTraps(laneCount: number, trapChance: number): boolean[] {
  const traps = Array.from({ length: laneCount }, () => Math.random() < trapChance);
  if (traps.every(Boolean)) {
    traps[Math.floor(Math.random() * laneCount)] = false;
  }
  if (traps.every((t) => !t)) {
    const trapIdx = Math.min(laneCount - 1, Math.max(1, Math.floor(Math.random() * laneCount)));
    traps[trapIdx] = true;
  }
  return traps;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function extractBearerToken(req: Request): string {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    throw new HttpError(401, 'Missing Authorization Bearer token.');
  }
  const token = match[1].trim();
  if (!token) {
    throw new HttpError(401, 'Empty Firebase ID token.');
  }
  return token;
}

async function requireCaller(req: Request): Promise<{ decoded: DecodedIdToken; rawToken: string }> {
  const token = extractBearerToken(req);
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { decoded, rawToken: token };
  } catch (err) {
    const errCode = (err as { code?: string })?.code || 'unknown';
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`Firebase ID token verification failed (${errCode}): ${errMsg}`);
    if (errCode === 'auth/id-token-expired') {
      throw new HttpError(401, 'Firebase ID token has expired. Please retry or sign in again.');
    }
    throw new HttpError(401, 'Invalid or expired Firebase ID token.');
  }
}

async function verifyAdminRoleViaCallerToken(uid: string, rawToken: string): Promise<boolean | null> {
  const dbId =
    firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
      ? firebaseConfig.firestoreDatabaseId
      : '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    firebaseConfig.projectId
  )}/databases/${encodeURIComponent(dbId)}/documents/admins/${encodeURIComponent(uid)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${rawToken}`,
        Accept: 'application/json',
      },
    });
    if (res.status === 404) return false;
    if (!res.ok) return null;
    const json = (await res.json()) as {
      fields?: { role?: { stringValue?: string } };
    };
    return json?.fields?.role?.stringValue === 'admin';
  } catch {
    return null;
  }
}

async function requireAdmin(req: Request): Promise<DecodedIdToken> {
  const { decoded, rawToken } = await requireCaller(req);
  if (credentialParseError) {
    throw new HttpError(500, credentialParseError);
  }
  try {
    const adminSnap = await adminDb.collection('admins').doc(decoded.uid).get();
    if (!adminSnap.exists || adminSnap.data()?.role !== 'admin') {
      throw new HttpError(403, 'Forbidden: Admin role required.');
    }
    return decoded;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: unknown })?.code;
    if (
      code === 7 ||
      message.includes('PERMISSION_DENIED') ||
      message.includes('Could not load the default credentials')
    ) {
      const restAdminCheck = await verifyAdminRoleViaCallerToken(decoded.uid, rawToken);
      if (restAdminCheck === false) {
        throw new HttpError(403, 'Forbidden: Admin role required.');
      }
    }
    throw err;
  }
}

export function handleRouteError(res: Response, err: unknown): void {
  if (res.headersSent) {
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const errObj = err as { type?: unknown; status?: unknown; statusCode?: unknown; code?: unknown };
  if (errObj?.type === 'entity.parse.failed' || (err instanceof SyntaxError && errObj?.status === 400)) {
    res.status(400).json({ error: 'Invalid JSON request body.' });
    return;
  }
  if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
    res.status(413).json({ error: 'Request payload is too large.' });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  const code = errObj?.code;
  if (
    message.includes('Could not load the default credentials') ||
    message.includes('default credentials')
  ) {
    res.status(500).json({
      code: 'MISSING_ADMIN_CREDENTIALS',
      error:
        credentialParseError ||
        'Firebase Admin credentials are not configured on the backend server. Set FIREBASE_SERVICE_ACCOUNT_JSON in your backend environment (Render / Netlify) for project gamelog-21c7d and redeploy.',
    });
    return;
  }
  if (code === 7 || message.includes('PERMISSION_DENIED')) {
    res.status(500).json({
      code: 'PERMISSION_DENIED',
      error:
        'Backend Firestore access denied (PERMISSION_DENIED). Please check Firestore IAM permissions for project gamelog-21c7d.',
    });
    return;
  }
  const safeErrCode = typeof code === 'string' || typeof code === 'number' ? String(code) : 'INTERNAL';
  console.error(`Server API error (${safeErrCode}):`, err instanceof Error ? err.message : String(err));
  res.status(500).json({ error: message || 'Internal server error.' });
}

function toMillisSafe(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object') {
    const maybeTs = value as { toMillis?: () => number; _seconds?: number; seconds?: number };
    if (typeof maybeTs.toMillis === 'function') {
      const ms = maybeTs.toMillis();
      if (Number.isFinite(ms)) return ms;
    }
    const secs = typeof maybeTs._seconds === 'number' ? maybeTs._seconds : maybeTs.seconds;
    if (typeof secs === 'number' && Number.isFinite(secs)) return secs * 1000;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function makeTxId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractVerifiedMobileInfo(
  authEmail: string,
  authPhoneNumber?: string
): { authMethod: 'email' | 'mobile'; mobile: string; phoneNumber: string } {
  const emailMatch = /^m91(\d{10})@mobile\.ogtrade\.app$/i.exec(authEmail.trim());
  if (emailMatch) {
    const mobile = emailMatch[1];
    return { authMethod: 'mobile', mobile, phoneNumber: `+91${mobile}` };
  }
  const phoneMatch = /^\+91(\d{10})$/.exec((authPhoneNumber || '').trim());
  if (phoneMatch) {
    const mobile = phoneMatch[1];
    return { authMethod: 'mobile', mobile, phoneNumber: `+91${mobile}` };
  }
  return { authMethod: 'email', mobile: '', phoneNumber: '' };
}

function assertDbCredentialsConfigured(): void {
  if (credentialParseError) {
    throw new HttpError(500, credentialParseError);
  }
}

export function createApiRouter(runtime: 'express' | 'netlify-function' = 'express'): Router {
  const apiRouter = express.Router();

  apiRouter.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedEnv = (process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (origin && (origin.startsWith('https://') || origin.startsWith('http://'))) {
      if (allowedEnv.length === 0 || allowedEnv.includes('*') || allowedEnv.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  apiRouter.use(express.json({ limit: '256kb' }));

  apiRouter.get('/health', (_req, res) => {
    res.json({
      ok: credentialParseError === null,
      runtime,
      credentialMode,
      hasServiceAccountEnv: Boolean(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
          (process.env.FIREBASE_CLIENT_EMAIL?.trim() && process.env.FIREBASE_PRIVATE_KEY?.trim())
      ),
      credentialError: credentialParseError,
      projectId: resolvedProjectId,
      databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
    });
  });

  // Bootstrap/sync logged-in Firebase user profile & check admin role
  const handleBootstrap = async (req: Request, res: Response) => {
    try {
      const { decoded: caller } = await requireCaller(req);
      assertDbCredentialsConfigured();

      const bodyDisplayName =
        typeof (req.body as { displayName?: unknown } | undefined)?.displayName === 'string'
          ? (req.body as { displayName: string }).displayName.trim().slice(0, 40)
          : '';

      let authEmail = typeof caller.email === 'string' ? caller.email.trim() : '';
      let authDisplayName = typeof caller.name === 'string' ? caller.name.trim() : '';
      let authPhotoUrl = typeof caller.picture === 'string' ? caller.picture.trim() : '';
      let authPhoneNumber =
        typeof caller.phone_number === 'string' ? caller.phone_number.trim() : '';

      // If token claims were issued before updateProfile finished, read fresh Firebase Auth user record
      if (credentialMode === 'service-account-env' && (!authEmail || (!authDisplayName && !bodyDisplayName))) {
        try {
          const authUser = await adminAuth.getUser(caller.uid);
          if (!authEmail && authUser.email) authEmail = authUser.email.trim();
          if (!authDisplayName && authUser.displayName) authDisplayName = authUser.displayName.trim();
          if (!authPhotoUrl && authUser.photoURL) authPhotoUrl = authUser.photoURL.trim();
          if (!authPhoneNumber && authUser.phoneNumber) authPhoneNumber = authUser.phoneNumber.trim();
        } catch {
          // Continue with verified ID token claims
        }
      }

      const verifiedMobile = extractVerifiedMobileInfo(authEmail, authPhoneNumber);
      const mobileDisplayFallback =
        verifiedMobile.authMethod === 'mobile' ? `+91 ${verifiedMobile.mobile}` : '';
      const desiredDisplayName = bodyDisplayName || authDisplayName || mobileDisplayFallback;

      const userRef = adminDb.collection('users').doc(caller.uid);
      const adminRef = adminDb.collection('admins').doc(caller.uid);

      const [{ profile, created }, adminSnap] = await Promise.all([
        adminDb.runTransaction(async (tx) => {
          const snap = await tx.get(userRef);
          const nowMs = Date.now();
          if (snap.exists) {
            const data = snap.data()!;
            let publicUid = isValidPublicUid(data.publicUid) ? data.publicUid : '';
            const updates: Record<string, unknown> = {};

            if (!publicUid) {
              const reserved = await reserveUniquePublicUidInTx(tx, caller.uid);
              publicUid = reserved.publicUid;
              tx.set(reserved.publicUidRef, {
                publicUid,
                uid: caller.uid,
                createdAt: FieldValue.serverTimestamp(),
              });
              updates.publicUid = publicUid;
            }

            const existingEmail = typeof data.email === 'string' ? data.email.trim() : '';
            const syncedEmail = existingEmail || authEmail || `${caller.uid}@ogtrade.local`;
            if (!existingEmail && syncedEmail) {
              updates.email = syncedEmail.slice(0, 254);
            }

            const existingMobile = typeof data.mobile === 'string' ? data.mobile.trim() : '';
            const syncedMobile = existingMobile || verifiedMobile.mobile;
            if (!existingMobile && syncedMobile) {
              updates.mobile = syncedMobile;
            }

            const existingPhoneNumber =
              typeof data.phoneNumber === 'string' ? data.phoneNumber.trim() : '';
            const syncedPhoneNumber = existingPhoneNumber || verifiedMobile.phoneNumber;
            if (!existingPhoneNumber && syncedPhoneNumber) {
              updates.phoneNumber = syncedPhoneNumber;
            }

            const existingAuthMethod =
              data.authMethod === 'mobile' || data.authMethod === 'email'
                ? data.authMethod
                : undefined;
            const syncedAuthMethod: 'email' | 'mobile' =
              existingAuthMethod || (syncedMobile ? 'mobile' : verifiedMobile.authMethod);
            if (!existingAuthMethod) {
              updates.authMethod = syncedAuthMethod;
            }

            const existingName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
            const emailPrefix = syncedEmail.includes('@') ? syncedEmail.split('@')[0] : '';
            let syncedName =
              existingName ||
              desiredDisplayName ||
              (syncedMobile ? `+91 ${syncedMobile}` : emailPrefix) ||
              'OG Player';
            if (
              bodyDisplayName &&
              (!existingName || existingName === 'OG Player' || existingName === emailPrefix)
            ) {
              syncedName = bodyDisplayName;
            }
            syncedName = syncedName.slice(0, 40) || 'OG Player';
            if (syncedName !== existingName) {
              updates.displayName = syncedName;
            }

            const syncedPhoto =
              (typeof data.photoURL === 'string' && data.photoURL) || authPhotoUrl || '';
            if (syncedPhoto && !data.photoURL) {
              updates.photoURL = syncedPhoto.slice(0, 512);
            }

            const syncedReferralCode =
              typeof data.referralCode === 'string' && data.referralCode.length >= 6
                ? data.referralCode
                : generateReferralCode(caller.uid);
            if (!data.referralCode) {
              updates.referralCode = syncedReferralCode;
            }

            if (Object.keys(updates).length > 0) {
              updates.updatedAt = FieldValue.serverTimestamp();
              tx.update(userRef, updates);
            }

            return {
              created: false,
              profile: {
                uid: caller.uid,
                publicUid,
                email: syncedEmail.slice(0, 254),
                mobile: syncedMobile || undefined,
                phoneNumber: syncedPhoneNumber || undefined,
                authMethod: syncedAuthMethod,
                photoURL: syncedPhoto.slice(0, 512),
                displayName: syncedName,
                balance: typeof data.balance === 'number' ? data.balance : 0,
                referralCode: syncedReferralCode,
                referredBy: data.referredBy || '',
                referredByCode: data.referredByCode || '',
                referralCount: data.referralCount || 0,
                referralBonusEarned: data.referralBonusEarned || 0,
                colourWinStreak: data.colourWinStreak || 0,
                jhandiWinStreak: data.jhandiWinStreak || 0,
                chickenWinStreak: data.chickenWinStreak || 0,
                lastResetAtMs: typeof data.lastResetAtMs === 'number' ? data.lastResetAtMs : nowMs,
                followBonusClaimed: Boolean(data.followBonusClaimed),
              },
            };
          }

          const { publicUid, publicUidRef } = await reserveUniquePublicUidInTx(tx, caller.uid);
          const rawEmail = (authEmail || `${caller.uid}@ogtrade.local`).slice(0, 254);
          const fallbackName =
            verifiedMobile.authMethod === 'mobile'
              ? `+91 ${verifiedMobile.mobile}`
              : rawEmail.includes('@')
                ? rawEmail.split('@')[0]
                : 'OG Player';
          const displayName = (desiredDisplayName || fallbackName).trim().slice(0, 40) || 'OG Player';

          const newProfile = {
            uid: caller.uid,
            publicUid,
            email: rawEmail,
            ...(verifiedMobile.mobile ? { mobile: verifiedMobile.mobile } : {}),
            ...(verifiedMobile.phoneNumber ? { phoneNumber: verifiedMobile.phoneNumber } : {}),
            authMethod: verifiedMobile.authMethod,
            photoURL: authPhotoUrl.slice(0, 512),
            displayName,
            balance: INITIAL_BALANCE,
            referralCode: generateReferralCode(caller.uid),
            referredBy: '',
            referredByCode: '',
            referralCount: 0,
            referralBonusEarned: 0,
            colourWinStreak: 0,
            jhandiWinStreak: 0,
            chickenWinStreak: 0,
            lastResetAtMs: nowMs,
            followBonusClaimed: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          };

          const txId = makeTxId('welcome');
          tx.set(publicUidRef, {
            publicUid,
            uid: caller.uid,
            createdAt: FieldValue.serverTimestamp(),
          });
          tx.set(userRef, newProfile);
          tx.set(userRef.collection('transactions').doc(txId), {
            id: txId,
            uid: caller.uid,
            type: 'welcome_bonus',
            game: 'wallet',
            amount: INITIAL_BALANCE,
            balanceBefore: 0,
            balanceAfter: INITIAL_BALANCE,
            description: 'Welcome bonus (10K DC)',
            reason: 'New account welcome bonus',
            referenceId: txId,
            timestamp: FieldValue.serverTimestamp(),
            createdAtMs: nowMs,
            createdAt: FieldValue.serverTimestamp(),
          });

          return {
            created: true,
            profile: {
              uid: newProfile.uid,
              publicUid: newProfile.publicUid,
              email: newProfile.email,
              mobile: verifiedMobile.mobile || undefined,
              phoneNumber: verifiedMobile.phoneNumber || undefined,
              authMethod: verifiedMobile.authMethod,
              photoURL: newProfile.photoURL,
              displayName: newProfile.displayName,
              balance: newProfile.balance,
              referralCode: newProfile.referralCode,
              referredBy: newProfile.referredBy,
              referredByCode: newProfile.referredByCode,
              referralCount: newProfile.referralCount,
              referralBonusEarned: newProfile.referralBonusEarned,
              colourWinStreak: newProfile.colourWinStreak,
              jhandiWinStreak: newProfile.jhandiWinStreak,
              chickenWinStreak: newProfile.chickenWinStreak,
              lastResetAtMs: newProfile.lastResetAtMs,
              followBonusClaimed: newProfile.followBonusClaimed,
            },
          };
        }),
        adminRef.get(),
      ]);

      // Best-effort sync of displayName / phoneNumber back to Firebase Auth if Auth record lacked it
      if (credentialMode === 'service-account-env') {
        const authUpdates: { displayName?: string; phoneNumber?: string } = {};
        if (!authDisplayName && profile.displayName) {
          authUpdates.displayName = profile.displayName;
        }
        if (verifiedMobile.phoneNumber && authPhoneNumber !== verifiedMobile.phoneNumber) {
          authUpdates.phoneNumber = verifiedMobile.phoneNumber;
        }
        if (Object.keys(authUpdates).length > 0) {
          void adminAuth.updateUser(caller.uid, authUpdates).catch(() => {
            // Non-fatal if phone number already belongs to another Auth record or Auth write lacks IAM
          });
        }
      }

      const isAdmin = adminSnap.exists && adminSnap.data()?.role === 'admin';
      res.json({ ok: true, created, isAdmin, profile });
    } catch (err) {
      handleRouteError(res, err);
    }
  };

  apiRouter.get('/user/bootstrap', handleBootstrap);
  apiRouter.post('/user/bootstrap', handleBootstrap);

  // 24h Claim 10K DC coins
  apiRouter.post('/user/claim-daily', async (req, res) => {
    try {
      const { decoded: caller } = await requireCaller(req);
      assertDbCredentialsConfigured();
      const userRef = adminDb.collection('users').doc(caller.uid);

      const result = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) {
          throw new HttpError(404, 'User profile not found.');
        }
        const data = snap.data()!;
        const now = Date.now();
        const lastResetAtMs = typeof data.lastResetAtMs === 'number' ? data.lastResetAtMs : 0;
        const remainingMs = Math.max(0, lastResetAtMs + RESET_COOLDOWN_MS - now);
        if (remainingMs > 0) {
          throw new HttpError(400, '10K DC claim is still on 24-hour cooldown.');
        }

        const balanceBefore = typeof data.balance === 'number' ? data.balance : 0;
        const balanceAfter = roundCurrency(balanceBefore + INITIAL_BALANCE);
        const txId = makeTxId('claim10k');

        tx.update(userRef, {
          balance: balanceAfter,
          lastResetAtMs: now,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(userRef.collection('transactions').doc(txId), {
          id: txId,
          uid: caller.uid,
          type: 'reset_10k',
          game: 'wallet',
          amount: INITIAL_BALANCE,
          balanceBefore,
          balanceAfter,
          description: '24h Claim +10K DC',
          reason: '24h daily coin claim',
          referenceId: txId,
          timestamp: FieldValue.serverTimestamp(),
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });

        return { balance: balanceAfter, lastResetAtMs: now };
      });

      res.json({ ok: true, ...result });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Instagram Follow +10K DC bonus
  apiRouter.post('/user/claim-follow', async (req, res) => {
    try {
      const { decoded: caller } = await requireCaller(req);
      assertDbCredentialsConfigured();
      const userRef = adminDb.collection('users').doc(caller.uid);

      const result = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) {
          throw new HttpError(404, 'User profile not found.');
        }
        const data = snap.data()!;
        if (data.followBonusClaimed) {
          throw new HttpError(400, '10K DC follow bonus already claimed for this account.');
        }
        const now = Date.now();
        const balanceBefore = typeof data.balance === 'number' ? data.balance : 0;
        const balanceAfter = roundCurrency(balanceBefore + FOLLOW_BONUS_COINS);
        const txId = makeTxId('follow');

        tx.update(userRef, {
          balance: balanceAfter,
          followBonusClaimed: true,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(userRef.collection('transactions').doc(txId), {
          id: txId,
          uid: caller.uid,
          type: 'instagram_bonus',
          game: 'wallet',
          amount: FOLLOW_BONUS_COINS,
          balanceBefore,
          balanceAfter,
          description: 'Instagram Follow Bonus (+10K DC)',
          reason: 'Instagram follow reward',
          referenceId: txId,
          timestamp: FieldValue.serverTimestamp(),
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });

        return { balance: balanceAfter, followBonusClaimed: true };
      });

      res.json({ ok: true, ...result });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Colour Trade: Place bet
  apiRouter.post('/game/colour/bet', async (req, res) => {
    try {
      const { decoded: caller } = await requireCaller(req);
      assertDbCredentialsConfigured();
      const { marketId, periodId, selection, stake, multiplier } = req.body as {
        marketId?: string;
        periodId?: string;
        selection?: unknown;
        stake?: number;
        multiplier?: number;
      };

      if (!marketId || !VALID_MARKETS.has(marketId)) {
        throw new HttpError(400, 'Invalid marketId.');
      }
      if (!periodId || typeof periodId !== 'string' || periodId.length > 64) {
        throw new HttpError(400, 'Invalid periodId.');
      }
      if (!isValidColourSelection(selection)) {
        throw new HttpError(400, 'Invalid selection.');
      }
      if (
        typeof stake !== 'number' ||
        !Number.isFinite(stake) ||
        stake < 1 ||
        typeof multiplier !== 'number' ||
        !Number.isInteger(multiplier) ||
        multiplier < 1 ||
        multiplier > 500
      ) {
        throw new HttpError(400, 'Invalid stake or multiplier.');
      }

      const totalAmount = roundCurrency(stake * multiplier);
      if (totalAmount < 1 || totalAmount > MAX_BET_LIMIT) {
        throw new HttpError(400, `Order must be between 1 and ${MAX_BET_LIMIT} DC.`);
      }

      const fee = roundCurrency(totalAmount * FEE_RATE);
      const contractAmount = roundCurrency(totalAmount - fee);
      const userRef = adminDb.collection('users').doc(caller.uid);

      const result = await adminDb.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          throw new HttpError(404, 'User profile not found.');
        }
        const userData = userSnap.data()!;
        const balanceBefore = typeof userData.balance === 'number' ? userData.balance : 0;

        const pendingSnap = await tx.get(
          userRef
            .collection('gameHistory')
            .where('game', '==', 'colour')
            .where('periodId', '==', periodId)
            .where('marketId', '==', marketId)
            .where('status', '==', 'pending')
        );

        let existingRoundStake = 0;
        pendingSnap.forEach((docSnap) => {
          const amt = docSnap.data()?.totalAmount;
          if (typeof amt === 'number') existingRoundStake += amt;
        });

        if (roundCurrency(existingRoundStake + totalAmount) > MAX_BET_LIMIT) {
          throw new HttpError(400, `Max bet limit is ${MAX_BET_LIMIT.toLocaleString()} DC per round.`);
        }
        if (totalAmount > balanceBefore) {
          throw new HttpError(400, 'Insufficient balance. 10K DC claim unlocks every 24h.');
        }

        const now = Date.now();
        const balanceAfter = roundCurrency(balanceBefore - totalAmount);
        const orderId = makeTxId('ord');
        const txId = makeTxId('bet');
        const selectionLabel = formatSelectionLabel(selection);

        tx.update(userRef, {
          balance: balanceAfter,
          updatedAt: FieldValue.serverTimestamp(),
        });

        tx.set(userRef.collection('gameHistory').doc(orderId), {
          id: orderId,
          uid: caller.uid,
          game: 'colour',
          periodId,
          marketId,
          selection: selectionLabel,
          selectionPayload: selection,
          stake,
          multiplier,
          totalAmount,
          fee,
          contractAmount,
          status: 'pending',
          outcomeNumber: -1,
          outcomeLabel: '',
          payout: 0,
          netProfit: 0,
          streakCutRate: 0,
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.set(userRef.collection('transactions').doc(txId), {
          id: txId,
          uid: caller.uid,
          type: 'bet_debit',
          game: 'colour',
          amount: -totalAmount,
          balanceBefore,
          balanceAfter,
          description: `Colour Trade bet · ${selectionLabel} (${periodId})`,
          referenceId: orderId,
          timestamp: FieldValue.serverTimestamp(),
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          balance: balanceAfter,
          order: {
            id: orderId,
            periodId,
            marketId,
            selection,
            stake,
            multiplier,
            totalAmount,
            fee,
            contractAmount,
            status: 'pending' as const,
            payout: 0,
            netProfit: 0,
            createdAt: new Date(now).toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          },
        };
      });

      res.json({ ok: true, ...result });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Colour Trade: Cancel pending order
  apiRouter.post('/game/colour/cancel', async (req, res) => {
    try {
      const { decoded: caller } = await requireCaller(req);
      assertDbCredentialsConfigured();
      const { orderId } = req.body as { orderId?: string };
      if (!isValidDocId(orderId)) {
        throw new HttpError(400, 'Invalid orderId.');
      }

      const userRef = adminDb.collection('users').doc(caller.uid);
      const orderRef = userRef.collection('gameHistory').doc(orderId);

      const result = await adminDb.runTransaction(async (tx) => {
        const [userSnap, orderSnap] = await Promise.all([tx.get(userRef), tx.get(orderRef)]);
        if (!userSnap.exists || !orderSnap.exists) {
          throw new HttpError(404, 'Pending order not found.');
        }
        const order = orderSnap.data()!;
        if (order.game !== 'colour' || order.status !== 'pending') {
          throw new HttpError(400, 'Order cannot be cancelled.');
        }

        const totalAmount = typeof order.totalAmount === 'number' ? order.totalAmount : 0;
        const balanceBefore = typeof userSnap.data()!.balance === 'number' ? userSnap.data()!.balance : 0;
        const balanceAfter = roundCurrency(balanceBefore + totalAmount);
        const now = Date.now();
        const txId = makeTxId('refund');

        tx.update(userRef, {
          balance: balanceAfter,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(orderRef, {
          status: 'cancelled',
        });
        tx.set(userRef.collection('transactions').doc(txId), {
          id: txId,
          uid: caller.uid,
          type: 'order_refund',
          game: 'colour',
          amount: totalAmount,
          balanceBefore,
          balanceAfter,
          description: `Colour Trade refund (${order.periodId || orderId})`,
          referenceId: orderId,
          timestamp: FieldValue.serverTimestamp(),
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });

        return { balance: balanceAfter, refundedAmount: totalAmount };
      });

      res.json({ ok: true, ...result });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Colour Trade: Server-authoritative round settlement
  apiRouter.post('/game/colour/settle', async (req, res) => {
    try {
      const { decoded: caller } = await requireCaller(req);
      assertDbCredentialsConfigured();
      const { marketId, periodId } = req.body as { marketId?: string; periodId?: string };

      if (!marketId || !VALID_MARKETS.has(marketId)) {
        throw new HttpError(400, 'Invalid marketId.');
      }
      if (!periodId || typeof periodId !== 'string' || periodId.length > 64) {
        throw new HttpError(400, 'Invalid periodId.');
      }

      const roundKey = `${marketId}:${periodId}`;
      let winningNumber = roundOutcomeCache.get(roundKey);
      if (typeof winningNumber !== 'number') {
        winningNumber = Math.floor(Math.random() * 10);
        roundOutcomeCache.set(roundKey, winningNumber);
        if (roundOutcomeCache.size > 400) {
          const oldestKey = roundOutcomeCache.keys().next().value;
          if (oldestKey) roundOutcomeCache.delete(oldestKey);
        }
      }

      const userRef = adminDb.collection('users').doc(caller.uid);
      const outcomeLabel = `Number ${winningNumber} · ${getSizeForNumber(winningNumber).toUpperCase()} (${getColoursForNumber(winningNumber).join('+')})`;

      const settled = await adminDb.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          throw new HttpError(404, 'User profile not found.');
        }
        const userData = userSnap.data()!;
        const currentStreak = typeof userData.colourWinStreak === 'number' ? userData.colourWinStreak : 0;
        const balanceBefore = typeof userData.balance === 'number' ? userData.balance : 0;

        const pendingSnap = await tx.get(
          userRef
            .collection('gameHistory')
            .where('game', '==', 'colour')
            .where('periodId', '==', periodId)
            .where('marketId', '==', marketId)
            .where('status', '==', 'pending')
        );

        if (pendingSnap.empty) {
          return {
            winningNumber,
            settledCount: 0,
            totalPayout: 0,
            totalStaked: 0,
            netProfit: 0,
            winStreak: currentStreak,
            streakCutRate: 0,
            balance: balanceBefore,
            settledUpdates: [] as Array<{
              id: string;
              status: 'won' | 'lost';
              payout: number;
              netProfit: number;
              settledNumber: number;
            }>,
          };
        }

        let rawTotalPayout = 0;
        let totalStaked = 0;
        const pendingItems: Array<{
          id: string;
          ref: DocumentReference;
          totalAmount: number;
          rawPayout: number;
        }> = [];

        pendingSnap.forEach((docSnap) => {
          const d = docSnap.data();
          const sel = d.selectionPayload as ColourSelection | undefined;
          const contractAmount = typeof d.contractAmount === 'number' ? d.contractAmount : 0;
          const totalAmount = typeof d.totalAmount === 'number' ? d.totalAmount : 0;
          const rawPayout =
            sel && isValidColourSelection(sel)
              ? calculateColourPayout(sel, contractAmount, winningNumber!)
              : 0;
          rawTotalPayout = roundCurrency(rawTotalPayout + rawPayout);
          totalStaked = roundCurrency(totalStaked + totalAmount);
          pendingItems.push({
            id: docSnap.id,
            ref: docSnap.ref,
            totalAmount,
            rawPayout,
          });
        });

        let nextStreak = currentStreak;
        let streakCutRate = 0;
        if (rawTotalPayout > 0) {
          nextStreak = currentStreak + 1;
          streakCutRate = getWinStreakCutRate(nextStreak);
        } else {
          nextStreak = 0;
        }
        const scale = 1 - streakCutRate;

        let totalPayout = 0;
        const settledUpdates: Array<{
          id: string;
          status: 'won' | 'lost';
          payout: number;
          netProfit: number;
          settledNumber: number;
        }> = [];

        for (const item of pendingItems) {
          const payout = roundCurrency(item.rawPayout * scale);
          const netProfit = roundCurrency(payout - item.totalAmount);
          const status = payout > 0 ? ('won' as const) : ('lost' as const);
          totalPayout = roundCurrency(totalPayout + payout);

          tx.update(item.ref, {
            status,
            outcomeNumber: winningNumber,
            outcomeLabel,
            payout,
            netProfit,
            streakCutRate,
          });

          settledUpdates.push({
            id: item.id,
            status,
            payout,
            netProfit,
            settledNumber: winningNumber!,
          });
        }

        const balanceAfter = roundCurrency(balanceBefore + totalPayout);
        tx.update(userRef, {
          balance: balanceAfter,
          colourWinStreak: nextStreak,
          updatedAt: FieldValue.serverTimestamp(),
        });

        if (totalPayout > 0) {
          const now = Date.now();
          const txId = makeTxId('cwin');
          tx.set(userRef.collection('transactions').doc(txId), {
            id: txId,
            uid: caller.uid,
            type: 'game_win',
            game: 'colour',
            amount: totalPayout,
            balanceBefore,
            balanceAfter,
            description: `Colour Trade win (${periodId} · #${winningNumber})`,
            referenceId: periodId,
            timestamp: FieldValue.serverTimestamp(),
            createdAtMs: now,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        return {
          winningNumber,
          settledCount: pendingItems.length,
          totalPayout,
          totalStaked,
          netProfit: roundCurrency(totalPayout - totalStaked),
          winStreak: nextStreak,
          streakCutRate,
          balance: balanceAfter,
          settledUpdates,
        };
      });

      res.json({ ok: true, ...settled });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Jhandi Munda: Server-validated roll & payout
  apiRouter.post('/game/jhandi/roll', async (req, res) => {
    try {
      const { decoded: caller } = await requireCaller(req);
      assertDbCredentialsConfigured();
      const { bets, roundNumber, windowBoostedSymbols, jackpotSymbols } = req.body as {
        bets?: Record<string, number>;
        roundNumber?: number;
        windowBoostedSymbols?: string[];
        jackpotSymbols?: string[];
      };

      if (!bets || typeof bets !== 'object') {
        throw new HttpError(400, 'Invalid Jhandi Munda bets.');
      }

      const cleanBets: Record<JhandiSymbolId, number> = {
        club: 0,
        munda: 0,
        spade: 0,
        diamond: 0,
        jhandi: 0,
        heart: 0,
      };
      let betSum = 0;
      for (const sym of JHANDI_SYMBOLS) {
        const val = Number(bets[sym] || 0);
        if (!Number.isFinite(val) || val < 0) {
          throw new HttpError(400, `Invalid stake for ${sym}.`);
        }
        cleanBets[sym] = roundCurrency(val);
        betSum = roundCurrency(betSum + cleanBets[sym]);
      }

      if (betSum < 1 || betSum > MAX_BET_LIMIT) {
        throw new HttpError(400, `Total Jhandi Munda bet must be between 1 and ${MAX_BET_LIMIT} DC.`);
      }

      const safeJackpot = Array.isArray(jackpotSymbols)
        ? jackpotSymbols.filter((s): s is JhandiSymbolId => JHANDI_SYMBOLS.includes(s as JhandiSymbolId))
        : [];
      const safeBoosted = Array.isArray(windowBoostedSymbols)
        ? windowBoostedSymbols.filter((s): s is JhandiSymbolId => JHANDI_SYMBOLS.includes(s as JhandiSymbolId))
        : [];

      const activeJackpot = safeJackpot
        .filter((s) => cleanBets[s] > 0)
        .sort((a, b) => cleanBets[b] - cleanBets[a]);
      const activeBoosted = safeBoosted
        .filter((s) => cleanBets[s] > 0)
        .sort((a, b) => cleanBets[b] - cleanBets[a]);

      let finalDice: JhandiSymbolId[];
      if (roundNumber === 7 || roundNumber === 11) {
        finalDice = ['club', 'munda', 'spade', 'diamond', 'jhandi', 'heart'];
      } else if (activeJackpot.length >= 1) {
        const target = activeJackpot[0];
        finalDice = [target, target, target, target, target, target];
      } else if (activeBoosted.length === 1) {
        const target = activeBoosted[0];
        const others = JHANDI_SYMBOLS.filter((id) => id !== target);
        const remaining = Array.from(
          { length: 3 },
          () => others[Math.floor(Math.random() * others.length)]
        );
        finalDice = [target, target, target, ...remaining];
      } else if (activeBoosted.length >= 2) {
        const first = activeBoosted[0];
        const second = activeBoosted[1];
        finalDice = [first, first, first, second, second, second];
      } else {
        finalDice = Array.from(
          { length: 6 },
          () => JHANDI_SYMBOLS[Math.floor(Math.random() * JHANDI_SYMBOLS.length)]
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
      JHANDI_SYMBOLS.forEach((sym) => {
        const stake = cleanBets[sym];
        if (stake > 0 && counts[sym] >= 2) {
          const netSymStake = roundCurrency(stake * (1 - FEE_RATE));
          const mult = counts[sym] === 6 ? 100 : counts[sym] + 1;
          rawPayout = roundCurrency(rawPayout + netSymStake * mult);
        }
      });

      const userRef = adminDb.collection('users').doc(caller.uid);
      const result = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) {
          throw new HttpError(404, 'User profile not found.');
        }
        const data = snap.data()!;
        const balanceBefore = typeof data.balance === 'number' ? data.balance : 0;
        if (betSum > balanceBefore) {
          throw new HttpError(400, 'Insufficient demo balance. Clear bets or wait for 24h Claim 10K.');
        }

        const prevStreak = typeof data.jhandiWinStreak === 'number' ? data.jhandiWinStreak : 0;
        let finalPayout = rawPayout;
        let streakCutRate = 0;
        let nextStreak = 0;
        if (rawPayout > 0) {
          nextStreak = prevStreak + 1;
          streakCutRate = getWinStreakCutRate(nextStreak);
          if (streakCutRate > 0) {
            finalPayout = roundCurrency(rawPayout * (1 - streakCutRate));
          }
        }

        const net = roundCurrency(finalPayout - betSum);
        const afterBetBalance = roundCurrency(balanceBefore - betSum);
        const balanceAfter = roundCurrency(afterBetBalance + finalPayout);
        const now = Date.now();
        const histId = makeTxId('jm');
        const betTxId = makeTxId('jmbet');

        tx.update(userRef, {
          balance: balanceAfter,
          jhandiWinStreak: nextStreak,
          updatedAt: FieldValue.serverTimestamp(),
        });

        const selectionSummary = JHANDI_SYMBOLS.filter((s) => cleanBets[s] > 0)
          .map((s) => `${s}:${cleanBets[s]}`)
          .join(', ')
          .slice(0, 180);

        tx.set(userRef.collection('gameHistory').doc(histId), {
          id: histId,
          uid: caller.uid,
          game: 'jhandi',
          periodId: `JM-${roundNumber || 1}-${now}`,
          marketId: 'jhandi',
          selection: selectionSummary,
          stake: betSum,
          multiplier: 1,
          totalAmount: betSum,
          fee: roundCurrency(betSum * FEE_RATE),
          contractAmount: netStake,
          status: finalPayout > 0 ? 'won' : 'lost',
          outcomeNumber: 6,
          outcomeLabel: finalDice.join(','),
          payout: finalPayout,
          netProfit: net,
          streakCutRate,
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.set(userRef.collection('transactions').doc(betTxId), {
          id: betTxId,
          uid: caller.uid,
          type: 'bet_debit',
          game: 'jhandi',
          amount: -betSum,
          balanceBefore,
          balanceAfter: afterBetBalance,
          description: `Jhandi Munda roll (${selectionSummary})`,
          referenceId: histId,
          timestamp: FieldValue.serverTimestamp(),
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });

        if (finalPayout > 0) {
          const winTxId = makeTxId('jmwin');
          tx.set(userRef.collection('transactions').doc(winTxId), {
            id: winTxId,
            uid: caller.uid,
            type: 'game_win',
            game: 'jhandi',
            amount: finalPayout,
            balanceBefore: afterBetBalance,
            balanceAfter,
            description: `Jhandi Munda win (${finalDice.join(', ')})`,
            referenceId: histId,
            timestamp: FieldValue.serverTimestamp(),
            createdAtMs: now + 1,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        return {
          ok: true as const,
          rolledDice: finalDice,
          staked: betSum,
          netStake,
          payout: finalPayout,
          net,
          winStreak: nextStreak,
          streakCutRate,
          balance: balanceAfter,
        };
      });

      res.json(result);
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Chicken Road: Start server-authoritative crossing session
  apiRouter.post('/game/chicken/start', async (req, res) => {
    try {
      const { decoded: caller } = await requireCaller(req);
      assertDbCredentialsConfigured();
      const { difficultyId, stake } = req.body as {
        difficultyId?: ChickenDifficultyId;
        stake?: number;
      };

      if (!difficultyId || !(difficultyId in CHICKEN_DIFFICULTIES)) {
        throw new HttpError(400, 'Invalid difficulty.');
      }
      if (typeof stake !== 'number' || !Number.isFinite(stake) || stake < 1 || stake > MAX_BET_LIMIT) {
        throw new HttpError(400, `Bet must be between 1 and ${MAX_BET_LIMIT.toLocaleString()} DC.`);
      }

      const diff = CHICKEN_DIFFICULTIES[difficultyId];
      const cleanStake = roundCurrency(stake);
      const netStake = roundCurrency(cleanStake * (1 - FEE_RATE));
      const traps = generateChickenTraps(diff.multipliers.length, diff.trapChance);

      const userRef = adminDb.collection('users').doc(caller.uid);
      const sessionRef = userRef.collection('chickenSessions').doc('current');

      const result = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) {
          throw new HttpError(404, 'User profile not found.');
        }
        const data = snap.data()!;
        const balanceBefore = typeof data.balance === 'number' ? data.balance : 0;
        if (cleanStake > balanceBefore) {
          throw new HttpError(400, 'Insufficient balance. Lower bet or wait for 24h Claim 10K.');
        }

        const balanceAfter = roundCurrency(balanceBefore - cleanStake);
        const now = Date.now();
        const txId = makeTxId('crbet');

        tx.update(userRef, {
          balance: balanceAfter,
          updatedAt: FieldValue.serverTimestamp(),
        });

        tx.set(sessionRef, {
          uid: caller.uid,
          difficultyId,
          stake: cleanStake,
          netStake,
          traps,
          currentLane: -1,
          status: 'running',
          updatedAtMs: now,
        });

        tx.set(userRef.collection('transactions').doc(txId), {
          id: txId,
          uid: caller.uid,
          type: 'bet_debit',
          game: 'chicken',
          amount: -cleanStake,
          balanceBefore,
          balanceAfter,
          description: `Chicken Road (${diff.label}) start`,
          referenceId: txId,
          timestamp: FieldValue.serverTimestamp(),
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          stake: cleanStake,
          netStake,
          difficultyId,
          balance: balanceAfter,
        };
      });

      res.json({ ok: true, ...result });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Chicken Road: Advance one lane
  apiRouter.post('/game/chicken/step', async (req, res) => {
    try {
      const { decoded: caller } = await requireCaller(req);
      assertDbCredentialsConfigured();
      const userRef = adminDb.collection('users').doc(caller.uid);
      const sessionRef = userRef.collection('chickenSessions').doc('current');

      const result = await adminDb.runTransaction(async (tx) => {
        const [userSnap, sessSnap] = await Promise.all([tx.get(userRef), tx.get(sessionRef)]);
        if (!userSnap.exists || !sessSnap.exists) {
          throw new HttpError(404, 'Active Chicken Road session not found.');
        }
        const sess = sessSnap.data()!;
        if (sess.status !== 'running') {
          throw new HttpError(400, 'Crossing session is no longer active.');
        }

        const diffId = sess.difficultyId as ChickenDifficultyId;
        const diff = CHICKEN_DIFFICULTIES[diffId];
        const traps = sess.traps as boolean[];
        const targetIdx = (sess.currentLane as number) + 1;
        if (targetIdx < 0 || targetIdx >= diff.multipliers.length) {
          throw new HttpError(400, 'No remaining lanes.');
        }

        const now = Date.now();
        const userData = userSnap.data()!;
        const balanceBefore = typeof userData.balance === 'number' ? userData.balance : 0;
        const stakeVal = typeof sess.stake === 'number' ? sess.stake : 0;
        const netStakeVal = typeof sess.netStake === 'number' ? sess.netStake : 0;

        if (traps[targetIdx]) {
          const histId = makeTxId('cr');
          tx.update(sessionRef, {
            currentLane: targetIdx,
            status: 'crashed',
            updatedAtMs: now,
          });
          tx.update(userRef, {
            chickenWinStreak: 0,
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(userRef.collection('gameHistory').doc(histId), {
            id: histId,
            uid: caller.uid,
            game: 'chicken',
            periodId: `CR-${now}`,
            marketId: diffId,
            selection: `${diff.label} · Lane ${targetIdx + 1}`,
            stake: stakeVal,
            multiplier: diff.multipliers[targetIdx],
            totalAmount: stakeVal,
            fee: roundCurrency(stakeVal * FEE_RATE),
            contractAmount: netStakeVal,
            status: 'lost',
            outcomeNumber: targetIdx + 1,
            outcomeLabel: 'Crashed',
            payout: 0,
            netProfit: roundCurrency(-stakeVal),
            streakCutRate: 0,
            createdAtMs: now,
            createdAt: FieldValue.serverTimestamp(),
          });

          return {
            outcome: 'crashed' as const,
            laneIndex: targetIdx,
            laneReached: targetIdx + 1,
            multiplier: diff.multipliers[targetIdx],
            traps,
            winStreak: 0,
            streakCutRate: 0,
            payout: 0,
            net: roundCurrency(-stakeVal),
            balance: balanceBefore,
          };
        }

        if (targetIdx === diff.multipliers.length - 1) {
          const prevStreak = typeof userData.chickenWinStreak === 'number' ? userData.chickenWinStreak : 0;
          const nextStreak = prevStreak + 1;
          const streakCutRate = getWinStreakCutRate(nextStreak);
          const mult = diff.multipliers[targetIdx];
          const rawPayout = roundCurrency(netStakeVal * mult);
          const finalPayout =
            streakCutRate > 0 ? roundCurrency(rawPayout * (1 - streakCutRate)) : rawPayout;
          const net = roundCurrency(finalPayout - stakeVal);
          const balanceAfter = roundCurrency(balanceBefore + finalPayout);
          const histId = makeTxId('cr');
          const winTxId = makeTxId('crwin');

          tx.update(sessionRef, {
            currentLane: targetIdx,
            status: 'cashed_out',
            updatedAtMs: now,
          });
          tx.update(userRef, {
            balance: balanceAfter,
            chickenWinStreak: nextStreak,
            updatedAt: FieldValue.serverTimestamp(),
          });
          tx.set(userRef.collection('gameHistory').doc(histId), {
            id: histId,
            uid: caller.uid,
            game: 'chicken',
            periodId: `CR-${now}`,
            marketId: diffId,
            selection: `${diff.label} · Finish (${mult}x)`,
            stake: stakeVal,
            multiplier: mult,
            totalAmount: stakeVal,
            fee: roundCurrency(stakeVal * FEE_RATE),
            contractAmount: netStakeVal,
            status: 'won',
            outcomeNumber: targetIdx + 1,
            outcomeLabel: `Finish ${mult}x`,
            payout: finalPayout,
            netProfit: net,
            streakCutRate,
            createdAtMs: now,
            createdAt: FieldValue.serverTimestamp(),
          });
          tx.set(userRef.collection('transactions').doc(winTxId), {
            id: winTxId,
            uid: caller.uid,
            type: 'game_win',
            game: 'chicken',
            amount: finalPayout,
            balanceBefore,
            balanceAfter,
            description: `Chicken Road finish (${diff.label} · ${mult}x)`,
            referenceId: histId,
            timestamp: FieldValue.serverTimestamp(),
            createdAtMs: now,
            createdAt: FieldValue.serverTimestamp(),
          });

          return {
            outcome: 'won' as const,
            laneIndex: targetIdx,
            laneReached: targetIdx + 1,
            multiplier: mult,
            traps,
            winStreak: nextStreak,
            streakCutRate,
            payout: finalPayout,
            net,
            balance: balanceAfter,
          };
        }

        tx.update(sessionRef, {
          currentLane: targetIdx,
          updatedAtMs: now,
        });

        return {
          outcome: 'safe' as const,
          laneIndex: targetIdx,
          multiplier: diff.multipliers[targetIdx],
          winStreak: typeof userData.chickenWinStreak === 'number' ? userData.chickenWinStreak : 0,
          balance: balanceBefore,
        };
      });

      res.json({ ok: true, ...result });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Chicken Road: Cash out at current safe lane
  apiRouter.post('/game/chicken/cashout', async (req, res) => {
    try {
      const { decoded: caller } = await requireCaller(req);
      assertDbCredentialsConfigured();
      const userRef = adminDb.collection('users').doc(caller.uid);
      const sessionRef = userRef.collection('chickenSessions').doc('current');

      const result = await adminDb.runTransaction(async (tx) => {
        const [userSnap, sessSnap] = await Promise.all([tx.get(userRef), tx.get(sessionRef)]);
        if (!userSnap.exists || !sessSnap.exists) {
          throw new HttpError(404, 'Active Chicken Road session not found.');
        }
        const sess = sessSnap.data()!;
        const currentLane = typeof sess.currentLane === 'number' ? sess.currentLane : -1;
        if (sess.status !== 'running' || currentLane < 0) {
          throw new HttpError(400, 'Hop at least 1 lane before cashing out.');
        }

        const diffId = sess.difficultyId as ChickenDifficultyId;
        const diff = CHICKEN_DIFFICULTIES[diffId];
        const traps = sess.traps as boolean[];
        const mult = diff.multipliers[currentLane];
        const stakeVal = typeof sess.stake === 'number' ? sess.stake : 0;
        const netStakeVal = typeof sess.netStake === 'number' ? sess.netStake : 0;

        const userData = userSnap.data()!;
        const balanceBefore = typeof userData.balance === 'number' ? userData.balance : 0;
        const prevStreak = typeof userData.chickenWinStreak === 'number' ? userData.chickenWinStreak : 0;
        const nextStreak = prevStreak + 1;
        const streakCutRate = getWinStreakCutRate(nextStreak);
        const rawPayout = roundCurrency(netStakeVal * mult);
        const finalPayout =
          streakCutRate > 0 ? roundCurrency(rawPayout * (1 - streakCutRate)) : rawPayout;
        const net = roundCurrency(finalPayout - stakeVal);
        const balanceAfter = roundCurrency(balanceBefore + finalPayout);
        const now = Date.now();
        const histId = makeTxId('cr');
        const winTxId = makeTxId('crwin');

        tx.update(sessionRef, {
          status: 'cashed_out',
          updatedAtMs: now,
        });
        tx.update(userRef, {
          balance: balanceAfter,
          chickenWinStreak: nextStreak,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.set(userRef.collection('gameHistory').doc(histId), {
          id: histId,
          uid: caller.uid,
          game: 'chicken',
          periodId: `CR-${now}`,
          marketId: diffId,
          selection: `${diff.label} · Cash Out Lane ${currentLane + 1}`,
          stake: stakeVal,
          multiplier: mult,
          totalAmount: stakeVal,
          fee: roundCurrency(stakeVal * FEE_RATE),
          contractAmount: netStakeVal,
          status: 'won',
          outcomeNumber: currentLane + 1,
          outcomeLabel: `Cash Out ${mult}x`,
          payout: finalPayout,
          netProfit: net,
          streakCutRate,
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(userRef.collection('transactions').doc(winTxId), {
          id: winTxId,
          uid: caller.uid,
          type: 'game_win',
          game: 'chicken',
          amount: finalPayout,
          balanceBefore,
          balanceAfter,
          description: `Chicken Road cash out (${diff.label} · ${mult}x)`,
          referenceId: histId,
          timestamp: FieldValue.serverTimestamp(),
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          outcome: 'won' as const,
          laneIndex: currentLane,
          laneReached: currentLane + 1,
          multiplier: mult,
          traps,
          winStreak: nextStreak,
          streakCutRate,
          payout: finalPayout,
          net,
          balance: balanceAfter,
        };
      });

      res.json({ ok: true, ...result });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // ======================== ADMIN ROUTES ========================
  // Admin: List registered users
  apiRouter.get('/admin/users', async (req, res) => {
    try {
      await requireAdmin(req);

      const [usersSnap, adminsSnap] = await Promise.all([
        adminDb.collection('users').get(),
        adminDb.collection('admins').get(),
      ]);

      const adminUids = new Set<string>();
      adminsSnap.forEach((docSnap) => {
        if (docSnap.data()?.role === 'admin') {
          adminUids.add(docSnap.id);
        }
      });

      const usersMap = new Map<
        string,
        {
          uid: string;
          publicUid: string;
          email: string;
          mobile?: string;
          phoneNumber?: string;
          authMethod: 'email' | 'mobile';
          displayName: string;
          balance: number;
          colourWinStreak: number;
          jhandiWinStreak: number;
          chickenWinStreak: number;
          followBonusClaimed: boolean;
          lastResetAtMs: number;
          createdAtMs?: number;
          updatedAtMs?: number;
          isAdmin: boolean;
        }
      >();

      const missingPublicUids: string[] = [];

      usersSnap.forEach((docSnap) => {
        const d = docSnap.data();
        const createdTs = toMillisSafe(d.createdAt ?? d.createdAtMs);
        const updatedTs = toMillisSafe(d.updatedAt ?? d.updatedAtMs);
        const existingPublicUid = isValidPublicUid(d.publicUid) ? d.publicUid : '';
        if (!existingPublicUid) {
          missingPublicUids.push(docSnap.id);
        }
        const docEmail = String(d.email || '');
        const inferredMobile = extractVerifiedMobileInfo(docEmail, String(d.phoneNumber || ''));
        const mobileVal =
          typeof d.mobile === 'string' && d.mobile.trim()
            ? d.mobile.trim()
            : inferredMobile.mobile;
        const phoneVal =
          typeof d.phoneNumber === 'string' && d.phoneNumber.trim()
            ? d.phoneNumber.trim()
            : inferredMobile.phoneNumber;
        const authMethodVal: 'email' | 'mobile' =
          d.authMethod === 'mobile' || Boolean(mobileVal) ? 'mobile' : 'email';

        usersMap.set(docSnap.id, {
          uid: docSnap.id,
          publicUid: existingPublicUid,
          email: docEmail,
          mobile: mobileVal || undefined,
          phoneNumber: phoneVal || undefined,
          authMethod: authMethodVal,
          displayName: String(d.displayName || (mobileVal ? `+91 ${mobileVal}` : 'Player')),
          balance: typeof d.balance === 'number' ? d.balance : 0,
          colourWinStreak: typeof d.colourWinStreak === 'number' ? d.colourWinStreak : 0,
          jhandiWinStreak: typeof d.jhandiWinStreak === 'number' ? d.jhandiWinStreak : 0,
          chickenWinStreak: typeof d.chickenWinStreak === 'number' ? d.chickenWinStreak : 0,
          followBonusClaimed: Boolean(d.followBonusClaimed),
          lastResetAtMs: typeof d.lastResetAtMs === 'number' ? d.lastResetAtMs : 0,
          createdAtMs: createdTs,
          updatedAtMs: updatedTs,
          isAdmin: adminUids.has(docSnap.id),
        });
      });

      if (missingPublicUids.length > 0) {
        await Promise.all(
          missingPublicUids.map(async (uid) => {
            try {
              const assignedPublicUid = await ensureUserPublicUid(uid);
              const entry = usersMap.get(uid);
              if (entry) {
                entry.publicUid = assignedPublicUid;
              }
            } catch (backfillErr) {
              console.warn(`Failed to backfill 6-digit publicUid for ${uid}:`, backfillErr);
            }
          })
        );
      }

      // List all Firebase Auth users (paginated) and backfill any missing Firestore users/{uid} docs
      try {
        let nextPageToken: string | undefined;
        do {
          const listRes = await adminAuth.listUsers(1000, nextPageToken);
          for (const authUser of listRes.users) {
            const rawEmail = (authUser.email || `${authUser.uid}@ogtrade.local`).slice(0, 254);
            const verifiedMobile = extractVerifiedMobileInfo(
              authUser.email || '',
              authUser.phoneNumber || ''
            );
            const existing = usersMap.get(authUser.uid);
            if (existing) {
              if (!existing.email && authUser.email) existing.email = authUser.email;
              if (!existing.mobile && verifiedMobile.mobile) {
                existing.mobile = verifiedMobile.mobile;
                existing.phoneNumber = verifiedMobile.phoneNumber;
                existing.authMethod = 'mobile';
              }
              if ((!existing.displayName || existing.displayName === 'Player') && authUser.displayName) {
                existing.displayName = authUser.displayName;
              }
              continue;
            }

            const fallbackName =
              verifiedMobile.authMethod === 'mobile'
                ? `+91 ${verifiedMobile.mobile}`
                : rawEmail.includes('@')
                  ? rawEmail.split('@')[0]
                  : 'OG Player';
            const displayName =
              (authUser.displayName || fallbackName).trim().slice(0, 40) || 'OG Player';
            const createdMs = authUser.metadata?.creationTime
              ? Date.parse(authUser.metadata.creationTime)
              : Date.now();
            const safeCreatedMs = Number.isFinite(createdMs) ? createdMs : Date.now();

            try {
              const syncedDoc = await adminDb.runTransaction(async (tx) => {
                const userRef = adminDb.collection('users').doc(authUser.uid);
                const snap = await tx.get(userRef);
                if (snap.exists) {
                  const data = snap.data()!;
                  const existingUid = isValidPublicUid(data.publicUid) ? data.publicUid : '';
                  const mobileVal =
                    typeof data.mobile === 'string' && data.mobile.trim()
                      ? data.mobile.trim()
                      : verifiedMobile.mobile;
                  const phoneVal =
                    typeof data.phoneNumber === 'string' && data.phoneNumber.trim()
                      ? data.phoneNumber.trim()
                      : verifiedMobile.phoneNumber;
                  return {
                    uid: authUser.uid,
                    publicUid: existingUid,
                    email: String(data.email || rawEmail),
                    mobile: mobileVal || undefined,
                    phoneNumber: phoneVal || undefined,
                    authMethod: (data.authMethod === 'mobile' || Boolean(mobileVal)
                      ? 'mobile'
                      : 'email') as 'email' | 'mobile',
                    displayName: String(data.displayName || displayName),
                    balance: typeof data.balance === 'number' ? data.balance : INITIAL_BALANCE,
                    colourWinStreak: typeof data.colourWinStreak === 'number' ? data.colourWinStreak : 0,
                    jhandiWinStreak: typeof data.jhandiWinStreak === 'number' ? data.jhandiWinStreak : 0,
                    chickenWinStreak: typeof data.chickenWinStreak === 'number' ? data.chickenWinStreak : 0,
                    followBonusClaimed: Boolean(data.followBonusClaimed),
                    lastResetAtMs:
                      typeof data.lastResetAtMs === 'number' ? data.lastResetAtMs : safeCreatedMs,
                    createdAtMs: toMillisSafe(data.createdAt ?? data.createdAtMs) ?? safeCreatedMs,
                    updatedAtMs: toMillisSafe(data.updatedAt ?? data.updatedAtMs) ?? safeCreatedMs,
                    isAdmin: adminUids.has(authUser.uid),
                  };
                }

                const { publicUid, publicUidRef } = await reserveUniquePublicUidInTx(
                  tx,
                  authUser.uid
                );
                const txId = makeTxId('welcome');
                tx.set(publicUidRef, {
                  publicUid,
                  uid: authUser.uid,
                  createdAt: FieldValue.serverTimestamp(),
                });
                tx.set(userRef, {
                  uid: authUser.uid,
                  publicUid,
                  email: rawEmail,
                  ...(verifiedMobile.mobile ? { mobile: verifiedMobile.mobile } : {}),
                  ...(verifiedMobile.phoneNumber ? { phoneNumber: verifiedMobile.phoneNumber } : {}),
                  authMethod: verifiedMobile.authMethod,
                  photoURL: String(authUser.photoURL || '').slice(0, 512),
                  displayName,
                  balance: INITIAL_BALANCE,
                  referralCode: generateReferralCode(authUser.uid),
                  referredBy: '',
                  referredByCode: '',
                  referralCount: 0,
                  referralBonusEarned: 0,
                  colourWinStreak: 0,
                  jhandiWinStreak: 0,
                  chickenWinStreak: 0,
                  lastResetAtMs: safeCreatedMs,
                  followBonusClaimed: false,
                  createdAt: FieldValue.serverTimestamp(),
                  updatedAt: FieldValue.serverTimestamp(),
                });
                tx.set(userRef.collection('transactions').doc(txId), {
                  id: txId,
                  uid: authUser.uid,
                  type: 'welcome_bonus',
                  game: 'wallet',
                  amount: INITIAL_BALANCE,
                  balanceBefore: 0,
                  balanceAfter: INITIAL_BALANCE,
                  description: 'Welcome bonus (10K DC)',
                  reason: 'New account welcome bonus',
                  referenceId: txId,
                  timestamp: FieldValue.serverTimestamp(),
                  createdAtMs: safeCreatedMs,
                  createdAt: FieldValue.serverTimestamp(),
                });

                return {
                  uid: authUser.uid,
                  publicUid,
                  email: rawEmail,
                  mobile: verifiedMobile.mobile || undefined,
                  phoneNumber: verifiedMobile.phoneNumber || undefined,
                  authMethod: verifiedMobile.authMethod,
                  displayName,
                  balance: INITIAL_BALANCE,
                  colourWinStreak: 0,
                  jhandiWinStreak: 0,
                  chickenWinStreak: 0,
                  followBonusClaimed: false,
                  lastResetAtMs: safeCreatedMs,
                  createdAtMs: safeCreatedMs,
                  updatedAtMs: safeCreatedMs,
                  isAdmin: adminUids.has(authUser.uid),
                };
              });
              usersMap.set(authUser.uid, syncedDoc);
            } catch (syncErr) {
              console.warn(
                `Failed to sync Auth user ${authUser.uid} into Firestore users:`,
                syncErr instanceof Error ? syncErr.message : String(syncErr)
              );
              usersMap.set(authUser.uid, {
                uid: authUser.uid,
                publicUid: '',
                email: authUser.email || '',
                mobile: verifiedMobile.mobile || undefined,
                phoneNumber: verifiedMobile.phoneNumber || undefined,
                authMethod: verifiedMobile.authMethod,
                displayName,
                balance: INITIAL_BALANCE,
                colourWinStreak: 0,
                jhandiWinStreak: 0,
                chickenWinStreak: 0,
                followBonusClaimed: false,
                lastResetAtMs: safeCreatedMs,
                createdAtMs: safeCreatedMs,
                updatedAtMs: safeCreatedMs,
                isAdmin: adminUids.has(authUser.uid),
              });
            }
          }
          nextPageToken = listRes.pageToken;
        } while (nextPageToken);
      } catch (listErr) {
        const listErrCode = (listErr as { code?: unknown })?.code || 'unknown';
        console.warn(
          `Admin listUsers sync skipped (${String(listErrCode)}):`,
          listErr instanceof Error ? listErr.message : String(listErr)
        );
      }

      const users = Array.from(usersMap.values()).sort(
        (a, b) => (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0)
      );

      res.json({ ok: true, users });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Admin: View transaction history (global admin ledger + optional selected user wallet ledger)
  apiRouter.get('/admin/transactions', async (req, res) => {
    try {
      await requireAdmin(req);
      const targetUid = typeof req.query.uid === 'string' ? req.query.uid.trim() : '';

      let adminTxDocs;
      try {
        const adminTxSnap = await adminDb
          .collection('adminTransactions')
          .orderBy('createdAtMs', 'desc')
          .limit(150)
          .get();
        adminTxDocs = adminTxSnap.docs;
      } catch (queryErr) {
        const qCode = (queryErr as { code?: unknown })?.code;
        if (qCode === 9 || (queryErr instanceof Error && queryErr.message.includes('index'))) {
          const fallbackSnap = await adminDb.collection('adminTransactions').limit(150).get();
          adminTxDocs = fallbackSnap.docs;
        } else {
          throw queryErr;
        }
      }

      const adminTransactions = adminTxDocs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            targetUid: String(data.targetUid || ''),
            targetPublicUid: isValidPublicUid(data.targetPublicUid) ? data.targetPublicUid : undefined,
            targetEmail: String(data.targetEmail || ''),
            targetName: String(data.targetName || ''),
            type: data.type === 'deduct' ? ('deduct' as const) : ('add' as const),
            amount: typeof data.amount === 'number' ? data.amount : 0,
            signedAmount: typeof data.signedAmount === 'number' ? data.signedAmount : 0,
            balanceBefore: typeof data.balanceBefore === 'number' ? data.balanceBefore : 0,
            balanceAfter: typeof data.balanceAfter === 'number' ? data.balanceAfter : 0,
            reason: String(data.reason || ''),
            adminUid: String(data.adminUid || ''),
            adminEmail: String(data.adminEmail || ''),
            createdAtMs:
              toMillisSafe(data.createdAtMs ?? data.createdAt ?? data.timestamp) ?? 0,
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs);

      let userTransactions: Array<{
        id: string;
        uid: string;
        type: string;
        game: string;
        amount: number;
        balanceBefore: number;
        balanceAfter: number;
        description: string;
        reason?: string;
        adminUid?: string;
        referenceId: string;
        createdAtMs: number;
      }> = [];
      if (targetUid && isValidDocId(targetUid)) {
        const txCollection = adminDb.collection('users').doc(targetUid).collection('transactions');
        let userTxDocs;
        try {
          const userTxSnap = await txCollection.orderBy('createdAtMs', 'desc').limit(60).get();
          userTxDocs = userTxSnap.docs;
        } catch (queryErr) {
          const qCode = (queryErr as { code?: unknown })?.code;
          if (qCode === 9 || (queryErr instanceof Error && queryErr.message.includes('index'))) {
            const fallbackSnap = await txCollection.limit(60).get();
            userTxDocs = fallbackSnap.docs;
          } else {
            throw queryErr;
          }
        }
        userTransactions = userTxDocs
          .map((d) => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              uid: String(data.uid || targetUid),
              type: String(data.type || 'wallet'),
              game: String(data.game || 'wallet'),
              amount: typeof data.amount === 'number' ? data.amount : 0,
              balanceBefore: typeof data.balanceBefore === 'number' ? data.balanceBefore : 0,
              balanceAfter: typeof data.balanceAfter === 'number' ? data.balanceAfter : 0,
              description: String(data.description || ''),
              reason: typeof data.reason === 'string' ? data.reason : undefined,
              adminUid: typeof data.adminUid === 'string' ? data.adminUid : undefined,
              referenceId: String(data.referenceId || d.id),
              createdAtMs:
                toMillisSafe(data.createdAtMs ?? data.createdAt ?? data.timestamp) ?? 0,
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
      }

      res.json({ ok: true, adminTransactions, userTransactions });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  // Admin: Atomic add or deduct coins with reason & audit log
  apiRouter.post('/admin/wallet-adjust', async (req, res) => {
    try {
      const adminCaller = await requireAdmin(req);
      const { targetUid, operation, amount, reason } = req.body as {
        targetUid?: string;
        operation?: 'add' | 'deduct';
        amount?: number;
        reason?: string;
      };

      if (!isValidDocId(targetUid)) {
        throw new HttpError(400, 'Invalid target user UID.');
      }
      if (operation !== 'add' && operation !== 'deduct') {
        throw new HttpError(400, 'Operation must be "add" or "deduct".');
      }
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new HttpError(400, 'Amount must be a positive number.');
      }
      const cleanAmount = roundCurrency(amount);
      if (cleanAmount > 1_000_000_000) {
        throw new HttpError(400, 'Single adjustment exceeds maximum limit (1B DC).');
      }
      const cleanReason = typeof reason === 'string' ? reason.trim() : '';
      if (cleanReason.length < 3 || cleanReason.length > 200) {
        throw new HttpError(400, 'Reason must be between 3 and 200 characters.');
      }

      const userRef = adminDb.collection('users').doc(targetUid);
      const adminTxCollection = adminDb.collection('adminTransactions');

      const result = await adminDb.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        const now = Date.now();
        let userData = userSnap.exists ? userSnap.data()! : null;

        // If user exists in Auth listUsers but had no Firestore wallet doc yet, try resolving from Auth
        if (!userData) {
          try {
            const authUser = await adminAuth.getUser(targetUid);
            const rawEmail = (authUser.email || `${targetUid}@ogtrade.local`).slice(0, 254);
            const displayName =
              authUser.displayName || (rawEmail.includes('@') ? rawEmail.split('@')[0] : 'Player');
            userData = {
              uid: targetUid,
              email: rawEmail,
              photoURL: authUser.photoURL || '',
              displayName: displayName.slice(0, 40),
              balance: INITIAL_BALANCE,
              referralCode: generateReferralCode(targetUid),
              referredBy: '',
              referredByCode: '',
              referralCount: 0,
              referralBonusEarned: 0,
              colourWinStreak: 0,
              jhandiWinStreak: 0,
              chickenWinStreak: 0,
              lastResetAtMs: now,
              followBonusClaimed: false,
            };
          } catch {
            throw new HttpError(404, 'Target user wallet not found.');
          }
        }

        // Reserve permanent 6-digit publicUid BEFORE writes if missing
        let resolvedPublicUid =
          userData && isValidPublicUid(userData.publicUid) ? userData.publicUid : '';
        let pendingPublicUidRef: DocumentReference | null = null;
        if (userData && !resolvedPublicUid) {
          const reserved = await reserveUniquePublicUidInTx(tx, targetUid);
          resolvedPublicUid = reserved.publicUid;
          pendingPublicUidRef = reserved.publicUidRef;
        }

        const balanceBefore = typeof userData.balance === 'number' ? userData.balance : 0;
        const signedAmount = operation === 'add' ? cleanAmount : -cleanAmount;
        const balanceAfter = roundCurrency(balanceBefore + signedAmount);

        if (balanceAfter < 0) {
          throw new HttpError(
            400,
            `Cannot deduct ${cleanAmount.toLocaleString()} DC; user balance is only ${balanceBefore.toLocaleString()} DC.`
          );
        }

        const txId = makeTxId(operation === 'add' ? 'adm_add' : 'adm_sub');
        const targetEmail = String(userData.phoneNumber || userData.email || '');
        const targetName = String(userData.displayName || targetEmail || targetUid).slice(0, 80);

        if (pendingPublicUidRef && resolvedPublicUid) {
          tx.set(pendingPublicUidRef, {
            publicUid: resolvedPublicUid,
            uid: targetUid,
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        if (userSnap.exists) {
          const updatePayload: Record<string, unknown> = {
            balance: balanceAfter,
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (pendingPublicUidRef && resolvedPublicUid) {
            updatePayload.publicUid = resolvedPublicUid;
          }
          tx.update(userRef, updatePayload);
        } else {
          tx.set(userRef, {
            ...userData,
            publicUid: resolvedPublicUid,
            balance: balanceAfter,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        tx.set(userRef.collection('transactions').doc(txId), {
          id: txId,
          uid: targetUid,
          type: operation === 'add' ? 'admin_credit' : 'admin_debit',
          game: 'wallet',
          amount: signedAmount,
          balanceBefore,
          balanceAfter,
          description: `${operation === 'add' ? 'Admin Credit' : 'Admin Debit'}: ${cleanReason}`.slice(
            0,
            200
          ),
          reason: cleanReason,
          adminUid: adminCaller.uid,
          referenceId: txId,
          timestamp: FieldValue.serverTimestamp(),
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });

        tx.set(adminTxCollection.doc(txId), {
          id: txId,
          targetUid,
          targetPublicUid: resolvedPublicUid,
          targetEmail,
          targetName,
          type: operation,
          amount: cleanAmount,
          signedAmount,
          balanceBefore,
          balanceAfter,
          reason: cleanReason,
          adminUid: adminCaller.uid,
          adminEmail: String(adminCaller.email || ''),
          timestamp: FieldValue.serverTimestamp(),
          createdAtMs: now,
          createdAt: FieldValue.serverTimestamp(),
        });

        return {
          balance: balanceAfter,
          transaction: {
            id: txId,
            targetUid,
            targetPublicUid: resolvedPublicUid,
            targetEmail,
            targetName,
            type: operation,
            amount: cleanAmount,
            signedAmount,
            balanceBefore,
            balanceAfter,
            reason: cleanReason,
            adminUid: adminCaller.uid,
            adminEmail: String(adminCaller.email || ''),
            createdAtMs: now,
          },
        };
      });

      res.json({ ok: true, ...result });
    } catch (err) {
      handleRouteError(res, err);
    }
  });

  apiRouter.use((_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  apiRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    handleRouteError(res, err);
  });

  return apiRouter;
}
