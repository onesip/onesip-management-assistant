import type { Plugin } from 'vite';

/**
 * Content-only update for the weekend responsibility templates.
 * This plugin deliberately changes only task text inside the two isolated
 * responsibility components. It injects no hooks, state, effects, or runtime logic.
 */
export function weekendResponsibilityContentPlugin(): Plugin {
  return {
    name: 'onesip-weekend-responsibility-content-20260821',
    enforce: 'pre',
    transform(source, id) {
      const cleanId = id.split('?')[0].replace(/\\/g, '/');
      const isGate = cleanId.endsWith('/components/WeekendShiftResponsibilityGate.tsx');
      const isLibrary = cleanId.endsWith('/components/WeekendResponsibilityLibrary.tsx');
      if (!isGate && !isLibrary) return null;

      let code = source;

      const replaceRequired = (oldText: string, newText: string, label: string) => {
        if (!code.includes(oldText)) {
          throw new Error(`[weekend-responsibility-content] missing ${label} anchor in ${cleanId}`);
        }
        code = code.replace(oldText, newText);
      };

      const blackTeaZh = '高峰前检查 Black Tea：楼下备用量 + 茶桶现有量合计低于 4L 时，立即泡约 8L 新 Black Tea；合计达到 4L 或以上则不用再泡。';
      const blackTeaEn = 'Before peak, add the Black Tea downstairs and in the service bucket. If the combined total is below 4L, brew about 8L of fresh Black Tea immediately; if it is 4L or more, do not brew another batch.';

      const friZhOld = "tasksZh: ['11:30–14:00 正常出品，同时边出茶边按目标补料。','14:00 后中班到岗，早班转为专注补料，不再主要负责出品。','16:00 前完成 FRI 14:00 目标中的所有物料。','在管理小程序提交实际完成数量。','补回自己使用过的原料到指定储藏位置。'],";
      const friZhNew = `tasksZh: ['11:30–14:00 正常出品，同时边出茶边按目标补料。','当天营业使用的 Coconut Premix 由早班现做并当天用完；不得使用隔夜 Coconut，也不得提前为第二天制作。','${blackTeaZh}','14:00 后中班到岗，早班转为专注补料，不再主要负责出品。','16:00 前完成 FRI 14:00 目标中的所有物料。','在管理小程序提交实际完成数量。','补回自己使用过的原料到指定储藏位置。'],`;
      replaceRequired(friZhOld, friZhNew, 'Fri opening Chinese tasks');

      const friEnOldGate = "tasksEn: ['11:30–14:00: make drinks and prep according to the target list at the same time.','After 14:00, once support arrives, focus on prep instead of drink production.','Finish all FRI 14:00 target items before 16:00.','Submit the actual completed quantities in the management app.','Refill and return all ingredients you used to their assigned storage places.'],";
      const friEnOldLibrary = "tasksEn: ['11:30–14:00: make drinks and prep according to the target list at the same time.','After 14:00, once support arrives, focus on prep instead of drink production.','Finish all FRI 14:00 target items before 16:00.','Submit actual completed quantities in the management app.','Refill and return all ingredients used to their assigned storage places.'],";
      const friEnNewGate = `tasksEn: ['11:30–14:00: make drinks and prep according to the target list at the same time.','The opening shift must make the Coconut Premix for that day fresh and use it the same day. Do not use overnight Coconut or prepare it in advance for the next day.','${blackTeaEn}','After 14:00, once support arrives, focus on prep instead of drink production.','Finish all FRI 14:00 target items before 16:00.','Submit the actual completed quantities in the management app.','Refill and return all ingredients you used to their assigned storage places.'],`;
      const friEnNewLibrary = `tasksEn: ['11:30–14:00: make drinks and prep according to the target list at the same time.','The opening shift must make the Coconut Premix for that day fresh and use it the same day. Do not use overnight Coconut or prepare it in advance for the next day.','${blackTeaEn}','After 14:00, once support arrives, focus on prep instead of drink production.','Finish all FRI 14:00 target items before 16:00.','Submit actual completed quantities in the management app.','Refill and return all ingredients used to their assigned storage places.'],`;
      replaceRequired(isGate ? friEnOldGate : friEnOldLibrary, isGate ? friEnNewGate : friEnNewLibrary, 'Fri opening English tasks');

      const satZhOld = "tasksZh: ['检查周五准备的物料是否可用：新鲜度、效期、标签。','将物料倒入茶桶和料盒，确保可直接出品。','补齐前场和抽屉原料。','确认牛奶、罐头、气泡水和小料都可直接使用。','在管理小程序提交实际完成数量。','13:30 前确保奶精至少 3 个满 container；低于 2 个要补。','13:30 前确保 coconut 有 6L；低于 6L 要补。'],";
      const satZhNew = `tasksZh: ['检查周五准备的物料是否可用：新鲜度、效期、标签。','将物料倒入茶桶和料盒，确保可直接出品。','补齐前场和抽屉原料。','确认牛奶、罐头、气泡水和小料都可直接使用。','在管理小程序提交实际完成数量。','13:30 前检查奶精 container 数量；低于 2 个 container 才泡。正在使用的 container 也算 1 个，不要求都是满的。','周六当天 Coconut Premix 必须由早班现做并当天用完；13:30 前确保当日新做 Coconut 有 6L，不得使用隔夜料，低于 6L 时补足。','${blackTeaZh}'],`;
      replaceRequired(satZhOld, satZhNew, 'Sat opening Chinese tasks');

      const satEnOld = "tasksEn: ['Check Friday prep: freshness, expiry time, and labels.','Move items into tea buckets and topping boxes so they are ready for service.','Refill front counter and drawer ingredients.','Make sure milk, canned items, sparkling water and toppings are ready to use.','Submit actual completed quantities in the management app.','Before 13:30, make sure there are 3 full creamer containers; refill if below 2.','Before 13:30, make sure coconut is at 6L; refill if below 6L.'],";
      const satEnNew = `tasksEn: ['Check Friday prep: freshness, expiry time, and labels.','Move items into tea buckets and topping boxes so they are ready for service.','Refill front counter and drawer ingredients.','Make sure milk, canned items, sparkling water and toppings are ready to use.','Submit actual completed quantities in the management app.','Before 13:30, check the number of creamer containers. Make new creamer only if there are fewer than 2 containers. A container currently in use still counts as 1; they do not both need to be full.','Saturday Coconut Premix must be made fresh by the opening shift and used the same day. Before 13:30, make sure there are 6L of today’s fresh Coconut; never use overnight Coconut, and make more fresh Coconut if below 6L.','${blackTeaEn}'],`;
      replaceRequired(satEnOld, satEnNew, 'Sat opening English tasks');

      const sunZhOld = "tasksZh: ['检查周六准备物料是否可用：新鲜度、效期、标签。','将物料倒入茶桶和料盒，确保可直接出品。','严格先进先出：前旧后新，先用旧料。','补齐前场和抽屉原料。','确认牛奶、罐头、气泡水和小料可直接使用。'],";
      const sunZhNew = `tasksZh: ['检查周六准备物料是否可用：新鲜度、效期、标签。','将物料倒入茶桶和料盒，确保可直接出品。','当天营业使用的 Coconut Premix 由早班现做并当天用完；不得使用隔夜 Coconut，也不得提前为第二天制作。','${blackTeaZh}','严格先进先出：前旧后新，先用旧料。','补齐前场和抽屉原料。','确认牛奶、罐头、气泡水和小料可直接使用。'],`;
      replaceRequired(sunZhOld, sunZhNew, 'Sun opening Chinese tasks');

      const sunEnOld = "tasksEn: ['Check Saturday prep: freshness, expiry time, and labels.','Move items into tea buckets and topping boxes for direct service.','Strict FIFO: old stock in front, new stock behind, use old stock first.','Refill front counter and drawer ingredients.','Make sure milk, canned items, sparkling water and toppings are ready to use.'],";
      const sunEnNew = `tasksEn: ['Check Saturday prep: freshness, expiry time, and labels.','Move items into tea buckets and topping boxes for direct service.','The opening shift must make the Coconut Premix for that day fresh and use it the same day. Do not use overnight Coconut or prepare it in advance for the next day.','${blackTeaEn}','Strict FIFO: old stock in front, new stock behind, use old stock first.','Refill front counter and drawer ingredients.','Make sure milk, canned items, sparkling water and toppings are ready to use.'],`;
      replaceRequired(sunEnOld, sunEnNew, 'Sun opening English tasks');

      // Build-time verification: both new rules must exist in each rendered source.
      if (!code.includes('Coconut Premix') || !code.includes('合计低于 4L') || !code.includes('combined total is below 4L')) {
        throw new Error(`[weekend-responsibility-content] content verification failed in ${cleanId}`);
      }
      if (isGate || isLibrary) {
        if (!code.includes('低于 2 个 container 才泡') || !code.includes('fewer than 2 containers')) {
          throw new Error(`[weekend-responsibility-content] Saturday creamer verification failed in ${cleanId}`);
        }
      }

      return { code, map: null };
    },
  };
}
