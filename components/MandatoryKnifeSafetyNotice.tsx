import React, { useEffect, useState } from 'react';
import * as Cloud from '../services/cloud';

export const KNIFE_SAFETY_NOTICE_VERSION = 'onesip_no_knives_2026_10_25_v1';
const MIN_READ_SECONDS = 10;

type Person = { id?: string; name?: string; role?: string } | null;
type Props = {
  currentUser: Person;
  adminMode: 'manager' | 'owner' | 'editor' | null;
  logs: any[];
  appLang: 'zh' | 'en';
};

/**
 * Mandatory stand-alone workplace notice for every signed-in role.
 * Logged-in named staff/manager accounts are tracked individually in cloud logs.
 * PIN-only admin users must enter their own name; there is no shared-device
 * permanent acknowledgement for anonymous PIN sessions.
 */
export function MandatoryKnifeSafetyNotice({ currentUser, adminMode, logs, appLang }: Props) {
  const userId = currentUser?.id ? String(currentUser.id) : '';
  const identity = userId ? 'user:' + userId : adminMode ? 'pin:' + adminMode : '';
  const localKey = userId ? KNIFE_SAFETY_NOTICE_VERSION + '_ack_' + userId : '';
  const [lang, setLang] = useState<'zh' | 'en'>(appLang === 'en' ? 'en' : 'zh');
  const [checked, setChecked] = useState(false);
  const [pinName, setPinName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmedSession, setConfirmedSession] = useState('');
  const [started, setStarted] = useState<{ identity: string; time: number } | null>(null);
  const [tick, setTick] = useState(0);

  let localAcknowledged = false;
  try {
    localAcknowledged = Boolean(localKey && localStorage.getItem(localKey) === '1');
  } catch (e) {
    console.warn('Knife safety notice local acknowledgement unavailable', e);
  }

  const cloudAcknowledged = !!userId && Array.isArray(logs) && logs.some((entry: any) =>
    entry?.type === 'KNIFE_SAFETY_ACK' &&
    entry?.noticeVersion === KNIFE_SAFETY_NOTICE_VERSION &&
    String(entry?.userId || '') === userId
  );
  const pending = !!identity && !localAcknowledged && !cloudAcknowledged &&
    confirmedSession !== identity;

  useEffect(() => {
    if (!pending) return;
    setChecked(false);
    setPinName('');
    setError('');
    setLang(appLang === 'en' ? 'en' : 'zh');
    setStarted({ identity, time: Date.now() });
    setTick(0);
    const handle = window.setInterval(() => setTick(v => v + 1), 500);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearInterval(handle);
      document.body.style.overflow = previousOverflow;
    };
  }, [identity, pending]);

  useEffect(() => {
    if (!cloudAcknowledged || !localKey) return;
    try { localStorage.setItem(localKey, '1'); } catch (_) {}
  }, [cloudAcknowledged, localKey]);

  const secondsRemaining = started?.identity === identity
    ? Math.max(0, Math.ceil((MIN_READ_SECONDS * 1000 - (Date.now() - started.time)) / 1000))
    : MIN_READ_SECONDS;
  const canConfirm = pending && checked && secondsRemaining === 0 && !saving &&
    (!!userId || pinName.trim().length >= 2);

  const confirm = async () => {
    if (!canConfirm || !identity || started?.identity !== identity ||
      Date.now() - started.time < MIN_READ_SECONDS * 1000) return;
    setSaving(true);
    setError('');
    const ackTime = new Date().toISOString();
    const personName = userId ? (currentUser?.name || 'Staff') : pinName.trim();
    const entry: any = {
      id: Date.now(),
      type: 'KNIFE_SAFETY_ACK',
      shift: 'workplace-safety',
      time: ackTime,
      confirmedAt: ackTime,
      userId: userId || null,
      name: personName,
      role: currentUser?.role || adminMode || 'unknown',
      pinOnly: !userId,
      noticeVersion: KNIFE_SAFETY_NOTICE_VERSION,
      acknowledgement: 'No knives or blades in any work area. Use scissors for opening/cutting.',
      status: 'acknowledged',
      language: lang,
    };
    try {
      await Cloud.saveKnifeSafetyAcknowledgement(entry);
      if (localKey) {
        try { localStorage.setItem(localKey, '1'); } catch (e) {
          console.warn('Safety acknowledgement saved to Cloud but not local storage', e);
        }
      }
      setConfirmedSession(identity);
    } catch (e) {
      console.error('Mandatory knife safety acknowledgement failed', e);
      setError(lang === 'zh'
        ? '确认未成功保存，请检查网络后重试。'
        : 'Acknowledgement could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!pending) return null;

  return (
    <div data-testid="knife-safety-gate" className="fixed inset-0 flex items-center justify-center bg-black/90 p-3 sm:p-5"
      style={{ zIndex: 2147483647 }} role="alertdialog" aria-modal="true" aria-labelledby="knife-safety-title">
      <div className="flex max-h-[95dvh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border-2 border-red-500 bg-white text-slate-900 shadow-2xl">
        <header className="shrink-0 bg-red-700 p-5 text-white">
          <p className="text-[11px] font-black uppercase tracking-wider text-red-100">ONESIP · Mandatory Safety Notice</p>
          <h2 id="knife-safety-title" className="mt-2 text-xl font-black">
            {lang === 'zh' ? '重要安全公告 · 全员必须确认' : 'Important Safety Notice · Everyone Must Confirm'}
          </h2>
          <p className="mt-2 text-xs text-red-100">
            {lang === 'zh' ? '本规定立即生效。请阅读并亲自确认。' : 'Effective immediately. Read and acknowledge this rule yourself.'}
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" data-testid="knife-safety-lang-zh" onClick={() => setLang('zh')}
              aria-pressed={lang === 'zh'}
              className={'rounded-lg px-3 py-1.5 text-xs font-bold ' + (lang === 'zh' ? 'bg-white text-red-700' : 'bg-white/15 text-white')}>
              中文
            </button>
            <button type="button" data-testid="knife-safety-lang-en" onClick={() => setLang('en')}
              aria-pressed={lang === 'en'}
              className={'rounded-lg px-3 py-1.5 text-xs font-bold ' + (lang === 'en' ? 'bg-white text-red-700' : 'bg-white/15 text-white')}>
              EN
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 p-5">
          <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
            <p className="text-lg font-black text-red-800">
              {lang === 'zh' ? '工作区域严禁出现任何刀具！' : 'NO KNIVES OR BLADES IN WORK AREAS!'}
            </p>
            <p className="mt-3 text-sm font-semibold leading-relaxed">
              {lang === 'zh'
                ? 'ONESIP 的所有工作区域都不允许放置或使用刀具，包括刀片、美工刀、厨房刀等。任何需要剪开、拆封或割开包装、胶带和其他物品的情况，一律使用剪刀，不允许使用刀。'
                : 'No knives or blades may be kept or used anywhere in ONESIP work areas, including utility knives, kitchen knives and loose blades. Whenever you need to cut or open packaging, tape or other items, use scissors only. Knives are not permitted.'}
            </p>
            <p className="mt-3 text-sm font-semibold leading-relaxed">
              {lang === 'zh'
                ? '如果发现工作区域有刀具，立即停止使用并通知当班负责人安全移走。剪刀使用后请放回指定位置。'
                : 'If you find a knife or blade in a work area, stop using it and inform the shift lead so it can be removed safely. Put scissors back in their designated place after use.'}
            </p>
          </div>
          {!userId && (
            <label className="block text-sm font-bold">
              {lang === 'zh' ? '请输入您的姓名以记录个人确认（管理 PIN 入口）' : 'Enter your name for your own acknowledgement (admin PIN mode)'}
              <input data-testid="knife-safety-pin-name" type="text" value={pinName}
                onChange={e => setPinName(e.target.value)} maxLength={80}
                placeholder={lang === 'zh' ? '姓名' : 'Your name'}
                className="mt-2 w-full rounded-xl border border-gray-300 p-3 text-sm" />
            </label>
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-300 bg-slate-50 p-4">
            <input data-testid="knife-safety-checkbox" type="checkbox" checked={checked}
              onChange={e => setChecked(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-red-700" />
            <span className="text-sm font-bold leading-relaxed">
              {lang === 'zh'
                ? '我已完整阅读并理解：ONESIP 工作区域绝对不能出现或使用刀具；需要剪开任何物品时使用剪刀。我会严格遵守。'
                : 'I have read and understood: knives and blades are not allowed in ONESIP work areas. I will use scissors when cutting/opening items and follow this rule.'}
            </span>
          </label>
        </div>
        <footer className="shrink-0 space-y-2 border-t border-slate-200 bg-white p-4">
          <p data-testid="knife-safety-timer" className="text-center text-xs font-semibold text-slate-600">
            {secondsRemaining
              ? (lang === 'zh' ? '请认真阅读，' + secondsRemaining + ' 秒后可确认' : 'Please read carefully: ' + secondsRemaining + ' seconds remaining.')
              : (lang === 'zh' ? '请勾选确认后继续' : 'Tick the acknowledgement box to continue.')}
          </p>
          <button type="button" data-testid="knife-safety-confirm" disabled={!canConfirm} onClick={confirm}
            className="w-full rounded-2xl bg-red-700 px-4 py-3.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500">
            {saving ? (lang === 'zh' ? '正在记录确认…' : 'Recording acknowledgement…')
              : (lang === 'zh' ? '我已阅读、理解并承诺遵守' : 'I HAVE READ, UNDERSTAND & WILL FOLLOW')}
          </button>
          {error && <p role="alert" className="text-center text-xs font-bold text-red-700">{error}</p>}
        </footer>
      </div>
    </div>
  );
}
