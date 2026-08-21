import type { Plugin } from 'vite';

/**
 * Makes weekend shift responsibility acknowledgement mandatory for the whole
 * scheduled day, not only the 90-minute pre-shift window. Also bumps the
 * responsibility version so changed duties require a fresh acknowledgement.
 */
export function weekendResponsibilityForceDayPlugin(): Plugin {
  return {
    name: 'onesip-weekend-responsibility-force-day-20260821',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/components/WeekendShiftResponsibilityGate.tsx')) return null;

      let code = source;

      const versionOld = "const VERSION = 'weekend_shift_responsibility_2026_08_21_v3';";
      const versionNew = "const VERSION = 'weekend_shift_responsibility_2026_08_21_v4';";
      if (!code.includes(versionOld)) {
        throw new Error('[weekend-responsibility-force-day] missing responsibility version anchor');
      }
      code = code.replace(versionOld, versionNew);

      const windowOld = 'const inRequiredWindow = Boolean(context && nowMinutes >= context.start - 90 && nowMinutes <= context.end);';
      const windowNew = 'const inRequiredWindow = Boolean(context); // Any scheduled weekend shift today requires acknowledgement when the app is opened.';
      if (!code.includes(windowOld)) {
        throw new Error('[weekend-responsibility-force-day] missing required-window anchor');
      }
      code = code.replace(windowOld, windowNew);

      if (!code.includes("weekend_shift_responsibility_2026_08_21_v4") || !code.includes('const inRequiredWindow = Boolean(context)')) {
        throw new Error('[weekend-responsibility-force-day] verification failed');
      }

      return { code, map: null };
    },
  };
}
