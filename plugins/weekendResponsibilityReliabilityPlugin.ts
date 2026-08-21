import type { Plugin } from 'vite';

/**
 * Reliability guard for weekendShiftResponsibilityPlugin.
 * Runs after that transform and strengthens multi-shift selection and audit guarantees.
 */
export function weekendResponsibilityReliabilityPlugin(): Plugin {
  return {
    name: 'onesip-weekend-responsibility-reliability',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;

      const oldScore = `            let score = Math.abs(start - nowMinutes); if (nowMinutes >= start - 90 && nowMinutes <= end) score -= 10000;
            return { ...item, start, end, score };
        }).sort((a: any, b: any) => a.score - b.score)[0];`;
      const newScore = `            const isActiveNow = nowMinutes >= start && nowMinutes <= end;
            const isPreShiftWindow = nowMinutes >= start - 90 && nowMinutes < start;
            const priority = isActiveNow ? 0 : (isPreShiftWindow ? 1 : 2);
            const distance = Math.abs(start - nowMinutes);
            return { ...item, start, end, priority, distance };
        }).sort((a: any, b: any) => a.priority - b.priority || a.distance - b.distance)[0];`;
      if (!code.includes(oldScore)) throw new Error('[weekend-responsibility-reliability] selection anchor missing');
      code = code.replace(oldScore, newScore);

      const shownReason = `reason: 'Mandatory shift responsibility shown'`;
      const shownReasonNew = `reason: 'Responsibility shown: ' + context.template.labelEn + ' ' + context.shift.start + '-' + context.shift.end`;
      if (!code.includes(shownReason)) throw new Error('[weekend-responsibility-reliability] shown reason anchor missing');
      code = code.replace(shownReason, shownReasonNew);

      const ackReason = `reason: 'Employee explicitly confirmed shift responsibility'`;
      const ackReasonNew = `reason: 'Confirmed: ' + weekendResponsibilityTemplate.labelEn + ' ' + weekendResponsibilityShift.start + '-' + weekendResponsibilityShift.end`;
      if (!code.includes(ackReason)) throw new Error('[weekend-responsibility-reliability] ack reason anchor missing');
      code = code.replace(ackReason, ackReasonNew);

      const weakAck = `        try { await Promise.resolve((Cloud as any).saveLog?.(ackLog)); } catch (e) { console.error('Responsibility acknowledgement log failed', e); }
        try { localStorage.setItem(ackKey, acknowledgedAt); } catch (e) {}`;
      const strongAck = `        try {
            await Promise.resolve((Cloud as any).saveLog?.(ackLog));
        } catch (e) {
            console.error('Responsibility acknowledgement log failed', e);
            setWeekendResponsibilitySaving(false);
            alert(lang === 'zh' ? '网络异常：本次确认还没有成功记录。请连接网络后重新确认，弹窗不会关闭。' : 'Network error: your acknowledgement was not recorded. Reconnect and confirm again.');
            return;
        }
        try { localStorage.setItem(ackKey, acknowledgedAt); } catch (e) {}`;
      if (!code.includes(weakAck)) throw new Error('[weekend-responsibility-reliability] acknowledgement anchor missing');
      code = code.replace(weakAck, strongAck);

      return { code, map: null };
    },
  };
}
