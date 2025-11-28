
// FIX: Imported useState and useEffect from React to resolve 'Cannot find name' errors.
import React, { useState, useEffect } from 'react';
import { Icon } from './components/Icons';
import { TRANSLATIONS, CHECKLIST_TEMPLATES, DRINK_RECIPES, TRAINING_LEVELS, SOP_DATABASE, CONTACTS_DATA, INVENTORY_ITEMS, TEAM_MEMBERS, MOCK_SCHEDULE_WEEK02, INITIAL_MENU_DATA, INITIAL_WIKI_DATA, INITIAL_ANNOUNCEMENT_DATA, USERS } from './constants';
import { Lang, LogEntry, DrinkRecipe, TrainingLevel, InventoryItem, Notice, InventoryReport, SopItem, User, DirectMessage, SwapRequest, SalesRecord, StaffViewMode, ScheduleDay } from './types';
import * as Cloud from './services/cloud';

// --- CONSTANTS ---
const STORE_COORDS = { lat: 51.9207886, lng: 4.4863897 };

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
    // FIX: Corrected a typo. Was `url.match(RegExp)` which passes the constructor,
    // now `url.match(regExp)` which passes the RegExp instance.
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

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

const ScheduleEditorModal = ({ isOpen, day, shiftType, currentStaff, currentHours, onClose, onSave }: any) => {
    const [selectedStaff, setSelectedStaff] = useState<string[]>(currentStaff || []);
    const [startTime, setStartTime] = useState(currentHours?.start || (shiftType === 'morning' ? '10:00' : '14:30'));
    const [endTime, setEndTime] = useState(currentHours?.end || (shiftType === 'morning' ? '15:00' : '19:00'));

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
                        {TEAM_MEMBERS.map(member => (
                            <button 
                                key={member} 
                                onClick={() => toggleStaff(member)}
                                className={`p-2 rounded-lg text-xs font-bold transition-all ${selectedStaff.includes(member) ? 'bg-primary text-white shadow-md' : 'bg-secondary text-text-light hover:bg-gray-200'}`}
                            >
                                {member}
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

// --- SCREENS & VIEWS ---

const InventoryView = ({ lang, t, inventoryList, setInventoryList, isOwner, onSubmit, currentUser }: any) => {
    const [employee, setEmployee] = useState(currentUser?.name || ''); 
    const [inputData, setInputData] = useState<Record<string, { end: string, waste: string }>>({});
    const [newItemName, setNewItemName] = useState({ zh: '', en: '' });
    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';
    const handleInputChange = (id: string, field: 'end' | 'waste', value: string) => { setInputData(prev => ({ ...prev, [id]: { ...(prev[id] || {end:'', waste:''}), [field]: value } })); };
    const addItem = () => {
        if(!newItemName.zh || !newItemName.en) return;
        const newItem: InventoryItem = { id: `inv_${Date.now()}`, name: newItemName, unit: 'unit' };
        setInventoryList([...inventoryList, newItem]); Cloud.saveInventoryList([...inventoryList, newItem]);
        setNewItemName({ zh: '', en: '' });
    };
    return (
        <div className="flex flex-col h-full bg-secondary pb-20 animate-fade-in-up text-text">
            <div className="bg-surface p-4 border-b sticky top-0 z-10 space-y-3 shadow-sm">
                <div className="flex justify-between items-center"><h2 className="text-xl font-black">{t.inventory_title}</h2>{isOwner && <span className="bg-dark-accent text-dark-bg font-bold text-[10px] px-2 py-1 rounded">OWNER MODE</span>}</div>
                {isOwner && <div className="flex gap-2"><input placeholder="Name (ZH)" className="flex-1 p-2 border rounded text-xs" value={newItemName.zh} onChange={e=>setNewItemName({...newItemName, zh: e.target.value})} /><input placeholder="Name (EN)" className="flex-1 p-2 border rounded text-xs" value={newItemName.en} onChange={e=>setNewItemName({...newItemName, en: e.target.value})} /><button onClick={addItem} className="bg-primary text-white p-2 rounded"><Icon name="Plus" size={16}/></button></div>}
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
                {inventoryList.map((item: any) => (
                    <div key={item.id} className="bg-surface p-3 rounded-xl border shadow-sm flex items-center justify-between">
                        <div className="flex-1"><div className="font-bold text-sm text-text">{getLoc(item.name)}</div><div className="text-[10px] text-text-light">{item.unit}</div></div>
                        <div className="flex gap-2 w-2/5"><input type="number" placeholder={item.defaultVal || 'End'} className="w-1/2 p-2 rounded-lg border text-center text-sm" onChange={(e) => handleInputChange(item.id, 'end', e.target.value)} /><input type="number" placeholder="Waste" className="w-1/2 p-2 rounded-lg border border-red-100 text-center text-sm bg-destructive-light text-destructive" onChange={(e) => handleInputChange(item.id, 'waste', e.target.value)} /></div>
                    </div>
                ))}
            </div>
            {!isOwner && <div className="p-4 bg-surface border-t sticky bottom-20 z-10"><button onClick={() => { if(!employee) return alert(t.select_employee); onSubmit({ submittedBy: employee, userId: currentUser?.id, data: inputData }); alert(t.save_success); }} className="w-full bg-primary text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 hover:bg-primary-dark"><Icon name="Save" size={20} />{t.save_report}</button></div>}
        </div>
    );
};

const ChatView = ({ t, currentUser, messages, setMessages, notices, onExit, isManager }: any) => {
    const [activeChannel, setActiveChannel] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    const [broadcastText, setBroadcastText] = useState('');

    const handleSend = () => {
        if (!inputText.trim() || !activeChannel) return;
        const msg: DirectMessage = { id: Date.now().toString(), fromId: currentUser.id, toId: activeChannel, content: inputText, timestamp: new Date().toISOString(), read: false };
        setMessages([...messages, msg]); 
        Cloud.saveMessage(msg); 
        setInputText('');
    };

    const handleBroadcast = () => {
        if (!broadcastText.trim()) return;
        const notice: Notice = { id: Date.now().toString(), author: currentUser.name, content: broadcastText, date: new Date().toISOString(), isUrgent: false };
        Cloud.saveNotice(notice);
        setBroadcastText('');
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
        
        const targetUser = USERS.find(u => u.id === activeChannel);

        return (
            <div className="h-full flex flex-col bg-secondary text-text absolute inset-0 z-[100] animate-fade-in"> 
                <div className="p-4 bg-surface border-b flex items-center gap-3 sticky top-0 z-10">
                    <button onClick={() => setActiveChannel(null)} className="p-2 -ml-2 rounded-full hover:bg-secondary"><Icon name="ArrowLeft" /></button>
                    <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center font-bold text-primary">{targetUser?.name[0]}</div>
                    <div>
                        <h3 className="font-bold">{targetUser?.name}</h3>
                        <p className="text-xs text-green-500 font-bold">Online</p>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {threadMessages.map((m: DirectMessage) => (
                        <div key={m.id} className={`flex flex-col items-start ${m.fromId === currentUser.id ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[75%] p-3 rounded-2xl text-sm shadow-sm ${m.fromId === currentUser.id ? 'bg-primary text-white rounded-br-none' : 'bg-surface border rounded-bl-none'}`}>{m.content}</div>
                            <span className="text-[10px] text-text-light mt-1 px-1">{formatDate(m.timestamp)}</span>
                        </div>
                    ))}
                </div>
                <div className="sticky bottom-0 left-0 right-0 bg-surface border-t p-3 pb-8 max-w-md mx-auto flex gap-2">
                    <input value={inputText} onChange={e => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} className="flex-1 bg-secondary rounded-full px-4 py-2.5" placeholder={t.type_message}/>
                    <button onClick={handleSend} className="w-11 h-11 bg-primary text-white rounded-full transition-all active:scale-90 flex items-center justify-center shrink-0"><Icon name="Send"/></button>
                </div>
            </div>
        );
    }
    
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
                <div className="p-4 bg-accent/10">
                    <h3 className="text-sm font-bold text-accent uppercase tracking-wider mb-3 flex items-center gap-2"><Icon name="Megaphone" size={16}/> Announcements</h3>
                    {isManager && (
                        <div className="flex gap-2 mb-4">
                            <textarea value={broadcastText} onChange={e => setBroadcastText(e.target.value)} rows={2} className="flex-1 text-sm p-3 border rounded-lg bg-surface focus:ring-2 ring-accent/50 outline-none transition-all" placeholder="Type announcement..." />
                            <button onClick={handleBroadcast} className="bg-accent text-white px-4 rounded-lg font-bold self-end py-3">Post</button>
                        </div>
                    )}
                    {notices && notices.length > 0 ? (
                        <div className="space-y-3">
                            {notices.slice().reverse().map((n: Notice) => (
                                <div key={n.id} className="bg-surface p-3 rounded-xl border border-accent/30 text-sm shadow-sm">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="font-bold text-text">{n.author}</span>
                                      <span className="text-[10px] text-text-light">{formatDate(n.date)}</span>
                                    </div>
                                    <p className="text-text-light">{n.content}</p>
                                </div>
                            ))}
                        </div>
                    ) : <p className="text-xs text-text-light italic text-center py-4">No active announcements.</p>}
                </div>

                <div className="p-2">
                    <h3 className="text-sm font-bold text-text-light uppercase tracking-wider my-2 px-2">Direct Messages</h3>
                    {USERS.filter((u: User) => u.id !== currentUser.id).map((user: User) => (
                    <div key={user.id} onClick={() => setActiveChannel(user.id)} className="flex items-center gap-4 p-3 hover:bg-secondary rounded-lg border-b cursor-pointer">
                        <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center font-bold text-text-light shrink-0 relative">
                            {user.name[0]}
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-surface"></span>
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold">{user.name}</h3>
                            <p className="text-xs text-text-light truncate">Click to chat</p>
                        </div>
                    </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- DASHBOARDS ---

const OwnerDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { inventoryList, setInventoryList, t, lang, inventoryHistory, salesRecords, setSalesRecords } = data;
    const [view, setView] = useState<'inventory' | 'history' | 'prediction'>('inventory');
    const [weather, setWeather] = useState<any>(null);
    const [newSales, setNewSales] = useState({ time: '15:00', amount: '' });
    
    useEffect(() => { 
        if (view === 'prediction') { 
            fetch('https://api.open-meteo.com/v1/forecast?latitude=51.92&longitude=4.48&current_weather=true')
            .then(res => res.json()).then(data => setWeather(data.current_weather))
            .catch(err => console.error("Weather fetch failed", err)); 
        } 
    }, [view]);

    const exportCSV = () => { if (!inventoryHistory || inventoryHistory.length === 0) return alert("No history to export"); let csv = "Date,User,Item,Count,Waste\n"; inventoryHistory.forEach((report: InventoryReport) => { Object.keys(report.data).forEach(itemId => { const itemName = inventoryList.find((i:any) => i.id === itemId)?.name?.en || itemId; csv += `${report.date},${report.submittedBy},${itemName},${report.data[itemId].end},${report.data[itemId].waste}\n`; }); }); const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csv); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "inventory_history.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link); };
    const handleSalesSubmit = () => { if (!newSales.amount) return; const record: SalesRecord = { id: Date.now().toString(), date: new Date().toLocaleDateString(), timeSlot: newSales.time as any, amount: parseFloat(newSales.amount), weatherTemp: weather?.temperature || 0, weatherCode: weather?.weathercode || 0 }; Cloud.saveSalesRecord(record); setNewSales({ ...newSales, amount: '' }); alert("Sales recorded for Prediction Model!"); };
    
    const getPrediction = () => { 
        if (salesRecords.length < 1) return null; 
        const recentSales = salesRecords.slice(-14); 
        const totalRev = recentSales.reduce((acc: number, curr: any) => acc + curr.amount, 0); 
        const daysCount = Math.max(1, recentSales.length / 2); 
        const avgDailyRev = totalRev / daysCount; 
        let weatherMultiplier = 1.0; 
        if (weather) { 
            const temp = weather.temperature; 
            if (temp > 25) weatherMultiplier = 1.3; 
            else if (temp > 20) weatherMultiplier = 1.1; 
            else if (temp < 10) weatherMultiplier = 0.8; 
            if ([51,53,55,61,63,65,80,81,82].includes(weather.weathercode)) { weatherMultiplier *= 0.8; } 
        } 
        const projectedWeeklyRev = avgDailyRev * 7 * weatherMultiplier; 
        const drinksCount = projectedWeeklyRev / 6.5; 
        return { 
            avgDailyRev: avgDailyRev.toFixed(2), 
            weatherFactor: weatherMultiplier.toFixed(2), 
            estRevenue: projectedWeeklyRev.toFixed(2), 
            estDrinks: Math.ceil(drinksCount), 
            restock: [ { item: "Cups (500/700ml)", amount: Math.ceil(drinksCount) + " pcs" }, { item: "Tapioca Pearls", amount: (drinksCount * 0.05).toFixed(1) + " kg" }, { item: "Fresh Milk", amount: (drinksCount * 0.15).toFixed(1) + " L" }, { item: "Tea Leaves (Raw)", amount: (drinksCount * 0.015).toFixed(2) + " kg" }, { item: "Fructose/Sugar", amount: (drinksCount * 0.03).toFixed(1) + " kg" } ] 
        }; 
    };
    const prediction = getPrediction();

    return (
        <div className="h-full flex flex-col bg-dark-bg text-dark-text font-sans">
            <div className="p-4 bg-dark-surface shadow-lg shrink-0 border-b border-white/10">
                <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-black text-dark-accent tracking-wider">OWNER COMMAND</h2><button onClick={onExit} className="bg-white/10 p-2 rounded-lg hover:bg-white/20 transition-all"><Icon name="LogOut" size={20}/></button></div>
                <div className="flex gap-2"><button onClick={() => setView('inventory')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${view === 'inventory' ? 'bg-dark-accent text-dark-bg' : 'bg-white/10 hover:bg-white/20'}`}>Inventory</button><button onClick={() => setView('history')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${view === 'history' ? 'bg-dark-accent text-dark-bg' : 'bg-white/10 hover:bg-white/20'}`}>History</button><button onClick={() => setView('prediction')} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${view === 'prediction' ? 'bg-dark-accent text-dark-bg' : 'bg-white/10 hover:bg-white/20'}`}>AI Forecast</button></div>
            </div>
            <div className="flex-1 overflow-hidden bg-dark-bg">
                 {view === 'inventory' && (<div className="h-full bg-secondary text-text"><InventoryView lang={lang} t={t} inventoryList={inventoryList} setInventoryList={setInventoryList} isOwner={true} /></div>)}
                 {view === 'history' && (<div className="p-4 h-full overflow-y-auto"><button onClick={exportCSV} className="w-full bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-bold mb-4 flex justify-center gap-2 shadow-lg transition-all"><Icon name="List" /> Download CSV Report</button><div className="space-y-3">{inventoryHistory?.slice().reverse().map((report: InventoryReport) => (<div key={report.id} className="bg-dark-surface p-4 rounded-xl shadow-sm border border-white/10"><div className="flex justify-between mb-2"><span className="font-bold text-dark-accent">{report.date}</span><span className="text-sm text-dark-text-light">{report.submittedBy}</span></div><div className="text-xs text-dark-text-light">Recorded {Object.keys(report.data).length} items</div></div>))}</div></div>)}
                 {view === 'prediction' && (
                     <div className="p-4 h-full overflow-y-auto">
                        <div className="bg-dark-surface p-6 rounded-2xl mb-6 border border-white/10">
                            <h3 className="text-sm font-bold text-dark-text-light uppercase mb-4">AI Sales Forecast (Next 7 Days)</h3>
                            {prediction ? (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-dark-bg p-4 rounded-xl">
                                            <div className="text-xs text-dark-text-light mb-1">Est. Revenue</div>
                                            <div className="text-2xl font-black text-white">€{prediction.estRevenue}</div>
                                        </div>
                                        <div className="bg-dark-bg p-4 rounded-xl">
                                            <div className="text-xs text-dark-text-light mb-1">Volume</div>
                                            <div className="text-2xl font-black text-dark-accent">{prediction.estDrinks} Cups</div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <h4 className="text-xs font-bold text-dark-text-light mb-3 uppercase flex items-center gap-2">
                                            <Icon name="Sparkles" size={14} className="text-dark-accent"/> Suggested Restock
                                        </h4>
                                        <div className="space-y-2">
                                            {prediction.restock.map((r: any, idx: number) => (
                                                <div key={idx} className="flex justify-between items-center bg-dark-bg p-3 rounded-lg border border-white/10">
                                                    <span className="text-sm font-bold text-dark-text">{r.item}</span>
                                                    <span className="text-sm font-mono text-dark-accent">{r.amount}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-dark-text-light">
                                    <p>Not enough data for prediction.</p>
                                    <p className="text-xs mt-2">Need at least 2 weeks of sales records.</p>
                                </div>
                            )}
                        </div>

                        <div className="bg-dark-surface p-6 rounded-2xl border border-white/10">
                            <h3 className="text-sm font-bold text-dark-text-light uppercase mb-4">Input Daily Sales</h3>
                            <div className="flex gap-2 mb-2">
                                <select 
                                    value={newSales.time} 
                                    onChange={e => setNewSales({...newSales, time: e.target.value})}
                                    className="bg-dark-bg text-white rounded-lg p-3 font-bold text-sm outline-none focus:ring-2 ring-dark-accent"
                                >
                                    <option value="15:00">15:00 (Morning Shift)</option>
                                    <option value="19:00">19:00 (Evening Shift)</option>
                                </select>
                                <input 
                                    type="number" 
                                    placeholder="Amount (€)" 
                                    value={newSales.amount}
                                    onChange={e => setNewSales({...newSales, amount: e.target.value})}
                                    className="bg-dark-bg text-white rounded-lg p-3 font-bold text-sm flex-1 outline-none focus:ring-2 ring-dark-accent"
                                />
                            </div>
                            <button 
                                onClick={handleSalesSubmit}
                                className="w-full bg-dark-accent hover:opacity-90 text-dark-bg py-3 rounded-xl font-black shadow-lg shadow-dark-accent/20 transition-all"
                            >
                                Record Sales
                            </button>
                        </div>
                     </div>
                )}
            </div>
        </div>
    );
};

const EditorDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { sopList, setSopList, trainingLevels, setTrainingLevels, recipes, setRecipes, t } = data;
    const [view, setView] = useState<'training' | 'sop' | 'recipes'>('training');
    const [editingItem, setEditingItem] = useState<any>(null);
    
    const createNewItem = () => { const id = Date.now().toString(); if (view === 'training') return { id, title: {zh:'',en:''}, subtitle: {zh:'',en:''}, desc: {zh:'',en:''}, youtubeLink: '', content: [{title:{zh:'',en:''}, body:{zh:'',en:''}}], quiz: [] }; if (view === 'sop') return { id, title: {zh:'',en:''}, content: {zh:'',en:''}, tags: [], category: 'General' }; if (view === 'recipes') return { id, name: {zh:'',en:''}, cat: 'Milk Tea', size: '500ml', ice: 'Standard', sugar: '100%', toppings: {zh:'',en:''}, steps: {cold:[], warm:[]} }; return {}; };
    const handleSave = () => { if (!editingItem) return; let updatedList; let setList; if (view === 'sop') { updatedList = sopList.some((i:any) => i.id === editingItem.id) ? sopList.map((i:any) => i.id === editingItem.id ? editingItem : i) : [...sopList, editingItem]; setList = setSopList; Cloud.saveContent('sops', updatedList); } else if (view === 'training') { updatedList = trainingLevels.some((i:any) => i.id === editingItem.id) ? trainingLevels.map((i:any) => i.id === editingItem.id ? editingItem : i) : [...trainingLevels, editingItem]; setList = setTrainingLevels; Cloud.saveContent('training', updatedList); } else { updatedList = recipes.some((i:any) => i.id === editingItem.id) ? recipes.map((i:any) => i.id === editingItem.id ? editingItem : i) : [...recipes, editingItem]; setList = setRecipes; Cloud.saveContent('recipes', updatedList); } if (setList) { setList(updatedList); } setEditingItem(null); };
    const handleDelete = (id: string) => { if(!window.confirm("Delete this item?")) return; if (view === 'sop') { const list = sopList.filter((i:any) => i.id !== id); setSopList(list); Cloud.saveContent('sops', list); } else if (view === 'training') { const list = trainingLevels.filter((i:any) => i.id !== id); setTrainingLevels(list); Cloud.saveContent('training', list); } else { const list = recipes.filter((i:any) => i.id !== id); setRecipes(list); Cloud.saveContent('recipes', list); } };
    
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
                <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm font-bold" placeholder="Name (EN)" value={editingItem.name?.en || ''} onChange={e => setEditingItem({...editingItem, name: {...(editingItem.name || {zh:'', en:''}), en: e.target.value}})} /> 
                <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm font-bold" placeholder="Name (ZH)" value={editingItem.name?.zh || ''} onChange={e => setEditingItem({...editingItem, name: {...(editingItem.name || {zh:'', en:''}), zh: e.target.value}})} />
                <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Category" value={editingItem.cat || ''} onChange={e => setEditingItem({...editingItem, cat: e.target.value})} />
                <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Size" value={editingItem.size || ''} onChange={e => setEditingItem({...editingItem, size: e.target.value})} />
                <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Toppings (EN)" value={editingItem.toppings?.en || ''} onChange={e => setEditingItem({...editingItem, toppings: {...(editingItem.toppings || {zh:'', en:''}), en: e.target.value}})} />
                <input className="w-full bg-dark-bg border border-white/10 p-2 rounded text-sm" placeholder="Toppings (ZH)" value={editingItem.toppings?.zh || ''} onChange={e => setEditingItem({...editingItem, toppings: {...(editingItem.toppings || {zh:'', en:''}), zh: e.target.value}})} />
            </div>); 
        }
        return null;
    };

    return (
        <div className="h-full flex flex-col bg-dark-bg text-dark-text font-sans">
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

const ManagerDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const managerUser = USERS.find(u => u.id === 'u_lambert') || { id: 'u_manager', name: 'Manager', role: 'manager', phone: '0000' };
    const { schedule, setSchedule, notices, logs, t, directMessages, setDirectMessages, swapRequests, setSwapRequests } = data;
    const [view, setView] = useState<'schedule' | 'logs' | 'chat' | 'financial' | 'requests'>('requests');
    const [editingShift, setEditingShift] = useState<{ dayIdx: number, shift: 'morning' | 'evening' } | null>(null);
    const [budgetMax, setBudgetMax] = useState<number>(() => Number(localStorage.getItem('onesip_budget_max')) || 5000);
    const [wages, setWages] = useState<Record<string, number>>(() => { const saved = localStorage.getItem('onesip_wages'); const def: any = {}; TEAM_MEMBERS.forEach(m => def[m] = 12); return saved ? { ...def, ...JSON.parse(saved) } : def; });

    const handleWageChange = (name: string, val: string) => { const newWages = { ...wages, [name]: parseFloat(val) || 0 }; setWages(newWages); localStorage.setItem('onesip_wages', JSON.stringify(newWages)); };
    const handleBudgetChange = (val: string) => { const b = parseFloat(val) || 0; setBudgetMax(b); localStorage.setItem('onesip_budget_max', b.toString()); };

    const calculateFinancials = () => {
        const stats: Record<string, any> = {};
        TEAM_MEMBERS.forEach(m => { stats[m] = { morning: 0, evening: 0, estHours: 0, estCost: 0, actualHours: 0, actualCost: 0 }; });
        if (schedule?.days) { schedule.days.forEach((day: any) => { day.morning.forEach((p: string) => { if(stats[p]) stats[p].morning++ }); day.evening.forEach((p: string) => { if(stats[p]) stats[p].evening++ }); }); }
        const userLogs: Record<string, LogEntry[]> = {};
        if (logs) { logs.forEach((l: LogEntry) => { if (!l.name) return; if (!userLogs[l.name]) userLogs[l.name] = []; userLogs[l.name].push(l); }); }
        Object.keys(userLogs).forEach(name => { if(!stats[name]) return; const sorted = userLogs[name].sort((a,b) => new Date(a.time).getTime() - new Date(b.time).getTime()); let lastIn: number | null = null; sorted.forEach(log => { if (log.shift === 'clock-in') { lastIn = new Date(log.time).getTime(); } else if (log.shift === 'clock-out' && lastIn) { const diffHrs = (new Date(log.time).getTime() - lastIn) / (1000 * 60 * 60); if (diffHrs > 0 && diffHrs < 16) { stats[name].actualHours += diffHrs; } lastIn = null; } }); });
        let totalEstCost = 0; let totalActualCost = 0;
        Object.keys(stats).forEach(p => { const estH = (stats[p].morning * 5) + (stats[p].evening * 4.5); const wage = wages[p] || 12; stats[p].estHours = estH; stats[p].estCost = estH * wage; stats[p].actualCost = stats[p].actualHours * wage; totalEstCost += stats[p].estCost; totalActualCost += stats[p].actualCost; });
        return { stats, totalEstCost, totalActualCost };
    };
    const { stats, totalEstCost, totalActualCost } = calculateFinancials();

    const exportFinancialCSV = () => { let csv = "Name,Wage,Est.Hours,Est.Cost,Act.Hours,Act.Cost\n"; Object.keys(stats).forEach(name => { const s = stats[name]; csv += `${name},${wages[name]},${s.estHours.toFixed(1)},${s.estCost.toFixed(2)},${s.actualHours.toFixed(1)},${s.actualCost.toFixed(2)}\n`; }); csv += `TOTALS,,${totalEstCost.toFixed(2)},,${totalActualCost.toFixed(2)}\n`; const encodedUri = encodeURI("data:text/csv;charset=utf-8," + csv); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "financial_report.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link); };
    
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
            const remove = (day: any, shift: 'morning' | 'evening', name: string) => {
                const idx = day[shift].indexOf(name);
                if (idx > -1) day[shift].splice(idx, 1);
            };
            const add = (day: any, shift: 'morning' | 'evening', name: string) => {
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
    const handleSaveSchedule = (newStaff: string[], newHours: {start:string, end:string}) => { if (!editingShift) return; const { dayIdx, shift } = editingShift; const newSched = { ...schedule }; newSched.days[dayIdx][shift] = newStaff; if (!newSched.days[dayIdx].hours) newSched.days[dayIdx].hours = { morning: {start:'', end:''}, evening: {start:'', end:''} }; newSched.days[dayIdx].hours[shift] = newHours; setSchedule(newSched); Cloud.saveSchedule(newSched); setEditingShift(null); };
    const pendingReqs = swapRequests?.filter((r: SwapRequest) => r.status === 'accepted_by_peer') || [];

    return (
        <div className="h-full flex flex-col bg-dark-bg text-dark-text font-sans">
            <div className="bg-dark-surface p-4 shadow-lg flex justify-between items-center shrink-0 border-b border-white/10">
                <div><h1 className="text-xl font-black tracking-tight text-white">{t.manager_title}</h1><p className="text-xs text-dark-text-light">User: {managerUser.name}</p></div>
                <button onClick={onExit} className="bg-white/10 p-2 rounded hover:bg-white/20 transition-all"><Icon name="LogOut" /></button>
            </div>
            <div className="flex bg-dark-bg p-2 gap-2 overflow-x-auto shrink-0 shadow-inner">
                {['requests', 'schedule', 'chat', 'logs', 'financial'].map(v => (
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
                {view === 'chat' && <ChatView t={t} currentUser={managerUser} messages={directMessages} setMessages={setDirectMessages} notices={notices} isManager={true} onExit={() => setView('requests')} />}
                {view === 'schedule' && (
                    <div className="space-y-3 pb-10">
                        <div className="bg-dark-surface p-4 rounded-xl border border-white/10 shadow-sm mb-4">
                            <h3 className="font-bold text-dark-text mb-2">{schedule.title || "Current Week"}</h3>
                            <p className="text-xs text-dark-text-light">Tap on a shift to edit staff & times.</p>
                        </div>
                        {schedule.days?.map((day: ScheduleDay, idx: number) => (
                            <div key={idx} className="bg-dark-surface p-3 rounded-xl shadow-sm border border-white/10">
                                <div className="flex justify-between mb-2">
                                    <span className="font-bold text-dark-text">{day.name}</span>
                                    <span className="text-xs text-dark-text-light">{day.date}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div onClick={() => setEditingShift({ dayIdx: idx, shift: 'morning' })} className="p-2 bg-orange-500/10 rounded border border-orange-500/20 cursor-pointer hover:bg-orange-500/20 transition-all">
                                        <div className="flex justify-between items-center mb-1"><div className="text-[10px] text-orange-400 font-bold">MORNING</div><div className="text-[10px] text-dark-text-light">{day.hours?.morning?.start || '10:00'}-{day.hours?.morning?.end || '15:00'}</div></div>
                                        <div className="text-xs text-dark-text-light font-medium">{day.morning.length > 0 ? day.morning.join(', ') : <span className="italic">Empty</span>}</div>
                                    </div>
                                    <div onClick={() => setEditingShift({ dayIdx: idx, shift: 'evening' })} className="p-2 bg-blue-500/10 rounded border border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-all">
                                        <div className="flex justify-between items-center mb-1"><div className="text-[10px] text-blue-400 font-bold">EVENING</div><div className="text-[10px] text-dark-text-light">{day.hours?.evening?.start || '14:30'}-{day.hours?.evening?.end || '19:00'}</div></div>
                                        <div className="text-xs text-dark-text-light font-medium">{day.evening.length > 0 ? day.evening.join(', ') : <span className="italic">Empty</span>}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
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
                                                <input className="w-10 text-center border rounded bg-dark-bg border-white/20 text-dark-text" value={wages[name] || 0} onChange={(e) => handleWageChange(name, e.target.value)}/>
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
            {editingShift && <ScheduleEditorModal isOpen={!!editingShift} day={schedule.days[editingShift.dayIdx]} shiftType={editingShift.shift} currentStaff={schedule.days[editingShift.dayIdx][editingShift.shift]} currentHours={schedule.days[editingShift.dayIdx].hours?.[editingShift.shift]} onClose={() => setEditingShift(null)} onSave={handleSaveSchedule}/>}
        </div>
    );
};

// --- STAFF APP ---

const StaffApp = ({ onSwitchMode, data, onLogout, currentUser, openAdmin }: { onSwitchMode: () => void, data: any, onLogout: () => void, currentUser: User, openAdmin: () => void }) => {
    const { lang, setLang, schedule, notices, logs, setLogs, t, swapRequests, setSwapRequests } = data;
    const [view, setView] = useState<StaffViewMode>('home');
    const [clockBtnText, setClockBtnText] = useState({ in: t.clock_in, out: t.clock_out });
    const [currentShift, setCurrentShift] = useState<string>('opening'); 
    
    const [swapMode, setSwapMode] = useState(false);
    const [swapSelection, setSwapSelection] = useState<{ step: 1|2, myDate?: string, myShift?: 'morning'|'evening', targetName?: string, targetDate?: string, targetShift?: 'morning'|'evening' }>({ step: 1 });
    const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, msg: React.ReactNode, action: () => void}>({isOpen:false, msg:'', action:()=>{}});

    const getLoc = (obj: any) => obj ? (obj[lang] || obj['zh']) : '';
    const clientSchedule = { ...schedule, days: schedule?.days?.slice(0, 14) || [] };
    const myPendingSwaps = swapRequests?.filter((r: SwapRequest) => r.targetId === currentUser.id && r.status === 'pending') || [];

    const findNextShift = () => {
        if (!schedule?.days) return null;
        for (const day of schedule.days) {
            if (day.morning.includes(currentUser.name)) return { date: day.date, shift: '10:00 - 15:00', name: day.name };
            if (day.evening.includes(currentUser.name)) return { date: day.date, shift: '14:30 - 19:00', name: day.name };
        }
        return null;
    };
    const nextShift = findNextShift();

    const handleClockLog = (type: 'clock-in' | 'clock-out') => {
        setClockBtnText(p => ({ ...p, [type === 'clock-in'?'in':'out']: '📡...' }));
        if (!navigator.geolocation) { recordLog(type, "GPS Not Supported"); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const dist = getDistanceFromLatLonInKm(pos.coords.latitude, pos.coords.longitude, STORE_COORDS.lat, STORE_COORDS.lng);
                const locTag = dist <= 500 
                    ? `In Range (<500m)`
                    : `Out Range (${Math.round(dist)}m)`;
                alert(`✅ Success!\n${locTag}`);
                recordLog(type, locTag);
            },
            (err) => { console.error(err); alert("⚠️ GPS Error. Logging anyway."); recordLog(type, "GPS Error"); },
            { timeout: 10000, enableHighAccuracy: true }
        );
    };

    const recordLog = (type: string, note: string) => {
        const newLog: LogEntry = { id: Date.now(), shift: type, name: currentUser.name, userId: currentUser.id, time: new Date().toLocaleString(), type: type as any, reason: note };
        setLogs([newLog, ...logs]); Cloud.saveLog(newLog); setClockBtnText({ in: t.clock_in, out: t.clock_out });
    };

    const handleShiftClick = (day: any, shift: 'morning' | 'evening', name: string) => {
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
                    const targetUser = USERS.find(u => u.name === name);
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
        return (<div className="h-full overflow-y-auto bg-secondary p-4 animate-fade-in-up text-text"><h2 className="text-2xl font-black text-text mb-4">{t.sop_library}</h2><div className="grid grid-cols-2 gap-3 mb-6"><button onClick={() => onOpenChecklist('opening')} className="p-4 bg-yellow-400/20 text-yellow-800 rounded-xl font-bold flex flex-col items-center gap-2"><Icon name="Sun" size={24}/> Opening</button><button onClick={() => onOpenChecklist('mid')} className="p-4 bg-blue-400/20 text-blue-800 rounded-xl font-bold flex flex-col items-center gap-2"><Icon name="Clock" size={24}/> Mid-Day</button><button onClick={() => onOpenChecklist('closing')} className="p-4 bg-purple-400/20 text-purple-800 rounded-xl font-bold flex flex-col items-center gap-2"><Icon name="Moon" size={24}/> Closing</button></div><div className="space-y-3">{sopList.map((s: SopItem) => (<div key={s.id} className="bg-surface p-4 rounded-xl shadow-sm border border-gray-100"><div className="flex justify-between items-start mb-2"><h3 className="font-bold text-text">{s.title?.[lang] || s.title?.['zh']}</h3><span className="text-[10px] bg-secondary px-2 py-1 rounded text-text-light uppercase">{s.category}</span></div><p className="text-sm text-text-light whitespace-pre-line leading-relaxed">{s.content?.[lang] || s.content?.['zh']}</p></div>))}</div></div>);
    }

    const ContactView = ({ t, lang }: { t: any, lang: Lang }) => {
        const handleCopy = (text: string) => { if (!text) return; navigator.clipboard.writeText(text); alert(`${t.copied}: ${text}`); };
        return (
            <div className="h-full overflow-y-auto p-4 bg-secondary animate-fade-in-up text-text">
                <h2 className="text-2xl font-black text-text mb-4">{t.contact_title}</h2>
                <div className="space-y-3">{CONTACTS_DATA.map(c => (<div key={c.id} className="bg-surface p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between"><div><h3 className="font-bold text-text">{c.name}</h3><p className="text-xs text-text-light">{c.role?.[lang]}</p>{c.phone && <p onClick={() => handleCopy(c.phone!)} className="text-xs text-primary mt-1 cursor-pointer hover:underline">{c.phone}</p>}</div>{c.phone ? (<a href={`tel:${c.phone}`} className="bg-green-100 text-green-600 p-3 rounded-full hover:bg-green-200 transition-all"><Icon name="Phone" size={20} /></a>) : (<span className="text-gray-300 text-xs italic">No Phone</span>)}</div>))}</div>
            </div>
        );
    };

    const DrinkCard = ({ drink, lang, t }: { drink: DrinkRecipe, lang: Lang, t: any }) => {
        const [expanded, setExpanded] = useState(false);
        return (<div className="bg-surface p-4 rounded-xl shadow-sm border border-gray-100 mb-3 cursor-pointer" onClick={() => setExpanded(!expanded)}><div className="flex justify-between items-center"><div><h3 className="font-bold text-text">{drink.name?.[lang] || drink.name?.['zh']}</h3><p className="text-xs text-text-light">{drink.cat} • {drink.size}</p></div><Icon name={expanded ? "ChevronUp" : "ChevronRight"} size={20} className="text-gray-400" /></div>{expanded && (<div className="mt-3 text-sm text-text-light space-y-2 border-t pt-3"><p><strong>Toppings:</strong> {drink.toppings?.[lang] || drink.toppings?.['zh']}</p><p><strong>Sugar:</strong> {drink.sugar}</p><p><strong>Ice:</strong> {drink.ice}</p><div className="bg-blue-500/10 p-2 rounded"><p className="font-bold text-blue-800 mb-1">Cold Steps:</p><ol className="list-decimal pl-4">{drink.steps.cold.map((s:any, i:number) => <li key={i}>{s?.[lang]||s?.['zh']}</li>)}</ol></div><div className="bg-orange-500/10 p-2 rounded"><p className="font-bold text-orange-800 mb-1">Warm Steps:</p><ol className="list-decimal pl-4">{drink.steps.warm.map((s:any, i:number) => <li key={i}>{s?.[lang]||s?.['zh']}</li>)}</ol></div></div>)}</div>);
    };

    const TrainingView = ({ data, onComplete }: { data: any, onComplete: (levelId: number) => void }) => {
        const { trainingLevels, t, lang } = data;
        const [activeLevel, setActiveLevel] = useState<TrainingLevel | null>(null);
        if (activeLevel) { return (<div className="h-full flex flex-col bg-surface animate-fade-in-up text-text"><div className="p-4 border-b flex items-center gap-3"><button onClick={() => setActiveLevel(null)}><Icon name="ArrowLeft"/></button><h2 className="font-bold text-lg">{activeLevel.title?.[lang] || activeLevel.title?.['zh']}</h2></div><div className="flex-1 overflow-y-auto p-4 space-y-6"><div className="bg-primary-light p-4 rounded-xl border border-primary/20"><h3 className="font-bold text-primary mb-2">Overview</h3><p className="text-sm text-primary/80">{activeLevel.desc?.[lang] || activeLevel.desc?.['zh']}</p></div>{activeLevel.youtubeLink && (<div className="rounded-xl overflow-hidden shadow-lg border border-gray-200"><iframe className="w-full aspect-video" src={`https://www.youtube.com/embed/${getYouTubeId(activeLevel.youtubeLink)}`} title="Training Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe></div>)}{activeLevel.content.map((c: any, i: number) => (<div key={i}><h3 className="font-bold text-text mb-2">{i+1}. {c.title?.[lang] || c.title?.['zh']}</h3><p className="text-sm text-text-light whitespace-pre-line leading-relaxed">{c.body?.[lang] || c.body?.['zh']}</p></div>))}<div className="pt-6"><h3 className="font-bold text-text mb-4">Quiz</h3>{activeLevel.quiz.map((q: any, i: number) => (<div key={q.id} className="mb-4 bg-secondary p-4 rounded-xl"><p className="font-bold text-sm mb-2">{i+1}. {q.question?.[lang] || q.question?.['zh']}</p><div className="space-y-2">{q.options?.map((opt: string, idx: number) => (<button key={idx} className="w-full text-left p-3 bg-surface border rounded-lg text-sm hover:bg-gray-100">{opt}</button>))}</div></div>))}</div></div></div>); }
        return (<div className="h-full overflow-y-auto bg-secondary p-4 animate-fade-in-up text-text"><h2 className="text-2xl font-black text-text mb-4">{t.training}</h2><div className="space-y-3">{trainingLevels.map((l: TrainingLevel) => (<div key={l.id} onClick={() => setActiveLevel(l)} className="bg-surface p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all"><div className="w-12 h-12 bg-primary-light text-primary rounded-full flex items-center justify-center font-bold text-lg">{l.id}</div><div className="flex-1"><h3 className="font-bold text-text">{l.title?.[lang] || l.title?.['zh']}</h3><p className="text-xs text-text-light">{l.subtitle?.[lang] || l.subtitle?.['zh']}</p></div><Icon name="ChevronRight" className="text-gray-300"/></div>))}</div></div>);
    };

    const renderView = () => {
        if (view === 'team') {
            return (
                <div className="h-full overflow-y-auto p-4 bg-secondary pb-24 text-text">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-black">{t.team_title}</h2><button onClick={() => { setSwapMode(!swapMode); setSwapSelection({step:1}); }} className={`px-4 py-2 rounded-xl font-bold text-xs shadow-sm transition-all ${swapMode ? 'bg-destructive text-white animate-pulse' : 'bg-primary text-white'}`}>{swapMode ? 'Exit Swap' : '🔄 Swap Shift'}</button></div>
                    {swapMode && <div className="bg-yellow-400/20 p-3 rounded-xl mb-4 text-sm text-yellow-800 border border-yellow-400/30"><strong>Wizard:</strong> {swapSelection.step === 1 ? 'Step 1: Select YOUR shift' : 'Step 2: Select TARGET shift'}</div>}
                    {myPendingSwaps.length > 0 && !swapMode && (<div className="bg-surface border border-destructive-light p-4 rounded-xl mb-4 shadow-sm"><h3 className="font-bold text-destructive mb-2">🔔 Swap Requests</h3>{myPendingSwaps.map((req: SwapRequest) => (<div key={req.id} className="bg-secondary p-3 rounded-lg mb-2 text-sm"><p><strong>{req.requesterName}</strong> wants your <strong>{req.targetDate}</strong> for <strong>{req.requesterDate}</strong></p><div className="flex gap-2 mt-2"><button onClick={()=>handleSwapAction(req.id, 'accepted_by_peer')} className="flex-1 bg-green-500 text-white py-2 rounded font-bold">Accept</button><button onClick={()=>handleSwapAction(req.id, 'rejected')} className="flex-1 bg-gray-300 text-text-light py-2 rounded font-bold">Reject</button></div></div>))}</div>)}
                    <div className="space-y-4">{clientSchedule?.days?.map((day: any, idx: number) => (<div key={idx} className="p-4 rounded-xl shadow-sm border bg-surface border-gray-100"><div className="flex justify-between items-center mb-3"><h3 className="font-bold text-text">{day.name} <span className="text-text-light font-normal ml-1">{day.date}</span></h3></div><div className="space-y-2">{['morning', 'evening'].map(shift => (<div key={shift} className="flex items-center gap-2"><span className={`text-xs font-bold w-8 ${shift==='morning'?'text-orange-500':'text-indigo-500'}`}>{shift==='morning'?'AM':'PM'}</span><div className="flex flex-wrap gap-2">{day[shift].map((name: string, i: number) => { const isMe = name === currentUser.name; let bg = shift==='morning' ? 'bg-orange-400/10 text-orange-700' : 'bg-indigo-500/10 text-indigo-700'; if (swapMode) { if (swapSelection.step === 1) bg = isMe ? 'bg-green-500 text-white ring-4 ring-green-200 cursor-pointer animate-pulse' : 'bg-gray-100 text-gray-300'; else if (swapSelection.step === 2) bg = !isMe ? 'bg-blue-500 text-white ring-4 ring-blue-200 cursor-pointer animate-pulse' : 'bg-gray-100 text-gray-300'; } else if (isMe) bg = shift==='morning' ? 'bg-orange-500 text-white' : 'bg-indigo-600 text-white'; return (<div key={i} onClick={() => handleShiftClick(day, shift as any, name)} className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${bg}`}>{name}</div>); })}</div></div>))}</div></div>))}</div>
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
                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={() => handleClockLog('clock-in')} className="bg-primary hover:bg-primary-dark text-white p-6 rounded-3xl shadow-lg shadow-primary-light flex flex-col items-center justify-center gap-3 active:scale-95 transition-all"><Icon name="Play" size={32} /><span className="font-bold">{clockBtnText.in}</span></button>
                            <button onClick={() => handleClockLog('clock-out')} className="bg-text-light hover:bg-text text-white p-6 rounded-3xl shadow-lg shadow-gray-200 flex flex-col items-center justify-center gap-3 active:scale-95 transition-all"><Icon name="Square" size={32} /><span className="font-bold">{clockBtnText.out}</span></button>
                        </div>
                    </div>
                </div>
            );
        }
        if (view === 'chat') return <ChatView t={t} currentUser={currentUser} messages={data.directMessages} setMessages={data.setDirectMessages} notices={notices} onExit={() => setView('home')} />;
        if (view === 'inventory') return <InventoryView lang={lang} t={t} inventoryList={data.inventoryList} setInventoryList={data.setInventoryList} onSubmit={()=>{}} currentUser={currentUser} />;
        if (view === 'contact') return <ContactView t={t} lang={lang} />;
        if (view === 'recipes') return <div className="h-full overflow-y-auto text-text animate-fade-in-up"><div className="bg-surface p-4 border-b"><h2 className="text-xl font-bold">{t.recipe_title}</h2></div><div className="p-4 bg-secondary">{data.recipes.map((d: DrinkRecipe) => <DrinkCard key={d.id} drink={d} lang={lang} t={t} />)}</div></div>;
        if (view === 'training') return <TrainingView data={data} onComplete={() => {}} />;
        if (view === 'sop') return <LibraryView data={data} onOpenChecklist={(key) => { setCurrentShift(key); setView('checklist'); }} />;
        if (view === 'checklist') { const tmpl = CHECKLIST_TEMPLATES[currentShift] || CHECKLIST_TEMPLATES['opening']; return (<div className="h-full flex flex-col bg-surface text-text"><div className={`${tmpl.color} p-6 text-white`}><button onClick={() => setView('sop')} className="mb-4"><Icon name="ArrowLeft" /></button><h2 className="text-3xl font-bold">{getLoc(tmpl.title)}</h2></div><div className="flex-1 overflow-y-auto p-4">{tmpl.items.map((i: any) => (<div key={i.id} className="p-4 border-b flex items-center gap-3"><div className="w-6 h-6 border-2 rounded"></div><div><p className="font-bold">{getLoc(i.text)}</p></div></div>))}</div><div className="p-4 border-t"><button onClick={()=>{alert('OK'); setView('home');}} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold transition-all active:scale-95">Confirm</button></div></div>); }
        
        return <div className="p-10 text-center text-text-light">Section {view} under maintenance <button onClick={()=>setView('home')} className="text-primary underline block mt-4">Back</button></div>;
    };

    return (
        <div className="max-w-md mx-auto h-screen bg-secondary relative flex flex-col font-sans">
            <CustomConfirmModal isOpen={confirmModal.isOpen} title="Confirm Action" message={confirmModal.msg} onConfirm={confirmModal.action} onCancel={() => setConfirmModal(prev => ({...prev, isOpen:false}))} />
            <div className="flex-1 overflow-hidden relative">{renderView()}</div>
            {view !== 'checklist' && (
                <nav className="fixed bottom-0 w-full max-w-md bg-surface border-t p-2 pb-4 z-50 flex overflow-x-auto shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] no-scrollbar gap-1">
                    {[{id: 'home', icon: 'Grid', label: 'Workbench'}, {id: 'team', icon: 'Calendar', label: 'Schedule'}, {id: 'chat', icon: 'MessageSquare', label: 'Chat'}, {id: 'training', icon: 'GraduationCap', label: 'Training'}, {id: 'sop', icon: 'Book', label: 'SOP'}, {id: 'recipes', icon: 'BookOpen', label: 'Recipes'}, {id: 'contact', icon: 'Users', label: 'Contacts'}].map(item => (
                        <button key={item.id} onClick={() => setView(item.id as StaffViewMode)} className={`min-w-[60px] flex flex-col items-center p-2 rounded-lg transition-colors ${view === item.id ? 'text-primary bg-primary-light' : 'text-text-light hover:text-primary'}`}><Icon name={item.icon} size={20} /><span className="text-[10px] font-bold mt-1">{item.label}</span></button>
                    ))}
                </nav>
            )}
        </div>
    );
};

// --- LOGIN SCREEN ---
const LoginScreen = ({ t, onLogin }: { t: any, onLogin: (id: string) => void }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = () => {
        const user = USERS.find(u => u.password === password && u.password);
        if (user) {
            onLogin(user.id);
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
        <div className="h-screen bg-gradient-to-br from-gray-50 to-gray-200 flex flex-col items-center justify-center p-6 font-sans text-text animate-fade-in overflow-hidden">
            <div className="text-center mb-10">
                <div className="w-28 h-28 bg-white rounded-3xl flex items-center justify-center mb-5 shadow-2xl animate-float mx-auto">
                    <span className="text-5xl font-black text-primary tracking-tighter">1S</span>
                </div>
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
                
                {error && <p className="text-destructive text-xs text-center font-bold animate-pulse">{error}</p>}
                
                <button 
                    onClick={handleLogin}
                    className="w-full bg-primary text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-primary-light hover:bg-primary-dark active:scale-95 transition-all"
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
        const saved = localStorage.getItem('onesip_user');
        return saved ? JSON.parse(saved) : null;
    });
    const [lang, setLang] = useState<Lang>('zh');
    const t = TRANSLATIONS[lang];

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
        return () => { unsubInv(); unsubSched(); unsubContent(); unsubLogs(); unsubChat(); unsubSwaps(); unsubSales(); unsubHistory(); };
    }, []);

    const handleLogin = (userId: string) => { const u = USERS.find(user => user.id === userId); if (u) { setUser(u); localStorage.setItem('onesip_user', JSON.stringify(u)); } };
    const handleLogout = () => { setUser(null); setAdminRole(null); localStorage.removeItem('onesip_user'); };

    const appData = { lang, setLang, t, inventoryList, setInventoryList, schedule, setSchedule, logs, setLogs, sopList, setSopList, trainingLevels, setTrainingLevels, recipes, setRecipes, directMessages, setDirectMessages, notices, setNotices, swapRequests, setSwapRequests, salesRecords, setSalesRecords, inventoryHistory, setInventoryHistory };

    if (!user) {
        return <LoginScreen t={t} onLogin={handleLogin} />;
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