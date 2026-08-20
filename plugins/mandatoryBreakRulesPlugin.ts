import type { Plugin } from 'vite';

/**
 * Focused transform for the existing StaffApp mandatory-break engine.
 * The legacy App.tsx is very large, so this keeps the change isolated and
 * auditable. Missing anchors intentionally fail the build instead of silently
 * disabling the labour-break rule.
 */
export function mandatoryBreakRulesPlugin(): Plugin {
  return {
    name: 'onesip-mandatory-break-rules',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;

      let code = source;

      const modalAnchor = 'const EditInventoryLogModal = (';
      const modalCode = `const MandatoryBreakModal = ({ alert, onAcknowledge, lang }: {
    alert: null | {
        reminderKey: string;
        thresholdHours: number;
        shiftStart: string;
        shiftEnd: string;
        breakDate: string;
        ageGroup: 'under_18' | '18_or_above';
        alertedAt: string;
        storeName: string;
    };
    onAcknowledge: () => void;
    lang: Lang;
}) => {
    if (!alert) return null;

    return (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in" role="alertdialog" aria-modal="true" aria-labelledby="mandatory-break-title">
            <div className="w-full max-w-sm overflow-hidden rounded-3xl border-2 border-red-400 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                <div className="bg-red-500 px-6 py-5 text-center text-white">
                    <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
                        <Icon name="Coffee" size={30} />
                    </div>
                    <p className="text-xs font-black uppercase tracking-[0.22em]">Mandatory Break</p>
                    <h3 id="mandatory-break-title" className="mt-1 text-2xl font-black">
                        {lang === 'zh' ? '现在需要休息 30 分钟' : 'Take a 30-minute break now'}
                    </h3>
                </div>

                <div className="space-y-4 p-6 text-center">
                    <p className="text-sm font-bold leading-relaxed text-gray-800">
                        {lang === 'zh'
                            ? '你的班次达到 ' + alert.thresholdHours + ' 小时休息规则。班次已过半，请现在开始 30 分钟休息。'
                            : 'Your shift meets the ' + alert.thresholdHours + '-hour break rule. The shift is halfway through, so please start your 30-minute break now.'}
                    </p>

                    <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                        <p className="text-[11px] font-black uppercase tracking-wider text-red-400">Shift</p>
                        <p className="mt-1 font-mono text-xl font-black text-red-600">{alert.shiftStart} – {alert.shiftEnd}</p>
                    </div>

                    <button
                        onClick={onAcknowledge}
                        className="w-full rounded-2xl bg-red-500 py-4 text-base font-black text-white shadow-lg transition-all active:scale-95 hover:bg-red-600"
                    >
                        {lang === 'zh' ? '确认：现在开始 30 分钟休息' : 'Confirm: start 30-minute break'}
                    </button>

                    <p className="text-[11px] leading-relaxed text-gray-400">
                        {lang === 'zh' ? '此提醒必须确认后才会关闭。' : 'This reminder stays on screen until acknowledged.'}
                    </p>
                </div>
            </div>
        </div>
    );
};

`;

      if (!code.includes('const MandatoryBreakModal = (')) {
        if (!code.includes(modalAnchor)) throw new Error('[mandatory-break] Modal insertion anchor not found');
        code = code.replace(modalAnchor, modalCode + modalAnchor);
      }

      const stateAnchor = '    const [pendingSwapCount, setPendingSwapCount] = useState(0);\n';
      const stateCode = `    const [mandatoryBreakAlert, setMandatoryBreakAlert] = useState<null | {
        reminderKey: string;
        thresholdHours: number;
        shiftStart: string;
        shiftEnd: string;
        breakDate: string;
        ageGroup: 'under_18' | '18_or_above';
        alertedAt: string;
        storeName: string;
    }>(null);
    const breakPromptedRef = useRef(new Set<string>());
`;

      if (!code.includes('const [mandatoryBreakAlert, setMandatoryBreakAlert]')) {
        if (!code.includes(stateAnchor)) throw new Error('[mandatory-break] StaffApp state anchor not found');
        code = code.replace(stateAnchor, stateAnchor + stateCode);
      }

      const oldStartMarker = '    // 💡 核心升级：【分年龄段全员广播版】强制休息监控引擎 (4.5h / 5.5h 双轨制)';
      const nextEffectMarker = '    useEffect(() => {\n        if (!needsToSubmitPrep) return;';
      const newEngine = `    // 💡 强制休息监控：只提醒当前登录员工；<18 岁 >=4.5h，>=18 岁 >=5.5h。
    // 到班次中点后弹出不可随手关闭的强提醒；提醒和员工确认都会写入云端合规日志。
    useEffect(() => {
        if (!activeFeatures.schedule || !todaySchedule?.shifts?.length || !currentUser?.name) return;

        const liveUser = users.find((u: any) => u.id === currentUser.id) || currentUser;
        const isUnder18 = liveUser?.ageGroup === 'under_18';
        const ageGroup: 'under_18' | '18_or_above' = isUnder18 ? 'under_18' : '18_or_above';
        const thresholdHours = isUnder18 ? 4.5 : 5.5;
        const thresholdMinutes = thresholdHours * 60;
        const myName = currentUser.name.trim().toLowerCase();

        const checkMandatoryBreak = () => {
            const now = new Date();
            const todayKey = [
                now.getFullYear(),
                String(now.getMonth() + 1).padStart(2, '0'),
                String(now.getDate()).padStart(2, '0')
            ].join('-');

            for (const shift of todaySchedule.shifts || []) {
                if (!shift?.start || !shift?.end || !Array.isArray(shift.staff)) continue;
                const isMyShift = shift.staff.some((staffName: string) => staffName?.trim().toLowerCase() === myName);
                if (!isMyShift) continue;

                const [startH, startM] = shift.start.split(':').map(Number);
                const [endH, endM] = shift.end.split(':').map(Number);
                if ([startH, startM, endH, endM].some(Number.isNaN)) continue;

                const shiftStart = new Date(now);
                shiftStart.setHours(startH, startM, 0, 0);
                const shiftEnd = new Date(now);
                shiftEnd.setHours(endH, endM, 0, 0);
                if (shiftEnd <= shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);

                const durationMinutes = (shiftEnd.getTime() - shiftStart.getTime()) / 60000;
                // “以上”包含刚好 4.5h / 5.5h。
                if (durationMinutes < thresholdMinutes) continue;

                const midpointTime = new Date(shiftStart.getTime() + (shiftEnd.getTime() - shiftStart.getTime()) / 2);
                // 中点时没开 App，之后在班次结束前打开也会补提醒。
                if (now < midpointTime || now > shiftEnd) continue;

                const reminderKey = [
                    'mandatory_break', myStoreId, todayKey, currentUser.id,
                    shift.start, shift.end, String(thresholdHours)
                ].join('_');
                if (localStorage.getItem(reminderKey)) continue;
                if (breakPromptedRef.current.has(reminderKey)) continue;

                const alertedAt = now.toISOString();
                const storeName = myStore?.name || myStoreId;
                breakPromptedRef.current.add(reminderKey);
                setMandatoryBreakAlert({
                    reminderKey,
                    thresholdHours,
                    shiftStart: shift.start,
                    shiftEnd: shift.end,
                    breakDate: todayKey,
                    ageGroup,
                    alertedAt,
                    storeName,
                });

                // 云端留证：提醒真正展示时记录一次。用独立 localStorage key 防止刷新造成重复写日志。
                const alertLoggedKey = reminderKey + '_alert_logged';
                if (!localStorage.getItem(alertLoggedKey)) {
                    localStorage.setItem(alertLoggedKey, alertedAt);
                    const alertLog: any = {
                        id: Date.now(),
                        type: 'MANDATORY_BREAK_ALERT',
                        shift: 'mandatory-break',
                        time: alertedAt,
                        name: currentUser.name,
                        userId: currentUser.id,
                        storeId: myStoreId,
                        storeName,
                        reminderKey,
                        breakDate: todayKey,
                        shiftStart: shift.start,
                        shiftEnd: shift.end,
                        thresholdHours,
                        ageGroup,
                        alertedAt,
                        event: 'reminder_shown',
                        status: 'alerted',
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam',
                        reason: 'Mandatory 30-minute break reminder shown',
                        message: 'Mandatory break reminder shown for ' + currentUser.name + ' on ' + todayKey + ', shift ' + shift.start + '-' + shift.end + ', rule >= ' + thresholdHours + 'h.'
                    };
                    try {
                        if (typeof Cloud !== 'undefined' && (Cloud as any).saveLog) {
                            (Cloud as any).saveLog(alertLog).catch((e: any) => console.error('Break alert log failed', e));
                        }
                    } catch (e) {
                        console.error('Break alert log failed', e);
                    }
                }

                if ('Notification' in window && Notification.permission === 'granted') {
                    try {
                        new Notification('🛑 MANDATORY BREAK', {
                            body: lang === 'zh'
                                ? '你的班次 ' + shift.start + '-' + shift.end + ' 已过半，请现在开始 30 分钟休息。'
                                : 'Your ' + shift.start + '-' + shift.end + ' shift is halfway through. Start your 30-minute break now.',
                            icon: '/favicon.ico',
                            vibrate: [250, 120, 250],
                        } as any);
                    } catch (e) {
                        console.warn('System break notification unavailable', e);
                    }
                }
                break;
            }
        };

        checkMandatoryBreak();
        const timer = window.setInterval(checkMandatoryBreak, 60000);
        return () => window.clearInterval(timer);
    }, [todaySchedule, currentUser, myStoreId, myStore, activeFeatures.schedule, users, lang]);

    const acknowledgeMandatoryBreak = () => {
        if (!mandatoryBreakAlert) return;
        const acknowledgedAt = new Date().toISOString();
        localStorage.setItem(mandatoryBreakAlert.reminderKey, acknowledgedAt);

        const ackLog: any = {
            id: Date.now(),
            type: 'MANDATORY_BREAK_ACK',
            shift: 'mandatory-break',
            time: acknowledgedAt,
            name: currentUser.name,
            userId: currentUser.id,
            storeId: myStoreId,
            storeName: mandatoryBreakAlert.storeName,
            reminderKey: mandatoryBreakAlert.reminderKey,
            breakDate: mandatoryBreakAlert.breakDate,
            shiftStart: mandatoryBreakAlert.shiftStart,
            shiftEnd: mandatoryBreakAlert.shiftEnd,
            thresholdHours: mandatoryBreakAlert.thresholdHours,
            ageGroup: mandatoryBreakAlert.ageGroup,
            alertedAt: mandatoryBreakAlert.alertedAt,
            acknowledgedAt,
            event: 'break_acknowledged',
            status: 'acknowledged',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam',
            reason: 'Employee confirmed start of 30-minute break',
            message: 'Employee acknowledged mandatory 30-minute break for shift ' + mandatoryBreakAlert.shiftStart + '-' + mandatoryBreakAlert.shiftEnd + '.'
        };

        try {
            if (typeof Cloud !== 'undefined' && (Cloud as any).saveLog) {
                (Cloud as any).saveLog(ackLog).catch((e: any) => console.error('Break acknowledgement log failed', e));
            }
        } catch (e) {
            console.error('Break acknowledgement log failed', e);
        }

        setMandatoryBreakAlert(null);
    };
    // ========================================================================
`;

      if (code.includes(oldStartMarker)) {
        const start = code.indexOf(oldStartMarker);
        const end = code.indexOf(nextEffectMarker, start);
        if (end < 0) throw new Error('[mandatory-break] End marker for old break engine not found');
        code = code.slice(0, start) + newEngine + code.slice(end);
      } else if (!code.includes('const acknowledgeMandatoryBreak = () =>')) {
        throw new Error('[mandatory-break] Existing break engine anchor not found');
      }

      const renderAnchor = '            <ActionReminderModal isOpen={isScheduleReminderOpen} title="排班确认提醒"';
      const renderCode = `            <MandatoryBreakModal
                alert={mandatoryBreakAlert}
                onAcknowledge={acknowledgeMandatoryBreak}
                lang={lang}
            />
`;

      if (!code.includes('<MandatoryBreakModal\n                alert={mandatoryBreakAlert}')) {
        if (!code.includes(renderAnchor)) throw new Error('[mandatory-break] Modal render anchor not found');
        code = code.replace(renderAnchor, renderCode + renderAnchor);
      }

      const exportStub = '    const handleExportLogsCSV = () => { /* Export CSV 逻辑省略 */ };';
      const exportCode = `    const handleExportBreakLogsCSV = () => {
        const breakEvents = (scopedLogs || []).filter((log: any) =>
            log && (log.type === 'MANDATORY_BREAK_ALERT' || log.type === 'MANDATORY_BREAK_ACK')
        );
        if (breakEvents.length === 0) {
            alert('No mandatory break logs found for this branch.');
            return;
        }

        const rowsByKey = new Map<string, any>();
        breakEvents
            .slice()
            .sort((a: any, b: any) => new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime())
            .forEach((log: any) => {
                const key = log.reminderKey || String(log.id);
                const current = rowsByKey.get(key) || {
                    reminderKey: key,
                    breakDate: log.breakDate || '',
                    storeId: log.storeId || activeStoreId,
                    storeName: log.storeName || activeStore?.name || activeStoreId,
                    staffName: log.name || '',
                    userId: log.userId || '',
                    ageGroup: log.ageGroup || '',
                    thresholdHours: log.thresholdHours ?? '',
                    shiftStart: log.shiftStart || '',
                    shiftEnd: log.shiftEnd || '',
                    alertedAt: '',
                    acknowledgedAt: '',
                    timezone: log.timezone || 'Europe/Amsterdam',
                };
                if (log.type === 'MANDATORY_BREAK_ALERT') current.alertedAt = log.alertedAt || log.time || '';
                if (log.type === 'MANDATORY_BREAK_ACK') {
                    current.acknowledgedAt = log.acknowledgedAt || log.time || '';
                    if (!current.alertedAt) current.alertedAt = log.alertedAt || '';
                }
                rowsByKey.set(key, current);
            });

        const csvEscape = (value: any) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
        const header = [
            'Date', 'Store', 'Store ID', 'Staff', 'User ID', 'Age Group', 'Rule Threshold (Hours)',
            'Shift Start', 'Shift End', 'Reminder Time (ISO)', 'Acknowledged Time (ISO)', 'Status',
            'Timezone', 'Reminder Key'
        ];
        const lines = [header.map(csvEscape).join(',')];
        Array.from(rowsByKey.values()).forEach((row: any) => {
            const status = row.acknowledgedAt ? 'ACKNOWLEDGED' : 'ALERTED_NOT_ACKNOWLEDGED';
            lines.push([
                row.breakDate, row.storeName, row.storeId, row.staffName, row.userId, row.ageGroup,
                row.thresholdHours, row.shiftStart, row.shiftEnd, row.alertedAt, row.acknowledgedAt,
                status, row.timezone, row.reminderKey
            ].map(csvEscape).join(','));
        });

        const blob = new Blob(['\\uFEFF' + lines.join('\\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'mandatory_break_logs_' + activeStoreId + '_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    };`;

      if (code.includes(exportStub)) {
        code = code.replace(exportStub, exportCode);
      } else if (!code.includes('const handleExportBreakLogsCSV = () =>')) {
        throw new Error('[mandatory-break] Manager log export anchor not found');
      }

      const logsToolbarAnchor = '<div className="flex justify-end mb-4"><button onClick={() => setIsAddingManualLog(true)} className="bg-dark-accent text-dark-bg px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:opacity-90 transition-all"><Icon name="Plus" size={16} /> Add Manual Log</button></div>';
      const logsToolbarCode = `<div className="flex justify-end gap-2 mb-4">
                            <button onClick={handleExportBreakLogsCSV} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-emerald-500 transition-all"><Icon name="Download" size={16} /> Export Break CSV</button>
                            <button onClick={() => setIsAddingManualLog(true)} className="bg-dark-accent text-dark-bg px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:opacity-90 transition-all"><Icon name="Plus" size={16} /> Add Manual Log</button>
                        </div>`;

      if (code.includes(logsToolbarAnchor)) {
        code = code.replace(logsToolbarAnchor, logsToolbarCode);
      } else if (!code.includes('onClick={handleExportBreakLogsCSV}')) {
        throw new Error('[mandatory-break] Manager logs toolbar anchor not found');
      }

      return { code, map: null };
    },
  };
}
