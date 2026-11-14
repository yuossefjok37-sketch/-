/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  setDoc,
  writeBatch
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase.ts';
import {
  reconcileServerWithFirestore,
  fetchPendingFirestoreSync,
  ackFirestoreSync,
  type PendingFirestoreSync
} from './api.ts';
import type { ActivationCode, ActivityLog, SystemSettings } from '../types/index.ts';

let activeSyncPromise: Promise<void> | null = null;

function isOfflineError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return msg.includes('offline') || msg.includes('unavailable') || msg.includes('network');
}

function isPermissionDeniedError(error: unknown): boolean {
  const code = (error as { code?: string })?.code || '';
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return code === 'permission-denied' || msg.includes('missing or insufficient permissions');
}

async function commitPendingWrites(
  pending: PendingFirestoreSync,
  existingRemoteLogIds: Set<string> = new Set(),
  existingRemoteCodeIds: Set<string> = new Set()
): Promise<void> {
  const syncedCodeIds: string[] = [];
  const deletedCodeIds: string[] = [];
  const syncedLogIds: string[] = [];
  let settingsSynced = false;

  // 1. Commit codes & deletes separately from immutable activityLogs
  const codeOps: Array<{
    type: 'setCode' | 'deleteCode';
    docId: string;
    data?: Record<string, unknown>;
  }> = [];

  for (const item of pending.codesToPush) {
    codeOps.push({ type: 'setCode', docId: item.docId, data: item.data });
  }
  for (const delId of pending.deletedCodeIds) {
    codeOps.push({ type: 'deleteCode', docId: delId });
  }

  const chunkSize = 400;
  for (let i = 0; i < codeOps.length; i += chunkSize) {
    const chunk = codeOps.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === 'setCode' && op.data) {
        batch.set(doc(db, 'codes', op.docId), op.data);
      } else if (op.type === 'deleteCode') {
        batch.delete(doc(db, 'codes', op.docId));
      }
    }

    try {
      console.log(`[Firestore Sync] Committing ${chunk.length} code operations...`);
      await batch.commit();
      console.log(`[Firestore Sync] Code batch committed (${chunk.length} ops)`);
      for (const op of chunk) {
        if (op.type === 'setCode') syncedCodeIds.push(op.docId);
        else deletedCodeIds.push(op.docId);
      }
    } catch (batchErr) {
      console.warn('[Firestore Sync] Code batch failed, falling back to per-doc sync:', batchErr);
      for (const op of chunk) {
        try {
          if (op.type === 'setCode' && op.data) {
            const payload = { ...op.data };
            if (existingRemoteCodeIds.has(op.docId) || existingRemoteCodeIds.size === 0) {
              const existingSnap = await getDocFromServer(doc(db, 'codes', op.docId)).catch(() => null);
              if (existingSnap?.exists()) {
                const existingData = existingSnap.data();
                if (existingData?.createdAt && payload.createdAt !== existingData.createdAt) {
                  payload.createdAt = existingData.createdAt;
                }
              }
            }
            await setDoc(doc(db, 'codes', op.docId), payload);
            syncedCodeIds.push(op.docId);
          } else if (op.type === 'deleteCode') {
            await deleteDoc(doc(db, 'codes', op.docId));
            deletedCodeIds.push(op.docId);
          }
        } catch (docErr) {
          if (isPermissionDeniedError(docErr)) {
            handleFirestoreError(docErr, OperationType.WRITE, `codes/${op.docId}`);
          }
          console.error(`[Firestore Sync] Failed code op ${op.docId}:`, docErr);
        }
      }
    }
  }

  // 2. Commit immutable activityLogs safely (never overwrite an existing immutable log)
  for (const logItem of pending.logsToPush) {
    if (existingRemoteLogIds.has(logItem.docId)) {
      syncedLogIds.push(logItem.docId);
      continue;
    }

    try {
      // If we didn't have a full remote list (e.g. background push), verify log doesn't already exist
      if (existingRemoteLogIds.size === 0) {
        const snap = await getDocFromServer(doc(db, 'activityLogs', logItem.docId)).catch(() => null);
        if (snap?.exists()) {
          syncedLogIds.push(logItem.docId);
          continue;
        }
      }
      await setDoc(doc(db, 'activityLogs', logItem.docId), logItem.data);
      syncedLogIds.push(logItem.docId);
    } catch (logErr) {
      if (isPermissionDeniedError(logErr)) {
        // Check if permission-denied happened because the immutable log already exists remotely
        const existingSnap = await getDocFromServer(doc(db, 'activityLogs', logItem.docId)).catch(() => null);
        if (existingSnap?.exists()) {
          console.log(`[Firestore Sync] Log ${logItem.docId} already exists remotely; marking synced.`);
          syncedLogIds.push(logItem.docId);
          continue;
        }
        handleFirestoreError(logErr, OperationType.CREATE, `activityLogs/${logItem.docId}`);
      } else {
        console.warn(`[Firestore Sync] Could not push log ${logItem.docId}:`, logErr);
      }
    }
  }

  // 3. Commit systemSettings/general if dirty
  if (pending.settingsToPush) {
    try {
      console.log('[Firestore Sync] Saving systemSettings/general via setDoc...');
      await setDoc(doc(db, 'systemSettings', 'general'), pending.settingsToPush);
      console.log('[Firestore Sync] systemSettings/general saved');
      settingsSynced = true;
    } catch (error) {
      console.error('[Firestore Sync] Failed saving systemSettings/general:', error);
      handleFirestoreError(error, OperationType.WRITE, 'systemSettings/general');
    }
  }

  if (
    syncedCodeIds.length > 0 ||
    deletedCodeIds.length > 0 ||
    syncedLogIds.length > 0 ||
    settingsSynced
  ) {
    await ackFirestoreSync({
      syncedCodeIds,
      deletedCodeIds,
      syncedLogIds,
      settingsSynced
    });
  }
}

export async function performFullFirestoreSync(): Promise<void> {
  if (!auth.currentUser) return;
  if (activeSyncPromise) return activeSyncPromise;

  activeSyncPromise = (async () => {
    try {
      console.log('[Firestore Sync] Starting full reconciliation from server...');
      let remoteCodes: ActivationCode[] = [];
      let remoteLogs: ActivityLog[] = [];
      let remoteSettings: SystemSettings | null = null;

      try {
        const codesSnap = await getDocsFromServer(collection(db, 'codes'));
        remoteCodes = codesSnap.docs.map((d) => ({
          ...(d.data() as Omit<ActivationCode, 'id'>),
          id: d.id
        }));
        console.log(`[Firestore Sync] Loaded ${remoteCodes.length} codes from Firestore server`);
      } catch (error) {
        if (isOfflineError(error)) {
          console.warn('[Firestore Sync] Skipping full sync while Firestore server is unreachable.');
          return;
        }
        console.error('[Firestore Sync] Failed reading codes:', error);
        handleFirestoreError(error, OperationType.LIST, 'codes');
      }

      try {
        const logsSnap = await getDocsFromServer(collection(db, 'activityLogs'));
        remoteLogs = logsSnap.docs.map((d) => ({
          ...(d.data() as Omit<ActivityLog, 'id'>),
          id: d.id
        }));
        console.log(`[Firestore Sync] Loaded ${remoteLogs.length} activityLogs from Firestore server`);
      } catch (error) {
        if (isOfflineError(error)) {
          console.warn('[Firestore Sync] Skipping full sync while Firestore server is unreachable.');
          return;
        }
        console.error('[Firestore Sync] Failed reading activityLogs:', error);
        handleFirestoreError(error, OperationType.LIST, 'activityLogs');
      }

      try {
        const settingsSnap = await getDocsFromServer(collection(db, 'systemSettings'));
        const generalDoc = settingsSnap.docs.find((d) => d.id === 'general');
        if (generalDoc) {
          remoteSettings = generalDoc.data() as SystemSettings;
          console.log('[Firestore Sync] Loaded systemSettings/general from Firestore server');
        }
      } catch (error) {
        if (isOfflineError(error)) {
          console.warn('[Firestore Sync] Skipping full sync while Firestore server is unreachable.');
          return;
        }
        console.error('[Firestore Sync] Failed reading systemSettings:', error);
        handleFirestoreError(error, OperationType.LIST, 'systemSettings');
      }

      const existingRemoteLogIds = new Set(remoteLogs.map((l) => l.id));
      const existingRemoteCodeIds = new Set(remoteCodes.map((c) => (c.code || c.id).toUpperCase()));
      const pending = await reconcileServerWithFirestore({
        codes: remoteCodes,
        logs: remoteLogs,
        settings: remoteSettings
      });

      if (pending) {
        await commitPendingWrites(pending, existingRemoteLogIds, existingRemoteCodeIds);
      }
      console.log('[Firestore Sync] Full reconciliation completed');
    } catch (error) {
      if (isOfflineError(error)) {
        console.warn('[Firestore Sync] Deferred sync until Firestore connection recovers.');
        return;
      }
      console.error('[Firestore Sync] Reconciliation error:', error);
      throw error;
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

export async function pushPendingToFirestore(): Promise<void> {
  if (!auth.currentUser) return;
  if (activeSyncPromise) return activeSyncPromise;

  activeSyncPromise = (async () => {
    try {
      const pending = await fetchPendingFirestoreSync();
      if (
        !pending ||
        (pending.codesToPush.length === 0 &&
          pending.deletedCodeIds.length === 0 &&
          pending.logsToPush.length === 0 &&
          !pending.settingsToPush)
      ) {
        return;
      }
      console.log('[Firestore Sync] Pushing pending server updates to Firestore...');
      await commitPendingWrites(pending);
    } catch (error) {
      console.warn('[Firestore Sync] Background push notice:', error);
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}
