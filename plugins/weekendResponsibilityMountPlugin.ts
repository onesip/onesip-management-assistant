import type { Plugin } from 'vite';

/**
 * Mount-only transform for the isolated weekend responsibility components.
 * No hooks, effects, state, or business logic are injected into StaffApp.
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
      code = code.replace(
        importAnchor,
        importAnchor + "\nimport { SafeWeekendShiftResponsibilityGate } from './components/WeekendShiftResponsibilityGate';\nimport { SafeWeekendResponsibilityLibrary } from './components/WeekendResponsibilityLibrary';"
      );

      const renderAnchor = '            <ActionReminderModal isOpen={isScheduleReminderOpen}';
      if (!code.includes(renderAnchor)) throw new Error('[weekend-responsibility-mount] render anchor missing');
      const responsibilityUi = `            <SafeWeekendShiftResponsibilityGate\n                currentUser={currentUser}\n                schedule={schedule}\n                storeId={myStoreId}\n                lang={lang}\n            />\n            <SafeWeekendResponsibilityLibrary\n                currentUser={currentUser}\n                schedule={schedule}\n                storeId={myStoreId}\n                lang={lang}\n            />\n`;
      code = code.replace(renderAnchor, responsibilityUi + renderAnchor);

      // Guard against accidentally mounting before myStoreId is declared in StaffApp.
      const storePos = code.indexOf('    const myStoreId = activeStoreId;');
      const gatePos = code.indexOf('<SafeWeekendShiftResponsibilityGate');
      const libraryPos = code.indexOf('<SafeWeekendResponsibilityLibrary');
      if (storePos < 0 || gatePos < 0 || libraryPos < 0 || gatePos <= storePos || libraryPos <= storePos) {
        throw new Error('[weekend-responsibility-mount] responsibility UI is mounted before myStoreId initialization');
      }

      return { code, map: null };
    },
  };
}
