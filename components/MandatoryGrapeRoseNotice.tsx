import React, { useEffect, useState } from 'react';
import * as Cloud from '../services/cloud';

export const GRAPE_ROSE_NOTICE_VERSION = 'onesip_grape_rose_measuring_2026_11_02_v1';
const READ_SECONDS = 12;

type Person = { id?: string; name?: string; role?: string } | null;
type Props = {
  currentUser: Person;
  adminMode: 'owner' | 'manager' | 'editor' | null;
  logs: any[];
  appLang: 'zh' | 'en';
};

const QUESTIONS = [
  {
    zh: '制作 Grape Rose 时，玫瑰糖浆要用什么工具接取和计量？',
    en: 'Which tool must you use to collect and measure the rose syrup for Grape Rose?',
    zhOptions: ['直接用饮品杯接', '用小量杯接并量取', '直接目测倒入饮品杯'],
    enOptions: ['Collect it directly in the drink cup', 'Collect and measure it with the small measuring cup', 'Pour it into the drink by eye'],
    correct: 1,
  },
  {
    zh: '500ml 中杯的 Grape Rose 需要多少玫瑰糖浆？',
    en: 'How much rose syrup is needed for a 500ml medium Grape Rose?',
    zhOptions: ['15ml', '10ml', '20ml'],
    enOptions: ['15ml', '10ml', '20ml'],
    correct: 1,
  },
  {
    zh: '660ml 大杯的 Grape Rose 需要多少玫瑰糖浆？',
    en: 'How much rose syrup is needed for a 660ml large Grape Rose?',
    zhOptions: ['10ml', '20ml', '15ml'],
    enOptions: ['10ml', '20ml', '15ml'],
    correct: 2,
  },
  {
    zh: '判断：制作 Grape Rose 时，可以不用小量杯，凭感觉倒入玫瑰糖浆。',
    en: 'True or false: for Grape Rose you can skip the measuring cup and estimate the rose syrup by eye.',
    zhOptions: ['正确', '错误'],
    enOptions: ['True', 'False'],
    correct: 1,
  },
] as const;

/** Mandatory standalone notice. Requires all quiz answers correct and a confirmed Cloud record. */
export function MandatoryGrapeRoseNotice({ currentUser, adminMode, logs, appLang }: Props) {
  const userId = currentUser?.id ? String(currentUser.id) : '';
  const identity = userId ? 'user:' + userId : adminMode ? 'pin:' + adminMode : '';
  const localKey = userId ? GRAPE_ROSE_NOTICE_VERSION + '_pass_' + userId : '';
  const [lang, setLang] = useState<'zh' | 'en'>(appLang === 'en' ? 'en' : 'zh');
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [readConfirmed, setReadConfirmed] = useState(false);
  const [started, setStarted] = useState<{ identity: string; at: number } | null>(null);
  const [tick, setTick] = useState(0);
  const [pinName, setPinName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [completedIdentity, setCompletedIdentity] = useState('');

  let localPassed = false;
  try { localPassed = !!localKey && localStorage.getItem(localKey) === '1'; }
  catch (e) { console.warn('Grape Rose local acknowledgement unavailable', e); }

  const cloudPassed = !!userId && Array.isArray(logs) && logs.some((entry: any) =>
    entry?.type === 'GRAPE_ROSE_QUIZ_PASS' &&
    entry?.noticeVersion === GRAPE_ROSE_NOTICE_VERSION &&
    String(entry?.userId || '') === userId &&
    entry?.passed === true && entry?.questionsCorrect === QUESTIONS.length &&
    entry?.isDeleted !== true
  );
  const pending = !!identity && !localPassed && !cloudPassed && completedIdentity !== identity;

  useEffect(() => {
    if (!pending) return;
    setAnswers({});
    setReadConfirmed(false);
    setPinName('');
    setError('');
    setLang(appLang === 'en' ? 'en' : 'zh');
    setStarted({ identity, at: Date.now() });
    setTick(0);
    const timer = window.setInterval(() => setTick(i => i + 1), 500);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearInterval(timer);
      document.body.style.overflow = oldOverflow;
    };
  }, [identity, pending]);

  useEffect(() => {
    if (!cloudPassed || !localKey) return;
    try { localStorage.setItem(localKey, '1'); } catch (_) {}
  }, [cloudPassed, localKey]);

  const secondsRemaining = started?.identity === identity
    ? Math.max(0, Math.ceil((READ_SECONDS * 1000 - (Date.now() - started.at)) / 1000))
    : READ_SECONDS;
  const correctCount = QUESTIONS.filter((q, i) => answers[i] === q.correct).length;
  const allCorrect = correctCount === QUESTIONS.length;
  const canSubmit = pending && !saving && readConfirmed && secondsRemaining === 0 &&
    allCorrect && (!!userId || pinName.trim().length >= 2);

  const submit = async () => {
    if (!canSubmit || !started || started.identity !== identity ||
        Date.now() - started.at < READ_SECONDS * 1000) return;
    setSaving(true);
    setError('');
    const completedAt = new Date().toISOString();
    try {
      await Cloud.saveGrapeRoseQuizCompletion({
        id: Date.now(),
        type: 'GRAPE_ROSE_QUIZ_PASS',
        shift: 'recipe-update',
        status: 'passed',
        passed: true,
        time: completedAt,
        completedAt,
        userId: userId || null,
        name: userId ? (currentUser?.name || 'Staff') : pinName.trim(),
        role: currentUser?.role || adminMode || 'unknown',
        pinOnly: !userId,
        noticeVersion: GRAPE_ROSE_NOTICE_VERSION,
        readSeconds: READ_SECONDS,
        questionsCorrect: QUESTIONS.length,
        questionCount: QUESTIONS.length,
        scorePercent: 100,
        correctRecipe: { drink: 'Grape Rose', tool: 'small measuring cup', '500ml': '10ml', '660ml': '15ml' },
        language: lang,
      });
      if (localKey) {
        try { localStorage.setItem(localKey, '1'); }
        catch (e) { console.warn('Grape Rose passed in Cloud but could not cache locally', e); }
      }
      setCompletedIdentity(identity);
    } catch (e) {
      console.error('Grape Rose quiz cloud save failed', e);
      setError(lang === 'zh'
        ? '成绩未保存成功，请检查网络后重试。你已经选择的答案会保留。'
        : 'The result was not saved. Check your connection and retry; your answers remain selected.');
    } finally {
      setSaving(false);
    }
  };

  if (!pending) return null;

  return (
    <div data-testid="grape-rose-gate" role="alertdialog" aria-modal="true"
      aria-labelledby="grape-rose-title" style={{ zIndex: 2147483647 }}
      className="fixed inset-0 flex items-center justify-center bg-black/90 p-3 sm:p-5">
      <div className="flex max-h-[96dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-rose-300 bg-white text-slate-900 shadow-2xl">
        <header className="shrink-0 bg-rose-900 px-5 py-4 text-white">
          <p className="text-[11px] font-black uppercase tracking-widest text-rose-200">ONESIP · Mandatory Recipe Notice</p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="grape-rose-title" className="mt-2 text-xl font-black">
                {lang === 'zh' ? 'Grape Rose · 玫瑰糖浆计量要求' : 'Grape Rose · Rose Syrup Measurement'}
              </h2>
              <p className="mt-1 text-xs text-rose-100">
                {lang === 'zh'
                  ? '全员必读 · 答对全部 4 题才能确认'
                  : 'Mandatory for everyone · All 4 answers must be correct'}
              </p>
            </div>
            <div className="flex shrink-0 gap-1 rounded-lg bg-white/10 p-1">
              <button type="button" data-testid="grape-rose-lang-zh" onClick={() => setLang('zh')}
                aria-pressed={lang === 'zh'}
                className={'rounded-md px-2 py-1 text-xs font-black ' + (lang === 'zh' ? 'bg-white text-rose-900' : 'text-white')}>
                中文
              </button>
              <button type="button" data-testid="grape-rose-lang-en" onClick={() => setLang('en')}
                aria-pressed={lang === 'en'}
                className={'rounded-md px-2 py-1 text-xs font-black ' + (lang === 'en' ? 'bg-white text-rose-900' : 'text-white')}>
                EN
              </button>
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4" data-testid="grape-rose-instructions">
            <p className="text-base font-black text-rose-900">
              {lang === 'zh' ? '必须使用小量杯接取并量取玫瑰糖浆' : 'Always collect and measure rose syrup using the small measuring cup'}
            </p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-rose-950">
              {lang === 'zh'
                ? '制作 Grape Rose 时，请先用小量杯接取玫瑰糖浆，再按杯型准确量取。不要直接接在饮品杯里，也不要凭目测决定用量。'
                : 'When making Grape Rose, collect the rose syrup in the small measuring cup first, then measure the exact amount for the cup size. Do not collect it directly in the drink cup or estimate by eye.'}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-rose-200 bg-white p-3 text-center">
                <p className="text-xs font-bold text-slate-600">500ml · Medium</p>
                <p className="mt-1 text-3xl font-black text-rose-900">10ml</p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-white p-3 text-center">
                <p className="text-xs font-bold text-slate-600">660ml · Large</p>
                <p className="mt-1 text-3xl font-black text-rose-900">15ml</p>
              </div>
            </div>
            <p className="mt-3 text-xs font-bold text-rose-900">
              {lang === 'zh' ? '请记住：小量杯 + 正确毫升数。' : 'Remember: small measuring cup + exact millilitres.'}
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <input data-testid="grape-rose-read-check" type="checkbox" checked={readConfirmed}
              onChange={e => setReadConfirmed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-rose-800" />
            <span className="text-sm font-bold">
              {lang === 'zh'
                ? '我已完整阅读，知道 Grape Rose 必须用小量杯，500ml 为 10ml、660ml 为 15ml。'
                : 'I have read this: Grape Rose uses a small measuring cup, 10ml for 500ml and 15ml for 660ml.'}
            </span>
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid="grape-rose-quiz">
            <h3 className="text-base font-black">
              {lang === 'zh' ? '出品测试 · 4 道题' : 'Preparation Check · 4 Questions'}
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-600">
              {lang === 'zh'
                ? '答错可以重新选择，但必须全部答对才会保存通过记录。'
                : 'You may retry a wrong answer, but all four must be correct to save a pass.'}
            </p>
            <div className="mt-4 space-y-5">
              {QUESTIONS.map((question, i) => (
                <fieldset key={i} data-testid={'grape-rose-question-' + i} className="space-y-2">
                  <legend className="text-sm font-black leading-relaxed">
                    {i + 1}. {lang === 'zh' ? question.zh : question.en}
                  </legend>
                  {(lang === 'zh' ? question.zhOptions : question.enOptions).map((answer, j) => (
                    <label key={j}
                      className={'flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ' +
                        (answers[i] === j ? 'border-rose-500 bg-rose-100' : 'border-slate-200 bg-white')}>
                      <input type="radio" name={'grape-rose-q-' + i}
                        data-testid={'grape-rose-answer-' + i + '-' + j}
                        checked={answers[i] === j} onChange={() => setAnswers(old => ({ ...old, [i]: j }))}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-rose-800" />
                      <span>{answer}</span>
                    </label>
                  ))}
                  {answers[i] !== undefined && (
                    <p className={'text-xs font-bold ' +
                      (answers[i] === question.correct ? 'text-emerald-700' : 'text-rose-700')}>
                      {answers[i] === question.correct
                        ? (lang === 'zh' ? '正确' : 'Correct')
                        : (lang === 'zh' ? '不正确，请重新选择' : 'Not correct. Please try again.')}
                    </p>
                  )}
                </fieldset>
              ))}
            </div>
          </div>
          {!userId && (
            <label className="block text-sm font-bold">
              {lang === 'zh' ? '管理 PIN 入口：请输入自己的姓名用于确认记录' : 'PIN-only admin access: enter your name for the record'}
              <input data-testid="grape-rose-pin-name" type="text" maxLength={80}
                value={pinName} onChange={e => setPinName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-300 p-3" />
            </label>
          )}
        </div>
        <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-white p-4">
          <div className="flex justify-between text-xs font-bold text-slate-600">
            <span data-testid="grape-rose-score">{lang === 'zh' ? '答对' : 'Correct'} {correctCount}/{QUESTIONS.length}</span>
            <span data-testid="grape-rose-timer">
              {secondsRemaining > 0
                ? (lang === 'zh' ? '请阅读：' + secondsRemaining + ' 秒' : 'Read for ' + secondsRemaining + ' seconds')
                : (lang === 'zh' ? '阅读时间已达标' : 'Reading time complete')}
            </span>
          </div>
          <button type="button" data-testid="grape-rose-confirm" onClick={submit} disabled={!canSubmit}
            className="w-full rounded-xl bg-rose-800 px-4 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500">
            {saving ? (lang === 'zh' ? '正在保存测试记录…' : 'Saving your result…')
              : (lang === 'zh' ? '全部答对 · 确认并继续' : 'All Correct · Confirm and Continue')}
          </button>
          {error && <p role="alert" className="text-center text-xs font-bold text-rose-700">{error}</p>}
        </footer>
      </div>
    </div>
  );
}
