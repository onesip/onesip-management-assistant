
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './components/Icons';
import { TRANSLATIONS, CHECKLIST_TEMPLATES, DRINK_RECIPES, TRAINING_LEVELS, SOP_DATABASE, CONTACTS_DATA, INVENTORY_ITEMS, TEAM_MEMBERS, MOCK_SCHEDULE_WEEK02, INITIAL_MENU_DATA, INITIAL_WIKI_DATA, INITIAL_ANNOUNCEMENT_DATA } from './constants';
import { Lang, LogEntry, ChatMessage, DrinkRecipe, TrainingLevel, CustomerMenuItem, WikiItem, AnnouncementData, InventoryItem, WeeklySchedule, Notice, InventoryReport, SopItem, ContactItem } from './types';
import { getChatResponse } from './services/geminiService';

// --- Shared Components ---

const AdminLoginModal = ({ isOpen, onClose, onLogin }: { isOpen: boolean, onClose: () => void, onLogin: (role: 'manager' | 'owner' | 'editor') => void }) => {
    const [pin, setPin] = useState('');
    if (!isOpen) return null;

    const handleEnter = () => {
        if (pin === '0707') onLogin('manager');
        else if (pin === '250715') onLogin('owner');
        else if (pin === '0000') onLogin('editor');
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

// --- STAFF MODULES ---

const InventoryView = ({ lang, t, inventoryList, setInventoryList, isOwner, onSubmit }: { lang: Lang, t: any, inventoryList: InventoryItem[], setInventoryList?: any, isOwner?: boolean, onSubmit?: (data: any) => void }) => {
    const [employee, setEmployee] = useState('');
    const [inputData, setInputData] = useState<Record<string, { end: string, waste: string }>>({});
    const [newItemName, setNewItemName] = useState({ zh: '', en: '' });
    const getLoc = (obj: any) => obj[lang] || obj['zh'];

    const handleInputChange = (id: string, field: 'end' | 'waste', value: string) => {
        setInputData(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    };

    const handleSendEmail = () => {
        if (!employee && !isOwner) return alert(t.select_employee);
        if (!window.confirm(t.send_stock_report_confirm)) return;
        
        const reportData = { submittedBy: employee, data: inputData };
        if(onSubmit) onSubmit(reportData);

        let emailBody = `ONESIP Stock & Waste Report - ${new Date().toLocaleDateString()}\nEmployee: ${employee}\n\n`;
        let content = "";
        inventoryList.forEach(item => {
            const data = inputData[item.id] || { end: '', waste: '' };
            if (data.end || data.waste) content += `${getLoc(item.name)} | End: ${data.end || '0'} | Waste: ${data.waste || '0'}\n`;
        });
        emailBody += "--- DETAILS ---\n" + (content || "No data entered.") + "\n\n--\nSent from ONESIP Pocket Manager";
        window.location.href = `mailto:zhengjiaru2018@gmail.com?subject=${encodeURIComponent(`ONESIP Stock - ${new Date().toLocaleDateString()}`)}&body=${encodeURIComponent(emailBody)}`;
    };

    const addItem = () => {
        if(!newItemName.zh || !newItemName.en) return;
        const newItem: InventoryItem = { id: `inv_${Date.now()}`, name: newItemName, unit: 'unit' };
        setInventoryList([...inventoryList, newItem]);
        setNewItemName({ zh: '', en: '' });
    }

    return (
        <div className="flex flex-col h-full bg-gray-50 pb-20 animate-fade-in">
            <div className="bg-white p-4 border-b sticky top-0 z-10 space-y-3">
                <div className="flex justify-between items-center"><h2 className="text-xl font-black text-gray-900">{t.inventory_title}</h2>{isOwner && <span className="bg-black text-white text-[10px] px-2 py-1 rounded">OWNER MODE</span>}</div>
                {!isOwner ? (
                     <select className="w-full p-2 rounded-lg border bg-gray-50 text-sm font-bold" value={employee} onChange={(e) => setEmployee(e.target.value)}>
                        <option value="">{t.select_employee}</option>{TEAM_MEMBERS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                ) : (
                    <div className="flex flex-col gap-2 bg-gray-100 p-2 rounded-lg">
                        <span className="text-[10px] font-bold text-gray-500 uppercase">{t.manage_presets}</span>
                        <div className="flex gap-2">
                            <input placeholder="Name (ZH)" className="flex-1 p-2 border rounded text-xs" value={newItemName.zh} onChange={e=>setNewItemName({...newItemName, zh: e.target.value})} />
                            <input placeholder="Name (EN)" className="flex-1 p-2 border rounded text-xs" value={newItemName.en} onChange={e=>setNewItemName({...newItemName, en: e.target.value})} />
                            <button onClick={addItem} className="bg-green-600 text-white p-2 rounded"><Icon name="Plus" size={16}/></button>
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-4 text-[10px] text-gray-400 uppercase font-bold mt-2 text-center"><div className="text-left pl-2 col-span-2">{t.item_name}</div><div>{t.end_count}</div><div>{t.waste}</div></div>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
                {inventoryList.map(item => {
                    const data = inputData[item.id] || { end: '', waste: '' };
                    return (
                        <div key={item.id} className="bg-white p-3 rounded-xl border shadow-sm flex items-center justify-between border-gray-100">
                            <div className="flex-1 pr-2 col-span-2">
                                <div className="font-bold text-sm text-gray-800 flex items-center gap-2">{getLoc(item.name)} {isOwner && <button onClick={() => setInventoryList(inventoryList.filter(i => i.id !== item.id))} className="text-red-400 bg-red-50 p-1 rounded"><Icon name="Trash" size={12}/></button>}</div>
                                <div className="text-[10px] text-gray-400">{item.unit}</div>
                            </div>
                            <div className="flex gap-2 w-2/5">
                                <input type="number" placeholder="End" className="w-1/2 p-2 rounded-lg border text-center text-sm" value={data.end || ''} onChange={(e) => handleInputChange(item.id, 'end', e.target.value)} disabled={isOwner} />
                                <input type="number" placeholder="Waste" className="w-1/2 p-2 rounded-lg border border-red-100 text-center text-sm bg-red-50 text-red-600" value={data.waste || ''} onChange={(e) => handleInputChange(item.id, 'waste', e.target.value)} disabled={isOwner} />
                            </div>
                        </div>
                    );
                })}
            </div>
            {!isOwner && <div className="p-4 bg-white border-t sticky bottom-20 z-10"><button onClick={handleSendEmail} className="w-full bg-orange-600 text-white py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2"><Icon name="Send" size={20} />{t.send_stock_report}</button></div>}
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
                        <div>
                            <h3 className="font-bold text-gray-800">{c.name}</h3>
                            <p className="text-xs text-gray-500">{c.role[lang]}</p>
                            {c.phone && <p onClick={() => handleCopy(c.phone!)} className="text-xs text-indigo-500 mt-1 cursor-pointer hover:underline">{c.phone}</p>}
                        </div>
                        {c.phone ? (
                            <a href={`tel:${c.phone}`} className="bg-green-100 text-green-600 p-3 rounded-full hover:bg-green-200 transition">
                                <Icon name="Phone" size={20} />
                            </a>
                        ) : (
                            <span className="text-gray-300 text-xs italic">No Phone</span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const TeamView = ({ t }: { t: any }) => {
    return (
        <div className="h-full overflow-y-auto p-4 bg-gray-50 animate-fade-in">
             <h2 className="text-2xl font-black text-gray-900 mb-4">{t.team_title}</h2>
             <div className="space-y-4">
                {MOCK_SCHEDULE_WEEK02.days.map((day, idx) => (
                    <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-gray-800">{day.name} <span className="text-gray-400 font-normal text-xs ml-1">{day.zh} ({day.date})</span></h3>
                        </div>
                        
                        {/* Morning Shift */}
                        <div className="mb-3">
                            <div className="text-[10px] font-bold text-orange-500 uppercase mb-1">{t.morning_shift}</div>
                            {day.morning.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {day.morning.map((name, i) => (
                                        <span key={i} className="px-2 py-1 bg-orange-50 text-orange-700 text-xs font-bold rounded-lg">{name}</span>
                                    ))}
                                </div>
                            ) : <span className="text-gray-300 text-xs italic">Empty</span>}
                        </div>

                        {/* Evening Shift */}
                        <div>
                            <div className="text-[10px] font-bold text-indigo-500 uppercase mb-1">{t.evening_shift}</div>
                            {day.evening.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {day.evening.map((name, i) => (
                                        <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg">{name}</span>
                                    ))}
                                </div>
                            ) : <span className="text-gray-300 text-xs italic">Empty</span>}
                        </div>
                    </div>
                ))}
             </div>
        </div>
    );
};

const DrinkCard = ({ drink, lang, t }: { drink: DrinkRecipe, lang: Lang, t: any }) => {
    const [expanded, setExpanded] = useState(false);
    const getLoc = (obj: any) => obj[lang] || obj['zh'];

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100 mb-3 transition-all">
            <div className="flex justify-between items-start" onClick={() => setExpanded(!expanded)}>
                <div>
                    <h3 className="font-bold text-gray-800">{getLoc(drink.name)}</h3>
                    <div className="flex gap-2 mt-1">
                        <span className="text-[10px] bg-orange-50 text-orange-600 px-2 py-1 rounded">{drink.cat}</span>
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded">{drink.size}</span>
                    </div>
                </div>
                <button className="text-gray-400"><Icon name={expanded ? "ChevronRight" : "ChevronRight"} className={`transform transition ${expanded ? 'rotate-90' : ''}`} /></button>
            </div>
            {expanded && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4 text-sm animate-fade-in">
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg">
                        <div><span className="text-[10px] text-gray-400 uppercase font-bold">Ice</span><p className="font-medium">{drink.ice}</p></div>
                        <div><span className="text-[10px] text-gray-400 uppercase font-bold">Sugar</span><p className="font-medium">{drink.sugar}</p></div>
                        <div className="col-span-2"><span className="text-[10px] text-gray-400 uppercase font-bold">Toppings</span><p className="font-medium text-orange-600">{getLoc(drink.toppings)}</p></div>
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2"><Icon name="Snowflake" size={14} className="text-blue-400"/> Cold Step</h4>
                        <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-1">
                            {drink.steps.cold.map((step, i) => <li key={i}>{getLoc(step)}</li>)}
                        </ol>
                    </div>
                    {drink.steps.warm && drink.steps.warm.length > 0 && (
                        <div>
                            <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2"><Icon name="Flame" size={14} className="text-red-400"/> Warm Step</h4>
                            <ol className="list-decimal list-inside space-y-1 text-gray-600 ml-1">
                                {drink.steps.warm.map((step, i) => <li key={i}>{getLoc(step)}</li>)}
                            </ol>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const TrainingView = ({ data, onComplete }: { data: any, onComplete: (levelId: number, score: number) => void }) => {
    const { trainingLevels, lang, t } = data;
    const [activeLevel, setActiveLevel] = useState<TrainingLevel | null>(null);
    const [quizMode, setQuizMode] = useState(false);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    
    const getLoc = (obj: any) => obj[lang] || obj['zh'];

    const handleStartQuiz = (level: TrainingLevel) => {
        setActiveLevel(level);
        setQuizMode(true);
        setAnswers({});
    };

    const submitQuiz = () => {
        if (!activeLevel) return;
        let correct = 0;
        activeLevel.quiz.forEach(q => {
            if (answers[q.id] === q.answer) correct++;
        });
        const score = Math.round((correct / activeLevel.quiz.length) * 100);
        alert(`Score: ${score}%`);
        onComplete(activeLevel.id, score);
        setQuizMode(false);
        setActiveLevel(null);
    };

    if (quizMode && activeLevel) {
        return (
            <div className="h-full bg-white flex flex-col">
                <div className="p-4 border-b flex items-center gap-2">
                    <button onClick={() => setQuizMode(false)}><Icon name="ArrowLeft" /></button>
                    <h2 className="font-bold">{getLoc(activeLevel.title)} - Quiz</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {activeLevel.quiz.map((q, idx) => (
                        <div key={q.id} className="space-y-2">
                            <p className="font-bold text-gray-800">{idx + 1}. {getLoc(q.question)}</p>
                            <div className="space-y-2">
                                {q.options?.map((opt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setAnswers({...answers, [q.id]: i})}
                                        className={`w-full text-left p-3 rounded-xl border ${answers[q.id] === i ? 'bg-green-50 border-green-500 text-green-700 font-bold' : 'border-gray-200'}`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t">
                    <button onClick={submitQuiz} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold">Submit</button>
                </div>
            </div>
        );
    }

    if (activeLevel) {
        return (
            <div className="h-full bg-white flex flex-col">
                <div className="p-4 border-b flex items-center gap-2 sticky top-0 bg-white z-10">
                    <button onClick={() => setActiveLevel(null)}><Icon name="ArrowLeft" /></button>
                    <h2 className="font-bold">{getLoc(activeLevel.title)}</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="bg-green-50 p-4 rounded-xl text-green-800 text-sm leading-relaxed">
                        {getLoc(activeLevel.desc)}
                    </div>
                    {activeLevel.content.map((c, i) => (
                        <div key={i}>
                            <h3 className="font-black text-lg text-gray-900 mb-2">{getLoc(c.title)}</h3>
                            <p className="text-gray-600 whitespace-pre-line text-sm leading-relaxed">{getLoc(c.body)}</p>
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t sticky bottom-0 bg-white">
                    <button onClick={() => handleStartQuiz(activeLevel)} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-200">Start Quiz</button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-4 bg-gray-50 animate-fade-in">
            <h2 className="text-2xl font-black text-gray-900 mb-4">{t.training}</h2>
            <div className="space-y-3">
                {trainingLevels.map((level: TrainingLevel) => (
                    <div key={level.id} onClick={() => setActiveLevel(level)} className="bg-white p-4 rounded-xl shadow-sm border border-green-100 active:scale-95 transition-all">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-green-600 uppercase tracking-wider">{getLoc(level.subtitle)}</span>
                            <Icon name="ChevronRight" size={16} className="text-gray-300" />
                        </div>
                        <h3 className="font-bold text-gray-800 text-lg mb-1">{getLoc(level.title)}</h3>
                        <p className="text-xs text-gray-500 line-clamp-2">{getLoc(level.desc)}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

const LibraryView = ({ data }: { data: any }) => {
    const { sopList, lang, t } = data;
    const [selectedSop, setSelectedSop] = useState<SopItem | null>(null);
    const getLoc = (obj: any) => obj[lang] || obj['zh'];

    if (selectedSop) {
        return (
            <div className="h-full bg-white flex flex-col">
                <div className="p-4 border-b flex items-center gap-2 sticky top-0 bg-white z-10">
                    <button onClick={() => setSelectedSop(null)}><Icon name="ArrowLeft" /></button>
                    <h2 className="font-bold truncate pr-4">{getLoc(selectedSop.title)}</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="flex flex-wrap gap-2 mb-4">
                        {selectedSop.tags.map(tag => (
                            <span key={tag} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded-full">#{tag}</span>
                        ))}
                    </div>
                    <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-line leading-loose">
                        {getLoc(selectedSop.content)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-4 bg-gray-50 animate-fade-in">
            <h2 className="text-2xl font-black text-gray-900 mb-4">{t.sop_library}</h2>
            <div className="grid gap-3">
                {sopList.map((sop: SopItem) => (
                    <div key={sop.id} onClick={() => setSelectedSop(sop)} className="bg-white p-4 rounded-xl shadow-sm border border-blue-100 active:scale-95 transition-all">
                        <h3 className="font-bold text-gray-800 mb-1">{getLoc(sop.title)}</h3>
                        <div className="flex flex-wrap gap-1">
                            {sop.tags.slice(0, 3).map(tag => (
                                <span key={tag} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded">#{tag}</span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const AiAssistantView = ({ data }: { data: any }) => {
    const { sopList, trainingLevels, t, lang } = data;
    const [messages, setMessages] = useState<ChatMessage[]>([
        { id: '1', role: 'bot', text: t.ready }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;
        
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        const responseText = await getChatResponse(userMsg.text, sopList, trainingLevels);
        
        const botMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText };
        setMessages(prev => [...prev, botMsg]);
        setIsTyping(false);
    };

    return (
        <div className="h-full flex flex-col bg-gray-50">
            <div className="bg-white p-4 border-b shadow-sm flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold"><Icon name="Sparkles" size={16}/></div>
                <div><h2 className="font-bold text-gray-900">AI Store Manager</h2><p className="text-[10px] text-green-500 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Online</p></div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 shadow-sm rounded-tl-none'}`}>
                            {msg.component ? msg.component : <p className="whitespace-pre-wrap">{msg.text}</p>}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div className="flex justify-start">
                        <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-gray-100 shadow-sm flex gap-1">
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></span>
                            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t">
                <div className="flex gap-2">
                    <input 
                        className="flex-1 bg-gray-100 border-0 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                        placeholder="Ask about recipes, SOPs..." 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    />
                    <button onClick={handleSend} disabled={!input.trim() || isTyping} className="bg-blue-600 text-white p-3 rounded-xl disabled:opacity-50 hover:bg-blue-700 transition">
                        <Icon name="Send" size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};

const CustomerApp = ({ onSwitchMode, data }: { onSwitchMode: () => void, data: any }) => {
    return (
        <div className="h-screen bg-pink-50 flex flex-col items-center justify-center text-center p-6">
            <h1 className="text-3xl font-black text-pink-600 mb-4">Customer Kiosk</h1>
            <p className="text-gray-600 mb-8">Under Maintenance</p>
            <button onClick={onSwitchMode} className="bg-white px-6 py-3 rounded-full font-bold shadow text-pink-500">Back to Staff Mode</button>
        </div>
    )
};

// --- ADMIN DASHBOARDS ---

const OwnerDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { inventoryList, setInventoryList, lang, t } = data;
    const [history, setHistory] = useState<InventoryReport[]>([]);

    useEffect(() => {
        const saved = localStorage.getItem('onesip_inventory_history');
        if (saved) setHistory(JSON.parse(saved));
    }, []);

    return (
        <div className="h-full flex flex-col bg-slate-900 text-white">
            <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                <div><h1 className="text-2xl font-black text-amber-500">{t.owner_dashboard}</h1><p className="text-xs text-slate-400">Inventory Command Center</p></div>
                <button onClick={onExit} className="bg-slate-800 p-2 rounded-lg hover:bg-slate-700"><Icon name="LogOut" /></button>
            </div>
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="p-4 bg-slate-800/50 border-b border-slate-700"><h3 className="font-bold text-amber-500 mb-2">Report History</h3><div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">{history.length > 0 ? history.map(h => (<div key={h.id} className="bg-slate-700 p-3 rounded-lg min-w-[140px] border border-slate-600"><div className="text-xs text-slate-300">{h.date}</div><div className="font-bold text-sm text-white">{h.submittedBy}</div></div>)) : <span className="text-slate-500 text-xs">No records yet.</span>}</div></div>
                <div className="flex-1 bg-gray-100 text-black rounded-t-[2rem] overflow-hidden relative">
                     <div className="absolute inset-0 overflow-y-auto">
                        <InventoryView lang={lang} t={t} inventoryList={inventoryList} setInventoryList={setInventoryList} isOwner={true} />
                     </div>
                </div>
            </div>
        </div>
    );
};

const ManagerDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { schedule, setSchedule, notices, setNotices, logs, t } = data;
    const [view, setView] = useState<'schedule' | 'logs' | 'chat'>('schedule');
    const [newNotice, setNewNotice] = useState('');
    const [draggedEmployee, setDraggedEmployee] = useState<string | null>(null);

    const handlePostNotice = () => {
        if (!newNotice) return;
        const notice: Notice = { id: Date.now().toString(), author: 'Manager', content: newNotice, date: new Date().toLocaleDateString(), isUrgent: false };
        setNotices([notice, ...notices]);
        setNewNotice('');
    };

    const removeShift = (dayIdx: number, shiftType: 'morning' | 'evening', nameIndex: number) => {
        const newSchedule = { ...schedule };
        newSchedule.days[dayIdx][shiftType].splice(nameIndex, 1);
        setSchedule(newSchedule);
    };

    const handleDragStart = (e: React.DragEvent, name: string) => {
        e.dataTransfer.setData("text/plain", name);
        setDraggedEmployee(name);
    };

    const handleDrop = (e: React.DragEvent, dayIdx: number, shiftType: 'morning' | 'evening') => {
        e.preventDefault();
        const name = e.dataTransfer.getData("text/plain");
        if (name) {
            const currentShifts = schedule.days[dayIdx][shiftType];
            if (currentShifts.length >= 3) {
                alert("Max 3 people per shift!");
                setDraggedEmployee(null);
                return;
            }
            if (currentShifts.includes(name)) {
                alert("Person already in this shift!");
                setDraggedEmployee(null);
                return;
            }

            const newSchedule = { ...schedule };
            newSchedule.days[dayIdx][shiftType].push(name);
            setSchedule(newSchedule);
        }
        setDraggedEmployee(null);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    return (
        <div className="h-full flex flex-col bg-indigo-50">
            <div className="bg-indigo-600 p-6 text-white shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <div><h1 className="text-2xl font-black">{t.manager_title}</h1><p className="text-xs text-indigo-200">Ops & Team</p></div>
                    <button onClick={onExit} className="bg-indigo-500 p-2 rounded-lg"><Icon name="LogOut" /></button>
                </div>
                <div className="flex bg-indigo-800/50 p-1 rounded-xl">
                    <button onClick={() => setView('schedule')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${view === 'schedule' ? 'bg-white text-indigo-600' : 'text-indigo-200'}`}>Scheduling</button>
                    <button onClick={() => setView('logs')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${view === 'logs' ? 'bg-white text-indigo-600' : 'text-indigo-200'}`}>Monitoring</button>
                    <button onClick={() => setView('chat')} className={`flex-1 py-2 rounded-lg text-xs font-bold ${view === 'chat' ? 'bg-white text-indigo-600' : 'text-indigo-200'}`}>Chat</button>
                </div>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col">
                {view === 'schedule' && (
                    <div className="flex h-full">
                        {/* Roster Sidebar */}
                        <div className="w-1/4 bg-white border-r border-indigo-100 p-4 overflow-y-auto">
                            <h3 className="text-xs font-bold text-gray-400 uppercase mb-3">Roster</h3>
                            <div className="space-y-2">
                                {TEAM_MEMBERS.map(member => (
                                    <div 
                                        key={member}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, member)}
                                        className="p-3 bg-indigo-50 rounded-lg text-sm font-bold text-indigo-700 cursor-move hover:bg-indigo-100 active:opacity-50 transition shadow-sm border border-indigo-100"
                                    >
                                        {member}
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-400 mt-4 text-center leading-tight">{t.drag_hint}</p>
                        </div>

                        {/* Week Grid */}
                        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                            <div className="space-y-4">
                                {schedule.days.map((day: any, dIdx: number) => (
                                    <div key={dIdx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                        <div className="flex justify-between items-center mb-3">
                                            <h3 className="font-bold text-gray-800">{day.name} <span className="text-gray-400 font-normal text-xs ml-1">{day.zh} ({day.date})</span></h3>
                                        </div>
                                        
                                        {/* Morning Drop Zone */}
                                        <div className="mb-3">
                                            <div className="text-[10px] font-bold text-orange-500 uppercase mb-1">{t.morning_shift}</div>
                                            <div 
                                                onDrop={(e) => handleDrop(e, dIdx, 'morning')}
                                                onDragOver={handleDragOver}
                                                className={`min-h-[50px] border-2 border-dashed rounded-lg p-2 flex flex-wrap gap-2 transition ${day.morning.length >= 3 ? 'bg-gray-100 border-gray-300' : 'bg-orange-50/30 border-orange-200'}`}
                                            >
                                                {day.morning.length === 0 && <span className="text-xs text-gray-400 italic m-auto">Drop here</span>}
                                                {day.morning.map((name: string, i: number) => (
                                                    <div key={i} className="bg-orange-100 text-orange-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                                                        {name}
                                                        <button onClick={() => removeShift(dIdx, 'morning', i)} className="text-orange-400 hover:text-orange-600"><Icon name="X" size={12}/></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Evening Drop Zone */}
                                        <div>
                                            <div className="text-[10px] font-bold text-indigo-500 uppercase mb-1">{t.evening_shift}</div>
                                            <div 
                                                onDrop={(e) => handleDrop(e, dIdx, 'evening')}
                                                onDragOver={handleDragOver}
                                                className={`min-h-[50px] border-2 border-dashed rounded-lg p-2 flex flex-wrap gap-2 transition ${day.evening.length >= 3 ? 'bg-gray-100 border-gray-300' : 'bg-indigo-50/30 border-indigo-200'}`}
                                            >
                                                {day.evening.length === 0 && <span className="text-xs text-gray-400 italic m-auto">Drop here</span>}
                                                {day.evening.map((name: string, i: number) => (
                                                    <div key={i} className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                                                        {name}
                                                        <button onClick={() => removeShift(dIdx, 'evening', i)} className="text-indigo-400 hover:text-indigo-600"><Icon name="X" size={12}/></button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                
                {view === 'logs' && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {logs.map((log: LogEntry) => (
                            <div key={log.id} className="bg-white p-3 rounded-lg border flex justify-between items-center">
                                <div><div className="font-bold text-sm">{log.name || log.shift}</div><div className="text-xs text-gray-500">{log.time} - {log.type} - {log.reason}</div></div>
                                {log.kpi && <span className={`text-xs font-bold ${log.kpi.includes('Fail') ? 'text-red-500' : 'text-green-500'}`}>{log.kpi}</span>}
                            </div>
                        ))}
                    </div>
                )}
                
                {view === 'chat' && (
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="bg-white p-4 rounded-xl border mb-4 shadow-sm">
                            <h3 className="font-bold text-gray-800 mb-2">Post Announcement</h3>
                            <textarea className="w-full border p-2 rounded-lg mb-2 text-sm" rows={3} placeholder="Write a message to the team..." value={newNotice} onChange={e => setNewNotice(e.target.value)}></textarea>
                            <button onClick={handlePostNotice} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold">Post to Board</button>
                        </div>
                        <div className="space-y-2">
                            {notices.map((n: Notice) => (
                                <div key={n.id} className="bg-white p-3 rounded-lg border border-indigo-100"><p className="text-sm">{n.content}</p><div className="text-[10px] text-gray-400 mt-1">{n.date} - {n.author}</div></div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const EditorDashboard = ({ data, onExit }: { data: any, onExit: () => void }) => {
    const { sopList, setSopList, trainingLevels, setTrainingLevels, recipes, setRecipes, t, lang } = data;
    const [view, setView] = useState<'training' | 'sop' | 'recipes'>('training');
    const [editingItem, setEditingItem] = useState<any>(null);

    const handleSave = () => {
        if (!editingItem) return;
        if (view === 'sop') {
            const updated = sopList.map((item: any) => item.id === editingItem.id ? editingItem : item);
            setSopList(updated);
        } else if (view === 'training') {
            const updated = trainingLevels.map((item: any) => item.id === editingItem.id ? editingItem : item);
            setTrainingLevels(updated);
        } else if (view === 'recipes') {
            const updated = recipes.map((item: any) => item.id === editingItem.id ? editingItem : item);
            setRecipes(updated);
        }
        setEditingItem(null);
    };

    return (
        <div className="h-full flex flex-col bg-gray-900 text-white">
            <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                <div><h1 className="text-xl font-black text-emerald-400">{t.editor_title}</h1><p className="text-xs text-gray-400">{t.editor_desc}</p></div>
                <button onClick={onExit} className="bg-gray-800 p-2 rounded-lg hover:bg-gray-700"><Icon name="LogOut" /></button>
            </div>
            
            {!editingItem ? (
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="flex gap-2 mb-4 bg-gray-800 p-1 rounded-xl">
                        <button onClick={() => setView('training')} className={`flex-1 py-2 rounded-lg font-bold text-xs ${view === 'training' ? 'bg-emerald-600 text-white' : 'text-gray-400'}`}>Training</button>
                        <button onClick={() => setView('recipes')} className={`flex-1 py-2 rounded-lg font-bold text-xs ${view === 'recipes' ? 'bg-emerald-600 text-white' : 'text-gray-400'}`}>Recipes</button>
                        <button onClick={() => setView('sop')} className={`flex-1 py-2 rounded-lg font-bold text-xs ${view === 'sop' ? 'bg-emerald-600 text-white' : 'text-gray-400'}`}>SOPs</button>
                    </div>
                    <div className="space-y-3">
                        {(view === 'sop' ? sopList : view === 'training' ? trainingLevels : recipes).map((item: any) => (
                            <div key={item.id} className="bg-gray-800 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
                                <div><h3 className="font-bold text-sm text-gray-200">{view === 'recipes' ? item.name[lang] : item.title[lang]}</h3></div>
                                <button onClick={() => setEditingItem(item)} className="p-2 bg-gray-700 rounded-lg hover:bg-emerald-500/20 text-emerald-400"><Icon name="Edit" size={16} /></button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto p-4 bg-gray-800">
                    <h3 className="font-bold mb-4 flex items-center gap-2 text-emerald-400"><button onClick={() => setEditingItem(null)}><Icon name="ArrowLeft"/></button> Editing...</h3>
                    <div className="space-y-4">
                        <p className="text-xs text-gray-500 bg-gray-900 p-2 rounded">Raw JSON Editor (Be Careful)</p>
                        <textarea 
                            className="w-full h-96 bg-gray-900 p-3 rounded-lg text-xs font-mono text-green-400 leading-relaxed border border-gray-700 focus:border-emerald-500 outline-none"
                            value={JSON.stringify(editingItem, null, 2)}
                            onChange={e => {
                                try {
                                    const parsed = JSON.parse(e.target.value);
                                    setEditingItem(parsed);
                                } catch(err) {
                                    // Allow typing invalid json momentarily
                                }
                            }}
                        ></textarea>
                        <button onClick={handleSave} className="w-full bg-emerald-600 py-3 rounded-xl font-bold text-white shadow-lg">{t.save_changes}</button>
                    </div>
                </div>
            )}
        </div>
    );
};

const StaffApp = ({ onSwitchMode, data }: { onSwitchMode: () => void, data: any }) => {
    const { lang, setLang, menuItems, setMenuItems, promoData, setPromoData, schedule, notices, logs, setLogs, t } = data;
    const [view, setView] = useState<'home' | 'checklist' | 'recipes' | 'training' | 'sop' | 'logs' | 'ai' | 'team' | 'inventory' | 'contact'>('home');
    const [currentShift, setCurrentShift] = useState<string | null>(null);
    const [showClockIn, setShowClockIn] = useState(false);
    const [showClockOut, setShowClockOut] = useState(false);
    
    // Admin Modal State
    const [showAdminLogin, setShowAdminLogin] = useState(false);
    const [adminRole, setAdminRole] = useState<'none' | 'manager' | 'owner' | 'editor'>('none');

    const getLoc = (obj: any) => obj[lang] || obj['zh'];

    const handleClockLog = (type: 'clock-in' | 'clock-out') => {
        const newLog: LogEntry = { id: Date.now(), shift: type, name: "Staff", time: new Date().toLocaleString(), type: type, reason: "" };
        const updated = [newLog, ...logs];
        setLogs(updated);
        localStorage.setItem('onesip_logs', JSON.stringify(updated));
        alert(`${type === 'clock-in' ? 'Clock In' : 'Clock Out'} Recorded!`);
    };

    const submitChecklist = () => {
        if (!currentShift) return;
        const tmpl = CHECKLIST_TEMPLATES[currentShift];
        const newLog: LogEntry = { id: Date.now(), shift: getLoc(tmpl.title), time: new Date().toLocaleString(), status: 'Completed', type: 'checklist' };
        const updated = [newLog, ...logs];
        setLogs(updated);
        localStorage.setItem('onesip_logs', JSON.stringify(updated));
        setCurrentShift(null);
        setView('home');
        alert(t.submit_success);
    };

    const handleInventorySubmit = (reportData: any) => {
        const newLog: LogEntry = { id: Date.now(), shift: "Inventory", name: reportData.submittedBy, time: new Date().toLocaleString(), type: 'inventory', reason: "Submitted Report" };
        const updated = [newLog, ...logs];
        setLogs(updated);
        // Also save to history
        const report: InventoryReport = { id: Date.now(), date: new Date().toLocaleDateString(), submittedBy: reportData.submittedBy, data: reportData.data };
        const history = JSON.parse(localStorage.getItem('onesip_inventory_history') || '[]');
        localStorage.setItem('onesip_inventory_history', JSON.stringify([report, ...history]));
    };

    if (adminRole === 'manager') return <ManagerDashboard data={data} onExit={() => setAdminRole('none')} />;
    if (adminRole === 'owner') return <OwnerDashboard data={data} onExit={() => setAdminRole('none')} />;
    if (adminRole === 'editor') return <EditorDashboard data={data} onExit={() => setAdminRole('none')} />;

    // --- Render Logic ---
    const renderStaffView = () => {
        if (view === 'team') return <TeamView t={t} />;
        if (view === 'contact') return <ContactView t={t} lang={lang} />;
        if (view === 'inventory') return <InventoryView lang={lang} t={t} inventoryList={data.inventoryList} onSubmit={handleInventorySubmit} />;
        if (view === 'recipes') return <div className="h-full overflow-y-auto"><div className="bg-white p-4 border-b"><h2 className="text-xl font-bold">{t.recipe_title}</h2></div><div className="p-4">{data.recipes.map((d: DrinkRecipe) => <DrinkCard key={d.id} drink={d} lang={lang} t={t} />)}</div></div>;
        if (view === 'training') return <TrainingView data={data} onComplete={() => {}} />;
        if (view === 'sop') return <LibraryView data={data} />;
        if (view === 'ai') return <AiAssistantView data={data} />;
        
        if (view === 'checklist' && currentShift) {
             const tmpl = CHECKLIST_TEMPLATES[currentShift];
             return (
                 <div className="h-full flex flex-col bg-white">
                     <div className={`${tmpl.color} p-6 text-white`}><button onClick={() => setView('home')} className="mb-4"><Icon name="ArrowLeft" /></button><h2 className="text-3xl font-bold">{getLoc(tmpl.title)}</h2></div>
                     <div className="flex-1 overflow-y-auto p-4">{tmpl.items.map((i: any) => (<div key={i.id} className="p-4 border-b flex items-center gap-3"><div className="w-6 h-6 border-2 rounded"></div><div><p className="font-bold">{getLoc(i.text)}</p></div></div>))}</div>
                     <div className="p-4 border-t"><button onClick={submitChecklist} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold">{t.confirm_submit}</button></div>
                 </div>
             );
        }

        if (view === 'home') {
            return (
                <div className="h-full overflow-y-auto p-6 pb-24 space-y-6 animate-fade-in bg-gray-50">
                    <header className="flex justify-between items-center">
                        <div><h1 className="text-2xl font-black text-gray-900 tracking-tight">ONESIP</h1><p className="text-sm text-gray-500 font-medium">Pocket Manager</p></div>
                        <div className="flex gap-3">
                             <button onClick={() => setShowAdminLogin(true)} className="bg-gray-900 text-white border px-3 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1"><Icon name="Shield" size={14}/> Admin</button>
                             <button onClick={onSwitchMode} className="bg-white border px-3 py-1 rounded-full text-xs font-bold shadow-sm flex items-center gap-1"><Icon name="Users" size={14}/> Kiosk</button>
                             <button onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')} className="bg-white border px-3 py-1 rounded-full text-xs font-bold shadow-sm"><Icon name="Globe" size={14}/> {lang === 'zh' ? 'EN' : 'CN'}</button>
                        </div>
                    </header>
                    {notices.length > 0 && (
                        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3">
                            <Icon name="MessageSquare" className="text-indigo-600 shrink-0 mt-1" />
                            <div>
                                <h3 className="font-bold text-indigo-900 text-sm">Team Notice</h3>
                                <p className="text-indigo-700 text-xs mt-1">{notices[0].content}</p>
                                <p className="text-[10px] text-indigo-400 mt-2">{notices[0].date} - {notices[0].author}</p>
                            </div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => handleClockLog('clock-in')} className="bg-gradient-to-br from-green-500 to-emerald-600 text-white p-4 rounded-2xl shadow-lg shadow-green-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-2"><Icon name="Play" size={32} className="text-white" /><span className="font-black">{t.clock_in}</span></button>
                        <button onClick={() => handleClockLog('clock-out')} className="bg-gradient-to-br from-red-500 to-rose-600 text-white p-4 rounded-2xl shadow-lg shadow-red-200 active:scale-95 transition-all flex flex-col items-center justify-center gap-2"><Icon name="Square" size={32} className="text-white" /><span className="font-black">{t.clock_out}</span></button>
                    </div>
                    <div className="grid gap-4 mt-2">
                        <button onClick={() => { setCurrentShift('opening'); setView('checklist'); }} className="bg-white p-5 rounded-2xl shadow-sm border border-yellow-100 flex items-center gap-4 active:scale-95 transition-all"><div className="bg-yellow-100 p-3 rounded-xl text-yellow-600"><Icon name="Coffee" size={24} /></div><div className="text-left flex-1"><h3 className="font-bold text-lg text-gray-800">{t.opening_title}</h3></div><Icon name="ChevronRight" className="text-gray-300" /></button>
                        <button onClick={() => { setCurrentShift('mid'); setView('checklist'); }} className="bg-white p-5 rounded-2xl shadow-sm border border-blue-100 flex items-center gap-4 active:scale-95 transition-all"><div className="bg-blue-100 p-3 rounded-xl text-blue-600"><Icon name="Clock" size={24} /></div><div className="text-left flex-1"><h3 className="font-bold text-lg text-gray-800">{t.mid_title}</h3></div><Icon name="ChevronRight" className="text-gray-300" /></button>
                        <button onClick={() => { setCurrentShift('closing'); setView('checklist'); }} className="bg-white p-5 rounded-2xl shadow-sm border border-purple-100 flex items-center gap-4 active:scale-95 transition-all"><div className="bg-purple-100 p-3 rounded-xl text-purple-600"><Icon name="LogOut" size={24} /></div><div className="text-left flex-1"><h3 className="font-bold text-lg text-gray-800">{t.closing_title}</h3></div><Icon name="ChevronRight" className="text-gray-300" /></button>
                    </div>
                </div>
            );
        }
        return <div>View: {view}</div>;
    };

    return (
        <div className="max-w-md mx-auto h-screen bg-gray-50 relative flex flex-col font-sans">
            <AdminLoginModal isOpen={showAdminLogin} onClose={() => setShowAdminLogin(false)} onLogin={(role) => { setAdminRole(role); setShowAdminLogin(false); }} />
            <div className="flex-1 overflow-hidden relative">{renderStaffView()}</div>
            {view !== 'checklist' && (
                <nav className="fixed bottom-0 w-full max-w-md bg-white border-t border-gray-200 p-2 pb-6 z-50 overflow-x-auto">
                    <div className="flex justify-between items-center gap-1 min-w-max px-2">
                        <button onClick={() => setView('home')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'home' ? 'text-gray-900 bg-gray-100' : 'text-gray-400'}`}><Icon name="Grid" size={20} /><span className="text-[9px] font-bold mt-1">{t.home}</span></button>
                        <button onClick={() => setView('training')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'training' ? 'text-green-600 bg-green-50' : 'text-gray-400'}`}><Icon name="GraduationCap" size={20} /><span className="text-[9px] font-bold mt-1">{t.training}</span></button>
                        <button onClick={() => setView('recipes')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'recipes' ? 'text-orange-600 bg-orange-50' : 'text-gray-400'}`}><Icon name="Book" size={20} /><span className="text-[9px] font-bold mt-1">{t.recipes}</span></button>
                        <button onClick={() => setView('sop')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'sop' ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}><Icon name="BookOpen" size={20} /><span className="text-[9px] font-bold mt-1">{t.sop}</span></button>
                        <button onClick={() => setView('team')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'team' ? 'text-indigo-600 bg-indigo-50' : 'text-gray-400'}`}><Icon name="Calendar" size={20} /><span className="text-[9px] font-bold mt-1">{t.schedule}</span></button>
                        <button onClick={() => setView('contact')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'contact' ? 'text-purple-600 bg-purple-50' : 'text-gray-400'}`}><Icon name="Phone" size={20} /><span className="text-[9px] font-bold mt-1">{t.contact}</span></button>
                        <button onClick={() => setView('inventory')} className={`flex flex-col items-center p-2 rounded-xl min-w-[60px] ${view === 'inventory' ? 'text-red-600 bg-red-50' : 'text-gray-400'}`}><Icon name="Package" size={20} /><span className="text-[9px] font-bold mt-1">{t.stock}</span></button>
                    </div>
                </nav>
            )}
        </div>
    );
};

export default function App() {
    const [mode, setMode] = useState<'staff' | 'customer'>('staff');
    const [lang, setLang] = useState<Lang>('zh');
    
    // Shared Data Store
    const [menuItems, setMenuItems] = useState(INITIAL_MENU_DATA);
    const [wikiItems, setWikiItems] = useState(INITIAL_WIKI_DATA);
    const [promoData, setPromoData] = useState(INITIAL_ANNOUNCEMENT_DATA);
    const [inventoryList, setInventoryList] = useState<InventoryItem[]>(() => {
        const saved = localStorage.getItem('onesip_inventory_list');
        return saved ? JSON.parse(saved) : INVENTORY_ITEMS;
    });
    const [schedule, setSchedule] = useState(MOCK_SCHEDULE_WEEK02);
    const [notices, setNotices] = useState<Notice[]>([]);
    
    // Lifted state for Editor/Admin
    const [sopList, setSopList] = useState<SopItem[]>(() => {
        const saved = localStorage.getItem('onesip_sop_list');
        return saved ? JSON.parse(saved) : SOP_DATABASE;
    });
    const [trainingLevels, setTrainingLevels] = useState<TrainingLevel[]>(() => {
        const saved = localStorage.getItem('onesip_training_levels');
        return saved ? JSON.parse(saved) : TRAINING_LEVELS;
    });
    const [recipes, setRecipes] = useState<DrinkRecipe[]>(() => {
        const saved = localStorage.getItem('onesip_recipes');
        return saved ? JSON.parse(saved) : DRINK_RECIPES;
    });
    
    // Logs need to be shared
    const [logs, setLogs] = useState<LogEntry[]>(() => {
        const saved = localStorage.getItem('onesip_logs');
        return saved ? JSON.parse(saved) : [];
    });

    // Persistence
    useEffect(() => {
        localStorage.setItem('onesip_inventory_list', JSON.stringify(inventoryList));
        localStorage.setItem('onesip_sop_list', JSON.stringify(sopList));
        localStorage.setItem('onesip_training_levels', JSON.stringify(trainingLevels));
        localStorage.setItem('onesip_recipes', JSON.stringify(recipes));
    }, [inventoryList, sopList, trainingLevels, recipes]);

    const t = TRANSLATIONS[lang]; // Fixed: Define t here to pass down

    const sharedData = { 
        menuItems, setMenuItems, 
        wikiItems, setWikiItems, 
        promoData, setPromoData, 
        lang, setLang, 
        inventoryList, setInventoryList, 
        schedule, setSchedule, 
        notices, setNotices,
        sopList, setSopList,
        trainingLevels, setTrainingLevels,
        recipes, setRecipes,
        logs, setLogs,
        t // Pass t in sharedData
    };

    return mode === 'staff' 
        ? <StaffApp onSwitchMode={() => setMode('customer')} data={sharedData} />
        : <CustomerApp onSwitchMode={() => setMode('staff')} data={sharedData} />;
}
