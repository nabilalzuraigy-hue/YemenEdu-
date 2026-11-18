import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDoc,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

const targetDatabaseId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

// Initialize Firestore with persistent local cache + auto-detect long polling (safe fallback for private browsing)
export const db = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      targetDatabaseId
    );
  } catch {
    return targetDatabaseId ? getFirestore(app, targetDatabaseId) : getFirestore(app);
  }
})();
export const auth = getAuth(app);
export const storage = getStorage(app);

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

/**
 * Global Firebase Connection Status Store
 */
export interface FirebaseConnectionStatus {
  isOnline: boolean;
  hasError: boolean;
  errorMessage: string | null;
  lastChecked: number;
  dismissed: boolean;
}

let connectionStatus: FirebaseConnectionStatus = {
  isOnline: true,
  hasError: false,
  errorMessage: null,
  lastChecked: Date.now(),
  dismissed: false,
};

const connectionListeners = new Set<(status: FirebaseConnectionStatus) => void>();

export function subscribeConnectionStatus(cb: (status: FirebaseConnectionStatus) => void): () => void {
  connectionListeners.add(cb);
  cb({ ...connectionStatus });
  return () => {
    connectionListeners.delete(cb);
  };
}

export function setFirebaseError(msg: string) {
  console.log(`ℹ️ [Firebase Connection Notice]: ${msg}`);
  connectionStatus = {
    isOnline: false,
    hasError: true,
    errorMessage: msg,
    lastChecked: Date.now(),
    dismissed: false,
  };
  connectionListeners.forEach((l) => l({ ...connectionStatus }));
}

export function clearFirebaseError() {
  console.log('💚 [Firebase Connection Restored]: Connection is normal.');
  connectionStatus = {
    isOnline: true,
    hasError: false,
    errorMessage: null,
    lastChecked: Date.now(),
    dismissed: false,
  };
  connectionListeners.forEach((l) => l({ ...connectionStatus }));
}

export function dismissFirebaseWarning() {
  console.log('ℹ️ [Firebase Connection Notice]: User chose to continue offline.');
  connectionStatus = {
    ...connectionStatus,
    dismissed: true,
  };
  connectionListeners.forEach((l) => l({ ...connectionStatus }));
}

/**
 * 5-Second Timeout Promise Wrapper for any Firebase operation
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
  operationName: string = 'Firebase Operation'
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const timeoutErr = new Error(`[Firebase Timeout] ${operationName} exceeded ${timeoutMs}ms limit`);
      console.log(`ℹ️ [Firebase Timeout] عملية "${operationName}" استغرقت أكثر من ${timeoutMs / 1000} ثوانٍ بدون استجابة.`);
      setFirebaseError(`مشكلة اتصال - انتهت مهلة الاتصال بالخادم (${timeoutMs / 1000} ثوانٍ)`);
      reject(timeoutErr);
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer!);
    return result;
  } catch (err) {
    clearTimeout(timer!);
    throw err;
  }
}

/**
 * Standard Error Handler with full console.error inspection & formatting
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errorMsg,
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  // Detailed logging to browser console
  console.error('🔥 [Firebase Error Detailed Log]:', {
    operation: operationType,
    path: path || 'unknown',
    errorMessage: errorMsg,
    currentUser: auth.currentUser ? { uid: auth.currentUser.uid, email: auth.currentUser.email } : 'Not Logged In',
    rawError: error,
  });

  setFirebaseError(`خطأ في اتصال قاعدة البيانات (${operationType}): ${errorMsg}`);
  return errInfo;
}

/**
 * Ensure auth session is ready without EVER hanging
 * If no user is logged in, resolves immediately after 1.5s max as guest/offline
 */
export async function ensureAuthReady(timeoutMs: number = 1500): Promise<string> {
  if (auth.currentUser) {
    console.log(`[Firebase Auth] Cached user ready: ${auth.currentUser.uid}`);
    return auth.currentUser.uid;
  }

  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.log(`[Firebase Auth] onAuthStateChanged timeout (${timeoutMs}ms). Continuing without blocking.`);
        resolve('');
      }
    }, timeoutMs);

    try {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            unsubscribe();
            if (user) {
              console.log(`[Firebase Auth] User state detected: ${user.uid} (${user.email || 'guest'})`);
              resolve(user.uid);
            } else {
              console.log('[Firebase Auth] No user currently signed in. Continuing in local/code-based mode.');
              resolve('');
            }
          }
        },
        (err) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            console.error('[Firebase Auth Error] onAuthStateChanged error:', err);
            resolve('');
          }
        }
      );
    } catch (err) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        console.error('[Firebase Auth Catch] onAuthStateChanged exception:', err);
        resolve('');
      }
    }
  });
}

/**
 * Test connection on boot per Firebase skill directive with strict 5s timeout
 */
export async function testFirestoreConnection() {
  try {
    await withTimeout(
      getDoc(doc(db, 'super_admins', 'owner-nabil')),
      5000,
      'فحص الاتصال بقاعدة البيانات'
    );
    console.log('✅ [Firebase Connection] Successfully connected to live Firestore (yemenedu-69e4e)!');
    clearFirebaseError();
  } catch (error: any) {
    console.log('ℹ️ [Firebase Connection Notice] testFirestoreConnection:', error?.message || error);
    setFirebaseError('مشكلة اتصال - اضغط إعادة المحاولة');
  }
}
