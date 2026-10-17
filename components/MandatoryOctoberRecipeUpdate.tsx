import React, { useEffect, useState } from 'react';
import * as Cloud from '../services/cloud';

export const OCTOBER_RECIPE_NOTICE_VERSION = 'onesip_recipe_updates_2026_10_17_v1';
const READ_SECONDS = 25;

type Language = 'zh' | 'en';
type AdminMode = 'manager' | 'owner' | 'editor' | null;
type UserLike = { id?: string; name?: string; role?: string } | null;

type Props = {
  currentUser: UserLike;
  adminMode: AdminMode;
  logs: any[];
  appLang: Language;
};

const QUESTIONS = [
  {
    zh: 'Coconut Premix 新配方需要多少冰块？',
    en: 'How much ice does the new Coconut Premix recipe use?',
    optionsZh: ['1000g（旧用量）', '400g（新用量）', '600g'],
    optionsEn: ['1000g (old amount)', '400g (new amount)', '600g'],
    correct: 1,
  },
  {
    zh: '新茶 Earl Grey 应该使用哪种泡茶程序？',
    en: 'Which brewing procedure should be used for the new Earl Grey tea?',
    optionsZh: ['Jasmine Tea 程序', 'Honey Black Tea 程序', '自行调整泡茶方法'],
    optionsEn: ['Jasmine Tea procedure', 'Honey Black Tea procedure', 'Choose your own method'],
    correct: 1,
  },
  {
    zh: '制作新饮品前，应该去哪里核对已发布的配方？',
    en: 'Where should you check the published new drink recipes before making them?',
    optionsZh: ['靠记忆操作', '小程序内已发布的新品配方页面', '等同事口头告知'],
    optionsEn: ['Rely on memory', 'The new recipes published in the app', 'Wait for verbal instructions'],
    correct: 1,
  },
] as const;

function getLocalKey(identity: string): string {
  return OCTOBER_RECIPE_NOTICE_VERSION + '_ack_' + identity;
}

export function MandatoryOctoberRecipeUpdate({ currentUser, adminMode, logs, appLang }: Props) {
  const userId = currentUser?.id ? String(currentUser.id) : '';
  // The PIN-only admin flow has no individual user ID. Keep its local acknowledgement
  // scoped by admin mode and browser rather than attributing it to another staff member.
  const identity = userId ? 'user:' + userId : adminMode ? 'admin:' + adminMode : '';
  const localKey = identity ? getLocalKey(identity) : '';
  const [lang, setLang] = useState<Language>(appLang === 'en' ? 'en' : 'zh');
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [started, setStarted] = useState<{ identity: string; at: number } | null>(null);
  const [tick, setTick] = useState(0);
  const [completedIdentity, setCompletedIdentity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  let localAcknowledged = false;
  try {
    localAcknowledged = Boolean(localKey && localStorage.getItem(localKey) === '1');
  } catch (e) {
    console.warn('Recipe notice local storage unavailable', e);
  }

  const cloudAcknowledged = Boolean(
    userId &&
    Array.isArray(logs) &&
    logs.some((entry: any) =>
      entry?.userId === userId &&
      entry?.type === 'RECIPE_UPDATE_QUIZ_ACK' &&
      entry?.noticeVersion === OCTOBER_RECIPE_NOTICE_VERSION
    )
  );

  const pending = Boolean(identity) &&
    !localAcknowledged &&
    !cloudAcknowledged &&
    completedIdentity !== identity;

  useEffect(() => {
    if (!pending) return;
    setStarted({ identity, at: Date.now() });
    setAnswers({});
    setError('');
    setLang(appLang === 'en' ? 'en' : 'zh');
    setTick(0);
    const timer = window.setInterval(() => setTick(value => value + 1), 500);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearInterval(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [identity, pending]);

  useEffect(() => {
    if (!cloudAcknowledged || !localKey) return;
    try { localStorage.setItem(localKey, '1'); } catch (_) {}
  }, [cloudAcknowledged, localKey]);

  const elapsedMs = started?.identity === identity ? Date.now() - started.at : 0;
  const secondsLeft = Math.max(0, Math.ceil((READ_SECONDS * 1000 - elapsedMs) / 1000));
  const allCorrect = QUESTIONS.every((question, index) => answers[index] === question.correct);
  const canConfirm = pending && secondsLeft === 0 && allCorrect && !saving;

  const complete = async () => {
    if (!canConfirm || !identity || (started?.identity !== identity) || (Date.now() - started.at < READ_SECONDS * 1000)) return;
    setSaving(true);
    setError('');
    try {
      if (userId) {
        await Cloud.saveLog({
          id: Date.now(),
          type: 'RECIPE_UPDATE_QUIZ_ACK',
          shift: 'recipe-update',
          time: new Date().toISOString(),
          userId,
          name: currentUser?.name || 'Staff',
          noticeVersion: OCTOBER_RECIPE_NOTICE_VERSION,
          questionsCorrect: QUESTIONS.length,
          readSeconds: READ_SECONDS,
          language: lang,
        });
      }
      try { localStorage.setItem(localKey, '1'); } catch (e) {
        console.warn('Recipe notice could not cache completion locally', e);
      }
      setCompletedIdentity(identity);
    } catch (e) {
      console.error('Recipe notice acknowledgement could not be saved', e);
      setError(lang === 'zh' ? '确认保存失败，请检查网络并重试。' : 'Could not save your acknowledgement. Check your connection and retry.');
    } finally {
      setSaving(false);
    }
  };

  if (!pending) return null;

  // Used by the app's other popups too; the gate deliberately has no close
  // button, escape handler, or backdrop-click dismissal.
  return (
    <div
      data-testid="recipe-update-gate"
      className="fixed inset-0 flex items-center justify-center bg-black/90 p-3 sm:p-5"
      style={{ zIndex: 2147483647 }}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="recipe-update-title"
    >
      <div className="flex max-h-[95dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-amber-300/60 bg-white text-slate-900 shadow-2xl">
        <header className="shrink-0 bg-slate-900 px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.15em] text-amber-300">ONESIP · Important Recipe Update</p>
              <h2 id="recipe-update-title" className="mt-1 text-xl font-black">
                {lang === 'zh' ? '重要配方更新 · 全员必读' : 'Important Recipe Changes · Please Read'}
              </h2>
              <p className="mt-1 text-xs text-slate-300">
                {lang === 'zh' ? '阅读以下三项更新，答对小测验后才能继续。' : 'Read all three updates and answer the quiz correctly to continue.'}
              </p>
            </div>
            <div className="flex shrink-0 gap-1 rounded-lg border border-white/20 bg-white/10 p-1" aria-label="Language">
              <button type="button" data-testid="recipe-update-lang-zh" onClick={() => setLang('zh')} aria-pressed={lang === 'zh'}
                className={'rounded-md px-2.5 py-1.5 text-xs font-black ' + (lang === 'zh' ? 'bg-white text-slate-900' : 'text-white')}>
                中文
              </button>
              <button type="button" data-testid="recipe-update-lang-en" onClick={() => setLang('en')} aria-pressed={lang === 'en'}
                className={'rounded-md px-2.5 py-1.5 text-xs font-black ' + (lang === 'en' ? 'bg-white text-slate-900' : 'text-white')}>
                EN
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <p className="mb-2 text-sm font-black text-amber-900">01 · Coconut Premix</p>
            <p className="text-sm leading-relaxed">
              {lang === 'zh' ? (
                <>冰块用量已从 <strong className="line-through">1000g</strong> 改成 <strong className="text-lg text-red-700">400g</strong>。<strong>其他所有配料和步骤保持不变。</strong> 更新后的新配方已经在页面置顶，请严格按新冰块用量制作。</>
              ) : (
                <>The ice amount has changed from <strong className="line-through">1000g</strong> to <strong className="text-lg text-red-700">400g</strong>. <strong>Everything else in the recipe stays the same.</strong> The updated recipe is pinned at the top of the page. Use 400g from now on.</>
              )}
            </p>
          </section>

          <section className="rounded-2xl border border-sky-300 bg-sky-50 p-4">
            <p className="mb-2 text-sm font-black text-sky-900">02 · Earl Grey</p>
            <p className="text-sm leading-relaxed">
              {lang === 'zh'
                ? '现在新增 Earl Grey 茶。泡茶时请使用与 Honey Black Tea 完全相同的泡茶程序，不要自行换成其他茶的程序。'
                : 'Earl Grey tea has been added. Brew it using the same procedure as Honey Black Tea. Do not substitute another tea-brewing procedure.'}
            </p>
          </section>

          <section className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4">
            <p className="mb-2 text-sm font-black text-emerald-900">
              {lang === 'zh' ? '03 · 新品配方已发布' : '03 · New Recipes Published'}
            </p>
            <p className="text-sm leading-relaxed">
              {lang === 'zh'
                ? '几个新品的配方现已发布在小程序页面。制作前请先打开配方页面核对最新版本，不要仅凭记忆操作。'
                : 'Recipes for several new drinks are now published in the app. Check the latest recipes on the recipe page before making these drinks instead of relying on memory.'}
            </p>
          </section>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid="recipe-update-quiz">
            <h3 className="text-base font-black">
              {lang === 'zh' ? '理解检查 · 3 道选择题' : 'Knowledge Check · 3 Questions'}
            </h3>
            <p className="mb-4 mt-1 text-xs text-slate-600">
              {lang === 'zh' ? '三题全部答对才能确认。答错可以重新选择。' : 'All three answers must be correct. You may change an incorrect answer.'}
            </p>
            <div className="space-y-5">
              {QUESTIONS.map((question, index) => (
                <fieldset key={index} className="space-y-2">
                  <legend className="text-sm font-black">{index + 1}. {lang === 'zh' ? question.zh : question.en}</legend>
                  {(lang === 'zh' ? question.optionsZh : question.optionsEn).map((option, optionIndex) => (
                    <label key={optionIndex} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
                      <input
                        data-testid={'recipe-update-answer-' + index + '-' + optionIndex}
                        type="radio"
                        name={'recipe-update-question-' + index}
                        checked={answers[index] === optionIndex}
                        onChange={() => setAnswers(previous => ({ ...previous, [index]: optionIndex }))}
                        className="h-4 w-4 accent-emerald-600"
                      />
                      {option}
                    </label>
                  ))}
                  {answers[index] !== undefined && (
                    <p className={'text-xs font-bold ' + (answers[index] === question.correct ? 'text-emerald-700' : 'text-red-700')}>
                      {answers[index] === question.correct
                        ? (lang === 'zh' ? '正确' : 'Correct')
                        : (lang === 'zh' ? '不正确，请重新选择。' : 'Not quite—please try again.')}
                    </p>
                  )}
                </fieldset>
              ))}
            </div>
          </div>
        </div>

        <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-white p-4">
          <p className="text-center text-xs font-semibold text-slate-600" data-testid="recipe-update-timer">
            {secondsLeft > 0
              ? (lang === 'zh' ? '请认真阅读，' + secondsLeft + ' 秒后可以提交' : 'Please read carefully. You can submit in ' + secondsLeft + ' seconds.')
              : (lang === 'zh' ? '阅读时间已完成，请答对全部题目。' : 'Reading time complete. Answer all questions correctly.')}
          </p>
          <button type="button" data-testid="recipe-update-confirm" disabled={!canConfirm} onClick={complete}
            className="w-full rounded-2xl bg-emerald-600 py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500">
            {saving
              ? (lang === 'zh' ? '正在记录确认…' : 'Saving acknowledgement…')
              : (lang === 'zh' ? '三题已答对，确认并继续使用' : 'All correct · Confirm and Continue')}
          </button>
          {error && <p className="text-center text-xs font-bold text-red-700" role="alert">{error}</p>}
        </footer>
      </div>
    </div>
  );
}
