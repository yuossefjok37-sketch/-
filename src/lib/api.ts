/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase.ts';
import type {
  ActivationCode,
  CodeStats,
  ActivityLog,
  SystemSettings,
  ActivationResponse,
  VerificationResponse
} from '../types/index.ts';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const BOOTSTRAP_ADMIN_EMAIL = 'yuossefjok37@gmail.com';
const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get('content-type') || '';
  return ct.toLowerCase().includes('application/json');
}

function generateCryptoCode(prefix: string = 'ACT'): string {
  const cleanPrefix = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'ACT';
  const randBytes = new Uint8Array(8);
  crypto.getRandomValues(randBytes);
  const seg = (offset: number) =>
    Array.from(randBytes.slice(offset, offset + 4))
      .map((b) => SAFE_CHARS[b % SAFE_CHARS.length])
      .join('');
  return `${cleanPrefix}-${seg(0)}-${seg(4)}`;
}

function generateRandomApiKey(): string {
  const chars = 'abcdef0123456789';
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let key = 'sec_act_';
  for (let i = 0; i < bytes.length; i++) {
    key += chars[bytes[i] % chars.length];
  }
  return key;
}

function clipStr(val: string | null | undefined, maxLen: number): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function toFirestoreCodeDoc(item: ActivationCode): Record<string, unknown> {
  const days = Math.min(Math.max(1, Math.round(Number(item.durationDays) || 1)), 3650);
  return {
    code: String(item.code).slice(0, 64),
    batchId: clipStr(item.batchId, 64),
    durationDays: days,
    durationLabel: clipStr(item.durationLabel, 50),
    status: item.status,
    createdAt: String(item.createdAt).slice(0, 50),
    firstActivatedAt: clipStr(item.firstActivatedAt, 50),
    expiresAt: clipStr(item.expiresAt, 50),
    deviceToken: clipStr(item.deviceToken, 256),
    deviceModel: clipStr(item.deviceModel, 128),
    deviceOs: clipStr(item.deviceOs, 64),
    appVersion: clipStr(item.appVersion, 32),
    lastVerifiedAt: clipStr(item.lastVerifiedAt, 50),
    note: clipStr(item.note, 500),
    createdBy: clipStr(item.createdBy ?? BOOTSTRAP_ADMIN_EMAIL, 128)
  };
}

async function addFirestoreActivityLog(params: {
  action: ActivityLog['action'];
  code: string;
  performedBy: string;
  details: string;
  deviceToken?: string | null;
}): Promise<void> {
  const payload = {
    action: String(params.action).slice(0, 64),
    code: String(params.code || '').slice(0, 64),
    deviceToken: clipStr(params.deviceToken, 256),
    performedBy: String(params.performedBy || 'admin').slice(0, 128),
    timestamp: new Date().toISOString(),
    details: String(params.details || '').slice(0, 500),
    ipAddress: null
  };
  try {
    console.log('[Firestore] addDoc activityLogs:', payload.action, payload.code);
    await addDoc(collection(db, 'activityLogs'), payload);
    console.log('[Firestore] activityLogs document added successfully');
  } catch (error) {
    console.error('[Firestore] Failed to addDoc activityLogs:', error);
    handleFirestoreError(error, OperationType.CREATE, 'activityLogs');
  }
}

async function getAuthHeaders(includeJson: boolean = false): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('يرجى تسجيل دخول المدير أولاً');
  }
  const token = await user.getIdToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`
  };
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export async function verifyAdminSession(): Promise<{ authorized: boolean; email: string; uid: string }> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('يرجى تسجيل دخول المدير أولاً');
  }

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(apiUrl('/api/v1/admin/me'), { headers });
    if (isJsonResponse(res)) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'غير مصرح لك بالوصول إلى لوحة الإدارة');
      }
      return res.json();
    }
  } catch (err: any) {
    // If the server explicitly rejected the user (not a network/HTML static hosting fallback), rethrow
    if (err instanceof Error && err.message.includes('غير مصرح')) {
      throw err;
    }
    console.log('[Auth] Backend /api/v1/admin/me unavailable, verifying via Firebase & Firestore directly');
  }

  // Static Firebase Hosting fallback: verify emailVerified + bootstrap admin or admins/{uid} doc
  const email = (user.email || '').toLowerCase();
  if (!user.emailVerified) {
    throw new Error('يجب أن يكون البريد الإلكتروني موثقاً للدخول.');
  }

  if (email === BOOTSTRAP_ADMIN_EMAIL) {
    return { authorized: true, email: user.email || BOOTSTRAP_ADMIN_EMAIL, uid: user.uid };
  }

  try {
    const adminDoc = await getDoc(doc(db, 'admins', user.uid));
    if (adminDoc.exists()) {
      return { authorized: true, email: user.email || '', uid: user.uid };
    }
  } catch (error) {
    console.error('[Auth] Error checking admins collection:', error);
  }

  throw new Error('غير مصرح لهذا الحساب بالوصول إلى لوحة الإدارة.');
}

export interface PendingFirestoreSync {
  codesToPush: { docId: string; data: Record<string, unknown> }[];
  deletedCodeIds: string[];
  logsToPush: { docId: string; data: Record<string, unknown> }[];
  settingsToPush: Record<string, unknown> | null;
}

export async function reconcileServerWithFirestore(payload: {
  codes: ActivationCode[];
  logs: ActivityLog[];
  settings: SystemSettings | null;
}): Promise<PendingFirestoreSync | null> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(apiUrl('/api/v1/admin/sync'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!isJsonResponse(res)) return null;
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'فشل مزامنة البيانات مع الخادم');
    }
    return res.json();
  } catch (err) {
    console.log('[Sync] Express backend sync skipped (static/offline mode):', err);
    return null;
  }
}

export async function fetchPendingFirestoreSync(): Promise<PendingFirestoreSync | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(apiUrl('/api/v1/admin/sync/pending'), { headers });
    if (!isJsonResponse(res) || !res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function ackFirestoreSync(ack: {
  syncedCodeIds?: string[];
  deletedCodeIds?: string[];
  syncedLogIds?: string[];
  settingsSynced?: boolean;
}): Promise<void> {
  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(apiUrl('/api/v1/admin/sync/ack'), {
      method: 'POST',
      headers,
      body: JSON.stringify(ack)
    });
    if (!isJsonResponse(res) || !res.ok) return;
  } catch {
    // Ignore in static Firebase Hosting mode
  }
}

export async function fetchCodes(params: {
  status?: string;
  search?: string;
  batchId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; codes: ActivationCode[] }> {
  const query = new URLSearchParams();
  if (params.status && params.status !== 'all') query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  if (params.batchId) query.set('batchId', params.batchId);
  if (params.limit) query.set('limit', String(params.limit));
  if (params.offset) query.set('offset', String(params.offset));

  const headers = await getAuthHeaders();
  const res = await fetch(apiUrl(`/api/v1/admin/codes?${query.toString()}`), { headers });
  if (!res.ok || !isJsonResponse(res)) {
    const err = isJsonResponse(res) ? await res.json().catch(() => ({})) : {};
    throw new Error(err.error || 'فشل جلب قائمة الأكواد');
  }
  return res.json();
}

export async function fetchStats(): Promise<CodeStats> {
  const headers = await getAuthHeaders();
  const res = await fetch(apiUrl('/api/v1/admin/stats'), { headers });
  if (!res.ok || !isJsonResponse(res)) {
    const err = isJsonResponse(res) ? await res.json().catch(() => ({})) : {};
    throw new Error(err.error || 'فشل جلب الإحصائيات');
  }
  return res.json();
}

export async function fetchLogs(limit: number = 100): Promise<ActivityLog[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(apiUrl(`/api/v1/admin/logs?limit=${limit}`), { headers });
  if (!res.ok || !isJsonResponse(res)) {
    const err = isJsonResponse(res) ? await res.json().catch(() => ({})) : {};
    throw new Error(err.error || 'فشل جلب سجل العمليات');
  }
  return res.json();
}

export async function generateCodesBatch(data: {
  count: number;
  mode: 'random' | 'manual';
  manualCodes?: string[];
  prefix?: string;
  durationDays: number;
  durationLabel?: string;
  note?: string;
  adminEmail: string;
}) {
  console.log('[API] Generating codes batch...', { count: data.count, mode: data.mode });

  let result: { batchId: string; codes: ActivationCode[] } | null = null;

  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(apiUrl('/api/v1/admin/generate'), {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    if (isJsonResponse(res)) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[API] Batch generation error:', err);
        throw new Error(err.error || err.message || 'فشل توليد الأكواد');
      }
      result = await res.json();
    }
  } catch (err: any) {
    if (err instanceof Error && (err.message.includes('فشل') || err.message.includes('تكرار') || err.message.includes('أدخل'))) {
      throw err;
    }
    console.log('[API] Backend /api/v1/admin/generate unavailable, generating directly for Firestore');
  }

  // Fallback for static Firebase Hosting: generate/validate directly in browser with Web Crypto & check Firestore
  if (!result) {
    const requestedCount = Math.min(Math.max(1, Number(data.count) || 1), 1000);
    const durationDays = Math.min(Math.max(1, Number(data.durationDays) || 1), 3650);
    const batchId = `batch_${Date.now()}`;
    const nowIso = new Date().toISOString();

    const existingSnap = await getDocs(collection(db, 'codes'));
    const existingSet = new Set(existingSnap.docs.map((d) => d.id.toUpperCase()));

    const generatedList: ActivationCode[] = [];

    if (data.mode === 'manual') {
      const manualList = (data.manualCodes || [])
        .map((c) => c.trim().toUpperCase())
        .filter((c) => /^[A-Z0-9_-]{4,64}$/.test(c));

      if (manualList.length === 0) {
        throw new Error('يرجى إدخال أكواد صالحة (4 أحرف على الأقل، حروف إنجليزية وأرقام وشرطات فقط).');
      }

      const uniqueManual = Array.from(new Set(manualList));
      for (const codeStr of uniqueManual) {
        if (existingSet.has(codeStr)) {
          throw new Error(`الكود "${codeStr}" موجود مسبقاً في قاعدة البيانات.`);
        }
        existingSet.add(codeStr);
        generatedList.push({
          id: codeStr,
          code: codeStr,
          batchId,
          durationDays,
          durationLabel: data.durationLabel || `${durationDays} يوماً`,
          status: 'active',
          createdAt: nowIso,
          firstActivatedAt: null,
          expiresAt: null,
          deviceToken: null,
          deviceModel: null,
          deviceOs: null,
          appVersion: null,
          lastVerifiedAt: null,
          note: data.note || null,
          createdBy: data.adminEmail || BOOTSTRAP_ADMIN_EMAIL
        });
      }
    } else {
      let attempts = 0;
      while (generatedList.length < requestedCount && attempts < requestedCount * 10) {
        attempts++;
        const codeStr = generateCryptoCode(data.prefix || 'ACT');
        if (!existingSet.has(codeStr)) {
          existingSet.add(codeStr);
          generatedList.push({
            id: codeStr,
            code: codeStr,
            batchId,
            durationDays,
            durationLabel: data.durationLabel || `${durationDays} يوماً`,
            status: 'active',
            createdAt: nowIso,
            firstActivatedAt: null,
            expiresAt: null,
            deviceToken: null,
            deviceModel: null,
            deviceOs: null,
            appVersion: null,
            lastVerifiedAt: null,
            note: data.note || null,
            createdBy: data.adminEmail || BOOTSTRAP_ADMIN_EMAIL
          });
        }
      }
    }

    result = { batchId, codes: generatedList };
  }

  const createdCodes: ActivationCode[] = Array.isArray(result.codes) ? result.codes : [];

  try {
    if (createdCodes.length === 1) {
      const single = createdCodes[0];
      console.log('[Firestore] setDoc single code:', single.code);
      await setDoc(doc(db, 'codes', single.code), toFirestoreCodeDoc(single));
      console.log('[Firestore] setDoc single code succeeded:', single.code);
    } else if (createdCodes.length > 1) {
      const chunkSize = 400;
      for (let i = 0; i < createdCodes.length; i += chunkSize) {
        const chunk = createdCodes.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const item of chunk) {
          batch.set(doc(db, 'codes', item.code), toFirestoreCodeDoc(item));
        }
        console.log(`[Firestore] writeBatch commit (${chunk.length} codes)...`);
        await batch.commit();
        console.log(`[Firestore] writeBatch committed (${chunk.length} codes)`);
      }
    }

    if (createdCodes.length > 0) {
      await addFirestoreActivityLog({
        action: 'batch_generate',
        code: createdCodes[0].code,
        performedBy: data.adminEmail,
        details: `تم توليد دفعة جديدة تحتوي على ${createdCodes.length} كود بنجاح. المعرف: ${result.batchId}`
      });

      await ackFirestoreSync({
        syncedCodeIds: createdCodes.map((c) => c.code)
      });
    }
  } catch (error) {
    console.error('[Firestore] Failed saving generated codes:', error);
    handleFirestoreError(error, OperationType.WRITE, 'codes');
  }

  return result;
}

export async function unbindDevice(code: string, adminEmail: string, resetDuration: boolean = false) {
  const cleanCode = code.trim().toUpperCase();
  try {
    console.log('[Firestore] updateDoc unbind code:', cleanCode);
    const patch: Record<string, unknown> = {
      deviceToken: null,
      deviceModel: null,
      deviceOs: null,
      appVersion: null,
      status: 'active'
    };
    if (resetDuration) {
      patch.firstActivatedAt = null;
      patch.expiresAt = null;
    }
    await updateDoc(doc(db, 'codes', cleanCode), patch);
    console.log('[Firestore] updateDoc unbind succeeded:', cleanCode);

    await addFirestoreActivityLog({
      action: 'unbind',
      code: cleanCode,
      performedBy: adminEmail,
      details: `قام المدير بفك ارتباط الجهاز عن الكود ${cleanCode}.`
    });
  } catch (error) {
    console.error('[Firestore] Failed updateDoc unbind:', error);
    handleFirestoreError(error, OperationType.UPDATE, `codes/${cleanCode}`);
  }

  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(apiUrl('/api/v1/admin/unbind'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: cleanCode, adminEmail, resetDuration })
    });
    if (isJsonResponse(res)) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[API] unbind error:', err);
        throw new Error(err.error || err.message || 'فشل فك ارتباط الجهاز');
      }
      await ackFirestoreSync({ syncedCodeIds: [cleanCode] });
      return res.json();
    }
  } catch (err) {
    console.log('[API] Backend unbind sync skipped (Firestore updated):', err);
  }

  return { success: true, code: cleanCode };
}

export async function toggleCodeStatus(
  code: string,
  status: 'suspended' | 'active' | 'bound',
  adminEmail: string
) {
  const cleanCode = code.trim().toUpperCase();
  try {
    console.log('[Firestore] updateDoc toggle status:', cleanCode, status);
    await updateDoc(doc(db, 'codes', cleanCode), { status });
    console.log('[Firestore] updateDoc status succeeded:', cleanCode, status);

    await addFirestoreActivityLog({
      action: status === 'suspended' ? 'suspend' : 'resume',
      code: cleanCode,
      performedBy: adminEmail,
      details: status === 'suspended' ? 'تم إيقاف وتجميد الكود بواسطة الإدارة.' : 'تمت إعادة تفعيل وتشغيل الكود بواسطة الإدارة.'
    });
  } catch (error) {
    console.error('[Firestore] Failed updateDoc status:', error);
    handleFirestoreError(error, OperationType.UPDATE, `codes/${cleanCode}`);
  }

  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(apiUrl('/api/v1/admin/toggle-status'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: cleanCode, status, adminEmail })
    });
    if (isJsonResponse(res)) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[API] toggle-status error:', err);
        throw new Error(err.error || err.message || 'فشل تغيير حالة الكود');
      }
      await ackFirestoreSync({ syncedCodeIds: [cleanCode] });
      return res.json();
    }
  } catch (err) {
    console.log('[API] Backend toggle-status sync skipped (Firestore updated):', err);
  }

  return { success: true, code: cleanCode, status };
}

export async function deleteCode(code: string, adminEmail: string) {
  const cleanCode = code.trim().toUpperCase();
  try {
    console.log('[Firestore] deleteDoc code:', cleanCode);
    await deleteDoc(doc(db, 'codes', cleanCode));
    console.log('[Firestore] deleteDoc succeeded:', cleanCode);

    await addFirestoreActivityLog({
      action: 'delete',
      code: cleanCode,
      performedBy: adminEmail,
      details: `تم حذف الكود ${cleanCode} نهائياً من النظام.`
    });
  } catch (error) {
    console.error('[Firestore] Failed deleteDoc:', error);
    handleFirestoreError(error, OperationType.DELETE, `codes/${cleanCode}`);
  }

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(apiUrl(`/api/v1/admin/code/${encodeURIComponent(cleanCode)}?adminEmail=${encodeURIComponent(adminEmail)}`), {
      method: 'DELETE',
      headers
    });
    if (isJsonResponse(res)) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[API] delete code error:', err);
        throw new Error(err.error || err.message || 'فشل حذف الكود');
      }
      await ackFirestoreSync({ deletedCodeIds: [cleanCode] });
      return res.json();
    }
  } catch (err) {
    console.log('[API] Backend delete sync skipped (Firestore updated):', err);
  }

  return { success: true, code: cleanCode };
}

export async function fetchSettings(): Promise<SystemSettings> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(apiUrl('/api/v1/admin/settings'), { headers });
    if (isJsonResponse(res) && res.ok) {
      return res.json();
    }
  } catch {
    // Fallback below
  }

  const snap = await getDoc(doc(db, 'systemSettings', 'general'));
  if (snap.exists()) {
    return snap.data() as SystemSettings;
  }

  return {
    apiKey: generateRandomApiKey(),
    appName: 'Android App Client',
    allowNewActivations: true,
    updatedAt: new Date().toISOString()
  };
}

export async function updateSystemSettings(settings: Partial<SystemSettings>, adminEmail: string): Promise<SystemSettings> {
  let updated: SystemSettings = {
    apiKey: String(settings.apiKey || generateRandomApiKey()).slice(0, 128),
    appName: String(settings.appName || 'Android App Client').slice(0, 100),
    allowNewActivations: settings.allowNewActivations ?? true,
    updatedAt: new Date().toISOString()
  };

  try {
    const headers = await getAuthHeaders(true);
    const res = await fetch(apiUrl('/api/v1/admin/settings'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...settings, adminEmail })
    });
    if (isJsonResponse(res)) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[API] updateSystemSettings error:', err);
        throw new Error(err.error || 'فشل حفظ الإعدادات');
      }
      updated = await res.json();
    }
  } catch (err) {
    console.log('[API] Backend settings sync skipped, saving directly to Firestore:', err);
  }

  try {
    console.log('[Firestore] setDoc systemSettings/general...');
    await setDoc(doc(db, 'systemSettings', 'general'), {
      apiKey: String(updated.apiKey).slice(0, 128),
      appName: String(updated.appName || 'Android App Client').slice(0, 100),
      allowNewActivations: Boolean(updated.allowNewActivations),
      updatedAt: String(updated.updatedAt || new Date().toISOString()).slice(0, 50)
    });
    console.log('[Firestore] setDoc systemSettings/general succeeded');

    await addFirestoreActivityLog({
      action: 'resume',
      code: 'SETTINGS',
      performedBy: adminEmail,
      details: 'قام المدير بتحديث إعدادات النظام ومفاتيح الربط.'
    });

    await ackFirestoreSync({ settingsSynced: true });
  } catch (error) {
    console.error('[Firestore] Failed setDoc systemSettings/general:', error);
    handleFirestoreError(error, OperationType.WRITE, 'systemSettings/general');
  }

  return updated;
}

// Client testing APIs
export async function testActivateCode(payload: {
  code: string;
  deviceToken: string;
  deviceModel?: string;
  deviceOs?: string;
  appVersion?: string;
}): Promise<ActivationResponse> {
  console.log('[API] Testing /api/v1/activate for code:', payload.code);
  const res = await fetch(apiUrl('/api/v1/activate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!isJsonResponse(res)) {
    return {
      success: false,
      status: 'suspended',
      message: 'نقطة نهاية الخادم /api/v1/activate غير مفعلة على هذا الدومين الثابت. استخدم رابط خادم Node.js الخلفي لاختبار تفعيل الأجهزة.'
    };
  }
  return res.json();
}

export async function testVerifyCode(payload: {
  code: string;
  deviceToken: string;
}): Promise<VerificationResponse> {
  console.log('[API] Testing /api/v1/verify for code:', payload.code);
  const res = await fetch(apiUrl('/api/v1/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!isJsonResponse(res)) {
    return {
      valid: false,
      status: 'suspended',
      message: 'نقطة نهاية الخادم /api/v1/verify غير مفعلة على هذا الدومين الثابت. استخدم رابط خادم Node.js الخلفي لاختبار التحقق.'
    };
  }
  return res.json();
}
