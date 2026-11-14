/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Search,
  Download,
  Copy,
  Check,
  Smartphone,
  Unlink,
  PauseCircle,
  PlayCircle,
  Trash2,
  Calendar,
  Clock,
  Info,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import type { ActivationCode, CodeStatus } from '../types/index.ts';

interface CodesTableProps {
  codes: ActivationCode[];
  total: number;
  loading: boolean;
  selectedFilter: string;
  onFilterChange: (status: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  onUnbind: (code: string) => void;
  onToggleStatus: (code: string, newStatus: 'suspended' | 'active' | 'bound') => void;
  onDelete: (code: string) => void;
  onOpenDetails: (code: ActivationCode) => void;
}

export const CodesTable: React.FC<CodesTableProps> = ({
  codes,
  total,
  loading,
  selectedFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  onRefresh,
  onUnbind,
  onToggleStatus,
  onDelete,
  onOpenDetails
}) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (codeText: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(codeText);
    setCopiedCode(codeText);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const exportFilteredCsv = () => {
    if (codes.length === 0) return;
    const headers = [
      'Code',
      'DurationDays',
      'DurationLabel',
      'Status',
      'CreatedAt',
      'FirstActivatedAt',
      'ExpiresAt',
      'DeviceModel',
      'DeviceToken',
      'Note'
    ];
    const rows = codes.map((c) => [
      c.code,
      c.durationDays,
      c.durationLabel || '',
      c.status,
      c.createdAt,
      c.firstActivatedAt || '',
      c.expiresAt || '',
      c.deviceModel || '',
      c.deviceToken || '',
      c.note || ''
    ]);

    const csvContent =
      '\uFEFF' + // UTF-8 BOM for Excel Arabic compatibility
      [headers.join(','), ...rows.map((r) => r.map((f) => `"${f}"`).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codes-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: CodeStatus) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            متاح للتفعيل
          </span>
        );
      case 'bound':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
            مرتبط ونشط
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            منتهي الصلاحية
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            موقوف مؤقتاً
          </span>
        );
      default:
        return null;
    }
  };

  const calculateRemaining = (expiresAt?: string | null) => {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'منتهي';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `متبقٍ ${days} يوم`;
    return `متبقٍ ${hours} ساعة`;
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
      
      {/* Controls Bar: Search, Filters & Export */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="بحث بالكود، الجهاز، مفتاح التثبيت، الملاحظات..."
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pr-10 pl-4 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={exportFilteredCsv}
            disabled={codes.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5" />
            <span>تصدير CSV ({codes.length})</span>
          </button>

          <button
            onClick={onRefresh}
            title="تحديث البيانات"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-xs">
        <span className="text-slate-500 flex items-center gap-1 ml-2">
          <Filter className="w-3 h-3" />
          <span>تصفية:</span>
        </span>
        {[
          { id: 'all', label: 'الكل' },
          { id: 'active', label: 'جاهز للتفعيل' },
          { id: 'bound', label: 'مرتبط ونشط' },
          { id: 'expired', label: 'منتهي الصلاحية' },
          { id: 'suspended', label: 'موقوف إدارياً' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => onFilterChange(tab.id)}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              selectedFilter === tab.id
                ? 'bg-indigo-600/30 text-cyan-300 border border-indigo-500/50 font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && codes.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs">جارٍ تحميل بيانات الأكواد...</p>
        </div>
      ) : codes.length === 0 ? (
        <div className="p-12 text-center text-slate-500">
          <AlertCircle className="w-10 h-10 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-semibold text-slate-400">لا توجد أكواد مطابقة للمعايير</p>
          <p className="text-xs text-slate-600 mt-1">جرّب تغيير عبارة البحث أو الفلتر المختار</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">كود التفعيل</th>
                <th className="py-3 px-4">الحالة</th>
                <th className="py-3 px-4">مدة الاشتراك</th>
                <th className="py-3 px-4">الجهاز المرتبط</th>
                <th className="py-3 px-4">التواريخ والصلاحية</th>
                <th className="py-3 px-4 text-center">إجراءات المدير</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
              {codes.map((item) => {
                const remaining = calculateRemaining(item.expiresAt);
                return (
                  <tr
                    key={item.id}
                    onClick={() => onOpenDetails(item)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    {/* Code & Copy */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white text-sm tracking-wide group-hover:text-cyan-300 transition-colors select-all">
                          {item.code}
                        </span>
                        <button
                          onClick={(e) => handleCopy(item.code, e)}
                          title="نسخ الكود"
                          className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          {copiedCode === item.code ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      {item.note && (
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs">
                          {item.note}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {getStatusBadge(item.status)}
                    </td>

                    {/* Duration */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-200">
                        {item.durationLabel || `${item.durationDays} يوم`}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {item.firstActivatedAt ? 'تم بدء الاحتساب' : 'يبدأ عند أول تفعيل'}
                      </div>
                    </td>

                    {/* Device Binding */}
                    <td className="py-3.5 px-4 max-w-xs">
                      {item.deviceToken ? (
                        <div>
                          <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
                            <Smartphone className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span className="truncate">{item.deviceModel || 'جهاز Android'}</span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 truncate max-w-[180px]">
                            {item.deviceToken.substring(0, 16)}...
                          </div>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">
                          غير مرتبط بجهاز حتى الآن
                        </span>
                      )}
                    </td>

                    {/* Dates & Expiration */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-[11px]">
                      {item.expiresAt ? (
                        <div>
                          <div className="text-slate-200 font-medium">
                            ينتهي: {new Date(item.expiresAt).toLocaleDateString('ar-EG')}
                          </div>
                          <div className="text-[10px] font-semibold text-emerald-400">
                            {remaining}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-slate-400">
                            أنشئ: {new Date(item.createdAt).toLocaleDateString('ar-EG')}
                          </div>
                          <div className="text-[10px] text-slate-500">لم يفعل بعد</div>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        {/* Unbind Device Button */}
                        {item.deviceToken && (
                          <button
                            onClick={() => onUnbind(item.code)}
                            title="فك ارتباط الجهاز (إتاحة الكود لجهاز آخر)"
                            className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/20 transition-colors cursor-pointer"
                          >
                            <Unlink className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Suspend / Resume Button */}
                        {item.status === 'suspended' ? (
                          <button
                            onClick={() => onToggleStatus(item.code, item.deviceToken ? 'bound' : 'active')}
                            title="إعادة التفعيل"
                            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/20 transition-colors cursor-pointer"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => onToggleStatus(item.code, 'suspended')}
                            title="إيقاف مؤقت (تجميد)"
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg border border-rose-500/20 transition-colors cursor-pointer"
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Info Modal Button */}
                        <button
                          onClick={() => onOpenDetails(item)}
                          title="عرض التفاصيل الكاملة"
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => onDelete(item.code)}
                          title="حذف الكود نهائياً"
                          className="p-1.5 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Stats Summary */}
      <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 px-4">
        <span>عرض {codes.length} من أصل {total} كود إجمالي</span>
        <span className="text-[11px] text-slate-500">انقر على أي كود لعرض سجله التشفيري والتفصيلي</span>
      </div>
    </div>
  );
};
