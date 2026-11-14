/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyAfGBepF-hqnnsShB2x6Cc5UKJXygLa0x4",
  authDomain: "jokr-acd00.firebaseapp.com",
  projectId: "jokr-acd00",
  storageBucket: "jokr-acd00.firebasestorage.app",
  messagingSenderId: "961593687819",
  appId: "1:961593687819:web:9013e0ad306a3455df2c0e",
  measurementId: "G-JF94H9N3L3"
};

const ADMIN_AUTH_EMAIL = 'yuossefjok37@gmail.com';

console.log('[Firebase] Initializing Firebase app for project:', firebaseConfig.projectId);

export const app = initializeApp(firebaseConfig);

// Initialize default Cloud Firestore with long-polling for reliable connectivity behind proxies/iframes
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
console.log('[Firebase] Firestore initialized (long-polling) for project:', firebaseConfig.projectId);

export const auth = getAuth(app);

export function formatFirebaseAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const msg = error instanceof Error ? error.message : String(error || '');

  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found' ||
    msg.includes('auth/invalid-credential') ||
    msg.includes('auth/wrong-password')
  ) {
    return 'كلمة المرور غير صحيحة. يرجى التأكد والمحاولة مرة أخرى.';
  }
  if (code === 'auth/too-many-requests' || msg.includes('auth/too-many-requests')) {
    return 'تم تجاوز عدد محاولات الدخول المسموح بها مؤقتاً. يرجى الانتظار قليلاً ثم إعادة المحاولة.';
  }
  if (code === 'auth/network-request-failed' || msg.includes('auth/network-request-failed')) {
    return 'تعذر الاتصال بخادم المصادقة. تأكد من اتصال الإنترنت.';
  }
  if (code === 'auth/configuration-not-found' || msg.includes('auth/configuration-not-found')) {
    return `لم يتم تفعيل خدمة Firebase Authentication في مشروع "${firebaseConfig.projectId}".`;
  }
  if (code === 'auth/operation-not-allowed' || msg.includes('auth/operation-not-allowed')) {
    return `تسجيل الدخول بالبريد/كلمة المرور غير مفعّل في مشروع "${firebaseConfig.projectId}".`;
  }
  return msg || 'تعذر تسجيل الدخول.';
}

export async function loginWithPassword(password: string) {
  if (!password) {
    throw new Error('يرجى إدخال كلمة مرور المدير.');
  }
  try {
    console.log('[Firebase Auth] Signing in with admin password...');
    const result = await signInWithEmailAndPassword(auth, ADMIN_AUTH_EMAIL, password);
    console.log('[Firebase Auth] Signed in successfully:', result.user.email);
    return result.user;
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (
      code === 'auth/invalid-credential' ||
      code === 'auth/wrong-password' ||
      code === 'auth/user-not-found' ||
      code === 'auth/too-many-requests'
    ) {
      console.warn('[Firebase Auth] Password sign-in notice:', code);
    } else {
      console.error('[Firebase Auth] Password Sign-In failed:', error);
    }
    throw error;
  }
}

export async function logoutUser() {
  try {
    console.log('[Firebase Auth] Signing out user...');
    await signOut(auth);
    console.log('[Firebase Auth] Signed out successfully');
  } catch (error) {
    console.error('[Firebase Auth] Logout failed:', error);
    throw error;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('[Firestore Error]', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection() {
  try {
    console.log('[Firestore] Testing connection to server...');
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firestore] Connection check completed');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firestore] Client is currently offline; retrying when network resumes.');
    } else {
      console.log('[Firestore] Connection probe reachable');
    }
  }
}
