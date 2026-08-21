import type { Plugin } from 'vite';

/**
 * Follow-up transform for mandatory break compliance.
 *
 * Business rule:
 * - Under 18: only shifts strictly LONGER than 4.5 hours need a 30-minute break reminder.
 * - 18 or above: only shifts strictly LONGER than 5.5 hours need a 30-minute break reminder.
 * - Exact 4.5h / 5.5h shifts do not show a badge, popup, or create a break log.
 *
 * This plugin runs after mandatoryBreakRulesPlugin and deliberately fails the build
 * if its expected anchors disappear, so a future App.tsx refactor cannot silently
 * weaken the break compliance behaviour.
 */
export function strictBreakSchedulePlugin(): Plugin {
  return {
    name: 'onesip-strict-break-schedule',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;

      let code = source;

      // 1) Correct the reminder threshold: equality is NOT included.
      const thresholdAnchor = '                if (durationMinutes < thresholdMinutes) continue;';
      if (!code.includes(thresholdAnchor)) {
        throw new Error('[strict-break] Mandatory break threshold anchor not found. Check plugin order or App.tsx changes.');
      }
      code = code.replace(
        thresholdAnchor,
        '                if (durationMinutes <= thresholdMinutes) continue;'
      );

      // Keep all employee-facing and audit wording aligned with the strict > rule.
      const wordingReplacements: Array<[string, string]> = [
        [
          '// 💡 强制休息监控：只提醒当前登录员工；<18 岁 >=4.5h，>=18 岁 >=5.5h。',
          '// 💡 强制休息监控：只提醒当前登录员工；<18 岁 >4.5h，>=18 岁 >5.5h。'
        ],
        [
          '// “以上”包含刚好 4.5h / 5.5h。',
          '// 仅严格超过阈值才触发；刚好 4.5h / 5.5h 不提醒。'
        ],
        [
          "? '你的班次达到 ' + alert.thresholdHours + ' 小时休息规则。班次已过半，请现在开始 30 分钟休息。'",
          "? '你的班次超过 ' + alert.thresholdHours + ' 小时。班次已过半，请现在开始 30 分钟休息。'"
        ],
        [
          ": 'Your shift meets the ' + alert.thresholdHours + '-hour break rule. The shift is halfway through, so please start your 30-minute break now.'}",
          ": 'Your shift is longer than ' + alert.thresholdHours + ' hours. The shift is halfway through, so please start your 30-minute break now.'}"
        ],
        [
          "', rule >= ' + thresholdHours + 'h.'",
          "', rule > ' + thresholdHours + 'h.'"
        ]
      ];

      for (const [from, to] of wordingReplacements) {
        if (!code.includes(from)) {
          throw new Error('[strict-break] Expected mandatory-break wording anchor not found: ' + from.slice(0, 60));
        }
        code = code.replace(from, to);
      }

      // 2) Add an obvious planning badge to the employee Team/Schedule view.
      // The badge is calculated for the logged-in employee only and uses that employee's age group.
      const teamViewMarker = "        if (view === 'team' && activeFeatures.schedule) {";
      const teamStart = code.indexOf(teamViewMarker);
      if (teamStart < 0) throw new Error('[strict-break] Staff Team/Schedule view not found');

      const shiftMapMarker = '                                                    {shiftsToRender.map((shift: any, sIdx: number) => {';
      const shiftMapStart = code.indexOf(shiftMapMarker, teamStart);
      if (shiftMapStart < 0) throw new Error('[strict-break] Staff schedule shift map not found');

      const shiftMapEndMarker = '\n                                                    })}\n';
      const shiftMapEndStart = code.indexOf(shiftMapEndMarker, shiftMapStart);
      if (shiftMapEndStart < 0) throw new Error('[strict-break] Staff schedule shift map end not found');
      const shiftMapEnd = shiftMapEndStart + shiftMapEndMarker.length;

      let scheduleSegment = code.slice(shiftMapStart, shiftMapEnd);

      const calcAnchor = "                                                        const timeDisplay = shift.start && shift.end ? `${shift.start}-${shift.end}` : '';\n";
      if (!scheduleSegment.includes(calcAnchor)) {
        throw new Error('[strict-break] Staff schedule time calculation anchor not found');
      }

      const calcCode = `                                                        const scheduleUser = users.find((u: any) => u.id === currentUser.id) || currentUser;
                                                        const scheduleBreakThresholdHours = scheduleUser?.ageGroup === 'under_18' ? 4.5 : 5.5;
                                                        const isMyScheduledShift = staffList.some((name: string) =>
                                                            name?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase()
                                                        );
                                                        let scheduleShiftDurationMinutes = 0;
                                                        if (shift.start && shift.end) {
                                                            const [scheduleStartH, scheduleStartM] = shift.start.split(':').map(Number);
                                                            const [scheduleEndH, scheduleEndM] = shift.end.split(':').map(Number);
                                                            if (![scheduleStartH, scheduleStartM, scheduleEndH, scheduleEndM].some(Number.isNaN)) {
                                                                const scheduleStartTotal = scheduleStartH * 60 + scheduleStartM;
                                                                let scheduleEndTotal = scheduleEndH * 60 + scheduleEndM;
                                                                if (scheduleEndTotal <= scheduleStartTotal) scheduleEndTotal += 24 * 60;
                                                                scheduleShiftDurationMinutes = scheduleEndTotal - scheduleStartTotal;
                                                            }
                                                        }
                                                        // Strictly greater only: exact 4.5h / 5.5h gets no planning notice.
                                                        const needsBreakPlanning = isMyScheduledShift && scheduleShiftDurationMinutes > scheduleBreakThresholdHours * 60;
`;
      scheduleSegment = scheduleSegment.replace(calcAnchor, calcAnchor + calcCode);

      const rowAnchor = '                                                            <div key={sIdx} className="flex items-start gap-3">';
      if (!scheduleSegment.includes(rowAnchor)) {
        throw new Error('[strict-break] Staff schedule shift row anchor not found');
      }
      scheduleSegment = scheduleSegment.replace(
        rowAnchor,
        '                                                            <div key={sIdx} className={`flex flex-wrap items-start gap-3 ${needsBreakPlanning ? \'rounded-xl border border-orange-200 bg-orange-50/40 p-2\' : \'\'}`}>'
      );

      const timeAnchor = '                                                                    {timeDisplay && <span className="text-[9px] text-text-light font-mono">{timeDisplay}</span>}';
      if (!scheduleSegment.includes(timeAnchor)) {
        throw new Error('[strict-break] Staff schedule time display anchor not found');
      }
      scheduleSegment = scheduleSegment.replace(
        timeAnchor,
        `${timeAnchor}\n                                                                    {needsBreakPlanning && (\n                                                                        <span className="text-[9px] font-black text-orange-600 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded-md whitespace-nowrap">\n                                                                            {lang === 'zh' ? '⚠ 需30m休息' : '⚠ 30m break'}\n                                                                        </span>\n                                                                    )}`
      );

      const staffBlockAnchor = `                                                                <div className="flex-1 flex flex-wrap gap-2 items-center">
                                                                    {staffList.map((name: string, i: number) => { 
                                                                        const isMe = name === currentUser.name; 
                                                                        return (<div key={i} className={\`flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-xs font-bold rounded-lg border transition-all \${isMe ? 'bg-primary text-white border-primary shadow-sm' : 'bg-secondary text-text-light border-transparent'}\`}>{name}</div>); 
                                                                    })}
                                                                </div>`;
      if (!scheduleSegment.includes(staffBlockAnchor)) {
        throw new Error('[strict-break] Staff schedule staff-list anchor not found');
      }

      const staffBlockWithWarning = `${staffBlockAnchor}
                                                                {needsBreakPlanning && (
                                                                    <div className="w-full sm:ml-[4.75rem] rounded-lg border border-orange-200 bg-orange-100/70 px-3 py-2 text-orange-900 shadow-sm">
                                                                        <div className="flex items-center gap-1.5 text-[11px] font-black">
                                                                            <Icon name="AlertTriangle" size={13} className="text-orange-600" />
                                                                            {lang === 'zh' ? '这个班需要提前安排 30 分钟休息' : 'Plan a 30-minute break for this shift'}
                                                                        </div>
                                                                        <p className="mt-1 text-[10px] leading-relaxed text-orange-800">
                                                                            {lang === 'zh'
                                                                                ? '你的班次超过 ' + scheduleBreakThresholdHours + ' 小时。请提前和搭班同事商量一个合适的 30 分钟休息时间，并让 Manager 知道最终安排。'
                                                                                : 'Your shift is longer than ' + scheduleBreakThresholdHours + ' hours. Please coordinate a suitable 30-minute break with the colleague(s) working the shift, and let your manager know the final arrangement.'}
                                                                        </p>
                                                                    </div>
                                                                )}`;
      scheduleSegment = scheduleSegment.replace(staffBlockAnchor, staffBlockWithWarning);

      code = code.slice(0, shiftMapStart) + scheduleSegment + code.slice(shiftMapEnd);

      return { code, map: null };
    },
  };
}
