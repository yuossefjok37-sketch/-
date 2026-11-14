/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ActivationCode, ActivityLog, CodeStats, SystemSettings } from '../types/index.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

interface PersistedStore {
  codes: ActivationCode[];
  logs: ActivityLog[];
  settings: SystemSettings;
  dirtyCodeIds: string[];
  deletedCodeIds: string[];
  dirtyLogIds: string[];
  settingsDirty: boolean;
}

// In-memory atomic store backed by durable disk snapshot and authenticated Cloud Firestore sync
const memoryStore = {
  codes: new Map<string, ActivationCode>(),
  logs: [] as ActivityLog[],
  settings: {
    apiKey: 'sec_act_' + crypto.randomBytes(12).toString('hex'),
    appName: 'Android App Client',
    allowNewActivations: true,
    updatedAt: new Date().toISOString()
  } as SystemSettings,
  dirtyCodeIds: new Set<string>(),
  deletedCodeIds: new Set<string>(),
  dirtyLogIds: new Set<string>(),
  settingsDirty: false
};

// Store sync state is reconciled with Cloud Firestore via authenticated admin client SDK + /api/v1/admin/sync

function saveStoreToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const payload: PersistedStore = {
      codes: Array.from(memoryStore.codes.values()),
      logs: memoryStore.logs.slice(0, 2000),
      settings: memoryStore.settings,
      dirtyCodeIds: Array.from(memoryStore.dirtyCodeIds),
      deletedCodeIds: Array.from(memoryStore.deletedCodeIds),
      dirtyLogIds: Array.from(memoryStore.dirtyLogIds),
      settingsDirty: memoryStore.settingsDirty
    };
    const tmpFile = STORE_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(payload), 'utf-8');
    fs.renameSync(tmpFile, STORE_FILE);
  } catch (err) {
    console.warn('Could not persist local store snapshot:', err);
  }
}

function loadStoreFromDisk(): boolean {
  try {
    if (!fs.existsSync(STORE_FILE)) return false;
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedStore>;

    if (Array.isArray(parsed.codes)) {
      memoryStore.codes.clear();
      for (const c of parsed.codes) {
        if (c && c.code) {
          memoryStore.codes.set(c.code.toUpperCase(), { ...c, id: c.code.toUpperCase() });
        }
      }
    }
    if (Array.isArray(parsed.logs)) {
      memoryStore.logs = parsed.logs;
    }
    if (parsed.settings && parsed.settings.apiKey) {
      memoryStore.settings = parsed.settings;
    }
    if (Array.isArray(parsed.dirtyCodeIds)) {
      memoryStore.dirtyCodeIds = new Set(parsed.dirtyCodeIds);
    }
    if (Array.isArray(parsed.deletedCodeIds)) {
      memoryStore.deletedCodeIds = new Set(parsed.deletedCodeIds);
    }
    if (Array.isArray(parsed.dirtyLogIds)) {
      memoryStore.dirtyLogIds = new Set(parsed.dirtyLogIds);
    }
    memoryStore.settingsDirty = Boolean(parsed.settingsDirty);
    return true;
  } catch (err) {
    console.warn('Could not read local store snapshot:', err);
    return false;
  }
}

const DEMO_SEED_IDS = new Set([
  'ACT-DEMO-VIP1-2026',
  'ACT-TEST-WEEK-7788',
  'ACT-TEST-DAYS-3333'
]);

function clipStr(val: string | null | undefined, maxLen: number): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function toFirestoreCodePayload(codeObj: ActivationCode): Record<string, unknown> {
  const days = Math.min(Math.max(1, Math.round(Number(codeObj.durationDays) || 1)), 3650);
  return {
    code: String(codeObj.code).slice(0, 64),
    batchId: clipStr(codeObj.batchId, 64),
    durationDays: days,
    durationLabel: clipStr(codeObj.durationLabel, 50),
    status: codeObj.status,
    createdAt: String(codeObj.createdAt).slice(0, 50),
    firstActivatedAt: clipStr(codeObj.firstActivatedAt, 50),
    expiresAt: clipStr(codeObj.expiresAt, 50),
    deviceToken: clipStr(codeObj.deviceToken, 256),
    deviceModel: clipStr(codeObj.deviceModel, 128),
    deviceOs: clipStr(codeObj.deviceOs, 64),
    appVersion: clipStr(codeObj.appVersion, 32),
    lastVerifiedAt: clipStr(codeObj.lastVerifiedAt, 50),
    note: clipStr(codeObj.note, 500),
    createdBy: clipStr(codeObj.createdBy ?? 'yuossefjok37@gmail.com', 128)
  };
}

function toFirestoreLogPayload(log: ActivityLog): Record<string, unknown> {
  return {
    action: String(log.action).slice(0, 64),
    code: String(log.code || '').slice(0, 64),
    deviceToken: clipStr(log.deviceToken, 256),
    performedBy: String(log.performedBy || 'system').slice(0, 128),
    timestamp: String(log.timestamp).slice(0, 50),
    details: String(log.details || '').slice(0, 500),
    ipAddress: clipStr(log.ipAddress, 128)
  };
}

function toFirestoreSettingsPayload(settings: SystemSettings): Record<string, unknown> {
  return {
    apiKey: String(settings.apiKey).slice(0, 128),
    appName: String(settings.appName || 'Android App Client').slice(0, 100),
    allowNewActivations: Boolean(settings.allowNewActivations),
    updatedAt: String(settings.updatedAt || new Date().toISOString()).slice(0, 50)
  };
}

export interface PendingFirestoreSync {
  codesToPush: { docId: string; data: Record<string, unknown> }[];
  deletedCodeIds: string[];
  logsToPush: { docId: string; data: Record<string, unknown> }[];
  settingsToPush: Record<string, unknown> | null;
}

export function getPendingFirestoreSync(): PendingFirestoreSync {
  const codesToPush: { docId: string; data: Record<string, unknown> }[] = [];
  for (const codeId of Array.from(memoryStore.dirtyCodeIds)) {
    const item = memoryStore.codes.get(codeId);
    if (item) {
      codesToPush.push({
        docId: item.code.toUpperCase(),
        data: toFirestoreCodePayload(item)
      });
    }
  }

  const logsToPush: { docId: string; data: Record<string, unknown> }[] = [];
  for (const log of memoryStore.logs) {
    if (memoryStore.dirtyLogIds.has(log.id)) {
      logsToPush.push({
        docId: log.id,
        data: toFirestoreLogPayload(log)
      });
    }
  }

  return {
    codesToPush,
    deletedCodeIds: Array.from(memoryStore.deletedCodeIds),
    logsToPush,
    settingsToPush: memoryStore.settingsDirty
      ? toFirestoreSettingsPayload(memoryStore.settings)
      : null
  };
}

export function reconcileFromFirestore(remote: {
  codes?: ActivationCode[];
  logs?: ActivityLog[];
  settings?: SystemSettings | null;
}): PendingFirestoreSync {
  const remoteCodes = Array.isArray(remote.codes) ? remote.codes : [];
  const remoteLogs = Array.isArray(remote.logs) ? remote.logs : [];
  const remoteSettings = remote.settings || null;

  const remoteCodeMap = new Map<string, ActivationCode>();
  for (const rc of remoteCodes) {
    const key = String(rc.code || rc.id || '').toUpperCase();
    if (key) {
      remoteCodeMap.set(key, { ...rc, id: key, code: key });
    }
  }

  if (remoteCodeMap.size > 0) {
    for (const [key, rc] of remoteCodeMap.entries()) {
      if (memoryStore.deletedCodeIds.has(key)) {
        continue;
      }
      if (memoryStore.dirtyCodeIds.has(key)) {
        const local = memoryStore.codes.get(key);
        if (
          local &&
          DEMO_SEED_IDS.has(key) &&
          local.status === 'active' &&
          !local.firstActivatedAt
        ) {
          memoryStore.codes.set(key, rc);
          memoryStore.dirtyCodeIds.delete(key);
        } else if (local) {
          local.createdAt = rc.createdAt;
        } else {
          memoryStore.codes.set(key, rc);
          memoryStore.dirtyCodeIds.delete(key);
        }
      } else {
        memoryStore.codes.set(key, rc);
      }
    }

    for (const seedId of DEMO_SEED_IDS) {
      if (!remoteCodeMap.has(seedId) && !memoryStore.dirtyCodeIds.has(seedId)) {
        memoryStore.codes.delete(seedId);
      }
    }
  } else if (memoryStore.codes.size > 0) {
    for (const c of memoryStore.codes.values()) {
      memoryStore.dirtyCodeIds.add(c.code.toUpperCase());
    }
  }

  const remoteLogIds = new Set(remoteLogs.map((l) => l.id));
  for (const rl of remoteLogs) {
    memoryStore.dirtyLogIds.delete(rl.id);
  }

  if (remoteLogs.length > 0) {
    const existingLogIds = new Set(memoryStore.logs.map((l) => l.id));
    for (const rl of remoteLogs) {
      if (!existingLogIds.has(rl.id)) {
        memoryStore.logs.push(rl);
      }
    }
    memoryStore.logs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    if (memoryStore.logs.length > 2000) {
      memoryStore.logs.length = 2000;
    }
  } else if (memoryStore.logs.length > 0) {
    for (const log of memoryStore.logs) {
      if (!remoteLogIds.has(log.id)) {
        memoryStore.dirtyLogIds.add(log.id);
      }
    }
  }

  if (remoteSettings && remoteSettings.apiKey) {
    if (!memoryStore.settingsDirty) {
      memoryStore.settings = {
        apiKey: remoteSettings.apiKey,
        appName: remoteSettings.appName,
        allowNewActivations: Boolean(remoteSettings.allowNewActivations),
        updatedAt: remoteSettings.updatedAt
      };
    }
  } else {
    memoryStore.settingsDirty = true;
  }

  saveStoreToDisk();
  return getPendingFirestoreSync();
}

export function acknowledgeFirestoreSync(ack: {
  syncedCodeIds?: string[];
  deletedCodeIds?: string[];
  syncedLogIds?: string[];
  settingsSynced?: boolean;
}) {
  if (Array.isArray(ack.syncedCodeIds)) {
    for (const id of ack.syncedCodeIds) {
      memoryStore.dirtyCodeIds.delete(String(id).toUpperCase());
    }
  }
  if (Array.isArray(ack.deletedCodeIds)) {
    for (const id of ack.deletedCodeIds) {
      memoryStore.deletedCodeIds.delete(String(id).toUpperCase());
    }
  }
  if (Array.isArray(ack.syncedLogIds)) {
    for (const id of ack.syncedLogIds) {
      memoryStore.dirtyLogIds.delete(String(id));
    }
  }
  if (ack.settingsSynced) {
    memoryStore.settingsDirty = false;
  }
  saveStoreToDisk();
}

// Concurrency mutex to prevent race condition during atomic activations
const lockMap = new Map<string, Promise<void>>();

async function acquireLock(key: string): Promise<() => void> {
  while (lockMap.has(key)) {
    await lockMap.get(key);
  }
  let unlock: () => void = () => {};
  const lockPromise = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  lockMap.set(key, lockPromise);
  return () => {
    lockMap.delete(key);
    unlock();
  };
}

// Helper to log system events (never leaves undefined values)
export async function addActivityLog(
  action: ActivityLog['action'],
  code: string,
  performedBy: string,
  details: string,
  deviceToken?: string | null,
  ipAddress?: string | null,
  explicitToken?: string
): Promise<ActivityLog> {
  const log: ActivityLog = {
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    action,
    code,
    deviceToken: deviceToken ?? null,
    performedBy,
    timestamp: new Date().toISOString(),
    details,
    ipAddress: ipAddress || undefined
  };

  memoryStore.logs.unshift(log);
  if (memoryStore.logs.length > 2000) {
    memoryStore.logs.pop();
  }

  memoryStore.dirtyLogIds.add(log.id);
  saveStoreToDisk();
  return log;
}

// Generate unique code string
export function generateUniqueCodeString(prefix: string = 'ACT', segments: number = 3): string {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '').trim().toUpperCase();
  const parts: string[] = [];
  if (cleanPrefix) {
    parts.push(cleanPrefix);
  }
  for (let s = 0; s < segments; s++) {
    let seg = '';
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) {
      seg += characters[bytes[i] % characters.length];
    }
    parts.push(seg);
  }
  return parts.join('-');
}

// Initialize local durable store on boot (no hardcoded mock codes; data lives in Firestore)
export async function initializeDatabase() {
  const loaded = loadStoreFromDisk();
  if (!loaded) {
    saveStoreToDisk();
    console.log('[Server DB] Initialized empty durable store awaiting Firestore sync');
  } else {
    console.log(`[Server DB] Loaded ${memoryStore.codes.size} codes from local snapshot`);
  }
}

async function persistCodeChange(codeObj: ActivationCode, _explicitToken?: string) {
  const key = codeObj.code.toUpperCase();
  memoryStore.codes.set(key, codeObj);
  memoryStore.deletedCodeIds.delete(key);
  memoryStore.dirtyCodeIds.add(key);
  saveStoreToDisk();
}

// Core Atomic Activation Routine (Server-Authoritative)
export async function activateCodeAtomically(params: {
  code: string;
  deviceToken: string;
  deviceModel?: string;
  deviceOs?: string;
  appVersion?: string;
  ipAddress?: string;
}) {
  const cleanCode = (params.code || '').trim().toUpperCase();
  const cleanDeviceToken = (params.deviceToken || '').trim();

  if (!cleanCode) {
    return { status: 400, body: { success: false, message: 'يرجى تقديم كود التفعيل.' } };
  }
  if (!cleanDeviceToken || cleanDeviceToken.length < 16) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'مفتاح التثبيت التشفيري للجهاز (deviceToken) غير صالح أو قصير جداً.'
      }
    };
  }

  if (!memoryStore.settings.allowNewActivations) {
    return {
      status: 403,
      body: { success: false, message: 'عمليات التفعيل الجديدة موقوفة مؤقتاً من قبل الإدارة.' }
    };
  }

  const releaseLock = await acquireLock(cleanCode);

  try {
    const existingCode = memoryStore.codes.get(cleanCode);

    if (!existingCode) {
      await addActivityLog(
        'activate',
        cleanCode,
        'device:' + cleanDeviceToken.substring(0, 8),
        'محاولة تفعيل فاشلة: الكود غير موجود بالنظام',
        cleanDeviceToken,
        params.ipAddress
      );
      return {
        status: 404,
        body: { success: false, message: 'كود التفعيل غير صحيح أو غير مسجل بالنظام.' }
      };
    }

    if (existingCode.status === 'suspended') {
      await addActivityLog(
        'activate',
        cleanCode,
        'device:' + cleanDeviceToken.substring(0, 8),
        'محاولة تفعيل مرفوضة: الكود موقوف إدارياً',
        cleanDeviceToken,
        params.ipAddress
      );
      return {
        status: 403,
        body: {
          success: false,
          status: 'suspended',
          message: 'تم إيقاف هذا الكود بواسطة إدارة النظام. يرجى التواصل مع الدعم.'
        }
      };
    }

    const now = new Date();

    if (existingCode.status === 'bound') {
      if (existingCode.deviceToken === cleanDeviceToken) {
        if (existingCode.expiresAt && new Date(existingCode.expiresAt).getTime() <= now.getTime()) {
          existingCode.status = 'expired';
          await persistCodeChange(existingCode);

          return {
            status: 403,
            body: {
              success: false,
              status: 'expired',
              message: 'انتهت صلاحية اشتراك هذا الكود.',
              expiresAt: existingCode.expiresAt
            }
          };
        }

        existingCode.lastVerifiedAt = now.toISOString();
        if (params.deviceModel) existingCode.deviceModel = params.deviceModel;
        if (params.deviceOs) existingCode.deviceOs = params.deviceOs;
        if (params.appVersion) existingCode.appVersion = params.appVersion;
        await persistCodeChange(existingCode);

        const diffMs = existingCode.expiresAt
          ? new Date(existingCode.expiresAt).getTime() - now.getTime()
          : 0;
        const remainingDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        const remainingHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));

        return {
          status: 200,
          body: {
            success: true,
            status: 'bound',
            message: 'تم التحقق من تفعيل الجهاز بنجاح. الاشتراك سارٍ.',
            code: cleanCode,
            durationDays: existingCode.durationDays,
            remainingDays,
            remainingHours,
            firstActivatedAt: existingCode.firstActivatedAt,
            expiresAt: existingCode.expiresAt,
            deviceToken: cleanDeviceToken
          }
        };
      } else {
        await addActivityLog(
          'activate',
          cleanCode,
          'device:' + cleanDeviceToken.substring(0, 8),
          `محاولة ربط مرفوضة: الكود مقفل بالفعل على جهاز آخر (${existingCode.deviceModel || 'جهاز آخر'})`,
          cleanDeviceToken,
          params.ipAddress
        );

        return {
          status: 409,
          body: {
            success: false,
            status: 'bound',
            message: 'هذا الكود مرتبط بالفعل بتثبيت جهاز آخر. يمنع استخدام الكود على أكثر من جهاز واحد.',
            conflict: true
          }
        };
      }
    }

    if (existingCode.status === 'expired') {
      return {
        status: 403,
        body: { success: false, status: 'expired', message: 'انتهت صلاحية هذا الكود.' }
      };
    }

    // FIRST TIME ACTIVATION (status === 'active')
    const firstActivatedAt = now.toISOString();
    const durationMs = existingCode.durationDays * 24 * 60 * 60 * 1000;
    const expiresAt = existingCode.expiresAt && new Date(existingCode.expiresAt).getTime() > now.getTime()
      ? existingCode.expiresAt
      : new Date(now.getTime() + durationMs).toISOString();

    const updatedCode: ActivationCode = {
      ...existingCode,
      status: 'bound',
      firstActivatedAt: existingCode.firstActivatedAt || firstActivatedAt,
      expiresAt,
      deviceToken: cleanDeviceToken,
      deviceModel: params.deviceModel || 'Android Device',
      deviceOs: params.deviceOs || 'Android',
      appVersion: params.appVersion || '1.0.0',
      lastVerifiedAt: firstActivatedAt
    };

    await persistCodeChange(updatedCode);

    await addActivityLog(
      'activate',
      cleanCode,
      'device:' + cleanDeviceToken.substring(0, 8),
      `تم التفعيل الأولي بنجاح وربط الكود بالجهاز (${params.deviceModel || 'Android'}). تنتهي الصلاحية في: ${new Date(expiresAt).toLocaleDateString('ar-EG')}`,
      cleanDeviceToken,
      params.ipAddress
    );

    const diffMs = new Date(expiresAt).getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const remainingHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));

    return {
      status: 200,
      body: {
        success: true,
        status: 'bound',
        message: 'تم تفعيل الكود بنجاح وربطه بهذا الجهاز.',
        code: cleanCode,
        durationDays: updatedCode.durationDays,
        remainingDays,
        remainingHours,
        firstActivatedAt: updatedCode.firstActivatedAt,
        expiresAt,
        deviceToken: cleanDeviceToken
      }
    };
  } finally {
    releaseLock();
  }
}

// Verification Routine
export async function verifyCode(params: {
  code: string;
  deviceToken: string;
  ipAddress?: string;
}) {
  const cleanCode = (params.code || '').trim().toUpperCase();
  const cleanDeviceToken = (params.deviceToken || '').trim();

  if (!cleanCode || !cleanDeviceToken) {
    return {
      status: 400,
      body: { valid: false, message: 'الكود ومفتاح الجهاز التشفيري مطلوبان.' }
    };
  }

  const codeObj = memoryStore.codes.get(cleanCode);

  if (!codeObj) {
    return {
      status: 404,
      body: { valid: false, message: 'الكود غير موجود.' }
    };
  }

  if (codeObj.status === 'suspended') {
    return {
      status: 403,
      body: {
        valid: false,
        status: 'suspended',
        message: 'تم إيقاف هذا الكود من قبل الإدارة.'
      }
    };
  }

  if (codeObj.deviceToken !== cleanDeviceToken) {
    return {
      status: 403,
      body: {
        valid: false,
        status: codeObj.status,
        deviceMatched: false,
        message: 'مفتاح تثبيت الجهاز غير مطابق للجهاز المرتبط بهذا الكود.'
      }
    };
  }

  const now = new Date();
  if (codeObj.expiresAt && new Date(codeObj.expiresAt).getTime() <= now.getTime()) {
    codeObj.status = 'expired';
    await persistCodeChange(codeObj);

    return {
      status: 403,
      body: {
        valid: false,
        status: 'expired',
        expiresAt: codeObj.expiresAt,
        message: 'انتهت فترة اشتراك الكود.'
      }
    };
  }

  codeObj.lastVerifiedAt = now.toISOString();
  await persistCodeChange(codeObj);

  const diffMs = codeObj.expiresAt
    ? new Date(codeObj.expiresAt).getTime() - now.getTime()
    : 0;
  const remainingDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  const remainingHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));

  return {
    status: 200,
    body: {
      valid: true,
      status: codeObj.status,
      deviceMatched: true,
      message: 'الاشتراك سارٍ ونشط.',
      expiresAt: codeObj.expiresAt,
      remainingDays,
      remainingHours,
      durationDays: codeObj.durationDays
    }
  };
}

// Admin Batch Generation (Up to 1000 codes in one request)
export async function batchGenerateCodes(params: {
  count: number;
  mode: 'random' | 'manual';
  manualCodes?: string[];
  prefix?: string;
  durationDays: number;
  durationLabel?: string;
  note?: string;
  adminEmail: string;
  adminIdToken?: string;
}) {
  const count = Math.min(Math.max(1, params.count || 1), 1000);
  const safeDurationDays = Math.min(Math.max(1, Math.round(Number(params.durationDays) || 30)), 3650);
  const now = new Date().toISOString();
  const batchId = 'batch_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

  const durationLabel =
    params.durationLabel ||
    (safeDurationDays === 1
      ? 'يوم واحد'
      : safeDurationDays === 3
      ? '3 أيام'
      : safeDurationDays === 7
      ? 'أسبوع (7 أيام)'
      : safeDurationDays === 30
      ? 'شهر (30 يوماً)'
      : `${safeDurationDays} يوماً`);

  const createdCodes: ActivationCode[] = [];
  const existingCodesSet = new Set(memoryStore.codes.keys());

  if (params.mode === 'manual' && params.manualCodes && params.manualCodes.length > 0) {
    for (const rawCode of params.manualCodes.slice(0, 1000)) {
      const trimmed = rawCode.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (trimmed.length >= 4 && trimmed.length <= 64 && !existingCodesSet.has(trimmed)) {
        const item: ActivationCode = {
          id: trimmed,
          code: trimmed,
          batchId,
          durationDays: safeDurationDays,
          durationLabel,
          status: 'active',
          createdAt: now,
          firstActivatedAt: null,
          expiresAt: null,
          deviceToken: null,
          note: params.note || null,
          createdBy: params.adminEmail
        };
        memoryStore.codes.set(trimmed, item);
        existingCodesSet.add(trimmed);
        createdCodes.push(item);
      }
    }
  } else {
    let attempts = 0;
    while (createdCodes.length < count && attempts < count * 5) {
      attempts++;
      const generated = generateUniqueCodeString(params.prefix || 'ACT', 3);
      if (!existingCodesSet.has(generated)) {
        const item: ActivationCode = {
          id: generated,
          code: generated,
          batchId,
          durationDays: safeDurationDays,
          durationLabel,
          status: 'active',
          createdAt: now,
          firstActivatedAt: null,
          expiresAt: null,
          deviceToken: null,
          note: params.note || null,
          createdBy: params.adminEmail
        };
        memoryStore.codes.set(generated, item);
        existingCodesSet.add(generated);
        createdCodes.push(item);
      }
    }
  }

  if (createdCodes.length > 0) {
    createdCodes.forEach((c) => memoryStore.dirtyCodeIds.add(c.code.toUpperCase()));
  }

  saveStoreToDisk();

  await addActivityLog(
    'batch_generate',
    createdCodes.length > 0 ? createdCodes[0].code : '',
    params.adminEmail,
    `تم توليد دفعة جديدة تحتوي على ${createdCodes.length} كود اشتراك بنجاح (${durationLabel}). المعرف: ${batchId}`,
    null,
    null,
    params.adminIdToken
  );

  return {
    success: true,
    batchId,
    totalCreated: createdCodes.length,
    codes: createdCodes
  };
}

// Admin Unbind Device
export async function unbindDeviceByAdmin(
  code: string,
  adminEmail: string,
  resetDuration: boolean = false,
  adminIdToken?: string
) {
  const cleanCode = (code || '').trim().toUpperCase();
  const codeObj = memoryStore.codes.get(cleanCode);

  if (!codeObj) {
    return { success: false, message: 'الكود غير موجود.' };
  }

  const prevDevice = codeObj.deviceModel || codeObj.deviceToken?.substring(0, 8) || 'Unknown';

  codeObj.deviceToken = null;
  codeObj.deviceModel = null;
  codeObj.deviceOs = null;
  codeObj.appVersion = null;

  if (resetDuration) {
    codeObj.status = 'active';
    codeObj.firstActivatedAt = null;
    codeObj.expiresAt = null;
  } else {
    codeObj.status = 'active';
  }

  await persistCodeChange(codeObj, adminIdToken);

  await addActivityLog(
    'unbind',
    cleanCode,
    adminEmail,
    `قام المدير بفك ارتباط الجهاز (${prevDevice}) عن الكود. الكود أصبح متاحاً للربط مجدداً.`,
    null,
    null,
    adminIdToken
  );

  return { success: true, message: 'تم فك ارتباط الجهاز بنجاح. يمكن الآن استخدام الكود على جهاز آخر.', code: codeObj };
}

// Admin Toggle Status (Suspend / Resume)
export async function toggleCodeStatusByAdmin(
  code: string,
  newStatus: 'suspended' | 'active' | 'bound',
  adminEmail: string,
  adminIdToken?: string
) {
  const cleanCode = (code || '').trim().toUpperCase();
  const codeObj = memoryStore.codes.get(cleanCode);

  if (!codeObj) {
    return { success: false, message: 'الكود غير موجود.' };
  }

  codeObj.status = newStatus;
  await persistCodeChange(codeObj, adminIdToken);

  const actionName = newStatus === 'suspended' ? 'suspend' : 'resume';
  const desc = newStatus === 'suspended' ? 'تم إيقاف وتجميد الكود' : 'تمت إعادة تفعيل وتشغيل الكود';

  await addActivityLog(
    actionName,
    cleanCode,
    adminEmail,
    `${desc} بواسطة الإدارة.`,
    null,
    null,
    adminIdToken
  );

  return { success: true, message: `${desc} بنجاح.`, code: codeObj };
}

// Admin Delete Code
export async function deleteCodeByAdmin(code: string, adminEmail: string, adminIdToken?: string) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!memoryStore.codes.has(cleanCode)) {
    return { success: false, message: 'الكود غير موجود.' };
  }

  memoryStore.codes.delete(cleanCode);
  memoryStore.dirtyCodeIds.delete(cleanCode);
  memoryStore.deletedCodeIds.add(cleanCode);

  saveStoreToDisk();

  await addActivityLog(
    'delete',
    cleanCode,
    adminEmail,
    `تم حذف الكود نهائياً من النظام.`,
    null,
    null,
    adminIdToken
  );

  return { success: true, message: 'تم حذف الكود بنجاح.' };
}

// Get Codes with Filtering, Search & Pagination
export function getCodes(params: {
  status?: string;
  search?: string;
  batchId?: string;
  limit?: number;
  offset?: number;
}) {
  const all = Array.from(memoryStore.codes.values());

  const nowTime = Date.now();
  for (const c of all) {
    if (c.status === 'bound' && c.expiresAt && new Date(c.expiresAt).getTime() <= nowTime) {
      c.status = 'expired';
      memoryStore.dirtyCodeIds.add(c.code);
    }
  }

  let filtered = all;

  if (params.status && params.status !== 'all') {
    filtered = filtered.filter((c) => c.status === params.status);
  }

  if (params.batchId) {
    filtered = filtered.filter((c) => c.batchId === params.batchId);
  }

  if (params.search && params.search.trim()) {
    const q = params.search.trim().toLowerCase();
    filtered = filtered.filter((c) => {
      return (
        c.code.toLowerCase().includes(q) ||
        (c.deviceToken && c.deviceToken.toLowerCase().includes(q)) ||
        (c.deviceModel && c.deviceModel.toLowerCase().includes(q)) ||
        (c.note && c.note.toLowerCase().includes(q)) ||
        (c.batchId && c.batchId.toLowerCase().includes(q))
      );
    });
  }

  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const total = filtered.length;
  const limit = params.limit || 50;
  const offset = params.offset || 0;
  const paged = filtered.slice(offset, offset + limit);

  return {
    total,
    codes: paged
  };
}

// Compute Statistics
export function getSystemStats(): CodeStats {
  const all = Array.from(memoryStore.codes.values());
  const now = Date.now();

  let active = 0;
  let bound = 0;
  let expired = 0;
  let suspended = 0;

  for (const c of all) {
    if (c.status === 'suspended') {
      suspended++;
    } else if (c.status === 'expired' || (c.expiresAt && new Date(c.expiresAt).getTime() <= now)) {
      expired++;
    } else if (c.status === 'bound') {
      bound++;
    } else {
      active++;
    }
  }

  return {
    total: all.length,
    active,
    bound,
    expired,
    suspended
  };
}

// Get Audit Logs
export function getLogs(limit: number = 100): ActivityLog[] {
  return memoryStore.logs.slice(0, limit);
}

// Settings management
export function getSettings(): SystemSettings {
  return memoryStore.settings;
}

export async function updateSettings(
  newSettings: Partial<SystemSettings>,
  adminEmail: string,
  adminIdToken?: string
) {
  memoryStore.settings = {
    ...memoryStore.settings,
    ...newSettings,
    updatedAt: new Date().toISOString()
  };

  memoryStore.settingsDirty = true;
  saveStoreToDisk();

  await addActivityLog(
    'resume',
    'SETTINGS',
    adminEmail,
    'قام المدير بتحديث إعدادات النظام ومفاتيح الربط',
    null,
    null,
    adminIdToken
  );

  return memoryStore.settings;
}
