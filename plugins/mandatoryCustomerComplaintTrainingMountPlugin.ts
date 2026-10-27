import type { Plugin } from 'vite';

/** Inject required customer-service course after the knife/recipe notices. */
export function mandatoryCustomerComplaintTrainingMountPlugin(): Plugin {
  return {
    name: 'onesip-mandatory-customer-complaint-training',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      // Existing manager/editor smoke harnesses test the prior required recipe quiz.
      // The new gate is exercised independently in the staff smoke harness.
      if (process.env.RUNTIME_MANAGER_SMOKE === '1' ||
          process.env.RUNTIME_OWNER_SMOKE === '1' ||
          process.env.RUNTIME_EDITOR_SMOKE === '1') return null;
      let code = source;
      const importAnchor = "import { useNotification } from './components/GlobalNotification';";
      const importLine = "import { MandatoryCustomerComplaintTraining, CustomerComplaintHandbookReview } from './components/MandatoryCustomerComplaintTraining';";
      if (!code.includes(importAnchor)) throw new Error('[complaint-training] import anchor missing');
      if (!code.includes(importLine)) code = code.replace(importAnchor, importAnchor + '\n' + importLine);

      const knife = '<MandatoryKnifeSafetyNotice currentUser={currentUser} adminMode={adminMode} logs={logs} appLang={lang} />';
      const complaint = '<MandatoryCustomerComplaintTraining currentUser={currentUser} adminMode={adminMode} logs={logs} appLang={lang} />';
      const occurrences = code.split(knife).length - 1;
      if (occurrences !== 3) throw new Error('[complaint-training] Expected three root App entry points; found ' + occurrences);
      code = code.split(knife).join(knife + '\n            ' + complaint);
      if (code.split(complaint).length - 1 !== 3) throw new Error('[complaint-training] Modal mount verification failed');

      const reviewAnchor = '            <div className="flex-1 overflow-y-auto p-4 space-y-3">';
      // Limit replacement to the actual TrainingView function to avoid matching unrelated UI.
      const from = code.indexOf('function TrainingView(');
      const to = code.indexOf('// 组件: 内容编辑器', from);
      if (from < 0 || to <= from) throw new Error('[complaint-training] TrainingView region missing');
      const oldRegion = code.slice(from, to);
      if (oldRegion.split(reviewAnchor).length !== 2) {
        throw new Error('[complaint-training] TrainingView listing anchor not unique');
      }
      const newRegion = oldRegion.replace(reviewAnchor,
        reviewAnchor + '\n                <CustomerComplaintHandbookReview lang={lang} />');
      code = code.slice(0, from) + newRegion + code.slice(to);
      if (!code.includes('<CustomerComplaintHandbookReview lang={lang} />')) {
        throw new Error('[complaint-training] Handbook review could not mount');
      }
      return { code, map: null };
    },
  };
}
