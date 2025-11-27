
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './components/Icons';
import { TRANSLATIONS, CHECKLIST_TEMPLATES, DRINK_RECIPES, TRAINING_LEVELS, SOP_DATABASE, CONTACTS_DATA, INVENTORY_ITEMS, TEAM_MEMBERS, MOCK_SCHEDULE_WEEK02, INITIAL_MENU_DATA, INITIAL_WIKI_DATA, INITIAL_ANNOUNCEMENT_DATA, USERS } from './constants';
import { Lang, LogEntry, ChatMessage, DrinkRecipe, TrainingLevel, CustomerMenuItem, WikiItem, AnnouncementData, InventoryItem, WeeklySchedule, Notice, InventoryReport, SopItem, ContactItem, User, DirectMessage, ScheduleDay, SwapRequest, SalesRecord, StaffViewMode } from './types';
import * as Cloud from './services/cloud';

// --- CONSTANTS ---
// Botersloot 56A, 3011 HH Rotterdam Coordinates
const STORE_COORDS = { lat: 51.9207886, lng: 4.4863897 };

// --- HELPERS ---
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in km
  return d * 1000; // Return meters
}

function deg2rad(deg: number) {
  return deg * (Math.PI/180)
}

function getTodayMMDD() {
    const now = new Date();
    return `${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

function getYouTubeId(url: string | undefined) {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// --- Shared Components ---

const CloudSetupModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl text-center animate-fade-in">
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icon name="Globe" size={24} />
                </div>
                <h3 className="font-black text-xl text-gray-900 mb-2">Cloud Sync Unavailable</h3>
                <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                    The database connection could not be established. The app will work in <strong>Offline Mode</strong>, saving data to this device only.
                </p>
                <button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition">
                    Understand & Continue
                </button>
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
            <div className="bg-white rounded-3xl p-6 w-full max-w-xs shadow-2xl">
                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-2"><Icon name="Lock" size={24} className="text-white"/></div>
                    <h3 className="font-black text-xl text-gray-900">Admin Access</h3>
                    <p className="text-xs text-gray-400">Restricted Area</p>
                </div>
                <input type="password" value={pin} onChange={e => setPin(e.target.value)} className="w-full text-center text-2xl tracking-[0.5em] p-4 bg-gray-100 rounded-xl mb-4 font-black" placeholder="••••" autoFocus maxLength={6} />
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={onClose} className="p-3 rounded-xl bg-gray-200 text-gray-600 font-bold">Cancel</button>
                    <button onClick={handleEnter} className="p-3 rounded-xl bg-gray-900 text-white font-bold">Enter</button>
                </div>
            </div>
        </div>
    );
};

const NoticeModal = ({ notice, onClose }: { notice: Notice | null, onClose: () => void }) => {
    if (!notice) return null;
    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6 animate-fade-in">
            <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative">
                <div className="bg-gradient-to-r from-indigo-600 to-blue-500 p-6 text-white relative">
                    <div className="absolute top-4 right-4 bg-white/20 p-2 rounded-full cursor-pointer hover:bg-white/30 transition" onClick={onClose}>
                        <Icon name="X" size={16} className="text-white"/>
                    </div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="bg-white/20 p-2 rounded-lg"><Icon name="Megaphone" size={24} className="text-white" /></div>
                        <span className="text-xs font-bold uppercase tracking-wider bg-red-500 px-2 py-1 rounded">Announcement</span>
                    </div>
                    <h3 className="text-xl font-black">{notice.author} says:</h3>
                    <p className="text-indigo-100 text-xs mt-1">{notice.date}</p>
                </div>
                <div className="p-6">
                    <p className="text-gray-800 font-medium leading-relaxed whitespace-pre-line text-sm">{notice.content}</p>
                    <button onClick={onClose} className="w-full mt-6 bg-gray-900 text-white font-bold py-3 rounded-xl hover:bg-gray-800 transition">Got it</button>
                </div>
            </div>
        </div>
    );
};

// --- LOGIN MODULE ---

const LoginScreen = ({ t, onLogin }: { t: any, onLogin: (user: User) => void }) => {
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [step, setStep] = useState<'phone' | 'code'>('phone');
    const [error, setError] = useState('');

    const standardizePhone = (input: string) => {
        let cleaned = input.replace(/[^0-9]/g, '');
        if (cleaned.startsWith('06')) {
            cleaned = '31' + cleaned.substring(1);
        } else if (cleaned.length === 9 && cleaned.startsWith('6')) {
            cleaned = '31' + cleaned;
        }
        return cleaned;
    };

    const handleGetCode = () => {
        const standardInput = standardizePhone(phone);
        const user = USERS.find(u => u.phone === standardInput);
        if (user) {
            alert(`${t.code_sent}`);
            setStep('code');
            setError('');
        } else {
            setError(t.invalid_phone + ` (Debug: ${standardInput})`);
        }
    };

    const handleLogin = () => {
        if (code === '1234') {
            const standardInput = standardizePhone(phone);
            const user = USERS.find(u => u.phone === standardInput);
            if(user) onLogin(user);
        } else {
            setError(t.invalid_code);
        }
    };

    return (
        <div className="h-screen bg-gray-900 flex flex-col items-center justify-center p-6 text-white relative overflow-hidden">
            <div className="absolute top-[-20%] left-[-20%] w-[140%] h-[60%] bg-gradient-to-b from-indigo-500/20 to-transparent rounded-full blur-3xl pointer-events-none"></div>
            <div className="w-full max-w-sm relative z-10">
                <div className="mb-10 text-center">
                    <h1 className="text-4xl font-black mb-2 tracking-tight">ONESIP</h1>
                    <p className="text-gray-400 text-sm tracking-widest uppercase">Pocket Manager AI</p>
                </div>
                <div className="bg-gray-800/50 backdrop-blur-xl border border-gray-700 p-8 rounded-3xl shadow-2xl">
                    <h2 className="text-xl font-bold mb-6 text-center">{t.login_title}</h2>
                    {step === 'phone' ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">{t.enter_phone}</label>
                                <div className="flex bg-gray-900/50 border border-gray-600 rounded-xl overflow-hidden">
                                    <span className="p-3 text-gray-400 text-sm bg-gray-800 border-r border-gray-700">+31</span>
                                    <input type="tel" className="w-full bg-transparent p-3 text-white focus:outline-none text-lg font-mono tracking-wide placeholder-gray-600" placeholder="6 12345678" value={phone} onChange={e => setPhone(e.target.value)} />
                                </div>
                            </div>
                            <button onClick={handleGetCode} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-indigo-500/20">{t.get_code}</button>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-fade-in">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 mb-1 ml-1">{t.enter_code}</label>
                                <input type="text" maxLength={4} className="w-full bg-gray-900/50 border border-gray-600 p-3 rounded-xl text-white focus:border-indigo-500 focus:outline-none text-center text-2xl font-mono tracking-[0.5em]" placeholder="••••" value={code} onChange={e => setCode(e.target.value)} />
                            </div>
                            <button onClick={handleLogin} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition shadow-lg shadow-green-500/20">{t.login_btn}</button>
                            <button onClick={() => setStep('phone')} className="w-full text-xs text-gray-400 hover:text-white mt-2">{t.cancel}</button>
                        </div>
                    )}
                    {error && <p className="text-red-400 text-xs text-center mt-4 bg-red-500/10 p-2 rounded-lg">{error}</p>}
                </div>
            </div>
            <p className="mt-8 text-gray-600 text-xs text-center relative z-10 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Cloud Sync Ready</p>
        </div>
    );
};

// --- STAFF MODULES ---

const InventoryView = ({ lang, t, inventoryList, setInventoryList, isOwner, onSubmit, currentUser }: { lang: Lang, t: any, inventoryList: InventoryItem[], setInventoryList?: any, isOwner?: boolean, onSubmit?: (data: any) => void, currentUser?: User }) => {
    const [employee, setEmployee] = useState(currentUser?.name || ''); 
    const [inputData, setInputData] = useState<Record<string, { end: string, waste: string }>>({});
    const [newItemName, setNewItemName] = useState({ zh: '', en: '' });
    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';
    const handleInputChange = (id: string, field: 'end' | 'waste', value: string) => { setInputData(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } })); };
    const handleEditItem = (id: string, field: string, subField: 'zh'|'en'|'val'|'def', value: string) => {
        const updatedList = inventoryList.map(item => {
            if (item.id === id) {
                let newItem = { ...item };
                if (field === 'name') newItem.name = { ...item.name, [subField as any]: value };
                if (field === 'unit') newItem.unit = value;
                if (field === 'threshold') newItem.threshold = Number(value);
                if (field === 'default') newItem.defaultVal = value;
                return newItem;
            }
            return item;
        });
        setInventoryList(updatedList);
        Cloud.saveInventoryList(updatedList);
    };
    const handleSaveReport = () => {
        if (!employee) return alert(t.select_employee);
        if (!window.confirm(t.save_report_confirm)) return;
        const reportData = { submittedBy: employee, userId: currentUser?.id, data: inputData };
        if(onSubmit) onSubmit(reportData);
        alert(t.save_success);
        setInputData({}); 
    };
    const addItem = () => {
        if(!newItemName.zh || !newItemName.en) return;
        const newItem: InventoryItem = { id: `inv_${Date.now()}`, name: newItemName, unit: 'unit' };
        const updatedList = [...inventoryList, newItem];
        setInventoryList(updatedList);
        Cloud.saveInventoryList(updatedList);
        setNewItemName({ zh: '', en: '' });
    }
    return (
        <div className="flex flex-col h-full bg-gray-50 pb-20 animate-fade-in">
            <div className="bg-white p-4 border-b sticky top-0 z-10 space-y-3">
                <div className="flex justify-between items-center"><h2 className="text-xl font-black text-gray-900">{t.inventory_title}</h2>{isOwner && <span className="bg-black text-white text-[10px] px-2 py-1 rounded">OWNER MODE</span>}</div>
                {!isOwner ? (<div className="w-full p-2 rounded-lg border bg-gray-100 text-sm font-bold text-gray-600 flex items-center gap-2"><Icon name="User" size={16} />{employee} (Auto-detected)</div>) : (<div className="flex flex-col gap-2 bg-gray-100 p-2 rounded-lg"><span className="text-[10px] font-bold text-gray-500 uppercase">{t.add_new}</span><div className="flex gap-2"><input placeholder="Name (ZH)" className="flex-1 p-2 border rounded text-xs text-black bg-white" value={newItemName.zh} onChange={e=>setNewItemName({...newItemName, zh: e.target.value})} /><input placeholder="Name (EN)" className="flex-1 p-2 border rounded text-xs text-black bg-white" value={newItemName.en} onChange={e=>setNewItemName({...newItemName, en: e.target.value})} /><button onClick={addItem} className="bg-green-600 text-white p-2 rounded"><Icon name="Plus" size={16}/></button></div></div>)}
                {!isOwner && <div className="grid grid-cols-4 text-[10px] text-gray-400 uppercase font-bold mt-2 text-center"><div className="text-left pl-2 col-span-2">{t.item_name}</div><div>{t.end_count}</div><div>{t.waste}</div></div>}
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
                {inventoryList.map(item => {
                    const data = inputData[item.id] || { end: '', waste: '' };
                    return (
                        <div key={item.id} className="bg-white p-3 rounded-xl border shadow-sm flex flex-col gap-2 border-gray-100">
                            <div className="flex items-center justify-between">
                                {isOwner ? (<div className="w-full flex flex-col gap-2"><div className="flex gap-2"><input className="flex-1 border p-1 rounded text-xs font-bold text-gray-900 bg-white" value={item.name.zh} onChange={e => handleEditItem(item.id, 'name', 'zh', e.target.value)} placeholder="ZH Name"/><input className="flex-1 border p-1 rounded text-xs font-bold text-gray-900 bg-white" value={item.name.en} onChange={e => handleEditItem(item.id, 'name', 'en', e.target.value)} placeholder="EN Name"/></div><div className="flex gap-2 items-center"><input className="w-16 border p-1 rounded text-xs text-gray-900 bg-white" value={item.unit} onChange={e => handleEditItem(item.id, 'unit', 'val', e.target.value)} placeholder="Unit"/><span className="text-[10px] text-gray-500">Alert:</span><input type="number" className="w-12 border p-1 rounded text-xs text-gray-900 bg-white" value={item.threshold || ''} onChange={e => handleEditItem(item.id, 'threshold', 'val', e.target.value)} placeholder="Min"/><span className="text-[10px] text-gray-500">Preset:</span><input type="text" className="w-12 border p-1 rounded text-xs text-gray-900 bg-white" value={item.defaultVal || ''} onChange={e => handleEditItem(item.id, 'default', 'def', e.target.value)} placeholder="Def"/><button onClick={() => {const filtered = inventoryList.filter(i => i.id !== item.id);setInventoryList(filtered);Cloud.saveInventoryList(filtered);}} className="ml-auto text-red-500 bg-red-100 p-2 rounded"><Icon name="Trash" size={14}/></button></div></div>) : (<><div className="flex-1 pr-2 col-span-2"><div className="font-bold text-sm text-gray-800 flex items-center gap-2">{getLoc(item.name)}</div><div className="text-[10px] text-gray-400">{item.unit}</div></div><div className="flex gap-2 w-2/5 relative"><input type="number" placeholder={item.defaultVal || 'End'} className="w-1/2 p-2 rounded-lg border text-center text-sm" value={data.end || ''} onChange={(e) => handleInputChange(item.id, 'end', e.target.value)} /><input type="number" placeholder="Waste" className="w-1/2 p-2 rounded-lg border border-red-100 text-center text-sm bg-red-50 text-red-600" value={data.waste || ''} onChange={(e) => handleInputChange(item.id, 'waste', e.target.value)} /></div></>)}
                            </div>
                            {!isOwner && item.defaultVal && (<button onClick={() => handleInputChange(item.id, 'end', item.defaultVal!)} className="text-[10px] bg-indigo-50 text-indigo-600 self-start px-2 py-0.5 rounded border border-indigo-100 font-bold hover:bg-indigo-100">Use Preset: {item.defaultVal}</button>)}
                        </div>
                    );
                })}
            </div>
            {!isOwner && <div className="p-4 bg-white border-t sticky bottom-20 z-10"><button onClick={handleSaveReport} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2"><Icon name="Save" size={20} />{t.save_report}</button></div>}
        </div>
    );
};

const ContactView = ({ t, lang }: { t: any, lang: Lang }) => {
    const handleCopy = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        alert(`${t.copied}: ${text}`);
    };
    return (
        <div className="h-full overflow-y-auto p-4 bg-gray-50 animate-fade-in">
            <h2 className="text-2xl font-black text-gray-900 mb-4">{t.contact_title}</h2>
            <div className="space-y-3">
                {CONTACTS_DATA.map(c => (
                    <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                        <div><h3 className="font-bold text-gray-800">{c.name}</h3><p className="text-xs text-gray-500">{c.role[lang]}</p>{c.phone && <p onClick={() => handleCopy(c.phone!)} className="text-xs text-indigo-500 mt-1 cursor-pointer hover:underline">{c.phone}</p>}</div>
                        {c.phone ? (<a href={`tel:${c.phone}`} className="bg-green-100 text-green-600 p-3 rounded-full hover:bg-green-200 transition"><Icon name="Phone" size={20} /></a>) : (<span className="text-gray-300 text-xs italic">No Phone</span>)}
                    </div>
                ))}
            </div>
        </div>
    );
};

const ChatView = ({ t, currentUser, messages, setMessages, notices, onExit }: { t: any, currentUser: User, messages: DirectMessage[], setMessages: (m: DirectMessage[]) => void, notices: Notice[], onExit?: () => void }) => {
    const [activeChannel, setActiveChannel] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    const [noticeFrequency, setNoticeFrequency] = useState<'always' | 'daily' | 'once'>('daily');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); };
    useEffect(() => { if(activeChannel) scrollToBottom(); }, [messages, activeChannel]);
    const handleSend = () => {
        if (!inputText.trim() || !activeChannel) return;
        if (activeChannel === 'announcements') {
            const newNotice: Notice = { id: Date.now().toString(), author: currentUser.name, content: inputText, date: new Date().toLocaleString(), isUrgent: false, frequency: noticeFrequency };
            Cloud.saveNotice(newNotice);
        } else {
            const newMessage: DirectMessage = { id: Date.now().toString(), fromId: currentUser.id, toId: activeChannel, content: inputText, timestamp: new Date().toLocaleString(), read: false };
            setMessages([...messages, newMessage]);
            Cloud.saveMessage(newMessage);
        }
        setInputText('');
    };
    const getUnreadCount = (userId: string) => messages.filter(m => m.fromId === userId && m.toId === currentUser.id && !m.read).length;
    const canPostAnnouncements = currentUser.role === 'manager' || currentUser.role === 'boss';
    if (activeChannel) {
        const isAnnouncements = activeChannel === 'announcements';
        const partner = isAnnouncements ? null : USERS.find(u => u.id === activeChannel);
        const threadMessages = isAnnouncements ? [] : messages.filter(m => (m.fromId === currentUser.id && m.toId === activeChannel) || (m.fromId === activeChannel && m.toId === currentUser.id));
        return (
            <div className="h-full flex flex-col bg-gray-50 relative pb-[80px]"> 
                <div className="p-4 bg-white border-b flex items-center gap-3 sticky top-0 z-20 shadow-sm"><button onClick={() => setActiveChannel(null)}><Icon name="ArrowLeft" /></button><div><h3 className="font-bold text-gray-900">{isAnnouncements ? t.team_board : partner?.name}</h3><p className="text-[10px] text-gray-400">{isAnnouncements ? 'Sync with Manager' : partner?.role}</p></div></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {isAnnouncements ? (notices.length > 0 ? notices.map(n => (<div key={n.id} className="bg-white p-4 rounded-xl border-l-4 border-indigo-500 shadow-sm"><div className="flex justify-between items-start mb-2"><span className="font-bold text-indigo-900 text-sm">{n.author}</span><span className="text-[10px] text-gray-400">{n.date}</span></div><p className="text-gray-700 text-sm whitespace-pre-line">{n.content}</p><div className="mt-2 flex gap-1"><span className="text-[9px] bg-gray-100 px-2 py-0.5 rounded text-gray-500">Freq: {n.frequency || 'daily'}</span></div></div>)) : <div className="text-center text-gray-400 mt-10">{t.no_messages}</div>) : (threadMessages.length > 0 ? threadMessages.map(m => { const isMe = m.fromId === currentUser.id; return (<div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[75%] p-3 rounded-2xl text-sm shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none border'}`}><p>{m.content}</p><div className={`text-[9px] mt-1 text-right ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>{m.timestamp.split(',')[1]}</div></div></div>); }) : <div className="text-center text-gray-400 mt-10 text-xs">Start a conversation with {partner?.name}</div>)}
                    <div ref={messagesEndRef} />
                </div>
                {(!isAnnouncements || canPostAnnouncements) && (<div className="fixed bottom-0 left-0 right-0 z-[100] bg-white border-t p-3 shadow-up pb-8 md:pb-3 max-w-md mx-auto">{isAnnouncements && (<div className="flex gap-2 mb-2 justify-center"><span className="text-[10px] text-gray-500 pt-1">Popup:</span><button onClick={()=>setNoticeFrequency('daily')} className={`text-[10px] px-2 py-0.5 rounded ${noticeFrequency === 'daily' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>Daily</button><button onClick={()=>setNoticeFrequency('always')} className={`text-[10px] px-2 py-0.5 rounded ${noticeFrequency === 'always' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>Always</button><button onClick={()=>setNoticeFrequency('once')} className={`text-[10px] px-2 py-0.5 rounded ${noticeFrequency === 'once' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}>Once</button></div>)}<div className="flex gap-2"><input value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={isAnnouncements ? "Post new announcement..." : t.type_message} className="flex-1 bg-gray-100 rounded-full px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"/><button onClick={handleSend} disabled={!inputText.trim()} className="p-3 bg-blue-600 text-white rounded-full disabled:opacity-50"><Icon name="Send" size={18} /></button></div></div>)}
            </div>
        );
    }
    return (
        <div className="h-full bg-white flex flex-col">
            <div className="p-4 border-b flex justify-between items-center"><h2 className="text-2xl font-black text-gray-900">{t.chat}</h2><button onClick={() => { if(onExit) onExit(); else setActiveChannel(null); }} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200 text-gray-500"><Icon name="X" size={20} /></button></div>
            <div className="flex-1 overflow-y-auto pb-20">
                <div onClick={() => setActiveChannel('announcements')} className="flex items-center gap-4 p-4 hover:bg-gray-50 border-b cursor-pointer transition"><div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center"><Icon name="Megaphone" /></div><div className="flex-1"><h3 className="font-bold text-gray-900">{t.team_board}</h3><p className="text-xs text-gray-500 truncate">{notices[0]?.content || t.no_messages}</p></div>{notices.length > 0 && <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>}</div>
                <h3 className="text-xs font-bold text-gray-400 uppercase p-4 pb-2">{t.recent}</h3>
                {USERS.filter(u => u.id !== currentUser.id).map(user => { const unread = getUnreadCount(user.id); const lastMsg = [...messages].reverse().find(m => (m.fromId === user.id && m.toId === currentUser.id) || (m.fromId === currentUser.id && m.toId === user.id)); return (<div key={user.id} onClick={() => setActiveChannel(user.id)} className="flex items-center gap-4 p-4 hover:bg-gray-50 cursor-pointer transition"><div className="relative"><div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 text-lg">{user.name[0]}</div>{unread > 0 && <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white font-bold">{unread}</div>}</div><div className="flex-1 min-w-0"><div className="flex justify-between items-baseline"><h3 className="font-bold text-gray-900">{user.name}</h3>{lastMsg && <span className="text-[10px] text-gray-400">{lastMsg.timestamp.split(',')[1]}</span>}</div><p className={`text-xs truncate ${unread > 0 ? 'font-bold text-gray-800' : 'text-gray-500'}`}>{lastMsg ? (lastMsg.fromId === currentUser.id ? `You: ${lastMsg.content}` : lastMsg.content) : 'No messages'}</p></div></div>); })}
            </div>
        </div>
    );
};

const DrinkCard = ({ drink, lang, t }: { drink: DrinkRecipe, lang: Lang, t: any }) => {
    const [expanded, setExpanded] = useState(false);
    return (<div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}><div className="flex justify-between items-center"><div><h3 className="font-bold text-gray-800">{drink.name[lang] || drink.name['zh']}</h3><p className="text-xs text-gray-500">{drink.cat} • {drink.size}</p></div><Icon name={expanded ? "ChevronUp" : "ChevronRight"} size={20} className="text-gray-400" /></div>{expanded && (<div className="mt-3 text-sm text-gray-600 space-y-2 border-t pt-2"><p><strong>Toppings:</strong> {drink.toppings[lang] || drink.toppings['zh']}</p><p><strong>Sugar:</strong> {drink.sugar}</p><p><strong>Ice:</strong> {drink.ice}</p><div className="bg-blue-50 p-2 rounded"><p className="font-bold text-blue-800 mb-1">Cold Steps:</p><ol className="list-decimal pl-4">{drink.steps.cold.map((s:any, i:number) => <li key={i}>{s[lang]||s['zh']}</li>)}</ol></div><div className="bg-orange-50 p-2 rounded"><p className="font-bold text-orange-800 mb-1">Warm Steps:</p><ol className="list-decimal pl-4">{drink.steps.warm.map((s:any, i:number) => <li key={i}>{s[lang]||s['zh']}</li>)}</ol></div></div>)}</div>);
};

const TrainingView = ({ data, onComplete }: { data: any, onComplete: (levelId: number) => void }) => {
    const { trainingLevels, t, lang } = data;
    const [activeLevel, setActiveLevel] = useState<TrainingLevel | null>(null);
    if (activeLevel) { return (<div className="h-full flex flex-col bg-white animate-fade-in"><div className="p-4 border-b flex items-center gap-3"><button onClick={() => setActiveLevel(null)}><Icon name="ArrowLeft"/></button><h2 className="font-bold text-lg">{activeLevel.title[lang] || activeLevel.title['zh']}</h2></div><div className="flex-1 overflow-y-auto p-4 space-y-6"><div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100"><h3 className="font-bold text-indigo-900 mb-2">Overview</h3><p className="text-sm text-indigo-800">{activeLevel.desc[lang] || activeLevel.desc['zh']}</p></div>{activeLevel.youtubeLink && (<div className="rounded-xl overflow-hidden shadow-lg border border-gray-200"><iframe className="w-full aspect-video" src={`https://www.youtube.com/embed/${getYouTubeId(activeLevel.youtubeLink)}`} title="Training Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe></div>)}{activeLevel.content.map((c: any, i: number) => (<div key={i}><h3 className="font-bold text-gray-900 mb-2">{i+1}. {c.title[lang] || c.title['zh']}</h3><p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{c.body[lang] || c.body['zh']}</p></div>))}<div className="pt-6"><h3 className="font-bold text-gray-900 mb-4">Quiz</h3>{activeLevel.quiz.map((q: any, i: number) => (<div key={q.id} className="mb-4 bg-gray-50 p-4 rounded-xl"><p className="font-bold text-sm mb-2">{i+1}. {q.question[lang] || q.question['zh']}</p><div className="space-y-2">{q.options?.map((opt: string, idx: number) => (<button key={idx} className="w-full text-left p-3 bg-white border rounded-lg text-sm hover:bg-gray-100">{opt}</button>))}</div></div>))}</div></div></div>); }
    return (<div className="h-full overflow-y-auto bg-gray-50 p-4 animate-fade-in"><h2 className="text-2xl font-black text-gray-900 mb-4">{t.training}</h2><div className="space-y-3">{trainingLevels.map((l: TrainingLevel) => (<div key={l.id} onClick={() => setActiveLevel(l)} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md transition"><div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center font-bold text-lg">{l.id}</div><div className="flex-1"><h3 className="font-bold text-gray-800">{l.title[lang] || l.title['zh']}</h3><p className="text-xs text-gray-500">{l.subtitle[lang] || l.subtitle['zh']}</p></div><Icon name="ChevronRight" className="text-gray-300"/></div>))}</div></div>);
};

const LibraryView = ({ data, onOpenChecklist }: { data: any, onOpenChecklist: (key: string) => void }) => {
    const { sopList, t, lang } = data;
    return (<div className="h-full overflow-y-auto bg-gray-50 p-4 animate-fade-in"><h2 className="text-2xl font-black text-gray-900 mb-4">{t.sop_library}</h2><div className="grid grid-cols-2 gap-3 mb-6"><button onClick={() => onOpenChecklist('opening')} className="p-4 bg-yellow-100 text-yellow-800 rounded-xl font-bold flex flex-col items-center gap-2"><Icon name="Sun" size={24}/> Opening</button><button onClick={() => onOpenChecklist('mid')} className="p-4 bg-blue-100 text-blue-800 rounded-xl font-bold flex flex-col items-center gap-2"><Icon name="Clock" size={24}/> Mid-Day</button><button onClick={() => onOpenChecklist('closing')} className="p-4 bg-purple-100 text-purple-800 rounded-xl font-bold flex flex-col items-center gap-2"><Icon name="Moon" size={24}/> Closing</button></div><div className="space-y-3">{sopList.map((s: SopItem) => (<div key={s.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100"><div className="flex justify-between items-start mb-2"><h3 className="font-bold text-gray-800">{s.title[lang] || s.title['zh']}</h3><span className="text-[10px] bg-gray-100 px-2 py-1 rounded text-gray-500 uppercase">{s.category}</span></div><p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">{s.content[lang] || s.content['zh']}</p></div>))}</div></div>);
}

const OwnerDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    // ... (Same content as previous)
    const { inventoryList, setInventoryList, t, lang, inventoryHistory, salesRecords, setSalesRecords } = data;
    const [view, setView] = useState<'inventory' | 'history' | 'prediction'>('inventory');
    const [weather, setWeather] = useState<any>(null);
    const [newSales, setNewSales] = useState({ time: '15:00', amount: '' });
    useEffect(() => { if (view === 'prediction') { fetch('https://api.open-meteo.com/v1/forecast?latitude=51.92&longitude=4.48&current_weather=true').then(res => res.json()).then(data => setWeather(data.current_weather)).catch(err => console.error("Weather fetch failed", err)); } }, [view]);
    const exportCSV = () => { if (!inventoryHistory || inventoryHistory.length === 0) return alert("No history to export"); let csv = "Date,User,Item,Count,Waste\n"; inventoryHistory.forEach((report: InventoryReport) => { Object.keys(report.data).forEach(itemId => { const itemName = inventoryList.find((i:any) => i.id === itemId)?.name.en || itemId; csv += `${report.date},${report.submittedBy},${itemName},${report.data[itemId].end},${report.data[itemId].waste}\n`; }); }); const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csv); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "inventory_history.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link); };
    const handleSalesSubmit = () => { if (!newSales.amount) return; const record: SalesRecord = { id: Date.now().toString(), date: new Date().toLocaleDateString(), timeSlot: newSales.time as any, amount: parseFloat(newSales.amount), weatherTemp: weather?.temperature || 0, weatherCode: weather?.weathercode || 0 }; Cloud.saveSalesRecord(record); setNewSales({ ...newSales, amount: '' }); alert("Sales recorded for Prediction Model!"); };
    const getDeterministicPrediction = () => { if (salesRecords.length < 1) return null; const recentSales = salesRecords.slice(-14); const totalRev = recentSales.reduce((acc: number, curr: any) => acc + curr.amount, 0); const daysCount = Math.max(1, recentSales.length / 2); const avgDailyRev = totalRev / daysCount; let weatherMultiplier = 1.0; if (weather) { const temp = weather.temperature; if (temp > 25) weatherMultiplier = 1.3; else if (temp > 20) weatherMultiplier = 1.1; else if (temp < 10) weatherMultiplier = 0.8; if ([51,53,55,61,63,65,80,81,82].includes(weather.weathercode)) { weatherMultiplier *= 0.8; } } const projectedWeeklyRev = avgDailyRev * 7 * weatherMultiplier; const drinksCount = projectedWeeklyRev / 6.5; return { avgDailyRev: avgDailyRev.toFixed(2), weatherFactor: weatherMultiplier.toFixed(2), estRevenue: projectedWeeklyRev.toFixed(2), estDrinks: Math.ceil(drinksCount), restock: [ { item: "Cups (500/700ml)", amount: Math.ceil(drinksCount) + " pcs" }, { item: "Tapioca Pearls", amount: (drinksCount * 0.05).toFixed(1) + " kg" }, { item: "Fresh Milk", amount: (drinksCount * 0.15).toFixed(1) + " L" }, { item: "Tea Leaves (Raw)", amount: (drinksCount * 0.015).toFixed(2) + " kg" }, { item: "Fructose/Sugar", amount: (drinksCount * 0.03).toFixed(1) + " kg" } ] }; };
    const prediction = getDeterministicPrediction();
    return (
        <div className="h-full flex flex-col bg-gray-900 text-white">
            <div className="p-4 bg-gray-800 text-white shadow-lg shrink-0"><div className="flex justify-between items-center mb-4"><h2 className="text-xl font-black text-yellow-400">Owner Command</h2><button onClick={onExit} className="bg-gray-700 p-2 rounded-lg text-white"><Icon name="LogOut" size={20}/></button></div><div className="flex gap-2"><button onClick={() => setView('inventory')} className={`px-4 py-2 rounded text-xs font-bold ${view === 'inventory' ? 'bg-yellow-500 text-gray-900' : 'bg-gray-700'}`}>Inventory</button><button onClick={() => setView('history')} className={`px-4 py-2 rounded text-xs font-bold ${view === 'history' ? 'bg-yellow-500 text-gray-900' : 'bg-gray-700'}`}>History (CSV)</button><button onClick={() => setView('prediction')} className={`px-4 py-2 rounded text-xs font-bold ${view === 'prediction' ? 'bg-yellow-500 text-gray-900' : 'bg-gray-700'}`}>Smart Forecast</button></div></div>
            <div className="flex-1 overflow-hidden bg-gray-100 text-gray-900">
                 {view === 'inventory' && (<InventoryView lang={lang} t={t} inventoryList={inventoryList} setInventoryList={setInventoryList} isOwner={true} />)}
                 {view === 'history' && (<div className="p-4 h-full overflow-y-auto"><button onClick={exportCSV} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold mb-4 flex justify-center gap-2 shadow-lg"><Icon name="List" /> Download CSV Report</button><div className="space-y-3">{inventoryHistory?.slice().reverse().map((report: InventoryReport) => (<div key={report.id} className="bg-white p-4 rounded-xl shadow-sm border"><div className="flex justify-between mb-2"><span className="font-bold text-gray-800">{report.date}</span><span className="text-sm text-gray-500">{report.submittedBy}</span></div><div className="text-xs text-gray-400">Recorded {Object.keys(report.data).length} items</div></div>))}{(!inventoryHistory || inventoryHistory.length === 0) && <p className="text-center text-gray-400 mt-10">No reports found.</p>}</div></div>)}
                 {view === 'prediction' && (<div className="p-4 h-full overflow-y-auto"><div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-6 rounded-2xl shadow-lg mb-6 relative overflow-hidden"><div className="relative z-10"><h3 className="font-bold text-blue-100 text-sm mb-1 uppercase tracking-wider">Rotterdam Live</h3><div className="flex items-end gap-2"><span className="text-5xl font-black">{weather ? weather.temperature : '--'}°</span><span className="mb-2 text-blue-200">Celsius</span></div><p className="text-sm mt-2 opacity-80">Windspeed: {weather ? weather.windspeed : '--'} km/h</p></div><Icon name="Sun" size={120} className="absolute -right-6 -top-6 text-yellow-400 opacity-20" /></div><div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-6"><h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Icon name="Edit" size={18}/> Record Sales Data</h3><div className="flex gap-2 mb-4"><button onClick={() => setNewSales({...newSales, time: '15:00'})} className={`flex-1 py-2 rounded-lg font-bold text-xs ${newSales.time === '15:00' ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>15:00 Checkpoint</button><button onClick={() => setNewSales({...newSales, time: '19:00'})} className={`flex-1 py-2 rounded-lg font-bold text-xs ${newSales.time === '19:00' ? 'bg-black text-white' : 'bg-gray-100 text-gray-500'}`}>19:00 Checkpoint</button></div><div className="flex gap-2"><span className="bg-gray-100 p-3 rounded-xl font-bold text-gray-500">€</span><input type="number" placeholder="Enter Sales Amount" className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 font-mono font-bold" value={newSales.amount} onChange={e => setNewSales({...newSales, amount: e.target.value})} /><button onClick={handleSalesSubmit} className="bg-blue-600 text-white p-3 rounded-xl"><Icon name="Save" /></button></div></div>{prediction && (<div className="bg-white p-6 rounded-2xl shadow-sm border border-yellow-200 bg-yellow-50/50"><h3 className="font-bold text-yellow-800 mb-4 flex items-center gap-2"><Icon name="Sparkles" /> V1.0 Restock Forecast (Next 7 Days)</h3><div className="mb-4 text-xs text-gray-500 bg-white p-3 rounded-lg border border-yellow-100"><p><strong>Avg Daily Rev:</strong> €{prediction.avgDailyRev}</p><p><strong>Weather Multiplier:</strong> x{prediction.weatherFactor}</p><p><strong>Est. Total Sales:</strong> {prediction.estDrinks} drinks</p></div><div className="space-y-2">{prediction.restock.map((item, idx) => (<div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg border border-yellow-100"><span className="text-sm text-gray-600 font-bold">{item.item}</span><span className="text-lg font-black text-gray-900">{item.amount}</span></div>))}</div></div>)}</div>)}
            </div>
        </div>
    );
};

const EditorDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    // ... (Same content as previous)
    const { sopList, setSopList, trainingLevels, setTrainingLevels, recipes, setRecipes, t, lang } = data;
    const [view, setView] = useState<'training' | 'sop' | 'recipes'>('training');
    const [editingItem, setEditingItem] = useState<any>(null);
    const createNewItem = () => { const id = Date.now().toString(); if (view === 'training') return { id, title: {zh:'',en:''}, subtitle: {zh:'',en:''}, desc: {zh:'',en:''}, youtubeLink: '', content: [{title:{zh:'',en:''}, body:{zh:'',en:''}}], quiz: [] }; if (view === 'sop') return { id, title: {zh:'',en:''}, content: {zh:'',en:''}, tags: [], category: 'General' }; if (view === 'recipes') return { id, name: {zh:'',en:''}, cat: 'Milk Tea', size: '500ml', ice: 'Standard', sugar: '100%', toppings: {zh:'',en:''}, steps: {cold:[], warm:[]} }; };
    const handleSave = () => { if (!editingItem) return; let updatedList; let setList; if (view === 'sop') { updatedList = sopList.some((i:any) => i.id === editingItem.id) ? sopList.map((i:any) => i.id === editingItem.id ? editingItem : i) : [...sopList, editingItem]; setList = setSopList; Cloud.saveContent('sops', updatedList); } else if (view === 'training') { updatedList = trainingLevels.some((i:any) => i.id === editingItem.id) ? trainingLevels.map((i:any) => i.id === editingItem.id ? editingItem : i) : [...trainingLevels, editingItem]; setList = setTrainingLevels; Cloud.saveContent('training', updatedList); } else { updatedList = recipes.some((i:any) => i.id === editingItem.id) ? recipes.map((i:any) => i.id === editingItem.id ? editingItem : i) : [...recipes, editingItem]; setList = setRecipes; Cloud.saveContent('recipes', updatedList); } setList(updatedList); setEditingItem(null); };
    const handleDelete = (id: string) => { if(!window.confirm("Delete this item?")) return; if (view === 'sop') { const list = sopList.filter((i:any) => i.id !== id); setSopList(list); Cloud.saveContent('sops', list); } else if (view === 'training') { const list = trainingLevels.filter((i:any) => i.id !== id); setTrainingLevels(list); Cloud.saveContent('training', list); } else { const list = recipes.filter((i:any) => i.id !== id); setRecipes(list); Cloud.saveContent('recipes', list); } };
    const renderEditorFields = () => { if (!editingItem) return null; if (view === 'training') { return (<div className="space-y-4"><div><label className="block text-xs font-bold text-emerald-500 mb-1">MODULE TITLE</label><input className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-sm mb-1 text-white" placeholder="ZH Title" value={editingItem.title.zh} onChange={e => setEditingItem({...editingItem, title: {...editingItem.title, zh: e.target.value}})} /><input className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white" placeholder="EN Title" value={editingItem.title.en} onChange={e => setEditingItem({...editingItem, title: {...editingItem.title, en: e.target.value}})} /></div><div><label className="block text-xs font-bold text-emerald-500 mb-1">DESCRIPTION</label><textarea className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white h-20" placeholder="EN Description" value={editingItem.desc.en} onChange={e => setEditingItem({...editingItem, desc: {...editingItem.desc, en: e.target.value}})} /></div><div><label className="block text-xs font-bold text-red-500 mb-1 flex items-center gap-2"><Icon name="Play" size={12}/> YOUTUBE VIDEO LINK</label><input className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white" placeholder="https://youtu.be/..." value={editingItem.youtubeLink || ''} onChange={e => setEditingItem({...editingItem, youtubeLink: e.target.value})} /></div><div><label className="block text-xs font-bold text-emerald-500 mb-2">CONTENT SECTIONS</label>{editingItem.content.map((section: any, idx: number) => (<div key={idx} className="bg-gray-800 p-3 rounded mb-2 border border-gray-700"><input className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-xs mb-1 text-white font-bold" placeholder="Section Title (EN)" value={section.title.en} onChange={e => { const newContent = [...editingItem.content]; newContent[idx].title.en = e.target.value; setEditingItem({...editingItem, content: newContent}); }} /><textarea className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-xs text-white h-24" placeholder="Body Text (EN)" value={section.body.en} onChange={e => { const newContent = [...editingItem.content]; newContent[idx].body.en = e.target.value; setEditingItem({...editingItem, content: newContent}); }} /></div>))}<button onClick={() => setEditingItem({...editingItem, content: [...editingItem.content, {title:{zh:'',en:''}, body:{zh:'',en:''}}]})} className="text-xs text-emerald-400 hover:text-emerald-300">+ Add Section</button></div></div>); } if (view === 'sop') { return (<div className="space-y-4"><input className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white font-bold" placeholder="Title (EN)" value={editingItem.title.en} onChange={e => setEditingItem({...editingItem, title: {...editingItem.title, en: e.target.value}})} /><input className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white" placeholder="Category (e.g. Opening)" value={editingItem.category} onChange={e => setEditingItem({...editingItem, category: e.target.value})} /><div><label className="block text-xs font-bold text-emerald-500 mb-1">CONTENT (EN)</label><textarea className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white h-40 font-mono" value={editingItem.content.en} onChange={e => setEditingItem({...editingItem, content: {...editingItem.content, en: e.target.value}})} /></div><div><label className="block text-xs font-bold text-emerald-500 mb-1">CONTENT (ZH)</label><textarea className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white h-40 font-mono" value={editingItem.content.zh} onChange={e => setEditingItem({...editingItem, content: {...editingItem.content, zh: e.target.value}})} /></div></div>); } return (<div className="space-y-4"><input className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white font-bold" placeholder="Name (EN)" value={editingItem.name.en} onChange={e => setEditingItem({...editingItem, name: {...editingItem.name, en: e.target.value}})} /> <input className="w-full bg-gray-900 border border-gray-700 p-2 rounded text-sm text-white font-bold" placeholder="Name (ZH)" value={editingItem.name.zh} onChange={e => setEditingItem({...editingItem, name: {...editingItem.name, zh: e.target.value}})} /></div>); };

    return (
        <div className="h-full flex flex-col bg-gray-900 text-white">
           <div className="p-4 bg-gray-800 border-b border-gray-700 flex justify-between items-center">
               <h2 className="text-xl font-bold">{t.editor_title}</h2>
               <button onClick={onExit}><Icon name="X" /></button>
           </div>
           <div className="flex-1 overflow-y-auto p-4">
                <div className="flex gap-2 mb-4">
                     {['training', 'sop', 'recipes'].map(m => (
                         <button key={m} onClick={() => setView(m as any)} className={`px-4 py-2 rounded text-xs font-bold uppercase ${view === m ? 'bg-emerald-500 text-white' : 'bg-gray-800 text-gray-400'}`}>{m}</button>
                     ))}
                </div>
                
                {editingItem ? (
                    <div className="bg-gray-800 p-4 rounded-xl border border-gray-700">
                        {renderEditorFields()}
                        <div className="flex gap-3 mt-4">
                            <button onClick={() => setEditingItem(null)} className="flex-1 py-3 bg-gray-700 rounded-xl font-bold text-gray-300">Cancel</button>
                            <button onClick={handleSave} className="flex-1 py-3 bg-emerald-600 rounded-xl font-bold text-white">Save Changes</button>
                        </div>
                    </div>
                ) : (
                   <div className="space-y-2">
                       <button onClick={() => setEditingItem(createNewItem())} className="w-full py-4 border-2 border-dashed border-gray-700 rounded-xl text-gray-500 font-bold hover:border-emerald-500 hover:text-emerald-500 transition">+ Add New Item</button>
                       {(view === 'training' ? trainingLevels : view === 'sop' ? sopList : recipes).map((item: any) => (
                           <div key={item.id} className="bg-gray-800 p-4 rounded-xl flex justify-between items-center border border-gray-700">
                               <div>
                                   <h3 className="font-bold text-sm">{item.title?.en || item.name?.en}</h3>
                                   <p className="text-xs text-gray-500">{item.id}</p>
                               </div>
                               <div className="flex gap-2">
                                   <button onClick={() => setEditingItem(item)} className="p-2 bg-blue-900 text-blue-400 rounded"><Icon name="Edit" size={16}/></button>
                                   <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-900 text-red-400 rounded"><Icon name="Trash" size={16}/></button>
                               </div>
                           </div>
                       ))}
                   </div>
                )}
           </div>
        </div>
    );
};

const CustomerApp = ({ onSwitchMode, data }: { onSwitchMode: () => void, data: any }) => {
    return (<div className="h-screen bg-white flex flex-col items-center justify-center p-6 text-center"><div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-6"><Icon name="Coffee" size={32} /></div><h1 className="text-3xl font-black mb-2 text-gray-900">Customer Kiosk</h1><p className="text-gray-500 mb-8 max-w-xs">Self-service ordering system is currently under maintenance.</p><button onClick={onSwitchMode} className="bg-gray-100 text-gray-900 px-6 py-3 rounded-xl font-bold hover:bg-gray-200 transition">Switch to Staff Mode</button></div>);
};

// ... ManagerDashboard updates ...

const ManagerDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const currentUser = { id: 'u_lambert', name: 'Lambert', role: 'manager', phone: '31626419957' } as User;
    const { schedule, setSchedule, notices, setNotices, logs, t, directMessages, setDirectMessages, swapRequests, setSwapRequests } = data;
    const [view, setView] = useState<'schedule' | 'logs' | 'chat' | 'financial' | 'requests'>('schedule');
    const [draggedEmployee, setDraggedEmployee] = useState<string | null>(null);
    const [budgetMax, setBudgetMax] = useState<number>(() => Number(localStorage.getItem('onesip_budget_max')) || 5000);
    const [wages, setWages] = useState<Record<string, number>>(() => JSON.parse(localStorage.getItem('onesip_wages') || '{}'));
    const [weekOffset, setWeekOffset] = useState(0); 

    useEffect(() => { localStorage.setItem('onesip_budget_max', budgetMax.toString()); }, [budgetMax]);
    useEffect(() => { localStorage.setItem('onesip_wages', JSON.stringify(wages)); }, [wages]);

    const calculateFinancials = () => {
        const stats: Record<string, { morning: number, evening: number, estHours: number, estCost: number, actualHours: number, actualCost: number }> = {};
        TEAM_MEMBERS.forEach(m => { stats[m] = { morning: 0, evening: 0, estHours: 0, estCost: 0, actualHours: 0, actualCost: 0 }; });
        if (schedule?.days) {
            schedule.days.forEach((day: any) => {
                day.morning.forEach((p: string) => { if(stats[p]) stats[p].morning++ });
                day.evening.forEach((p: string) => { if(stats[p]) stats[p].evening++ });
            });
        }
        const userLogs: Record<string, LogEntry[]> = {};
        if (logs) { logs.forEach((l: LogEntry) => { if (!l.name) return; if (!userLogs[l.name]) userLogs[l.name] = []; userLogs[l.name].push(l); }); }
        Object.keys(userLogs).forEach(name => {
            if(!stats[name]) return;
            const sorted = userLogs[name].sort((a,b) => new Date(a.time).getTime() - new Date(b.time).getTime());
            let lastIn: number | null = null;
            sorted.forEach(log => {
                if (log.shift === 'clock-in') { lastIn = new Date(log.time).getTime(); } else if (log.shift === 'clock-out' && lastIn) { const diffHrs = (new Date(log.time).getTime() - lastIn) / (1000 * 60 * 60); if (diffHrs > 0 && diffHrs < 16) { stats[name].actualHours += diffHrs; } lastIn = null; }
            });
        });
        let totalEstCost = 0; let totalActualCost = 0;
        Object.keys(stats).forEach(p => { const estH = (stats[p].morning * 5) + (stats[p].evening * 4.5); const wage = wages[p] || 12; stats[p].estHours = estH; stats[p].estCost = estH * wage; stats[p].actualCost = stats[p].actualHours * wage; totalEstCost += stats[p].estCost; totalActualCost += stats[p].actualCost; });
        return { stats, totalEstCost, totalActualCost };
    };
    const { stats, totalEstCost, totalActualCost } = calculateFinancials();
    const exportCSV = () => { let csvContent = "data:text/csv;charset=utf-8,"; csvContent += "Name,Role,Morning Shifts,Evening Shifts,Est Hours,Actual Hours,Hourly Wage,Est Cost,Actual Cost\n"; Object.keys(stats).forEach(p => { const s = stats[p]; if (s.estHours > 0 || s.actualHours > 0) { csvContent += `${p},Staff,${s.morning},${s.evening},${s.estHours.toFixed(1)},${s.actualHours.toFixed(1)},${wages[p] || 12},${s.estCost.toFixed(2)},${s.actualCost.toFixed(2)}\n`; } }); csvContent += `TOTAL,,,,,,${totalEstCost.toFixed(2)},${totalActualCost.toFixed(2)}\n`; csvContent += `BUDGET,,,,,,${budgetMax},${budgetMax}\n`; csvContent += `BALANCE (Actual),,,,,,${(budgetMax - totalActualCost).toFixed(2)}\n`; const encodedUri = encodeURI(csvContent); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "onesip_financial_report.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link); };
    const ensureScheduleDays = () => { if (!schedule.days) return; const requiredIndex = (weekOffset + 1) * 7; if (schedule.days.length < requiredIndex) { const newDays = [...schedule.days]; const lastDay = newDays[newDays.length - 1]; let [m, d] = lastDay.date.split('-').map(Number); const needed = requiredIndex - newDays.length; for(let i=0; i<needed; i++) { d++; if (d > 31) { d=1; m++; } const dateStr = `${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; newDays.push({ name: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][(newDays.length)%7], zh: ["周一","周二","周三","周四","周五","周六","周日"][(newDays.length)%7], date: dateStr, morning: [], evening: [], hours: { morning: {start:'10:00', end:'15:00'}, evening: {start:'14:30', end:'19:00'} } }); } const newSched = {...schedule, days: newDays}; setSchedule(newSched); Cloud.saveSchedule(newSched); } };
    useEffect(() => { ensureScheduleDays(); }, [weekOffset]);
    const handleDrop = (e: React.DragEvent, dayIdx: number, shiftType: 'morning' | 'evening') => { e.preventDefault(); const name = e.dataTransfer.getData("text/plain"); if (name && schedule?.days) { const realIdx = dayIdx + (weekOffset * 7); if (!schedule.days[realIdx]) { ensureScheduleDays(); return; } const currentShifts = schedule.days[realIdx][shiftType]; if (currentShifts.length >= 3) { alert("Max 3 people!"); return; } if (currentShifts.includes(name)) { alert("Already in shift!"); return; } const newSchedule = { ...schedule }; newSchedule.days[realIdx][shiftType].push(name); setSchedule(newSchedule); Cloud.saveSchedule(newSchedule); } };
    const removeShift = (dayIdx: number, shiftType: 'morning' | 'evening', nameIndex: number) => { const realIdx = dayIdx + (weekOffset * 7); const newSchedule = { ...schedule }; newSchedule.days[realIdx][shiftType].splice(nameIndex, 1); setSchedule(newSchedule); Cloud.saveSchedule(newSchedule); };
    const updateHours = (dayIdx: number, type: 'morning'|'evening', field: 'start'|'end', value: string) => { const realIdx = dayIdx + (weekOffset * 7); const newSchedule = { ...schedule }; if (!newSchedule.days[realIdx].hours) { newSchedule.days[realIdx].hours = { morning: {start:'10:00', end:'15:00'}, evening: {start:'14:30', end:'19:00'} }; } newSchedule.days[realIdx].hours![type][field] = value; setSchedule(newSchedule); Cloud.saveSchedule(newSchedule); };

    // --- REVISED MANAGER CONFIRM SWAP LOGIC (FIXED) ---
    const confirmSwap = (req: SwapRequest) => {
        // Deep clone to ensure React state updates and no reference issues
        const newSchedule = JSON.parse(JSON.stringify(schedule));
        let reqFound = false;
        let targetFound = false;

        // Helpers acting on the cloned object
        const removeFromShift = (day: any, shift: 'morning' | 'evening', name: string) => {
            const idx = day[shift].indexOf(name);
            if (idx !== -1) {
                day[shift].splice(idx, 1);
                return true;
            }
            return false;
        };

        const addToShift = (day: any, shift: 'morning' | 'evening', name: string) => {
            if (!day[shift].includes(name)) {
                day[shift].push(name);
            }
        };

        const reqDay = newSchedule.days.find((d: any) => d.date === req.requesterDate);
        const targetDay = newSchedule.days.find((d: any) => d.date === req.targetDate);

        if (!reqDay || !targetDay) return alert("Error: Schedule dates not found.");

        // 1. Remove Requester
        if (removeFromShift(reqDay, req.requesterShift, req.requesterName)) reqFound = true;
        else return alert(`Error: ${req.requesterName} not found in ${req.requesterDate} ${req.requesterShift}`);

        // 2. Remove Target (if present - strict swap)
        if (removeFromShift(targetDay, req.targetShift, req.targetName)) targetFound = true;
        
        // 3. Swap
        addToShift(targetDay, req.targetShift, req.requesterName);
        addToShift(reqDay, req.requesterShift, req.targetName);

        setSchedule(newSchedule);
        Cloud.saveSchedule(newSchedule);

        const updatedReqs = swapRequests.map((r: SwapRequest) => r.id === req.id ? {...r, status: 'approved'} : r);
        setSwapRequests(updatedReqs);
        Cloud.updateSwapRequests(updatedReqs);

        alert("✅ Swap Confirmed & Schedule Updated!");
    };

    const currentWeekDays = schedule?.days ? schedule.days.slice(weekOffset * 7, (weekOffset + 1) * 7) : [];
    const managerPendingRequests = swapRequests?.filter((r: SwapRequest) => r.status === 'accepted_by_peer') || [];

    return (
        <div className="h-full flex flex-col bg-indigo-50 overflow-hidden">
            <div className="bg-indigo-600 p-6 text-white shadow-lg shrink-0">
                <div className="flex justify-between items-center mb-4"><div><h1 className="text-2xl font-black">{t.manager_title}</h1><p className="text-xs text-indigo-200">Ops & Team</p></div><button onClick={onExit} className="bg-indigo-500 p-2 rounded-lg"><Icon name="LogOut" /></button></div>
                <div className="flex bg-indigo-800/50 p-1 rounded-xl overflow-x-auto no-scrollbar gap-1"><button onClick={() => setView('schedule')} className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold ${view === 'schedule' ? 'bg-white text-indigo-600' : 'text-indigo-200'}`}>Scheduling</button><button onClick={() => setView('requests')} className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold ${view === 'requests' ? 'bg-white text-indigo-600' : 'text-indigo-200'}`}>Requests ({managerPendingRequests.length})</button><button onClick={() => setView('logs')} className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold ${view === 'logs' ? 'bg-white text-indigo-600' : 'text-indigo-200'}`}>Monitoring</button><button onClick={() => setView('chat')} className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold ${view === 'chat' ? 'bg-white text-indigo-600' : 'text-indigo-200'}`}>Chat</button><button onClick={() => setView('financial')} className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold ${view === 'financial' ? 'bg-white text-indigo-600' : 'text-indigo-200'}`}>Financial</button></div>
            </div>
            <div className="flex-1 overflow-hidden relative flex flex-col">
                {view === 'financial' && (<div className="flex-1 overflow-y-auto p-4 bg-gray-50"><div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"><div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm"><h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Total Budget</h3><div className="flex items-center gap-2"><span className="text-gray-400">€</span><input type="number" className="text-2xl font-black text-gray-900 w-full outline-none" value={budgetMax} onChange={e => setBudgetMax(Number(e.target.value))} /></div></div><div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm"><h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Estimated Cost</h3><p className="text-2xl font-black text-indigo-400">€{totalEstCost.toFixed(2)}</p></div><div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm"><h3 className="text-xs font-bold text-gray-500 uppercase mb-1">Actual Cost</h3><p className="text-2xl font-black text-indigo-600">€{totalActualCost.toFixed(2)}</p></div><div className={`p-4 rounded-xl border shadow-sm ${budgetMax - totalActualCost >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}><h3 className={`text-xs font-bold uppercase mb-1 ${budgetMax - totalActualCost >= 0 ? 'text-green-600' : 'text-red-600'}`}>Balance</h3><p className={`text-2xl font-black ${budgetMax - totalActualCost >= 0 ? 'text-green-700' : 'text-red-700'}`}>€{(budgetMax - totalActualCost).toFixed(2)}</p></div></div><div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6"><div className="p-4 border-b bg-gray-50 flex justify-between items-center"><h3 className="font-bold text-gray-800">Staff Wages & Actuals</h3><button onClick={exportCSV} className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 hover:bg-indigo-200"><Icon name="List" size={14}/> Export CSV</button></div><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-50 text-gray-500 text-xs uppercase"><tr><th className="p-3">Staff</th><th className="p-3">Wage (€/hr)</th><th className="p-3">Est. Hours</th><th className="p-3">Actual Hours</th><th className="p-3 text-right">Actual Pay</th></tr></thead><tbody className="divide-y divide-gray-100">{Object.keys(stats).filter(p => stats[p].estHours > 0 || stats[p].actualHours > 0 || wages[p]).map(p => (<tr key={p}><td className="p-3 font-bold text-gray-900">{p}</td><td className="p-3"><input type="number" className="w-16 border rounded p-1 text-center bg-gray-50" value={wages[p] || 12} onChange={e => setWages({...wages, [p]: Number(e.target.value)})}/></td><td className="p-3 font-mono text-gray-400">{stats[p].estHours}h</td><td className="p-3 font-mono font-bold text-indigo-600">{stats[p].actualHours.toFixed(1)}h</td><td className="p-3 text-right font-bold text-gray-900">€{stats[p].actualCost.toFixed(2)}</td></tr>))}</tbody></table></div></div></div>)}
                {view === 'requests' && (<div className="flex-1 overflow-y-auto p-4 bg-gray-50"><h3 className="font-bold text-indigo-900 mb-4">Pending Swap Confirmations</h3><div className="space-y-3">{managerPendingRequests.length === 0 && <p className="text-gray-400 text-sm text-center">No swaps pending manager approval.</p>}{managerPendingRequests.map((req: SwapRequest) => (<div key={req.id} className="bg-white p-4 rounded-xl shadow-sm border border-green-200 relative overflow-hidden"><div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] px-2 py-1 font-bold uppercase rounded-bl-xl">Staff Agreed</div><div className="flex justify-between items-center mb-2 mt-2"><div className="flex items-center gap-2"><span className="font-bold text-gray-800">{req.requesterName}</span><Icon name="ArrowLeft" className="rotate-180 text-gray-400" size={14}/><span className="font-bold text-gray-800">{req.targetName}</span></div></div><div className="text-sm text-gray-500 mb-3 bg-gray-50 p-2 rounded"><div className="flex justify-between"><span>{req.requesterName}: <strong>{req.requesterDate} ({req.requesterShift})</strong></span></div><div className="text-center text-xs text-gray-300 my-1">⇅</div><div className="flex justify-between"><span>{req.targetName}: <strong>{req.targetDate} ({req.targetShift})</strong></span></div></div><button onClick={() => confirmSwap(req)} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold text-sm shadow-md hover:bg-indigo-700 transition">Finalize & Update Schedule</button></div>))}</div></div>)}
                {view === 'schedule' && schedule?.days && (<div className="flex h-full flex-col md:flex-row overflow-hidden"><div className="w-full md:w-1/3 bg-white border-r border-indigo-100 p-4 overflow-y-auto shadow-xl z-10 shrink-0 h-48 md:h-full"><div className="mb-4 bg-indigo-50 p-4 rounded-xl border border-indigo-100"><h3 className="text-sm font-black text-indigo-900 mb-2">Staff List</h3><p className="text-xs text-gray-500 mb-2">Drag names to schedule</p><div className="flex flex-wrap gap-2">{TEAM_MEMBERS.map(member => (<div key={member} draggable onDragStart={(e) => {e.dataTransfer.setData("text/plain", member); setDraggedEmployee(member);}} className="px-3 py-2 bg-white rounded-lg text-xs font-bold text-gray-700 cursor-move border shadow-sm hover:scale-105 transition">{member}</div>))}</div></div></div><div className="flex-1 overflow-y-auto p-4 bg-gray-50"><div className="flex justify-between items-center mb-4"><button onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset===0} className="p-2 bg-white rounded-full shadow disabled:opacity-50"><Icon name="ChevronLeft" /></button><span className="font-bold text-gray-700">Week {weekOffset + 1} (Planning up to 8 weeks)</span><button onClick={() => setWeekOffset(Math.min(7, weekOffset + 1))} className="p-2 bg-white rounded-full shadow"><Icon name="ChevronRight" /></button></div><div className="space-y-4">{currentWeekDays.map((day: any, idx: number) => { const mStart = day.hours?.morning?.start || '10:00'; const mEnd = day.hours?.morning?.end || '15:00'; const eStart = day.hours?.evening?.start || '14:30'; const eEnd = day.hours?.evening?.end || '19:00'; return (<div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200"><div className="flex justify-between items-center mb-3"><h3 className="font-bold text-gray-800">{day.name} <span className="text-gray-400 font-normal text-xs ml-1">{day.zh} ({day.date})</span></h3></div><div className="mb-3"><div className="flex justify-between items-center mb-1"><div className="text-[10px] font-bold text-orange-500 uppercase">{t.morning_shift}</div><div className="flex gap-1 text-[10px]"><input className="w-10 text-center border rounded bg-gray-50" value={mStart} onChange={e=>updateHours(idx,'morning','start',e.target.value)} /><span>-</span><input className="w-10 text-center border rounded bg-gray-50" value={mEnd} onChange={e=>updateHours(idx,'morning','end',e.target.value)} /></div></div><div onDrop={(e) => handleDrop(e, idx, 'morning')} onDragOver={(e)=>e.preventDefault()} className="min-h-[40px] border-2 border-dashed rounded-lg p-2 flex flex-wrap gap-2 bg-orange-50/30 border-orange-200">{day.morning.map((name: string, i: number) => (<div key={i} className="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">{name}<button onClick={() => removeShift(idx, 'morning', i)}><Icon name="X" size={12}/></button></div>))}</div></div><div><div className="flex justify-between items-center mb-1"><div className="text-[10px] font-bold text-indigo-500 uppercase">{t.evening_shift}</div><div className="flex gap-1 text-[10px]"><input className="w-10 text-center border rounded bg-gray-50" value={eStart} onChange={e=>updateHours(idx,'evening','start',e.target.value)} /><span>-</span><input className="w-10 text-center border rounded bg-gray-50" value={eEnd} onChange={e=>updateHours(idx,'evening','end',e.target.value)} /></div></div><div onDrop={(e) => handleDrop(e, idx, 'evening')} onDragOver={(e)=>e.preventDefault()} className="min-h-[40px] border-2 border-dashed rounded-lg p-2 flex flex-wrap gap-2 bg-indigo-50/30 border-indigo-200">{day.evening.map((name: string, i: number) => (<div key={i} className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">{name}<button onClick={() => removeShift(idx, 'evening', i)}><Icon name="X" size={12}/></button></div>))}</div></div></div>); })}</div></div></div>)}
                {view === 'logs' && (<div className="flex-1 overflow-y-auto p-4 flex flex-col"><h3 className="font-bold text-indigo-900 mb-4">Activity Logs</h3><div className="space-y-2">{logs?.map((log: LogEntry) => (<div key={log.id} className="bg-white p-3 rounded-lg border flex justify-between items-center shadow-sm"><div><div className="font-bold text-sm text-gray-800 flex items-center gap-2">{log.name || 'System'} <span className={`text-[10px] px-2 py-0.5 rounded-full ${log.type?.includes('clock') ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{log.type}</span></div><div className="text-xs text-gray-500 mt-1">{log.time} - {log.shift}</div></div>{log.reason && <div className="text-[10px] font-bold bg-gray-50 px-2 py-1 rounded border border-gray-200 text-gray-600">{log.reason}</div>}</div>))}</div></div>)}
                {view === 'chat' && (<ChatView t={t} currentUser={currentUser} messages={directMessages} setMessages={setDirectMessages} notices={notices} />)}
            </div>
        </div>
    );
};

const StaffApp = ({ onSwitchMode, data, onLogout, currentUser }: { onSwitchMode: () => void, data: any, onLogout: () => void, currentUser: User }) => {
    // ... (Same as before with GPS updates)
    const { lang, setLang, menuItems, setMenuItems, promoData, setPromoData, schedule, notices, logs, setLogs, t, swapRequests, setSwapRequests } = data;
    const [view, setView] = useState<StaffViewMode>('home');
    const [currentShift, setCurrentShift] = useState<string | null>(null);
    const [showAdminLogin, setShowAdminLogin] = useState(false);
    const [adminRole, setAdminRole] = useState<'none' | 'manager' | 'owner' | 'editor'>('none');
    const [activeNotice, setActiveNotice] = useState<Notice | null>(null);
    const getLoc = (obj: any) => obj[lang] || obj['zh'];
    const unreadMessages = data.directMessages.filter((m: DirectMessage) => m.toId === currentUser.id && !m.read).length;
    const getNextShift = () => { if (!schedule || !schedule.days || !Array.isArray(schedule.days)) return null; const today = new Date(); for (const day of schedule.days) { if (day.morning.includes(currentUser.name)) return { day: day.name, date: day.date, type: 'Morning', zh: day.zh }; if (day.evening.includes(currentUser.name)) return { day: day.name, date: day.date, type: 'Evening', zh: day.zh }; } return null; };
    const nextShift = getNextShift();
    useEffect(() => { if (notices && notices.length > 0) { const latest = notices[notices.length - 1]; const lastSeen = localStorage.getItem(`notice_seen_${latest.id}`); const todayStr = new Date().toLocaleDateString(); if (latest.frequency === 'always') { setActiveNotice(latest); } else if (latest.frequency === 'daily') { if (lastSeen !== todayStr) { setActiveNotice(latest); localStorage.setItem(`notice_seen_${latest.id}`, todayStr); } } else if (latest.frequency === 'once') { if (!lastSeen) { setActiveNotice(latest); localStorage.setItem(`notice_seen_${latest.id}`, 'seen'); } } } }, [notices]);

    // --- SMART CLOCK-IN SYSTEM (GPS + SCHEDULE + TASK RULES) ---
    const handleClockLog = (type: 'clock-in' | 'clock-out') => {
        const now = new Date();
        const todayStr = getTodayMMDD();
        const fullTodayStr = now.toLocaleDateString();

        // 1. SCHEDULE VALIDATION (Strict)
        const daySchedule = schedule?.days?.find((d: any) => d.date === todayStr);
        const isScheduledMorning = daySchedule?.morning?.includes(currentUser.name);
        const isScheduledEvening = daySchedule?.evening?.includes(currentUser.name);

        if (!daySchedule || (!isScheduledMorning && !isScheduledEvening)) {
            alert(`⛔️ Clock-in Blocked\nYou are not scheduled for today (${todayStr}).`);
            return;
        }

        // 2. TASK COMPLETION RULES (For Clock-Out only)
        if (type === 'clock-out') {
            const isMorningShiftTime = now.getHours() < 16; 
            // Check logs for today
            const todayLogs = logs.filter(l => new Date(l.time).toLocaleDateString() === fullTodayStr);
            const hasInventory = todayLogs.some(l => l.type === 'inventory');
            const hasClosing = todayLogs.some(l => l.type === 'checklist' && (l.shift.includes('Closing') || l.shift.includes('晚班')));

            if (isMorningShiftTime) {
                // Morning Requirement: Inventory
                if (!hasInventory) return alert("⚠️ Cannot Clock Out\nYou must complete 'Inventory Management' first.");
            } else {
                // Evening Requirement: Inventory + Closing SOP
                let missing = [];
                if (!hasInventory) missing.push("Inventory Management");
                if (!hasClosing) missing.push("Closing SOP Checklist");
                
                if (missing.length > 0) {
                    return alert(`⚠️ Cannot Clock Out\nPlease complete: \n- ${missing.join('\n- ')}`);
                }
            }
        }
        
        // 3. GPS CHECK
        if (!navigator.geolocation) {
            alert("Geolocation is not supported. Proceeding with 'GPS Unknown'.");
            performClockIn(type, "GPS Unknown");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const dist = getDistanceFromLatLonInKm(
                    position.coords.latitude, 
                    position.coords.longitude, 
                    STORE_COORDS.lat, 
                    STORE_COORDS.lng
                );
                
                // 500m threshold as per requirement
                // If < 500m, mark as "300m内" (Within 300m)
                // If > 500m, mark as "300m外" (Outside 300m)
                let locTag = "";
                let alertMsg = "";

                if (dist <= 500) {
                    locTag = "300m内"; // Label requested
                    alertMsg = `✅ Success! Location: Within 300m`;
                } else {
                    locTag = "300m外"; // Label requested
                    alertMsg = `⚠️ Warning: You are far from the store (${Math.round(dist)}m). Marked as Outside 300m.`;
                }

                alert(alertMsg);
                performClockIn(type, locTag);
            },
            (error) => {
                console.error("GPS Error", error);
                alert("⚠️ GPS Error. Please allow location access.");
                performClockIn(type, "GPS Error");
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    };

    const performClockIn = (type: 'clock-in' | 'clock-out', locationTag: string) => {
        const newLog: LogEntry = { 
            id: Date.now(), 
            shift: type, 
            name: currentUser.name, 
            userId: currentUser.id, 
            time: new Date().toLocaleString(), 
            type: type, 
            reason: locationTag // Storing GPS tag here
        };
        setLogs([newLog, ...logs]);
        Cloud.saveLog(newLog);
    };

    const requestSwap = (reqData: any) => {
        const targetUser = USERS.find(u => u.name === reqData.targetName);
        if (!targetUser) return alert("User not found");
        
        const req: SwapRequest = {
            id: Date.now().toString(),
            requesterName: currentUser.name,
            requesterId: currentUser.id,
            requesterDate: reqData.sourceDate,
            requesterShift: reqData.sourceShift,
            targetName: reqData.targetName,
            targetId: targetUser.id,
            targetDate: reqData.targetDate,
            targetShift: reqData.targetShift,
            status: 'pending',
            timestamp: Date.now()
        };
        Cloud.saveSwapRequest(req);
        // Explicit Confirmation for Requester
        alert(`✅ Request Sent!\n\nYou asked ${reqData.targetName} to swap.\nWait for them to accept in their app.`);
    };

    const handleSwapDrop = (e: React.DragEvent, targetDate: string, targetShift: 'morning'|'evening', targetName: string) => {
        e.preventDefault();
        e.stopPropagation(); 
        
        try {
            const rawData = e.dataTransfer.getData("application/json");
            if (!rawData) return;
            const data = JSON.parse(rawData);
            
            if (data.user === currentUser.name && targetName !== currentUser.name) {
                // Confirmation Dialog
                const confirmMsg = `Confirm Swap Request?\n\nMy Shift: ${data.date} (${data.shift})\nTarget: ${targetName} on ${targetDate} (${targetShift})`;
                if (window.confirm(confirmMsg)) {
                    requestSwap({
                        sourceDate: data.date,
                        sourceShift: data.shift,
                        targetName: targetName,
                        targetDate: targetDate,
                        targetShift: targetShift
                    });
                }
            }
        } catch (err) {
            console.error("Swap drop error", err);
        }
    };

    const handleSwapAction = (reqId: string, action: 'accepted_by_peer' | 'rejected') => {
        const updatedReqs = swapRequests.map((r: SwapRequest) => r.id === reqId ? {...r, status: action} : r);
        setSwapRequests(updatedReqs);
        Cloud.updateSwapRequests(updatedReqs);
    };

    // ... (submitChecklist, handleInventorySubmit, renderStaffView same as before with updated calls)
    const submitChecklist = () => { if (!currentShift) return; const tmpl = CHECKLIST_TEMPLATES[currentShift]; const newLog: LogEntry = { id: Date.now(), shift: getLoc(tmpl.title), name: currentUser.name, userId: currentUser.id, time: new Date().toLocaleString(), status: 'Completed', type: 'checklist' }; setLogs([newLog, ...logs]); Cloud.saveLog(newLog); setCurrentShift(null); setView('sop'); alert(t.submit_success); };
    const handleInventorySubmit = (reportData: any) => { const newLog: LogEntry = { id: Date.now(), shift: "Inventory", name: reportData.submittedBy, userId: reportData.userId, time: new Date().toLocaleString(), type: 'inventory', reason: "Submitted Report" }; setLogs([newLog, ...logs]); Cloud.saveLog(newLog); const report: InventoryReport = { id: Date.now(), date: new Date().toLocaleDateString(), submittedBy: reportData.submittedBy, userId: reportData.userId, data: reportData.data }; Cloud.saveInventoryReport(report); };

    if (adminRole === 'manager') return <ManagerDashboard data={data} onExit={() => setAdminRole('none')} />;
    if (adminRole === 'owner') return <OwnerDashboard data={data} onExit={() => setAdminRole('none')} />;
    if (adminRole === 'editor') return <EditorDashboard data={data} onExit={() => setAdminRole('none')} />;

    const clientSchedule = { ...schedule, days: schedule?.days?.slice(0, 14) || [] };
    const myPendingSwaps = swapRequests?.filter((r: SwapRequest) => r.targetId === currentUser.id && r.status === 'pending') || [];
    const mySwapHistory = swapRequests?.filter((r: SwapRequest) => (r.requesterId === currentUser.id || r.targetId === currentUser.id) && !(r.targetId === currentUser.id && r.status === 'pending')).sort((a,b) => b.timestamp - a.timestamp) || [];

    const renderStaffView = () => {
        if (view === 'team') {
            return (
                <div className="h-full overflow-y-auto p-4 bg-gray-50 animate-fade-in">
                    <h2 className="text-2xl font-black text-gray-900 mb-4">{t.team_title} (2 Weeks)</h2>
                    
                    {/* Action Items: Incoming Requests */}
                    {myPendingSwaps.length > 0 && (<div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl mb-4 shadow-sm"><h3 className="font-bold text-yellow-800 mb-2 flex items-center gap-2"><Icon name="Bell" size={16}/> Swap Requests (Action Required)</h3>{myPendingSwaps.map((req: SwapRequest) => (<div key={req.id} className="bg-white p-3 rounded-lg shadow-sm mb-2 border border-gray-100"><p className="text-sm text-gray-700"><strong>{req.requesterName}</strong> wants your shift on <strong>{req.targetDate}</strong>.<br/>They offer: <strong>{req.requesterDate} ({req.requesterShift})</strong>.</p><div className="flex gap-2 mt-2"><button onClick={()=>handleSwapAction(req.id, 'accepted_by_peer')} className="flex-1 bg-green-100 text-green-700 py-2 rounded-lg text-xs font-bold hover:bg-green-200 transition">Agree</button><button onClick={()=>handleSwapAction(req.id, 'rejected')} className="flex-1 bg-red-100 text-red-700 py-2 rounded-lg text-xs font-bold hover:bg-red-200 transition">Decline</button></div></div>))}</div>)}
                    
                    {/* Status Tracker: My Outgoing/Processed Requests */}
                    {mySwapHistory.length > 0 && (
                        <div className="mb-6 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <h3 className="font-bold text-gray-400 text-xs uppercase mb-3 flex items-center gap-2"><Icon name="List" size={12}/> Request Status</h3>
                            {mySwapHistory.map(req => {
                                let statusColor = 'bg-gray-100 text-gray-500';
                                let statusText = 'Waiting';
                                if (req.status === 'pending') { statusColor = 'bg-orange-100 text-orange-600'; statusText = 'Wait for Peer'; }
                                if (req.status === 'accepted_by_peer') { statusColor = 'bg-blue-100 text-blue-600'; statusText = 'Wait for Manager'; }
                                if (req.status === 'approved') { statusColor = 'bg-green-100 text-green-600'; statusText = 'Approved'; }
                                if (req.status === 'rejected') { statusColor = 'bg-red-100 text-red-600'; statusText = 'Rejected'; }
                                
                                return (
                                    <div key={req.id} className="flex justify-between items-center mb-2 last:mb-0 border-b last:border-0 pb-2 last:pb-0">
                                        <div className="text-xs">
                                            <div className="flex items-center gap-1 font-bold text-gray-700">
                                                <span>{req.requesterId === currentUser.id ? 'You' : req.requesterName}</span>
                                                <span className="text-gray-400">⇄</span>
                                                <span>{req.targetId === currentUser.id ? 'You' : req.targetName}</span>
                                            </div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">{req.requesterDate} ({req.requesterShift})</div>
                                        </div>
                                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${statusColor}`}>{statusText}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="space-y-4"><div className="text-xs text-gray-400 bg-gray-100 p-2 rounded text-center">💡 Tip: Drag YOUR name onto another person to request a swap.</div>{clientSchedule?.days?.map((day, idx) => { const isMyMorning = currentUser && day.morning.includes(currentUser.name); const isMyEvening = currentUser && day.evening.includes(currentUser.name); const isMyDay = isMyMorning || isMyEvening; return (<div key={idx} className={`p-4 rounded-xl shadow-sm border transition-all ${isMyDay ? 'bg-indigo-50 border-indigo-200 ring-2 ring-indigo-100' : 'bg-white border-gray-100'}`}><div className="flex justify-between items-center mb-3"><h3 className={`font-bold ${isMyDay ? 'text-indigo-900' : 'text-gray-800'}`}>{day.name} <span className="text-gray-400 font-normal text-xs ml-1">{day.zh} ({day.date})</span></h3>{isMyDay && <span className="text-[10px] bg-indigo-600 text-white px-2 py-1 rounded-full font-bold">{t.my_shift}</span>}</div><div className="mb-3"><div className="text-[10px] font-bold text-orange-500 uppercase mb-1 flex justify-between"><span>{t.morning_shift}</span>{day.hours?.morning && <span className="text-gray-400 font-mono">{day.hours.morning.start}-{day.hours.morning.end}</span>}</div><div className="flex flex-wrap gap-2">{day.morning.length > 0 ? day.morning.map((name, i) => (<div key={i} draggable={name === currentUser.name} onDragStart={(e) => { e.dataTransfer.setData("application/json", JSON.stringify({user: name, date: day.date, shift: 'morning'})); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleSwapDrop(e, day.date, 'morning', name)} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all relative ${name === currentUser?.name ? 'bg-orange-500 text-white shadow-md cursor-grab active:cursor-grabbing border-orange-600' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>{name}{name !== currentUser.name && (<span className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity">⇅</span>)}</div>)) : <span className="text-gray-300 text-xs italic">Empty</span>}</div></div><div><div className="text-[10px] font-bold text-indigo-500 uppercase mb-1 flex justify-between"><span>{t.evening_shift}</span>{day.hours?.evening && <span className="text-gray-400 font-mono">{day.hours.evening.start}-{day.hours.evening.end}</span>}</div><div className="flex flex-wrap gap-2">{day.evening.length > 0 ? day.evening.map((name, i) => (<div key={i} draggable={name === currentUser.name} onDragStart={(e) => { e.dataTransfer.setData("application/json", JSON.stringify({user: name, date: day.date, shift: 'evening'})); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleSwapDrop(e, day.date, 'evening', name)} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all relative ${name === currentUser?.name ? 'bg-indigo-600 text-white shadow-md cursor-grab active:cursor-grabbing border-indigo-700' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>{name}</div>)) : <span className="text-gray-300 text-xs italic">Empty</span>}</div></div></div>); })}</div>
                </div>
            );
        }
        if (view === 'contact') return <ContactView t={t} lang={lang} />;
        if (view === 'inventory') return <InventoryView lang={lang} t={t} inventoryList={data.inventoryList} setInventoryList={data.setInventoryList} onSubmit={handleInventorySubmit} currentUser={currentUser} />;
        if (view === 'recipes') return <div className="h-full overflow-y-auto"><div className="bg-white p-4 border-b"><h2 className="text-xl font-bold">{t.recipe_title}</h2></div><div className="p-4">{data.recipes.map((d: DrinkRecipe) => <DrinkCard key={d.id} drink={d} lang={lang} t={t} />)}</div></div>;
        if (view === 'training') return <TrainingView data={data} onComplete={() => {}} />;
        if (view === 'sop') return <LibraryView data={data} onOpenChecklist={(key) => { setCurrentShift(key); setView('checklist'); }} />;
        if (view === 'chat') return <ChatView t={t} currentUser={currentUser} messages={data.directMessages} setMessages={data.setDirectMessages} notices={notices} onExit={() => setView('home')} />;
        if (view === 'checklist' && currentShift) { const tmpl = CHECKLIST_TEMPLATES[currentShift]; return (<div className="h-full flex flex-col bg-white"><div className={`${tmpl.color} p-6 text-white`}><button onClick={() => setView('sop')} className="mb-4"><Icon name="ArrowLeft" /></button><h2 className="text-3xl font-bold">{getLoc(tmpl.title)}</h2></div><div className="flex-1 overflow-y-auto p-4">{tmpl.items.map((i: any) => (<div key={i.id} className="p-4 border-b flex items-center gap-3"><div className="w-6 h-6 border-2 rounded"></div><div><p className="font-bold">{getLoc(i.text)}</p></div></div>))}</div><div className="p-4 border-t"><button onClick={submitChecklist} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold">{t.confirm_submit}</button></div></div>); }
        if (view === 'home') { return (<div className="h-full overflow-y-auto p-6 pb-24 space-y-6 animate-fade-in bg-gray-50"><header className="flex justify-between items-center"><div><h1 className="text-2xl font-black text-gray-900 tracking-tight">ONESIP</h1><p className="text-sm text-gray-500 font-medium">{t.hello} {currentUser.name}</p></div><div className="flex gap-2"><button onClick={() => setShowAdminLogin(true)} className="bg-gray-900 text-white border px-3 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1"><Icon name="Shield" size={14}/> Admin</button><button onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')} className="bg-white border w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-sm text-xs">{lang === 'zh' ? 'EN' : 'CN'}</button><button onClick={onLogout} className="bg-white border w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-sm text-xs text-red-500"><Icon name="LogOut" size={14}/></button></div></header>{nextShift ? (<div className="bg-indigo-600 text-white p-5 rounded-2xl shadow-lg shadow-indigo-200"><div className="flex justify-between items-start mb-2"><span className="bg-indigo-500 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Next Shift</span><Icon name="Calendar" className="text-indigo-200" /></div><h2 className="text-2xl font-black mb-1">{nextShift.day}</h2><p className="text-indigo-100 text-sm font-medium flex gap-2 items-center"><span>{nextShift.date}</span><span className="w-1 h-1 bg-white rounded-full"></span><span>{nextShift.type === 'Morning' ? '10:00 - 15:00' : '14:30 - 19:00'}</span></p></div>) : (<div className="bg-white p-5 rounded-2xl border border-gray-100 text-gray-400 text-sm font-bold flex items-center gap-2"><Icon name="Calendar" /> No upcoming shifts this week</div>)}<div className="grid gap-4"><button onClick={() => setView('inventory')} className="bg-white p-5 rounded-2xl shadow-sm border border-red-100 flex items-center gap-4 active:scale-95 transition-all"><div className="bg-red-100 p-3 rounded-xl text-red-600"><Icon name="Package" size={24} /></div><div className="text-left flex-1"><h3 className="font-bold text-lg text-gray-800">{t.inventory_title}</h3></div><Icon name="ChevronRight" className="text-gray-300" /></button><div className="grid grid-cols-2 gap-3"><button onClick={() => handleClockLog('clock-in')} className="bg-gradient-to-br from-green-500 to-emerald-600 text-white p-4 rounded-2xl shadow-lg shadow-green-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-2"><Icon name="Play" size={32} className="text-white" /><span className="font-black">{t.clock_in}</span></button><button onClick={() => handleClockLog('clock-out')} className="bg-gradient-to-br from-red-500 to-rose-600 text-white p-4 rounded-2xl shadow-lg shadow-red-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-2"><Icon name="Square" size={32} className="text-white" /><span className="font-black">{t.clock_out}</span></button></div></div></div>); }
        return <div>View: {view}</div>;
    };
    return (<div className="max-w-md mx-auto h-screen bg-gray-50 relative flex flex-col font-sans"><AdminLoginModal isOpen={showAdminLogin} onClose={() => setShowAdminLogin(false)} onLogin={(role) => { setAdminRole(role); setShowAdminLogin(false); }} /><NoticeModal notice={activeNotice} onClose={() => setActiveNotice(null)} /><div className="flex-1 overflow-hidden relative">{renderStaffView()}</div>{ !['checklist', 'chat'].includes(view) && (<nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 p-2 pb-6 z-50 overflow-x-auto"><div className="flex justify-between items-center gap-1 min-w-max px-2"><button onClick={() => setView('home')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'home' ? 'text-gray-900 bg-gray-100' : 'text-gray-400'}`}><Icon name="Grid" size={20} /><span className="text-[9px] font-bold mt-1">{t.home}</span></button><button onClick={() => setView('chat')} className={`relative flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'chat' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400'}`}><Icon name="MessageSquare" size={20} /><span className="text-[9px] font-bold mt-1">{t.chat}</span>{unreadMessages > 0 && <span className="absolute top-1 right-3 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}</button><button onClick={() => setView('training')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'training' ? 'text-green-600 bg-green-50' : 'text-gray-400'}`}><Icon name="GraduationCap" size={20} /><span className="text-[9px] font-bold mt-1">{t.training}</span></button><button onClick={() => setView('recipes')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'recipes' ? 'text-orange-600 bg-orange-50' : 'text-gray-400'}`}><Icon name="Book" size={20} /><span className="text-[9px] font-bold mt-1">{t.recipes}</span></button><button onClick={() => setView('sop')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'sop' ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}><Icon name="BookOpen" size={20} /><span className="text-[9px] font-bold mt-1">{t.sop}</span></button><button onClick={() => setView('team')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'team' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400'}`}><Icon name="Calendar" size={20} /><span className="text-[9px] font-bold mt-1">{t.schedule}</span></button><button onClick={() => setView('inventory')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'inventory' ? 'text-red-600 bg-red-50' : 'text-gray-400'}`}><Icon name="Package" size={20} /><span className="text-[9px] font-bold mt-1">{t.stock}</span></button></div></nav>)}</div>);
};

export default function App() {
    const [mode, setMode] = useState<'staff' | 'customer'>('staff');
    const [lang, setLang] = useState<Lang>('zh');
    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        const saved = localStorage.getItem('onesip_current_user');
        return saved ? JSON.parse(saved) : null;
    });
    const [showCloudSetup, setShowCloudSetup] = useState(!Cloud.isCloudEnabled());
    const [menuItems, setMenuItems] = useState(INITIAL_MENU_DATA);
    const [wikiItems, setWikiItems] = useState(INITIAL_WIKI_DATA);
    const [promoData, setPromoData] = useState(INITIAL_ANNOUNCEMENT_DATA);
    const [inventoryList, setInventoryList] = useState<InventoryItem[]>(INVENTORY_ITEMS);
    const [schedule, setSchedule] = useState(MOCK_SCHEDULE_WEEK02);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [sopList, setSopList] = useState<SopItem[]>(SOP_DATABASE);
    const [trainingLevels, setTrainingLevels] = useState<TrainingLevel[]>(TRAINING_LEVELS);
    const [recipes, setRecipes] = useState<DrinkRecipe[]>(DRINK_RECIPES);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [directMessages, setDirectMessages] = useState<DirectMessage[]>([]);
    const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
    const [salesRecords, setSalesRecords] = useState<SalesRecord[]>([]);
    const [inventoryHistory, setInventoryHistory] = useState<InventoryReport[]>([]);

    useEffect(() => {
        if (!Cloud.isCloudEnabled()) return;
        Cloud.seedInitialData();
        const unsubInv = Cloud.subscribeToInventory(setInventoryList);
        const unsubSched = Cloud.subscribeToSchedule(data => { if (data && data.days && Array.isArray(data.days)) { setSchedule(data); } else if (Array.isArray(data)) { setSchedule(prev => ({ ...prev, days: data })); }});
        const unsubContent = Cloud.subscribeToContent(data => { if(data.sops) setSopList(data.sops); if(data.training) setTrainingLevels(data.training); if(data.recipes) setRecipes(data.recipes); });
        const unsubLogs = Cloud.subscribeToLogs(setLogs);
        const unsubChat = Cloud.subscribeToChat((msgs, notes) => { setDirectMessages(msgs); setNotices(notes); });
        const unsubSwaps = Cloud.subscribeToSwaps(setSwapRequests);
        const unsubSales = Cloud.subscribeToSales(setSalesRecords);
        const unsubHistory = Cloud.subscribeToInventoryHistory(setInventoryHistory);
        return () => { unsubInv(); unsubSched(); unsubContent(); unsubLogs(); unsubChat(); unsubSwaps(); unsubSales(); unsubHistory(); };
    }, []);

    useEffect(() => { if (currentUser) { localStorage.setItem('onesip_current_user', JSON.stringify(currentUser)); } else { localStorage.removeItem('onesip_current_user'); } }, [currentUser]);
    const t = TRANSLATIONS[lang]; 
    const handleLogin = (user: User) => { setCurrentUser(user); };
    const handleLogout = () => { setCurrentUser(null); };
    const sharedData = { menuItems, setMenuItems, wikiItems, setWikiItems, promoData, setPromoData, lang, setLang, inventoryList, setInventoryList, schedule, setSchedule, notices, setNotices, sopList, setSopList, trainingLevels, setTrainingLevels, recipes, setRecipes, logs, setLogs, directMessages, setDirectMessages, swapRequests, setSwapRequests, salesRecords, setSalesRecords, inventoryHistory, setInventoryHistory, t };

    if (!currentUser && mode === 'staff') { return (<> <LoginScreen t={t} onLogin={handleLogin} /> <CloudSetupModal isOpen={showCloudSetup} onClose={() => setShowCloudSetup(false)} /> </>); }
    return mode === 'staff' ? <StaffApp onSwitchMode={() => setMode('customer')} data={sharedData} onLogout={handleLogout} currentUser={currentUser!} /> : <CustomerApp onSwitchMode={() => setMode('staff')} data={sharedData} />;
}
