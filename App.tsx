
import React, { useState, useEffect, useRef, useMemo } from 'react';
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

// 修复版：增加对 YouTube Shorts 链接的支持
function getYouTubeId(url: string | undefined) {
    if (!url) return null;
    // 这里在正则中加入了 shorts\/ 来匹配短视频链接
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
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

// ============================================================================
// 组件: 内容编辑器 (Editor Dashboard) - 支持视频直链文案
// ============================================================================
const EditorDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { sopList, setSopList, trainingLevels, setTrainingLevels, recipes, setRecipes, t } = data;
    const [view, setView] = useState<'training' | 'sop' | 'recipes'>('training');
    const [editingItem, setEditingItem] = useState<any>(null);
    const [isProcessingPdf, setIsProcessingPdf] = useState(false);
    
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

        const removeUndefinedRecursive = (obj: any): any => {
            if (obj === null || typeof obj !== 'object') return obj;
            if (Array.isArray(obj)) return obj.map(item => removeUndefinedRecursive(item)).filter(item => item !== undefined);
            const newObj: { [key: string]: any } = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    const value = obj[key];
                    if (value !== undefined) newObj[key] = removeUndefinedRecursive(value);
                }
            }
            return newObj;
        };

        let updatedList;
        let setList;
        let listKey: 'sops' | 'training' | 'recipes' = 'recipes'; 

        if (view === 'sop') {
            listKey = 'sops';
            updatedList = sopList.some((i: any) => i.id === editingItem.id) ? sopList.map((i: any) => (i.id === editingItem.id ? editingItem : i)) : [...sopList, editingItem];
            setList = setSopList;
        } else if (view === 'training') {
            listKey = 'training';
            updatedList = trainingLevels.some((i: any) => i.id === editingItem.id) ? trainingLevels.map((i: any) => (i.id === editingItem.id ? editingItem : i)) : [...trainingLevels, editingItem];
            setList = setTrainingLevels;
        } else if (view === 'recipes') {
            listKey = 'recipes';
            const sanitizedItem = {
                ...editingItem,
                coverImageUrl: editingItem.coverImageUrl?.trim() || undefined,
                tutorialVideoUrl: editingItem.tutorialVideoUrl?.trim() || undefined,
                recipeType: editingItem.recipeType || 'product', 
            };
            updatedList = recipes.some((i: any) => i.id === editingItem.id) ? recipes.map((i: any) => (i.id === editingItem.id ? sanitizedItem : i)) : [...recipes, sanitizedItem];
            setList = setRecipes;
        }

        if (updatedList && setList) {
            try {
                const listToSave = removeUndefinedRecursive(updatedList);
                await Cloud.saveContent(listKey, listToSave);
                setList(listToSave);
                setEditingItem(null);
            } catch (error: any) { alert(error.message); }
        } else { setEditingItem(null); }
    };
    const handleDelete = (id: string) => { if(!window.confirm("Delete this item?")) return; if (view === 'sop') { const list = sopList.filter((i:any) => i.id !== id); setSopList(list); Cloud.saveContent('sops', list); } else if (view === 'training') { const list = trainingLevels.filter((i:any) => i.id !== id); setTrainingLevels(list); Cloud.saveContent('training', list); } else { const list = recipes.filter((i:any) => i.id !== id); setRecipes(list); Cloud.saveContent('recipes', list); } };
    
    const handleMoveRecipe = (indexToMove: number, direction: 'up' | 'down') => {
        const sortedRecipes = [...recipes].sort((a, b) => {
            const orderA = a.sortOrder ?? Infinity;
            const orderB = b.sortOrder ?? Infinity;
            if (orderA !== orderB) return orderA - orderB;
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });

        if ((direction === 'up' && indexToMove === 0) || (direction === 'down' && indexToMove === sortedRecipes.length - 1)) return;

        const targetIndex = direction === 'up' ? indexToMove - 1 : indexToMove + 1;
        const reorderedList = [...sortedRecipes];
        const [movedItem] = reorderedList.splice(indexToMove, 1);
        reorderedList.splice(targetIndex, 0, movedItem);

        const updatedList = reorderedList.map((recipe, index) => ({ ...recipe, sortOrder: index }));
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
                3. Finally, return a single, complete JSON object that includes both the original English and the translated Chinese.`;

                const response = await ai.models.generateContent({
                    model: 'gemini-3-pro-preview',
                    contents: { parts: [{ text: prompt }, { inlineData: { mimeType: 'application/pdf', data: base64Data } }] },
                    config: { responseMimeType: "application/json", responseSchema: recipeSchema }
                });

                const text = response.text;
                if (text) {
                    try {
                        const jsonStr = text.trim().replace(/^```json\s*/, '').replace(/```$/, '');
                        const extracted = JSON.parse(jsonStr);
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
                            if ((!updated.steps.cold || updated.steps.cold.length === 0) && extracted.steps?.cold) updated.steps.cold = extracted.steps.cold;
                            if ((!updated.steps.warm || updated.steps.warm.length === 0) && extracted.steps?.warm) updated.steps.warm = extracted.steps.warm;
                            return updated;
                        });
                        alert("✅ Recipe auto-filled from PDF!\n已从 PDF 识别英文内容并生成中文翻译草稿。");
                    } catch (parseError) { alert("Could not parse recipe from PDF."); }
                }
            };
            reader.readAsDataURL(file);
        } catch (err) { alert("Error processing PDF."); } finally { setIsProcessingPdf(false); }
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
                <div>
                    <label className="block text-xs font-bold text-blue-400 mb-1 flex items-center gap-2"><Icon name="Camera" size={12}/> IMAGE GALLERY (Max 6)</label>
                    <div className="space-y-2">
                        {(editingItem.imageUrls || []).map((url: string, idx: number) => (
                            <div key={idx} className="flex gap-2">
                                <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Image URL..." value={url} onChange={e => { const newUrls = [...(editingItem.imageUrls || [])]; newUrls[idx] = e.target.value; setEditingItem({...editingItem, imageUrls: newUrls}); }} />
                                <button onClick={() => { const newUrls = [...(editingItem.imageUrls || [])]; newUrls.splice(idx, 1); setEditingItem({...editingItem, imageUrls: newUrls}); }} className="px-3 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"><Icon name="Trash" size={14}/></button>
                            </div>
                        ))}
                        {(editingItem.imageUrls?.length || 0) < 6 && (
                            <button onClick={() => setEditingItem({...editingItem, imageUrls: [...(editingItem.imageUrls || []), '']})} className="text-xs bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded font-bold hover:bg-blue-500/20">+ Add Image URL</button>
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
                <div><label className="block text-xs font-bold text-dark-accent/70 mb-1">CONTENT (EN)</label><textarea className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm h-40 font-mono" value={editingItem.content?.en || ''} onChange={e => setEditingItem({...editingItem, content: {...(editingItem.content || {zh:'', en:''}), en: e.target.value}})} /></div>
                <div><label className="block text-xs font-bold text-dark-accent/70 mb-1">CONTENT (ZH)</label><textarea className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm h-40 font-mono" value={editingItem.content?.zh || ''} onChange={e => setEditingItem({...editingItem, content: {...(editingItem.content || {zh:'', en:''}), zh: e.target.value}})} /></div>
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
                    <div><label className="text-[10px] uppercase font-bold text-dark-text-light">Cover Image URL</label><input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="https://..." value={editingItem.coverImageUrl || ''} onChange={e => setEditingItem({...editingItem, coverImageUrl: e.target.value})} /></div>
                    
                    {/* 【修改点】：文案更新为 MP4 / YouTube */}
                    <div className="mt-2">
                        <label className="text-[10px] uppercase font-bold text-dark-text-light">Tutorial Video URL (MP4 / YouTube)</label>
                        <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="https://... (.mp4 link or YouTube)" value={editingItem.tutorialVideoUrl || ''} onChange={e => setEditingItem({...editingItem, tutorialVideoUrl: e.target.value})} />
                    </div>
                </div>
                <div className="border-t border-white/10 pt-4 mt-2 space-y-3">
                     <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={editingItem.isPublished !== false} onChange={e => setEditingItem({...editingItem, isPublished: e.target.checked})} className="w-5 h-5 rounded bg-dark-bg border-white/20 text-dark-accent focus:ring-dark-accent" />
                        <span className="font-bold text-dark-accent">在员工端显示 / Publish to staff app</span>
                    </label>
                    <div>
                        <label className="text-[10px] uppercase font-bold text-dark-text-light">Recipe Type</label>
                        <select className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" value={editingItem.recipeType || 'product'} onChange={e => setEditingItem({...editingItem, recipeType: e.target.value})}>
                            <option value="product">Product (成品配方)</option>
                            <option value="premix">Premix (基底/半成品)</option>
                        </select>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer bg-dark-bg p-3 rounded-lg border border-red-500/30">
                        <input type="checkbox" checked={!!editingItem.isNew} onChange={e => setEditingItem({...editingItem, isNew: e.target.checked})} className="w-5 h-5 rounded bg-dark-bg border-white/20 text-red-400 focus:ring-red-400" />
                        <span className="font-bold text-red-400">标记为新配方并在员工端首页置顶 (Pin to Home)</span>
                    </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] uppercase font-bold text-dark-text-light">Name (EN)</label><input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm font-bold" placeholder="Name (EN)" value={editingItem.name?.en || ''} onChange={e => setEditingItem({...editingItem, name: {...(editingItem.name || {zh:'', en:''}), en: e.target.value}})} /></div>
                    <div><label className="text-[10px] uppercase font-bold text-dark-text-light">Name (ZH)</label><input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm font-bold" placeholder="Name (ZH)" value={editingItem.name?.zh || ''} onChange={e => setEditingItem({...editingItem, name: {...(editingItem.name || {zh:'', en:''}), zh: e.target.value}})} /></div>
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
                    <div><label className="text-[10px] uppercase font-bold text-dark-text-light">Base Prep (EN)</label><textarea className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm h-20" placeholder="Instructions for preparing base ingredients..." value={editingItem.basePreparation?.en || ''} onChange={e => setEditingItem({...editingItem, basePreparation: {...(editingItem.basePreparation || {zh:'', en:''}), en: e.target.value}})} /></div>
                    <div className="mt-2"><label className="text-[10px] uppercase font-bold text-dark-text-light">基底配制 (ZH)</label><textarea className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm h-20" placeholder="配制基底原料的步骤..." value={editingItem.basePreparation?.zh || ''} onChange={e => setEditingItem({...editingItem, basePreparation: {...(editingItem.basePreparation || {zh:'', en:''}), zh: e.target.value}})} /></div>
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
        if (orderA !== orderB) return orderA - orderB;
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
                                           <button onClick={() => handleMoveRecipe(index, 'up')} disabled={index === 0} className="p-2 bg-white/5 text-dark-text-light rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"><Icon name="ChevronUp" size={16}/></button>
                                           <button onClick={() => handleMoveRecipe(index, 'down')} disabled={index === sortedRecipesForDisplay.length - 1} className="p-2 bg-white/5 text-dark-text-light rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"><Icon name="ChevronDown" size={16}/></button>
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

// ============================================================================
// 1. OwnerInventoryLogsView (日志查看)
// ============================================================================
const OwnerInventoryLogsView = ({ logs, currentUser, onUpdateLogs }: { logs: any[], currentUser: any, onUpdateLogs: (logs: any[]) => void }) => {
    // 简单过滤出包含 items 的日志 (补货日志)
    const materialLogs = (logs || []).filter(log => log.items && Array.isArray(log.items)).slice().reverse();

    const handleInvalidate = (log: any) => {
        if (!window.confirm("Invalidate this log? This will reverse the stock changes.")) return;
        const newLogs = logs.map(l => l.id === log.id ? { ...l, isDeleted: true, deleteReason: `Invalidated by ${currentUser.name}` } : l);
        onUpdateLogs(newLogs);
    };

    return (
        <div className="p-4 space-y-3">
            <h3 className="text-lg font-bold text-dark-text">Material Logs</h3>
            {materialLogs.length === 0 && <p className="text-dark-text-light text-center py-10">No material logs found.</p>}
            {materialLogs.map((log: any) => (
                <div key={log.id} className={`bg-dark-surface p-3 rounded-xl border border-white/10 ${log.isDeleted ? 'opacity-50' : ''}`}>
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <p className="text-sm font-bold">{log.submittedBy || log.name} <span className="text-xs text-dark-text-light">({log.type || 'refill'})</span></p>
                            <p className="text-xs text-dark-text-light">{new Date(log.time || log.date).toLocaleString()}</p>
                            {log.isDeleted && <span className="text-xs text-red-400 font-bold">[INVALIDATED]</span>}
                        </div>
                        {!log.isDeleted && (
                            <button onClick={() => handleInvalidate(log)} className="bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500/20">Invalidate</button>
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
                </div>
            ))}
        </div>
    );
};

// ============================================================================
// 2. StaffManagementView (员工管理)
// ============================================================================
const StaffManagementView = ({ users }: { users: any[] }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [tempUser, setTempUser] = useState<any>({ id: '', name: '', role: 'staff', phone: '', password: '', active: true });

    const handleEdit = (user: any) => {
        setTempUser(user || { id: `u_${Date.now()}`, name: '', role: 'staff', phone: '', password: '', active: true });
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (!tempUser.name) return alert("Name is required");
        await Cloud.saveUser(tempUser);
        setIsEditing(false);
        alert("Staff saved!");
    };

    return (
        <div className="p-4 space-y-4 text-dark-text">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">Staff Management</h3>
                <button onClick={() => handleEdit(null)} className="bg-dark-accent text-dark-bg px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:opacity-90">
                    <Icon name="Plus" size={16} /> Add Staff
                </button>
            </div>

            {isEditing && (
                <div className="bg-dark-surface p-4 rounded-xl border border-white/10 space-y-3 mb-4">
                    <h4 className="font-bold text-white">Edit Staff</h4>
                    <input className="w-full p-2 rounded bg-dark-bg border border-white/20 text-white" placeholder="Name" value={tempUser.name} onChange={e => setTempUser({...tempUser, name: e.target.value})} />
                    <input className="w-full p-2 rounded bg-dark-bg border border-white/20 text-white" placeholder="Phone" value={tempUser.phone} onChange={e => setTempUser({...tempUser, phone: e.target.value})} />
                    <input className="w-full p-2 rounded bg-dark-bg border border-white/20 text-white" placeholder="Password (4 digits)" maxLength={4} value={tempUser.password} onChange={e => setTempUser({...tempUser, password: e.target.value})} />
                    <select className="w-full p-2 rounded bg-dark-bg border border-white/20 text-white" value={tempUser.role} onChange={e => setTempUser({...tempUser, role: e.target.value})}>
                        <option value="staff">Staff</option><option value="manager">Manager</option><option value="boss">Boss</option>
                    </select>
                    <div className="flex gap-2">
                        <button onClick={() => setIsEditing(false)} className="flex-1 bg-white/10 text-white p-2 rounded">Cancel</button>
                        <button onClick={handleSave} className="flex-1 bg-green-600 text-white p-2 rounded">Save</button>
                    </div>
                </div>
            )}

            <div className="bg-dark-surface rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-xs">
                    <thead className="bg-dark-bg text-dark-text-light uppercase">
                        <tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Role</th><th className="p-3 text-center">Action</th></tr>
                    </thead>
                    <tbody>
                        {users.filter(u => u.active !== false).map(user => (
                            <tr key={user.id} className="border-t border-white/10">
                                <td className="p-3 font-bold">{user.name}</td>
                                <td className="p-3 capitalize">{user.role}</td>
                                <td className="p-3 text-center">
                                    <button onClick={() => handleEdit(user)} className="text-blue-400 hover:underline">Edit</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ============================================================================
// 组件 1: Prep Inventory (前台补料 & 后台管理 - 早班补货 + 自动暂存版)
// ============================================================================
const InventoryView = ({ lang, t, inventoryList, setInventoryList, isOwner, onSubmit, currentUser, isForced, onCancel, forcedShift }: any) => {
    const todayObj = new Date();
    const todayIndex = todayObj.getDay(); 
    let dayGroup: 'mon_thu' | 'fri' | 'sat' | 'sun' = 'mon_thu';
    if (todayIndex === 5) dayGroup = 'fri';
    if (todayIndex === 6) dayGroup = 'sat';
    if (todayIndex === 0) dayGroup = 'sun';

    // 只有周五和周六需要早班
    const isAmNeeded = (todayIndex === 5 || todayIndex === 6);
    const initialShift = (isAmNeeded && todayObj.getHours() < 16) ? 'morning' : 'evening';

    const [viewShift, setViewShift] = useState<'morning' | 'evening'>(initialShift);

    const [editTargets, setEditTargets] = useState(false);
    const [localList, setLocalList] = useState<any[]>(JSON.parse(JSON.stringify(inventoryList || [])));
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [newItemData, setNewItemData] = useState({ nameZH: '', nameEN: '', unit: 'L', category: 'premix' });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [inputData, setInputData] = useState<Record<string, { end: string, isChecked?: boolean }>>({});
    const [fridgeChecked, setFridgeChecked] = useState(false);

    // --- 【新增】本地草稿/自动暂存逻辑 ---
    const draftKey = `onesip_prep_draft_${currentUser?.id}_${dayGroup}_${viewShift}`;

    useEffect(() => {
        if (isOwner) return; // 店长后台模式不需要暂存
        const saved = localStorage.getItem(draftKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setInputData(parsed.inputData || {});
                setFridgeChecked(!!parsed.fridgeChecked);
            } catch(e) {}
        } else {
            setInputData({});
            setFridgeChecked(false);
        }
    }, [draftKey, isOwner, viewShift]); // 切换早晚班时，加载不同的草稿

    useEffect(() => {
        if (isOwner) return;
        localStorage.setItem(draftKey, JSON.stringify({ inputData, fridgeChecked }));
    }, [inputData, fridgeChecked, draftKey, isOwner]);
    // ------------------------------------

    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';

    const handleCheck = (id: string, target: number) => {
        setInputData(prev => {
            const currentlyChecked = prev[id]?.isChecked;
            return {
                ...prev,
                [id]: {
                    ...prev[id],
                    isChecked: !currentlyChecked, 
                    end: !currentlyChecked ? String(target) : '' 
                }
            };
        });
    };

    const handleAmountChange = (id: string, target: number, val: string) => {
        setInputData(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                end: val,
                isChecked: parseFloat(val) === target 
            }
        }));
    };

    const handleTargetChange = (id: string, group: string, shift: string, val: string) => {
        setLocalList(prev => prev.map(item => {
            if (item.id === id) {
                const newTargets = item.dailyTargets ? JSON.parse(JSON.stringify(item.dailyTargets)) : {
                    mon_thu: {morning:0, evening:0}, fri: {morning:0, evening:0}, sat: {morning:0, evening:0}, sun: {morning:0, evening:0}
                };
                newTargets[group][shift] = parseFloat(val);
                return { ...item, dailyTargets: newTargets };
            }
            return item;
        }));
    };

    const toggleHidden = (id: string) => {
        setLocalList(prev => prev.map(item => item.id === id ? { ...item, hidden: !item.hidden } : item));
    };

    const handleDownloadTemplate = () => {
        const headers = "Name(ZH),Name(EN),Unit,Category,MonThu_AM,MonThu_PM,Fri_AM,Fri_PM,Sat_AM,Sat_PM,Sun_AM,Sun_PM\n";
        const rows = localList.map((item: any) => {
            const t = item.dailyTargets || {};
            const safe = (val: any) => val || 0;
            return [
                item.name.zh, item.name.en, item.unit, item.category,
                safe(t.mon_thu?.morning), safe(t.mon_thu?.evening),
                safe(t.fri?.morning), safe(t.fri?.evening),
                safe(t.sat?.morning), safe(t.sat?.evening),
                safe(t.sun?.morning), safe(t.sun?.evening)
            ].join(',');
        }).join('\n');
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, headers + rows], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.setAttribute("download", "prep_targets_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileUpload = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        const readFile = (f: File, encoding: string): Promise<string> => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (evt) => resolve(evt.target?.result as string);
                reader.onerror = (err) => reject(err);
                reader.readAsText(f, encoding);
            });
        };
        try {
            let csvText = await readFile(file, 'UTF-8');
            if (csvText.includes('\uFFFD') || (!csvText.includes("Name(ZH)") && !csvText.includes("Category"))) {
                csvText = await readFile(file, 'GBK');
            }
            if (!csvText) { alert("File is empty!"); return; }
            const lines = csvText.split(/\r?\n/);
            const newItems = [...localList];
            let updatedCount = 0;
            let createdCount = 0;
            lines.slice(1).forEach((line) => {
                if (!line.trim()) return;
                let cols = line.split(',');
                if (cols.length < 2) cols = line.split(';'); 
                cols = cols.map(c => c.trim().replace(/^"|"$/g, ''));
                if (cols.length < 4) return;
                const [zh, en, unit, cat, mt_am, mt_pm, f_am, f_pm, s_am, s_pm, su_am, su_pm] = cols;
                if (!zh || zh.includes('Name(ZH)')) return; 
                let itemIndex = newItems.findIndex(i => i.name.zh === zh);
                const targets = {
                    mon_thu: { morning: parseFloat(mt_am)||0, evening: parseFloat(mt_pm)||0 },
                    fri: { morning: parseFloat(f_am)||0, evening: parseFloat(f_pm)||0 },
                    sat: { morning: parseFloat(s_am)||0, evening: parseFloat(s_pm)||0 },
                    sun: { morning: parseFloat(su_am)||0, evening: parseFloat(su_pm)||0 }
                };
                if (itemIndex >= 0) {
                    newItems[itemIndex] = { ...newItems[itemIndex], dailyTargets: targets, unit: unit || newItems[itemIndex].unit, category: cat || newItems[itemIndex].category };
                    updatedCount++;
                } else {
                    newItems.push({
                        id: `p_imp_${Date.now()}_${Math.floor(Math.random()*1000)}`,
                        name: { zh: zh, en: en || zh },
                        unit: unit || 'L',
                        category: cat || 'other',
                        defaultVal: '0',
                        hidden: false,
                        dailyTargets: targets
                    });
                    createdCount++;
                }
            });
            setLocalList(newItems);
            Cloud.saveInventoryList(newItems);
            setInventoryList(newItems);
            alert(`✅ Import Success!\nUpdated: ${updatedCount}\nCreated: ${createdCount}`);
        } catch (err) { console.error(err); alert("Error reading file."); } 
        finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const handleAddItem = () => {
        if (!newItemData.nameZH || !newItemData.nameEN) return alert("Please enter names.");
        const newItem: any = {
            id: `p_new_${Date.now()}`,
            name: { zh: newItemData.nameZH, en: newItemData.nameEN },
            unit: newItemData.unit,
            category: newItemData.category,
            defaultVal: '0',
            hidden: false,
            dailyTargets: { mon_thu: { morning: 0, evening: 0 }, fri: { morning: 0, evening: 0 }, sat: { morning: 0, evening: 0 }, sun: { morning: 0, evening: 0 } }
        };
        const newList = [...localList, newItem];
        setLocalList(newList);
        Cloud.saveInventoryList(newList);
        setInventoryList(newList);
        setIsAddingItem(false);
        setNewItemData({ nameZH: '', nameEN: '', unit: 'L', category: 'premix' });
        alert("Item Added!");
    };

    const saveTargets = () => {
        Cloud.saveInventoryList(localList);
        setInventoryList(localList);
        alert("✅ Changes saved successfully!");
        setEditTargets(false);
    };

    const handleStaffSubmit = () => {
        const visibleItems = inventoryList.filter((item: any) => !item.hidden);
        
        const incompleteItem = visibleItems.find((item: any) => {
            const target = item.dailyTargets?.[dayGroup]?.[viewShift] || 0;
            if (target === 0) return false;

            const val = inputData[item.id]?.end;
            return val === undefined || val === '' || val === null;
        });

        if (incompleteItem) {
            alert(lang === 'zh' 
                ? `⚠️ 信息缺失！\n请确认或填写以下物品的补加量: ${getLoc(incompleteItem.name)}`
                : `⚠️ Missing Input!\nPlease verify or enter the added amount for: ${getLoc(incompleteItem.name)}`
            );
            return;
        }

        if (!fridgeChecked) {
            alert(lang === 'zh'
                ? "⚠️ 必须进行安全检查！\n请检查冰箱温度 (< 6°C) 并勾选确认框。"
                : "⚠️ Safety Check Required!\nPlease check the fridge temperature (< 6°C) and tick the box."
            );
            return; 
        }

        onSubmit({ 
            submittedBy: currentUser?.name, 
            userId: currentUser?.id, 
            data: inputData, 
            shift: viewShift, 
            dayGroup: dayGroup, 
            date: new Date().toISOString(),
            fridgeChecked: fridgeChecked 
        });

        // 提交成功后清空草稿
        localStorage.removeItem(draftKey);
        setInputData({});
        setFridgeChecked(false);
    };

    if (isOwner) {
        return (
            <div className="flex flex-col h-full bg-dark-bg text-dark-text animate-fade-in">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
                <div className="p-4 bg-dark-surface border-b border-white/10 sticky top-0 z-10 shadow-md flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-black text-white flex items-center gap-2">
                            <Icon name="Coffee" className="text-orange-400"/> Manage Prep Targets
                        </h2>
                        <p className="text-xs text-dark-text-light">Set goals & visibility</p>
                    </div>
                    <div className="flex gap-2">
                        {editTargets ? (
                            <>
                                <button onClick={() => setEditTargets(false)} className="bg-white/10 text-white px-3 py-2 rounded-lg text-xs font-bold">Cancel</button>
                                <button onClick={saveTargets} className="bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-bold">Save All</button>
                            </>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={handleDownloadTemplate} className="bg-white/5 hover:bg-white/10 text-dark-text-light px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"><Icon name="Download" size={14} /> Template</button>
                                <button onClick={() => fileInputRef.current?.click()} className="bg-white/5 hover:bg-white/10 text-blue-300 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"><Icon name="Upload" size={14} /> Import</button>
                                <div className="w-px bg-white/10 mx-1"></div>
                                <button onClick={() => setIsAddingItem(true)} className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1"><Icon name="Plus" size={14} /> Add</button>
                                <button onClick={() => setEditTargets(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-xs font-bold">Edit</button>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
                    {localList.map((item: any) => (
                        <div key={item.id} className={`bg-dark-surface p-4 rounded-xl border transition-all ${item.hidden ? 'border-red-500/30 opacity-60' : 'border-white/10'}`}>
                            <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-2">
                                <div className="flex items-center gap-2">
                                    {editTargets && (
                                        <button onClick={() => toggleHidden(item.id)} className={`p-1.5 rounded-lg transition-colors ${item.hidden ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                            <Icon name={item.hidden ? "EyeOff" : "Eye"} size={16} />
                                        </button>
                                    )}
                                    <div><h3 className={`font-bold text-lg ${item.hidden ? 'text-gray-500 line-through' : 'text-white'}`}>{item.name.zh} <span className="text-dark-text-light text-xs font-normal">({item.name.en})</span></h3></div>
                                </div>
                                <span className="text-xs font-mono bg-white/10 px-2 py-1 rounded text-orange-300">{item.unit}</span>
                            </div>
                            <div className="grid grid-cols-5 gap-1 text-center text-[10px] text-dark-text-light uppercase font-bold mb-1"><div></div><div>Mon-Thu</div><div>Fri</div><div>Sat</div><div>Sun</div></div>
                            {['morning', 'evening'].map(shift => (
                                <div key={shift} className="grid grid-cols-5 gap-2 items-center mb-2">
                                    <div className={`text-[10px] uppercase font-bold text-right pr-2 ${shift==='morning'?'text-yellow-400':'text-indigo-400'}`}>{shift}</div>
                                    {['mon_thu', 'fri', 'sat', 'sun'].map(group => {
                                        const val = item.dailyTargets?.[group]?.[shift] || 0;
                                        return editTargets ? (
                                            <input key={group} type="number" className="w-full bg-dark-bg border border-white/20 rounded p-2 text-center text-white text-sm font-bold focus:border-blue-500 outline-none" value={val} onChange={e => handleTargetChange(item.id, group, shift, e.target.value)} />
                                        ) : (
                                            <div key={group} className="bg-white/5 rounded p-2 text-white text-sm font-mono text-center border border-white/5">{val}</div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-secondary pb-20 animate-fade-in-up text-text">
            <div className="bg-white p-4 border-b sticky top-0 z-10 shadow-sm">
                 <div className="flex justify-between items-center mb-2">
                    <h2 className="text-xl font-black flex items-center gap-2">
                        {viewShift === 'morning' 
                            ? <span className="text-orange-500">{lang === 'zh' ? '☀️ 早班补货 (AM)' : '☀️ Morning Refill (AM)'}</span>
                            : <span className="text-indigo-500">{lang === 'zh' ? '🌙 晚班盘点 (PM)' : '🌙 Evening Prep (PM)'}</span>
                        }
                    </h2>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">
                    <span>{lang === 'zh' ? '目标周期:' : 'Target Day:'} <strong className="uppercase text-gray-800">{dayGroup.replace('_', '-')}</strong></span>
                    {isAmNeeded && (
                        <div className="flex gap-2">
                            <button onClick={()=>setViewShift('morning')} className={`px-2 py-1 rounded ${viewShift==='morning'?'bg-white shadow text-orange-500 font-bold':'text-gray-400'}`}>AM</button>
                            <button onClick={()=>setViewShift('evening')} className={`px-2 py-1 rounded ${viewShift==='evening'?'bg-white shadow text-indigo-500 font-bold':'text-gray-400'}`}>PM</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1">
                {inventoryList.filter((item: any) => !item.hidden).map((item: any) => {
                    const target = item.dailyTargets?.[dayGroup]?.[viewShift] || 0;
                    if (target === 0) return null;

                    return (
                        <div key={item.id} className="bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-3">
                            <div className="flex justify-between items-center border-b pb-2 border-gray-100">
                                <div className="font-bold text-lg text-gray-800">{getLoc(item.name)}</div>
                                <div className={`text-xs font-bold px-3 py-1 rounded-full border ${viewShift === 'morning' ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-primary bg-indigo-50 border-indigo-100'}`}>
                                    {lang === 'zh' ? '目标:' : 'Target:'} <span className="text-lg">{target}</span> {item.unit}
                                </div>
                            </div>
                            
                            <div className="flex gap-3 items-center bg-gray-50 p-2 rounded-xl border border-gray-100">
                                <button
                                    onClick={() => handleCheck(item.id, target)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-all ${inputData[item.id]?.isChecked ? 'bg-green-500 border-green-500 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <Icon name="CheckCircle2" size={20} />
                                    <span className="font-bold text-sm">
                                        {lang === 'zh' ? `补足了 ${target}` : `Filled ${target}`}
                                    </span>
                                </button>

                                <div className="w-[120px] flex flex-col border-l border-gray-200 pl-3">
                                    <label className="text-[9px] font-bold text-gray-400 mb-1 uppercase text-center">
                                        {lang === 'zh' ? '实际补加量' : 'Actual Added'}
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full p-2 rounded-lg border border-gray-300 text-center text-lg font-bold focus:bg-white focus:border-primary transition-colors outline-none"
                                        placeholder={String(target)}
                                        value={inputData[item.id]?.end ?? ''}
                                        onChange={(e) => handleAmountChange(item.id, target, e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            <div className="p-4 bg-white border-t sticky bottom-0 z-20 space-y-3 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex items-center gap-3 cursor-pointer" onClick={() => setFridgeChecked(!fridgeChecked)}>
                    <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${fridgeChecked ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-blue-300'}`}>
                        {fridgeChecked && <Icon name="Check" size={16} />}
                    </div>
                    <div className="flex-1">
                        <p className="font-bold text-blue-900 text-sm">
                            {lang === 'zh' ? '检查冰箱温度 < 6°C' : 'Check Fridge Temp < 6°C'}
                        </p>
                        <p className="text-xs text-blue-600">
                            {lang === 'zh' ? '该安全检查为必填项。' : 'Checking temperature is mandatory.'}
                        </p>
                    </div>
                    <Icon name="Snowflake" className="text-blue-300" />
                </div>

                <button onClick={handleStaffSubmit} className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 hover:bg-primary-dark">
                    <Icon name="Save" size={20} /> 
                    {lang === 'zh' 
                        ? (viewShift === 'morning' ? '提交早班补货记录' : '提交晚班盘点报告') 
                        : (viewShift === 'morning' ? 'Submit AM Refill' : 'Submit PM Report')
                    }
                </button>
            </div>
        </div>
    );
};
// ============================================================================
// 组件 4: Smart Inventory View (后台仓库 - 显示当前库存 + 提交反馈)
// ============================================================================
const SmartInventoryView = ({ data, onSaveReport }: any) => {
    const { smartInventory, setSmartInventory } = data;
    const [supplierFilter, setSupplierFilter] = useState<'All' | "I'tea" | 'Joybuy' | 'Open Mkt'>('All');
    
    // --- 模式状态 ---
    const [isManageMode, setIsManageMode] = useState(false);
    const [manageList, setManageList] = useState<any[]>([]); 

    // --- 盘点模式数据 ---
    const [inputs, setInputs] = useState<Record<string, { count: string, add: string }>>({});

    useEffect(() => {
        if (isManageMode) {
            setManageList(JSON.parse(JSON.stringify(smartInventory || [])));
        }
    }, [isManageMode, smartInventory]);

    const handleInputChange = (id: string, field: 'count' | 'add', val: string) => {
        setInputs(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
    };

    // 计算预览 Total (仅用于显示本次操作后的结果)
    const calculatePreviewTotal = (item: any) => {
        const itemInput = inputs[item.id] || {};
        // 如果填了 Count (盘点)，则以 Count 为准 + Add
        // 如果没填 Count，则以 数据库原库存 (Current) 为准 + Add
        // *通常盘点是覆盖式，所以这里逻辑是：只要填了 Count，就覆盖 Current。没填 Count，默认为 0 (开始盘点)*
        // 但为了避免误解，我们显示: (Count || 0) + (Add || 0)
        const count = parseFloat(itemInput.count) || 0;
        const add = parseFloat(itemInput.add) || 0;
        return count + add;
    };

    const handleEditItem = (id: string, field: string, value: any) => {
        setManageList(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const handleAddItem = () => {
        const newItem = {
            id: `item_${Date.now()}`,
            area: 'Storage', // 默认
            name: 'New Item',
            category: 'Others',
            position: 'Z9',
            unit: 'pcs',
            supplier: "Open Mkt",
            safetyStock: 5,
            currentStock: 0
        };
        setManageList(prev => [...prev, newItem]);
        setTimeout(() => { const el = document.getElementById('manage-list-bottom'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 100);
    };

    const handleDeleteItem = (id: string) => {
        if (confirm("Delete this item permanently?")) setManageList(prev => prev.filter(item => item.id !== id));
    };

    const handleSaveManagement = async () => {
        if (manageList.some(i => !i.name)) { alert("Error: Item name cannot be empty."); return; }
        setSmartInventory(manageList);
        await Cloud.saveSmartInventory(manageList);
        setIsManageMode(false);
        alert("✅ Warehouse settings updated!");
    };

    // --- 提交周报 (核心修改：增加统计和反馈) ---
    const handleSubmitWeekly = () => {
        const now = new Date();
        // 计算周号
        const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
        const currentWeekStr = `${now.getFullYear()}-W${weekNum}`;
        const dateRange = `${now.toLocaleDateString()}`;

        // 统计有多少项被修改了
        const inputKeys = Object.keys(inputs);
        const modifiedCount = inputKeys.length;

        if (modifiedCount === 0) {
            if (!confirm("⚠️ Warning: You haven't entered any numbers. Submit an EMPTY report?")) return;
        } else {
            if (!confirm(`Submit Inventory Report (${currentWeekStr})?\n\nYou have updated ${modifiedCount} items.`)) return;
        }

        try {
            const reportItems: any[] = [];
            let updatedCount = 0;

            const newInventoryList = smartInventory.map((item: any) => {
                const inp = inputs[item.id];
                
                // 如果用户没填，我们默认保持原库存？还是归零？
                // 既然是 Weekly Count，通常没填的视为 0 或者 未盘点。
                // 这里的逻辑：如果 inp 存在，说明填了，更新库存。如果不存在，保持原库存 (Current Stock)。
                // *修改*：为了防止意外归零，我们只更新有输入的项。
                
                let totalVal = item.currentStock; // 默认保持不变
                let countVal = 0;
                let addVal = 0;

                if (inp) {
                    countVal = parseFloat(inp.count) || 0;
                    addVal = parseFloat(inp.add) || 0;
                    totalVal = countVal + addVal;
                    updatedCount++;
                }

                reportItems.push({
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    supplier: item.supplier,
                    unit: item.unit,
                    count: inp ? countVal : item.currentStock, // 报表里记录
                    added: addVal,
                    currentStock: totalVal,
                    safetyStock: item.safetyStock,
                    status: totalVal < item.safetyStock ? 'LOW' : 'OK'
                });

                return { ...item, currentStock: totalVal, lastUpdated: new Date().toISOString() };
            });

            // 保存到 Cloud
            setSmartInventory(newInventoryList);
            Cloud.saveSmartInventory(newInventoryList);

            const report: SmartInventoryReport = {
                id: Date.now().toString(),
                weekStr: currentWeekStr,
                dateRange: dateRange,
                submittedBy: 'Owner',
                submittedAt: new Date().toISOString(),
                items: reportItems
            };

            if (onSaveReport) {
                onSaveReport(report);
                setInputs({});
                // 【新增】成功提示
                alert(`✅ Success!\n\nInventory updated.\n${updatedCount} items changed.\nReport saved to history.`);
            }
        } catch (e) {
            console.error(e);
            alert("❌ Save Failed! Please check your connection.");
        }
    };

    // --- 筛选与排序 ---
    const targetList = isManageMode ? manageList : smartInventory;
    const sortedList = (targetList || [])
        .filter((item: any) => supplierFilter === 'All' || item.supplier === supplierFilter)
        .sort((a: any, b: any) => {
            const posA = a.position ? a.position.toUpperCase() : 'ZZZ';
            const posB = b.position ? b.position.toUpperCase() : 'ZZZ';
            return posA.localeCompare(posB, undefined, { numeric: true, sensitivity: 'base' });
        });
    
    // 分区域显示 (Storage / Shop)
    const storageList = sortedList.filter((i:any) => i.area !== 'Shop');
    const shopList = sortedList.filter((i:any) => i.area === 'Shop');

    const renderList = (list: any[]) => (
        <div className="space-y-2">
            {list.map((item: any) => {
                // --- 管理模式 ---
                if (isManageMode) {
                    return (
                        <div key={item.id} className="p-3 bg-dark-surface rounded-xl border border-white/10 flex flex-col gap-3">
                            <div className="flex gap-2">
                                <div className="w-20"><label className="text-[9px] text-gray-500 uppercase">Pos</label><input className="w-full bg-dark-bg border border-white/20 rounded p-1.5 text-center text-white text-xs font-bold outline-none" value={item.position} onChange={e => handleEditItem(item.id, 'position', e.target.value)} /></div>
                                <div className="flex-1"><label className="text-[9px] text-gray-500 uppercase">Name</label><input className="w-full bg-dark-bg border border-white/20 rounded p-1.5 text-white text-xs font-bold outline-none" value={item.name} onChange={e => handleEditItem(item.id, 'name', e.target.value)} /></div>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                <div><label className="text-[9px] text-gray-500 uppercase">Area</label><select className="w-full bg-dark-bg border border-white/20 rounded p-1.5 text-xs text-white" value={item.area || 'Storage'} onChange={e => handleEditItem(item.id, 'area', e.target.value)}><option value="Storage">Storage</option><option value="Shop">Shop</option></select></div>
                                <div><label className="text-[9px] text-gray-500 uppercase">Supplier</label><select className="w-full bg-dark-bg border border-white/20 rounded p-1.5 text-xs text-white" value={item.supplier} onChange={e => handleEditItem(item.id, 'supplier', e.target.value)}><option value="I'tea">I'tea</option><option value="Joybuy">Joybuy</option><option value="Open Mkt">Open Mkt</option><option value="Other">Other</option></select></div>
                                <div><label className="text-[9px] text-gray-500 uppercase">Unit</label><input className="w-full bg-dark-bg border border-white/20 rounded p-1.5 text-xs text-white" value={item.unit} onChange={e => handleEditItem(item.id, 'unit', e.target.value)} /></div>
                                <div><label className="text-[9px] text-gray-500 uppercase text-red-300">Safe</label><input type="number" className="w-full bg-dark-bg border border-red-500/30 rounded p-1.5 text-xs text-red-300 font-bold" value={item.safetyStock} onChange={e => handleEditItem(item.id, 'safetyStock', parseFloat(e.target.value))} /></div>
                            </div>
                            <button onClick={() => handleDeleteItem(item.id)} className="w-full py-1.5 mt-1 bg-red-500/10 text-red-400 rounded text-[10px] font-bold hover:bg-red-500/20">Delete</button>
                        </div>
                    );
                }

                // --- 盘点模式 (修复：显示 Current Stock) ---
                const previewTotal = calculatePreviewTotal(item);
                const isLow = previewTotal < item.safetyStock;
                const hasInput = inputs[item.id] !== undefined;

                return (
                    <div key={item.id} className={`p-3 rounded-xl border flex flex-col gap-2 ${isLow ? 'bg-red-500/5 border-red-500/30' : 'bg-dark-surface border-white/5'}`}>
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded bg-black/30 flex items-center justify-center border border-white/10 shrink-0">
                                    <span className="text-sm font-black text-purple-300">{item.position}</span>
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-white">{item.name}</div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[9px] bg-white/10 px-1.5 rounded text-gray-300 uppercase">{item.category}</span>
                                        {/* 【新增】显示数据库里的当前库存 */}
                                        <span className="text-[9px] text-blue-300 bg-blue-500/10 px-1.5 rounded border border-blue-500/20">
                                            Current: {item.currentStock} {item.unit}
                                        </span>
                                        <span className="text-[9px] text-dark-text-light pl-1">Safe: {item.safetyStock}</span>
                                    </div>
                                </div>
                            </div>
                            <div className={`px-2 py-0.5 rounded text-[9px] font-bold border ${isLow ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-green-500/20 text-green-300 border-green-500/30'}`}>
                                {isLow ? 'LOW' : 'OK'}
                            </div>
                        </div>
                        <div className="grid grid-cols-10 gap-2 items-end bg-black/20 p-2 rounded-lg">
                            <div className="col-span-3">
                                <label className="text-[9px] text-gray-400 block mb-1 uppercase text-center">Count (剩)</label>
                                <input type="number" className="w-full bg-dark-bg border border-white/10 rounded p-1.5 text-center text-white text-sm font-bold focus:border-purple-500 outline-none" placeholder={item.currentStock} value={inputs[item.id]?.count || ''} onChange={e => handleInputChange(item.id, 'count', e.target.value)} />
                            </div>
                            <div className="col-span-1 flex justify-center items-center pb-2 text-gray-500">+</div>
                            <div className="col-span-3">
                                <label className="text-[9px] text-gray-400 block mb-1 uppercase text-center">Add (增)</label>
                                <input type="number" className="w-full bg-dark-bg border border-white/10 rounded p-1.5 text-center text-green-400 text-sm font-bold focus:border-green-500 outline-none" placeholder="0" value={inputs[item.id]?.add || ''} onChange={e => handleInputChange(item.id, 'add', e.target.value)} />
                            </div>
                            <div className="col-span-1 flex justify-center items-center pb-2 text-gray-500">=</div>
                            <div className="col-span-2">
                                <label className="text-[9px] text-gray-400 block mb-1 uppercase text-center">Total</label>
                                {/* 如果有输入，显示预览值；如果没有输入，显示当前数据库值 */}
                                <div className={`w-full bg-white/5 border border-white/10 rounded p-1.5 text-center text-sm font-black ${isLow ? 'text-red-400' : 'text-white'}`}>
                                    {hasInput ? previewTotal : item.currentStock}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-dark-bg text-dark-text animate-fade-in">
            <div className="p-4 bg-dark-surface border-b border-white/10 sticky top-0 z-10 shadow-md">
                <div className="flex justify-between items-center mb-3">
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                        <Icon name="Package" className="text-purple-400" /> 
                        {isManageMode ? "Edit Items" : "Smart Warehouse"}
                    </h2>
                    <div className="flex gap-2">
                        {isManageMode ? (
                            <>
                                <button onClick={() => setIsManageMode(false)} className="bg-white/10 text-white px-3 py-2 rounded-lg text-xs font-bold">Cancel</button>
                                <button onClick={handleSaveManagement} className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg"><Icon name="Save" size={16} /> Save</button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setIsManageMode(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 shadow-lg"><Icon name="Edit" size={14} /> Manage</button>
                                <button onClick={handleSubmitWeekly} className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg transition-all"><Icon name="Save" size={16} /> Submit</button>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {['All', "I'tea", 'Joybuy', 'Open Mkt'].map(s => (
                        <button key={s} onClick={() => setSupplierFilter(s as any)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${supplierFilter === s ? 'bg-purple-600 text-white shadow' : 'bg-white/5 text-dark-text-light hover:bg-white/10'}`}>{s}</button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 pb-20">
                {/* 区域 1: STORAGE */}
                {(storageList.length > 0 || isManageMode) && (
                    <div className="mb-6">
                        <h3 className="sticky top-0 z-0 bg-dark-bg/95 backdrop-blur-sm px-2 py-2 mb-2 border-b border-purple-500/30 text-purple-400 font-black text-sm uppercase tracking-wider flex items-center gap-2">
                            <Icon name="Package" size={16}/> Storage Area
                        </h3>
                        {renderList(storageList)}
                    </div>
                )}

                {/* 区域 2: SHOP */}
                {(shopList.length > 0 || isManageMode) && (
                    <div className="mb-6">
                         <h3 className="sticky top-0 z-0 bg-dark-bg/95 backdrop-blur-sm px-2 py-2 mb-2 border-b border-orange-500/30 text-orange-400 font-black text-sm uppercase tracking-wider flex items-center gap-2">
                            <Icon name="Coffee" size={16}/> Shop Area
                        </h3>
                        {renderList(shopList)}
                    </div>
                )}
                
                {isManageMode && (
                    <div id="manage-list-bottom" className="pt-4 px-2">
                        <button onClick={handleAddItem} className="w-full py-4 border-2 border-dashed border-white/20 rounded-xl text-dark-text-light font-bold hover:border-blue-500 hover:text-blue-400 transition-all flex items-center justify-center gap-2">
                            <Icon name="Plus" size={20} /> Add New Item
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ============================================================================
// 组件 5: 店长总控台 (Owner Dashboard) - 完整支持分店管理 (Branch Mgmt)
// ============================================================================
const OwnerDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { lang, t, inventoryList, setInventoryList, inventoryHistory, users, logs, smartReports, setSmartReports } = data;
    const { showNotification } = useNotification();
    const ownerUser = users.find((u:User) => u.role === 'boss') || { id: 'u_owner', name: 'Owner', role: 'boss' };
    const [view, setView] = useState<'main' | 'manager'>('main');
    
    // 【新增 'stores' 状态】
    const [ownerSubView, setOwnerSubView] = useState<'logs' | 'presets' | 'history' | 'staff' | 'smart' | 'smart_history' | 'stores'>('presets');
    
    const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
    const [reportToDelete, setReportToDelete] = useState<any | null>(null);
    const [expandedSmartId, setExpandedSmartId] = useState<string | null>(null);
    const [smartReportToDelete, setSmartReportToDelete] = useState<any | null>(null);

    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';
    
    useEffect(() => {
        const checkFridayReminder = () => {
            const now = new Date();
            const day = now.getDay(); 
            if (day === 5) {
                const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
                d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
                const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
                const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
                const currentWeekStr = `${now.getFullYear()}-W${weekNum}`;

                const hasSubmitted = (smartReports || []).some((r: any) => r.weekStr === currentWeekStr);
                
                if (!hasSubmitted) {
                    showNotification({ 
                        type: 'announcement', 
                        title: "⚠️ Weekly Task Reminder", 
                        message: "It's Friday! You haven't submitted the Smart Warehouse report for this week yet." 
                    });
                }
            }
        };
        setTimeout(checkFridayReminder, 2000);
    }, [smartReports]);

    const handleSaveSmartReport = async (report: SmartInventoryReport) => {
        try {
            await Cloud.saveSmartInventoryReport(report);
            showNotification({ type: 'success', title: "Submitted", message: "Weekly report uploaded to cloud!" });
            setOwnerSubView('smart_history'); 
        } catch (error) {
            console.error("Upload failed", error);
            alert("Error uploading report. Please check internet connection.");
        }
    };

    const handleDeleteSmartReport = async () => {
        if (!smartReportToDelete) return;
        try {
            const updatedReport = { ...smartReportToDelete, status: 'deleted' };
            await Cloud.saveSmartInventoryReport(updatedReport);
            setSmartReportToDelete(null);
            showNotification({ type: 'success', title: "Deleted", message: "Report marked as deleted." });
        } catch (e) {
            alert("Delete failed.");
        }
    };

    const handleExportSmartCsv = () => {
        if (!smartReports || !Array.isArray(smartReports) || smartReports.length === 0) {
            alert("No reports found to export. (Data list is empty)");
            return;
        }
        try {
            let csvContent = "\uFEFF"; 
            csvContent += "Week,Date Range,Submitted By,Item Name,Category,Supplier,Count (Rem),Add (New),Total Stock,Safety Stock,Status\n";
            let rowCount = 0;
            smartReports.forEach((report: any) => {
                if (!report || report.status === 'deleted') return;
                const items = report.items;
                if (items && Array.isArray(items)) {
                    items.forEach((item: any) => {
                        if (!item) return;
                        const week = report.weekStr || '-';
                        const range = report.dateRange || '-';
                        const by = report.submittedBy || '-';
                        const name = (item.name || 'Unknown').replace(/"/g, '""'); 
                        const cat = item.category || '-';
                        const sup = item.supplier || '-';
                        const count = item.count ?? 0;
                        const add = item.added ?? 0;
                        const total = item.currentStock ?? 0; 
                        const safety = item.safetyStock ?? 0;
                        const status = item.status || '-';
                        csvContent += `"${week}","${range}","${by}","${name}","${cat}","${sup}",${count},${add},${total},${safety},"${status}"\n`;
                        rowCount++;
                    });
                }
            });
            if (rowCount === 0) { alert("Found reports, but they contain no items."); return; }
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            const dateStr = new Date().toISOString().split('T')[0];
            link.href = url;
            link.setAttribute("download", `smart_warehouse_history_${dateStr}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) { console.error("Export Error:", e); alert("Export failed! Error: " + (e as Error).message); }
    };

    const handleExportPrepCsv = () => { 
         if (!inventoryHistory || inventoryHistory.length === 0) {
             alert("No prep history found to export.");
             return;
         }
         try {
             let csvContent = "\uFEFFDate,Type,Staff,Item,Added,Waste/Loss,Reason\n";
             
             inventoryHistory.forEach((r: any) => {
                if (r && r.data) {
                    Object.entries(r.data).forEach(([id, val]: any) => {
                         const itemDef = inventoryList.find((i:any) => i.id === id);
                         const name = itemDef ? (itemDef.name.en || itemDef.name.zh) : id;
                         const cleanName = (name || 'Unknown').replace(/"/g, '""');
                         const isWaste = r.shift === 'waste';
                         const added = !isWaste ? (val.end ?? 0) : 0;
                         const loss = isWaste ? (val.loss ?? 0) : 0;
                         const reason = val.reason || '';
                         
                         csvContent += `"${r.date}","${r.shift}","${r.submittedBy}","${cleanName}",${added},${loss},"${reason}"\n`;
                    });
                }
             });

             const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
             const url = URL.createObjectURL(blob);
             const link = document.createElement("a");
             link.href = url;
             link.download = `prep_history_${new Date().toISOString().split('T')[0]}.csv`;
             document.body.appendChild(link);
             link.click();
             document.body.removeChild(link);
         } catch (e) {
             console.error("Prep Export Error:", e);
             alert("Prep export failed: " + (e as Error).message);
         }
    };

    const handleUpdateLogs = (allLogs: any[]) => Cloud.updateLogs(allLogs);
    
    const handleDeleteReport = async () => { 
        if (!reportToDelete) return;
        const newHistory = inventoryHistory.filter((r:any) => r.id !== reportToDelete.id);
        await Cloud.updateInventoryHistory(newHistory);
        setReportToDelete(null);
        showNotification({ type: 'message', title: 'Deleted', message: 'Report removed.'});
    };

    if (view === 'manager') return <ManagerDashboard data={data} onExit={() => setView('main')} />;
    
    const SmartHistoryView = () => (
        <div className="p-4 space-y-3">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-dark-text">Warehouse Weekly Reports</h3>
                <button onClick={handleExportSmartCsv} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-purple-700 transition-all">
                    <Icon name="List" size={16} /> Export CSV
                </button>
            </div>
            {(!smartReports || smartReports.length === 0) && <p className="text-dark-text-light text-center py-10">No weekly reports found in cloud.</p>}
            
            {smartReports && [...smartReports].reverse().map((report: any) => {
                if (report.status === 'deleted') return null;
                return (
                    <div key={report.id} className="bg-dark-surface p-3 rounded-xl border border-white/10 group">
                        <div className="flex justify-between items-center">
                            <div onClick={() => setExpandedSmartId(expandedSmartId === report.id ? null : report.id)} className="flex-1 cursor-pointer">
                                <p className="text-sm font-bold text-white flex items-center gap-2">
                                    {report.weekStr} 
                                    <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-dark-text-light font-normal">
                                        {(report.items || []).length} items
                                    </span>
                                </p>
                                <p className="text-xs text-dark-text-light mt-0.5">
                                    {report.dateRange} • by {report.submittedBy}
                                </p>
                            </div>
                            
                            <div className="flex items-center gap-3">
                                <button onClick={() => setSmartReportToDelete(report)} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 opacity-80 hover:opacity-100 transition-all" title="Delete Report">
                                    <Icon name="Trash" size={16} />
                                </button>
                                <div onClick={() => setExpandedSmartId(expandedSmartId === report.id ? null : report.id)} className="cursor-pointer p-1">
                                    <Icon name={expandedSmartId === report.id ? "ChevronUp" : "ChevronRight"} className="text-dark-text-light" />
                                </div>
                            </div>
                        </div>
                        
                        {expandedSmartId === report.id && (
                            <div className="mt-3 pt-3 border-t border-white/10 text-xs space-y-2 max-h-60 overflow-y-auto animate-fade-in">
                                <div className="grid grid-cols-4 font-bold text-dark-text-light mb-1">
                                    <span className="col-span-2">Item</span>
                                    <span className="text-center">Stock</span>
                                    <span className="text-center">Status</span>
                                </div>
                                {(report.items || []).map((item: any, idx: number) => (
                                    <div key={idx} className="grid grid-cols-4 items-center py-1 border-b border-white/5 last:border-0 hover:bg-white/5">
                                        <span className="col-span-2 text-white truncate">{item.name}</span>
                                        <span className={`text-center font-mono ${item.currentStock === 0 ? 'text-gray-500' : 'text-purple-300 font-bold'}`}>
                                            {item.currentStock}
                                        </span>
                                        <span className={`text-center font-bold ${item.status==='LOW'?'text-red-400':'text-green-400'}`}>{item.status}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    const InventoryHistoryView = () => (
        <div className="p-4 space-y-3">
             <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-dark-text">Prep History</h3>
                <button onClick={handleExportPrepCsv} className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-green-700 transition-all">
                    <Icon name="List" size={16} /> Export CSV
                </button>
            </div>
            {inventoryHistory.length === 0 && <p className="text-dark-text-light text-center py-10">No history found.</p>}
            {inventoryHistory.slice().reverse().map((report: any) => {
                const isWaste = report.shift === 'waste';
                return (
                    <div key={report.id} className="bg-dark-surface p-3 rounded-xl border border-white/10 group-report">
                        <div onClick={() => setExpandedReportId(expandedReportId === report.id ? null : report.id)} className="flex justify-between items-center cursor-pointer">
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold">{report.date ? new Date(report.date).toLocaleString() : 'No Date'}</p>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${isWaste ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-purple-300'}`}>
                                        {isWaste ? 'WASTE/LOSS' : report.shift}
                                    </span>
                                    {report.fridgeChecked && (
                                        <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30 flex items-center gap-0.5" title="Fridge Temp < 6°C Confirmed">
                                            <Icon name="Snowflake" size={10} /> OK
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-dark-text-light mt-1">by {report.submittedBy}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <button onClick={(e) => { e.stopPropagation(); setReportToDelete(report); }} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20"><Icon name="Trash" size={16} /></button>
                                <Icon name={expandedReportId === report.id ? "ChevronUp" : "ChevronRight"} className="text-dark-text-light" />
                            </div>
                        </div>
                        {expandedReportId === report.id && (
                            <div className="mt-3 pt-3 border-t border-white/10 text-xs space-y-2 animate-fade-in">
                                {Object.entries(report.data || {}).map(([itemId, val]: any) => {
                                    const itemDef = inventoryList.find((i: any) => i.id === itemId);
                                    return (
                                        <div key={itemId} className="flex justify-between items-center group hover:bg-white/5 p-1.5 rounded transition-colors border-b border-white/5 last:border-0">
                                            <span className="text-dark-text-light font-medium">
                                                {itemDef ? getLoc(itemDef.name) : itemId}
                                            </span>
                                            <div className="flex items-center gap-3">
                                                {isWaste ? (
                                                    <div className="text-right">
                                                        <span className="font-mono text-red-400 font-bold">-{val.loss}</span>
                                                        {val.reason && <p className="text-[10px] text-gray-500 mt-0.5">({val.reason})</p>}
                                                    </div>
                                                ) : (
                                                    <span className="font-mono text-green-400 font-bold">+{val.end}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="min-h-screen max-h-[100dvh] overflow-hidden flex flex-col bg-dark-bg text-dark-text font-sans pt-[calc(env(safe-area-inset-top)_+_2rem)] md:pt-0">
            <div className="bg-dark-surface p-4 shadow-lg flex justify-between items-center shrink-0 border-b border-white/10">
                <div><h1 className="text-xl font-black tracking-tight text-white">{t.owner_dashboard || 'Owner Dashboard'}</h1><p className="text-xs text-dark-text-light">User: {ownerUser.name}</p></div>
                <div className="flex gap-2">
                    <button onClick={() => setView('manager')} className="bg-white/10 p-2 rounded hover:bg-white/20 transition-all text-xs font-bold px-3">Manager</button>
                    <button onClick={onExit} className="bg-white/10 p-2 rounded hover:bg-white/20 transition-all"><Icon name="LogOut" /></button>
                </div>
            </div>
            
            <div className="flex bg-dark-bg p-2 gap-2 overflow-x-auto shrink-0 shadow-inner">
                {/* --- 增加分店管理 (Branch Mgmt) 密码锁按钮 --- */}
                <button onClick={() => {
                    if (ownerSubView === 'stores') return; 
                    const pin = window.prompt("Enter Admin PIN (0117) for Branch Management:");
                    if(pin === '0117') { setOwnerSubView('stores'); } else if (pin !== null) { alert("Access Denied"); }
                }} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'stores' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                    Branch Mgmt
                </button>

                <div className="w-px bg-white/10 mx-1"></div>

                <button onClick={() => setOwnerSubView('presets')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'presets' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Manage Prep</button>
                <button onClick={() => setOwnerSubView('history')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'history' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Prep History</button>
                
                <div className="w-px bg-white/10 mx-1"></div>

                <button onClick={() => setOwnerSubView('smart')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'smart' ? 'bg-purple-600 text-white shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Smart Warehouse</button>
                <button onClick={() => setOwnerSubView('smart_history')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'smart_history' ? 'bg-purple-900/50 text-purple-200 border border-purple-500/30' : 'text-dark-text-light hover:bg-white/10'}`}>Smart History</button>
                
                <div className="w-px bg-white/10 mx-1"></div>

                <button onClick={() => setOwnerSubView('staff')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'staff' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Staff</button>
                <button onClick={() => setOwnerSubView('logs')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'logs' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Logs</button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* --- 新增：渲染分店管理视图 --- */}
                {ownerSubView === 'stores' && <StoreManagementView data={data} />}

                {ownerSubView === 'presets' && <InventoryView lang={lang} t={t} inventoryList={inventoryList} setInventoryList={setInventoryList} isOwner={true} onSubmit={() => {}} currentUser={ownerUser} />}
                {ownerSubView === 'history' && <InventoryHistoryView />}
                {ownerSubView === 'smart' && <SmartInventoryView data={data} onSaveReport={handleSaveSmartReport} />}
                {ownerSubView === 'smart_history' && <SmartHistoryView />}
                {ownerSubView === 'staff' && <StaffManagementView users={users} />}
                {ownerSubView === 'logs' && <OwnerInventoryLogsView logs={logs} currentUser={ownerUser} onUpdateLogs={handleUpdateLogs} />}
            </div>
            
            {reportToDelete && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-dark-surface p-6 rounded-2xl border border-white/10 max-w-sm w-full shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-2">Delete Report?</h3>
                        <p className="text-sm text-dark-text-light mb-6">Confirm deletion?</p>
                        <div className="flex gap-3">
                            <button onClick={() => setReportToDelete(null)} className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold">Cancel</button>
                            <button onClick={handleDeleteReport} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {smartReportToDelete && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className="bg-dark-surface p-6 rounded-2xl border border-white/10 max-w-sm w-full shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-2 text-red-400">Delete Warehouse Report?</h3>
                        <p className="text-sm text-dark-text-light mb-6">This will mark the report as deleted.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setSmartReportToDelete(null)} className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold">Cancel</button>
                            <button onClick={handleDeleteSmartReport} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold">Confirm Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
// ============================================================================

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

// ============================================================================
// 组件 5: 经理后台 (Manager Dashboard) - [修复变量丢失 Bug]
// ============================================================================
const ManagerDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { showNotification } = useNotification();
    const managerUser = data.users.find((u:User) => u.id === 'u_lambert') || { id: 'u_manager', name: 'Manager', role: 'manager', phone: '0000' };
    const { schedule, setSchedule, notices, logs, setLogs, t, directMessages, setDirectMessages, swapRequests, setSwapRequests, users, scheduleCycles, setScheduleCycles } = data;
    
    // --- 状态定义 ---
    const [view, setView] = useState<'schedule' | 'logs' | 'chat' | 'financial' | 'requests' | 'planning' | 'availability' | 'confirmations'>('requests');
    const [editingShift, setEditingShift] = useState<{ dayIdx: number, shift: 'morning' | 'evening' | 'night' | 'all' } | null>(null);
    const [budgetMax, setBudgetMax] = useState<number>(() => Number(localStorage.getItem('onesip_budget_max')) || 5000);
    const [exportMonth, setExportMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [financialMonth, setFinancialMonth] = useState(new Date().toISOString().slice(0, 7)); 

    // Logs 状态
    const [isAddingManualLog, setIsAddingManualLog] = useState(false);
    const [logToInvalidate, setLogToInvalidate] = useState<LogEntry | null>(null);
    const [logPairToAdjust, setLogPairToAdjust] = useState<{ inLog: LogEntry, outLog: LogEntry } | null>(null);
    const [currentWeekIndex, setCurrentWeekIndex] = useState(0);

    // 【修复点】：显式定义 today，防止 ReferenceError
    const today = new Date(); 

    // --- 1. 工资状态初始化 ---
    const [wages, setWages] = useState<Record<string, { type: 'hourly'|'fixed', value: number }>>(() => {
        const saved = localStorage.getItem('onesip_wages_v3');
        if (saved) return JSON.parse(saved);
        
        const PRESETS: Record<string, { type: 'hourly'|'fixed', value: number }> = {
            "X. Li no.6": { type: 'hourly', value: 13.01 },
            "Xinrui no.8": { type: 'hourly', value: 9.42 },
            "Linda No.10": { type: 'hourly', value: 17.35 },
            "Najat no.11": { type: 'hourly', value: 13.30 },
            "Fatima 015": { type: 'hourly', value: 23.48 },
            "Jie": { type: 'hourly', value: 23.48 },
            "Haohui": { type: 'hourly', value: 0 },
            "Lambert": { type: 'fixed', value: 795.03 }, 
            "Yang": { type: 'fixed', value: 1165.58 }, 
            "RURU": { type: 'fixed', value: 1165.58 },
        };

        const def: any = {};
        users.forEach((m: User) => {
            let setting = { type: 'hourly', value: 12 };
            if (PRESETS[m.name]) {
                setting = PRESETS[m.name];
            } else {
                const foundKey = Object.keys(PRESETS).find(k => m.name.includes(k) || k.includes(m.name));
                if (foundKey) setting = PRESETS[foundKey];
            }
            def[m.name] = { type: setting.type as 'hourly'|'fixed', value: setting.value };
        });
        return def;
    });

    const saveWages = (newWages: any) => {
        setWages(newWages);
        localStorage.setItem('onesip_wages_v3', JSON.stringify(newWages));
    };

    // --- 2. 名字清洗 ---
    const normalizeName = (name: string) => {
        if (!name) return "Unknown";
        const clean = name.trim();
        const mapping: Record<string, string> = {
            "Maidou": "X. Li no.6", "X. Li": "X. Li no.6", "X.Li": "X. Li no.6",
            "Xinrui": "Xinrui no.8", "Linda": "Linda No.10",
            "Najat": "Najat no.11", "Najata": "Najat no.11",
            "Fatima": "Fatima 015",
        };
        
        if (mapping[clean]) return mapping[clean];
        if (clean.includes("Maidou") || clean.includes("X. Li")) return "X. Li no.6";
        if (clean.includes("Xinrui")) return "Xinrui no.8";
        if (clean.includes("Linda")) return "Linda No.10";
        if (clean.includes("Najat")) return "Najat no.11";
        if (clean.includes("Fatima")) return "Fatima 015";
        return clean; 
    };

    const validStaffNames = new Set(users.map((u: User) => u.name));

    // --- 3. 自动排班修正 ---
    useEffect(() => {
        const initSchedule = async () => { await Cloud.ensureScheduleCoverage(); };
        initSchedule();

        if (schedule?.days?.length > 0) {
            let needsUpdate = false;
            const newDays = schedule.days.map((day: ScheduleDay) => {
                let dayUpdated = false;
                const newShifts = (day.shifts || []).map((shift: any) => {
                    const newStaff = shift.staff.map((name: string) => {
                        const fixed = normalizeName(name);
                        if (fixed !== name) { dayUpdated = true; needsUpdate = true; }
                        return fixed;
                    });
                    return { ...shift, staff: newStaff };
                });
                const cleanLegacy = (list: string[] = []) => list.map(n => {
                    const fixed = normalizeName(n);
                    if (fixed !== n) { dayUpdated = true; needsUpdate = true; }
                    return fixed;
                });
                if (dayUpdated) {
                    return { ...day, shifts: newShifts, morning: cleanLegacy(day.morning), evening: cleanLegacy(day.evening), night: cleanLegacy(day.night) };
                }
                return day;
            });
            if (needsUpdate) {
                console.log("Normalizing names...");
                const newSchedule = { ...schedule, days: newDays };
                setSchedule(newSchedule);
                Cloud.saveSchedule(newSchedule);
            }
        }
    }, [schedule, setSchedule]);

    // --- 4. 辅助函数 ---
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);

    const displayedDays = (schedule?.days || []).filter((day: ScheduleDay) => {
        const [m, d] = day.date.split('-').map(Number);
        const dayDate = new Date(now.getFullYear(), m - 1, d);
        if (now.getMonth() === 11 && m === 1) dayDate.setFullYear(now.getFullYear() + 1);
        if (now.getMonth() === 0 && m === 12) dayDate.setFullYear(now.getFullYear() - 1);
        return dayDate >= startOfCurrentMonth && dayDate <= endOfNextMonth;
    }).sort((a: ScheduleDay, b: ScheduleDay) => {
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

    // --- 5. 日志功能 ---
    const handleUpdateLogs = async (updatedLogs: LogEntry[]) => {
        try { await Cloud.updateLogs(updatedLogs); } catch (e) { console.error(e); alert("Error saving logs."); }
    };
    const handleInvalidateConfirm = (logToUpdate: LogEntry) => {
        const updatedLogs = logs.map((l: LogEntry) => l.id === logToUpdate.id ? logToUpdate : l);
        handleUpdateLogs(updatedLogs);
        setLogToInvalidate(null);
    };
    const handleOpenAdjustModal = (logToAdjust: LogEntry) => {
        if (logToAdjust.type !== 'clock-in' && logToAdjust.type !== 'clock-out') return;
        const userLogs = logs.filter((l: LogEntry) => l.userId === logToAdjust.userId && !l.isDeleted).sort((a: LogEntry, b: LogEntry) => new Date(a.time).getTime() - new Date(b.time).getTime());
        const index = userLogs.findIndex((l: LogEntry) => l.id === logToAdjust.id);
        if (index === -1) return;
        if (logToAdjust.type === 'clock-in') {
            const outLog = userLogs.find((l: LogEntry, i: number) => i > index && l.type === 'clock-out');
            if (outLog) setLogPairToAdjust({ inLog: logToAdjust, outLog });
            else alert('No matching clock-out found.');
        } else { 
            const inLog = userLogs.slice(0, index).reverse().find((l: LogEntry) => l.type === 'clock-in');
            if (inLog) setLogPairToAdjust({ inLog, outLog: logToAdjust });
            else alert('No matching clock-in found.');
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
        Cloud.saveLog(inLog); Cloud.saveLog(outLog);
        setIsAddingManualLog(false); alert('Manual record added.');
    };
    const handleBudgetChange = (val: string) => { const b = parseFloat(val) || 0; setBudgetMax(b); localStorage.setItem('onesip_budget_max', b.toString()); };

    // --- 6. 财务计算逻辑 (双模块分离) ---
    const getShiftCost = (staff: string[], start: string, end: string) => {
        if (!staff || staff.length === 0 || !start || !end) return 0;
        const s = parseInt(start.split(':')[0]) + (parseInt(start.split(':')[1]||'0')/60);
        const e = parseInt(end.split(':')[0]) + (parseInt(end.split(':')[1]||'0')/60);
        const duration = Math.max(0, e - s);
        return staff.reduce((acc, rawName) => {
            const name = normalizeName(rawName);
            if (!validStaffNames.has(name)) return acc;
            return acc + (duration * (wages[name]?.value || 12));
        }, 0);
    };

    const calculateFinancials = (selectedMonth: string) => {
        const stats: Record<string, any> = {};
        const getStats = (rawName: string) => {
            const name = normalizeName(rawName);
            if (!stats[name]) stats[name] = { estHours: 0, estCost: 0, actualHours: 0, actualCost: 0, wageType: 'hourly' };
            return stats[name];
        };

        activeStaff.forEach((m: User) => {
            const s = getStats(m.name);
            s.wageType = wages[m.name]?.type || 'hourly';
        });
        
        // 1. 预计成本
        const filteredDays = (schedule?.days || []).filter((day: ScheduleDay) => {
            const [m, d] = day.date.split('-').map(Number);
            const nowY = new Date().getFullYear();
            let y = nowY;
            if (parseInt(selectedMonth.split('-')[1]) === 1 && m === 12) y--; 
            else if (parseInt(selectedMonth.split('-')[1]) === 12 && m === 1) y++;
            const dayY = (new Date().getMonth()===11 && m===1) ? nowY+1 : nowY;
            return `${dayY}-${String(m).padStart(2,'0')}` === selectedMonth;
        });

        filteredDays.forEach((day: ScheduleDay) => { 
            const shifts = day.shifts || [];
            if (shifts.length > 0) {
                shifts.forEach((s: any) => {
                    let hours = 5; 
                    if (s.start && s.end) {
                        const startH = parseInt(s.start.split(':')[0]) + (parseInt(s.start.split(':')[1]||'0')/60);
                        const endH = parseInt(s.end.split(':')[0]) + (parseInt(s.end.split(':')[1]||'0')/60);
                        hours = Math.max(0, endH - startH);
                    }
                    if (Array.isArray(s.staff)) {
                        s.staff.forEach((rawName: string) => {
                            const name = normalizeName(rawName);
                            if (validStaffNames.has(name)) getStats(name).estHours += hours;
                        });
                    }
                });
            } else {
                [...(day.morning||[]), ...(day.evening||[]), ...(day.night||[])].forEach(rawName => {
                    const name = normalizeName(rawName);
                    if (validStaffNames.has(name)) getStats(name).estHours += 5;
                });
            }
        }); 
        
        // 2. 实际成本
        const logsByUser: Record<string, LogEntry[]> = {};
        logs.forEach((l: LogEntry) => { 
            if (l.isDeleted || !safeParseDate(l.time)) return;
            const d = new Date(l.time);
            const logMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            if (logMonth !== selectedMonth) return;
            let rawName = l.name || 'Unknown';
            if (l.userId) { const u = users.find(user => user.id === l.userId); if (u) rawName = u.name; }
            const finalName = normalizeName(rawName);
            if (!validStaffNames.has(finalName)) return;
            if (!logsByUser[finalName]) logsByUser[finalName] = []; 
            logsByUser[finalName].push(l); 
        }); 
        
        Object.entries(logsByUser).forEach(([userName, userLogs]) => { 
            const s = getStats(userName);
            const sorted = userLogs.sort((a, b) => (safeParseDate(a.time)?.getTime() || 0) - (safeParseDate(b.time)?.getTime() || 0)); 
            const processedInIds = new Set<number>();

            sorted.forEach((outLog) => {
                if (outLog.type === 'clock-out') {
                    const outTime = safeParseDate(outLog.time)?.getTime() || 0;
                    const matchingIn = sorted.filter(l => l.type === 'clock-in' && !processedInIds.has(l.id) && (safeParseDate(l.time)?.getTime()||0) < outTime)
                        .sort((a, b) => (safeParseDate(b.time)?.getTime()||0) - (safeParseDate(a.time)?.getTime()||0))[0]; 
                    if (matchingIn) {
                        const duration = (outTime - (safeParseDate(matchingIn.time)?.getTime()||0)) / (1000 * 60 * 60);
                        if (duration > 0) { s.actualHours += duration; processedInIds.add(matchingIn.id); }
                    }
                }
            });
        });

        // 3. 汇总 - 【区分 Fixed 和 Hourly】
        let totalEstCost = 0; let totalActualCost = 0;
        let totalHourlyEst = 0; let totalHourlyAct = 0; // 新增：仅时薪汇总
        let totalFixed = 0; // 新增：仅固定月薪汇总

        Object.keys(stats).forEach(name => { 
            if (!validStaffNames.has(name)) return;
            const s = stats[name];
            const setting = wages[name] || { type: 'hourly', value: 12 };
            
            if (setting.type === 'fixed') {
                s.estCost = setting.value; 
                s.actualCost = setting.value; 
                totalFixed += setting.value; // 计入固定池
            } else {
                s.estCost = s.estHours * setting.value; 
                s.actualCost = s.actualHours * setting.value;
                totalHourlyEst += s.estCost; // 计入时薪池
                totalHourlyAct += s.actualCost; // 计入时薪池
            }
            totalEstCost += s.estCost; totalActualCost += s.actualCost; 
        });

        return { stats, totalEstCost, totalActualCost, totalHourlyEst, totalHourlyAct, totalFixed, filteredDays };
    };

    // 结构出所有需要的变量
    const { stats, totalEstCost, totalActualCost, totalHourlyEst, totalHourlyAct, totalFixed, filteredDays: monthlyDays } = calculateFinancials(financialMonth);

    // Daily Breakdown
    const getDailyFinancials = () => {
        return monthlyDays.map((day: ScheduleDay) => {
            const staffMap: Record<string, { est: number, act: number, setting: { type: string, value: number } }> = {};
            const addEst = (rawName: string, hours: number) => {
                const name = normalizeName(rawName);
                if (!validStaffNames.has(name)) return;
                const setting = wages[name] || { type: 'hourly', value: 12 };
                if (!staffMap[name]) staffMap[name] = { est: 0, act: 0, setting };
                if (setting.type === 'hourly') staffMap[name].est += hours * setting.value;
            }

            const scheduleShifts = day.shifts || [];
            if (scheduleShifts.length > 0) {
                scheduleShifts.forEach((shift: any) => {
                    let hours = 5;
                    if (shift.start && shift.end) {
                        const s = parseInt(shift.start.split(':')[0]) + (parseInt(shift.start.split(':')[1]||'0')/60);
                        const e = parseInt(shift.end.split(':')[0]) + (parseInt(shift.end.split(':')[1]||'0')/60);
                        hours = Math.max(0, e - s);
                    }
                    if (Array.isArray(shift.staff)) shift.staff.forEach((p: string) => addEst(p, hours));
                });
            } else {
                 [...(day.morning||[]), ...(day.evening||[]), ...(day.night||[])].forEach(p => addEst(p, 5));
            }

            const scheduleDateObj = new Date(parseInt(financialMonth.split('-')[0]), parseInt(financialMonth.split('-')[1])-1, parseInt(day.date.split('-')[1]));
            const dayLogs = logs.filter(l => !l.isDeleted && safeParseDate(l.time)?.toDateString() === scheduleDateObj.toDateString());
            
            dayLogs.forEach(l => {
                if (l.type !== 'clock-out') return;
                const name = normalizeName(l.name || 'Unknown');
                if (!validStaffNames.has(name)) return;
                const setting = wages[name] || { type: 'hourly', value: 12 };
                if (setting.type === 'fixed') return;
                const outTime = safeParseDate(l.time)?.getTime() || 0;
                const matchingIn = dayLogs.find(i => i.type === 'clock-in' && normalizeName(i.name||'') === name && (safeParseDate(i.time)?.getTime()||0) < outTime);
                if (matchingIn) {
                    const hrs = (outTime - (safeParseDate(matchingIn.time)?.getTime()||0)) / 3600000;
                    if (!staffMap[name]) staffMap[name] = { est: 0, act: 0, setting };
                    staffMap[name].act += hrs * setting.value;
                }
            });

            let estTotal = 0; let actTotal = 0;
            const details = Object.entries(staffMap).map(([name, data]) => {
                estTotal += data.est; actTotal += data.act;
                return { name, est: data.est, act: data.act, diff: data.act - data.est }; 
            }).sort((a, b) => b.act - a.act); 

            return { date: day.date, name: day.name, est: estTotal, act: actTotal, diff: estTotal - actTotal, details };
        });
    };

    const handleExportFinancialCSV = () => {
        let csv = "FINANCIAL SUMMARY REPORT\n";
        csv += `Report Month,${financialMonth}\n`;
        csv += `Budget Max,${budgetMax}\n`;
        csv += `Total Estimated Cost (Schedule),${totalEstCost.toFixed(2)}\n`;
        csv += `Total Actual Cost (Logs),${totalActualCost.toFixed(2)}\n`;
        csv += `Balance (Budget - Actual),${(budgetMax - totalActualCost).toFixed(2)}\n\n`;
        csv += "Name,Wage Type,Value,Est. Hours,Est. Cost,Act. Hours,Act. Cost,Difference\n";
        Object.keys(stats).forEach(name => {
            if (!validStaffNames.has(name)) return;
            const s = stats[name];
            const w = wages[name];
            if (s.estHours > 0 || s.actualHours > 0 || s.wageType === 'fixed') csv += `"${name}",${s.wageType},${w?.value||0},${s.estHours.toFixed(1)},${s.estCost.toFixed(2)},${s.actualHours.toFixed(1)},${s.actualCost.toFixed(2)},${(s.actualCost - s.estCost).toFixed(2)}\n`;
        });
        const link = document.createElement("a"); link.href = encodeURI("data:text/csv;charset=utf-8," + csv); link.download = `financial_summary_${financialMonth}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const handleExportLogsCSV = () => {
        let csv = "Date,Staff Name,User ID,Hourly Wage,Clock In,Clock Out,Duration (Hrs),Cost,Status\n";
        const logsByUser: Record<string, LogEntry[]> = {};
        logs.forEach(l => {
            if (l.isDeleted) return; 
            const finalName = normalizeName(l.name || 'Unknown');
            if (!validStaffNames.has(finalName)) return;
            if (!logsByUser[finalName]) logsByUser[finalName] = [];
            logsByUser[finalName].push(l);
        });
        Object.entries(logsByUser).forEach(([userName, userLogs]) => {
            const wage = wages[userName]?.value || 12;
            userLogs.sort((a,b) => (safeParseDate(a.time)?.getTime()||0) - (safeParseDate(b.time)?.getTime()||0));
            const processedIds = new Set<number>();
            userLogs.forEach((log, idx) => {
                if (processedIds.has(log.id)) return;
                const logTime = safeParseDate(log.time);
                if (!logTime) return;
                const y = logTime.getFullYear(); const m = String(logTime.getMonth() + 1).padStart(2, '0');
                if (`${y}-${m}` !== financialMonth) return; 
                const dateStr = `${y}-${m}-${String(logTime.getDate()).padStart(2, '0')}`;
                const timeStr = logTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                if (log.type === 'clock-in') {
                    const matchingOut = userLogs.slice(idx + 1).find(l => l.type === 'clock-out' && !processedIds.has(l.id) && safeParseDate(l.time)?.toDateString() === logTime.toDateString());
                    if (matchingOut) {
                        const outTime = safeParseDate(matchingOut.time);
                        const outStr = outTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) || '-';
                        const duration = ((outTime?.getTime() || 0) - logTime.getTime()) / 3600000;
                        const cost = duration * wage;
                        csv += `${dateStr},"${userName}",${log.userId||'-'},${wage},${timeStr},${outStr},${duration.toFixed(2)},${cost.toFixed(2)},Normal\n`;
                        processedIds.add(log.id); processedIds.add(matchingOut.id);
                    } else {
                        csv += `${dateStr},"${userName}",${log.userId||'-'},${wage},${timeStr},-,0.00,0.00,Missing Out\n`;
                        processedIds.add(log.id);
                    }
                }
            });
        });
        const link = document.createElement("a"); link.href = encodeURI("data:text/csv;charset=utf-8," + csv); link.download = `attendance_${financialMonth}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const allReqs = swapRequests?.slice().sort((a: SwapRequest, b: SwapRequest) => b.timestamp - a.timestamp) || [];
    const visibleLogs = logs?.filter((log: LogEntry) => !log.isDeleted).slice().reverse() || [];
    
    const handlePublishSchedule = async () => {
        if (!window.confirm(`Publish schedule? Staff will be notified.`)) return;
        const startDate = displayedDays[0].date; const endDate = displayedDays[displayedDays.length - 1].date;
        const year = new Date().getFullYear();
        const startISO = `${year}-${startDate.split('-').map(p=>p.padStart(2,'0')).join('-')}`;
        const endISO = `${year}-${endDate.split('-').map(p=>p.padStart(2,'0')).join('-')}`;
        const cycleId = `${startISO}_${endISO}`;
        const confirmations: any = {};
        activeStaff.forEach((u: User) => { confirmations[u.id] = { status: 'pending', viewed: false }; });
        const newCycle = { cycleId, startDate: startISO, endDate: endISO, publishedAt: new Date().toISOString(), status: 'published', confirmations, snapshot: {} };
        const updatedCycles = scheduleCycles.filter((c: ScheduleCycle) => c.cycleId !== cycleId);
        updatedCycles.push(newCycle);
        await Cloud.updateScheduleCycles(updatedCycles);
        if (setScheduleCycles) setScheduleCycles(updatedCycles); 
        await Cloud.updateNotices([{ id: Date.now().toString(), type: 'announcement', title: "📅 New Schedule", content: `Schedule ${startDate} to ${endDate} is live. Please confirm.`, timestamp: Date.now(), sender: 'Manager', frequency: 'once' }]);
        showNotification({ type: 'message', title: 'Published!', message: `Staff notified.`});
    };

    const handleApplySwap = async (reqId: string) => {
        const req = swapRequests.find((r: SwapRequest) => r.id === reqId);
        if (!req) return;
        const newSchedule = JSON.parse(JSON.stringify(schedule));
        const dayIndex = newSchedule.days.findIndex((d: ScheduleDay) => normalizeDateKey(d.date) === normalizeDateKey(req.requesterDate));
        if (dayIndex === -1) return;
        const day = newSchedule.days[dayIndex];
        const targetShift = (day.shifts || []).find((s: any) => s.start.startsWith(req.requesterShift.split('-')[0].trim())); 
        if (targetShift) {
             targetShift.staff = targetShift.staff.map((n:string) => n === req.requesterName ? req.targetName : n);
        } else if (day[req.requesterShift]) { 
             day[req.requesterShift] = day[req.requesterShift].map((n:string) => n === req.requesterName ? req.targetName : n);
        }
        try {
            await Cloud.saveSchedule(newSchedule);
            const updatedReqs = swapRequests.map((r: SwapRequest) => r.id === reqId ? { ...r, status: 'completed', appliedToSchedule: true } : r);
            await Cloud.updateSwapRequests(updatedReqs);
            showNotification({type: 'message', title: "Success", message: "Swap applied."});
        } catch(e) { console.error(e); }
    };

    const handleSaveSchedule = (updatedShifts: any[]) => { 
        if (!editingShift) return; 
        const { dayIdx } = editingShift; 
        const targetDay = displayedDays[dayIdx];
        const realIndex = schedule.days.findIndex((d: ScheduleDay) => d.date === targetDay.date);
        if (realIndex === -1) return;
        const newSched = JSON.parse(JSON.stringify(schedule));
        newSched.days[realIndex].shifts = updatedShifts;
        newSched.days[realIndex].morning = []; newSched.days[realIndex].evening = []; newSched.days[realIndex].night = [];
        setSchedule(newSched); Cloud.saveSchedule(newSched); setEditingShift(null); 
    };

    const currentCycle = scheduleCycles?.find((c: ScheduleCycle) => {
        const start = new Date(c.startDate); const end = new Date(c.endDate);
        return today >= start && today <= end;
    });

    const totalWeeklyPlanningCost = displayedDays?.slice(0, 7).reduce((acc: number, day: ScheduleDay) => {
        const getCost = (shift: any) => {
            const start = shift.start || '10:00'; const end = shift.end || '15:00';
            return getShiftCost(shift.staff || [], start, end);
        };
        const shifts = day.shifts || [];
        if (shifts.length > 0) return acc + shifts.reduce((sum:number, s:any) => sum + getCost(s), 0);
        return acc + getShiftCost(day.morning, '10:00', '15:00') + getShiftCost(day.evening, '14:30', '19:00') + (day.night ? getShiftCost(day.night, '18:00', '22:00') : 0);
    }, 0) || 0;

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
                        <div className="bg-dark-surface p-3 rounded-xl shadow-sm border border-white/10"><h3 className="font-bold text-dark-text">Swap Requests Log</h3></div>
                        {allReqs.length === 0 && <p className="text-dark-text-light text-center py-10 bg-dark-surface rounded-xl border border-white/10">No swap requests found.</p>}
                        {allReqs.map((req: SwapRequest) => (
                            <div key={req.id} className="bg-dark-surface p-4 rounded-xl shadow-sm border border-white/10">
                                <div className="flex justify-between items-start mb-3"><div><p className="text-sm text-dark-text-light"><strong className="text-white">{req.requesterName}</strong> ↔ <strong className="text-white">{req.targetName}</strong></p><p className="text-xs text-gray-400 mt-1">{formattedDate(req.timestamp)}</p></div><span className={`text-xs px-2 py-1 rounded font-bold capitalize bg-gray-500/10 text-gray-400`}>{req.status.replace(/_/g, ' ')}</span></div>
                                <div className="bg-dark-bg p-3 rounded-lg text-sm text-dark-text-light mb-4 space-y-2"><div className="flex justify-between"><span>Shift:</span> <strong className="font-mono text-white">{req.requesterDate} ({req.requesterShift})</strong></div></div>
                                {req.status === 'accepted_by_peer' && !req.appliedToSchedule && (<div className="grid grid-cols-2 gap-2"><button className="w-full bg-red-600/50 text-white/80 py-2.5 rounded-lg font-bold text-xs" disabled>Reject</button><button onClick={() => handleApplySwap(req.id)} className="w-full bg-dark-accent text-dark-bg py-2.5 rounded-lg font-bold shadow-md active:scale-95 transition-all hover:opacity-90 text-xs">Approve & Apply</button></div>)}
                            </div>
                        ))}
                    </div>
                )}
                {view === 'schedule' && (
                    <div className="space-y-3 pb-10">
                        <div className="bg-dark-surface p-4 rounded-xl border border-white/10 shadow-sm mb-4 sticky top-0 z-20">
                            <div className="flex justify-between items-center"><h3 className="font-bold text-dark-text mb-2">Week {currentWeekIndex + 1} of {totalWeeks}</h3><div className="flex gap-2"><button onClick={() => setCurrentWeekIndex(Math.max(0, currentWeekIndex - 1))} disabled={currentWeekIndex === 0} className="p-2 bg-white/10 rounded-lg disabled:opacity-50"><Icon name="ChevronLeft" size={16}/></button><button onClick={() => setCurrentWeekIndex(Math.min(totalWeeks - 1, currentWeekIndex + 1))} disabled={currentWeekIndex >= totalWeeks - 1} className="p-2 bg-white/10 rounded-lg disabled:opacity-50"><Icon name="ChevronRight" size={16}/></button></div></div>
                            <button onClick={handlePublishSchedule} className="w-full mt-3 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-lg">Publish Current View ({displayedDays.length} days)</button>
                        </div>
                        {displayedDays?.slice(currentWeekIndex * 7, (currentWeekIndex + 1) * 7).map((day: ScheduleDay, dayIndexInWeek: number) => {
                            const absoluteDayIndex = currentWeekIndex * 7 + dayIndexInWeek;
                            let displayShifts = day.shifts || [];
                            if (displayShifts.length === 0) {
                                if (day.morning?.length) displayShifts.push({ name: 'Shift 1', start: day.hours?.morning?.start||'10:00', end: day.hours?.morning?.end||'15:00', staff: day.morning });
                                if (day.evening?.length) displayShifts.push({ name: 'Shift 2', start: day.hours?.evening?.start||'14:30', end: day.hours?.evening?.end||'19:00', staff: day.evening });
                                if (day.night?.length) displayShifts.push({ name: 'Shift 3', start: day.hours?.night?.start||'18:00', end: day.hours?.night?.end||'22:00', staff: day.night });
                            }
                            return (
                                <div key={absoluteDayIndex} className="bg-dark-surface p-3 rounded-xl shadow-sm border border-white/10">
                                    <div className="flex justify-between mb-3 items-center"><div><span className="font-bold text-dark-text mr-2">{day.name}</span><span className="text-xs text-dark-text-light">{day.date}</span></div><button onClick={() => setEditingShift({ dayIdx: absoluteDayIndex, shift: 'all' })} className="px-3 py-1 bg-white/10 rounded text-[10px] font-bold text-white hover:bg-white/20">Edit Shifts</button></div>
                                    <div className="space-y-2">{displayShifts.length > 0 ? displayShifts.map((shift: any, idx: number) => (<div key={idx} className="flex items-center gap-3 bg-dark-bg p-2 rounded border border-white/5"><div className="w-16 shrink-0 flex flex-col items-center"><span className="text-[9px] font-bold text-dark-accent bg-dark-accent/10 px-1.5 py-0.5 rounded uppercase">Shift {idx + 1}</span><span className="text-[9px] text-dark-text-light font-mono mt-0.5">{shift.start}-{shift.end}</span></div><div className="flex-1 flex flex-wrap gap-1">{shift.staff.length > 0 ? shift.staff.map((s: string, i: number) => (<span key={i} className="text-xs text-white bg-white/10 px-2 py-0.5 rounded">{s}</span>)) : <span className="text-xs text-dark-text-light italic">Empty</span>}</div></div>)) : <p className="text-xs text-dark-text-light italic p-2">No shifts scheduled.</p>}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
                
                {/* --- 财务视图 (双模块优化版) --- */}
                {view === 'financial' && (
                    <div className="space-y-4 pb-10">
                        {/* 1. 月份选择器 */}
                        <div className="bg-dark-surface p-4 rounded-xl border border-white/10 sticky top-0 z-20 shadow-md">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-white">💰 Financial Month</span>
                                <input 
                                    type="month" 
                                    value={financialMonth} 
                                    onChange={(e) => setFinancialMonth(e.target.value)} 
                                    className="bg-dark-bg border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm font-mono outline-none focus:border-dark-accent"
                                />
                            </div>
                        </div>

                        {/* 2. 模块一: Total Overview (含月薪) - 用于看总预算 */}
                        <div className="bg-dark-surface p-5 rounded-2xl shadow-lg border border-white/10 relative overflow-hidden">
                            <h3 className="font-bold mb-4 text-dark-text flex items-center gap-2 uppercase tracking-wider text-sm"><Icon name="Briefcase" size={16}/> Total Overview (Inc. Fixed Salaries)</h3>
                            <div className="mb-4"><label className="block text-xs font-bold text-dark-text-light mb-1 uppercase">Monthly Budget Max (€)</label><input type="number" className="w-full border rounded-xl p-3 text-xl font-black bg-dark-bg border-white/10 text-white focus:ring-2 focus:ring-dark-accent outline-none" value={budgetMax} onChange={e => handleBudgetChange(e.target.value)} /></div>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-dark-bg p-4 rounded-xl border border-white/5"><p className="text-[10px] text-dark-text-light font-bold uppercase mb-1">Total Proj.</p><p className="text-xl font-black text-white">€{totalEstCost.toFixed(0)}</p></div>
                                <div className="bg-dark-bg p-4 rounded-xl border border-white/5 relative overflow-hidden"><p className="text-[10px] text-dark-text-light font-bold uppercase mb-1">Total Actual</p><p className="text-xl font-black text-white">€{totalActualCost.toFixed(0)}</p></div>
                            </div>
                            <div><div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-dark-text-light uppercase">Total Budget Used</span><span className={`text-xs font-black ${totalActualCost > budgetMax ? 'text-red-400' : 'text-green-400'}`}>{totalActualCost > budgetMax ? 'OVER BUDGET' : `€${(budgetMax - totalActualCost).toFixed(0)} Left`}</span></div><div className="w-full bg-dark-bg rounded-full h-3 overflow-hidden border border-white/5"><div className={`h-full rounded-full transition-all duration-500 ${totalActualCost > budgetMax ? 'bg-red-500' : 'bg-gradient-to-r from-green-500 to-emerald-400'}`} style={{ width: `${Math.min(100, (totalActualCost/budgetMax)*100)}%` }}></div></div></div>
                            <p className="text-[10px] text-center text-dark-text-light mt-3 border-t border-white/5 pt-2">Includes Fixed Salaries (Monthly): €{totalFixed.toFixed(0)}</p>
                        </div>

                        {/* 3. 模块二: Operational Costs (仅时薪) - 用于看日常运营 */}
                        <div className="bg-dark-surface p-5 rounded-2xl shadow-lg border border-white/10 border-l-4 border-l-blue-500">
                            <h3 className="font-bold mb-4 text-dark-text flex items-center gap-2 uppercase tracking-wider text-sm"><Icon name="Grid" size={16}/> Operational Costs (Hourly Only)</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-dark-bg p-4 rounded-xl border border-white/5">
                                    <p className="text-[10px] text-dark-text-light font-bold uppercase mb-1">Proj. Hourly</p>
                                    <p className="text-xl font-black text-blue-400">€{totalHourlyEst.toFixed(0)}</p>
                                </div>
                                <div className="bg-dark-bg p-4 rounded-xl border border-white/5">
                                    <p className="text-[10px] text-dark-text-light font-bold uppercase mb-1">Act. Hourly</p>
                                    <p className="text-xl font-black text-green-400">€{totalHourlyAct.toFixed(0)}</p>
                                </div>
                            </div>
                            <p className="text-[10px] text-center text-dark-text-light mt-2">Real-time costs derived from shifts & logs (Excludes Fixed Salaries).</p>
                        </div>

                        {/* 4. 员工工资设置 */}
                        <div className="bg-dark-surface rounded-xl border border-white/10 overflow-hidden">
                            <div className="p-3 bg-white/5 border-b border-white/10 flex justify-between items-center"><h4 className="font-bold text-sm text-white">Staff Wage Settings</h4><span className="text-[10px] text-dark-text-light">Auto-saved</span></div>
                            <table className="w-full text-xs"><thead className="bg-dark-bg text-dark-text-light uppercase"><tr><th className="p-3 text-left">Staff</th><th className="p-3 text-left">Type</th><th className="p-3 text-right">Value (€)</th><th className="p-3 text-right">Act Cost ({financialMonth})</th></tr></thead><tbody className="divide-y divide-white/10">{Object.keys(stats).map(name => { const wage = wages[name] || { type: 'hourly', value: 12 }; return (<tr key={name}><td className="p-3 font-bold text-dark-text">{name}</td><td className="p-3"><select className="bg-dark-bg border border-white/20 rounded px-2 py-1 text-white outline-none focus:border-dark-accent text-[10px]" value={wage.type} onChange={(e) => { const newWages = { ...wages, [name]: { ...wage, type: e.target.value as any } }; saveWages(newWages); }}><option value="hourly">Hourly</option><option value="fixed">Monthly</option></select></td><td className="p-3 text-right"><input type="number" step={wage.type === 'hourly' ? "0.5" : "100"} className="w-20 text-right py-1 rounded bg-dark-bg border border-white/20 text-white font-mono focus:border-dark-accent outline-none px-2" value={wage.value || ''} onChange={(e) => { const val = parseFloat(e.target.value); const newWages = { ...wages, [name]: { ...wage, value: isNaN(val) ? 0 : val } }; saveWages(newWages); }} /></td><td className="p-3 text-right font-mono text-dark-text-light">€{stats[name].actualCost.toFixed(0)}</td></tr>)})}</tbody></table>
                        </div>

                        {/* 5. 每日明细 */}
                        <div className="bg-dark-surface rounded-xl border border-white/10 overflow-hidden">
                            <div className="p-3 bg-white/5 border-b border-white/10 flex justify-between items-center"><h4 className="font-bold text-sm text-white">Daily Breakdown ({financialMonth})</h4><span className="text-[10px] text-dark-text-light bg-dark-bg px-2 py-1 rounded">Est vs Act</span></div>
                            <div className="max-h-64 overflow-y-auto"><table className="w-full text-xs"><thead className="bg-dark-bg text-dark-text-light uppercase sticky top-0 z-10"><tr><th className="p-3 text-left">Date</th><th className="p-3 text-right">Est.</th><th className="p-3 text-right">Act.</th><th className="p-3 text-right">Diff</th></tr></thead><tbody className="divide-y divide-white/10">{getDailyFinancials().map((d: any) => (<React.Fragment key={d.date}><tr className="hover:bg-white/5 transition-colors bg-white/5 border-b border-white/5"><td className="p-3"><div className="font-bold text-white">{d.date}</div><div className="text-[10px] text-dark-text-light">{d.name}</div></td><td className="p-3 text-right font-mono text-dark-text-light">€{d.est.toFixed(0)}</td><td className="p-3 text-right font-mono font-bold text-white">€{d.act.toFixed(0)}</td><td className="p-3 text-right font-mono"><span className={`px-1.5 py-0.5 rounded ${Math.abs(d.diff) < 1 ? 'bg-white/5 text-gray-400' : d.diff < 0 ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{d.diff > 0 ? '+' : ''}{d.diff.toFixed(0)}</span></td></tr>{d.details.length > 0 && (<tr><td colSpan={4} className="p-2 pl-4 border-b border-white/10 bg-dark-bg/30"><div className="grid grid-cols-2 gap-2">{d.details.map((staff: any, idx: number) => (<div key={idx} className="flex justify-between items-center text-[10px] bg-dark-surface p-1.5 rounded border border-white/5"><span className="text-dark-text font-bold">{staff.name}</span><div className="flex gap-2 font-mono"><span className="text-dark-text-light">E:{staff.est.toFixed(0)}</span><span className={`font-bold ${staff.act > staff.est ? 'text-red-400' : staff.act < staff.est ? 'text-blue-300' : 'text-green-400'}`}>A:{staff.act.toFixed(0)}</span></div></div>))}</div></td></tr>)}</React.Fragment>))}</tbody></table></div>
                        </div>

                        <div className="bg-dark-surface p-4 rounded-xl border border-white/10 mt-4">
                            <div className="flex items-center justify-between mb-3"><span className="text-xs font-bold text-dark-text-light uppercase">Export Data ({financialMonth})</span></div>
                            <div className="grid grid-cols-2 gap-3"><button onClick={handleExportLogsCSV} className="bg-white/10 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-white/20 transition-all border border-white/5"><Icon name="Clock" size={16} /> Export Logs</button><button onClick={handleExportFinancialCSV} className="bg-green-600 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-green-700 transition-all shadow-lg"><Icon name="List" size={16} /> Export Summary</button></div>
                        </div>
                    </div>
                )}
                {view === 'logs' && (
                    <div className="space-y-2">
                        <div className="flex justify-end mb-4"><button onClick={() => setIsAddingManualLog(true)} className="bg-dark-accent text-dark-bg px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:opacity-90 transition-all"><Icon name="Plus" size={16} /> Add Manual Attendance</button></div>
                        {visibleLogs.map((log: LogEntry) => (
                            <div key={log.id} className={`bg-dark-surface p-3 rounded-lg shadow-sm text-sm border-l-4 ${log.isDeleted ? 'border-gray-500 opacity-60' : 'border-dark-accent'}`}>
                                <div className="flex justify-between mb-1"><span className="font-bold text-dark-text">{log.name}</span><span className="text-xs text-dark-text-light">{formattedDate(log.time)}</span></div>
                                <div className="flex justify-between items-center"><div><span className={`px-2 py-0.5 rounded text-[10px] ${log.type?.includes('in') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{log.type}</span>{log.isDeleted && <span className="ml-2 text-[10px] font-bold text-gray-400">[INVALIDATED]</span>}{log.isManual && <span className="ml-2 text-[10px] font-bold text-yellow-400">[MANUAL]</span>}</div><div className="flex items-center gap-2"><span className="text-[10px] text-dark-text-light font-mono">{log.reason || 'No Location'}</span>{!log.isDeleted && (<><button onClick={() => handleOpenAdjustModal(log)} title="Adjust Hours" className="p-1.5 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20"><Icon name="Edit" size={12}/></button><button onClick={() => setLogToInvalidate(log)} title="Invalidate Log" className="p-1.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"><Icon name="Trash" size={12}/></button></>)}</div></div>
                                {log.isDeleted && <p className="text-xs mt-2 text-gray-400 border-t border-white/10 pt-2">Reason: {log.deleteReason}</p>}
                            </div>
                        ))}
                    </div>
                )}
                {view === 'confirmations' && (
                    <div className="space-y-4">
                        <div className="bg-dark-surface p-4 rounded-xl shadow-sm border border-white/10">
                            <h3 className="font-bold text-dark-text mb-2">Staff Confirmation Status</h3>
                            <p className="text-xs text-dark-text-light mb-4">Cycle: {currentCycle ? `${currentCycle.startDate} to ${currentCycle.endDate}` : 'No active cycle'}</p>
                            <div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead className="text-dark-text-light border-b border-white/10"><tr><th className="p-3">Staff</th><th className="p-3">Status</th><th className="p-3">Viewed</th></tr></thead><tbody className="divide-y divide-white/10">{currentCycle && Object.entries(currentCycle.confirmations).map(([userId, conf]) => { const staff = users.find((u:User) => u.id === userId); const confirmation = conf as any; return (<tr key={userId}><td className="p-3 font-bold">{staff?.name || userId}</td><td className={`p-3 capitalize font-bold ${confirmation.status === 'confirmed' ? 'text-green-400' : 'text-red-400'}`}>{confirmation.status.replace('_', ' ')}</td><td className="p-3">{confirmation.viewed ? 'Yes' : 'No'}</td></tr>)})}</tbody></table>{!currentCycle && <p className="text-center p-4 text-dark-text-light italic">No schedule has been published yet.</p>}</div>
                        </div>
                    </div>
                )}
                {view === 'availability' && <StaffAvailabilityView t={t} users={users} />}
                {view === 'chat' && <ChatView t={t} currentUser={managerUser} messages={directMessages} setMessages={setDirectMessages} notices={notices} isManager={true} onExit={() => setView('requests')} sopList={data.sopList} trainingLevels={data.trainingLevels} allUsers={users} />}
                {view === 'planning' && (
                    <div className="space-y-4 pb-10">
                        <div className="bg-dark-surface p-5 rounded-xl border border-white/10 mb-4 shadow-lg"><h3 className="font-bold text-dark-text mb-2 flex items-center gap-2 uppercase tracking-wider text-sm"><Icon name="Briefcase" size={16}/> Staff Planning & Cost</h3><p className="text-xs text-dark-text-light mb-4">Live estimate based on current schedule (Current Week View).</p><div className="flex justify-between items-center bg-dark-bg p-4 rounded-xl border border-white/5"><span className="text-xs font-bold text-dark-text-light uppercase">Total Weekly Forecast</span><span className="text-2xl font-black text-green-400">€{totalWeeklyPlanningCost.toFixed(0)}</span></div></div>
                        {displayedDays?.slice(currentWeekIndex * 7, (currentWeekIndex + 1) * 7).map((day: ScheduleDay, idxInView: number) => {
                            const absoluteIdx = currentWeekIndex * 7 + idxInView;
                            const dailyCost = (day.shifts || []).reduce((acc:number, s:any) => acc + getShiftCost(s.staff||[], s.start, s.end), 0) 
                                            + getShiftCost(day.morning, '10:00', '15:00') + getShiftCost(day.evening, '14:30', '19:00') + (day.night ? getShiftCost(day.night, '18:00', '22:00') : 0);
                            return (
                                <div key={absoluteIdx} className="bg-dark-surface p-4 rounded-xl shadow-sm border border-white/10">
                                    <div className="flex justify-between items-center mb-3 border-b border-white/5 pb-2"><div><span className="font-bold text-dark-text">{day.name}</span><span className="text-xs text-dark-text-light ml-2">{day.date}</span></div><div className="text-right"><span className="block text-[10px] text-dark-text-light uppercase">Daily Cost</span><span className="font-bold text-white">€{dailyCost.toFixed(0)}</span></div></div>
                                    <p className="text-xs text-dark-text-light italic text-center">Use 'Schedule' tab to edit shifts.</p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {editingShift && displayedDays && <ScheduleEditorModal isOpen={!!editingShift} day={displayedDays[editingShift.dayIdx]} shiftType={editingShift.shift} currentStaff={[]} currentHours={undefined} onClose={() => setEditingShift(null)} onSave={handleSaveSchedule} teamMembers={activeStaff} />}
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

// ============================================================================
// 新增组件: 物料报损单 (Waste Report View) [含自动暂存]
// ============================================================================
const WasteReportView = ({ lang, inventoryList, onSubmit, onCancel, currentUser }: any) => {
    const [wasteData, setWasteData] = useState<Record<string, { loss: string, reason: string }>>({});
    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';

    const draftKey = `onesip_waste_draft_${currentUser?.id}`;

    useEffect(() => {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
            try { setWasteData(JSON.parse(saved)); } catch(e) {}
        }
    }, [draftKey]);

    useEffect(() => {
        localStorage.setItem(draftKey, JSON.stringify(wasteData));
    }, [wasteData, draftKey]);

    const handleSubmit = () => {
        const dataToSubmit: Record<string, { loss: string, reason: string }> = {};
        let hasData = false;
        Object.keys(wasteData).forEach(id => {
            if (wasteData[id].loss && parseFloat(wasteData[id].loss) > 0) {
                dataToSubmit[id] = wasteData[id];
                hasData = true;
            }
        });

        if (!hasData) {
            alert(lang === 'zh' ? "请至少输入一项浪费/损耗的数量。" : "Please enter at least one waste amount.");
            return;
        }

        onSubmit({
            submittedBy: currentUser?.name,
            userId: currentUser?.id,
            data: dataToSubmit,
            shift: 'waste', 
            date: new Date().toISOString()
        });

        localStorage.removeItem(draftKey);
        setWasteData({});
    };

    return (
        <div className="flex flex-col h-full bg-secondary pb-20 animate-fade-in-up text-text">
            <div className="bg-white p-4 border-b sticky top-0 z-10 shadow-sm flex items-center gap-3">
                <button onClick={onCancel} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><Icon name="ArrowLeft" /></button>
                <h2 className="text-xl font-black text-red-500 flex items-center gap-2">
                    <Icon name="Trash" size={20} /> {lang === 'zh' ? '物料报损记录' : 'Waste Report'}
                </h2>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-xs font-bold border border-red-100 mb-4">
                    {lang === 'zh' 
                        ? '💡 提示：仅填写今天有额外损耗/浪费的物料，正常使用的无需填写。' 
                        : '💡 Tip: Only fill in items with extra waste/loss. Leave others blank.'}
                </div>
                {inventoryList.filter((i:any)=>!i.hidden).map((item: any) => (
                    <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="font-bold text-gray-800 text-sm truncate">{getLoc(item.name)}</div>
                            <div className="text-[10px] text-gray-400">{item.unit}</div>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                placeholder="Qty"
                                value={wasteData[item.id]?.loss || ''}
                                onChange={e => setWasteData(prev => ({...prev, [item.id]: {...prev[item.id], loss: e.target.value}}))}
                                className="w-16 p-2 rounded-lg border border-red-200 text-center text-red-500 font-bold bg-red-50 focus:bg-white outline-none placeholder-red-300 text-sm"
                            />
                            <input
                                type="text"
                                placeholder={lang === 'zh' ? '原因' : 'Reason'}
                                value={wasteData[item.id]?.reason || ''}
                                onChange={e => setWasteData(prev => ({...prev, [item.id]: {...prev[item.id], reason: e.target.value}}))}
                                className="w-20 p-2 rounded-lg border border-gray-200 text-xs bg-gray-50 focus:bg-white outline-none"
                            />
                        </div>
                    </div>
                ))}
            </div>
            <div className="p-4 bg-white border-t sticky bottom-0 z-20 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                <button onClick={handleSubmit} className="w-full bg-red-500 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 hover:bg-red-600">
                    <Icon name="Save" size={20} /> {lang === 'zh' ? '提交报损记录' : 'Submit Waste'}
                </button>
            </div>
        </div>
    );
};

// ============================================================================
// 新增组件: 分店与权限管理 (Store Management View)
// ============================================================================
const StoreManagementView = ({ data }: any) => {
    const { stores, setStores, users } = data;
    const [activeStoreId, setActiveStoreId] = useState<string>(stores[0]?.id || '');

    const activeStore = stores.find((s: any) => s.id === activeStoreId);

    const handleAddStore = () => {
        const newStore = {
            id: `store_${Date.now()}`,
            name: `New Branch ${stores.length + 1}`,
            staff: [],
            features: { prep: true, waste: true, schedule: true, swap: true, availability: true, sop: true, training: true, recipes: true, chat: true },
            schedule: { days: [] },
            inventoryList: null, // 独立补料清单
            smartInventory: null // 独立智能仓库
        };
        setStores([...stores, newStore]);
        setActiveStoreId(newStore.id);
    };

    const handleDeleteStore = () => {
        if(stores.length <= 1) return alert("Must keep at least one store.");
        if(window.confirm("Delete this store? All its exclusive data might be unlinked!")) {
            const newStores = stores.filter((s:any) => s.id !== activeStoreId);
            setStores(newStores);
            setActiveStoreId(newStores[0].id);
        }
    };

    const updateStoreField = (field: string, value: any) => {
        setStores(stores.map((s:any) => s.id === activeStoreId ? { ...s, [field]: value } : s));
    };

    const updateFeature = (featureKey: string, value: boolean) => {
        if(!activeStore) return;
        updateStoreField('features', { ...activeStore.features, [featureKey]: value });
    };

    const toggleStaff = (userId: string) => {
        if(!activeStore) return;
        const currentStaff = activeStore.staff || [];
        const newStaff = currentStaff.includes(userId) 
            ? currentStaff.filter((id:string) => id !== userId) 
            : [...currentStaff, userId];
        updateStoreField('staff', newStaff);
    };

    const modulesList = [
        { key: 'recipes', label: '饮品配方 (Recipes)' },
        { key: 'prep', label: '日常盘点 (Daily Prep)' },
        { key: 'waste', label: '物料报损 (Waste Report)' },
        { key: 'schedule', label: '员工排班 (Schedule)' },
        { key: 'swap', label: '换班申请 (Shift Swap)' },
        { key: 'availability', label: '意向时间 (Availability)' },
        { key: 'sop', label: 'SOP知识库 (SOP Library)' },
        { key: 'training', label: '员工培训 (Training)' },
        { key: 'chat', label: '团队沟通 (Team Chat)' }
    ];

    if(!activeStore) return <div className="p-4 text-white">Loading...</div>;

    return (
        <div className="flex flex-col md:flex-row h-full gap-4 p-4 animate-fade-in">
            <div className="w-full md:w-1/3 bg-dark-surface rounded-xl border border-white/10 overflow-hidden flex flex-col max-h-64 md:max-h-full shrink-0">
                <div className="p-3 bg-white/5 border-b border-white/10 flex justify-between items-center">
                    <h3 className="font-bold text-white text-sm">Branches</h3>
                    <button onClick={handleAddStore} className="text-dark-accent hover:opacity-80"><Icon name="Plus" size={18}/></button>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-2">
                    {stores.map((s:any) => (
                        <button 
                            key={s.id} 
                            onClick={() => setActiveStoreId(s.id)}
                            className={`w-full text-left p-3 rounded-lg text-sm font-bold transition-all ${activeStoreId === s.id ? 'bg-dark-accent text-dark-bg' : 'bg-dark-bg text-dark-text-light hover:bg-white/5 border border-white/5'}`}
                        >
                            {s.name} <span className="text-[10px] font-normal opacity-70 ml-1">({s.staff?.length || 0} Staff)</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
                <div className="bg-dark-surface p-4 rounded-xl border border-white/10">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-white">Store Settings</h3>
                        <button onClick={handleDeleteStore} className="text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-400/20">Delete Store</button>
                    </div>
                    <label className="text-xs text-dark-text-light font-bold mb-1 block">Store Name</label>
                    <input 
                        className="w-full bg-dark-bg border border-white/20 p-3 rounded-lg text-white font-bold outline-none focus:border-dark-accent" 
                        value={activeStore.name} 
                        onChange={(e) => updateStoreField('name', e.target.value)} 
                    />
                </div>

                <div className="bg-dark-surface p-4 rounded-xl border border-white/10">
                    <h3 className="font-bold text-white mb-1">Feature Toggles</h3>
                    <p className="text-xs text-dark-text-light mb-4">Turn modules on/off for employees assigned to this store.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {modulesList.map(mod => (
                            <label key={mod.key} className="flex items-center justify-between bg-dark-bg p-3 rounded-lg border border-white/5 cursor-pointer hover:border-white/10 transition-colors">
                                <span className="text-sm font-bold text-white">{mod.label}</span>
                                <input 
                                    type="checkbox" 
                                    checked={activeStore.features?.[mod.key] !== false} 
                                    onChange={(e) => updateFeature(mod.key, e.target.checked)}
                                    className="w-5 h-5 rounded bg-dark-bg border-white/20 text-dark-accent focus:ring-dark-accent"
                                />
                            </label>
                        ))}
                    </div>
                </div>

                <div className="bg-dark-surface p-4 rounded-xl border border-white/10">
                    <h3 className="font-bold text-white mb-1">Assigned Staff</h3>
                    <p className="text-xs text-dark-text-light mb-4">Select employees to assign to this branch.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {users.filter((u:User) => u.active !== false).map((u:User) => {
                            const isAssigned = activeStore.staff?.includes(u.id);
                            return (
                                <button 
                                    key={u.id}
                                    onClick={() => toggleStaff(u.id)}
                                    className={`p-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-between ${isAssigned ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-dark-bg border-white/5 text-dark-text-light hover:bg-white/5'}`}
                                >
                                    {u.name}
                                    {isAssigned && <Icon name="CheckCircle2" size={14} />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// 新增: 分店沙盒隔离层 (Branch Manager Wrapper) - 数据全隔离
// ============================================================================
const BranchManagerWrapper = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { stores, setStores, currentUser, users, setUsers, scheduleCycles, setScheduleCycles, schedule, setSchedule, inventoryList, setInventoryList, inventoryHistory, smartInventory, setSmartInventory, smartReports } = data;
    
    const accessibleStores = currentUser?.role === 'boss' 
        ? stores 
        : stores.filter((s:any) => s.staff?.includes(currentUser.id));
        
    const [storeId, setStoreId] = useState(accessibleStores[0]?.id || 'default_store');
    const activeStore = stores.find((s:any) => s.id === storeId) || accessibleStores[0];

    if (!activeStore) {
        return (
            <div className="min-h-screen bg-dark-bg flex items-center justify-center text-white">
                <div className="text-center">
                    <Icon name="Lock" size={48} className="mx-auto mb-4 text-dark-accent opacity-50" />
                    <h2 className="text-xl font-bold mb-2">No Branch Assigned</h2>
                    <p className="text-dark-text-light mb-6">You are not assigned to manage any branch.</p>
                    <button onClick={onExit} className="bg-dark-accent text-dark-bg px-6 py-2 rounded-lg font-bold">Go Back</button>
                </div>
            </div>
        );
    }

    // 员工 & 排班隔离
    const branchUsers = users.filter((u:User) => activeStore.staff?.includes(u.id) || u.role === 'boss');
    const proxySetUsers = (newUsers: User[]) => {
        setUsers(newUsers); 
        const oldIds = users.map((u:User) => u.id);
        const addedIds = newUsers.filter((u:User) => !oldIds.includes(u.id)).map(u => u.id);
        if (addedIds.length > 0) {
            const updatedStores = stores.map((s:any) => s.id === activeStore.id ? { ...s, staff: [...(s.staff||[]), ...addedIds] } : s);
            setStores(updatedStores);
        }
    };

    const branchCycles = scheduleCycles.filter((c:any) => c.storeId === activeStore.id || (!c.storeId && activeStore.id === 'default_store'));
    const proxySetScheduleCycles = (newCycles: any[]) => {
        const injected = newCycles.map((c:any) => ({ ...c, storeId: c.storeId || activeStore.id }));
        const otherCycles = scheduleCycles.filter((c:any) => c.storeId !== activeStore.id && (c.storeId || activeStore.id !== 'default_store'));
        setScheduleCycles([...otherCycles, ...injected.filter((c:any) => c.storeId === activeStore.id)]);
    };

    const branchSchedule = activeStore.schedule || schedule || { days: [] };
    const proxySetSchedule = (newSchedule: any) => {
        setSchedule(newSchedule);
        const updatedStores = stores.map((s:any) => s.id === activeStore.id ? { ...s, schedule: newSchedule } : s);
        setStores(updatedStores);
    };

    // 库存 & 记录隔离
    const branchInventoryList = activeStore.inventoryList || inventoryList;
    const proxySetInventoryList = (newList: any[]) => {
        if (activeStore.id === 'default_store') {
            setInventoryList(newList);
        } else {
            const updatedStores = stores.map((s:any) => s.id === activeStore.id ? { ...s, inventoryList: newList } : s);
            setStores(updatedStores);
        }
    };

    const branchSmartInventory = activeStore.smartInventory || smartInventory;
    const proxySetSmartInventory = (newList: any[]) => {
        if (activeStore.id === 'default_store') {
            setSmartInventory(newList);
        } else {
            const updatedStores = stores.map((s:any) => s.id === activeStore.id ? { ...s, smartInventory: newList } : s);
            setStores(updatedStores);
        }
    };

    const branchHistory = inventoryHistory.filter((r:any) => r.storeId === activeStore.id || (!r.storeId && activeStore.id === 'default_store'));
    const branchSmartReports = smartReports.filter((r:any) => r.storeId === activeStore.id || (!r.storeId && activeStore.id === 'default_store'));

    const proxyData = {
        ...data,
        users: branchUsers, setUsers: proxySetUsers,
        scheduleCycles: branchCycles, setScheduleCycles: proxySetScheduleCycles,
        schedule: branchSchedule, setSchedule: proxySetSchedule,
        inventoryList: branchInventoryList, setInventoryList: proxySetInventoryList,
        inventoryHistory: branchHistory,
        smartInventory: branchSmartInventory, setSmartInventory: proxySetSmartInventory,
        smartReports: branchSmartReports
    };

    return (
        <div className="flex flex-col h-screen bg-dark-bg relative">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[100] bg-dark-surface border border-white/20 pl-4 pr-3 py-2 rounded-full shadow-2xl flex items-center gap-3 backdrop-blur-md animate-fade-in-up">
                <Icon name="Store" size={16} className="text-dark-accent" />
                <select 
                    className="bg-transparent text-white text-sm font-bold outline-none appearance-none cursor-pointer pr-4"
                    value={storeId}
                    onChange={e => setStoreId(e.target.value)}
                >
                    {accessibleStores.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div className="w-px h-4 bg-white/20"></div>
                <span className="text-[10px] text-dark-accent font-black uppercase tracking-widest">Branch Mgr</span>
            </div>
            
            <div className="flex-1 w-full h-full overflow-hidden [&>div]:pt-16">
                <ManagerDashboard data={proxyData} onExit={onExit} />
            </div>
        </div>
    );
};

// ============================================================================
// 新增组件: 今日盘点结果卡片 (修复作用域)
// ============================================================================
const TodaysPrepReports = ({ inventoryHistory, inventoryList, lang }: { inventoryHistory: any[], inventoryList: any[], lang: string }) => {
    const today = new Date();
    const todaysReports = (inventoryHistory || []).filter((r: any) => 
        new Date(r.date).toDateString() === today.toDateString() && r.shift !== 'waste'
    );

    return (
        <div className="bg-surface p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
            <h3 className="text-xs font-bold text-text-light uppercase mb-3 flex items-center gap-1">
                <Icon name="Package" size={14}/> {lang === 'zh' ? '今日盘点结果' : "Today's Prep Results"}
            </h3>
            
            {todaysReports.length === 0 ? (
                <p className="text-sm text-text-light italic">
                    {lang === 'zh' ? '今天还没有人提交盘点报告。' : 'No reports submitted today.'}
                </p>
            ) : (
                <div className="space-y-3">
                    {todaysReports.slice().reverse().map((report: any) => (
                        <div key={report.id} className="bg-secondary p-3 rounded-xl border border-gray-200">
                            <div className="flex justify-between items-center mb-2 border-b border-gray-200 pb-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-primary text-sm">{report.submittedBy}</span>
                                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase">{report.shift}</span>
                                    {report.fridgeChecked && (
                                        <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded flex items-center gap-0.5" title="Fridge Temp < 6°C Confirmed">
                                            <Icon name="Snowflake" size={10} /> OK
                                        </span>
                                    )}
                                </div>
                                <span className="text-xs text-text-light">{new Date(report.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <div className="space-y-1">
                                {Object.entries(report.data || {}).map(([itemId, val]: any) => {
                                    const itemDef = inventoryList.find((i: any) => i.id === itemId);
                                    if (!itemDef) return null;
                                    return (
                                        <div key={itemId} className="flex justify-between text-xs items-center bg-white p-2 rounded border border-gray-100">
                                            <span className="text-gray-700 font-bold w-2/3 truncate" title={itemDef.name.zh}>{itemDef.name[lang] || itemDef.name.zh} <span className="opacity-50 font-normal">({itemDef.name.en})</span></span>
                                            <div className="font-mono w-1/3 text-right">
                                                <span className="font-bold text-green-600 bg-green-50 px-2 py-1 rounded">+{val.end} {itemDef.unit}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


// ============================================================================
// 组件 4: 员工端 (Staff App) - [智能分店隔离 & 权限自适应]
// ============================================================================
const StaffApp = ({ onSwitchMode, data, onLogout, currentUser, openAdmin }: { onSwitchMode: () => void, data: any, onLogout: () => void, currentUser: User, openAdmin: () => void }) => {
    const { 
        lang, setLang, schedule, notices, t, swapRequests, setSwapRequests, 
        directMessages, setDirectMessages, users, recipes, scheduleCycles, setScheduleCycles, 
        inventoryHistory, inventoryList, setInventoryList, sopList, trainingLevels, stores 
    } = data;
    const { showNotification } = useNotification();

    const [view, setView] = useState<StaffViewMode>('home');
    const [currentShift, setCurrentShift] = useState<string>('opening'); 
    const [hasUnreadChat, setHasUnreadChat] = useState(false);
    const [showAvailabilityReminder, setShowAvailabilityReminder] = useState(false);
    const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
    
    // --- 核心：员工获取自己的分店隔离数据 ---
    const myStore = stores?.find((s: any) => s.staff?.includes(currentUser.id));
    const myStoreId = myStore?.id || 'default_store';
    const defaultFeatures = { prep: true, waste: true, schedule: true, swap: true, availability: true, sop: true, training: true, recipes: true, chat: true };
    const activeFeatures = myStore ? (myStore.features || defaultFeatures) : defaultFeatures;

    // 隔离数据映射
    const branchInventoryList = myStore?.inventoryList || inventoryList;
    const branchHistory = inventoryHistory.filter((r:any) => r.storeId === myStoreId || (!r.storeId && myStoreId === 'default_store'));
    const branchUsers = users.filter((u:User) => myStore?.staff?.includes(u.id));
    const activeScheduleDays = myStore?.schedule?.days || schedule?.days || [];
    
    const today = new Date();
    const currentCycle = scheduleCycles.find((c: ScheduleCycle) => {
      const start = new Date(c.startDate);
      const end = new Date(c.endDate);
      const isStoreMatch = c.storeId === myStoreId || (!c.storeId && myStoreId === 'default_store');
      return today >= start && today <= end && c.status === 'published' && isStoreMatch;
    });
    const userConfirmation = currentCycle?.confirmations[currentUser.id];

    // Recipe States
    const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
    const [recipeTypeFilter, setRecipeTypeFilter] = useState<'product' | 'premix'>('product');
    const [newRecipesToAck, setNewRecipesToAck] = useState<DrinkRecipe[]>([]);
    const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
    const recipeReminderCheckDone = useRef(false);

    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [currentSwap, setCurrentSwap] = useState<{ date: string, shift: 'morning'|'evening'|'night' } | null>(null);
    const [targetEmployeeId, setTargetEmployeeId] = useState('');
    const [reason, setReason] = useState('');

    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';

    const featuredRecipes = (recipes || []).filter((r: DrinkRecipe) => r.isNew && r.isPublished !== false);
    const activeNotices = (notices || []).filter((n: Notice) => n.status !== 'cancelled');
    const latestNotice = activeNotices.length > 0 ? activeNotices[activeNotices.length - 1] : null;

    // 强制盘点逻辑
    const m = today.getMonth() + 1;
    const d = today.getDate();
    const todayDateKeys = [`${m}-${d}`, `${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`];
    
    const todaySchedule = activeScheduleDays.find((day: any) => todayDateKeys.includes(day.date));
    const myNameLower = currentUser.name.trim().toLowerCase();
    const myShiftsToday = todaySchedule?.shifts?.filter((s: any) => s.staff && s.staff.some((staffName: string) => staffName.trim().toLowerCase() === myNameLower)) || [];
    const hasShiftToday = myShiftsToday.length > 0;

    const hasSubmittedToday = branchHistory.some((r: any) => r.submittedBy === currentUser.name && new Date(r.date).toDateString() === today.toDateString() && r.shift !== 'waste');
    const needsToSubmitPrep = activeFeatures.prep && hasShiftToday && !hasSubmittedToday;

    const myNextShift = useMemo(() => {
        if (!activeFeatures.schedule || !activeScheduleDays) return null;
        const now = new Date();
        const nm = now.getMonth() + 1; const nd = now.getDate();
        const tDateKeys = [`${nm}-${nd}`, `${nm.toString().padStart(2, '0')}-${nd.toString().padStart(2, '0')}`];

        const allShifts = activeScheduleDays.flatMap((day: any) => {
            let date = new Date(day.date);
            if (isNaN(date.getTime()) || day.date.indexOf('-') > -1) {
                const parts = day.date.split('-');
                if (parts.length >= 2) {
                    const dm = parseInt(parts[0]); const dd = parseInt(parts[1]);
                    let year = now.getFullYear(); if (now.getMonth() === 11 && dm === 1) year++;
                    date = new Date(year, dm - 1, dd);
                }
            }
            const myName = currentUser.name.trim().toLowerCase();
            const myShifts = (day.shifts || []).filter((s: any) => s.staff && s.staff.some((staffName: string) => staffName.trim().toLowerCase() === myName));
            
            return myShifts.map((s: any) => {
                const [sh, sm] = s.start.split(':').map(Number); const [eh, em] = s.end.split(':').map(Number);
                const fullStart = new Date(date); fullStart.setHours(sh, sm, 0, 0);
                const fullEnd = new Date(date); fullEnd.setHours(eh, em, 0, 0);
                if (fullEnd < fullStart) fullEnd.setDate(fullEnd.getDate() + 1);
                return { dateStr: day.date, dateObj: date, start: s.start, end: s.end, fullStart, fullEnd };
            });
        });

        allShifts.sort((a: any, b: any) => a.fullEnd.getTime() - b.fullEnd.getTime());
        const next = allShifts.find((shift: any) => shift.fullEnd > now);

        if (next) {
            const isToday = tDateKeys.includes(next.dateStr) || next.dateObj.toDateString() === now.toDateString();
            const displayDate = isToday ? (t.today || "Today") : `${next.dateObj.getMonth() + 1}/${next.dateObj.getDate()}`;
            return { date: displayDate, shift: `${next.start} - ${next.end}` };
        }
        return null;
    }, [activeScheduleDays, currentUser, t, activeFeatures.schedule]);

    const handleSwapAction = async (reqId: string, action: 'accepted_by_peer' | 'rejected') => {
        const req = swapRequests.find((r: SwapRequest) => r.id === reqId);
        if(!req) return;
        const updatedReq = { ...req, status: action, decidedAt: Date.now() };
        const updatedReqs = swapRequests.map((r: SwapRequest) => (r.id === reqId ? updatedReq : r));
        await Cloud.updateSwapRequests(updatedReqs);
        showNotification({ type: 'message', title: 'Swap Updated', message: `You have ${action === 'accepted_by_peer' ? 'accepted' : 'rejected'} the request.` });
    };

    const handleSendSwapRequest = async () => {
        if (!currentSwap || !targetEmployeeId) { alert("Please select a colleague."); return; }
        const targetUser = branchUsers.find((u:User) => u.id === targetEmployeeId);
        if (!targetUser) return;

        const newRequest: Omit<SwapRequest, 'id'> = {
            requesterId: currentUser.id, requesterName: currentUser.name, requesterDate: currentSwap.date, requesterShift: currentSwap.shift,
            targetId: targetUser.id, targetName: targetUser.name, targetDate: null, targetShift: null,
            status: 'pending', reason: reason || null, timestamp: Date.now(),
            // @ts-ignore
            storeId: myStoreId
        };
        await Cloud.saveSwapRequest(newRequest);
        showNotification({ type: 'message', title: 'Swap Request Sent', message: `Sent to ${targetUser.name}.` });
        setIsSwapModalOpen(false); setReason(''); setTargetEmployeeId('');
    };

    const renderView = () => {
        if (view === 'team' && activeFeatures.schedule) {
            const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
            const startOfCurrentWeek = getStartOfWeek(new Date(), 0);
            const weeksData = [];
            for(let w=0; w<3; w++) {
                const weekStart = new Date(startOfCurrentWeek); weekStart.setDate(weekStart.getDate() + (w * 7));
                const weekDays = [];
                for(let d=0; d<7; d++) {
                    const day = new Date(weekStart); day.setDate(day.getDate() + d);
                    weekDays.push({
                         dateObj: day, dateStr: `${day.getMonth() + 1}-${day.getDate()}`,
                         dayName: day.toLocaleDateString('en-US', { weekday: 'long' }),
                         displayDate: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                         isToday: day.toDateString() === todayDate.toDateString()
                    });
                }
                weeksData.push({ id: w, label: w === 0 ? "Current Week" : `Week ${w + 1}`, range: `${weekDays[0].displayDate} - ${weekDays[6].displayDate}`, days: weekDays });
            }
            const scheduleMap = new Map<string, ScheduleDay>(activeScheduleDays.map((day: ScheduleDay) => [normalizeDateKey(day.date), day]) || []);
            
            return (
                <div className="h-full overflow-y-auto p-4 bg-secondary pb-24 text-text">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-black">{t.team_title}</h2></div>
                    <div className="space-y-8">
                        {weeksData.map((week) => (
                            <div key={week.id} className="space-y-3">
                                <div className="sticky top-0 bg-secondary/95 backdrop-blur-sm z-10 py-2 border-b border-gray-200/50 flex justify-between items-end"><h3 className="text-lg font-black text-primary">{week.label}</h3><span className="text-xs font-bold text-text-light">{week.range}</span></div>
                                <div className="space-y-3">
                                {week.days.map((dayInfo) => {
                                    const daySchedule = scheduleMap.get(normalizeDateKey(dayInfo.dateStr));
                                    let shiftsToRender = daySchedule?.shifts || [];
                                    const isTodayClass = dayInfo.isToday ? 'ring-2 ring-primary ring-offset-2 border-primary/20' : 'border-gray-100';
                                    return (
                                        <div key={dayInfo.dateStr} className={`p-4 rounded-xl shadow-sm border bg-surface ${isTodayClass}`}>
                                            <div className="flex justify-between items-center mb-3">
                                                <h3 className="font-bold text-text flex items-center gap-2">{dayInfo.dayName} <span className="text-text-light font-normal text-sm">{dayInfo.dateStr}</span>{dayInfo.isToday && <span className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Today</span>}</h3>
                                            </div>
                                            {shiftsToRender.length > 0 ? (
                                                <div className="space-y-2">
                                                    {shiftsToRender.map((shift: any, sIdx: number) => {
                                                        const staffList: string[] = shift.staff || [];
                                                        const timeDisplay = shift.start && shift.end ? `${shift.start}-${shift.end}` : '';
                                                        return (
                                                            <div key={sIdx} className="flex items-start gap-3">
                                                                <div className="flex flex-col items-center gap-0.5 w-16 shrink-0">
                                                                    <span className={`text-[10px] font-black uppercase tracking-wider w-full py-1.5 text-center rounded-md ${sIdx === 0 ? 'bg-orange-50 text-orange-500' : sIdx === 1 ? 'bg-indigo-50 text-indigo-500' : 'bg-purple-50 text-purple-500'}`}>Shift {sIdx + 1}</span>
                                                                    {timeDisplay && <span className="text-[9px] text-text-light font-mono">{timeDisplay}</span>}
                                                                </div>
                                                                <div className="flex-1 flex flex-wrap gap-2 items-center">
                                                                    {staffList.map((name: string, i: number) => { 
                                                                        const isMe = name === currentUser.name;
                                                                        return (<div key={i} className={`flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-xs font-bold rounded-lg border transition-all ${isMe ? 'bg-primary text-white border-primary shadow-sm' : 'bg-secondary text-text-light border-transparent'}`}>{name}</div>); 
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : <div className="flex items-center gap-2 opacity-50"><div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div><p className="text-xs text-text-light italic">No shifts scheduled</p></div>}
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
        
        if (view === 'recipes' && activeFeatures.recipes) {
             const filteredRecipes = recipes
                .filter((r: DrinkRecipe) => r.isPublished !== false)
                .filter((r: DrinkRecipe) => (recipeTypeFilter === 'premix' ? r.recipeType === 'premix' : (r.recipeType === 'product' || !r.recipeType)))
                .filter((r: DrinkRecipe) => r.name.en.toLowerCase().includes(recipeSearchQuery.toLowerCase()) || r.name.zh.includes(recipeSearchQuery));
             
             const renderVideo = (url: string) => {
                 if (url.includes('youtube.com') || url.includes('youtu.be')) {
                     const yId = getYouTubeId(url);
                     return yId ? ( <iframe className="w-full aspect-video rounded-lg mt-2 shadow-md" src={`https://www.youtube.com/embed/${yId}`} title="Video" allowFullScreen></iframe> ) : null;
                 }
                 return <video src={url} controls playsInline preload="metadata" className="w-full aspect-video rounded-lg mt-2 shadow-md bg-black object-contain" />;
             };

             return (
                <div className="h-full flex flex-col bg-secondary animate-fade-in-up text-text">
                    <div className="p-4 sticky top-0 bg-secondary z-10">
                        <h2 className="text-2xl font-black text-text mb-4">{t.recipe_title}</h2>
                        <div className="relative mb-4">
                            <Icon name="Search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                            <input value={recipeSearchQuery} onChange={e => setRecipeSearchQuery(e.target.value)} placeholder="Search recipes..." className="w-full bg-surface border rounded-lg p-3 pl-10 text-sm" />
                        </div>
                         <div className="flex gap-2">
                            <button onClick={() => setRecipeTypeFilter('product')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${recipeTypeFilter === 'product' ? 'bg-primary text-white shadow' : 'bg-surface text-text-light'}`}>Product</button>
                            <button onClick={() => setRecipeTypeFilter('premix')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${recipeTypeFilter === 'premix' ? 'bg-primary text-white shadow' : 'bg-surface text-text-light'}`}>Premix</button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 pt-0 pb-24">
                        {filteredRecipes.map((drink: DrinkRecipe) => (
                            <div key={drink.id} id={`recipe-${drink.id}`} className="bg-surface p-4 rounded-xl shadow-sm border border-gray-100 mb-3 cursor-pointer transition-all" onClick={() => setExpandedRecipeId(expandedRecipeId === drink.id ? null : drink.id)}>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="font-bold text-text flex items-center gap-2">
                                            {drink.name?.[lang] || drink.name?.['zh']}
                                            {drink.isNew && <span className="bg-red-100 text-red-500 text-[10px] px-1.5 py-0.5 rounded uppercase">New</span>}
                                        </h3>
                                        <p className="text-xs text-text-light">{drink.cat} • {drink.size}</p>
                                    </div>
                                    <Icon name={expandedRecipeId === drink.id ? "ChevronUp" : "ChevronRight"} size={20} className="text-gray-400" />
                                </div>
                                {expandedRecipeId === drink.id && (
                                    <div className="mt-3 text-sm text-text-light space-y-2 border-t pt-3 animate-fade-in" onClick={e => e.stopPropagation()}>
                                        <p><strong>Toppings:</strong> {drink.toppings?.[lang] || drink.toppings?.['zh']}</p>
                                        <p><strong>Sugar:</strong> {drink.sugar}</p>
                                        <p><strong>Ice:</strong> {drink.ice}</p>
                                        {drink.coverImageUrl && (<img src={drink.coverImageUrl} alt={drink.name?.[lang] || drink.name?.['zh']} className="w-full h-auto rounded-lg my-2 object-cover shadow-md" />)}
                                        {(drink.basePreparation?.en || drink.basePreparation?.zh) && (
                                            <div className="bg-yellow-500/10 p-3 rounded-lg my-2">
                                                <p className="font-bold text-yellow-800 mb-1 text-xs uppercase">Base Preparation</p>
                                                <p className="text-sm text-yellow-900 whitespace-pre-line leading-relaxed">{drink.basePreparation?.[lang] || drink.basePreparation?.['zh']}</p>
                                            </div>
                                        )}
                                        <div className="bg-blue-500/10 p-2 rounded"><p className="font-bold text-blue-800 mb-1">Cold Steps:</p><ol className="list-decimal pl-4">{drink.steps.cold.map((s:any, i:number) => <li key={i}>{s?.[lang]||s?.['zh']}</li>)}</ol></div>
                                        <div className="bg-orange-500/10 p-2 rounded"><p className="font-bold text-orange-800 mb-1">Warm Steps:</p><ol className="list-decimal pl-4">{drink.steps.warm.map((s:any, i:number) => <li key={i}>{s?.[lang]||s?.['zh']}</li>)}</ol></div>
                                        
                                        {drink.tutorialVideoUrl && (
                                            <div className="mt-3 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                                <p className="font-bold text-gray-700 mb-1 text-xs uppercase flex items-center gap-1">
                                                    <Icon name="PlayCircle" size={14} /> {lang === 'zh' ? '教学视频' : 'Tutorial Video'}
                                                </p>
                                                {renderVideo(drink.tutorialVideoUrl)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                        {filteredRecipes.length === 0 && <p className="text-center text-text-light py-10 text-sm">没有找到相关配方 / No recipes found.</p>}
                    </div>
                </div>
            );
        }
        
        if (view === 'inventory' && activeFeatures.prep) { 
            const defaultShift = new Date().getHours() < 16 ? 'morning' : 'evening';
            return (
                <InventoryView 
                    lang={lang} t={t} inventoryList={branchInventoryList} setInventoryList={setInventoryList} 
                    onSubmit={(report: any) => {
                        const completeReport = { ...report, id: Date.now().toString(), date: new Date().toISOString(), storeId: myStoreId };
                        Cloud.saveInventoryReport(completeReport); 
                        showNotification({ type: 'message', title: 'Saved', message: '记录已成功提交至本分店云端。' });
                        setView('home');
                    }}
                    currentUser={currentUser} isForced={false} onCancel={() => setView('home')} 
                    forcedShift={defaultShift} isOwner={false} 
                />
            ); 
        }

        if (view === 'waste' as any && activeFeatures.waste) {
            return (
                <WasteReportView 
                    lang={lang} inventoryList={branchInventoryList} 
                    onSubmit={(report: any) => {
                        const completeReport = { ...report, id: Date.now().toString(), date: new Date().toISOString(), storeId: myStoreId };
                        Cloud.saveInventoryReport(completeReport); 
                        showNotification({ type: 'message', title: 'Saved', message: '报损记录已提交至本分店云端。' });
                        setView('home');
                    }} 
                    onCancel={() => setView('home')} currentUser={currentUser} 
                />
            );
        }
        
        if (view === 'chat' && activeFeatures.chat) { return <ChatView t={t} currentUser={currentUser} messages={directMessages} setMessages={setDirectMessages} notices={notices} isManager={false} onExit={() => setView('home')} sopList={sopList} trainingLevels={trainingLevels} allUsers={users} />; }
        if (view === 'swapRequests' && activeFeatures.swap) {
            const myRequests = swapRequests.filter((r: SwapRequest) => r.requesterId === currentUser.id);
            const incomingRequests = swapRequests.filter((r: SwapRequest) => r.targetId === currentUser.id && r.status === 'pending');
            return (
                <div className="h-full overflow-y-auto p-4 bg-secondary pb-24 text-text">
                    <h2 className="text-2xl font-black mb-4">Shift Swap Center</h2>
                    <div className="mb-6"><h3 className="font-bold mb-2 text-text">Incoming Requests</h3>{incomingRequests.length > 0 ? incomingRequests.map((req: SwapRequest) => (<div key={req.id} className="bg-surface p-4 rounded-xl border mb-2"><p className="text-sm mb-2"><strong className="text-primary">{req.requesterName}</strong> wants to swap:</p><div className="bg-secondary p-2 rounded-lg text-center font-mono text-sm mb-3">{req.requesterDate} ({req.requesterShift})</div><div className="flex gap-2"><button onClick={() => handleSwapAction(req.id, 'rejected')} className="flex-1 bg-red-100 text-red-600 font-bold py-2 rounded-lg text-sm">Reject</button><button onClick={() => handleSwapAction(req.id, 'accepted_by_peer')} className="flex-1 bg-green-100 text-green-700 font-bold py-2 rounded-lg text-sm">Accept</button></div></div>)) : <p className="text-sm text-text-light italic">No incoming requests.</p>}</div>
                    <div><h3 className="font-bold mb-2 text-text">My Sent Requests</h3>{myRequests.length > 0 ? myRequests.map((req: SwapRequest) => (<div key={req.id} className="bg-surface p-3 rounded-xl border mb-2 text-sm"><p>To <strong className="text-primary">{req.targetName}</strong> for <span className="font-mono">{req.requesterDate} ({req.requesterShift})</span></p><p>Status: <strong className="capitalize text-gray-500">{req.status.replace(/_/g, ' ')}</strong></p></div>)) : <p className="text-sm text-text-light italic">No sent requests.</p>}</div>
                </div>
            );
        }
        return null;
    };

    const renderHomeView = () => (
        <div className="h-full overflow-y-auto bg-secondary p-4 pb-24 animate-fade-in-up text-text">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-black">{t.hello} {currentUser.name}</h1>
                    {myStore && <p className="text-primary font-bold text-[10px] uppercase mt-1 px-2 py-0.5 bg-primary/10 rounded inline-block tracking-wider border border-primary/20">{myStore.name}</p>}
                </div>
                <div className="flex items-center gap-2"><button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="bg-gray-200 h-9 w-9 flex items-center justify-center rounded-full text-text-light font-bold text-sm">{lang === 'zh' ? 'En' : '中'}</button><button onClick={openAdmin} className="bg-gray-200 h-9 w-9 flex items-center justify-center rounded-full text-text-light"><Icon name="Shield" size={16}/></button><button onClick={onLogout} className="bg-destructive-light h-9 w-9 flex items-center justify-center rounded-full text-destructive"><Icon name="LogOut" size={16}/></button></div>
            </div>

            {needsToSubmitPrep && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-2xl shadow-sm mb-4 relative overflow-hidden animate-fade-in flex items-center justify-between">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>
                    <div>
                        <h3 className="text-sm font-bold text-red-600 flex items-center gap-1"><Icon name="AlertCircle" size={16}/> {lang === 'zh' ? '盘点未完成' : 'Prep Incomplete'}</h3>
                        <p className="text-xs text-red-500 mt-1">{lang === 'zh' ? '下班前请务必填写今日备料盘点' : 'Please submit today\'s prep before leaving.'}</p>
                    </div>
                    <button onClick={() => setView('inventory')} className="bg-red-500 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-red-600 active:scale-95">{lang === 'zh' ? '去盘点' : 'Go to Prep'}</button>
                </div>
            )}

            {activeFeatures.recipes && featuredRecipes.length > 0 && (
                <div className="mb-4 animate-fade-in">
                    <h3 className="text-xs font-bold text-red-500 uppercase mb-2 flex items-center gap-1"><Icon name="Flame" size={14}/> {lang === 'zh' ? '新品配方推荐' : 'Featured New Recipes'}</h3>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                        {featuredRecipes.map((recipe: DrinkRecipe) => (
                            <div key={recipe.id} onClick={() => { setView('recipes'); setRecipeSearchQuery(''); setRecipeTypeFilter(recipe.recipeType || 'product'); setExpandedRecipeId(recipe.id); setTimeout(() => { document.getElementById(`recipe-${recipe.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 200); }} className="min-w-[240px] bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl p-4 shadow-md text-white shrink-0 relative overflow-hidden cursor-pointer active:scale-95 transition-transform">
                                <div className="absolute -right-4 -bottom-4 opacity-20"><Icon name="Coffee" size={80}/></div>
                                <h4 className="font-black text-lg mb-1 relative z-10">{recipe.name[lang] || recipe.name.zh}</h4>
                                <p className="text-xs opacity-90 relative z-10">{recipe.cat}</p>
                                <button className="mt-4 bg-white text-red-500 px-4 py-1.5 rounded-full text-xs font-bold relative z-10 shadow-sm hover:bg-gray-50 flex items-center gap-1"><Icon name="PlayCircle" size={14} /> {lang === 'zh' ? '查看做法' : 'View Recipe'}</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {latestNotice && (
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl shadow-sm mb-4 relative overflow-hidden animate-fade-in">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                    <div className="flex items-center gap-2 mb-2"><Icon name="Megaphone" size={16} className="text-blue-500"/><h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider">{lang === 'zh' ? '团队公告' : 'Team Announcement'}</h3></div>
                    <p className="text-sm text-gray-800 font-medium whitespace-pre-line">{latestNotice.content}</p>
                    {latestNotice.imageUrl && <img src={latestNotice.imageUrl} alt="notice" className="mt-3 rounded-xl w-full max-h-40 object-cover border border-blue-100/50 shadow-sm" />}
                    <div className="mt-2 text-[10px] text-blue-400 font-bold text-right">{latestNotice.author} • {new Date(latestNotice.date).toLocaleDateString()}</div>
                </div>
            )}

            {activeFeatures.schedule && (
                <div className="bg-surface p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
                    <p className="text-xs text-text-light font-bold uppercase mb-2">{t.next_shift}</p>
                    {myNextShift ? (<p className="font-bold text-text text-lg">{myNextShift.date} <span className="text-primary">{myNextShift.shift}</span></p>) : <p className="text-sm text-text-light italic">{t.no_shift}</p>}
                </div>
            )}
            
            {activeFeatures.prep && <TodaysPrepReports inventoryHistory={branchHistory} inventoryList={branchInventoryList} lang={lang} />}

            <div className="mt-4">
                <h3 className="font-bold text-text mb-2">My Modules</h3>
                <div className="grid grid-cols-2 gap-3">
                    {activeFeatures.waste && (
                        <button onClick={() => setView('waste' as any)} className="bg-red-50 p-4 rounded-2xl shadow-sm border border-red-100 text-left active:scale-95 transition-transform"><Icon name="Trash" className="mb-1 text-red-500"/> <p className="font-bold text-red-700">{lang === 'zh' ? '物料报损' : 'Waste Report'}</p></button>
                    )}
                    {activeFeatures.schedule && <button onClick={() => setView('team')} className="bg-surface p-4 rounded-2xl shadow-sm border border-gray-100 text-left active:scale-95 transition-transform"><Icon name="Users" className="mb-1 text-primary"/> <p className="font-bold">My Schedule</p></button>}
                    {activeFeatures.swap && <button onClick={() => setView('swapRequests')} className="bg-surface p-4 rounded-2xl shadow-sm border border-gray-100 text-left active:scale-95 transition-transform"><Icon name="Refresh" className="mb-1 text-primary"/> <p className="font-bold">Shift Swaps</p></button>}
                    {activeFeatures.availability && <button onClick={() => setShowAvailabilityModal(true)} className="bg-surface p-4 rounded-2xl shadow-sm border border-gray-100 text-left active:scale-95 transition-transform"><Icon name="Calendar" className="mb-1 text-primary"/> <p className="font-bold">Availability</p></button>}
                </div>
            </div>
        </div>
    );
    
    const handleNavSwitch = (v: StaffViewMode) => {
        setView(v);
        if (v !== 'recipes') { setExpandedRecipeId(null); setRecipeSearchQuery(''); }
    };

    return (
        <div className="max-w-md mx-auto bg-surface shadow-lg h-[100dvh] overflow-hidden flex flex-col relative pt-[calc(env(safe-area-inset-top)_+_1rem)]">
            {view === 'home' ? renderHomeView() : renderView()}
            {currentUser && <StaffBottomNav activeView={view} setActiveView={handleNavSwitch} t={t} hasUnreadChat={hasUnreadChat} features={activeFeatures} />}
            <AvailabilityReminderModal isOpen={showAvailabilityReminder} onConfirm={() => { setShowAvailabilityReminder(false); setShowAvailabilityModal(true); }} onCancel={() => setShowAvailabilityReminder(false)} t={t} />
            {currentUser && <AvailabilityModal isOpen={showAvailabilityModal} onClose={() => setShowAvailabilityModal(false)} t={t} currentUser={currentUser} />}
            <SwapRequestModal isOpen={isSwapModalOpen} onClose={() => { setIsSwapModalOpen(false); setTargetEmployeeId(''); setReason(''); }} onSubmit={handleSendSwapRequest} currentSwap={currentSwap} currentUser={currentUser} allUsers={branchUsers} targetEmployeeId={targetEmployeeId} setTargetEmployeeId={setTargetEmployeeId} reason={reason} setReason={setReason} />
        </div>
    );
};

// ============================================================================
// 组件: 底部导航栏 (StaffBottomNav)
// ============================================================================
const StaffBottomNav = ({ activeView, setActiveView, t, hasUnreadChat, features }: any) => {
    let navItems = [{ key: 'home', icon: 'Grid', label: t.home }];
    if (features?.training) navItems.push({ key: 'training', icon: 'Award', label: t.training });
    if (features?.recipes) navItems.push({ key: 'recipes', icon: 'Coffee', label: t.recipes });
    if (features?.prep) navItems.push({ key: 'inventory', icon: 'Package', label: t.stock });
    if (features?.chat) navItems.push({ key: 'chat', icon: 'MessageSquare', label: t.chat });

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

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
const App = () => {
    const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('onesip_lang') as Lang) || 'zh');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [adminMode, setAdminMode] = useState<'manager' | 'owner' | 'editor' | null>(null);
    const [adminModalOpen, setAdminModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showCloudSetup, setShowCloudSetup] = useState(false);
    
    const [users, setUsers] = useState<User[]>(STATIC_USERS);
    const [inventoryList, setInventoryList] = useState<InventoryItem[]>(INVENTORY_ITEMS);
    const [inventoryHistory, setInventoryHistory] = useState<InventoryReport[]>([]);
    const [schedule, setSchedule] = useState<any>({ days: [] });
    const [notices, setNotices] = useState<Notice[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
    const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
    const [sales, setSales] = useState<SalesRecord[]>([]);
    const [smartInventory, setSmartInventory] = useState<any[]>([]);
    const [sopList, setSopList] = useState<SopItem[]>(SOP_DATABASE);
    const [trainingLevels, setTrainingLevels] = useState<TrainingLevel[]>(TRAINING_LEVELS);
    const [recipes, setRecipes] = useState<DrinkRecipe[]>(DRINK_RECIPES);
    const [confirmations, setConfirmations] = useState<ScheduleConfirmation[]>([]);
    const [scheduleCycles, setScheduleCycles] = useState<ScheduleCycle[]>([]);
    const [smartInventoryReports, setSmartInventoryReports] = useState<SmartInventoryReport[]>([]);

    const [stores, setStores] = useState<any[]>(() => {
        const saved = localStorage.getItem('onesip_stores_v3');
        if (saved) return JSON.parse(saved);
        return [{ 
            id: 'default_store', 
            name: 'Main Store (Headquarters)', 
            staff: STATIC_USERS.map((u:User)=>u.id), 
            features: { prep: true, waste: true, schedule: true, swap: true, availability: true, sop: true, training: true, recipes: true, chat: true },
            schedule: { days: [] },
            inventoryList: null, 
            smartInventory: null
        }];
    });

    useEffect(() => { localStorage.setItem('onesip_stores_v3', JSON.stringify(stores)); }, [stores]);

    const t = TRANSLATIONS[lang];

    const appData = {
        lang, setLang, users, inventoryList, setInventoryList, inventoryHistory, 
        schedule, setSchedule, notices, logs, setLogs, t, directMessages, 
        setDirectMessages, swapRequests, setSwapRequests, sales, sopList, 
        setSopList, trainingLevels, setTrainingLevels, recipes, setRecipes, 
        confirmations, scheduleCycles, setScheduleCycles, 
        smartInventory, setSmartInventory, 
        smartInventoryReports, setSmartInventoryReports,
        smartReports: smartInventoryReports, 
        setSmartReports: setSmartInventoryReports,
        stores, setStores
    };

    useEffect(() => {
        Cloud.seedInitialData();
        const unsubs = [
            Cloud.subscribeToUsers(setUsers),
            Cloud.subscribeToInventory(setInventoryList),
            Cloud.subscribeToSmartInventory(setSmartInventory),
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

        setTimeout(() => setIsLoading(false), 800);
        return () => { unsubs.forEach(unsub => unsub && unsub()); };
    }, []);

    useEffect(() => { localStorage.setItem('onesip_lang', lang); }, [lang]);

    const handleLogin = (user: User, keepLoggedIn: boolean) => { setCurrentUser(user); };
    const handleLogout = () => { setCurrentUser(null); setAdminMode(null); };

    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-secondary text-primary font-bold animate-pulse">Loading ONESIP...</div>;
    
    if (adminMode === 'editor') return <EditorDashboard data={appData} onExit={() => setAdminMode(null)} />;
    
    return (
        <>
            {!currentUser && <LoginScreen users={users} onLogin={handleLogin} t={t} lang={lang} setLang={setLang} />}
            {currentUser && <StaffApp onSwitchMode={() => {}} data={appData} onLogout={handleLogout} currentUser={currentUser} openAdmin={() => setAdminModalOpen(true)} />}
            {!currentUser && !adminMode && (
                <div className="fixed bottom-6 right-6 z-50">
                    <button onClick={() => setAdminModalOpen(true)} className="w-10 h-10 bg-gray-200/50 hover:bg-gray-200 text-gray-500 hover:text-gray-800 rounded-full flex items-center justify-center transition-all backdrop-blur-sm">
                        <Icon name="Shield" size={18} />
                    </button>
                </div>
            )}
            <AdminLoginModal isOpen={adminModalOpen} onClose={() => setAdminModalOpen(false)} onLogin={(role) => { setAdminModalOpen(false); setAdminMode(role); }} />
            
            {adminMode === 'owner' && (
                <div className="fixed inset-0 z-50 bg-dark-bg">
                    <OwnerDashboard data={appData} onExit={() => setAdminMode(null)} />
                </div>
            )}

            {adminMode === 'manager' && (
                <div className="fixed inset-0 z-50 bg-dark-bg">
                    <BranchManagerWrapper data={appData} onExit={() => setAdminMode(null)} />
                </div>
            )}

            {showCloudSetup && <CloudSetupModal isOpen={showCloudSetup} onClose={() => setShowCloudSetup(false)} />}
        </>
    );
};

export default App;
