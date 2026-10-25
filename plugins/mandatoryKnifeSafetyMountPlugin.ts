import type { Plugin } from 'vite';

/**
 * Mount the latest knife-safety notice after the existing mandatory recipe
 * notice in every root App entry point: Staff, Manager/Owner and PIN Editor.
 * The safety notice is last in the DOM with the same modal stacking level,
 * so it appears first; the existing recipe quiz remains untouched underneath.
 */
export function mandatoryKnifeSafetyMountPlugin(): Plugin {
  return {
    name: 'onesip-mandatory-knife-safety-mount',
    enforce: 'pre',
    transform(source, id) {
      // Preserve existing manager/editor CI smoke harnesses; production always mounts all 3 roles.
      if (process.env.RUNTIME_MANAGER_SMOKE === '1' || process.env.RUNTIME_EDITOR_SMOKE === '1' || process.env.RUNTIME_OWNER_SMOKE === '1') return null;
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;
      const importAnchor = "import { useNotification } from './components/GlobalNotification';";
      const importLine = "import { MandatoryKnifeSafetyNotice } from './components/MandatoryKnifeSafetyNotice';";
      if (!code.includes(importAnchor)) throw new Error('[knife-safety] App import anchor missing');
      if (!code.includes(importLine)) code = code.replace(importAnchor, importAnchor + '\n' + importLine);

      const priorGate = '<MandatoryOctoberRecipeUpdate currentUser={currentUser} adminMode={adminMode} logs={logs} appLang={lang} />';
      const safetyGate = '<MandatoryKnifeSafetyNotice currentUser={currentUser} adminMode={adminMode} logs={logs} appLang={lang} />';
      const occurrences = code.split(priorGate).length - 1;
      if (occurrences !== 3) {
        throw new Error('[knife-safety] Expected staff, manager and editor mounting points; got ' + occurrences);
      }
      code = code.split(priorGate).join(priorGate + '\n            ' + safetyGate);
      if (code.split(safetyGate).length - 1 !== 3) throw new Error('[knife-safety] Failed to mount in all modes');
      return { code, map: null };
    },
  };
}
