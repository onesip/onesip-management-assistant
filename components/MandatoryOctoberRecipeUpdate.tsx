import React, { useEffect, useState } from 'react';
import * as Cloud from '../services/cloud';

export const OCTOBER_RECIPE_NOTICE_VERSION = 'onesip_recipe_updates_2026_10_20_v3_earlgrey_slot3';
const READ_SECONDS = 35;

type Language = 'zh' | 'en';
type AdminMode = 'manager' | 'owner' | 'editor' | null;
type UserLike = { id?: string; name?: string; role?: string } | null;

type Props = {
  currentUser: UserLike;
  adminMode: AdminMode;
  logs: any[];
  appLang: Language;
};

const UPDATES = [
  {
    title: '01 · Passion Fruit',
    zh: 'Passion Fruit 现在改为手动添加，位置在原来放茶冻的位置、芒果果肉旁边。500ml 中杯加 2 勺；660ml 大杯加 3 勺。不要再按旧的机器出料位置或旧份量操作。',
    en: 'Passion Fruit is now added by hand. Find it in the old Tea Jelly position, next to the mango pulp. Add 2 scoops for a 500ml medium drink and 3 scoops for a 660ml large drink. Do not use the previous dispenser position or quantity.',
  },
  {
    title: '02 · Tea Jelly / 茶冻',
    zh: '茶冻已移到玻璃滑盖下面的小料台。取茶冻时请去该小料台，不要再去原来的 Passion Fruit 旁边位置找。',
    en: 'Tea Jelly has moved to the topping station underneath the sliding glass lid. Take it from this station, not from its former position next to Passion Fruit.',
  },
  {
    title: '03 · Taro / 芋头回归',
    zh: 'Taro 已回归，放在 10 号管（之前 Passion Fruit 的机位）。日常备料必须恢复制作 Taro Premix。不要把 Taro 放回旧的芋头位置。',
    en: 'Taro is back. It is assigned to dispensing line No. 10, formerly used for Passion Fruit. Resume preparing Taro Premix as part of daily prep. Do not use the old Taro position.',
  },
  {
    title: '04 · Earl Grey 取代 Honey Black Tea',
    zh: '从 2026 年 10 月 20 日开始，停止泡 Honey Black Tea。原本使用 Honey Black Tea 的饮品与茶底统一改用 Earl Grey；Earl Grey 目前放在 3 号管。Earl Grey 仍沿用之前 Honey Black Tea 的泡茶程序。',
    en: 'Starting 20 October 2026, stop brewing Honey Black Tea. Replace Honey Black Tea with Earl Grey in all drinks and tea bases that previously used it. Earl Grey is now on dispensing line No. 3. Brew Earl Grey using the former Honey Black Tea brewing procedure.',
  },
  {
    title: '05 · 每日备料提醒 / Daily Prep',
    zh: '备料时一定检查并按已发布配方和实际备料目标准备 Masala、Earl Grey 和 Taro Premix。不要漏掉任何一项；具体用量仍以小程序最新配方及备料目标为准。',
    en: 'Daily prep must include checking and preparing Masala, Earl Grey and Taro Premix according to the published recipes and current prep targets. Do not miss any of these items; use the latest app recipes for exact quantities.',
  },
] as const;

const QUESTIONS = [
  {
    zh: 'Passion Fruit 现在放在哪里？', en: 'Where is Passion Fruit now?',
    optionsZh: ['Taro 的旧位置', '以前茶冻的位置，芒果果肉旁边', '玻璃滑盖下面的小料台'],
    optionsEn: ['The old Taro position', 'The former Tea Jelly position, beside mango pulp', 'The station under the sliding glass lid'],
    correct: 1,
  },
  {
    zh: '500ml 中杯要手动加几勺 Passion Fruit？', en: 'How many scoops of Passion Fruit for a 500ml medium?',
    optionsZh: ['2 勺', '1 勺', '3 勺'], optionsEn: ['2 scoops', '1 scoop', '3 scoops'], correct: 0,
  },
  {
    zh: '660ml 大杯要手动加几勺 Passion Fruit？', en: 'How many scoops of Passion Fruit for a 660ml large?',
    optionsZh: ['1 勺', '2 勺', '3 勺'], optionsEn: ['1 scoop', '2 scoops', '3 scoops'], correct: 2,
  },
  {
    zh: '现在应该从哪里取茶冻？', en: 'Where do you get Tea Jelly now?',
    optionsZh: ['芒果果肉旁边', '玻璃滑盖下面的小料台', '10 号管'],
    optionsEn: ['Next to mango pulp', 'The topping station under the sliding glass lid', 'Dispensing line No. 10'], correct: 1,
  },
  {
    zh: 'Taro 现在放在哪个位置？', en: 'Where is Taro placed now?',
    optionsZh: ['玻璃滑盖下面', '芒果果肉旁边', '10 号管，原 Passion Fruit 机位'],
    optionsEn: ['Under the sliding glass lid', 'Next to mango pulp', 'Dispensing line No. 10, formerly for Passion Fruit'], correct: 2,
  },
  {
    zh: 'Taro 回归后备料要做什么？', en: 'What prep is needed now that Taro is back?',
    optionsZh: ['恢复制作 Taro Premix', '不需要 Taro Premix', '只做 Coconut Premix'],
    optionsEn: ['Resume making Taro Premix', 'No Taro Premix is needed', 'Only make Coconut Premix'], correct: 0,
  },
  {
    zh: '从 10 月 20 日起，Honey Black Tea 应如何处理？', en: 'What changes on 20 October regarding Honey Black Tea?',
    optionsZh: ['继续泡 Honey Black Tea', '不再泡 Honey Black Tea，全部改 Earl Grey，并沿用原 Honey Black 泡茶程序', 'Earl Grey 使用 Jasmine 的程序'],
    optionsEn: ['Keep brewing Honey Black Tea', 'Stop Honey Black; use Earl Grey and the previous Honey Black brewing procedure', 'Brew Earl Grey with the Jasmine procedure'], correct: 1,
  },
  {
    zh: '每天需要重点检查哪三项备料？', en: 'Which three prep items must be checked daily?',
    optionsZh: ['Jasmine、Coconut、珍珠', 'Passion Fruit、Honey Black、茶冻', 'Masala、Earl Grey、Taro Premix'],
    optionsEn: ['Jasmine, Coconut and pearls', 'Passion Fruit, Honey Black and Tea Jelly', 'Masala, Earl Grey and Taro Premix'], correct: 2,
  },
  {
    zh: 'Earl Grey 现在放在几号管？', en: 'Which dispensing line is Earl Grey on now?',
    optionsZh: ['10 号管', '3 号管', '原茶冻位置'],
    optionsEn: ['Line No. 10', 'Line No. 3', 'The former Tea Jelly position'],
    correct: 1,
  },] as const;

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
                {lang === 'zh' ? '阅读以下五项更新，并答对全部测试题后才能继续。' : 'Read all five updates and answer every quiz question correctly to continue.'}
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
          {UPDATES.map((update, index) => (
            <section key={update.title} className="rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid={'recipe-update-section-' + index}>
              <p className="mb-2 text-sm font-black text-amber-900">{update.title}</p>
              <p className="text-sm font-semibold leading-relaxed text-slate-800">{lang === 'zh' ? update.zh : update.en}</p>
            </section>
          ))}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid="recipe-update-quiz">
            <h3 className="text-base font-black">
              {lang === 'zh' ? '理解检查 · 9 道选择题' : 'Knowledge Check · 9 Questions'}
            </h3>
            <p className="mb-4 mt-1 text-xs text-slate-600">
              {lang === 'zh' ? '九题全部答对才能确认。答错可以重新选择。' : 'All nine answers must be correct. You may change an incorrect answer.'}
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
              : (lang === 'zh' ? '九题已答对，确认并继续使用' : 'All 9 correct · Confirm and Continue')}
          </button>
          {error && <p className="text-center text-xs font-bold text-red-700" role="alert">{error}</p>}
        </footer>
      </div>
    </div>
  );
}
