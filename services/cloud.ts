
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, onSnapshot, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { INVENTORY_ITEMS, MOCK_SCHEDULE_WEEK02, SOP_DATABASE, TRAINING_LEVELS, DRINK_RECIPES } from '../constants';

// --- ⚠️ IMPORTANT: PASTE YOUR FIREBASE CONFIG HERE ⚠️ ---
// 1. Go to Firebase Console -> Project Settings -> General -> Your Apps
// 2. Copy the config object and replace the one below.
const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "onesip-manager.firebaseapp.com",
  projectId: "onesip-manager",
  storageBucket: "onesip-manager.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};

let db: any = null;
let isConfigured = false;

// Initialize Firebase
try {
    if (firebaseConfig.apiKey !== "REPLACE_WITH_YOUR_API_KEY") {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        isConfigured = true;
        console.log("🔥 Cloud Connected Successfully");
    } else {
        console.warn("⚠️ Firebase not configured. Using local mode.");
    }
} catch (e) {
    console.error("Firebase Init Error:", e);
}

export const isCloudEnabled = () => isConfigured;

// --- INITIAL DATA SEEDING ---
// If the cloud is empty, upload our local constants to initialize it.
export const seedInitialData = async () => {
    if (!db) return;
    
    const collections = [
        { name: 'config', id: 'inventory', data: { list: INVENTORY_ITEMS } },
        { name: 'config', id: 'schedule', data: { week: MOCK_SCHEDULE_WEEK02 } },
        { name: 'config', id: 'content', data: { sops: SOP_DATABASE, training: TRAINING_LEVELS, recipes: DRINK_RECIPES } },
        { name: 'data', id: 'logs', data: { entries: [] } },
        { name: 'data', id: 'chat', data: { messages: [], notices: [] } }
    ];

    for (const col of collections) {
        const ref = doc(db, col.name, col.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            await setDoc(ref, col.data);
            console.log(`Seeded ${col.id}`);
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

// --- ACTIONS (WRITING TO CLOUD) ---

export const saveInventoryList = async (list: any[]) => {
    if (!db) return;
    await updateDoc(doc(db, 'config', 'inventory'), { list });
};

export const saveInventoryReport = async (report: any) => {
    if (!db) return;
    // Save report to a separate collection history
    await setDoc(doc(db, 'history', report.id.toString()), report);
};

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
    await updateDoc(doc(db, 'data', 'chat'), {
        messages: arrayUnion(message)
    });
};

export const saveNotice = async (notice: any) => {
    if (!db) return;
    await updateDoc(doc(db, 'data', 'chat'), {
        notices: arrayUnion(notice)
    });
};

export const saveContent = async (type: 'sops' | 'training' | 'recipes', data: any[]) => {
    if (!db) return;
    await updateDoc(doc(db, 'config', 'content'), {
        [type]: data
    });
};
