import React, { createContext, useState, useContext, ReactNode, useRef, useEffect, useCallback } from 'react';
import { Icon } from './Icons';

export type NotificationType = 'message' | 'announcement' | 'clock_in_reminder' | 'clock_out_reminder';

interface NotificationItem {
    id: string;
    type: NotificationType;
    title: string;
    message: string;
    onClose?: () => void;
    sticky?: boolean;
    dedupeKey?: string;
    imageUrl?: string;
}

interface NotificationContextType {
    showNotification: (params: Omit<NotificationItem, 'id'>) => void;
    notifications: NotificationItem[];
    removeNotification: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children?: ReactNode }) => {
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const shownKeys = useRef(new Set<string>());
    const timers = useRef<Record<string, number>>({});

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => {
            const notification = prev.find(n => n.id === id);
            // Allow the same notification to be shown again after it's dismissed
            if (notification?.dedupeKey) {
                shownKeys.current.delete(notification.dedupeKey);
            }
            return prev.filter(n => n.id !== id);
        });
        if (timers.current[id]) {
            clearTimeout(timers.current[id]);
            delete timers.current[id];
        }
    }, []);

    const showNotification = useCallback((params: Omit<NotificationItem, 'id'>) => {
        const dedupeKey = params.dedupeKey ?? `${params.type}::${params.title}::${params.message}`;
        if (shownKeys.current.has(dedupeKey)) {
            return;
        }
        shownKeys.current.add(dedupeKey);

        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const newNotification: NotificationItem = { ...params, id, dedupeKey };
        
        setNotifications(prev => [...prev, newNotification]);

        if (!params.sticky) {
            const timerId = setTimeout(() => {
                removeNotification(id);
            }, 4000); // Auto-dismiss after 4 seconds
            timers.current[id] = timerId as any;
        }
    }, [removeNotification]);

    useEffect(() => {
        // Cleanup all timers on component unmount
        return () => {
            Object.values(timers.current).forEach(clearTimeout);
        };
    }, []);

    return (
        <NotificationContext.Provider value={{ showNotification, notifications, removeNotification }}>
            {children}
            {/* Unified Notification Container - Fixed at Top Right */}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none p-4">
                {notifications.map(n => (
                    <div key={n.id} className="bg-white pointer-events-auto p-4 rounded-xl shadow-2xl border border-gray-100 animate-slide-up flex gap-3 items-start relative overflow-hidden">
                        {/* Status Indicator Bar */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                            n.type === 'clock_in_reminder' ? 'bg-orange-500' :
                            n.type === 'clock_out_reminder' ? 'bg-red-500' :
                            n.type === 'announcement' ? 'bg-blue-500' : 'bg-green-500'
                        }`}></div>

                        <div className={`mt-0.5 rounded-full p-2 shrink-0 ${
                            n.type.includes('reminder') ? 'bg-orange-100 text-orange-600' :
                            n.type === 'announcement' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                        }`}>
                            <Icon name={n.type.includes('reminder') ? 'Clock' : n.type === 'announcement' ? 'Megaphone' : 'MessageSquare'} size={20} />
                        </div>
                        <div className="flex-1">
                            <h4 className="font-bold text-gray-900 text-sm leading-tight mb-1">{n.title}</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">{n.message}</p>
                            {n.imageUrl && <img src={n.imageUrl} alt="" className="mt-2 rounded-md w-full object-cover max-h-32 border" />}
                        </div>
                        <button onClick={() => removeNotification(n.id)} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
                            <Icon name="X" size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </NotificationContext.Provider>
    );
};

export const useNotification = () => {
    const context = useContext(NotificationContext);
    if (!context) throw new Error('useNotification must be used within a NotificationProvider');
    return context;
};