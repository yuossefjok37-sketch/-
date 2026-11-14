/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Zap,
  Sparkles,
  ListPlus,
  Clock,
  Tag,
  Copy,
  Check,
  Download,
  AlertCircle,
  Hash,
  FileSpreadsheet
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generateCodesBatch } from '../lib/api.ts';
import type { ActivationCode } from '../types/index.ts';

interface GenerateSectionProps {
  onCodesGenerated: () => void;
  adminEmail: string;
}

export const GenerateSection: React.FC<GenerateSectionProps> = ({
  onCodesGenerated,
  adminEmail
}) => {
  const [mode, setMode] = useState<'random' | 'manual'>('random');
  const [count, setCount] = useState<number>(10);
  const [prefix, setPrefix] = useState<string>('ACT');
  const [durationPreset, setDurationPreset] = useState<string>('30');
  const [customDays, setCustomDays] = useState<number>(90);
  const [manualText, setManualText] = useState<string>('');
  const [note, setNote] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<{
    batchId: string;
    codes: ActivationCode[];
  } | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  // Compute final durationDays & durationLabel
  const durationDays = durationPreset === 'custom' ? customDays : Number(durationPreset);
  const durationLabel =
    durationDays === 1
      ? 'يوم واحد (24 ساعة)'
      : durationDays === 3
      ? '3 أيام'
      : durationDays === 7
      ? 'أسبوع (7 أيام)'
      : durationDays === 30
      ? 'شهر (30 يوماً)'
      : `${durationDays} يوماً (مخصص)`;

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      let manualCodesList: string[] = [];
      if (mode === 'manual') {
        manualCodesList = manualText
          .split(/[\n,]+/)
          .map((s) => s.trim().toUpperCase())
          .filter((s) => s.length >= 4);

        if (manualCodesList.length === 0) {
          throw new Error('يرجى إدخال كود واحد على الأقل (كل كود في سطر جديد أو مفصول بفاصلة).');
        }
      }

      const res = await generateCodesBatch({
        count: mode === 'random' ? count : manualCodesList.length,
        mode,
        manualCodes: manualCodesList,
        prefix,
        durationDays,
        durationLabel,
        note,
        adminEmail
      });

      setGeneratedResult({
        batchId: res.batchId,
        codes: res.codes
      });

      // Celebration effect
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {}

      onCodesGenerated();
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء توليد الأكواد');
    } finally {
      setLoading(false);
    }
  };

  const copyAllGenerated = () => {
    if (!generatedResult) return;
    const text = generatedResult.codes.map((c) => c.code).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const downloadAsTxt = () => {
    if (!generatedResult) return;
    const content =
      `# Activation Codes Manager - Batch: ${generatedResult.batchId}\n` +
      `# Duration: ${durationLabel}\n` +
      `# Created: ${new Date().toLocaleString('ar-EG')}\n\n` +
      generatedResult.codes.map((c) => c.code).join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `codes-${generatedResult.batchId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAsCsv = () => {
    if (!generatedResult) return;
    const headers = ['Code', 'DurationDays', 'DurationLabel', 'Status', 'CreatedAt', 'Note'];
    const rows = generatedResult.codes.map((c) => [
      c.code,
      c.durationDays,
      c.durationLabel || '',
      c.status,
      c.createdAt,
      c.note || ''
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((f) => `"${f}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activation-codes-${generatedResult.batchId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-slate-900 border border-indigo-700/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm mb-1">
            <Sparkles className="w-4 h-4" />
            <span>نظام التوليد السريع للأكواد</span>
          </div>
          <h2 className="text-xl font-bold text-white">
            إنشاء أكواد فردية أو دفعات ضخمة حتى 1000 كود
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
            يتم توليد أكواد مشفرة فريدة لا تتكرر، وتبدأ فترة الاشتراك من أول تفعيل ناجح من قبل المستخدم على جهاز Android.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-2 rounded-xl border border-indigo-500/30 text-xs text-cyan-300">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span>مدة الاشتراك تبدأ عند أول تفعيل</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Form: 7 cols */}
        <div className="lg:col-span-7 bg-slate-900/70 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
          <form onSubmit={handleGenerate} className="space-y-5">
            
            {/* Mode selection tabs */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                طريقة التوليد
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setMode('random')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    mode === 'random'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>توليد عشوائي ذكي (أكواد فريدة)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    mode === 'manual'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ListPlus className="w-4 h-4" />
                  <span>إدخال يدوي مخصص</span>
                </button>
              </div>
            </div>

            {/* Random mode options */}
            {mode === 'random' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Count */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      عدد الأكواد المطلوبة (1 - 1000)
                    </label>
                    <span className="text-xs font-mono text-cyan-400 font-bold">
                      {count} كود
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={count}
                    onChange={(e) => setCount(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                  />
                  {/* Quick count chips */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[1, 5, 10, 50, 100, 250, 500, 1000].map((num) => (
                      <button
                        type="button"
                        key={num}
                        onClick={() => setCount(num)}
                        className={`px-2 py-1 rounded-md text-[11px] font-mono transition-colors cursor-pointer ${
                          count === num
                            ? 'bg-indigo-500/30 text-indigo-300 border border-indigo-500/50'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prefix */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    بادئة الكود (Prefix)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={10}
                      value={prefix}
                      onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                      placeholder="ACT"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono text-sm uppercase focus:outline-none focus:border-indigo-500"
                    />
                    <div className="absolute left-3 top-3 text-[10px] text-slate-500 font-mono">
                      مثال: {prefix || 'ACT'}-XXXX-XXXX
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    توليد مشفر بدون أحرف ملتبسة مثل O, 0, 1, I
                  </p>
                </div>
              </div>
            ) : (
              /* Manual Input Textarea */
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  قائمة الأكواد اليدوية (كل كود في سطر مستقل أو مفصول بفاصلة)
                </label>
                <textarea
                  rows={5}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="VIP-2026-CUSTOMER-01&#10;VIP-2026-CUSTOMER-02&#10;SPECIAL-PASS-9988"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                ></textarea>
                <p className="text-[11px] text-slate-400 mt-1">
                  سيتم التحقق من عدم تكرار أي كود مع الأكواد الموجودة بالنظام.
                </p>
              </div>
            )}

            {/* Duration Section */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                مدة الاشتراك (تحتسب من لحظة أول تفعيل فقط)
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: '1', label: 'يوم واحد', sub: '24 ساعة' },
                  { id: '3', label: '3 أيام', sub: '72 ساعة' },
                  { id: '7', label: 'أسبوع', sub: '7 أيام' },
                  { id: '30', label: 'شهر', sub: '30 يوماً' },
                  { id: 'custom', label: 'مخصص', sub: 'أيام محددة' }
                ].map((item) => {
                  const isSelected = durationPreset === item.id;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => setDurationPreset(item.id)}
                      className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className="text-[10px] text-slate-400">{item.sub}</div>
                    </button>
                  );
                })}
              </div>

              {durationPreset === 'custom' && (
                <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-cyan-500/30 flex items-center gap-3">
                  <label className="text-xs font-medium text-slate-300 whitespace-nowrap">
                    أدخل عدد الأيام المخصص:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={customDays}
                    onChange={(e) => setCustomDays(Math.max(1, Number(e.target.value) || 1))}
                    className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                  />
                  <span className="text-xs text-cyan-400 font-semibold">
                    = {customDays} يوم ({Math.round(customDays / 30)} شهر تقريباً)
                  </span>
                </div>
              )}
            </div>

            {/* Note / Tag */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                ملاحظة أو اسم العميل / الحملة (اختياري)
              </label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={200}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="مثال: اشتراكات رمضان - الدفعة الأولى"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500 placeholder:text-slate-600"
                />
                <Tag className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3.5" />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>جارٍ إنشاء الأكواد وحفظها بالسيرفر...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 text-cyan-200" />
                  <span>
                    {mode === 'random' ? `توليد ${count} كود الآن` : 'إضافة الأكواد المخصصة'}
                  </span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right Output: 5 cols */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex-1 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-cyan-400" />
                  <span>نتائج التوليد الفوري</span>
                </h3>
                <span className="text-[11px] text-slate-400">
                  {generatedResult ? `تم إنشاء ${generatedResult.codes.length} كود بنجاح` : 'ستظهر الأكواد المولدة هنا'}
                </span>
              </div>

              {generatedResult && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={copyAllGenerated}
                    title="نسخ جميع الأكواد"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700"
                  >
                    {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={downloadAsTxt}
                    title="تحميل كملف TXT"
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={downloadAsCsv}
                    title="تصدير كملف CSV"
                    className="p-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 transition-colors cursor-pointer border border-emerald-500/30"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* List or Empty State */}
            {generatedResult ? (
              <div className="flex-1 flex flex-col justify-between">
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {generatedResult.codes.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between group hover:border-indigo-500/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-mono w-5">
                          {idx + 1}.
                        </span>
                        <span className="font-mono text-xs sm:text-sm font-bold text-cyan-300 tracking-wide select-all">
                          {item.code}
                        </span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        جاهز
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>معرف الدفعة: <code className="text-slate-300 font-mono text-[10px]">{generatedResult.batchId}</code></span>
                  <span className="text-emerald-400 font-medium">محفوظة سحابياً بنجاح</span>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mb-3">
                  <Zap className="w-6 h-6 text-slate-600" />
                </div>
                <p className="text-xs font-semibold text-slate-400">
                  لا توجد أكواد مولدة حديثاً في هذه الجلسة
                </p>
                <p className="text-[11px] text-slate-600 mt-1 max-w-xs">
                  اختر عدد الأكواد وطريقة التوليد ثم انقر زر التوليد لبدء العملية
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
