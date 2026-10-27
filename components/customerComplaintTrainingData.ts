export const COMPLAINT_TRAINING_VERSION = 'onesip_complaint_response_2026_10_27_v1';

type Section = {
  titleZh: string; titleEn: string;
  introZh?: string[]; introEn?: string[];
  scripts?: Array<{ labelZh?: string; labelEn?: string; zh: string; en: string }>;
  notesZh?: string[]; notesEn?: string[];
};

export const COMPLAINT_SECTIONS: Section[] = [
  {
    titleZh: '先记住这四步', titleEn: 'Four steps to remember',
    introZh: [
      '认真听 → 核对订单与饮品 → 解释已确认的原因 → 给出下一步。',
      '第一次遇到、不知道怎么回答，是正常的。员工不需要现场知道所有答案，但必须认真接待，不随口猜原因，不让顾客的问题没有人跟进。',
      '向顾客表达歉意，不等于认定饮品做错。可以先为顾客遇到的不便致歉，再核实具体情况。',
    ],
    introEn: [
      'Listen carefully → Check the order and drink → Explain only verified reasons → Offer a next step.',
      'It is normal not to know every answer the first time. Treat every concern seriously, do not guess, and make sure the issue is followed up.',
      'Apologising for an inconvenience does not mean admitting the drink was made incorrectly. Check the facts first.',
    ],
  },
  {
    titleZh: '第一次遇到，不知道怎么回答', titleEn: 'When you do not know the answer',
    scripts: [{
      zh: '抱歉给您带来困扰。我先看一下订单和这杯饮品。这个情况我需要向负责人确认，避免给您不准确的解释。',
      en: 'I’m sorry about the inconvenience. Let me check your order and the drink first. I’d like to confirm this with my supervisor so I can give you accurate information.',
    }],
    notesZh: [
      '核对产品、杯型、冷热、糖冰和额外配料。',
      '能确认的事实直接说明，不确定的部分联系负责人。',
      '如果负责人暂时无法回复，明确告知顾客，并提供后续联系渠道。',
      '未经确认，不自行承诺退款、补偿或完成时间。',
    ],
    notesEn: [
      'Check the product, cup size, hot/cold, sugar, ice and extra toppings.',
      'Explain what you can verify; ask the supervisor about anything uncertain.',
      'If the supervisor is not available, tell the customer and share a follow-up contact.',
      'Do not promise a refund, compensation or completion time without approval.',
    ],
  },
  {
    titleZh: '热饮奶盖消失了？', titleEn: 'Cream topping seems to have disappeared in a hot drink',
    scripts: [{
      zh: '热饮中的奶盖遇热后会逐渐融入奶茶，所以分层可能没有冷饮明显，口感也会更融合。我先帮您确认这杯是否按配方加入了奶盖和其他配料。',
      en: 'The cream topping can gradually blend into hot milk tea, so the layers may be less visible than in an iced drink. Let me check that your drink was made with all the correct toppings.',
    }],
    notesZh: [
      '看不到奶盖层，不代表一定漏加；也不能因此认定一定没有问题。',
      '奶盖与法酪是不同配料，需要分别核对。',
      '不承诺热饮奶盖一定保持独立分层。',
    ],
    notesEn: [
      'An invisible topping layer does not prove it was forgotten—or prove the drink was correct.',
      'Cream topping and other specified toppings are different; verify each separately.',
      'Do not promise a distinct visible cream layer in hot drinks.',
    ],
  },
  {
    titleZh: '热饮为什么不满杯？', titleEn: 'Hot drink appears underfilled',
    scripts: [{
      zh: '我理解您对份量的疑问。我先核对一下杯型、订单和出品量，确认这杯是否符合我们这款热饮的标准。',
      en: 'I understand your concern about the amount. Let me check the cup size, your order and the portion to make sure it meets our standard for this hot drink.',
    }],
    notesZh: [
      '热饮与冷饮去冰不是同一种情况，不能直接套用 No Ice 规则。',
      '未核实前，不说“热饮都这样”或“因为杯子大了”。',
      '奶盖融合与整杯份量是否正确，需要分别判断。无法判断时联系负责人。',
    ],
    notesEn: [
      'A hot drink is not the same as an iced drink ordered with no ice.',
      'Do not say “all hot drinks are like that” or blame cup size before checking.',
      'Assess topping blending and overall portion separately; escalate if unsure.',
    ],
  },
  {
    titleZh: 'No Ice 为什么不满杯？', titleEn: 'Why does No Ice not fill the cup?',
    introZh: ['仅在核实订单确为 No Ice、且饮品符合原配方后，才使用下面这段解释。'],
    introEn: ['Use the following explanation only after confirming the order is No Ice and the drink follows the recipe.'],
    scripts: [{
      zh: '去冰会保留原配方的饮品量，不额外补茶或奶，因此液面会低一些。我也帮您确认一下，这杯的份量和配料是否正确。',
      en: 'With no ice, we keep the original recipe without adding extra tea or milk, so the drink level will be lower. I’ll also check that the portion and toppings are correct.',
    }],
    notesZh: [
      '按顾客实际选择的冰量解释，不把所有冰量选项一概而论。',
      '即使店内已有提示，也不要责备顾客没有看到。',
      '不为补满杯而擅自加水、茶或奶，改变原配方。',
    ],
    notesEn: [
      'Explain the actual ice choice, rather than generalising across all ice options.',
      'Never blame the customer for missing a notice.',
      'Do not top up with water, tea or milk and alter the recipe just to fill the cup.',
    ],
  },
  {
    titleZh: '补了以后味道变了／配料没了', titleEn: 'A correction changed the flavour or toppings',
    scripts: [{
      zh: '抱歉，补加后也应该保持您原本点的饮品配方。我先确认刚才的处理方式，再为您安排合适的解决方案。',
      en: 'I’m sorry. Any correction should still match the drink you ordered. Let me check what was added and find the right solution for you.',
    }],
    notesZh: [
      '不要为了让液面升高，直接往含奶盖、法酪或其他配料的饮品里补普通奶茶。',
      '先按门店批准的处理方式判断是否需要重做；不确定就联系负责人。',
    ],
    notesEn: [
      'Do not pour plain milk tea into a drink with cream topping or other special toppings just to raise the level.',
      'Follow the store-approved resolution to decide whether a remake is needed; ask the supervisor if unsure.',
    ],
  },
  {
    titleZh: '顾客很生气／不接受解释', titleEn: 'A customer is upset or rejects the explanation',
    scripts: [{
      labelZh: '一般情况', labelEn: 'If the customer is upset',
      zh: '我明白这次体验让您失望了。我先确认问题，并帮您找到可以处理的方式。',
      en: 'I understand that this has been disappointing. Let me check the issue and see how we can resolve it.',
    }, {
      labelZh: '出现辱骂或威胁', labelEn: 'If there is abuse or a threat',
      zh: '我们愿意帮您解决问题，也请您与我们保持尊重的沟通。我会联系负责人继续处理。',
      en: 'We’re happy to help resolve this, but please speak to us respectfully. I’ll contact my supervisor to assist.',
    }],
    notesZh: [
      '不要反复重复同一段解释，不争论谁更懂产品。',
      '解释一次之后，进入检查和处理步骤。',
      '遇到辱骂或威胁时可以表达沟通边界并联系负责人。',
    ],
    notesEn: [
      'Do not repeat the same explanation or argue over who knows the product best.',
      'After explaining once, move to checking and resolving the issue.',
      'Set respectful boundaries and involve the supervisor if abused or threatened.',
    ],
  },
  {
    titleZh: '确认出品有误后', titleEn: 'After confirming a drink was made incorrectly',
    scripts: [{
      zh: '我们确认这杯没有按订单做好，抱歉。我们会按门店处理规定为您解决。',
      en: 'We’ve checked and the drink wasn’t made according to your order. I’m sorry. We’ll resolve this according to our store policy.',
    }],
    notesZh: [
      '执行本人权限内的处理。',
      '需要退款或额外补偿时，必须交由有权限的负责人确认。',
    ],
    notesEn: [
      'Take only the corrective action you are authorised to take.',
      'Ask an authorised supervisor before promising a refund or extra compensation.',
    ],
  },
  {
    titleZh: '需要后续跟进时', titleEn: 'When the issue needs follow-up',
    scripts: [{
      zh: '您也可以私信我们的官方账号，或发送邮件至 info@onesip.nl，提供购买时间、订单信息和问题描述，方便我们核实并跟进。订单信息请通过私信或邮件发送，不需要公开发布。',
      en: 'You can also message our official account or email info@onesip.nl with your purchase time, order details and a description of the issue so we can investigate and follow up. Please send order details privately.',
    }],
    notesZh: [
      '顾客订单信息必须通过私信或邮件发送，不需要公开发布。',
      '如当场无法解决，要让顾客知道下一步怎样联系。',
    ],
    notesEn: [
      'Order information should be shared by private message or email, never requested in public comments.',
      'If it cannot be resolved immediately, explain the next contact option.',
    ],
  },
  {
    titleZh: '避免这些回答', titleEn: 'Avoid these unhelpful replies',
    scripts: [
      { labelZh: '避免：“我不知道。”', labelEn: 'Avoid: “I don’t know.”',
        zh: '这个我需要确认一下，我帮您联系负责人。', en: 'I need to check this. Let me contact my supervisor.' },
      { labelZh: '避免：“就是这样的。”', labelEn: 'Avoid: “That’s just how it is.”',
        zh: '我先确认这杯是否符合出品标准。', en: 'Let me check whether this drink meets our standard.' },
      { labelZh: '避免：“海报上不是写了吗？”', labelEn: 'Avoid: “It says so on the poster.”',
        zh: '我解释一下这个选项会怎样影响饮品。', en: 'Let me explain how that option affects your drink.' },
      { labelZh: '避免：“机器做的，不会错。”', labelEn: 'Avoid: “The machine can’t be wrong.”',
        zh: '我检查一下配方、出料和配料。', en: 'Let me check the recipe, dispensing and toppings.' },
      { labelZh: '避免：“给您加满就好了。”', labelEn: 'Avoid: “I’ll just fill it up.”',
        zh: '我先确认应该怎样处理，保持原本的配方。', en: 'Let me check how to resolve this while preserving the original recipe.' },
      { labelZh: '避免：“没有奶盖是因为融了。”', labelEn: 'Avoid: “The cream has just melted.”',
        zh: '奶盖可能融入热饮，我也会核实是否正确加入。', en: 'The cream may blend into a hot drink, but I will also check that it was added correctly.' },
    ],
  },
  {
    titleZh: '员工学习与复习方式', titleEn: 'How to practise and review',
    introZh: [
      '每次到岗用 3–5 分钟练习一个场景：①阅读对应回复、理解原因；②同事扮演顾客，用自己的话回答；③练习核对订单及何时联系负责人。',
      '不要求逐字背诵，要求态度尊重、解释准确、不猜原因、有后续处理。',
      '第一次遇到不会回答，可以求助。新问题由负责人核实后补进本指南，全员共同学习。',
    ],
    introEn: [
      'Practise one scenario for 3–5 minutes each shift: ① read and understand the example; ② role-play with a colleague and answer in your own words; ③ practise checking the order and deciding when to contact a supervisor.',
      'Do not memorise word-for-word. Be respectful, accurate, avoid guesses, and offer a next step.',
      'Ask for help when facing a new issue. Once confirmed by a supervisor, new cases can be added to this guide for everyone to learn.',
    ],
  },
];

type Question = {
  type: 'scenario' | 'judgement';
  zh: string; en: string;
  choicesZh: string[]; choicesEn: string[];
  correct: number;
  reasoningZh: string; reasoningEn: string;
};

export const COMPLAINT_QUESTIONS: Question[] = [
  {
    type: 'scenario',
    zh: '顾客首次投诉，你不确定原因。你应该怎么做？',
    en: 'A customer has a complaint you have never seen before. What do you do?',
    choicesZh: ['直接猜测原因，先安抚顾客', '先致歉并核对订单和饮品，不确定时向负责人确认', '说“我不知道”，让顾客自己找老板'],
    choicesEn: ['Guess the cause to reassure them', 'Apologise, check the order and drink, then verify uncertain facts with a supervisor', 'Say “I don’t know” and tell them to find the boss'],
    correct: 1,
    reasoningZh: '四步：倾听、核对、解释已确认事实、下一步。',
    reasoningEn: 'Listen, verify, explain established facts, then offer the next step.',
  },
  {
    type: 'judgement',
    zh: '判断：向顾客表达歉意，就等于承认饮品一定做错了。',
    en: 'True or false: apologising for inconvenience means admitting the drink must have been made incorrectly.',
    choicesZh: ['正确', '错误'], choicesEn: ['True', 'False'], correct: 1,
    reasoningZh: '致歉可以针对顾客的不便；是否出错还需核对。',
    reasoningEn: 'Apologise for inconvenience first; check facts before concluding.',
  },
  {
    type: 'scenario',
    zh: '顾客说“热奶茶看不见奶盖，就是你们漏加了！”你如何回复？',
    en: 'The customer cannot see cream topping on a hot drink and says it was omitted. What do you say?',
    choicesZh: ['遇热会融合，所以一定没问题', '直接承认漏加并退款', '解释奶盖可能融合，但仍核对奶盖与其他配料是否按配方加入'],
    choicesEn: ['It blends in, so the drink must be fine', 'Admit it was missed and offer a refund', 'Explain blending is possible, then check cream and other toppings against the recipe'],
    correct: 2,
    reasoningZh: '分层不明显不代表漏加，也不代表一定正确；不同配料分别核对。',
    reasoningEn: 'The appearance alone proves neither omission nor correctness. Check each topping.',
  },
  {
    type: 'scenario',
    zh: '顾客说“这杯热饮为什么不满？”正确的第一步是什么？',
    en: 'A customer says their hot drink looks underfilled. What is your first action?',
    choicesZh: ['套用 No Ice 解释', '核对杯型、订单、出品量是否符合热饮标准', '立即加普通奶茶补满'],
    choicesEn: ['Explain using the No Ice policy', 'Check cup size, order and portion against the hot-drink standard', 'Top up with plain milk tea immediately'],
    correct: 1,
    reasoningZh: '热饮份量与冷饮去冰需分开判断。',
    reasoningEn: 'Hot-drink portion and the No Ice policy are different issues.',
  },
  {
    type: 'scenario',
    zh: '订单确认选择 No Ice、份量符合配方，但顾客问为什么没满杯。怎么解释？',
    en: 'No Ice is confirmed and the portion matches the recipe, but the cup is not full. What do you explain?',
    choicesZh: ['保留原配方量、不额外补茶或奶，并核对配料', '责怪顾客没有看提示', '随便加茶补到杯口'],
    choicesEn: ['Keep the recipe amount without extra tea/milk and check the toppings', 'Blame the customer for missing the notice', 'Add tea until the cup is full'],
    correct: 0,
    reasoningZh: '确认 No Ice 后解释配方规则，但仍检查出品。',
    reasoningEn: 'After checking No Ice, explain the recipe and verify the drink.',
  },
  {
    type: 'judgement',
    zh: '判断：为了让液面更高，可以直接往含奶盖或法酪的饮品补普通奶茶。',
    en: 'True or false: you may add plain milk tea to a drink with cream or other toppings just to increase the fill level.',
    choicesZh: ['正确', '错误'], choicesEn: ['True', 'False'], correct: 1,
    reasoningZh: '擅自补普通奶茶可能改变味道和配料比例；按核准处理方式判断是否重做。',
    reasoningEn: 'This can change flavour or ratios. Follow approved correction/remake steps.',
  },
  {
    type: 'scenario',
    zh: '顾客在解释后仍然很生气，你应该怎么做？',
    en: 'The customer remains upset after you explain the product. What now?',
    choicesZh: ['反复重复相同解释', '与顾客争论谁更懂产品', '停止争辩，核对问题并转入解决方案'],
    choicesEn: ['Repeat the same explanation again and again', 'Argue about who knows the drink better', 'Stop arguing, check the issue and move to a solution'],
    correct: 2,
    reasoningZh: '解释一次后，要继续检查与处理。',
    reasoningEn: 'After one explanation, move to verification and resolution.',
  },
  {
    type: 'scenario',
    zh: '顾客开始辱骂或威胁员工，合适的做法是？',
    en: 'A customer becomes abusive or threatening. What is appropriate?',
    choicesZh: ['礼貌明确边界，并联系负责人', '以同样语气还击', '答应任何退款以让对方离开'],
    choicesEn: ['Set respectful boundaries and contact the supervisor', 'Shout back', 'Promise any refund just to end the conversation'],
    correct: 0,
    reasoningZh: '可以表达沟通边界，由负责人协助处理。',
    reasoningEn: 'Maintain a respectful boundary and involve the supervisor.',
  },
  {
    type: 'scenario',
    zh: '经核对确认饮品做错了，但退款超出你权限。你应该？',
    en: 'You have confirmed a preparation error, but refunds exceed your authority. What do you do?',
    choicesZh: ['按照权限内的流程处理，退款或额外补偿请负责人确认', '私自承诺全额退款', '直接说机器不会出错'],
    choicesEn: ['Follow authorised steps and ask the supervisor to approve refunds/compensation', 'Promise a full refund on your own', 'Insist the machine cannot be wrong'],
    correct: 0,
    reasoningZh: '确认出错应致歉，但不越权承诺退款或补偿。',
    reasoningEn: 'Apologise for a confirmed mistake, but do not promise unauthorised remedies.',
  },
  {
    type: 'judgement',
    zh: '判断：顾客订单截图可以要求他公开发在社交媒体评论区。',
    en: 'True or false: it is fine to ask a customer to post their order screenshot publicly in social-media comments.',
    choicesZh: ['正确', '错误'], choicesEn: ['True', 'False'], correct: 1,
    reasoningZh: '订单信息应通过私信或 info@onesip.nl 私下提供。',
    reasoningEn: 'Order details should be sent privately or to info@onesip.nl.',
  },
  {
    type: 'scenario',
    zh: '顾客说“海报不是写了吗”，员工怎么回应更合适？',
    en: 'A customer missed a poster explaining their ice option. How should you respond?',
    choicesZh: ['您自己没仔细看海报', '我来解释一下这个选项会怎样影响饮品，并核对您的订单', '海报写了就不用解释'],
    choicesEn: ['You should have read the poster', 'Let me explain how the option affects your drink and check your order', 'No explanation is needed because the poster exists'],
    correct: 1,
    reasoningZh: '不要责怪顾客漏看提示，耐心解释并核对。',
    reasoningEn: 'Do not blame the customer for missing a notice. Explain and verify.',
  },
  {
    type: 'scenario',
    zh: '准备出杯时不确定奶盖与法酪是否按配方加入，应怎么处理？',
    en: 'You are unsure whether both cream topping and a separate specified topping were added. What should you do?',
    choicesZh: ['只要奶盖可能融合，就不用核对其他配料', '说“机器做的一定没问题”', '分别核对所有应有配料，不确定就联系负责人'],
    choicesEn: ['Assume other toppings are fine because cream can blend in', 'Say the machine cannot make mistakes', 'Verify each required topping separately and escalate if unsure'],
    correct: 2,
    reasoningZh: '不同配料分别核对，不能靠外观猜。',
    reasoningEn: 'Verify distinct toppings separately; appearance alone is not proof.',
  },
];
