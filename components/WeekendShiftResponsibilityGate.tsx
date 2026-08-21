import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Lang, User } from '../types';
import * as Cloud from '../services/cloud';

type ResponsibilityTemplate = {
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

type ShiftContext = {
  template: ResponsibilityTemplate;
  shift: any;
  start: number;
  end: number;
  dateKey: string;
  ackKey: string;
};

const VERSION = 'weekend_shift_responsibility_2026_08_21_v2';

const OVERALL_ZH = [
  '早班负责“做”：按管理小程序目标制作 / 补充物料；晚班负责“算”：盘点剩余量、补足差额、记录 waste；高峰班负责“出”：专注出品和补充已经备好的物料。',
  '先保证营业不中断；发现不足先补，再记录，再反馈。',
  '所有新物料放后面、旧物料放前面，严格先进先出 FIFO。',
  '客人等待时间尽量控制在约 15 分钟内，不能因为缺料停止接单。',
  '目标量、实际完成量、剩余量和 waste 都必须提交。',
  '原料、容器和工具用完归位，台面保持可以继续出品。',
  '没有提交记录，就视为没有完成。',
  '缺料、过期、设备问题或找不到货，必须及时告诉店长或当班负责人。'
];

const OVERALL_EN = [
  'Opening shifts prep/refill to app targets; closing shifts count, refill gaps and record waste; peak shifts focus on drinks and ready stock.',
  'Keep service running. If something is low, refill first, record it, then report it.',
  'Put new stock behind old stock and follow FIFO strictly.',
  'Keep customer waiting time to about 15 minutes where possible; do not stop orders because prep is missing.',
  'Targets, actual completed quantities, remaining stock and waste must all be submitted.',
  'Return ingredients, containers and tools to their places and keep the station ready.',
  'No submission means the task is treated as not completed.',
  'Report shortages, expiry, equipment issues or missing stock to the manager/person in charge promptly.'
];

const TEMPLATES: Record<string, ResponsibilityTemplate> = {
  fri_opening: {
    key: 'fri_opening', day: 5, labelZh: '周五早班', labelEn: 'Fri Opening', roleZh: '补料责任人', roleEn: 'Prep owner',
    mainZh: '按 FRI 14:00 目标补齐周六需要的物料', mainEn: 'Prepare the items needed for Saturday according to the FRI 14:00 target.',
    tasksZh: ['11:30–14:00 正常出品，同时边出茶边按目标补料。','14:00 后中班到岗，早班转为专注补料，不再主要负责出品。','16:00 前完成 FRI 14:00 目标中的所有物料。','在管理小程序提交实际完成数量。','补回自己使用过的原料到指定储藏位置。'],
    tasksEn: ['11:30–14:00: make drinks and prep according to the target list at the same time.','After 14:00, once support arrives, focus on prep instead of drink production.','Finish all FRI 14:00 target items before 16:00.','Submit the actual completed quantities in the management app.','Refill and return all ingredients you used to their assigned storage places.'],
    standardsZh: ['所有目标物料已制作、贴标签、放到指定位置。','实际数量已提交，不能估计、不能虚报。','使用过的容器清洗干净并放回原位。'],
    standardsEn: ['All target items are made, labelled, and stored in the correct place.','Actual quantities are submitted. Do not guess or over-report.','Used containers are washed and returned to the right place.'],
    escalateZh: ['无法完成时，下班前告诉店长：缺什么、差多少。','发现缺料先补充，再在小程序备注。'],
    escalateEn: ['If you cannot finish, tell the manager before leaving what is missing and how much.','If stock is low, refill first, then add a note in the app.']
  },
  fri_support: {
    key: 'fri_support', day: 5, labelZh: '周五中班', labelEn: 'Fri Support', roleZh: '出杯支援 / 货架上架责任人', roleEn: 'Drink support / Shelf restock owner',
    mainZh: '支援出杯，给晚班留出盘货和查漏补缺时间', mainEn: 'Support drink production so the closing shift has time to count and refill.',
    tasksZh: ['到岗后立即进入出杯岗位，配合门店正常出品。','16:00–18:00 以出杯为主，减少晚班被订单打断。','18:00 后保持出茶吧台、工作台和客区干净整洁。','19:00 后清洁小料台，保持小料充足，塑料小料盒盖子放入洗碗机。','不忙时与晚班沟通，整理并上架楼下货架物品。'],
    tasksEn: ['Start drink production immediately after arrival and support normal service.','16:00–18:00: focus on drinks and reduce interruptions for the closing shift.','After 18:00, keep the tea station, worktop and customer area clean.','After 19:00, clean the topping station, keep toppings full, and put plastic lids into the dishwasher.','When it is quiet, align with the closing shift and restock the downstairs shelves.'],
    standardsZh: ['中班期间出杯稳定，不让订单卡住。','货架按指定位置分类摆放、整齐、方便晚班取用。','空箱、包装和杂物集中整理，不留乱堆。'],
    standardsEn: ['Drink production stays stable and orders do not get stuck.','Shelves are restocked by category, tidy, and easy for the closing shift to use.','Empty boxes, packaging and waste are collected and not left around.'],
    escalateZh: ['客流一直很忙时，优先出杯；未完成上架需告知店长/晚班负责人。','缺货、找不到货、货架位置不清楚时，不乱放，及时询问。'],
    escalateEn: ['If it stays busy, prioritize drinks; report unfinished shelf work to the manager or closing lead.','If stock is missing or the location is unclear, do not place it randomly; ask first.']
  },
  fri_closing: {
    key: 'fri_closing', day: 5, labelZh: '周五晚班', labelEn: 'Fri Closing', roleZh: '盘货责任人', roleEn: 'Inventory count owner',
    mainZh: '盘点库存，确保周六开局顺利', mainEn: 'Count stock and make sure Saturday can start smoothly.',
    tasksZh: ['检查周五早班是否完成 FRI 14:00 目标。','对比管理小程序“周五目标”和实际剩余量。','盘点所有物料，先看到多少，再补足差额。','检查牛奶、燕麦奶、罐头、气泡水、小料和包装材料。','检查小料盒是否补满，重点看芒果、荔枝、茶冻。','正常完成晚班打烊清洁。'],
    tasksEn: ['Check whether the opening shift finished the FRI 14:00 targets.','Compare Friday targets in the app with actual remaining stock.','Count all items; check what is left first, then refill the gap.','Check milk, oat milk, canned items, sparkling water, toppings and packaging.','Check topping boxes, especially mango, lychee and tea jelly.','Complete the normal closing cleaning tasks.'],
    standardsZh: ['周六所有目标物料到位，基础原料充足。','补完料放入固定位置，并拍照发群里通知周六早班。','管理小程序已提交实际剩余量和 waste 数量。'],
    standardsEn: ['All Saturday target items are ready and basic ingredients are enough.','After refilling, store items in fixed places and send photos to the group for Saturday opening.','Actual remaining stock and waste quantities are submitted in the app.'],
    escalateZh: ['发现大量缺料必须当晚补齐，并立即汇报店长。','不能无脑补料：先盘点，再补差额。'],
    escalateEn: ['Large shortages must be refilled the same night and reported to the manager immediately.','Do not refill blindly: count first, then refill only the gap.']
  },
  sat_opening: {
    key: 'sat_opening', day: 6, labelZh: '周六早班', labelEn: 'Sat Opening', roleZh: '补料责任人', roleEn: 'Prep owner',
    mainZh: '补充浮动性大的物料，准备周六高峰', mainEn: 'Refill variable items and prepare for the Saturday peak.',
    tasksZh: ['检查周五准备的物料是否可用：新鲜度、效期、标签。','将物料倒入茶桶和料盒，确保可直接出品。','补齐前场和抽屉原料。','确认牛奶、罐头、气泡水和小料都可直接使用。','在管理小程序提交实际完成数量。','13:30 前确保奶精至少 3 个满 container；低于 2 个要补。','13:30 前确保 coconut 有 6L；低于 6L 要补。'],
    tasksEn: ['Check Friday prep: freshness, expiry time, and labels.','Move items into tea buckets and topping boxes so they are ready for service.','Refill front counter and drawer ingredients.','Make sure milk, canned items, sparkling water and toppings are ready to use.','Submit actual completed quantities in the management app.','Before 13:30, make sure there are 3 full creamer containers; refill if below 2.','Before 13:30, make sure coconut is at 6L; refill if below 6L.'],
    standardsZh: ['知道周五配料在哪里，并确认可以使用。','SAT 14:00 目标已完成并提交。','离开前补齐罐头、粉、吸管、杯子、袋子等常用物料。'],
    standardsEn: ['You know where Friday prep is and confirm it is usable.','SAT 14:00 targets are completed and submitted.','Before leaving, refill canned items, powders, straws, cups, bags and other daily-use items.'],
    escalateZh: ['开门前未完成时，第二人到岗后继续完成，不得影响高峰出品。','发现大量缺料必须立即汇报店长；否则缺料会算入本班责任。'],
    escalateEn: ['If not finished before opening, the second staff member continues it without affecting peak service.','Report major shortages immediately; otherwise shortages become this shift’s responsibility.']
  },
  sat_peak: {
    key: 'sat_peak', day: 6, labelZh: '周六高峰班', labelEn: 'Sat Peak', roleZh: '出品责任人', roleEn: 'Drink production owner',
    mainZh: '只做两件事：出品 + 补充已经备好的物料', mainEn: 'Only two priorities: make drinks and refill ready-made stock.',
    tasksZh: ['专注出品、封口、出杯。','茶桶或料盒快空时，只补充已经准备好的同种物料。','保持工作台、封口区和出杯区域整洁。','发现缺料要记录缺什么、什么时候缺。'],
    tasksEn: ['Focus on making, sealing and handing out drinks.','When buckets or boxes are nearly empty, refill only with the same ready-made item.','Keep the worktop, sealing area and drink handoff area clean.','If something runs out, record what is missing and when it happened.'],
    standardsZh: ['高峰期不因物料不足停止出品。','不做复杂备料，不离岗做其他事情。','所有缺料情况已在管理小程序记录。'],
    standardsEn: ['Service does not stop during peak because of missing stock.','Do not make complex prep and do not leave the station for other tasks.','All shortage cases are recorded in the management app.'],
    escalateZh: ['缺料记录会直接影响下周目标调整，必须真实填写。','客流很大时，先保证出杯，再补记录。'],
    escalateEn: ['Shortage records directly affect next week’s targets, so they must be accurate.','When it is very busy, keep drinks moving first, then complete the record.']
  },
  sat_closing: {
    key: 'sat_closing', day: 6, labelZh: '周六晚班', labelEn: 'Sat Closing', roleZh: '盘货责任人', roleEn: 'Inventory count owner',
    mainZh: '盘点库存，为周日开局做准备', mainEn: 'Count stock and prepare for Sunday opening.',
    tasksZh: ['高峰后整理、检查、补充。','盘点现有库存，对比管理小程序目标量。','先看剩多少，再补足差额，不能无脑补料。','执行先进先出：新物料放后面，旧物料放前面。','Jasmine 物料区低于 2 个 4L 茶桶时，立刻补充。','奶精低于 1 个 container，补 5L 新奶精。','Coconut 低于 1 个 container，补 3L coconut。'],
    tasksEn: ['After peak, tidy, check and refill.','Count current stock and compare with app targets.','Check remaining stock first, then refill the gap; do not refill blindly.','Use FIFO: put new stock behind old stock.','If jasmine stock is below two 4L tea buckets, refill immediately.','If creamer is below 1 container, make 5L new creamer.','If coconut is below 1 container, make 3L coconut.'],
    standardsZh: ['周日可以正常开局。','先进先出执行到位，旧料不被新料挡住。','盘货完成后拍照发群里，特别提醒周日早班。'],
    standardsEn: ['Sunday can start normally.','FIFO is done correctly; old stock is not hidden behind new stock.','After stock count, send photos to the group, especially for Sunday opening.'],
    escalateZh: ['管理小程序提交实际剩余量和 waste 数量。','发现异常或大量缺料，立即汇报店长。'],
    escalateEn: ['Submit actual remaining stock and waste quantities in the management app.','Report unusual issues or major shortages to the manager immediately.']
  },
  sun_opening: {
    key: 'sun_opening', day: 0, labelZh: '周日早班', labelEn: 'Sun Opening', roleZh: '整理责任人', roleEn: 'FIFO organization owner',
    mainZh: '整理周六备料，避免旧料被新料遮住造成过期损耗', mainEn: 'Organize Saturday prep to prevent old stock from being hidden and wasted.',
    tasksZh: ['检查周六准备物料是否可用：新鲜度、效期、标签。','将物料倒入茶桶和料盒，确保可直接出品。','严格先进先出：前旧后新，先用旧料。','补齐前场和抽屉原料。','确认牛奶、罐头、气泡水和小料可直接使用。'],
    tasksEn: ['Check Saturday prep: freshness, expiry time, and labels.','Move items into tea buckets and topping boxes for direct service.','Strict FIFO: old stock in front, new stock behind, use old stock first.','Refill front counter and drawer ingredients.','Make sure milk, canned items, sparkling water and toppings are ready to use.'],
    standardsZh: ['知道周六配料在哪里，并整理成前旧后新。','离开前补齐罐头、粉、吸管、杯子、袋子等常用物料。','尽量降低过期和浪费。'],
    standardsEn: ['You know where Saturday prep is and organize it old-in-front, new-behind.','Before leaving, refill canned items, powders, straws, cups, bags and other daily-use items.','Reduce expiry waste as much as possible.'],
    escalateZh: ['发现过期或快过期物料，先按规则处理并反馈。','发现周六备料位置混乱，拍照并告知负责人。'],
    escalateEn: ['If items are expired or near expiry, handle them according to rules and report it.','If Saturday prep is disorganized, take photos and inform the person in charge.']
  },
  sun_closing: {
    key: 'sun_closing', day: 0, labelZh: '周日晚班', labelEn: 'Sun Closing', roleZh: '盘货责任人', roleEn: 'Inventory count owner',
    mainZh: '盘点库存，清点损耗，准备周一', mainEn: 'Count stock, record waste, and prepare for Monday.',
    tasksZh: ['高峰后整理、检查、补充。','盘点现有库存，对比管理小程序目标量。','重点关注 osmanthus tea、black tea 和 foams；清点现存与损耗。','执行先进先出：新物料放后面，旧物料放前面。','所有小料盒的盖子都放进洗碗机。'],
    tasksEn: ['After peak, tidy, check and refill.','Count current stock and compare with app targets.','Pay special attention to osmanthus tea, black tea and foams; count remaining stock and waste.','Use FIFO: new stock behind, old stock in front.','Put all topping box lids into the dishwasher.'],
    standardsZh: ['周一可以正常开局。','先进先出执行到位。','管理小程序已提交盘点和损耗数据。'],
    standardsEn: ['Monday can start normally.','FIFO is completed correctly.','Inventory count and waste data are submitted in the app.'],
    escalateZh: ['周日数据直接影响下周备料目标，必须准确。','发现大量 waste 或异常损耗，必须备注原因并反馈店长。'],
    escalateEn: ['Sunday data directly affects next week’s prep targets, so it must be accurate.','If there is major waste or unusual loss, add the reason in notes and tell the manager.']
  }
};

function parseMinutes(value: any): number | null {
  const parts = String(value || '').split(':').map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  return parts[0] * 60 + parts[1];
}

function resolveTemplate(now: Date, shift: any): ResponsibilityTemplate | null {
  const day = now.getDay();
  const start = parseMinutes(shift?.start);
  const rawEnd = parseMinutes(shift?.end);
  if (start === null || ![5, 6, 0].includes(day)) return null;
  const end = rawEnd ?? start;
  if (day === 5) {
    if (start < 13 * 60 + 30) return TEMPLATES.fri_opening;
    if (start >= 15 * 60 + 30 && start < 16 * 60 + 30 && end <= 18 * 60 + 30) return TEMPLATES.fri_support;
    return TEMPLATES.fri_closing;
  }
  if (day === 6) {
    if (start < 12 * 60) return TEMPLATES.sat_opening;
    if (start < 15 * 60 + 30) return TEMPLATES.sat_peak;
    return TEMPLATES.sat_closing;
  }
  return start < 14 * 60 ? TEMPLATES.sun_opening : TEMPLATES.sun_closing;
}

function formatDateKey(now: Date): string {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function getContext(schedule: any, currentUser: User | null | undefined, storeId: string, now: Date): ShiftContext | null {
  if (!currentUser || currentUser.role !== 'staff' || !schedule?.days) return null;
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const keys = new Set([`${month}-${day}`, `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`]);
  const today = schedule.days.find((item: any) => keys.has(String(item.date)) && (item.storeId || 'default_store') === storeId);
  if (!today?.shifts?.length) return null;
  const name = currentUser.name.trim().toLowerCase();
  const candidates = today.shifts
    .filter((shift: any) => Array.isArray(shift.staff) && shift.staff.some((staffName: string) => String(staffName || '').trim().toLowerCase() === name))
    .map((shift: any) => {
      const template = resolveTemplate(now, shift);
      const start = parseMinutes(shift.start);
      const rawEnd = parseMinutes(shift.end);
      if (!template || start === null) return null;
      let end = rawEnd ?? start;
      if (end < start) end += 1440;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const active = nowMinutes >= start && nowMinutes <= end;
      const pre = nowMinutes >= start - 90 && nowMinutes < start;
      const priority = active ? 0 : pre ? 1 : 2;
      const distance = Math.abs(start - nowMinutes);
      return { shift, template, start, end, priority, distance };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.priority - b.priority || a.distance - b.distance);
  const picked: any = candidates[0];
  if (!picked) return null;
  const dateKey = formatDateKey(now);
  const identity = picked.shift.id || `${picked.shift.start}-${picked.shift.end}`;
  const ackKey = [VERSION, 'ack', storeId, dateKey, currentUser.id, identity, picked.template.key].join('_');
  return { template: picked.template, shift: picked.shift, start: picked.start, end: picked.end, dateKey, ackKey };
}

function ResponsibilitySection({ title, items }: { title: string; items: string[] }) {
  return <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm"><h4 className="mb-2 text-sm font-black text-emerald-900">{title}</h4><ol className="space-y-2">{items.map((item, index) => <li key={index} className="flex gap-2 text-sm font-semibold leading-relaxed text-gray-800"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-black text-white">{index + 1}</span><span>{item}</span></li>)}</ol></section>;
}

export function WeekendShiftResponsibilityGate({ currentUser, schedule, storeId, lang }: { currentUser: User | null | undefined; schedule: any; storeId: string; lang: Lang }) {
  const [clock, setClock] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [forced, setForced] = useState(false);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ackRevision, setAckRevision] = useState(0);
  const activeModalKey = useRef<string | null>(null);
  const shownKeys = useRef(new Set<string>());

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const now = useMemo(() => new Date(clock), [clock]);
  const context = useMemo(() => getContext(schedule, currentUser, storeId, now), [schedule, currentUser, storeId, now, ackRevision]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const inRequiredWindow = Boolean(context && nowMinutes >= context.start - 90 && nowMinutes <= context.end);
  let acknowledged = false;
  if (context) {
    try { acknowledged = Boolean(localStorage.getItem(context.ackKey)); } catch { acknowledged = false; }
  }

  useEffect(() => {
    if (!context || currentUser?.role !== 'staff' || !inRequiredWindow || acknowledged) {
      if (forced) { setForced(false); setOpen(false); activeModalKey.current = null; }
      return;
    }
    if (activeModalKey.current !== context.ackKey) {
      activeModalKey.current = context.ackKey;
      setChecked(false);
      setForced(true);
      setOpen(true);
    }
    if (!shownKeys.current.has(context.ackKey)) {
      shownKeys.current.add(context.ackKey);
      const shownAt = new Date().toISOString();
      const log: any = {
        id: Date.now(), type: 'SHIFT_RESPONSIBILITY_SHOWN', shift: 'shift-responsibility', time: shownAt,
        name: currentUser?.name, userId: currentUser?.id, storeId, responsibilityVersion: VERSION,
        responsibilityKey: context.template.key, responsibilityLabel: context.template.labelEn,
        scheduleDate: context.dateKey, shiftStart: context.shift.start, shiftEnd: context.shift.end,
        event: 'shift_responsibility_shown', status: 'shown_not_yet_acknowledged',
        reason: `Responsibility shown: ${context.template.labelEn} ${context.shift.start}-${context.shift.end}`
      };
      Promise.resolve((Cloud as any).saveLog?.(log)).catch((error: any) => {
        shownKeys.current.delete(context.ackKey);
        console.error('Responsibility shown log failed', error);
      });
    }
  }, [context?.ackKey, currentUser?.id, currentUser?.role, currentUser?.name, storeId, inRequiredWindow, acknowledged, forced]);

  if (!context || currentUser?.role !== 'staff') return null;

  const t = context.template;
  const tasks = lang === 'zh' ? t.tasksZh : t.tasksEn;
  const standards = lang === 'zh' ? t.standardsZh : t.standardsEn;
  const escalate = lang === 'zh' ? t.escalateZh : t.escalateEn;
  const overall = lang === 'zh' ? OVERALL_ZH : OVERALL_EN;

  const acknowledge = async () => {
    if (!forced || !checked || saving) return;
    setSaving(true);
    const acknowledgedAt = new Date().toISOString();
    const log: any = {
      id: Date.now(), type: 'SHIFT_RESPONSIBILITY_ACK', shift: 'shift-responsibility', time: acknowledgedAt,
      name: currentUser.name, userId: currentUser.id, storeId, responsibilityVersion: VERSION,
      responsibilityKey: t.key, responsibilityLabel: t.labelEn, scheduleDate: context.dateKey,
      shiftStart: context.shift.start, shiftEnd: context.shift.end, event: 'shift_responsibility_acknowledged',
      status: 'acknowledged', acknowledgedAt,
      reason: `Confirmed: ${t.labelEn} ${context.shift.start}-${context.shift.end}`
    };
    try {
      await Promise.resolve((Cloud as any).saveLog?.(log));
      localStorage.setItem(context.ackKey, acknowledgedAt);
      setForced(false); setOpen(false); setChecked(false); setAckRevision((v) => v + 1); activeModalKey.current = null;
    } catch (error) {
      console.error('Responsibility acknowledgement failed', error);
      alert(lang === 'zh' ? '网络异常：确认还没有成功记录。请联网后重新确认；弹窗不会关闭。' : 'Network error: acknowledgement was not recorded. Reconnect and confirm again.');
    } finally {
      setSaving(false);
    }
  };

  const dateLabel = now.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' });

  return <>
    <button type="button" onClick={() => { if (!forced) { setChecked(true); setOpen(true); } }} className="fixed bottom-24 right-3 z-[11000] rounded-full border-2 border-emerald-200 bg-emerald-800 px-4 py-3 text-xs font-black text-white shadow-xl active:scale-95">
      {lang === 'zh' ? '本班责任' : 'My Responsibility'}
    </button>

    {open && <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/90 p-3 backdrop-blur-md" role="alertdialog" aria-modal="true">
      <div className="flex max-h-[95vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border-2 border-emerald-600 bg-emerald-50 shadow-2xl">
        <div className="shrink-0 bg-emerald-800 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">ONESIP Shift Responsibility</p><h2 className="mt-1 text-2xl font-black">{lang === 'zh' ? t.labelZh : t.labelEn}</h2><p className="mt-1 text-xs font-bold text-emerald-100">{dateLabel} · {context.shift.start}–{context.shift.end}</p></div>{!forced && <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-white/15 px-3 py-2 text-xs font-black">{lang === 'zh' ? '关闭' : 'Close'}</button>}</div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">{lang === 'zh' ? '身份 / Role' : 'Role'}</p><p className="mt-1 text-base font-black text-gray-900">{lang === 'zh' ? t.roleZh : t.roleEn}</p></div><div className="rounded-2xl border border-emerald-200 bg-white p-4"><p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">{lang === 'zh' ? '核心责任 / Main job' : 'Main job'}</p><p className="mt-1 text-sm font-black leading-relaxed text-gray-900">{lang === 'zh' ? t.mainZh : t.mainEn}</p></div></div>
          <ResponsibilitySection title={lang === 'zh' ? '具体要做' : 'What to do'} items={tasks}/>
          <ResponsibilitySection title={lang === 'zh' ? '做到什么标准' : 'Pass standard'} items={standards}/>
          <ResponsibilitySection title={lang === 'zh' ? '记录与异常' : 'Record & escalate'} items={escalate}/>
          <ResponsibilitySection title={lang === 'zh' ? '所有班次共同原则' : 'Overall rules for every shift'} items={overall}/>
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><div className="grid grid-cols-3 gap-2 text-center text-[10px] font-black text-amber-950"><div className="rounded-lg bg-white p-2">{lang === 'zh' ? '先补再记' : 'Refill first, record after'}</div><div className="rounded-lg bg-white p-2">FIFO</div><div className="rounded-lg bg-white p-2">{lang === 'zh' ? '不提交 = 没做' : 'No record = not done'}</div></div></div>
          {forced && <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-emerald-300 bg-white p-4"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-5 w-5 accent-emerald-700"/><span className="text-sm font-black leading-relaxed text-gray-900">{lang === 'zh' ? '我已完整阅读并理解本班责任。我会按以上标准执行；无法完成或发现异常时会及时记录并反馈。' : 'I have read and understood my responsibilities for this shift. I will follow them and record/escalate anything I cannot complete.'}</span></label>}
        </div>
        {forced && <div className="shrink-0 border-t border-emerald-200 bg-white p-4"><button type="button" disabled={!checked || saving} onClick={acknowledge} className={checked && !saving ? 'w-full rounded-2xl bg-emerald-700 py-4 text-base font-black text-white shadow-lg' : 'w-full cursor-not-allowed rounded-2xl bg-gray-200 py-4 text-base font-black text-gray-400'}>{saving ? (lang === 'zh' ? '正在记录确认…' : 'Recording…') : (lang === 'zh' ? '确认：我知道并会履行本班责任' : 'CONFIRM MY SHIFT RESPONSIBILITY')}</button><p className="mt-2 text-center text-[11px] font-bold text-red-500">{lang === 'zh' ? '必须勾选并成功记录后才能继续使用系统。' : 'You must acknowledge and successfully record this before continuing.'}</p></div>}
      </div>
    </div>}
  </>;
}
