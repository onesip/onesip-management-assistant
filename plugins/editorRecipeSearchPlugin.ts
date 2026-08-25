import type { Plugin } from 'vite';

/**
 * Adds search/filtering to the 0413 Editor > recipes list without changing
 * recipe data, save behavior, or the editor form itself.
 */
export function editorRecipeSearchPlugin(): Plugin {
  return {
    name: 'onesip-editor-recipe-search',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;

      const stateAnchor = "    const [isProcessingPdf, setIsProcessingPdf] = useState(false);";
      if (!code.includes(stateAnchor)) throw new Error('[editor-recipe-search] state anchor missing');
      code = code.replace(
        stateAnchor,
        stateAnchor + "\n    const [recipeEditorSearchQuery, setRecipeEditorSearchQuery] = useState('');"
      );

      const sortedBlock = `    const sortedRecipesForDisplay = [...(view === 'recipes' ? recipes : [])].sort((a, b) => {
        const orderA = a.sortOrder ?? Infinity;
        const orderB = b.sortOrder ?? Infinity;
        if (orderA !== orderB) return orderA - orderB;
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
    });`;
      if (!code.includes(sortedBlock)) throw new Error('[editor-recipe-search] sorted recipe block missing');
      const sortedReplacement = `${sortedBlock}

    const normalizedRecipeEditorSearch = recipeEditorSearchQuery.trim().toLowerCase();
    const filteredRecipesForEditorDisplay = normalizedRecipeEditorSearch
        ? sortedRecipesForDisplay.filter((recipe: any) => JSON.stringify(recipe || {}).toLowerCase().includes(normalizedRecipeEditorSearch))
        : sortedRecipesForDisplay;
    const getRecipeDisplayIndex = (item: any) => sortedRecipesForDisplay.findIndex((recipe: any) => recipe.id === item.id);`;
      code = code.replace(sortedBlock, sortedReplacement);

      const addButtonAnchor = `                       <button onClick={() => setEditingItem(createNewItem())} className="w-full py-4 border-2 border-dashed border-white/20 rounded-xl text-dark-text-light font-bold hover:border-dark-accent hover:text-dark-accent transition-all">+ Add New Item</button>`;
      if (!code.includes(addButtonAnchor)) throw new Error('[editor-recipe-search] add button anchor missing');
      const searchUi = `${addButtonAnchor}
                       {view === 'recipes' && (
                           <div className="bg-dark-surface border border-white/10 rounded-xl p-3">
                               <div className="flex items-center gap-2">
                                   <span className="text-dark-text-light text-sm" aria-hidden="true">🔎</span>
                                   <input
                                       data-testid="editor-recipe-search"
                                       type="search"
                                       value={recipeEditorSearchQuery}
                                       onChange={(e) => setRecipeEditorSearchQuery(e.target.value)}
                                       placeholder="Search recipes / 搜索配方..."
                                       className="flex-1 min-w-0 bg-transparent outline-none text-sm text-dark-text placeholder:text-dark-text-light/60"
                                   />
                                   {recipeEditorSearchQuery && (
                                       <button
                                           type="button"
                                           onClick={() => setRecipeEditorSearchQuery('')}
                                           className="text-[11px] font-bold text-dark-text-light hover:text-dark-text px-2 py-1 rounded bg-white/5"
                                       >
                                           Clear
                                       </button>
                                   )}
                               </div>
                               {recipeEditorSearchQuery && (
                                   <div className="mt-2 text-[10px] text-dark-text-light">
                                       {filteredRecipesForEditorDisplay.length} result{filteredRecipesForEditorDisplay.length === 1 ? '' : 's'}
                                   </div>
                               )}
                           </div>
                       )}`;
      code = code.replace(addButtonAnchor, searchUi);

      const listAnchor = "                       {(view === 'training' ? trainingLevels : view === 'sop' ? sopList : sortedRecipesForDisplay).map((item: any, index: number) => (";
      if (!code.includes(listAnchor)) throw new Error('[editor-recipe-search] list anchor missing');
      code = code.replace(
        listAnchor,
        "                       {(view === 'training' ? trainingLevels : view === 'sop' ? sopList : filteredRecipesForEditorDisplay).map((item: any, index: number) => ("
      );

      const upAnchor = "<button onClick={() => handleMoveRecipe(index, 'up')} disabled={index === 0}";
      const downAnchor = "<button onClick={() => handleMoveRecipe(index, 'down')} disabled={index === sortedRecipesForDisplay.length - 1}";
      if (!code.includes(upAnchor) || !code.includes(downAnchor)) throw new Error('[editor-recipe-search] move button anchors missing');
      code = code.replace(
        upAnchor,
        "<button onClick={() => handleMoveRecipe(getRecipeDisplayIndex(item), 'up')} disabled={getRecipeDisplayIndex(item) <= 0}"
      );
      code = code.replace(
        downAnchor,
        "<button onClick={() => handleMoveRecipe(getRecipeDisplayIndex(item), 'down')} disabled={getRecipeDisplayIndex(item) < 0 || getRecipeDisplayIndex(item) === sortedRecipesForDisplay.length - 1}"
      );

      if (!code.includes('data-testid="editor-recipe-search"') || !code.includes('filteredRecipesForEditorDisplay')) {
        throw new Error('[editor-recipe-search] transformed search UI missing');
      }

      return { code, map: null };
    },
  };
}
