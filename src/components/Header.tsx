/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  KeyRound,
  ShieldCheck,
  Server,
  Zap,
  FileCode2,
  History,
  Sliders,
  LogOut,
  LogIn,
  Layers,
  ExternalLink
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentUser: User | null;
  onLogin: () => void;
  onLogout: () => void;
  serverOnline: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogin,
  onLogout,
  serverOnline
}) => {
  const tabs = [
    { id: 'codes', label: 'الأكواد والإحصائيات', icon: Layers },
    { id: 'generate', label: 'توليد الأكواد (حتى 1000)', icon: Zap },
    { id: 'logs', label: 'سجل العمليات', icon: History },
    { id: 'api-docs', label: 'توثيق API وتطبيق Android', icon: FileCode2 },
    { id: 'settings', label: 'الإعدادات والأمان', icon: Sliders },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo & System Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-400 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <KeyRound className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Activation Codes Manager
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3" />
                  مستقل وآمن
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                لوحة تحكم إدارة وتفعيل تراخيص التطبيقات مع الخادم السحابي
              </p>
            </div>
          </div>

          {/* Right Info: PWA Install, Server Status & Auth */}
          <div className="flex items-center gap-2 sm:gap-3">
            <PWAInstallButton />

            {/* Live Server Indicator */}
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-300 hidden md:inline">الخادم السحابي:</span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${serverOnline ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${serverOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                </span>
                {serverOnline ? 'متصل HTTPS' : 'غير متصل'}
              </span>
            </div>

            {/* Admin User / Firebase Auth */}
            {currentUser ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col text-left">
                  <span className="text-xs font-semibold text-slate-200 truncate max-w-[140px]">
                    {currentUser.displayName || currentUser.email?.split('@')[0]}
                  </span>
                  <span className="text-[10px] text-indigo-400">مدير النظام</span>
                </div>
                <button
                  onClick={onLogout}
                  title="تسجيل الخروج"
                  className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/20"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onLogin}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>دخول المدير</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto no-scrollbar gap-1 border-t border-slate-800/60 pt-2 pb-1 text-sm font-medium">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? 'bg-indigo-600/20 text-cyan-300 border border-cyan-500/30 font-semibold shadow-sm shadow-cyan-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
