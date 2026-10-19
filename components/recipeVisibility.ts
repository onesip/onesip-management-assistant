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
  return /(?:400\s*(?:g|克|grams?)(?:\b|\s*冰)|(?:冰|ice)[^0-9]{0,20}400\s*(?:g|克)?)/i.test(instruction);
}
