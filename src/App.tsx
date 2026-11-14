/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc
} from 'firebase/firestore';
import {
  auth,
  db,
  loginWithPassword,
  logoutUser,
  testFirestoreConnection,
  handleFirestoreError,
  formatFirebaseAuthError,
  OperationType
} from './firebase.ts';
import { performFullFirestoreSync, pushPendingToFirestore } from './lib/firestoreSync.ts';
import {
  verifyAdminSession,
  reconcileServerWithFirestore,
  fetchSettings,
  unbindDevice,
  toggleCodeStatus,
  deleteCode
} from './lib/api.ts';
import type { ActivationCode, CodeStats, ActivityLog, SystemSettings } from './types/index.ts';

import { Header } from './components/Header.tsx';
import { StatsCards } from './components/StatsCards.tsx';
import { CodesTable } from './components/CodesTable.tsx';
import { GenerateSection } from './components/GenerateSection.tsx';
import { CodeDetailsModal } from './components/CodeDetailsModal.tsx';
import { ActivityLogsView } from './components/ActivityLogsView.tsx';
import { ApiDocsAndTester } from './components/ApiDocsAndTester.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import {
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  KeyRound,
  ShieldCheck,
  LogIn,
  LogOut,
  Lock,
  AlertTriangle,
  Eye,
  EyeOff
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [adminAuthorized, setAdminAuthorized] = useState<boolean>(false);
  const [adminAuthError, setAdminAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('codes');

  // Real-time Firestore state
  const [allCodes, setAllCodes] = useState<ActivationCode[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    apiKey: '',
    appName: 'Android App Client',
    allowNewActivations: true
  });

  // UI & Filter states
  const [loading, setLoading] = useState<boolean>(true);
  const [serverOnline, setServerOnline] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [selectedCodeDetails, setSelectedCodeDetails] = useState<ActivationCode | null>(null);
  const [loginBusy, setLoginBusy] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // In-app Confirmation Modal (replaces window.confirm for iframe safety)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => Promise<void>;
  } | null>(null);

  // Notification Toast
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  // Auth Listener & Admin Verification
  useEffect(() => {
    testFirestoreConnection();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAdminAuthError(null);

      if (!user) {
        console.log('[Auth] No active user session');
        setAdminAuthorized(false);
        setAllCodes([]);
        setLogs([]);
        setAuthLoading(false);
        return;
      }

      try {
        console.log('[Auth] Verifying admin session for:', user.email);
        await verifyAdminSession();
        setAdminAuthorized(true);
        console.log('[Auth] Admin session verified');
      } catch (err: any) {
        console.error('[Auth] Admin verification denied:', err);
        setAdminAuthorized(false);
        setAdminAuthError(err?.message || 'غير مصرح لهذا الحساب بالدخول إلى لوحة الإدارة.');
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!passwordInput) {
      setAdminAuthError('يرجى إدخال كلمة مرور المدير.');
      return;
    }
    setLoginBusy(true);
    setAdminAuthError(null);
    try {
      await loginWithPassword(passwordInput);
      setPasswordInput('');
    } catch (err: any) {
      const code = err?.code || '';
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found' ||
        code === 'auth/too-many-requests'
      ) {
        console.warn('[Auth] Password sign-in notice:', code);
      } else {
        console.error('[Auth] Login failed:', err);
      }
      setAdminAuthError(formatFirebaseAuthError(err));
    } finally {
      setLoginBusy(false);
    }
  };

  const checkServerHealth = async () => {
    try {
      const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
      const res = await fetch(`${apiBase}/api/v1/health`);
      const ct = res.headers.get('content-type') || '';
      setServerOnline(res.ok && ct.toLowerCase().includes('application/json'));
    } catch {
      setServerOnline(false);
    }
  };

  // Real-time Firestore onSnapshot listeners + server reconciliation
  useEffect(() => {
    checkServerHealth();
    if (!currentUser || !adminAuthorized) return;

    setLoading(true);
    let latestCodes: ActivationCode[] = [];
    let latestLogs: ActivityLog[] = [];
    let latestSettings: SystemSettings | null = null;
    let initialSyncDone = false;

    performFullFirestoreSync()
      .then(() => {
        initialSyncDone = true;
        console.log('[App] Initial Firestore <-> Server sync completed');
      })
      .catch((err) => console.error('[App] Initial Firestore sync error:', err));

    // 1. Real-time codes listener
    const codesQuery = query(collection(db, 'codes'), orderBy('createdAt', 'desc'));
    const unsubCodes = onSnapshot(
      codesQuery,
      (snapshot) => {
        const nowTime = Date.now();
        const docs: ActivationCode[] = snapshot.docs.map((d) => {
          const data = d.data() as Omit<ActivationCode, 'id'>;
          const isExpired =
            data.status === 'bound' &&
            data.expiresAt &&
            new Date(data.expiresAt).getTime() <= nowTime;
          return {
            ...data,
            id: d.id,
            code: (data.code || d.id).toUpperCase(),
            status: isExpired ? 'expired' : data.status
          };
        });
        latestCodes = docs;
        setAllCodes(docs);
        setLoading(false);
        console.log(`[Firestore onSnapshot] Received ${docs.length} codes`);

        if (initialSyncDone && !snapshot.metadata.fromCache) {
          reconcileServerWithFirestore({
            codes: latestCodes,
            logs: latestLogs,
            settings: latestSettings
          }).catch((e) => console.warn('[App] Server reconcile notice (codes):', e));
        }
      },
      (error) => {
        setLoading(false);
        console.error('[Firestore onSnapshot] codes error:', error);
        handleFirestoreError(error, OperationType.LIST, 'codes');
      }
    );

    // 2. Real-time activityLogs listener
    const logsQuery = query(
      collection(db, 'activityLogs'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );
    const unsubLogs = onSnapshot(
      logsQuery,
      (snapshot) => {
        const logDocs: ActivityLog[] = snapshot.docs.map((d) => ({
          ...(d.data() as Omit<ActivityLog, 'id'>),
          id: d.id
        }));
        latestLogs = logDocs;
        setLogs(logDocs);
        console.log(`[Firestore onSnapshot] Received ${logDocs.length} activityLogs`);
      },
      (error) => {
        console.error('[Firestore onSnapshot] activityLogs error:', error);
        handleFirestoreError(error, OperationType.LIST, 'activityLogs');
      }
    );

    // 3. Real-time systemSettings listener
    const unsubSettings = onSnapshot(
      doc(db, 'systemSettings', 'general'),
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as SystemSettings;
          latestSettings = data;
          setSettings(data);
          console.log('[Firestore onSnapshot] systemSettings/general loaded');

          if (initialSyncDone && !snapshot.metadata.fromCache) {
            reconcileServerWithFirestore({
              codes: latestCodes,
              logs: latestLogs,
              settings: data
            }).catch((e) => console.warn('[App] Server reconcile notice (settings):', e));
          }
        } else if (!snapshot.metadata.fromCache) {
          console.log('[Firestore onSnapshot] systemSettings/general not found, seeding from server...');
          try {
            const serverSettings = await fetchSettings();
            const payload = {
              apiKey: String(serverSettings.apiKey).slice(0, 128),
              appName: String(serverSettings.appName || 'Android App Client').slice(0, 100),
              allowNewActivations: Boolean(serverSettings.allowNewActivations),
              updatedAt: new Date().toISOString()
            };
            await setDoc(doc(db, 'systemSettings', 'general'), payload);
            console.log('[Firestore] Seeded systemSettings/general successfully');
          } catch (err) {
            console.error('[Firestore] Failed initializing systemSettings/general:', err);
          }
        }
      },
      (error) => {
        console.error('[Firestore onSnapshot] systemSettings/general error:', error);
        handleFirestoreError(error, OperationType.GET, 'systemSettings/general');
      }
    );

    // Periodic heartbeat to mirror background Android activations (/api/activate) into Firestore
    const interval = setInterval(() => {
      checkServerHealth();
      pushPendingToFirestore().catch((err) =>
        console.error('[App] Background Firestore sync error:', err)
      );
    }, 15000);

    return () => {
      unsubCodes();
      unsubLogs();
      unsubSettings();
      clearInterval(interval);
    };
  }, [currentUser, adminAuthorized]);

  // Live statistics computed directly from Firestore real-time codes
  const stats = useMemo<CodeStats>(() => {
    const now = Date.now();
    let active = 0;
    let bound = 0;
    let expired = 0;
    let suspended = 0;

    for (const c of allCodes) {
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
      total: allCodes.length,
      active,
      bound,
      expired,
      suspended
    };
  }, [allCodes]);

  // Live filtered & searched codes
  const filteredCodes = useMemo<ActivationCode[]>(() => {
    let list = allCodes;
    if (selectedFilter && selectedFilter !== 'all') {
      list = list.filter((c) => c.status === selectedFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          (c.deviceToken && c.deviceToken.toLowerCase().includes(q)) ||
          (c.deviceModel && c.deviceModel.toLowerCase().includes(q)) ||
          (c.note && c.note.toLowerCase().includes(q)) ||
          (c.batchId && c.batchId.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allCodes, selectedFilter, searchQuery]);

  // Manual refresh triggers pending server -> Firestore sync
  const handleManualRefresh = async () => {
    try {
      console.log('[App] Manual Firestore sync triggered');
      await pushPendingToFirestore();
      showToast('تمت مزامنة البيانات مع Firestore بنجاح', 'info');
    } catch (err: any) {
      console.error('[App] Manual refresh error:', err);
      showToast(err?.message || 'تعذرت المزامنة', 'error');
    }
  };

  // Actions
  const handleUnbind = (code: string) => {
    const adminEmail = currentUser?.email || 'yuossefjok37@gmail.com';
    setConfirmDialog({
      title: 'تأكيد فك ارتباط الجهاز',
      message: `هل أنت متأكد من فك ارتباط الجهاز عن الكود "${code}"؟ سيتاح الكود بعدها للتفعيل على جهاز آخر.`,
      confirmLabel: 'فك الارتباط',
      onConfirm: async () => {
        try {
          await unbindDevice(code, adminEmail);
          showToast(`تم فك ارتباط الجهاز عن الكود ${code} وحفظ التغيير في Firestore`, 'success');
        } catch (err: any) {
          console.error('[App] handleUnbind error:', err);
          showToast(err.message || 'فشل فك ارتباط الجهاز', 'error');
        }
      }
    });
  };

  const handleToggleStatus = async (code: string, newStatus: 'suspended' | 'active' | 'bound') => {
    const adminEmail = currentUser?.email || 'yuossefjok37@gmail.com';
    try {
      await toggleCodeStatus(code, newStatus, adminEmail);
      const msg = newStatus === 'suspended' ? `تم تجميد الكود ${code}` : `تمت إعادة تفعيل الكود ${code}`;
      showToast(msg, 'success');
    } catch (err: any) {
      console.error('[App] handleToggleStatus error:', err);
      showToast(err.message || 'فشل تغيير حالة الكود', 'error');
    }
  };

  const handleDelete = (code: string) => {
    const adminEmail = currentUser?.email || 'yuossefjok37@gmail.com';
    setConfirmDialog({
      title: 'حذف الكود نهائياً',
      message: `تحذير: هل أنت متأكد من حذف الكود "${code}" نهائياً من قاعدة بيانات Firestore؟ هذا الإجراء لا يمكن التراجع عنه.`,
      confirmLabel: 'حذف نهائي',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteCode(code, adminEmail);
          showToast(`تم حذف الكود ${code} نهائياً`, 'info');
        } catch (err: any) {
          console.error('[App] handleDelete error:', err);
          showToast(err.message || 'فشل حذف الكود', 'error');
        }
      }
    });
  };

  // Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-['Cairo',sans-serif]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm text-slate-400">جارٍ التحقق من جلسة المدير السحابية...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated or Unauthorized Gate
  if (!currentUser || !adminAuthorized) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 font-['Cairo',sans-serif]">
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <KeyRound className="w-8 h-8 text-cyan-400" />
            </div>
          </div>

          <div>
            <h1 className="text-xl font-bold text-white">Activation Codes Manager</h1>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              لوحة تحكم آمنة لإدارة أكواد التفعيل وتراخيص التطبيقات. أدخل كلمة مرور المدير للمتابعة.
            </p>
          </div>

          {adminAuthError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start gap-2 text-right">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <p>{adminAuthError}</p>
            </div>
          )}

          {!currentUser ? (
            <form onSubmit={handleLogin} className="space-y-4 text-right">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  كلمة مرور المدير
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    dir="ltr"
                    autoComplete="current-password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••••••••••"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginBusy || !passwordInput}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>{loginBusy ? 'جارٍ التحقق من كلمة المرور...' : 'دخول إلى لوحة التحكم'}</span>
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300">
                هذه الجلسة غير مصرح لها بالوصول إلى لوحة الإدارة.
              </div>
              <button
                onClick={logoutUser}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          )}

          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-center gap-4 text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              حماية Zero-Trust
            </span>
            <span className="flex items-center gap-1">
              <Lock className="w-3.5 h-3.5 text-indigo-400" />
              اتصال HTTPS مشفر
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Cairo',sans-serif]">
      
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogin={handleLogin}
        onLogout={logoutUser}
        serverOnline={serverOnline}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Tab 1: Codes & Stats Dashboard */}
        {activeTab === 'codes' && (
          <div className="space-y-6">
            <StatsCards
              stats={stats}
              selectedFilter={selectedFilter}
              onSelectFilter={(f) => setSelectedFilter(f)}
            />

            <CodesTable
              codes={filteredCodes}
              total={allCodes.length}
              loading={loading}
              selectedFilter={selectedFilter}
              onFilterChange={(f) => setSelectedFilter(f)}
              searchQuery={searchQuery}
              onSearchChange={(q) => setSearchQuery(q)}
              onRefresh={handleManualRefresh}
              onUnbind={handleUnbind}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
              onOpenDetails={(code) => setSelectedCodeDetails(code)}
            />
          </div>
        )}

        {/* Tab 2: Generate Codes */}
        {activeTab === 'generate' && (
          <GenerateSection
            adminEmail={currentUser?.email || 'yuossefjok37@gmail.com'}
            onCodesGenerated={() => {
              showToast('تم توليد دفعة الأكواد وحفظها في Cloud Firestore بنجاح!', 'success');
            }}
          />
        )}

        {/* Tab 3: Activity Logs */}
        {activeTab === 'logs' && (
          <ActivityLogsView
            logs={logs}
            loading={loading}
            onRefresh={handleManualRefresh}
          />
        )}

        {/* Tab 4: API Docs & Android Integration */}
        {activeTab === 'api-docs' && (
          <ApiDocsAndTester apiKey={settings.apiKey} />
        )}

        {/* Tab 5: Settings & Production Deployment */}
        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            adminEmail={currentUser?.email || 'yuossefjok37@gmail.com'}
            onSettingsUpdated={(newSet) => {
              setSettings(newSet);
              showToast('تم حفظ الإعدادات في Firestore بنجاح', 'success');
            }}
          />
        )}

      </main>

      {/* Code Details Modal */}
      {selectedCodeDetails && (
        <CodeDetailsModal
          code={selectedCodeDetails}
          onClose={() => setSelectedCodeDetails(null)}
          onUnbind={handleUnbind}
          onToggleStatus={handleToggleStatus}
          onDelete={handleDelete}
        />
      )}

      {/* Confirmation Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">{confirmDialog.title}</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={async () => {
                  const fn = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  await fn();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white cursor-pointer ${
                  confirmDialog.danger
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Notification Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold border ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40 shadow-emerald-950/50'
              : toast.type === 'error'
              ? 'bg-rose-950/90 text-rose-300 border-rose-500/40 shadow-rose-950/50'
              : 'bg-indigo-950/90 text-indigo-300 border-indigo-500/40 shadow-indigo-950/50'
          }`}>
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-cyan-400 shrink-0" />}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="mr-2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Offline PWA Connectivity Indicator */}
      <OfflineIndicator />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div>
            نظام <span className="text-slate-300 font-semibold">Activation Codes Manager</span> — إدارة تراخيص وأكواد تفعيل التطبيقات
          </div>
          <div className="flex items-center gap-3">
            <span>PWA متصل</span>
            <span>•</span>
            <span>القاعدة: Cloud Firestore</span>
            <span>•</span>
            <span>المصادقة: Firebase Auth</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
