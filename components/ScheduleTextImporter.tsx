import React, { useMemo, useState } from 'react';
import * as Cloud from '../services/cloud';

type ParsedShift = {
  start: string;
  end: string;
  staff: string[];
};

type ParsedDay = {
  date: string;
  name: string;
  shifts: ParsedShift[];
  lineNumber: number;
};

type ParseIssue = {
  lineNumber: number;
  message: string;
};

type ParseResult = {
  days: ParsedDay[];
  errors: ParseIssue[];
  warnings: ParseIssue[];
};

type Props = {
  schedule: any;
  setSchedule: (schedule: any) => void;
  activeStoreId: string;
  availableStaff: string[];
};

const WEEKDAY_PREFIX = /^(?:(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|周[一二三四五六日天])\s*[,，:：-]?\s*)/i;
const TIME_RANGE = /(\d{1,2}:\d{1,2}|\d{3,4}|\d{1,2})\s*(?:-|–|—|~|～|至|到)\s*(\d{1,2}:\d{1,2}|\d{3,4}|\d{1,2})/g;

const pad2 = (value: number) => String(value).padStart(2, '0');

function normalizeTime(raw: string): string | null {
  const value = raw.trim();
  let hour = 0;
  let minute = 0;

  if (value.includes(':')) {
    const [h, m] = value.split(':');
    hour = Number(h);
    minute = Number(m || 0);
  } else if (value.length === 3 || value.length === 4) {
    hour = Number(value.slice(0, -2));
    minute = Number(value.slice(-2));
  } else {
    hour = Number(value);
    minute = 0;
  }

  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function minutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function resolveYear(month: number, explicitYear?: number): number {
  if (explicitYear) return explicitYear;
  const now = new Date();
  let year = now.getFullYear();
  // The schedule UI spans the current and next month. Handle Dec -> Jan naturally.
  if (now.getMonth() === 11 && month === 1) year += 1;
  return year;
}

function parseDatePrefix(rawLine: string): { month: number; day: number; year?: number; rest: string } | null {
  const line = rawLine.trim().replace(WEEKDAY_PREFIX, '');

  const full = line.match(/^(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\s*[,，:：]?\s*(.*)$/);
  if (full) {
    return { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]), rest: full[4] };
  }

  const short = line.match(/^(\d{1,2})[\/.\-](\d{1,2})\s*[,，:：]?\s*(.*)$/);
  if (short) {
    return { month: Number(short[1]), day: Number(short[2]), rest: short[3] };
  }

  return null;
}

function validMonthDay(month: number, day: number, year: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function canonicalStaffName(raw: string, availableStaff: string[]): string | null {
  const normalized = raw.trim().replace(/^[\s,，;；|:+＋&＆、\/]+|[\s,，;；|:+＋&＆、\/]+$/g, '');
  if (!normalized) return null;
  const lower = normalized.toLocaleLowerCase();
  return availableStaff.find(name => name.trim().toLocaleLowerCase() === lower) || null;
}

function splitStaff(segment: string, availableStaff: string[]): { staff: string[]; unknown: string[] } {
  const cleaned = segment
    .replace(/^[\s,，;；|:+＋&＆、\/]+/, '')
    .replace(/[\s,，;；|:+＋&＆、\/]+$/, '')
    .trim();

  if (!cleaned) return { staff: [], unknown: [] };

  const pieces = cleaned
    .split(/\s*(?:,|，|\+|＋|&|＆|、|;|；|\||\/)\s*/)
    .map(piece => piece.trim())
    .filter(Boolean);

  const staff: string[] = [];
  const unknown: string[] = [];

  pieces.forEach(piece => {
    const canonical = canonicalStaffName(piece, availableStaff);
    if (canonical) {
      if (!staff.includes(canonical)) staff.push(canonical);
    } else {
      unknown.push(piece);
    }
  });

  return { staff, unknown };
}

type ExportRange = {
  start: Date;
  end: Date;
};

type ExportResult = {
  text: string;
  dayCount: number;
};

function localDate(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function startOfWeekMonday(value: Date): Date {
  const date = localDate(value);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

function endOfWeekSunday(value: Date): Date {
  const date = startOfWeekMonday(value);
  date.setDate(date.getDate() + 6);
  return date;
}

function toDateInputValue(value: Date): string {
  return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
}

function parseDateInputValue(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1]) ||
    date.getMonth() !== Number(match[2]) - 1 ||
    date.getDate() !== Number(match[3])
  ) return null;
  return date;
}

function dateForScheduleDayInRange(raw: unknown, range: ExportRange): Date | null {
  const match = String(raw || '').trim().match(/^(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const startYear = range.start.getFullYear() - 1;
  const endYear = range.end.getFullYear() + 1;

  for (let year = startYear; year <= endYear; year += 1) {
    const candidate = new Date(year, month - 1, day);
    if (
      candidate.getFullYear() !== year ||
      candidate.getMonth() !== month - 1 ||
      candidate.getDate() !== day
    ) continue;
    if (candidate >= range.start && candidate <= range.end) return candidate;
  }
  return null;
}

function buildScheduleExport(schedule: any, activeStoreId: string, range: ExportRange): ExportResult {
  const rows = (Array.isArray(schedule?.days) ? schedule.days : [])
    .map((day: any) => {
      const storeId = day?.storeId || 'default_store';
      if (storeId !== activeStoreId) return null;
      const date = dateForScheduleDayInRange(day?.date, range);
      if (!date) return null;

      const shifts = (Array.isArray(day?.shifts) ? day.shifts : [])
        .filter((shift: any) =>
          typeof shift?.start === 'string' &&
          typeof shift?.end === 'string' &&
          Array.isArray(shift?.staff) &&
          shift.staff.filter(Boolean).length > 0
        )
        .sort((a: any, b: any) => minutes(a.start) - minutes(b.start));

      if (shifts.length === 0) return null;

      const payload = shifts
        .map((shift: any) => `${shift.start}-${shift.end} ${shift.staff.filter(Boolean).join(', ')}`)
        .join(', ');

      return {
        date,
        line: `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${payload}`,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());

  return {
    text: rows.map((row: any) => row.line).join('\n'),
    dayCount: rows.length,
  };
}

export function parseScheduleText(text: string, availableStaff: string[]): ParseResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const days: ParsedDay[] = [];
  const seenDates = new Set<string>();
  const lines = text.split(/\r?\n/);

  lines.forEach((originalLine, index) => {
    const lineNumber = index + 1;
    const rawLine = originalLine.trim();
    if (!rawLine) return;

    const dateInfo = parseDatePrefix(rawLine);
    if (!dateInfo) {
      errors.push({ lineNumber, message: '找不到日期。请以 8/24 或 2026/8/24 开头。' });
      return;
    }

    const year = resolveYear(dateInfo.month, dateInfo.year);
    if (!validMonthDay(dateInfo.month, dateInfo.day, year)) {
      errors.push({ lineNumber, message: `日期无效：${dateInfo.month}/${dateInfo.day}` });
      return;
    }

    const dateKey = `${dateInfo.month}-${dateInfo.day}`;
    if (seenDates.has(dateKey)) {
      errors.push({ lineNumber, message: `${dateInfo.month}/${dateInfo.day} 重复了。每个日期请只写一行。` });
      return;
    }
    seenDates.add(dateKey);

    const payload = dateInfo.rest.trim();
    if (!payload) {
      errors.push({ lineNumber, message: '这一天没有写班次。' });
      return;
    }

    const matches = Array.from(payload.matchAll(TIME_RANGE));
    TIME_RANGE.lastIndex = 0;
    if (matches.length === 0) {
      errors.push({ lineNumber, message: '找不到时间段。示例：11:30-16:00 Aisha' });
      return;
    }

    const shifts: ParsedShift[] = [];

    matches.forEach((match, shiftIndex) => {
      const start = normalizeTime(match[1]);
      const end = normalizeTime(match[2]);
      if (!start || !end) {
        errors.push({ lineNumber, message: `第 ${shiftIndex + 1} 个班次时间格式不正确。` });
        return;
      }
      if (minutes(end) <= minutes(start)) {
        errors.push({ lineNumber, message: `${start}-${end} 结束时间必须晚于开始时间。` });
        return;
      }

      const segmentStart = (match.index || 0) + match[0].length;
      const nextMatch = matches[shiftIndex + 1];
      const segmentEnd = nextMatch ? (nextMatch.index || payload.length) : payload.length;
      const staffSegment = payload.slice(segmentStart, segmentEnd);
      const { staff, unknown } = splitStaff(staffSegment, availableStaff);

      if (unknown.length > 0) {
        errors.push({ lineNumber, message: `无法识别员工：${unknown.join(', ')}。请使用当前门店员工姓名。` });
      }
      if (staff.length === 0) {
        errors.push({ lineNumber, message: `${start}-${end} 没有识别到员工。` });
      }

      shifts.push({ start, end, staff });
    });

    if (shifts.length === 0) return;

    const date = new Date(year, dateInfo.month - 1, dateInfo.day);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Warn when the same employee is accidentally placed in overlapping shifts.
    const staffAssignments = new Map<string, ParsedShift[]>();
    shifts.forEach(shift => {
      shift.staff.forEach(name => {
        const list = staffAssignments.get(name) || [];
        list.push(shift);
        staffAssignments.set(name, list);
      });
    });
    staffAssignments.forEach((assignedShifts, name) => {
      const sorted = [...assignedShifts].sort((a, b) => minutes(a.start) - minutes(b.start));
      for (let i = 1; i < sorted.length; i += 1) {
        if (minutes(sorted[i].start) < minutes(sorted[i - 1].end)) {
          warnings.push({ lineNumber, message: `${name} 在同一天的两个班次时间有重叠，请确认是否故意这样排。` });
          break;
        }
      }
    });

    days.push({
      date: dateKey,
      name: dayNames[date.getDay()],
      shifts: shifts.sort((a, b) => minutes(a.start) - minutes(b.start)),
      lineNumber,
    });
  });

  return { days, errors, warnings };
}

export function ScheduleTextImporter({ schedule, setSchedule, activeStoreId, availableStaff }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<'week' | 'month' | 'custom'>('week');
  const initialWeekStart = startOfWeekMonday(new Date());
  const initialWeekEnd = endOfWeekSunday(new Date());
  const [customStart, setCustomStart] = useState(toDateInputValue(initialWeekStart));
  const [customEnd, setCustomEnd] = useState(toDateInputValue(initialWeekEnd));
  const [exportMessage, setExportMessage] = useState('');

  const sample = useMemo(() => {
    const a = availableStaff[0] || 'Aisha';
    const b = availableStaff[1] || 'Mia';
    const c = availableStaff[2] || 'Olivia';
    return `8/24 11:30-16:00 ${a}, ${b}, 16:00-19:00 ${c}\n8/25 12:00-16:00 ${c}, 16:00-19:00 ${a}`;
  }, [availableStaff]);

  const exportRange = useMemo<ExportRange | null>(() => {
    const now = new Date();
    if (exportMode === 'week') {
      return { start: startOfWeekMonday(now), end: endOfWeekSunday(now) };
    }
    if (exportMode === 'month') {
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      };
    }

    const start = parseDateInputValue(customStart);
    const end = parseDateInputValue(customEnd);
    if (!start || !end || end < start) return null;
    return { start, end };
  }, [exportMode, customStart, customEnd]);

  const exportResult = useMemo(
    () => exportRange ? buildScheduleExport(schedule, activeStoreId, exportRange) : { text: '', dayCount: 0 },
    [schedule, activeStoreId, exportRange]
  );

  const exportRangeLabel = exportRange
    ? `${toDateInputValue(exportRange.start)} → ${toDateInputValue(exportRange.end)}`
    : '请选择有效的日期范围';

  const copyExportText = async () => {
    if (!exportResult.text) return;
    try {
      await navigator.clipboard.writeText(exportResult.text);
      setExportMessage('✅ 已复制，可以直接粘贴回文字排班。');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = exportResult.text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setExportMessage('✅ 已复制，可以直接粘贴回文字排班。');
    }
  };

  const downloadExportText = () => {
    if (!exportResult.text || !exportRange) return;
    const filename = `ONESIP_schedule_${toDateInputValue(exportRange.start)}_to_${toDateInputValue(exportRange.end)}.txt`;
    const blob = new Blob(['\\uFEFF' + exportResult.text + '\\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportMessage(`✅ 已下载 ${filename}`);
  };

  const existingDateKeys = useMemo(() => {
    const keys = new Set<string>();
    (schedule?.days || []).forEach((day: any) => {
      const storeId = day?.storeId || 'default_store';
      if (storeId === activeStoreId && Array.isArray(day?.shifts) && day.shifts.length > 0) keys.add(day.date);
    });
    return keys;
  }, [schedule, activeStoreId]);

  const runPreview = () => {
    setSavedMessage('');
    setPreview(parseScheduleText(text, availableStaff));
  };

  const applyImport = async () => {
    const result = parseScheduleText(text, availableStaff);
    setPreview(result);
    if (result.errors.length > 0 || result.days.length === 0 || saving) return;

    const replacing = result.days.filter(day => existingDateKeys.has(day.date));
    if (replacing.length > 0) {
      const labels = replacing.map(day => day.date.replace('-', '/')).join(', ');
      const confirmed = window.confirm(`These dates already have shifts: ${labels}.\n\nReplace ONLY these listed dates with the pasted schedule?`);
      if (!confirmed) return;
    }

    const importedKeys = new Set(result.days.map(day => day.date));
    const oldDays = Array.isArray(schedule?.days) ? schedule.days : [];
    const untouchedDays = oldDays.filter((day: any) => {
      const storeId = day?.storeId || 'default_store';
      return !(storeId === activeStoreId && importedKeys.has(day.date));
    });

    const importedDays = result.days.map((day, dayIndex) => {
      const existing = oldDays.find((item: any) => (item?.storeId || 'default_store') === activeStoreId && item?.date === day.date);
      return {
        ...(existing || {}),
        date: day.date,
        name: existing?.name || day.name,
        storeId: activeStoreId,
        morning: [],
        evening: [],
        night: [],
        shifts: day.shifts.map((shift, shiftIndex) => ({
          id: `paste_${day.date.replace('-', '_')}_${shift.start.replace(':', '')}_${dayIndex}_${shiftIndex}_${Date.now()}`,
          name: `Shift ${shiftIndex + 1}`,
          start: shift.start,
          end: shift.end,
          staff: shift.staff,
        })),
      };
    });

    const newSchedule = { ...(schedule || {}), days: [...untouchedDays, ...importedDays] };

    setSaving(true);
    try {
      if (!(Cloud as any).saveSchedule) throw new Error('Cloud.saveSchedule is unavailable');
      await (Cloud as any).saveSchedule(newSchedule);
      setSchedule(newSchedule);
      setSavedMessage(`✅ 已保存 ${result.days.length} 天排班。未写到的日期没有改变。`);
    } catch (error) {
      console.error('Paste schedule import failed', error);
      setSavedMessage('❌ 保存失败，原排班没有被替换。请检查网络后重试。');
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    if (saving) return;
    setOpen(false);
    setPreview(null);
    setSavedMessage('');
  };

  return (
    <>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          data-testid="paste-schedule-open"
          onClick={() => setOpen(true)}
          className="w-full bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-400/40 text-emerald-300 font-bold py-2.5 rounded-lg transition-all active:scale-[0.99]"
        >
          📋 文字排班 / Paste Schedule
        </button>
        <button
          type="button"
          data-testid="export-schedule-open"
          onClick={() => { setExportOpen(true); setExportMessage(''); }}
          className="w-full bg-sky-600/20 hover:bg-sky-600/30 border border-sky-400/40 text-sky-300 font-bold py-2.5 rounded-lg transition-all active:scale-[0.99]"
        >
          ⬇️ 导出排班 / Export Schedule
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[12000] bg-black/85 backdrop-blur-sm p-3 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl max-h-[94vh] overflow-hidden rounded-2xl border border-white/10 bg-dark-surface shadow-2xl flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
              <div>
                <h3 className="text-lg font-black text-white">文字排班 / Paste Schedule</h3>
                <p className="mt-1 text-xs text-dark-text-light">一行一个日期。只替换你写到的日期，其他排班不动。</p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white">关闭</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs leading-relaxed text-emerald-100">
                <p className="font-black mb-1">最简单的写法</p>
                <p className="font-mono break-words">8/24 11:30-16:00 Aisha, Mia, 16:00-19:00 Olivia</p>
                <p className="mt-2 text-emerald-200/80">同一个时间后面可以直接写多个名字；下一个时间段出现时，系统会自动开始新的班次。也支持 8-24、2026/8/24、11-16、11:30–16:00。</p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="text-xs font-black uppercase tracking-wide text-dark-text-light">Paste text</label>
                  <button type="button" onClick={() => { setText(sample); setPreview(null); setSavedMessage(''); }} className="text-[11px] font-bold text-emerald-300 underline">填入示例</button>
                </div>
                <textarea
                  data-testid="paste-schedule-input"
                  value={text}
                  onChange={event => { setText(event.target.value); setPreview(null); setSavedMessage(''); }}
                  spellCheck={false}
                  placeholder={sample}
                  className="h-44 w-full resize-y rounded-xl border border-white/15 bg-dark-bg p-3 font-mono text-sm leading-relaxed text-white outline-none focus:border-emerald-400"
                />
              </div>

              <button
                type="button"
                data-testid="paste-schedule-preview"
                onClick={runPreview}
                disabled={!text.trim()}
                className="w-full rounded-xl bg-white/10 py-3 text-sm font-black text-white disabled:opacity-40"
              >
                先预览 / Preview
              </button>

              {preview && (
                <div className="space-y-3" data-testid="paste-schedule-preview-result">
                  {preview.errors.length > 0 && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                      <p className="mb-2 text-xs font-black text-red-300">需要修改</p>
                      <div className="space-y-1">
                        {preview.errors.map((issue, index) => <p key={index} className="text-xs text-red-200">第 {issue.lineNumber} 行：{issue.message}</p>)}
                      </div>
                    </div>
                  )}

                  {preview.warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="mb-2 text-xs font-black text-amber-300">请确认</p>
                      <div className="space-y-1">
                        {preview.warnings.map((issue, index) => <p key={index} className="text-xs text-amber-100">第 {issue.lineNumber} 行：{issue.message}</p>)}
                      </div>
                    </div>
                  )}

                  {preview.days.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black uppercase tracking-wide text-dark-text-light">识别结果</p>
                        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-black text-emerald-300">{preview.days.length} DAYS</span>
                      </div>
                      {preview.days.map(day => (
                        <div key={`${day.date}-${day.lineNumber}`} className="rounded-xl border border-white/10 bg-dark-bg p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-sm font-black text-white">{day.date.replace('-', '/')} · {day.name}</p>
                            {existingDateKeys.has(day.date) && <span className="rounded bg-amber-500/15 px-2 py-1 text-[9px] font-black text-amber-300">WILL REPLACE</span>}
                          </div>
                          <div className="space-y-1.5">
                            {day.shifts.map((shift, index) => (
                              <div key={`${shift.start}-${index}`} className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded bg-emerald-500/15 px-2 py-1 font-mono font-black text-emerald-300">{shift.start}–{shift.end}</span>
                                <span className="font-bold text-gray-200">{shift.staff.join(', ') || '—'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {savedMessage && <div className="rounded-xl border border-white/10 bg-dark-bg p-3 text-sm font-bold text-white">{savedMessage}</div>}
            </div>

            <div className="shrink-0 border-t border-white/10 bg-dark-surface p-4">
              <button
                type="button"
                data-testid="paste-schedule-apply"
                onClick={applyImport}
                disabled={saving || !preview || preview.errors.length > 0 || preview.days.length === 0}
                className="w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-black text-emerald-950 shadow-lg disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
              >
                {saving ? '正在保存…' : '确认导入并保存 / Import & Save'}
              </button>
              <p className="mt-2 text-center text-[10px] font-bold text-dark-text-light">已有班次只会在你列出的日期被替换；其他日期不会改变。</p>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div className="fixed inset-0 z-[12000] bg-black/85 backdrop-blur-sm p-3 flex items-center justify-center" role="dialog" aria-modal="true" data-testid="export-schedule-dialog">
          <div className="w-full max-w-2xl max-h-[94vh] overflow-hidden rounded-2xl border border-white/10 bg-dark-surface shadow-2xl flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-start justify-between gap-3 shrink-0">
              <div>
                <h3 className="text-lg font-black text-white">导出当前排班 / Export Schedule</h3>
                <p className="mt-1 text-xs text-dark-text-light">导出当前门店已经保存的实际班次，手动调整后的结果也会包含。</p>
              </div>
              <button type="button" onClick={() => setExportOpen(false)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white">关闭</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  data-testid="export-schedule-week"
                  onClick={() => { setExportMode('week'); setExportMessage(''); }}
                  className={exportMode === 'week' ? 'rounded-xl border-2 border-sky-400 bg-sky-500/15 px-3 py-3 text-sm font-black text-sky-200' : 'rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold text-gray-300'}
                >
                  本周
                </button>
                <button
                  type="button"
                  data-testid="export-schedule-month"
                  onClick={() => { setExportMode('month'); setExportMessage(''); }}
                  className={exportMode === 'month' ? 'rounded-xl border-2 border-sky-400 bg-sky-500/15 px-3 py-3 text-sm font-black text-sky-200' : 'rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold text-gray-300'}
                >
                  本月
                </button>
                <button
                  type="button"
                  data-testid="export-schedule-custom"
                  onClick={() => { setExportMode('custom'); setExportMessage(''); }}
                  className={exportMode === 'custom' ? 'rounded-xl border-2 border-sky-400 bg-sky-500/15 px-3 py-3 text-sm font-black text-sky-200' : 'rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold text-gray-300'}
                >
                  自定义
                </button>
              </div>

              {exportMode === 'custom' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-dark-text-light">
                    开始日期
                    <input
                      data-testid="export-schedule-start"
                      type="date"
                      value={customStart}
                      onChange={event => { setCustomStart(event.target.value); setExportMessage(''); }}
                      className="mt-1.5 w-full rounded-xl border border-white/15 bg-dark-bg p-3 text-sm text-white outline-none focus:border-sky-400"
                    />
                  </label>
                  <label className="text-xs font-bold text-dark-text-light">
                    结束日期
                    <input
                      data-testid="export-schedule-end"
                      type="date"
                      value={customEnd}
                      onChange={event => { setCustomEnd(event.target.value); setExportMessage(''); }}
                      className="mt-1.5 w-full rounded-xl border border-white/15 bg-dark-bg p-3 text-sm text-white outline-none focus:border-sky-400"
                    />
                  </label>
                </div>
              )}

              <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-sky-200">导出范围</p>
                    <p className="mt-1 font-mono text-sm font-bold text-white">{exportRangeLabel}</p>
                  </div>
                  <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-[10px] font-black text-sky-200">
                    {exportResult.dayCount} DAYS WITH SHIFTS
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-sky-100/75">没有班次的日期会自动省略。导出的文字格式与“文字排班 / Paste Schedule”兼容。</p>
              </div>

              <textarea
                data-testid="export-schedule-preview"
                readOnly
                value={exportResult.text}
                placeholder={exportRange ? '这个范围内暂时没有已保存的班次。' : '请选择有效的日期范围。'}
                className="h-56 w-full resize-y rounded-xl border border-white/15 bg-dark-bg p-3 font-mono text-sm leading-relaxed text-white outline-none"
              />

              {exportMessage && <div className="rounded-xl border border-white/10 bg-dark-bg p-3 text-sm font-bold text-white">{exportMessage}</div>}
            </div>

            <div className="shrink-0 border-t border-white/10 bg-dark-surface p-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="export-schedule-copy"
                  onClick={copyExportText}
                  disabled={!exportResult.text}
                  className="rounded-xl bg-white/10 py-3.5 text-sm font-black text-white disabled:opacity-40"
                >
                  📋 复制文字
                </button>
                <button
                  type="button"
                  data-testid="export-schedule-download"
                  onClick={downloadExportText}
                  disabled={!exportResult.text || !exportRange}
                  className="rounded-xl bg-sky-500 py-3.5 text-sm font-black text-sky-950 shadow-lg disabled:bg-gray-700 disabled:text-gray-400"
                >
                  ⬇️ 下载 TXT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
