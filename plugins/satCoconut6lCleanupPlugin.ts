import type { Plugin } from 'vite';

/**
 * Content-only cleanup for Sat Opening Coconut wording.
 * Removes the old 6L target while keeping same-day fresh / no-overnight rules.
 */
export function satCoconut6lCleanupPlugin(): Plugin {
  return {
    name: 'onesip-sat-coconut-6l-cleanup-20260822',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      const isGate = cleanId.endsWith('/components/WeekendShiftResponsibilityGate.tsx');
      const isLibrary = cleanId.endsWith('/components/WeekendResponsibilityLibrary.tsx');
      if (!isGate && !isLibrary) return null;

      const zhOld = '周六当天 Coconut Premix 必须由早班现做并当天用完；13:30 前确保当日新做 Coconut 有 6L，不得使用隔夜料，低于 6L 时补足。';
      const zhNew = '周六当天 Coconut Premix 必须由早班现做并当天用完；不得使用隔夜料。';
      const enOld = 'Saturday Coconut Premix must be made fresh by the opening shift and used the same day. Before 13:30, make sure there are 6L of today’s fresh Coconut; never use overnight Coconut, and make more fresh Coconut if below 6L.';
      const enNew = 'Saturday Coconut Premix must be made fresh by the opening shift and used the same day. Never use overnight Coconut.';

      if (!source.includes(zhOld) || !source.includes(enOld)) {
        throw new Error(`[sat-coconut-6l-cleanup] expected Sat Coconut 6L wording missing in ${cleanId}`);
      }

      const code = source.replace(zhOld, zhNew).replace(enOld, enNew);

      if (code.includes('当日新做 Coconut 有 6L') || code.includes('6L of today’s fresh Coconut')) {
        throw new Error(`[sat-coconut-6l-cleanup] Sat Coconut 6L wording still present in ${cleanId}`);
      }

      return { code, map: null };
    },
  };
}
