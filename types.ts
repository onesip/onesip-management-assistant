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

export interface ScheduleDay {
    date: string;
    name: string;
    morning: string[];
    evening: string[];
    night?: string[];
    hours?: {
        morning?: { start: string; end: string };
        evening?: { start: string; end: string };
        night?: { start: string; end: string };
    };
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
    status: 'pending' | 'rejected' | 'accepted_by_peer' | 'approved' | 'cancelled';
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
    rangeStart: string;
    rangeEnd: string;
    status: 'confirmed';
    confirmedAt: any;
    updatedAt: any;
}