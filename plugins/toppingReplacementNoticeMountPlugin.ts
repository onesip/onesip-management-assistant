import type { Plugin } from 'vite';

/**
 * Adds the one-time topping notice without injecting hooks/state into StaffApp.
 * Staff, manager, and owner all receive the same rule popup once per account/device.
 * A static copy remains in the staff Team announcements list for later reference.
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
        if (!['staff', 'manager', 'boss'].includes(currentUser?.role || '')) return branchNotices;

        const toppingRuleNotice: any = {
            id: 'team_topping_replacement_rule_2026_08_22_v1',
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

      // Staff app popup.
      const renderAnchor = '            <ActionReminderModal isOpen={isScheduleReminderOpen}';
      if (!code.includes(renderAnchor)) {
        throw new Error('[topping-replacement-notice] staff render anchor missing');
      }
      code = code.replace(
        renderAnchor,
        `            <SafeToppingReplacementNotice currentUser={currentUser} />\n` + renderAnchor
      );

      // Manager/owner dashboard popup. weekendResponsibilityMountPlugin runs before this plugin,
      // so use its unique admin library mount as the safe insertion point.
      const adminLibraryAnchor = `                <SafeWeekendResponsibilityLibrary
                    currentUser={currentUser || ({ id: 'responsibility-admin-preview', name: adminMode === 'owner' ? 'Owner' : 'Manager', role: 'manager' } as any)}`;
      if (!code.includes(adminLibraryAnchor)) {
        throw new Error('[topping-replacement-notice] admin responsibility anchor missing');
      }
      const adminNotice = `                <SafeToppingReplacementNotice
                    currentUser={currentUser || ({
                        id: adminMode === 'owner' ? 'topping-owner-preview' : 'topping-manager-preview',
                        name: adminMode === 'owner' ? 'Owner' : 'Manager',
                        role: adminMode === 'owner' ? 'boss' : 'manager'
                    } as any)}
                />
`;
      code = code.replace(adminLibraryAnchor, adminNotice + adminLibraryAnchor);

      const staffMountPos = code.indexOf('<SafeToppingReplacementNotice currentUser={currentUser}');
      const adminMountPos = code.indexOf("id: adminMode === 'owner' ? 'topping-owner-preview'");
      const staffAppPos = code.indexOf('function StaffApp');
      if (staffMountPos < 0 || adminMountPos < 0 || staffAppPos < 0 || staffMountPos <= staffAppPos) {
        throw new Error('[topping-replacement-notice] expected staff/admin mounts missing');
      }

      return { code, map: null };
    },
  };
}
