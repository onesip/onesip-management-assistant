import type { Plugin } from 'vite';

/**
 * Reliability guard for weekendShiftResponsibilityPlugin.
 * Runs after that transform and strengthens multi-shift selection, shared rules,
 * and audit guarantees.
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

      const generalAnchor = `                    {renderSection('记录与异常', 'Record & escalate', escalate)}`;
      const generalSection = `                    {renderSection('记录与异常', 'Record & escalate', escalate)}
                    {renderSection('总原则', 'Overall rules', lang === 'zh' ? [
                        '早班负责做和补料；晚班负责盘点和补差额；高峰班专注出杯和补充已经备好的物料。',
                        '先保证营业不中断；发现不足先补，再记录，再反馈。',
                        '所有新物料放后面、旧物料放前面，严格先进先出 FIFO。',
                        '客人等待时间尽量控制在约 15 分钟内，不能因为缺料停止接单。',
                        '目标量、实际完成量、剩余量和 waste 都必须提交。',
                        '原料、容器和工具用完归位，台面保持可以继续出品。',
                        '没有提交记录，就视为没有完成。',
                        '缺料、过期、设备问题或找不到货，必须及时告诉店长或当班负责人。'
                    ] : [
                        'Opening shifts prep/refill; closing shifts count and refill gaps; peak shifts focus on drinks and ready stock.',
                        'Keep service running. If something is low, refill first, record it, then report it.',
                        'Put new stock behind old stock and follow FIFO strictly.',
                        'Keep customer waiting time to about 15 minutes where possible; do not stop orders because prep is missing.',
                        'Targets, actual completed quantities, remaining stock and waste must all be submitted.',
                        'Return ingredients, containers and tools to their places and keep the station ready.',
                        'No submission means the task is treated as not completed.',
                        'Report shortages, expiry, equipment issues or missing stock to the manager/person in charge promptly.'
                    ])}`;
      if (!code.includes(generalAnchor)) throw new Error('[weekend-responsibility-reliability] general rules anchor missing');
      code = code.replace(generalAnchor, generalSection);

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
