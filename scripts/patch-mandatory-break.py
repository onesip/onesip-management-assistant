from pathlib import Path
import re

app_path = Path('App.tsx')
types_path = Path('types.ts')

app = app_path.read_text(encoding='utf-8')
types = types_path.read_text(encoding='utf-8')

# 1) Add a dedicated blocking modal. It has no dismiss/cancel action: the employee
# must explicitly acknowledge that the 30-minute break is starting.
modal_anchor = "const EditInventoryLogModal = ("
modal_code = r'''const MandatoryBreakModal = ({ alert, onAcknowledge, lang }: {
    alert: null | { reminderKey: string; thresholdHours: number; shiftStart: string; shiftEnd: string };
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
                            ? `你的班次达到 ${alert.thresholdHours} 小时休息规则。班次已过半，请现在开始 30 分钟休息。`
                            : `Your shift meets the ${alert.thresholdHours}-hour break rule. The shift is halfway through, so please start your 30-minute break now.`}
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

'''
if 'const MandatoryBreakModal = (' not in app:
    if modal_anchor not in app:
        raise SystemExit('Could not find modal insertion anchor')
    app = app.replace(modal_anchor, modal_code + modal_anchor, 1)

# 2) Add state for the blocking break modal inside StaffApp.
state_anchor = "    const [pendingSwapCount, setPendingSwapCount] = useState(0);\n"
state_code = r'''    const [mandatoryBreakAlert, setMandatoryBreakAlert] = useState<null | {
        reminderKey: string;
        thresholdHours: number;
        shiftStart: string;
        shiftEnd: string;
    }>(null);
    const breakPromptedRef = useRef(new Set<string>());
'''
if 'const [mandatoryBreakAlert, setMandatoryBreakAlert]' not in app:
    if state_anchor not in app:
        raise SystemExit('Could not find StaffApp state insertion anchor')
    app = app.replace(state_anchor, state_anchor + state_code, 1)

# 3) Replace the older group-broadcast implementation with a current-employee-only
# engine. Exact boundary values (4.5h / 5.5h) count as qualifying shifts.
start_marker = "    // 💡 核心升级：【分年龄段全员广播版】强制休息监控引擎 (4.5h / 5.5h 双轨制)"
end_marker = "    useEffect(() => {\n        if (!needsToSubmitPrep) return;"
new_break_engine = r'''    // 💡 强制休息监控：只提醒当前登录员工；<18 岁 >=4.5h，>=18 岁 >=5.5h。
    // 到班次中点后弹出不可随手关闭的强提醒，员工确认后本班次不再重复。
    useEffect(() => {
        if (!activeFeatures.schedule || !todaySchedule?.shifts?.length || !currentUser?.name) return;

        const liveUser = users.find((u: any) => u.id === currentUser.id) || currentUser;
        const isUnder18 = liveUser?.ageGroup === 'under_18';
        const thresholdHours = isUnder18 ? 4.5 : 5.5;
        const thresholdMinutes = thresholdHours * 60;
        const myName = currentUser.name.trim().toLowerCase();

        const checkMandatoryBreak = () => {
            const now = new Date();
            const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

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
                // 只在班次进行中、并且已经到达中点后触发；如果中点时 App 没开，稍后打开仍会补提醒。
                if (now < midpointTime || now > shiftEnd) continue;

                const reminderKey = `mandatory_break_${myStoreId}_${todayKey}_${currentUser.id}_${shift.start}_${shift.end}_${thresholdHours}`;
                if (localStorage.getItem(reminderKey)) continue;
                if (breakPromptedRef.current.has(reminderKey)) continue;

                breakPromptedRef.current.add(reminderKey);
                setMandatoryBreakAlert({
                    reminderKey,
                    thresholdHours,
                    shiftStart: shift.start,
                    shiftEnd: shift.end,
                });

                // 浏览器/手机系统通知作为第二层提醒；站内强弹窗不依赖通知权限。
                if ('Notification' in window && Notification.permission === 'granted') {
                    try {
                        new Notification('🛑 MANDATORY BREAK', {
                            body: lang === 'zh'
                                ? `你的班次 ${shift.start}-${shift.end} 已过半，请现在开始 30 分钟休息。`
                                : `Your ${shift.start}-${shift.end} shift is halfway through. Start your 30-minute break now.`,
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
    }, [todaySchedule, currentUser, myStoreId, activeFeatures.schedule, users, lang]);

    const acknowledgeMandatoryBreak = () => {
        if (!mandatoryBreakAlert) return;
        localStorage.setItem(mandatoryBreakAlert.reminderKey, new Date().toISOString());
        setMandatoryBreakAlert(null);
    };
    // ========================================================================
'''

if '【分年龄段全员广播版】强制休息监控引擎' in app:
    start = app.find(start_marker)
    end = app.find(end_marker, start)
    if start == -1 or end == -1:
        raise SystemExit('Could not locate old mandatory-break engine boundaries')
    app = app[:start] + new_break_engine + app[end:]
elif 'const acknowledgeMandatoryBreak = () =>' not in app:
    raise SystemExit('Mandatory-break engine marker not found and new engine not present')

# 4) Render the modal above the other StaffApp reminder modals.
render_anchor = "            <ActionReminderModal isOpen={isScheduleReminderOpen} title=\"排班确认提醒\""
render_code = r'''            <MandatoryBreakModal
                alert={mandatoryBreakAlert}
                onAcknowledge={acknowledgeMandatoryBreak}
                lang={lang}
            />
'''
if '<MandatoryBreakModal\n                alert={mandatoryBreakAlert}' not in app:
    if render_anchor not in app:
        raise SystemExit('Could not find StaffApp modal render anchor')
    app = app.replace(render_anchor, render_code + render_anchor, 1)

# 5) Make the age group part of the User type instead of relying on `any`.
user_anchor = "  pin?: string;\n"
if "ageGroup?: 'under_18' | '18_or_above';" not in types:
    if user_anchor not in types:
        raise SystemExit('Could not find User type insertion anchor')
    types = types.replace(user_anchor, user_anchor + "  ageGroup?: 'under_18' | '18_or_above';\n", 1)

app_path.write_text(app, encoding='utf-8')
types_path.write_text(types, encoding='utf-8')
print('Mandatory break reminder patch applied successfully.')
