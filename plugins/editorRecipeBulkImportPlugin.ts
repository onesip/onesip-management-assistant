import type { Plugin } from 'vite';

/** Mount the import/template panel under Add New Item, without changing existing recipe edit/save flows. */
export function editorRecipeBulkImportPlugin(): Plugin {
  return {
    name: 'onesip-editor-recipe-bulk-import',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;
      const importAnchor = "import { useNotification } from './components/GlobalNotification';";
      const importLine = "import { RecipeBulkImport } from './components/RecipeBulkImport';";
      if (!code.includes(importAnchor)) throw new Error('[recipe-import] import anchor missing');
      if (!code.includes(importLine)) code = code.replace(importAnchor, importAnchor + '\n' + importLine);
      const addButton = '                       <button onClick={() => setEditingItem(createNewItem())} className="w-full py-4 border-2 border-dashed border-white/20 rounded-xl text-dark-text-light font-bold hover:border-dark-accent hover:text-dark-accent transition-all">+ Add New Item</button>';
      if (!code.includes(addButton)) throw new Error('[recipe-import] Add New Item anchor missing');
      code = code.replace(addButton, addButton +
        "\n                       {view === 'recipes' && <RecipeBulkImport recipes={recipes} stores={stores} onSaved={setRecipes} />}");
      if (!code.includes('<RecipeBulkImport recipes={recipes}')) throw new Error('[recipe-import] mount failed');
      return { code, map: null };
    },
  };
}
