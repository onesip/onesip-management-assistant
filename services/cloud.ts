
// @ts-ignore
// FIX: Added @ts-ignore to suppress potential module resolution errors in specific build environments.
import { initializeApp } from 'firebase/app';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    onSnapshot, 
    updateDoc, 
    arrayUnion, 
    getDoc, 
    serverTimestamp, 
    collection, 
    getDocs,
    query,
    where,
    addDoc,
    QuerySnapshot,
    DocumentData,
    DocumentSnapshot
} from 'firebase/firestore';
import { INITIAL_MENU_DATA, INITIAL_ANNOUNCEMENT_DATA, INITIAL_WIKI_DATA, SOP_DATABASE, TRAINING_LEVELS, DRINK_RECIPES, USERS } from '../constants';
import { ChatReadState, ScheduleCycle, User } from '../types';
import { SmartInventoryReport } from '../types';

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
        
        // Seed Schedule if empty - We rely on ensureScheduleCoverage now, but seeding a basic structure is safe
        const schedRef = doc(db, 'config', 'schedule');
        const schedSnap = await getDoc(schedRef);
        if (!schedSnap.exists()) {
             await setDoc(schedRef, { week: { title: 'Weekly Schedule', days: [] } });
        }

        // Seed Users if empty (one-time migration)
        const usersCollectionRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollectionRef);
        if (usersSnapshot.empty) {
            console.log("Seeding users to Firestore...");
            const userSeedPromises = USERS.map(user => {
                const userDocRef = doc(db, 'users', user.id);
                // Add the 'active: true' field to all existing users during migration
                return setDoc(userDocRef, { ...user, active: true });
            });
            await Promise.all(userSeedPromises);
        }
        
    } catch (e) {
        console.error("Seeding Error", e);
    }
};

// --- USERS / STAFF MANAGEMENT ---
export const subscribeToUsers = (callback: (data: any) => void) => {
    if (!db) return () => {};
    // Real-time listener for the new 'users' collection
    return onSnapshot(collection(db, 'users'), (snapshot: any) => {
        const users = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        callback(users);
    });
};

export const saveUser = async (user: User) => {
    if (!db) return;
    // Creates a new user or updates an existing one
    const userRef = doc(db, 'users', user.id);
    await setDoc(userRef, user, { merge: true });
};


// --- INVENTORY ---
export const subscribeToInventory = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'inventory'), (doc: any) => {
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
    return onSnapshot(doc(db, 'config', 'schedule'), (doc: any) => {
        if (doc.exists()) callback(doc.data().week);
    });
};

export const saveSchedule = async (week: any) => {
    if (!db) return;
    await setDoc(doc(db, 'config', 'schedule'), { week }, { merge: true });
};

// Helper to normalize dates for comparison (e.g. 1-5 to 01-05)
const padDate = (str: string) => {
    const [m, d] = str.split('-');
    return `${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

export const ensureScheduleCoverage = async () => {
    if (!db) return;
    
    const schedRef = doc(db, 'config', 'schedule');
    const docSnap = await getDoc(schedRef);
    let existingDays = docSnap.exists() ? (docSnap.data().week?.days || []) : [];
    
    // Create a Set of existing dates for O(1) lookup
    const existingDateSet = new Set(existingDays.map((d: any) => padDate(d.date)));

    const daysToAdd: any[] = [];
    const now = new Date();
    
    // Calculate range: 1st of Current Month to End of Next Month
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0); // Day 0 of month +2 is last day of month +1

    const loopDate = new Date(startOfCurrentMonth);

    while (loopDate <= endOfNextMonth) {
        const month = loopDate.getMonth() + 1;
        const day = loopDate.getDate();
        const dateStr = `${month}-${day}`;
        const paddedDateStr = padDate(dateStr);

        if (!existingDateSet.has(paddedDateStr)) {
            // 这里修改为：默认创建3个通用班次，符合新的数据结构
            daysToAdd.push({
                date: dateStr,
                name: loopDate.toLocaleDateString('en-US', { weekday: 'long' }), 
                zh: '', 
                // 不再初始化 morning/evening/night，而是直接初始化 shifts 数组
                shifts: [
                    { id: 's1', name: 'Shift 1', start: '10:00', end: '15:00', staff: [] },
                    { id: 's2', name: 'Shift 2', start: '14:30', end: '19:00', staff: [] },
                    { id: 's3', name: 'Shift 3', start: '18:00', end: '22:00', staff: [] }
                ],
                // 此时旧字段留空或不写即可，前端已有兼容逻辑
            });
        }
        
        // Move to next day
        loopDate.setDate(loopDate.getDate() + 1);
    }

    if (daysToAdd.length > 0) {
        console.log(`Auto-generating ${daysToAdd.length} schedule days for the upcoming 2 months.`);
        // Merge and sort
        const newDays = [...existingDays, ...daysToAdd].sort((a: any, b: any) => {
            // Very basic sort assuming data is roughly current. 
            // For rigorous sorting across years, we'd need Year stored in data, but this suffices for the rolling window context.
            // We use the same 'smart' sort as in App.tsx
            const dateA = new Date(`${now.getFullYear()}-${a.date}`);
            const dateB = new Date(`${now.getFullYear()}-${b.date}`);
            // If date is drastically in past (e.g. Dec when now is Jan), treat as next year? 
            // For now, simple timestamp sort usually works if seeded sequentially.
            return dateA.getTime() - dateB.getTime();
        });

        await setDoc(schedRef, { week: { ...docSnap.data()?.week, days: newDays } }, { merge: true });
    }
};


// --- LOGS (Clock In/Out) ---
export const subscribeToLogs = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'logs'), (doc: any) => {
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

// FIX: Add function to update the entire log array, used for invalidating/editing entries.
export const updateLogs = async (logs: any[]) => {
    if (!db) return;
    await setDoc(doc(db, 'data', 'logs'), { entries: logs });
};

// --- CHAT & NOTICES ---
export const subscribeToChat = (callback: (msgs: any[], notices: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'chat'), (doc: any) => {
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
             // 尝试更新现有文档追加公告
             // 如果 updateDoc 失败（例如文档不存在），catch 会捕获错误并执行 setDoc 创建文档
             await updateDoc(doc(db, 'data', 'chat'), { notices: arrayUnion(notices[0]) })
                .catch(async (err) => {
                    console.log("Document does not exist, creating new one...", err);
                    // 【关键修复】：使用 setDoc 自动创建文档，并使用 merge: true 防止覆盖其他字段
                    await setDoc(doc(db, 'data', 'chat'), { notices: notices }, { merge: true });
                });
        } else {
             // 如果是全量更新/删除操作，直接覆盖/合并
             await setDoc(doc(db, 'data', 'chat'), { notices }, { merge: true });
        }
        return { success: true };
    } catch (e) {
        console.error("Update Notice Error:", e);
        return { success: false };
    }
};

export const clearAllNotices = async () => {
    if (!db) return;
    await updateDoc(doc(db, 'data', 'chat'), { notices: [] });
};

// --- CHAT READ STATE (NEW) ---
export const subscribeToChatReadState = (userId: string, callback: (data: ChatReadState | null) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'chat_read_state', userId), (doc: any) => {
        callback(doc.exists() ? doc.data() as ChatReadState : null);
    });
};

export const saveChatReadState = async (userId: string, lastReadAt: Date) => {
    if (!db) return;
    const docRef = doc(db, 'chat_read_state', userId);
    await setDoc(docRef, {
        userId,
        lastReadAt,
        updatedAt: serverTimestamp()
    }, { merge: true });
};


// --- SWAPS ---
export const subscribeToSwaps = (callback: (reqs: any[]) => void) => {
    if (!db) return () => {};
    // FIX: Changed from listening to a single doc to the entire collection for proper querying.
    return onSnapshot(collection(db, 'swapRequests'), (snapshot: any) => {
        const requests = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        callback(requests);
    });
};

export const saveSwapRequest = async (req: any) => {
    if (!db) return;
    // FIX: Changed to use addDoc for creating a new document in the collection.
    await addDoc(collection(db, 'swapRequests'), req);
};

export const updateSwapRequests = async (requests: any[]) => {
    if (!db) return;
    // This function is now more granular. We update one doc at a time.
    // Assuming the calling context will handle the logic of which doc to update.
    // A better function would be:
    // export const updateSwapRequest = async (reqId, newData) => { ... }
    // For now, let's assume we get the full list and find the changed one.
    // This is inefficient but fits the old pattern.
    for (const req of requests) {
        if (req.id) {
            const docRef = doc(db, 'swapRequests', req.id);
            await setDoc(docRef, req, { merge: true });
        }
    }
};


// --- SALES ---
export const subscribeToSales = (callback: (sales: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'sales'), (doc: any) => {
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
    return onSnapshot(doc(db, 'data', 'inventory_history'), (doc: any) => {
        if (doc.exists()) callback(doc.data().reports || []);
    });
};

export const saveInventoryReport = async (report: any) => {
    if (!db) return;
    await updateDoc(doc(db, 'data', 'inventory_history'), { reports: arrayUnion(report) })
         .catch(() => setDoc(doc(db, 'data', 'inventory_history'), { reports: [report] }));
};

export const updateInventoryHistory = async (reports: any[]) => {
    if (!db) return;
    await setDoc(doc(db, 'data', 'inventory_history'), { reports });
};

// --- CONTENT (SOP/Training/Recipes) ---
export const subscribeToContent = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'config', 'content'), (doc: any) => {
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
    return onSnapshot(doc(db, 'data', 'inventory_logs'), (doc: any) => {
        if (doc.exists()) callback(doc.data().entries || []);
    });
};

export const saveInventoryLogs = async (logs: any[]) => {
    if (!db || logs.length === 0) return;
    await setDoc(doc(db, 'data', 'inventory_logs'), {
        entries: arrayUnion(...logs)
    }, { merge: true });
};

// --- STAFF AVAILABILITY (NEW) ---
export const getStaffAvailability = async (userId: string, weekStart: string) => {
    if (!db) return null;
    const docRef = doc(db, 'staff_availability', `${userId}_${weekStart}`);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? docSnap.data() : null;
};

export const saveStaffAvailability = async (userId: string, weekStart: string, slots: any) => {
    if (!db) return;
    const docRef = doc(db, 'staff_availability', `${userId}_${weekStart}`);
    await setDoc(docRef, {
        userId,
        weekStart,
        slots,
        updatedAt: serverTimestamp()
    }, { merge: true });
};

export const subscribeToAvailabilitiesForWeek = (weekStart: string, callback: (data: any[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, "staff_availability"), where("weekStart", "==", weekStart));
    return onSnapshot(q, (querySnapshot: any) => {
        const availabilities: any[] = [];
        querySnapshot.forEach((doc: any) => {
            availabilities.push(doc.data());
        });
        callback(availabilities);
    });
};

// --- SCHEDULE CONFIRMATION (NEW) ---
export const getScheduleConfirmation = async (employeeId: string, rangeStart: string, rangeEnd: string) => {
    if (!db) return null;
    try {
        const q = query(
            collection(db, 'scheduleConfirmations'),
            where('employeeId', '==', employeeId),
            where('rangeStart', '==', rangeStart),
            where('rangeEnd', '==', rangeEnd),
            where('status', '==', 'confirmed')
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            // FIX: Cast data() to any or DocumentData to avoid spread type error.
            const data = querySnapshot.docs[0].data() as any;
            return { id: querySnapshot.docs[0].id, ...data };
        }
        return null;
    } catch (e) {
        console.error("Error getting schedule confirmation:", e);
        return null;
    }
};

export const subscribeToScheduleConfirmations = (callback: (data: any[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, "scheduleConfirmations"));
    return onSnapshot(q, (snapshot: any) => {
        const confirmations = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        callback(confirmations);
    });
};

// FIX: Add missing saveRecipeConfirmation function to resolve error in App.tsx
export const saveRecipeConfirmation = async (employeeId: string, details: string) => {
    if (!db) return { success: false, error: 'DB not connected' };
    try {
        const collectionRef = collection(db, 'scheduleConfirmations');
        await addDoc(collectionRef, {
            employeeId,
            type: 'new_recipe',
            details,
            status: 'confirmed' as const,
            confirmedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
        });
        return { success: true };
    } catch (e) {
        console.error("Error saving recipe confirmation:", e);
        return { success: false, error: e };
    }
};

export const saveScheduleConfirmation = async (employeeId: string, rangeStart: string, rangeEnd: string) => {
    if (!db) return { success: false, error: 'DB not connected' };
    try {
        const q = query(
            collection(db, 'scheduleConfirmations'),
            where('employeeId', '==', employeeId),
            where('rangeStart', '==', rangeEnd)
        );
        const querySnapshot = await getDocs(q);

        const dataToSet = {
            status: 'confirmed' as const,
            confirmedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        if (!querySnapshot.empty) {
            const docRef = doc(db, 'scheduleConfirmations', querySnapshot.docs[0].id);
            await updateDoc(docRef, dataToSet);
        } else {
            const collectionRef = collection(db, 'scheduleConfirmations');
            await addDoc(collectionRef, {
                employeeId,
                rangeStart,
                rangeEnd,
                ...dataToSet,
                createdAt: serverTimestamp()
            });
        }
        return { success: true };
    } catch (e) {
        console.error("Error saving schedule confirmation:", e);
        return { success: false, error: e };
    }
};

// --- SCHEDULE CYCLES (NEW) ---
export const subscribeToScheduleCycles = (callback: (data: ScheduleCycle[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'schedule_cycles'), (doc: any) => {
        if (doc.exists()) {
            callback(doc.data().cycles || []);
        } else {
            callback([]);
        }
    });
};

export const updateScheduleCycles = async (cycles: ScheduleCycle[]) => {
    if (!db) return;
    const docRef = doc(db, 'data', 'schedule_cycles');
    await setDoc(docRef, { cycles });
};


// --- SMART INVENTORY (NEW) ---
export const subscribeToSmartInventoryReports = (callback: (data: SmartInventoryReport[]) => void) => {
    if (!db) return () => {};
    // Listen to the smart_inventory_reports collection
    return onSnapshot(collection(db, 'smart_inventory_reports'), (snapshot: any) => {
        const reports = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        callback(reports);
    });
};

export const saveSmartInventoryReport = async (report: SmartInventoryReport) => {
    if (!db) return;
    const docRef = doc(db, 'smart_inventory_reports', report.id);
    await setDoc(docRef, report);
};
