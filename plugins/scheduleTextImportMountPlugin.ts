import type { Plugin } from 'vite';

/**
 * Mounts the isolated ScheduleTextImporter inside the manager Schedule view.
 * No ManagerDashboard state/effect logic is rewritten; the component receives
 * the already-existing schedule state and active branch context as props.
 */
export function scheduleTextImportMountPlugin(): Plugin {
  return {
    name: 'onesip-schedule-text-import-mount',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;

      let code = source;

      const importAnchor = "import { useNotification } from './components/GlobalNotification';";
      const importLine = "import { ScheduleTextImporter } from './components/ScheduleTextImporter';";
      if (!code.includes(importAnchor)) throw new Error('[schedule-text-import] GlobalNotification import anchor missing');
      if (!code.includes(importLine)) {
        code = code.replace(importAnchor, `${importAnchor}\n${importLine}`);
      }

      const publishAnchor = '<button onClick={handlePublishSchedule} className="w-full mt-3 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-lg">Publish Current View ({displayedDays.length} days)</button>';
      if (!code.includes(publishAnchor)) throw new Error('[schedule-text-import] manager schedule Publish button anchor missing');

      const mount = `<ScheduleTextImporter\n                                schedule={schedule}\n                                setSchedule={setSchedule}\n                                activeStoreId={activeStoreId}\n                                availableStaff={activeStaff.map((u: User) => u.name)}\n                            />\n                            ${publishAnchor}`;
      code = code.replace(publishAnchor, mount);

      const managerAnchor = 'function ManagerDashboard({ data, adminStoreId, onExit, currentUser }: any) {';
      const activeStaffAnchor = 'const activeStaff = scopedUsers.filter((u: User) => u && u.active !== false);';
      const mountIndex = code.indexOf('<ScheduleTextImporter');
      if (!code.includes(managerAnchor) || !code.includes(activeStaffAnchor) || mountIndex < 0) {
        throw new Error('[schedule-text-import] manager context verification failed');
      }
      if (code.indexOf(activeStaffAnchor) > mountIndex) {
        throw new Error('[schedule-text-import] importer mounted before activeStaff is initialized');
      }

      return { code, map: null };
    },
  };
}
