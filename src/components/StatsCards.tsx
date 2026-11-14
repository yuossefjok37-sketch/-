/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Layers, CheckCircle2, Smartphone, Clock, AlertTriangle } from 'lucide-react';
import type { CodeStats } from '../types/index.ts';

interface StatsCardsProps {
  stats: CodeStats;
  selectedFilter: string;
  onSelectFilter: (filter: string) => void;
}

export const StatsCards: React.FC<StatsCardsProps> = ({
  stats,
  selectedFilter,
  onSelectFilter
}) => {
  const cards = [
    {
      id: 'all',
      title: 'إجمالي الأكواد',
      count: stats.total,
      icon: Layers,
      color: 'from-blue-500/20 to-indigo-500/10 text-blue-400 border-blue-500/30',
      activeRing: 'ring-2 ring-blue-500',
      description: 'جميع الأكواد المسجلة بالنظام'
    },
    {
      id: 'active',
      title: 'جاهزة للتفعيل',
      count: stats.active,
      icon: CheckCircle2,
      color: 'from-emerald-500/20 to-teal-500/10 text-emerald-400 border-emerald-500/30',
      activeRing: 'ring-2 ring-emerald-500',
      description: 'أكواد غير مستخدمة بعد'
    },
    {
      id: 'bound',
      title: 'مرتبطة ونشطة',
      count: stats.bound,
      icon: Smartphone,
      color: 'from-cyan-500/20 to-blue-500/10 text-cyan-400 border-cyan-500/30',
      activeRing: 'ring-2 ring-cyan-500',
      description: 'مربوطة بجهاز ومفعلة حالياً'
    },
    {
      id: 'expired',
      title: 'منتهية الصلاحية',
      count: stats.expired,
      icon: Clock,
      color: 'from-amber-500/20 to-orange-500/10 text-amber-400 border-amber-500/30',
      activeRing: 'ring-2 ring-amber-500',
      description: 'انتهت مدة اشتراكها'
    },
    {
      id: 'suspended',
      title: 'موقوفة إدارياً',
      count: stats.suspended,
      icon: AlertTriangle,
      color: 'from-rose-500/20 to-red-500/10 text-rose-400 border-rose-500/30',
      activeRing: 'ring-2 ring-rose-500',
      description: 'تم تجميدها بواسطة الإدارة'
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = selectedFilter === card.id;

        return (
          <button
            key={card.id}
            onClick={() => onSelectFilter(card.id)}
            className={`p-4 rounded-xl border bg-gradient-to-br transition-all text-right relative overflow-hidden group cursor-pointer ${
              card.color
            } ${isSelected ? `${card.activeRing} scale-[1.02] shadow-lg shadow-indigo-950/50` : 'hover:scale-[1.01] hover:border-slate-600'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-300">
                {card.title}
              </span>
              <div className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-700/50">
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {card.count.toLocaleString('ar-EG')}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                كود
              </span>
            </div>

            <p className="text-[11px] text-slate-400 mt-1.5 truncate">
              {card.description}
            </p>

            {isSelected && (
              <div className="absolute top-1 left-2">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
