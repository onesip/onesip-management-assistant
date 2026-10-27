import type { Plugin } from 'vite';

/** Add manager/owner completion visibility without changing existing schedule or training logic. */
export function customerComplaintTrainingProgressMountPlugin(): Plugin {
  return {
    name: 'onesip-complaint-training-progress-mount',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;
      const importAnchor = "import { useNotification } from './components/GlobalNotification';";
      const importLine = "import { CustomerComplaintTrainingProgress } from './components/CustomerComplaintTrainingProgress';";
      if (!code.includes(importAnchor)) throw new Error('[complaint-progress] Import anchor missing');
      if (!code.includes(importLine)) code = code.replace(importAnchor, importAnchor + '\n' + importLine);
      const managerAnchor = "{view === 'confirmations' && (\n                    <div className=\"space-y-4\">";
      if (!code.includes(managerAnchor)) throw new Error('[complaint-progress] Manager confirmation anchor missing');
      code = code.replace(managerAnchor, managerAnchor +
        '\n                        <CustomerComplaintTrainingProgress users={safeUsers} logs={logs} stores={stores} storeId={activeStoreId} lang={data.lang} />');
      const ownerAnchor = "{ownerSubView === 'staff' && <StaffManagementView data={data} />}";
      if (!code.includes(ownerAnchor)) throw new Error('[complaint-progress] Owner staff anchor missing');
      code = code.replace(ownerAnchor,
        "{ownerSubView === 'staff' && <CustomerComplaintTrainingProgress users={users} logs={logs} stores={stores} lang={lang} />}\n                " + ownerAnchor);
      if (code.split('<CustomerComplaintTrainingProgress').length - 1 !== 2)
        throw new Error('[complaint-progress] Expected exactly two manager/owner panels');
      return { code, map: null };
    },
  };
}
