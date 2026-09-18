import type { Plugin } from 'vite';

/**
 * Mounts the mandatory opening/closing food-safety gate inside StaffApp.
 * Business logic stays isolated in FoodSafetyShiftGate; this transform only wires existing data.
 */
export function foodSafetyShiftGateMountPlugin(): Plugin {
  return {
    name: 'onesip-food-safety-shift-gate-mount',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;

      let code = source;
      const importAnchor = "import { useNotification } from './components/GlobalNotification';";
      const importLine = "import { SafeFoodSafetyShiftGate } from './components/FoodSafetyShiftGate';";
      if (!code.includes(importAnchor)) throw new Error('[food-safety] import anchor missing');
      if (!code.includes(importLine)) {
        code = code.replace(importAnchor, importAnchor + '\n' + importLine);
      }

      const renderAnchor = '            <ActionReminderModal isOpen={isScheduleReminderOpen}';
      if (!code.includes(renderAnchor)) throw new Error('[food-safety] staff render anchor missing');

      const mount = [
        '            <SafeFoodSafetyShiftGate',
        '                currentUser={currentUser}',
        '                schedule={schedule}',
        '                storeId={myStoreId}',
        '                lang={lang}',
        '                logs={data.logs || []}',
        '            />',
        ''
      ].join('\n');

      code = code.replace(renderAnchor, mount + renderAnchor);

      const staffAppPos = code.indexOf('function StaffApp');
      const storePos = code.indexOf('    const myStoreId = activeStoreId;', staffAppPos);
      const mountPos = code.indexOf('<SafeFoodSafetyShiftGate', staffAppPos);
      if (staffAppPos < 0 || storePos < 0 || mountPos < 0 || mountPos <= storePos) {
        throw new Error('[food-safety] gate mounted outside StaffApp or before store initialization');
      }

      return { code, map: null };
    },
  };
}
