import type { Plugin } from 'vite';

/** Hide the suspended 400g ice Coconut Premix variant only from staff surfaces. */
export function suspendedCoconutPremixVisibilityPlugin(): Plugin {
  return {
    name: 'onesip-suspended-coconut-400g-visibility',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      if (!cleanId.endsWith('/App.tsx')) return null;
      let code = source;
      const importAnchor = "import { useNotification } from './components/GlobalNotification';";
      const importLine = "import { isSuspendedCoconutPremixRecipe } from './components/recipeVisibility';";
      if (!code.includes(importAnchor)) throw new Error('[coconut-visibility] import anchor missing');
      code = code.replace(importAnchor, importAnchor + '\n' + importLine);

      const featuredOld = "const featuredRecipes = (recipes || []).filter((r: DrinkRecipe) => r.isNew && r.isPublished !== false);";
      const featuredNew = "const featuredRecipes = (recipes || []).filter((r: DrinkRecipe) => r.isNew && r.isPublished !== false && !isSuspendedCoconutPremixRecipe(r));";
      const reminderOld = "const allNewRecipes = recipes.filter((r: DrinkRecipe) => r.isNew === true);";
      const reminderNew = "const allNewRecipes = recipes.filter((r: DrinkRecipe) => r.isNew === true && !isSuspendedCoconutPremixRecipe(r));";
      const staffOld = ".filter((r: DrinkRecipe) => r.isPublished !== false)\n                .filter((r: DrinkRecipe) => (recipeTypeFilter === 'premix'";
      const staffNew = ".filter((r: DrinkRecipe) => r.isPublished !== false)\n                .filter((r: DrinkRecipe) => !isSuspendedCoconutPremixRecipe(r))\n                .filter((r: DrinkRecipe) => (recipeTypeFilter === 'premix'";
      for (const [before, after, name] of [
        [featuredOld, featuredNew, 'featured'],
        [reminderOld, reminderNew, 'new-recipe reminder'],
        [staffOld, staffNew, 'staff recipes'],
      ]) {
        if (!code.includes(before)) throw new Error('[coconut-visibility] missing ' + name + ' anchor');
        code = code.replace(before, after);
      }
      return { code, map: null };
    },
  };
}
