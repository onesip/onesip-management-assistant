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
import { 
    INITIAL_MENU_DATA, 
    INITIAL_ANNOUNCEMENT_DATA, 
    INITIAL_WIKI_DATA, 
    SOP_DATABASE, 
    TRAINING_LEVELS, 
    DRINK_RECIPES, 
    USERS,
    // 【新增】确保这些都在 constants.ts 里导出了
    INITIAL_SMART_INVENTORY, 
    INVENTORY_ITEMS,
    SMART_INVENTORY_MASTER_DATA 
} from '../constants';
import { ChatReadState, ScheduleCycle, User } from '../types';
import { SmartInventoryReport } from '../types';

// --- CONFIG ---
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

// ============================================================================
// 1. SEEDING (数据初始化) - 【融合了新旧逻辑】
// ============================================================================
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
        
        // Seed Content
        const contentRef = doc(db, 'config', 'content');
        const contentSnap = await getDoc(contentRef);
        if (!contentSnap.exists()) {
             await setDoc(contentRef, {
                 sops: SOP_DATABASE,
                 training: TRAINING_LEVELS,
                 recipes: DRINK_RECIPES
             });
        }

        // Seed Smart Inventory (Owner Warehouse)
        const smartInvRef = doc(db, 'data', 'smart_inventory');
        const smartInvSnap = await getDoc(smartInvRef);
        if (!smartInvSnap.exists()) {
            // 【更新】使用新的 MASTER DATA
            await setDoc(smartInvRef, { items: SMART_INVENTORY_MASTER_DATA || INITIAL_SMART_INVENTORY });
            console.log("Seeded Smart Inventory Data");
        }

        // 【新增】Seed Prep Inventory (前台补料)
        const prepInvRef = doc(db, 'data', 'inventory_list');
        const prepInvSnap = await getDoc(prepInvRef);
        if (!prepInvSnap.exists()) {
            await setDoc(prepInvRef, { items: INVENTORY_ITEMS });
            console.log("Seeded Prep Inventory Data");
        }
        
        // Seed Schedule
        const schedRef = doc(db, 'config', 'schedule');
        const schedSnap = await getDoc(schedRef);
        if (!schedSnap.exists()) {
             await setDoc(schedRef, { week: { title: 'Weekly Schedule', days: [] } });
        }

        // Seed Users
        const usersCollectionRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersCollectionRef);
        if (usersSnapshot.empty) {
            console.log("Seeding users to Firestore...");
            const userSeedPromises = USERS.map(user => {
                const userDocRef = doc(db, 'users', user.id);
                return setDoc(userDocRef, { ...user, active: true });
            });
            await Promise.all(userSeedPromises);
        }
        
    } catch (e) {
        console.error("Seeding Error", e);
    }
};

// ============================================================================
// 2. USERS / STAFF MANAGEMENT (原有)
// ============================================================================
export const subscribeToUsers = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(collection(db, 'users'), (snapshot: any) => {
        const users = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        callback(users);
    });
};

export const saveUser = async (user: User) => {
    if (!db) return;
    const userRef = doc(db, 'users', user.id);
    await setDoc(userRef, user, { merge: true });
};


// ============================================================================
// 3. INVENTORY (Prep & Smart) - 【升级版：支持新功能】
// ============================================================================

// --- SMART INVENTORY (WAREHOUSE) ---
export const subscribeToSmartInventory = (callback: (data: any) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'smart_inventory'), (doc: any) => {
        if (doc.exists()) callback(doc.data().items || []);
        else {
            // 自动填充默认值
            callback(SMART_INVENTORY_MASTER_DATA || []); 
        }
    });
};

export const saveSmartInventory = async (items: any[]) => {
    if (!db) return;
    await setDoc(doc(db, 'data', 'smart_inventory'), { items }, { merge: true });
};

// --- PREP INVENTORY (前台补料) ---
// 注意：为了区分旧的简单库存，新功能我们建议使用 'inventory_list' 文档，或者沿用 'inventory' 但结构变了
export const subscribeToInventory = (callback: (data: any) => void) => {
    if (!db) return () => {};
    // 我们尝试读取 'inventory_list' (新版)，如果想覆盖旧版也可以用 'inventory'
    // 这里为了不破坏旧数据，我用 'inventory_list'，你可以改成 'inventory'
    return onSnapshot(doc(db, 'data', 'inventory_list'), (doc: any) => {
        if (doc.exists()) {
            callback(doc.data().items || []);
        } else {
            // 如果云端为空，返回代码里的默认值 (INVENTORY_ITEMS)
            callback(INVENTORY_ITEMS || []);
        }
    });
};

export const saveInventoryList = async (items: any[]) => {
    if (!db) return;
    await setDoc(doc(db, 'data', 'inventory_list'), { items }, { merge: true });
};

// --- PREP INVENTORY HISTORY (新增) ---
export const subscribeToInventoryHistory = (callback: (reports: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'data', 'inventory_history'), (doc: any) => {
        if (doc.exists()) callback(doc.data().reports || []); // 注意字段名要对齐
    });
};

// 注意：之前代码用了 reports 字段，这里统一用 updateInventoryHistory
export const updateInventoryHistory = async (reports: any[]) => {
    if (!db) return;
    await setDoc(doc(db, 'data', 'inventory_history'), { reports });
};

// 为了兼容旧代码可能调用的 saveInventoryReport
export const saveInventoryReport = async (report: any) => {
    if (!db) return;
    await updateDoc(doc(db, 'data', 'inventory_history'), { reports: arrayUnion(report) })
         .catch(() => setDoc(doc(db, 'data', 'inventory_history'), { reports: [report] }));
};

// --- SMART INVENTORY REPORTS (周报 - 新增) ---
export const subscribeToSmartInventoryReports = (callback: (data: SmartInventoryReport[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(collection(db, 'smart_inventory_reports'), (snapshot: any) => {
        const reports = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        callback(reports);
    });
};

export const saveSmartInventoryReport = async (report: SmartInventoryReport) => {
    if (!db) return;
    await setDoc(doc(db, 'smart_inventory_reports', report.id), report);
};


// ============================================================================
// 4. SCHEDULE (排班 - 原有)
// ============================================================================
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

// Helper
const padDate = (str: string) => {
    const [m, d] = str.split('-');
    return `${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

export const ensureScheduleCoverage = async () => {
    if (!db) return;
    
    const schedRef = doc(db, 'config', 'schedule');
    const docSnap = await getDoc(schedRef);
    let existingDays = docSnap.exists() ? (docSnap.data().week?.days || []) : [];
    
    const existingDateSet = new Set(existingDays.map((d: any) => padDate(d.date)));
    const daysToAdd: any[] = [];
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0); 

    const loopDate = new Date(startOfCurrentMonth);

    while (loopDate <= endOfNextMonth) {
        const month = loopDate.getMonth() + 1;
        const day = loopDate.getDate();
        const dateStr = `${month}-${day}`;
        const paddedDateStr = padDate(dateStr);

        if (!existingDateSet.has(paddedDateStr)) {
            daysToAdd.push({
                date: dateStr,
                name: loopDate.toLocaleDateString('en-US', { weekday: 'long' }), 
                zh: '', 
                shifts: [
                    { id: 's1', name: 'Shift 1', start: '10:00', end: '15:00', staff: [] },
                    { id: 's2', name: 'Shift 2', start: '14:30', end: '19:00', staff: [] },
                    { id: 's3', name: 'Shift 3', start: '18:00', end: '22:00', staff: [] }
                ],
            });
        }
        loopDate.setDate(loopDate.getDate() + 1);
    }

    if (daysToAdd.length > 0) {
        console.log(`Auto-generating ${daysToAdd.length} schedule days.`);
        const newDays = [...existingDays, ...daysToAdd].sort((a: any, b: any) => {
            const dateA = new Date(`${now.getFullYear()}-${a.date}`);
            const dateB = new Date(`${now.getFullYear()}-${b.date}`);
            return dateA.getTime() - dateB.getTime();
        });
        await setDoc(schedRef, { week: { ...docSnap.data()?.week, days: newDays } }, { merge: true });
    }
};


// ============================================================================
// 5. LOGS (原有 + 更新)
// ============================================================================
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
        await setDoc(doc(db, 'data', 'logs'), { entries: [logEntry] });
    });
};

// 【新增】全量更新 Log (用于作废无效记录)
export const updateLogs = async (logs: any[]) => {
    if (!db) return;
    await setDoc(doc(db, 'data', 'logs'), { entries: logs });
};

// ============================================================================
// 6. CHAT & NOTICES (原有)
// ============================================================================
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
             await updateDoc(doc(db, 'data', 'chat'), { notices: arrayUnion(notices[0]) })
                .catch(async (err) => {
                    await setDoc(doc(db, 'data', 'chat'), { notices: notices }, { merge: true });
                });
        } else {
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

// --- CHAT READ STATE ---
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


// ============================================================================
// 7. SWAPS (原有)
// ============================================================================
export const subscribeToSwaps = (callback: (reqs: any[]) => void) => {
    if (!db) return () => {};
    return onSnapshot(collection(db, 'swapRequests'), (snapshot: any) => {
        const requests = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        callback(requests);
    });
};

export const saveSwapRequest = async (req: any) => {
    if (!db) return;
    await addDoc(collection(db, 'swapRequests'), req);
};

export const updateSwapRequests = async (requests: any[]) => {
    if (!db) return;
    for (const req of requests) {
        if (req.id) {
            const docRef = doc(db, 'swapRequests', req.id);
            await setDoc(docRef, req, { merge: true });
        }
    }
};


// ============================================================================
// 8. SALES (原有)
// ============================================================================
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


// ============================================================================
// 9. CONTENT (SOP/Training/Recipes) (原有)
// ============================================================================
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

// ============================================================================
// 10. INVENTORY LOGS (Refill Logs) (原有)
// ============================================================================
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

// ============================================================================
// 11. STAFF AVAILABILITY (原有)
// ============================================================================
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

// ============================================================================
// 12. SCHEDULE CONFIRMATION & CYCLES (原有)
// ============================================================================
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

// ============================================================================
// 13. CLOUD OBJECT EXPORT (关键：让 App.tsx 能调用 Cloud.xxx)
// ============================================================================
export const Cloud = {
    seedInitialData,
    
    // Users
    subscribeToUsers, 
    saveUser,
    
    // Inventory
    subscribeToInventory, 
    saveInventoryList, 
    subscribeToSmartInventory, 
    saveSmartInventory,
    subscribeToInventoryHistory, 
    updateInventoryHistory,
    subscribeToSmartInventoryReports, 
    saveSmartInventoryReport,
    
    // Logs
    subscribeToLogs, 
    saveLog, 
    updateLogs,
    
    // Chat & Notices
    subscribeToChat, 
    saveMessage, 
    updateNotices,
    subscribeToChatReadState,
    saveChatReadState,
    
    // Schedule
    subscribeToSchedule, 
    saveSchedule,
    subscribeToSwaps, 
    saveSwapRequest, 
    updateSwapRequests,
    ensureScheduleCoverage,
    
    // Sales
    subscribeToSales, 
    saveSalesRecord,
    
    // Content
    subscribeToContent, 
    saveContent,
    
    // Misc
    subscribeToScheduleCycles, 
    updateScheduleCycles,
    subscribeToScheduleConfirmations,
    getScheduleConfirmation,
    saveScheduleConfirmation,
    saveRecipeConfirmation,
    
    // Inventory Logs (Refill)
    subscribeToInventoryLogs,
    saveInventoryLogs
};