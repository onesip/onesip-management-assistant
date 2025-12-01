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
    sugarGuideEN: string;
}

export interface WikiItem {
    id: string;
    nameCN: string;
    nameEN: string;
    descCN: string;
    descEN: string;
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

export interface InventoryItem {
    id: string;
    name: Translation;
    unit: string;
    threshold?: number;
    defaultVal?: string; // Added for Owner presets
    category?: 'raw' | 'packaging' | 'dairy';
}

export interface InventoryReport {
    id: number;
    date: string;
    submittedBy: string; // User Name
    userId?: string; // User ID
    data: Record<string, { end: string, waste: string }>;
}

export interface InventoryLog {
    id: string;
    timestamp: string;
    operator: string;
    itemId: string;
    itemName: string;
    oldStock?: string; // Optional if not tracked
    newStock: string;
    waste: string;
    diff?: string; // diff from old stock
    actionType: 'report' | 'adjust';
}

export interface ScheduleDay {
    date: string; // MM-DD
    name: string;
    zh: string;
    morning: string[]; // List of names
    evening: string[]; // List of names
    night?: string[]; // Optional third shift for weekends
    hours?: {
        morning: { start: string, end: string };
        evening: { start: string, end: string };
        night?: { start: string, end: string }; // Optional hours for third shift
    };
}

export interface WeeklySchedule {
    title: string;
    days: ScheduleDay[];
}

export interface Notice {
    id: string;
    author: string; 
    content: string;
    date: string;
    isUrgent: boolean;
    frequency?: 'always' | 'daily' | '3days' | 'once';
    status?: 'active' | 'cancelled'; // Added status
}

export interface SwapRequest {
    id: string;
    requesterName: string;
    requesterId: string;
    requesterDate: string; // Date of the shift being given away
    // FIX: Add 'night' to support night shift swaps.
    requesterShift: 'morning' | 'evening' | 'night';
    
    targetName: string; // The person being asked
    targetId: string;
    targetDate: string; // Date of the shift being taken (usually same if swapping on same day, or different)
    // FIX: Add 'night' to support night shift swaps.
    targetShift: 'morning' | 'evening' | 'night';

    status: 'pending' | 'accepted_by_peer' | 'rejected' | 'approved'; // approved means Manager finalized
    timestamp: number;
}

export interface SalesRecord {
    id: string;
    date: string;
    timeSlot: '15:00' | '19:00';
    amount: number;
    weatherTemp: number;
    weatherCode: number;
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

export interface ContactItem {
    id: string;
    name: string;
    role: Translation;
    phone: string | null;
    note?: string;
}

export interface StaffAvailability {
  userId: string;
  weekStart: string; // YYYY-MM-DD format for Monday
  slots: {
    [date: string]: { // YYYY-MM-DD
      morning?: boolean;
      evening?: boolean;
    }
  };
  updatedAt: any; // Firestore Timestamp
}

export interface ChatReadState {
  userId: string;
  lastReadAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
}

export type StaffViewMode = 'home' | 'team' | 'contact' | 'inventory' | 'recipes' | 'training' | 'sop' | 'chat' | 'checklist' | 'availability';