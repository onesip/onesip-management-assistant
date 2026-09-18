import type { Plugin } from 'vite';

/** CI-only harness for the closing-side food safety role. */
export function runtimeFoodSafetyClosingSmokePlugin(): Plugin {
  return {
    name: 'onesip-runtime-food-safety-closing-smoke',
    enforce: 'pre',
    transform(source, id) {
      if (process.env.RUNTIME_FOOD_SAFETY_CLOSING_SMOKE !== '1') return null;
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;

      let code = source;

      const userAnchor = "    const [currentUser, setCurrentUser] = useState<User | null>(null);";
      const userReplacement = "    const [currentUser, setCurrentUser] = useState<User | null>(() => STATIC_USERS.find((u: any) => u.role === 'staff') || null);";
      if (!code.includes(userAnchor)) throw new Error('[food-safety-closing-smoke] currentUser anchor missing');
      code = code.replace(userAnchor, userReplacement);

      const scheduleAnchor = "    const [schedule, setSchedule] = useState<any>({ days: [] });";
      const scheduleReplacement = [
        "    const [schedule, setSchedule] = useState<any>(() => {",
        "        const smokeStaff = STATIC_USERS.find((u: any) => u.role === 'staff');",
        "        const now = new Date();",
        "        return { days: [{",
        "            date: (now.getMonth() + 1) + '-' + now.getDate(),",
        "            storeId: 'default_store',",
        "            shifts: [{ id: 'runtime-food-safety-all-day', start: '10:00', end: '20:00', staff: smokeStaff ? [smokeStaff.name] : [] }]",
        "        }] };",
        "    });"
      ].join('\n');
      if (!code.includes(scheduleAnchor)) throw new Error('[food-safety-closing-smoke] schedule anchor missing');
      code = code.replace(scheduleAnchor, scheduleReplacement);

      const logsAnchor = "    const [logs, setLogs] = useState<LogEntry[]>([]);";
      const logsReplacement = [
        "    const [logs, setLogs] = useState<LogEntry[]>(() => {",
        "        const smokeStaff = STATIC_USERS.find((u: any) => u.role === 'staff');",
        "        const now = new Date();",
        "        const dateKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');",
        "        return smokeStaff ? [{",
        "            id: 999001,",
        "            type: 'checklist',",
        "            name: smokeStaff.name,",
        "            userId: smokeStaff.id,",
        "            shift: 'opening',",
        "            time: now.toISOString(),",
        "            status: 'completed',",
        "            kpi: 'FOOD_SAFETY_OPENING_ACK',",
        "            storeId: 'default_store',",
        "            foodSafetyDate: dateKey,",
        "            foodSafetyVersion: 'food_safety_shift_check_2026_09_18_v1'",
        "        } as any] : [];",
        "    });"
      ].join('\n');
      if (!code.includes(logsAnchor)) throw new Error('[food-safety-closing-smoke] logs anchor missing');
      code = code.replace(logsAnchor, logsReplacement);

      const scheduleSub = "            Cloud.subscribeToSchedule((week) => setSchedule({ days: week?.days || [] })),";
      if (!code.includes(scheduleSub)) throw new Error('[food-safety-closing-smoke] schedule subscription anchor missing');
      code = code.replace(scheduleSub, "            (() => {}) as any,");

      const logsSub = "            Cloud.subscribeToLogs(setLogs),";
      if (!code.includes(logsSub)) throw new Error('[food-safety-closing-smoke] logs subscription anchor missing');
      code = code.replace(logsSub, "            (() => {}) as any,");

      const storeSub = "            (Cloud.subscribeToStores ? Cloud.subscribeToStores(setStores) : () => {}),";
      if (code.includes(storeSub)) code = code.replace(storeSub, "            (() => {}) as any,");

      return { code, map: null };
    },
  };
}
