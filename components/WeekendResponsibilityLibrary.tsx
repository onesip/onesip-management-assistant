import React, { useMemo, useState } from 'react';
import type { Lang, User } from '../types';

type Rule = {
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

type Assignment = { date: Date; dateText: string; shift: any; rule: Rule };

const RULES: Rule[] = [
  {
    key: 'fri_opening', day: 5, labelZh: '周五早班', labelEn: 'Fri Opening', roleZh: '补料责任人', roleEn: 'Prep owner',
    mainZh: '按 FRI 14:00 目标补齐周六需要的物料', mainEn: 'Prepare the items needed for Saturday according to the FRI 14:00 target.',
    tasksZh: ['11:30–14:00 正常出品，同时边出茶边按目标补料。','14:00 后中班到岗，早班转为专注补料，不再主要负责出品。','16:00 前完成 FRI 14:00 目标中的所有物料。','在管理小程序提交实际完成数量。','补回自己使用过的原料到指定储藏位置。'],
    tasksEn: ['11:30–14:00: make drinks and prep according to the target list at the same time.','After 14:00, once support arrives, focus on prep instead of drink production.','Finish all FRI 14:00 target items before 16:00.','Submit actual completed quantities in the management app.','Refill and return all ingredients used to their assigned storage places.'],
    standardsZh: ['所有目标物料已制作、贴标签、放到指定位置。','实际数量已提交，不能估计、不能虚报。','使用过的容器清洗干净并放回原位。'],
    standardsEn: ['All target items are made, labelled, and stored in the correct place.','Actual quantities are submitted; do not guess or over-report.','Used containers are washed and returned to the right place.'],
    escalateZh: ['无法完成时，下班前告诉店长：缺什么、差多少。','发现缺料先补充，再在小程序备注。'],
    escalateEn: ['If you cannot finish, tell the manager before leaving what is missing and how much.','If stock is low, refill first, then add a note in the app.']
  },
  {
    key: 'fri_support', day: 5, labelZh: '周五中班', labelEn: 'Fri Support', roleZh: '出杯支援 / 货架上架责任人', roleEn: 'Drink support / Shelf restock owner',
    mainZh: '支援出杯，给晚班留出盘货和查漏补缺时间', mainEn: 'Support drink production so the closing shift has time to count and refill.',
    tasksZh: ['到岗后立即进入出杯岗位，配合门店正常出品。','16:00–18:00 以出杯为主，减少晚班被订单打断。','18:00 后保持出茶吧台、工作台和客区干净整洁。','19:00 后清洁小料台，保持小料充足，塑料小料盒盖子放入洗碗机。','不忙时与晚班沟通，整理并上架楼下货架物品。'],
    tasksEn: ['Start drink production immediately after arrival and support normal service.','16:00–18:00: focus on drinks and reduce interruptions for the closing shift.','After 18:00, keep the tea station, worktop and customer area clean.','After 19:00, clean the topping station, keep toppings full, and put plastic lids into the dishwasher.','When quiet, align with the closing shift and restock downstairs shelves.'],
    standardsZh: ['中班期间出杯稳定，不让订单卡住。','货架按指定位置分类摆放、整齐、方便晚班取用。','空箱、包装和杂物集中整理，不留乱堆。'],
    standardsEn: ['Drink production stays stable and orders do not get stuck.','Shelves are restocked by category, tidy, and easy for the closing shift to use.','Empty boxes, packaging and waste are collected and not left around.'],
    escalateZh: ['客流一直很忙时，优先出杯；未完成上架需告知店长/晚班负责人。','缺货、找不到货、货架位置不清楚时，不乱放，及时询问。'],
    escalateEn: ['If it stays busy, prioritize drinks; report unfinished shelf work to the manager or closing lead.','If stock is missing or the location is unclear, do not place it randomly; ask first.']
  },
  {
    key: 'fri_closing', day: 5, labelZh: '周五晚班', labelEn: 'Fri Closing', roleZh: '盘货责任人', roleEn: 'Inventory count owner',
    mainZh: '盘点库存，确保周六开局顺利', mainEn: 'Count stock and make sure Saturday can start smoothly.',
    tasksZh: ['检查周五早班是否完成 FRI 14:00 目标。','对比管理小程序“周五目标”和实际剩余量。','盘点所有物料，先看剩多少，再补足差额。','检查牛奶、燕麦奶、罐头、气泡水、小料和包装材料。','检查小料盒是否补满，重点看芒果、荔枝、茶冻。','正常完成晚班打烊清洁。'],
    tasksEn: ['Check whether the opening shift finished the FRI 14:00 targets.','Compare Friday targets in the app with actual remaining stock.','Count all items; check what is left first, then refill the gap.','Check milk, oat milk, canned items, sparkling water, toppings and packaging.','Check topping boxes, especially mango, lychee and tea jelly.','Complete normal closing cleaning tasks.'],
    standardsZh: ['周六所有目标物料到位，基础原料充足。','补完料放入固定位置，并拍照发群里通知周六早班。','管理小程序已提交实际剩余量和 waste 数量。'],
    standardsEn: ['All Saturday target items are ready and basic ingredients are enough.','After refilling, store items in fixed places and send photos to the group for Saturday opening.','Actual remaining stock and waste quantities are submitted in the app.'],
    escalateZh: ['发现大量缺料必须当晚补齐，并立即汇报店长。','不能无脑补料：先盘点，再补差额。'],
    escalateEn: ['Large shortages must be refilled the same night and reported to the manager immediately.','Do not refill blindly: count first, then refill only the gap.']
  },
  {
    key: 'sat_opening', day: 6, labelZh: '周六早班', labelEn: 'Sat Opening', roleZh: '补料责任人', roleEn: 'Prep owner',
    mainZh: '补充浮动性大的物料，准备周六高峰', mainEn: 'Refill variable items and prepare for the Saturday peak.',
    tasksZh: ['检查周五准备的物料是否可用：新鲜度、效期、标签。','将物料倒入茶桶和料盒，确保可直接出品。','补齐前场和抽屉原料。','确认牛奶、罐头、气泡水和小料都可直接使用。','在管理小程序提交实际完成数量。','13:30 前确保奶精至少 3 个满 container；低于 2 个要补。','13:30 前确保 coconut 有 6L；低于 6L 要补。'],
    tasksEn: ['Check Friday prep: freshness, expiry time, and labels.','Move items into tea buckets and topping boxes so they are ready for service.','Refill front counter and drawer ingredients.','Make sure milk, canned items, sparkling water and toppings are ready to use.','Submit actual completed quantities in the management app.','Before 13:30, make sure there are 3 full creamer containers; refill if below 2.','Before 13:30, make sure coconut is at 6L; refill if below 6L.'],
    standardsZh: ['知道周五配料在哪里，并确认可以使用。','SAT 14:00 目标已完成并提交。','离开前补齐罐头、粉、吸管、杯子、袋子等常用物料。'],
    standardsEn: ['You know where Friday prep is and confirm it is usable.','SAT 14:00 targets are completed and submitted.','Before leaving, refill canned items, powders, straws, cups, bags and other daily-use items.'],
    escalateZh: ['开门前未完成时，第二人到岗后继续完成，不得影响高峰出品。','发现大量缺料必须立即汇报店长；否则缺料会算入本班责任。'],
    escalateEn: ['If not finished before opening, the second staff member continues it without affecting peak service.','Report major shortages immediately; otherwise shortages become this shift’s responsibility.']
  },
  {
    key: 'sat_peak', day: 6, labelZh: '周六高峰班', labelEn: 'Sat Peak', roleZh: '出品责任人', roleEn: 'Drink production owner',
    mainZh: '只做两件事：出品 + 补充已经备好的物料', mainEn: 'Only two priorities: make drinks and refill ready-made stock.',
    tasksZh: ['专注出品、封口、出杯。','茶桶或料盒快空时，只补充已经准备好的同种物料。','保持工作台、封口区和出杯区域整洁。','发现缺料要记录缺什么、什么时候缺。'],
    tasksEn: ['Focus on making, sealing and handing out drinks.','When buckets or boxes are nearly empty, refill only with the same ready-made item.','Keep the worktop, sealing area and drink handoff area clean.','If something runs out, record what is missing and when it happened.'],
    standardsZh: ['高峰期不因物料不足停止出品。','不做复杂备料，不离岗做其他事情。','所有缺料情况已在管理小程序记录。'],
    standardsEn: ['Service does not stop during peak because of missing stock.','Do not make complex prep and do not leave the station for other tasks.','All shortage cases are recorded in the management app.'],
    escalateZh: ['缺料记录会直接影响下周目标调整，必须真实填写。','客流很大时，先保证出杯，再补记录。'],
    escalateEn: ['Shortage records directly affect next week’s targets, so they must be accurate.','When very busy, keep drinks moving first, then complete the record.']
  },
  {
    key: 'sat_closing', day: 6, labelZh: '周六晚班', labelEn: 'Sat Closing', roleZh: '盘货责任人', roleEn: 'Inventory count owner',
    mainZh: '盘点库存，为周日开局做准备', mainEn: 'Count stock and prepare for Sunday opening.',
    tasksZh: ['高峰后整理、检查、补充。','盘点现有库存，对比管理小程序目标量。','先看剩多少，再补足差额，不能无脑补料。','执行先进先出：新物料放后面，旧物料放前面。','Jasmine 物料区低于 2 个 4L 茶桶时，立刻补充。','奶精低于 1 个 container，补 5L 新奶精。','Coconut 低于 1 个 container，补 3L coconut。'],
    tasksEn: ['After peak, tidy, check and refill.','Count current stock and compare with app targets.','Check remaining stock first, then refill the gap; do not refill blindly.','Use FIFO: put new stock behind old stock.','If jasmine stock is below two 4L tea buckets, refill immediately.','If creamer is below 1 container, make 5L new creamer.','If coconut is below 1 container, make 3L coconut.'],
    standardsZh: ['周日可以正常开局。','先进先出执行到位，旧料不被新料挡住。','盘货完成后拍照发群里，特别提醒周日早班。'],
    standardsEn: ['Sunday can start normally.','FIFO is done correctly; old stock is not hidden behind new stock.','After stock count, send photos to the group, especially for Sunday opening.'],
    escalateZh: ['管理小程序提交实际剩余量和 waste 数量。','发现异常或大量缺料，立即汇报店长。'],
    escalateEn: ['Submit actual remaining stock and waste quantities in the management app.','Report unusual issues or major shortages to the manager immediately.']
  },
  {
    key: 'sun_opening', day: 0, labelZh: '周日早班', labelEn: 'Sun Opening', roleZh: '整理责任人', roleEn: 'FIFO organization owner',
    mainZh: '整理周六备料，避免旧料被新料遮住造成过期损耗', mainEn: 'Organize Saturday prep to prevent old stock from being hidden and wasted.',
    tasksZh: ['检查周六准备物料是否可用：新鲜度、效期、标签。','将物料倒入茶桶和料盒，确保可直接出品。','严格先进先出：前旧后新，先用旧料。','补齐前场和抽屉原料。','确认牛奶、罐头、气泡水和小料可直接使用。'],
    tasksEn: ['Check Saturday prep: freshness, expiry time, and labels.','Move items into tea buckets and topping boxes for direct service.','Strict FIFO: old stock in front, new stock behind, use old stock first.','Refill front counter and drawer ingredients.','Make sure milk, canned items, sparkling water and toppings are ready to use.'],
    standardsZh: ['知道周六配料在哪里，并整理成前旧后新。','离开前补齐罐头、粉、吸管、杯子、袋子等常用物料。','尽量降低过期和浪费。'],
    standardsEn: ['You know where Saturday prep is and organize it old-in-front, new-behind.','Before leaving, refill canned items, powders, straws, cups, bags and other daily-use items.','Reduce expiry waste as much as possible.'],
    escalateZh: ['发现过期或快过期物料，先按规则处理并反馈。','发现周六备料位置混乱，拍照并告知负责人。'],
    escalateEn: ['If items are expired or near expiry, handle them according to rules and report it.','If Saturday prep is disorganized, take photos and inform the person in charge.']
  },
  {
    key: 'sun_closing', day: 0, labelZh: '周日晚班', labelEn: 'Sun Closing', roleZh: '盘货责任人', roleEn: 'Inventory count owner',
    mainZh: '盘点库存，清点损耗，准备周一', mainEn: 'Count stock, record waste, and prepare for Monday.',
    tasksZh: ['高峰后整理、检查、补充。','盘点现有库存，对比管理小程序目标量。','重点关注 osmanthus tea、black tea 和 foams；清点现存与损耗。','执行先进先出：新物料放后面，旧物料放前面。','所有小料盒的盖子都放进洗碗机。'],
    tasksEn: ['After peak, tidy, check and refill.','Count current stock and compare with app targets.','Pay special attention to osmanthus tea, black tea and foams; count remaining stock and waste.','Use FIFO: new stock behind, old stock in front.','Put all topping box lids into the dishwasher.'],
    standardsZh: ['周一可以正常开局。','先进先出执行到位。','管理小程序已提交盘点和损耗数据。'],
    standardsEn: ['Monday can start normally.','FIFO is completed correctly.','Inventory count and waste data are submitted in the app.'],
    escalateZh: ['周日数据直接影响下周备料目标，必须准确。','发现大量 waste 或异常损耗，必须备注原因并反馈店长。'],
    escalateEn: ['Sunday data directly affects next week’s prep targets, so they must be accurate.','If there is major waste or unusual loss, add the reason in notes and tell the manager.']
  }
];

const ruleByKey = Object.fromEntries(RULES.map((rule) => [rule.key, rule])) as Record<string, Rule>;

function parseMinutes(value: any): number | null {
  const [h, m] = String(value || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

function resolveRule(date: Date, shift: any): Rule | null {
  const day = date.getDay();
  const start = parseMinutes(shift?.start);
  const end = parseMinutes(shift?.end) ?? start;
  if (start === null || ![5, 6, 0].includes(day)) return null;
  if (day === 5) {
    if (start < 13 * 60 + 30) return ruleByKey.fri_opening;
    if (start >= 15 * 60 + 30 && start < 16 * 60 + 30 && (end ?? start) <= 18 * 60 + 30) return ruleByKey.fri_support;
    return ruleByKey.fri_closing;
  }
  if (day === 6) {
    if (start < 12 * 60) return ruleByKey.sat_opening;
    if (start < 15 * 60 + 30) return ruleByKey.sat_peak;
    return ruleByKey.sat_closing;
  }
  return start < 14 * 60 ? ruleByKey.sun_opening : ruleByKey.sun_closing;
}

function scheduleDate(raw: any, now: Date): Date | null {
  const match = String(raw || '').match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const month = Number(match[1]) - 1;
  const day = Number(match[2]);
  let result = new Date(now.getFullYear(), month, day, 12, 0, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  if (result.getTime() < today.getTime() - 180 * 24 * 60 * 60 * 1000) result = new Date(now.getFullYear() + 1, month, day, 12, 0, 0, 0);
  return result;
}

function getAssignments(schedule: any, user: User | null | undefined, storeId: string, now: Date): Assignment[] {
  if (!user || !schedule?.days) return [];
  const name = String(user.name || '').trim().toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const result: Assignment[] = [];
  for (const item of schedule.days) {
    if ((item.storeId || 'default_store') !== storeId) continue;
    const date = scheduleDate(item.date, now);
    if (!date || date.getTime() < today || ![5, 6, 0].includes(date.getDay())) continue;
    for (const shift of item.shifts || []) {
      if (!Array.isArray(shift.staff) || !shift.staff.some((n: string) => String(n || '').trim().toLowerCase() === name)) continue;
      const rule = resolveRule(date, shift);
      if (!rule) continue;
      result.push({ date, dateText: String(item.date), shift, rule });
    }
  }
  return result.sort((a, b) => a.date.getTime() - b.date.getTime() || (parseMinutes(a.shift.start) || 0) - (parseMinutes(b.shift.start) || 0));
}

function Section({ title, items }: { title: string; items: string[] }) {
  return <section className="rounded-2xl border border-emerald-200 bg-white p-4"><h4 className="mb-2 text-sm font-black text-emerald-900">{title}</h4><ol className="space-y-2">{items.map((item, i) => <li key={i} className="flex gap-2 text-sm font-semibold leading-relaxed text-gray-800"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-black text-white">{i + 1}</span><span>{item}</span></li>)}</ol></section>;
}

export function WeekendResponsibilityLibrary({ currentUser, schedule, storeId, lang }: { currentUser: User | null | undefined; schedule: any; storeId: string; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const now = new Date();
  const assignments = useMemo(() => getAssignments(schedule, currentUser, storeId, now), [schedule, currentUser?.id, currentUser?.name, storeId]);
  const next = assignments[0] || null;
  const selected = ruleByKey[selectedKey || next?.rule.key || 'fri_opening'];
  if (!currentUser) return null;
  const isStaff = currentUser.role === 'staff';
  const label = lang === 'zh' ? (isStaff ? '我的班次责任' : '班次责任') : (isStaff ? 'My Shift Duties' : 'Shift Duties');
  const subtitle = next ? `${lang === 'zh' ? '下一班' : 'Next'}: ${lang === 'zh' ? next.rule.labelZh : next.rule.labelEn} · ${next.dateText} ${next.shift.start}–${next.shift.end}` : (lang === 'zh' ? '查看周五 / 周六 / 周日责任' : 'View Fri / Sat / Sun responsibilities');
  const tasks = lang === 'zh' ? selected.tasksZh : selected.tasksEn;
  const standards = lang === 'zh' ? selected.standardsZh : selected.standardsEn;
  const escalate = lang === 'zh' ? selected.escalateZh : selected.escalateEn;

  return <>
    <button type="button" onClick={() => { setSelectedKey(next?.rule.key || null); setOpen(true); }} className="fixed bottom-40 right-3 z-[10950] max-w-[190px] rounded-2xl border-2 border-emerald-200 bg-white px-3 py-2 text-left shadow-xl active:scale-95">
      <div className="text-xs font-black text-emerald-900">📋 {label}</div>
      <div className="mt-0.5 truncate text-[9px] font-bold text-gray-500">{subtitle}</div>
    </button>

    {open && <div className="fixed inset-0 z-[11750] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-emerald-50 shadow-2xl">
        <div className="shrink-0 bg-emerald-900 px-5 py-4 text-white"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">ONESIP Shift Responsibility Center</div><h2 className="mt-1 text-xl font-black">{label}</h2>{next && <p className="mt-1 text-xs font-bold text-emerald-100">{subtitle}</p>}</div><button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-white/15 px-3 py-2 text-xs font-black">{lang === 'zh' ? '关闭' : 'Close'}</button></div></div>
        <div className="flex-1 overflow-y-auto p-4">
          {isStaff && assignments.length > 0 && <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-3"><div className="text-xs font-black text-amber-900">{lang === 'zh' ? '我的接下来周末班次' : 'My upcoming weekend shifts'}</div><div className="mt-2 flex gap-2 overflow-x-auto pb-1">{assignments.slice(0, 6).map((a, i) => <button key={`${a.dateText}-${a.shift.start}-${i}`} onClick={() => setSelectedKey(a.rule.key)} className="shrink-0 rounded-xl border border-amber-300 bg-white px-3 py-2 text-left"><div className="text-xs font-black text-gray-900">{lang === 'zh' ? a.rule.labelZh : a.rule.labelEn}</div><div className="text-[10px] font-bold text-gray-500">{a.dateText} · {a.shift.start}–{a.shift.end}</div></button>)}</div></div>}

          <div className="mb-4"><div className="mb-2 text-xs font-black text-emerald-900">{lang === 'zh' ? (isStaff ? '也可以查看全部班次责任' : '全部 8 个班次责任') : (isStaff ? 'You can also review every shift rule' : 'All 8 shift responsibilities')}</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{RULES.map((rule) => <button key={rule.key} onClick={() => setSelectedKey(rule.key)} className={selected.key === rule.key ? 'rounded-xl border-2 border-emerald-700 bg-emerald-100 p-2 text-left' : 'rounded-xl border border-emerald-200 bg-white p-2 text-left'}><div className="text-xs font-black text-emerald-950">{lang === 'zh' ? rule.labelZh : rule.labelEn}</div><div className="mt-0.5 text-[9px] font-bold text-gray-500">{lang === 'zh' ? rule.roleZh : rule.roleEn}</div></button>)}</div></div>

          <div className="space-y-3"><div className="rounded-2xl bg-emerald-800 p-4 text-white"><div className="text-[10px] font-black uppercase tracking-wider text-emerald-200">{lang === 'zh' ? '当前查看' : 'Viewing'}</div><div className="mt-1 text-2xl font-black">{lang === 'zh' ? selected.labelZh : selected.labelEn}</div><div className="mt-2 text-sm font-black">{lang === 'zh' ? selected.roleZh : selected.roleEn}</div><div className="mt-1 text-xs font-semibold text-emerald-100">{lang === 'zh' ? selected.mainZh : selected.mainEn}</div></div><Section title={lang === 'zh' ? '具体要做' : 'What to do'} items={tasks}/><Section title={lang === 'zh' ? '做到什么标准' : 'Pass standard'} items={standards}/><Section title={lang === 'zh' ? '记录与异常' : 'Record & escalate'} items={escalate}/><div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-3 text-center text-xs font-black text-amber-950">{lang === 'zh' ? '共同原则：先补再记 · FIFO · 不提交 = 没做' : 'Shared rules: refill first, record after · FIFO · no record = not done'}</div></div>
        </div>
      </div>
    </div>}
  </>;
}

class ResponsibilityLibraryBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: React.ErrorInfo) { console.error('Responsibility library crashed and was isolated', error, info); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function SafeWeekendResponsibilityLibrary(props: { currentUser: User | null | undefined; schedule: any; storeId: string; lang: Lang }) {
  return <ResponsibilityLibraryBoundary><WeekendResponsibilityLibrary {...props}/></ResponsibilityLibraryBoundary>;
}
