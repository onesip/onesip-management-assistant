/**
 * Temporarily remove the withdrawn Coconut Premix 400g-ice variant from
 * employee-facing recipes. Keep it in Cloud and Editor so it can be restored.
 * Only matches Coconut recipes actually containing a 400g-ice instruction.
 */
export function isSuspendedCoconutPremixRecipe(recipe: any): boolean {
  if (!recipe || typeof recipe !== 'object') return false;
  const name = [recipe.name?.zh, recipe.name?.en, typeof recipe.name === 'string' ? recipe.name : '']
    .filter(Boolean).join(' ');
  if (!/(coconut|椰子|椰奶|椰浆|椰子预拌)/i.test(name)) return false;

  const instruction = JSON.stringify({
    basePreparation: recipe.basePreparation,
    steps: recipe.steps,
    ingredients: recipe.ingredients,
    description: recipe.description,
    toppings: recipe.toppings,
    ice: recipe.ice,
    name: recipe.name,
  }) || '';
  const ice400InIngredients = Array.isArray(recipe.ingredients) && recipe.ingredients.some((ingredient: any) => {
    const ingredientName = [
      ingredient?.name?.zh, ingredient?.name?.en,
      typeof ingredient?.name === 'string' ? ingredient.name : '',
    ].filter(Boolean).join(' ');
    const amount = String(ingredient?.amount ?? ingredient?.quantity ?? ingredient?.qty ?? '');
    const unit = String(ingredient?.unit ?? '');
    return /ice|冰块|冰/i.test(ingredientName)
      && /(?:^|\D)400(?:\D|$)/.test(amount)
      && (!unit || /^(?:g|克|gram|grams)$/i.test(unit));
  });

  return ice400InIngredients ||
    /(?:400\s*(?:g|克|grams?)(?:\b|\s*冰)|(?:冰|ice)[^0-9]{0,20}400\s*(?:g|克)?)/i.test(instruction);
}
