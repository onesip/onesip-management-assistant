import type { Plugin } from 'vite';

/** CI-only harness. Inert unless RUNTIME_EDITOR_SMOKE=1. */
export function runtimeEditorSmokePlugin(): Plugin {
  return {
    name: 'onesip-runtime-editor-smoke',
    enforce: 'pre',
    transform(source, id) {
      if (process.env.RUNTIME_EDITOR_SMOKE !== '1') return null;
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;

      const adminAnchor = "    const [adminMode, setAdminMode] = useState<'manager' | 'owner' | 'editor' | null>(null);";
      if (!source.includes(adminAnchor)) throw new Error('[runtime-editor-smoke] adminMode anchor missing');

      const code = source.replace(
        adminAnchor,
        "    const [adminMode, setAdminMode] = useState<'manager' | 'owner' | 'editor' | null>('editor');"
      );
      return { code, map: null };
    },
  };
}
