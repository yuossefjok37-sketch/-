/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initializeDatabase,
  reconcileFromFirestore,
  getPendingFirestoreSync,
  acknowledgeFirestoreSync,
  activateCodeAtomically,
  verifyCode,
  batchGenerateCodes,
  unbindDeviceByAdmin,
  toggleCodeStatusByAdmin,
  deleteCodeByAdmin,
  getCodes,
  getSystemStats,
  getLogs,
  getSettings,
  updateSettings
} from './src/server/db.ts';
import {
  verifyFirebaseIdToken,
  isAuthorizedAdminRest
} from './src/server/firestoreRest.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface AdminRequest extends Request {
  adminEmail?: string;
  adminIdToken?: string;
  adminUid?: string;
}

async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]) {
      return res.status(401).json({ error: 'مطلوب تسجيل دخول المدير للمتابعة.' });
    }

    const idToken = match[1].trim();
    const user = await verifyFirebaseIdToken(idToken);
    if (!user) {
      return res.status(401).json({ error: 'جلسة المصادقة غير صالحة أو منتهية.' });
    }

    const authorized = await isAuthorizedAdminRest(user, idToken);
    if (!authorized) {
      return res.status(403).json({
        error: 'غير مصرح لهذا الحساب بالوصول إلى لوحة تحكم الإدارة.'
      });
    }

    req.adminEmail = user.email;
    req.adminUid = user.uid;
    req.adminIdToken = idToken;

    return next();
  } catch (err: any) {
    console.error('Admin auth middleware error:', err);
    return res.status(500).json({ error: 'خطأ في التحقق من صلاحيات المدير.' });
  }
}

function createApiRouter(): express.Router {
  const router = express.Router();

  // ----------------------------------------------------
  // PUBLIC / ANDROID API ENDPOINTS
  // ----------------------------------------------------

  // Health check endpoint: GET /api/health & GET /api/v1/health
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Activation Codes Manager API',
      version: '1.0.0',
      serverTime: new Date().toISOString()
    });
  });

  // Client Activation Endpoint: POST /api/activate & POST /api/v1/activate
  router.post('/activate', async (req, res) => {
    try {
      const providedKey = req.headers['x-api-key'] as string | undefined;
      if (providedKey) {
        const currentSettings = getSettings();
        if (providedKey !== currentSettings.apiKey) {
          return res.status(401).json({
            success: false,
            message: 'مفتاح API المرسل في الترويسة (x-api-key) غير صحيح.'
          });
        }
      }

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
      const { code, deviceToken, deviceModel, deviceOs, appVersion } = req.body || {};

      const result = await activateCodeAtomically({
        code,
        deviceToken,
        deviceModel,
        deviceOs,
        appVersion,
        ipAddress: ip
      });

      res.status(result.status).json(result.body);
    } catch (error: any) {
      console.error('API /activate error:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ غير متوقع في الخادم أثناء تفعيل الكود: ' + (error?.message || 'Internal Error')
      });
    }
  });

  // Client Periodic Verification Endpoint: POST /api/verify & POST /api/v1/verify
  router.post('/verify', async (req, res) => {
    try {
      const providedKey = req.headers['x-api-key'] as string | undefined;
      if (providedKey) {
        const currentSettings = getSettings();
        if (providedKey !== currentSettings.apiKey) {
          return res.status(401).json({
            valid: false,
            message: 'مفتاح API المرسل في الترويسة (x-api-key) غير صحيح.'
          });
        }
      }

      const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '';
      const { code, deviceToken } = req.body || {};

      const result = await verifyCode({
        code,
        deviceToken,
        ipAddress: ip
      });

      res.status(result.status).json(result.body);
    } catch (error: any) {
      console.error('API /verify error:', error);
      res.status(500).json({
        valid: false,
        message: 'خطأ في معالجة التحقق من الخادم: ' + (error?.message || 'Internal Error')
      });
    }
  });

  // ----------------------------------------------------
  // ADMIN DASHBOARD API ENDPOINTS (Protected by Firebase Auth)
  // ----------------------------------------------------

  router.get('/admin/me', requireAdmin, (req: AdminRequest, res) => {
    res.json({
      authorized: true,
      email: req.adminEmail,
      uid: req.adminUid
    });
  });

  router.post('/admin/sync', requireAdmin, (req: AdminRequest, res) => {
    try {
      const pending = reconcileFromFirestore(req.body || {});
      res.json(pending);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/admin/sync/pending', requireAdmin, (_req: AdminRequest, res) => {
    try {
      res.json(getPendingFirestoreSync());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/admin/sync/ack', requireAdmin, (req: AdminRequest, res) => {
    try {
      acknowledgeFirestoreSync(req.body || {});
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/admin/codes', requireAdmin, (req: AdminRequest, res) => {
    try {
      const { status, search, batchId, limit, offset } = req.query;
      const data = getCodes({
        status: status as string,
        search: search as string,
        batchId: batchId as string,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0
      });
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/admin/stats', requireAdmin, (req: AdminRequest, res) => {
    try {
      const stats = getSystemStats();
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/admin/logs', requireAdmin, (req: AdminRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const logs = getLogs(limit);
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Batch generate codes: POST /api/admin/generate & POST /api/v1/admin/generate
  router.post('/admin/generate', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const { count, mode, manualCodes, prefix, durationDays, durationLabel, note } = req.body || {};
      const result = await batchGenerateCodes({
        count: count || 1,
        mode: mode || 'random',
        manualCodes: Array.isArray(manualCodes) ? manualCodes : [],
        prefix: prefix || 'ACT',
        durationDays: Number(durationDays) || 30,
        durationLabel,
        note,
        adminEmail: req.adminEmail || 'yuossefjok37@gmail.com',
        adminIdToken: req.adminIdToken
      });
      res.json(result);
    } catch (e: any) {
      console.error('Batch generation error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/admin/unbind', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const { code, resetDuration } = req.body || {};
      const result = await unbindDeviceByAdmin(
        code,
        req.adminEmail || 'yuossefjok37@gmail.com',
        resetDuration,
        req.adminIdToken
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/admin/toggle-status', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const { code, status } = req.body || {};
      const result = await toggleCodeStatusByAdmin(
        code,
        status,
        req.adminEmail || 'yuossefjok37@gmail.com',
        req.adminIdToken
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.delete('/admin/code/:codeId', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const codeId = String(req.params.codeId || '');
      const result = await deleteCodeByAdmin(
        codeId,
        req.adminEmail || 'yuossefjok37@gmail.com',
        req.adminIdToken
      );
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/admin/settings', requireAdmin, (req: AdminRequest, res) => {
    try {
      res.json(getSettings());
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/admin/settings', requireAdmin, async (req: AdminRequest, res) => {
    try {
      const { apiKey, appName, allowNewActivations } = req.body || {};
      const updated = await updateSettings(
        { apiKey, appName, allowNewActivations },
        req.adminEmail || 'yuossefjok37@gmail.com',
        req.adminIdToken
      );
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // JSON 404 for unknown /api/* routes
  router.use((req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  return router;
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.set('trust proxy', 1);

  // Middleware
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Initialize local durable DB
  await initializeDatabase();

  // Mount API routes on both /api and /api/v1
  const apiRouter = createApiRouter();
  app.use('/api/v1', apiRouter);
  app.use('/api', apiRouter);

  // ----------------------------------------------------
  // VITE / STATIC INTEGRATION
  // ----------------------------------------------------
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    process.env.DISABLE_HMR = 'true';
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'spa',
    });

    app.get('/@vite/client', (_req, res) => {
      res.type('application/javascript').send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  return {
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
    data: {}
  };
}
export function injectQuery(url) { return url; }
export class ErrorOverlay {}
`);
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    } else {
      app.get('/', (req, res) => {
        res.json({
          service: 'Activation Codes Manager API',
          status: 'running',
          endpoints: ['/api/health', '/api/activate', '/api/verify', '/api/admin/generate']
        });
      });
    }
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[Activation Codes Manager] Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal Server Error:', err);
  process.exit(1);
});
