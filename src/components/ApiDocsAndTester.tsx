/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileCode2,
  Server,
  Terminal,
  Smartphone,
  Copy,
  Check,
  Play,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
  Code,
  Globe,
  Radio
} from 'lucide-react';
import { testActivateCode, testVerifyCode } from '../lib/api.ts';

interface ApiDocsAndTesterProps {
  apiKey: string;
}

export const ApiDocsAndTester: React.FC<ApiDocsAndTesterProps> = ({ apiKey }) => {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  // Live Tester State
  const [testCode, setTestCode] = useState<string>('ACT-DEMO-VIP1-2026');
  const [testDeviceToken, setTestDeviceToken] = useState<string>(
    'sec_inst_' + Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 10)
  );
  const [testDeviceModel, setTestDeviceModel] = useState<string>('Samsung Galaxy S24 Ultra');
  const [testDeviceOs, setTestDeviceOs] = useState<string>('Android 14 (API 34)');
  const [testAppVersion, setTestAppVersion] = useState<string>('2.5.0');

  const [loadingTest, setLoadingTest] = useState<boolean>(false);
  const [testResponse, setTestResponse] = useState<any>(null);
  const [testActionType, setTestActionType] = useState<'activate' | 'verify'>('activate');

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';

  const copyToClipboard = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const generateNewDeviceToken = () => {
    setTestDeviceToken('sec_inst_' + Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 10));
  };

  const runTest = async (type: 'activate' | 'verify') => {
    setLoadingTest(true);
    setTestActionType(type);
    setTestResponse(null);

    const startTime = Date.now();
    try {
      if (type === 'activate') {
        const res = await testActivateCode({
          code: testCode,
          deviceToken: testDeviceToken,
          deviceModel: testDeviceModel,
          deviceOs: testDeviceOs,
          appVersion: testAppVersion
        });
        setTestResponse({
          status: 200,
          timeMs: Date.now() - startTime,
          data: res
        });
      } else {
        const res = await testVerifyCode({
          code: testCode,
          deviceToken: testDeviceToken
        });
        setTestResponse({
          status: 200,
          timeMs: Date.now() - startTime,
          data: res
        });
      }
    } catch (e: any) {
      setTestResponse({
        status: 500,
        timeMs: Date.now() - startTime,
        error: e.message
      });
    } finally {
      setLoadingTest(false);
    }
  };

  const kotlinImplementationCode = `// ========================================================
// ملف 1: InstallationHelper.kt
// إنشاء وحفظ مفتاح تثبيت تشفيري آمن بدون الحاجة لأذونات IMEI
// ========================================================
package com.yourapp.activation

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.util.UUID

object InstallationHelper {
    private const val PREFS_FILE = "secure_device_prefs"
    private const val KEY_INSTALLATION_ID = "cryptographic_install_id"

    fun getDeviceToken(context: Context): String {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        val sharedPreferences = EncryptedSharedPreferences.create(
            context,
            PREFS_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        var token = sharedPreferences.getString(KEY_INSTALLATION_ID, null)
        if (token == null) {
            token = "sec_inst_" + UUID.randomUUID().toString().replace("-", "")
            sharedPreferences.edit().putString(KEY_INSTALLATION_ID, token).apply()
        }
        return token
    }
}

// ========================================================
// ملف 2: ActivationApiClient.kt
// الاتصال بالخادم السحابي عبر Retrofit أو OkHttp
// ========================================================
package com.yourapp.activation

import android.os.Build
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class ActivationApiClient(private val context: android.content.Context) {

    // ضع رابط الخادم المنشور الدائم بصيغة HTTPS هنا (لا تستخدم localhost أو ngrok)
    private val BASE_URL = "${currentOrigin}"
    
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    /**
     * تفعيل الكود وربطه بهذا التثبيت (الخادم مسؤول عن حساب البداية والنهاية)
     */
    fun activateCode(code: String, callback: (success: Boolean, message: String, expiresAt: String?) -> Unit) {
        val deviceToken = InstallationHelper.getDeviceToken(context)
        val payload = JSONObject().apply {
            put("code", code.trim().uppercase())
            put("deviceToken", deviceToken)
            put("deviceModel", Build.MANUFACTURER + " " + Build.MODEL)
            put("deviceOs", "Android " + Build.VERSION.RELEASE)
            put("appVersion", "1.0.0")
        }

        val request = Request.Builder()
            .url("$BASE_URL/api/activate")
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .addHeader("x-api-key", "${apiKey}")
            .build()

        Thread {
            try {
                val response = client.newCall(request).execute()
                val bodyStr = response.body?.string() ?: "{}"
                val json = JSONObject(bodyStr)

                val success = json.optBoolean("success", false)
                val message = json.optString("message", "استجابة الخادم غير واضحة")
                val expiresAt = json.optString("expiresAt", null)

                callback(success, message, expiresAt)
            } catch (e: Exception) {
                callback(false, "فشل الاتصال بالخادم: " + e.localizedMessage, null)
            }
        }.start()
    }

    /**
     * التحقق الدوري من حالة الاشتراك عند فتح التطبيق
     */
    fun verifySubscription(code: String, callback: (valid: Boolean, message: String, remainingDays: Int) -> Unit) {
        val deviceToken = InstallationHelper.getDeviceToken(context)
        val payload = JSONObject().apply {
            put("code", code.trim().uppercase())
            put("deviceToken", deviceToken)
        }

        val request = Request.Builder()
            .url("$BASE_URL/api/verify")
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .addHeader("x-api-key", "${apiKey}")
            .build()

        Thread {
            try {
                val response = client.newCall(request).execute()
                val bodyStr = response.body?.string() ?: "{}"
                val json = JSONObject(bodyStr)

                val valid = json.optBoolean("valid", false)
                val message = json.optString("message", "")
                val remainingDays = json.optInt("remainingDays", 0)

                callback(valid, message, remainingDays)
            } catch (e: Exception) {
                callback(false, "تعذر التحقق: " + e.localizedMessage, 0)
            }
        }.start()
    }
}`;

  return (
    <div className="space-y-8">
      
      {/* Top Permanent Hosting Card */}
      <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-900 border border-indigo-500/30 shadow-xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase tracking-wider mb-1">
              <Globe className="w-4 h-4" />
              <span>استضافة دائمة برابط HTTPS حقيقي</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white">
              العنوان الأساسي لواجهة برمجة التطبيقات (API Base URL)
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              هذا الرابط يعمل على مدار 24/7 دون الحاجة لأي أدوات محلية مثل ngrok أو نفق اتصال مؤقت، وجاهز للاتصال المباشر من أي تطبيق Android في العالم.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-4 py-2.5 rounded-xl border border-indigo-500/40 font-mono text-xs text-cyan-300 shadow-inner select-all">
            <span>{currentOrigin}</span>
            <button
              onClick={() => copyToClipboard(currentOrigin, 'origin')}
              className="p-1 hover:text-white transition-colors cursor-pointer"
              title="نسخ الرابط"
            >
              {copiedSection === 'origin' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Interactive API Tester */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-xl border border-cyan-500/20">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">أداة محاكاة واختبار الـ API المباشرة</h3>
              <p className="text-xs text-slate-400">
                اختبر استجابة الخادم الذرية لعمليات التفعيل والتحقق وكشف التكرار فورياً
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
            <Radio className="w-3 h-3 animate-pulse" />
            اتصال خادم حقيقي
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Controls: 6 cols */}
          <div className="lg:col-span-6 space-y-4">
            
            {/* Code Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                كود التفعيل المراد اختباره:
              </label>
              <input
                type="text"
                value={testCode}
                onChange={(e) => setTestCode(e.target.value.toUpperCase())}
                placeholder="ACT-XXXX-XXXX"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-sm uppercase focus:outline-none focus:border-cyan-400"
              />
            </div>

            {/* Device Token */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  مفتاح التثبيت التشفيري (Device Token):
                </label>
                <button
                  type="button"
                  onClick={generateNewDeviceToken}
                  className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Smartphone className="w-3 h-3" />
                  <span>توليد معرف جهاز جديد (لتجربة منع التكرار)</span>
                </button>
              </div>
              <input
                type="text"
                value={testDeviceToken}
                onChange={(e) => setTestDeviceToken(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>

            {/* Device Model & OS */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  طراز الجهاز:
                </label>
                <input
                  type="text"
                  value={testDeviceModel}
                  onChange={(e) => setTestDeviceModel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  نظام التشغيل:
                </label>
                <input
                  type="text"
                  value={testDeviceOs}
                  onChange={(e) => setTestDeviceOs(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            {/* Test Actions Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => runTest('activate')}
                disabled={loadingTest}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold rounded-xl text-xs shadow-md shadow-indigo-600/30 transition-all cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                <span>إرسال طلب التفعيل (/activate)</span>
              </button>

              <button
                onClick={() => runTest('verify')}
                disabled={loadingTest}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold rounded-xl text-xs border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>طلب تحقق دوري (/verify)</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400">
              * تجربة زر التفعيل على كود مفعل مسبقاً بنفس الجهاز سيعيد نجاح التفعيل، بينما تجربته من جهاز مختلف بمعرف آخر سيُرفض تلقائياً لحماية التثبيت الأحادي.
            </p>
          </div>

          {/* Response Console: 6 cols */}
          <div className="lg:col-span-6 bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs mb-3">
                <span className="text-slate-400">استجابة الخادم الحقيقية (Response):</span>
                {testResponse && (
                  <span className={`text-[11px] px-2 py-0.5 rounded ${testResponse.data?.success || testResponse.data?.valid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    HTTP {testResponse.data?.conflict ? '409 Conflict' : testResponse.status} ({testResponse.timeMs}ms)
                  </span>
                )}
              </div>

              {loadingTest ? (
                <div className="py-16 text-center text-slate-400">
                  <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <span className="text-xs">جارٍ تنفيذ المعاملة الذرية على الخادم...</span>
                </div>
              ) : testResponse ? (
                <pre className="text-xs text-cyan-300 overflow-x-auto text-left dir-ltr max-h-[280px]">
                  {JSON.stringify(testResponse.data || testResponse.error, null, 2)}
                </pre>
              ) : (
                <div className="py-16 text-center text-slate-600 text-xs">
                  اضغط على أحد أزرار الاختبار باليسار لمشاهدة استجابة الخادم الحية.
                </div>
              )}
            </div>

            {testResponse && testResponse.data?.message && (
              <div className={`mt-3 p-2.5 rounded-lg text-xs font-sans font-medium flex items-center gap-2 ${
                testResponse.data.success || testResponse.data.valid
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
              }`}>
                {testResponse.data.success || testResponse.data.valid ? (
                  <Check className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{testResponse.data.message}</span>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Endpoints Documentation */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Code className="w-5 h-5 text-indigo-400" />
          <span>توثيق نقاط النهاية (Endpoints Reference)</span>
        </h3>

        {/* Endpoint 0: /api/health */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-400 font-mono font-bold">
              GET
            </span>
            <code className="text-sm font-mono text-cyan-300 font-bold">
              {currentOrigin}/api/health
            </code>
          </div>
          <p className="text-slate-300">
            فحص جاهزية واتصال الخادم السحابي واسترجاع وقت الخادم المرجعي.
          </p>
        </div>

        {/* Endpoint 1: /api/activate */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-xs">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 font-mono font-bold">
              POST
            </span>
            <code className="text-sm font-mono text-cyan-300 font-bold">
              {currentOrigin}/api/activate
            </code>
          </div>
          <p className="text-slate-300 mb-3">
            تفعيل الكود لأول مرة وربطه تشفيرياً بجهاز Android. يقوم الخادم بحساب وقت البداية من هذه اللحظة، وتحديد موعد الانتهاء الدقيق وتخزينه.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="font-semibold text-slate-400 mb-1">بيانات الطلب (Request JSON Body):</div>
              <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 font-mono text-[11px] text-left dir-ltr overflow-x-auto">
{`{
  "code": "ACT-7X8Y-9Z1W",
  "deviceToken": "sec_inst_9876543210abcdef",
  "deviceModel": "Samsung Galaxy S24",
  "deviceOs": "Android 14",
  "appVersion": "1.0.0"
}`}
              </pre>
            </div>

            <div>
              <div className="font-semibold text-slate-400 mb-1">استجابة النجاح (Response 200 OK):</div>
              <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-emerald-400 font-mono text-[11px] text-left dir-ltr overflow-x-auto">
{`{
  "success": true,
  "status": "bound",
  "message": "تم تفعيل الكود بنجاح وربطه بهذا الجهاز.",
  "code": "ACT-7X8Y-9Z1W",
  "durationDays": 30,
  "remainingDays": 30,
  "firstActivatedAt": "2026-11-12T16:30:00.000Z",
  "expiresAt": "2026-12-12T16:30:00.000Z"
}`}
              </pre>
            </div>
          </div>
        </div>

        {/* Endpoint 2: /api/verify */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-xs">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 rounded-md bg-cyan-500/20 text-cyan-400 font-mono font-bold">
              POST
            </span>
            <code className="text-sm font-mono text-cyan-300 font-bold">
              {currentOrigin}/api/verify
            </code>
          </div>
          <p className="text-slate-300 mb-3">
            التحقق الدوري وحساب الأيام المتبقية تلقائياً وتحديث نبضة النشاط (Heartbeat) عند تشغيل تطبيق Android.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="font-semibold text-slate-400 mb-1">بيانات الطلب (Request JSON Body):</div>
              <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 font-mono text-[11px] text-left dir-ltr overflow-x-auto">
{`{
  "code": "ACT-7X8Y-9Z1W",
  "deviceToken": "sec_inst_9876543210abcdef"
}`}
              </pre>
            </div>

            <div>
              <div className="font-semibold text-slate-400 mb-1">استجابة النجاح (Response 200 OK):</div>
              <pre className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-cyan-300 font-mono text-[11px] text-left dir-ltr overflow-x-auto">
{`{
  "valid": true,
  "status": "bound",
  "deviceMatched": true,
  "message": "الاشتراك سارٍ ونشط.",
  "expiresAt": "2026-12-12T16:30:00.000Z",
  "remainingDays": 29,
  "remainingHours": 696
}`}
              </pre>
            </div>
          </div>
        </div>

        {/* Endpoint 3: /api/admin/generate */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-md bg-purple-500/20 text-purple-400 font-mono font-bold">
              POST
            </span>
            <code className="text-sm font-mono text-cyan-300 font-bold">
              {currentOrigin}/api/admin/generate
            </code>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
              يتطلب Bearer Firebase Admin ID Token
            </span>
          </div>
          <p className="text-slate-300">
            إنشاء كود واحد أو دفعات تصل إلى 1000 كود بصلاحيات المدير الموثقة.
          </p>
        </div>
      </div>

      {/* Kotlin Android Client Source Code */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              <span>كود Kotlin جاهز للنسخ في تطبيق Android</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              يتضمن إنشاء معرف التثبيت التشفيري وحفظه في مساحة مشفرة (بدون الحاجة لأذونات IMEI) مع استدعاءات API
            </p>
          </div>

          <button
            onClick={() => copyToClipboard(kotlinImplementationCode, 'kotlin')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow transition-colors cursor-pointer"
          >
            {copiedSection === 'kotlin' ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSection === 'kotlin' ? 'تم نسخ الكود!' : 'نسخ كود Kotlin بالكامل'}</span>
          </button>
        </div>

        <pre className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 font-mono text-xs overflow-x-auto text-left dir-ltr max-h-[500px]">
          {kotlinImplementationCode}
        </pre>
      </div>

    </div>
  );
};
