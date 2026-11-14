/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

const firebaseConfig: FirebaseAppletConfig = {
  projectId: 'jokr-acd00',
  apiKey: 'AIzaSyAfGBepF-hqnnsShB2x6Cc5UKJXygLa0x4',
  firestoreDatabaseId: '(default)'
};

export function getFirebaseConfig(): FirebaseAppletConfig | null {
  return firebaseConfig;
}

function getFirestoreBaseUrl(): string | null {
  if (!firebaseConfig?.projectId) return null;
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  return `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents`;
}

function getDocumentResourcePath(collectionName: string, docId: string): string | null {
  if (!firebaseConfig?.projectId) return null;
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  return `projects/${firebaseConfig.projectId}/databases/${dbId}/documents/${collectionName}/${docId}`;
}

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

function toFirestoreValue(val: unknown): FirestoreValue | undefined {
  if (val === undefined) return undefined;
  if (val === null) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { nullValue: null };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (Array.isArray(val)) {
    const values = val
      .map(toFirestoreValue)
      .filter((v): v is FirestoreValue => v !== undefined);
    return { arrayValue: { values } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const converted = toFirestoreValue(v);
      if (converted !== undefined) {
        fields[k] = converted;
      }
    }
    return { mapValue: { fields } };
  }
  return undefined;
}

function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'id' || v === undefined) continue;
    const converted = toFirestoreValue(v);
    if (converted !== undefined) {
      fields[k] = converted;
    }
  }
  return fields;
}

function fromFirestoreValue(val: any): unknown {
  if (!val || typeof val !== 'object') return null;
  if ('nullValue' in val) return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    return Array.isArray(val.arrayValue?.values)
      ? val.arrayValue.values.map(fromFirestoreValue)
      : [];
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function fromFirestoreDocument<T>(doc: any): (T & { id: string }) | null {
  if (!doc || !doc.name) return null;
  const parts = String(doc.name).split('/');
  const id = parts[parts.length - 1];
  const out: Record<string, unknown> = { id };
  const fields = doc.fields || {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out as T & { id: string };
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
}

const tokenCache = new Map<string, { user: VerifiedFirebaseUser; expiresAt: number }>();

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!idToken || !firebaseConfig?.apiKey) return null;

  const cached = tokenCache.get(idToken);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      }
    );

    if (!res.ok) {
      return null;
    }

    const data: any = await res.json();
    const user = data?.users?.[0];
    if (!user || !user.localId || !user.email) {
      return null;
    }

    const verifiedUser: VerifiedFirebaseUser = {
      uid: user.localId,
      email: String(user.email).toLowerCase(),
      emailVerified: Boolean(user.emailVerified),
      displayName: user.displayName || undefined
    };

    tokenCache.set(idToken, {
      user: verifiedUser,
      expiresAt: Date.now() + 60_000
    });

    // Keep cache bounded
    if (tokenCache.size > 200) {
      const firstKey = tokenCache.keys().next().value;
      if (firstKey) tokenCache.delete(firstKey);
    }

    return verifiedUser;
  } catch (err) {
    console.error('Firebase token verification error:', err);
    return null;
  }
}

function formatRestError(errBody: string): string {
  return errBody.replace(/\s+/g, ' ').trim();
}

export async function isAuthorizedAdminRest(
  user: VerifiedFirebaseUser,
  idToken: string
): Promise<boolean> {
  if (!user.emailVerified) return false;
  if (user.email === 'yuossefjok37@gmail.com') return true;

  try {
    const adminDoc = await getDocumentRest<{ role?: string }>('admins', user.uid, idToken);
    return Boolean(adminDoc);
  } catch {
    return false;
  }
}

export async function listDocumentsRest<T>(
  collectionName: string,
  idToken: string,
  pageSize: number = 1000
): Promise<(T & { id: string })[]> {
  const baseUrl = getFirestoreBaseUrl();
  if (!baseUrl || !idToken) return [];

  const results: (T & { id: string })[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${baseUrl}/${collectionName}`);
    url.searchParams.set('pageSize', String(Math.min(pageSize, 1000)));
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${idToken}`
      }
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Firestore list ${collectionName} failed (${res.status}): ${formatRestError(errBody)}`);
    }

    const data: any = await res.json();
    if (Array.isArray(data.documents)) {
      for (const d of data.documents) {
        const parsed = fromFirestoreDocument<T>(d);
        if (parsed) results.push(parsed);
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken && results.length < 5000);

  return results;
}

export async function getDocumentRest<T>(
  collectionName: string,
  docId: string,
  idToken: string
): Promise<(T & { id: string }) | null> {
  const baseUrl = getFirestoreBaseUrl();
  if (!baseUrl || !idToken) return null;

  const res = await fetch(`${baseUrl}/${collectionName}/${encodeURIComponent(docId)}`, {
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Firestore get ${collectionName}/${docId} failed (${res.status}): ${formatRestError(errBody)}`);
  }

  const data = await res.json();
  return fromFirestoreDocument<T>(data);
}

export async function setDocumentRest(
  collectionName: string,
  docId: string,
  data: Record<string, unknown>,
  idToken: string
): Promise<boolean> {
  const baseUrl = getFirestoreBaseUrl();
  if (!baseUrl || !idToken) return false;

  const fields = toFirestoreFields(data);
  const res = await fetch(`${baseUrl}/${collectionName}/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ fields })
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Firestore set ${collectionName}/${docId} failed (${res.status}): ${formatRestError(errBody)}`);
  }
  return true;
}

export async function deleteDocumentRest(
  collectionName: string,
  docId: string,
  idToken: string
): Promise<boolean> {
  const baseUrl = getFirestoreBaseUrl();
  if (!baseUrl || !idToken) return false;

  const res = await fetch(`${baseUrl}/${collectionName}/${encodeURIComponent(docId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${idToken}`
    }
  });

  if (res.status === 404) return true;
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Firestore delete ${collectionName}/${docId} failed (${res.status}): ${formatRestError(errBody)}`);
  }
  return true;
}

export async function batchSetDocumentsRest(
  collectionName: string,
  items: { docId: string; data: Record<string, unknown> }[],
  idToken: string
): Promise<boolean> {
  if (!firebaseConfig?.projectId || !idToken || items.length === 0) return false;
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents:commit`;

  const chunkSize = 250;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const writes = chunk
      .map((item) => {
        const name = getDocumentResourcePath(collectionName, item.docId);
        if (!name) return null;
        return {
          update: {
            name,
            fields: toFirestoreFields(item.data)
          }
        };
      })
      .filter(Boolean);

    const res = await fetch(commitUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ writes })
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      // Fallback to individual PATCH writes in small concurrency batches
      // so one stale/conflicting document doesn't block valid documents
      let lastItemErr: Error | null = null;
      const concurrency = 10;
      for (let j = 0; j < chunk.length; j += concurrency) {
        const sub = chunk.slice(j, j + concurrency);
        await Promise.all(
          sub.map(async (item) => {
            try {
              await setDocumentRest(collectionName, item.docId, item.data, idToken);
            } catch (itemErr: any) {
              lastItemErr = itemErr instanceof Error ? itemErr : new Error(String(itemErr));
            }
          })
        );
      }
      if (lastItemErr) {
        throw new Error(
          `Firestore batch commit ${collectionName} failed (${res.status}): ${formatRestError(errBody)} | itemError: ${(lastItemErr as Error).message}`
        );
      }
    }
  }

  return true;
}
