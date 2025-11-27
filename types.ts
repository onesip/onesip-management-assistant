

import React from 'react';

export type Lang = 'zh' | 'en';

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

export interface LogEntry {
  id: number;
  shift: string;
  time: string;
  status?: string;
  type?: 'clock-in' | 'clock-out' | 'checklist' | 'inventory' | 'training-complete';
  name?: string;
  reason?: string; 
  duration?: number;
  kpi?: string;
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
    category?: 'raw' | 'packaging' | 'dairy';
}

export interface InventoryReport {
    id: number;
    date: string;
    submittedBy: string;
    data: Record<string, { end: string, waste: string }>;
}

export interface ScheduleDay {
    date: string; // MM-DD
    name: string;
    zh: string;
    morning: string[]; // List of names
    evening: string[]; // List of names
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