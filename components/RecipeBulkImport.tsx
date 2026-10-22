import React, { useRef, useState } from 'react';
import * as Cloud from '../services/cloud';
import { getRecipeCsvTemplate, previewRecipeCsv, RecipeCsvRow } from '../utils/recipeCsv';

type Props = { recipes: any[]; stores: any[]; onSaved: (recipes: any[]) => void };

export function RecipeBulkImport({ recipes, stores, onSaved }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [filename, setFilename] = useState('');
  const [csvText, setCsvText] = useState('');
  const [rows, setRows] = useState<RecipeCsvRow[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const valid = rows.filter(r => r.recipe && !r.errors.length && !r.duplicate && !r.example);
  const duplicates = rows.filter(r => r.duplicate);
  const invalid = rows.filter(r => r.errors.length);
  const samples = rows.filter(r => r.example);

  const downloadTemplate = () => {
    const blob = new Blob([getRecipeCsvTemplate()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ONESIP_Recipe_Import_Template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setSuccess(''); setError(''); setRows([]); setCsvText(''); setFilename(file.name);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError('请使用本站提供的 CSV 模板。Excel 中可用「CSV UTF-8（逗号分隔）」另存为；暂不支持直接上传 .xlsx。');
      return;
    }
    if (file.size > 3 * 1024 * 1024) { setError('单次文件最大 3MB，请拆分批次。'); return; }
    try {
      const content = await file.text();
      const imported = previewRecipeCsv(content, recipes, stores);
      if (!imported.length) throw new Error('没有发现配方数据。请在模板表头下增加一行或多行。');
      setCsvText(content); setRows(imported);
    } catch (e: any) { setError(e?.message || 'CSV 解析失败，请下载新模板重试。'); }
  };

  const save = async () => {
    if (!csvText || saving) return;
    setError(''); setSuccess('');
    let latest: RecipeCsvRow[];
    try { latest = previewRecipeCsv(csvText, recipes, stores); }
    catch (e: any) { setError(e?.message || '导入内容已失效'); return; }
    setRows(latest);
    const imported = latest.filter(r => r.recipe).map((r, index) => ({
      ...r.recipe,
      id: 'bulk_' + Date.now() + '_' + r.line + '_' + index + '_' + Math.random().toString(36).slice(2, 8),
      createdAt: new Date().toISOString(),
    }));
    if (!imported.length) { setError('没有可导入的有效配方。请修正重复项或错误行。'); return; }
    setSaving(true);
    try {
      // Keep all existing recipes: append-only, never an overwrite or deletion.
      const updated = [...(recipes || []), ...imported];
      await Cloud.saveContent('recipes', updated);
      onSaved(updated);
      setSuccess('成功导入 ' + imported.length + ' 个配方。未发布的配方可在编辑页面检查后再发布。');
      setCsvText(''); setRows([]); setFilename('');
    } catch (e: any) { setError('保存失败，云端没有确认成功：' + (e?.message || '请检查网络后重试')); }
    finally { setSaving(false); }
  };

  return (
    <div data-testid="recipe-bulk-import" className="rounded-2xl border border-emerald-500/30 bg-emerald-900/10 p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-black text-sm text-emerald-300">批量导入配方 / Bulk Import</p>
          <p className="mt-1 text-xs text-dark-text-light">先下载模板，用 Excel 填写多行配方，保存 CSV 后一次导入。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="recipe-template-download" onClick={downloadTemplate}
            className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white hover:bg-emerald-500">
            ↓ 下载导入模板
          </button>
          <button type="button" data-testid="recipe-bulk-open" onClick={() => setOpen(p => !p)}
            className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-black text-white hover:bg-blue-500">
            {open ? '收起导入面板' : '↑ 批量导入 CSV'}
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <p className="text-xs leading-relaxed text-dark-text-light">
            使用模板里的英文列名，不要修改表头；每行一款产品。多个制作步骤用 <strong className="text-dark-text">|</strong> 分开。
            模板中的两行「示例_请删除」会被自动跳过。<strong className="text-amber-300">默认不发布员工端</strong>；需要发布时填写 is_published=true 与对应 store_ids（门店 ID 或名称）。
          </p>
          <input ref={inputRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={chooseFile}
            data-testid="recipe-import-file" className="hidden" />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={saving}
            className="w-full rounded-xl border-2 border-dashed border-emerald-500/40 bg-white/5 px-4 py-3 text-center text-sm font-bold text-emerald-200 hover:bg-white/10 disabled:opacity-50">
            {filename ? '重新选择 CSV 文件 · ' + filename : '选择已填写的 CSV 文件'}
          </button>
          <p className="text-[11px] text-dark-text-light">支持含中文及换行的 UTF-8 CSV（Excel 可编辑）。为避免导入错误，本功能不直接读取 .xlsx；请在 Excel 里另存为 CSV UTF-8。</p>
          {rows.length > 0 && (
            <div className="space-y-3" data-testid="recipe-import-preview">
              <div className="flex flex-wrap gap-2 text-xs font-black">
                <span className="rounded-lg bg-emerald-600/25 px-3 py-1.5 text-emerald-200">可导入 {valid.length}</span>
                <span className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-amber-200">重复跳过 {duplicates.length}</span>
                <span className="rounded-lg bg-red-500/20 px-3 py-1.5 text-red-200">错误跳过 {invalid.length}</span>
                <span className="rounded-lg bg-white/10 px-3 py-1.5 text-dark-text-light">示例跳过 {samples.length}</span>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2 rounded-lg border border-white/10 p-2">
                {rows.slice(0, 80).map((r, i) => (
                  <div key={r.line + ':' + i} className="flex gap-3 rounded-lg bg-white/5 px-3 py-2 text-xs">
                    <span className="shrink-0 font-mono text-dark-text-light">第 {r.line} 行</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-dark-text break-words">{r.displayName}</p>
                      <p className={r.errors.length ? 'text-red-300' : r.duplicate ? 'text-amber-300' : r.example ? 'text-dark-text-light' : 'text-emerald-300'}>
                        {r.errors.length ? r.errors.join('；') : r.duplicate ? '已有同名配方，安全跳过（不覆盖）' : r.example ? '模板示例，自动跳过' : '格式通过；等待确认导入'}
                      </p>
                    </div>
                  </div>
                ))}
                {rows.length > 80 && <p className="text-[11px] text-dark-text-light">仅预览前 80 行；全部 {rows.length} 行均参与校验与导入。</p>}
              </div>
              <p className="text-xs text-amber-200">导入为新增操作：不会替换或删除已有配方。重复或错误行会跳过；请核对数量后提交。</p>
              <button type="button" data-testid="recipe-bulk-save" disabled={saving || valid.length === 0} onClick={save}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400">
                {saving ? '正在保存到云端…' : '确认导入 ' + valid.length + ' 个新配方'}
              </button>
            </div>
          )}
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-xs font-semibold text-red-300">{error}</p>}
      {success && <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-200">{success}</p>}
    </div>
  );
}
