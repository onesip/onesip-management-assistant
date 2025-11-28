
import * as firebaseApp from 'firebase/app';
import { getFirestore, collection, doc, setDoc, onSnapshot, getDoc, updateDoc, arrayUnion, deleteDoc } from 'firebase/firestore';
import { INVENTORY_ITEMS, MOCK_SCHEDULE_WEEK02, SOP_DATABASE, TRAINING_LEVELS, DRINK_RECIPES } from '../constants';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBDfYlwxPV9pASCLu4U5ffGvv6lK5qGC4A",
  authDomain: "onesip--management.firebaseapp.com",
  projectId: "onesip--management",
  storageBucket: "onesip--management.firebasestorage.app",
  messagingSenderId: "6590856722",
  appId: "1:6590856722:web:bf4abcc0a51de16fae62cb",
  measurementId: "G-GXZYD1GB8E"
};

let db: any = null;
let isConfigured = false;

// Initialize Firebase
try {
    // Cast to any to bypass "Module has no exported member" TS error if types are mismatched
    const initializeApp = (firebaseApp as any).initializeApp;
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    isConfigured = true;
    console.log("🔥 Cloud Connected Successfully to: onesip--management");
} catch (e) {
    console.error("Firebase Init Error:", e);
}

export const isCloudEnabled = () => isConfigured;

// --- INITIAL DATA SEEDING ---
// Checks if critical collections exist. If not, uploads local defaults.
export const seedInitialData = async () => {
    if (!db) return;
    
    // Check specific collections to determine if seeding is needed
    // We check 'config/inventory' as a proxy for "is the DB initialized?"
    const checkRef = doc(db, 'config', 'inventory');
    const checkSnap = await getDoc(checkRef);

    if (checkSnap.exists()) {
        console.log("✅ Database already initialized. Skipping seed.");
        return;
    }

    console.log("🌱 Database empty. Seeding initial data...");

    const collections = [
        { name: 'config', id: 'inventory', data: { list: INVENTORY_ITEMS } },
        { name: 'config', id: 'schedule', data: { week: MOCK_SCHEDULE_WEEK02 } },
        { name: 'config', id: 'content', data: { sops: SOP_DATABASE, training: TRAINING_LEVELS, recipes: DRINK_RECIPES } },
        { name: 'data', id: 'logs', data: { entries: [] } },
        { name: 'data', id: 'chat', data: { messages: [], notices: [] } },
        { name: 'data', id: 'swaps', data: { requests: [] } },
        { name: 'data', id: 'sales', data: { records: [] } },
        { name: 'data', id: 'inventory_history', data: { reports: [] } },
        { name: 'data', id: 'inventory_logs', data: { entries: [] } }
    ];

    for (const col of collections) {
        try {
            await setDoc(doc(db, col.name, col.id), col.data);
            console.log(`✅ Seeded: ${col.id}`);
        } catch (e) {
            console.error(`Error seeding ${col.id}:`, e);
        }
    }
};

// --- SUBSCRIPTIONS (REAL-TIME SYNC) ---

export const subscribeToInventory = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'config', 'inventory'), (doc) => {
        if (doc.exists()) callback(doc.data().list);
    });
};

export const subscribeToSchedule = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'config', 'schedule'), (doc) => {
        if (doc.exists()) callback(doc.data().week);
    });
};

export const subscribeToContent = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'config', 'content'), (doc) => {
        if (doc.exists()) callback(doc.data());
    });
};

export const subscribeToLogs = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'logs'), (doc) => {
        if (doc.exists()) callback(doc.data().entries || []);
    });
};

export const subscribeToChat = (callback: (msgs: any[], notices: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'chat'), (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            callback(data.messages || [], data.notices || []);
        }
    });
};

export const subscribeToSwaps = (callback: (requests: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'swaps'), (doc) => {
        if (doc.exists()) callback(doc.data().requests || []);
    });
};

export const subscribeToSales = (callback: (records: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'sales'), (doc) => {
        if (doc.exists()) callback(doc.data().records || []);
    });
};

export const subscribeToInventoryHistory = (callback: (reports: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'inventory_history'), (doc) => {
        if (doc.exists()) callback(doc.data().reports || []);
    });
};

export const subscribeToInventoryLogs = (callback: (entries: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'inventory_logs'), (doc) => {
        if (doc.exists()) callback(doc.data().entries || []);
    });
};

// --- ACTIONS (WRITING TO CLOUD) ---

export const saveInventoryList = async (list: any[]) => {
    if (!db) return;
    await updateDoc(doc(db, 'config', 'inventory'), { list });
};

export const saveInventoryReport = async (report: any) => {
    if (!db) return;
    // Save report to the dedicated array for history listing
    await setDoc(doc(db, 'data', 'inventory_history'), {
        reports: arrayUnion(report)
    }, { merge: true });
};

export const saveInventoryLogs = async (logs: any[]) => {
    if (!db || logs.length === 0) return;
    // Use setDoc with merge: true to ensure the document exists
    await setDoc(doc(db, 'data', 'inventory_logs'), {
        entries: arrayUnion(...logs)
    }, { merge: true });
}

export const saveSchedule = async (week: any) => {
    if (!db) return;
    await updateDoc(doc(db, 'config', 'schedule'), { week });
};

export const saveLog = async (logEntry: any) => {
    if (!db) return;
    // Use arrayUnion to add to the list atomically
    await updateDoc(doc(db, 'data', 'logs'), {
        entries: arrayUnion(logEntry)
    });
};

export const saveMessage = async (message: any) => {
    if (!db) return;
    // Use setDoc with merge to ensure document exists, solving "sync issues" if doc is missing
    await setDoc(doc(db, 'data', 'chat'), {
        messages: arrayUnion(message)
    }, { merge: true });
};

export const saveNotice = async (notice: any) => {
    if (!db) return;
    await setDoc(doc(db, 'data', 'chat'), {
        notices: arrayUnion(notice)
    }, { merge: true });
};

export const updateNotices = async (notices: any[]) => {
    if (!db) {
        console.error("❌ DB not initialized in updateNotices");
        return { success: false, error: "Database not initialized." };
    }
    try {
        console.log("📤 Syncing Notices to Cloud:", notices.length, "items");
        await updateDoc(doc(db, 'data', 'chat'), { notices });
        console.log("✅ Notices Synced Successfully");
        return { success: true };
    } catch (e) {
        console.error("❌ Error updating notices:", e);
        return { success: false, error: e };
    }
};

export const saveContent = async (type: 'sops' | 'training' | 'recipes', data: any[]) => {
    if (!db) return;
    await updateDoc(doc(db, 'config', 'content'), {
        [type]: data
    });
};

export const saveSwapRequest = async (request: any) => {
    if (!db) return;
    await setDoc(doc(db, 'data', 'swaps'), {
        requests: arrayUnion(request)
    }, { merge: true });
};

export const updateSwapRequests = async (requests: any[]) => {
    if (!db) return;
    await updateDoc(doc(db, 'data', 'swaps'), { requests });
};

export const saveSalesRecord = async (record: any) => {
    if (!db) return;
    await setDoc(doc(db, 'data', 'sales'), {
        records: arrayUnion(record)
    }, { merge: true });
};
