/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  History,
  ShieldCheck,
  Smartphone,
  RefreshCw,
  Key,
  Unlink,
  AlertTriangle,
  PlayCircle,
  PauseCircle,
  Zap,
  Filter
} from 'lucide-react';
import type { ActivityLog } from '../types/index.ts';

interface ActivityLogsViewProps {
  logs: ActivityLog[];
  loading: boolean;
  onRefresh: () => void;
}

export const ActivityLogsView: React.FC<ActivityLogsViewProps> = ({
  logs,
  loading,
  onRefresh
}) => {
  const [filterAction, setFilterAction] = useState<string>('all');

  const filteredLogs = filterAction === 'all'
    ? logs
    : logs.filter((l) => l.action === filterAction);

  const getActionBadge = (action: ActivityLog['action']) => {
    switch (action) {
      case 'activate':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Smartphone className="w-3 h-3" />
            تفعيل جهاز
          </span>
        );
      case 'verify':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <ShieldCheck className="w-3 h-3" />
            تحقق دوري
          </span>
        );
      case 'unbind':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Unlink className="w-3 h-3" />
            فك ارتباط
          </span>
        );
      case 'suspend':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <PauseCircle className="w-3 h-3" />
            إيقاف وتجميد
          </span>
        );
      case 'resume':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <PlayCircle className="w-3 h-3" />
            إعادة تشغيل
          </span>
        );
      case 'batch_generate':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Zap className="w-3 h-3" />
            توليد دفعة
          </span>
        );
      case 'create_code':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Key className="w-3 h-3" />
            إنشاء كود
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300">
            {action}
          </span>
        );
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-400" />
            <span>سجل العمليات والتدقيق الأمني (Audit Logs)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            تتبع غير قابل للتعديل لجميع عمليات التفعيل، التحقق، وتدخلات المدير الإدارية
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          <span>تحديث السجل</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="px-4 py-2.5 bg-slate-950/70 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs">
        <span className="text-slate-500 flex items-center gap-1 shrink-0">
          <Filter className="w-3 h-3" />
          <span>نوع العملية:</span>
        </span>
        {[
          { id: 'all', label: 'الكل' },
          { id: 'activate', label: 'تفعيل الأجهزة' },
          { id: 'verify', label: 'التحقق' },
          { id: 'batch_generate', label: 'توليد الدفعات' },
          { id: 'unbind', label: 'فك الارتباط' },
          { id: 'suspend', label: 'الإيقاف' },
          { id: 'resume', label: 'إعادة التفعيل' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterAction(tab.id)}
            className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              filterAction === tab.id
                ? 'bg-indigo-600/30 text-cyan-300 border border-indigo-500/40 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Logs Table */}
      {filteredLogs.length === 0 ? (
        <div className="p-12 text-center text-slate-500 text-xs">
          لا توجد عمليات مسجلة تطابق التصفية الحالية.
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead className="bg-slate-950 sticky top-0 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase">
              <tr>
                <th className="py-3 px-4">نوع العملية</th>
                <th className="py-3 px-4">الكود المستهدف</th>
                <th className="py-3 px-4">التفاصيل والوصف</th>
                <th className="py-3 px-4">المنفذ</th>
                <th className="py-3 px-4 whitespace-nowrap">الوقت والتاريخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 whitespace-nowrap">
                    {getActionBadge(log.action)}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-cyan-300 select-all">
                    {log.code || '-'}
                  </td>
                  <td className="py-3 px-4 max-w-md text-slate-200">
                    <div>{log.details}</div>
                    {log.deviceToken && (
                      <div className="font-mono text-[10px] text-slate-500 truncate max-w-xs mt-0.5">
                        معرف الجهاز: {log.deviceToken}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="font-mono text-[11px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      {log.performedBy}
                    </span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                    {new Date(log.timestamp).toLocaleString('ar-EG')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="p-3 bg-slate-950 border-t border-slate-800 text-xs text-slate-500 text-left px-4">
        عرض {filteredLogs.length} سجل من أحدث العمليات
      </div>
    </div>
  );
};
