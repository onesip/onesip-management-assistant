import type { Plugin } from 'vite';

/**
 * Shows the remaining 2026-08-21 Crystal Ball handling rule to Staff; the outdated Coconut Premix notice was withdrawn.
 *
 * Behaviour:
 * - Staff users see a full-screen, non-dismissible rules modal after login.
 * - The Crystal Ball acknowledgement checkbox must be ticked before confirm.
 * - Shown + acknowledged events are written to Cloud logs for manager review.
 * - A versioned per-user local acknowledgement prevents repeat prompts on the same device.
 *   Using a new RULES_VERSION in a future update will force the new rules again.
 */
export function staffRulesPopupPlugin(): Plugin {
  return {
    name: 'onesip-staff-rules-popup',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;

      let code = source;

      const modalAnchor = 'const EditInventoryLogModal = (';
      if (!code.includes(modalAnchor)) {
        throw new Error('[staff-rules] Modal insertion anchor not found');
      }

      const modalCode = `const STAFF_RULES_VERSION = 'staff_rules_2026_08_21_v1';

const MandatoryStaffRulesModal = ({
    isOpen,
    crystalChecked,
    onCrystalChange,
    onConfirm,
    isSaving,
    lang,
}: {
    isOpen: boolean;
    crystalChecked: boolean;
    onCrystalChange: (checked: boolean) => void;
    onConfirm: () => void;
    isSaving: boolean;
    lang: Lang;
}) => {
    if (!isOpen) return null;
    const canConfirm = crystalChecked && !isSaving;

    return (
        <div
            className="fixed inset-0 z-[13000] flex items-center justify-center bg-black/90 backdrop-blur-md p-3 sm:p-5 animate-fade-in"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="staff-rules-title"
        >
            <div className="w-full max-w-lg max-h-[94vh] overflow-hidden rounded-3xl border-2 border-red-500 bg-white shadow-[0_30px_100px_rgba(0,0,0,0.6)] flex flex-col">
                <div className="shrink-0 bg-red-600 px-5 py-4 text-white text-center">
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                        <Icon name="AlertTriangle" size={28} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-100">Latest Staff Rules</p>
                    <h2 id="staff-rules-title" className="mt-1 text-2xl font-black leading-tight">
                        {lang === 'zh' ? '最新员工规定 · 必须遵守' : 'Latest Staff Rules – MUST FOLLOW'}
                    </h2>
                    <p className="mt-1 text-xs font-bold text-red-100">
                        {lang === 'zh' ? '请阅读并确认这项规定。此确认会被记录。' : 'Read the rule and confirm your understanding. Your acknowledgement is recorded.'}
                    </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                    <section className="rounded-2xl border-2 border-sky-300 bg-sky-50 p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-black text-white">2</span>
                            <h3 className="text-lg font-black text-sky-900">Crystal Ball</h3>
                        </div>
                        {lang === 'zh' ? (
                            <ul className="space-y-2 text-sm font-semibold leading-relaxed text-gray-800">
                                <li>• 放进小料盒之前，<strong className="text-red-600">必须先用冷水快速冲洗</strong>。</li>
                                <li>• 使用<strong>珍珠大漏盆 + 珍珠勺</strong>，把外层糖浆稍微冲掉。</li>
                                <li>• 沥干后再放入小料盒。</li>
                                <li>• <strong className="text-red-600">这一步不能省略</strong>，否则 Crystal Ball 会太甜。</li>
                            </ul>
                        ) : (
                            <ul className="space-y-2 text-sm font-semibold leading-relaxed text-gray-800">
                                <li>• Before putting Crystal Ball into the topping container, <strong className="text-red-600">rinse it briefly with cold water first</strong>.</li>
                                <li>• Use the <strong>large pearl strainer and pearl spoon</strong> to rinse off the syrup coating.</li>
                                <li>• Drain it well, then transfer it into the topping container.</li>
                                <li>• <strong className="text-red-600">Do not skip this step</strong>, otherwise the Crystal Ball will be too sweet.</li>
                            </ul>
                        )}
                    </section>

                    <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-white p-3 transition active:scale-[0.99]">
                            <input
                                type="checkbox"
                                checked={crystalChecked}
                                onChange={(e) => onCrystalChange(e.target.checked)}
                                className="mt-0.5 h-5 w-5 shrink-0 accent-red-600"
                            />
                            <span className="text-sm font-black leading-snug text-gray-900">
                                {lang === 'zh'
                                    ? '我已理解：Crystal Ball 放入小料盒前必须用冷水冲洗并沥干，不能省略。'
                                    : 'I understand: Crystal Ball must be rinsed with cold water and drained before going into the topping container.'}
                            </span>
                        </label>
                    </div>
                </div>

                <div className="shrink-0 border-t border-gray-200 bg-white p-4">
                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={onConfirm}
                        className={\`w-full rounded-2xl py-4 text-sm sm:text-base font-black tracking-wide transition-all \${canConfirm
                            ? 'bg-red-600 text-white shadow-lg shadow-red-200 hover:bg-red-700 active:scale-[0.98]'
                            : 'cursor-not-allowed bg-gray-200 text-gray-400'}\`}
                    >
                        {isSaving
                            ? (lang === 'zh' ? '正在记录确认…' : 'Recording acknowledgement…')
                            : (lang === 'zh' ? '我已阅读、理解并会遵守以上规定' : 'I HAVE READ, UNDERSTAND & WILL FOLLOW')}
                    </button>
                    {!crystalChecked ? (
                        <p className="mt-2 text-center text-[11px] font-bold text-red-500">
                            {lang === 'zh' ? '请勾选确认后继续使用系统。' : 'Please confirm this rule before continuing.'}
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

`;
      code = code.replace(modalAnchor, modalCode + modalAnchor);

      const stateAnchor = '    const [pendingSwapCount, setPendingSwapCount] = useState(0);\n';
      if (!code.includes(stateAnchor)) {
        throw new Error('[staff-rules] Staff state anchor not found');
      }

      const stateCode = `    const [showMandatoryStaffRules, setShowMandatoryStaffRules] = useState(false);
    const [staffRulesCrystalChecked, setStaffRulesCrystalChecked] = useState(false);
    const [staffRulesSaving, setStaffRulesSaving] = useState(false);
    const staffRulesShownRef = useRef(false);

    useEffect(() => {
        if (!currentUser?.id || currentUser.role !== 'staff') {
            setShowMandatoryStaffRules(false);
            return;
        }

        const ackKey = STAFF_RULES_VERSION + '_ack_' + currentUser.id;
        let alreadyAcknowledged = false;
        try {
            alreadyAcknowledged = Boolean(localStorage.getItem(ackKey));
        } catch (e) {
            console.warn('Staff rules local acknowledgement unavailable', e);
        }

        if (alreadyAcknowledged) {
            setShowMandatoryStaffRules(false);
            return;
        }

        setStaffRulesCrystalChecked(false);
        setShowMandatoryStaffRules(true);

        const shownKey = STAFF_RULES_VERSION + '_shown_' + currentUser.id;
        let shownLocally = false;
        try {
            shownLocally = Boolean(localStorage.getItem(shownKey));
        } catch (e) {
            console.warn('Staff rules shown-state unavailable', e);
        }

        if (!shownLocally && !staffRulesShownRef.current) {
            staffRulesShownRef.current = true;
            const shownAt = new Date().toISOString();
            const shownLog: any = {
                id: Date.now(),
                type: 'STAFF_RULES_SHOWN',
                shift: 'staff-rules',
                time: shownAt,
                name: currentUser.name,
                userId: currentUser.id,
                storeId: myStoreId,
                rulesVersion: STAFF_RULES_VERSION,
                event: 'rules_popup_shown',
                status: 'shown_not_yet_acknowledged',
                reason: 'Mandatory Crystal Ball handling rule shown',
                message: 'Mandatory staff rules popup shown to ' + currentUser.name + '.'
            };
            try {
                Promise.resolve((Cloud as any).saveLog?.(shownLog))
                    .then(() => {
                        try { localStorage.setItem(shownKey, shownAt); } catch (e) { /* noop */ }
                    })
                    .catch((e: any) => {
                        staffRulesShownRef.current = false;
                        console.error('Staff rules shown log failed', e);
                    });
            } catch (e) {
                staffRulesShownRef.current = false;
                console.error('Staff rules shown log failed', e);
            }
        }
    }, [currentUser?.id, currentUser?.role, currentUser?.name, myStoreId]);

    const acknowledgeMandatoryStaffRules = async () => {
        if (!currentUser?.id || currentUser.role !== 'staff') return;
        if (!staffRulesCrystalChecked || staffRulesSaving) return;

        setStaffRulesSaving(true);
        const acknowledgedAt = new Date().toISOString();
        const ackKey = STAFF_RULES_VERSION + '_ack_' + currentUser.id;
        const ackLog: any = {
            id: Date.now(),
            type: 'STAFF_RULES_ACK',
            shift: 'staff-rules',
            time: acknowledgedAt,
            name: currentUser.name,
            userId: currentUser.id,
            storeId: myStoreId,
            rulesVersion: STAFF_RULES_VERSION,
            crystalBallConfirmed: true,
            event: 'rules_acknowledged',
            status: 'acknowledged',
            acknowledgedAt,
            reason: 'Employee explicitly confirmed the Crystal Ball handling rule',
            message: 'Employee acknowledged the Crystal Ball rinse rule.'
        };

        try {
            await Promise.resolve((Cloud as any).saveLog?.(ackLog));
        } catch (e) {
            // Do not permanently block store operations if connectivity is temporarily unavailable.
            console.error('Staff rules acknowledgement cloud log failed', e);
        }

        try {
            localStorage.setItem(ackKey, acknowledgedAt);
        } catch (e) {
            console.warn('Staff rules local acknowledgement save failed', e);
        }

        setShowMandatoryStaffRules(false);
        setStaffRulesSaving(false);
    };
`;
      code = code.replace(stateAnchor, stateAnchor + stateCode);

      const renderAnchor = '            <ActionReminderModal isOpen={isScheduleReminderOpen} title="排班确认提醒"';
      if (!code.includes(renderAnchor)) {
        throw new Error('[staff-rules] Staff modal render anchor not found');
      }

      const renderCode = `            <MandatoryStaffRulesModal
                isOpen={showMandatoryStaffRules}
                crystalChecked={staffRulesCrystalChecked}
                onCrystalChange={setStaffRulesCrystalChecked}
                onConfirm={acknowledgeMandatoryStaffRules}
                isSaving={staffRulesSaving}
                lang={lang}
            />
`;
      code = code.replace(renderAnchor, renderCode + renderAnchor);

      return { code, map: null };
    },
  };
}
