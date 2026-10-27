import React, { useMemo, useState } from 'react';
import { COMPLAINT_TRAINING_VERSION, COMPLAINT_QUESTIONS } from './customerComplaintTrainingData';

type Props = { users: any[]; logs: any[]; stores?: any[]; storeId?: string | null; lang?: 'zh' | 'en' };

export function CustomerComplaintTrainingProgress({ users, logs, stores = [], storeId, lang = 'zh' }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const report = useMemo(() => {
    const store = (stores || []).find((s: any) => s?.id === storeId);
    const storeStaff = new Set((store?.staff || []).map((v: any) => String(v)));
    const roster = (Array.isArray(users) ? users : []).filter((u: any) =>
      u && u.id && u.active !== false &&
      ['staff', 'manager', 'boss', 'editor', 'maintenance'].includes(String(u.role || ''))
      && (!storeId || !store || storeStaff.has(String(u.id)) || u.role === 'boss' ||
          u?.storeRoles?.[storeId] === 'manager')
    );
    const passed = new Map<string, any>();
    const pinOnly: any[] = [];
    for (const record of Array.isArray(logs) ? logs : []) {
      if (record?.type !== 'COMPLAINT_TRAINING_PASS' ||
          record?.trainingVersion !== COMPLAINT_TRAINING_VERSION ||
          record?.passed !== true || record?.questionsCorrect !== COMPLAINT_QUESTIONS.length ||
          record?.isDeleted === true) continue;
      if (!record?.userId) {
        pinOnly.push(record);
        continue;
      }
      const id = String(record.userId);
      const prior = passed.get(id);
      if (!prior || String(record.completedAt || record.time || '') > String(prior.completedAt || prior.time || ''))
        passed.set(id, record);
    }
    return {
      rows: roster.map((u: any) => ({ user: u, completion: passed.get(String(u.id)) || null }))
        .sort((a: any, b: any) => Number(Boolean(a.completion)) - Number(Boolean(b.completion)) ||
          String(a.user.name || '').localeCompare(String(b.user.name || ''))),
      pinOnly: pinOnly.sort((a: any, b: any) =>
        String(b.completedAt || b.time || '').localeCompare(String(a.completedAt || a.time || ''))),
    };
  }, [users, logs, stores, storeId]);
  const passedCount = report.rows.filter(r => Boolean(r.completion)).length;
  const pendingCount = report.rows.length - passedCount;

  return (
    <section data-testid="complaint-training-manager-progress"
      className="rounded-2xl border border-indigo-400/30 bg-indigo-950/60 p-4 text-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-indigo-200">ONESIP · Customer Care Certification</p>
          <h3 className="mt-1 text-base font-black">
            {lang === 'en' ? 'Complaint Training · Completion Tracker' : '客诉必修培训 · 完成记录'}
          </h3>
          <p className="mt-1 text-xs text-indigo-200">
            {lang === 'en' ? 'Completed' : '已通过'} {passedCount}/{report.rows.length}
            <span className="mx-2">·</span>
            {lang === 'en' ? 'Pending' : '未完成'} {pendingCount}
            <span className="mx-2">·</span> {COMPLAINT_QUESTIONS.length}/12
          </p>
        </div>
        <button data-testid="complaint-progress-toggle" type="button" onClick={() => setExpanded(v => !v)}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500">
          {expanded ? (lang === 'en' ? 'Collapse' : '收起') : (lang === 'en' ? 'View details' : '查看名单')}
        </button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
        <div className="h-full bg-emerald-400"
          style={{ width: (report.rows.length ? Math.round(passedCount / report.rows.length * 100) : 0) + '%' }} />
      </div>
      {expanded && (
        <div className="mt-4 space-y-3">
          <p className="text-[11px] text-indigo-200">
            {lang === 'en'
              ? 'Active user accounts in scope (not marked inactive). PIN-only completions are listed separately and cannot be matched to a user ID.'
              : '范围：当前未标记停用的员工账号。纯 PIN 入口的署名记录单独列出，无法自动匹配员工账号。'}
          </p>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {report.rows.length === 0 && <p className="text-sm text-indigo-200">
              {lang === 'en' ? 'No eligible users found.' : '暂无可统计的员工账号。'}
            </p>}
            {(showAll ? report.rows : report.rows.slice(0, 30)).map((r: any) => (
              <div key={r.user.id}
                className="flex items-start justify-between gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-black">{r.user.name || r.user.id}</p>
                  <p className="text-indigo-200">{r.user.role || 'staff'}</p>
                </div>
                {r.completion ? (
                  <div className="text-right">
                    <p className="font-black text-emerald-300">PASS · 100%</p>
                    <p className="text-indigo-200">{String(r.completion.completedAt || r.completion.time || '').slice(0, 16).replace('T',' ')}</p>
                  </div>
                ) : <span className="font-black text-amber-300">{lang === 'en' ? 'PENDING' : '未完成'}</span>}
              </div>
            ))}
            {report.rows.length > 30 && <button onClick={() => setShowAll(v => !v)}
              type="button" className="w-full rounded-lg bg-white/10 p-2 text-xs font-bold">
              {showAll ? (lang === 'en' ? 'Show fewer' : '收起名单') : (lang === 'en' ? 'Show all' : '显示全部')}
            </button>}
          </div>
          {report.pinOnly.length > 0 && (
            <div className="rounded-xl border border-indigo-300/20 p-3">
              <h4 className="mb-2 text-xs font-black">{lang === 'en' ? 'PIN-only completions' : '管理 PIN 独立确认记录'}</h4>
              {report.pinOnly.slice(0, 20).map((r: any, i: number) => (
                <p key={i} className="mb-1 text-xs text-indigo-100">
                  {r.name || 'PIN'} · PASS · {String(r.completedAt || r.time || '').slice(0, 16).replace('T',' ')}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
