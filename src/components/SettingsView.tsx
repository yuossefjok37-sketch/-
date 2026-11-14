/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Sliders,
  Key,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  Globe,
  Server,
  Cloud,
  Terminal,
  Save,
  CheckCircle2,
  AlertTriangle,
  Lock
} from 'lucide-react';
import type { SystemSettings } from '../types/index.ts';
import { updateSystemSettings } from '../lib/api.ts';

interface SettingsViewProps {
  settings: SystemSettings;
  adminEmail: string;
  onSettingsUpdated: (newSettings: SystemSettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  adminEmail,
  onSettingsUpdated
}) => {
  const [apiKey, setApiKey] = useState<string>(settings.apiKey);
  const [appName, setAppName] = useState<string>(settings.appName);
  const [allowNewActivations, setAllowNewActivations] = useState<boolean>(settings.allowNewActivations);

  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  useEffect(() => {
    setApiKey(settings.apiKey);
    setAppName(settings.appName);
    setAllowNewActivations(settings.allowNewActivations);
  }, [settings]);

  const generateNewKey = () => {
    const chars = 'abcdef0123456789';
    let key = 'sec_act_';
    for (let i = 0; i < 32; i++) {
      key += chars[Math.floor(Math.random() * chars.length)];
    }
    setApiKey(key);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      console.log('[SettingsView] Saving settings to Firestore...', { appName, allowNewActivations });
      const updated = await updateSystemSettings(
        { apiKey, appName, allowNewActivations },
        adminEmail
      );
      console.log('[SettingsView] Settings saved successfully');
      onSettingsUpdated(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('[SettingsView] Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';

  return (
    <div className="space-y-8 text-right">
      
      {/* Security & System Settings Form */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800 mb-6">
          <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">إعدادات الأمان ومفاتيح الربط</h3>
            <p className="text-xs text-slate-400">
              التحكم في مفتاح الـ API العام وصلاحيات تفعيل التراخيص الجديدة
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          
          {/* Target App Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              اسم تطبيق Android المستهدف:
            </label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="مثال: تطبيق المشاهد برو"
              className="w-full max-w-md bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Master API Secret Key */}
          <div>
            <div className="flex items-center justify-between max-w-xl mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-400" />
                <span>مفتاح API السري للتحقق (x-api-key):</span>
              </label>
              <button
                type="button"
                onClick={generateNewKey}
                className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>توليد مفتاح أمان جديد</span>
              </button>
            </div>

            <div className="flex items-center gap-2 max-w-xl">
              <input
                type="text"
                readOnly
                value={apiKey}
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-cyan-300 font-mono text-xs select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={copyKey}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition-colors cursor-pointer"
                title="نسخ المفتاح"
              >
                {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              يتم إرسال هذا المفتاح داخل الترويسة <code className="text-slate-300 font-mono">x-api-key</code> في كل طلب صادر من تطبيق Android لمنع الطلبات غير المصرح بها.
            </p>
          </div>

          {/* Master Switch */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 max-w-xl flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white mb-0.5">
                قبول تفعيلات التراخيص الجديدة
              </div>
              <div className="text-[11px] text-slate-400">
                في حال إيقاف هذا الخيار، سيتم تجميد قبول أي أكواد جديدة مؤقتاً مع استمرار المشتركين الحاليين.
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={allowNewActivations}
                onChange={(e) => setAllowNewActivations(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>حفظ الإعدادات</span>
            </button>

            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>تم حفظ وتطبيق التغييرات بنجاح</span>
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Production Deployment Instructions (Detailed, step-by-step) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800 mb-5">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">دليل وتعليمات النشر الدائم على استضافة HTTPS حقيقية</h3>
            <p className="text-xs text-slate-400">
              خطوات جاهزة لنشر المشروع على خوادم سحابية دائمة (بدون ngrok أو نفق اتصال)
            </p>
          </div>
        </div>

        <div className="space-y-5 text-xs text-slate-300 leading-relaxed">
          
          {/* Step 1 */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
            <h4 className="font-bold text-sm text-cyan-300 mb-1 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-center leading-5 text-xs font-mono font-bold">1</span>
              <span>الرابط الدائم الحالي للمشروع (Live Production URL)</span>
            </h4>
            <p className="text-slate-400 mb-2">
              مشروعك مجهز للعمل عبر هذا النطاق السحابي المشفر برابط HTTPS موثق بشهادة SSL تلقائية:
            </p>
            <div className="p-2.5 bg-slate-900 rounded-lg font-mono text-cyan-400 text-xs text-left dir-ltr select-all border border-slate-800">
              {currentOrigin}
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
            <h4 className="font-bold text-sm text-cyan-300 mb-1 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-center leading-5 text-xs font-mono font-bold">2</span>
              <span>النشر على أي خادم سحابي مستقل (Cloud Run / VPS / Railway / Render)</span>
            </h4>
            <p className="text-slate-400 mb-2">
              المشروع مبني كـ Full-Stack Node.js + Express + React. لبنائه وتشغيله في الإنتاج:
            </p>
            <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg font-mono text-[11px] text-left dir-ltr overflow-x-auto border border-slate-800">
{`# 1. تثبيت الحزم
npm install

# 2. بناء واجهة React للإنتاج
npm run build

# 3. تشغيل الخادم السحابي الدائم
npm start
# (يستمع الخادم افتراضياً على المنفذ PORT أو 3000 مع تقديم الـ API وواجهة الويب)`}
            </pre>
          </div>

          {/* Step 3 */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
            <h4 className="font-bold text-sm text-cyan-300 mb-1 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-center leading-5 text-xs font-mono font-bold">3</span>
              <span>قواعد أمان Cloud Firestore المطبقة</span>
            </h4>
            <p className="text-slate-400 mb-2">
              تم نشر وتثبيت ملف <code className="text-slate-200 font-mono">firestore.rules</code> الصارم لمنع أي مستخدم خارجي من قراءة الأكواد مباشرة عبر المتصفح. جميع استعلامات التحقق تتم بالكامل داخل الخادم <code className="text-slate-200 font-mono">server.ts</code>.
            </p>
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>قواعد Zero-Trust ABAC منشورة وسارية بنجاح في مشروع Firebase السحابي.</span>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};
