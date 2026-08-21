import type { Plugin } from 'vite';

/**
 * Forces staff to read and acknowledge the responsibility for their own
 * Friday/Saturday/Sunday shift, then keeps it available for review all day.
 */
export function weekendShiftResponsibilityPlugin(): Plugin {
  return {
    name: 'onesip-weekend-shift-responsibility',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;

      let code = source;
      const modalAnchor = 'const EditInventoryLogModal = (';
      if (!code.includes(modalAnchor)) throw new Error('[weekend-responsibility] modal anchor missing');

      const modalCode = `type WeekendResponsibilityTemplate = {
    key: string;
    day: number;
    labelZh: string;
    labelEn: string;
    roleZh: string;
    roleEn: string;
    mainZh: string;
    mainEn: string;
    tasksZh: string[];
    tasksEn: string[];
    standardsZh: string[];
    standardsEn: string[];
    escalateZh: string[];
    escalateEn: string[];
};

const WEEKEND_RESPONSIBILITY_VERSION = 'weekend_shift_responsibility_2026_08_21_v1';

const WEEKEND_RESPONSIBILITY_TEMPLATES: Record<string, WeekendResponsibilityTemplate> = {
    fri_opening: {
        key: 'fri_opening', day: 5, labelZh: '周五早班', labelEn: 'Fri Opening',
        roleZh: '补料责任人', roleEn: 'Prep owner',
        mainZh: '按 FRI 14:00 目标补齐周六需要的物料',
        mainEn: 'Prepare the items needed for Saturday according to the FRI 14:00 target.',
        tasksZh: ['11:30–14:00 正常出品，同时边出茶边按目标补料。','14:00 后中班到岗，早班转为专注补料，不再主要负责出品。','16:00 前完成 FRI 14:00 目标中的所有物料。','在管理小程序提交实际完成数量。','补回自己使用过的原料到指定储藏位置。'],
        tasksEn: ['11:30–14:00: make drinks and prep according to the target list at the same time.','After 14:00, once support arrives, focus on prep instead of drink production.','Finish all FRI 14:00 target items before 16:00.','Submit the actual completed quantities in the management app.','Refill and return all ingredients you used to their assigned storage places.'],
        standardsZh: ['所有目标物料已制作、贴标签、放到指定位置。','实际数量已提交，不能估计、不能虚报。','使用过的容器清洗干净并放回原位。'],
        standardsEn: ['All target items are made, labelled, and stored in the correct place.','Actual quantities are submitted. Do not guess or over-report.','Used containers are washed and returned to the right place.'],
        escalateZh: ['无法完成时，下班前告诉店长：缺什么、差多少。','发现缺料先补充，再在小程序备注。'],
        escalateEn: ['If you cannot finish, tell the manager before leaving what is missing and how much.','If stock is low, refill first, then add a note in the app.']
    },
    fri_support: {
        key: 'fri_support', day: 5, labelZh: '周五中班', labelEn: 'Fri Support',
        roleZh: '出杯支援 / 货架上架责任人', roleEn: 'Drink support / Shelf restock owner',
        mainZh: '支援出杯，给晚班留出盘货和查漏补缺时间',
        mainEn: 'Support drink production so the closing shift has time to count and refill.',
        tasksZh: ['到岗后立即进入出杯岗位，配合门店正常出品。','16:00–18:00 以出杯为主，减少晚班被订单打断。','18:00 后保持出茶吧台、工作台和客区干净整洁。','19:00 后清洁小料台，保持小料充足，塑料小料盒盖子放入洗碗机。','不忙时与晚班沟通，整理并上架楼下货架物品。'],
        tasksEn: ['Start drink production immediately after arrival and support normal service.','16:00–18:00: focus on drinks and reduce interruptions for the closing shift.','After 18:00, keep the tea station, worktop and customer area clean.','After 19:00, clean the topping station, keep toppings full, and put plastic lids into the dishwasher.','When it is quiet, align with the closing shift and restock the downstairs shelves.'],
        standardsZh: ['中班期间出杯稳定，不让订单卡住。','货架按指定位置分类摆放、整齐、方便晚班取用。','空箱、包装和杂物集中整理，不留乱堆。'],
        standardsEn: ['Drink production stays stable and orders do not get stuck.','Shelves are restocked by category, tidy, and easy for the closing shift to use.','Empty boxes, packaging and waste are collected and not left around.'],
        escalateZh: ['客流一直很忙时，优先出杯；未完成上架需告知店长/晚班负责人。','缺货、找不到货、货架位置不清楚时，不乱放，及时询问。'],
        escalateEn: ['If it stays busy, prioritize drinks; report unfinished shelf work to the manager or closing lead.','If stock is missing or the location is unclear, do not place it randomly; ask first.']
    },
    fri_closing: {
        key: 'fri_closing', day: 5, labelZh: '周五晚班', labelEn: 'Fri Closing',
        roleZh: '盘货责任人', roleEn: 'Inventory count owner',
        mainZh: '盘点库存，确保周六开局顺利', mainEn: 'Count stock and make sure Saturday can start smoothly.',
        tasksZh: ['检查周五早班是否完成 FRI 14:00 目标。','对比管理小程序“周五目标”和实际剩余量。','盘点所有物料，先看到多少，再补足差额。','检查牛奶、燕麦奶、罐头、气泡水、小料和包装材料。','检查小料盒是否补满，重点看芒果、荔枝、茶冻。','正常完成晚班打烊清洁。'],
        tasksEn: ['Check whether the opening shift finished the FRI 14:00 targets.','Compare Friday targets in the app with actual remaining stock.','Count all items; check what is left first, then refill the gap.','Check milk, oat milk, canned items, sparkling water, toppings and packaging.','Check topping boxes, especially mango, lychee and tea jelly.','Complete the normal closing cleaning tasks.'],
        standardsZh: ['周六所有目标物料到位，基础原料充足。','补完料放入固定位置，并拍照发群里通知周六早班。','管理小程序已提交实际剩余量和 waste 数量。'],
        standardsEn: ['All Saturday target items are ready and basic ingredients are enough.','After refilling, store items in fixed places and send photos to the group for Saturday opening.','Actual remaining stock and waste quantities are submitted in the app.'],
        escalateZh: ['发现大量缺料必须当晚补齐，并立即汇报店长。','不能无脑补料：先盘点，再补差额。'],
        escalateEn: ['Large shortages must be refilled the same night and reported to the manager immediately.','Do not refill blindly: count first, then refill only the gap.']
    },
    sat_opening: {
        key: 'sat_opening', day: 6, labelZh: '周六早班', labelEn: 'Sat Opening',
        roleZh: '补料责任人', roleEn: 'Prep owner', mainZh: '补充浮动性大的物料，准备周六高峰', mainEn: 'Refill variable items and prepare for the Saturday peak.',
        tasksZh: ['检查周五准备的物料是否可用：新鲜度、效期、标签。','将物料倒入茶桶和料盒，确保可直接出品。','补齐前场和抽屉原料。','确认牛奶、罐头、气泡水和小料都可直接使用。','在管理小程序提交实际完成数量。','13:30 前确保奶精至少 3 个满 container；低于 2 个要补。','13:30 前确保 coconut 有 6L；低于 6L 要补。'],
        tasksEn: ['Check Friday prep: freshness, expiry time, and labels.','Move items into tea buckets and topping boxes so they are ready for service.','Refill front counter and drawer ingredients.','Make sure milk, canned items, sparkling water and toppings are ready to use.','Submit actual completed quantities in the management app.','Before 13:30, make sure there are 3 full creamer containers; refill if below 2.','Before 13:30, make sure coconut is at 6L; refill if below 6L.'],
        standardsZh: ['知道周五配料在哪里，并确认可以使用。','SAT 14:00 目标已完成并提交。','离开前补齐罐头、粉、吸管、杯子、袋子等常用物料。'],
        standardsEn: ['You know where Friday prep is and confirm it is usable.','SAT 14:00 targets are completed and submitted.','Before leaving, refill canned items, powders, straws, cups, bags and other daily-use items.'],
        escalateZh: ['开门前未完成时，第二人到岗后继续完成，不得影响高峰出品。','发现大量缺料必须立即汇报店长；否则缺料会算入本班责任。'],
        escalateEn: ['If not finished before opening, the second staff member continues it without affecting peak service.','Report major shortages immediately; otherwise shortages become this shift’s responsibility.']
    },
    sat_peak: {
        key: 'sat_peak', day: 6, labelZh: '周六高峰班', labelEn: 'Sat Peak',
        roleZh: '出品责任人', roleEn: 'Drink production owner', mainZh: '只做两件事：出品 + 补充已经备好的物料', mainEn: 'Only two priorities: make drinks and refill ready-made stock.',
        tasksZh: ['专注出品、封口、出杯。','茶桶或料盒快空时，只补充已经准备好的同种物料。','保持工作台、封口区和出杯区域整洁。','发现缺料要记录缺什么、什么时候缺。'],
        tasksEn: ['Focus on making, sealing and handing out drinks.','When buckets or boxes are nearly empty, refill only with the same ready-made item.','Keep the worktop, sealing area and drink handoff area clean.','If something runs out, record what is missing and when it happened.'],
        standardsZh: ['高峰期不因物料不足停止出品。','不做复杂备料，不离岗做其他事情。','所有缺料情况已在管理小程序记录。'],
        standardsEn: ['Service does not stop during peak because of missing stock.','Do not make complex prep and do not leave the station for other tasks.','All shortage cases are recorded in the management app.'],
        escalateZh: ['缺料记录会直接影响下周目标调整，必须真实填写。','客流很大时，先保证出杯，再补记录。'],
        escalateEn: ['Shortage records directly affect next week’s targets, so they must be accurate.','When it is very busy, keep drinks moving first, then complete the record.']
    },
    sat_closing: {
        key: 'sat_closing', day: 6, labelZh: '周六晚班', labelEn: 'Sat Closing',
        roleZh: '盘货责任人', roleEn: 'Inventory count owner', mainZh: '盘点库存，为周日开局做准备', mainEn: 'Count stock and prepare for Sunday opening.',
        tasksZh: ['高峰后整理、检查、补充。','盘点现有库存，对比管理小程序目标量。','先看剩多少，再补足差额，不能无脑补料。','执行先进先出：新物料放后面，旧物料放前面。','Jasmine 物料区低于 2 个 4L 茶桶时，立刻补充。','奶精低于 1 个 container，补 5L 新奶精。','Coconut 低于 1 个 container，补 3L coconut。'],
        tasksEn: ['After peak, tidy, check and refill.','Count current stock and compare with app targets.','Check remaining stock first, then refill the gap; do not refill blindly.','Use FIFO: put new stock behind old stock.','If jasmine stock is below two 4L tea buckets, refill immediately.','If creamer is below 1 container, make 5L new creamer.','If coconut is below 1 container, make 3L coconut.'],
        standardsZh: ['周日可以正常开局。','先进先出执行到位，旧料不被新料挡住。','盘货完成后拍照发群里，特别提醒周日早班。'],
        standardsEn: ['Sunday can start normally.','FIFO is done correctly; old stock is not hidden behind new stock.','After stock count, send photos to the group, especially for Sunday opening.'],
        escalateZh: ['管理小程序提交实际剩余量和 waste 数量。','发现异常或大量缺料，立即汇报店长。'],
        escalateEn: ['Submit actual remaining stock and waste quantities in the management app.','Report unusual issues or major shortages to the manager immediately.']
    },
    sun_opening: {
        key: 'sun_opening', day: 0, labelZh: '周日早班', labelEn: 'Sun Opening',
        roleZh: '整理责任人', roleEn: 'FIFO organization owner', mainZh: '整理周六备料，避免旧料被新料遮住造成过期损耗', mainEn: 'Organize Saturday prep to prevent old stock from being hidden and wasted.',
        tasksZh: ['检查周六准备物料是否可用：新鲜度、效期、标签。','将物料倒入茶桶和料盒，确保可直接出品。','严格先进先出：前旧后新，先用旧料。','补齐前场和抽屉原料。','确认牛奶、罐头、气泡水和小料可直接使用。'],
        tasksEn: ['Check Saturday prep: freshness, expiry time, and labels.','Move items into tea buckets and topping boxes for direct service.','Strict FIFO: old stock in front, new stock behind, use old stock first.','Refill front counter and drawer ingredients.','Make sure milk, canned items, sparkling water and toppings are ready to use.'],
        standardsZh: ['知道周六配料在哪里，并整理成前旧后新。','离开前补齐罐头、粉、吸管、杯子、袋子等常用物料。','尽量降低过期和浪费。'],
        standardsEn: ['You know where Saturday prep is and organize it old-in-front, new-behind.','Before leaving, refill canned items, powders, straws, cups, bags and other daily-use items.','Reduce expiry waste as much as possible.'],
        escalateZh: ['发现过期或快过期物料，先按规则处理并反馈。','发现周六备料位置混乱，拍照并告知负责人。'],
        escalateEn: ['If items are expired or near expiry, handle them according to rules and report it.','If Saturday prep is disorganized, take photos and inform the person in charge.']
    },
    sun_closing: {
        key: 'sun_closing', day: 0, labelZh: '周日晚班', labelEn: 'Sun Closing',
        roleZh: '盘货责任人', roleEn: 'Inventory count owner', mainZh: '盘点库存，清点损耗，准备周一', mainEn: 'Count stock, record waste, and prepare for Monday.',
        tasksZh: ['高峰后整理、检查、补充。','盘点现有库存，对比管理小程序目标量。','重点关注 osmanthus tea、black tea 和 foams；清点现存与损耗。','执行先进先出：新物料放后面，旧物料放前面。','所有小料盒的盖子都放进洗碗机。'],
        tasksEn: ['After peak, tidy, check and refill.','Count current stock and compare with app targets.','Pay special attention to osmanthus tea, black tea and foams; count remaining stock and waste.','Use FIFO: new stock behind, old stock in front.','Put all topping box lids into the dishwasher.'],
        standardsZh: ['周一可以正常开局。','先进先出执行到位。','管理小程序已提交盘点和损耗数据。'],
        standardsEn: ['Monday can start normally.','FIFO is completed correctly.','Inventory count and waste data are submitted in the app.'],
        escalateZh: ['周日数据直接影响下周备料目标，必须准确。','发现大量 waste 或异常损耗，必须备注原因并反馈店长。'],
        escalateEn: ['Sunday data directly affects next week’s prep targets, so it must be accurate.','If there is major waste or unusual loss, add the reason in notes and tell the manager.']
    }
};

const resolveWeekendResponsibility = (date: Date, shift: any): WeekendResponsibilityTemplate | null => {
    const day = date.getDay();
    if (![5, 6, 0].includes(day) || !shift?.start) return null;
    const parts = String(shift.start).split(':').map(Number);
    if (parts.length < 2 || parts.some(Number.isNaN)) return null;
    const start = parts[0] * 60 + parts[1];
    const endParts = String(shift.end || '').split(':').map(Number);
    const end = endParts.length >= 2 && !endParts.some(Number.isNaN) ? endParts[0] * 60 + endParts[1] : start;

    if (day === 5) {
        if (start < 13 * 60 + 30) return WEEKEND_RESPONSIBILITY_TEMPLATES.fri_opening;
        if (start >= 15 * 60 + 30 && start < 16 * 60 + 30 && end <= 18 * 60 + 30) return WEEKEND_RESPONSIBILITY_TEMPLATES.fri_support;
        return WEEKEND_RESPONSIBILITY_TEMPLATES.fri_closing;
    }
    if (day === 6) {
        if (start < 12 * 60) return WEEKEND_RESPONSIBILITY_TEMPLATES.sat_opening;
        if (start < 15 * 60 + 30) return WEEKEND_RESPONSIBILITY_TEMPLATES.sat_peak;
        return WEEKEND_RESPONSIBILITY_TEMPLATES.sat_closing;
    }
    if (day === 0) {
        if (start < 14 * 60) return WEEKEND_RESPONSIBILITY_TEMPLATES.sun_opening;
        return WEEKEND_RESPONSIBILITY_TEMPLATES.sun_closing;
    }
    return null;
};

const WeekendShiftResponsibilityModal = ({ isOpen, template, shift, dateLabel, checked, onCheckedChange, onConfirm, onCloseReview, forceConfirm, saving, lang }: {
    isOpen: boolean; template: WeekendResponsibilityTemplate | null; shift: any; dateLabel: string; checked: boolean;
    onCheckedChange: (v: boolean) => void; onConfirm: () => void; onCloseReview: () => void; forceConfirm: boolean; saving: boolean; lang: Lang;
}) => {
    if (!isOpen || !template) return null;
    const tasks = lang === 'zh' ? template.tasksZh : template.tasksEn;
    const standards = lang === 'zh' ? template.standardsZh : template.standardsEn;
    const escalate = lang === 'zh' ? template.escalateZh : template.escalateEn;
    const canConfirm = checked && !saving;
    const renderSection = (titleZh: string, titleEn: string, items: string[]) => (
        <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
            <h4 className="mb-2 text-sm font-black text-emerald-900">{lang === 'zh' ? titleZh : titleEn}</h4>
            <ol className="space-y-2">{items.map((item, idx) => (
                <li key={idx} className="flex gap-2 text-sm font-semibold leading-relaxed text-gray-800">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-black text-white">{idx + 1}</span><span>{item}</span>
                </li>
            ))}</ol>
        </section>
    );
    return (
        <div className="fixed inset-0 z-[12500] flex items-center justify-center bg-black/90 backdrop-blur-md p-3 sm:p-5" role="alertdialog" aria-modal="true">
            <div className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border-2 border-emerald-600 bg-emerald-50 shadow-[0_30px_100px_rgba(0,0,0,0.6)]">
                <div className="shrink-0 bg-emerald-800 px-5 py-4 text-white">
                    <div className="flex items-start justify-between gap-3"><div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">ONESIP Shift Responsibility</p>
                        <h2 className="mt-1 text-2xl font-black">{lang === 'zh' ? template.labelZh : template.labelEn}</h2>
                        <p className="mt-1 text-xs font-bold text-emerald-100">{dateLabel} · {shift?.start || ''}–{shift?.end || ''}</p>
                    </div>{!forceConfirm && <button type="button" onClick={onCloseReview} className="rounded-xl bg-white/15 px-3 py-2 text-xs font-black">{lang === 'zh' ? '关闭' : 'Close'}</button>}</div>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">{lang === 'zh' ? '身份 / Role' : 'Role'}</p><p className="mt-1 text-base font-black text-gray-900">{lang === 'zh' ? template.roleZh : template.roleEn}</p></div>
                        <div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">{lang === 'zh' ? '核心责任 / Main job' : 'Main job'}</p><p className="mt-1 text-sm font-black leading-relaxed text-gray-900">{lang === 'zh' ? template.mainZh : template.mainEn}</p></div>
                    </div>
                    {renderSection('具体要做', 'What to do', tasks)}
                    {renderSection('做到什么标准', 'Pass standard', standards)}
                    {renderSection('记录与异常', 'Record & escalate', escalate)}
                    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><p className="text-xs font-black text-amber-900">{lang === 'zh' ? '共同原则' : 'Shared rules'}</p><div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] font-black text-amber-950"><div className="rounded-lg bg-white p-2">{lang === 'zh' ? '先补再记' : 'Refill first, record after'}</div><div className="rounded-lg bg-white p-2">FIFO</div><div className="rounded-lg bg-white p-2">{lang === 'zh' ? '不提交 = 没做' : 'No record = not done'}</div></div></div>
                    {forceConfirm && <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-emerald-300 bg-white p-4"><input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} className="mt-0.5 h-5 w-5 accent-emerald-700"/><span className="text-sm font-black leading-relaxed text-gray-900">{lang === 'zh' ? '我已完整阅读并理解本班责任。我会按以上标准执行；无法完成或发现异常时会及时记录并反馈。' : 'I have read and understood my responsibilities for this shift. I will follow them and record/escalate anything I cannot complete.'}</span></label>}
                </div>
                {forceConfirm && <div className="shrink-0 border-t border-emerald-200 bg-white p-4"><button type="button" disabled={!canConfirm} onClick={onConfirm} className={canConfirm ? 'w-full rounded-2xl bg-emerald-700 py-4 text-base font-black text-white shadow-lg' : 'w-full cursor-not-allowed rounded-2xl bg-gray-200 py-4 text-base font-black text-gray-400'}>{saving ? (lang === 'zh' ? '正在记录确认…' : 'Recording…') : (lang === 'zh' ? '确认：我知道并会履行本班责任' : 'CONFIRM MY SHIFT RESPONSIBILITY')}</button>{!checked && <p className="mt-2 text-center text-[11px] font-bold text-red-500">{lang === 'zh' ? '必须勾选确认后才能继续使用系统。' : 'You must acknowledge this responsibility before continuing.'}</p>}</div>}
            </div>
        </div>
    );
};

`;
      code = code.replace(modalAnchor, modalCode + modalAnchor);

      const stateAnchor = '    const [pendingSwapCount, setPendingSwapCount] = useState(0);\n';
      if (!code.includes(stateAnchor)) throw new Error('[weekend-responsibility] state anchor missing');
      const stateCode = `    const [weekendResponsibilityTemplate, setWeekendResponsibilityTemplate] = useState<WeekendResponsibilityTemplate | null>(null);
    const [weekendResponsibilityShift, setWeekendResponsibilityShift] = useState<any>(null);
    const [weekendResponsibilityDateLabel, setWeekendResponsibilityDateLabel] = useState('');
    const [weekendResponsibilityOpen, setWeekendResponsibilityOpen] = useState(false);
    const [weekendResponsibilityForceConfirm, setWeekendResponsibilityForceConfirm] = useState(false);
    const [weekendResponsibilityChecked, setWeekendResponsibilityChecked] = useState(false);
    const [weekendResponsibilitySaving, setWeekendResponsibilitySaving] = useState(false);
    const weekendResponsibilityShownRef = useRef(new Set<string>());
`;
      code = code.replace(stateAnchor, stateAnchor + stateCode);

      const todayAnchor = '    const hasShiftToday = myShiftsToday.length > 0;\n';
      if (!code.includes(todayAnchor)) throw new Error('[weekend-responsibility] today anchor missing');
      const logicCode = `
    const getWeekendResponsibilityContext = () => {
        if (!currentUser?.id || currentUser.role !== 'staff' || !todaySchedule?.shifts?.length) return null;
        const now = new Date();
        const myName = currentUser.name.trim().toLowerCase();
        const candidates = (todaySchedule.shifts || []).filter((shift: any) => Array.isArray(shift.staff) && shift.staff.some((name: string) => name?.trim().toLowerCase() === myName)).map((shift: any) => ({ shift, template: resolveWeekendResponsibility(now, shift) })).filter((x: any) => x.template);
        if (!candidates.length) return null;
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        return candidates.map((item: any) => {
            const p = String(item.shift.start || '00:00').split(':').map(Number); const start = p[0] * 60 + p[1];
            const ep = String(item.shift.end || item.shift.start || '00:00').split(':').map(Number); let end = ep[0] * 60 + ep[1]; if (end < start) end += 1440;
            let score = Math.abs(start - nowMinutes); if (nowMinutes >= start - 90 && nowMinutes <= end) score -= 10000;
            return { ...item, start, end, score };
        }).sort((a: any, b: any) => a.score - b.score)[0];
    };

    const todayWeekendResponsibilityContext = getWeekendResponsibilityContext();

    const openWeekendResponsibilityReview = () => {
        const context = getWeekendResponsibilityContext(); if (!context) return;
        const now = new Date();
        setWeekendResponsibilityTemplate(context.template); setWeekendResponsibilityShift(context.shift);
        setWeekendResponsibilityDateLabel(now.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' }));
        setWeekendResponsibilityChecked(true); setWeekendResponsibilityForceConfirm(false); setWeekendResponsibilityOpen(true);
    };

    useEffect(() => {
        if (!currentUser?.id || currentUser.role !== 'staff') return;
        const checkResponsibility = () => {
            const context = getWeekendResponsibilityContext(); if (!context) return;
            const now = new Date(); const nowMinutes = now.getHours() * 60 + now.getMinutes();
            if (nowMinutes < context.start - 90 || nowMinutes > context.end) return;
            const dateKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
            const shiftIdentity = context.shift.id || [context.shift.start, context.shift.end].join('-');
            const ackKey = [WEEKEND_RESPONSIBILITY_VERSION, 'ack', myStoreId, dateKey, currentUser.id, shiftIdentity, context.template.key].join('_');
            try { if (localStorage.getItem(ackKey)) return; } catch (e) {}
            setWeekendResponsibilityTemplate(context.template); setWeekendResponsibilityShift(context.shift);
            setWeekendResponsibilityDateLabel(now.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' }));
            setWeekendResponsibilityChecked(false); setWeekendResponsibilityForceConfirm(true); setWeekendResponsibilityOpen(true);
            if (!weekendResponsibilityShownRef.current.has(ackKey)) {
                weekendResponsibilityShownRef.current.add(ackKey);
                const shownAt = now.toISOString();
                const shownLog: any = { id: Date.now(), type: 'SHIFT_RESPONSIBILITY_SHOWN', shift: 'shift-responsibility', time: shownAt, name: currentUser.name, userId: currentUser.id, storeId: myStoreId, responsibilityVersion: WEEKEND_RESPONSIBILITY_VERSION, responsibilityKey: context.template.key, responsibilityLabel: context.template.labelEn, scheduleDate: dateKey, shiftStart: context.shift.start, shiftEnd: context.shift.end, event: 'shift_responsibility_shown', status: 'shown_not_yet_acknowledged', reason: 'Mandatory shift responsibility shown' };
                try { Promise.resolve((Cloud as any).saveLog?.(shownLog)).catch((e: any) => { weekendResponsibilityShownRef.current.delete(ackKey); console.error('Responsibility shown log failed', e); }); } catch (e) { weekendResponsibilityShownRef.current.delete(ackKey); }
                if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(lang === 'zh' ? '本班责任需要确认' : 'Shift responsibility', { body: (lang === 'zh' ? context.template.labelZh : context.template.labelEn) + ' · ' + context.shift.start + '-' + context.shift.end } as any); } catch (e) {} }
            }
        };
        checkResponsibility(); const timer = window.setInterval(checkResponsibility, 60000); return () => window.clearInterval(timer);
    }, [currentUser?.id, currentUser?.role, currentUser?.name, todaySchedule, myStoreId, lang]);

    const acknowledgeWeekendResponsibility = async () => {
        if (!currentUser?.id || !weekendResponsibilityTemplate || !weekendResponsibilityShift || !weekendResponsibilityChecked || weekendResponsibilitySaving) return;
        const now = new Date(); const dateKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
        const shiftIdentity = weekendResponsibilityShift.id || [weekendResponsibilityShift.start, weekendResponsibilityShift.end].join('-');
        const ackKey = [WEEKEND_RESPONSIBILITY_VERSION, 'ack', myStoreId, dateKey, currentUser.id, shiftIdentity, weekendResponsibilityTemplate.key].join('_');
        const acknowledgedAt = now.toISOString(); setWeekendResponsibilitySaving(true);
        const ackLog: any = { id: Date.now(), type: 'SHIFT_RESPONSIBILITY_ACK', shift: 'shift-responsibility', time: acknowledgedAt, name: currentUser.name, userId: currentUser.id, storeId: myStoreId, responsibilityVersion: WEEKEND_RESPONSIBILITY_VERSION, responsibilityKey: weekendResponsibilityTemplate.key, responsibilityLabel: weekendResponsibilityTemplate.labelEn, scheduleDate: dateKey, shiftStart: weekendResponsibilityShift.start, shiftEnd: weekendResponsibilityShift.end, event: 'shift_responsibility_acknowledged', status: 'acknowledged', acknowledgedAt, reason: 'Employee explicitly confirmed shift responsibility' };
        try { await Promise.resolve((Cloud as any).saveLog?.(ackLog)); } catch (e) { console.error('Responsibility acknowledgement log failed', e); }
        try { localStorage.setItem(ackKey, acknowledgedAt); } catch (e) {}
        setWeekendResponsibilityForceConfirm(false); setWeekendResponsibilityOpen(false); setWeekendResponsibilitySaving(false);
    };
`;
      code = code.replace(todayAnchor, todayAnchor + logicCode);

      const nextShiftCardAnchor = `            {activeFeatures.schedule && (
                <div className="bg-surface p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
                    <p className="text-xs text-text-light font-bold uppercase mb-2">{t.next_shift}</p>`;
      if (!code.includes(nextShiftCardAnchor)) throw new Error('[weekend-responsibility] home card anchor missing');
      const responsibilityCard = `            {todayWeekendResponsibilityContext && (
                <button type="button" onClick={openWeekendResponsibilityReview} className="w-full rounded-2xl border-2 border-emerald-300 bg-gradient-to-r from-emerald-50 to-white p-4 text-left shadow-sm mb-4 active:scale-[0.99]">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">{lang === 'zh' ? '今天我的责任' : 'My Shift Responsibility'}</p><p className="mt-1 text-lg font-black text-emerald-950">{lang === 'zh' ? todayWeekendResponsibilityContext.template.labelZh : todayWeekendResponsibilityContext.template.labelEn}</p><p className="mt-1 text-xs font-bold text-emerald-700">{todayWeekendResponsibilityContext.shift.start}–{todayWeekendResponsibilityContext.shift.end} · {lang === 'zh' ? '随时点这里重新查看' : 'Tap anytime to review'}</p></div><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white"><Icon name="ClipboardList" size={22}/></div></div>
                </button>
            )}

`;
      code = code.replace(nextShiftCardAnchor, responsibilityCard + nextShiftCardAnchor);

      const renderAnchor = '            <MandatoryStaffRulesModal\n';
      if (!code.includes(renderAnchor)) throw new Error('[weekend-responsibility] staff rules render anchor missing');
      const renderCode = `            <WeekendShiftResponsibilityModal
                isOpen={weekendResponsibilityOpen}
                template={weekendResponsibilityTemplate}
                shift={weekendResponsibilityShift}
                dateLabel={weekendResponsibilityDateLabel}
                checked={weekendResponsibilityChecked}
                onCheckedChange={setWeekendResponsibilityChecked}
                onConfirm={acknowledgeWeekendResponsibility}
                onCloseReview={() => setWeekendResponsibilityOpen(false)}
                forceConfirm={weekendResponsibilityForceConfirm}
                saving={weekendResponsibilitySaving}
                lang={lang}
            />
`;
      code = code.replace(renderAnchor, renderCode + renderAnchor);
      return { code, map: null };
    },
  };
}
