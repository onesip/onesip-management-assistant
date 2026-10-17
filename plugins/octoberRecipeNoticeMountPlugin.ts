import type { Plugin } from 'vite';

/**
 * Mount the versioned, mandatory recipe quiz at the root App level so it covers
 * logged-in Staff, Manager/Owner and PIN-only Editor/Admin entry points.
 *
 * Keeping the quiz in a component (instead of rewriting existing app hooks)
 * leaves the existing staff/manager/modal code untouched.
 */
export function octoberRecipeNoticeMountPlugin(): Plugin {
  return {
    name: 'onesip-october-recipe-notice-mount',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;
      const importAnchor = "import { useNotification } from './components/GlobalNotification';";
      const importLine = "import { MandatoryOctoberRecipeUpdate } from './components/MandatoryOctoberRecipeUpdate';";
      if (!code.includes(importAnchor)) throw new Error('[recipe-notice] import anchor missing');
      if (!code.includes(importLine)) code = code.replace(importAnchor, importAnchor + '\n' + importLine);

      const renderGate = '<MandatoryOctoberRecipeUpdate currentUser={currentUser} adminMode={adminMode} logs={logs} appLang={lang} />';

      const editorAnchor = "    if (adminMode === 'editor') return <EditorDashboard data={appData} onExit={() => setAdminMode(null)} />;";
      if (!code.includes(editorAnchor)) throw new Error('[recipe-notice] editor return anchor missing');
      code = code.replace(editorAnchor,
        "    if (adminMode === 'editor') return (<><EditorDashboard data={appData} onExit={() => setAdminMode(null)} />" + renderGate + "</>);");

      const ownerAnchor = '            <OwnerDashboard data={appData} currentUser={currentUser} adminMode={adminMode} onExit={() => setAdminMode(null)} />';
      if (!code.includes(ownerAnchor)) throw new Error('[recipe-notice] owner/manager return anchor missing');
      code = code.replace(ownerAnchor, ownerAnchor + '\n            ' + renderGate);

      const rootAnchor = '            <AdminLoginModal isOpen={adminModalOpen}';
      if (!code.includes(rootAnchor)) throw new Error('[recipe-notice] normal App return anchor missing');
      code = code.replace(rootAnchor, '            ' + renderGate + '\n' + rootAnchor);

      const appIndex = code.indexOf('function App() {');
      const editorIndex = code.indexOf(renderGate, appIndex);
      const rootIndex = code.lastIndexOf(renderGate);
      const staffIndex = code.indexOf('function StaffApp');
      if (appIndex < 0 || editorIndex <= appIndex || rootIndex <= editorIndex || staffIndex > appIndex) {
        throw new Error('[recipe-notice] root App mount verification failed');
      }
      return { code, map: null };
    },
  };
}
