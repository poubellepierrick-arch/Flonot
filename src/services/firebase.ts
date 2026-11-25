import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  enableNetwork,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      experimentalLongPollingOptions: { timeoutSeconds: 15 },
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = dbInstance;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function ensureFirestoreNetwork(): Promise<void> {
  try {
    await enableNetwork(db);
  } catch {
    // Ignore si le réseau est déjà actif ou non disponible
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

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Veuillez vérifier votre configuration Firebase.');
    }
  }
}

export function formatFirebaseSyncError(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('client is offline')) {
    return 'Connexion au cloud Firestore impossible (client hors ligne). Vérifiez votre réseau ou un éventuel bloqueur puis réessayez.';
  }
  if (lower.includes('target id already exists')) {
    return 'Conflit de session Firestore lors de la reconnexion. Cliquez sur Réessayer pour relancer la synchronisation.';
  }
  if (lower.includes('popup-blocked')) {
    return 'Popup bloquée par le navigateur ou l’iframe hôte. Dans l’application qui héberge cet embed, autorisez les popups (allow-popups et allow-popups-to-escape-sandbox si sandbox est utilisé) ou ouvrez l’application dans un onglet.';
  }
  if (lower.includes('popup-closed-by-user')) {
    return 'Fenêtre de connexion fermée avant la fin ou bloquée par l’iframe hôte (vérifiez allow-popups-to-escape-sandbox si sandbox est actif).';
  }
  if (lower.includes('cancelled-popup-request')) {
    return 'Demande de connexion précédente annulée. Réessayez.';
  }
  if (lower.includes('unauthorized-domain')) {
    return 'Domaine non autorisé pour la connexion Google. Ouvrez l’application dans un onglet.';
  }
  return raw;
}

void testConnection();
