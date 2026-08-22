import type { Plugin } from 'vite';

/** CI-only harness. It is inert unless RUNTIME_MANAGER_SMOKE=1 or RUNTIME_OWNER_SMOKE=1. */
export function runtimeManagerSmokePlugin(): Plugin {
  return {
    name: 'onesip-runtime-manager-smoke',
    enforce: 'pre',
    transform(source, id) {
      const managerSmoke = process.env.RUNTIME_MANAGER_SMOKE === '1';
      const ownerSmoke = process.env.RUNTIME_OWNER_SMOKE === '1';
      if (!managerSmoke && !ownerSmoke) return null;
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;

      const adminAnchor = "    const [adminMode, setAdminMode] = useState<'manager' | 'owner' | 'editor' | null>(null);";
      const mode = ownerSmoke ? 'owner' : 'manager';
      const adminReplacement = `    const [adminMode, setAdminMode] = useState<'manager' | 'owner' | 'editor' | null>('${mode}');`;
      if (!code.includes(adminAnchor)) throw new Error('[runtime-manager-smoke] adminMode anchor missing');
      code = code.replace(adminAnchor, adminReplacement);

      return { code, map: null };
    },
  };
}
