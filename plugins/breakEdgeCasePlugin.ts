import type { Plugin } from 'vite';

/**
 * Guards against malformed zero-length shifts being interpreted as 24-hour shifts.
 *
 * This runs after the mandatory/strict break transforms and patches both:
 * - same-day break reminder duration handling
 * - employee Schedule planning badge duration handling
 */
export function breakEdgeCasePlugin(): Plugin {
  return {
    name: 'onesip-break-edge-cases',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;

      let code = source;

      const liveReminderAnchor = '                if (shiftEnd <= shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);';
      const liveReminderFix = `                // Equal start/end is an invalid zero-length shift, not a 24-hour overnight shift.\n                if (shiftEnd.getTime() === shiftStart.getTime()) continue;\n                if (shiftEnd < shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);`;
      if (!code.includes(liveReminderAnchor)) {
        throw new Error('[break-edge] Live reminder duration anchor not found');
      }
      code = code.replace(liveReminderAnchor, liveReminderFix);

      const scheduleAnchor = '                                                                if (scheduleEndTotal <= scheduleStartTotal) scheduleEndTotal += 24 * 60;';
      const scheduleFix = '                                                                if (scheduleEndTotal < scheduleStartTotal) scheduleEndTotal += 24 * 60;';
      if (!code.includes(scheduleAnchor)) {
        throw new Error('[break-edge] Schedule duration anchor not found');
      }
      code = code.replace(scheduleAnchor, scheduleFix);

      return { code, map: null };
    },
  };
}
