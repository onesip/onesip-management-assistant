import type { Plugin } from 'vite';

/**
 * Minimal mount-only transform for the isolated weekend responsibility component.
 * It deliberately does not inject hooks, local consts, or business logic into App.tsx.
 */
export function weekendResponsibilityMountPlugin(): Plugin {
  return {
    name: 'onesip-weekend-responsibility-mount',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;

      const importAnchor = "import { useNotification } from './components/GlobalNotification';";
      if (!code.includes(importAnchor)) throw new Error('[weekend-responsibility-mount] import anchor missing');
      code = code.replace(importAnchor, importAnchor + "\nimport { SafeWeekendShiftResponsibilityGate } from './components/SafeWeekendShiftResponsibilityGate';");

      const renderAnchor = '            <ActionReminderModal isOpen={isScheduleReminderOpen}';
      if (!code.includes(renderAnchor)) throw new Error('[weekend-responsibility-mount] render anchor missing');
      const gate = `            <SafeWeekendShiftResponsibilityGate\n                currentUser={currentUser}\n                schedule={schedule}\n                storeId={myStoreId}\n                lang={lang}\n            />\n`;
      code = code.replace(renderAnchor, gate + renderAnchor);

      return { code, map: null };
    },
  };
}
