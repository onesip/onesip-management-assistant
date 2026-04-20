
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
// 数据库: 门店报修/异常题库 (纯正中英双语全面版)
// ============================================================================
const REPAIR_DATABASE = {
    machines: {
        title: { zh: '机器类', en: 'Machines' },
        items: [
            { name: { zh: '奶茶机', en: 'Milk Tea Machine' }, issues: [{zh:'清洗吸水不好', en:'Poor suction during cleaning'}, {zh:'漏水：茶桶区1-5', en:'Leaking: Tea bucket area 1-5'}, {zh:'漏水：中间区6-12', en:'Leaking: Middle area 6-12'}, {zh:'漏水：下层13-18', en:'Leaking: Bottom area 13-18'}, {zh:'接口接不上/漏液(需备注管路)', en:'Connector issue/Leaking (Add note)'}, {zh:'扫码不读码', en:'Scanner not reading'}, {zh:'部件缺失/损坏', en:'Missing/Broken parts'}, {zh:'校准后出料仍不准(需备注管路)', en:'Dispensing inaccurate after calibration (Add note)'}, {zh:'蚂蚁', en:'Ants'}, {zh:'不出料(需备注管路)', en:'Not dispensing (Add note)'}, {zh:'其他', en:'Other'}] },
            { name: { zh: '泡茶机', en: 'Tea Brewer' }, issues: [{zh:'部件缺失', en:'Missing parts'}, {zh:'部件损坏', en:'Broken parts'}, {zh:'其他', en:'Other'}] },
            { name: { zh: '制冰机', en: 'Ice Maker' }, issues: [{zh:'有积水', en:'Water pooling'}, {zh:'出现 Error', en:'Error code on screen'}, {zh:'冰块形状变小', en:'Ice cubes too small'}, {zh:'其他', en:'Other'}] },
            { name: { zh: '蒸汽机', en: 'Steamer' }, issues: [{zh:'达不到压力', en:'Not reaching pressure'}, {zh:'其他', en:'Other'}] },
            { name: { zh: '封口机', en: 'Sealer' }, issues: [{zh:'Error 4 不感应', en:'Error 4 / Sensor issue'}, {zh:'封口封不上(纸杯/塑料杯)', en:'Not sealing properly'}, {zh:'封口切口不齐', en:'Uneven cutting'}, {zh:'封口膜容易断裂', en:'Film tears easily'}, {zh:'其他', en:'Other'}] },
            { name: { zh: '咖啡机', en: 'Coffee Machine' }, issues: [{zh:'加热盘不够温度', en:'Heating plate not hot enough'}, {zh:'沥水盘不感应', en:'Drip tray sensor issue'}, {zh:'蚂蚁', en:'Ants'}, {zh:'其他', en:'Other'}] },
            { name: { zh: '叫号器', en: 'Pager' }, issues: [{zh:'无声', en:'No sound'}, {zh:'无法打开', en:'Won\'t turn on'}, {zh:'其他', en:'Other'}] },
            { name: { zh: '显示屏', en: 'Displays' }, issues: [{zh:'左1 无法打开', en:'Display L1 won\'t turn on'}, {zh:'左2 无法打开', en:'Display L2 won\'t turn on'}, {zh:'左3 无法打开', en:'Display L3 won\'t turn on'}, {zh:'左4 无法打开', en:'Display L4 won\'t turn on'}, {zh:'其他', en:'Other'}] },
            { name: { zh: '打印机/标签机', en: 'Printers' }, issues: [{zh:'无法连接', en:'Won\'t connect'}, {zh:'不打印', en:'Not printing'}, {zh:'重复打印', en:'Printing duplicates'}, {zh:'其他', en:'Other'}] },
            { name: { zh: 'Pad/效期机', en: 'Tablets' }, issues: [{zh:'不连接 Orderpin', en:'Not connecting to Orderpin'}, {zh:'不连接效期系统', en:'Not connecting to Expiry system'}, {zh:'不连接蓝牙', en:'Bluetooth issue'}, {zh:'不能播放音乐', en:'Music not playing'}, {zh:'打不开管理App', en:'App won\'t open'}, {zh:'其他', en:'Other'}] },
            { name: { zh: '水池/冰槽', en: 'Sinks/Ice Bins' }, issues: [{zh:'左边不下水', en:'Left sink not draining'}, {zh:'右边不下水', en:'Right sink not draining'}, {zh:'水池破损', en:'Sink damaged'}, {zh:'下方漏水', en:'Leaking underneath'}, {zh:'冰槽气味难闻', en:'Bad smell in ice bin'}, {zh:'有蚂蚁', en:'Ants'}, {zh:'其他', en:'Other'}] },
            { name: { zh: '其他设备', en: 'Other Equipments' }, issues: [{zh:'沙冰壶漏水/破损', en:'Blender pitcher leaking/broken'}, {zh:'洗碗机洗不干净/有积水/断电', en:'Dishwasher issue'}, {zh:'开水机达不到温度/断电', en:'Water boiler issue'}, {zh:'Kiosk 不能支付/死机', en:'Kiosk payment failed/frozen'}] }
        ]
    },
    recipes: {
        title: { zh: '配方/出品类', en: 'Recipes & Drinks' },
        items: [
            { name: { zh: '饮品问题', en: 'Drink Issues' }, issues: [{zh:'不能直接扫码', en:'Cannot scan code'}, {zh:'出品奇怪', en:'Looks weird'}, {zh:'颜色不对', en:'Wrong color'}, {zh:'量太多', en:'Too much quantity'}, {zh:'量太少', en:'Too little quantity'}, {zh:'冰度异常', en:'Ice level abnormal'}, {zh:'糖度异常', en:'Sugar level abnormal'}] }
        ]
    },
    facility: {
        title: { zh: '门店设施类', en: 'Facility' },
        items: [
            { name: { zh: '门窗/桌椅', en: 'Doors/Windows/Furniture' }, issues: [{zh:'前窗户损坏', en:'Front window damaged'}, {zh:'后窗户损坏', en:'Back window damaged'}, {zh:'门/门锁损坏', en:'Door/Lock damaged'}, {zh:'桌椅损坏', en:'Furniture damaged'}] },
            { name: { zh: '水电/照明', en: 'Electrical/Lighting' }, issues: [{zh:'插头没电', en:'Outlet no power'}, {zh:'蓝牙连不上', en:'Bluetooth won\'t connect'}, {zh:'紫外灯坏了', en:'UV light broken'}, {zh:'照明灯坏了(需备注位置)', en:'Light broken (Note location)'}] },
            { name: { zh: '空间环境', en: 'Spaces/Rooms' }, issues: [{zh:'地板破损', en:'Floor damaged'}, {zh:'厕所(马桶/水池/门)', en:'Restroom issue'}, {zh:'储物间(架子/冰箱/雪柜)', en:'Storage room issue'}, {zh:'厨房(微波炉/烤箱/柜子/桌椅)', en:'Kitchen issue'}] }
        ]
    },
    others: {
        title: { zh: '其他状况', en: 'Others' },
        items: [
            { name: { zh: '突发状况', en: 'Incidents' }, issues: [{zh:'物件找不到', en:'Item missing'}, {zh:'物件破碎', en:'Item shattered'}, {zh:'发现老鼠', en:'Found mouse/rat'}, {zh:'发现大面积污渍', en:'Large stain/Sticky floor'}, {zh:'发现蚂蚁', en:'Found ants'}] },
            { name: { zh: '物料短缺', en: 'Shortages' }, issues: [{zh:'原料不足(已检查库存)', en:'Ingredients short (Checked stock)'}, {zh:'茶桶不足', en:'Tea buckets short'}, {zh:'盒子不足', en:'Containers short'}] }
        ]
    }
};

// ============================================================================
// 新增组件: 员工端 - 报修提交页面 (中英双语支持)
// ============================================================================
function RepairReportView({ onCancel, onSubmit, currentUser, myStoreId, recipes, lang, customDb }: any) {
    const [step, setStep] = useState(1);
    const [selectedCat, setSelectedCat] = useState('');
    const [selectedItemIdx, setSelectedItemIdx] = useState(-1);
    const [selectedProduct, setSelectedProduct] = useState('');
    const [issues, setIssues] = useState<any[]>([]);
    const [notes, setNotes] = useState('');

    const dbToUse = customDb || REPAIR_DATABASE;
    const activeCatData = selectedCat ? dbToUse[selectedCat] : null;
    const activeItemData = activeCatData && selectedItemIdx >= 0 ? activeCatData.items[selectedItemIdx] : null;
    const itemOptions = activeItemData?.issues || [];

    const handleIssueToggle = (issue: any) => { 
        setIssues(prev => prev.some(i => i.en === issue.en) ? prev.filter(i => i.en !== issue.en) : [...prev, issue]); 
    };

    const handleSubmit = () => {
        if (issues.length === 0 && !notes) return alert(lang === 'zh' ? "请至少勾选一个问题或填写备注。" : "Please select at least one issue or add a note.");
        
        // 自动拼装双语，方便跨国店长查阅
        const itemNameZh = activeItemData.name.zh;
        const itemNameEn = activeItemData.name.en;
        const finalItemNameZh = selectedCat === 'recipes' ? `${itemNameZh} - ${selectedProduct}` : itemNameZh;
        const finalItemNameEn = selectedCat === 'recipes' ? `${itemNameEn} - ${selectedProduct}` : itemNameEn;

        onSubmit({
            id: `repair_${Date.now()}`, 
            storeId: myStoreId, 
            date: new Date().toISOString(), 
            submittedBy: currentUser.name, 
            userId: currentUser.id,
            category: `${activeCatData.title.en} | ${activeCatData.title.zh}`, 
            item: `${finalItemNameEn} | ${finalItemNameZh}`, 
            issues: issues.map(i => `${i.en} | ${i.zh}`), 
            notes: notes, 
            status: 'pending'
        });
    };

    return (
        <div className="flex flex-col h-full bg-secondary pb-20 animate-fade-in-up text-text">
            <div className="bg-white p-4 border-b sticky top-0 z-10 shadow-sm flex items-center gap-3">
                <button onClick={onCancel} className="p-2 -ml-2 rounded-full hover:bg-gray-100"><Icon name="ArrowLeft" /></button>
                <h2 className="text-xl font-black text-orange-500 flex items-center gap-2">
                    <Icon name="AlertTriangle" size={20} /> {lang === 'zh' ? '提报异常工单' : 'Submit Ticket'}
                </h2>
            </div>
            
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
                {step === 1 && (
                    <div className="space-y-3 animate-fade-in">
                        <h3 className="font-bold text-gray-500 text-sm mb-2">{lang === 'zh' ? '1. 选择大类' : '1. Select Category'}</h3>
                        {Object.entries(dbToUse).map(([key, data]) => (
                            <button key={key} onClick={() => { setSelectedCat(key); setStep(2); }} className="w-full bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-left font-bold text-gray-800 active:scale-95 flex justify-between items-center">
                                {data.title[lang]} <Icon name="ChevronRight" className="text-gray-400"/>
                            </button>
                        ))}
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-3 animate-fade-in">
                        <div className="flex items-center gap-2 mb-4"><button onClick={() => setStep(1)} className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded">← {lang === 'zh' ? '返回' : 'Back'}</button><span className="text-sm font-bold text-gray-500">{activeCatData?.title[lang]}</span></div>
                        <h3 className="font-bold text-gray-500 text-sm mb-2">{lang === 'zh' ? '2. 选择具体项目' : '2. Select Item'}</h3>
                        {activeCatData?.items.map((item:any, idx:number) => (
                            <button key={idx} onClick={() => { setSelectedItemIdx(idx); setStep(3); }} className="w-full bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-left font-bold text-gray-800 active:scale-95 flex justify-between items-center">
                                {item.name[lang]} <Icon name="ChevronRight" className="text-gray-400"/>
                            </button>
                        ))}
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4 animate-fade-in">
                         <div className="flex items-center gap-2 mb-2"><button onClick={() => setStep(2)} className="text-xs font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded">← {lang === 'zh' ? '返回' : 'Back'}</button><span className="text-sm font-bold text-gray-500">{activeItemData?.name[lang]}</span></div>
                         
                         {selectedCat === 'recipes' && (
                             <div className="bg-white p-3 rounded-xl border border-orange-200">
                                 <label className="text-xs font-bold text-orange-600 mb-2 block">{lang === 'zh' ? '具体产品' : 'Which Product?'}</label>
                                 <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} className="w-full bg-gray-50 border border-gray-200 p-2 rounded-lg text-sm outline-none focus:border-orange-400">
                                     <option value="">-- {lang === 'zh' ? '请选择' : 'Please select'} --</option>
                                     {(recipes || []).map((r:any) => <option key={r.id} value={r.name.en || r.name.zh}>{r.name[lang] || r.name.zh}</option>)}
                                 </select>
                             </div>
                         )}

                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <h3 className="font-bold text-gray-800 text-sm mb-3">{lang === 'zh' ? '3. 勾选具体问题' : '3. What\'s wrong?'}</h3>
                            <div className="space-y-2">
                                {itemOptions.map((issue: any, idx: number) => {
                                    const isChecked = issues.some(i => i.en === issue.en);
                                    return (
                                        <label key={idx} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${isChecked ? 'bg-orange-50 border-orange-300' : 'bg-gray-50 border-transparent hover:bg-gray-100'}`}>
                                            <input type="checkbox" checked={isChecked} onChange={() => handleIssueToggle(issue)} className="mt-1 w-4 h-4 text-orange-500 rounded focus:ring-orange-500" />
                                            <span className={`text-sm ${isChecked ? 'text-orange-900 font-bold' : 'text-gray-700'}`}>{issue[lang]}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <h3 className="font-bold text-gray-800 text-sm mb-2">{lang === 'zh' ? '补充备注' : 'Remarks (Optional)'}</h3>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={lang === 'zh' ? '管路编号、损坏程度、或其它说明...' : 'Tube number, damage details, or other notes...'} className="w-full bg-gray-50 border border-gray-200 p-3 rounded-lg text-sm outline-none focus:border-orange-400 min-h-[80px] resize-none" />
                        </div>

                        <button onClick={handleSubmit} disabled={selectedCat === 'recipes' && !selectedProduct} className="w-full bg-orange-500 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                            <Icon name="Send" size={20} /> {lang === 'zh' ? '提交工单' : 'Submit Ticket'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// 新增组件: 员工端 - SOP与培训模块 (Training View) [适配 0413 高级编辑器]
// ============================================================================
function TrainingView({ lang, sopList, trainingLevels, onCancel }: any) {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const safeSops = Array.isArray(sopList) ? sopList : [];
    const safeTraining = Array.isArray(trainingLevels) ? trainingLevels : [];
    const combinedData = [...safeSops, ...safeTraining];

    // 💡 提取标题
    const getTitle = (item: any) => {
        if (!item) return 'Untitled';
        if (typeof item.title === 'string') return item.title;
        if (typeof item.name === 'string') return item.name;
        if (item.title?.zh || item.title?.en) return item.title[lang] || item.title.zh || item.title.en;
        if (item.name?.zh || item.name?.en) return item.name[lang] || item.name.zh || item.name.en;
        return 'Untitled';
    };

    // 💡 全能 YouTube 解析器 (自动适配链接里的参数)
    const renderVideo = (url: string) => {
        if (!url) return null;
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
            const match = url.match(regExp);
            const yId = (match && match[2].length === 11) ? match[2] : null;
            return yId ? (
                <iframe 
                    className="w-full aspect-video rounded-xl mt-4 shadow-md border border-gray-100" 
                    src={`https://www.youtube.com/embed/${yId}`} 
                    title="Training Video" 
                    allowFullScreen>
                </iframe>
            ) : null;
        }
        return (<video src={url} controls playsInline preload="metadata" className="w-full aspect-video rounded-xl mt-4 shadow-md bg-black object-contain" />);
    };

    // 💡 核心修复：完美解析 0413 编辑器的“多段落”富文本数据
    const renderAdvancedContent = (item: any) => {
        // 1. 渲染 Description
        let desc = item.description || item.desc || '';
        if (typeof desc === 'object') desc = desc[lang] || desc.zh || desc.en || '';

        // 2. 渲染 Content Sections
        let sectionsOutput = null;
        const content = item.content;

        if (Array.isArray(content)) {
            // ✅ 解析后台编辑器的 CONTENT SECTIONS
            sectionsOutput = (
                <div className="space-y-3 mt-3">
                    {content.map((sec: any, idx: number) => {
                        const t = sec.title?.[lang] || sec.title?.zh || sec.title?.en || '';
                        const b = sec.body?.[lang] || sec.body?.zh || sec.body?.en || '';
                        // 如果标题和内容都是空的，就不渲染这块
                        if (!t && !b) return null; 
                        return (
                            <div key={idx} className="bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                                {t && <h4 className="font-bold text-blue-800 text-sm mb-1.5">{t}</h4>}
                                {b && <p className="text-gray-700 text-xs whitespace-pre-line leading-relaxed">{b}</p>}
                            </div>
                        );
                    })}
                </div>
            );
        } else if (typeof content === 'string') {
            // 兼容老数据：纯字符串
            sectionsOutput = <p className="text-gray-600 text-sm whitespace-pre-line mt-2">{content}</p>;
        } else if (content && typeof content === 'object') {
            // 兼容老数据：双语对象
            const text = content[lang] || content.zh || content.en || content.body;
            if (text) sectionsOutput = <p className="text-gray-600 text-sm whitespace-pre-line mt-2">{text}</p>;
        }

        return (
            <div className="mt-4 pt-3 border-t border-gray-100 animate-fade-in" onClick={e => e.stopPropagation()}>
                {/* 描述信息 */}
                {desc && <p className="text-gray-500 text-sm italic font-medium">{desc}</p>}
                
                {/* 分段内容 */}
                {sectionsOutput}
                
                {/* 教学视频 (兼容不同的字段名) */}
                {(item.videoUrl || item.youtubeLink || item.mediaUrl) && renderVideo(item.videoUrl || item.youtubeLink || item.mediaUrl)}
            </div>
        );
    };

    // 过滤搜索
    const filteredItems = combinedData.filter((item: any) => {
        const title = getTitle(item).toLowerCase();
        const query = searchQuery.toLowerCase();
        return title.includes(query);
    });

    return (
        <div className="flex flex-col h-full bg-secondary pb-20 animate-fade-in-up text-text">
            <div className="p-4 sticky top-0 bg-secondary z-10 shadow-sm border-b border-gray-100">
                <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-2xl font-black text-blue-600 flex items-center gap-2">
                        <Icon name="Award" size={24} /> {lang === 'zh' ? '培训与 SOP' : 'Training & SOPs'}
                    </h2>
                </div>
                <div className="relative">
                    <Icon name="Search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                    <input 
                        value={searchQuery} 
                        onChange={e => setSearchQuery(e.target.value)} 
                        placeholder={lang === 'zh' ? '搜索 SOP 或培训内容...' : 'Search training...'} 
                        className="w-full bg-white border border-gray-200 rounded-xl p-3 pl-10 text-sm outline-none focus:border-blue-400 shadow-sm" 
                    />
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="bg-blue-50 text-blue-600 p-3 rounded-lg text-xs font-bold border border-blue-100 mb-2">
                    {lang === 'zh' ? '💡 点击卡片展开查看详细步骤和教学视频。' : '💡 Tap a card to view details and tutorial videos.'}
                </div>

                {filteredItems.map((item: any, index: number) => {
                    const itemId = item.id || `train_${index}`;
                    return (
                        <div key={itemId} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 cursor-pointer transition-all active:scale-[0.98]" onClick={() => setExpandedId(expandedId === itemId ? null : itemId)}>
                            <div className="flex justify-between items-center">
                                <div className="flex-1 pr-4">
                                    <h3 className="font-bold text-gray-800 text-base">{getTitle(item)}</h3>
                                    <p className="text-[10px] font-bold text-blue-500 bg-blue-50 inline-block px-2 py-0.5 rounded mt-1">{item.category || 'General'}</p>
                                </div>
                                <div className={`p-2 rounded-full transition-colors ${expandedId === itemId ? 'bg-blue-100 text-blue-600' : 'bg-gray-50 text-gray-400'}`}>
                                    <Icon name={expandedId === itemId ? "ChevronUp" : "ChevronRight"} size={16} />
                                </div>
                            </div>
                            
                            {/* 展开后，调用高级排版器 */}
                            {expandedId === itemId && renderAdvancedContent(item)}
                        </div>
                    );
                })}

                {filteredItems.length === 0 && (
                    <div className="text-center py-10 opacity-50">
                        <Icon name="Inbox" size={40} className="mx-auto mb-2 text-gray-400" />
                        <p className="text-sm font-bold text-gray-500">{lang === 'zh' ? '暂无相关培训内容。' : 'No content found.'}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
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
        // 💡 新增：SOP 培训模块的渲染
        if (view === 'training' as any && activeFeatures.training) {
            return (
                <TrainingView 
                    lang={lang} 
                    sopList={sopList} 
                    onCancel={() => setView('home')} 
                />
            );
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
// 组件: 全局员工管理 (Staff Management) - [新增门店动态分配与云同步]
// ============================================================================
function StaffManagementView({ data }: any) {
    const { users, stores, setStores } = data;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState<any>({});
    const [selectedStores, setSelectedStores] = useState<string[]>([]);

    // 打开编辑弹窗
    const openModal = (user?: any) => {
        if (user) {
            setFormData({ ...user });
            // 自动找出该员工目前被分配到了哪些门店
            setSelectedStores(stores.filter((s:any) => s.staff?.includes(user.id)).map((s:any) => s.id));
        } else {
            // 新建员工
            setFormData({ id: `u_${Date.now()}`, name: '', role: 'staff', pin: '', active: true });
            setSelectedStores([]);
        }
        setIsModalOpen(true);
    };

    // 保存并同步到云端
    const handleSave = async () => {
        if (!formData.name) return alert("Please enter a name.");
        if (!formData.id) return alert("Login ID / PIN is required.");
        
        // 1. 保存员工信息到云端
        try {
            // @ts-ignore
            if (typeof Cloud !== 'undefined' && Cloud.saveUser) await Cloud.saveUser(formData);
        } catch (e) { console.error("Error saving user:", e); }

        // 2. 动态更新门店的 Staff 列表
        const newStores = stores.map((s:any) => {
            const currentStaff = s.staff || [];
            const shouldHave = selectedStores.includes(s.id);
            const hasUser = currentStaff.includes(formData.id);
            
            if (shouldHave && !hasUser) return { ...s, staff: [...currentStaff, formData.id] };
            if (!shouldHave && hasUser) return { ...s, staff: currentStaff.filter((id:string) => id !== formData.id) };
            return s;
        });
        
        // 更新本地状态并推送到云端
        setStores(newStores);
        // @ts-ignore
        if (typeof Cloud !== 'undefined' && Cloud.updateStores) await Cloud.updateStores(newStores);
        
        setIsModalOpen(false);
    };

    // 勾选/取消勾选门店
    const toggleStore = (storeId: string) => {
        setSelectedStores(prev => prev.includes(storeId) ? prev.filter(id => id !== storeId) : [...prev, storeId]);
    };

    return (
        <div className="p-4 space-y-4 animate-fade-in">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">Global Staff List</h3>
                <button onClick={() => openModal()} className="bg-dark-accent text-dark-bg px-4 py-2 rounded-lg text-xs font-bold shadow-lg hover:opacity-90 transition-all">+ Add New Staff</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {users.map((u: any) => (
                    <div key={u.id} className={`bg-dark-surface p-4 rounded-xl border ${u.active===false ? 'border-red-500/30 opacity-60' : 'border-white/10'} shadow-sm relative overflow-hidden`}>
                        {u.active === false && <div className="absolute top-0 right-0 bg-red-500/20 text-red-400 text-[9px] px-2 py-0.5 font-bold rounded-bl-lg">INACTIVE</div>}
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h4 className="font-bold text-white text-base flex items-center gap-2">{u.name}</h4>
                                <span className="text-[10px] bg-white/10 text-dark-text-light px-2 py-0.5 rounded uppercase mt-1 inline-block font-bold">{u.role}</span>
                            </div>
                            <button onClick={() => openModal(u)} className="p-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors"><Icon name="Edit" size={14}/></button>
                        </div>
                        <div className="mt-3 pt-3 border-t border-white/5">
                            <p className="text-[10px] text-dark-text-light mb-1 font-bold uppercase">Assigned Branches:</p>
                            <div className="flex flex-wrap gap-1">
                                {stores.filter((s:any) => s.staff?.includes(u.id)).map((s:any) => (
                                    <span key={s.id} className="text-[10px] bg-dark-bg text-gray-300 border border-white/10 px-1.5 py-0.5 rounded font-bold">{s.name}</span>
                                ))}
                                {stores.filter((s:any) => s.staff?.includes(u.id)).length === 0 && <span className="text-[9px] text-red-400 italic">No branch assigned</span>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 animate-fade-in">
                    <div className="bg-dark-surface p-6 rounded-2xl border border-white/10 w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
                        <h3 className="text-lg font-bold text-white mb-4">{formData.id?.startsWith('u_') && !formData.name ? 'Add New Staff' : 'Edit Staff Profile'}</h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-dark-text-light uppercase mb-1 block">Full Name</label>
                                <input value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} className="w-full bg-dark-bg border border-white/20 p-3 rounded-lg text-white outline-none focus:border-dark-accent" placeholder="e.g. John Doe" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-dark-text-light uppercase mb-1 block">Login ID / PIN</label>
                                    <input value={formData.id} onChange={e=>setFormData({...formData, id: e.target.value})} disabled={formData.id === 'u_owner' || formData.id === 'u_lambert'} className="w-full bg-dark-bg border border-white/20 p-3 rounded-lg text-white outline-none disabled:opacity-50 font-mono" placeholder="PIN code" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-dark-text-light uppercase mb-1 block">Role</label>
                                    <select value={formData.role} onChange={e=>setFormData({...formData, role: e.target.value})} disabled={formData.role === 'boss'} className="w-full bg-dark-bg border border-white/20 p-3 rounded-lg text-white outline-none disabled:opacity-50">
                                        <option value="staff">Staff</option>
                                        <option value="manager">Manager</option>
                                        <option value="boss">Boss</option>
                                    </select>
                                </div>
                            </div>
                            
                            {/* 💡 动态门店分配区域 */}
                            <div className="bg-dark-bg p-4 rounded-xl border border-white/5 shadow-inner">
                                <label className="text-xs font-black text-dark-accent uppercase mb-3 flex items-center gap-2">
                                    <Icon name="Store" size={14}/> Branch Assignment
                                </label>
                                <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                    {stores.map((store: any) => (
                                        <label key={store.id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${selectedStores.includes(store.id) ? 'bg-dark-accent/10 border-dark-accent/50 text-white shadow-sm' : 'bg-dark-surface border-white/5 text-gray-400 hover:border-white/20'}`}>
                                            <span className="text-sm font-bold truncate pr-2">{store.name}</span>
                                            <input type="checkbox" checked={selectedStores.includes(store.id)} onChange={() => toggleStore(store.id)} className="w-4 h-4 accent-dark-accent shrink-0" />
                                        </label>
                                    ))}
                                    {stores.length === 0 && <p className="text-xs text-gray-500 italic">No branches available.</p>}
                                </div>
                            </div>

                            <label className="flex items-center gap-2 p-3 bg-red-500/5 rounded-lg border border-red-500/10 cursor-pointer hover:bg-red-500/10 transition-colors mt-2">
                                <input type="checkbox" checked={formData.active !== false} onChange={e=>setFormData({...formData, active: e.target.checked})} className="w-4 h-4 accent-red-500" />
                                <span className="text-sm font-bold text-red-400">Account Active (Can Login)</span>
                            </label>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-white/10 text-white rounded-xl font-bold hover:bg-white/20 transition-all">Cancel</button>
                            <button onClick={handleSave} className="flex-1 py-3 bg-dark-accent text-dark-bg rounded-xl font-black shadow-lg hover:opacity-90 transition-all active:scale-95">Save Profile</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================================
// 组件 1: Prep Inventory (前台补料 & 后台管理 - 自带一键恢复数据功能)
// ============================================================================
const InventoryView = ({ lang, t, inventoryList, onUpdateInventoryList, isOwner, onSubmit, currentUser, isForced, onCancel, forcedShift }: any) => {
    const todayObj = new Date();
    const todayIndex = todayObj.getDay(); 
    let dayGroup: 'mon_thu' | 'fri' | 'sat' | 'sun' = 'mon_thu';
    if (todayIndex === 5) dayGroup = 'fri';
    if (todayIndex === 6) dayGroup = 'sat';
    if (todayIndex === 0) dayGroup = 'sun';

    const isAmNeeded = (todayIndex === 5 || todayIndex === 6);
    const initialShift = (isAmNeeded && todayObj.getHours() < 16) ? 'morning' : 'evening';

    const [viewShift, setViewShift] = useState<'morning' | 'evening'>(initialShift);

    const [editTargets, setEditTargets] = useState(false);
    
    // 初始化直接读取传入的列表
    const [localList, setLocalList] = useState<any[]>(inventoryList ? JSON.parse(JSON.stringify(inventoryList)) : []);
    
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [newItemData, setNewItemData] = useState({ nameZH: '', nameEN: '', unit: 'L', category: 'premix' });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 监听云端数据变化
    useEffect(() => {
        if (!editTargets) {
            setLocalList(JSON.parse(JSON.stringify(inventoryList || [])));
        }
    }, [inventoryList, editTargets]);

    const [inputData, setInputData] = useState<Record<string, { end: string, isChecked?: boolean }>>({});
    const [fridgeChecked, setFridgeChecked] = useState(false);

    const draftKey = `onesip_prep_draft_${currentUser?.id}_${dayGroup}_${viewShift}`;

    useEffect(() => {
        if (isOwner) return;
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
    }, [draftKey, isOwner, viewShift]);

    useEffect(() => {
        if (isOwner) return;
        localStorage.setItem(draftKey, JSON.stringify({ inputData, fridgeChecked }));
    }, [inputData, fridgeChecked, draftKey, isOwner]);

    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';

    const handleCheck = (id: string, target: number) => {
        setInputData(prev => {
            const currentlyChecked = prev[id]?.isChecked;
            return { ...prev, [id]: { ...prev[id], isChecked: !currentlyChecked, end: !currentlyChecked ? String(target) : '' } };
        });
    };

    const handleAmountChange = (id: string, target: number, val: string) => {
        setInputData(prev => ({ ...prev, [id]: { ...prev[id], end: val, isChecked: parseFloat(val) === target } }));
    };

    const handleTargetChange = (id: string, group: string, shift: string, val: string) => {
        setLocalList(prev => prev.map(item => {
            if (item.id === id) {
                const newTargets = item.dailyTargets ? JSON.parse(JSON.stringify(item.dailyTargets)) : { mon_thu: {morning:0, evening:0}, fri: {morning:0, evening:0}, sat: {morning:0, evening:0}, sun: {morning:0, evening:0} };
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
            return [ item.name.zh, item.name.en, item.unit, item.category, safe(t.mon_thu?.morning), safe(t.mon_thu?.evening), safe(t.fri?.morning), safe(t.fri?.evening), safe(t.sat?.morning), safe(t.sat?.evening), safe(t.sun?.morning), safe(t.sun?.evening) ].join(',');
        }).join('\n');
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, headers + rows], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.setAttribute("download", "prep_targets_template.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const handleFileUpload = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        const readFile = (f: File, encoding: string): Promise<string> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (evt) => resolve(evt.target?.result as string); reader.onerror = reject; reader.readAsText(f, encoding); });
        try {
            let csvText = await readFile(file, 'UTF-8');
            if (csvText.includes('\uFFFD') || (!csvText.includes("Name(ZH)") && !csvText.includes("Category"))) csvText = await readFile(file, 'GBK');
            if (!csvText) { alert("File is empty!"); return; }
            const lines = csvText.split(/\r?\n/);
            const newItems = [...localList];
            let updatedCount = 0; let createdCount = 0;
            lines.slice(1).forEach((line) => {
                if (!line.trim()) return;
                let cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                if (cols.length < 4) return;
                const [zh, en, unit, cat, mt_am, mt_pm, f_am, f_pm, s_am, s_pm, su_am, su_pm] = cols;
                if (!zh || zh.includes('Name(ZH)')) return; 
                let itemIndex = newItems.findIndex(i => i.name.zh === zh);
                const targets = { mon_thu: { morning: parseFloat(mt_am)||0, evening: parseFloat(mt_pm)||0 }, fri: { morning: parseFloat(f_am)||0, evening: parseFloat(f_pm)||0 }, sat: { morning: parseFloat(s_am)||0, evening: parseFloat(s_pm)||0 }, sun: { morning: parseFloat(su_am)||0, evening: parseFloat(su_pm)||0 } };
                if (itemIndex >= 0) { newItems[itemIndex] = { ...newItems[itemIndex], dailyTargets: targets, unit: unit || newItems[itemIndex].unit, category: cat || newItems[itemIndex].category }; updatedCount++; } 
                else { newItems.push({ id: `p_imp_${Date.now()}_${Math.floor(Math.random()*1000)}`, name: { zh: zh, en: en || zh }, unit: unit || 'L', category: cat || 'other', defaultVal: '0', hidden: false, dailyTargets: targets }); createdCount++; }
            });
            setLocalList(newItems);
            if (onUpdateInventoryList) onUpdateInventoryList(newItems);
            alert(`✅ Import Success!\nUpdated: ${updatedCount}\nCreated: ${createdCount}`);
        } catch (err) { console.error(err); alert("Error reading file."); } finally { if (fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const handleAddItem = () => {
        if (!newItemData.nameZH || !newItemData.nameEN) return alert("Please enter names.");
        const newItem: any = { id: `p_new_${Date.now()}`, name: { zh: newItemData.nameZH, en: newItemData.nameEN }, unit: newItemData.unit, category: newItemData.category, defaultVal: '0', hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 0 }, fri: { morning: 0, evening: 0 }, sat: { morning: 0, evening: 0 }, sun: { morning: 0, evening: 0 } } };
        const newList = [...localList, newItem];
        setLocalList(newList);
        if (onUpdateInventoryList) onUpdateInventoryList(newList);
        setIsAddingItem(false); setNewItemData({ nameZH: '', nameEN: '', unit: 'L', category: 'premix' });
        alert("Item Added!");
    };

    const saveTargets = () => {
        if (onUpdateInventoryList) onUpdateInventoryList(localList);
        alert("✅ Changes saved successfully!");
        setEditTargets(false);
    };

    // --- 一键恢复您图表里的初始数据 ---
    const restoreDefaultData = () => {
        const defaultItems = [
            { id: `p_${Date.now()}_1`, name: { zh: "奶精", en: "Creamer" }, unit: "L", category: "tea base", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 10 }, fri: { morning: 10, evening: 20 }, sat: { morning: 0, evening: 12.5 }, sun: { morning: 0, evening: 10 } } },
            { id: `p_${Date.now()}_2`, name: { zh: "茉莉绿茶", en: "Jasmine Tea" }, unit: "L", category: "tea base", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 15 }, fri: { morning: 20, evening: 20 }, sat: { morning: 12, evening: 16 }, sun: { morning: 0, evening: 15 } } },
            { id: `p_${Date.now()}_3`, name: { zh: "红茶", en: "Black Tea" }, unit: "L", category: "tea base", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 12 }, fri: { morning: 0, evening: 16 }, sat: { morning: 4, evening: 12 }, sun: { morning: 0, evening: 12 } } },
            { id: `p_${Date.now()}_4`, name: { zh: "桂花乌龙", en: "Osmanthus Tea" }, unit: "L", category: "tea base", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 8 }, fri: { morning: 0, evening: 10 }, sat: { morning: 4, evening: 8 }, sun: { morning: 0, evening: 8 } } },
            { id: `p_${Date.now()}_5`, name: { zh: "山茶花乌龙", en: "Camellia Tea" }, unit: "L", category: "tea base", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 6 }, fri: { morning: 4, evening: 8 }, sat: { morning: 0, evening: 6 }, sun: { morning: 0, evening: 6 } } },
            { id: `p_${Date.now()}_6`, name: { zh: "芝士奶盖", en: "Cheese Foam" }, unit: "bucket", category: "foam toppings", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 1.5 }, fri: { morning: 1, evening: 2 }, sat: { morning: 0, evening: 1.5 }, sun: { morning: 0, evening: 1.5 } } },
            { id: `p_${Date.now()}_7`, name: { zh: "抹茶云顶", en: "Matcha Cloud" }, unit: "bucket", category: "foam toppings", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 1 }, fri: { morning: 0, evening: 1 }, sat: { morning: 0, evening: 1 }, sun: { morning: 0, evening: 1 } } },
            { id: `p_${Date.now()}_8`, name: { zh: "芋泥奶盖", en: "Taro Foam" }, unit: "bucket", category: "foam toppings", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 1 }, fri: { morning: 1, evening: 1 }, sat: { morning: 1, evening: 1 }, sun: { morning: 0, evening: 1 } } },
            { id: `p_${Date.now()}_9`, name: { zh: "火龙果预拌液", en: "Dragon Fruit" }, unit: "L", category: "premix", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 3 }, fri: { morning: 3, evening: 6 }, sat: { morning: 0, evening: 3 }, sun: { morning: 0, evening: 3 } } },
            { id: `p_${Date.now()}_10`, name: { zh: "香芋预拌液", en: "Taro" }, unit: "L", category: "premix", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 3 }, fri: { morning: 3, evening: 6 }, sat: { morning: 0, evening: 3 }, sun: { morning: 0, evening: 3 } } },
            { id: `p_${Date.now()}_11`, name: { zh: "泰奶预拌液", en: "Thai" }, unit: "L", category: "premix", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 3 }, fri: { morning: 3, evening: 6 }, sat: { morning: 0, evening: 3 }, sun: { morning: 0, evening: 3 } } },
            { id: `p_${Date.now()}_12`, name: { zh: "椰子预拌液", en: "Coconut" }, unit: "L", category: "premix", hidden: false, dailyTargets: { mon_thu: { morning: 0, evening: 3 }, fri: { morning: 3, evening: 6 }, sat: { morning: 0, evening: 3 }, sun: { morning: 0, evening: 3 } } }
        ];
        setLocalList(defaultItems);
        if (onUpdateInventoryList) onUpdateInventoryList(defaultItems);
        alert("✅ Data restored successfully! 数据已完美恢复！");
    };

    const handleStaffSubmit = () => {
        const visibleItems = inventoryList.filter((item: any) => !item.hidden);
        const incompleteItem = visibleItems.find((item: any) => {
            const target = item.dailyTargets?.[dayGroup]?.[viewShift] || 0;
            if (target === 0) return false;
            const val = inputData[item.id]?.end;
            return val === undefined || val === '' || val === null;
        });

        if (incompleteItem) return alert(lang === 'zh' ? `⚠️ 信息缺失！\n请确认或填写以下物品的补加量: ${getLoc(incompleteItem.name)}` : `⚠️ Missing Input!\nPlease verify or enter the added amount for: ${getLoc(incompleteItem.name)}`);
        if (!fridgeChecked) return alert(lang === 'zh' ? "⚠️ 必须进行安全检查！\n请检查冰箱温度 (< 6°C) 并勾选确认框。" : "⚠️ Safety Check Required!\nPlease check the fridge temperature (< 6°C) and tick the box.");

        onSubmit({ submittedBy: currentUser?.name, userId: currentUser?.id, data: inputData, shift: viewShift, dayGroup: dayGroup, date: new Date().toISOString(), fridgeChecked: fridgeChecked });
        localStorage.removeItem(draftKey);
        setInputData({});
        setFridgeChecked(false);
    };

    if (isOwner) {
        return (
            <div className="flex flex-col h-full bg-dark-bg text-dark-text animate-fade-in">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".csv" className="hidden" />
                <div className="p-4 bg-dark-surface border-b border-white/10 sticky top-0 z-10 shadow-md flex justify-between items-center">
                    <div><h2 className="text-xl font-black text-white flex items-center gap-2"><Icon name="Coffee" className="text-orange-400"/> Manage Prep Targets</h2></div>
                    <div className="flex gap-2">
                        {editTargets ? (
                            <><button onClick={() => setEditTargets(false)} className="bg-white/10 text-white px-3 py-2 rounded-lg text-xs font-bold">Cancel</button><button onClick={saveTargets} className="bg-green-600 text-white px-3 py-2 rounded-lg text-xs font-bold">Save All</button></>
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
                                    {editTargets && <button onClick={() => toggleHidden(item.id)} className={`p-1.5 rounded-lg transition-colors ${item.hidden ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}><Icon name={item.hidden ? "EyeOff" : "Eye"} size={16} /></button>}
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
                                        return editTargets ? <input key={group} type="number" className="w-full bg-dark-bg border border-white/20 rounded p-2 text-center text-white text-sm font-bold focus:border-blue-500 outline-none" value={val} onChange={e => handleTargetChange(item.id, group, shift, e.target.value)} /> : <div key={group} className="bg-white/5 rounded p-2 text-white text-sm font-mono text-center border border-white/5">{val}</div>;
                                    })}
                                </div>
                            ))}
                        </div>
                    ))}
                    
                    {/* 一键恢复按钮 */}
                    {localList.length === 0 && (
                        <div className="text-center py-16 px-4">
                            <Icon name="Database" size={40} className="mx-auto mb-4 text-dark-text-light opacity-50" />
                            <p className="text-dark-text mb-2 font-bold">No prep targets configured for this branch.</p>
                            <p className="text-sm text-dark-text-light mb-6">当前分店还没有配置补料目标哦</p>
                            <button 
                                onClick={restoreDefaultData} 
                                className="mx-auto bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2 shadow-lg transition-transform active:scale-95"
                            >
                                <Icon name="RotateCcw" size={18} />
                                Restore Default Data (一键恢复数据)
                            </button>
                        </div>
                    )}
                </div>
                {isAddingItem && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
                        <div className="bg-dark-surface p-6 rounded-2xl border border-white/10 max-w-sm w-full shadow-2xl space-y-4">
                            <h3 className="text-lg font-bold text-white">Add New Prep Item</h3>
                            <div><label className="text-xs text-gray-400">Name (ZH)</label><input className="w-full bg-dark-bg border border-white/20 rounded p-2 text-white" value={newItemData.nameZH} onChange={e => setNewItemData({...newItemData, nameZH: e.target.value})} /></div>
                            <div><label className="text-xs text-gray-400">Name (EN)</label><input className="w-full bg-dark-bg border border-white/20 rounded p-2 text-white" value={newItemData.nameEN} onChange={e => setNewItemData({...newItemData, nameEN: e.target.value})} /></div>
                            <div className="flex gap-2">
                                <div className="flex-1"><label className="text-xs text-gray-400">Unit</label><select className="w-full bg-dark-bg border border-white/20 rounded p-2 text-white" value={newItemData.unit} onChange={e => setNewItemData({...newItemData, unit: e.target.value})}><option value="L">L</option><option value="ml">ml</option><option value="g">g</option><option value="kg">kg</option><option value="pcs">pcs</option><option value="box">box</option></select></div>
                                <div className="flex-1"><label className="text-xs text-gray-400">Category</label><select className="w-full bg-dark-bg border border-white/20 rounded p-2 text-white" value={newItemData.category} onChange={e => setNewItemData({...newItemData, category: e.target.value})}><option value="premix">Premix</option><option value="dairy">Dairy</option><option value="topping">Topping</option><option value="fruit">Fruit</option><option value="other">Other</option></select></div>
                            </div>
                            <div className="flex gap-2 mt-4"><button onClick={() => setIsAddingItem(false)} className="flex-1 py-3 rounded-xl bg-white/10 text-white font-bold">Cancel</button><button onClick={handleAddItem} className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-bold">Add Item</button></div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-secondary pb-20 animate-fade-in-up text-text">
            <div className="bg-white p-4 border-b sticky top-0 z-10 shadow-sm">
                 <div className="flex justify-between items-center mb-2">
                    <h2 className="text-xl font-black flex items-center gap-2">
                        {viewShift === 'morning' ? <span className="text-orange-500">{lang === 'zh' ? '☀️ 早班补货 (AM)' : '☀️ Morning Refill (AM)'}</span> : <span className="text-indigo-500">{lang === 'zh' ? '🌙 晚班盘点 (PM)' : '🌙 Evening Prep (PM)'}</span>}
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
                {localList.filter((item: any) => !item.hidden).map((item: any) => {
                    const target = item.dailyTargets?.[dayGroup]?.[viewShift] || 0;
                    if (target === 0) return null;
                    return (
                        <div key={item.id} className="bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-3">
                            <div className="flex justify-between items-center border-b pb-2 border-gray-100">
                                <div className="font-bold text-lg text-gray-800">{getLoc(item.name)}</div>
                                <div className={`text-xs font-bold px-3 py-1 rounded-full border ${viewShift === 'morning' ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-primary bg-indigo-50 border-indigo-100'}`}>{lang === 'zh' ? '目标:' : 'Target:'} <span className="text-lg">{target}</span> {item.unit}</div>
                            </div>
                            <div className="flex gap-3 items-center bg-gray-50 p-2 rounded-xl border border-gray-100">
                                <button onClick={() => handleCheck(item.id, target)} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-all ${inputData[item.id]?.isChecked ? 'bg-green-500 border-green-500 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}><Icon name="CheckCircle2" size={20} /><span className="font-bold text-sm">{lang === 'zh' ? `补足了 ${target}` : `Filled ${target}`}</span></button>
                                <div className="w-[120px] flex flex-col border-l border-gray-200 pl-3">
                                    <label className="text-[9px] font-bold text-gray-400 mb-1 uppercase text-center">{lang === 'zh' ? '实际补加量' : 'Actual Added'}</label>
                                    <input type="number" className="w-full p-2 rounded-lg border border-gray-300 text-center text-lg font-bold focus:bg-white focus:border-primary transition-colors outline-none" placeholder={String(target)} value={inputData[item.id]?.end ?? ''} onChange={(e) => handleAmountChange(item.id, target, e.target.value)} />
                                </div>
                            </div>
                        </div>
                    );
                })}
                {localList.length === 0 && <p className="text-center text-gray-400 py-10 text-sm">No items configured for this branch.</p>}
            </div>
            
            <div className="p-4 bg-white border-t sticky bottom-0 z-20 space-y-3 shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 flex items-center gap-3 cursor-pointer" onClick={() => setFridgeChecked(!fridgeChecked)}>
                    <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${fridgeChecked ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-blue-300'}`}>{fridgeChecked && <Icon name="Check" size={16} />}</div>
                    <div className="flex-1"><p className="font-bold text-blue-900 text-sm">{lang === 'zh' ? '检查冰箱温度 < 6°C' : 'Check Fridge Temp < 6°C'}</p><p className="text-xs text-blue-600">{lang === 'zh' ? '该安全检查为必填项。' : 'Checking temperature is mandatory.'}</p></div>
                    <Icon name="Snowflake" className="text-blue-300" />
                </div>
                <button onClick={handleStaffSubmit} className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 hover:bg-primary-dark">
                    <Icon name="Save" size={20} /> {lang === 'zh' ? (viewShift === 'morning' ? '提交早班补货记录' : '提交晚班盘点报告') : (viewShift === 'morning' ? 'Submit AM Refill' : 'Submit PM Report')}
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
// 新增组件: 分店与权限管理 (Store Management View)
// ============================================================================
const StoreManagementView = ({ data }: any) => {
    const { stores, setStores, users, lang } = data;
    const safeStores = Array.isArray(stores) ? stores : [];
    const [activeStoreId, setActiveStoreId] = useState<string>(safeStores[0]?.id || '');
    const activeStore = safeStores.find((s: any) => s && s.id === activeStoreId);

    const handleSaveGlobalStores = async () => {
        // 1. 保留本地备份
        localStorage.setItem('onesip_stores_v1', JSON.stringify(safeStores));
        
        // 2. 💡 新增：将分店数据推送到云端！
        try {
            // 假设您的全局云端对象叫 Cloud
            if (Cloud.updateStores) {
                await Cloud.updateStores(safeStores);
            }
            alert(lang === 'zh' ? '✅ 分店设置已永久保存并同步至云端！' : '✅ Store configuration saved and synced to cloud!');
        } catch (error) {
            console.error("Failed to sync stores to cloud:", error);
            alert(lang === 'zh' ? '⚠️ 本地保存成功，但云端同步失败，请检查网络。' : '⚠️ Local save OK, but cloud sync failed.');
        }
    };

    const handleAddStore = () => {
        const newStore = { id: `store_${Date.now()}`, name: `New Branch ${safeStores.length + 1}`, staff: [], features: { prep: true, waste: true, schedule: true, swap: true, availability: true, sop: true, training: true, recipes: true, chat: true } };
        setStores([...safeStores, newStore]);
        setActiveStoreId(newStore.id);
    };

    const handleDeleteStore = () => {
        if(safeStores.length <= 1) return alert("Must keep at least one store.");
        if(window.confirm("Delete this store?")) {
            const newStores = safeStores.filter((s:any) => s && s.id !== activeStoreId);
            setStores(newStores);
            setActiveStoreId(newStores[0]?.id || '');
        }
    };

    const updateStoreField = (field: string, value: any) => setStores(safeStores.map((s:any) => (s && s.id === activeStoreId) ? { ...s, [field]: value } : s));
    const updateFeature = (featureKey: string, value: boolean) => { if(activeStore) updateStoreField('features', { ...activeStore.features, [featureKey]: value }); };
    const toggleStaff = (userId: string) => {
        if(!activeStore) return;
        const currentStaff = activeStore.staff || [];
        const newStaff = currentStaff.includes(userId) ? currentStaff.filter((id:string) => id !== userId) : [...currentStaff, userId];
        updateStoreField('staff', newStaff);
    };

    const modulesList = [ { key: 'recipes', label: '饮品配方 (Recipes)' }, { key: 'prep', label: '日常盘点 (Daily Prep)' }, { key: 'waste', label: '物料报损 (Waste Report)' }, { key: 'schedule', label: '员工排班 (Schedule)' }, { key: 'swap', label: '换班申请 (Shift Swap)' }, { key: 'availability', label: '意向时间 (Availability)' }, { key: 'sop', label: 'SOP知识库 (SOP Library)' }, { key: 'training', label: '员工培训 (Training)' }, { key: 'chat', label: '团队沟通 (Team Chat)' }, { key: 'repair', label: '异常报修 (Repair Tickets)' } ];
  
    if(!activeStore) return <div className="p-4 text-white">Loading Stores...</div>;

    return (
        <div className="flex flex-col md:flex-row h-full gap-4 p-4 animate-fade-in">
            <div className="w-full md:w-1/3 bg-dark-surface rounded-xl border border-white/10 overflow-hidden flex flex-col max-h-64 md:max-h-full shrink-0">
                <div className="p-3 bg-white/5 border-b border-white/10 flex justify-between items-center"><h3 className="font-bold text-white text-sm">Branches</h3><button onClick={handleAddStore} className="text-dark-accent hover:opacity-80"><Icon name="Plus" size={18}/></button></div>
                <div className="overflow-y-auto flex-1 p-2 space-y-2">
                    {safeStores.map((s:any) => {
                        if (!s) return null;
                        return (<button key={s.id} onClick={() => setActiveStoreId(s.id)} className={`w-full text-left p-3 rounded-lg text-sm font-bold transition-all ${activeStoreId === s.id ? 'bg-dark-accent text-dark-bg' : 'bg-dark-bg text-dark-text-light hover:bg-white/5 border border-white/5'}`}>{s.name} <span className="text-[10px] font-normal opacity-70 ml-1">({s.staff?.length || 0} Staff)</span></button>);
                    })}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4">
                <div className="flex justify-between items-center bg-dark-surface p-4 rounded-xl border border-dark-accent/50 shadow-[0_0_15px_rgba(var(--dark-accent),0.1)]">
                    <div><h3 className="font-bold text-white mb-1">Save Configuration</h3><p className="text-xs text-dark-text-light">Remember to save after assigning staff or toggling features.</p></div>
                    <button onClick={handleSaveGlobalStores} className="bg-dark-accent text-dark-bg px-6 py-3 rounded-xl font-black text-sm shadow-lg hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"><Icon name="Save" size={18}/> SAVE SETTINGS</button>
                </div>
                <div className="bg-dark-surface p-4 rounded-xl border border-white/10">
                    <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-white">Store Settings</h3><button onClick={handleDeleteStore} className="text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-400/20">Delete Store</button></div>
                    <label className="text-xs text-dark-text-light font-bold mb-1 block">Store Name</label>
                    <input className="w-full bg-dark-bg border border-white/20 p-3 rounded-lg text-white font-bold outline-none focus:border-dark-accent" value={activeStore.name} onChange={(e) => updateStoreField('name', e.target.value)} />
                </div>
                <div className="bg-dark-surface p-4 rounded-xl border border-white/10">
                    <h3 className="font-bold text-white mb-1">Feature Toggles</h3>
                    <p className="text-xs text-dark-text-light mb-4">Turn modules on/off for employees assigned to this store.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {modulesList.map(mod => (
                            <label key={mod.key} className="flex items-center justify-between bg-dark-bg p-3 rounded-lg border border-white/5 cursor-pointer hover:border-white/10 transition-colors"><span className="text-sm font-bold text-white">{mod.label}</span><input type="checkbox" checked={activeStore.features?.[mod.key] !== false} onChange={(e) => updateFeature(mod.key, e.target.checked)} className="w-5 h-5 rounded bg-dark-bg border-white/20 text-dark-accent focus:ring-dark-accent"/></label>
                        ))}
                    </div>
                </div>
                <div className="bg-dark-surface p-4 rounded-xl border border-white/10">
                    <h3 className="font-bold text-white mb-1">Assigned Staff</h3>
                    <p className="text-xs text-dark-text-light mb-4">Select employees to assign to this branch.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(users || []).filter((u:any) => u && u.active !== false).map((u:any) => {
                            const isAssigned = activeStore.staff?.includes(u.id);
                            return (<button key={u.id} onClick={() => toggleStaff(u.id)} className={`p-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-between ${isAssigned ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-dark-bg border-white/5 text-dark-text-light hover:bg-white/5'}`}>{u.name} {isAssigned && <Icon name="CheckCircle2" size={14} />}</button>);
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// 新增组件：后台报修题库编辑器 (傻瓜式中英双语配置)
// ============================================================================
function RepairConfigEditor({ store, onSave, onCancel }: any) {
    // 读取当前门店的专属配置，如果没有，就克隆一份默认的 REPAIR_DATABASE
    const [db, setDb] = useState(() => store?.repairDatabase ? JSON.parse(JSON.stringify(store.repairDatabase)) : JSON.parse(JSON.stringify(REPAIR_DATABASE)));

    const updateCat = (k: string, langKey: string, val: string) => { const n = {...db}; n[k].title[langKey] = val; setDb(n); };
    const addItem = (k: string) => { const n = {...db}; n[k].items.push({ name:{zh:'', en:''}, issues:[] }); setDb(n); };
    const updateItem = (k: string, idx: number, langKey: string, val: string) => { const n = {...db}; n[k].items[idx].name[langKey] = val; setDb(n); };
    const addIssue = (k: string, idx: number) => { const n = {...db}; n[k].items[idx].issues.push({zh:'', en:''}); setDb(n); };
    const updateIssue = (k: string, idx: number, iIdx: number, langKey: string, val: string) => { const n = {...db}; n[k].items[idx].issues[iIdx][langKey] = val; setDb(n); };
    const delCat = (k: string) => { if(!window.confirm("Delete this entire category?")) return; const n = {...db}; delete n[k]; setDb(n); };
    const delItem = (k: string, idx: number) => { const n = {...db}; n[k].items.splice(idx, 1); setDb(n); };
    const delIssue = (k: string, idx: number, iIdx: number) => { const n = {...db}; n[k].items[idx].issues.splice(iIdx, 1); setDb(n); };
    const addCat = () => { const key = `c_${Date.now()}`; setDb({...db, [key]: { title:{zh:'新大类',en:'New Category'}, items:[] }}); };

    return (
        <div className="bg-dark-surface p-4 rounded-xl border border-white/10 space-y-4 animate-fade-in">
            <div className="flex justify-between items-center"><h3 className="text-white font-bold text-sm">Customize Repair Categories</h3><div className="flex gap-2"><button onClick={onCancel} className="px-4 py-2 bg-white/10 text-white rounded-lg text-xs font-bold">Cancel</button><button onClick={()=>onSave(db)} className="px-4 py-2 bg-orange-500 text-white rounded-lg text-xs font-bold shadow-lg hover:bg-orange-400">Save Config</button></div></div>
            <div className="space-y-6">
                {Object.entries(db).map(([k, cat]: any) => (
                    <div key={k} className="p-3 border border-white/20 rounded-lg bg-dark-bg">
                        <div className="flex gap-2 mb-3">
                            <input value={cat.title.zh} onChange={e=>updateCat(k,'zh',e.target.value)} className="flex-1 bg-dark-surface text-white p-2 rounded text-sm border border-white/10 focus:border-orange-500 outline-none" placeholder="中文大类名称" />
                            <input value={cat.title.en} onChange={e=>updateCat(k,'en',e.target.value)} className="flex-1 bg-dark-surface text-white p-2 rounded text-sm border border-white/10 focus:border-orange-500 outline-none" placeholder="EN Category" />
                            <button onClick={()=>delCat(k)} className="px-3 bg-red-500/20 text-red-400 rounded hover:bg-red-500 hover:text-white transition-colors"><Icon name="Trash" size={16}/></button>
                        </div>
                        <div className="pl-4 border-l-2 border-white/10 space-y-3">
                            {cat.items.map((item:any, idx:number) => (
                                <div key={idx} className="p-3 border border-white/10 rounded-lg bg-dark-surface">
                                    <div className="flex gap-2 mb-2">
                                        <input value={item.name.zh} onChange={e=>updateItem(k,idx,'zh',e.target.value)} className="flex-1 bg-dark-bg text-orange-300 p-1.5 rounded text-xs border border-white/10 focus:border-orange-500 outline-none" placeholder="项目名称(中文)" />
                                        <input value={item.name.en} onChange={e=>updateItem(k,idx,'en',e.target.value)} className="flex-1 bg-dark-bg text-orange-300 p-1.5 rounded text-xs border border-white/10 focus:border-orange-500 outline-none" placeholder="Item Name(EN)" />
                                        <button onClick={()=>delItem(k,idx)} className="text-red-400/60 hover:text-red-400 px-2"><Icon name="X" size={16}/></button>
                                    </div>
                                    <div className="pl-4 space-y-1.5">
                                        {item.issues.map((iss:any, iIdx:number) => (
                                            <div key={iIdx} className="flex gap-2 items-center">
                                                <div className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0"></div>
                                                <input value={iss.zh} onChange={e=>updateIssue(k,idx,iIdx,'zh',e.target.value)} className="flex-1 bg-transparent text-gray-300 text-[10px] border-b border-white/10 outline-none focus:border-orange-500 pb-1" placeholder="问题选项(中文)" />
                                                <input value={iss.en} onChange={e=>updateIssue(k,idx,iIdx,'en',e.target.value)} className="flex-1 bg-transparent text-gray-300 text-[10px] border-b border-white/10 outline-none focus:border-orange-500 pb-1" placeholder="Issue Option(EN)" />
                                                <button onClick={()=>delIssue(k,idx,iIdx)} className="text-gray-500 hover:text-red-400"><Icon name="X" size={14}/></button>
                                            </div>
                                        ))}
                                        <button onClick={()=>addIssue(k,idx)} className="text-[10px] text-orange-400 mt-2 font-bold py-1 px-2 bg-orange-500/10 rounded">+ Add Issue Option</button>
                                    </div>
                                </div>
                            ))}
                            <button onClick={()=>addItem(k)} className="text-xs text-blue-400 font-bold py-2">+ Add Item (e.g. New Machine)</button>
                        </div>
                    </div>
                ))}
                <button onClick={addCat} className="w-full py-3 border-2 border-dashed border-white/20 rounded-lg text-dark-text-light text-sm font-bold hover:text-white hover:border-white/50 transition-all">+ Add New Category</button>
            </div>
        </div>
    );
}

// ============================================================================
// 经理后台依赖组件: 排班编辑、补卡、工时调整弹窗
// ============================================================================
const ShiftEditorModal = ({ isOpen, onClose, shiftData, onSave, availableStaff }: any) => {
    const [shifts, setShifts] = useState<any[]>(shiftData || []);

    useEffect(() => {
        setShifts(shiftData?.length > 0 ? JSON.parse(JSON.stringify(shiftData)) : [
            { id: 's1', name: 'Shift 1', start: '10:00', end: '15:00', staff: [] },
            { id: 's2', name: 'Shift 2', start: '14:30', end: '19:00', staff: [] }
        ]);
    }, [shiftData]);

    if (!isOpen) return null;

    const handleAddShift = () => {
        setShifts([...shifts, { id: Date.now().toString(), name: `Shift ${shifts.length + 1}`, start: '12:00', end: '16:00', staff: [] }]);
    };

    const toggleStaff = (shiftIdx: number, staffName: string) => {
        const newShifts = [...shifts];
        const staffList = newShifts[shiftIdx].staff || [];
        if (staffList.includes(staffName)) {
            newShifts[shiftIdx].staff = staffList.filter((n: string) => n !== staffName);
        } else {
            newShifts[shiftIdx].staff = [...staffList, staffName];
        }
        setShifts(newShifts);
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="bg-dark-surface p-6 rounded-2xl border border-white/10 w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl">
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="text-lg font-bold text-white">Edit Shifts</h3>
                    <button onClick={onClose} className="text-dark-text-light hover:text-white"><Icon name="X" size={20}/></button>
                </div>
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                    {shifts.map((shift, idx) => (
                        <div key={shift.id || idx} className="bg-dark-bg p-4 rounded-xl border border-white/5 space-y-3">
                            <div className="flex justify-between items-center">
                                <input className="bg-transparent text-white font-bold outline-none w-24 border-b border-white/20 focus:border-dark-accent" value={shift.name} onChange={e => { const n = [...shifts]; n[idx].name = e.target.value; setShifts(n); }} />
                                <button onClick={() => { const n = [...shifts]; n.splice(idx, 1); setShifts(n); }} className="text-red-400 hover:text-red-300"><Icon name="Trash" size={16}/></button>
                            </div>
                            <div className="flex gap-2 items-center">
                                <input type="time" className="bg-dark-surface border border-white/10 rounded px-2 py-1 text-white text-sm outline-none focus:border-dark-accent" value={shift.start} onChange={e => { const n = [...shifts]; n[idx].start = e.target.value; setShifts(n); }} />
                                <span className="text-dark-text-light">-</span>
                                <input type="time" className="bg-dark-surface border border-white/10 rounded px-2 py-1 text-white text-sm outline-none focus:border-dark-accent" value={shift.end} onChange={e => { const n = [...shifts]; n[idx].end = e.target.value; setShifts(n); }} />
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-dark-text-light mb-2">Assigned Staff</p>
                                <div className="flex flex-wrap gap-2">
                                    {availableStaff.map((staffName: string) => {
                                        const isSelected = (shift.staff || []).includes(staffName);
                                        return (
                                            <button key={staffName} onClick={() => toggleStaff(idx, staffName)} className={`px-2 py-1 rounded text-xs font-bold transition-all border ${isSelected ? 'bg-dark-accent/20 text-dark-accent border-dark-accent/50' : 'bg-dark-surface text-dark-text-light border-white/5 hover:border-white/20'}`}>
                                                {staffName}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                    <button onClick={handleAddShift} className="w-full py-3 border-2 border-dashed border-white/10 rounded-xl text-dark-text-light font-bold hover:border-dark-accent hover:text-dark-accent transition-all">+ Add Shift</button>
                </div>
                <div className="mt-4 pt-4 border-t border-white/10 shrink-0">
                    <button onClick={() => onSave(shifts)} className="w-full bg-dark-accent text-dark-bg py-3 rounded-xl font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all">Save Shifts</button>
                </div>
            </div>
        </div>
    );
};

const ManualLogModal = ({ isOpen, onClose, onSave, users }: any) => {
    const [selectedUser, setSelectedUser] = useState(users[0]?.id || '');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [inTime, setInTime] = useState('10:00');
    const [outTime, setOutTime] = useState('18:00');

    if (!isOpen) return null;

    const handleSave = () => {
        const u = users.find((u:any) => u.id === selectedUser);
        if(!u) return;
        const inDate = new Date(`${date}T${inTime}:00`);
        const outDate = new Date(`${date}T${outTime}:00`);
        const inLog = { id: Date.now()+1, userId: u.id, name: u.name, time: inDate.toISOString(), type: 'clock-in', isManual: true, reason: 'Manager manual entry' };
        const outLog = { id: Date.now()+2, userId: u.id, name: u.name, time: outDate.toISOString(), type: 'clock-out', isManual: true, reason: 'Manager manual entry' };
        onSave(inLog, outLog);
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="bg-dark-surface p-6 rounded-2xl border border-white/10 w-full max-w-sm shadow-2xl space-y-4">
                <h3 className="text-lg font-bold text-white mb-2">Add Manual Log</h3>
                <div><label className="text-xs text-dark-text-light mb-1 block">Staff</label><select className="w-full bg-dark-bg border border-white/20 p-2 rounded text-white" value={selectedUser} onChange={e=>setSelectedUser(e.target.value)}>{users.map((u:any)=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                <div><label className="text-xs text-dark-text-light mb-1 block">Date</label><input type="date" className="w-full bg-dark-bg border border-white/20 p-2 rounded text-white" value={date} onChange={e=>setDate(e.target.value)}/></div>
                <div className="flex gap-2">
                    <div className="flex-1"><label className="text-xs text-dark-text-light mb-1 block">In Time</label><input type="time" className="w-full bg-dark-bg border border-white/20 p-2 rounded text-white" value={inTime} onChange={e=>setInTime(e.target.value)}/></div>
                    <div className="flex-1"><label className="text-xs text-dark-text-light mb-1 block">Out Time</label><input type="time" className="w-full bg-dark-bg border border-white/20 p-2 rounded text-white" value={outTime} onChange={e=>setOutTime(e.target.value)}/></div>
                </div>
                <div className="flex gap-3 mt-4"><button onClick={onClose} className="flex-1 py-2 bg-white/10 rounded-xl text-white font-bold hover:bg-white/20 transition-all">Cancel</button><button onClick={handleSave} className="flex-1 py-2 bg-dark-accent text-dark-bg rounded-xl font-bold hover:opacity-90 transition-all">Save</button></div>
            </div>
        </div>
    );
};


// ============================================================================
// 组件 5: 经理后台 (Manager Dashboard) - [100% 数据隔离与防错修复版]
// ============================================================================
function ManagerDashboard({ data, adminStoreId, onExit }: { data: any, adminStoreId: string, onExit: () => void }) {
    const { showNotification } = useNotification();
    const safeUsers = Array.isArray(data.users) ? data.users : [];
    const managerUser = safeUsers.find((u:User) => u && u.id === 'u_lambert') || { id: 'u_manager', name: 'Manager', role: 'manager', phone: '0000' };
    const { schedule, setSchedule, logs, setLogs, t, swapRequests, users, scheduleCycles, setScheduleCycles, stores, notices } = data;
    
    const today = new Date();
    const [view, setView] = useState<'schedule' | 'logs' | 'financial' | 'requests' | 'confirmations'>('schedule');
    const [editingShift, setEditingShift] = useState<{ dayIdx: number, shift: 'morning' | 'evening' | 'night' | 'all' } | null>(null);
    const [budgetMax, setBudgetMax] = useState<number>(() => Number(localStorage.getItem(`onesip_budget_max_${adminStoreId}`)) || 5000);
    const [financialMonth, setFinancialMonth] = useState(new Date().toISOString().slice(0, 7)); 
    const [currentWeekIndex, setCurrentWeekIndex] = useState(0);

    const [isAddingManualLog, setIsAddingManualLog] = useState(false);
    const [logToInvalidate, setLogToInvalidate] = useState<LogEntry | null>(null);
    const [logPairToAdjust, setLogPairToAdjust] = useState<{ inLog: LogEntry, outLog: LogEntry } | null>(null);
    // 💡 监听新报修工单并触发报警弹窗
    const prevRepairsLength = useRef(data.repairRequests?.length || 0);
    useEffect(() => {
        const currentLen = data.repairRequests?.length || 0;
        if (currentLen > prevRepairsLength.current) {
            const newTicket = data.repairRequests[currentLen - 1];
            if ((newTicket.storeId || 'default_store') === adminStoreId) {
                showNotification({ type: 'announcement', title: '🚨 新异常提报', message: `${newTicket.submittedBy} 提交了关于 [${newTicket.item}] 的报修，请处理！`, sticky: true });
            }
        }
        prevRepairsLength.current = currentLen;
    }, [data.repairRequests, adminStoreId, showNotification]);

    // ==========================================
    // 🛡️ 经理后台严格分店数据隔离
    // ==========================================
    const getStoreId = (item: any) => item.storeId || 'default_store';
    
    const scopedSchedule = { days: (schedule?.days || []).filter((d:any) => getStoreId(d) === adminStoreId) };
    const scopedLogs = (logs || []).filter((l:any) => getStoreId(l) === adminStoreId);
    const scopedSwapRequests = (swapRequests || []).filter((r:any) => getStoreId(r) === adminStoreId);
    
    // 只保留被分配到当前门店的员工
    const activeStore = stores?.find((s:any) => s.id === adminStoreId);
    const branchStaffIds = activeStore?.staff || [];
    const scopedUsers = safeUsers.filter((u:User) => branchStaffIds.includes(u.id) || u.role === 'boss');

    const [wages, setWages] = useState<Record<string, { type: 'hourly'|'fixed', value: number }>>(() => {
        const saved = localStorage.getItem(`onesip_wages_v3_${adminStoreId}`);
        if (saved) return JSON.parse(saved);
        const def: any = {};
        scopedUsers.forEach((m: User) => { if (m) def[m.name] = { type: 'hourly', value: 12 }; });
        return def;
    });

    const saveWages = (newWages: any) => { setWages(newWages); localStorage.setItem(`onesip_wages_v3_${adminStoreId}`, JSON.stringify(newWages)); };
    const validStaffNames = new Set(scopedUsers.filter((u:User)=>u).map((u: User) => u.name));
    const normalizeName = (name: string) => name ? name.trim() : "Unknown";

    const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    const displayedDays = (scopedSchedule.days).filter((day: any) => {
        if(!day || !day.date) return false;
        const [m, d] = day.date.split('-').map(Number);
        const dayDate = new Date(today.getFullYear(), m - 1, d);
        if (today.getMonth() === 11 && m === 1) dayDate.setFullYear(today.getFullYear() + 1);
        if (today.getMonth() === 0 && m === 12) dayDate.setFullYear(today.getFullYear() - 1);
        return dayDate >= startOfCurrentMonth && dayDate <= endOfNextMonth;
    }).sort((a: any, b: any) => {
        const getDateObj = (dateStr: string) => { const [m, d] = dateStr.split('-').map(Number); const date = new Date(today.getFullYear(), m - 1, d); if (today.getMonth() === 11 && m === 1) date.setFullYear(today.getFullYear() + 1); return date; };
        return getDateObj(a.date).getTime() - getDateObj(b.date).getTime();
    });

    const totalWeeks = Math.ceil(displayedDays.length / 7);
    const activeStaff = scopedUsers.filter((u: User) => u && u.active !== false); // 用于编辑排班和手动补卡

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

    const handleSaveSchedule = (updatedShifts: any[]) => { 
        if (!editingShift) return; 
        const { dayIdx } = editingShift; 
        const targetDay = displayedDays[dayIdx];
        
        // 隔离保存：过滤掉属于当前门店的同一天，用新的覆盖，保持其他门店数据不动
        const otherStoreDays = (schedule.days || []).filter((d:any) => !(d.date === targetDay.date && getStoreId(d) === adminStoreId));
        const updatedDay = { ...targetDay, shifts: updatedShifts, storeId: adminStoreId, morning: [], evening: [], night: [] };
        const newSched = { ...schedule, days: [...otherStoreDays, updatedDay] };
        
        setSchedule(newSched); 
        Cloud.saveSchedule(newSched); 
        setEditingShift(null); 
    };

    const handlePublishSchedule = async () => {
        if (!window.confirm(`Publish schedule? Staff will be notified.`)) return;
        const startDate = displayedDays[0]?.date; const endDate = displayedDays[displayedDays.length - 1]?.date;
        if(!startDate) return;
        const year = new Date().getFullYear();
        const startISO = `${year}-${startDate.split('-').map((p:string)=>p.padStart(2,'0')).join('-')}`;
        const endISO = `${year}-${endDate.split('-').map((p:string)=>p.padStart(2,'0')).join('-')}`;
        const cycleId = `${startISO}_${endISO}_${adminStoreId}`;
        const confirmations: any = {};
        activeStaff.forEach((u: User) => { confirmations[u.id] = { status: 'pending', viewed: false }; });
        
        const newCycle = { cycleId, storeId: adminStoreId, startDate: startISO, endDate: endISO, publishedAt: new Date().toISOString(), status: 'published', confirmations, snapshot: {} };
        const updatedCycles = (scheduleCycles || []).filter((c: ScheduleCycle) => c && c.cycleId !== cycleId);
        updatedCycles.push(newCycle);
        await Cloud.updateScheduleCycles(updatedCycles);
        if (setScheduleCycles) setScheduleCycles(updatedCycles);
        
        // 【修复 Invalid Date 报错】：自动发布包含正确 Date 的排班公告，并绑定当前门店
        const newNotice = { 
            id: Date.now().toString(), 
            type: 'announcement', 
            storeId: adminStoreId, 
            title: "📅 New Schedule", 
            content: `Schedule ${startDate} to ${endDate} is live. Please confirm.`, 
            date: new Date().toISOString(),
            timestamp: Date.now(), 
            author: managerUser.name || 'Manager', 
            frequency: 'once' 
        };
        await Cloud.updateNotices([...(notices || []), newNotice]);
        
        showNotification({ type: 'message', title: 'Published!', message: `Schedule published for this branch.`});
    };

    const handleApplySwap = async (reqId: string) => {
        const req = scopedSwapRequests.find((r: SwapRequest) => r.id === reqId);
        if (!req) return;
        const newSchedule = JSON.parse(JSON.stringify(schedule));
        
        const dayIndex = newSchedule.days.findIndex((d: ScheduleDay) => {
            const dKey = d.date.split('-').map(n => parseInt(n, 10)).join('-');
            const rKey = req.requesterDate.split('-').map(n => parseInt(n, 10)).join('-');
            return dKey === rKey && getStoreId(d) === adminStoreId;
        });
        
        if (dayIndex === -1) return;
        const day = newSchedule.days[dayIndex];
        const targetShift = (day.shifts || []).find((s: any) => s && s.start && s.start.startsWith(req.requesterShift.split('-')[0].trim())); 
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

    const handleSaveManualLog = (inLog: LogEntry, outLog: LogEntry) => {
        const scopedInLog = { ...inLog, storeId: adminStoreId };
        const scopedOutLog = { ...outLog, storeId: adminStoreId };
        Cloud.saveLog(scopedInLog); Cloud.saveLog(scopedOutLog);
        setIsAddingManualLog(false); alert('Manual record added.');
    };

    const calculateFinancials = () => {
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
        
        const filteredDays = displayedDays.filter((day: any) => {
            const [m, d] = day.date.split('-').map(Number);
            const nowY = new Date().getFullYear();
            let y = nowY;
            if (parseInt(financialMonth.split('-')[1]) === 1 && m === 12) y--; 
            else if (parseInt(financialMonth.split('-')[1]) === 12 && m === 1) y++;
            const dayY = (new Date().getMonth()===11 && m===1) ? nowY+1 : nowY;
            return `${dayY}-${String(m).padStart(2,'0')}` === financialMonth;
        });

        filteredDays.forEach((day: any) => { 
            const shifts = day.shifts || [];
            if (shifts.length > 0) {
                shifts.forEach((s: any) => {
                    if (!s) return;
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
            }
        }); 
        
        const logsByUser: Record<string, LogEntry[]> = {};
        scopedLogs.forEach((l: LogEntry) => { 
            if (l.isDeleted || !l.time) return;
            const d = new Date(l.time);
            if (isNaN(d.getTime())) return;
            const logMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            if (logMonth !== financialMonth) return;
            let rawName = l.name || 'Unknown';
            if (l.userId) { const u = safeUsers.find(user => user && user.id === l.userId); if (u) rawName = u.name; }
            const finalName = normalizeName(rawName);
            if (!validStaffNames.has(finalName)) return;
            if (!logsByUser[finalName]) logsByUser[finalName] = []; 
            logsByUser[finalName].push(l); 
        }); 
        
        Object.entries(logsByUser).forEach(([userName, userLogs]) => { 
            const s = getStats(userName);
            const sorted = userLogs.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()); 
            const processedInIds = new Set<number>();

            sorted.forEach((outLog) => {
                if (outLog.type === 'clock-out') {
                    const outTime = new Date(outLog.time).getTime();
                    const matchingIn = sorted.filter(l => l.type === 'clock-in' && !processedInIds.has(l.id) && new Date(l.time).getTime() < outTime)
                        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())[0]; 
                    if (matchingIn) {
                        const duration = (outTime - new Date(matchingIn.time).getTime()) / 3600000;
                        if (duration > 0) { s.actualHours += duration; processedInIds.add(matchingIn.id); }
                    }
                }
            });
        });

        let totalEstCost = 0; let totalActualCost = 0;
        let totalHourlyEst = 0; let totalHourlyAct = 0; 
        let totalFixed = 0; 

        Object.keys(stats).forEach(name => { 
            if (!validStaffNames.has(name)) return;
            const s = stats[name];
            const setting = wages[name] || { type: 'hourly', value: 12 };
            if (setting.type === 'fixed') {
                s.estCost = setting.value; s.actualCost = setting.value; totalFixed += setting.value; 
            } else {
                s.estCost = s.estHours * setting.value; s.actualCost = s.actualHours * setting.value;
                totalHourlyEst += s.estCost; totalHourlyAct += s.actualCost; 
            }
            totalEstCost += s.estCost; totalActualCost += s.actualCost; 
        });

        return { stats, totalEstCost, totalActualCost, totalHourlyEst, totalHourlyAct, totalFixed };
    };

    const { stats, totalEstCost, totalActualCost, totalHourlyEst, totalHourlyAct, totalFixed } = calculateFinancials();

    const handleBudgetChange = (val: string) => { const b = parseFloat(val) || 0; setBudgetMax(b); localStorage.setItem(`onesip_budget_max_${adminStoreId}`, b.toString()); };

    const handleExportFinancialCSV = () => {
        let csv = "FINANCIAL SUMMARY REPORT\n";
        csv += `Report Month,${financialMonth}\nBudget Max,${budgetMax}\nTotal Estimated Cost,${totalEstCost.toFixed(2)}\nTotal Actual Cost,${totalActualCost.toFixed(2)}\nBalance,${(budgetMax - totalActualCost).toFixed(2)}\n\n`;
        csv += "Name,Wage Type,Value,Est. Hours,Est. Cost,Act. Hours,Act. Cost,Difference\n";
        Object.keys(stats).forEach(name => {
            if (!validStaffNames.has(name)) return;
            const s = stats[name]; const w = wages[name];
            if (s.estHours > 0 || s.actualHours > 0 || s.wageType === 'fixed') csv += `"${name}",${s.wageType},${w?.value||0},${s.estHours.toFixed(1)},${s.estCost.toFixed(2)},${s.actualHours.toFixed(1)},${s.actualCost.toFixed(2)},${(s.actualCost - s.estCost).toFixed(2)}\n`;
        });
        const link = document.createElement("a"); link.href = encodeURI("data:text/csv;charset=utf-8," + csv); link.download = `financial_summary_${financialMonth}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const handleExportLogsCSV = () => {
        let csv = "Date,Staff Name,User ID,Hourly Wage,Clock In,Clock Out,Duration (Hrs),Cost,Status\n";
        const logsByUser: Record<string, LogEntry[]> = {};
        scopedLogs.forEach((l:LogEntry) => {
            if (l.isDeleted) return; 
            const finalName = normalizeName(l.name || 'Unknown');
            if (!validStaffNames.has(finalName)) return;
            if (!logsByUser[finalName]) logsByUser[finalName] = [];
            logsByUser[finalName].push(l);
        });
        Object.entries(logsByUser).forEach(([userName, userLogs]) => {
            const wage = wages[userName]?.value || 12;
            userLogs.sort((a,b) => new Date(a.time).getTime() - new Date(b.time).getTime());
            const processedIds = new Set<number>();
            userLogs.forEach((log, idx) => {
                if (processedIds.has(log.id)) return;
                const logTime = new Date(log.time);
                if (isNaN(logTime.getTime())) return;
                const y = logTime.getFullYear(); const m = String(logTime.getMonth() + 1).padStart(2, '0');
                if (`${y}-${m}` !== financialMonth) return; 
                const dateStr = `${y}-${m}-${String(logTime.getDate()).padStart(2, '0')}`;
                const timeStr = logTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                if (log.type === 'clock-in') {
                    const matchingOut = userLogs.slice(idx + 1).find(l => l.type === 'clock-out' && !processedIds.has(l.id) && new Date(l.time).toDateString() === logTime.toDateString());
                    if (matchingOut) {
                        const outTime = new Date(matchingOut.time);
                        const outStr = outTime?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) || '-';
                        const duration = (outTime.getTime() - logTime.getTime()) / 3600000;
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

    const currentCycle = (scheduleCycles || []).find((c: ScheduleCycle) => {
        if (!c) return false;
        const start = new Date(c.startDate); const end = new Date(c.endDate);
        return today >= start && today <= end && getStoreId(c) === adminStoreId;
    });

    const visibleLogs = scopedLogs.filter((log: LogEntry) => !log.isDeleted).slice().reverse() || [];
    const formattedDateSafe = (time: any) => { if (!time) return ''; const d = new Date(time); return isNaN(d.getTime()) ? '' : d.toLocaleString(); };
    const allReqs = scopedSwapRequests.slice().sort((a: SwapRequest, b: SwapRequest) => b.timestamp - a.timestamp) || [];

    return (
        <div className="flex flex-col h-full bg-dark-bg text-dark-text animate-fade-in">
            <div className="flex bg-dark-bg p-2 gap-2 overflow-x-auto shrink-0 shadow-inner">
                {['schedule', 'requests', 'financial', 'logs', 'confirmations'].map(v => (
                    <button key={v} onClick={() => setView(v as any)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${view === v ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                        {v} {v === 'requests' && allReqs.filter((r:any) => r && r.status === 'accepted_by_peer' && !r.appliedToSchedule).length > 0 && `(${allReqs.filter((r:any) => r && r.status === 'accepted_by_peer' && !r.appliedToSchedule).length})`}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                {view === 'requests' && (
                    <div className="space-y-4">
                        <div className="bg-dark-surface p-3 rounded-xl shadow-sm border border-white/10"><h3 className="font-bold text-dark-text">Swap Requests Log</h3></div>
                        {allReqs.length === 0 && <p className="text-dark-text-light text-center py-10 bg-dark-surface rounded-xl border border-white/10">No swap requests found.</p>}
                        {allReqs.map((req: SwapRequest) => {
                            if (!req) return null;
                            return (
                            <div key={req.id} className="bg-dark-surface p-4 rounded-xl shadow-sm border border-white/10">
                                <div className="flex justify-between items-start mb-3"><div><p className="text-sm text-dark-text-light"><strong className="text-white">{req.requesterName}</strong> ↔ <strong className="text-white">{req.targetName}</strong></p><p className="text-xs text-gray-400 mt-1">{formattedDateSafe(req.timestamp)}</p></div><span className={`text-xs px-2 py-1 rounded font-bold capitalize bg-gray-500/10 text-gray-400`}>{req.status.replace(/_/g, ' ')}</span></div>
                                <div className="bg-dark-bg p-3 rounded-lg text-sm text-dark-text-light mb-4 space-y-2"><div className="flex justify-between"><span>Shift:</span> <strong className="font-mono text-white">{req.requesterDate} ({req.requesterShift})</strong></div></div>
                                {req.status === 'accepted_by_peer' && !req.appliedToSchedule && (<div className="grid grid-cols-2 gap-2"><button className="w-full bg-red-600/50 text-white/80 py-2.5 rounded-lg font-bold text-xs" disabled>Reject</button><button onClick={() => handleApplySwap(req.id)} className="w-full bg-dark-accent text-dark-bg py-2.5 rounded-lg font-bold shadow-md active:scale-95 transition-all hover:opacity-90 text-xs">Approve & Apply</button></div>)}
                            </div>
                        )})}
                    </div>
                )}
                {view === 'schedule' && (
                    <div className="space-y-3 pb-10">
                        <div className="bg-dark-surface p-4 rounded-xl border border-white/10 shadow-sm mb-4 sticky top-0 z-20">
                            <div className="flex justify-between items-center"><h3 className="font-bold text-dark-text mb-2">Week {currentWeekIndex + 1} of {totalWeeks || 1}</h3><div className="flex gap-2"><button onClick={() => setCurrentWeekIndex(Math.max(0, currentWeekIndex - 1))} disabled={currentWeekIndex === 0} className="p-2 bg-white/10 rounded-lg disabled:opacity-50"><Icon name="ChevronLeft" size={16}/></button><button onClick={() => setCurrentWeekIndex(Math.min((totalWeeks || 1) - 1, currentWeekIndex + 1))} disabled={currentWeekIndex >= (totalWeeks || 1) - 1} className="p-2 bg-white/10 rounded-lg disabled:opacity-50"><Icon name="ChevronRight" size={16}/></button></div></div>
                            <button onClick={handlePublishSchedule} className="w-full mt-3 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-lg">Publish Current View ({displayedDays.length} days)</button>
                        </div>
                        {displayedDays?.slice(currentWeekIndex * 7, (currentWeekIndex + 1) * 7).map((day: any, dayIndexInWeek: number) => {
                            if (!day) return null;
                            const absoluteDayIndex = currentWeekIndex * 7 + dayIndexInWeek;
                            let displayShifts = day.shifts || [];
                            return (
                                <div key={absoluteDayIndex} className="bg-dark-surface p-3 rounded-xl shadow-sm border border-white/10">
                                    <div className="flex justify-between mb-3 items-center"><div><span className="font-bold text-dark-text mr-2">{day.name}</span><span className="text-xs text-dark-text-light">{day.date}</span></div><button onClick={() => setEditingShift({ dayIdx: absoluteDayIndex, shift: 'all' })} className="px-3 py-1 bg-white/10 rounded text-[10px] font-bold text-white hover:bg-white/20">Edit Shifts</button></div>
                                    <div className="space-y-2">{displayShifts.length > 0 ? displayShifts.map((shift: any, idx: number) => {
                                        if (!shift) return null;
                                        return (
                                        <div key={shift.id || idx} className="flex items-center gap-3 bg-dark-bg p-2 rounded border border-white/5"><div className="w-16 shrink-0 flex flex-col items-center"><span className="text-[9px] font-bold text-dark-accent bg-dark-accent/10 px-1.5 py-0.5 rounded uppercase">Shift {idx + 1}</span><span className="text-[9px] text-dark-text-light font-mono mt-0.5">{shift.start}-{shift.end}</span></div><div className="flex-1 flex flex-wrap gap-1">{(shift.staff || []).length > 0 ? shift.staff.map((s: string, i: number) => (<span key={i} className="text-xs text-white bg-white/10 px-2 py-0.5 rounded">{s}</span>)) : <span className="text-xs text-dark-text-light italic">Empty</span>}</div></div>
                                        );
                                    }) : <p className="text-xs text-dark-text-light italic p-2">No shifts scheduled.</p>}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {view === 'financial' && (
                    <div className="space-y-4 pb-10">
                        <div className="bg-dark-surface p-4 rounded-xl border border-white/10 sticky top-0 z-20 shadow-md">
                            <div className="flex items-center justify-between"><span className="text-sm font-bold text-white">💰 Financial Month</span><input type="month" value={financialMonth} onChange={(e) => setFinancialMonth(e.target.value)} className="bg-dark-bg border border-white/20 rounded-lg px-3 py-1.5 text-white text-sm font-mono outline-none focus:border-dark-accent"/></div>
                        </div>
                        <div className="bg-dark-surface p-5 rounded-2xl shadow-lg border border-white/10 relative overflow-hidden">
                            <h3 className="font-bold mb-4 text-dark-text flex items-center gap-2 uppercase tracking-wider text-sm"><Icon name="Briefcase" size={16}/> Total Overview</h3>
                            <div className="mb-4"><label className="block text-xs font-bold text-dark-text-light mb-1 uppercase">Monthly Budget Max (€)</label><input type="number" className="w-full border rounded-xl p-3 text-xl font-black bg-dark-bg border-white/10 text-white focus:ring-2 focus:ring-dark-accent outline-none" value={budgetMax} onChange={e => handleBudgetChange(e.target.value)} /></div>
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-dark-bg p-4 rounded-xl border border-white/5"><p className="text-[10px] text-dark-text-light font-bold uppercase mb-1">Total Proj.</p><p className="text-xl font-black text-white">€{totalEstCost.toFixed(0)}</p></div>
                                <div className="bg-dark-bg p-4 rounded-xl border border-white/5 relative overflow-hidden"><p className="text-[10px] text-dark-text-light font-bold uppercase mb-1">Total Actual</p><p className="text-xl font-black text-white">€{totalActualCost.toFixed(0)}</p></div>
                            </div>
                            <div><div className="flex justify-between items-center mb-2"><span className="text-xs font-bold text-dark-text-light uppercase">Total Budget Used</span><span className={`text-xs font-black ${totalActualCost > budgetMax ? 'text-red-400' : 'text-green-400'}`}>{totalActualCost > budgetMax ? 'OVER BUDGET' : `€${(budgetMax - totalActualCost).toFixed(0)} Left`}</span></div><div className="w-full bg-dark-bg rounded-full h-3 overflow-hidden border border-white/5"><div className={`h-full rounded-full transition-all duration-500 ${totalActualCost > budgetMax ? 'bg-red-500' : 'bg-gradient-to-r from-green-500 to-emerald-400'}`} style={{ width: `${Math.min(100, (totalActualCost/budgetMax)*100)}%` }}></div></div></div>
                            <p className="text-[10px] text-center text-dark-text-light mt-3 border-t border-white/5 pt-2">Includes Fixed Salaries: €{totalFixed.toFixed(0)}</p>
                        </div>
                        <div className="bg-dark-surface p-5 rounded-2xl shadow-lg border border-white/10 border-l-4 border-l-blue-500">
                            <h3 className="font-bold mb-4 text-dark-text flex items-center gap-2 uppercase tracking-wider text-sm"><Icon name="Grid" size={16}/> Operational Costs</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-dark-bg p-4 rounded-xl border border-white/5"><p className="text-[10px] text-dark-text-light font-bold uppercase mb-1">Proj. Hourly</p><p className="text-xl font-black text-blue-400">€{totalHourlyEst.toFixed(0)}</p></div>
                                <div className="bg-dark-bg p-4 rounded-xl border border-white/5"><p className="text-[10px] text-dark-text-light font-bold uppercase mb-1">Act. Hourly</p><p className="text-xl font-black text-green-400">€{totalHourlyAct.toFixed(0)}</p></div>
                            </div>
                        </div>
                        <div className="bg-dark-surface rounded-xl border border-white/10 overflow-hidden">
                            <div className="p-3 bg-white/5 border-b border-white/10 flex justify-between items-center"><h4 className="font-bold text-sm text-white">Staff Wage Settings</h4></div>
                            <table className="w-full text-xs"><thead className="bg-dark-bg text-dark-text-light uppercase"><tr><th className="p-3 text-left">Staff</th><th className="p-3 text-left">Type</th><th className="p-3 text-right">Value (€)</th><th className="p-3 text-right">Act Cost</th></tr></thead><tbody className="divide-y divide-white/10">{Object.keys(stats).map(name => { const wage = wages[name] || { type: 'hourly', value: 12 }; return (<tr key={name}><td className="p-3 font-bold text-dark-text">{name}</td><td className="p-3"><select className="bg-dark-bg border border-white/20 rounded px-2 py-1 text-white outline-none focus:border-dark-accent text-[10px]" value={wage.type} onChange={(e) => { const newWages = { ...wages, [name]: { ...wage, type: e.target.value as any } }; saveWages(newWages); }}><option value="hourly">Hourly</option><option value="fixed">Monthly</option></select></td><td className="p-3 text-right"><input type="number" step={wage.type === 'hourly' ? "0.5" : "100"} className="w-20 text-right py-1 rounded bg-dark-bg border border-white/20 text-white font-mono focus:border-dark-accent outline-none px-2" value={wage.value || ''} onChange={(e) => { const val = parseFloat(e.target.value); const newWages = { ...wages, [name]: { ...wage, value: isNaN(val) ? 0 : val } }; saveWages(newWages); }} /></td><td className="p-3 text-right font-mono text-dark-text-light">€{stats[name].actualCost.toFixed(0)}</td></tr>)})}</tbody></table>
                        </div>
                        <div className="bg-dark-surface p-4 rounded-xl border border-white/10 mt-4">
                            <div className="flex items-center justify-between mb-3"><span className="text-xs font-bold text-dark-text-light uppercase">Export Data ({financialMonth})</span></div>
                            <div className="grid grid-cols-2 gap-3"><button onClick={handleExportLogsCSV} className="bg-white/10 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-white/20 transition-all border border-white/5"><Icon name="Clock" size={16} /> Export Logs</button><button onClick={handleExportFinancialCSV} className="bg-green-600 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-green-700 transition-all shadow-lg"><Icon name="List" size={16} /> Summary</button></div>
                        </div>
                    </div>
                )}
                {view === 'logs' && (
                    <div className="space-y-2">
                        <div className="flex justify-end mb-4"><button onClick={() => setIsAddingManualLog(true)} className="bg-dark-accent text-dark-bg px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:opacity-90 transition-all"><Icon name="Plus" size={16} /> Add Manual Log</button></div>
                        {visibleLogs.length === 0 && <p className="text-dark-text-light text-center py-10">No logs found for this branch.</p>}
                        {visibleLogs.map((log: LogEntry) => {
                            if (!log) return null;
                            return (
                            <div key={log.id} className={`bg-dark-surface p-3 rounded-lg shadow-sm text-sm border-l-4 ${log.isDeleted ? 'border-gray-500 opacity-60' : 'border-dark-accent'}`}>
                                <div className="flex justify-between mb-1"><span className="font-bold text-dark-text">{log.name}</span><span className="text-xs text-dark-text-light">{formattedDateSafe(log.time)}</span></div>
                                <div className="flex justify-between items-center"><div><span className={`px-2 py-0.5 rounded text-[10px] ${log.type?.includes('in') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{log.type}</span>{log.isDeleted && <span className="ml-2 text-[10px] font-bold text-gray-400">[INVALIDATED]</span>}{log.isManual && <span className="ml-2 text-[10px] font-bold text-yellow-400">[MANUAL]</span>}</div><div className="flex items-center gap-2"><span className="text-[10px] text-dark-text-light font-mono">{log.reason || '-'}</span>{!log.isDeleted && (<><button onClick={() => handleOpenAdjustModal(log)} className="p-1.5 bg-blue-500/10 text-blue-400 rounded"><Icon name="Edit" size={12}/></button><button onClick={() => setLogToInvalidate(log)} className="p-1.5 bg-red-500/10 text-red-400 rounded"><Icon name="Trash" size={12}/></button></>)}</div></div>
                            </div>
                        )})}
                    </div>
                )}
                {view === 'confirmations' && (
                    <div className="space-y-4">
                        <div className="bg-dark-surface p-4 rounded-xl shadow-sm border border-white/10">
                            <h3 className="font-bold text-dark-text mb-2">Staff Confirmations</h3>
                            <div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead className="text-dark-text-light border-b border-white/10"><tr><th className="p-3">Staff</th><th className="p-3">Status</th><th className="p-3">Viewed</th></tr></thead><tbody className="divide-y divide-white/10">{currentCycle && Object.entries(currentCycle.confirmations || {}).map(([userId, conf]) => { const staff = safeUsers.find((u:User) => u && u.id === userId); const confirmation = conf as any; return (<tr key={userId}><td className="p-3 font-bold">{staff?.name || userId}</td><td className={`p-3 capitalize font-bold ${confirmation.status === 'confirmed' ? 'text-green-400' : 'text-red-400'}`}>{confirmation.status?.replace('_', ' ')}</td><td className="p-3">{confirmation.viewed ? 'Yes' : 'No'}</td></tr>)})}</tbody></table>{!currentCycle && <p className="text-center p-4 text-dark-text-light italic">No schedule published for this branch.</p>}</div>
                        </div>
                    </div>
                )}
            </div>
            {editingShift && <ShiftEditorModal isOpen={!!editingShift} onClose={() => setEditingShift(null)} shiftData={displayedDays[editingShift.dayIdx]?.shifts || []} onSave={handleSaveSchedule} availableStaff={activeStaff.map((u:User) => u.name)} />}
            {isAddingManualLog && <ManualLogModal isOpen={isAddingManualLog} onClose={() => setIsAddingManualLog(false)} onSave={handleSaveManualLog} users={activeStaff} />}
            {logToInvalidate && (<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4"><div className="bg-dark-surface p-6 rounded-2xl border border-white/10 w-full max-w-sm"><h3 className="text-lg font-bold text-red-400 mb-2">Invalidate Log?</h3><p className="text-sm text-dark-text-light mb-6">This will mark the log as deleted and ignore it in financial calculations.</p><div className="flex gap-3"><button onClick={() => setLogToInvalidate(null)} className="flex-1 py-2 rounded-lg bg-white/10 font-bold">Cancel</button><button onClick={() => handleInvalidateConfirm({...logToInvalidate, isDeleted: true})} className="flex-1 py-2 rounded-lg bg-red-600 text-white font-bold">Confirm</button></div></div></div>)}
            {logPairToAdjust && <AdjustHoursModal isOpen={!!logPairToAdjust} onClose={() => setLogPairToAdjust(null)} inLog={logPairToAdjust.inLog} outLog={logPairToAdjust.outLog} onSave={handleSaveAdjustedHours} />}
        </div>
    );
}

// ============================================================================

// ============================================================================
// 组件: 今日盘点结果卡片
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
// 新增组件: 物料报损单 (Waste Report View) [含自动暂存]
// ============================================================================
function WasteReportView({ lang, inventoryList, onSubmit, onCancel, currentUser }: any) {
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
}

// ============================================================================
// 组件 4: 员工端 (Staff App) - [支持门店无缝切换彻底数据隔离]
// ============================================================================
function StaffApp({ onSwitchMode, data, onLogout, currentUser, openAdmin }: { onSwitchMode: () => void, data: any, onLogout: () => void, currentUser: User, openAdmin: () => void }) {
    const { 
        lang, setLang, schedule, notices, t, swapRequests, setSwapRequests, 
        directMessages, setDirectMessages, users, recipes, scheduleCycles, setScheduleCycles, 
        inventoryHistory, inventoryList, setInventoryList, sopList, trainingLevels, stores,
        repairRequests, setRepairRequests
    } = data;
    const { showNotification } = useNotification();

    const [view, setView] = useState<StaffViewMode>('home');
    const [currentShift, setCurrentShift] = useState<string>('opening'); 
    const [hasUnreadChat, setHasUnreadChat] = useState(false);
    const [showAvailabilityReminder, setShowAvailabilityReminder] = useState(false);
    const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
    
    const [recipeSearchQuery, setRecipeSearchQuery] = useState('');
    const [recipeTypeFilter, setRecipeTypeFilter] = useState<'product' | 'premix'>('product');
    const [newRecipesToAck, setNewRecipesToAck] = useState<DrinkRecipe[]>([]);
    const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);
    const recipeReminderCheckDone = useRef(false);

    const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
    const [currentSwap, setCurrentSwap] = useState<{ date: string, shift: 'morning'|'evening'|'night' } | null>(null);
    const [targetEmployeeId, setTargetEmployeeId] = useState('');
    const [reason, setReason] = useState('');
    const [isScheduleReminderOpen, setIsScheduleReminderOpen] = useState(false);
    const [isSwapReminderOpen, setIsSwapReminderOpen] = useState(false);
    const [pendingSwapCount, setPendingSwapCount] = useState(0);
    const scheduleReminderShown = useRef(false);
    const swapReminderShown = useRef(false);

    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';
    const today = new Date();

    // ==========================================
    // 🛡️ 门店视角切换与 100% 严格数据隔离
    // ==========================================
    const userStores = useMemo(() => {
        if (currentUser.role === 'boss' || currentUser.role === 'manager') return stores || [];
        return stores?.filter((s:any) => s.staff?.includes(currentUser.id)) || [];
    }, [stores, currentUser]);

    const [activeStoreId, setActiveStoreId] = useState(() => {
        const saved = localStorage.getItem('onesip_active_store_id');
        if (saved && userStores.some((s:any) => s.id === saved)) return saved;
        return userStores[0]?.id || 'default_store';
    });

    useEffect(() => {
        localStorage.setItem('onesip_active_store_id', activeStoreId);
    }, [activeStoreId]);

    const myStoreId = activeStoreId;
    const myStore = stores?.find((s: any) => s.id === myStoreId);
    const defaultFeatures = { prep: true, waste: true, schedule: true, swap: true, availability: true, sop: true, training: true, recipes: true, chat: true, repair: true };
    const activeFeatures = { ...defaultFeatures, ...(myStore?.features || {}) };
  
    const getStoreId = (item: any) => item.storeId || 'default_store';

    // 【核心修复】：彻底隔离所有数据！库存、历史、换班、聊天、公告全部分离
    const scopedInventoryList = useMemo(() => inventoryList.filter((i:any) => getStoreId(i) === myStoreId), [inventoryList, myStoreId]);
    const scopedInventoryHistory = useMemo(() => inventoryHistory.filter((h:any) => getStoreId(h) === myStoreId), [inventoryHistory, myStoreId]);
    const scopedSwapRequests = useMemo(() => swapRequests.filter((r:any) => getStoreId(r) === myStoreId), [swapRequests, myStoreId]);
    const scopedNotices = useMemo(() => notices.filter((n:any) => getStoreId(n) === myStoreId), [notices, myStoreId]);
    const scopedMessages = useMemo(() => directMessages.filter((m:any) => getStoreId(m) === myStoreId), [directMessages, myStoreId]);
    
    const branchStaffIds = myStore?.staff || [];
    const scopedUsers = useMemo(() => users.filter((u:any) => branchStaffIds.includes(u.id) || u.role === 'boss'), [users, branchStaffIds]);

    const currentCycle = scheduleCycles.find((c: ScheduleCycle) => {
      const start = new Date(c.startDate);
      const end = new Date(c.endDate);
      return today >= start && today <= end && c.status === 'published' && getStoreId(c) === myStoreId;
    });
    const userConfirmation = currentCycle?.confirmations[currentUser.id];

    const activeNotices = scopedNotices.filter((n: Notice) => n.status !== 'cancelled');
    const latestNotice = activeNotices.length > 0 ? activeNotices[activeNotices.length - 1] : null;
    const featuredRecipes = (recipes || []).filter((r: DrinkRecipe) => r.isNew && r.isPublished !== false);

    const m = today.getMonth() + 1;
    const d = today.getDate();
    const todayDateKeys = [`${m}-${d}`, `${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`];
    
    const todaySchedule = schedule?.days?.find((day: any) => todayDateKeys.includes(day.date) && getStoreId(day) === myStoreId);
    const myNameLower = currentUser.name.trim().toLowerCase();
    
    const myShiftsToday = todaySchedule?.shifts?.filter((s: any) => 
        s.staff && s.staff.some((staffName: string) => staffName.trim().toLowerCase() === myNameLower)
    ) || [];
    const hasShiftToday = myShiftsToday.length > 0;

    const hasSubmittedToday = scopedInventoryHistory.some((r: any) =>
        r.submittedBy === currentUser.name &&
        new Date(r.date).toDateString() === today.toDateString() && r.shift !== 'waste'
    );

    const needsToSubmitPrep = activeFeatures.prep && hasShiftToday && !hasSubmittedToday;

    const myNextShift = useMemo(() => {
        if (!activeFeatures.schedule || !schedule?.days) return null;
        const now = new Date();
        const nm = now.getMonth() + 1; const nd = now.getDate();
        const tDateKeys = [`${nm}-${nd}`, `${nm.toString().padStart(2, '0')}-${nd.toString().padStart(2, '0')}`];

        const allShifts = schedule.days.filter((d:any) => getStoreId(d) === myStoreId).flatMap((day: any) => {
            let date = new Date(day.date);
            if (isNaN(date.getTime()) || day.date.indexOf('-') > -1) {
                const parts = day.date.split('-');
                if (parts.length >= 2) {
                    const dm = parseInt(parts[0]); const dd = parseInt(parts[1]);
                    let year = now.getFullYear();
                    if (now.getMonth() === 11 && dm === 1) year++;
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
    }, [schedule, currentUser, t, activeFeatures.schedule, myStoreId]);

    useEffect(() => {
        if (!needsToSubmitPrep) return;
        const timer = setInterval(() => {
            const now = new Date();
            let shouldAlert = false;
            myShiftsToday.forEach((shift: any) => {
                const [endH, endM] = shift.end.split(':').map(Number);
                const shiftEnd = new Date(); shiftEnd.setHours(endH, endM, 0, 0);
                const diffMins = (shiftEnd.getTime() - now.getTime()) / 60000;
                if (diffMins <= 30) shouldAlert = true;
            });

            if (shouldAlert && view !== 'inventory') {
                showNotification({ type: 'clock_out_reminder', title: '🚨 强制盘点提醒 (MANDATORY)', message: lang === 'zh' ? '你的班次即将结束或已结束，请务必前往 [Inventory] 填写今日的备料盘点！' : 'Your shift is ending. Please submit today\'s prep report!', sticky: true, dedupeKey: 'mandatory_prep_reminder' });
            }
        }, 60000); 
        return () => clearInterval(timer);
    }, [needsToSubmitPrep, myShiftsToday, view, showNotification, lang]);

    useEffect(() => {
        if (!activeFeatures.recipes || recipeReminderCheckDone.current || !recipes || !currentUser || recipes.length === 0) return;
        const allNewRecipes = recipes.filter((r: DrinkRecipe) => r.isNew === true);
        if (allNewRecipes.length === 0) { recipeReminderCheckDone.current = true; return; }
        const acknowledgedIds = new Set(currentUser.acknowledgedNewRecipes || []);
        const unacknowledged = allNewRecipes.filter((r: DrinkRecipe) => !acknowledgedIds.has(r.id));
        if (unacknowledged.length > 0) { setTimeout(() => setNewRecipesToAck(unacknowledged), 2000); }
        recipeReminderCheckDone.current = true;
    }, [recipes, currentUser, activeFeatures.recipes]);

    useEffect(() => {
        if (!activeFeatures.schedule || !schedule?.days) return;
        const timer = setInterval(() => {
            const now = new Date();
            const cm = now.getMonth() + 1; const cd = now.getDate();
            const dateKeys = [`${cm}-${cd}`, `${cm.toString().padStart(2, '0')}-${cd.toString().padStart(2, '0')}`];
            const tSchedule = schedule.days.find((day: any) => dateKeys.includes(day.date) && getStoreId(day) === myStoreId);
            if (!tSchedule || !tSchedule.shifts) return;
            const myShifts = tSchedule.shifts.filter((s: any) => s.staff && s.staff.includes(currentUser.name));

            myShifts.forEach((shift: any) => {
                const [startH, startM] = shift.start.split(':').map(Number);
                const shiftStart = new Date(now); shiftStart.setHours(startH, startM, 0, 0);
                const diffStart = (shiftStart.getTime() - now.getTime()) / 60000;
                if (diffStart > 0 && diffStart <= 15) {
                    showNotification({ type: 'announcement', title: 'Upcoming Shift', message: lang === 'zh' ? `你的班次 (${shift.start}) 即将开始！` : `Shift (${shift.start}) starts soon!`, dedupeKey: `shift_start_${dateKeys[0]}_${shift.start}` });
                }
            });
        }, 60000); 
        return () => clearInterval(timer);
    }, [currentUser, schedule, showNotification, lang, activeFeatures.schedule, myStoreId]);

    useEffect(() => {
        if (view !== 'home' || isSwapModalOpen || showAvailabilityModal || showAvailabilityReminder) return;

        const runChecks = async () => {
            if (activeFeatures.swap && !swapReminderShown.current) {
                const pendingSwaps = scopedSwapRequests.filter((r: SwapRequest) => r.targetId === currentUser.id && r.status === 'pending');
                if (pendingSwaps.length > 0) { setPendingSwapCount(pendingSwaps.length); setIsSwapReminderOpen(true); swapReminderShown.current = true; return; }
            }
            if (activeFeatures.schedule && !scheduleReminderShown.current && userConfirmation?.status === 'pending') { setIsScheduleReminderOpen(true); scheduleReminderShown.current = true; }
        };
        const timer = setTimeout(runChecks, 1500);
        return () => clearTimeout(timer);
    }, [currentUser, scopedSwapRequests, schedule, view, isSwapModalOpen, showAvailabilityModal, showAvailabilityReminder, userConfirmation, activeFeatures]);

    useEffect(() => {
        if (!scopedNotices || scopedNotices.length === 0) return;
        const _activeNotices = scopedNotices.filter((n: Notice) => n.status !== 'cancelled');
        if (_activeNotices.length === 0) return;
        const latest = _activeNotices[_activeNotices.length - 1];
        const seenKey = `notice_seen_${latest.id}`;
        const lastSeen = localStorage.getItem(seenKey);
        let shouldShow = false;

        if (!latest.frequency || latest.frequency === 'always') shouldShow = true;
        else if (latest.frequency === 'once') { if (!lastSeen) shouldShow = true; }
        else if (latest.frequency === 'daily') { if (!lastSeen || new Date(parseInt(lastSeen)).toDateString() !== new Date().toDateString()) shouldShow = true; }
        else if (latest.frequency === '3days') { if (!lastSeen || Date.now() - parseInt(lastSeen) > 3 * 86400000) shouldShow = true; }

        if (shouldShow) {
            showNotification({ type: 'announcement', title: t.team_board || 'Announcement', message: latest.content, sticky: latest.frequency === 'always', dedupeKey: latest.id, imageUrl: latest.imageUrl });
            if (latest.frequency !== 'always') localStorage.setItem(seenKey, Date.now().toString());
        }
    }, [scopedNotices, showNotification, t.team_board]);

    const handleSwapAction = async (reqId: string, action: 'accepted_by_peer' | 'rejected') => {
        const req = scopedSwapRequests.find((r: SwapRequest) => r.id === reqId);
        if(!req) return;
        const updatedReq = { ...req, status: action, decidedAt: Date.now() };
        const updatedReqs = swapRequests.map((r: SwapRequest) => (r.id === reqId ? updatedReq : r));
        await Cloud.updateSwapRequests(updatedReqs);
        showNotification({ type: 'message', title: 'Swap Updated', message: `You have ${action === 'accepted_by_peer' ? 'accepted' : 'rejected'} the request.` });
    };

    const handleConfirmSchedule = async () => {
        if (!currentCycle) return;
        const updatedCycle = { ...currentCycle, confirmations: { ...currentCycle.confirmations, [currentUser.id]: { status: 'confirmed', viewed: true } } };
        const updatedCycles = scheduleCycles.map((c: ScheduleCycle) => c.cycleId === updatedCycle.cycleId ? updatedCycle : c);
        await Cloud.updateScheduleCycles(updatedCycles);
        showNotification({ type: 'message', title: 'Schedule Confirmed!', message: 'Thank you.' });
    };

    const handleSendSwapRequest = async () => {
        if (!currentSwap || !targetEmployeeId) { alert("Please select a colleague."); return; }
        const targetUser = scopedUsers.find((u:User) => u.id === targetEmployeeId);
        if (!targetUser) return;

        const newRequest: Omit<SwapRequest, 'id'> = {
            requesterId: currentUser.id, requesterName: currentUser.name, requesterDate: currentSwap.date, requesterShift: currentSwap.shift,
            targetId: targetUser.id, targetName: targetUser.name, targetDate: null, targetShift: null,
            status: 'pending', reason: reason || null, timestamp: Date.now(), storeId: myStoreId
        };
        await Cloud.saveSwapRequest(newRequest);
        showNotification({ type: 'message', title: 'Swap Request Sent', message: `Sent to ${targetUser.name}.` });
        setIsSwapModalOpen(false); setReason(''); setTargetEmployeeId('');
    };

    const ConfirmationBanner = () => {
        if (!currentCycle || !userConfirmation || userConfirmation.status !== 'pending') return null;
        return ( <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-800 p-4 rounded-lg mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in"><div className="flex-1"><h4 className="font-bold">Please Confirm Your Schedule</h4><p className="text-sm mt-1">Review upcoming shifts ({currentCycle.startDate} - {currentCycle.endDate})</p></div><button onClick={handleConfirmSchedule} className="bg-blue-500 text-white font-bold py-2 px-4 rounded-lg text-sm shadow-md w-full sm:w-auto">Confirm Schedule</button></div>);
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
                    weekDays.push({ dateObj: day, dateStr: `${day.getMonth() + 1}-${day.getDate()}`, dayName: day.toLocaleDateString('en-US', { weekday: 'long' }), displayDate: day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isToday: day.toDateString() === todayDate.toDateString() });
                }
                weeksData.push({ id: w, label: w === 0 ? "Current Week" : `Week ${w + 1}`, range: `${weekDays[0].displayDate} - ${weekDays[6].displayDate}`, days: weekDays });
            }
            const scheduleMap = new Map<string, ScheduleDay>((schedule.days || []).filter((d:any)=>getStoreId(d) === myStoreId).map((day: ScheduleDay) => [normalizeDateKey(day.date), day]));

            return (
                <div className="h-full overflow-y-auto p-4 bg-secondary pb-24 text-text">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-black">{t.team_title}</h2></div>
                    <ConfirmationBanner />
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

        // 💡 修复：当点击“培训”时，不再返回空白，而是渲染出上面写好的界面，并传入双份数据！
        if (view === 'training' as any && activeFeatures.training) {
            return (
                <TrainingView 
                    lang={lang} 
                    sopList={sopList} 
                    trainingLevels={trainingLevels} // <--- 把后台 TRAINING 的数据传进去了！
                    onCancel={() => setView('home')}
                  />
            );
        }
                  
        if (view === 'recipes' && activeFeatures.recipes) {
             const filteredRecipes = recipes
                .filter((r: DrinkRecipe) => r.isPublished !== false)
                .filter((r: DrinkRecipe) => (recipeTypeFilter === 'premix' ? r.recipeType === 'premix' : (r.recipeType === 'product' || !r.recipeType)))
                .filter((r: DrinkRecipe) => r.name.en.toLowerCase().includes(recipeSearchQuery.toLowerCase()) || r.name.zh.includes(recipeSearchQuery));

             const renderVideo = (url: string) => {
                 if (url.includes('youtube.com') || url.includes('youtu.be')) {
                     const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
                     const match = url.match(regExp);
                     const yId = (match && match[2].length === 11) ? match[2] : null;
                     return yId ? (<iframe className="w-full aspect-video rounded-lg mt-2 shadow-md" src={`https://www.youtube.com/embed/${yId}`} title="Video" allowFullScreen></iframe>) : null;
                 }
                 return (<video src={url} controls playsInline preload="metadata" className="w-full aspect-video rounded-lg mt-2 shadow-md bg-black object-contain" />);
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
                    lang={lang} t={t} inventoryList={scopedInventoryList} setInventoryList={setInventoryList}
                    onSubmit={(report: any) => {
                        const completeReport = { ...report, id: Date.now().toString(), date: new Date().toISOString(), storeId: myStoreId };
                        Cloud.saveInventoryReport(completeReport);
                        showNotification({ type: 'message', title: 'Saved', message: '盘点记录已提交。' });
                        setView('home');
                    }}
                    currentUser={currentUser} isForced={false} onCancel={() => setView('home')} forcedShift={defaultShift} isOwner={false}
                />
            );
        }

        if (view === 'waste' as any && activeFeatures.waste) {
            return (
                <WasteReportView
                    lang={lang} inventoryList={scopedInventoryList}
                    onSubmit={(report: any) => {
                        const completeReport = { ...report, id: Date.now().toString(), date: new Date().toISOString(), storeId: myStoreId };
                        Cloud.saveInventoryReport(completeReport);
                        showNotification({ type: 'message', title: 'Saved', message: '报损记录已提交。' });
                        setView('home');
                    }}
                    onCancel={() => setView('home')} currentUser={currentUser}
                />
            );
        }
      
        if (view === 'repair' as any && activeFeatures.repair) {
            return (
                <RepairReportView 
                    lang={lang} recipes={recipes} myStoreId={myStoreId} currentUser={currentUser}
                    customDb={myStore?.repairDatabase} // 💡 这里把当前分店自定义的题库传进去
                    onCancel={() => setView('home')}
                    onSubmit={(ticket: any) => {
                        // 💡 修复：加上 data. 前缀，确保系统能找到存储函数并避免崩溃
                        const currentRequests = data.repairRequests || [];
                        const updatedRequests = [...currentRequests, ticket];
                        data.setRepairRequests(updatedRequests);
                        // 💡 推送到云端！
                        if (Cloud.updateRepairRequests) Cloud.updateRepairRequests(updatedRequests);

                        showNotification({ type: 'message', title: '✅ 提交成功', message: '工单已发送，店长和经理将收到提醒！' });
                     }} 
                />
            );
        }
      
        if (view === 'chat' && activeFeatures.chat) { 
            // 确保管理员进入聊天时拥有发布公告等高级权限，并且数据完美隔离
            const isUserAdmin = currentUser.role === 'manager' || currentUser.role === 'boss';
            return <ChatView t={t} currentUser={currentUser} messages={scopedMessages} setMessages={setDirectMessages} notices={scopedNotices} isManager={isUserAdmin} onExit={() => setView('home')} sopList={sopList} trainingLevels={trainingLevels} allUsers={scopedUsers} />; 
        }
        
        if (view === 'swapRequests' && activeFeatures.swap) {
            const myRequests = scopedSwapRequests.filter((r: SwapRequest) => r.requesterId === currentUser.id);
            const incomingRequests = scopedSwapRequests.filter((r: SwapRequest) => r.targetId === currentUser.id && r.status === 'pending');
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
                    {/* 给老板和被分配到多家店的员工增加门店切换器 */}
                    {userStores.length > 1 ? (
                        <select 
                            className="text-primary font-bold text-xs mt-1 px-2 py-1 bg-primary/10 rounded inline-block outline-none border border-primary/20 shadow-sm cursor-pointer"
                            value={activeStoreId}
                            onChange={(e) => setActiveStoreId(e.target.value)}
                        >
                            {userStores.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    ) : (
                        myStore && <p className="text-primary font-bold text-xs mt-1 px-2 py-0.5 bg-primary/10 rounded inline-block">{myStore.name}</p>
                    )}
                </div>
                <div className="flex items-center gap-2"><button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="bg-gray-200 h-9 w-9 flex items-center justify-center rounded-full text-text-light font-bold text-sm">{lang === 'zh' ? 'En' : '中'}</button><button onClick={openAdmin} className="bg-gray-200 h-9 w-9 flex items-center justify-center rounded-full text-text-light"><Icon name="Shield" size={16}/></button><button onClick={onLogout} className="bg-destructive-light h-9 w-9 flex items-center justify-center rounded-full text-destructive"><Icon name="LogOut" size={16}/></button></div>
            </div>

            {needsToSubmitPrep && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-2xl shadow-sm mb-4 relative overflow-hidden animate-fade-in flex items-center justify-between">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500"></div>
                    <div>
                        <h3 className="text-sm font-bold text-red-600 flex items-center gap-1">
                            <Icon name="AlertCircle" size={16}/>
                            {lang === 'zh' ? '盘点未完成' : 'Prep Incomplete'}
                        </h3>
                        <p className="text-xs text-red-500 mt-1">
                            {lang === 'zh' ? '下班前请务必填写今日备料盘点' : 'Please submit today\'s prep before leaving.'}
                        </p>
                    </div>
                    <button onClick={() => setView('inventory')} className="bg-red-500 text-white px-3 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-red-600 active:scale-95">
                        {lang === 'zh' ? '去盘点' : 'Go to Prep'}
                    </button>
                </div>
            )}

            {activeFeatures.recipes && featuredRecipes.length > 0 && (
                <div className="mb-4 animate-fade-in">
                    <h3 className="text-xs font-bold text-red-500 uppercase mb-2 flex items-center gap-1">
                        <Icon name="Flame" size={14}/>
                        {lang === 'zh' ? '新品配方推荐' : 'Featured New Recipes'}
                    </h3>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                        {featuredRecipes.map((recipe: DrinkRecipe) => (
                            <div
                                key={recipe.id}
                                onClick={() => {
                                    setView('recipes');
                                    setRecipeSearchQuery('');
                                    setRecipeTypeFilter(recipe.recipeType || 'product');
                                    setExpandedRecipeId(recipe.id);
                                    setTimeout(() => {
                                        document.getElementById(`recipe-${recipe.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }, 200);
                                }}
                                className="min-w-[240px] bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl p-4 shadow-md text-white shrink-0 relative overflow-hidden cursor-pointer active:scale-95 transition-transform"
                            >
                                <div className="absolute -right-4 -bottom-4 opacity-20"><Icon name="Coffee" size={80}/></div>
                                <h4 className="font-black text-lg mb-1 relative z-10">{recipe.name[lang] || recipe.name.zh}</h4>
                                <p className="text-xs opacity-90 relative z-10">{recipe.cat}</p>
                                <button className="mt-4 bg-white text-red-500 px-4 py-1.5 rounded-full text-xs font-bold relative z-10 shadow-sm hover:bg-gray-50 flex items-center gap-1">
                                    <Icon name="PlayCircle" size={14} /> {lang === 'zh' ? '查看做法' : 'View Recipe'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {latestNotice && (
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl shadow-sm mb-4 relative overflow-hidden animate-fade-in">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                    <div className="flex items-center gap-2 mb-2">
                        <Icon name="Megaphone" size={16} className="text-blue-500"/>
                        <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                            {lang === 'zh' ? '团队公告' : 'Team Announcement'}
                        </h3>
                    </div>
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

            {activeFeatures.prep && (
                <TodaysPrepReports inventoryHistory={scopedInventoryHistory} inventoryList={scopedInventoryList} lang={lang} />
            )}
            {/* 💡 管理层专属：常驻报修提醒看板 */}
            {(currentUser.role === 'manager' || currentUser.role === 'boss') && (
                <div className="mb-6 space-y-3">
                    {data.repairRequests?.filter((r: any) => r.status === 'pending' && (r.storeId || 'default_store') === activeStoreId).length > 0 && (
                        <h3 className="text-xs font-bold text-orange-600 uppercase flex items-center gap-1">
                            <Icon name="AlertTriangle" size={14}/>
                            {lang === 'zh' ? '待处理报修任务' : 'Pending Repairs'}
                        </h3>
                    )}
                    {data.repairRequests
                        ?.filter((r: any) => r.status === 'pending' && (r.storeId || 'default_store') === activeStoreId)
                        .slice().reverse() // 最新的在最上面
                        .map((ticket: any) => (
                            <div key={ticket.id} className="bg-white border-2 border-orange-200 p-4 rounded-2xl shadow-sm relative overflow-hidden animate-pulse-slow">
                                <div className="absolute top-0 right-0 bg-orange-100 text-orange-600 text-[10px] px-2 py-1 font-black rounded-bl-lg uppercase tracking-wider">Urgent</div>
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">{ticket.category}</p>
                                        <h4 className="font-black text-gray-800">{ticket.item}</h4>
                                    </div>
                                </div>
                                <div className="bg-orange-50 p-2 rounded-lg mb-3">
                                    <p className="text-xs text-orange-800 line-clamp-2 italic">"{ticket.issues?.join('、') || ticket.notes}"</p>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] text-gray-500 font-bold">From: {ticket.submittedBy} • {new Date(ticket.date).toLocaleDateString()}</span>
                                    <button 
                                        onClick={() => {
                                            if(!window.confirm(lang === 'zh' ? "确认此问题已解决？" : "Mark as resolved?")) return;
                                            const updated = data.repairRequests.map((r:any) => r.id === ticket.id ? {...r, status: 'resolved', resolvedAt: Date.now()} : r);
                                            data.setRepairRequests(updated);
                                            showNotification({ type: 'message', title: 'Task Completed', message: '报修单已归档。' });
                                        }}
                                        className="bg-orange-500 text-white px-3 py-1.5 rounded-xl text-[10px] font-black shadow-md hover:bg-orange-600 active:scale-95 transition-all"
                                    >
                                        {lang === 'zh' ? '标记解决' : 'RESOLVE'}
                                    </button>
                                </div>
                            </div>
                        ))
                    }
                </div>
            )}

            <div className="mt-4">
                <h3 className="font-bold text-text mb-2">My Modules</h3>
                <div className="grid grid-cols-2 gap-3">
                    {/* 💡 新增：培训与SOP模块入口 */}
                    {activeFeatures.training && (
                        <button onClick={() => setView('training' as any)} className="bg-blue-50 p-4 rounded-2xl shadow-sm border border-blue-100 text-left active:scale-95 transition-transform">
                            <Icon name="Award" className="mb-1 text-blue-500"/>
                            <p className="font-bold text-blue-700">{lang === 'zh' ? 'SOP与培训' : 'Training & SOP'}</p>
                        </button>
                    )}
                    {activeFeatures.waste && (
                        <button onClick={() => setView('waste' as any)} className="bg-red-50 p-4 rounded-2xl shadow-sm border border-red-100 text-left active:scale-95 transition-transform">
                            <Icon name="Trash" className="mb-1 text-red-500"/>
                            <p className="font-bold text-red-700">{lang === 'zh' ? '物料报损' : 'Waste Report'}</p>
                        </button>
                    )}
                    {activeFeatures.repair && (
                        <button onClick={() => setView('repair' as any)} className="bg-orange-50 p-4 rounded-2xl shadow-sm border border-orange-100 text-left active:scale-95 transition-transform">
                            <Icon name="Wrench" className="mb-1 text-orange-500"/>
                            <p className="font-bold text-orange-700">{lang === 'zh' ? '异常提报' : 'Report Issue'}</p>
                        </button>
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
        if (v !== 'recipes') {
            setExpandedRecipeId(null);
            setRecipeSearchQuery('');
        }
    };

    return (
        <div className="max-w-md mx-auto bg-surface shadow-lg h-[100dvh] overflow-hidden flex flex-col relative pt-[calc(env(safe-area-inset-top)_+_1rem)]">
            {view === 'home' ? renderHomeView() : renderView()}
            {currentUser && <StaffBottomNav activeView={view} setActiveView={handleNavSwitch} t={t} hasUnreadChat={hasUnreadChat} features={activeFeatures} />}
            <AvailabilityReminderModal isOpen={showAvailabilityReminder} onConfirm={() => { setShowAvailabilityReminder(false); setShowAvailabilityModal(true); }} onCancel={() => setShowAvailabilityReminder(false)} t={t} />
            {currentUser && <AvailabilityModal isOpen={showAvailabilityModal} onClose={() => setShowAvailabilityModal(false)} t={t} currentUser={currentUser} />}
            <SwapRequestModal isOpen={isSwapModalOpen} onClose={() => { setIsSwapModalOpen(false); setTargetEmployeeId(''); setReason(''); }} onSubmit={handleSendSwapRequest} currentSwap={currentSwap} currentUser={currentUser} allUsers={scopedUsers} targetEmployeeId={targetEmployeeId} setTargetEmployeeId={setTargetEmployeeId} reason={reason} setReason={setReason} />
            <ActionReminderModal isOpen={isScheduleReminderOpen} title="排班确认提醒" message="你未来两周有排班安排，请尽快确认。" confirmText="去排班页面" cancelText="稍后" onConfirm={() => { setView('team'); setIsScheduleReminderOpen(false); }} onCancel={() => setIsScheduleReminderOpen(false)} />
            <ActionReminderModal isOpen={isSwapReminderOpen} title="换班申请提醒" message={`你有 ${pendingSwapCount} 条待处理的换班申请，请尽快处理。`} confirmText="去处理" cancelText="稍后" onConfirm={() => { setView('swapRequests'); setIsSwapReminderOpen(false); }} onCancel={() => setIsSwapReminderOpen(false)} />
        </div>
    );
}
  
// ============================================================================
// 组件: 底部导航栏 (StaffBottomNav)
// ============================================================================
function StaffBottomNav({ activeView, setActiveView, t, hasUnreadChat, features }: any) {
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
}

// ============================================================================
// 组件 5: 店长总控台 (Owner Dashboard) - [自动分店识别 + 0117密码锁]
// ============================================================================
function OwnerDashboard({ data, onExit, currentUser, adminMode }: { data: any, onExit: () => void, currentUser?: any, adminMode?: string }) {
    const { showNotification } = useNotification();
    const { lang, t, inventoryList, setInventoryList, inventoryHistory, users, logs, smartReports, stores, setStores, schedule, setSchedule } = data;
    const ownerUser = users.find((u:User) => u.role === 'boss') || { id: 'u_owner', name: 'Owner', role: 'boss' };
    const [view, setView] = useState<'main' | 'manager'>('main');
    const [ownerSubView, setOwnerSubView] = useState<'stores' | 'presets' | 'history' | 'smart' | 'smart_history' | 'staff' | 'logs' | 'repair'>('presets');
    const [isEditingRepairDb, setIsEditingRepairDb] = useState(false);
  
    // ==========================================
    // 🔐 分店管理模块密码锁
    // ==========================================
    const [isStoreUnlocked, setIsStoreUnlocked] = useState(false);
    const [pinInput, setPinInput] = useState('');


    // ==========================================
    // 🛡️ 智能权限与分店识别
    // ==========================================
    const safeStores = Array.isArray(stores) && stores.length > 0 ? stores : [{ id: 'default_store', name: 'Main Store', staff: [], features: { prep: true, waste: true, schedule: true, swap: true, availability: true, sop: true, training: true, recipes: true, chat: true, repair: true } }];
    
    // 识别当前登录员工属于哪个门店
    const myStore = currentUser ? safeStores.find((s:any) => s.staff?.includes(currentUser.id)) : null;
    const initialStoreId = myStore ? myStore.id : safeStores[0].id;
    
    const [adminStoreId, setAdminStoreId] = useState(initialStoreId);

    // 判断是否为大老板 (可以切换任意门店)
    const isBoss = adminMode === 'owner' || currentUser?.role === 'boss';

    // 💡 实时监听新报修工单并弹窗 (挪到这里就绝对安全了！！)
    const prevRepairsLength = useRef(data.repairRequests?.length || 0);
    useEffect(() => {
        const currentLen = data.repairRequests?.length || 0;
        if (currentLen > prevRepairsLength.current) {
            const newTicket = data.repairRequests[currentLen - 1];
            if ((newTicket.storeId || 'default_store') === adminStoreId) {
                showNotification({ type: 'announcement', title: '🚨 新异常提报 (New Ticket)', message: `${newTicket.submittedBy} 提交了关于 [${newTicket.item}] 的报修，请前往 Tickets 查看！`, sticky: true });
            }
        }
        prevRepairsLength.current = currentLen;
    }, [data.repairRequests, adminStoreId, showNotification]);

    const scopedInventoryList = inventoryList.filter((i:any) => (i.storeId || 'default_store') === adminStoreId);
    const scopedHistory = inventoryHistory.filter((h:any) => (h.storeId || 'default_store') === adminStoreId);
    const scopedSmartReports = smartReports.filter((r:any) => (r.storeId || 'default_store') === adminStoreId);
    const scopedLogs = logs.filter((l:any) => (l.storeId || 'default_store') === adminStoreId);
    const scopedRepairs = (data.repairRequests || []).filter((r:any) => (r.storeId || 'default_store') === adminStoreId);
  
    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';

    const handleUpdateInventoryList = (newList: any[]) => {
        const others = inventoryList.filter((i:any) => (i.storeId || 'default_store') !== adminStoreId);
        const mapped = newList.map(i => ({ ...i, storeId: adminStoreId }));
        const merged = [...others, ...mapped];
        setInventoryList(merged);
        Cloud.saveInventoryList(merged);
    };

    const handleSaveSmartReport = async (report: any) => {
        try {
            const scopedReport = { ...report, storeId: adminStoreId };
            await Cloud.saveSmartInventoryReport(scopedReport);
            setOwnerSubView('smart_history'); 
        } catch (error) { alert("Error uploading report."); }
    };

    const handleExportPrepCsv = () => { 
         if (scopedHistory.length === 0) return alert("No prep history found to export.");
         let csvContent = "\uFEFFDate,Type,Staff,Item,Added,Waste/Loss,Reason\n";
         scopedHistory.forEach((r: any) => {
            if (r && r.data) {
                Object.entries(r.data).forEach(([id, val]: any) => {
                     const itemDef = inventoryList.find((i:any) => i.id === id);
                     const cleanName = (itemDef ? getLoc(itemDef.name) : id).replace(/"/g, '""');
                     const isWaste = r.shift === 'waste';
                     csvContent += `"${r.date}","${r.shift}","${r.submittedBy}","${cleanName}",${!isWaste ? (val.end ?? 0) : 0},${isWaste ? (val.loss ?? 0) : 0},"${val.reason || ''}"\n`;
                });
            }
         });
         const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })); link.download = `prep_history_${adminStoreId}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const handleExportSmartCsv = () => {
        if (scopedSmartReports.length === 0) return alert("No reports found to export.");
        let csvContent = "\uFEFFWeek,Date Range,Submitted By,Item Name,Category,Supplier,Count (Rem),Add (New),Total Stock,Safety Stock,Status\n";
        scopedSmartReports.forEach((report: any) => {
            if (!report || report.status === 'deleted') return;
            (report.items || []).forEach((item: any) => {
                if (!item) return;
                const name = (item.name || 'Unknown').replace(/"/g, '""'); 
                csvContent += `"${report.weekStr || '-'}","${report.dateRange || '-'}","${report.submittedBy || '-'}","${name}","${item.category || '-'}","${item.supplier || '-'}",${item.count ?? 0},${item.added ?? 0},${item.currentStock ?? 0},${item.safetyStock ?? 0},"${item.status || '-'}"\n`;
            });
        });
        const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })); link.download = `smart_warehouse_${adminStoreId}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    if (view === 'manager') return (
        <div className="flex flex-col h-[100dvh] bg-dark-bg">
            <div className="p-4 bg-dark-surface flex justify-between items-center border-b border-white/10">
                <h2 className="font-black text-white text-lg">Branch Manager: {safeStores.find((s:any)=>s.id===adminStoreId)?.name}</h2>
                <button onClick={() => setView('main')} className="bg-white/10 px-4 py-2 rounded-lg text-white font-bold text-xs">Back to Admin</button>
            </div>
            <div className="flex-1 overflow-hidden">
                <ManagerDashboard data={data} adminStoreId={adminStoreId} onExit={() => setView('main')} />
            </div>
        </div>
    );
    
    return (
        <div className="min-h-screen max-h-[100dvh] overflow-hidden flex flex-col bg-dark-bg text-dark-text font-sans pt-[calc(env(safe-area-inset-top)_+_2rem)] md:pt-0">
            <div className="bg-dark-surface p-4 shadow-lg flex justify-between items-center shrink-0 border-b border-white/10">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-black tracking-tight text-white hidden md:block">Admin Panel</h1>
                    <select 
                        value={adminStoreId} 
                        onChange={e => setAdminStoreId(e.target.value)}
                        disabled={!isBoss}
                        className={`bg-dark-bg border border-white/20 rounded-lg px-3 py-2 text-white font-bold outline-none focus:border-dark-accent text-sm shadow-inner ${!isBoss ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        {safeStores.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setView('manager')} className="bg-blue-600/20 text-blue-400 p-2 rounded hover:bg-blue-600/30 transition-all text-xs font-bold px-3">Manager Mode</button>
                    <button onClick={onExit} className="bg-red-500/10 text-red-400 p-2 rounded hover:bg-red-500/20 transition-all"><Icon name="LogOut" /></button>
                </div>
            </div>
            
            <div className="flex bg-dark-bg p-2 gap-2 overflow-x-auto shrink-0 shadow-inner">
                <button onClick={() => setOwnerSubView('stores')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'stores' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Branch Mgmt</button>
                <div className="w-px bg-white/10 mx-1"></div>
                <button onClick={() => setOwnerSubView('presets')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'presets' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Prep Target</button>
                <button onClick={() => setOwnerSubView('history')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'history' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Prep History</button>
                <div className="w-px bg-white/10 mx-1"></div>
                <button onClick={() => setOwnerSubView('smart')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'smart' ? 'bg-purple-600 text-white shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Smart WH</button>
                <button onClick={() => setOwnerSubView('smart_history')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'smart_history' ? 'bg-purple-900/50 text-purple-200 border border-purple-500/30' : 'text-dark-text-light hover:bg-white/10'}`}>WH History</button>
                <div className="w-px bg-white/10 mx-1"></div>
                <button onClick={() => setOwnerSubView('staff')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'staff' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Global Staff</button>
                <button onClick={() => setOwnerSubView('logs')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'logs' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Branch Logs</button>
                <button onClick={() => setOwnerSubView('repair' as any)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'repair' ? 'bg-orange-500 text-white shadow' : 'text-dark-text-light hover:bg-white/10'}`}>Tickets</button>
            </div>

            <div className="flex-1 overflow-y-auto relative">
                {/* 分店管理 - 密码锁验证区 */}
                {ownerSubView === 'stores' && !isStoreUnlocked && (
                    <div className="absolute inset-0 z-50 bg-dark-bg flex flex-col items-center justify-center p-6 animate-fade-in">
                        <div className="bg-dark-surface p-8 rounded-3xl border border-white/10 text-center shadow-2xl max-w-sm w-full">
                            <Icon name="Lock" size={40} className="mx-auto mb-4 text-dark-accent" />
                            <h3 className="font-black text-xl text-white mb-2">Restricted Area</h3>
                            <p className="text-xs text-dark-text-light mb-6">Please enter the security PIN to manage branches.</p>
                            <input 
                                type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} 
                                className="w-full text-center text-3xl tracking-[0.5em] p-4 bg-dark-bg border border-white/20 rounded-xl mb-6 font-black text-white outline-none focus:border-dark-accent" 
                                placeholder="PIN" autoFocus maxLength={4} 
                                onKeyDown={e => {
                                    if(e.key === 'Enter') {
                                        if (pinInput === '0117') { setIsStoreUnlocked(true); setPinInput(''); } 
                                        else { alert("Incorrect PIN"); setPinInput(''); }
                                    }
                                }}
                            />
                            <button onClick={() => { if(pinInput === '0117') { setIsStoreUnlocked(true); setPinInput(''); } else { alert("Incorrect PIN"); setPinInput(''); } }} className="w-full py-3 rounded-xl bg-dark-accent text-dark-bg font-bold text-lg active:scale-95 transition-transform">Unlock</button>
                        </div>
                    </div>
                )}
                {ownerSubView === 'stores' && isStoreUnlocked && <StoreManagementView data={data} />}
                
                {ownerSubView === 'presets' && <InventoryView lang={lang} t={t} inventoryList={scopedInventoryList} onUpdateInventoryList={handleUpdateInventoryList} isOwner={true} currentUser={ownerUser} />}
                
                {ownerSubView === 'history' && (
                    <div className="p-4 space-y-3">
                        <div className="flex justify-between items-center"><h3 className="text-lg font-bold text-dark-text">Prep & Waste History</h3><button onClick={handleExportPrepCsv} className="bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2"><Icon name="List" size={16} /> Export</button></div>
                        {scopedHistory.length === 0 && <p className="text-dark-text-light text-center py-10">No history found for this branch.</p>}
                        {scopedHistory.slice().reverse().map((report: any) => (
                            <div key={report.id} className="bg-dark-surface p-3 rounded-xl border border-white/10 mb-3">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-sm text-white">{new Date(report.date).toLocaleString()}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${report.shift === 'waste' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-purple-300'}`}>{report.shift === 'waste' ? 'WASTE/LOSS' : report.shift}</span>
                                    </div>
                                    <span className="text-xs text-dark-text-light font-bold">{report.submittedBy}</span>
                                </div>
                                <div className="text-xs text-dark-text-light mt-2 pt-2 border-t border-white/5 space-y-1">
                                    {Object.entries(report.data || {}).map(([itemId, val]: any) => {
                                        const itemDef = inventoryList.find((i: any) => i.id === itemId);
                                        return (
                                            <div key={itemId} className="flex justify-between">
                                                <span>{itemDef ? getLoc(itemDef.name) : itemId}</span>
                                                {report.shift === 'waste' ? <span className="text-red-400">-{val.loss} ({val.reason})</span> : <span className="text-green-400">+{val.end}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {ownerSubView === 'smart' && <SmartInventoryView data={data} onSaveReport={handleSaveSmartReport} />}
                
                {ownerSubView === 'smart_history' && (
                    <div className="p-4 space-y-3">
                        <div className="flex justify-between items-center"><h3 className="text-lg font-bold text-dark-text">Warehouse Weekly Reports</h3><button onClick={handleExportSmartCsv} className="bg-purple-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2"><Icon name="List" size={16} /> Export CSV</button></div>
                        {scopedSmartReports.length === 0 && <p className="text-dark-text-light text-center py-10">No warehouse reports for this branch.</p>}
                        {scopedSmartReports.slice().reverse().map((report: any) => {
                            if (report.status === 'deleted') return null;
                            return (
                                <div key={report.id} className="bg-dark-surface p-3 rounded-xl border border-white/10 group mb-3">
                                    <div className="flex justify-between items-center">
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-white flex items-center gap-2">{report.weekStr} <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-dark-text-light font-normal">{(report.items || []).length} items</span></p>
                                            <p className="text-xs text-dark-text-light mt-0.5">{report.dateRange} • by {report.submittedBy}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 pt-3 border-t border-white/10 text-xs space-y-2 max-h-60 overflow-y-auto animate-fade-in">
                                        <div className="grid grid-cols-4 font-bold text-dark-text-light mb-1"><span className="col-span-2">Item</span><span className="text-center">Stock</span><span className="text-center">Status</span></div>
                                        {(report.items || []).map((item: any, idx: number) => (
                                            <div key={idx} className="grid grid-cols-4 items-center py-1 border-b border-white/5 last:border-0 hover:bg-white/5"><span className="col-span-2 text-white truncate">{item.name}</span><span className={`text-center font-mono ${item.currentStock === 0 ? 'text-gray-500' : 'text-purple-300 font-bold'}`}>{item.currentStock}</span><span className={`text-center font-bold ${item.status==='LOW'?'text-red-400':'text-green-400'}`}>{item.status}</span></div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                
                {ownerSubView === 'staff' && <StaffManagementView data={data} />}
                {ownerSubView === 'logs' && <OwnerInventoryLogsView logs={scopedLogs} currentUser={ownerUser} onUpdateLogs={(l:any) => Cloud.updateLogs(l)} />}
                
                {ownerSubView === 'repair' && (
                    <div className="p-4 space-y-3">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">Maintenance Tickets</h3>
                            {!isEditingRepairDb && (
                                <button onClick={() => setIsEditingRepairDb(true)} className="bg-white/10 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-white/20 transition-all">
                                    <Icon name="Edit" size={14} className="inline mr-1"/> Config Categories
                                </button>
                            )}
                        </div>
                        
                        {isEditingRepairDb ? (
                            <RepairConfigEditor 
                                store={safeStores.find((s:any)=>s.id===adminStoreId)} 
                                onSave={async (newDb: any) => {
                                    const newStores = safeStores.map((s:any) => s.id === adminStoreId ? { ...s, repairDatabase: newDb } : s);
                                    data.setStores(newStores);
                                    if (Cloud.updateStores) await Cloud.updateStores(newStores);
                                    alert("✅ Database configuration saved for this branch!");
                                    setIsEditingRepairDb(false);
                                }} 
                                onCancel={() => setIsEditingRepairDb(false)} 
                            />
                        ) : (
                            <>
                                {scopedRepairs.length === 0 && <p className="text-dark-text-light text-center py-10">No pending tickets for this branch.</p>}
                                {/* 待处理工单 */}
                                {scopedRepairs.filter((r:any) => r.status === 'pending').slice().reverse().map((ticket: any) => (
                                    <div key={ticket.id} className="bg-orange-500/10 p-4 rounded-xl border border-orange-500/30 mb-3 animate-fade-in">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className="text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider">{ticket.category}</span>
                                                <h4 className="font-bold text-orange-400 mt-1">{ticket.item}</h4>
                                            </div>
                                            <span className="text-xs text-dark-text-light font-mono">{new Date(ticket.date).toLocaleString()}</span>
                                        </div>
                                        <div className="bg-dark-bg p-3 rounded-lg mt-2">
                                            <ul className="list-disc pl-4 text-xs text-white space-y-1 mb-2">
                                                {(ticket.issues || []).map((iss:string, i:number) => <li key={i}>{iss}</li>)}
                                            </ul>
                                            {ticket.notes && <p className="text-xs text-gray-400 border-t border-white/10 pt-2 font-mono">备注: {ticket.notes}</p>}
                                        </div>
                                        <div className="flex justify-between items-center mt-3 pt-3 border-t border-orange-500/20">
                                            <span className="text-xs text-dark-text-light">By: <strong className="text-white">{ticket.submittedBy}</strong></span>
                                            <button 
                                                onClick={() => {
                                                    if(!window.confirm("Mark this ticket as RESOLVED?")) return;
                                                    const updated = data.repairRequests.map((r:any) => r.id === ticket.id ? {...r, status: 'resolved', resolvedAt: Date.now()} : r);
                                                    data.setRepairRequests(updated);
                                                    if (Cloud.updateRepairRequests) Cloud.updateRepairRequests(updated);
                                                }} 
                                                className="bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold px-4 py-2 rounded-lg shadow-md transition-all active:scale-95"
                                            >
                                                <Icon name="CheckCircle2" size={14} className="inline mr-1" /> Mark Resolved
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* 已解决记录 */}
                                <h4 className="text-sm font-bold text-gray-500 mt-8 mb-2 border-b border-white/10 pb-2">Resolved History</h4>
                                {scopedRepairs.filter((r:any) => r.status === 'resolved').slice().reverse().map((ticket: any) => (
                                    <div key={ticket.id} className="bg-dark-surface p-3 rounded-xl border border-green-500/20 mb-2 opacity-70">
                                        <div className="flex justify-between items-center"><span className="text-sm font-bold text-gray-400 line-through">{ticket.item}</span><span className="text-[10px] text-green-500 font-bold"><Icon name="Check" size={12} className="inline"/> Resolved</span></div>
                                        <p className="text-[10px] text-dark-text-light mt-1">Reported: {new Date(ticket.date).toLocaleDateString()} | Fixed: {new Date(ticket.resolvedAt).toLocaleDateString()}</p>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
function App() {
    const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('onesip_lang') as Lang) || 'zh');
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [adminMode, setAdminMode] = useState<'manager' | 'owner' | 'editor' | null>(null);
    const [adminModalOpen, setAdminModalOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showCloudSetup, setShowCloudSetup] = useState(false);
    const [storeAuthInput, setStoreAuthInput] = useState('');
    const [isStoreAuthModalOpen, setIsStoreAuthModalOpen] = useState(false);
    
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
    const [smartInventory, setSmartInventory] = useState<any[]>([]);
    const [sopList, setSopList] = useState<SopItem[]>(SOP_DATABASE);
    const [trainingLevels, setTrainingLevels] = useState<TrainingLevel[]>(TRAINING_LEVELS);
    const [recipes, setRecipes] = useState<DrinkRecipe[]>(DRINK_RECIPES);
    const [confirmations, setConfirmations] = useState<ScheduleConfirmation[]>([]);
    const [scheduleCycles, setScheduleCycles] = useState<ScheduleCycle[]>([]);
    const [smartInventoryReports, setSmartInventoryReports] = useState<SmartInventoryReport[]>([]);

    // 💡 1. 必须先定义 repairRequests，否则系统会崩溃找不到它！
    const [repairRequests, setRepairRequests] = useState<any[]>(() => {
        const saved = localStorage.getItem('onesip_repair_requests_v1');
        return saved ? JSON.parse(saved) : [];
    });

    // 💡 2. 定义 stores
    const [stores, setStores] = useState<any[]>(() => {
        const saved = localStorage.getItem('onesip_stores_v1');
        if (saved) return JSON.parse(saved);
        return [{ id: 'default_store', name: 'Main Store', staff: STATIC_USERS.map((u:User)=>u.id), features: { prep: true, waste: true, schedule: true, swap: true, availability: true, sop: true, training: true, recipes: true, chat: true, repair: true } }];
    });

    const t = TRANSLATIONS[lang];

    // 💡 3. 最后组装 appData。此时上面的所有变量都已经定义完毕，绝对安全！
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
        stores, setStores,
        repairRequests, setRepairRequests
    };

    useEffect(() => { 
        localStorage.setItem('onesip_repair_requests_v1', JSON.stringify(repairRequests)); 
    }, [repairRequests]);

    useEffect(() => {
        // 监听其他标签页（比如员工端）的数据变化，实现瞬间同步
        const handleStorage = (e: StorageEvent) => {
            if (e.key === 'onesip_repair_requests_v1' && e.newValue) setRepairRequests(JSON.parse(e.newValue));
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    useEffect(() => { localStorage.setItem('onesip_stores_v1', JSON.stringify(stores)); }, [stores]);

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
            Cloud.subscribeToSmartInventoryReports(setSmartInventoryReports),
            
            // 💡 新增这行：实时监听云端的分店数据变化！
            (Cloud.subscribeToStores ? Cloud.subscribeToStores(setStores) : () => {}),
            // 💡 新增：全网实时监听报修单的变动！
            (Cloud.subscribeToRepairRequests ? Cloud.subscribeToRepairRequests(setRepairRequests) : () => {})
        ];

        setTimeout(() => setIsLoading(false), 800);
        return () => { unsubs.forEach(unsub => unsub && unsub()); };
    }, []);

    useEffect(() => { localStorage.setItem('onesip_lang', lang); }, [lang]);

    const handleLogin = (user: User, keepLoggedIn: boolean) => { setCurrentUser(user); };
    const handleLogout = () => { setCurrentUser(null); setAdminMode(null); };

    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-secondary text-primary font-bold animate-pulse">Loading ONESIP...</div>;
    if (adminMode === 'editor') return <EditorDashboard data={appData} onExit={() => setAdminMode(null)} />;
    
    if (adminMode === 'owner' || adminMode === 'manager') {
        return (
            <OwnerDashboard data={appData} currentUser={currentUser} adminMode={adminMode} onExit={() => setAdminMode(null)} />
        );
    }

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
            {showCloudSetup && <CloudSetupModal isOpen={showCloudSetup} onClose={() => setShowCloudSetup(false)} />}
        </>
    );
}

export default App;
