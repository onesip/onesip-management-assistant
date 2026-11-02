import type { Plugin } from 'vite';

/**
 * Mount a fresh versioned Grape Rose instruction quiz after existing
 * knife safety, recipe, and customer complaint gates in every root App mode.
 * The new quiz appears first (last DOM sibling at the same modal z-index).
 */
export function mandatoryGrapeRoseNoticeMountPlugin(): Plugin {
  return {
    name: 'onesip-mandatory-grape-rose-measuring-notice',
    enforce: 'pre',
    transform(source, id) {
      // Keep established staff/manager/editor CI harnesses focused on existing notices.
      if (process.env.RUNTIME_STAFF_SMOKE === '1' ||
          process.env.RUNTIME_MANAGER_SMOKE === '1' ||
          process.env.RUNTIME_OWNER_SMOKE === '1' ||
          process.env.RUNTIME_EDITOR_SMOKE === '1') return null;
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;
      const importAnchor = "import { useNotification } from './components/GlobalNotification';";
      const importLine = "import { MandatoryGrapeRoseNotice } from './components/MandatoryGrapeRoseNotice';";
      if (!code.includes(importAnchor)) throw new Error('[grape-rose] import anchor missing');
      if (!code.includes(importLine)) code = code.replace(importAnchor, importAnchor + '\n' + importLine);
      const complaintGate = '<MandatoryCustomerComplaintTraining currentUser={currentUser} adminMode={adminMode} logs={logs} appLang={lang} />';
      const grapeGate = '<MandatoryGrapeRoseNotice currentUser={currentUser} adminMode={adminMode} logs={logs} appLang={lang} />';
      const n = code.split(complaintGate).length - 1;
      if (n !== 3) throw new Error('[grape-rose] Expected 3 mounting points; found ' + n);
      code = code.split(complaintGate).join(complaintGate + '\n            ' + grapeGate);
      if (code.split(grapeGate).length - 1 !== 3) throw new Error('[grape-rose] All-role mount verification failed');
      return { code, map: null };
    },
  };
}
