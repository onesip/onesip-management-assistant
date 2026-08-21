import type { Plugin } from 'vite';

/** CI-only harness. It is inert unless RUNTIME_STAFF_SMOKE=1. */
export function runtimeStaffSmokePlugin(): Plugin {
  return {
    name: 'onesip-runtime-staff-smoke',
    enforce: 'pre',
    transform(source, id) {
      if (process.env.RUNTIME_STAFF_SMOKE !== '1') return null;
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;

      const userAnchor = "    const [currentUser, setCurrentUser] = useState<User | null>(null);";
      const userReplacement = "    const [currentUser, setCurrentUser] = useState<User | null>(() => STATIC_USERS.find((u: any) => u.role === 'staff') || null);";
      if (!code.includes(userAnchor)) throw new Error('[runtime-staff-smoke] currentUser anchor missing');
      code = code.replace(userAnchor, userReplacement);

      const scheduleAnchor = "    const [schedule, setSchedule] = useState<any>({ days: [] });";
      const scheduleReplacement = `    const [schedule, setSchedule] = useState<any>(() => {
        const smokeStaff = STATIC_USERS.find((u: any) => u.role === 'staff');
        const now = new Date();
        return { days: [{
            date: (now.getMonth() + 1) + '-' + now.getDate(),
            storeId: 'default_store',
            shifts: [{ id: 'runtime-smoke-weekend', start: '11:00', end: '17:00', staff: smokeStaff ? [smokeStaff.name] : [] }]
        }] };
    });`;
      if (!code.includes(scheduleAnchor)) throw new Error('[runtime-staff-smoke] schedule anchor missing');
      code = code.replace(scheduleAnchor, scheduleReplacement);

      const scheduleSub = "            Cloud.subscribeToSchedule((week) => setSchedule({ days: week?.days || [] })),";
      if (!code.includes(scheduleSub)) throw new Error('[runtime-staff-smoke] schedule subscription anchor missing');
      code = code.replace(scheduleSub, "            (() => {}) as any,");

      const storeSub = "            (Cloud.subscribeToStores ? Cloud.subscribeToStores(setStores) : () => {}),";
      if (code.includes(storeSub)) code = code.replace(storeSub, "            (() => {}) as any,");

      return { code, map: null };
    },
  };
}
