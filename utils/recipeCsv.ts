/** Excel-compatible, BOM-prefixed CSV import/export for OneSip's DrinkRecipe shape. */
export const RECIPE_CSV_HEADERS = [
  'name_zh', 'name_en', 'category', 'recipe_type', 'size', 'ice', 'sugar',
  'toppings_zh', 'toppings_en', 'base_zh', 'base_en',
  'cold_steps_zh', 'cold_steps_en', 'warm_steps_zh', 'warm_steps_en',
  'store_ids', 'is_published', 'is_new', 'cover_image_url', 'tutorial_video_url',
] as const;

export type RecipeCsvRow = { line: number; recipe: any | null; errors: string[]; duplicate: boolean; example: boolean; displayName: string };
const clean = (v: unknown) => String(v ?? '').trim();
const key = (value: unknown) => clean(value).normalize('NFKC').toLowerCase().replace(/\s+/g, '');

export function parseRecipeCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '').replace(/^sep=,\r?\n/i, '');
  if (!input.trim()) throw new Error('文件为空 / The file is empty.');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else if (quoted) { quoted = false; }
      else if (!field) { quoted = true; }
      else { field += c; }
    } else if (c === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
    } else { field += c; }
  }
  if (quoted) throw new Error('CSV 引号没有闭合 / Unclosed quoted CSV field.');
  row.push(field);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  return '"' + s.replace(/"/g, '""') + '"';
}

export function getRecipeCsvTemplate(): string {
  const sample = [
    ['示例_请删除_茉莉奶茶', 'EXAMPLE_DO_NOT_IMPORT_Jasmine_Milk_Tea', 'Milk Tea', 'product', '500ml', 'Standard', '100%',
      '珍珠1勺', '1 scoop tapioca', '茉莉茶底', 'Jasmine tea base', '接茶|加入珍珠|摇匀', 'Dispense tea|Add pearls|Shake well', '', '', '', 'false', 'false', '', ''],
    ['示例_请删除_香芋基底', 'EXAMPLE_DO_NOT_IMPORT_Taro_Premix', 'Premix', 'premix', '1 batch', 'N/A', 'N/A',
      '', '', '按门店已核准配方操作', 'Follow approved recipe', '搅拌均匀|标记日期', 'Mix thoroughly|Date-label container', '', '', '', 'false', 'false', '', ''],
  ];
  return '\uFEFFsep=,\r\n' + [RECIPE_CSV_HEADERS, ...sample].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function parseFlag(input: string, defaultValue: boolean): boolean | null {
  const v = key(input);
  if (!v) return defaultValue;
  if (['true', 'yes', 'y', '1', '是', '发布'].includes(v)) return true;
  if (['false', 'no', 'n', '0', '否', '不发布'].includes(v)) return false;
  return null;
}

function splitSteps(input: string): string[] {
  return clean(input).split(/\s*\|\s*|\r?\n/g).map(x => x.trim()).filter(Boolean);
}

function bilingualSteps(zh: string, en: string, errors: string[], label: string): Array<{ zh: string; en: string }> {
  const zhSteps = splitSteps(zh), enSteps = splitSteps(en);
  if (zhSteps.length && enSteps.length && zhSteps.length !== enSteps.length) {
    errors.push(label + ' 中英文步骤数量不一致 / step counts do not match');
    return [];
  }
  return Array.from({ length: Math.max(zhSteps.length, enSteps.length) }, (_, i) => ({
    zh: zhSteps[i] || enSteps[i], en: enSteps[i] || zhSteps[i],
  }));
}

export function previewRecipeCsv(text: string, existingRecipes: any[], stores: any[] = []): RecipeCsvRow[] {
  const table = parseRecipeCsv(text);
  if (!table.length) throw new Error('CSV 没有数据 / No data.');
  const header = table[0].map(x => clean(x).toLowerCase());
  const missing = RECIPE_CSV_HEADERS.filter(x => !header.includes(x));
  if (missing.length) throw new Error('模板列缺失 / Missing columns: ' + missing.join(', '));
  if (new Set(header).size !== header.length) throw new Error('列名重复 / Duplicate header names.');
  const existingNames = new Set<string>();
  for (const r of existingRecipes || []) {
    if (r?.name?.zh) existingNames.add(key(r.name.zh));
    if (r?.name?.en) existingNames.add(key(r.name.en));
  }
  const batchNames = new Set<string>();
  const storeLookup = new Map<string, string>();
  for (const s of stores || []) {
    const id = clean(s?.id);
    if (!id) continue;
    storeLookup.set(key(id), id);
    if (s?.name) storeLookup.set(key(s.name), id);
  }
  return table.slice(1).map((cells, index) => {
    const get = (column: typeof RECIPE_CSV_HEADERS[number]): string => clean(cells[header.indexOf(column)]);
    const zh = get('name_zh'), en = get('name_en');
    const line = index + 2;
    const errors: string[] = [];
    const example = /^示例_/.test(zh) || /^EXAMPLE_DO_NOT_IMPORT/i.test(en);
    const displayName = zh || en || '（未命名 / unnamed）';
    if (example) return { line, recipe: null, errors: [], duplicate: false, example: true, displayName };
    if (cells.length > header.length) errors.push('额外列 / Extra columns');
    if (!zh) errors.push('缺少 name_zh / Chinese name is required');
    if (!en) errors.push('缺少 name_en / English name is required');
    const type = (get('recipe_type') || 'product').toLowerCase();
    if (!['product', 'premix'].includes(type)) errors.push('recipe_type 仅支持 product / premix');
    const publish = parseFlag(get('is_published'), false), isNew = parseFlag(get('is_new'), false);
    if (publish === null) errors.push('is_published 请填 true / false');
    if (isNew === null) errors.push('is_new 请填 true / false');
    const cold = bilingualSteps(get('cold_steps_zh'), get('cold_steps_en'), errors, 'cold_steps');
    const warm = bilingualSteps(get('warm_steps_zh'), get('warm_steps_en'), errors, 'warm_steps');
    if (!cold.length && !warm.length && !get('base_zh') && !get('base_en')) errors.push('需要制作步骤或基底说明 / Add steps or base instructions');
    const rawStoreIds = get('store_ids').split(/[|;；]/g).map(x => x.trim()).filter(Boolean);
    const storeIds: string[] = [];
    for (const storeValue of rawStoreIds) {
      const resolved = storeLookup.get(key(storeValue));
      if (!resolved) errors.push('未知门店 / Unknown store: ' + storeValue);
      else if (!storeIds.includes(resolved)) storeIds.push(resolved);
    }
    if (publish === true && !storeIds.length) errors.push('发布员工端须填写 store_ids，避免全门店误发布 / Select a store before publishing');
    const nameKeys = [key(zh), key(en)].filter(Boolean);
    const duplicate = nameKeys.some(v => existingNames.has(v) || batchNames.has(v));
    for (const v of nameKeys) batchNames.add(v);
    const recipe = errors.length || duplicate ? null : {
      id: '', name: { zh, en }, cat: get('category') || 'Milk Tea', recipeType: type as 'product' | 'premix',
      size: get('size') || '500ml', ice: get('ice') || 'Standard', sugar: get('sugar') || '100%',
      toppings: { zh: get('toppings_zh'), en: get('toppings_en') },
      basePreparation: { zh: get('base_zh'), en: get('base_en') },
      steps: { cold, warm }, storeIds, isPublished: publish, isNew,
      coverImageUrl: get('cover_image_url'), tutorialVideoUrl: get('tutorial_video_url'),
    };
    return { line, recipe, errors, duplicate, example: false, displayName };
  });
}
