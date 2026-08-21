import type { Plugin } from 'vite';

/** CI-only harness. It is inert unless RUNTIME_MANAGER_SMOKE=1. */
export function runtimeManagerSmokePlugin(): Plugin {
  return {
    name: 'onesip-runtime-manager-smoke',
    enforce: 'pre',
    transform(source, id) {
      if (process.env.RUNTIME_MANAGER_SMOKE !== '1') return null;
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;

      const adminAnchor = "    const [adminMode, setAdminMode] = useState<'manager' | 'owner' | 'editor' | null>(null);";
      const adminReplacement = "    const [adminMode, setAdminMode] = useState<'manager' | 'owner' | 'editor' | null>('manager');";
      if (!code.includes(adminAnchor)) throw new Error('[runtime-manager-smoke] adminMode anchor missing');
      code = code.replace(adminAnchor, adminReplacement);

      return { code, map: null };
    },
  };
}
