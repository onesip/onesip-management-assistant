
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { INITIAL_MENU_DATA, INITIAL_ANNOUNCEMENT_DATA, INITIAL_WIKI_DATA, SOP_DATABASE, TRAINING_LEVELS, DRINK_RECIPES } from '../constants';

// --- CONFIG ---
// Replace with your Firebase Project Config
// For Cloud functionality to work, you MUST create a Firebase project and enable Firestore.
const firebaseConfig = {
    apiKey: process.env.API_KEY, 
    authDomain: "onesip--management.firebaseapp.com",
    projectId: "onesip--management",
    storageBucket: "onesip--management.firebasestorage.app",
    messagingSenderId: "6590856722",
    appId: "1:6590856722:web:bf4abcc0a51de16fae62cb",
    measurementId: "G-GXZYD1GB8E"
};

// Initialize
let app;
let db: any;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
} catch (e) {
    console.warn("Firebase Init Failed (Likely no config provided). Running in local mode.");
}

// --- SEEDING ---
export const seedInitialData = async () => {
    if (!db) return;
    try {
        const docRef = doc(db, 'config', 'app_data');
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
            await setDoc(docRef, {
                menu: INITIAL_MENU_DATA,
                wiki: INITIAL_WIKI_DATA,
                announcement: INITIAL_ANNOUNCEMENT_DATA
            });
            console.log("Seeded Initial App Data");
        }
        // Seed Content if empty
        const contentRef = doc(db, 'config', 'content');
        const contentSnap = await getDoc(contentRef);
        if (!contentSnap.exists()) {
             await setDoc(contentRef, {
                 sops: SOP_DATABASE,
                 training: TRAINING_LEVELS,
                 recipes: DRINK_RECIPES
             });
        }
        
        // Seed Schedule if empty
        const schedRef = doc(db, 'config', 'schedule');
        const schedSnap = await getDoc(schedRef);
        if (!schedSnap.exists()) {
            // Generate basic schedule
             const days = [];
             const today = new Date();
             for (let i = 0; i < 21; i++) {
                 const d = new Date(today);
                 d.setDate(today.getDate() + i);
                 const dateStr = `${d.getMonth()+1}-${d.getDate()}`;
                 days.push({
                     date: dateStr,
                     name: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()],
                     zh: '',
                     morning: [],
                     evening: [],
                     hours: {
                         morning: {start: '10:00', end: '15:00'},
                         evening: {start: '14:30', end: '19:00'}
                     }
                 });
             }
             await setDoc(schedRef, { week: { title: 'Weekly Schedule', days } });
        }
        
    } catch (e) {
        console.error("Seeding Error", e);
    }
};

// --- INVENTORY ---
export const subscribeToInventory = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'inventory'), (doc) => {
        if (doc.exists()) callback(doc.data().items);
    });
};

export const saveInventoryList = async (items: any[]) => {
    if (!db) return;
    await setDoc(doc(db, 'data', 'inventory'), { items }, { merge: true });
};

// --- SCHEDULE ---
export const subscribeToSchedule = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'config', 'schedule'), (doc) => {
        if (doc.exists()) callback(doc.data().week);
    });
};

export const saveSchedule = async (week: any) => {
    if (!db) return;
    // FIX: Use setDoc with merge: true to ensure the document is upserted/updated reliably
    await setDoc(doc(db, 'config', 'schedule'), { week }, { merge: true });
};


// --- LOGS (Clock In/Out) ---
export const subscribeToLogs = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'logs'), (doc) => {
        if (doc.exists()) callback(doc.data().entries || []);
    });
};

export const saveLog = async (logEntry: any) => {
    if (!db) return;
    await updateDoc(doc(db, 'data', 'logs'), {
        entries: arrayUnion(logEntry)
    }).catch(async (e) => {
        // Create if not exists
        await setDoc(doc(db, 'data', 'logs'), { entries: [logEntry] });
    });
};

// --- CHAT & NOTICES ---
export const subscribeToChat = (callback: (msgs: any[], notices: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'chat'), (doc) => {
        if (doc.exists()) {
            const d = doc.data();
            callback(d.messages || [], d.notices || []);
        }
    });
};

export const saveMessage = async (msg: any) => {
    if (!db) return;
    await updateDoc(doc(db, 'data', 'chat'), { messages: arrayUnion(msg) })
        .catch(() => setDoc(doc(db, 'data', 'chat'), { messages: [msg], notices: [] }));
};

export const updateNotices = async (notices: any[]) => {
    if (!db) return { success: false };
    try {
        if (notices.length === 1) {
             await updateDoc(doc(db, 'data', 'chat'), { notices: arrayUnion(notices[0]) });
        } else {
             await setDoc(doc(db, 'data', 'chat'), { notices }, { merge: true });
        }
        return { success: true };
    } catch (e) {
        return { success: false };
    }
};

export const clearAllNotices = async () => {
    if (!db) return;
    await updateDoc(doc(db, 'data', 'chat'), { notices: [] });
};


// --- SWAPS ---
export const subscribeToSwaps = (callback: (reqs: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'swap_requests'), (doc) => {
        if (doc.exists()) callback(doc.data().requests || []);
    });
};

export const saveSwapRequest = async (req: any) => {
    if (!db) return;
    await updateDoc(doc(db, 'data', 'swap_requests'), { requests: arrayUnion(req) })
        .catch(() => setDoc(doc(db, 'data', 'swap_requests'), { requests: [req] }));
};

export const updateSwapRequests = async (requests: any[]) => {
    if (!db) return;
    await setDoc(doc(db, 'data', 'swap_requests'), { requests }, { merge: true });
};


// --- SALES ---
export const subscribeToSales = (callback: (sales: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'sales'), (doc) => {
        if (doc.exists()) callback(doc.data().records || []);
    });
};

export const saveSalesRecord = async (record: any) => {
    if (!db) return;
    await updateDoc(doc(db, 'data', 'sales'), { records: arrayUnion(record) })
        .catch(() => setDoc(doc(db, 'data', 'sales'), { records: [record] }));
};

// --- INVENTORY HISTORY ---
export const subscribeToInventoryHistory = (callback: (reports: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'inventory_history'), (doc) => {
        if (doc.exists()) callback(doc.data().reports || []);
    });
};

export const saveInventoryReport = async (report: any) => {
    if (!db) return;
    await updateDoc(doc(db, 'data', 'inventory_history'), { reports: arrayUnion(report) })
         .catch(() => setDoc(doc(db, 'data', 'inventory_history'), { reports: [report] }));
};

// --- CONTENT (SOP/Training/Recipes) ---
export const subscribeToContent = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'config', 'content'), (doc) => {
        if (doc.exists()) callback(doc.data());
    });
};

export const saveContent = async (key: 'sops'|'training'|'recipes', list: any[]) => {
    if (!db) return;
    await setDoc(doc(db, 'config', 'content'), { [key]: list }, { merge: true });
};

// --- INVENTORY LOGS ---
export const subscribeToInventoryLogs = (callback: (logs: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'inventory_logs'), (doc) => {
        if (doc.exists()) callback(doc.data().entries || []);
    });
};

export const saveInventoryLogs = async (logs: any[]) => {
    if (!db || logs.length === 0) return;
    await setDoc(doc(db, 'data', 'inventory_logs'), {
        entries: arrayUnion(...logs)
    }, { merge: true });
};
