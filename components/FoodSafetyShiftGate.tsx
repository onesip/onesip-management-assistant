import React, { useEffect, useMemo, useState } from 'react';
import type { Lang, User } from '../types';
import * as Cloud from '../services/cloud';

type ShiftRole = 'opening' | 'closing';
type Answer = boolean | null;

type RoleContext = {
  role: ShiftRole;
  dateKey: string;
  start: number;
  end: number;
  shiftLabel: string;
};

type ItemCheck = {
  expiryOk: Answer;
  freshOk: Answer;
  wasteQty: string;
  wasteUnit: string;
  replaced: boolean;
  note: string;
};

type ItemKey = 'waterchestnut' | 'yogurt' | 'lemon';

const VERSION = 'food_safety_shift_check_2026_09_18_v1';
// Deployment retry marker: no behavior change.

const ITEM_META: Record<ItemKey, { zh: string; en: string }> = {
  waterchestnut: { zh: '马蹄爆爆珠', en: 'Waterchestnut boba' },
  yogurt: { zh: '酸奶', en: 'Yogurt' },
  lemon: { zh: '柠檬', en: 'Lemon' },
};

const emptyItem = (): ItemCheck => ({
  expiryOk: null,
  freshOk: null,
  wasteQty: '',
  wasteUnit: '',
  replaced: false,
  note: '',
});

function parseMinutes(value: unknown): number | null {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

function formatMinutes(value: number): string {
  const normalized = ((value % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function dateKey(now: Date): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function matchesToday(raw: unknown, now: Date): boolean {
  const value = String(raw || '').trim().replace(/[/.]/g, '-');
  if (!value) return false;
  const parts = value.split('-').filter(Boolean).map(Number);
  if (parts.some(Number.isNaN)) return false;
  if (parts.length === 2) return parts[0] === now.getMonth() + 1 && parts[1] === now.getDate();
  if (parts.length === 3) return parts[0] === now.getFullYear() && parts[1] === now.getMonth() + 1 && parts[2] === now.getDate();
  return false;
}

function normalizeName(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function getRoleContexts(schedule: any, currentUser: User | null | undefined, storeId: string, now: Date): RoleContext[] {
  if (!currentUser || currentUser.role !== 'staff' || !Array.isArray(schedule?.days)) return [];

  const today = schedule.days.find((day: any) =>
    matchesToday(day?.date, now) && (day?.storeId || 'default_store') === storeId
  );
  if (!today || !Array.isArray(today.shifts) || today.shifts.length === 0) return [];

  const parsed = today.shifts
    .map((shift: any) => {
      const start = parseMinutes(shift?.start);
      const rawEnd = parseMinutes(shift?.end);
      if (start === null || rawEnd === null || !Array.isArray(shift?.staff) || shift.staff.length === 0) return null;
      let end = rawEnd;
      if (end < start) end += 1440;
      return { shift, start, end };
    })
    .filter(Boolean) as Array<{ shift: any; start: number; end: number }>;

  if (parsed.length === 0) return [];

  const earliestStart = Math.min(...parsed.map((item) => item.start));
  const latestEnd = Math.max(...parsed.map((item) => item.end));
  const openingShifts = parsed.filter((item) => item.start === earliestStart);
  const closingShifts = parsed.filter((item) => item.end === latestEnd);
  const userName = normalizeName(currentUser.name);
  const isOn = (items: typeof parsed) => items.some((item) =>
    item.shift.staff.some((name: string) => normalizeName(name) === userName)
  );

  const key = dateKey(now);
  const result: RoleContext[] = [];

  if (isOn(openingShifts)) {
    const openingEnd = Math.max(...openingShifts.map((item) => item.end));
    result.push({
      role: 'opening',
      dateKey: key,
      start: earliestStart,
      end: openingEnd,
      shiftLabel: formatMinutes(earliestStart) + '–' + formatMinutes(openingEnd),
    });
  }

  if (isOn(closingShifts)) {
    const closingStart = Math.min(...closingShifts.map((item) => item.start));
    result.push({
      role: 'closing',
      dateKey: key,
      start: closingStart,
      end: latestEnd,
      shiftLabel: formatMinutes(closingStart) + '–' + formatMinutes(latestEnd),
    });
  }

  return result;
}

function localAckKey(storeId: string, userId: string, ctx: RoleContext): string {
  return ['onesip', VERSION, storeId, ctx.dateKey, userId, ctx.role].join('_');
}

function hasCloudAck(logs: any[], storeId: string, userId: string, ctx: RoleContext): boolean {
  const targetKpi = ctx.role === 'opening' ? 'FOOD_SAFETY_OPENING_ACK' : 'FOOD_SAFETY_CLOSING_ACK';
  return (logs || []).some((log: any) =>
    log &&
    log.kpi === targetKpi &&
    log.userId === userId &&
    (log.storeId || 'default_store') === storeId &&
    log.foodSafetyDate === ctx.dateKey &&
    log.foodSafetyVersion === VERSION
  );
}

function shouldForce(ctx: RoleContext, now: Date): boolean {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  if (ctx.role === 'opening') return nowMinutes >= Math.max(0, ctx.start - 120);
  return nowMinutes >= Math.max(0, ctx.start - 30);
}

function BinaryChoice({
  label,
  value,
  onChange,
  yesText,
  noText,
  testId,
}: {
  label: string;
  value: Answer;
  onChange: (value: boolean) => void;
  yesText: string;
  noText: string;
  testId: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-black text-gray-900">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid={testId + '-yes'}
          onClick={() => onChange(true)}
          className={value === true ? 'rounded-xl border-2 border-emerald-600 bg-emerald-50 px-3 py-2.5 text-sm font-black text-emerald-800' : 'rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-600'}
        >
          {yesText}
        </button>
        <button
          type="button"
          data-testid={testId + '-no'}
          onClick={() => onChange(false)}
          className={value === false ? 'rounded-xl border-2 border-red-500 bg-red-50 px-3 py-2.5 text-sm font-black text-red-700' : 'rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-600'}
        >
          {noText}
        </button>
      </div>
    </div>
  );
}

function OpeningItemCard({
  itemKey,
  value,
  onChange,
  lang,
}: {
  itemKey: ItemKey;
  value: ItemCheck;
  onChange: (next: ItemCheck) => void;
  lang: Lang;
}) {
  const meta = ITEM_META[itemKey];
  const hasIssue = value.expiryOk === false || value.freshOk === false;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-black text-gray-900">{lang === 'zh' ? meta.zh : meta.en}</h3>
        <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-black text-red-600">
          {lang === 'zh' ? '重点检查' : 'PRIORITY'}
        </span>
      </div>

      <div className="space-y-4">
        <BinaryChoice
          label={lang === 'zh' ? '有效期是否正常？' : 'Is it within expiry?'}
          value={value.expiryOk}
          onChange={(answer) => onChange({ ...value, expiryOk: answer })}
          yesText={lang === 'zh' ? '✓ 有效' : '✓ Valid'}
          noText={lang === 'zh' ? '✕ 已过期' : '✕ Expired'}
          testId={'fs-opening-' + itemKey + '-expiry'}
        />
        <BinaryChoice
          label={lang === 'zh' ? '是否无变质迹象？' : 'No signs of spoilage?'}
          value={value.freshOk}
          onChange={(answer) => onChange({ ...value, freshOk: answer })}
          yesText={lang === 'zh' ? '✓ 正常' : '✓ OK'}
          noText={lang === 'zh' ? '✕ 有变质' : '✕ Spoiled'}
          testId={'fs-opening-' + itemKey + '-fresh'}
        />

        {hasIssue && (
          <div className="space-y-3 rounded-xl border-2 border-red-200 bg-red-50 p-3">
            <p className="text-xs font-black text-red-700">
              {lang === 'zh' ? '发现异常：必须报损、丢弃并换新后才能提交。' : 'Issue found: record waste, discard it, and replace it before submitting.'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <input
                data-testid={'fs-opening-' + itemKey + '-waste-qty'}
                type="number"
                min="0"
                step="0.01"
                value={value.wasteQty}
                onChange={(e) => onChange({ ...value, wasteQty: e.target.value })}
                placeholder={lang === 'zh' ? '报损数量' : 'Waste qty'}
                className="rounded-xl border border-red-200 bg-white p-2.5 text-sm font-bold outline-none"
              />
              <input
                data-testid={'fs-opening-' + itemKey + '-waste-unit'}
                value={value.wasteUnit}
                onChange={(e) => onChange({ ...value, wasteUnit: e.target.value })}
                placeholder={lang === 'zh' ? '单位，如 pcs / box' : 'Unit, pcs / box'}
                className="rounded-xl border border-red-200 bg-white p-2.5 text-sm font-bold outline-none"
              />
            </div>
            <input
              value={value.note}
              onChange={(e) => onChange({ ...value, note: e.target.value })}
              placeholder={lang === 'zh' ? '备注（可选）' : 'Note (optional)'}
              className="w-full rounded-xl border border-red-200 bg-white p-2.5 text-sm outline-none"
            />
            <label className="flex items-start gap-2 text-sm font-black text-red-800">
              <input
                data-testid={'fs-opening-' + itemKey + '-replaced'}
                type="checkbox"
                checked={value.replaced}
                onChange={(e) => onChange({ ...value, replaced: e.target.checked })}
                className="mt-0.5 h-5 w-5 accent-red-600"
              />
              <span>{lang === 'zh' ? '我已丢弃异常物料，并换上可用的新物料。' : 'I discarded the unsafe item and replaced it with usable stock.'}</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

export function FoodSafetyShiftGate({
  currentUser,
  schedule,
  storeId,
  lang,
  logs,
}: {
  currentUser: User | null | undefined;
  schedule: any;
  storeId: string;
  lang: Lang;
  logs?: any[];
}) {
  const [clock, setClock] = useState(() => Date.now());
  const [ackRevision, setAckRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [checks, setChecks] = useState<Record<ItemKey, ItemCheck>>({
    waterchestnut: emptyItem(),
    yogurt: emptyItem(),
    lemon: emptyItem(),
  });
  const [allMaterialsExpiry, setAllMaterialsExpiry] = useState<Answer>(null);
  const [otherIssueName, setOtherIssueName] = useState('');
  const [otherWasteQty, setOtherWasteQty] = useState('');
  const [otherWasteUnit, setOtherWasteUnit] = useState('');
  const [otherReplaced, setOtherReplaced] = useState(false);

  const [checkedAllLabels, setCheckedAllLabels] = useState(false);
  const [missingLabels, setMissingLabels] = useState<Answer>(null);
  const [labelsAddedCount, setLabelsAddedCount] = useState('');
  const [fixedMissingLabels, setFixedMissingLabels] = useState(false);
  const [allLabelsComplete, setAllLabelsComplete] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const now = useMemo(() => new Date(clock), [clock]);
  const contexts = useMemo(
    () => getRoleContexts(schedule, currentUser, storeId, now),
    [schedule, currentUser, storeId, now, ackRevision, logs]
  );

  const activeContext = useMemo(() => {
    if (!currentUser) return null;
    return contexts.find((ctx) => {
      if (!shouldForce(ctx, now)) return false;
      const localDone = localStorage.getItem(localAckKey(storeId, currentUser.id, ctx));
      return !localDone && !hasCloudAck(logs || [], storeId, currentUser.id, ctx);
    }) || null;
  }, [contexts, currentUser, storeId, logs, now, ackRevision]);

  useEffect(() => {
    setSaveError('');
    if (!activeContext) return;
    if (activeContext.role === 'opening') {
      setChecks({ waterchestnut: emptyItem(), yogurt: emptyItem(), lemon: emptyItem() });
      setAllMaterialsExpiry(null);
      setOtherIssueName('');
      setOtherWasteQty('');
      setOtherWasteUnit('');
      setOtherReplaced(false);
    } else {
      setCheckedAllLabels(false);
      setMissingLabels(null);
      setLabelsAddedCount('');
      setFixedMissingLabels(false);
      setAllLabelsComplete(false);
    }
  }, [activeContext?.dateKey, activeContext?.role]);

  if (!activeContext || !currentUser || currentUser.role !== 'staff') return null;

  const priorityItems = Object.entries(checks) as Array<[ItemKey, ItemCheck]>;
  const anyPriorityExpired = priorityItems.some(([, item]) => item.expiryOk === false);
  const priorityComplete = priorityItems.every(([, item]) => {
    if (item.expiryOk === null || item.freshOk === null) return false;
    const issue = item.expiryOk === false || item.freshOk === false;
    if (!issue) return true;
    return Number(item.wasteQty) > 0 && item.wasteUnit.trim().length > 0 && item.replaced;
  });
  const expiryConsistencyOk = !(anyPriorityExpired && allMaterialsExpiry === true);
  const otherIssueRequired = allMaterialsExpiry === false && !anyPriorityExpired;
  const otherIssueComplete = !otherIssueRequired || (
    otherIssueName.trim().length > 0 &&
    Number(otherWasteQty) > 0 &&
    otherWasteUnit.trim().length > 0 &&
    otherReplaced
  );
  const openingReady =
    priorityComplete &&
    allMaterialsExpiry !== null &&
    expiryConsistencyOk &&
    otherIssueComplete;

  const closingReady =
    checkedAllLabels &&
    missingLabels !== null &&
    (missingLabels === false || (Number(labelsAddedCount) > 0 && fixedMissingLabels)) &&
    allLabelsComplete;

  const saveAuditLog = async (ctx: RoleContext, details: any) => {
    const acknowledgedAt = new Date().toISOString();
    const log: any = {
      id: Date.now(),
      type: 'checklist',
      name: currentUser.name,
      userId: currentUser.id,
      shift: ctx.role,
      time: acknowledgedAt,
      status: 'completed',
      kpi: ctx.role === 'opening' ? 'FOOD_SAFETY_OPENING_ACK' : 'FOOD_SAFETY_CLOSING_ACK',
      reason: JSON.stringify(details),
      storeId,
      foodSafetyDate: ctx.dateKey,
      foodSafetyRole: ctx.role,
      foodSafetyVersion: VERSION,
      scheduledShift: ctx.shiftLabel,
      foodSafetyDetails: details,
    };
    await Promise.resolve((Cloud as any).saveLog?.(log));
    localStorage.setItem(localAckKey(storeId, currentUser.id, ctx), acknowledgedAt);
  };

  const submitOpening = async () => {
    if (!openingReady || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const wasteData: Record<string, { loss: string; reason: string }> = {};
      priorityItems.forEach(([key, item]) => {
        if (item.expiryOk === false || item.freshOk === false) {
          const meta = ITEM_META[key];
          const problems = [
            item.expiryOk === false ? 'Expired' : '',
            item.freshOk === false ? 'Spoiled' : '',
          ].filter(Boolean).join(' + ');
          wasteData[meta.en + ' / ' + meta.zh] = {
            loss: item.wasteQty,
            reason: problems + '; unit=' + item.wasteUnit.trim() + '; discarded & replaced' + (item.note.trim() ? '; ' + item.note.trim() : ''),
          };
        }
      });

      if (allMaterialsExpiry === false && otherIssueName.trim()) {
        wasteData['Other food-safety item: ' + otherIssueName.trim()] = {
          loss: otherWasteQty,
          reason: 'Expired/unsafe material; unit=' + otherWasteUnit.trim() + '; discarded & replaced',
        };
      }

      if (Object.keys(wasteData).length > 0) {
        await Promise.resolve((Cloud as any).saveInventoryReport?.({
          id: 'food_safety_waste_' + Date.now(),
          date: new Date().toISOString(),
          storeId,
          submittedBy: currentUser.name,
          userId: currentUser.id,
          shift: 'waste',
          source: 'opening_food_safety_gate',
          data: wasteData,
        }));
      }

      await saveAuditLog(activeContext, {
        allMaterialsExpiry,
        items: checks,
        otherIssueName: otherIssueName.trim(),
        otherWasteQty,
        otherWasteUnit: otherWasteUnit.trim(),
        otherReplaced,
        wasteRecorded: Object.keys(wasteData).length > 0,
      });
      setAckRevision((value) => value + 1);
    } catch (error) {
      console.error('[food-safety] opening save failed', error);
      setSaveError(lang === 'zh' ? '保存失败，请检查网络后重试。未保存前不能跳过。' : 'Save failed. Check the connection and try again. You cannot skip this check.');
    } finally {
      setSaving(false);
    }
  };

  const submitClosing = async () => {
    if (!closingReady || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await saveAuditLog(activeContext, {
        checkedAllLabels,
        missingLabels,
        labelsAddedCount: missingLabels ? Number(labelsAddedCount) : 0,
        fixedMissingLabels: missingLabels ? fixedMissingLabels : true,
        allLabelsComplete,
      });
      setAckRevision((value) => value + 1);
    } catch (error) {
      console.error('[food-safety] closing save failed', error);
      setSaveError(lang === 'zh' ? '保存失败，请检查网络后重试。未保存前不能跳过。' : 'Save failed. Check the connection and try again. You cannot skip this check.');
    } finally {
      setSaving(false);
    }
  };

  const isOpening = activeContext.role === 'opening';

  return (
    <div
      data-testid={isOpening ? 'food-safety-opening-gate' : 'food-safety-closing-gate'}
      className="fixed inset-0 z-[13050] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
    >
      <div className="flex max-h-[96dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-gray-50 shadow-2xl">
        <div className={isOpening ? 'shrink-0 border-b border-emerald-200 bg-emerald-50 p-5' : 'shrink-0 border-b border-indigo-200 bg-indigo-50 p-5'}>
          <div className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">
            ONESIP • {activeContext.dateKey} • {activeContext.shiftLabel}
          </div>
          <h2 className="text-xl font-black text-gray-950">
            {isOpening
              ? (lang === 'zh' ? '🛡️ 早班食品安全检查' : '🛡️ Opening Food Safety Check')
              : (lang === 'zh' ? '🏷️ 晚班有效期标签检查' : '🏷️ Closing Expiry Label Check')}
          </h2>
          <p className="mt-1 text-xs font-bold text-gray-600">
            {isOpening
              ? (lang === 'zh' ? '系统已自动识别你是今天最早开班人员。每一项都必须检查。' : 'You are automatically identified as today’s opening staff. Every item must be checked.')
              : (lang === 'zh' ? '系统已自动识别你是今天最晚收班人员。所有物料标签必须检查完。' : 'You are automatically identified as today’s closing staff. Every material label must be checked.')}
          </p>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {isOpening ? (
            <>
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm font-black leading-relaxed text-amber-950">
                {lang === 'zh'
                  ? '先检查有效期，再看颜色、气味、质地等是否有异常。过期或变质的物料必须立即报损、丢弃并换新。'
                  : 'Check expiry first, then check color, smell, texture and other spoilage signs. Expired or spoiled stock must be wasted, discarded and replaced immediately.'}
              </div>

              <OpeningItemCard itemKey="waterchestnut" value={checks.waterchestnut} onChange={(next) => setChecks({ ...checks, waterchestnut: next })} lang={lang} />
              <OpeningItemCard itemKey="yogurt" value={checks.yogurt} onChange={(next) => setChecks({ ...checks, yogurt: next })} lang={lang} />
              <OpeningItemCard itemKey="lemon" value={checks.lemon} onChange={(next) => setChecks({ ...checks, lemon: next })} lang={lang} />

              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <BinaryChoice
                  label={lang === 'zh' ? '你是否确认：所有物料都在有效期内？' : 'Do you confirm ALL materials are within expiry?'}
                  value={allMaterialsExpiry}
                  onChange={setAllMaterialsExpiry}
                  yesText={lang === 'zh' ? '✓ 全部有效' : '✓ All valid'}
                  noText={lang === 'zh' ? '✕ 有过期物料' : '✕ Expired item found'}
                  testId="fs-opening-all-expiry"
                />

                {!expiryConsistencyOk && (
                  <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs font-black text-red-700">
                    {lang === 'zh' ? '上面已有物料标记“已过期”，这里不能选择“全部有效”。' : 'An item above is marked expired, so “All valid” cannot be selected.'}
                  </p>
                )}

                {otherIssueRequired && (
                  <div className="mt-4 space-y-3 rounded-xl border-2 border-red-200 bg-red-50 p-3">
                    <p className="text-xs font-black text-red-700">
                      {lang === 'zh' ? '请写出其他过期物料，并完成报损和换新。' : 'List the other expired material and complete waste + replacement.'}
                    </p>
                    <input
                      data-testid="fs-opening-other-name"
                      value={otherIssueName}
                      onChange={(e) => setOtherIssueName(e.target.value)}
                      placeholder={lang === 'zh' ? '物料名称' : 'Material name'}
                      className="w-full rounded-xl border border-red-200 bg-white p-2.5 text-sm font-bold outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        data-testid="fs-opening-other-waste-qty"
                        type="number"
                        min="0"
                        step="0.01"
                        value={otherWasteQty}
                        onChange={(e) => setOtherWasteQty(e.target.value)}
                        placeholder={lang === 'zh' ? '报损数量' : 'Waste qty'}
                        className="rounded-xl border border-red-200 bg-white p-2.5 text-sm font-bold outline-none"
                      />
                      <input
                        data-testid="fs-opening-other-waste-unit"
                        value={otherWasteUnit}
                        onChange={(e) => setOtherWasteUnit(e.target.value)}
                        placeholder={lang === 'zh' ? '单位' : 'Unit'}
                        className="rounded-xl border border-red-200 bg-white p-2.5 text-sm font-bold outline-none"
                      />
                    </div>
                    <label className="flex items-start gap-2 text-sm font-black text-red-800">
                      <input
                        data-testid="fs-opening-other-replaced"
                        type="checkbox"
                        checked={otherReplaced}
                        onChange={(e) => setOtherReplaced(e.target.checked)}
                        className="mt-0.5 h-5 w-5 accent-red-600"
                      />
                      <span>{lang === 'zh' ? '已报损、丢弃并换新。' : 'Waste recorded, discarded and replaced.'}</span>
                    </label>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-4 text-sm font-black leading-relaxed text-indigo-950">
                {lang === 'zh'
                  ? '晚班必须逐一检查所有已开封、已备料和在用物料的有效期标签。没有标签、标签模糊或日期不完整的，当班补好。'
                  : 'Closing staff must check expiry/date labels on every opened, prepared and in-use material. Missing, unclear or incomplete labels must be fixed during the shift.'}
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <input
                  data-testid="fs-closing-checked-all"
                  type="checkbox"
                  checked={checkedAllLabels}
                  onChange={(e) => setCheckedAllLabels(e.target.checked)}
                  className="mt-0.5 h-5 w-5 accent-indigo-600"
                />
                <span className="text-sm font-black leading-relaxed text-gray-900">
                  {lang === 'zh' ? '我已逐一检查每个物料的有效期 / 日期标签。' : 'I checked the expiry/date label on every material.'}
                </span>
              </label>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <BinaryChoice
                  label={lang === 'zh' ? '检查时是否发现缺失 / 模糊 / 不完整的标签？' : 'Did you find any missing / unclear / incomplete labels?'}
                  value={missingLabels}
                  onChange={setMissingLabels}
                  yesText={lang === 'zh' ? '有' : 'Yes'}
                  noText={lang === 'zh' ? '没有' : 'No'}
                  testId="fs-closing-missing"
                />

                {missingLabels === true && (
                  <div className="mt-4 space-y-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-3">
                    <input
                      data-testid="fs-closing-label-count"
                      type="number"
                      min="1"
                      step="1"
                      value={labelsAddedCount}
                      onChange={(e) => setLabelsAddedCount(e.target.value)}
                      placeholder={lang === 'zh' ? '补了多少个标签？' : 'How many labels were added?'}
                      className="w-full rounded-xl border border-amber-200 bg-white p-2.5 text-sm font-bold outline-none"
                    />
                    <label className="flex items-start gap-2 text-sm font-black text-amber-900">
                      <input
                        data-testid="fs-closing-fixed-missing"
                        type="checkbox"
                        checked={fixedMissingLabels}
                        onChange={(e) => setFixedMissingLabels(e.target.checked)}
                        className="mt-0.5 h-5 w-5 accent-amber-600"
                      />
                      <span>{lang === 'zh' ? '所有缺失 / 模糊标签都已经补好或重新贴好。' : 'Every missing/unclear label has been added or replaced.'}</span>
                    </label>
                  </div>
                )}
              </div>

              <label className="flex items-start gap-3 rounded-2xl border-2 border-indigo-200 bg-white p-4 shadow-sm">
                <input
                  data-testid="fs-closing-all-complete"
                  type="checkbox"
                  checked={allLabelsComplete}
                  onChange={(e) => setAllLabelsComplete(e.target.checked)}
                  className="mt-0.5 h-5 w-5 accent-indigo-600"
                />
                <span className="text-sm font-black leading-relaxed text-gray-900">
                  {lang === 'zh' ? '我确认：现在没有任何在用物料缺少有效期 / 日期标签。' : 'I confirm: no in-use material is left without a valid expiry/date label.'}
                </span>
              </label>
            </>
          )}

          {saveError && <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm font-black text-red-700">{saveError}</div>}
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white p-4">
          <button
            type="button"
            data-testid={isOpening ? 'fs-opening-submit' : 'fs-closing-submit'}
            disabled={saving || (isOpening ? !openingReady : !closingReady)}
            onClick={isOpening ? submitOpening : submitClosing}
            className={saving || (isOpening ? !openingReady : !closingReady)
              ? 'w-full cursor-not-allowed rounded-2xl bg-gray-200 py-4 text-sm font-black text-gray-400'
              : 'w-full rounded-2xl bg-gray-950 py-4 text-sm font-black text-white shadow-lg active:scale-[0.99]'}
          >
            {saving
              ? (lang === 'zh' ? '正在保存…' : 'Saving…')
              : (isOpening
                ? (lang === 'zh' ? '确认检查完成并提交' : 'CONFIRM & SUBMIT OPENING CHECK')
                : (lang === 'zh' ? '确认标签检查完成并提交' : 'CONFIRM & SUBMIT CLOSING CHECK'))}
          </button>
          <p className="mt-2 text-center text-[11px] font-bold text-red-500">
            {lang === 'zh' ? '这是当天强制任务。所有必填项完成并成功保存前，不能跳过。' : 'Mandatory today. You cannot skip until every required item is complete and saved.'}
          </p>
        </div>
      </div>
    </div>
  );
}

class FoodSafetyBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[food-safety] gate crashed and was isolated', error, info);
  }
  render() { return this.state.failed ? null : this.props.children; }
}

export function SafeFoodSafetyShiftGate(props: {
  currentUser: User | null | undefined;
  schedule: any;
  storeId: string;
  lang: Lang;
  logs?: any[];
}) {
  return <FoodSafetyBoundary><FoodSafetyShiftGate {...props} /></FoodSafetyBoundary>;
}
