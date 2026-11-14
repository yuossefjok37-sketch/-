/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Smartphone,
  Calendar,
  Clock,
  ShieldAlert,
  Unlink,
  PauseCircle,
  PlayCircle,
  Trash2,
  Terminal,
  Key
} from 'lucide-react';
import type { ActivationCode } from '../types/index.ts';

interface CodeDetailsModalProps {
  code: ActivationCode | null;
  onClose: () => void;
  onUnbind: (code: string) => void;
  onToggleStatus: (code: string, newStatus: 'suspended' | 'active' | 'bound') => void;
  onDelete: (code: string) => void;
}

export const CodeDetailsModal: React.FC<CodeDetailsModalProps> = ({
  code,
  onClose,
  onUnbind,
  onToggleStatus,
  onDelete
}) => {
  if (!code) return null;

  const [copied, setCopied] = useState<string | null>(null);

  const copyText = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const curlTestExample = `curl -X POST "${window.location.origin}/api/activate" \\
  -H "Content-Type: application/json" \\
  -d '{
    "code": "${code.code}",
    "deviceToken": "sec_inst_9876543210abcdef0123456789",
    "deviceModel": "Samsung Galaxy S24 Ultra",
    "deviceOs": "Android 14",
    "appVersion": "1.0.0"
  }'`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/20 text-cyan-400 rounded-xl border border-indigo-500/30">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">تفاصيل كود التفعيل</h3>
              <p className="text-xs text-slate-400">سجل التثبيت والبيانات التشفيرية</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 text-right">
          
          {/* Main Code Card */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="text-[11px] text-slate-400 mb-1">كود التفعيل (License Key)</div>
              <div className="font-mono text-xl sm:text-2xl font-black text-cyan-300 tracking-wider select-all">
                {code.code}
              </div>
            </div>
            <button
              onClick={() => copyText(code.code, 'code')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            >
              {copied === 'code' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied === 'code' ? 'تم النسخ!' : 'نسخ الكود'}</span>
            </button>
          </div>

          {/* Grid Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400">حالة الكود</div>
              <div className="text-xs font-bold text-white mt-1">
                {code.status === 'active' && <span className="text-emerald-400">متاح للتفعيل الأولي</span>}
                {code.status === 'bound' && <span className="text-cyan-400">مرتبط بجهاز ونشط</span>}
                {code.status === 'expired' && <span className="text-amber-400">منتهي الصلاحية</span>}
                {code.status === 'suspended' && <span className="text-rose-400">موقوف إدارياً</span>}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400">مدة الاشتراك</div>
              <div className="text-xs font-bold text-white mt-1">
                {code.durationLabel || `${code.durationDays} يوم`}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">تبدأ من أول تفعيل</div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400">تاريخ الإنشاء</div>
              <div className="text-xs font-bold text-white mt-1">
                {new Date(code.createdAt).toLocaleString('ar-EG')}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400">تاريخ أول تفعيل ناجح</div>
              <div className="text-xs font-bold text-white mt-1">
                {code.firstActivatedAt ? new Date(code.firstActivatedAt).toLocaleString('ar-EG') : 'لم يفعل بعد'}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400">تاريخ انتهاء الصلاحية</div>
              <div className="text-xs font-bold text-white mt-1">
                {code.expiresAt ? new Date(code.expiresAt).toLocaleString('ar-EG') : 'لم يتحدد بعد (غير مفعل)'}
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400">آخر تحقق أو نبضة (Heartbeat)</div>
              <div className="text-xs font-bold text-white mt-1">
                {code.lastVerifiedAt ? new Date(code.lastVerifiedAt).toLocaleString('ar-EG') : 'لا يوجد'}
              </div>
            </div>

          </div>

          {/* Bound Device Details */}
          <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800">
            <h4 className="text-xs font-bold text-slate-200 mb-2 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              <span>بيانات الجهاز المقترن (Hardware & Installation Binding)</span>
            </h4>

            {code.deviceToken ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 bg-slate-900 rounded-lg">
                  <span className="text-slate-400">طراز الجهاز ونظامه:</span>
                  <span className="font-semibold text-slate-200">
                    {code.deviceModel || 'Unknown Device'} ({code.deviceOs || 'Android'})
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 bg-slate-900 rounded-lg">
                  <span className="text-slate-400">إصدار التطبيق:</span>
                  <span className="font-semibold text-slate-200 font-mono">
                    {code.appVersion || '1.0.0'}
                  </span>
                </div>

                <div className="p-2 bg-slate-900 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400">مفتاح التثبيت التشفيري (Device Token):</span>
                    <button
                      onClick={() => copyText(code.deviceToken || '', 'token')}
                      className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
                    >
                      {copied === 'token' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>نسخ المفتاح</span>
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-cyan-300 break-all select-all bg-slate-950 p-2 rounded border border-slate-800">
                    {code.deviceToken}
                  </div>
                </div>

                <p className="text-[11px] text-amber-300/80 mt-1">
                  * هذا الكود مشفر ومقفل على هذا المعرف فقط. أي محاولة تفعيل من جهاز آخر سترفض فورياً من الخادم مع رمز 409 Conflict.
                </p>
              </div>
            ) : (
              <div className="p-4 text-center text-slate-500 text-xs">
                الكود غير مقترن بأي جهاز حتى الآن. سيتم ربطه تلقائياً بأول جهاز Android يقوم بعملية التفعيل.
              </div>
            )}
          </div>

          {/* Terminal / cURL Tester */}
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                <span>أمر تجربة تفعيل هذا الكود عبر cURL:</span>
              </span>
              <button
                onClick={() => copyText(curlTestExample, 'curl')}
                className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1"
              >
                {copied === 'curl' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>نسخ الأمر</span>
              </button>
            </div>
            <pre className="p-3 bg-slate-900 text-slate-300 rounded-lg text-[10px] sm:text-[11px] font-mono overflow-x-auto text-left dir-ltr">
              {curlTestExample}
            </pre>
          </div>

          {/* Admin Action Buttons */}
          <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {code.deviceToken && (
                <button
                  onClick={() => {
                    onUnbind(code.code);
                    onClose();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>فك ارتباط الجهاز</span>
                </button>
              )}

              {code.status === 'suspended' ? (
                <button
                  onClick={() => {
                    onToggleStatus(code.code, code.deviceToken ? 'bound' : 'active');
                    onClose();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>إلغاء التجميد وإعادة التفعيل</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    onToggleStatus(code.code, 'suspended');
                    onClose();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span>إيقاف وتجميد الكود</span>
                </button>
              )}
            </div>

            <button
              onClick={() => {
                onDelete(code.code);
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف الكود نهائياً</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
