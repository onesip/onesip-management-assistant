import type { Plugin } from 'vite';

/**
 * Adds the one-time staff topping notice without injecting hooks/state into StaffApp.
 * Also appends a static copy to the staff Team announcements list for later reference.
 */
export function toppingReplacementNoticeMountPlugin(): Plugin {
  return {
    name: 'onesip-topping-replacement-notice-mount',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;

      const importAnchor = "import { useNotification } from './components/GlobalNotification';";
      if (!code.includes(importAnchor)) {
        throw new Error('[topping-replacement-notice] import anchor missing');
      }
      code = code.replace(
        importAnchor,
        importAnchor + "\nimport { SafeToppingReplacementNotice } from './components/ToppingReplacementNotice';"
      );

      const scopedNoticeAnchor = "    const scopedNotices = useMemo(() => notices.filter((n:any) => getStoreId(n) === myStoreId), [notices, myStoreId]);";
      if (!code.includes(scopedNoticeAnchor)) {
        throw new Error('[topping-replacement-notice] scopedNotices anchor missing');
      }

      const scopedNoticeReplacement = `    const scopedNotices = useMemo(() => {
        const branchNotices = notices.filter((n:any) => getStoreId(n) === myStoreId);
        if (currentUser?.role !== 'staff') return branchNotices;

        const toppingRuleNotice: any = {
            id: 'staff_topping_replacement_rule_2026_08_22_v1',
            author: 'ONESIP',
            title: '⚠️ Topping Replacement Rule',
            content: 'Only when a FREE standard topping is actually OUT OF STOCK: replace it with another regular topping for free. Online: check the customer note. In-store: ask which regular topping they want instead whenever possible. Do NOT offer a free replacement for other reasons.',
            date: '2026-08-22T00:00:00.000Z',
            isUrgent: true,
            frequency: 'manual',
            status: 'active',
            storeId: myStoreId,
        };

        return [...branchNotices.filter((n:any) => n.id !== toppingRuleNotice.id), toppingRuleNotice];
    }, [notices, myStoreId, currentUser?.role]);`;
      code = code.replace(scopedNoticeAnchor, scopedNoticeReplacement);

      const renderAnchor = '            <ActionReminderModal isOpen={isScheduleReminderOpen}';
      if (!code.includes(renderAnchor)) {
        throw new Error('[topping-replacement-notice] staff render anchor missing');
      }
      code = code.replace(
        renderAnchor,
        `            <SafeToppingReplacementNotice currentUser={currentUser} />\n` + renderAnchor
      );

      const mountPos = code.indexOf('<SafeToppingReplacementNotice');
      const staffAppPos = code.indexOf('function StaffApp');
      if (mountPos < 0 || staffAppPos < 0 || mountPos <= staffAppPos) {
        throw new Error('[topping-replacement-notice] notice mounted outside StaffApp');
      }

      return { code, map: null };
    },
  };
}
