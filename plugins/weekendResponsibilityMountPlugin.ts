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

      // Staff app: force/ack gate + always-visible library.
      const renderAnchor = '            <ActionReminderModal isOpen={isScheduleReminderOpen}';
      if (!code.includes(renderAnchor)) throw new Error('[weekend-responsibility-mount] staff render anchor missing');
      const responsibilityUi = `            <SafeWeekendShiftResponsibilityGate\n                currentUser={currentUser}\n                schedule={schedule}\n                storeId={myStoreId}\n                lang={lang}\n            />\n            <SafeWeekendResponsibilityLibrary\n                currentUser={currentUser}\n                schedule={schedule}\n                storeId={myStoreId}\n                lang={lang}\n            />\n`;
      code = code.replace(renderAnchor, responsibilityUi + renderAnchor);

      // Manager/owner app: view-only responsibility library so management can inspect all 8 templates.
      const adminAnchor = `    if (adminMode === 'owner' || adminMode === 'manager') {
        return (
            <OwnerDashboard data={appData} currentUser={currentUser} adminMode={adminMode} onExit={() => setAdminMode(null)} />
        );
    }`;
      if (!code.includes(adminAnchor)) throw new Error('[weekend-responsibility-mount] admin render anchor missing');
      const adminReplacement = `    if (adminMode === 'owner' || adminMode === 'manager') {
        return (
            <>
                <OwnerDashboard data={appData} currentUser={currentUser} adminMode={adminMode} onExit={() => setAdminMode(null)} />
                <SafeWeekendResponsibilityLibrary
                    currentUser={currentUser || ({ id: 'responsibility-admin-preview', name: adminMode === 'owner' ? 'Owner' : 'Manager', role: 'manager' } as any)}
                    schedule={schedule}
                    storeId={stores?.[0]?.id || 'default_store'}
                    lang={lang}
                />
            </>
        );
    }`;
      code = code.replace(adminAnchor, adminReplacement);

      // Guard against accidentally mounting staff responsibility UI before myStoreId is declared in StaffApp.
      const storePos = code.indexOf('    const myStoreId = activeStoreId;');
      const gatePos = code.indexOf('<SafeWeekendShiftResponsibilityGate');
      const staffLibraryPos = code.indexOf('<SafeWeekendResponsibilityLibrary', gatePos);
      if (storePos < 0 || gatePos < 0 || staffLibraryPos < 0 || gatePos <= storePos || staffLibraryPos <= storePos) {
        throw new Error('[weekend-responsibility-mount] staff responsibility UI is mounted before myStoreId initialization');
      }

      return { code, map: null };
    },
  };
}
