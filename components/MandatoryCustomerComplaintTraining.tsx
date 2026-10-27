import React, { useEffect, useState } from 'react';
import * as Cloud from '../services/cloud';
import { COMPLAINT_QUESTIONS, COMPLAINT_SECTIONS, COMPLAINT_TRAINING_VERSION } from './customerComplaintTrainingData';

type Person = { id?: string; name?: string; role?: string } | null;
type Props = {
  currentUser: Person;
  adminMode: 'owner' | 'manager' | 'editor' | null;
  logs: any[];
  appLang: 'zh' | 'en';
};

const MIN_SECTION_SECONDS = 5;
const SECTION_COUNT = COMPLAINT_SECTIONS.length;
const QUIZ_COUNT = COMPLAINT_QUESTIONS.length;
const phrase = (lang: 'zh' | 'en', zh: string, en: string) => lang === 'zh' ? zh : en;

export function CustomerComplaintSection({ index, lang }: { index: number; lang: 'zh' | 'en' }) {
  const section = COMPLAINT_SECTIONS[index];
  if (!section) return null;
  return (
    <section data-testid={'complaint-section-' + index} className="space-y-4">
      <div>
        <p className="text-[11px] font-black uppercase tracking-wide text-indigo-700">
          {phrase(lang, '培训章节 ', 'Training section ')}{index + 1} / {SECTION_COUNT}
        </p>
        <h3 className="mt-1 text-xl font-black text-slate-900">
          {phrase(lang, section.titleZh, section.titleEn)}
        </h3>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          {phrase(lang, section.titleEn, section.titleZh)}
        </p>
      </div>
      {(lang === 'zh' ? section.introZh : section.introEn)?.map((part, i) => (
        <p key={'intro-' + i} className="rounded-xl bg-slate-50 p-3 text-sm font-medium leading-relaxed text-slate-800">{part}</p>
      ))}
      {(section.scripts || []).map((script, i) => (
        <div key={'script-' + i} className="overflow-hidden rounded-2xl border border-indigo-200 bg-indigo-50">
          {script.labelZh && <p className="bg-indigo-100 px-4 py-2 text-xs font-black text-indigo-800">
            {phrase(lang, script.labelZh || '', script.labelEn || '')}
          </p>}
          <div className="space-y-2 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-indigo-800">
              English · {phrase(lang, '可直接对顾客说', 'Ready to say to a customer')}
            </p>
            <p className="text-sm font-semibold leading-relaxed text-slate-900">{script.en}</p>
            <div className="border-t border-indigo-200 pt-2">
              <p className="text-[10px] font-black text-slate-500">中文理解</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{script.zh}</p>
            </div>
          </div>
        </div>
      ))}
      {((lang === 'zh' ? section.notesZh : section.notesEn)?.length || 0) > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-xs font-black text-amber-900">
            {phrase(lang, '员工操作重点', 'Important steps for staff')}
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-amber-950">
            {(lang === 'zh' ? section.notesZh : section.notesEn)?.map((note, i) => <li key={i}>{note}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

/** A permanent review card in the Staff > Training tab, without affecting completion status. */
export function CustomerComplaintHandbookReview({ lang }: { lang: 'zh' | 'en' }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  return (
    <div data-testid="complaint-training-review" className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">ONESIP · Customer Care</p>
          <h3 className="mt-1 text-base font-black text-indigo-950">
            {phrase(lang, '顾客疑问与客诉应对 · 复习手册', 'Customer Questions & Complaints · Review')}
          </h3>
          <p className="mt-1 text-xs text-indigo-700">
            {phrase(lang, '11 个场景｜中英话术｜可随时查看', '11 sections · Bilingual scripts · Review anytime')}
          </p>
        </div>
        <button data-testid="complaint-review-toggle" type="button" onClick={() => setOpen(v => !v)}
          className="shrink-0 rounded-xl bg-indigo-700 px-3 py-2 text-xs font-black text-white">
          {open ? phrase(lang, '收起', 'Close') : phrase(lang, '打开手册', 'Open guide')}
        </button>
      </div>
      {open && (
        <div className="mt-4 space-y-4 border-t border-indigo-200 pt-3">
          <select data-testid="complaint-review-section" value={index} onChange={e => setIndex(Number(e.target.value))}
            className="w-full rounded-xl border border-indigo-200 bg-white p-2 text-sm text-slate-900">
            {COMPLAINT_SECTIONS.map((sec, i) => (
              <option key={i} value={i}>{i + 1}. {phrase(lang, sec.titleZh, sec.titleEn)}</option>
            ))}
          </select>
          <CustomerComplaintSection index={index} lang={lang} />
        </div>
      )}
    </div>
  );
}

/**
 * Mandatory one-time training per named account and version.
 * The 11 reading checkpoints and 12 correct answers are enforced before Cloud acknowledgement.
 */
export function MandatoryCustomerComplaintTraining({ currentUser, adminMode, logs, appLang }: Props) {
  const userId = currentUser?.id ? String(currentUser.id) : '';
  const identity = userId ? 'user:' + userId : adminMode ? 'pin:' + adminMode : '';
  const localKey = userId ? COMPLAINT_TRAINING_VERSION + '_pass_' + userId : '';
  const [lang, setLang] = useState<'zh' | 'en'>(appLang === 'en' ? 'en' : 'zh');
  const [stage, setStage] = useState(0); // 0..10 read, 11 quiz
  const [sectionAcknowledged, setSectionAcknowledged] = useState(false);
  const [sectionOpenedAt, setSectionOpenedAt] = useState(0);
  const [trainingStartedAt, setTrainingStartedAt] = useState(0);
  const [tick, setTick] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [incorrectAnswers, setIncorrectAnswers] = useState(0);
  const [firstTryCorrect, setFirstTryCorrect] = useState<Record<number, boolean>>({});
  const [pinName, setPinName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [completedIdentity, setCompletedIdentity] = useState('');

  let localPass = false;
  try { localPass = Boolean(localKey && localStorage.getItem(localKey) === '1'); }
  catch (e) { console.warn('Complaint training local state unavailable', e); }

  const cloudPass = Boolean(userId && Array.isArray(logs) && logs.some((entry: any) =>
    entry?.type === 'COMPLAINT_TRAINING_PASS' &&
    entry?.trainingVersion === COMPLAINT_TRAINING_VERSION &&
    String(entry?.userId || '') === userId &&
    entry?.passed === true &&
    entry?.questionsCorrect === QUIZ_COUNT
  ));
  const pending = Boolean(identity) && !localPass && !cloudPass && completedIdentity !== identity;

  useEffect(() => {
    if (!pending) return;
    setStage(0);
    setSectionAcknowledged(false);
    setTrainingStartedAt(Date.now());
    setSectionOpenedAt(Date.now());
    setTick(0);
    setAnswers({});
    setFirstTryCorrect({});
    setIncorrectAnswers(0);
    setPinName('');
    setLang(appLang === 'en' ? 'en' : 'zh');
    setError('');
    const timer = window.setInterval(() => setTick(i => i + 1), 500);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearInterval(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [identity, pending]);

  useEffect(() => {
    if (!cloudPass || !localKey) return;
    try { localStorage.setItem(localKey, '1'); } catch (_) {}
  }, [cloudPass, localKey]);

  const remaining = sectionOpenedAt ? Math.max(0, Math.ceil(
    (MIN_SECTION_SECONDS * 1000 - (Date.now() - sectionOpenedAt)) / 1000
  )) : MIN_SECTION_SECONDS;
  const inQuiz = stage === SECTION_COUNT;
  const correctCount = COMPLAINT_QUESTIONS.filter((question, i) => answers[i] === question.correct).length;
  const allCorrect = correctCount === QUIZ_COUNT;
  const canSubmit = pending && inQuiz && allCorrect && !saving &&
    (!!userId || pinName.trim().length >= 2);

  const nextSection = () => {
    if (!pending || inQuiz || remaining !== 0 || !sectionAcknowledged) return;
    setStage(s => Math.min(SECTION_COUNT, s + 1));
    setSectionOpenedAt(Date.now());
    setSectionAcknowledged(false);
    setError('');
  };

  const choose = (index: number, option: number) => {
    const q = COMPLAINT_QUESTIONS[index];
    if (!inQuiz || !q || saving) return;
    if (!(index in answers)) setFirstTryCorrect(old => ({ ...old, [index]: option === q.correct }));
    if (option !== q.correct && answers[index] !== option) setIncorrectAnswers(n => n + 1);
    setAnswers(old => ({ ...old, [index]: option }));
  };

  const submit = async () => {
    if (!canSubmit || !identity || !COMPLAINT_QUESTIONS.every((q, i) => answers[i] === q.correct)) return;
    setSaving(true);
    setError('');
    const now = new Date().toISOString();
    const entry = {
      id: Date.now(),
      type: 'COMPLAINT_TRAINING_PASS',
      shift: 'customer-service-training',
      status: 'passed',
      passed: true,
      time: now,
      completedAt: now,
      trainingVersion: COMPLAINT_TRAINING_VERSION,
      userId: userId || null,
      name: userId ? (currentUser?.name || 'Staff') : pinName.trim(),
      role: currentUser?.role || adminMode || 'unknown',
      pinOnly: !userId,
      sectionsRead: SECTION_COUNT,
      questionCount: QUIZ_COUNT,
      questionsCorrect: QUIZ_COUNT,
      scorePercent: 100,
      firstTryCorrect: Object.values(firstTryCorrect).filter(Boolean).length,
      incorrectAttempts: incorrectAnswers,
      durationSeconds: Math.max(0, Math.floor((Date.now() - trainingStartedAt) / 1000)),
      answers: COMPLAINT_QUESTIONS.map((q, i) => ({ question: i + 1, type: q.type, selected: answers[i], correct: true })),
      language: lang,
    };
    try {
      await Cloud.saveCustomerComplaintTrainingCompletion(entry);
      if (localKey) {
        try { localStorage.setItem(localKey, '1'); }
        catch (e) { console.warn('Completion saved to cloud, local cache failed', e); }
      }
      setCompletedIdentity(identity);
    } catch (e) {
      console.error('Complaint training completion could not be saved', e);
      setError(phrase(lang,
        '成绩尚未保存成功，请检查网络后重试。不会清除你已完成的答案。',
        'Your result has not been saved. Check the connection and retry; your answers will remain.'));
    } finally { setSaving(false); }
  };

  if (!pending) return null;

  return (
    <div data-testid="complaint-training-gate"
      role="alertdialog" aria-modal="true" aria-labelledby="complaint-training-title"
      className="fixed inset-0 flex items-center justify-center bg-black/90 p-2 sm:p-5"
      style={{ zIndex: 2147483647 }}>
      <div className="flex max-h-[97dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border-2 border-indigo-400 bg-white shadow-2xl">
        <header className="shrink-0 space-y-3 bg-indigo-950 p-4 text-white sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200">ONESIP · Required Customer Care Training</p>
              <h2 id="complaint-training-title" className="mt-1 text-xl font-black sm:text-2xl">
                {phrase(lang, '顾客疑问与客诉应对 · 全员必修', 'Customer Complaints · Mandatory Training')}
              </h2>
              <p className="mt-1 text-xs text-indigo-200">
                {phrase(lang, '必须逐章阅读全部 11 章，答对全部 12 道题并保存成绩后才能继续。',
                  'Read all 11 sections, answer all 12 questions correctly and save your result to continue.')}
              </p>
            </div>
            <div className="flex shrink-0 gap-1 rounded-lg border border-white/20 p-1">
              <button type="button" data-testid="complaint-lang-zh" onClick={() => setLang('zh')}
                aria-pressed={lang === 'zh'}
                className={'rounded-md px-2 py-1.5 text-xs font-black ' + (lang === 'zh' ? 'bg-white text-indigo-950' : 'text-white')}>中文</button>
              <button type="button" data-testid="complaint-lang-en" onClick={() => setLang('en')}
                aria-pressed={lang === 'en'}
                className={'rounded-md px-2 py-1.5 text-xs font-black ' + (lang === 'en' ? 'bg-white text-indigo-950' : 'text-white')}>EN</button>
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs font-bold text-indigo-100">
              <span>{inQuiz ? phrase(lang, '情景测试', 'Scenario quiz') : phrase(lang, '阅读进度', 'Reading progress')}</span>
              <span data-testid="complaint-progress">{inQuiz ? SECTION_COUNT : stage + 1}/{SECTION_COUNT}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-indigo-300 transition-all"
                style={{ width: (inQuiz ? 100 : Math.round((stage / SECTION_COUNT) * 100)) + '%' }} />
            </div>
          </div>
        </header>

        <div key={stage} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6" data-testid="complaint-training-scroll">
          {!inQuiz ? (
            <div className="space-y-5">
              <CustomerComplaintSection index={stage} lang={lang} />
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <label className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" data-testid="complaint-read-check"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-indigo-700"
                    checked={sectionAcknowledged} onChange={e => setSectionAcknowledged(e.target.checked)} />
                  <span className="text-sm font-bold leading-relaxed text-indigo-950">
                    {phrase(lang, '我已读完并理解本章节及其中英文客诉回复。',
                      'I have read and understood this section and the customer-facing scripts.')}
                  </span>
                </label>
              </div>
            </div>
          ) : (
            <div data-testid="complaint-quiz" className="space-y-6">
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                <p className="text-lg font-black text-indigo-950">
                  {phrase(lang, '情景模拟与判断题', 'Scenarios & True/False')}
                </p>
                <p className="mt-1 text-sm text-indigo-800">
                  {phrase(lang, '所有题目必须答对。答错可重新选择，系统将记录最终成绩。',
                    'All answers must be correct. You can retry wrong answers. Your completion will be recorded.')}
                </p>
                <p className="mt-2 text-sm font-black text-indigo-900" data-testid="complaint-quiz-score">
                  {phrase(lang, '已答对', 'Correct')}: {correctCount} / {QUIZ_COUNT}
                </p>
              </div>
              {COMPLAINT_QUESTIONS.map((q, index) => (
                <fieldset key={index} data-testid={'complaint-question-' + index} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <legend className="px-1 text-sm font-black leading-relaxed text-slate-900">
                    <span className="mr-2 text-indigo-700">{index + 1}.</span>
                    {phrase(lang, q.zh, q.en)}
                  </legend>
                  <p className="text-[11px] font-black text-indigo-700">{q.type === 'scenario'
                    ? phrase(lang, '情景选择', 'Scenario')
                    : phrase(lang, '判断题', 'True / False')}</p>
                  {(lang === 'zh' ? q.choicesZh : q.choicesEn).map((option, optionIndex) => (
                    <label key={optionIndex}
                      className={'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm font-medium leading-relaxed ' +
                        (answers[index] === optionIndex ? 'border-indigo-500 bg-indigo-100 text-indigo-950' : 'border-slate-200 bg-white text-slate-900')}>
                      <input type="radio"
                        name={'complaint-q-' + index}
                        data-testid={'complaint-answer-' + index + '-' + optionIndex}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-700"
                        checked={answers[index] === optionIndex}
                        onChange={() => choose(index, optionIndex)} />
                      {option}
                    </label>
                  ))}
                  {answers[index] !== undefined && (
                    <p className={'text-xs font-bold ' +
                      (answers[index] === q.correct ? 'text-emerald-700' : 'text-rose-700')}>
                      {answers[index] === q.correct
                        ? phrase(lang, '回答正确：', 'Correct: ') + phrase(lang, q.reasoningZh, q.reasoningEn)
                        : phrase(lang, '回答不正确。请重新阅读情景并选择。', 'Not quite. Re-read the scenario and try again.')}
                    </p>
                  )}
                </fieldset>
              ))}
              {!userId && (
                <label className="block space-y-2 text-sm font-bold text-slate-900">
                  {phrase(lang, '请输入您的姓名（管理 PIN 登录需单独署名）',
                    'Enter your own name (required for a PIN-only admin session)')}
                  <input data-testid="complaint-pin-name" type="text" maxLength={80}
                    value={pinName} onChange={e => setPinName(e.target.value)}
                    placeholder={phrase(lang, '您的姓名', 'Your name')}
                    className="w-full rounded-lg border border-slate-300 p-3 text-sm" />
                </label>
              )}
            </div>
          )}
        </div>

        <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-white p-4">
          {!inQuiz ? (
            <>
              <p data-testid="complaint-read-timer" className="text-center text-xs font-semibold text-slate-600">
                {remaining > 0
                  ? phrase(lang, '请阅读本章，' + remaining + ' 秒后可继续', 'Read this section. Continue in ' + remaining + ' seconds.')
                  : phrase(lang, '请勾选“已读完”后进入下一章。', 'Check “I have read” to continue.')}
              </p>
              <button type="button" data-testid="complaint-next" onClick={nextSection}
                disabled={!sectionAcknowledged || remaining > 0}
                className="w-full rounded-xl bg-indigo-700 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500">
                {stage === SECTION_COUNT - 1
                  ? phrase(lang, '完成阅读，进入情景测试', 'Start scenario quiz')
                  : phrase(lang, '确认已读，下一章', 'I have read · Next section')}
              </button>
            </>
          ) : (
            <>
              <p className="text-center text-xs font-semibold text-slate-600">
                {phrase(lang, '通过标准：', 'Pass requirement: ')}{correctCount} / {QUIZ_COUNT}
              </p>
              <button type="button" data-testid="complaint-submit" disabled={!canSubmit} onClick={submit}
                className="w-full rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500">
                {saving ? phrase(lang, '正在保存成绩…', 'Saving result…')
                  : phrase(lang, '全部答对 · 保存成绩并继续使用', 'All correct · Save result and continue')}
              </button>
            </>
          )}
          {error && <p role="alert" className="text-center text-xs font-black text-rose-700">{error}</p>}
        </footer>
      </div>
    </div>
  );
}
