import type { Plugin } from 'vite';

/**
 * Moves the mandatory staff-rules hook/effect block to a point after myStoreId
 * has been initialized. The original staffRulesPopupPlugin inserts that block
 * immediately after pendingSwapCount, which is too early: its effect dependency
 * array reads myStoreId before the later const declaration and causes a browser
 * TDZ ReferenceError in production.
 */
export function staffRulesTdzFixPlugin(): Plugin {
  return {
    name: 'onesip-staff-rules-tdz-fix',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;

      let code = source;
      const blockStart = '    const [showMandatoryStaffRules, setShowMandatoryStaffRules] = useState(false);\n';
      const blockEndAnchor = '    const scheduleReminderShown = useRef(false);\n';
      const safeAnchor = '    const activeFeatures = { ...defaultFeatures, ...(myStore?.features || {}) };\n';

      const start = code.indexOf(blockStart);
      const end = code.indexOf(blockEndAnchor, start);
      if (start < 0 || end < 0) throw new Error('[staff-rules-tdz-fix] injected staff-rules block not found');
      if (!code.includes(safeAnchor)) throw new Error('[staff-rules-tdz-fix] safe myStoreId anchor not found');

      const block = code.slice(start, end);
      code = code.slice(0, start) + code.slice(end);
      code = code.replace(safeAnchor, safeAnchor + '\n' + block);

      // Build-time guard: after moving, myStoreId must occur before the staff-rules effect.
      const myStorePos = code.indexOf('    const myStoreId = activeStoreId;');
      const movedPos = code.indexOf(blockStart);
      if (myStorePos < 0 || movedPos < 0 || movedPos <= myStorePos) {
        throw new Error('[staff-rules-tdz-fix] staff-rules block is still before myStoreId');
      }

      return { code, map: null };
    },
  };
}
