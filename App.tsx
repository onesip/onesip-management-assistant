
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Icon } from './components/Icons';
import { TRANSLATIONS, CHECKLIST_TEMPLATES, DRINK_RECIPES, TRAINING_LEVELS, SOP_DATABASE, CONTACTS_DATA, INVENTORY_ITEMS, USERS as STATIC_USERS } from './constants';
import { Lang, LogEntry, DrinkRecipe, TrainingLevel, InventoryItem, Notice, InventoryReport, SopItem, User, DirectMessage, SwapRequest, SalesRecord, StaffViewMode, ScheduleDay, InventoryLog, StaffAvailability, ChatReadState, UserRole } from './types';
import * as Cloud from './services/cloud';
import { getChatResponse } from './services/geminiService';
import { useNotification } from './components/GlobalNotification';

// --- CONSTANTS ---
const STORE_COORDS = { lat: 51.9207886, lng: 4.4863897 };
const AI_BOT_ID = 'u_ai_assistant';

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

function getYouTubeId(url: string | undefined) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

const getStartOfWeek = (date: Date, weekOffset = 0) => {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay() + 1 + (weekOffset * 7)); // +1 for Monday start
    if (d.getDay() === 0) d.setDate(d.getDate() - 7); // Adjust if getDay() is Sunday
    d.setHours(0,0,0,0);
    return d;
}

const formatDateISO = (date: Date) => date.toISOString().split('T')[0];

// --- MODALS ---

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

const ScheduleEditorModal = ({ isOpen, day, shiftType, currentStaff, currentHours, onClose, onSave, teamMembers }: any) => {
    const [selectedStaff, setSelectedStaff] = useState<string[]>(currentStaff || []);
    const [startTime, setStartTime] = useState(currentHours?.start || (shiftType === 'morning' ? '10:00' : shiftType === 'evening' ? '14:30' : '18:00'));
    const [endTime, setEndTime] = useState(currentHours?.end || (shiftType === 'morning' ? '15:00' : shiftType === 'evening' ? '19:00' : '22:00'));

    if (!isOpen) return null;

    const toggleStaff = (name: string) => {
        if (selectedStaff.includes(name)) {
            setSelectedStaff(selectedStaff.filter(s => s !== name));
        } else {
            if (selectedStaff.length >= 4) return alert("Max 4 staff per shift");
            setSelectedStaff([...selectedStaff, name]);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-pop-in">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-black text-text">{day.name} - <span className="capitalize text-primary">{shiftType}</span></h3>
                    <button onClick={onClose}><Icon name="X" /></button>
                </div>

                <div className="mb-4 bg-secondary p-3 rounded-xl border border-gray-100">
                    <label className="block text-xs font-bold text-text-light mb-2 uppercase">Shift Hours</label>
                    <div className="flex gap-2 items-center">
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="bg-surface border rounded p-2 text-sm font-bold flex-1" />
                        <span className="text-gray-400">-</span>
                        <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="bg-surface border rounded p-2 text-sm font-bold flex-1" />
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-text-light mb-2 uppercase">Select Staff</label>
                    <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                        {teamMembers.map((member: User) => (
                            <button 
                                key={member.id} 
                                onClick={() => toggleStaff(member.name)}
                                className={`p-2 rounded-lg text-xs font-bold transition-all ${selectedStaff.includes(member.name) ? 'bg-primary text-white shadow-md' : 'bg-secondary text-text-light hover:bg-gray-200'}`}
                            >
                                {member.name}
                            </button>
                        ))}
                    </div>
                </div>

                <button 
                    onClick={() => onSave(selectedStaff, { start: startTime, end: endTime })} 
                    className="w-full bg-primary text-white py-3 rounded-xl font-bold shadow-lg"
                >
                    Save Schedule
                </button>
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
    const nextWeekStart = getStartOfWeek(new Date(), 1);
    const nextWeekStartISO = formatDateISO(nextWeekStart);
    const days = Array.from({ length: 7 }).map((_, i) => { const d = new Date(nextWeekStart); d.setDate(d.getDate() + i); return d; });

    useEffect(() => {
        if (isOpen) {
            setIsLoading(true);
            Cloud.getStaffAvailability(currentUser.id, nextWeekStartISO).then(data => {
                if (data) setSlots(data.slots || {});
                else setSlots({});
                setIsLoading(false);
            });
        }
    }, [isOpen, currentUser.id, nextWeekStartISO]);

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
        await Cloud.saveStaffAvailability(currentUser.id, nextWeekStartISO, slots);
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
                        const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });
                        return (
                            <div key={dateISO} className="bg-secondary p-4 rounded-xl">
                                <h3 className="font-bold mb-2">{dayName} <span className="text-text-light font-normal text-sm">{dateISO}</span></h3>
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

const InventoryView = ({ lang, t, inventoryList, setInventoryList, isOwner, onSubmit, currentUser, isForced, onCancel }: any) => {
    // Staff state
    const [employee, setEmployee] = useState(currentUser?.name || ''); 
    const [inputData, setInputData] = useState<Record<string, { end: string, waste: string }>>({});
    
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
        const newItem: InventoryItem = { id: `inv_${Date.now()}`, name: newItemName, unit: 'unit', defaultVal: '' };
        const updatedList = [...localInventory, newItem];
        setLocalInventory(updatedList);
        Cloud.saveInventoryList(updatedList);
        setNewItemName({ zh: '', en: '' });
    };
    
    const handleOwnerPresetChange = (id: string, value: string) => {
        setLocalInventory(prev => prev.map(item => item.id === id ? { ...item, defaultVal: value } : item));
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
                        <div key={item.id} className="bg-dark-bg p-3 rounded-xl border border-white/10 flex items-center justify-between">
                            <div className="flex-1">
                                <div className="font-bold text-sm text-dark-text">{item.name.en}</div>
                                <div className="text-[10px] text-dark-text-light">{item.unit}</div>
                            </div>
                            <div className="flex gap-2 w-2/5">
                                <input type="text" placeholder="Preset Value" value={item.defaultVal || ''} onChange={(e) => handleOwnerPresetChange(item.id, e.target.value)} className="w-full p-2 rounded-lg border border-white/20 bg-dark-surface text-center text-sm" />
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
                        <div className="flex gap-2 w-2/5"><input type="number" placeholder={item.defaultVal || 'End'} className="w-1/2 p-2 rounded-lg border text-center text-sm" onChange={(e) => handleInputChange(item.id, 'end', e.target.value)} /><input type="number" placeholder="Waste" className="w-1/2 p-2 rounded-lg border border-red-100 text-center text-sm bg-destructive-light text-destructive" onChange={(e) => handleInputChange(item.id, 'waste', e.target.value)} /></div>
                    </div>
                ))}
            </div>
            <div className="p-4 bg-surface border-t sticky bottom-20 z-10"><button onClick={() => { if(!employee) return alert(t.select_employee); onSubmit({ submittedBy: employee, userId: currentUser?.id, data: inputData }); alert(t.save_success); }} className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 hover:bg-primary-dark"><Icon name="Save" size={20} />{t.save_report}</button></div>
        </div>
    );
};

const ChatView = ({ t, currentUser, messages, setMessages, notices, onExit, isManager, sopList, trainingLevels, lastReadAt, allUsers }: any) => {
    const [activeChannel, setActiveChannel] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    const [broadcastText, setBroadcastText] = useState('');
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

    const handleBroadcast = async () => {
        if (!broadcastText.trim()) return;
        const notice: Notice = { 
            id: Date.now().toString(), 
            author: currentUser.name, 
            content: broadcastText, 
            date: new Date().toISOString(), 
            isUrgent: false,
            frequency: broadcastFreq,
            status: 'active'
        };
        const res = await Cloud.updateNotices([notice]); 
        if (res.success) {
            setBroadcastText('');
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

        let readDividerPlaced = false;

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
                    {threadMessages.map((m: DirectMessage, index: number) => {
                        const messageTime = new Date(m.timestamp);
                        const prevMessage = threadMessages[index - 1];
                        let showReadDivider = false;

                        if (lastReadAt && !readDividerPlaced && messageTime > lastReadAt) {
                            if (!prevMessage || new Date(prevMessage.timestamp) <= lastReadAt) {
                                showReadDivider = true;
                                readDividerPlaced = true;
                            }
                        }

                        return (
                            <React.Fragment key={m.id}>
                                {showReadDivider && (
                                    <div className="text-center text-xs text-gray-400 my-2">-- Unread messages --</div>
                                )}
                                <div className={`flex flex-col items-start ${m.fromId === currentUser.id ? 'items-end' : 'items-start'}`}>
                                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm whitespace-pre-line leading-relaxed ${m.fromId === currentUser.id ? 'bg-primary text-white rounded-br-none' : 'bg-white border rounded-bl-none text-gray-800'}`}>
                                        {m.content}
                                    </div>
                                    <span className="text-[10px] text-gray-400 mt-1 px-1">{formatDate(m.timestamp)}</span>
                                </div>
                            </React.Fragment>
                        );
                    })}
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
                    <button onClick={onExit} className="bg-destructive-light text-destructive border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-red-200 transition-all">
                        <Icon name="LogOut" size={14}/> Exit
                    </button>
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
    
    const createNewItem = () => { const id = Date.now().toString(); if (view === 'training') return { id, title: {zh:'',en:''}, subtitle: {zh:'',en:''}, desc: {zh:'',en:''}, youtubeLink: '', content: [{title:{zh:'',en:''}, body:{zh:'',en:''}}], quiz: [] }; if (view === 'sop') return { id, title: {zh:'',en:''}, content: {zh:'',en:''}, tags: [], category: 'General' }; if (view === 'recipes') return { id, name: {zh:'',en:''}, cat: 'Milk Tea', size: '500ml', ice: 'Standard', sugar: '100%', toppings: {zh:'',en:''}, steps: {cold:[], warm:[]} }; return {}; };
    const handleSave = () => { if (!editingItem) return; let updatedList; let setList; if (view === 'sop') { updatedList = sopList.some((i:any) => i.id === editingItem.id) ? sopList.map((i:any) => i.id === editingItem.id ? editingItem : i) : [...sopList, editingItem]; setList = setSopList; Cloud.saveContent('sops', updatedList); } else if (view === 'training') { updatedList = trainingLevels.some((i:any) => i.id === editingItem.id) ? trainingLevels.map((i:any) => i.id === editingItem.id ? editingItem : i) : [...trainingLevels, editingItem]; setList = setTrainingLevels; Cloud.saveContent('training', updatedList); } else { updatedList = recipes.some((i:any) => i.id === editingItem.id) ? recipes.map((i:any) => i.id === editingItem.id ? editingItem : i) : [...recipes, editingItem]; setList = setRecipes; Cloud.saveContent('recipes', updatedList); } if (setList) { setList(updatedList); } setEditingItem(null); };
    const handleDelete = (id: string) => { if(!window.confirm("Delete this item?")) return; if (view === 'sop') { const list = sopList.filter((i:any) => i.id !== id); setSopList(list); Cloud.saveContent('sops', list); } else if (view === 'training') { const list = trainingLevels.filter((i:any) => i.id !== id); setTrainingLevels(list); Cloud.saveContent('training', list); } else { const list = recipes.filter((i:any) => i.id !== id); setRecipes(list); Cloud.saveContent('recipes', list); } };
    
    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !process.env.API_KEY) return;

        setIsProcessingPdf(true);
        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64Data = (event.target?.result as string).split(',')[1];
                
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const prompt = `Extract recipe data from this PDF into JSON. 
                Format: 
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
                If warm steps are missing, leave array empty. Infer missing details reasonably.`;

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: prompt },
                                { inlineData: { mimeType: 'application/pdf', data: base64Data } }
                            ]
                        }
                    ]
                });

                const text = response.text;
                if (text) {
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const extracted = JSON.parse(jsonMatch[0]);
                        setEditingItem(prev => ({ ...prev, ...extracted }));
                        alert("Auto-filled from PDF!");
                    } else {
                        alert("Could not parse PDF response.");
                    }
                }
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error(err);
            alert("Error processing PDF");
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

    return (
        <div className="min-h-screen max-h-[100dvh] overflow-hidden flex flex-col bg-dark-bg text-dark-text font-sans pt-8 md:pt-0">
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
                       {(view === 'training' ? trainingLevels : view === 'sop' ? sopList : recipes).map((item: any) => (
                           <div key={item.id} className="bg-dark-surface p-4 rounded-xl flex justify-between items-center border border-white/10 hover:border-white/20 transition-all">
                               <div><h3 className="font-bold text-sm text-dark-text">{item.title?.en || item.name?.en}</h3><p className="text-xs text-dark-text-light font-mono">{item.id}</p></div>
                               <div className="flex gap-2">
                                   <button onClick={() => setEditingItem(item)} className="p-2 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 transition-all"><Icon name="Edit" size={16}/></button>
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

const OwnerDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { lang, t, inventoryList, setInventoryList, inventoryHistory, users } = data;
    const ownerUser = users.find((u:User) => u.role === 'boss') || { id: 'u_owner', name: 'Owner', role: 'boss' };
    const [view, setView] = useState<'main' | 'manager'>('main');
    const [ownerSubView, setOwnerSubView] = useState<'presets' | 'history' | 'staff'>('presets');
    const [expandedReportId, setExpandedReportId] = useState<number | null>(null);

    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';

    const handleExportCsv = () => {
        const headers = "Date,Submitted By,Item Name,End Count,Waste Count\n";
        const csvRows = inventoryHistory.flatMap((report: InventoryReport) => 
            Object.entries(report.data).map(([itemId, values]) => {
                const itemDef = inventoryList.find((i: InventoryItem) => i.id === itemId);
                const itemName = itemDef ? getLoc(itemDef.name) : itemId;
                const cleanItemName = `"${itemName.replace(/"/g, '""')}"`; // Escape double quotes
                
                const reportDate = report.date ? new Date(report.date).toISOString().split('T')[0] : '';
                return [
                    `"${reportDate}"`,
                    `"${report.submittedBy}"`,
                    cleanItemName,
                    values.end || '0',
                    values.waste || '0'
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
                        <Icon name={expandedReportId === report.id ? "ChevronUp" : "ChevronRight"} className="text-dark-text-light" />
                    </div>
                    {expandedReportId === report.id && (
                        <div className="mt-3 pt-3 border-t border-white/10 text-xs space-y-2">
                            <div className="grid grid-cols-3 font-bold text-dark-text-light">
                                <span>Item</span><span className="text-center">End</span><span className="text-center">Waste</span>
                            </div>
                            {Object.entries(report.data).map(([itemId, values]) => {
                                const itemDef = inventoryList.find((i: InventoryItem) => i.id === itemId);
                                return (
                                    <div key={itemId} className="grid grid-cols-3 items-center">
                                        <span>{itemDef ? getLoc(itemDef.name) : itemId}</span>
                                        <span className="text-center font-mono">{values.end || '0'}</span>
                                        <span className="text-center font-mono text-red-400">{values.waste || '0'}</span>
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
        <div className="min-h-screen max-h-[100dvh] overflow-hidden flex flex-col bg-dark-bg text-dark-text font-sans pt-8 md:pt-0">
            <div className="bg-dark-surface p-4 shadow-lg flex justify-between items-center shrink-0 border-b border-white/10">
                <div><h1 className="text-xl font-black tracking-tight text-white">{t.owner_dashboard || 'Owner Dashboard'}</h1><p className="text-xs text-dark-text-light">User: {ownerUser.name}</p></div>
                <div className="flex gap-2">
                    <button onClick={() => setView('manager')} className="bg-white/10 p-2 rounded hover:bg-white/20 transition-all text-xs font-bold px-3">Manager Dashboard</button>
                    <button onClick={onExit} className="bg-white/10 p-2 rounded hover:bg-white/20 transition-all"><Icon name="LogOut" /></button>
                </div>
            </div>
            <div className="flex bg-dark-bg p-2 gap-2 overflow-x-auto shrink-0 shadow-inner">
                <button onClick={() => setOwnerSubView('presets')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'presets' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                    Manage Presets
                </button>
                <button onClick={() => setOwnerSubView('history')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'history' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                    Report History
                </button>
                 <button onClick={() => setOwnerSubView('staff')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${ownerSubView === 'staff' ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                    Staff Mgmt
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


const StaffAvailabilityView = ({ t }: { t: any }) => {
    const [weekStart, setWeekStart] = useState(getStartOfWeek(new Date(), 1));
    const [availabilities, setAvailabilities] = useState<StaffAvailability[]>([]);
    const [loading, setLoading] = useState(true);

    const weekStartISO = formatDateISO(weekStart);
    const days = Array.from({ length: 7 }).map((_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });

    useEffect(() => {
        setLoading(true);
        const unsub = Cloud.subscribeToAvailabilitiesForWeek(weekStartISO, (data) => {
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
                        {STATIC_USERS.filter(u=>u.active!==false).map(user => {
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
    // ... (Existing code)
    const managerUser = data.users.find((u:User) => u.id === 'u_lambert') || { id: 'u_manager', name: 'Manager', role: 'manager', phone: '0000' };
    const { schedule, setSchedule, notices, logs, t, directMessages, setDirectMessages, swapRequests, setSwapRequests, users } = data;
    const [view, setView] = useState<'schedule' | 'logs' | 'chat' | 'financial' | 'requests' | 'planning' | 'availability'>('requests');
    const [editingShift, setEditingShift] = useState<{ dayIdx: number, shift: 'morning' | 'evening' | 'night' } | null>(null);
    const [budgetMax, setBudgetMax] = useState<number>(() => Number(localStorage.getItem('onesip_budget_max')) || 5000);
    const [wages, setWages] = useState<Record<string, number>>(() => { const saved = localStorage.getItem('onesip_wages'); const def: any = {}; users.forEach((m:User) => def[m.name] = 12); return saved ? { ...def, ...JSON.parse(saved) } : def; });
    
    // --- NEW: Schedule Navigation State ---
    const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
    const totalWeeks = schedule?.days ? Math.ceil(schedule.days.length / 7) : 0;
    const activeStaff = users.filter((u: User) => u.active !== false);
    // ------------------------------------

    const handleWageChange = (name: string, val: string) => { const num = parseFloat(val); const newWages = { ...wages, [name]: isNaN(num) ? 0 : num }; setWages(newWages); localStorage.setItem('onesip_wages', JSON.stringify(newWages)); };
    const handleBudgetChange = (val: string) => { const b = parseFloat(val) || 0; setBudgetMax(b); localStorage.setItem('onesip_budget_max', b.toString()); };

    const calculateFinancials = () => {
        const stats: Record<string, any> = {};
        activeStaff.forEach((m:User) => { stats[m.name] = { morning: 0, evening: 0, estHours: 0, estCost: 0, actualHours: 0, actualCost: 0 }; });
        if (schedule?.days) { schedule.days.forEach((day: any) => { day.morning.forEach((p: string) => { if(stats[p]) stats[p].morning++ }); day.evening.forEach((p: string) => { if(stats[p]) stats[p].evening++ }); }); }
        const userLogs: Record<string, LogEntry[]> = {};
        if (logs) { logs.forEach((l: LogEntry) => { if (!l.name) return; if (!userLogs[l.name]) userLogs[l.name] = []; userLogs[l.name].push(l); }); }
        Object.keys(userLogs).forEach(name => { if(!stats[name]) return; const sorted = userLogs[name].sort((a,b) => new Date(a.time).getTime() - new Date(b.time).getTime()); let lastIn: number | null = null; sorted.forEach(log => { if (log.shift === 'clock-in') { lastIn = new Date(log.time).getTime(); } else if (log.shift === 'clock-out' && lastIn) { const diffHrs = (new Date(log.time).getTime() - lastIn) / (1000 * 60 * 60); if (diffHrs > 0 && diffHrs < 16) { stats[name].actualHours += diffHrs; } lastIn = null; } }); });
        let totalEstCost = 0; let totalActualCost = 0;
        Object.keys(stats).forEach(p => { const estH = (stats[p].morning * 5) + (stats[p].evening * 4.5); const wage = wages[p] || 12; stats[p].estHours = estH; stats[p].estCost = estH * wage; stats[p].actualCost = stats[p].actualHours * wage; totalEstCost += stats[p].estCost; totalActualCost += stats[p].actualCost; });
        return { stats, totalEstCost, totalActualCost };
    };
    const { stats, totalEstCost, totalActualCost } = calculateFinancials();

    const exportFinancialCSV = () => { let csv = "Name,Wage,Est.Hours,Est.Cost,Act.Hours,Act.Cost\n"; Object.keys(stats).forEach(name => { const s = stats[name]; csv += `${name},${Number(wages[name] || 0).toFixed(2)},${s.estHours.toFixed(1)},${s.estCost.toFixed(2)},${s.actualHours.toFixed(1)},${s.actualCost.toFixed(2)}\n`; }); csv += `TOTALS,,${totalEstCost.toFixed(2)},,${totalActualCost.toFixed(2)}\n`; const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csv); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "financial_report.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link); };
    
    const confirmSwap = (req: SwapRequest) => {
        let scheduleUpdated = false;
        const newSchedule = JSON.parse(JSON.stringify(schedule));
        const findDay = (dateStr: string) => {
            if (!dateStr) return undefined;
            return newSchedule.days.find((d: any) => d.date === dateStr || d.date === dateStr.replace(/^0/, '').replace(/-0/, '-'));
        };
        const reqDay = findDay(req.requesterDate);
        const targetDay = findDay(req.targetDate);

        if (reqDay && targetDay) {
            const remove = (day: any, shift: 'morning' | 'evening' | 'night', name: string) => {
                const idx = day[shift].indexOf(name);
                if (idx > -1) day[shift].splice(idx, 1);
            };
            const add = (day: any, shift: 'morning' | 'evening' | 'night', name: string) => {
                if (!day[shift].includes(name)) day[shift].push(name);
            };
            remove(reqDay, req.requesterShift, req.requesterName);
            remove(targetDay, req.targetShift, req.targetName);
            add(targetDay, req.targetShift, req.requesterName);
            add(reqDay, req.requesterShift, req.targetName);
            setSchedule(newSchedule);
            Cloud.saveSchedule(newSchedule);
            scheduleUpdated = true;
        }

        // Always mark the request as processed and remove it from the UI.
        const updatedReqs = swapRequests.map((r: SwapRequest) => r.id === req.id ? { ...r, status: 'approved' } : r);
        Cloud.updateSwapRequests(updatedReqs);
        setSwapRequests(swapRequests.filter(r => r.id !== req.id));

        if (scheduleUpdated) {
            alert("✅ Swap Confirmed & Schedule Updated!");
        } else {
            alert(`⚠️ Request approved and removed, but the schedule could not be automatically updated due to corrupted data (dates: ${req.requesterDate}, ${req.targetDate}). Please update the schedule manually.`);
        }
    };

    const clearRequests = () => { if(window.confirm("Delete ALL requests?")) { setSwapRequests([]); Cloud.updateSwapRequests([]); } };

    const handleSaveSchedule = (newStaff: string[], newHours: {start:string, end:string}) => { 
        if (!editingShift) return; 
        const { dayIdx, shift } = editingShift; 
        
        const newSched = JSON.parse(JSON.stringify(schedule));
        
        if (!newSched.days || !newSched.days[dayIdx]) return;

        newSched.days[dayIdx][shift] = newStaff; 
        
        if (!newSched.days[dayIdx].hours) {
            newSched.days[dayIdx].hours = { morning: {start:'10:00', end:'15:00'}, evening: {start:'14:30', end:'19:00'} }; 
        }
        
        newSched.days[dayIdx].hours[shift] = newHours; 
        
        setSchedule(newSched); 
        Cloud.saveSchedule(newSched); 
        setEditingShift(null); 
    };
    
    const pendingReqs = swapRequests?.filter((r: SwapRequest) => r.status === 'accepted_by_peer') || [];

    const getShiftCost = (staff: string[], start: string, end: string) => {
        if (!staff || staff.length === 0) return 0;
        const s = parseInt(start.split(':')[0]) + (parseInt(start.split(':')[1]||'0')/60);
        const e = parseInt(end.split(':')[0]) + (parseInt(end.split(':')[1]||'0')/60);
        const duration = Math.max(0, e - s);
        return staff.reduce((acc, name) => acc + (duration * (wages[name] || 12)), 0);
    };
    
    const totalWeeklyPlanningCost = schedule.days?.reduce((acc: number, day: any) => {
        const m = getShiftCost(day.morning, day.hours?.morning?.start || '10:00', day.hours?.morning?.end || '15:00');
        const e = getShiftCost(day.evening, day.hours?.evening?.start || '14:30', day.hours?.evening?.end || '19:00');
        const n = day.night ? getShiftCost(day.night, day.hours?.night?.start || '18:00', day.hours?.night?.end || '22:00') : 0;
        return acc + m + e + n;
    }, 0) || 0;


    return (
        <div className="min-h-screen max-h-[100dvh] overflow-hidden flex flex-col bg-dark-bg text-dark-text font-sans pt-8 md:pt-0">
            <div className="bg-dark-surface p-4 shadow-lg flex justify-between items-center shrink-0 border-b border-white/10">
                <div><h1 className="text-xl font-black tracking-tight text-white">{t.manager_title}</h1><p className="text-xs text-dark-text-light">User: {managerUser.name}</p></div>
                <button onClick={onExit} className="bg-white/10 p-2 rounded hover:bg-white/20 transition-all"><Icon name="LogOut" /></button>
            </div>
            <div className="flex bg-dark-bg p-2 gap-2 overflow-x-auto shrink-0 shadow-inner">
                {['requests', 'schedule', 'planning', 'availability', 'chat', 'logs', 'financial'].map(v => (
                    <button key={v} onClick={() => setView(v as any)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${view === v ? 'bg-dark-accent text-dark-bg shadow' : 'text-dark-text-light hover:bg-white/10'}`}>
                        {v} {v==='requests' && pendingReqs.length > 0 && `(${pendingReqs.length})`}
                    </button>
                ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                {view === 'requests' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center bg-dark-surface p-3 rounded-xl shadow-sm border border-white/10 relative z-10">
                            <h3 className="font-bold text-dark-text">Pending Approvals</h3>
                            <button 
                                onClick={clearRequests} 
                                className="bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-500/20 active:scale-95 transition-all"
                            >
                                Clear All
                            </button>
                        </div>
                        {pendingReqs.length === 0 && <p className="text-dark-text-light text-center py-10 bg-dark-surface rounded-xl shadow-sm border border-white/10">No pending requests.</p>}
                        {pendingReqs.map((req: SwapRequest) => (
                            <div key={req.id} className="bg-dark-surface p-4 rounded-xl shadow-sm border border-white/10">
                                <div className="flex justify-between items-center mb-3">
                                    <div className="font-bold text-dark-text">{req.requesterName} <span className="text-dark-text-light text-xs">swaps with</span> {req.targetName}</div>
                                    <span className="bg-green-500/10 text-green-400 text-xs px-2 py-1 rounded font-bold">AGREED</span>
                                </div>
                                <div className="bg-dark-bg p-3 rounded-lg text-sm text-dark-text-light mb-3 space-y-1">
                                    <div className="flex justify-between"><span>{req.requesterName}:</span> <strong>{req.requesterDate} ({req.requesterShift})</strong></div>
                                    <div className="flex justify-between"><span>{req.targetName}:</span> <strong>{req.targetDate} ({req.targetShift})</strong></div>
                                </div>
                                <button onClick={() => confirmSwap(req)} className="w-full bg-dark-accent text-dark-bg py-3 rounded-xl font-bold shadow-md active:scale-95 transition-all hover:opacity-90">Approve & Update Schedule</button>
                            </div>
                        ))}
                    </div>
                )}
                 {view === 'availability' && <StaffAvailabilityView t={t} />}
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
                            <p className="text-xs text-dark-text-light">Tap on a shift to edit staff & times.</p>
                        </div>
                        {schedule.days?.slice(currentWeekIndex * 7, (currentWeekIndex + 1) * 7).map((day: ScheduleDay, dayIndexInWeek: number) => {
                            const absoluteDayIndex = currentWeekIndex * 7 + dayIndexInWeek;
                            const isWeekend = ['Friday', 'Saturday', 'Sunday'].includes(day.name);
                            return (
                                <div key={absoluteDayIndex} className="bg-dark-surface p-3 rounded-xl shadow-sm border border-white/10">
                                    <div className="flex justify-between mb-2">
                                        <span className="font-bold text-dark-text">{day.name}</span>
                                        <span className="text-xs text-dark-text-light">{day.date}</span>
                                    </div>
                                    <div className={`grid ${isWeekend ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'} gap-2`}>
                                        <div onClick={() => setEditingShift({ dayIdx: absoluteDayIndex, shift: 'morning' })} className="p-2 bg-orange-500/10 rounded border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-all">
                                            <div className="flex justify-between items-center mb-1"><div className="text-[10px] text-orange-400 font-bold">MORNING</div><div className="text-[10px] text-dark-text-light">{day.hours?.morning?.start || '10:00'}-{day.hours?.morning?.end || '15:00'}</div></div>
                                            <div className="text-xs text-dark-text-light font-medium">{day.morning.length > 0 ? day.morning.join(', ') : <span className="italic">Empty</span>}</div>
                                        </div>
                                        <div onClick={() => setEditingShift({ dayIdx: absoluteDayIndex, shift: 'evening' })} className="p-2 bg-blue-500/10 rounded border border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-all">
                                            <div className="flex justify-between items-center mb-1"><div className="text-[10px] text-blue-400 font-bold">EVENING</div><div className="text-[10px] text-dark-text-light">{day.hours?.evening?.start || '14:30'}-{day.hours?.evening?.end || '19:00'}</div></div>
                                            <div className="text-xs text-dark-text-light font-medium">{day.evening.length > 0 ? day.evening.join(', ') : <span className="italic">Empty</span>}</div>
                                        </div>
                                        {isWeekend && (
                                            <div onClick={() => setEditingShift({ dayIdx: absoluteDayIndex, shift: 'night' })} className="p-2 bg-indigo-500/10 rounded border border-indigo-500/20 cursor-pointer hover:bg-indigo-500/20 transition-all">
                                                <div className="flex justify-between items-center mb-1"><div className="text-[10px] text-indigo-400 font-bold uppercase">Night</div><div className="text-[10px] text-dark-text-light">{day.hours?.night?.start || '18:00'}-{day.hours?.night?.end || '22:00'}</div></div>
                                                <div className="text-xs text-dark-text-light font-medium">{day.night && day.night.length > 0 ? day.night.join(', ') : <span className="italic">Empty</span>}</div>
                                            </div>
                                        )}
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
                                Live estimate based on current schedule and individual wage settings.
                            </p>
                            <div className="flex justify-between items-center bg-dark-bg p-4 rounded-xl border border-white/5">
                                <span className="text-xs font-bold text-dark-text-light uppercase">Total Weekly Forecast</span>
                                <span className="text-2xl font-black text-green-400">€{totalWeeklyPlanningCost.toFixed(0)}</span>
                            </div>
                        </div>

                        {schedule.days?.slice(0, 7).map((day: ScheduleDay, idx: number) => { // Planning view only shows current week
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
                                <div key={idx} className="bg-dark-surface p-4 rounded-xl shadow-sm border border-white/10">
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
                                    
                                    <div onClick={() => setEditingShift({ dayIdx: idx, shift: 'morning' })} className="mb-2 p-3 bg-dark-bg rounded-lg border border-white/5 hover:border-orange-500/30 cursor-pointer transition-all" >
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

                                    <div onClick={() => setEditingShift({ dayIdx: idx, shift: 'evening' })} className="p-3 bg-dark-bg rounded-lg border border-white/5 hover:border-blue-500/30 cursor-pointer transition-all" >
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
                                        <div onClick={() => setEditingShift({ dayIdx: idx, shift: 'night' })} className="mt-2 p-3 bg-dark-bg rounded-lg border border-white/5 hover:border-indigo-500/30 cursor-pointer transition-all" >
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
                        {logs?.slice().reverse().map((log: LogEntry, i: number) => (
                            <div key={i} className="bg-dark-surface p-3 rounded-lg shadow-sm text-sm border-l-4 border-dark-accent">
                                <div className="flex justify-between mb-1"><span className="font-bold text-dark-text">{log.name}</span><span className="text-xs text-dark-text-light">{log.time}</span></div>
                                <div className="flex justify-between items-center">
                                    <span className={`px-2 py-0.5 rounded text-[10px] ${log.type?.includes('in') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{log.type}</span>
                                    <span className="text-[10px] text-dark-text-light font-mono">{log.reason || 'No Location'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {view === 'financial' && (
                    <div className="space-y-4">
                        <div className="bg-dark-surface p-5 rounded-2xl shadow-sm border border-white/10">
                            <h3 className="font-bold mb-4 text-dark-text flex items-center gap-2"><Icon name="Briefcase"/> Financial Dashboard</h3>
                            <div className="mb-4"><label className="block text-xs font-bold text-dark-text-light mb-1">Monthly Budget Max (€)</label><input type="number" className="w-full border rounded p-2 text-lg font-bold bg-dark-bg border-white/10" value={budgetMax} onChange={e => handleBudgetChange(e.target.value)} /></div>
                            <div className="grid grid-cols-2 gap-4 text-center mb-6">
                                <div className="bg-dark-bg p-3 rounded-xl"><p className="text-xs text-dark-text-light font-bold uppercase">Est. Cost</p><p className="text-xl font-black text-white">€{totalEstCost.toFixed(0)}</p></div>
                                <div className="bg-dark-bg p-3 rounded-xl"><p className="text-xs text-dark-text-light font-bold uppercase">Actual Cost</p><p className="text-xl font-black text-white">€{totalActualCost.toFixed(0)}</p></div>
                            </div>
                            <div className="mb-6">
                                <div className="flex justify-between items-center mb-2"><span className="text-sm font-bold text-dark-text-light">Budget Usage</span><span className={`font-bold ${totalActualCost > budgetMax ? 'text-red-400' : 'text-green-400'}`}>{totalActualCost > budgetMax ? 'OVER BUDGET' : `${(budgetMax - totalActualCost).toFixed(0)} Left`}</span></div>
                                <div className="w-full bg-dark-bg rounded-full h-2.5 overflow-hidden"><div className={`h-2.5 rounded-full ${totalActualCost > budgetMax ? 'bg-red-500' : 'bg-dark-accent'}`} style={{ width: `${Math.min(100, (totalActualCost/budgetMax)*100)}%` }}></div></div>
                            </div>
                            <div className="border border-white/10 rounded-xl overflow-hidden mb-4">
                                <table className="w-full text-xs"><thead className="bg-dark-bg text-dark-text-light"><tr><th className="p-2 text-left">Staff</th><th className="p-2">Wage/Hr</th><th className="p-2">Act. Hrs</th><th className="p-2">Cost</th></tr></thead>
                                    <tbody className="divide-y divide-white/10">{Object.keys(stats).map(name => (
                                        <tr key={name}>
                                            <td className="p-2 font-bold text-dark-text">{name}</td>
                                            <td className="p-2 text-center">
                                                <input type="number" step="0.01" className="w-12 text-center border rounded bg-dark-bg border-white/20 text-dark-text" value={wages[name] || ''} onChange={(e) => handleWageChange(name, e.target.value)}/>
                                            </td>
                                            <td className="p-2 text-center text-dark-text-light">{stats[name].actualHours.toFixed(1)}</td>
                                            <td className="p-2 text-right font-mono text-dark-text">€{stats[name].actualCost.toFixed(0)}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                            <button onClick={exportFinancialCSV} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-md flex justify-center gap-2 transition-all hover:bg-green-700"><Icon name="List" /> Export Report (CSV)</button>
                        </div>
                    </div>
                )}
            </div>
            {editingShift && <ScheduleEditorModal isOpen={!!editingShift} day={schedule.days[editingShift.dayIdx]} shiftType={editingShift.shift} currentStaff={schedule.days[editingShift.dayIdx][editingShift.shift]} currentHours={schedule.days[editingShift.dayIdx].hours?.[editingShift.shift]} onClose={() => setEditingShift(null)} onSave={handleSaveSchedule} teamMembers={activeStaff} />}
        </div>
    );
};

// --- STAFF APP ---

const StaffApp = ({ onSwitchMode, data, onLogout, currentUser, openAdmin }: { onSwitchMode: () => void, data: any, onLogout: () => void, currentUser: User, openAdmin: () => void }) => {
    const { lang, setLang, schedule, notices, logs, setLogs, t, swapRequests, setSwapRequests, directMessages, users } = data;
    const [view, setView] = useState<StaffViewMode>('home');
    const [clockBtnText, setClockBtnText] = useState({ in: t.clock_in, out: t.clock_out });
    const [currentShift, setCurrentShift] = useState<string>('opening'); 
    const [onInventorySuccess, setOnInventorySuccess] = useState<(() => void) | null>(null);
    const [hasUnreadChat, setHasUnreadChat] = useState(false);
    const { showNotification } = useNotification();
    const [showAvailabilityReminder, setShowAvailabilityReminder] = useState(false);
    const [showAvailabilityModal, setShowAvailabilityModal] = useState(false);
    const [lastReadAt, setLastReadAt] = useState<Date | null>(null);
    const [recipeSearchQuery, setRecipeSearchQuery] = useState('');

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

        const unsubReadState = Cloud.subscribeToChatReadState(currentUser.id, (readState) => {
            if (readState && readState.lastReadAt) {
                setLastReadAt(readState.lastReadAt.toDate());
            }
        });

        return () => {
            clearTimeout(timer);
            unsubReadState();
        };
    }, [currentUser.id]);

    useEffect(() => {
        if (!directMessages || directMessages.length === 0) return;

        const latestMessage = directMessages[directMessages.length - 1];
        if (latestMessage.fromId === currentUser.id) return;
        
        const latestMessageTime = new Date(latestMessage.timestamp);
        const hasUnread = !lastReadAt || latestMessageTime > lastReadAt;

        setHasUnreadChat(hasUnread);

        if (hasUnread && view !== 'chat') {
            const sender = users.find((u:User) => u.id === latestMessage.fromId);
            showNotification({
                type: 'message',
                title: `New Message from ${sender?.name || 'Team'}`,
                message: latestMessage.content.length > 40 ? latestMessage.content.substring(0, 40) + '...' : latestMessage.content,
                dedupeKey: `chat::${latestMessage.id}`,
            });
        }
    }, [directMessages, view, currentUser.id, showNotification, lastReadAt, users]);

    const markChatAsRead = () => {
        if (!directMessages || directMessages.length === 0) return;
        const latestMessage = directMessages[directMessages.length - 1];
        const latestMessageTime = new Date(latestMessage.timestamp);

        if (!lastReadAt || latestMessageTime > lastReadAt) {
            Cloud.saveChatReadState(currentUser.id, latestMessageTime);
            setLastReadAt(latestMessageTime); // Optimistic update
            setHasUnreadChat(false);
        }
    };

    useEffect(() => {
        if (view === 'chat') {
           markChatAsRead();
        }
    }, [view, directMessages]);
    
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
                if (todaySchedule[shiftType].includes(currentUser.name) && !clockedStatus) {
                    const timeStr = notificationType === 'clock_in_reminder' ? shiftHours.start : shiftHours.end;
                    const [hour, minute] = timeStr.split(':').map(Number);
                    const shiftTime = new Date();
                    shiftTime.setHours(hour, minute, 0, 0);
                    const diffMinutes = (now.getTime() - shiftTime.getTime()) / 60000;
                    
                    if (diffMinutes >= -15 && diffMinutes <= 15) {
                        const dedupeKey = `${notificationType}-${todayDateStr}-${shiftType}-${Math.floor(now.getTime() / (5 * 60 * 1000))}`;
                        showNotification({
                            type: notificationType,
                            title: title,
                            message: message,
                            dedupeKey: dedupeKey,
                        });
                    }
                }
            };
            
            checkShift('morning', todaySchedule.hours.morning, hasClockedIn, 'clock_in_reminder', 'Clock-in Reminder', 'Your morning shift is starting soon. Please remember to clock in.');
            checkShift('evening', todaySchedule.hours.evening, hasClockedIn, 'clock_in_reminder', 'Clock-in Reminder', 'Your evening shift is starting soon. Please remember to clock in.');
            checkShift('morning', todaySchedule.hours.morning, hasClockedOut, 'clock_out_reminder', 'Clock-out Reminder', 'Your morning shift is ending soon. Please complete tasks and clock out.');
            checkShift('evening', todaySchedule.hours.evening, hasClockedOut, 'clock_out_reminder', 'Clock-out Reminder', 'Your evening shift is ending soon. Please complete tasks and clock out.');

        }, 60 * 1000); // Check every minute

        return () => clearInterval(timer);
    }, [currentUser, schedule, logs, showNotification]);

    const [swapMode, setSwapMode] = useState(false);
    // FIX: Add 'night' to support night shift swaps, resolving the type error.
    const [swapSelection, setSwapSelection] = useState<{ step: 1|2, myDate?: string, myShift?: 'morning'|'evening'|'night', targetName?: string, targetDate?: string, targetShift?: 'morning'|'evening'|'night' }>({ step: 1 });
    const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, msg: React.ReactNode, action: () => void}>({isOpen:false, msg:'', action:()=>{}});

    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';
    const clientSchedule = { ...schedule, days: schedule?.days?.slice(0, 14) || [] };
    const myPendingSwaps = swapRequests?.filter((r: SwapRequest) => r.targetId === currentUser.id && r.status === 'pending') || [];

    const findNextShift = () => {
        if (!schedule?.days) return null;
        const now = new Date();
        const currentYear = now.getFullYear();
        for (const day of schedule.days) {
            const [month, dayOfMonth] = day.date.split('-').map(Number);
            let scheduleYear = currentYear;
            if (now.getMonth() === 11 && month === 1) scheduleYear++;
            const scheduleDate = new Date(scheduleYear, month - 1, dayOfMonth);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (scheduleDate >= today) {
                const isToday = scheduleDate.toDateString() === today.toDateString();
                const mStart = day.hours?.morning?.start || '10:00';
                const mEnd = day.hours?.morning?.end || '15:00';
                const eStart = day.hours?.evening?.start || '14:30';
                const eEnd = day.hours?.evening?.end || '19:00';
                if (day.morning.includes(currentUser.name)) {
                    if (isToday) {
                        if (now.getHours() < parseInt(mEnd.split(':')[0])) return { date: day.date, shift: `${mStart} - ${mEnd}`, name: day.name };
                    } else return { date: day.date, shift: `${mStart} - ${mEnd}`, name: day.name };
                }
                if (day.evening.includes(currentUser.name)) {
                    if (isToday) {
                        if (now.getHours() < parseInt(eEnd.split(':')[0])) return { date: day.date, shift: `${eStart} - ${eEnd}`, name: day.name };
                    } else return { date: day.date, shift: `${eStart} - ${eEnd}`, name: day.name };
                }
            }
        }
        return null;
    };
    const nextShift = findNextShift();

    const hasShiftToday = (user: User, scheduleData: any): boolean => {
        if (!scheduleData?.days) return false;
        const now = new Date();
        const todayDateStr = `${now.getMonth() + 1}-${now.getDate()}`;
        const todaySchedule = scheduleData.days.find((day: ScheduleDay) => day.date === todayDateStr);
        if (!todaySchedule) return false;
        return todaySchedule.morning.includes(user.name) || todaySchedule.evening.includes(user.name);
    };

    const performClockLog = (type: 'clock-in' | 'clock-out') => {
        setClockBtnText(p => ({ ...p, [type === 'clock-in'?'in':'out']: '📡...' }));
        if (!navigator.geolocation) { recordLog(type, "GPS Not Supported"); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const dist = getDistanceFromLatLonInKm(pos.coords.latitude, pos.coords.longitude, STORE_COORDS.lat, STORE_COORDS.lng);
                const locTag = dist <= 500 ? `In Range (<500m)` : `Out Range (${Math.round(dist)}m)`;
                alert(`✅ Success!\n${locTag}`);
                recordLog(type, locTag);
            },
            (err) => { console.error(err); alert("⚠️ GPS Error. Logging anyway."); recordLog(type, "GPS Error"); },
            { timeout: 10000, enableHighAccuracy: true }
        );
    };
    
    const handleClockLog = (type: 'clock-in' | 'clock-out') => {
        if (!hasShiftToday(currentUser, schedule)) {
            alert(t.no_shift_today_alert);
            return;
        }
        if (type === 'clock-out') {
            alert(t.inventory_before_clock_out);
            setOnInventorySuccess(() => () => performClockLog('clock-out'));
            setView('inventory');
        } else {
            performClockLog('clock-in');
        }
    };

    const cancelInventoryClockOut = () => {
        if (window.confirm(t.cancel_clock_out_confirm)) {
            setOnInventorySuccess(null);
            setView('home');
        }
    }

    const recordLog = (type: string, note: string) => {
        const newLog: LogEntry = { id: Date.now(), shift: type, name: currentUser.name, userId: currentUser.id, time: new Date().toLocaleString(), type: type as any, reason: note };
        setLogs([newLog, ...logs]); Cloud.saveLog(newLog); setClockBtnText({ in: t.clock_in, out: t.clock_out });
    };

    const handleShiftClick = (day: any, shift: 'morning' | 'evening' | 'night', name: string) => {
        if (!swapMode) return;
        if (swapSelection.step === 1) {
            if (name !== currentUser.name) { alert("⚠️ Step 1: Please select YOUR shift first (Green)."); return; }
            setSwapSelection({ step: 2, myDate: day.date, myShift: shift });
        } else {
            if (name === currentUser.name) { alert("⚠️ Step 2: Select a COLLEAGUE'S shift (Blue)."); return; }
            setConfirmModal({
                isOpen: true,
                msg: (<div>Request swap with <strong>{name}</strong>?<br/><br/>You give: {swapSelection.myDate} ({swapSelection.myShift})<br/>You take: {day.date} ({shift})</div>),
                action: () => {
                    const targetUser = users.find((u:User) => u.name === name);
                    // FIX: Remove incorrect type assertions now that types support 'night'.
                    const req: SwapRequest = { id: Date.now().toString(), requesterName: currentUser.name, requesterId: currentUser.id, requesterDate: swapSelection.myDate!, requesterShift: swapSelection.myShift!, targetName: name, targetId: targetUser ? targetUser.id : 'unknown', targetDate: day.date, targetShift: shift, status: 'pending', timestamp: Date.now() };
                    Cloud.saveSwapRequest(req); alert("✅ Request Sent!"); setSwapMode(false); setSwapSelection({ step: 1 }); setConfirmModal(prev => ({...prev, isOpen: false}));
                }
            });
        }
    };

    const handleSwapAction = (reqId: string, action: 'accepted_by_peer' | 'rejected') => {
        const updatedReqs = swapRequests.map((r: SwapRequest) => r.id === reqId ? {...r, status: action} : r);
        setSwapRequests(updatedReqs); Cloud.updateSwapRequests(updatedReqs);
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
        return (<div className="bg-surface p-4 rounded-xl shadow-sm border border-gray-100 mb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}><div className="flex justify-between items-center"><div><h3 className="font-bold text-text">{drink.name?.[lang] || drink.name?.['zh']}</h3><p className="text-xs text-text-light">{drink.cat} • {drink.size}</p></div><Icon name={expanded ? "ChevronUp" : "ChevronRight"} size={20} className="text-gray-400" /></div>{expanded && (<div className="mt-3 text-sm text-text-light space-y-2 border-t pt-3"><p><strong>Toppings:</strong> {drink.toppings?.[lang] || drink.toppings?.['zh']}</p><p><strong>Sugar:</strong> {drink.sugar}</p><p><strong>Ice:</strong> {drink.ice}</p><div className="bg-blue-500/10 p-2 rounded"><p className="font-bold text-blue-800 mb-1">Cold Steps:</p><ol className="list-decimal pl-4">{drink.steps.cold.map((s:any, i:number) => <li key={i}>{s?.[lang]||s?.['zh']}</li>)}</ol></div><div className="bg-orange-500/10 p-2 rounded"><p className="font-bold text-orange-800 mb-1">Warm Steps:</p><ol className="list-decimal pl-4">{drink.steps.warm.map((s:any, i:number) => <li key={i}>{s?.[lang]||s?.['zh']}</li>)}</ol></div></div>)}</div>);
    };

    const TrainingView = ({ data, onComplete }: { data: any, onComplete: (levelId: number) => void }) => {
        const { trainingLevels, t, lang } = data;
        const [activeLevel, setActiveLevel] = useState<TrainingLevel | null>(null);
        if (activeLevel) { return (<div className="h-full flex flex-col bg-surface animate-fade-in-up text-text"><div className="p-4 border-b flex items-center gap-3"><button onClick={() => setActiveLevel(null)}><Icon name="ArrowLeft"/></button><h2 className="font-bold text-lg">{activeLevel.title?.[lang] || activeLevel.title?.['zh']}</h2></div><div className="flex-1 overflow-y-auto p-4 space-y-6"><div className="bg-primary-light p-4 rounded-xl border border-primary/20"><h3 className="font-bold text-primary mb-2">Overview</h3><p className="text-sm text-primary/80">{activeLevel.desc?.[lang] || activeLevel.desc?.['zh']}</p></div>{activeLevel.youtubeLink && (<div className="rounded-xl overflow-hidden shadow-lg border border-gray-200"><iframe className="w-full aspect-video" src={`https://www.youtube.com/embed/${getYouTubeId(activeLevel.youtubeLink)}`} title="Training Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe></div>)}{activeLevel.content.map((c: any, i: number) => (<div key={i}><h3 className="font-bold text-text mb-2">{i+1}. {c.title?.[lang] || c.title?.['zh']}</h3><p className="text-sm text-text-light whitespace-pre-line leading-relaxed">{c.body?.[lang] || c.body?.['zh']}</p></div>))}<div className="pt-6"><h3 className="font-bold text-text mb-4">Quiz</h3>{activeLevel.quiz.map((q: any, i: number) => (<div key={q.id} className="mb-4 bg-secondary p-4 rounded-xl"><p className="font-bold text-sm mb-2">{i+1}. {q.question?.[lang] || q.question?.['zh']}</p><div className="space-y-2">{q.options?.map((opt: string, idx: number) => (<button key={idx} className="w-full text-left p-3 bg-surface border rounded-lg text-sm hover:bg-gray-100">{opt}</button>))}</div></div>))}</div></div></div>); }
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
            const itemData = report.data[itemId];
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
            return (
                <div className="h-full overflow-y-auto p-4 bg-secondary pb-24 text-text">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-black">{t.team_title}</h2><button onClick={() => { setSwapMode(!swapMode); setSwapSelection({step:1}); }} className={`px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition-all ${swapMode ? 'bg-destructive text-white animate-pulse' : 'bg-primary text-white'}`}>{swapMode ? 'Exit Swap' : '🔄 Swap Shift'}</button></div>
                    {swapMode && <div className="bg-yellow-400/20 p-3 rounded-xl mb-4 text-sm text-yellow-800 border border-yellow-400/30"><strong>Wizard:</strong> {swapSelection.step === 1 ? 'Step 1: Select YOUR shift' : 'Step 2: Select TARGET shift'}</div>}
                    {myPendingSwaps.length > 0 && !swapMode && (<div className="bg-surface border border-destructive-light p-4 rounded-xl mb-4 shadow-sm"><h3 className="font-bold text-destructive mb-2">🔔 Swap Requests</h3>{myPendingSwaps.map((req: SwapRequest) => (<div key={req.id} className="bg-secondary p-3 rounded-lg mb-2 text-sm"><p><strong>{req.requesterName}</strong> wants your <strong>{req.targetDate}</strong> for <strong>{req.requesterDate}</strong></p><div className="flex gap-2 mt-2"><button onClick={()=>handleSwapAction(req.id, 'accepted_by_peer')} className="flex-1 bg-green-500 text-white py-2 rounded font-bold">Accept</button><button onClick={()=>handleSwapAction(req.id, 'rejected')} className="flex-1 bg-gray-300 text-text-light py-2 rounded font-bold">Reject</button></div></div>))}</div>)}
                    <div className="space-y-4">{clientSchedule?.days?.map((day: any, idx: number) => (
                        <div key={idx} className="p-4 rounded-xl shadow-sm border bg-surface border-gray-100">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-text">{day.name} <span className="text-text-light font-normal ml-1">{day.date}</span></h3>
                            </div>
                            <div className="space-y-2">
                                {
                                    (['morning', 'evening', 'night'] as const)
                                    .filter(shift => day[shift] && day[shift].length > 0)
                                    .map(shift => (
                                        <div key={shift} className="flex items-center gap-2">
                                            <span className={`text-xs font-bold w-12 text-center ${
                                                shift === 'morning' ? 'text-orange-500' : 
                                                shift === 'evening' ? 'text-indigo-500' : 'text-purple-500'
                                            }`}>
                                                {shift === 'morning' ? 'AM' : shift === 'evening' ? 'PM' : 'NIGHT'}
                                            </span>
                                            <div className="flex flex-wrap gap-2">
                                                {day[shift].map((name: string, i: number) => { 
                                                    const isMe = name === currentUser.name; 
                                                    let bg = shift === 'morning' ? 'bg-orange-400/10 text-orange-700' : 
                                                             shift === 'evening' ? 'bg-indigo-500/10 text-indigo-700' : 
                                                             'bg-purple-500/10 text-purple-700';

                                                    if (swapMode) { 
                                                        if (swapSelection.step === 1) bg = isMe ? 'bg-green-500 text-white ring-4 ring-green-200 cursor-pointer animate-pulse' : 'bg-gray-100 text-gray-300'; 
                                                        else if (swapSelection.step === 2) bg = !isMe ? 'bg-blue-500 text-white ring-4 ring-blue-200 cursor-pointer animate-pulse' : 'bg-gray-100 text-gray-300'; 
                                                    } else if (isMe) {
                                                        bg = shift === 'morning' ? 'bg-orange-500 text-white' : 
                                                             shift === 'evening' ? 'bg-indigo-600 text-white' : 
                                                             'bg-purple-600 text-white';
                                                    } 
                                                    return (<div key={i} onClick={() => handleShiftClick(day, shift as any, name)} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${bg}`}>{name}</div>); 
                                                })}
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>
                    ))}</div>
                </div>
            );
        }
        if (view === 'home') {
            return (
                <div className="h-full overflow-y-auto bg-secondary pb-24 text-text font-sans animate-fade-in-up">
                    <header className="p-6 pb-2 flex justify-between items-start bg-surface sticky top-0 z-10 border-b border-gray-100">
                        <div><h1 className="text-3xl font-black text-text tracking-tight">ONESIP</h1><p className="text-sm text-text-light font-medium mt-1">{t.hello} {currentUser.name}</p></div>
                        <div className="flex items-center gap-3">
                            <button onClick={openAdmin} className="bg-text text-surface text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1 shadow hover:bg-black transition-all"><Icon name="Shield" size={12} /> Admin</button>
                            <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')} className="bg-gray-100 text-text-light text-xs font-bold px-3 py-1.5 rounded-full border"> {lang === 'zh' ? 'EN' : '中'} </button>
                            <button onClick={onLogout} className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-destructive bg-surface shadow-sm"><Icon name="LogOut" size={14}/></button>
                        </div>
                    </header>

                    <div className="p-6 space-y-6">
                        <div className="bg-gradient-to-br from-primary to-teal-600 rounded-3xl p-6 text-white shadow-xl shadow-primary-light relative overflow-hidden">
                            <div className="relative z-10"><div className="inline-block bg-white/20 backdrop-blur-sm px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider mb-4">{t.next_shift}</div><h2 className="text-3xl font-bold mb-2">{nextShift ? nextShift.name : 'No Shift'}</h2><p className="text-teal-100 font-medium flex items-center gap-2"><Icon name="Calendar" size={16} /> {nextShift ? `${nextShift.date} • ${nextShift.shift}` : t.no_shift}</p></div>
                            <Icon name="Calendar" size={120} className="absolute -right-4 -bottom-8 text-white opacity-10 rotate-12" />
                        </div>
                        <div onClick={() => setView('inventory')} className="bg-surface p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between active:scale-95 transition-transform cursor-pointer">
                            <div className="flex items-center gap-4"><div className="w-14 h-14 bg-primary-light text-primary rounded-2xl flex items-center justify-center"><Icon name="Package" size={28} /></div><span className="font-bold text-lg text-text">{t.inventory_title}</span></div>
                            <Icon name="ChevronRight" className="text-gray-300" />
                        </div>
                         <div onClick={() => setShowAvailabilityModal(true)} className="bg-surface p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between active:scale-95 transition-transform cursor-pointer">
                            <div className="flex items-center gap-4"><div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center"><Icon name="Calendar" size={28} /></div><span className="font-bold text-lg text-text">{t.next_week_availability}</span></div>
                            <Icon name="ChevronRight" className="text-gray-300" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => handleClockLog('clock-in')} className="bg-primary hover:bg-primary-dark text-white p-6 rounded-3xl shadow-lg shadow-primary-light flex flex-col items-center justify-center gap-3 active:scale-95 transition-all"><Icon name="Play" size={32} /><span className="font-bold">{clockBtnText.in}</span></button>
                            <button onClick={() => handleClockLog('clock-out')} className="bg-text-light hover:bg-text text-white p-6 rounded-3xl shadow-lg shadow-gray-200 flex flex-col items-center justify-center gap-3 active:scale-95 transition-all"><Icon name="Square" size={32} /><span className="font-bold">{clockBtnText.out}</span></button>
                        </div>
                    </div>
                </div>
            );
        }
        if (view === 'chat') return <ChatView t={t} currentUser={currentUser} messages={directMessages} setMessages={data.setDirectMessages} notices={notices} onExit={() => setView('home')} sopList={data.sopList} trainingLevels={data.trainingLevels} lastReadAt={lastReadAt} allUsers={users} />;
        if (view === 'inventory') return <InventoryView lang={lang} t={t} inventoryList={data.inventoryList} setInventoryList={data.setInventoryList} onSubmit={handleInventorySubmit} currentUser={currentUser} isForced={!!onInventorySuccess} onCancel={cancelInventoryClockOut} />;
        if (view === 'contact') return <ContactView t={t} lang={lang} />;
        if (view === 'recipes') {
            const filteredRecipes = data.recipes.filter((recipe: DrinkRecipe) => {
                if (!recipeSearchQuery) return true;
                const query = recipeSearchQuery.toLowerCase().trim();
                const nameEn = recipe.name?.en?.toLowerCase() || '';
                const nameZh = recipe.name?.zh || ''; // No toLowerCase needed for Chinese includes
                const cat = recipe.cat?.toLowerCase() || '';
                return nameEn.includes(query) || nameZh.includes(query) || cat.includes(query);
            });

            return (
                 <div className="h-full flex flex-col text-text animate-fade-in-up pb-24">
                    <div className="bg-surface p-4 border-b sticky top-0 z-10">
                        <h2 className="text-xl font-black mb-3">{t.recipe_title}</h2>
                        <div className="relative">
                            <Icon name="Search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light" />
                            <input 
                                type="text"
                                value={recipeSearchQuery}
                                onChange={e => setRecipeSearchQuery(e.target.value)}
                                placeholder="Search recipes... / 搜索配方..."
                                className="w-full p-3 pl-10 bg-secondary rounded-lg border border-gray-200 focus:ring-2 focus:ring-primary-light focus:border-primary outline-none transition-all"
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 bg-secondary">
                         {filteredRecipes.length > 0 ? (
                            filteredRecipes.map((d: DrinkRecipe) => <DrinkCard key={d.id} drink={d} lang={lang} t={t} />)
                        ) : (
                            <div className="text-center py-12 text-text-light">
                                <Icon name="Search" size={32} className="mx-auto mb-3 opacity-50"/>
                                <p className="font-bold">No recipes found</p>
                                <p className="text-sm">Try a different keyword.</p>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        if (view === 'training') return <TrainingView data={data} onComplete={() => {}} />;
        if (view === 'sop') return <LibraryView data={data} onOpenChecklist={(key) => { setCurrentShift(key); setView('checklist'); }} />;
        if (view === 'checklist') { const tmpl = CHECKLIST_TEMPLATES[currentShift] || CHECKLIST_TEMPLATES['opening']; return (<div className="h-full flex flex-col bg-surface text-text"><div className={`${tmpl.color} p-6 text-white`}><button onClick={() => setView('sop')} className="mb-4"><Icon name="ArrowLeft" /></button><h2 className="text-3xl font-bold">{getLoc(tmpl.title)}</h2></div><div className="flex-1 overflow-y-auto p-4">{tmpl.items.map((i: any) => (<div key={i.id} className="p-4 border-b flex items-center gap-3"><div className="w-6 h-6 border-2 rounded"></div><div><p className="font-bold">{getLoc(i.text)}</p></div></div>))}</div><div className="p-4 border-t"><button onClick={()=>{alert('OK'); setView('home');}} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold transition-all active:scale-95">Confirm</button></div></div>); }
        if (view === 'availability') { setShowAvailabilityModal(true); setView('home'); return null; }
        
        return <div className="p-10 text-center text-text-light">Section {view} under maintenance <button onClick={()=>setView('home')} className="text-primary underline block mt-4">Back</button></div>;
    };

    return (
        <div className="max-w-md mx-auto min-h-screen max-h-[100dvh] overflow-y-auto bg-secondary relative flex flex-col font-sans pt-8 md:pt-0">
            <CustomConfirmModal isOpen={confirmModal.isOpen} title="Confirm Action" message={confirmModal.msg} onConfirm={confirmModal.action} onCancel={() => setConfirmModal(prev => ({...prev, isOpen:false}))} />
            <AvailabilityReminderModal isOpen={showAvailabilityReminder} t={t} onCancel={() => setShowAvailabilityReminder(false)} onConfirm={() => { setShowAvailabilityReminder(false); setShowAvailabilityModal(true); }} />
            <AvailabilityModal isOpen={showAvailabilityModal} onClose={() => setShowAvailabilityModal(false)} t={t} currentUser={currentUser} />

            <div className="flex-1 overflow-y-auto relative">{renderView()}</div>
            {view !== 'checklist' && (
                <nav className="fixed bottom-0 w-full max-w-md bg-surface border-t p-2 pb-4 z-50 flex overflow-x-auto shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] no-scrollbar gap-1">
                    {[{id: 'home', icon: 'Grid', label: 'Workbench'}, {id: 'team', icon: 'Calendar', label: 'Schedule'}, {id: 'chat', icon: 'MessageSquare', label: 'Chat'}, {id: 'training', icon: 'GraduationCap', label: 'Training'}, {id: 'sop', icon: 'Book', label: 'SOP'}, {id: 'recipes', icon: 'BookOpen', label: 'Recipes'}, {id: 'contact', icon: 'Users', label: 'Contacts'}].map(item => (
                        <button key={item.id} onClick={() => setView(item.id as StaffViewMode)} className={`relative min-w-[60px] flex flex-col items-center p-2 rounded-lg transition-colors ${view === item.id ? 'text-primary bg-primary-light' : 'text-text-light hover:text-primary'}`}>
                            <Icon name={item.icon} size={20} />
                            <span className="text-[10px] font-bold mt-1">{item.label}</span>
                            {item.id === 'chat' && hasUnreadChat && (
                                <span className="absolute top-1.5 right-3 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-surface"></span>
                            )}
                        </button>
                    ))}
                </nav>
            )}
        </div>
    );
};

const LoginScreen = ({ t, onLogin, users }: { t: any, onLogin: (id: string, keepLogin: boolean) => void, users: User[] }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [rememberPwd, setRememberPwd] = useState(false);
    const [keepLogin, setKeepLogin] = useState(true);

    useEffect(() => {
        const savedPwd = localStorage.getItem('onesip_saved_password');
        if (savedPwd) {
            try {
                setPassword(atob(savedPwd));
                setRememberPwd(true);
            } catch (e) { console.error("Pwd load error", e); }
        }
    }, []);

    const handleLogin = () => {
        const user = users.find(u => u.password === password && u.password && u.active !== false);
        if (user) {
            if (rememberPwd) {
                localStorage.setItem('onesip_saved_password', btoa(password));
            } else {
                localStorage.removeItem('onesip_saved_password');
            }
            onLogin(user.id, keepLogin);
        } else {
            setError(t.invalid_code);
            setTimeout(() => setError(''), 3000);
        }
    };
    
    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            handleLogin();
        }
    };

    return (
        <div className="min-h-screen max-h-[100dvh] overflow-y-auto bg-gradient-to-br from-gray-50 to-gray-200 flex flex-col items-center justify-center p-6 font-sans text-text animate-fade-in">
            <div className="text-center mb-10">
                <h1 className="text-3xl font-black text-text mb-1 tracking-tight">ONESIP {t.login_title.split(' ')[1]}</h1>
                <p className="text-text-light font-medium">Store Management System</p>
            </div>
            
            <div className="w-full max-w-xs space-y-4 z-10">
                <div className="relative">
                    <label className="absolute -top-2 left-3 px-1 bg-gradient-to-br from-gray-50 to-gray-200 text-xs font-bold text-text-light">{t.enter_code}</label>
                    <input 
                        type="password" 
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        onKeyDown={handleKeyDown}
                        className="w-full p-4 bg-white/80 backdrop-blur-sm rounded-xl font-bold text-lg text-center tracking-[0.2em] border-2 border-white focus:border-primary focus:ring-4 focus:ring-primary-light outline-none transition-all"
                        placeholder="••••••"
                        autoFocus
                    />
                </div>
                
                <div className="flex flex-col gap-2 mt-2 px-1">
                    <label className="flex items-center gap-2 text-xs text-text-light cursor-pointer select-none">
                        <input 
                            type="checkbox" 
                            checked={rememberPwd} 
                            onChange={e => setRememberPwd(e.target.checked)} 
                            className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer" 
                        />
                        记住密码 (Remember Password)
                    </label>
                    <label className="flex items-center gap-2 text-xs text-text-light cursor-pointer select-none">
                        <input 
                            type="checkbox" 
                            checked={keepLogin} 
                            onChange={e => setKeepLogin(e.target.checked)} 
                            className="rounded text-primary focus:ring-primary w-4 h-4 cursor-pointer" 
                        />
                        保持登录 (Keep Me Logged In)
                    </label>
                </div>

                {error && <p className="text-destructive text-xs text-center font-bold animate-pulse">{error}</p>}
                
                <button 
                    onClick={handleLogin}
                    className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-primary-light hover:bg-primary-dark active:scale-95 transition-all mt-4"
                >
                    {t.login_btn}
                </button>
                <div className="text-center pt-4">
                    <p className="text-xs text-gray-400 font-medium">v2.7.0 • ONESIP</p>
                </div>
            </div>
        </div>
    );
};


// --- APP COMPONENT ---
const App = () => {
    const [user, setUser] = useState<User | null>(() => {
        const saved = localStorage.getItem('onesip_user') || sessionStorage.getItem('onesip_user');
        return saved ? JSON.parse(saved) : null;
    });
    const [lang, setLang] = useState<Lang>('zh');
    const t = TRANSLATIONS[lang];
    
    const [users, setUsers] = useState<User[]>(STATIC_USERS); // Start with static data as fallback
    const [inventoryList, setInventoryList] = useState<any[]>(INVENTORY_ITEMS);
    const [schedule, setSchedule] = useState<any>({ title: '', days: [] });
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [sopList, setSopList] = useState<SopItem[]>(SOP_DATABASE);
    const [trainingLevels, setTrainingLevels] = useState<TrainingLevel[]>(TRAINING_LEVELS);
    const [recipes, setRecipes] = useState<DrinkRecipe[]>(DRINK_RECIPES);
    const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
    const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
    const [inventoryHistory, setInventoryHistory] = useState<InventoryReport[]>([]);
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [adminRole, setAdminRole] = useState<'manager' | 'owner' | 'editor' | null>(null);

    useEffect(() => {
        Cloud.seedInitialData();
        const unsubInv = Cloud.subscribeToInventory(setInventoryList);
        const unsubSched = Cloud.subscribeToSchedule(data => setSchedule(data || { title: '', days: [] }));
        const unsubContent = Cloud.subscribeToContent(data => { if (data?.sops) setSopList(data.sops); if (data?.training) setTrainingLevels(data.training); if (data?.recipes) setRecipes(data.recipes); });
        const unsubLogs = Cloud.subscribeToLogs(setLogs);
        const unsubChat = Cloud.subscribeToChat((msgs, notes) => { setDirectMessages(msgs); setNotices(notes); });
        const unsubSwaps = Cloud.subscribeToSwaps(setSwapRequests);
        const unsubSales = Cloud.subscribeToSales(setSalesRecords);
        const unsubHistory = Cloud.subscribeToInventoryHistory(setInventoryHistory);
        const unsubUsers = Cloud.subscribeToUsers(setUsers);
        return () => { unsubInv(); unsubSched(); unsubContent(); unsubLogs(); unsubChat(); unsubSwaps(); unsubSales(); unsubHistory(); unsubUsers(); };
    }, []);

    const handleLogin = (userId: string, persist: boolean) => { 
        const u = users.find(user => user.id === userId); 
        if (u) { 
            setUser(u); 
            if (persist) {
                localStorage.setItem('onesip_user', JSON.stringify(u)); 
            } else {
                sessionStorage.setItem('onesip_user', JSON.stringify(u));
            }
        } 
    };
    
    const handleLogout = () => { 
        setUser(null); 
        setAdminRole(null); 
        localStorage.removeItem('onesip_user'); 
        sessionStorage.removeItem('onesip_user');
    };

    const appData = { lang, setLang, t, users, inventoryList, setInventoryList, schedule, setSchedule, logs, setLogs, sopList, setSopList, trainingLevels, setTrainingLevels, recipes, setRecipes, directMessages, setDirectMessages, notices, setNotices, swapRequests, setSwapRequests, salesRecords, setSalesRecords, inventoryHistory, setInventoryHistory };

    if (!user) {
        return <LoginScreen t={t} onLogin={handleLogin} users={users} />;
    }

    if (adminRole === 'manager') {
        return <ManagerDashboard data={appData} onExit={() => setAdminRole(null)} />;
    }

    if (adminRole === 'owner') {
        return <OwnerDashboard data={appData} onExit={() => setAdminRole(null)} />;
    }
    
    if (adminRole === 'editor') {
        return <EditorDashboard data={appData} onExit={() => setAdminRole(null)} />;
    }

    return (
        <>
            <StaffApp 
                onSwitchMode={() => {}} 
                data={appData} 
                onLogout={handleLogout} 
                currentUser={user}
                openAdmin={() => setShowAdminModal(true)}
            />
            <AdminLoginModal 
                isOpen={showAdminModal} 
                onClose={() => setShowAdminModal(false)} 
                onLogin={(role) => { setAdminRole(role); setShowAdminModal(false); }} 
            />
        </>
    );
};

export default App;