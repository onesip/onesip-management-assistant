
import React, { useState, useEffect, useRef } from 'react';
// FIX: Import 'Type' for defining a response schema for structured JSON output.
import { GoogleGenAI, Type } from "@google/genai";
import { Icon } from './components/Icons';
import { TRANSLATIONS, CHECKLIST_TEMPLATES, DRINK_RECIPES, TRAINING_LEVELS, SOP_DATABASE, CONTACTS_DATA, INVENTORY_ITEMS, USERS as STATIC_USERS, SMART_INVENTORY_MASTER_DATA } from './constants';
import { Lang, LogEntry, DrinkRecipe, TrainingLevel, InventoryItem, Notice, InventoryReport, SopItem, User, DirectMessage, SwapRequest, SalesRecord, StaffViewMode, ScheduleDay, InventoryLog, StaffAvailability, ChatReadState, UserRole, ClockType, ScheduleConfirmation, ScheduleCycle, SmartInventoryItem, SmartInventoryLog, SmartInventoryReport } from './types';
import * as Cloud from './services/cloud';
import { getChatResponse } from './services/geminiService';
import { useNotification } from './components/GlobalNotification';

// --- CONSTANTS ---
const STORE_COORDS = { lat: 51.9207886, lng: 4.4863897 };
const AI_BOT_ID = 'u_ai_assistant';
const SCHEDULE_DAYS_LENGTH = 60; // Increased to 60 days (approx 2 months)

// --- HELPERS ---
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  var R = 6371; 
  var dLat = deg2rad(lat2-lat1);
  var dLon = deg2rad(lon2-lon1); 
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c * 1000;
}

function deg2rad(deg: number) { return deg * (Math.PI/180); }

// FIX: Helper to normalize date keys (e.g., '12-5' vs '12-05') for reliable lookups.
const normalizeDateKey = (dateStr: string) => {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const parts = dateStr.split('-');
    if (parts.length === 2) {
        return `${parseInt(parts[0], 10)}-${parseInt(parts[1], 10)}`;
    }
    return dateStr;
};

function getYouTubeId(url: string | undefined) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// FIX: Correct logic for getting the Monday of the week.
const getStartOfWeek = (date: Date, weekOffset = 0) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    d.setDate(diff + (weekOffset * 7));
    d.setHours(0,0,0,0);
    return d;
}

// FIX: Helper to format date as YYYY-MM-DD using local time to prevent timezone shifts.
const formatDateISO = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// --- 新增：终极日期解析器 (支持 DD/MM/YYYY + 保留时间) ---
const safeParseDate = (dateStr: string | number): Date | null => {
    if (!dateStr) return null;
    if (typeof dateStr === 'number') return new Date(dateStr);
    
    // 如果是字符串，先尝试匹配我们系统生成的常见格式
    if (typeof dateStr === 'string') {
        const cleanStr = dateStr.trim();

        // 针对 "DD/MM/YYYY, HH:mm:ss" 或 "DD-MM-YYYY HH:mm" 的正则
        // 捕获组: 1=日, 2=月, 3=年, 4=时, 5=分, 6=秒(可选)
        const dmyPattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[,\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/;
        const match = cleanStr.match(dmyPattern);

        if (match) {
            const day = parseInt(match[1], 10);
            const month = parseInt(match[2], 10) - 1; // JS月份从0开始
            const year = parseInt(match[3], 10);
            const hour = match[4] ? parseInt(match[4], 10) : 0;
            const minute = match[5] ? parseInt(match[5], 10) : 0;
            const second = match[6] ? parseInt(match[6], 10) : 0;

            const date = new Date(year, month, day, hour, minute, second);
            if (!isNaN(date.getTime())) return date;
        }
    }

    // 如果正则没匹配上（比如是 ISO 格式 2026-01-01...），回退到标准解析
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
};

const formattedDate = (isoString: string | number) => {
    if (!isoString) return 'No Date';
    try {
        // 尝试构建日期对象
        const date = new Date(isoString);
        
        // 检查日期是否有效
        if (isNaN(date.getTime())) {
            // 如果解析失败，尝试直接返回原始字符串（可能本身就是人类可读的）
            // 或者如果它是 undefined/null，返回 '-'
            return String(isoString) || '-';
        }

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    } catch (e) {
        console.error("Date parsing error:", e, isoString);
        return String(isoString); // 发生异常时的回退显示
    }
}

// --- MODALS ---

const NewRecipeReminderModal = ({ isOpen, newRecipes, onAcknowledge, onCancel, lang }: { isOpen: boolean, newRecipes: DrinkRecipe[], onAcknowledge: () => void, onCancel: () => void, lang: Lang }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border flex flex-col max-h-[80vh]">
                <div className="flex items-start gap-4 mb-3 shrink-0">
                    <div className="w-10 h-10 bg-primary-light text-primary rounded-full flex items-center justify-center shrink-0 mt-1">
                        <Icon name="Gift" size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-text">你有新的菜谱需要学习</h3>
                        <p className="text-sm text-text-light">请查阅以下新增项目。</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar my-4 border-y py-4 -mx-6 px-6">
                    {newRecipes.map(recipe => (
                        <div key={recipe.id} className="bg-secondary p-3 rounded-lg text-sm text-text font-bold">
                            {recipe.name[lang] || recipe.name['zh']}
                        </div>
                    ))}
                </div>
                
                <div className="flex gap-3 shrink-0">
                    <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-gray-100 text-text-light font-bold hover:bg-gray-200 transition-all">稍后再看</button>
                    <button onClick={onAcknowledge} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark shadow-lg shadow-primary-light transition-all">确认学习</button>
                </div>
            </div>
        </div>
    );
};


const ActionReminderModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText, cancelText }: { isOpen: boolean, title: string, message: React.ReactNode, onConfirm: () => void, onCancel: () => void, confirmText: string, cancelText: string }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl transform scale-100 transition-all border border-gray-200">
                <div className="flex items-start gap-4 mb-3">
                    <div className="w-10 h-10 bg-primary-light text-primary rounded-full flex items-center justify-center shrink-0 mt-1">
                        <Icon name="Bell" size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-text">{title}</h3>
                    </div>
                </div>
                <div className="text-text-light text-sm mb-6 leading-relaxed ml-14">{message}</div>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-gray-100 text-text-light font-bold hover:bg-gray-200 transition-all">{cancelText}</button>
                    <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark shadow-lg shadow-primary-light transition-all">{confirmText}</button>
                </div>
            </div>
        </div>
    );
};

const EditInventoryLogModal = ({ isOpen, log, onClose, onSave, currentUser }: { isOpen: boolean, log: LogEntry | null, onClose: () => void, onSave: (log: LogEntry) => void, currentUser: User }) => {
    const [items, setItems] = useState<any[]>([]);
    const [note, setNote] = useState('');

    useEffect(() => {
        if (log) {
            // Deep copy to avoid mutating state directly
            setItems(JSON.parse(JSON.stringify(log.items || [])));
            // FIX: Removed @ts-ignore as properties are now defined in LogEntry type.
            setNote(log.manualInventoryEditReason || log.note || '');
        }
    }, [log]);

    if (!isOpen || !log) return null;

    const handleItemChange = (index: number, value: string) => {
        const newItems = [...items];
        const numValue = parseFloat(value);
        newItems[index] = { ...newItems[index], amount: isNaN(numValue) ? '' : numValue };
        setItems(newItems);
    };

    const handleSubmit = () => {
        const hasInvalidAmount = items.some(item => typeof item.amount !== 'number' && item.amount !== '');
        if (hasInvalidAmount) {
            alert('All item amounts must be valid numbers.');
            return;
        }

        const updatedLog: LogEntry = {
            ...log,
            items: items.map(item => ({...item, amount: item.amount === '' ? 0 : Number(item.amount)})),
            // FIX: Removed @ts-ignore as properties are now defined in LogEntry type.
            manualInventoryEdited: true,
            manualInventoryEditedBy: currentUser.name,
            manualInventoryEditedAt: new Date().toLocaleString(),
            manualInventoryEditReason: note,
        };
        onSave(updatedLog);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-dark-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in border border-white/10 text-dark-text max-h-[90vh] flex flex-col">
                <h3 className="text-lg font-black text-dark-accent mb-2">Edit Material Log</h3>
                <p className="text-xs text-dark-text-light mb-4">Log ID: {log.id}</p>
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 -mr-2 no-scrollbar">
                    {items.map((item, index) => (
                        <div key={index} className="bg-dark-bg p-3 rounded-lg flex items-center gap-3">
                            <div className="flex-1">
                                <p className="text-sm font-bold">{item.name}</p>
                                <p className="text-xs text-dark-text-light">{item.unit}</p>
                            </div>
                            <input
                                type="number"
                                value={item.amount}
                                onChange={(e) => handleItemChange(index, e.target.value)}
                                className="w-20 p-2 bg-dark-surface border border-white/10 rounded text-center font-bold"
                                placeholder="Qty"
                            />
                        </div>
                    ))}
                </div>

                <div className="mt-4">
                    <label className="text-xs font-bold text-dark-text-light mb-1 block">Reason / Note for Edit</label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full p-2 bg-dark-bg border border-white/10 rounded text-sm h-20"
                        placeholder="e.g., Corrected typo from initial report"
                    />
                </div>

                <div className="flex gap-3 mt-4">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 font-bold hover:bg-white/20">Cancel</button>
                    <button onClick={handleSubmit} className="flex-1 py-3 rounded-xl bg-dark-accent text-dark-bg font-bold shadow-lg hover:opacity-90">Save</button>
                </div>
            </div>
        </div>
    );
};

const InvalidateLogModal = ({ isOpen, log, onClose, onConfirm, currentUser }: { isOpen: boolean, log: LogEntry | null, onClose: () => void, onConfirm: (log: LogEntry, reason: string) => void, currentUser: User }) => {
    const [reason, setReason] = useState('');
    if (!isOpen || !log) return null;

    const handleSubmit = () => {
        if (!reason.trim()) {
            alert('Reason is required.');
            return;
        }
        const updatedLog: LogEntry = {
            ...log,
            isDeleted: true,
            deleteReason: reason,
            deletedBy: currentUser.name,
            deletedAt: new Date().toLocaleString()
        };
        onConfirm(updatedLog, reason);
        setReason('');
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-dark-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in border border-white/10 text-dark-text">
                <h3 className="text-lg font-black text-red-400 mb-2">Invalidate Log</h3>
                <p className="text-sm text-dark-text-light mb-4">Are you sure you want to invalidate this log entry? This action cannot be undone.</p>
                <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full p-2 bg-dark-bg border border-white/10 rounded text-sm h-24"
                    placeholder="Reason for invalidation..."
                    autoFocus
                />
                <div className="flex gap-3 mt-4">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 font-bold hover:bg-white/20">Cancel</button>
                    <button onClick={handleSubmit} disabled={!reason.trim()} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold shadow-lg hover:bg-red-600 disabled:bg-gray-500 disabled:cursor-not-allowed">Confirm Invalidation</button>
                </div>
            </div>
        </div>
    );
};

const AdjustHoursModal = ({ isOpen, logPair, onClose, onSave, currentUser }: { isOpen: boolean, logPair: { inLog: LogEntry, outLog: LogEntry } | null, onClose: () => void, onSave: (updatedInLog: LogEntry, updatedOutLog: LogEntry) => void, currentUser: User }) => {
    const [inTime, setInTime] = useState('');
    const [outTime, setOutTime] = useState('');
    const [reason, setReason] = useState('');

    useEffect(() => {
        if (logPair) {
            const inDate = new Date(logPair.inLog.time);
            const outDate = new Date(logPair.outLog.time);
            setInTime(`${inDate.getHours().toString().padStart(2, '0')}:${inDate.getMinutes().toString().padStart(2, '0')}`);
            setOutTime(`${outDate.getHours().toString().padStart(2, '0')}:${outDate.getMinutes().toString().padStart(2, '0')}`);
            setReason('');
        }
    }, [logPair]);

    if (!isOpen || !logPair) return null;

    const handleSave = () => {
        if (!reason.trim()) {
            alert('Reason is required.');
            return;
        }
        const originalInDate = new Date(logPair.inLog.time);
        const originalOutDate = new Date(logPair.outLog.time);
        
        const [inH, inM] = inTime.split(':').map(Number);
        originalInDate.setHours(inH, inM);

        const [outH, outM] = outTime.split(':').map(Number);
        originalOutDate.setHours(outH, outM);
        
        if (originalOutDate <= originalInDate) {
            alert('Clock-out time must be after clock-in time.');
            return;
        }

        const commonAuditFields = {
            manualEditReason: reason,
            manualEditedBy: currentUser.name,
            manualEditedAt: new Date().toLocaleString()
        };

        const updatedInLog = { ...logPair.inLog, time: originalInDate.toLocaleString(), ...commonAuditFields };
        const updatedOutLog = { ...logPair.outLog, time: originalOutDate.toLocaleString(), ...commonAuditFields };

        onSave(updatedInLog, updatedOutLog);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-dark-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in border border-white/10 text-dark-text">
                <h3 className="text-lg font-black text-dark-accent mb-4">Adjust Hours for {logPair.inLog.name}</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="text-xs font-bold text-dark-text-light mb-1 block">Clock In Time</label>
                        <input type="time" value={inTime} onChange={e => setInTime(e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-dark-text-light mb-1 block">Clock Out Time</label>
                        <input type="time" value={outTime} onChange={e => setOutTime(e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded" />
                    </div>
                </div>
                 <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full p-2 bg-dark-bg border border-white/10 rounded text-sm h-24"
                    placeholder="Reason for adjustment..."
                    autoFocus
                />
                <div className="flex gap-3 mt-4">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 font-bold hover:bg-white/20">Cancel</button>
                    <button onClick={handleSave} disabled={!reason.trim()} className="flex-1 py-3 rounded-xl bg-dark-accent text-dark-bg font-bold shadow-lg hover:opacity-90 disabled:bg-gray-500">Save</button>
                </div>
            </div>
        </div>
    );
};

const ManualAddModal = ({ isOpen, onClose, onSave, users, currentUser }: { isOpen: boolean, onClose: () => void, onSave: (inLog: LogEntry, outLog: LogEntry) => void, users: User[], currentUser: User }) => {
    const [staffId, setStaffId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [inTime, setInTime] = useState('10:00');
    const [outTime, setOutTime] = useState('15:00');
    const [reason, setReason] = useState('');

    if (!isOpen) return null;

    const handleSave = () => {
        if (!staffId || !date || !inTime || !outTime || !reason.trim()) {
            alert('All fields are required.');
            return;
        }
        const selectedUser = users.find(u => u.id === staffId);
        if (!selectedUser) {
            alert('Invalid user selected.');
            return;
        }

        const clockInDateTime = new Date(`${date}T${inTime}`);
        const clockOutDateTime = new Date(`${date}T${outTime}`);

        if (clockOutDateTime <= clockInDateTime) {
            alert('Clock-out time must be after clock-in time.');
            return;
        }
        if (new Date(date) > new Date()) {
            alert('Date cannot be in the future.');
            return;
        }

        const commonFields = {
            name: selectedUser.name,
            userId: selectedUser.id,
            isManual: true,
            manualCreatedBy: currentUser.name,
            manualCreatedAt: new Date().toLocaleString(),
            manualReason: reason,
        };

        const inLog: LogEntry = {
            ...commonFields,
            id: Date.now(),
            shift: 'clock-in',
            type: 'clock-in',
            time: clockInDateTime.toLocaleString(),
        };

        const outLog: LogEntry = {
            ...commonFields,
            id: Date.now() + 1,
            shift: 'clock-out',
            type: 'clock-out',
            time: clockOutDateTime.toLocaleString(),
        };
        
        onSave(inLog, outLog);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-dark-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in border border-white/10 text-dark-text">
                <h3 className="text-lg font-black text-dark-accent mb-4">Add Manual Attendance</h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-dark-text-light mb-1 block">Staff</label>
                        <select value={staffId} onChange={e => setStaffId(e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded">
                            <option value="">Select Staff...</option>
                            {users.filter(u => u.active !== false).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-dark-text-light mb-1 block">Date</label>
                        <input type="date" value={date} max={new Date().toISOString().split('T')[0]} onChange={e => setDate(e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded" />
                    </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-dark-text-light mb-1 block">Clock In</label><input type="time" value={inTime} onChange={e => setInTime(e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded" /></div>
                        <div><label className="text-xs font-bold text-dark-text-light mb-1 block">Clock Out</label><input type="time" value={outTime} onChange={e => setOutTime(e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded" /></div>
                    </div>
                    <textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded text-sm h-24" placeholder="Reason for manual entry..." />
                </div>
                <div className="flex gap-3 mt-4">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 font-bold hover:bg-white/20">Cancel</button>
                    <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-dark-accent text-dark-bg font-bold shadow-lg hover:opacity-90">Save Record</button>
                </div>
            </div>
        </div>
    );
};

const DeviationReasonModal = ({ isOpen, onClose, onSubmit, details, t }: any) => {
    const [reason, setReason] = useState('');
    const isSubmitDisabled = reason.trim() === '';

    useEffect(() => {
        if (isOpen) {
            setReason(''); // Reset reason when modal opens
        }
    }, [isOpen]);

    if (!isOpen || !details) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border">
                <h3 className="text-lg font-black text-text mb-1">{t.deviation_title}</h3>
                <p className="text-sm text-text-light mb-4">{t.deviation_subtitle}</p>
                <div className="text-sm text-text-light mb-4 space-y-1 bg-secondary p-3 rounded-lg border">
                    <p><strong>Scheduled:</strong> {details.scheduledTime}</p>
                    <p><strong>Actual:</strong> {details.actualTime}</p>
                    <p className="font-bold"><strong>Deviation:</strong> {details.deviationMinutes} minutes ({details.direction})</p>
                </div>
                <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full p-2 border rounded-lg h-24 text-sm focus:ring-2 focus:ring-primary-light outline-none"
                    placeholder={t.deviation_placeholder}
                    autoFocus
                />
                <div className="flex gap-3 mt-4">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-text-light font-bold hover:bg-gray-200">Cancel</button>
                    <button 
                        onClick={() => onSubmit(reason)} 
                        disabled={isSubmitDisabled}
                        className={`flex-1 py-3 rounded-xl font-bold transition-all ${isSubmitDisabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-primary-dark'}`}
                    >
                        {t.deviation_confirm}
                    </button>
                </div>
            </div>
        </div>
    );
};

const CloudSetupModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center animate-fade-in">
                <div className="w-12 h-12 bg-primary-light text-primary rounded-full flex items-center justify-center mx-auto mb-4"><Icon name="Globe" size={24} /></div>
                <h3 className="font-black text-xl text-text mb-2">Cloud Sync Offline</h3>
                <p className="text-text-light text-sm mb-6">Running in local mode. Data will not be saved to the server.</p>
                <button onClick={onClose} className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3 rounded-xl transition-all">Continue Offline</button>
            </div>
        </div>
    );
};

const CustomConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }: { isOpen: boolean, title: string, message: React.ReactNode, onConfirm: () => void, onCancel: () => void }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl transform scale-100 transition-all border border-gray-200">
                <h3 className="text-lg font-black text-text mb-3">{title}</h3>
                <div className="text-text-light text-sm mb-6 leading-relaxed">{message}</div>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-gray-100 text-text-light font-bold hover:bg-gray-200 transition-all">Cancel</button>
                    <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark shadow-lg shadow-primary-light transition-all">Confirm</button>
                </div>
            </div>
        </div>
    );
};

const AdminLoginModal = ({ isOpen, onClose, onLogin }: { isOpen: boolean, onClose: () => void, onLogin: (role: 'manager' | 'owner' | 'editor') => void }) => {
    const [pin, setPin] = useState('');
    if (!isOpen) return null;
    const handleEnter = () => {
        if (pin === '0707') onLogin('manager');
        else if (pin === '250715') onLogin('owner');
        else if (pin === '0413') onLogin('editor'); 
        else alert('Access Denied');
        setPin('');
    };
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-surface rounded-3xl p-6 w-full max-w-xs shadow-2xl animate-pop-in">
                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-text text-surface rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="Lock" size={24}/></div>
                    <h3 className="font-black text-xl text-text">Admin Access</h3>
                </div>
                <input type="password" value={pin} onChange={e => setPin(e.target.value)} className="w-full text-center text-2xl tracking-[0.5em] p-4 bg-secondary rounded-xl mb-4 font-black" placeholder="••••" autoFocus maxLength={6} />
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={onClose} className="p-3 rounded-xl bg-gray-200 text-text-light font-bold transition-all hover:bg-gray-300">Cancel</button>
                    <button onClick={handleEnter} className="p-3 rounded-xl bg-text text-surface font-bold transition-all hover:bg-black">Enter</button>
                </div>
            </div>
        </div>
    );
};

const ScheduleEditorModal = ({ isOpen, day, onClose, onSave, teamMembers }: any) => {
    // 初始化班次数据：如果有新结构用新结构，否则尝试从旧结构迁移
    const [shifts, setShifts] = useState<any[]>([]);

    useEffect(() => {
        if (day) {
            if (day.shifts && day.shifts.length > 0) {
                setShifts(JSON.parse(JSON.stringify(day.shifts)));
            } else {
                // 兼容旧数据：把 morning/evening/night 转换为 list
                const migratedShifts = [];
                if (day.morning) migratedShifts.push({ id: 's1', name: 'Shift 1', start: day.hours?.morning?.start || '10:00', end: day.hours?.morning?.end || '15:00', staff: day.morning });
                if (day.evening) migratedShifts.push({ id: 's2', name: 'Shift 2', start: day.hours?.evening?.start || '14:30', end: day.hours?.evening?.end || '19:00', staff: day.evening });
                if (day.night) migratedShifts.push({ id: 's3', name: 'Shift 3', start: day.hours?.night?.start || '18:00', end: day.hours?.night?.end || '22:00', staff: day.night });
                
                // 如果是全新的一天，没有任何数据，默认加一个空班次
                if (migratedShifts.length === 0) {
                    migratedShifts.push({ id: `s_${Date.now()}`, name: 'Shift 1', start: '10:00', end: '15:00', staff: [] });
                }
                setShifts(migratedShifts);
            }
        }
    }, [day]);

    if (!isOpen) return null;

    const handleAddShift = () => {
        const newId = `s_${Date.now()}`;
        const nextNum = shifts.length + 1;
        setShifts([...shifts, { id: newId, name: `Shift ${nextNum}`, start: '12:00', end: '16:00', staff: [] }]);
    };

    const handleRemoveShift = (idx: number) => {
        if (window.confirm("Delete this shift slot?")) {
            const newShifts = [...shifts];
            newShifts.splice(idx, 1);
            // 重命名以保持顺序
            newShifts.forEach((s, i) => s.name = `Shift ${i + 1}`);
            setShifts(newShifts);
        }
    };

    const toggleStaff = (shiftIndex: number, staffName: string) => {
        const newShifts = [...shifts];
        const currentStaff = newShifts[shiftIndex].staff;
        if (currentStaff.includes(staffName)) {
            newShifts[shiftIndex].staff = currentStaff.filter((n: string) => n !== staffName);
        } else {
            newShifts[shiftIndex].staff = [...currentStaff, staffName];
        }
        setShifts(newShifts);
    };

    const updateTime = (index: number, field: 'start' | 'end', value: string) => {
        const newShifts = [...shifts];
        newShifts[index][field] = value;
        setShifts(newShifts);
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-surface rounded-2xl p-6 w-full max-w-md shadow-2xl animate-pop-in max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="text-lg font-black text-text">{day.name} ({day.date})</h3>
                    <button onClick={onClose}><Icon name="X" /></button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                    {shifts.map((shift, idx) => (
                        <div key={shift.id} className="bg-secondary p-3 rounded-xl border border-gray-200 relative">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-bold text-primary text-sm uppercase">班次 {idx + 1}</span>
                                <button onClick={() => handleRemoveShift(idx)} className="text-red-400 hover:text-red-600"><Icon name="Trash" size={14} /></button>
                            </div>
                            
                            <div className="flex gap-2 items-center mb-3">
                                <input type="time" value={shift.start} onChange={e => updateTime(idx, 'start', e.target.value)} className="bg-surface border rounded p-1.5 text-sm font-bold flex-1 text-center" />
                                <span className="text-gray-400">-</span>
                                <input type="time" value={shift.end} onChange={e => updateTime(idx, 'end', e.target.value)} className="bg-surface border rounded p-1.5 text-sm font-bold flex-1 text-center" />
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {teamMembers.map((member: User) => (
                                    <button 
                                        key={member.id} 
                                        onClick={() => toggleStaff(idx, member.name)}
                                        className={`p-1.5 rounded-lg text-[10px] font-bold transition-all truncate ${shift.staff.includes(member.name) ? 'bg-primary text-white shadow-md' : 'bg-surface text-text-light hover:bg-gray-200'}`}
                                    >
                                        {member.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    
                    <button onClick={handleAddShift} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-bold hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2">
                        <Icon name="Plus" size={18} /> 添加班次 (Add Shift)
                    </button>
                </div>

                <div className="mt-4 pt-4 border-t shrink-0">
                    <button 
                        onClick={() => onSave(shifts)} 
                        className="w-full bg-primary text-white py-3 rounded-xl font-bold shadow-lg hover:bg-primary-dark transition-all"
                    >
                        Save All Shifts
                    </button>
                </div>
            </div>
        </div>
    );
};

const AvailabilityReminderModal = ({ isOpen, onConfirm, onCancel, t }: { isOpen: boolean, onConfirm: () => void, onCancel: () => void, t: any }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border">
                <h3 className="text-lg font-black text-text mb-2">{t.availability_reminder_title}</h3>
                <p className="text-sm text-text-light mb-6">{t.availability_reminder_body}</p>
                <div className="flex gap-3">
                    <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-gray-100 text-text-light font-bold hover:bg-gray-200">{t.later}</button>
                    <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark">{t.fill_now}</button>
                </div>
            </div>
        </div>
    );
};

const AvailabilityModal = ({ isOpen, onClose, t, currentUser }: { isOpen: boolean, onClose: () => void, t: any, currentUser: User }) => {
    const [slots, setSlots] = useState<StaffAvailability['slots']>({});
    const [isLoading, setIsLoading] = useState(true);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const days = Array.from({ length: SCHEDULE_DAYS_LENGTH }).map((_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        return d;
    });

    const weekStartKeys = Array.from(new Set(days.map(day => formatDateISO(getStartOfWeek(day, 0)))));

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            const fetchPromises = weekStartKeys.map(key =>
                Cloud.getStaffAvailability(currentUser.id, key)
            );

            Promise.all(fetchPromises).then(results => {
                const mergedSlots = results.reduce((acc: any, data: any) => {
                    return { ...acc, ...(data?.slots || {}) };
                }, {});
                setSlots(mergedSlots as StaffAvailability['slots']);
                setIsLoading(false);
            });
        }
    }, [isOpen, currentUser.id, ...weekStartKeys]);

    const handleToggle = (dateISO: string, shift: 'morning' | 'evening') => {
        setSlots(prev => ({
            ...prev,
            [dateISO]: {
                ...prev[dateISO],
                [shift]: !(prev[dateISO]?.[shift])
            }
        }));
    };

    const handleSave = async () => {
        const existingDataPromises = weekStartKeys.map(key => Cloud.getStaffAvailability(currentUser.id, key));
        const existingResults = await Promise.all(existingDataPromises) as any[];

        const finalSlotsByWeek: { [key: string]: StaffAvailability['slots'] } = {};
        weekStartKeys.forEach((key, index) => {
            finalSlotsByWeek[key] = existingResults[index]?.slots || {};
        });

        for (const day of days) {
            const dateISO = formatDateISO(day);
            const weekKey = formatDateISO(getStartOfWeek(day, 0));
            const dayState = slots[dateISO];
            
            finalSlotsByWeek[weekKey][dateISO] = {
                morning: !!dayState?.morning,
                evening: !!dayState?.evening,
            };
        }
    
        const savePromises = Object.entries(finalSlotsByWeek).map(([key, weekSlots]) =>
            Cloud.saveStaffAvailability(currentUser.id, key, weekSlots)
        );

        await Promise.all(savePromises);
        
        alert(t.availability_saved);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex flex-col bg-surface animate-fade-in-up">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-surface z-10">
                <h2 className="text-xl font-black">{t.next_week_availability}</h2>
                <button onClick={onClose}><Icon name="X" /></button>
            </div>
            {isLoading ? <div className="text-center p-10">Loading...</div> : (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {days.map(day => {
                        const dateISO = formatDateISO(day);
                        return (
                            <div key={dateISO} className="bg-secondary p-4 rounded-xl">
                                <h3 className="font-bold mb-2">{dateISO} ({day.toLocaleDateString(t.locale, { weekday: 'short' })})</h3>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!slots[dateISO]?.morning} onChange={() => handleToggle(dateISO, 'morning')} className="w-5 h-5 rounded text-primary focus:ring-primary" /> Morning</label>
                                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!slots[dateISO]?.evening} onChange={() => handleToggle(dateISO, 'evening')} className="w-5 h-5 rounded text-primary focus:ring-primary" /> Evening</label>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            <div className="p-4 border-t sticky bottom-0 bg-surface">
                <button onClick={handleSave} className="w-full bg-primary text-white py-3 rounded-xl font-bold">{t.save}</button>
            </div>
        </div>
    );
};

// --- SCREENS & VIEWS ---

const SwapRequestModal = ({
    isOpen,
    onClose,
    onSubmit,
    currentSwap,
    currentUser,
    allUsers,
    targetEmployeeId,
    setTargetEmployeeId,
    reason,
    setReason
}: {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: () => void;
    currentSwap: { date: string; shift: string } | null;
    currentUser: User;
    allUsers: User[];
    targetEmployeeId: string;
    setTargetEmployeeId: (id: string) => void;
    reason: string;
    setReason: (reason: string) => void;
}) => {
    if (!isOpen || !currentSwap) return null;

    const colleagues = allUsers.filter(u => u.id !== currentUser.id && u.active !== false);

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border">
                <h3 className="text-lg font-black text-text mb-2">Request Shift Swap</h3>
                <p className="text-sm text-text-light mb-4">You are requesting to swap your shift on:</p>
                
                <div className="bg-secondary p-3 rounded-lg border text-center mb-4">
                    <p className="font-bold text-primary">{currentSwap.date} ({currentSwap.shift})</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-text-light mb-1 block">Swap with colleague:</label>
                        <select 
                            value={targetEmployeeId} 
                            onChange={e => setTargetEmployeeId(e.target.value)}
                            className="w-full p-3 bg-secondary border rounded-lg text-sm focus:ring-2 focus:ring-primary-light outline-none"
                        >
                            <option value="">Select a colleague...</option>
                            {colleagues.map(user => (
                                <option key={user.id} value={user.id}>{user.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-text-light mb-1 block">Reason (Optional):</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full p-2 border rounded-lg h-20 text-sm focus:ring-2 focus:ring-primary-light outline-none bg-secondary"
                            placeholder="e.g., Personal appointment"
                        />
                    </div>
                </div>

                <div className="flex gap-3 mt-6">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-gray-100 text-text-light font-bold hover:bg-gray-200">Cancel</button>
                    <button 
                        onClick={onSubmit} 
                        disabled={!targetEmployeeId}
                        className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-dark disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        Send Request
                    </button>
                </div>
            </div>
        </div>
    );
};

const LoginScreen = ({ users, onLogin, t, lang, setLang }: any) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [rememberPassword, setRememberPassword] = useState(false);
    const [keepLoggedIn, setKeepLoggedIn] = useState(true);

    useEffect(() => {
        const rememberedPassword = localStorage.getItem('onesip_remembered_password');
        if (rememberedPassword) {
            setPassword(rememberedPassword);
            setRememberPassword(true);
        }
    }, []);

    const handleLogin = () => {
        if (!password) {
            setError(t.enter_code);
            return;
        }
        const user = users.find((u: User) => u.password === password);

        if (user) {
            onLogin(user, keepLoggedIn);
            if (rememberPassword) {
                localStorage.setItem('onesip_remembered_password', password);
            } else {
                localStorage.removeItem('onesip_remembered_password');
            }
        } else {
            setError(t.invalid_code);
        }
    };

    return (
        <div className="min-h-screen bg-secondary flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-black text-primary tracking-tight">ONESIP</h1>
                    <p className="text-text-light">{t.login_title}</p>
                </div>
                <div className="bg-surface rounded-2xl shadow-lg p-8 space-y-6">
                    {error && <p className="text-destructive text-sm text-center font-bold">{error}</p>}
                    <div>
                        <label className="text-sm font-bold text-text-light mb-2 block">{t.enter_code}</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                            className="w-full p-4 border rounded-lg bg-secondary text-center text-xl tracking-widest font-mono"
                            placeholder="••••••"
                            autoFocus
                        />
                    </div>
                    <div className="flex justify-between items-center text-sm">
                        <label className="flex items-center gap-2 text-text-light cursor-pointer">
                            <input
                                type="checkbox"
                                checked={rememberPassword}
                                onChange={(e) => setRememberPassword(e.target.checked)}
                                className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300"
                            />
                            {t.remember_password}
                        </label>
                        <label className="flex items-center gap-2 text-text-light cursor-pointer">
                            <input
                                type="checkbox"
                                checked={keepLoggedIn}
                                onChange={(e) => setKeepLoggedIn(e.target.checked)}
                                className="w-4 h-4 rounded text-primary focus:ring-primary border-gray-300"
                            />
                            {t.keep_logged_in}
                        </label>
                    </div>
                    <button
                        onClick={handleLogin}
                        className="w-full bg-primary text-white font-bold py-4 rounded-xl shadow-lg shadow-primary-light hover:bg-primary-dark transition-all active:scale-95"
                    >
                        {t.login_btn}
                    </button>
                </div>
                <div className="text-center mt-6">
                     <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="bg-gray-200 text-text-light text-xs font-bold px-4 py-2 rounded-full border"> {lang === 'zh' ? 'Switch to English' : '切换到中文'} </button>
                </div>
            </div>
        </div>
    );
};

const InventoryView = ({ lang, t, inventoryList, setInventoryList, isOwner, onSubmit, currentUser, isForced, onCancel }: any) => {
    // Staff state
    const [employee, setEmployee] = useState(currentUser?.name || '');
    const [inputData, setInputData] = useState<Record<string, { end: string, waste: string }>>(() => {
        const initialState: Record<string, { end: string, waste: string }> = {};
        if (inventoryList && !isOwner) {
            inventoryList.forEach((item: InventoryItem) => {
                initialState[item.id] = {
                    end: item.defaultVal || '',
                    waste: '',
                };
            });
        }
        return initialState;
    });
    
    // Owner state for editing
    const [localInventory, setLocalInventory] = useState<InventoryItem[]>([]);
    const [newItemName, setNewItemName] = useState({ zh: '', en: '' });

    useEffect(() => {
        if (isOwner) setLocalInventory(JSON.parse(JSON.stringify(inventoryList)));
    }, [inventoryList, isOwner]);

    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';

    // Staff handler
    const handleInputChange = (id: string, field: 'end' | 'waste', value: string) => { setInputData(prev => ({ ...prev, [id]: { ...(prev[id] || {end:'', waste:''}), [field]: value } })); };

    // Owner handlers
    const handleAddItem = () => {
        if(!newItemName.zh || !newItemName.en) return;
        const newItem: InventoryItem = { id: `inv_${Date.now()}`, name: newItemName, unit: 'unit', defaultVal: '', category: 'other' };
        const updatedList = [...localInventory, newItem];
        setLocalInventory(updatedList);
        Cloud.saveInventoryList(updatedList);
        setNewItemName({ zh: '', en: '' });
    };
    
    const handleOwnerItemChange = (id: string, field: string, value: string, lang?: 'en' | 'zh') => {
        setLocalInventory(prev => prev.map(item => {
            if (item.id === id) {
                if (field === 'name' && lang) {
                    return { ...item, name: { ...item.name, [lang]: value } };
                }
                return { ...item, [field]: value };
            }
            return item;
        }));
    };

    const handleDeleteItem = (id: string) => {
        if (window.confirm("Confirm to delete this inventory item? Historical records will not be affected.")) {
            const updatedList = localInventory.filter(item => item.id !== id);
            setLocalInventory(updatedList);
        }
    };

    const handleSavePresets = async () => {
        await Cloud.saveInventoryList(localInventory);
        alert('Preset values saved!');
    };

    if (isOwner) {
        return (
            <div className="flex flex-col h-full bg-dark-surface text-dark-text">
                <div className="p-4 bg-dark-bg shadow-md sticky top-0 z-10 space-y-3">
                    <h2 className="text-xl font-black text-dark-accent">{t.manage_presets}</h2>
                     <div className="flex gap-2">
                        <input placeholder="New Item Name (ZH)" className="flex-1 p-2 bg-dark-surface border border-white/10 rounded text-xs" value={newItemName.zh} onChange={e=>setNewItemName({...newItemName, zh: e.target.value})} />
                        <input placeholder="New Item Name (EN)" className="flex-1 p-2 bg-dark-surface border border-white/10 rounded text-xs" value={newItemName.en} onChange={e=>setNewItemName({...newItemName, en: e.target.value})} />
                        <button onClick={handleAddItem} className="bg-dark-accent text-dark-bg p-2 rounded font-bold"><Icon name="Plus" size={16}/></button>
                    </div>
                </div>
                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                    {localInventory.map((item: InventoryItem) => (
                        <div key={item.id} className="bg-dark-bg p-3 rounded-xl border border-white/10 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <input type="text" placeholder="Name (EN)" value={item.name.en || ''} onChange={(e) => handleOwnerItemChange(item.id, 'name', e.target.value, 'en')} className="w-full p-2 rounded-lg border border-white/20 bg-dark-surface text-sm" />
                                <input type="text" placeholder="Name (ZH)" value={item.name.zh || ''} onChange={(e) => handleOwnerItemChange(item.id, 'name', e.target.value, 'zh')} className="w-full p-2 rounded-lg border border-white/20 bg-dark-surface text-sm" />
                            </div>
                            <div className="grid grid-cols-3 gap-2 items-center">
                                <input type="text" placeholder="Unit" value={item.unit || ''} onChange={(e) => handleOwnerItemChange(item.id, 'unit', e.target.value)} className="col-span-1 w-full p-2 rounded-lg border border-white/20 bg-dark-surface text-center text-sm" />
                                <input type="text" placeholder="Preset Value" value={item.defaultVal || ''} onChange={(e) => handleOwnerItemChange(item.id, 'defaultVal', e.target.value)} className="col-span-1 w-full p-2 rounded-lg border border-white/20 bg-dark-surface text-center text-sm" />
                                <button onClick={() => handleDeleteItem(item.id)} className="col-span-1 bg-red-500/20 text-red-400 p-2 rounded-lg h-full flex items-center justify-center hover:bg-red-500/30 transition-colors">
                                    <Icon name="Trash" size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 bg-dark-bg border-t border-white/10 sticky bottom-0 z-10">
                    <button onClick={handleSavePresets} className="w-full bg-dark-accent text-dark-bg py-3 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2">
                        <Icon name="Save" size={20} /> Save Presets
                    </button>
                </div>
            </div>
        );
    }

    // Staff view
    return (
        <div className="flex flex-col h-full bg-secondary pb-20 animate-fade-in-up text-text">
            <div className="bg-surface p-4 border-b sticky top-0 z-10 space-y-3 shadow-sm">
                 <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black">{t.inventory_title}</h2>
                    {isForced && (
                        <button onClick={onCancel} className="bg-destructive-light text-destructive px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-200 transition-all">
                            {t.cancel}
                        </button>
                    )}
                </div>
                 {isForced && <p className="text-xs text-destructive font-bold animate-pulse">{t.complete_inventory_to_clock_out}</p>}
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
                {inventoryList.map((item: any) => (
                    <div key={item.id} className="bg-surface p-3 rounded-xl border shadow-sm flex items-center justify-between">
                        <div className="flex-1"><div className="font-bold text-sm text-text">{getLoc(item.name)}</div><div className="text-[10px] text-text-light">{item.unit}</div></div>
                        <div className="flex gap-2 w-2/5">
                            <input 
                                type="number" 
                                placeholder={item.defaultVal || 'End'} 
                                className="w-1/2 p-2 rounded-lg border text-center text-sm" 
                                value={inputData[item.id]?.end ?? ''}
                                onChange={(e) => handleInputChange(item.id, 'end', e.target.value)} 
                            />
                            <input 
                                type="number" 
                                placeholder="Waste" 
                                className="w-1/2 p-2 rounded-lg border border-red-100 text-center text-sm bg-destructive-light text-destructive" 
                                value={inputData[item.id]?.waste ?? ''}
                                onChange={(e) => handleInputChange(item.id, 'waste', e.target.value)} 
                            />
                        </div>
                    </div>
                ))}
            </div>
            <div className="p-4 bg-surface border-t sticky bottom-20 z-10"><button onClick={() => { if(!employee) return alert(t.select_employee); onSubmit({ submittedBy: employee, userId: currentUser?.id, data: inputData }); alert(t.save_success); }} className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 hover:bg-primary-dark"><Icon name="Save" size={20} />{t.save_report}</button></div>
        </div>
    );
};

const ChatView = ({ t, currentUser, messages, setMessages, notices, onExit, isManager, sopList, trainingLevels, allUsers }: any) => {
    const [activeChannel, setActiveChannel] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    
    // 确保公告相关的 State 定义完整
    const [broadcastText, setBroadcastText] = useState('');
    const [broadcastImageUrl, setBroadcastImageUrl] = useState('');
    const [broadcastFreq, setBroadcastFreq] = useState<'always' | 'daily' | '3days' | 'once'>('always');
    
    const [isAiTyping, setIsAiTyping] = useState(false);
    const messagesEndRef = useRef<null | HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, activeChannel, isAiTyping]);

    const handleSend = async () => {
        if (!inputText.trim() || !activeChannel) return;
        
        const text = inputText;
        setInputText('');

        const msg: DirectMessage = { 
            id: Date.now().toString(), 
            fromId: currentUser.id, 
            toId: activeChannel, 
            content: text, 
            timestamp: new Date().toISOString(), 
            read: false 
        };
        
        setMessages((prev: DirectMessage[]) => [...prev, msg]); 
        
        if (activeChannel === AI_BOT_ID) {
            setIsAiTyping(true);
            try {
                const responseText = await getChatResponse(text, sopList || [], trainingLevels || []);
                const aiMsg: DirectMessage = {
                    id: (Date.now() + 1).toString(),
                    fromId: AI_BOT_ID,
                    toId: currentUser.id,
                    content: responseText,
                    timestamp: new Date().toISOString(),
                    read: false
                };
                setMessages((prev: DirectMessage[]) => [...prev, aiMsg]);
                Cloud.saveMessage(msg); 
                Cloud.saveMessage(aiMsg); 
            } catch (error) {
                console.error("AI Error", error);
                setMessages((prev: DirectMessage[]) => [...prev, {
                    id: Date.now().toString(),
                    fromId: AI_BOT_ID,
                    toId: currentUser.id,
                    content: "Sorry, my brain froze. Please try again.",
                    timestamp: new Date().toISOString(),
                    read: false
                }]);
            } finally {
                setIsAiTyping(false);
            }
        } else {
            Cloud.saveMessage(msg); 
        }
    };

    // --- 修复重点：补充缺失的 handleBroadcast 函数 ---
    const handleBroadcast = async () => {
        // 如果输入为空，直接返回，不执行任何操作
        if (!broadcastText.trim()) return;
        
        const notice: Notice = { 
            id: Date.now().toString(), 
            author: currentUser.name, 
            content: broadcastText, 
            date: new Date().toISOString(), 
            isUrgent: false,
            frequency: broadcastFreq,
            status: 'active',
            imageUrl: broadcastImageUrl.trim() || undefined,
        };

        // 调用云端函数保存公告
        const res = await Cloud.updateNotices([notice]); 
        
        if (res.success) {
            setBroadcastText('');
            setBroadcastImageUrl('');
            alert("New announcement posted. This is now the only active announcement.");
        } else {
            alert("Error: Could not post announcement.");
        }
    };

    const cancelNotice = async (id: string) => {
        if (!window.confirm("Cancel/Withdraw this announcement?")) return;
        const updatedNotices = notices.map((n: Notice) => n.id === id ? { ...n, status: 'cancelled' } : n);
        await Cloud.updateNotices(updatedNotices);
    };

    const clearAllNotices = async () => {
        if (!window.confirm("Delete ALL announcements?")) return;
        await Cloud.clearAllNotices();
    };
    
    const formatDate = (isoString: string) => {
        const date = new Date(isoString);
        const today = new Date();
        if (date.toDateString() === today.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString();
    };

    if (activeChannel) {
        const threadMessages = messages
            .filter((m: DirectMessage) => (m.fromId === currentUser.id && m.toId === activeChannel) || (m.fromId === activeChannel && m.toId === currentUser.id))
            .sort((a: DirectMessage, b: DirectMessage) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        const isAi = activeChannel === AI_BOT_ID;
        const targetUser = isAi ? { name: "AI Assistant", id: AI_BOT_ID } : allUsers.find((u:User) => u.id === activeChannel);

        return (
            <div className="h-full flex flex-col bg-secondary text-text absolute inset-0 z-[100] animate-fade-in"> 
                <div className="p-4 bg-surface border-b flex items-center gap-3 sticky top-0 z-10 shadow-sm">
                    <button onClick={() => setActiveChannel(null)} className="p-2 -ml-2 rounded-full hover:bg-secondary"><Icon name="ArrowLeft" /></button>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white shadow-lg ${isAi ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-primary'}`}>
                        {isAi ? <Icon name="Sparkles" size={20}/> : targetUser?.name[0]}
                    </div>
                    <div>
                        <h3 className="font-bold">{targetUser?.name}</h3>
                        <p className={`text-xs font-bold ${isAi ? 'text-indigo-500' : 'text-green-500'}`}>
                            {isAi ? 'Always Online' : 'Online'}
                        </p>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
                    {isAi && threadMessages.length === 0 && (
                        <div className="text-center p-6 text-gray-400 text-sm">
                            <Icon name="Sparkles" size={40} className="mx-auto mb-2 opacity-20"/>
                            <p>Ask me anything about Recipes, SOPs, or Cleaning!</p>
                            <div className="flex gap-2 justify-center mt-4">
                                <button onClick={() => setInputText("How to make Grape Tea?")} className="text-xs bg-white border px-3 py-2 rounded-full shadow-sm hover:bg-indigo-50 text-indigo-500">🍇 Grape Tea Recipe</button>
                                <button onClick={() => setInputText("Closing checklist?")} className="text-xs bg-white border px-3 py-2 rounded-full shadow-sm hover:bg-indigo-50 text-indigo-500">🧹 Closing SOP</button>
                            </div>
                        </div>
                    )}
                    {threadMessages.map((m: DirectMessage) => (
                        <React.Fragment key={m.id}>
                            <div className={`flex flex-col items-start ${m.fromId === currentUser.id ? 'items-end' : 'items-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm whitespace-pre-line leading-relaxed ${m.fromId === currentUser.id ? 'bg-primary text-white rounded-br-none' : 'bg-white border rounded-bl-none text-gray-800'}`}>
                                    {m.content}
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1 px-1">{formatDate(m.timestamp)}</span>
                            </div>
                        </React.Fragment>
                    ))}
                    {isAiTyping && (
                        <div className="flex items-start">
                            <div className="bg-white border rounded-2xl rounded-bl-none p-3 shadow-sm flex gap-1">
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-75"></div>
                                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-150"></div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="sticky bottom-0 left-0 right-0 bg-surface border-t p-3 pb-8 max-w-md mx-auto flex gap-2">
                    <input 
                        value={inputText} 
                        onChange={e => setInputText(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
                        className="flex-1 bg-secondary rounded-full px-4 py-2.5 outline-none focus:ring-2 ring-primary/20 transition-all" 
                        placeholder={isAi ? "Ask AI Assistant..." : t.type_message}
                    />
                    <button onClick={handleSend} className={`w-11 h-11 text-white rounded-full transition-all active:scale-90 flex items-center justify-center shrink-0 shadow-lg ${isAi ? 'bg-indigo-500 hover:bg-indigo-600' : 'bg-primary hover:bg-primary-dark'}`}>
                        <Icon name="Send"/>
                    </button>
                </div>
            </div>
        );
    }
    
    const displayNotices = isManager 
        ? notices.slice().reverse()
        : notices.filter((n: Notice) => n.status !== 'cancelled').slice().reverse();

    return (
        <div className="h-full bg-surface flex flex-col pb-20 text-text absolute inset-0 z-[100]">
            <div className="p-4 border-b flex justify-between items-center bg-surface sticky top-0 z-10">
                <h2 className="text-2xl font-black">{t.chat}</h2>
                {onExit && (
                    isManager 
                    ? (
                        <button onClick={onExit} className="bg-destructive-light text-destructive border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-red-200 transition-all">
                            <Icon name="LogOut" size={14}/> Exit
                        </button>
                    ) : (
                         <button onClick={onExit} className="bg-gray-100 text-text-light p-2 rounded-full hover:bg-gray-200">
                            <Icon name="X" size={20} />
                        </button>
                    )
                )}
            </div>
            
            <div className="flex-1 overflow-y-auto">
                {/* AI ASSISTANT ENTRY */}
                <div className="p-4 pb-0">
                    <div 
                        onClick={() => setActiveChannel(AI_BOT_ID)}
                        className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-4 shadow-lg text-white flex items-center gap-4 cursor-pointer transform transition-all active:scale-95"
                    >
                        <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                            <Icon name="Sparkles" size={24} />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-lg">AI Assistant</h3>
                            <p className="text-indigo-100 text-xs">Ask about Recipes, SOPs...</p>
                        </div>
                        <Icon name="ChevronRight" className="text-white/50" />
                    </div>
                </div>

                <div className="p-4 bg-accent/10 mt-4 mx-4 rounded-2xl">
                    <h3 className="text-sm font-bold text-accent uppercase tracking-wider mb-3 flex items-center gap-2"><Icon name="Megaphone" size={16}/> Announcements</h3>
                    {isManager && (
                        <div className="flex flex-col gap-2 mb-4 bg-surface p-3 rounded-xl border border-accent/20">
                            <textarea 
                                value={broadcastText} 
                                onChange={e => setBroadcastText(e.target.value)} 
                                rows={2} 
                                className="w-full text-sm p-3 border rounded-lg bg-secondary focus:ring-2 ring-accent/50 outline-none transition-all" 
                                placeholder="Type announcement..." 
                            />
                            <input
                                type="url"
                                value={broadcastImageUrl}
                                onChange={e => setBroadcastImageUrl(e.target.value)}
                                className="w-full text-sm p-3 border rounded-lg bg-secondary focus:ring-2 ring-accent/50 outline-none transition-all"
                                placeholder="Image URL (optional)"
                            />
                            <div className="flex justify-between items-center mt-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-text-light uppercase">Freq:</span>
                                    <select 
                                        value={broadcastFreq} 
                                        onChange={(e) => setBroadcastFreq(e.target.value as any)} 
                                        className="text-xs bg-secondary border rounded-md p-1 font-bold text-text cursor-pointer focus:ring-1 focus:ring-accent"
                                    >
                                        <option value="always">Always</option>
                                        <option value="daily">Daily</option>
                                        <option value="once">Once</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={clearAllNotices} className="bg-destructive text-white px-3 py-2 rounded-lg font-bold text-xs shadow-md hover:bg-red-600 transition-all">
                                        Clear
                                    </button>
                                    <button onClick={handleBroadcast} className="bg-accent text-white px-4 py-2 rounded-lg font-bold text-xs shadow-md hover:bg-yellow-600 transition-all">Post</button>
                                </div>
                            </div>
                        </div>
                    )}
                    {displayNotices.length > 0 ? (
                        <div className="space-y-3">
                            {displayNotices.map((n: Notice) => (
                                <div key={n.id} className={`bg-surface p-3 rounded-xl border text-sm shadow-sm relative ${n.status === 'cancelled' ? 'border-gray-200 opacity-60' : 'border-accent/30'}`}>
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="font-bold text-text">{n.author}</span>
                                      <div className="flex items-center gap-2">
                                          {n.status === 'cancelled' && <span className="text-[9px] bg-red-100 text-red-500 px-1.5 py-0.5 rounded uppercase font-bold">CANCELLED</span>}
                                          <span className="text-[10px] text-text-light">{formatDate(n.date)}</span>
                                      </div>
                                    </div>
                                    <p className={`text-text-light ${n.status === 'cancelled' ? 'line-through' : ''}`}>{n.content}</p>
                                    {n.imageUrl && n.status !== 'cancelled' && (
                                        <img src={n.imageUrl} alt="Announcement" className="mt-2 rounded-lg w-full h-auto max-h-40 object-cover border" />
                                    )}
                                    {isManager && n.status !== 'cancelled' && (
                                        <button 
                                            onClick={() => cancelNotice(n.id)}
                                            className="absolute bottom-2 right-2 text-[10px] text-red-400 font-bold hover:text-red-600 bg-red-50 px-2 py-1 rounded"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : <p className="text-xs text-text-light italic text-center py-4">No active announcements.</p>}
                </div>

                <div className="p-2">
                    <h3 className="text-sm font-bold text-text-light uppercase tracking-wider my-2 px-2">Team Chat</h3>
                    {allUsers.filter((u: User) => u.id !== currentUser.id && u.active !== false).map((user: User) => (
                    <div key={user.id} onClick={() => setActiveChannel(user.id)} className="flex items-center gap-4 p-3 hover:bg-secondary rounded-lg border-b cursor-pointer transition-colors">
                        <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center font-bold text-text-light shrink-0 relative">
                            {user.name[0]}
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-surface"></span>
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-text">{user.name}</h3>
                            <p className="text-xs text-text-light truncate">Tap to message</p>
                        </div>
                    </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- DASHBOARDS ---

const EditorDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { sopList, setSopList, trainingLevels, setTrainingLevels, recipes, setRecipes, t } = data;
    const [view, setView] = useState<'training' | 'sop' | 'recipes'>('training');
    const [editingItem, setEditingItem] = useState<any>(null);
    const [isProcessingPdf, setIsProcessingPdf] = useState(false);
    
    // FIX: Define a response schema for structured JSON output from Gemini.
    const recipeSchema = {
        type: Type.OBJECT,
        properties: {
            name: { type: Type.OBJECT, properties: { en: { type: Type.STRING }, zh: { type: Type.STRING } } },
            cat: { type: Type.STRING },
            size: { type: Type.STRING },
            ice: { type: Type.STRING },
            sugar: { type: Type.STRING },
            toppings: { type: Type.OBJECT, properties: { en: { type: Type.STRING }, zh: { type: Type.STRING } } },
            steps: {
                type: Type.OBJECT,
                properties: {
                    cold: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { en: { type: Type.STRING }, zh: { type: Type.STRING } } } },
                    warm: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { en: { type: Type.STRING }, zh: { type: Type.STRING } } } }
                }
            }
        }
    };

    const createNewItem = () => { const id = `item_${Date.now()}`; if (view === 'training') return { id, title: {zh:'',en:''}, subtitle: {zh:'',en:''}, desc: {zh:'',en:''}, youtubeLink: '', imageUrls: [], content: [{title:{zh:'',en:''}, body:{zh:'',en:''}}], quiz: [] }; if (view === 'sop') return { id, title: {zh:'',en:''}, content: {zh:'',en:''}, tags: [], category: 'General' }; if (view === 'recipes') return { id, name: {zh:'',en:''}, cat: 'Milk Tea', size: '500ml', ice: 'Standard', sugar: '100%', toppings: {zh:'',en:''}, steps: {cold:[], warm:[]}, isNew: false, coverImageUrl: '', tutorialVideoUrl: '', basePreparation: {zh: '', en: ''}, isPublished: true, createdAt: new Date().toISOString(), recipeType: 'product' }; return {}; };
    const handleSave = async () => {
        if (!editingItem) return;

        // Helper to recursively remove undefined values which Firestore cannot handle
        const removeUndefinedRecursive = (obj: any): any => {
            if (obj === null || typeof obj !== 'object') {
                return obj;
            }
            if (Array.isArray(obj)) {
                return obj.map(item => removeUndefinedRecursive(item)).filter(item => item !== undefined);
            }
            const newObj: { [key: string]: any } = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const value = obj[key];
                    if (value !== undefined) {
                        newObj[key] = removeUndefinedRecursive(value);
                    }
                }
            }
            return newObj;
        };

        let updatedList;
        let setList;
        let listKey: 'sops' | 'training' | 'recipes' = 'recipes'; // default for type safety

        if (view === 'sop') {
            listKey = 'sops';
            updatedList = sopList.some((i: any) => i.id === editingItem.id)
                ? sopList.map((i: any) => (i.id === editingItem.id ? editingItem : i))
                : [...sopList, editingItem];
            setList = setSopList;
        } else if (view === 'training') {
            listKey = 'training';
            updatedList = trainingLevels.some((i: any) => i.id === editingItem.id)
                ? trainingLevels.map((i: any) => (i.id === editingItem.id ? editingItem : i))
                : [...trainingLevels, editingItem];
            setList = setTrainingLevels;
        } else if (view === 'recipes') {
            listKey = 'recipes';
            const sanitizedItem = {
                ...editingItem,
                coverImageUrl: editingItem.coverImageUrl?.trim() || undefined,
                tutorialVideoUrl: editingItem.tutorialVideoUrl?.trim() || undefined,
                recipeType: editingItem.recipeType || 'product', // Ensure recipeType exists
            };
            updatedList = recipes.some((i: any) => i.id === editingItem.id)
                ? recipes.map((i: any) => (i.id === editingItem.id ? sanitizedItem : i))
                : [...recipes, sanitizedItem];
            setList = setRecipes;
        }

        if (updatedList && setList) {
            try {
                const listToSave = removeUndefinedRecursive(updatedList);
                await Cloud.saveContent(listKey, listToSave);
                console.log(`${listKey} saved ok`);
                // For robust validation, rely on the onSnapshot listener to update the state.
                // Optimistically updating UI here after successful save.
                setList(listToSave);
                setEditingItem(null);
            } catch (error: any) {
                console.error(error);
                alert(error.message);
            }
        } else {
            // Fallback in case something goes wrong with the logic
            setEditingItem(null);
        }
    };
    const handleDelete = (id: string) => { if(!window.confirm("Delete this item?")) return; if (view === 'sop') { const list = sopList.filter((i:any) => i.id !== id); setSopList(list); Cloud.saveContent('sops', list); } else if (view === 'training') { const list = trainingLevels.filter((i:any) => i.id !== id); setTrainingLevels(list); Cloud.saveContent('training', list); } else { const list = recipes.filter((i:any) => i.id !== id); setRecipes(list); Cloud.saveContent('recipes', list); } };
    
    const handleMoveRecipe = (indexToMove: number, direction: 'up' | 'down') => {
        const sortedRecipes = [...recipes].sort((a, b) => {
            const orderA = a.sortOrder ?? Infinity;
            const orderB = b.sortOrder ?? Infinity;
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });

        if ((direction === 'up' && indexToMove === 0) || (direction === 'down' && indexToMove === sortedRecipes.length - 1)) {
            return;
        }

        const targetIndex = direction === 'up' ? indexToMove - 1 : indexToMove + 1;
        const reorderedList = [...sortedRecipes];
        const [movedItem] = reorderedList.splice(indexToMove, 1);
        reorderedList.splice(targetIndex, 0, movedItem);

        const updatedList = reorderedList.map((recipe, index) => ({
            ...recipe,
            sortOrder: index,
        }));

        setRecipes(updatedList);
        Cloud.saveContent('recipes', updatedList);
    };

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !process.env.API_KEY) return;

        setIsProcessingPdf(true);
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64Data = (event.target?.result as string).split(',')[1];
                
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const prompt = `You are a recipe processing assistant.
                1. First, analyze the provided PDF and extract the recipe information into a JSON object with ONLY English values for the fields: "name", "cat", "size", "ice", "sugar", "toppings", and "steps" (for both "cold" and "warm").
                2. Second, translate the extracted English text for "name", "toppings", and "steps" into Simplified Chinese.
                3. Finally, return a single, complete JSON object that includes both the original English and the translated Chinese, formatted exactly like this:
                {
                  "name": {"en": "...", "zh": "..."},
                  "cat": "...",
                  "size": "...",
                  "ice": "...",
                  "sugar": "...",
                  "toppings": {"en": "...", "zh": "..."},
                  "steps": {
                    "cold": [{"en": "...", "zh": "..."}],
                    "warm": [{"en": "...", "zh": "..."}]
                  }
                }
                - For 'cat', 'size', 'ice', 'sugar', just extract the value; do not create en/zh objects.
                - The 'steps' arrays must contain objects, each with 'en' and 'zh' keys.
                - If a section (like warm steps) is missing, return an empty array for it.
                - Infer missing details reasonably but prioritize accuracy from the PDF.`;

                // FIX: Upgraded model and implemented structured JSON output for reliability.
                const response = await ai.models.generateContent({
                    model: 'gemini-3-pro-preview',
                    contents: {
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: 'application/pdf', data: base64Data } }
                        ]
                    },
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: recipeSchema,
                    }
                });

                const text = response.text;
                if (text) {
                    // FIX: Improved JSON parsing to handle clean output from Gemini's JSON mode.
                    try {
                        const jsonStr = text.trim().replace(/^```json\s*/, '').replace(/```$/, '');
                        const extracted = JSON.parse(jsonStr);
                        
                        // "Fill empty fields only" logic
                        setEditingItem((prev: DrinkRecipe) => {
                            const updated = JSON.parse(JSON.stringify(prev));

                            if (!updated.name.en && extracted.name?.en) updated.name.en = extracted.name.en;
                            if (!updated.name.zh && extracted.name?.zh) updated.name.zh = extracted.name.zh;

                            if (!updated.cat && extracted.cat) updated.cat = extracted.cat;
                            if (!updated.size && extracted.size) updated.size = extracted.size;
                            if (!updated.ice && extracted.ice) updated.ice = extracted.ice;
                            if (!updated.sugar && extracted.sugar) updated.sugar = extracted.sugar;

                            if (!updated.toppings.en && extracted.toppings?.en) updated.toppings.en = extracted.toppings.en;
                            if (!updated.toppings.zh && extracted.toppings?.zh) updated.toppings.zh = extracted.toppings.zh;

                            if ((!updated.steps.cold || updated.steps.cold.length === 0) && extracted.steps?.cold) {
                                updated.steps.cold = extracted.steps.cold;
                            }
                            if ((!updated.steps.warm || updated.steps.warm.length === 0) && extracted.steps?.warm) {
                                updated.steps.warm = extracted.steps.warm;
                            }

                            return updated;
                        });

                        alert("✅ Recipe auto-filled from PDF!\n已从 PDF 识别英文内容并生成中文翻译草稿。");
                    } catch (parseError) {
                         alert("Could not parse recipe from PDF. Please check the console.");
                        console.error("Gemini Response (JSON parse failed):", text, parseError);
                    }
                }
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error(err);
            alert("Error processing PDF. Please check the console for details.");
        } finally {
            setIsProcessingPdf(false);
        }
    };

    const renderEditorFields = () => {
        if (!editingItem) return null;
        if (view === 'training') { 
            return (<div className="space-y-4">
                <div><label className="block text-xs font-bold text-dark-accent/70 mb-1">MODULE TITLE</label>
                    <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm mb-1" placeholder="ZH Title" value={editingItem.title?.zh || ''} onChange={e => setEditingItem({...editingItem, title: {...(editingItem.title || {zh:'', en:''}), zh: e.target.value}})} />
                    <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="EN Title" value={editingItem.title?.en || ''} onChange={e => setEditingItem({...editingItem, title: {...(editingItem.title || {zh:'', en:''}), en: e.target.value}})} />
                </div>
                <div><label className="block text-xs font-bold text-dark-accent/70 mb-1">DESCRIPTION</label>
                    <textarea className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm h-20" placeholder="EN Description" value={editingItem.desc?.en || ''} onChange={e => setEditingItem({...editingItem, desc: {...(editingItem.desc || {zh:'', en:''}), en: e.target.value}})} />
                </div>
                <div><label className="block text-xs font-bold text-red-500 mb-1 flex items-center gap-2"><Icon name="Play" size={12}/> YOUTUBE VIDEO LINK</label>
                    <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="https://youtu.be/..." value={editingItem.youtubeLink || ''} onChange={e => setEditingItem({...editingItem, youtubeLink: e.target.value})} />
                </div>
                
                {/* NEW IMAGE GALLERY SECTION */}
                <div>
                    <label className="block text-xs font-bold text-blue-400 mb-1 flex items-center gap-2"><Icon name="Camera" size={12}/> IMAGE GALLERY (Max 6)</label>
                    <div className="space-y-2">
                        {(editingItem.imageUrls || []).map((url: string, idx: number) => (
                            <div key={idx} className="flex gap-2">
                                <input 
                                    className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" 
                                    placeholder="Image URL..." 
                                    value={url} 
                                    onChange={e => {
                                        const newUrls = [...(editingItem.imageUrls || [])];
                                        newUrls[idx] = e.target.value;
                                        setEditingItem({...editingItem, imageUrls: newUrls});
                                    }} 
                                />
                                <button 
                                    onClick={() => {
                                        const newUrls = [...(editingItem.imageUrls || [])];
                                        newUrls.splice(idx, 1);
                                        setEditingItem({...editingItem, imageUrls: newUrls});
                                    }}
                                    className="px-3 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"
                                >
                                    <Icon name="Trash" size={14}/>
                                </button>
                            </div>
                        ))}
                        {(editingItem.imageUrls?.length || 0) < 6 && (
                            <button 
                                onClick={() => setEditingItem({...editingItem, imageUrls: [...(editingItem.imageUrls || []), '']})}
                                className="text-xs bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded font-bold hover:bg-blue-500/20"
                            >
                                + Add Image URL
                            </button>
                        )}
                    </div>
                </div>

                <div><label className="block text-xs font-bold text-dark-accent/70 mb-2">CONTENT SECTIONS</label>
                    {editingItem.content?.map((section: any, idx: number) => (
                    <div key={idx} className="bg-dark-bg p-3 rounded mb-2 border border-white/10">
                        <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-xs mb-1 font-bold" placeholder="Section Title (EN)" value={section.title?.en || ''} onChange={e => { const newContent = [...editingItem.content]; newContent[idx].title = {...(newContent[idx].title || {zh:'', en:''}), en: e.target.value }; setEditingItem({...editingItem, content: newContent}); }} />
                        <textarea className="w-full bg-dark-bg border border-white/10 p-2 rounded text-xs h-24" placeholder="Body Text (EN)" value={section.body?.en || ''} onChange={e => { const newContent = [...editingItem.content]; newContent[idx].body = {...(newContent[idx].body || {zh:'', en:''}), en: e.target.value }; setEditingItem({...editingItem, content: newContent}); }} />
                    </div>))}
                    <button onClick={() => setEditingItem({...editingItem, content: [...(editingItem.content || []), {title:{zh:'',en:''}, body:{zh:'',en:''}}]})} className="text-xs text-dark-accent hover:opacity-80">+ Add Section</button>
                </div>
            </div>); 
        } 
        if (view === 'sop') { 
            return (<div className="space-y-4">
                <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm font-bold" placeholder="Title (EN)" value={editingItem.title?.en || ''} onChange={e => setEditingItem({...editingItem, title: {...(editingItem.title || {zh:'', en:''}), en: e.target.value}})} />
                <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Category (e.g. Opening)" value={editingItem.category || ''} onChange={e => setEditingItem({...editingItem, category: e.target.value})} />
                <div><label className="block text-xs font-bold text-dark-accent/70 mb-1">CONTENT (EN)</label>
                    <textarea className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm h-40 font-mono" value={editingItem.content?.en || ''} onChange={e => setEditingItem({...editingItem, content: {...(editingItem.content || {zh:'', en:''}), en: e.target.value}})} />
                </div>
                <div><label className="block text-xs font-bold text-dark-accent/70 mb-1">CONTENT (ZH)</label>
                    <textarea className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm h-40 font-mono" value={editingItem.content?.zh || ''} onChange={e => setEditingItem({...editingItem, content: {...(editingItem.content || {zh:'', en:''}), zh: e.target.value}})} />
                </div>
            </div>); 
        }
        if (view === 'recipes') { 
            return (<div className="space-y-4">
                <div className="flex justify-end">
                    <label className={`cursor-pointer bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${isProcessingPdf ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        <Icon name="BookOpen" size={16}/> {isProcessingPdf ? 'Analyzing PDF...' : 'Upload PDF & Auto-fill'}
                        <input type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} disabled={isProcessingPdf} />
                    </label>
                </div>
                 <div className="border-t border-white/10 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-green-400 mb-2 uppercase">Display Assets (Optional)</h4>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-dark-text-light">Cover Image URL</label>
                        <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="https://..." value={editingItem.coverImageUrl || ''} onChange={e => setEditingItem({...editingItem, coverImageUrl: e.target.value})} /> 
                    </div>
                    <div className="mt-2">
                        <label className="text-[10px] uppercase font-bold text-dark-text-light">Tutorial Video URL (YouTube)</label>
                        <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="https://youtu.be/..." value={editingItem.tutorialVideoUrl || ''} onChange={e => setEditingItem({...editingItem, tutorialVideoUrl: e.target.value})} />
                    </div>
                </div>
                <div className="border-t border-white/10 pt-4 mt-2 space-y-3">
                     <label className="flex items-center gap-3 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={editingItem.isPublished !== false}
                            onChange={e => setEditingItem({...editingItem, isPublished: e.target.checked})}
                            className="w-5 h-5 rounded bg-dark-bg border-white/20 text-dark-accent focus:ring-dark-accent"
                        />
                        <span className="font-bold text-dark-accent">在员工端显示 / Publish to staff app</span>
                    </label>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-dark-text-light">Recipe Type</label>
                        <select 
                            className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" 
                            value={editingItem.recipeType || 'product'} 
                            onChange={e => setEditingItem({...editingItem, recipeType: e.target.value})}
                        >
                            <option value="product">Product (成品配方)</option>
                            <option value="premix">Premix (基底/半成品)</option>
                        </select>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={!!editingItem.isNew} 
                            onChange={e => setEditingItem({...editingItem, isNew: e.target.checked})}
                            className="w-5 h-5 rounded bg-dark-bg border-white/20 text-dark-accent focus:ring-dark-accent"
                        />
                        <span className="font-bold text-dark-accent">标记为新菜谱 / Mark as NEW recipe</span>
                    </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[10px] uppercase font-bold text-dark-text-light">Name (EN)</label>
                        <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm font-bold" placeholder="Name (EN)" value={editingItem.name?.en || ''} onChange={e => setEditingItem({...editingItem, name: {...(editingItem.name || {zh:'', en:''}), en: e.target.value}})} /> 
                    </div>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-dark-text-light">Name (ZH)</label>
                        <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm font-bold" placeholder="Name (ZH)" value={editingItem.name?.zh || ''} onChange={e => setEditingItem({...editingItem, name: {...(editingItem.name || {zh:'', en:''}), zh: e.target.value}})} />
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Category" value={editingItem.cat || ''} onChange={e => setEditingItem({...editingItem, cat: e.target.value})} />
                    <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Size" value={editingItem.size || ''} onChange={e => setEditingItem({...editingItem, size: e.target.value})} />
                    <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Ice" value={editingItem.ice || ''} onChange={e => setEditingItem({...editingItem, ice: e.target.value})} />
                </div>
                <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Sugar" value={editingItem.sugar || ''} onChange={e => setEditingItem({...editingItem, sugar: e.target.value})} />
                
                <div className="space-y-1">
                    <label className="text-[10px] uppercase font-bold text-dark-text-light">Toppings</label>
                    <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Toppings (EN)" value={editingItem.toppings?.en || ''} onChange={e => setEditingItem({...editingItem, toppings: {...(editingItem.toppings || {zh:'', en:''}), en: e.target.value}})} />
                    <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Toppings (ZH)" value={editingItem.toppings?.zh || ''} onChange={e => setEditingItem({...editingItem, toppings: {...(editingItem.toppings || {zh:'', en:''}), zh: e.target.value}})} />
                </div>

                <div className="border-t border-white/10 pt-4 mt-4">
                    <h4 className="text-xs font-bold text-green-400 mb-2 uppercase">原料/基底配制说明 (可选)</h4>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-dark-text-light">Base Prep (EN)</label>
                        <textarea className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm h-20" placeholder="Instructions for preparing base ingredients..." value={editingItem.basePreparation?.en || ''} onChange={e => setEditingItem({...editingItem, basePreparation: {...(editingItem.basePreparation || {zh:'', en:''}), en: e.target.value}})} />
                    </div>
                    <div className="mt-2">
                        <label className="text-[10px] uppercase font-bold text-dark-text-light">基底配制 (ZH)</label>
                        <textarea className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm h-20" placeholder="配制基底原料的步骤..." value={editingItem.basePreparation?.zh || ''} onChange={e => setEditingItem({...editingItem, basePreparation: {...(editingItem.basePreparation || {zh:'', en:''}), zh: e.target.value}})} />
                    </div>
                </div>

                <div className="border-t border-white/10 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-blue-400 mb-2 uppercase">Cold Steps</h4>
                    {editingItem.steps?.cold?.map((step: any, idx: number) => (
                        <div key={idx} className="flex gap-2 mb-2">
                            <div className="flex-1 space-y-1">
                                <input className="w-full bg-dark-bg border border-white/10 p-1.5 rounded text-xs" placeholder="Step (EN)" value={step.en || ''} onChange={e => { const newSteps = [...(editingItem.steps?.cold || [])]; newSteps[idx] = { ...step, en: e.target.value }; setEditingItem({...editingItem, steps: {...editingItem.steps, cold: newSteps}}); }} />
                                <input className="w-full bg-dark-bg border border-white/10 p-1.5 rounded text-xs" placeholder="Step (ZH)" value={step.zh || ''} onChange={e => { const newSteps = [...(editingItem.steps?.cold || [])]; newSteps[idx] = { ...step, zh: e.target.value }; setEditingItem({...editingItem, steps: {...editingItem.steps, cold: newSteps}}); }} />
                            </div>
                            <button onClick={() => { const newSteps = [...(editingItem.steps?.cold || [])]; newSteps.splice(idx, 1); setEditingItem({...editingItem, steps: {...editingItem.steps, cold: newSteps}}); }} className="px-2 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"><Icon name="Trash" size={14}/></button>
                        </div>
                    ))}
                    <button onClick={() => { const newSteps = [...(editingItem.steps?.cold || [])]; newSteps.push({zh:'', en:''}); setEditingItem({...editingItem, steps: {...(editingItem.steps || {}), cold: newSteps}}); }} className="text-xs bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded font-bold hover:bg-blue-500/20">+ Add Cold Step</button>
                </div>

                <div className="border-t border-white/10 pt-4 mt-2">
                    <h4 className="text-xs font-bold text-orange-400 mb-2 uppercase">Warm Steps</h4>
                    {editingItem.steps?.warm?.map((step: any, idx: number) => (
                        <div key={idx} className="flex gap-2 mb-2">
                            <div className="flex-1 space-y-1">
                                <input className="w-full bg-dark-bg border border-white/10 p-1.5 rounded text-xs" placeholder="Step (EN)" value={step.en || ''} onChange={e => { const newSteps = [...(editingItem.steps?.warm || [])]; newSteps[idx] = { ...step, en: e.target.value }; setEditingItem({...editingItem, steps: {...editingItem.steps, warm: newSteps}}); }} />
                                <input className="w-full bg-dark-bg border border-white/10 p-1.5 rounded text-xs" placeholder="Step (ZH)" value={step.zh || ''} onChange={e => { const newSteps = [...(editingItem.steps?.warm || [])]; newSteps[idx] = { ...step, zh: e.target.value }; setEditingItem({...editingItem, steps: {...editingItem.steps, warm: newSteps}}); }} />
                            </div>
                            <button onClick={() => { const newSteps = [...(editingItem.steps?.warm || [])]; newSteps.splice(idx, 1); setEditingItem({...editingItem, steps: {...editingItem.steps, warm: newSteps}}); }} className="px-2 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"><Icon name="Trash" size={14}/></button>
                        </div>
                    ))}
                    <button onClick={() => { const newSteps = [...(editingItem.steps?.warm || [])]; newSteps.push({zh:'', en:''}); setEditingItem({...editingItem, steps: {...(editingItem.steps || {}), warm: newSteps}}); }} className="text-xs bg-orange-500/10 text-orange-400 px-3 py-1.5 rounded font-bold hover:bg-orange-500/20">+ Add Warm Step</button>
                </div>
            </div>); 
        }
        return null;
    };

    const sortedRecipesForDisplay = [...(view === 'recipes' ? recipes : [])].sort((a, b) => {
        const orderA = a.sortOrder ?? Infinity;
        const orderB = b.sortOrder ?? Infinity;
        if (orderA !== orderB) {
            return orderA - orderB;
        }
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
    });

    return (
        <div className="min-h-screen max-h-[100dvh] overflow-hidden flex flex-col bg-dark-bg text-dark-text font-sans pt-[calc(env(safe-area-inset-top)_+_2rem)] md:pt-0">
           <div className="p-4 bg-dark-surface border-b border-white/10 flex justify-between items-center shrink-0">
               <h2 className="text-xl font-bold tracking-wider text-dark-accent">{t.editor_title}</h2>
               <button onClick={onExit} className="bg-white/10 p-2 rounded hover:bg-white/20 transition-all"><Icon name="X" /></button>
           </div>
           <div className="flex-1 overflow-y-auto p-4">
                <div className="flex gap-2 mb-4">
                     {['training', 'sop', 'recipes'].map(m => (
                         <button key={m} onClick={() => setView(m as any)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${view === m ? 'bg-dark-accent text-dark-bg shadow-lg' : 'bg-dark-surface text-dark-text-light hover:bg-white/10'}`}>{m}</button>
                     ))}
                </div>
                {editingItem ? (
                    <div className="bg-dark-surface p-4 rounded-xl border border-white/10 animate-fade-in">
                        {renderEditorFields()}
                        <div className="flex gap-3 mt-4">
                            <button onClick={() => setEditingItem(null)} className="flex-1 py-3 bg-white/10 rounded-xl font-bold text-dark-text-light hover:bg-white/20 transition-all">Cancel</button>
                            <button onClick={handleSave} className="flex-1 py-3 bg-dark-accent rounded-xl font-bold text-dark-bg hover:opacity-90 shadow-lg transition-all">Save Changes</button>
                        </div>
                    </div>
                ) : (
                   <div className="space-y-3">
                       <button onClick={() => setEditingItem(createNewItem())} className="w-full py-4 border-2 border-dashed border-white/20 rounded-xl text-dark-text-light font-bold hover:border-dark-accent hover:text-dark-accent transition-all">+ Add New Item</button>
                       {(view === 'training' ? trainingLevels : view === 'sop' ? sopList : sortedRecipesForDisplay).map((item: any, index: number) => (
                           <div key={item.id} className="bg-dark-surface p-4 rounded-xl flex justify-between items-center border border-white/10 hover:border-white/20 transition-all">
                               <div><h3 className="font-bold text-sm text-dark-text">{item.title?.en || item.name?.en}</h3><p className="text-xs text-dark-text-light font-mono">{item.id}</p></div>
                               <div className="flex gap-2">
                                   {view === 'recipes' && (
                                       <>
                                           <button
                                               onClick={() => handleMoveRecipe(index, 'up')}
                                               disabled={index === 0}
                                               className="p-2 bg-white/5 text-dark-text-light rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                                            >
                                               <Icon name="ChevronUp" size={16}/>
                                           </button>
                                            <button
                                               onClick={() => handleMoveRecipe(index, 'down')}
                                               disabled={index === sortedRecipesForDisplay.length - 1}
                                               className="p-2 bg-white/5 text-dark-text-light rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                                           >
                                               <Icon name="ChevronDown" size={16}/>
                                           </button>
                                       </>
                                   )}
                                   <button onClick={() => setEditingItem(JSON.parse(JSON.stringify(item)))} className="p-2 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 transition-all"><Icon name="Edit" size={16}/></button>
                                   <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-all"><Icon name="Trash" size={16}/></button>
                               </div>
                           </div>
                       ))}
                   </div>
                )}
           </div>
        </div>
    );
};

const OwnerInventoryLogsView = ({ logs, currentUser, onUpdateLogs }: { logs: LogEntry[], currentUser: User, onUpdateLogs: (logs: LogEntry[]) => void }) => {
    const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
    const [invalidatingLog, setInvalidatingLog] = useState<LogEntry | null>(null);

    // Filter for material/inventory logs, which are identified by having an 'items' array.
    const materialLogs = (logs || [])
        .filter(log => Array.isArray((log as any).items))
        .slice()
        .reverse();

    const handleSave = (updatedLog: LogEntry) => {
        const newLogs = logs.map(l => l.id === updatedLog.id ? updatedLog : l);
        onUpdateLogs(newLogs);
        setEditingLog(null);
    };

    const handleInvalidateConfirm = (logToUpdate: LogEntry) => {
        const newLogs = logs.map(l => l.id === logToUpdate.id ? logToUpdate : l);
        onUpdateLogs(newLogs);
        setInvalidatingLog(null);
    };

    return (
        <div className="p-4 space-y-3">
            <h3 className="text-lg font-bold text-dark-text">Material Logs</h3>
            {materialLogs.length === 0 && <p className="text-dark-text-light text-center py-10">No material logs found.</p>}
            {materialLogs.map((log: any) => (
                <div key={log.id} className={`bg-dark-surface p-3 rounded-xl border border-white/10 ${log.isDeleted ? 'opacity-50' : ''}`}>
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <p className="text-sm font-bold">{log.name} <span className="text-xs text-dark-text-light font-normal">({log.type || 'refill'})</span></p>
                            <p className="text-xs text-dark-text-light">{new Date(log.time).toLocaleString()}</p>
                            {log.isDeleted && <span className="text-xs text-red-400 font-bold">[INVALIDATED]</span>}
                            {log.manualInventoryEdited && <span className="text-xs text-yellow-400 font-bold">[EDITED]</span>}
                        </div>
                        {!log.isDeleted && (
                            <div className="flex gap-2 shrink-0">
                                <button onClick={() => setEditingLog(log)} className="bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-500/20">Edit</button>
                                <button onClick={() => setInvalidatingLog(log)} className="bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500/20">Invalidate</button>
                            </div>
                        )}
                    </div>
                    <div className="bg-dark-bg p-2 rounded-lg text-xs space-y-1">
                        {(log.items || []).map((item: any, index: number) => (
                            <div key={index} className="flex justify-between">
                                <span>{item.name}</span>
                                <span className="font-mono font-bold">+{item.amount}{item.unit}</span>
                            </div>
                        ))}
                    </div>
                     {log.isDeleted && <p className="text-xs mt-2 text-gray-400 border-t border-white/10 pt-2">Reason: {log.deleteReason}</p>}
                     {log.manualInventoryEdited && <p className="text-xs mt-2 text-yellow-500 border-t border-white/10 pt-2">Edit Note: {log.manualInventoryEditReason}</p>}
                </div>
            ))}
            <EditInventoryLogModal isOpen={!!editingLog} log={editingLog} onClose={() => setEditingLog(null)} onSave={handleSave} currentUser={currentUser} />
            <InvalidateLogModal isOpen={!!invalidatingLog} log={invalidatingLog} onClose={() => setInvalidatingLog(null)} onConfirm={handleInvalidateConfirm} currentUser={currentUser} />
        </div>
    );
};

const OwnerDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { lang, t, inventoryList, setInventoryList, inventoryHistory, users, logs } = data;
    const { showNotification } = useNotification();
    const ownerUser = users.find((u:User) => u.role === 'boss') || { id: 'u_owner', name: 'Owner', role: 'boss' };
    const [view, setView] = useState<'main' | 'manager'>('main');
    const [ownerSubView, setOwnerSubView] = useState<'logs' | 'presets' | 'history' | 'staff' | 'smart'>('smart');
    const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
    const [reportToDelete, setReportToDelete] = useState<InventoryReport | null>(null);

    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';
    
    const handleUpdateLogs = (allLogs: LogEntry[]) => {
        Cloud.updateLogs(allLogs);
    };

    const handleDeleteReport = async () => {
        if (!reportToDelete) return;
        const newHistory = inventoryHistory.filter((r: InventoryReport) => r.id !== reportToDelete.id);
        try {
            await Cloud.updateInventoryHistory(newHistory);
            showNotification({ type: 'message', title: "删除成功", message: "该条补料记录已被删除。" });
        } catch (e) {
            console.error("Failed to delete report:", e);
            showNotification({ type: 'announcement', title: "删除失败", message: "无法从数据库删除该记录。" });
        }
        setReportToDelete(null);
    };

    const handleExportCsv = () => {
        const headers = "Date,Submitted By,Item Name,End Count,Waste Count\n";
        const csvRows = inventoryHistory.flatMap((report: InventoryReport) => 
            Object.entries(report.data).map(([itemId, values]) => {
                // FIX: Add type assertion for 'values' to resolve 'unknown' type error.
                const typedValues = values as { end: string; waste: string };
                const itemDef = inventoryList.find((i: InventoryItem) => i.id === itemId);
                const itemName = itemDef ? getLoc(itemDef.name) : itemId;
                const cleanItemName = `"${itemName.replace(/"/g, '""')}"`; // Escape double quotes
                
                const reportDate = report.date ? new Date(report.date).toISOString().split('T')[0] : '';
                return [
                    `"${reportDate}"`,
                    `"${report.submittedBy}"`,
                    cleanItemName,
                    typedValues.end || '0',
                    typedValues.waste || '0'
                ].join(',');
            })
        );

        const csvString = headers + csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const date = new Date().toISOString().split('T')[0];
        link.setAttribute("download", `inventory_records_${date}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (view === 'manager') {
        return <ManagerDashboard data={data} onExit={() => setView('main')} />;
    }
    
    const InventoryHistoryView = () => (
        <div className="p-4 space-y-3">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-dark-text">{t.report_history || 'Report History'}</h3>
                <button onClick={handleExportCsv} className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-green-700 transition-all">
                    <Icon name="List" size={16} /> Export CSV
                </button>
            </div>
            {inventoryHistory.length === 0 && <p className="text-dark-text-light text-center py-10">No history found.</p>}
            {inventoryHistory.slice().reverse().map((report: InventoryReport) => (
                <div key={report.id} className="bg-dark-surface p-3 rounded-xl border border-white/10">
                    <div onClick={() => setExpandedReportId(expandedReportId === report.id ? null : report.id)} className="flex justify-between items-center cursor-pointer">
                        <div>
                            <p className="text-sm font-bold">{report.date ? new Date(report.date).toLocaleString() : 'No Date'}</p>
                            <p className="text-xs text-dark-text-light">by {report.submittedBy} • {Object.keys(report.data).length} items</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setReportToDelete(report);
                                }}
                                className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-all"
                                title="Delete Report"
                            >
                                <Icon name="Trash" size={16} />
                            </button>
                            <Icon name={expandedReportId === report.id ? "ChevronUp" : "ChevronRight"} className="text-dark-text-light" />
                        </div>
                    </div>
                    {expandedReportId === report.id && (
                        <div className="mt-3 pt-3 border-t border-white/10 text-xs space-y-2">
                            <div className="grid grid-cols-3 font-bold text-dark-text-light">
                                <span>Item</span><span className="text-center">End</span><span className="text-center">Waste</span>
                            </div>
                            {Object.entries(report.data).map(([itemId, values]) => {
                                // FIX: Add type assertion for 'values' to resolve 'unknown' type error.
                                const typedValues = values as { end: string; waste: string };
                                const itemDef = inventoryList.find((i: InventoryItem) => i.id === itemId);
                                return (
                                    <div key={itemId} className="grid grid-cols-3 items-center">
                                        <span>{itemDef ? getLoc(itemDef.name) : itemId}</span>
                                        <span className="text-center font-mono">{typedValues.end || '0'}</span>
                                        <span className="text-center font-mono text-red-400">{typedValues.waste || '0'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    return (
        <div className="min-h-screen max-h-[100dvh] overflow-hidden flex flex-col bg-dark-bg text-dark-text font-sans pt-[calc(env(safe-area-inset-top)_+_2rem)] md:pt-0">
            <div className="bg-dark-surface p-4 shadow-lg flex justify-between items-center shrink-0 border-b border-white/10">
                <div><h1 className="text-xl font-black tracking-tight text-white">{t.owner_dashboard || 'Owner Dashboard'}</h1><p className="text-xs text-dark-text-light">User: {ownerUser.name}</p></div>
                <div className="flex gap-2">
                    <button onClick={() => setView('manager')} className="bg-white/10 p-2 rounded hover:bg-white/20 transition-all text-xs font-bold px-3">Manager Dashboard</button>
                    <button onClick={onExit} className="bg-white/10 p-2 rounded hover:bg-white/20 transition-all"><Icon name="LogOut" /></button>
                </div>
            </div>
            <div className="flex bg-dark-bg p-2 gap-2 overflow-x-auto shrink-0 shadow-inner">
                <button onClick={() => setOwnerSubView('logs')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'logs' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                    Material Logs
                </button>
                <button onClick={() => setOwnerSubView('history')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'history' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                    Report History
                </button>
                 <button onClick={() => setOwnerSubView('presets')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'presets' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                    Manage Presets
                </button>
                 <button onClick={() => setOwnerSubView('staff')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'staff' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                    Staff Mgmt
                </button>
                <button onClick={() => setOwnerSubView('smart')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'smart' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                    Smart Inv
                </button>
            </div>
            <div className="flex-1 overflow-y-auto">
                {ownerSubView === 'presets' && (
                    <InventoryView 
                        lang={lang} 
                        t={t} 
                        inventoryList={inventoryList} 
                        setInventoryList={setInventoryList} 
                        isOwner={true} 
                        onSubmit={() => {}}
                        currentUser={ownerUser} 
                    />
                )}
                {ownerSubView === 'history' && <InventoryHistoryView />}
                {ownerSubView === 'staff' && <StaffManagementView users={users} />}
                {ownerSubView === 'logs' && <OwnerInventoryLogsView logs={logs} currentUser={ownerUser} onUpdateLogs={handleUpdateLogs} />}
                {ownerSubView === 'smart' && <SmartInventoryView data={data} />}
            </div>
        </div>
    );
};

const StaffManagementView = ({ users }: { users: User[] }) => {
    const [editingUser, setEditingUser] = useState<User | 'new' | null>(null);
    const [showInactive, setShowInactive] = useState(false);
    const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);

    const handleSaveUser = async (user: User) => {
        await Cloud.saveUser(user);
        setEditingUser(null);
        alert('Staff details saved!');
    };
    
    const handleDeactivate = async () => {
        if (!deactivatingUser) return;
        await Cloud.saveUser({ ...deactivatingUser, active: false });
        setDeactivatingUser(null);
        alert(`${deactivatingUser.name} has been deactivated.`);
    };

    const sortedUsers = [...users].sort((a, b) => (a.active === b.active) ? 0 : a.active ? -1 : 1);
    const filteredUsers = showInactive ? sortedUsers : sortedUsers.filter(u => u.active !== false);

    return (
        <div className="p-4 space-y-4 text-dark-text">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">Staff Management</h3>
                <div className="flex items-center gap-4">
                     <label className="flex items-center gap-2 text-xs text-dark-text-light cursor-pointer">
                        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded bg-dark-surface border-white/20 text-dark-accent focus:ring-dark-accent" />
                        Show Inactive
                    </label>
                    <button onClick={() => setEditingUser('new')} className="bg-dark-accent text-dark-bg px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:opacity-90 transition-all">
                        <Icon name="Plus" size={16} /> Add New Staff
                    </button>
                </div>
            </div>

            <div className="bg-dark-surface rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-xs">
                    <thead className="bg-dark-bg text-dark-text-light uppercase">
                        <tr>
                            <th className="p-3 text-left">Name</th>
                            <th className="p-3 text-left">Role</th>
                            <th className="p-3 text-left">Phone</th>
                            <th className="p-3 text-left">Password</th>
                            <th className="p-3 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredUsers.map(user => (
                            <tr key={user.id} className={`border-t border-white/10 ${!user.active ? 'opacity-50' : ''}`}>
                                <td className="p-3 font-bold">{user.name}</td>
                                <td className="p-3 capitalize">{user.role}</td>
                                <td className="p-3 font-mono">{user.phone || 'N/A'}</td>
                                <td className="p-3">{user.password ? <span className="text-green-400 font-bold">Set</span> : <span className="text-red-400">Not Set</span>}</td>
                                <td className="p-3">
                                    <div className="flex gap-2 justify-center">
                                        <button onClick={() => setEditingUser(user)} className="p-2 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20"><Icon name="Edit" size={14}/></button>
                                        {user.active !== false && (
                                            <button onClick={() => setDeactivatingUser(user)} className="p-2 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"><Icon name="Trash" size={14}/></button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {editingUser && <StaffEditModal user={editingUser} onSave={handleSaveUser} onClose={() => setEditingUser(null)} />}
            {deactivatingUser && <CustomConfirmModal isOpen={!!deactivatingUser} title={`Deactivate ${deactivatingUser.name}?`} message="This will mark the employee as inactive. Their historical data will be preserved, but they won't appear in schedules. Are you sure?" onConfirm={handleDeactivate} onCancel={() => setDeactivatingUser(null)} />}
        </div>
    );
};

// ... StaffManagementView 结束 ...

// ============================================================================
// 【升级版 SmartInventoryView：支持早晚班、损耗、智能补货建议】
// ============================================================================

const SmartInventoryView = ({ data }: { data: any }) => {
    const { smartInventoryReports, schedule } = data;
    const [areaFilter, setAreaFilter] = useState<'Prep' | 'Storage' | 'Shop'>('Prep'); // 默认进 Prep
    const [supplierFilter, setSupplierFilter] = useState<string>('All');
    
    // Inputs: pre (盘点/现有), restock (补货), loss (损耗)
    const [inputs, setInputs] = useState<Record<string, { pre: number, restock: number, loss: number }>>({});
    
    // 每日目标编辑状态
    const [isEditingTargets, setIsEditingTargets] = useState(false);
    const [targetOverrides, setTargetOverrides] = useState<Record<string, any>>(() => {
        const saved = localStorage.getItem('onesip_prep_targets');
        return saved ? JSON.parse(saved) : {};
    });

    // --- 1. 智能班次检测 (Shift Detection) ---
    const getCurrentShift = (): 'morning' | 'evening' => {
        const now = new Date();
        const currentHour = now.getHours() + now.getMinutes() / 60;
        
        // 尝试从排班表获取今日班次
        // 简单逻辑：如果现在时间早于下午4点(16:00)，算早班；否则算晚班
        // 你也可以根据 schedule.days 里的具体时间来判断，这里用时间分割最稳妥
        if (currentHour < 16.0) return 'morning';
        return 'evening';
    };

    const [currentShift, setCurrentShift] = useState<'morning' | 'evening'>(getCurrentShift());

    // --- 2. 日期与目标逻辑 ---
    const todayIndex = new Date().getDay(); // 0=Sun
    let dayGroup: 'mon_thu' | 'fri' | 'sat' | 'sun' = 'mon_thu';
    if (todayIndex === 5) dayGroup = 'fri';
    if (todayIndex === 6) dayGroup = 'sat';
    if (todayIndex === 0) dayGroup = 'sun';

    // 获取当前班次的目标值 (Target)
    const getTarget = (item: SmartInventoryItem) => {
        const saved = targetOverrides[item.id];
        const targets = saved || item.dailyTargets;
        if (!targets) return item.safeStock || 0;
        
        // 【核心】：根据班次返回对应的目标
        const dayTarget = targets[dayGroup];
        if (!dayTarget) return 0;
        return currentShift === 'morning' ? dayTarget.morning : dayTarget.evening;
    };

    const handleTargetChange = (itemId: string, period: 'morning'|'evening', val: string) => {
        const num = parseFloat(val) || 0;
        setTargetOverrides(prev => {
            const itemDef = SMART_INVENTORY_MASTER_DATA.find(i => i.id === itemId);
            const currentTargets = prev[itemId] || itemDef?.dailyTargets || {
                mon_thu: {morning:0, evening:0}, fri: {morning:0, evening:0}, sat: {morning:0, evening:0}, sun: {morning:0, evening:0}
            };
            const updated = { ...currentTargets, [dayGroup]: { ...currentTargets[dayGroup], [period]: num } };
            const newState = { ...prev, [itemId]: updated };
            localStorage.setItem('onesip_prep_targets', JSON.stringify(newState));
            return newState;
        });
    };

    // --- 3. 历史记录 (上一班详情) ---
    // Flatten logs to find the absolute latest entry for each item
    const allLogs = (smartInventoryReports || []).flatMap((r: any) => r.logs || [])
        .sort((a: any, b: any) => 0); // We need timestamp in logs for accurate sorting, currently relying on report date
        // 由于 report 是按周存的，我们简单点：直接找最近的一份 report 里的 log
    
    // 更好的做法：在组件加载时构建一个 "Last Log Map"
    const lastLogMap = new Map<string, SmartInventoryLog>();
    // Sort reports desc
    const sortedReports = (smartInventoryReports || []).slice().sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // 遍历最近的几次报告来填充 Map (防止最近一次报告没有某些物品)
    sortedReports.slice(0, 3).forEach((rep: SmartInventoryReport) => {
        rep.logs.forEach((log: SmartInventoryLog) => {
            if (!lastLogMap.has(log.itemId)) {
                lastLogMap.set(log.itemId, log);
            }
        });
    });

    const items = SMART_INVENTORY_MASTER_DATA.filter(item => item.area === areaFilter);
    const suppliers = ['All', ...Array.from(new Set(items.map(i => i.supplier).filter(Boolean))) as string[]];
    const filteredItems = supplierFilter === 'All' ? items : items.filter(i => i.supplier === supplierFilter);

    const handleInputChange = (itemId: string, field: 'pre' | 'restock' | 'loss', value: string) => {
        const num = parseFloat(value);
        setInputs(prev => ({
            ...prev,
            [itemId]: {
                ...prev[itemId] || { pre: 0, restock: 0, loss: 0 },
                [field]: isNaN(num) ? 0 : num
            }
        }));
    };

    const calculateConsumption = (itemId: string, currentPre: number) => {
        const prevLog = lastLogMap.get(itemId);
        if (!prevLog) return 0; 
        return Math.max(0, prevLog.postStock - currentPre); 
    };

    const handleSubmit = async () => {
        if (!window.confirm(`Submit ${currentShift.toUpperCase()} Inventory for ${dayGroup.toUpperCase()}?`)) return;
        const timestamp = new Date();
        
        const logs: SmartInventoryLog[] = items.map(item => {
            const input = inputs[item.id] || { pre: 0, restock: 0, loss: 0 };
            const target = getTarget(item);
            
            // Post Stock = Pre + Restock
            const post = input.pre + input.restock;
            
            // Consumption logic can be refined: Start + Restock - End - Loss
            // But here we stick to simpler: Last Post - Current Pre
            const consumption = calculateConsumption(item.id, input.pre);
            
            return {
                itemId: item.id, 
                itemName: item.name.en, 
                area: item.area, 
                preStock: input.pre, 
                restockQty: input.restock, 
                postStock: post, 
                loss: input.loss, // 【新增】
                shift: currentShift, // 【新增】
                targetSnapshot: target, // 【新增】
                consumption: consumption
            };
        });

        // 依然按周归档，但记录里包含了具体的班次信息
        const oneJan = new Date(timestamp.getFullYear(), 0, 1);
        const numberOfDays = Math.floor((timestamp.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
        const weekNum = Math.ceil((timestamp.getDay() + 1 + numberOfDays) / 7);

        const report: SmartInventoryReport = {
            id: timestamp.getTime().toString(),
            date: timestamp.toISOString(),
            weekStr: `${timestamp.getFullYear()}-W${weekNum}`,
            submittedBy: `Staff (${currentShift})`, 
            logs: logs
        };

        try { await Cloud.saveSmartInventoryReport(report); alert("✅ Saved!"); setInputs({}); } catch (error) { console.error(error); alert("Error"); }
    };

    const handleExport = () => {
        let csv = "Date,Week,Shift,Area,Item,Target,Pre(Count),Restock,Loss,Post,Consumption\n";
        (smartInventoryReports || []).forEach((rep: SmartInventoryReport) => {
            rep.logs.forEach(log => {
                const cleanName = log.itemName.replace(/"/g, '""');
                csv += `${rep.date.split('T')[0]},${rep.weekStr},${log.shift||'-'},${log.area},"${cleanName}",${log.targetSnapshot||0},${log.preStock},${log.restockQty},${log.loss||0},${log.postStock},${log.consumption}\n`;
            });
        });
        const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csv);
        const link = document.createElement("a"); link.href = encodedUri; link.download = `inventory_log_${new Date().toISOString().split('T')[0]}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    return (
        <div className="h-full flex flex-col bg-dark-bg text-dark-text animate-fade-in">
            {/* Header */}
            <div className="p-4 bg-dark-surface border-b border-white/10 flex justify-between items-center shadow-lg z-10 shrink-0">
                <div>
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <Icon name="Briefcase" size={24} className="text-dark-accent" /> Smart Prep
                    </h2>
                    <div className="flex gap-3 text-xs mt-1">
                        <span className="text-dark-text-light flex items-center gap-1">
                            <Icon name="Calendar" size={12}/> {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][todayIndex]}
                        </span>
                        {/* 班次切换器 (允许手动纠正) */}
                        <div className="flex bg-black/20 rounded p-0.5">
                            <button onClick={()=>setCurrentShift('morning')} className={`px-2 py-0.5 rounded text-[10px] ${currentShift==='morning'?'bg-orange-400 text-white font-bold':'text-dark-text-light'}`}>Morning</button>
                            <button onClick={()=>setCurrentShift('evening')} className={`px-2 py-0.5 rounded text-[10px] ${currentShift==='evening'?'bg-indigo-400 text-white font-bold':'text-dark-text-light'}`}>Evening</button>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleExport} className="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-xs font-bold transition-all border border-white/5 text-white">Export</button>
                    <button onClick={handleSubmit} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg text-sm font-bold text-white shadow-lg transition-all flex items-center gap-2">
                        <Icon name="Save" size={16}/> Submit
                    </button>
                </div>
            </div>

            {/* Area Tabs */}
            <div className="p-3 flex gap-2 border-b border-white/10 bg-dark-bg shrink-0 overflow-x-auto">
                 <div className="flex bg-dark-surface rounded-lg p-1 shrink-0 border border-white/5">
                    <button onClick={() => setAreaFilter('Prep')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex gap-2 items-center ${areaFilter === 'Prep' ? 'bg-purple-500 text-white' : 'text-dark-text-light'}`}>
                        <Icon name="Coffee" size={12}/> Prep (备料)
                    </button>
                    <button onClick={() => setAreaFilter('Storage')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${areaFilter === 'Storage' ? 'bg-dark-accent text-dark-bg' : 'text-dark-text-light'}`}>Storage</button>
                    <button onClick={() => setAreaFilter('Shop')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${areaFilter === 'Shop' ? 'bg-dark-accent text-dark-bg' : 'text-dark-text-light'}`}>Shop</button>
                </div>
                
                {areaFilter === 'Prep' && (
                    <button onClick={() => setIsEditingTargets(!isEditingTargets)} className="ml-auto text-[10px] underline text-purple-300 hover:text-white flex items-center gap-1">
                        <Icon name="Settings" size={10}/> {isEditingTargets ? "Done Editing" : "Adjust Targets"}
                    </button>
                )}
            </div>

            {/* Main List */}
            <div className="flex-1 overflow-y-auto p-2 pb-20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredItems.map(item => {
                        const input = inputs[item.id] || { pre: 0, restock: 0, loss: 0 };
                        const targetVal = getTarget(item); // 获取当前班次目标
                        
                        // 智能补货建议：(目标 - 现有)
                        // 如果未输入restock，且现有库存小于目标，可以显示建议值
                        const suggestion = Math.max(0, targetVal - input.pre);
                        const post = input.pre + input.restock;
                        const lastLog = lastLogMap.get(item.id);
                        
                        // 状态判定
                        const isLow = post < targetVal;

                        // 获取日预设 (用于编辑)
                        const saved = targetOverrides[item.id];
                        const targets = saved || item.dailyTargets;
                        const currentDayTargets = targets ? targets[dayGroup] : null;

                        return (
                            <div key={item.id} className={`bg-dark-surface p-3 rounded-xl border flex flex-col gap-2 shadow-sm transition-all ${isLow ? 'border-red-500/30' : 'border-white/5'}`}>
                                {/* Item Header */}
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-sm text-white truncate">{item.name.zh}</span>
                                            <span className="text-[10px] text-dark-text-light font-mono">{item.name.en}</span>
                                        </div>
                                        <div className="text-[10px] text-dark-text-light flex flex-wrap gap-x-3 items-center">
                                            <span className="bg-white/5 px-1 rounded text-white/70">{item.unit}</span>
                                            
                                            {/* 目标展示 */}
                                            {!isEditingTargets && (
                                                <span className={`font-bold flex items-center gap-1 ${targetVal>0 ? 'text-purple-300' : 'text-gray-500'}`}>
                                                    Target: {targetVal}
                                                </span>
                                            )}

                                            {/* 上一班记录展示 */}
                                            {lastLog && (
                                                <span className="text-gray-500 flex items-center gap-1" title={`Last update: ${new Date(lastLog.date||'').toLocaleDateString()}`}>
                                                    <Icon name="Clock" size={8}/> Last: {lastLog.restockQty}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* 状态标 */}
                                    <div className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${isLow ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>
                                        {isLow ? 'LOW' : 'OK'}
                                    </div>
                                </div>

                                {/* 编辑模式：修改预设 */}
                                {isEditingTargets && item.area === 'Prep' && currentDayTargets && (
                                    <div className="grid grid-cols-2 gap-2 bg-purple-500/20 p-2 rounded mb-1 animate-fade-in">
                                        <div>
                                            <label className="text-[9px] text-purple-200 block">Morning Target</label>
                                            <input type="number" className="w-full bg-dark-bg border border-purple-500/30 rounded px-1 text-white text-xs" 
                                                value={currentDayTargets.morning}
                                                onChange={(e) => handleTargetChange(item.id, 'morning', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] text-purple-200 block">Evening Target</label>
                                            <input type="number" className="w-full bg-dark-bg border border-purple-500/30 rounded px-1 text-white text-xs" 
                                                value={currentDayTargets.evening}
                                                onChange={(e) => handleTargetChange(item.id, 'evening', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                )}
                                
                                {/* 录入模式：损耗 / 盘点 / 补货 */}
                                {!isEditingTargets && (
                                    <div className="grid grid-cols-4 gap-2 mt-1 bg-dark-bg/30 p-2 rounded-lg border border-white/5 items-end">
                                        {/* 1. 损耗 (Loss) */}
                                        <div>
                                            <label className="text-[9px] uppercase font-bold text-red-400/70 block mb-1 text-center">Loss</label>
                                            <input type="number" className="w-full bg-dark-surface border border-white/10 rounded p-1 text-center font-bold text-red-400 outline-none text-xs focus:border-red-500"
                                                value={inputs[item.id]?.loss || ''}
                                                onChange={(e) => handleInputChange(item.id, 'loss', e.target.value)} placeholder="0" />
                                        </div>

                                        {/* 2. 现有 (Current/Pre) */}
                                        <div>
                                            <label className="text-[9px] uppercase font-bold text-dark-text-light block mb-1 text-center">Count</label>
                                            <input type="number" className="w-full bg-dark-surface border border-white/10 rounded p-1 text-center font-bold text-white outline-none text-xs focus:border-dark-accent"
                                                value={inputs[item.id]?.pre === undefined ? '' : inputs[item.id].pre}
                                                onChange={(e) => handleInputChange(item.id, 'pre', e.target.value)} placeholder="0" />
                                        </div>

                                        {/* 3. 补货 (Restock) */}
                                        <div className="relative">
                                            <label className="text-[9px] uppercase font-bold text-green-400/70 block mb-1 text-center">Add</label>
                                            <input type="number" className="w-full bg-dark-surface border border-white/10 rounded p-1 text-center font-bold text-green-400 outline-none text-xs focus:border-green-500"
                                                value={inputs[item.id]?.restock === undefined ? '' : inputs[item.id].restock}
                                                onChange={(e) => handleInputChange(item.id, 'restock', e.target.value)} 
                                                placeholder={suggestion > 0 ? `${suggestion}` : "0"} 
                                            />
                                            {/* 补货建议提示小红点 */}
                                            {suggestion > 0 && inputs[item.id]?.restock === undefined && (
                                                <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-pulse" title={`Suggested: ${suggestion}`}></div>
                                            )}
                                        </div>
                                        
                                        {/* 4. 结果 (Post) */}
                                        <div>
                                            <label className="text-[9px] uppercase font-bold text-dark-text-light block mb-1 text-center">Total</label>
                                            <div className="w-full bg-white/5 border border-white/5 rounded p-1 text-center font-black text-white text-xs">
                                                {post}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const StaffEditModal = ({ user, onSave, onClose }: { user: User | 'new', onSave: (user: User) => void, onClose: () => void }) => {
    const isNew = user === 'new';
    const [formData, setFormData] = useState<Partial<User>>(() => isNew ? { id: `u_${Date.now()}`, name: '', role: 'staff', phone: '', password: '', active: true } : user);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleChange = (field: keyof User, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        if (!formData.name) return alert('Name is required.');
        if (password !== confirmPassword) return alert('Passwords do not match.');
        
        const finalData = { ...formData };
        if (password) {
            finalData.password = password;
        }

        onSave(finalData as User);
    };

    const roles: UserRole[] = ['staff', 'manager', 'editor', 'maintenance', 'boss'];

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-dark-surface rounded-2xl p-6 w-full max-w-md shadow-2xl animate-pop-in border border-white/10 text-dark-text">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-black">{isNew ? 'Add New Staff' : `Edit ${formData.name}`}</h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10"><Icon name="X" /></button>
                </div>
                
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-xs font-bold text-dark-text-light mb-1 block">Name</label><input type="text" value={formData.name} onChange={e => handleChange('name', e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded" /></div>
                        <div><label className="text-xs font-bold text-dark-text-light mb-1 block">Role</label><select value={formData.role} onChange={e => handleChange('role', e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded capitalize"><option disabled>Select Role</option>{roles.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
                    </div>
                    <div><label className="text-xs font-bold text-dark-text-light mb-1 block">Phone Number</label><input type="text" value={formData.phone} onChange={e => handleChange('phone', e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded" /></div>
                    
                    <div className="border-t border-white/10 pt-4 mt-4">
                         <p className="text-xs text-dark-text-light mb-2">{isNew ? 'Set Login Password:' : 'Reset Login Password (optional):'}</p>
                         <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-bold text-dark-text-light mb-1 block">New Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded" /></div>
                            <div><label className="text-xs font-bold text-dark-text-light mb-1 block">Confirm Password</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full p-2 bg-dark-bg border border-white/10 rounded" /></div>
                         </div>
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/10 font-bold hover:bg-white/20">Cancel</button>
                    <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-dark-accent text-dark-bg font-bold shadow-lg hover:opacity-90">Save</button>
                </div>
            </div>
        </div>
    );
};


const StaffAvailabilityView = ({ t, users }: { t: any, users: User[] }) => {
    const [weekStart, setWeekStart] = useState(getStartOfWeek(new Date(), 1));
    const [availabilities, setAvailabilities] = useState<StaffAvailability[]>([]);
    const [loading, setLoading] = useState(true);

    const weekStartISO = formatDateISO(weekStart);
    // Explicitly use 14 days (2 weeks) here to prevent the table from becoming too wide
    // if the global schedule range is larger.
    const days = Array.from({ length: 14 }).map((_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });

    useEffect(() => {
        setLoading(true);
        const unsub = Cloud.subscribeToAvailabilitiesForWeek(weekStartISO, (data: any[]) => {
            setAvailabilities(data);
            setLoading(false);
        });
        return () => unsub();
    }, [weekStartISO]);

    const availabilityMap = new Map(availabilities.map(a => [a.userId, a.slots]));

    const changeWeek = (offset: number) => {
        setWeekStart(prev => {
            const newDate = new Date(prev);
            newDate.setDate(newDate.getDate() + offset * 7);
            return newDate;
        });
    };

    return (
        <div className="space-y-4">
            <div className="bg-dark-surface p-3 rounded-xl border border-white/10 flex justify-between items-center">
                <h3 className="font-bold text-dark-text">Staff Availability</h3>
                <div className="flex items-center gap-2">
                    <button onClick={() => changeWeek(-1)} className="p-2 bg-white/10 rounded-lg"><Icon name="ChevronLeft" size={16} /></button>
                    <span className="text-sm font-bold text-center w-28">{weekStartISO}</span>
                    <button onClick={() => changeWeek(1)} className="p-2 bg-white/10 rounded-lg"><Icon name="ChevronRight" size={16} /></button>
                </div>
            </div>
            {loading ? <div className="text-center p-8 text-dark-text-light">Loading...</div> : (
            <div className="overflow-x-auto bg-dark-surface p-2 rounded-xl border border-white/10">
                <table className="w-full text-xs text-center">
                    <thead>
                        <tr className="text-dark-text-light">
                            <th className="p-2 text-left sticky left-0 bg-dark-surface">Staff</th>
                            {days.map(d => <th key={d.toISOString()} className="p-2 font-normal">{d.toLocaleDateString('en-US', { weekday: 'short' })}<br/>{`${d.getMonth()+1}-${d.getDate()}`}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                        {users.filter(u=>u.active!==false).map(user => {
                            if (!user) return null;
                            const userSlots = availabilityMap.get(user.id);
                            return (
                                <tr key={user.id}>
                                    <td className="p-2 font-bold text-left sticky left-0 bg-dark-surface">{user.name}</td>
                                    {days.map(d => {
                                        const dateISO = formatDateISO(d);
                                        const slot = userSlots?.[dateISO];
                                        return (
                                            <td key={dateISO} className="p-2">
                                                <div className="flex flex-col gap-1 items-center">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] w-10 ${slot?.morning ? 'bg-green-500/20 text-green-300' : 'bg-white/5 text-dark-text-light opacity-50'}`}>AM</span>
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] w-10 ${slot?.evening ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-dark-text-light opacity-50'}`}>PM</span>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            )}
        </div>
    );
};


const ManagerDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { showNotification } = useNotification();
    const managerUser = data.users.find((u:User) => u.id === 'u_lambert') || { id: 'u_manager', name: 'Manager', role: 'manager', phone: '0000' };
    const { schedule, setSchedule, notices, logs, setLogs, t, directMessages, setDirectMessages, swapRequests, setSwapRequests, users, scheduleCycles, setScheduleCycles } = data;
    const [view, setView] = useState<'schedule' | 'logs' | 'chat' | 'financial' | 'requests' | 'planning' | 'availability' | 'confirmations'>('requests');
    const [editingShift, setEditingShift] = useState<{ dayIdx: number, shift: 'morning' | 'evening' | 'night' } | null>(null);
    // ...
    const [budgetMax, setBudgetMax] = useState<number>(() => Number(localStorage.getItem('onesip_budget_max')) || 5000);

    // 【修复 1】工资状态初始化：根据 PDF 精确预设
    const [wages, setWages] = useState<Record<string, { type: 'hourly'|'fixed', value: number }>>(() => {
        const saved = localStorage.getItem('onesip_wages_v2');
        if (saved) return JSON.parse(saved);
        
        // 如果没有保存过，使用 PDF 里的默认值
        const PRESETS: Record<string, { type: 'hourly'|'fixed', value: number }> = {
            // 时薪员工 (Hourly) - 按照 inclu. salary
            "Linda": { type: 'hourly', value: 13.18 },
            "Linda No.10": { type: 'hourly', value: 13.18 },
            "Najat": { type: 'hourly', value: 9.67 },
            "Najat no.11": { type: 'hourly', value: 9.67 },
            "Xinrui": { type: 'hourly', value: 6.15 },
            "Xinrui no.8": { type: 'hourly', value: 6.15 },
            "X. Li": { type: 'hourly', value: 9.67 }, // Maidou
            "X. Li no.6": { type: 'hourly', value: 9.67 },
            "Fatima": { type: 'hourly', value: 17.58 },
            "Fatima 015": { type: 'hourly', value: 17.58 },
            
            // 固定薪资员工 (Fixed) - 不随排班变动
            "Lambert": { type: 'fixed', value: 647.56 }, 
            "Yang": { type: 'fixed', value: 1100.46 }, 
        };

        const def: any = {};
        users.forEach((m: User) => {
            // 尝试匹配预设
            let setting = { type: 'hourly', value: 12 }; // 默认兜底
            
            // 1. 精确匹配
            if (PRESETS[m.name]) {
                setting = PRESETS[m.name];
            } else {
                // 2. 模糊匹配 (例如 "Lambert" 匹配 "Lambert")
                const foundKey = Object.keys(PRESETS).find(k => m.name.includes(k));
                if (foundKey) setting = PRESETS[foundKey];
            }
            // 强制类型转换 (TS)
            def[m.name] = { type: setting.type as 'hourly'|'fixed', value: setting.value };
        });
        return def;
    });
    
    // ...
    // 辅助：保存工资设置
    const saveWages = (newWages: any) => {
        setWages(newWages);
        localStorage.setItem('onesip_wages_v2', JSON.stringify(newWages));
    };

    // 辅助：获取某个人的“周成本” (用于计算)
    // 如果是月薪，自动换算成周：(月薪 * 12) / 52
    const getWageRateForCalc = (name: string) => {
        const setting = wages[name] || { type: 'hourly', value: 12 };
        if (setting.type === 'fixed') {
            return (setting.value * 12) / 52; // 把月薪摊薄到每周
        }
        return setting.value; // 时薪
    };
    const [isAddingManualLog, setIsAddingManualLog] = useState(false);
    const [logToInvalidate, setLogToInvalidate] = useState<LogEntry | null>(null);
    const [logPairToAdjust, setLogPairToAdjust] = useState<{ inLog: LogEntry, outLog: LogEntry } | null>(null);
    
    // Default the current week index to the current week of the month to avoid scrolling
    const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
    
    // 【新增】导出月份选择，默认当前月 (格式: YYYY-MM)
    const [exportMonth, setExportMonth] = useState(new Date().toISOString().slice(0, 7));

    // 【新增】名字清洗/标准化函数
    const normalizeName = (name: string) => {
        if (!name) return "Unknown";
        const clean = name.trim();
        
        const mapping: Record<string, string> = {
            "Linda": "Linda No.10",
            "Linda No.10": "Linda No.10",
            "Najat": "Najat no.11",
            "Najata": "Najat no.11",
            "Najat no.11": "Najat no.11",
            "Xinrui": "Xinrui no.8",
            "Xinrui no.8": "Xinrui no.8",
            "Tingshan": "T. Meng",
            "T.Meng": "T. Meng",
            "T. Meng": "T. Meng",
            "C.Y. Huang": "Zhiyi",
            "Zhiyi": "Zhiyi",
            "Y. Huang": "Kloe",
            "Kloe": "Kloe",
            "Fatima": "Fatima 015",
            "Allysha": "Allysha 016",
        };

        if (mapping[clean]) return mapping[clean];
        // 模糊匹配 (防止大小写或空格差异，只针对特定名字)
        if (clean.includes("Linda")) return "Linda No.10";
        if (clean.includes("Najat")) return "Najat no.11";
        if (clean.includes("Xinrui")) return "Xinrui no.8";
        if (clean.includes("Tingshan")) return "T. Meng";
        
        return clean; 
    };
  
    // Auto-extend schedule logic (Updated with name cleaning)
    useEffect(() => {
        const initSchedule = async () => {
             await Cloud.ensureScheduleCoverage();
        };
        initSchedule();

        // 【自动清洗排班表中的旧名字】
        if (schedule?.days?.length > 0) {
            let needsUpdate = false;
            const newDays = schedule.days.map((day: ScheduleDay) => {
                let dayUpdated = false;
                
                // 清洗 shifts 里的名字
                const newShifts = (day.shifts || []).map((shift: any) => {
                    const newStaff = shift.staff.map((name: string) => {
                        const fixed = normalizeName(name);
                        if (fixed !== name) { dayUpdated = true; needsUpdate = true; }
                        return fixed;
                    });
                    return { ...shift, staff: newStaff };
                });

                // 兼容旧字段 (morning/evening/night)
                const cleanLegacy = (list: string[] = []) => list.map(n => {
                    const fixed = normalizeName(n);
                    if (fixed !== n) { dayUpdated = true; needsUpdate = true; }
                    return fixed;
                });

                if (dayUpdated) {
                    return { 
                        ...day, 
                        shifts: newShifts,
                        morning: cleanLegacy(day.morning),
                        evening: cleanLegacy(day.evening),
                        night: cleanLegacy(day.night)
                    };
                }
                return day;
            });

            if (needsUpdate) {
                console.log("Performing schedule name normalization...");
                const newSchedule = { ...schedule, days: newDays };
                setSchedule(newSchedule);
                Cloud.saveSchedule(newSchedule);
            }
        }
    }, [schedule, setSchedule]);

    // Auto-extend schedule logic
    useEffect(() => {
        const initSchedule = async () => {
             await Cloud.ensureScheduleCoverage();
        };
        initSchedule();
    }, []);

    // Filter displayed days to the relevant 2-month window
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    // FIX: Filter schedule.days to show valid range only, avoiding old data pollution
    const displayedDays = (schedule?.days || []).filter((day: ScheduleDay) => {
        // Parse "M-D" date format from DB using current year context
        // This is a heuristic: if current month is Dec, and data is Jan, it's next year.
        const [m, d] = day.date.split('-').map(Number);
        const dayDate = new Date(now.getFullYear(), m - 1, d);
        
        // Handle year boundary (e.g. Current Month Dec, Next Month Jan)
        if (now.getMonth() === 11 && m === 1) {
            dayDate.setFullYear(now.getFullYear() + 1);
        }
        
        // Handle year boundary reverse check (unlikely but safe)
        if (now.getMonth() === 0 && m === 12) {
             dayDate.setFullYear(now.getFullYear() - 1);
        }

        return dayDate >= startOfCurrentMonth && dayDate <= endOfNextMonth;
    }).sort((a: ScheduleDay, b: ScheduleDay) => {
        // Sort explicitly by calculated timestamp
        const getDateObj = (dateStr: string) => {
             const [m, d] = dateStr.split('-').map(Number);
             const date = new Date(now.getFullYear(), m - 1, d);
             if (now.getMonth() === 11 && m === 1) date.setFullYear(now.getFullYear() + 1);
             return date;
        };
        return getDateObj(a.date).getTime() - getDateObj(b.date).getTime();
    });

    const totalWeeks = Math.ceil(displayedDays.length / 7);
    const activeStaff = users.filter((u: User) => u.active !== false);

     const handleUpdateLogs = async (updatedLogs: LogEntry[]) => {
        try {
            await Cloud.updateLogs(updatedLogs);
        } catch (error) {
            console.error("Failed to update logs:", error);
            alert("Error: Could not save log changes.");
        }
    };
    
    const handleInvalidateConfirm = (logToUpdate: LogEntry) => {
        const updatedLogs = logs.map((l: LogEntry) => l.id === logToUpdate.id ? logToUpdate : l);
        handleUpdateLogs(updatedLogs);
        setLogToInvalidate(null);
    };

    const handleOpenAdjustModal = (logToAdjust: LogEntry) => {
        if (logToAdjust.type !== 'clock-in' && logToAdjust.type !== 'clock-out') return;

        const userLogs = logs
            .filter((l: LogEntry) => l.userId === logToAdjust.userId && (l.type === 'clock-in' || l.type === 'clock-out'))
            .sort((a: LogEntry, b: LogEntry) => new Date(a.time).getTime() - new Date(b.time).getTime());

        const index = userLogs.findIndex((l: LogEntry) => l.id === logToAdjust.id);
        if (index === -1) return;

        if (logToAdjust.type === 'clock-in') {
            const outLog = userLogs.find((l: LogEntry, i: number) => i > index && l.type === 'clock-out');
            if (outLog) setLogPairToAdjust({ inLog: logToAdjust, outLog });
            else alert('Could not find a corresponding clock-out for this entry.');
        } else { // clock-out
            const inLog = userLogs.slice(0, index).reverse().find((l: LogEntry) => l.type === 'clock-in');
            if (inLog) setLogPairToAdjust({ inLog, outLog: logToAdjust });
            else alert('Could not find a corresponding clock-in for this entry.');
        }
    };

    const handleSaveAdjustedHours = (updatedInLog: LogEntry, updatedOutLog: LogEntry) => {
        const updatedLogs = logs.map((l: LogEntry) => {
            if (l.id === updatedInLog.id) return updatedInLog;
            if (l.id === updatedOutLog.id) return updatedOutLog;
            return l;
        });
        handleUpdateLogs(updatedLogs);
        setLogPairToAdjust(null);
    };

    const handleSaveManualLog = (inLog: LogEntry, outLog: LogEntry) => {
        Cloud.saveLog(inLog);
        Cloud.saveLog(outLog);
        setIsAddingManualLog(false);
        alert('Manual attendance record added.');
    };

    useEffect(() => {
        if (schedule?.days?.length > 0) {
            let needsUpdate = false;
            const newDays = schedule.days.map((day: ScheduleDay) => {
                const newMorning = day.morning.map(name => { if (name === 'Najata') { needsUpdate = true; return 'Najat'; } return name; });
                const newEvening = day.evening.map(name => { if (name === 'Najata') { needsUpdate = true; return 'Najat'; } return name; });
                const newNight = day.night?.map(name => { if (name === 'Najata') { needsUpdate = true; return 'Najat'; } return name; });
                return { ...day, morning: newMorning, evening: newEvening, night: newNight };
            });

            if (needsUpdate) {
                console.log("Performing one-time schedule name correction for 'Najata' -> 'Najat'");
                const newSchedule = { ...schedule, days: newDays };
                setSchedule(newSchedule);
                Cloud.saveSchedule(newSchedule);
            }
        }
    }, [schedule, setSchedule]);

    const handleWageChange = (name: string, val: string) => { const num = parseFloat(val); const newWages = { ...wages, [name]: isNaN(num) ? 0 : num }; setWages(newWages); localStorage.setItem('onesip_wages', JSON.stringify(newWages)); };
    const handleBudgetChange = (val: string) => { const b = parseFloat(val) || 0; setBudgetMax(b); localStorage.setItem('onesip_budget_max', b.toString()); };

// --- 1. 辅助函数：计算单次班次成本 ---
    const getShiftCost = (staff: string[], start: string, end: string) => {
        if (!staff || staff.length === 0) return 0;
        if (typeof start !== 'string' || typeof end !== 'string' || !start.includes(':') || !end.includes(':')) return 0;
        const s = parseInt(start.split(':')[0], 10) + (parseInt(start.split(':')[1] || '0', 10) / 60);
        const e = parseInt(end.split(':')[0], 10) + (parseInt(end.split(':')[1] || '0', 10) / 60);
        const duration = Math.max(0, e - s);
        // 使用当前工资状态计算
        return staff.reduce((acc, name) => acc + (duration * (wages[name] || 12)), 0);
    };

// --- 2. 核心：计算全局财务概览 (支持固定薪资/时薪) ---
    const calculateFinancials = () => {
        const stats: Record<string, any> = {};

        const getStats = (rawName: string) => {
            const name = normalizeName(rawName);
            if (!stats[name]) {
                stats[name] = { estHours: 0, estCost: 0, actualHours: 0, actualCost: 0, wageType: 'hourly' };
            }
            return stats[name];
        };

        // 1. 初始化
        activeStaff.forEach((m: User) => {
            const s = getStats(m.name);
            const setting = wages[m.name] || { type: 'hourly', value: 12 };
            s.wageType = setting.type;
        });
        
        // 2. 预计工时 (排班) - 只对 hourly 累加时长
        if (displayedDays) { 
            displayedDays.forEach((day: ScheduleDay) => { 
                const shifts = day.shifts || [];
                if (shifts.length > 0) {
                    shifts.forEach((s: any) => {
                        let hours = 5; 
                        if (s.start && s.end) {
                            const startH = parseInt(s.start.split(':')[0]) + (parseInt(s.start.split(':')[1]||'0')/60);
                            const endH = parseInt(s.end.split(':')[0]) + (parseInt(s.end.split(':')[1]||'0')/60);
                            hours = Math.max(0, endH - startH);
                        }
                        if (Array.isArray(s.staff)) s.staff.forEach((p: string) => getStats(p).estHours += hours);
                    });
                } else {
                    // Fallback
                    (day.morning || []).forEach(p => getStats(p).estHours += 5);
                    (day.evening || []).forEach(p => getStats(p).estHours += 5);
                    (day.night || []).forEach(p => getStats(p).estHours += 5);
                }
            }); 
        }
        
        // 3. 实际工时 (Logs)
        const logsByUser: Record<string, LogEntry[]> = {};
        if (logs) { 
            logs.forEach((l: LogEntry) => { 
                if (l.isDeleted) return; 
                if (!safeParseDate(l.time)) return;
                let rawName = l.name || 'Unknown';
                if (l.userId) { const u = users.find(user => user.id === l.userId); if (u) rawName = u.name; }
                const finalName = normalizeName(rawName);
                if (!logsByUser[finalName]) logsByUser[finalName] = []; 
                logsByUser[finalName].push(l); 
            }); 
        }
        
        // 4. 配对计算实际时长
        Object.entries(logsByUser).forEach(([userName, userLogs]) => { 
            const s = getStats(userName);
            const sorted = userLogs.sort((a, b) => (safeParseDate(a.time)?.getTime() || 0) - (safeParseDate(b.time)?.getTime() || 0)); 
            const processedInIds = new Set<number>();

            sorted.forEach((outLog) => {
                if (outLog.type === 'clock-out') {
                    const outTime = safeParseDate(outLog.time)?.getTime() || 0;
                    const outDateStr = new Date(outTime).toDateString();
                    const matchingIn = sorted.filter(l => l.type === 'clock-in' && !processedInIds.has(l.id) && safeParseDate(l.time)?.toDateString() === outDateStr && (safeParseDate(l.time)?.getTime()||0) < outTime)
                        .sort((a, b) => (safeParseDate(b.time)?.getTime()||0) - (safeParseDate(a.time)?.getTime()||0))[0]; 
                    if (matchingIn) {
                        const duration = (outTime - (safeParseDate(matchingIn.time)?.getTime()||0)) / (1000 * 60 * 60);
                        if (duration > 0) {
                            s.actualHours += duration;
                            processedInIds.add(matchingIn.id);
                        }
                    }
                }
            });
        });

            // ... (前面代码不变)

        // 5. 汇总金额 (区分 Fixed 和 Hourly)
        let totalEstCost = 0; 
        let totalActualCost = 0;
        
        Object.keys(stats).forEach(name => { 
            const s = stats[name];
            // 【关键修复】获取工资设置
            const setting = wages[name] || { type: 'hourly', value: 12 };
            
            if (setting.type === 'fixed') {
                // 月薪制：按周平摊成本 (月薪 * 12 / 52)
                const weeklyFixedCost = (setting.value * 12) / 52;
                s.estCost = weeklyFixedCost;
                s.actualCost = weeklyFixedCost; // 视为已付，无差异
            } else {
                // 时薪制：工时 * 时薪
                s.estCost = s.estHours * setting.value;
                s.actualCost = s.actualHours * setting.value;
            }
            
            totalEstCost += s.estCost; 
            totalActualCost += s.actualCost; 
        });

        return { stats, totalEstCost, totalActualCost };
    };

    // 【👇 必须补上这一行，否则 totalEstCost 就没有定义 👇】
    const { stats, totalEstCost, totalActualCost } = calculateFinancials();


// --- 3. 新增：每日财务明细 (Daily Breakdown) - 修复 NaN 问题 ---
    const getDailyFinancials = () => {
        return displayedDays.map((day: ScheduleDay) => {
            // 临时存储：name -> { est, act, setting }
            const staffMap: Record<string, { est: number, act: number, setting: { type: string, value: number } }> = {};

            // 1. 预计成本 (Estimate)
            const scheduleShifts = day.shifts || [];
            if (scheduleShifts.length === 0) {
                 // 兼容旧数据
                 (day.morning||[]).forEach(p => addEst(p, 5));
                 (day.evening||[]).forEach(p => addEst(p, 5));
                 (day.night||[]).forEach(p => addEst(p, 5));
            }

            // 辅助：累加预计金额
            function addEst(rawName: string, hours: number) {
                const name = normalizeName(rawName);
                const setting = wages[name] || { type: 'hourly', value: 12 };
                
                if (!staffMap[name]) staffMap[name] = { est: 0, act: 0, setting };
                
                // 【核心逻辑】
                // 如果是时薪：成本 = 工时 * 时薪
                // 如果是固定月薪：每日变动成本为 0 (因为钱已经付了，不随排班增加)
                if (setting.type === 'hourly') {
                    staffMap[name].est += hours * setting.value;
                }
            }

            scheduleShifts.forEach((shift: any) => {
                let hours = 5;
                if (shift.start && shift.end) {
                    const s = parseInt(shift.start.split(':')[0]) + (parseInt(shift.start.split(':')[1]||'0')/60);
                    const e = parseInt(shift.end.split(':')[0]) + (parseInt(shift.end.split(':')[1]||'0')/60);
                    hours = Math.max(0, e - s);
                }
                if (Array.isArray(shift.staff)) {
                    shift.staff.forEach((p: string) => addEst(p, hours));
                }
            });

            // 2. 实际成本 (Actual - Logs)
            const parseScheduleDate = (dStr: string) => {
                const parts = dStr.split('-');
                const now = new Date();
                if(parts.length === 2) return new Date(now.getFullYear(), parseInt(parts[0])-1, parseInt(parts[1]));
                return new Date(dStr);
            };
            const scheduleDateObj = parseScheduleDate(day.date);
            const targetFingerprint = `${scheduleDateObj.getMonth()}-${scheduleDateObj.getDate()}`;

            const dayLogs = logs.filter(l => {
                const lDate = safeParseDate(l.time);
                if (!lDate || l.isDeleted) return false;
                return `${lDate.getMonth()}-${lDate.getDate()}` === targetFingerprint;
            });

            const logsByUser: Record<string, LogEntry[]> = {};
            dayLogs.forEach(l => {
                let rawName = l.name || 'Unknown';
                if (l.userId) { const u = users.find(user => user.id === l.userId); if (u) rawName = u.name; }
                const finalName = normalizeName(rawName);
                if (!logsByUser[finalName]) logsByUser[finalName] = [];
                logsByUser[finalName].push(l);
            });

            Object.entries(logsByUser).forEach(([userName, userLogs]) => {
                const setting = wages[userName] || { type: 'hourly', value: 12 };
                if (!staffMap[userName]) staffMap[userName] = { est: 0, act: 0, setting };

                // 【核心逻辑】如果是固定月薪，实际打卡成本也视为 0
                if (setting.type === 'fixed') return;

                // 计算工时
                userLogs.sort((a,b) => (safeParseDate(a.time)?.getTime()||0) - (safeParseDate(b.time)?.getTime()||0));
                const processedInIds = new Set<number>();
                let userHours = 0;

                userLogs.forEach((outLog) => {
                    if (outLog.type === 'clock-out') {
                        const outTime = safeParseDate(outLog.time)?.getTime() || 0;
                        const matchingIn = userLogs.filter(l => l.type === 'clock-in' && !processedInIds.has(l.id) && (safeParseDate(l.time)?.getTime()||0) < outTime)
                            .sort((a, b) => (safeParseDate(b.time)?.getTime()||0) - (safeParseDate(a.time)?.getTime()||0))[0];

                        if (matchingIn) {
                            const diff = (outTime - (safeParseDate(matchingIn.time)?.getTime()||0)) / (1000*60*60);
                            if (diff > 0) { userHours += diff; processedInIds.add(matchingIn.id); }
                        }
                    }
                });
                
                // 【修复】使用 setting.value 计算实际金额 (之前没加 .value 导致 NaN)
                staffMap[userName].act += userHours * setting.value;
            });

            // 3. 汇总
            let estTotal = 0; let actTotal = 0;
            const details = Object.entries(staffMap).map(([name, data]) => {
                estTotal += data.est;
                actTotal += data.act;
                return { name, est: data.est, act: data.act, diff: data.act - data.est }; 
            }).sort((a, b) => b.act - a.act); 

            return {
                date: day.date,
                name: day.name,
                est: estTotal,
                act: actTotal,
                diff: estTotal - actTotal, 
                details: details 
            };
        });
    };

// --- 4. 导出逻辑：财务汇总报表 (名字清洗版) ---
    const handleExportFinancialCSV = () => {
        let csv = "FINANCIAL SUMMARY REPORT\n";
        csv += `Report Date,${new Date().toLocaleDateString()}\n`;
        csv += `Budget Max,${budgetMax}\n`;
        csv += `Total Estimated Cost (Schedule),${totalEstCost.toFixed(2)}\n`;
        csv += `Total Actual Cost (Logs),${totalActualCost.toFixed(2)}\n`;
        csv += `Balance (Budget - Actual),${(budgetMax - totalActualCost).toFixed(2)}\n\n`;

        csv += "STAFF PAYROLL SUMMARY\n";
        csv += "Name,Hourly Wage,Est. Hours,Est. Cost,Act. Hours,Act. Cost,Difference (Act - Est)\n";
        
        // stats 对象已经在 calculateFinancials 里被 normalizeName 清洗过了，所以这里直接用
        Object.keys(stats).forEach(name => {
            const s = stats[name];
            if (s.estHours > 0 || s.actualHours > 0) {
                const diffCost = s.actualCost - s.estCost;
                csv += `"${name}",${wages[name] || 0},${s.estHours.toFixed(1)},${s.estCost.toFixed(2)},${s.actualHours.toFixed(1)},${s.actualCost.toFixed(2)},${diffCost.toFixed(2)}\n`;
            }
        });

        const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csv);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `financial_summary_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

// --- 导出优化版打卡记录 (名字清洗版) ---
    const handleExportLogsCSV = () => {
        let csv = "Date,Staff Name,User ID,Hourly Wage,Clock In,Clock Out,Duration (Hrs),Cost,Status/Note\n";
        const allRows: { timestamp: number; csvLine: string }[] = [];

        // 1. 数据准备 (清洗名字)
        const logsByUser: Record<string, LogEntry[]> = {};
        logs.forEach(l => {
            if (l.isDeleted) return; 
            if (!safeParseDate(l.time)) return;

            // 【核心】：名字清洗
            let finalName = 'Unknown';
            let finalId = l.userId || 'unknown';
            
            if (l.userId) {
                const u = users.find(user => user.id === l.userId);
                if (u) finalName = u.name;
            }
            if (finalName === 'Unknown' && l.name) finalName = normalizeName(l.name);

            // 用清洗后的名字作为 Key，合并同一个人
            // 为了防止 ID 不同但名字相同的人被分开，我们统一用名字分组（或者你自己决定）
            // 这里为了安全，我们用 Name 分组
            if (!logsByUser[finalName]) logsByUser[finalName] = [];
            logsByUser[finalName].push(l);
        });

        // 2. 遍历处理
        Object.entries(logsByUser).forEach(([userName, userLogs]) => {
            // 尝试找 ID 用于显示
            const sampleLog = userLogs.find(l => l.userId) || userLogs[0];
            const userId = sampleLog.userId || 'legacy';
            const wage = wages[userName] || 12;

            userLogs.sort((a,b) => (safeParseDate(a.time)?.getTime()||0) - (safeParseDate(b.time)?.getTime()||0));
            const processedIds = new Set<number>();

            userLogs.forEach((log, index) => {
                if (processedIds.has(log.id)) return;
                const logTime = safeParseDate(log.time);
                if (!logTime) return;
                
                const y = logTime.getFullYear();
                const m = String(logTime.getMonth() + 1).padStart(2, '0');
                if (`${y}-${m}` !== exportMonth) return; // 筛选月份

                const d = String(logTime.getDate()).padStart(2, '0');
                const dateStr = `${y}-${m}-${d}`;
                const timeStr = logTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

                // ... (GPS 状态判断逻辑保持不变)
                const getGeoStatus = (l: LogEntry) => {
                    if (l.isManual) return 'Manual';
                    const r = l.reason || '';
                    if (r.includes('In Range') || r.includes('<500m')) return 'OK';
                    if (r.includes('GPS Error')) return 'Check';
                    return 'Fail';
                };

                if (log.type === 'clock-in') {
                    const matchingOut = userLogs.slice(index + 1).find(l => 
                        l.type === 'clock-out' && 
                        !processedIds.has(l.id) &&
                        safeParseDate(l.time)?.toDateString() === logTime.toDateString()
                    );

                    if (matchingOut) {
                        const outTimeObj = safeParseDate(matchingOut.time);
                        const outTimeStr = outTimeObj?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) || '-';
                        const duration = ((outTimeObj?.getTime() || 0) - logTime.getTime()) / (1000 * 60 * 60);
                        const cost = duration * wage;
                        
                        // 状态判断
                        const inStatus = getGeoStatus(log);
                        const outStatus = getGeoStatus(matchingOut);
                        let finalStatus = 'Normal';
                        if (inStatus === 'Manual' || outStatus === 'Manual') finalStatus = 'Manual Entry';
                        else if (inStatus === 'Fail' || outStatus === 'Fail') finalStatus = 'Location Failed';
                        else if (inStatus === 'Check' || outStatus === 'Check') finalStatus = 'GPS Check Needed';

                        allRows.push({
                            timestamp: logTime.getTime(),
                            csvLine: `${dateStr},"${userName}",${userId},${wage},${timeStr},${outTimeStr},${duration.toFixed(2)},${cost.toFixed(2)},${finalStatus}\n`
                        });
                        processedIds.add(log.id);
                        processedIds.add(matchingOut.id);
                    } else {
                        allRows.push({
                            timestamp: logTime.getTime(),
                            csvLine: `${dateStr},"${userName}",${userId},${wage},${timeStr},-,0.00,0.00,Missing Clock-Out\n`
                        });
                        processedIds.add(log.id);
                    }
                } else if (log.type === 'clock-out') {
                    allRows.push({
                        timestamp: logTime.getTime(),
                        csvLine: `${dateStr},"${userName}",${userId},${wage},-,${timeStr},0.00,0.00,Missing Clock-In\n`
                    });
                    processedIds.add(log.id);
                }
            });
        });

        allRows.sort((a, b) => b.timestamp - a.timestamp); // 倒序

        if (allRows.length === 0) { alert(`No logs found for ${exportMonth}`); return; }

        allRows.forEach(row => csv += row.csvLine);
        const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csv);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `attendance_${exportMonth}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // 本周排班预估 (用于 Planning View)
    const totalWeeklyPlanningCost = displayedDays?.slice(0, 7).reduce((acc: number, day: ScheduleDay) => {
        const m = getShiftCost(day.morning, day.hours?.morning?.start || '10:00', day.hours?.morning?.end || '15:00');
        const e = getShiftCost(day.evening, day.hours?.evening?.start || '14:30', day.hours?.evening?.end || '19:00');
        const n = day.night ? getShiftCost(day.night, day.hours?.night?.start || '18:00', day.hours?.night?.end || '22:00') : 0;
        return acc + m + e + n;
    }, 0) || 0;

    const handleApplySwap = async (reqId: string) => {
        const req = swapRequests.find((r: SwapRequest) => r.id === reqId);
        if (!req) { showNotification({ type: 'announcement', title: "Error", message: "Swap request not found." }); return; }
        if (req.status !== 'accepted_by_peer') { showNotification({ type: 'announcement', title: "Action Not Allowed", message: "Only peer-accepted requests can be processed." }); return; }
        
        const newSchedule = JSON.parse(JSON.stringify(schedule));
        const { requesterName, targetName, requesterDate, requesterShift } = req;
        const normalizedRequesterDate = normalizeDateKey(requesterDate);
        const dayIndex = newSchedule.days.findIndex((d: ScheduleDay) => normalizeDateKey(d.date) === normalizedRequesterDate);

        if (dayIndex === -1) { showNotification({ type: 'announcement', title: "Schedule Error", message: `Date ${requesterDate} not found.`}); return; }
        const day = newSchedule.days[dayIndex];
        const shiftStaff = day[requesterShift];

        if (!shiftStaff.includes(requesterName)) {
             showNotification({ type: 'announcement', title: "Schedule Conflict", message: `${requesterName} not found in shift.`});
             // Auto-reject
             const updatedReqs = swapRequests.map((r: SwapRequest) => r.id === reqId ? { ...r, status: 'auto_conflict_declined' } : r);
             await Cloud.updateSwapRequests(updatedReqs);
             return;
        }

        if (shiftStaff.includes(targetName)) {
             showNotification({ type: 'announcement', title: "Schedule Conflict", message: `${targetName} is already in that shift.`});
             const updatedReqs = swapRequests.map((r: SwapRequest) => r.id === reqId ? { ...r, status: 'auto_conflict_declined' } : r);
             await Cloud.updateSwapRequests(updatedReqs);
             return;
        }
        
        // Apply swap
        day[requesterShift] = shiftStaff.map((name: string) => name === requesterName ? targetName : name);
        
        try {
            await Cloud.saveSchedule(newSchedule);
            const updatedReqs = swapRequests.map((r: SwapRequest) => r.id === reqId ? { ...r, status: 'completed', appliedToSchedule: true } : r);
            await Cloud.updateSwapRequests(updatedReqs);
            showNotification({type: 'message', title: "Success", message: "Swap approved and schedule updated."});
        } catch(e) {
            console.error("Swap apply error", e);
            showNotification({type: 'announcement', title: "Save Error", message: "Could not save changes."});
        }
    };


    const handleSaveSchedule = (updatedShifts: any[]) => { 
        if (!editingShift) return; 
        const { dayIdx } = editingShift; // 现在我们只需要 dayIdx
        
        const targetDay = displayedDays[dayIdx];
        const realIndex = schedule.days.findIndex((d: ScheduleDay) => d.date === targetDay.date);

        if (realIndex === -1) return;

        const newSched = JSON.parse(JSON.stringify(schedule));
        
        // 更新新的 shifts 字段
        newSched.days[realIndex].shifts = updatedShifts;

        // 同时清空旧字段以避免混淆 (可选，为了数据干净建议做)
        newSched.days[realIndex].morning = [];
        newSched.days[realIndex].evening = [];
        newSched.days[realIndex].night = [];
        
        setSchedule(newSched); 
        Cloud.saveSchedule(newSched); 
        setEditingShift(null); 
    };

    const allReqs = swapRequests?.slice().sort((a: SwapRequest, b: SwapRequest) => b.timestamp - a.timestamp) || [];

    const visibleLogs = logs?.filter((log: LogEntry) => !log.isDeleted).slice().reverse() || [];
    
    const today = new Date();
    const currentCycle = scheduleCycles.find((c: ScheduleCycle) => {
      const start = new Date(c.startDate);
      const end = new Date(c.endDate);
      return today >= start && today <= end;
    });

    const handlePublishSchedule = async () => {
        if (!window.confirm(`Publish schedule for the current view? Staff will be notified.`)) return;

        // Use displayed range
        const startDate = displayedDays[0].date;
        const endDate = displayedDays[displayedDays.length - 1].date;
        const year = new Date().getFullYear();

        // Construct ISO range
        const startISO = `${year}-${startDate.split('-').map(p=>p.padStart(2,'0')).join('-')}`;
        const endISO = `${year}-${endDate.split('-').map(p=>p.padStart(2,'0')).join('-')}`;
        
        const cycleId = `${startISO}_${endISO}`;

        const confirmations: ScheduleCycle['confirmations'] = {};
        activeStaff.forEach((u: User) => {
            confirmations[u.id] = { status: 'pending', viewed: false };
        });

        const snapshot: ScheduleCycle['snapshot'] = {};
        displayedDays.forEach((d: ScheduleDay) => {
            snapshot[d.date] = {
                morning: d.morning,
                evening: d.evening,
                night: d.night,
            };
        });

        const newCycle: ScheduleCycle = {
            cycleId,
            startDate: startISO,
            endDate: endISO,
            publishedAt: new Date().toISOString(),
            status: 'published',
            confirmations,
            snapshot,
        };

        const updatedCycles = scheduleCycles.filter((c: ScheduleCycle) => c.cycleId !== cycleId);
        updatedCycles.push(newCycle);

        await Cloud.updateScheduleCycles(updatedCycles);
        showNotification({ type: 'message', title: 'Schedule Published!', message: `Staff have been notified.`});
    };

    return (
        <div className="min-h-screen max-h-[100dvh] overflow-hidden flex flex-col bg-dark-bg text-dark-text font-sans pt-[calc(env(safe-area-inset-top)_+_2rem)] md:pt-0">
            <div className="bg-dark-surface p-4 shadow-lg flex justify-between items-center shrink-0 border-b border-white/10">
                <div><h1 className="text-xl font-black tracking-tight text-white">{t.manager_title}</h1><p className="text-xs text-dark-text-light">User: {managerUser.name}</p></div>
                <button onClick={onExit} className="bg-white/10 p-2 rounded hover:bg-white/20 transition-all"><Icon name="LogOut" /></button>
            </div>
            <div className="flex bg-dark-bg p-2 gap-2 overflow-x-auto shrink-0 shadow-inner">
                {['requests', 'schedule', 'planning', 'availability', 'chat', 'logs', 'financial', 'confirmations'].map(v => (
                    <button key={v} onClick={() => setView(v as any)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${view === v ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                        {v} {v === 'requests' && allReqs.filter(r => r.status === 'accepted_by_peer' && !r.appliedToSchedule).length > 0 && `(${allReqs.filter(r => r.status === 'accepted_by_peer' && !r.appliedToSchedule).length})`}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                {view === 'requests' && (
                    <div className="space-y-4">
                        <div className="bg-dark-surface p-3 rounded-xl shadow-sm border border-white/10">
                            <h3 className="font-bold text-dark-text">Swap Requests Log</h3>
                        </div>
                        {allReqs.length === 0 && <p className="text-dark-text-light text-center py-10 bg-dark-surface rounded-xl border border-white/10">No swap requests found.</p>}
                        {allReqs.map((req: SwapRequest) => {
                            const statusColors: any = {
                                pending: 'bg-yellow-500/10 text-yellow-400',
                                rejected: 'bg-red-500/10 text-red-400',
                                cancelled: 'bg-gray-500/10 text-gray-400',
                                accepted_by_peer: 'bg-green-500/10 text-green-400',
                                completed: 'bg-blue-500/10 text-blue-400',
                                auto_conflict_declined: 'bg-red-500/20 text-red-300',
                            };
                            return (
                                <div key={req.id} className="bg-dark-surface p-4 rounded-xl shadow-sm border border-white/10">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="text-sm text-dark-text-light"><strong className="text-white">{req.requesterName}</strong> wants to swap with <strong className="text-white">{req.targetName}</strong></p>
                                            <p className="text-xs text-gray-400 mt-1">Requested: {formattedDate(req.timestamp)}</p>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded font-bold capitalize ${statusColors[req.status] || 'bg-gray-500/10 text-gray-400'}`}>{req.status.replace(/_/g, ' ')}</span>
                                    </div>
                                    <div className="bg-dark-bg p-3 rounded-lg text-sm text-dark-text-light mb-4 space-y-2">
                                        <div className="flex justify-between"><span>{req.requesterName}'s shift:</span> <strong className="font-mono text-white">{req.requesterDate} ({req.requesterShift})</strong></div>
                                    </div>
                                    {req.reason && <p className="text-xs italic text-gray-400 border-t border-white/10 pt-2 mt-2">Reason: {req.reason}</p>}
                                    
                                    <div className="mt-4">
                                    {(req.status === 'accepted_by_peer' || req.status === 'auto_conflict_declined') && !req.appliedToSchedule && (
                                        <div className="grid grid-cols-2 gap-2">
                                        <button onClick={() => {}} className="w-full bg-red-600/50 text-white/80 py-2.5 rounded-lg font-bold text-xs" disabled>Reject</button>
                                        <button onClick={() => handleApplySwap(req.id)} className="w-full bg-dark-accent text-dark-bg py-2.5 rounded-lg font-bold shadow-md active:scale-95 transition-all hover:opacity-90 text-xs">
                                            Approve & Apply
                                        </button>
                                        </div>
                                    )}
                                    {req.status === 'completed' && req.appliedToSchedule === true && (
                                        <div className="text-center text-xs font-bold text-green-400 border border-green-500/20 bg-green-500/10 py-2 rounded-lg">
                                            Applied to Schedule
                                        </div>
                                    )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                 {view === 'availability' && <StaffAvailabilityView t={t} users={users} />}
                {view === 'chat' && <ChatView t={t} currentUser={managerUser} messages={directMessages} setMessages={setDirectMessages} notices={notices} isManager={true} onExit={() => setView('requests')} sopList={data.sopList} trainingLevels={data.trainingLevels} allUsers={users} />}
                {view === 'schedule' && (
                    <div className="space-y-3 pb-10">
                        <div className="bg-dark-surface p-4 rounded-xl border border-white/10 shadow-sm mb-4 sticky top-0 z-20">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-dark-text mb-2">
                                    Week {currentWeekIndex + 1} of {totalWeeks}
                                </h3>
                                <div className="flex gap-2">
                                    <button onClick={() => setCurrentWeekIndex(Math.max(0, currentWeekIndex - 1))} disabled={currentWeekIndex === 0} className="p-2 bg-white/10 rounded-lg disabled:opacity-50"><Icon name="ChevronLeft" size={16}/></button>
                                    <button onClick={() => setCurrentWeekIndex(Math.min(totalWeeks - 1, currentWeekIndex + 1))} disabled={currentWeekIndex >= totalWeeks - 1} className="p-2 bg-white/10 rounded-lg disabled:opacity-50"><Icon name="ChevronRight" size={16}/></button>
                                </div>
                            </div>
                            <p className="text-xs text-dark-text-light">Tap "Edit" to manage shifts.</p>
                            <button onClick={handlePublishSchedule} className="w-full mt-3 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-lg">
                                Publish Current View ({displayedDays.length} days)
                            </button>
                        </div>
                        {displayedDays?.slice(currentWeekIndex * 7, (currentWeekIndex + 1) * 7).map((day: ScheduleDay, dayIndexInWeek: number) => {
                            const absoluteDayIndex = currentWeekIndex * 7 + dayIndexInWeek;
                            // 数据兼容：如果只有旧数据，临时转换一下显示（不存库）
                            let displayShifts = day.shifts || [];
                            if (displayShifts.length === 0) {
                                if (day.morning && day.morning.length) displayShifts.push({ name: 'Shift 1', start: day.hours?.morning?.start||'10:00', end: day.hours?.morning?.end||'15:00', staff: day.morning });
                                if (day.evening && day.evening.length) displayShifts.push({ name: 'Shift 2', start: day.hours?.evening?.start||'14:30', end: day.hours?.evening?.end||'19:00', staff: day.evening });
                                if (day.night && day.night.length) displayShifts.push({ name: 'Shift 3', start: day.hours?.night?.start||'18:00', end: day.hours?.night?.end||'22:00', staff: day.night });
                            }

                            return (
                                <div key={absoluteDayIndex} className="bg-dark-surface p-3 rounded-xl shadow-sm border border-white/10">
                                    <div className="flex justify-between mb-3 items-center">
                                        <div>
                                            <span className="font-bold text-dark-text mr-2">{day.name}</span>
                                            <span className="text-xs text-dark-text-light">{day.date}</span>
                                        </div>
                                        {/* 点击 Edit 按钮触发新的全天编辑器，不再区分 shiftType */}
                                        <button onClick={() => setEditingShift({ dayIdx: absoluteDayIndex, shift: 'all' })} className="px-3 py-1 bg-white/10 rounded text-[10px] font-bold text-white hover:bg-white/20">Edit Shifts</button>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        {displayShifts.length > 0 ? displayShifts.map((shift: any, idx: number) => (
                                            <div key={idx} className="flex items-center gap-3 bg-dark-bg p-2 rounded border border-white/5">
                                                <div className="w-16 shrink-0 flex flex-col items-center">
                                                    <span className="text-[9px] font-bold text-dark-accent bg-dark-accent/10 px-1.5 py-0.5 rounded uppercase">班次 {idx + 1}</span>
                                                    <span className="text-[9px] text-dark-text-light font-mono mt-0.5">{shift.start}-{shift.end}</span>
                                                </div>
                                                <div className="flex-1 flex flex-wrap gap-1">
                                                    {shift.staff.length > 0 ? shift.staff.map((s: string, i: number) => (
                                                        <span key={i} className="text-xs text-white bg-white/10 px-2 py-0.5 rounded">{s}</span>
                                                    )) : <span className="text-xs text-dark-text-light italic">Empty</span>}
                                                </div>
                                            </div>
                                        )) : <p className="text-xs text-dark-text-light italic p-2">No shifts scheduled.</p>}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
                {view === 'planning' && (
                    <div className="space-y-4 pb-10">
                        <div className="bg-dark-surface p-5 rounded-xl border border-white/10 mb-4 shadow-lg">
                            <h3 className="font-bold text-dark-text mb-2 flex items-center gap-2 uppercase tracking-wider text-sm">
                                <Icon name="Briefcase" size={16}/> Staff Planning & Cost
                            </h3>
                            <p className="text-xs text-dark-text-light mb-4">
                                Live estimate based on current schedule (Current Week View).
                            </p>
                            <div className="flex justify-between items-center bg-dark-bg p-4 rounded-xl border border-white/5">
                                <span className="text-xs font-bold text-dark-text-light uppercase">Total Weekly Forecast</span>
                                <span className="text-2xl font-black text-green-400">€{totalWeeklyPlanningCost.toFixed(0)}</span>
                            </div>
                        </div>

                        {displayedDays?.slice(currentWeekIndex * 7, (currentWeekIndex + 1) * 7).map((day: ScheduleDay, idxInView: number) => { 
                            const absoluteIdx = currentWeekIndex * 7 + idxInView;
                            
                            const mStart = day.hours?.morning?.start || '10:00';
                            const mEnd = day.hours?.morning?.end || '15:00';
                            const eStart = day.hours?.evening?.start || '14:30';
                            const eEnd = day.hours?.evening?.end || '19:00';
                            const nStart = day.hours?.night?.start || '18:00';
                            const nEnd = day.hours?.night?.end || '22:00';

                            const mCost = getShiftCost(day.morning, mStart, mEnd);
                            const eCost = getShiftCost(day.evening, eStart, eEnd);
                            const nCost = day.night ? getShiftCost(day.night, nStart, nEnd) : 0;
                            
                            const isWeekend = ['Friday', 'Saturday', 'Sunday'].includes(day.name);

                            return (
                                <div key={absoluteIdx} className="bg-dark-surface p-4 rounded-xl shadow-sm border border-white/10">
                                    <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-2">
                                        <div>
                                            <span className="font-bold text-dark-text">{day.name}</span>
                                            <span className="text-xs text-dark-text-light ml-2">{day.date}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-[10px] text-dark-text-light uppercase">Daily Cost</span>
                                            <span className="font-bold text-white">€{(mCost + eCost + nCost).toFixed(0)}</span>
                                        </div>
                                    </div>
                                    
                                    <div onClick={() => setEditingShift({ dayIdx: absoluteIdx, shift: 'morning' })} className="mb-2 p-3 bg-dark-bg rounded-lg border border-white/5 hover:border-orange-500/30 cursor-pointer transition-all" >
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-bold">AM</span>
                                                <span className="text-[10px] text-dark-text-light font-mono">{mStart}-{mEnd}</span>
                                            </div>
                                            <span className="text-xs font-mono text-dark-text-light">€{mCost.toFixed(0)}</span>
                                        </div>
                                        <div className="space-y-1">
                                            {day.morning.length > 0 ? day.morning.map((name, i) => (
                                                <div key={i} className="flex justify-between text-xs">
                                                    <span className="text-dark-text font-medium">{name}</span>
                                                    <span className="text-dark-text-light text-[10px] opacity-60">€{wages[name] || 12}/h</span>
                                                </div>
                                            )) : <span className="text-xs text-dark-text-light italic">Empty Shift</span>}
                                        </div>
                                    </div>

                                    <div onClick={() => setEditingShift({ dayIdx: absoluteIdx, shift: 'evening' })} className="p-3 bg-dark-bg rounded-lg border border-white/5 hover:border-blue-500/30 cursor-pointer transition-all" >
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold">PM</span>
                                                <span className="text-[10px] text-dark-text-light font-mono">{eStart}-{eEnd}</span>
                                            </div>
                                            <span className="text-xs font-mono text-dark-text-light">€{eCost.toFixed(0)}</span>
                                        </div>
                                        <div className="space-y-1">
                                            {day.evening.length > 0 ? day.evening.map((name, i) => (
                                                <div key={i} className="flex justify-between text-xs">
                                                    <span className="text-dark-text font-medium">{name}</span>
                                                    <span className="text-dark-text-light text-[10px] opacity-60">€{wages[name] || 12}/h</span>
                                                </div>
                                            )) : <span className="text-xs text-dark-text-light italic">Empty Shift</span>}
                                        </div>
                                    </div>
                                    
                                    {isWeekend && (
                                        <div onClick={() => setEditingShift({ dayIdx: absoluteIdx, shift: 'night' })} className="mt-2 p-3 bg-dark-bg rounded-lg border border-white/5 hover:border-indigo-500/30 cursor-pointer transition-all" >
                                            <div className="flex justify-between items-center mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded font-bold">NIGHT</span>
                                                    <span className="text-[10px] text-dark-text-light font-mono">{nStart}-{nEnd}</span>
                                                </div>
                                                <span className="text-xs font-mono text-dark-text-light">€{nCost.toFixed(0)}</span>
                                            </div>
                                            <div className="space-y-1">
                                                {day.night && day.night.length > 0 ? day.night.map((name, i) => (
                                                    <div key={i} className="flex justify-between text-xs">
                                                        <span className="text-dark-text font-medium">{name}</span>
                                                        <span className="text-dark-text-light text-[10px] opacity-60">€{wages[name] || 12}/h</span>
                                                    </div>
                                                )) : <span className="text-xs text-dark-text-light italic">Empty Shift</span>}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                {view === 'logs' && (
                    <div className="space-y-2">
                        {/* 顶部按钮区 */}
                        <div className="flex justify-end mb-4">
                            <button onClick={() => setIsAddingManualLog(true)} className="bg-dark-accent text-dark-bg px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:opacity-90 transition-all">
                                <Icon name="Plus" size={16} /> Add Manual Attendance
                            </button>
                        </div>

                        {/* 日志列表循环 - 必须放在 div 内部 */}
                        {visibleLogs.map((log: LogEntry) => {
                            const isAttendance = log.type === 'clock-in' || log.type === 'clock-out';
                            const isInventory = log.type === 'inventory';

                            return (
                                <div key={log.id} className={`bg-dark-surface p-3 rounded-lg shadow-sm text-sm border-l-4 ${log.isDeleted ? 'border-gray-500 opacity-60' : 'border-dark-accent'}`}>
                                    {/* 第一行：名字和时间 */}
                                    <div className="flex justify-between mb-1">
                                        <span className="font-bold text-dark-text">{log.name}</span>
                                        <span className="text-xs text-dark-text-light">{formattedDate(log.time)}</span>
                                    </div>
                                    
                                    {/* 第二行：类型标签 和 操作按钮 */}
                                    <div className="flex justify-between items-center">
                                        {/* 左侧：类型和状态 */}
                                        <div>
                                            <span className={`px-2 py-0.5 rounded text-[10px] ${log.type?.includes('in') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{log.type}</span>
                                            {log.isDeleted && <span className="ml-2 text-[10px] font-bold text-gray-400">[INVALIDATED]</span>}
                                            {log.isManual && <span className="ml-2 text-[10px] font-bold text-yellow-400">[MANUAL]</span>}
                                        </div>

                                        {/* 右侧：地点和按钮 */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-dark-text-light font-mono">{log.reason || 'No Location'}</span>
                                            {!log.isDeleted && (
                                                <>
                                                    {isAttendance && <button onClick={() => handleOpenAdjustModal(log)} title="Adjust Hours" className="p-1.5 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20"><Icon name="Edit" size={12}/></button>}
                                                    {(isAttendance || isInventory) && <button onClick={() => setLogToInvalidate(log)} title="Invalidate Log" className="p-1.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"><Icon name="Trash" size={12}/></button>}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* 第三行（可选）：删除原因或编辑备注 */}
                                    {log.isDeleted && <p className="text-xs mt-2 text-gray-400 border-t border-white/10 pt-2">Reason: {log.deleteReason}</p>}
                                    {log.manualInventoryEdited && <p className="text-xs mt-2 text-yellow-500 border-t border-white/10 pt-2">Edit Note: {log.manualInventoryEditReason}</p>}
                                </div>
                            );
                        })}
                    </div>
                )}

                {view === 'financial' && (
                    <div className="space-y-4 pb-10">
                        {/* 1. 顶部概览卡片 */}
                        <div className="bg-dark-surface p-5 rounded-2xl shadow-lg border border-white/10">
                            <h3 className="font-bold mb-4 text-dark-text flex items-center gap-2 uppercase tracking-wider text-sm"><Icon name="Briefcase" size={16}/> Financial Overview</h3>
                            
                            <div className="mb-6">
                                <label className="block text-xs font-bold text-dark-text-light mb-1 uppercase">Monthly Budget Max (€)</label>
                                <input type="number" className="w-full border rounded-xl p-3 text-xl font-black bg-dark-bg border-white/10 text-white focus:ring-2 focus:ring-dark-accent outline-none" value={budgetMax} onChange={e => handleBudgetChange(e.target.value)} />
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-dark-bg p-4 rounded-xl border border-white/5">
                                    <p className="text-[10px] text-dark-text-light font-bold uppercase mb-1">Projected (Sched)</p>
                                    <p className="text-xl font-black text-white">€{totalEstCost.toFixed(0)}</p>
                                </div>
                                <div className="bg-dark-bg p-4 rounded-xl border border-white/5 relative overflow-hidden">
                                    <div className="absolute right-0 top-0 p-1"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div></div>
                                    <p className="text-[10px] text-dark-text-light font-bold uppercase mb-1">Actual (Logs)</p>
                                    <p className="text-xl font-black text-white">€{totalActualCost.toFixed(0)}</p>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-dark-text-light uppercase">Budget Used</span>
                                    <span className={`text-xs font-black ${totalActualCost > budgetMax ? 'text-red-400' : 'text-green-400'}`}>
                                        {totalActualCost > budgetMax ? 'OVER BUDGET' : `€${(budgetMax - totalActualCost).toFixed(0)} Left`}
                                    </span>
                                </div>
                                <div className="w-full bg-dark-bg rounded-full h-3 overflow-hidden border border-white/5">
                                    <div className={`h-full rounded-full transition-all duration-500 ${totalActualCost > budgetMax ? 'bg-red-500' : 'bg-gradient-to-r from-green-500 to-emerald-400'}`} style={{ width: `${Math.min(100, (totalActualCost/budgetMax)*100)}%` }}></div>
                                </div>
                            </div>
                        </div>

                        {/* 2. 员工工资设置 (新版) */}
                        <div className="bg-dark-surface rounded-xl border border-white/10 overflow-hidden">
                            <div className="p-3 bg-white/5 border-b border-white/10 flex justify-between items-center">
                                <h4 className="font-bold text-sm text-white">Staff Wage Settings</h4>
                                <span className="text-[10px] text-dark-text-light">Auto-saved</span>
                            </div>
                            <table className="w-full text-xs">
                                <thead className="bg-dark-bg text-dark-text-light uppercase">
                                    <tr>
                                        <th className="p-3 text-left">Staff</th>
                                        <th className="p-3 text-left">Type</th>
                                        <th className="p-3 text-right">Value (€)</th>
                                        <th className="p-3 text-right">Wk Cost</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/10">
                                    {Object.keys(stats).map(name => {
                                        const wage = wages[name] || { type: 'hourly', value: 12 };
                                        return (
                                        <tr key={name}>
                                            <td className="p-3 font-bold text-dark-text">{name}</td>
                                            <td className="p-3">
                                                <select 
                                                    className="bg-dark-bg border border-white/20 rounded px-2 py-1 text-white outline-none focus:border-dark-accent text-[10px]"
                                                    value={wage.type}
                                                    onChange={(e) => {
                                                        const newWages = { ...wages, [name]: { ...wage, type: e.target.value as any } };
                                                        saveWages(newWages);
                                                    }}
                                                >
                                                    <option value="hourly">Hourly (时薪)</option>
                                                    <option value="fixed">Monthly (月薪)</option>
                                                </select>
                                            </td>
                                            <td className="p-3 text-right">
                                                <input 
                                                    type="number" 
                                                    step={wage.type === 'hourly' ? "0.5" : "100"} 
                                                    className="w-20 text-right py-1 rounded bg-dark-bg border border-white/20 text-white font-mono focus:border-dark-accent outline-none px-2" 
                                                    value={wage.value || ''} 
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        const newWages = { ...wages, [name]: { ...wage, value: isNaN(val) ? 0 : val } };
                                                        saveWages(newWages);
                                                    }}
                                                />
                                            </td>
                                            <td className="p-3 text-right font-mono text-dark-text-light">
                                                €{stats[name].actualCost.toFixed(0)}
                                            </td>
                                        </tr>
                                    )})}
                                </tbody>
                            </table>
                        </div>

                        {/* 3. 每日用度详情 (Daily Breakdown) */}
                        <div className="bg-dark-surface rounded-xl border border-white/10 overflow-hidden">
                            <div className="p-3 bg-white/5 border-b border-white/10 flex justify-between items-center">
                                <h4 className="font-bold text-sm text-white">Daily Breakdown (2 Months)</h4>
                                <span className="text-[10px] text-dark-text-light bg-dark-bg px-2 py-1 rounded">Est vs Act</span>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-dark-bg text-dark-text-light uppercase sticky top-0 z-10">
                                        <tr>
                                            <th className="p-3 text-left">Date</th>
                                            <th className="p-3 text-right">Est.</th>
                                            <th className="p-3 text-right">Act.</th>
                                            <th className="p-3 text-right">Diff</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                        {getDailyFinancials().map((d: any) => (
                                            <React.Fragment key={d.date}>
                                                {/* 汇总行 */}
                                                <tr className="hover:bg-white/5 transition-colors bg-white/5 border-b border-white/5">
                                                    <td className="p-3">
                                                        <div className="font-bold text-white">{d.date}</div>
                                                        <div className="text-[10px] text-dark-text-light">{d.name}</div>
                                                    </td>
                                                    <td className="p-3 text-right font-mono text-dark-text-light">€{d.est.toFixed(0)}</td>
                                                    <td className="p-3 text-right font-mono font-bold text-white">€{d.act.toFixed(0)}</td>
                                                    <td className="p-3 text-right font-mono">
                                                        <span className={`px-1.5 py-0.5 rounded ${Math.abs(d.diff) < 1 ? 'bg-white/5 text-gray-400' : d.diff < 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                                            {d.diff > 0 ? '+' : ''}{d.diff.toFixed(0)}
                                                        </span>
                                                    </td>
                                                </tr>
                                                {/* 员工明细行 */}
                                                {d.details.length > 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="p-2 pl-4 border-b border-white/10 bg-dark-bg/30">
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {d.details.map((staff: any, idx: number) => (
                                                                    <div key={idx} className="flex justify-between items-center text-[10px] bg-dark-surface p-1.5 rounded border border-white/5">
                                                                        <span className="text-dark-text font-bold">{staff.name}</span>
                                                                        <div className="flex gap-2 font-mono">
                                                                            <span className="text-dark-text-light">E:{staff.est.toFixed(0)}</span>
                                                                            <span className={`font-bold ${staff.act > staff.est ? 'text-red-400' : staff.act < staff.est ? 'text-blue-300' : 'text-green-400'}`}>
                                                                                A:{staff.act.toFixed(0)}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 4. 导出控制区 */}
                        <div className="bg-dark-surface p-4 rounded-xl border border-white/10 mt-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-dark-text-light uppercase">Select Export Month</span>
                                {/* 月份选择器 */}
                                <input 
                                    type="month" 
                                    value={exportMonth} 
                                    onChange={(e) => setExportMonth(e.target.value)} 
                                    className="bg-dark-bg border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm font-mono outline-none focus:border-dark-accent"
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={handleExportLogsCSV} className="bg-white/10 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-white/20 transition-all border border-white/5">
                                    <Icon name="Clock" size={16} /> Export Logs ({exportMonth})
                                </button>
                                <button onClick={handleExportFinancialCSV} className="bg-green-600 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-green-700 transition-all shadow-lg">
                                    <Icon name="List" size={16} /> Export Summary
                                </button>
                            </div>
                        </div>
                    </div>
                )}                
                {view === 'confirmations' && (
                    <div className="space-y-4">
                        <div className="bg-dark-surface p-4 rounded-xl shadow-sm border border-white/10">
                            <h3 className="font-bold text-dark-text mb-2">Staff Confirmation Status</h3>
                            <p className="text-xs text-dark-text-light mb-4">Cycle: {currentCycle ? `${currentCycle.startDate} to ${currentCycle.endDate}` : 'No active cycle'}</p>
                            
                            <div className="overflow-x-auto">
                                 <table className="w-full text-xs text-left">
                                    <thead className="text-dark-text-light border-b border-white/10">
                                        <tr><th className="p-3">Staff</th><th className="p-3">Status</th><th className="p-3">Viewed</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/10">
                                        {currentCycle && Object.entries(currentCycle.confirmations).map(([userId, conf]) => {
                                            const staff = users.find((u:User) => u.id === userId);
                                            // FIX: Add type assertion for 'conf' to resolve 'unknown' type error when iterating object entries.
                                            const confirmation = conf as { status: 'pending' | 'confirmed' | 'needs_change'; viewed: boolean };
                                            return (
                                                <tr key={userId}>
                                                    <td className="p-3 font-bold">{staff?.name || userId}</td>
                                                    <td className="p-3 capitalize">{confirmation.status.replace('_', ' ')}</td>
                                                    <td className="p-3">{confirmation.viewed ? 'Yes' : 'No'}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                 </table>
                                 {!currentCycle && <p className="text-center p-4 text-dark-text-light italic">No schedule has been published yet.</p>}
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {editingShift && displayedDays && <ScheduleEditorModal isOpen={!!editingShift} day={displayedDays[editingShift.dayIdx]} shiftType={editingShift.shift} currentStaff={(schedule.days.find((d: any) => d.date === displayedDays[editingShift.dayIdx].date) as any)[editingShift.shift]} currentHours={displayedDays[editingShift.dayIdx].hours?.[editingShift.shift]} onClose={() => setEditingShift(null)} onSave={handleSaveSchedule} teamMembers={activeStaff} />}
            <ManualAddModal isOpen={isAddingManualLog} onClose={() => setIsAddingManualLog(false)} onSave={handleSaveManualLog} users={users} currentUser={managerUser} />
            <InvalidateLogModal isOpen={!!logToInvalidate} log={logToInvalidate} onClose={() => setLogToInvalidate(null)} onConfirm={handleInvalidateConfirm} currentUser={managerUser} />
            <AdjustHoursModal isOpen={!!logPairToAdjust} logPair={logPairToAdjust} onClose={() => setLogPairToAdjust(null)} onSave={handleSaveAdjustedHours} currentUser={managerUser} />
        </div>
    );
};

// --- STAFF APP ---

const RefillDetailsModal = ({ isOpen, onClose, data, t, lang }: any) => {
    if (!isOpen) return null;

    const items = (data.items || []).map((item: any) => ({
        key: item.itemId || Math.random(),
        text: `${item.name} - ${item.amount || '0'}${item.unit}`
    }));

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl border flex flex-col max-h-[80vh]">
                <h3 className="text-lg font-black text-text mb-2 shrink-0">{t.refill_details_title}</h3>
                
                <div className="text-xs text-text-light mb-4 border-b pb-3">
                    <p><strong>{t.staff_label || 'Operator'}:</strong> {data.name}</p>
                    <p><strong>{t.time_label || 'Time'}:</strong> {formattedDate(data.time)}</p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar pr-2 -mr-2">
                    {items.length === 0 ? (
                        <p className="text-sm text-text-light italic">本次补料没有明细记录</p>
                    ) : (
                        items.map((item) => (
                            <div key={item.key} className="bg-secondary p-3 rounded-lg text-sm text-text">
                                {item.text}
                            </div>
                        ))
                    )}
                </div>
                <div className="mt-6 shrink-0">
                    <button onClick={onClose} className="w-full py-3 rounded-xl bg-gray-100 text-text-light font-bold hover:bg-gray-200 transition-all">{t.close}</button>
                </div>
            </div>
        </div>
    );
};

const LastRefillCard = ({ inventoryHistory, inventoryList, lang, t }: any) => {
    const [modalOpen, setModalOpen] = useState(false);

    const lastReportData = React.useMemo(() => {
        const reports = (inventoryHistory || []).filter((r: InventoryReport) => r && r.date);
        if (reports.length === 0) {
            return null;
        }

        const sortedReports = reports.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastReport = sortedReports[0];

        const reportItems = Object.entries(lastReport.data).map(([itemId, values]) => {
            const itemDef = inventoryList.find((i: InventoryItem) => i.id === itemId);
            const name = itemDef ? (itemDef.name[lang] || itemDef.name['zh']) : itemId;
            return {
                name: name,
                amount: (values as any).end,
                unit: itemDef?.unit || '',
                itemId: itemId,
            };
        });

        return {
            name: lastReport.submittedBy,
            time: lastReport.date,
            items: reportItems,
        };
    }, [inventoryHistory, inventoryList, lang]);

    const handleCardClick = () => {
        if (lastReportData) {
            setModalOpen(true);
        }
    };

    const renderCardContent = () => {
        if (!lastReportData) {
            return (
                <p className="text-sm font-medium text-text-light italic">{t.no_refill_record}</p>
            );
        }

        const translation = t.refilled_by_on || '由 {name} 在 {time} 补料';
        return (
            <div>
                <p className="text-sm font-medium text-text-light">
                    {translation.replace('{name}', lastReportData.name).replace('{time}', formattedDate(lastReportData.time))}
                </p>
                <p className="text-xs text-text-light mt-1">
                    {(t.total_items_refilled || '共补料 {count} 项').replace('{count}', lastReportData.items?.length || 0)}
                </p>
            </div>
        );
    };

    const isClickable = !!lastReportData;

    return (
        <>
            <div 
                onClick={handleCardClick}
                className={`bg-surface p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between ${isClickable ? 'active:scale-95 transition-transform cursor-pointer' : 'cursor-default'}`}
            >
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center">
                        <Icon name="Refresh" size={28} />
                    </div>
                    <div>
                        <span className="font-bold text-lg text-text">{t.last_refill_title}</span>
                        <div className="mt-1">
                            {renderCardContent()}
                        </div>
                    </div>
                </div>
                {isClickable && <Icon name="ChevronRight" className="text-gray-300" />}
            </div>
            {lastReportData && <RefillDetailsModal 
                isOpen={modalOpen} 
                onClose={() => setModalOpen(false)} 
                data={lastReportData}
                t={t}
                lang={lang}
            />}
        </>
    );
};

const StaffApp = ({ onSwitchMode, data, onLogout, currentUser, openAdmin }: { onSwitchMode: () => void, data: any, onLogout: () => void, currentUser: User, openAdmin: () => void }) => {
    const { lang, setLang, schedule, notices, logs, setLogs, t, swapRequests, setSwapRequests, directMessages, users, recipes, scheduleCycles, setScheduleCycles } = data;
    const { showNotification } = useNotification();
    const [view, setView] = useState<StaffViewMode>('home');
    const [clockBtnText, setClockBtnText] = useState({ in: t.clock_in, out: t.clock_out });
    const [currentShift, setCurrentShift] = useState<string>('opening'); 
    const [onInventorySuccess, setOnInventorySuccess] = useState<(() => void) | null>(null);
    const [hasUnreadChat, setHasUnreadChat] = useState(false);
    const [showAvailabilityReminder, setShowAvailabilityReminder] = useState(false);
    const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
    const [deviationData, setDeviationData] = useState<any | null>(null);
    const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
    const [recipeTypeFilter, setRecipeTypeFilter] = useState<'product' | 'premix'>('product');
    
    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [currentSwap, setCurrentSwap] = useState<{ date: string, shift: 'morning'|'evening'|'night' } | null>(null);
    const [targetEmployeeId, setTargetEmployeeId] = useState('');
    const [reason, setReason] = useState('');

    const [isScheduleReminderOpen, setIsScheduleReminderOpen] = useState(false);
    const [isSwapReminderOpen, setIsSwapReminderOpen] = useState(false);
    const [pendingSwapCount, setPendingSwapCount] = useState(0);
    const scheduleReminderShown = useRef(false);
    const swapReminderShown = useRef(false);

    const [newRecipesToAck, setNewRecipesToAck] = useState<DrinkRecipe[]>([]);
    const recipeReminderCheckDone = useRef(false);
    
    const today = new Date();
    const currentCycle = scheduleCycles.find((c: ScheduleCycle) => {
      const start = new Date(c.startDate);
      const end = new Date(c.endDate);
      return today >= start && today <= end && c.status === 'published';
    });
    const userConfirmation = currentCycle?.confirmations[currentUser.id];


    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';
    
    useEffect(() => {
        if (recipeReminderCheckDone.current || !recipes || !currentUser || recipes.length === 0) {
            return;
        }

        const allNewRecipes = recipes.filter((r: DrinkRecipe) => r.isNew === true);
        if (allNewRecipes.length === 0) {
            recipeReminderCheckDone.current = true;
            return;
        }
        
        const acknowledgedIds = new Set(currentUser.acknowledgedNewRecipes || []);
        const unacknowledged = allNewRecipes.filter((r: DrinkRecipe) => !acknowledgedIds.has(r.id));
        
        if (unacknowledged.length > 0) {
            setTimeout(() => setNewRecipesToAck(unacknowledged), 2000);
        }
        
        recipeReminderCheckDone.current = true;
    }, [recipes, currentUser]);

    const handleAcknowledgeNewRecipes = async () => {
        if (!currentUser || newRecipesToAck.length === 0) return;

        const newAckIds = newRecipesToAck.map(r => r.id);
        const existingAckIds = currentUser.acknowledgedNewRecipes || [];
        const updatedAckIds = [...new Set([...existingAckIds, ...newAckIds])];
        const updatedUser = { ...currentUser, acknowledgedNewRecipes: updatedAckIds };
        await Cloud.saveUser(updatedUser);
        
        const recipeNames = newRecipesToAck.map(r => r.name[lang] || r.name['zh']).join(', ');
        const details = `Confirmed: ${recipeNames}`;
        await Cloud.saveRecipeConfirmation(currentUser.id, details);

        setNewRecipesToAck([]);
        setView('recipes');
        showNotification({
            type: 'message',
            title: 'Acknowledgment Recorded',
            message: 'Your confirmation has been sent to the manager.'
        });
    };

    useEffect(() => {
        const checkAvailability = async () => {
            const nextMonday = getStartOfWeek(new Date(), 1);
            const nextWeekKey = formatDateISO(nextMonday);
            const reminderShownKey = `availabilityReminderShown_${nextWeekKey}`;

            if (sessionStorage.getItem(reminderShownKey)) return;

            const existing = await Cloud.getStaffAvailability(currentUser.id, nextWeekKey);
            if (!existing) {
                setShowAvailabilityReminder(true);
                sessionStorage.setItem(reminderShownKey, 'true');
            }
        };
        const timer = setTimeout(checkAvailability, 3000);
        return () => clearTimeout(timer);
    }, [currentUser.id]);

    useEffect(() => {
        const notifiedKey = `notifiedMessages_${currentUser.id}`;
        const notifiedIds = new Set<string>(JSON.parse(localStorage.getItem(notifiedKey) || '[]'));

        if (view === 'chat') {
            let updated = false;
            directMessages.forEach((msg: DirectMessage) => {
                if (msg.toId === currentUser.id && !notifiedIds.has(msg.id)) {
                    notifiedIds.add(msg.id);
                    updated = true;
                }
            });

            if (updated) {
                localStorage.setItem(notifiedKey, JSON.stringify(Array.from(notifiedIds)));
            }
            setHasUnreadChat(false);
            return;
        }

        if (!directMessages || directMessages.length === 0) {
            setHasUnreadChat(false);
            return;
        }

        const messagesToNotify = directMessages.filter((msg: DirectMessage) => 
            msg.toId === currentUser.id && !notifiedIds.has(msg.id)
        );

        setHasUnreadChat(messagesToNotify.length > 0);

        if (messagesToNotify.length > 0) {
            const latestMessageToNotify = messagesToNotify.reduce((latest, current) => 
                new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
            );

            const sender = users.find((u: User) => u.id === latestMessageToNotify.fromId);
            showNotification({
                type: 'message',
                title: `New Message from ${sender?.name || 'Team'}`,
                message: latestMessageToNotify.content.length > 40 ? latestMessageToNotify.content.substring(0, 40) + '...' : latestMessageToNotify.content,
                dedupeKey: `chat::${latestMessageToNotify.id}`,
            });

            const newNotifiedIds = new Set(notifiedIds);
            messagesToNotify.forEach(msg => newNotifiedIds.add(msg.id));
            localStorage.setItem(notifiedKey, JSON.stringify(Array.from(newNotifiedIds)));
        }
    }, [directMessages, view, currentUser.id, users, showNotification]);
    
    useEffect(() => {
        if (!notices || notices.length === 0) return;
        const activeNotices = notices.filter((n: Notice) => n.status !== 'cancelled');
        if (activeNotices.length === 0) return;
        
        const latest = activeNotices[activeNotices.length - 1];

        const seenKey = `notice_seen_${latest.id}`;
        const lastSeen = localStorage.getItem(seenKey);
        let shouldShow = false;

        if (!latest.frequency || latest.frequency === 'always') {
            shouldShow = true;
        } else if (latest.frequency === 'once') {
            if (!lastSeen) shouldShow = true;
        } else if (latest.frequency === 'daily') {
            if (!lastSeen || new Date(parseInt(lastSeen)).toDateString() !== new Date().toDateString()) shouldShow = true;
        } else if (latest.frequency === '3days') {
            if (!lastSeen || Date.now() - parseInt(lastSeen) > 3 * 24 * 60 * 60 * 1000) shouldShow = true;
        }

        if (shouldShow) {
            showNotification({
                type: 'announcement',
                title: t.team_board || 'Team Announcement',
                message: latest.content,
                sticky: latest.frequency === 'always',
                dedupeKey: latest.id,
                imageUrl: latest.imageUrl,
            });
            
            if (latest.frequency !== 'always') {
                localStorage.setItem(seenKey, Date.now().toString());
            }
        }
    }, [notices, showNotification, t.team_board]);

    useEffect(() => {
        if (!schedule?.days) return;
        const timer = setInterval(() => {
            const now = new Date();
            const todayDateStr = `${now.getMonth() + 1}-${now.getDate()}`;
            const todaySchedule = schedule.days.find((day: ScheduleDay) => day.date === todayDateStr);
            if (!todaySchedule) return;

            const hasClockedIn = logs.some((l: LogEntry) => l.userId === currentUser.id && new Date(l.time).toDateString() === now.toDateString() && l.type === 'clock-in');
            const hasClockedOut = logs.some((l: LogEntry) => l.userId === currentUser.id && new Date(l.time).toDateString() === now.toDateString() && l.type === 'clock-out');

            const checkShift = (shiftType: 'morning' | 'evening', shiftHours: any, clockedStatus: boolean, notificationType: 'clock_in_reminder' | 'clock_out_reminder', title: string, message: string) => {
                if (todaySchedule[shiftType] && Array.isArray(todaySchedule[shiftType]) && todaySchedule[shiftType].includes(currentUser.name) && !clockedStatus) {
                    const timeStr = notificationType === 'clock_in_reminder' ? shiftHours.start : shiftHours.end;
                    const [hour, minute] = timeStr.split(':').map(Number);
                    const shiftTime = new Date();
                    shiftTime.setHours(hour, minute, 0, 0);
                    const diffMinutes = (now.getTime() - shiftTime.getTime()) / 60000;
                    
                    if (diffMinutes >= -15 && diffMinutes <= 15) {
                        const dedupeKey = `${notificationType}-${todayDateStr}-${shiftType}-${Math.floor(now.getTime() / (5 * 60 * 1000))}`;
                        showNotification({ type: notificationType, title: title, message: message, dedupeKey: dedupeKey, });
                    }
                }
            };
            
            if(todaySchedule.hours?.morning) checkShift('morning', todaySchedule.hours.morning, hasClockedIn, 'clock_in_reminder', 'Clock-in Reminder', 'Your morning shift is starting soon. Please remember to clock in.');
            if(todaySchedule.hours?.evening) checkShift('evening', todaySchedule.hours.evening, hasClockedIn, 'clock_in_reminder', 'Clock-in Reminder', 'Your evening shift is starting soon. Please remember to clock in.');
            if(todaySchedule.hours?.morning) checkShift('morning', todaySchedule.hours.morning, hasClockedOut, 'clock_out_reminder', 'Clock-out Reminder', 'Your morning shift is ending soon. Please complete tasks and clock out.');
            if(todaySchedule.hours?.evening) checkShift('evening', todaySchedule.hours.evening, hasClockedOut, 'clock_out_reminder', 'Clock-out Reminder', 'Your evening shift is ending soon. Please complete tasks and clock out.');
        }, 60 * 1000);
        return () => clearInterval(timer);
    }, [currentUser, schedule, logs, showNotification]);

    useEffect(() => {
        if (view !== 'home' || deviationData || isSwapModalOpen || showAvailabilityModal || showAvailabilityReminder) {
            return;
        }

        const runChecks = async () => {
            if (!swapReminderShown.current) {
                const pendingSwaps = (swapRequests || []).filter(
                    (r: SwapRequest) => r.targetId === currentUser.id && r.status === 'pending'
                );
                if (pendingSwaps.length > 0) {
                    setPendingSwapCount(pendingSwaps.length);
                    setIsSwapReminderOpen(true);
                    swapReminderShown.current = true;
                    return;
                }
            }

            if (!scheduleReminderShown.current && userConfirmation?.status === 'pending') {
                setIsScheduleReminderOpen(true);
                scheduleReminderShown.current = true;
            }
        };

        const timer = setTimeout(runChecks, 1500);
        return () => clearTimeout(timer);
    }, [currentUser, swapRequests, schedule, view, deviationData, isSwapModalOpen, showAvailabilityModal, showAvailabilityReminder, userConfirmation]);


    const findNextShift = () => {
        if (!schedule?.days) return null;
        const now = new Date();
        const year = now.getFullYear();
        now.setHours(0,0,0,0);

        const sortedDays = [...schedule.days].sort((a,b) => {
            const dateA = new Date(`${year}-${a.date}`);
            const dateB = new Date(`${year}-${b.date}`);
            if (dateA < now) dateA.setFullYear(year + 1);
            if (dateB < now) dateB.setFullYear(year + 1);
            return dateA.getTime() - dateB.getTime();
        });

        for (const day of sortedDays) {
            const scheduleDate = new Date(`${year}-${day.date}`);
            if (scheduleDate < now) scheduleDate.setFullYear(year + 1);

            if (scheduleDate >= now) {
                const isToday = scheduleDate.toDateString() === new Date().toDateString();
                const mStart = day.hours?.morning?.start || '10:00';
                const mEnd = day.hours?.morning?.end || '15:00';
                const eStart = day.hours?.evening?.start || '14:30';
                const eEnd = day.hours?.evening?.end || '19:00';
                
                const correctDayName = scheduleDate.toLocaleDateString('en-US', { weekday: 'long' });

                if (day.morning.includes(currentUser.name)) {
                    if (isToday) {
                        const mEndTime = new Date();
                        const [h,m] = mEnd.split(':').map(Number);
                        mEndTime.setHours(h,m);
                        if (new Date() < mEndTime) return { date: day.date, shift: `${mStart} - ${mEnd}`, name: correctDayName };
                    } else return { date: day.date, shift: `${mStart} - ${mEnd}`, name: correctDayName };
                }
                if (day.evening.includes(currentUser.name)) {
                     if (isToday) {
                        const eEndTime = new Date();
                        const [h,m] = eEnd.split(':').map(Number);
                        eEndTime.setHours(h,m);
                        if (new Date() < eEndTime) return { date: day.date, shift: `${eStart} - ${eEnd}`, name: correctDayName };
                    } else return { date: day.date, shift: `${eStart} - ${eEnd}`, name: correctDayName };
                }
            }
        }
        return null;
    };
    const nextShift = findNextShift();

    const recordLog = (type: ClockType, note: string, deviationInfo?: any) => {
        const newLog: LogEntry = {
            id: Date.now(),
            shift: type,
            name: currentUser.name,
            userId: currentUser.id,
            time: new Date().toLocaleString(),
            type: type,
            reason: note,
            ...(deviationInfo && {
                deviationMinutes: deviationInfo.details.deviationMinutes,
                deviationDirection: deviationInfo.details.direction,
                deviationReason: deviationInfo.reason,
            })
        };
        setLogs((prevLogs: LogEntry[]) => [newLog, ...prevLogs]);
        Cloud.saveLog(newLog);

        if (deviationInfo) {
            const managerLog: LogEntry = {
                id: Date.now() + 1,
                shift: 'attendance_deviation',
                type: 'attendance_deviation',
                name: currentUser.name,
                userId: currentUser.id,
                time: new Date().toLocaleString(),
                reason: deviationInfo.reason,
                deviationMinutes: deviationInfo.details.deviationMinutes,
                deviationDirection: deviationInfo.details.direction,
                scheduledTime: deviationInfo.details.scheduledTime,
                actualTime: deviationInfo.details.actualTime,
                shiftType: deviationInfo.type as ClockType,
            };
            setLogs((prevLogs: LogEntry[]) => [managerLog, ...prevLogs]);
            Cloud.saveLog(managerLog);
        }

        setClockBtnText({ in: t.clock_in, out: t.clock_out });
    };

    const performClocking = (type: ClockType) => {
        setClockBtnText(p => ({ ...p, [type === 'clock-in' ? 'in' : 'out']: '📡...' }));
        
        const processClocking = (locTag: string) => {
            const now = new Date();
            const todayDateStr = `${now.getMonth() + 1}-${now.getDate()}`;
            const todaySchedule = schedule.days.find((day: ScheduleDay) => day.date === todayDateStr);

            let scheduledTimeStr: string | null = null;
            let userShift: 'morning' | 'evening' | 'night' | null = null;

            if (todaySchedule) {
                if (todaySchedule.morning.includes(currentUser.name)) userShift = 'morning';
                else if (todaySchedule.evening.includes(currentUser.name)) userShift = 'evening';
                else if (todaySchedule.night?.includes(currentUser.name)) userShift = 'night';

                if (userShift && todaySchedule.hours?.[userShift]) {
                    scheduledTimeStr = type === 'clock-in' ? todaySchedule.hours[userShift]!.start : todaySchedule.hours[userShift]!.end;
                }
            }

            let deviationMinutes = 0;
            let scheduledTime: Date | null = null;
            if (scheduledTimeStr) {
                const [hour, minute] = scheduledTimeStr.split(':').map(Number);
                scheduledTime = new Date();
                scheduledTime.setHours(hour, minute, 0, 0);
                deviationMinutes = Math.round(Math.abs(now.getTime() - scheduledTime.getTime()) / 60000);
            }

            if (scheduledTime && deviationMinutes > 15) {
                setDeviationData({
                    type,
                    locTag,
                    details: {
                        scheduledTime: scheduledTimeStr,
                        actualTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        deviationMinutes,
                        direction: now > scheduledTime ? 'late' : 'early',
                    }
                });
            } else {
                alert(`✅ Success!\n${locTag}`);
                recordLog(type, locTag);
            }
        };

        if (!navigator.geolocation) {
            processClocking("GPS Not Supported");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const dist = getDistanceFromLatLonInKm(pos.coords.latitude, pos.coords.longitude, STORE_COORDS.lat, STORE_COORDS.lng);
                const locTag = dist <= 500 ? `In Range (<500m)` : `Out Range (${Math.round(dist)}m)`;
                processClocking(locTag);
            },
            (err) => {
                console.error(err);
                processClocking("GPS Error");
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
    };
    
    const handleClockLog = (type: ClockType) => {
        if (type === 'clock-out') {
            alert(t.inventory_before_clock_out);
            setOnInventorySuccess(() => () => performClocking('clock-out'));
            setView('inventory');
        } else {
            performClocking('clock-in');
        }
    };

    const cancelInventoryClockOut = () => {
        if (window.confirm(t.cancel_clock_out_confirm)) {
            setOnInventorySuccess(null);
            setView('home');
        }
    }

    const handleSwapAction = async (reqId: string, action: 'accepted_by_peer' | 'rejected') => {
        const req = swapRequests.find((r: SwapRequest) => r.id === reqId);
        if(!req) return;
        const updatedReq = { ...req, status: action, decidedAt: Date.now() };
        const updatedReqs = swapRequests.map((r: SwapRequest) => (r.id === reqId ? updatedReq : r));
        await Cloud.updateSwapRequests(updatedReqs);
        showNotification({ type: 'message', title: 'Swap Updated', message: `You have ${action === 'accepted_by_peer' ? 'accepted' : 'rejected'} the swap request.` });
    };

    const handleConfirmSchedule = async () => {
        if (!currentCycle) return;
        const updatedCycle = {
            ...currentCycle,
            confirmations: {
                ...currentCycle.confirmations,
                [currentUser.id]: { status: 'confirmed', viewed: true }
            }
        };
        const updatedCycles = scheduleCycles.map((c: ScheduleCycle) => c.cycleId === updatedCycle.cycleId ? updatedCycle : c);
        await Cloud.updateScheduleCycles(updatedCycles);
        showNotification({ type: 'message', title: 'Schedule Confirmed!', message: 'Thank you.' });
    };

    const handleSendSwapRequest = async () => {
        if (!currentSwap || !targetEmployeeId) {
            alert("Please select a colleague.");
            return;
        }
        const targetUser = users.find((u:User) => u.id === targetEmployeeId);
        if (!targetUser) {
             alert("Selected colleague not found.");
            return;
        }

        const newRequest: Omit<SwapRequest, 'id'> = {
            requesterId: currentUser.id,
            requesterName: currentUser.name,
            requesterDate: currentSwap.date,
            requesterShift: currentSwap.shift,
            targetId: targetUser.id,
            targetName: targetUser.name,
            targetDate: null, 
            targetShift: null,
            status: 'pending',
            reason: reason || null,
            timestamp: Date.now(),
        };

        await Cloud.saveSwapRequest(newRequest);
        showNotification({ type: 'message', title: 'Swap Request Sent', message: `Your request to ${targetUser.name} has been sent.` });
        setIsSwapModalOpen(false);
        setReason('');
        setTargetEmployeeId('');
    };

    const handleCloseSwapModal = () => {
        setIsSwapModalOpen(false);
        setTargetEmployeeId('');
        setReason('');
    };


    const ConfirmationBanner = () => {
        if (!currentCycle || !userConfirmation || userConfirmation.status !== 'pending') return null;

        return ( <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-800 p-4 rounded-lg mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in"><div className="flex-1"><h4 className="font-bold">Please Confirm Your Schedule</h4><p className="text-sm mt-1">Review your upcoming shifts for {currentCycle.startDate} to {currentCycle.endDate} and tap confirm.</p></div><button onClick={handleConfirmSchedule} className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg text-sm whitespace-nowrap hover:bg-blue-600 transition-all shadow-md active:scale-95 w-full sm:w-auto">Confirm Schedule</button></div>);
    };

    const LibraryView = ({ data, onOpenChecklist }: { data: any, onOpenChecklist: (key: string) => void }) => {
        const { sopList, t, lang } = data;
        return (<div className="h-full overflow-y-auto bg-secondary p-4 pb-24 animate-fade-in-up text-text"><h2 className="text-2xl font-black text-text mb-4">{t.sop_library}</h2><div className="grid grid-cols-2 gap-3 mb-6"><button onClick={() => onOpenChecklist('opening')} className="p-4 bg-yellow-400/20 text-yellow-800 rounded-xl font-bold flex flex-col items-center gap-2"><Icon name="Sun" size={24}/> Opening</button><button onClick={() => onOpenChecklist('mid')} className="p-4 bg-blue-400/20 text-blue-800 rounded-xl font-bold flex flex-col items-center gap-2"><Icon name="Clock" size={24}/> Mid-Day</button><button onClick={() => onOpenChecklist('closing')} className="p-4 bg-purple-400/20 text-purple-800 rounded-xl font-bold flex flex-col items-center gap-2"><Icon name="Moon" size={24}/> Closing</button></div><div className="space-y-3">{sopList.map((s: SopItem) => (<div key={s.id} className="bg-surface p-4 rounded-xl shadow-sm border border-gray-100"><div className="flex justify-between items-start mb-2"><h3 className="font-bold text-text">{s.title?.[lang] || s.title?.['zh']}</h3><span className="text-[10px] bg-secondary px-2 py-1 rounded text-text-light uppercase">{s.category}</span></div><p className="text-sm text-text-light whitespace-pre-line leading-relaxed">{s.content?.[lang] || s.content?.['zh']}</p></div>))}</div></div>);
    }

    const ContactView = ({ t, lang }: { t: any, lang: Lang }) => {
        const handleCopy = (text: string) => { if (!text) return; navigator.clipboard.writeText(text); alert(`${t.copied}: ${text}`); };
        return (
            <div className="h-full overflow-y-auto p-4 pb-24 bg-secondary animate-fade-in-up text-text">
                <h2 className="text-2xl font-black text-text mb-4">{t.contact_title}</h2>
                <div className="space-y-3">{CONTACTS_DATA.map(c => (<div key={c.id} className="bg-surface p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between"><div><h3 className="font-bold text-text">{c.name}</h3><p className="text-xs text-text-light">{c.role?.[lang]}</p>{c.phone && <p onClick={() => handleCopy(c.phone!)} className="text-xs text-primary mt-1 cursor-pointer hover:underline">{c.phone}</p>}</div>{c.phone ? (<a href={`tel:${c.phone}`} className="bg-green-100 text-green-600 p-3 rounded-full hover:bg-green-200 transition-all"><Icon name="Phone" size={20} /></a>) : (<span className="text-gray-300 text-xs italic">No Phone</span>)}</div>))}</div>
            </div>
        );
    };

    interface DrinkCardProps {
        drink: DrinkRecipe;
        lang: Lang;
        t: any;
    }
    const DrinkCard: React.FC<DrinkCardProps> = ({ drink, lang, t }) => {
        const [expanded, setExpanded] = useState(false);
        return (<div className="bg-surface p-4 rounded-xl shadow-sm border border-gray-100 mb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}><div className="flex justify-between items-center"><div><h3 className="font-bold text-text">{drink.name?.[lang] || drink.name?.['zh']}</h3><p className="text-xs text-text-light">{drink.cat} • {drink.size}</p></div><Icon name={expanded ? "ChevronUp" : "ChevronRight"} size={20} className="text-gray-400" /></div>{expanded && (<div className="mt-3 text-sm text-text-light space-y-2 border-t pt-3 animate-fade-in"><p><strong>Toppings:</strong> {drink.toppings?.[lang] || drink.toppings?.['zh']}</p><p><strong>Sugar:</strong> {drink.sugar}</p><p><strong>Ice:</strong> {drink.ice}</p>{drink.coverImageUrl && (<img src={drink.coverImageUrl} alt={drink.name?.[lang] || drink.name?.['zh']} className="w-full h-auto rounded-lg my-2 object-cover shadow-md" />)}
        
        {(drink.basePreparation?.en || drink.basePreparation?.zh) && (
            <div className="bg-yellow-500/10 p-3 rounded-lg my-2">
                <p className="font-bold text-yellow-800 mb-1 text-xs uppercase">Base Preparation</p>
                <p className="text-sm text-yellow-900 whitespace-pre-line leading-relaxed">{drink.basePreparation?.[lang] || drink.basePreparation?.['zh']}</p>
            </div>
        )}

        <div className="bg-blue-500/10 p-2 rounded"><p className="font-bold text-blue-800 mb-1">Cold Steps:</p><ol className="list-decimal pl-4">{drink.steps.cold.map((s:any, i:number) => <li key={i}>{s?.[lang]||s?.['zh']}</li>)}</ol></div><div className="bg-orange-500/10 p-2 rounded"><p className="font-bold text-orange-800 mb-1">Warm Steps:</p><ol className="list-decimal pl-4">{drink.steps.warm.map((s:any, i:number) => <li key={i}>{s?.[lang]||s?.['zh']}</li>)}</ol></div>{drink.tutorialVideoUrl && (<a href={drink.tutorialVideoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block w-full text-center bg-primary hover:bg-primary-dark text-white font-bold py-2 px-4 rounded-lg text-sm transition-all">观看教学视频</a>)}</div>)}</div>);
    };

    const TrainingView = ({ data, onComplete }: { data: any, onComplete: (levelId: number) => void }) => {
        const { trainingLevels, t, lang } = data;
        const [activeLevel, setActiveLevel] = useState<TrainingLevel | null>(null);
        if (activeLevel) { return (<div className="h-full flex flex-col bg-surface animate-fade-in-up text-text"><div className="p-4 border-b flex items-center gap-3"><button onClick={() => setActiveLevel(null)}><Icon name="ArrowLeft"/></button><h2 className="font-bold text-lg">{activeLevel.title?.[lang] || activeLevel.title?.['zh']}</h2></div><div className="flex-1 overflow-y-auto p-4 space-y-6"><div className="bg-primary-light p-4 rounded-xl border border-primary/20"><h3 className="font-bold text-primary mb-2">Overview</h3><p className="text-sm text-primary/80">{activeLevel.desc?.[lang] || activeLevel.desc?.['zh']}</p></div>{activeLevel.youtubeLink && (<div className="rounded-xl overflow-hidden shadow-lg border border-gray-200"><iframe className="w-full aspect-video" src={`https://www.youtube.com/embed/${getYouTubeId(activeLevel.youtubeLink)}`} title="Training Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe></div>)}
        
        {/* ADD IMAGE GALLERY HERE */}
        {activeLevel.imageUrls && activeLevel.imageUrls.length > 0 && (
            <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 scroll-smooth no-scrollbar">
                {activeLevel.imageUrls.map((url: string, idx: number) => (
                    <img key={idx} src={url} alt={`Training slide ${idx+1}`} className="h-48 w-auto rounded-xl shadow-md object-cover border border-gray-100 flex-shrink-0" />
                ))}
            </div>
        )}

        {activeLevel.content.map((c: any, i: number) => (<div key={i}><h3 className="font-bold text-text mb-2">{i+1}. {c.title?.[lang] || c.title?.['zh']}</h3><p className="text-sm text-text-light whitespace-pre-line leading-relaxed">{c.body?.[lang] || c.body?.['zh']}</p></div>))}<div className="pt-6"><h3 className="font-bold text-text mb-4">Quiz</h3>{activeLevel.quiz.map((q: any, i: number) => (<div key={q.id} className="mb-4 bg-secondary p-4 rounded-xl"><p className="font-bold text-sm mb-2">{i+1}. {q.question?.[lang] || q.question?.['zh']}</p><div className="space-y-2">{q.options?.map((opt: string, idx: number) => (<button key={idx} className="w-full text-left p-3 bg-surface border rounded-lg text-sm hover:bg-gray-100">{opt}</button>))}</div></div>))}</div></div></div>); }
        return (<div className="h-full overflow-y-auto bg-secondary p-4 pb-24 animate-fade-in-up text-text"><h2 className="text-2xl font-black text-text mb-4">{t.training}</h2><div className="space-y-3">{trainingLevels.map((l: TrainingLevel) => (<div key={l.id} onClick={() => setActiveLevel(l)} className="bg-surface p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all"><div className="w-12 h-12 bg-primary-light text-primary rounded-full flex items-center justify-center font-bold text-lg">{l.id}</div><div className="flex-1"><h3 className="font-bold text-text">{l.title?.[lang] || l.title?.['zh']}</h3><p className="text-xs text-text-light">{l.subtitle?.[lang] || l.subtitle?.['zh']}</p></div><Icon name="ChevronRight" className="text-gray-300"/></div>))}</div></div>);
    };

    const handleInventorySubmit = (report: any) => {
        const completeReport = {
            ...report,
            id: Date.now(),
            date: new Date().toISOString(),
        };
        Cloud.saveInventoryReport(completeReport);
        const logs: InventoryLog[] = [];
        const timestamp = new Date().toLocaleString();
        Object.keys(report.data).forEach(itemId => {
            const itemData = report.data[itemId] as { end: string, waste: string };
            const itemDef = data.inventoryList.find((i:any) => i.id === itemId);
            if (itemData.end || itemData.waste) {
                logs.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    timestamp: timestamp,
                    operator: report.submittedBy,
                    itemId: itemId,
                    itemName: itemDef?.name?.en || itemId,
                    newStock: itemData.end || '0',
                    waste: itemData.waste || '0',
                    actionType: 'report'
                });
            }
        });
        if (logs.length > 0) {
            Cloud.saveInventoryLogs(logs);
        }
        if (onInventorySuccess) {
            onInventorySuccess();
            setOnInventorySuccess(null);
            setView('home');
        }
    };
    
const renderView = () => {
        if (view === 'team') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Calculate start of current week (Monday)
            const startOfCurrentWeek = getStartOfWeek(new Date(), 0);
            const WEEKS_TO_SHOW = 3;
            
            const weeksData = [];
            for(let w=0; w<WEEKS_TO_SHOW; w++) {
                const weekStart = new Date(startOfCurrentWeek);
                weekStart.setDate(weekStart.getDate() + (w * 7));
                const weekDays = [];
                for(let d=0; d<7; d++) {
                    const day = new Date(weekStart);
                    day.setDate(day.getDate() + d);
                    weekDays.push({
                         dateObj: day,
                         dateStr: `${day.getMonth() + 1}-${day.getDate()}`,
                         dayName: day.toLocaleDateString('en-US', { weekday: 'long' }),
                         displayDate: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                         isToday: day.toDateString() === today.toDateString()
                    });
                }
                weeksData.push({
                    id: w,
                    label: w === 0 ? "Current Week" : `Week ${w + 1}`,
                    range: `${weekDays[0].displayDate} - ${weekDays[6].displayDate}`,
                    days: weekDays
                });
            }

            const scheduleMap = new Map<string, ScheduleDay>(
                schedule.days?.map((day: ScheduleDay) => [normalizeDateKey(day.date), day]) || []
            );
            
            return (
                <div className="h-full overflow-y-auto p-4 bg-secondary pb-24 text-text">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-black">{t.team_title}</h2></div>
                    <ConfirmationBanner />
                    
                    <div className="space-y-8">
                        {weeksData.map((week) => (
                            <div key={week.id} className="space-y-3">
                                <div className="sticky top-0 bg-secondary/95 backdrop-blur-sm z-10 py-2 border-b border-gray-200/50 flex justify-between items-end">
                                    <h3 className="text-lg font-black text-primary">{week.label}</h3>
                                    <span className="text-xs font-bold text-text-light">{week.range}</span>
                                </div>
                                <div className="space-y-3">
                                {week.days.map((dayInfo) => {
                                    const daySchedule = scheduleMap.get(normalizeDateKey(dayInfo.dateStr));
                                    
                                    // 核心修改：兼容新旧数据，优先使用 shifts 数组
                                    let shiftsToRender = daySchedule?.shifts || [];
                                    
                                    // 如果没有新数据，尝试回退到旧数据格式以便平滑过渡
                                    if (shiftsToRender.length === 0 && daySchedule) {
                                        if (daySchedule.morning && daySchedule.morning.length) shiftsToRender.push({ name: 'Shift 1', start: daySchedule.hours?.morning?.start, end: daySchedule.hours?.morning?.end, staff: daySchedule.morning });
                                        if (daySchedule.evening && daySchedule.evening.length) shiftsToRender.push({ name: 'Shift 2', start: daySchedule.hours?.evening?.start, end: daySchedule.hours?.evening?.end, staff: daySchedule.evening });
                                        if (daySchedule.night && daySchedule.night.length) shiftsToRender.push({ name: 'Shift 3', start: daySchedule.hours?.night?.start, end: daySchedule.hours?.night?.end, staff: daySchedule.night });
                                    }

                                    const isTodayClass = dayInfo.isToday ? 'ring-2 ring-primary ring-offset-2 border-primary/20' : 'border-gray-100';

                                    return (
                                        <div key={dayInfo.dateStr} className={`p-4 rounded-xl shadow-sm border bg-surface ${isTodayClass}`}>
                                             {/* Header */}
                                            <div className="flex justify-between items-center mb-3">
                                                <h3 className="font-bold text-text flex items-center gap-2">
                                                    {dayInfo.dayName} 
                                                    <span className="text-text-light font-normal text-sm">{dayInfo.dateStr}</span>
                                                    {dayInfo.isToday && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Today</span>}
                                                </h3>
                                            </div>
                                            {/* Shifts */}
                                            {shiftsToRender.length > 0 ? (
                                                <div className="space-y-2">
                                                    {shiftsToRender.map((shift: any, sIdx: number) => {
                                                        const staffList: string[] = shift.staff || [];
                                                        const timeDisplay = shift.start && shift.end ? `${shift.start}-${shift.end}` : '';

                                                        return (
                                                            <div key={sIdx} className="flex items-start gap-3">
                                                                <div className="flex flex-col items-center gap-0.5 w-16 shrink-0">
                                                                    {/* 动态班次名 */}
                                                                    <span className={`text-[10px] font-black uppercase tracking-wider w-full py-1.5 text-center rounded-md ${sIdx === 0 ? 'bg-orange-50 text-orange-500' : sIdx === 1 ? 'bg-indigo-50 text-indigo-500' : 'bg-purple-50 text-purple-500'}`}>
                                                                        班次 {sIdx + 1}
                                                                    </span>
                                                                    {timeDisplay && (
                                                                        <span className="text-[9px] text-text-light font-mono tracking-tight leading-none">
                                                                            {timeDisplay}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="flex-1 flex flex-wrap gap-2 items-center">
                                                                    {staffList.map((name: string, i: number) => { 
                                                                        const isMe = name === currentUser.name;
                                                                        return (
                                                                            <div key={i} className={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-xs font-bold rounded-lg border transition-all ${isMe ? 'bg-primary text-white border-primary shadow-sm' : 'bg-secondary text-text-light border-transparent'}`}>
                                                                                {name}
                                                                                {/* 注意：这里的 swap 逻辑暂时只支持前三个班次，如果需要支持无限班次换班，需要更复杂的逻辑，目前仅作展示 */}
                                                                                {isMe && <button onClick={(e) => { e.stopPropagation(); alert("Please contact manager to swap dynamic shifts."); }} className="text-white/70 hover:text-white hover:bg-white/20 rounded-full p-1 -mr-1 transition-colors"><Icon name="Refresh" size={10} /></button>}
                                                                            </div>
                                                                        ); 
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 opacity-50">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>
                                                    <p className="text-xs text-text-light italic">No shifts scheduled</p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
            if (view === 'chat') { return <ChatView 
            t={t} 
            currentUser={currentUser} 
            messages={directMessages} 
            setMessages={data.setDirectMessages} 
            notices={notices} 
            isManager={true} 
            onExit={() => setView('home')} 
            sopList={data.sopList} 
            trainingLevels={data.trainingLevels}
            allUsers={users} 
        />; }
        if (view === 'contact') { return <ContactView t={t} lang={lang} />; }
        if (view === 'recipes') {
             const filteredRecipes = recipes
                .filter((r: DrinkRecipe) => r.isPublished !== false)
                .filter((r: DrinkRecipe) => {
                    if (recipeTypeFilter === 'premix') {
                        return r.recipeType === 'premix';
                    }
                    return r.recipeType === 'product' || !r.recipeType;
                })
                .filter((r: DrinkRecipe) => r.name.en.toLowerCase().includes(recipeSearchQuery.toLowerCase()) || r.name.zh.includes(recipeSearchQuery));

             return (
                <div className="h-full flex flex-col bg-secondary animate-fade-in-up text-text">
                    <div className="p-4 sticky top-0 bg-secondary z-10">
                        <h2 className="text-2xl font-black text-text mb-4">{t.recipe_title}</h2>
                        <div className="relative mb-4">
                            <Icon name="Search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                            <input value={recipeSearchQuery} onChange={e => setRecipeSearchQuery(e.target.value)} placeholder="Search recipes..." className="w-full bg-surface border rounded-lg p-3 pl-10 text-sm"/>
                        </div>
                         <div className="flex gap-2">
                            <button onClick={() => setRecipeTypeFilter('product')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${recipeTypeFilter === 'product' ? 'bg-primary text-white shadow' : 'bg-surface text-text-light'}`}>
                                Product
                            </button>
                            <button onClick={() => setRecipeTypeFilter('premix')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${recipeTypeFilter === 'premix' ? 'bg-primary text-white shadow' : 'bg-surface text-text-light'}`}>
                                Premix
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 pt-0 pb-24">
                        {filteredRecipes.map((r: DrinkRecipe) => <DrinkCard key={r.id} drink={r} lang={lang} t={t} />)}
                    </div>
                </div>
            );
        }
        if (view === 'training') { return <TrainingView data={data} onComplete={()=>{}} />; }
        if (view === 'sop') { return <LibraryView data={data} onOpenChecklist={(key) => { setCurrentShift(key); setView('checklist'); }} />; }
        if (view === 'inventory') { return <InventoryView lang={lang} t={t} inventoryList={data.inventoryList} setInventoryList={data.setInventoryList} onSubmit={handleInventorySubmit} currentUser={currentUser} isForced={!!onInventorySuccess} onCancel={cancelInventoryClockOut} />; }
        if (view === 'checklist') {
            const checklist = CHECKLIST_TEMPLATES[currentShift];
            return <div className="h-full flex flex-col bg-surface"><div className="p-4 border-b flex items-center gap-3"><button onClick={() => setView('sop')}><Icon name="ArrowLeft"/></button><div><h2 className="font-bold text-lg">{checklist.title?.[lang] || checklist.title?.['zh']}</h2><p className="text-xs text-text-light">{checklist.subtitle?.[lang] || checklist.subtitle?.['zh']}</p></div></div><div className="flex-1 overflow-y-auto p-4 space-y-3">{checklist.items.map(item => (<div key={item.id} className="bg-secondary p-4 rounded-xl flex items-start gap-3"><input type="checkbox" className="w-5 h-5 mt-0.5 rounded text-primary focus:ring-primary"/><div><label className="font-bold text-sm text-text">{item.text?.[lang] || item.text?.['zh']}</label><p className="text-xs text-text-light">{item.desc?.[lang] || item.desc?.['zh']}</p></div></div>))}</div></div>;
        }
        if (view === 'availability') { return <AvailabilityModal isOpen={true} onClose={() => setView('home')} t={t} currentUser={currentUser} />; }
        if (view === 'swapRequests') {
            const myRequests = swapRequests.filter((r: SwapRequest) => r.requesterId === currentUser.id);
            const incomingRequests = swapRequests.filter((r: SwapRequest) => r.targetId === currentUser.id && r.status === 'pending');
            return (
                <div className="h-full overflow-y-auto p-4 bg-secondary pb-24 text-text">
                    <h2 className="text-2xl font-black mb-4">Shift Swap Center</h2>
                    
                    <div className="mb-6">
                        <h3 className="font-bold mb-2 text-text">Incoming Requests</h3>
                        {incomingRequests.length > 0 ? incomingRequests.map((req: SwapRequest) => (
                            <div key={req.id} className="bg-surface p-4 rounded-xl border mb-2">
                                <p className="text-sm mb-2"><strong className="text-primary">{req.requesterName}</strong> wants to swap their shift:</p>
                                <div className="bg-secondary p-2 rounded-lg text-center font-mono text-sm mb-3">{req.requesterDate} ({req.requesterShift})</div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleSwapAction(req.id, 'rejected')} className="flex-1 bg-red-100 text-red-600 font-bold py-2 rounded-lg text-sm">Reject</button>
                                    <button onClick={() => handleSwapAction(req.id, 'accepted_by_peer')} className="flex-1 bg-green-100 text-green-700 font-bold py-2 rounded-lg text-sm">Accept</button>
                                </div>
                            </div>
                        )) : <p className="text-sm text-text-light italic">No incoming requests.</p>}
                    </div>


                    <div>
                        <h3 className="font-bold mb-2 text-text">My Sent Requests</h3>
                        {myRequests.length > 0 ? myRequests.map((req: SwapRequest) => {
                             const statusColors: any = { pending: 'text-yellow-600', rejected: 'text-red-600', accepted_by_peer: 'text-green-600', approved: 'text-blue-600' };
                             return (<div key={req.id} className="bg-surface p-3 rounded-xl border mb-2 text-sm">
                                <p>To <strong className="text-primary">{req.targetName}</strong> for <span className="font-mono">{req.requesterDate} ({req.requesterShift})</span></p>
                                <p>Status: <strong className={`${statusColors[req.status] || 'text-gray-500'} capitalize`}>{req.status.replace(/_/g, ' ')}</strong></p>
                            </div>)
                        }) : <p className="text-sm text-text-light italic">You haven't sent any requests.</p>}
                    </div>
                </div>
            );
        }
        return null;
    };

    const homeView = (
        <div className="h-full overflow-y-auto bg-secondary p-4 pb-24 animate-fade-in-up text-text">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-black">{t.hello} {currentUser.name}</h1>
                    <p className="text-text-light text-sm">{t.ready}</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="bg-gray-200 h-9 w-9 flex items-center justify-center rounded-full text-text-light font-bold text-sm">
                        {lang === 'zh' ? 'En' : '中'}
                    </button>
                    <button onClick={openAdmin} className="bg-gray-200 h-9 w-9 flex items-center justify-center rounded-full text-text-light"><Icon name="Shield" size={16}/></button>
                    <button onClick={onLogout} className="bg-destructive-light h-9 w-9 flex items-center justify-center rounded-full text-destructive"><Icon name="LogOut" size={16}/></button>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
                <button onClick={() => handleClockLog('clock-in')} className="bg-green-100 text-green-700 font-bold py-5 rounded-2xl flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-transform"><Icon name="LogIn" /><span>{clockBtnText.in}</span></button>
                <button onClick={() => handleClockLog('clock-out')} className="bg-red-100 text-red-700 font-bold py-5 rounded-2xl flex flex-col items-center justify-center gap-1.5 active:scale-95 transition-transform"><Icon name="LogOut" /><span>{clockBtnText.out}</span></button>
            </div>
            <div className="bg-surface p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
                <p className="text-xs text-text-light font-bold uppercase mb-2">{t.next_shift}</p>
                {nextShift ? (
                    <p className="font-bold text-text text-lg">{nextShift.date} <span className="text-primary">{nextShift.shift}</span></p>
                ) : <p className="text-sm text-text-light italic">{t.no_shift}</p>}
            </div>
            
            <LastRefillCard inventoryHistory={data.inventoryHistory} inventoryList={data.inventoryList} lang={lang} t={t} />


            <div className="mt-4">
                <h3 className="font-bold text-text mb-2">My Modules</h3>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setView('team')} className="bg-surface p-4 rounded-2xl shadow-sm border border-gray-100 text-left"><Icon name="Users" className="mb-1 text-primary"/> <p className="font-bold">My Schedule</p></button>
                    <button onClick={() => setView('swapRequests')} className="bg-surface p-4 rounded-2xl shadow-sm border border-gray-100 text-left"><Icon name="Refresh" className="mb-1 text-primary"/> <p className="font-bold">Shift Swaps</p></button>
                    <button onClick={() => setShowAvailabilityModal(true)} className="bg-surface p-4 rounded-2xl shadow-sm border border-gray-100 text-left"><Icon name="Calendar" className="mb-1 text-primary"/> <p className="font-bold">Availability</p></button>
                    <button onClick={() => setView('sop')} className="bg-surface p-4 rounded-2xl shadow-sm border border-gray-100 text-left"><Icon name="Book" className="mb-1 text-primary"/> <p className="font-bold">SOP Library</p></button>
                </div>
            </div>




        </div>
    );
    
    return (
        <div className="max-w-md mx-auto bg-surface shadow-lg h-[100dvh] overflow-hidden flex flex-col relative pt-[calc(env(safe-area-inset-top)_+_1rem)]">
            {view === 'home' ? homeView : renderView()}
            {currentUser && <StaffBottomNav activeView={view} setActiveView={setView} t={t} hasUnreadChat={hasUnreadChat} />}
            <AvailabilityReminderModal isOpen={showAvailabilityReminder} onConfirm={() => { setShowAvailabilityReminder(false); setShowAvailabilityModal(true); }} onCancel={() => setShowAvailabilityReminder(false)} t={t} />
            {currentUser && <AvailabilityModal isOpen={showAvailabilityModal} onClose={() => setShowAvailabilityModal(false)} t={t} currentUser={currentUser} />}
            <DeviationReasonModal isOpen={!!deviationData} onClose={() => { setDeviationData(null); setClockBtnText({ in: t.clock_in, out: t.clock_out }); }} onSubmit={(reason: string) => { recordLog(deviationData.type, deviationData.locTag, { reason, details: deviationData.details }); setDeviationData(null); }} details={deviationData?.details} t={t} />
             <SwapRequestModal
                isOpen={isSwapModalOpen}
                onClose={handleCloseSwapModal}
                onSubmit={handleSendSwapRequest}
                currentSwap={currentSwap}
                currentUser={currentUser}
                allUsers={users}
                targetEmployeeId={targetEmployeeId}
                setTargetEmployeeId={setTargetEmployeeId}
                reason={reason}
                setReason={setReason}
            />
            <ActionReminderModal
                isOpen={isScheduleReminderOpen}
                title="排班确认提醒"
                message="你未来两周有排班安排，请尽快确认。"
                confirmText="去排班页面"
                cancelText="稍后"
                onConfirm={() => {
                    setView('team');
                    setIsScheduleReminderOpen(false);
                }}
                onCancel={() => setIsScheduleReminderOpen(false)}
            />
             <ActionReminderModal
                isOpen={isSwapReminderOpen}
                title="换班申请提醒"
                message={`你有 ${pendingSwapCount} 条待处理的换班申请，请尽快处理。`}
                confirmText="去处理"
                cancelText="稍后"
                onConfirm={() => {
                    setView('swapRequests');
                    setIsSwapReminderOpen(false);
                }}
                onCancel={() => setIsScheduleReminderOpen(false)}
            />
        </div>
    );
};


const StaffBottomNav = ({ activeView, setActiveView, t, hasUnreadChat }: { activeView: string, setActiveView: (v: StaffViewMode) => void, t: any, hasUnreadChat: boolean }) => {
    const navItems = [
        { key: 'home', icon: 'Grid', label: t.home },
        { key: 'training', icon: 'Award', label: t.training },
        { key: 'recipes', icon: 'Coffee', label: t.recipes },
        { key: 'inventory', icon: 'Package', label: t.stock },
        { key: 'chat', icon: 'MessageSquare', label: t.chat },
    ];
    return (
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-surface/80 backdrop-blur-lg border-t border-gray-100 flex justify-around items-center max-w-md mx-auto">
            {navItems.map(item => (
                <button key={item.key} onClick={() => setActiveView(item.key as StaffViewMode)} className={`flex flex-col items-center gap-1 w-16 transition-all relative ${activeView === item.key ? 'text-primary' : 'text-text-light hover:text-primary'}`}>
                    <Icon name={item.icon as any} size={22} />
                    <span className="text-[10px] font-bold">{item.label}</span>
                    {item.key === 'chat' && hasUnreadChat && <div className="absolute top-0 right-3.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-surface"></div>}
                </button>
            ))}
        </div>
    );
};


// --- MAIN APP ---
const App = () => {
    const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('onesip_lang') as Lang) || 'zh');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [adminMode, setAdminMode] = useState<'manager' | 'owner' | 'editor' | null>(null);
    const [adminModalOpen, setAdminModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showCloudSetup, setShowCloudSetup] = useState(false);
    
    // --- Data States ---
    const [users, setUsers] = useState<User[]>(STATIC_USERS);
    const [inventoryList, setInventoryList] = useState<InventoryItem[]>(INVENTORY_ITEMS);
    const [inventoryHistory, setInventoryHistory] = useState<InventoryReport[]>([]);
    const [schedule, setSchedule] = useState<any>({ days: [] });
    const [notices, setNotices] = useState<Notice[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
    const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
    const [sales, setSales] = useState<SalesRecord[]>([]);
    const [sopList, setSopList] = useState<SopItem[]>(SOP_DATABASE);
    const [trainingLevels, setTrainingLevels] = useState<TrainingLevel[]>(TRAINING_LEVELS);
    const [recipes, setRecipes] = useState<DrinkRecipe[]>(DRINK_RECIPES);
    const [confirmations, setConfirmations] = useState<ScheduleConfirmation[]>([]);
    const [scheduleCycles, setScheduleCycles] = useState<ScheduleCycle[]>([]);
    const [smartInventoryReports, setSmartInventoryReports] = useState<SmartInventoryReport[]>([]);




    const t = TRANSLATIONS[lang];




    const appData = {
        lang, setLang, users, inventoryList, setInventoryList, inventoryHistory, 
        schedule, setSchedule, notices, logs, setLogs, t, directMessages, 
        setDirectMessages, swapRequests, setSwapRequests, sales, sopList, 
        setSopList, trainingLevels, setTrainingLevels, recipes, setRecipes, 
        confirmations, scheduleCycles, setScheduleCycles, smartInventoryReports
    };

    useEffect(() => {
        Cloud.seedInitialData();
        
        const unsubs = [
            Cloud.subscribeToUsers(setUsers),
            Cloud.subscribeToInventory(setInventoryList),
            Cloud.subscribeToSchedule((week) => setSchedule({ days: week?.days || [] })),
            Cloud.subscribeToLogs(setLogs),
            Cloud.subscribeToChat((msgs, nts) => { setDirectMessages(msgs); setNotices(nts); }),
            Cloud.subscribeToSwaps(setSwapRequests),
            Cloud.subscribeToSales(setSales),
            Cloud.subscribeToInventoryHistory(setInventoryHistory),
            Cloud.subscribeToScheduleConfirmations(setConfirmations),
            Cloud.subscribeToScheduleCycles(setScheduleCycles),
            Cloud.subscribeToContent((data) => {
                if (data?.sops) setSopList(data.sops);
                if (data?.training) setTrainingLevels(data.training);
                if (data?.recipes) setRecipes(data.recipes);
            }),
            Cloud.subscribeToSmartInventoryReports(setSmartInventoryReports)
        ];




        // Simulate initialization delay
        setTimeout(() => setIsLoading(false), 800);




        return () => {
            unsubs.forEach(unsub => unsub && unsub());
        };
    }, []);




    useEffect(() => {
        localStorage.setItem('onesip_lang', lang);
    }, [lang]);




    const handleLogin = (user: User, keepLoggedIn: boolean) => {
        setCurrentUser(user);
        if(keepLoggedIn) {
             // Logic to persist session token could go here
        }
    };




    const handleLogout = () => {
        setCurrentUser(null);
        setAdminMode(null);
    };



    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-secondary text-primary font-bold animate-pulse">Loading ONESIP...</div>;
    }




    if (adminMode === 'editor') {
        return <EditorDashboard data={appData} onExit={() => setAdminMode(null)} />;
    }




    if (adminMode === 'owner' || adminMode === 'manager') {
        return <OwnerDashboard data={appData} onExit={() => setAdminMode(null)} />;
    }




    return (
        <>
            {!currentUser && (
                <LoginScreen 
                    users={users} 
                    onLogin={handleLogin} 
                    t={t} 
                    lang={lang} 
                    setLang={setLang}
                />
            )}


            {currentUser && (
                <StaffApp 
                    onSwitchMode={() => {}} 
                    data={appData} 
                    onLogout={handleLogout} 
                    currentUser={currentUser}
                    openAdmin={() => setAdminModalOpen(true)}
                />
            )}
            
            {/* Admin Trigger for Login Screen */}
            {!currentUser && !adminMode && (
                <div className="fixed bottom-6 right-6 z-50">
                    <button 
                        onClick={() => setAdminModalOpen(true)} 
                        className="w-10 h-10 bg-gray-200/50 hover:bg-gray-200 text-gray-500 hover:text-gray-800 rounded-full flex items-center justify-center transition-all backdrop-blur-sm"
                    >
                        <Icon name="Shield" size={18} />
                    </button>
                </div>
            )}




            <AdminLoginModal 
                isOpen={adminModalOpen} 
                onClose={() => setAdminModalOpen(false)} 
                onLogin={(role) => {
                    setAdminModalOpen(false);
                    setAdminMode(role);
                }} 
            />
            {showCloudSetup && <CloudSetupModal isOpen={showCloudSetup} onClose={() => setShowCloudSetup(false)} />}
        </>
    );
};




export default App;