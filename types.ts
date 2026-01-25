import React from 'react';

export type Lang = 'zh' | 'en';

export type UserRole = 'boss' | 'manager' | 'staff' | 'maintenance' | 'editor';

export interface User {
    id: string;
    name: string;
    phone: string;
    role: UserRole;
    avatar?: string;
    password?: string;
    active?: boolean; // Is the user currently employed?
    acknowledgedNewRecipes?: string[]; // ADDED: Tracks acknowledged new recipes
}

export interface DirectMessage {
    id: string;
    fromId: string;
    toId: string;
    content: string;
    timestamp: string;
    read: boolean;
}

export interface Translation {
  zh: string;
  en: string;
}

export interface SopItem {
  id: string;
  category: string; 
  title: Translation;
  content: Translation; 
  tags: string[];
}

export interface TrainingLevel {
  id: number;
  title: Translation;
  subtitle: Translation;
  desc: Translation;
  youtubeLink?: string; // Added for video support
  imageUrls?: string[]; // Added for image gallery support
  content: { title: Translation; body: Translation }[]; 
  quiz: QuizItem[];
}

export interface QuizItem {
  id: string;
  type: 'choice' | 'photo_sim' | 'text' | 'sort';
  question: Translation;
  options?: string[];
  answer?: any;
}

export interface ChecklistItem {
  id: string;
  text: Translation;
  desc: Translation;
}

export interface ChecklistTemplate {
  title: Translation;
  subtitle: Translation;
  color: string;
  items: ChecklistItem[];
}

export interface DrinkRecipe {
  id: string;
  name: Translation;
  cat: string;
  size: string;
  ice: string;
  sugar: string;
  toppings: Translation;
  steps: {
    cold: Translation[];
    warm: Translation[];
  };
  coverImageUrl?: string;
  tutorialVideoUrl?: string;
  isNew?: boolean;
  basePreparation?: Translation; // Instructions for base ingredients
  isPublished?: boolean; // Controls visibility in the staff app
  createdAt?: string; // Timestamp for sorting
  sortOrder?: number;
  recipeType?: 'product' | 'premix'; // ADDED: New field for recipe type
}

// FIX: Create a shared type for clock-in/clock-out to prevent type mismatches.
export type ClockType = 'clock-in' | 'clock-out';

export interface LogEntry {
  id: number;
  shift: string;
  time: string;
  status?: string;
  type?: ClockType | 'checklist' | 'inventory' | 'training-complete' | 'attendance_deviation';
  name?: string; // Should match User.name
  userId?: string; // Link to User.id
  reason?: string; 
  duration?: number;
  kpi?: string;

  // Fields for attendance deviation
  deviationMinutes?: number;
  deviationDirection?: 'early' | 'late';
  deviationReason?: string;
  scheduledTime?: string;
  actualTime?: string;
  shiftType?: ClockType;

  // FIX: Add fields for log invalidation and manual edits to resolve type errors.
  isDeleted?: boolean;
  deleteReason?: string;
  deletedBy?: string;
  deletedAt?: string;
  isManual?: boolean;
  manualCreatedBy?: string;
  manualCreatedAt?: string;
  manualReason?: string;
  manualEditReason?: string;
  manualEditedBy?: string;
  manualEditedAt?: string;

  // FIX: Add fields for inventory logs to resolve type errors.
  items?: { name: string; unit: string; amount: number | string; itemId?: string; }[];
  note?: string;
  manualInventoryEdited?: boolean;
  manualInventoryEditedBy?: string;
  manualInventoryEditedAt?: string;
  manualInventoryEditReason?: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'model' | 'bot'; 
    text: string;
    isTyping?: boolean;
    component?: React.ReactNode;
}

export interface CustomerMenuItem {
    id: string;
    status: 'active' | 'new' | 'limited' | 'promotion' | 'inactive';
    nameCN: string;
    nameEN: string;
    price: number;
    type: 'milk' | 'fruit' | 'matcha' | 'coffee' | 'cake';
    subType: 'healthy' | 'classic' | 'rich' | 'plant' | 'sweet' | 'sour' | 'fruity';
    tags: string[];
    keywords: string;
    descCN: string;
    descEN: string;
    sugarGuideCN: string;
}

// --- ADDED MISSING TYPES ---

export interface ContactItem {
    id: string;
    name: string;
    role: Translation;
    phone: string | null;
}

export interface InventoryItem {
    id: string;
    name: Translation;
    unit: string;
    defaultVal: string;
    category: string;
}

export interface WikiItem {
    id: string;
    title: string;
    content: string;
    // Add other properties if needed
}

export interface AnnouncementData {
    enabled: boolean;
    titleCN: string;
    titleEN: string;
    date: string;
    mainPromoCN: string;
    mainPromoEN: string;
    subPromoCN: string;
    subPromoEN: string;
    includedCN: string;
    includedEN: string;
    itemsCN: string;
    itemsEN: string;
    rulesCN: string;
    rulesEN: string;
    disclaimerCN: string;
    disclaimerEN: string;
}

export interface WeeklySchedule {
    week: {
        title: string;
        days: ScheduleDay[];
    }
}

export interface ScheduleShift {
    id: string;
    name: string;
    start: string;
    end: string;
    staff: string[];
}

export interface ScheduleDay {
    date: string;
    name: string;
    // --- 旧字段（保留为可选，为了兼容历史数据不报错）---
    morning?: string[];
    evening?: string[];
    night?: string[];
    hours?: {
        morning?: { start: string; end: string };
        evening?: { start: string; end: string };
        night?: { start: string; end: string };
    };
    // --- 新字段：动态班次 ---
    shifts?: ScheduleShift[];
}

export interface ToppingSlot {
    col: number;
    top: Translation;
    bottom: Translation;
}

export interface SyrupSlot {
    id: number;
    name: Translation;
    isEmpty?: boolean;
}

export interface Notice {
    id: string;
    author: string;
    content: string;
    date: string;
    isUrgent: boolean;
    frequency: 'always' | 'daily' | '3days' | 'once';
    status: 'active' | 'cancelled';
    imageUrl?: string;
}

export interface InventoryReport {
    id: number;
    date: string;
    submittedBy: string;
    data: Record<string, { end: string; waste: string }>;
}

export interface SwapRequest {
    id: string;
    requesterId: string;
    requesterName: string;
    requesterDate: string;
    requesterShift: 'morning' | 'evening' | 'night';
    targetId: string;
    targetName: string;
    targetDate: string | null;
    targetShift: 'morning' | 'evening' | 'night' | null;
    // FIX: Add 'pending' and 'accepted_by_peer' to the status type to align with usage in App.tsx. This resolves multiple TypeScript errors.
    status: 'pending' | 'accepted_by_peer' | 'pending_target' | 'pending_manager' | 'completed' | 'rejected' | 'rejected_by_manager' | 'auto_conflict_declined' | 'cancelled';
    reason: string | null;
    timestamp: number;
    appliedToSchedule?: boolean;
    decidedAt?: number;
}

export interface SalesRecord {
    id: string;
    // Define properties based on usage if available
    [key: string]: any; 
}

export type StaffViewMode = 'home' | 'training' | 'recipes' | 'inventory' | 'chat' | 'team' | 'contact' | 'sop' | 'checklist' | 'availability' | 'swapRequests';

export interface InventoryLog {
    id: string;
    timestamp: string;
    operator: string;
    itemId: string;
    itemName: string;
    newStock: string;
    waste: string;
    actionType: string;
}

export interface StaffAvailability {
    userId: string;
    weekStart: string;
    slots: Record<string, { morning: boolean; evening: boolean }>;
    updatedAt?: any;
}

export interface ChatReadState {
    userId: string;
    lastReadAt: any;
    updatedAt: any;
}

export interface ScheduleConfirmation {
    id: string;
    employeeId: string;
    rangeStart?: string;
    rangeEnd?: string;
    status: 'confirmed';
    confirmedAt: any;
    updatedAt: any;
    type?: 'schedule' | 'new_recipe';
    details?: string;
}

export interface ScheduleCycle {
  cycleId: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  publishedAt: string; // ISO string
  status: 'draft' | 'published' | 'locked';
  confirmations: {
    [userId: string]: {
      status: 'pending' | 'confirmed' | 'needs_change';
      viewed: boolean;
    }
  };
  snapshot?: {
    [date: string]: { // MM-DD
      morning?: string[]; // user NAMEs
      evening?: string[]; // user NAMEs
      night?: string[]; // user NAMEs
    }
  };
}

// ==========================================
// 1. PREP SYSTEM TYPES (前台补料 / Manage Prep)
// ==========================================

export interface DailyTarget {
    morning: number;
    evening: number;
}

export interface WeeklyTargets {
    mon_thu: DailyTarget;
    fri: DailyTarget;
    sat: DailyTarget;
    sun: DailyTarget;
}

// 对应 constants.ts 中的 INVENTORY_ITEMS
// 注意：请确保你现有的 InventoryItem 定义包含了 dailyTargets 字段
// 如果没有，请修改上面的 InventoryItem 定义，或者使用这个扩展接口
export interface InventoryItem {
    id: string;
    name: Translation;
    unit: string;
    defaultVal: string;
    category: string;
    // 【新增】每日备料目标 (Prep 专用)
    dailyTargets?: WeeklyTargets;
}

// Prep 详细日志 (记录每次补料的详情)
export interface PrepLog {
    itemId: string;
    itemName: string; 
    preStock: number;   // 补货前 (Count)
    restockQty: number; // 补货量 (Add)
    postStock: number;  // 补货后 (Total)
    consumption: number;// 消耗量 (与上次对比)
    loss?: number;      // 损耗
    shift?: 'morning' | 'evening';
    targetSnapshot?: number; // 记录当时的目标值
    note?: string;
}

// Prep 提交报告
export interface PrepReport {
    id: string; // Timestamp ID
    date: string; // ISO Date
    weekStr: string; // e.g., "2023-W42"
    submittedBy: string;
    shift: 'morning' | 'evening';
    logs: PrepLog[];
}


// ==========================================
// 2. SMART WAREHOUSE TYPES (后台仓库 / Owner 专用)
// ==========================================

export type SupplierType = "I'tea" | 'Joybuy' | 'Open Mkt' | 'Other';

// 独立的仓库物品定义 (与 Prep 分开)
export interface SmartInventoryItem {
    id: string;
    category: string;      // e.g. Tea, Powder, Fresh
    name: string;          // 仓库物品名称通常是单语言
    position: string;      // e.g. A1, B3, In Fridge
    unit: string;
    supplier: SupplierType;
    deliveryTime?: string; // e.g. Every Thursday
    safetyStock: number;   // 安全库存线
    currentStock: number;  // 当前库存量
    lastUpdated?: string;
}

// ... (保留之前的 SmartInventoryItem 等定义)
// 【修改】Smart Warehouse 周报结构
export interface SmartInventoryReport {
    id: string;
    weekStr: string;
    dateRange: string;
    submittedBy: string;
    submittedAt: string;
    items: {
        id: string;
        name: string;
        category: string;
        supplier: string;
        unit: string;
        // --- 核心库存数据 ---
        count: number;        // 新增：实盘数 (还剩多少)
        added: number;        // 新增：进货数 (新增多少)
        currentStock: number; // 计算结果：现存多少 (Count + Add)
        // ------------------
        safetyStock: number;
        status: 'OK' | 'LOW';
    }[];
}
