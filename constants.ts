
import { SopItem, TrainingLevel, ChecklistTemplate, DrinkRecipe, Translation, CustomerMenuItem, WikiItem, AnnouncementData, InventoryItem, WeeklySchedule, ToppingSlot, SyrupSlot, ContactItem, User } from './types';

export const TRANSLATIONS: Record<string, any> = {
    zh: {
        home: "工作台",
        training: "培训",
        sop: "SOP",
        recipes: "配方",
        schedule: "排班表",
        contact: "联系人",
        stock: "库存",
        logs: "记录",
        ai: "AI",
        chat: "聊天",
        
        // General
        hello: "你好,",
        ready: "准备好开始工作了吗？",
        clock_in: "上班打卡",
        clock_out: "下班打卡",
        select_employee: "自动识别员工",
        cancel: "取消",
        confirm: "确认",
        save: "保存",
        delete: "删除",
        edit: "编辑",
        add_new: "添加新项",
        download_csv: "导出 Excel (CSV)",
        close: "关闭",
        
        // Login
        login_title: "ONESIP 员工登录",
        enter_phone: "选择员工",
        enter_code: "输入密码",
        get_code: "获取验证码",
        login_btn: "登录",
        invalid_phone: "无效的身份",
        invalid_code: "密码错误",
        code_sent: "验证码已发送: 1234",
        select_user: "请选择你的名字",
        remember_password: "记住密码",
        keep_logged_in: "保持登录",
        
        // Inventory
        inventory_title: "库存管理",
        item_name: "物品名称",
        end_count: "盘点数",
        waste: "报损数",
        save_report: "保存盘点数据",
        save_report_confirm: "确认保存当前盘点数据到后台？",
        save_success: "数据已保存至后台数据库！",
        no_shift_today_alert: "你今天没有排班，无法打卡。",
        inventory_before_clock_out: "下班打卡前，请先完成库存盘点。",
        complete_inventory_to_clock_out: "请完成盘点以继续下班打卡流程。",
        cancel_clock_out_confirm: "确认取消下班打卡流程吗？",
        owner_dashboard: "库存中控台 (Owner)",
        manage_presets: "管理预设值",
        report_history: "历史记录",
        last_refill_title: "上一次补料记录",
        no_refill_record: "还没有任何补料记录",
        more_items: "还有 {n} 项...",
        refill_details_title: "上一次补料详情",
        refilled_by_on: "由 {name} 在 {time} 补料",
        total_items_refilled: "共补料 {count} 项",
        staff_label: "员工",
        time_label: "时间",
        using_preset_inventory: "当前为预设库存，无手动补料记录",
        managing_preset_items: "按预设共管理 {count} 项库存",
        preset_inventory_title: "当前预设库存",
        no_refill_or_preset: "还没有任何补料记录或预设库存",
        preset_value: "预设",
        
        // Editor
        editor_title: "内容编辑器",
        editor_desc: "修改 Training, SOPs, 配方",
        content_mgmt: "内容管理",
        save_changes: "保存修改",
        
        // Modules
        recipe_title: "饮品配方",
        sop_library: "SOP 知识库",
        team_title: "本周排班",
        contact_title: "常用联系人",
        my_shift: "我的班次",
        next_shift: "下一次值班",
        no_shift: "暂无排班",
        next_week_availability: "下周可上班时间",
        availability_reminder_title: "填写下周可上班时间",
        availability_reminder_body: "店长正在安排下周的排班，请尽快填写你的可上班时间以方便安排。",
        fill_now: "现在填写",
        later: "稍后",
        availability_saved: "可上班时间已保存！",

        // Chat
        team_board: "团队公告板",
        type_message: "输入消息...",
        no_messages: "暂无消息",
        recent: "最近",
        
        // Manager
        manager_title: "店长后台",
        drag_hint: "拖动员工名字到排班表 (每班最多3人)",
        morning_shift: "早班 (10:00-15:00)",
        evening_shift: "晚班 (14:30-19:00)",
        work_hours: "工时统计",
        total_hours: "总工时",
        financial_dashboard: "财务仪表盘",
        budget_max: "预算上限",
        hourly_wage: "时薪设置",
        est_cost: "预计成本 (排班)",
        actual_cost: "实际成本 (打卡)",
        balance: "结余 (预算-实际)",
        set_wages: "设置员工工资",
        download_logs: "导出打卡记录",
        
        // Content
        opening_title: "早班开铺",
        mid_title: "中段巡检",
        closing_title: "晚班收档",
        submit_success: "提交成功！",
        copied: "已复制号码",
        // FIX: Add missing translations for deviation modal
        deviation_title: "打卡时间与排班相差较大",
        deviation_subtitle: "请填写原因",
        deviation_placeholder: "例如：交通延误、临时换班、加班等...",
        deviation_confirm: "确认并打卡",
    },
    en: {
        home: "Workbench",
        training: "Training",
        sop: "SOPs",
        recipes: "Recipes",
        schedule: "Schedule",
        contacts: "Contacts",
        stock: "Inventory",
        logs: "Logs",
        ai: "AI",
        chat: "Chat",

        // General
        hello: "Hello,",
        ready: "Ready to work?",
        clock_in: "Clock In",
        clock_out: "Clock Out",
        select_employee: "Auto-detected",
        cancel: "Cancel",
        confirm: "Confirm",
        save: "Save",
        delete: "Delete",
        edit: "Edit",
        add_new: "Add New",
        download_csv: "Download CSV",
        close: "Close",

        // Login
        login_title: "ONESIP Staff Login",
        enter_phone: "Select Staff",
        enter_code: "Enter Password",
        get_code: "Get Code",
        login_btn: "Login",
        invalid_phone: "Invalid User",
        invalid_code: "Incorrect Password",
        code_sent: "Code sent: 1234",
        select_user: "Select your name",
        remember_password: "Remember Password",
        keep_logged_in: "Keep Me Logged In",

        // Inventory
        inventory_title: "Inventory Mgmt",
        item_name: "Item",
        end_count: "Count",
        waste: "Waste",
        save_report: "Save Report",
        save_report_confirm: "Save current inventory data to database?",
        save_success: "Report saved to database!",
        no_shift_today_alert: "No scheduled shift for today. Clock-in/out is disabled.",
        inventory_before_clock_out: "Please complete the inventory report before clocking out.",
        complete_inventory_to_clock_out: "Complete inventory to proceed with clock-out.",
        cancel_clock_out_confirm: "Are you sure you want to cancel the clock-out process?",
        owner_dashboard: "Inventory Command (Owner)",
        manage_presets: "Manage Presets",
        report_history: "Report History",
        last_refill_title: "Last Refill Summary",
        no_refill_record: "No refill logs yet",
        more_items: "{n} more...",
        refill_details_title: "Last Refill Details",
        refilled_by_on: "By {name} on {time}",
        total_items_refilled: "{count} items refilled",
        staff_label: "Staff",
        time_label: "Time",
        using_preset_inventory: "Using preset inventory, no manual refill yet",
        managing_preset_items: "Managing {count} preset items",
        preset_inventory_title: "Current Preset Inventory",
        no_refill_or_preset: "No refill logs or preset inventory yet",
        preset_value: "preset",

        // Editor
        editor_title: "Content Editor",
        editor_desc: "Modify Training, SOPs, Recipes",
        content_mgmt: "Content Management",
        save_changes: "Save Changes",

        // Modules
        recipe_title: "Drink Recipes",
        sop_library: "SOP Library",
        team_title: "Weekly Schedule",
        contact_title: "Contacts",
        my_shift: "My Shifts",
        next_shift: "Next Shift",
        no_shift: "No upcoming shifts",
        next_week_availability: "Next Week Availability",
        availability_reminder_title: "Set Next Week's Availability",
        availability_reminder_body: "The manager is creating the schedule for next week. Please submit your availability to help with planning.",
        fill_now: "Fill Now",
        later: "Later",
        availability_saved: "Availability saved!",
        
        // Chat
        team_board: "Team Board",
        type_message: "Type a message...",
        no_messages: "No messages yet",
        recent: "Recent",

        // Manager
        manager_title: "Manager Dashboard",
        drag_hint: "Drag names to schedule (Max 3/shift)",
        morning_shift: "Morning (10:00-15:00)",
        evening_shift: "Evening (14:30-19:00)",
        work_hours: "Work Hours",
        total_hours: "Total Hours",
        financial_dashboard: "Financial Dashboard",
        budget_max: "Budget Max",
        hourly_wage: "Hourly Wage",
        est_cost: "Est. Cost (Sched)",
        actual_cost: "Actual Cost (Logs)",
        balance: "Balance",
        set_wages: "Set Wages",
        download_logs: "Export Logs",

        // Content
        opening_title: "Opening",
        mid_title: "Mid-Day",
        closing_title: "Closing",
        submit_success: "Submitted Successfully!",
        copied: "Number Copied",
        // FIX: Add missing translations for deviation modal
        deviation_title: "Clock time deviates from schedule",
        deviation_subtitle: "Please provide a reason",
        deviation_placeholder: "e.g., transport delay, shift change, overtime...",
        deviation_confirm: "Confirm & Clock In/Out",
    }
};

// Updated Database with Passwords
export const USERS: User[] = [
    { id: 'u_ruru', name: 'RURU', role: 'staff', phone: '31684684907', password: '490701' },
    { id: 'u_yang', name: 'Yang', role: 'boss', phone: '31625491808', password: '180802' },
    { id: 'u_haohui', name: 'Haohui', role: 'maintenance', phone: '31681166148', password: '614803' },
    { id: 'u_lambert', name: 'Lambert', role: 'manager', phone: '31626419957', password: '995704' },
    { id: 'u_zhiyi', name: 'Zhiyi', role: 'staff', phone: '31630047391', password: '739105' },
    { id: 'u_tingshan', name: 'Tingshan', role: 'staff', phone: '31659343108', password: '310806' },
    { id: 'u_kloe', name: 'Kloe', role: 'staff', phone: '31645747056', password: '705607' },
    { id: 'u_maidou', name: 'Maidou', role: 'staff', phone: '31684866535', password: '653508' },
    { id: 'u_xinrui', name: 'Xinrui', role: 'staff', phone: '31628895082', password: '508209' },
    { id: 'u_linda', name: 'Linda', role: 'staff', phone: '31638100725', password: '072510' },
    { id: 'u_mengchu', name: 'Mengchu', role: 'staff', phone: '31616928771', password: '877111' },
    { id: 'u_najata', name: 'Najat', role: 'staff', phone: '31684244371', password: '437112' },
    { id: 'u_editor', name: 'Editor', role: 'editor', phone: '0413', password: '0413' }, // Explicit editor user
    { id: 'u_julia', name: 'Julia', role: 'staff', phone: '', password: '' }, // No password for Julia yet
];

export const TEAM_MEMBERS: string[] = [
    "RURU", "Yang", "Haohui", "Lambert", "Zhiyi", "Tingshan", 
    "Kloe", "Maidou", "Xinrui", "Linda", "Mengchu", "Julia", "Najat"
];

// ... (rest of the file remains unchanged)
export const CONTACTS_DATA: ContactItem[] = [
    { id: 'c_yang', name: 'Yang', role: { zh: '店主', en: 'Boss' }, phone: '+31 6 25491808' },
    { id: 'c_lambert', name: 'Lambert', role: { zh: '店长', en: 'Manager' }, phone: '+31 6 26419957' },
    { id: 'c_haohui', name: 'Haohui', role: { zh: '维修师傅', en: 'Maintenance' }, phone: '+31 6 81166148' },
    { id: 'c_ruru', name: 'RURU', role: { zh: '员工', en: 'Staff' }, phone: '+31 6 84684907' },
    { id: 'c_zhiyi', name: 'Zhiyi', role: { zh: '员工', en: 'Staff' }, phone: '+31 6 30047391' },
    { id: 'c_tingshan', name: 'Tingshan', role: { zh: '员工', en: 'Staff' }, phone: '+31 6 59343108' },
    { id: 'c_kloe', name: 'Kloe', role: { zh: '员工', en: 'Staff' }, phone: '+31 6 45747056' },
    { id: 'c_maidou', name: 'Maidou', role: { zh: '员工', en: 'Staff' }, phone: '+31 6 84866535' },
    { id: 'c_xinrui', name: 'Xinrui', role: { zh: '员工', en: 'Staff' }, phone: '+31 6 28895082' },
    { id: 'c_linda', name: 'Linda', role: { zh: '员工', en: 'Staff' }, phone: '+31 6 38100725' },
    { id: 'c_mengchu', name: 'Mengchu', role: { zh: '员工', en: 'Staff' }, phone: '+31 6 16928771' },
    { id: 'c_najata', name: 'Najat', role: { zh: '员工', en: 'Staff' }, phone: '+31 6 84244371' },
    { id: 'c_julia', name: 'Julia', role: { zh: '员工', en: 'Staff' }, phone: null },
];

export const SOP_DATABASE: SopItem[] = [
    { 
        id: 'sop_clean_1', 
        category: 'Cleaning',
        title: { zh: '晚班清洁流程 (Cleaning SOP)', en: 'Closing Cleaning SOP' }, 
        content: { 
            zh: '1. 19:00/19:30 前：完成泡茶机自清洁并关机。\n2. 奶盖区：如有剩余倒入密封罐冷藏，清洁桶身。\n3. 客座区：擦桌子，关插座，清垃圾。准备两桶水（一热一温+清洁剂）清洗智能机。\n4. 蒸汽机：放气，擦蒸汽棒，洗水箱，清洁抹布。\n5. 智能机：取出清洁管，排干水。清洁出水口（热水x2），用海绵刷洗出杯网格。\n6. 封口机：每日拆卸深层清洁。\n7. 地面：先吸尘后拖地（不走回头路）。', 
            en: '1. Before 19:00/19:30: Self-clean tea machine & turn off.\n2. Foam Area: Store leftovers, clean barrels. Wash empty containers in dishwasher.\n3. Customer Area: Wipe tables, power off outlets, clear trash. Prep 2 buckets (Hot water / Warm+Detergent) for Smart Machine.\n4. Steam Machine: Release steam, wipe wand, rinse tank.\n5. Smart Machine: Remove tube, drain. Rinse outlet grid (hot water x2). Scrub cup grid with sponge.\n6. Sealer: Disassemble & deep clean daily.\n7. Floor: Vacuum then Mop (no backtracking).' 
        }, 
        tags: ['cleaning', 'closing', 'dishwasher', 'smart machine'] 
    },
    { 
        id: 'sop_open_1', 
        category: 'Opening',
        title: { zh: '早班开铺流程 (Opening SOP)', en: 'Opening Shift SOP' }, 
        content: { 
            zh: '1. 进店：解除警报 (密码 0117)。\n2. 开设备：制冰机、咖啡机、洗碗机、蒸汽机、智能机、封口机、开水机。\n3. 备料：煮茉莉绿茶(150g, Mode 7)。\n4. 调乳底：2L热水 + 2包粉 + 1kg冰。\n5. 煮珍珠：右边锅，3L水，1包珍珠 (1000g)。\n6. 智能机加料：粉料(椰子/芋头/火龙果)、糖浆、牛奶/燕麦奶。\n7. 打奶盖：抹茶液 -> 抹茶云顶 -> 芝士/优格。\n8. 11:20 准备：摆放户外桌椅，测试Kiosk。', 
            en: '1. Entry: Disarm Alarm (Code 0117).\n2. Power On: Ice machine, Coffee, Dishwasher, Steamer, Smart Machine, Sealer, Hot Water.\n3. Prep: Brew Jasmine Green (150g, Mode 7).\n4. Creamer: 2L Hot Water + 2 bags powder + 1kg Ice.\n5. Tapioca: Right cooker, 3L water, 1 bag (1000g).\n6. Refill Smart Machine: Premixes, Syrups, Milks.\n7. Foams: Matcha Liquid -> Matcha Cloud -> Cheezo/Yoghurt.\n8. 11:20 Setup: Outdoor chairs, Test Kiosk.' 
        }, 
        tags: ['opening', '0117', 'prep', 'tapioca'] 
    },
    { 
        id: 'sop_team_1', 
        category: 'Team',
        title: { zh: '多人协作模式 (Team Mode)', en: 'Team Mode Allocation' }, 
        content: { 
            zh: '【双人模式】\nPos A (前台/备料): 点单，贴标，智能机接料，加小料，打冰沙底。\nPos B (出品): 加冰/热，封口，摇匀，出杯。辅助A补料。\n\n【三人模式】\nPos A: 点单，贴标，智能机，冰沙底。\nPos B: 封口，摇匀，部分出杯。\nPos C (支援/总控): 最终出杯(加盖/装袋)，补吸管/纸巾，监控物料余量 (珍珠/茶汤/奶盖)。', 
            en: '【Two-Person】\nPos A (Front/Prep): Order, Label, Smart Machine dispensing, Toppings, Smoothie base.\nPos B (Finisher): Add Ice/Heat, Seal, Shake, Serve. Assist refill.\n\n【Three-Person】\nPos A: Order, Label, Smart Machine, Smoothie base.\nPos B: Partial finish (Ice/Heat/Seal/Shake).\nPos C (Support/Control): Final serve (Lid/Bag), Restock packaging, Monitor ingredient levels (Tapioca/Tea/Foam).' 
        }, 
        tags: ['team', 'roles', 'position'] 
    },
    { 
        id: 'sop_prod_1', 
        category: 'Product',
        title: { zh: '出品标准 (Preparation Standards)', en: 'Product Standards' }, 
        content: { 
            zh: '1. 单层饮品：封口前擦拭杯口，封口后摇匀。\n2. 多层饮品/脏脏茶：智能机出完第一层后，用勺子轻轻搅拌均匀糖浆，再加第二层。\n3. 冰沙：入杯前必须试味。若有大冰块需加水重打。杯壁若有残留需擦拭。\n4. 热饮：加热目标温度 70°C。姜心比心倒杯时要慢，防止姜渣入杯。\n5. 递餐：检查杯身是否干净，无黏腻。', 
            en: '1. Single-layer: Wipe rim before sealing. Shake well after sealing.\n2. Multi-layer: Gently stir the first layer (syrup/liquid) before adding the next layer to avoid bottom sweetness.\n3. Slush: Taste-test before pouring. Re-blend if chunky. Wipe cup wall if messy.\n4. Hot Drinks: Target 70°C. Pour "Ginger Spicy" slowly to keep fibers in pitcher.\n5. Serving: Ensure cup exterior is clean and not sticky.' 
        }, 
        tags: ['product', 'quality', 'hot', 'slush'] 
    },
    { 
        id: 'sop_serv_1', 
        category: 'Service',
        title: { zh: '服务礼仪 (Service Etiquette)', en: 'Service Etiquette' }, 
        content: { 
            zh: '核心原则：眼神接触，自然微笑，简短问候 (Hello/Enjoy)，轻拿轻放。\n\n场景应对：\n- 等待时："Hello, your drink will be ready soon."\n- 递餐时："Here is your [drink name], please enjoy." (热饮提醒烫)\n- 忙碌时：至少做到点头致意 + 微笑。\n- 做错/打翻：立即道歉并重做/擦拭 ("Sorry, let me wipe it for you").', 
            en: 'Core: Eye contact, Natural smile, Short greeting, Gentle action.\n\nScenarios:\n- Waiting: "Hello, your drink will be ready soon."\n- Serving: "Here is your [drink name], please enjoy." (Warn if hot).\n- Busy: At least Nod + Smile.\n- Mistake/Spill: Apologize & Remake/Wipe immediately ("Sorry, let me wipe it for you").' 
        }, 
        tags: ['service', 'etiquette', 'customer'] 
    }
];

export const TRAINING_LEVELS: TrainingLevel[] = [
    {
        id: 1,
        title: { zh: "模块 1: 服务与礼仪", en: "Module 1: Service & Etiquette" },
        subtitle: { zh: "Service Standards", en: "Service Standards" },
        desc: { zh: "学习核心服务原则、递餐流程及突发情况应对。", en: "Core principles, Serving flow, and Handling scenarios." },
        content: [
            { title: { zh: '核心原则', en: 'Core Principles' }, body: { zh: '1. 眼神接触 (Eye Contact)\n2. 自然微笑 (Smile)\n3. 轻拿轻放 (Gentle Action)\n4. 正面情绪 (Positive Tone)', en: '1. Eye Contact\n2. Smile\n3. Gentle Action\n4. Positive Tone' } },
            { title: { zh: '标准话术', en: 'Standard Phrases' }, body: { zh: '等待时: "Hello, your drink will be ready soon."\n递餐时: "Here is your [drink], please enjoy."\n离开时: "Thank you, have a great day!"', en: 'Waiting: "Hello, your drink will be ready soon."\nServing: "Here is your [drink], please enjoy."\nLeaving: "Thank you, have a great day!"' } }
        ],
        quiz: [
            { id: 'q1-1', type: 'choice', question: { zh: '忙碌时无法说话，最少要做什么？', en: 'Minimum standard when busy and cannot speak?' }, options: ['Ignore customer', 'Nod and Smile', 'Yell the number'], answer: 1 },
            { id: 'q1-2', type: 'choice', question: { zh: '递热饮时必须提醒什么？', en: 'What to warn when serving hot drinks?' }, options: ['It is sweet', 'It is heavy', 'Careful, it is hot'], answer: 2 }
        ]
    },
    {
        id: 2,
        title: { zh: "模块 2: 早班开铺 SOP", en: "Module 2: Opening Shift SOP" },
        subtitle: { zh: "Opening Setup", en: "Opening Setup" },
        desc: { zh: "警报解除、设备开启顺序、备料流程。", en: "Alarm disarm, Equipment power-on, Ingredient prep." },
        content: [
            { title: { zh: '进店第一件事', en: 'First Step' }, body: { zh: '解除警报，密码 0117。', en: 'Disarm security system. Code: 0117.' } },
            { title: { zh: '煮茶与备料', en: 'Brewing & Prep' }, body: { zh: '茉莉绿茶: 150g, Mode 7。\n珍珠: 右边锅, 3L水, 1包。\n奶底: 2L热 + 2粉 + 1kg冰。', en: 'Jasmine: 150g, Mode 7.\nTapioca: Right pot, 3L water, 1 bag.\nCreamer: 2L Hot + 2 bags + 1kg Ice.' } }
        ],
        quiz: [
            { id: 'q2-1', type: 'choice', question: { zh: '警报密码是多少？', en: 'What is the alarm code?' }, options: ['0000', '1234', '0117'], answer: 2 },
            { id: 'q2-2', type: 'choice', question: { zh: '煮一包珍珠需要多少水？', en: 'Water needed for 1 bag of tapioca?' }, options: ['2L', '3L', '5L'], answer: 1 }
        ]
    },
    {
        id: 3,
        title: { zh: "模块 3: 晚班收档 SOP", en: "Module 3: Closing SOP" },
        subtitle: { zh: "Closing & Cleaning", en: "Closing & Cleaning" },
        desc: { zh: "泡茶机清洁、智能机清洁、地面清洁。", en: "Tea machine, Smart machine, Floor cleaning." },
        content: [
            { title: { zh: '关键时间点', en: 'Key Timing' }, body: { zh: '19:00/19:30 前完成泡茶机自清洁并关机。', en: 'Finish Tea Machine self-cleaning before 19:00/19:30.' } },
            { title: { zh: '洗碗机模式', en: 'Dishwasher Mode' }, body: { zh: '使用 P3 模式清洗。', en: 'Use P3 Mode.' } },
            { title: { zh: '智能机清洁', en: 'Smart Machine' }, body: { zh: '准备两桶水：一桶热水，一桶温水+清洁剂。', en: 'Prep 2 buckets: One Hot, One Warm+Detergent.' } }
        ],
        quiz: [
            { id: 'q3-1', type: 'choice', question: { zh: '洗碗机开什么模式？', en: 'Which dishwasher mode?' }, options: ['P1', 'P2', 'P3'], answer: 2 },
            { id: 'q3-2', type: 'choice', question: { zh: '拖地原则是什么？', en: 'Mopping principle?' }, options: ['Random', 'No backtracking', 'Circular'], answer: 1 }
        ]
    },
    {
        id: 4,
        title: { zh: "模块 4: 多人协作与出品", en: "Module 4: Team & Product" },
        subtitle: { zh: "Team Mode & Standards", en: "Team Mode & Standards" },
        desc: { zh: "A/B/C 岗职责，饮品制作标准。", en: "Pos A/B/C roles, Drink standards." },
        content: [
            { title: { zh: '多人岗位', en: 'Team Roles' }, body: { zh: 'A岗: 前台/贴标/备料。\nB岗: 出品(加冰/封口)。\nC岗: 支援/总控/补料。', en: 'Pos A: Front/Label/Prep.\nPos B: Finish (Ice/Seal).\nPos C: Support/Refill.' } },
            { title: { zh: '出品标准', en: 'Product Standards' }, body: { zh: '多层饮品第一层必须搅拌均匀。热饮目标温度 70度。', en: 'Stir 1st layer for multi-layer drinks. Hot drink target 70°C.' } }
        ],
        quiz: [
            { id: 'q4-1', type: 'choice', question: { zh: '谁负责主要出品封口？', en: 'Who is the main finisher/sealer?' }, options: ['Pos A', 'Pos B'], answer: 1 },
            { id: 'q4-2', type: 'choice', question: { zh: '热饮目标温度？', en: 'Target temp for hot drinks?' }, options: ['50°C', '70°C', '90°C'], answer: 1 }
        ]
    }
];

export const CHECKLIST_TEMPLATES: Record<string, ChecklistTemplate> = {
    opening: {
        title: { zh: '早班开铺自查', en: 'Opening Checklist' },
        subtitle: { zh: 'Morning Setup', en: 'Morning Setup' },
        color: 'bg-yellow-500',
        items: [
            { id: 'o1', text: { zh: '警报解除 (0117)', en: 'Disarm Alarm (0117)' }, desc: { zh: '进门第一件事', en: 'First thing upon entry' } },
            { id: 'o2', text: { zh: '设备电源全开', en: 'Turn on All Devices' }, desc: { zh: '制冰机、茶机、封口机、奶茶机', en: 'Ice machine, Tea brewer, Sealer, Smart machine' } },
            { id: 'o3', text: { zh: '网络与打印机', en: 'Network & Printer' }, desc: { zh: '检查 Orderpin 是否连通', en: 'Check Orderpin connection' } },
            { id: 'o4', text: { zh: '户外摆设', en: 'Outdoor Setup' }, desc: { zh: '11:20 摆放桌椅', en: '11:20 Set up tables/chairs' } },
            { id: 'o5', text: { zh: '煮珍珠', en: 'Cook Tapioca' }, desc: { zh: '右边锅, 3L水, 1包', en: 'Right pot, 3L water, 1 bag' } },
            { id: 'o6', text: { zh: '泡茶 (茉莉)', en: 'Brew Jasmine' }, desc: { zh: '150g, Mode 7', en: '150g, Mode 7' } },
            { id: 'o7', text: { zh: '备料补充', en: 'Refill Ingredients' }, desc: { zh: '粉料/糖浆/牛奶/奶盖', en: 'Powders/Syrups/Milk/Foam' } },
        ]
    },
    mid: {
        title: { zh: '中段巡检', en: 'Mid-Day Check' },
        subtitle: { zh: 'Mid-Day Check', en: 'Quality Assurance' },
        color: 'bg-blue-500',
        items: [
            { id: 'm1', text: { zh: '珍珠余量检查', en: 'Tapioca Level' }, desc: { zh: '是否需要补煮？', en: 'Need to cook more?' } },
            { id: 'm2', text: { zh: '机器原料补充', en: 'Refill Smart Machine' }, desc: { zh: 'Smart Machine 糖浆/粉料', en: 'Syrups & Powders' } },
            { id: 'm3', text: { zh: '吧台台面清洁', en: 'Counter Cleaning' }, desc: { zh: '无积水、无洒漏', en: 'No spills, dry surface' } },
            { id: 'm4', text: { zh: '外卖包材检查', en: 'Packaging Stock' }, desc: { zh: '杯托、袋子够不够', en: 'Cup holders, bags' } },
        ]
    },
    closing: {
        title: { zh: '晚班收档自查', en: 'Closing Checklist' },
        subtitle: { zh: 'Closing Process', en: 'End of Day' },
        color: 'bg-purple-600',
        items: [
            { id: 'c1', text: { zh: '泡茶机清洁', en: 'Tea Machine Clean' }, desc: { zh: '19:30前完成自清洁', en: 'Self-clean before 19:30' } },
            { id: 'c2', text: { zh: '奶盖/原料冷藏', en: 'Store Ingredients' }, desc: { zh: '多余原料密封冷藏', en: 'Seal and refrigerate leftovers' } },
            { id: 'c3', text: { zh: '智能机清洁', en: 'Smart Machine Clean' }, desc: { zh: '排空水，洗出水口', en: 'Drain water, clean outlet' } },
            { id: 'c4', text: { zh: '收回户外桌椅', en: 'Retract Outdoor' }, desc: { zh: '全部收回并上锁', en: 'Bring in and lock' } },
            { id: 'c5', text: { zh: '地面清洁', en: 'Floor Cleaning' }, desc: { zh: '先吸尘，后拖地', en: 'Vacuum then Mop' } },
            { id: 'c6', text: { zh: '垃圾清运', en: 'Take out Trash' }, desc: { zh: '扔掉垃圾，换新袋子', en: 'Dispose and replace bags' } },
            { id: 'c7', text: { zh: '离店设防', en: 'Lock & Arm' }, desc: { zh: '关灯 -> 锁门 -> 设警报(0117)', en: 'Lights off -> Lock -> Alarm(0117)' } },
        ]
    }
};

export const TOPPING_LAYOUT: ToppingSlot[] = [
    { col: 1, top: { zh: '红枣酱', en: 'Red Date Jam' }, bottom: { zh: '寒天', en: 'Agar Jelly' } },
    { col: 2, top: { zh: '葡萄', en: 'Grape' }, bottom: { zh: '椰果', en: 'Coconut Jelly' } },
    { col: 3, top: { zh: '小吊梨', en: 'Pear' }, bottom: { zh: '马蹄爆爆珠', en: 'Water Chestnut Pop' } },
    { col: 4, top: { zh: '百香果酱', en: 'Passion Fruit' }, bottom: { zh: '茶冻', en: 'Tea Jelly' } },
];

export const SYRUP_LAYOUT: { left: SyrupSlot[]; right: SyrupSlot[] } = {
    left: [
        { id: 1, name: { zh: '橙子酱', en: 'Orange Jam' } },
        { id: 2, name: { zh: '黑糖', en: 'Brown Sugar' } },
        { id: 3, name: { zh: '玫瑰酱', en: 'Rose Jam' } }
    ],
    right: [
        { id: 1, name: { zh: '黑糖姜母', en: 'Ginger Brown Sugar' } },
        { id: 2, name: { zh: '现空', en: 'Empty' }, isEmpty: true },
        { id: 3, name: { zh: '现空', en: 'Empty' }, isEmpty: true }
    ]
};

export const DRINK_RECIPES: DrinkRecipe[] = [
    // ... (Existing recipes kept same)
     {
        id: 'm1', name: {zh: '桂圆红枣黑茶', en: 'Longan Jujube Black'}, cat: 'Milk Tea', size: '500ml', ice: 'Cold/Warm', sugar: '100%-0%',
        toppings: {zh: '珍珠 1勺', en: 'Tapioca 1 spoon'},
        steps: {
            cold: [{zh:'加1勺珍珠到杯中',en:'Add 1 spoon tapioca'}, {zh:'加2粉勺(约70g)桂圆红枣酱',en:'Add 2 powder spoons (70g) Longan&Jujube sauce'}, {zh:'放杯子到机器下',en:'Place cup under machine'}, {zh:'扫码或选择 [Milk Tea] -> 对应产品',en:'Select product on machine'}, {zh:'封口',en:'Seal cup'}],
            warm: [{zh:'加1勺珍珠',en:'Add 1 spoon tapioca'}, {zh:'在雪克杯加2粉勺(70g)桂圆红枣酱',en:'Add 2 powder spoons sauce to Shaker'}, {zh:'机器出茶',en:'Machine dispense'}, {zh:'蒸汽加热至70度',en:'Steam to 70°C'}, {zh:'倒入纸杯',en:'Pour to paper cup'}, {zh:'放入红枣肉',en:'Add jujube pieces'}, {zh:'封口',en:'Seal cup'}]
        }
    },
     {
        id: 'm2', name: {zh: '烤奶', en: 'Roasted Milk Tea'}, cat: 'Milk Tea', size: '500ml', ice: 'Cold/Warm', sugar: '100%-0%',
        toppings: {zh: '珍珠 1勺', en: 'Tapioca 1 spoon'},
        steps: {
            cold: [{zh:'加1勺珍珠',en:'Add 1 spoon tapioca'}, {zh:'机器出茶',en:'Machine dispense'}, {zh:'封口',en:'Seal cup'}],
            warm: [{zh:'加1勺珍珠',en:'Add 1 spoon tapioca'}, {zh:'雪克杯接茶',en:'Dispense to shaker'}, {zh:'蒸汽加热至70度',en:'Steam to 70°C'}, {zh:'倒入纸杯封口',en:'Pour to paper cup & Seal'}]
        }
    },
     {
        id: 'm3', name: {zh: '姜心比心', en: 'Ginger Milk Tea'}, cat: 'Milk Tea', size: '500ml', ice: 'Warm Only', sugar: '100%-0%',
        toppings: {zh: '珍珠 1勺, 姜糖30g', en: 'Tapioca 1 spoon, Ginger sugar 30g'},
        steps: {
            cold: [],
            warm: [{zh:'加1勺珍珠到纸杯',en:'Add 1 spoon tapioca to paper cup'}, {zh:'钢杯中加30g姜糖',en:'Add 30g ginger sugar to stainless cup'}, {zh:'机器出茶到钢杯',en:'Dispense to stainless cup'}, {zh:'蒸汽加热至70度',en:'Steam to 70°C'}, {zh:'过滤姜渣倒入纸杯',en:'Filter out ginger & pour to cup'}, {zh:'封口',en:'Seal'}]
        }
    },
    {
        id: 'm4', name: {zh: '桃胶奶茶', en: 'Peach Gum Milk Tea'}, cat: 'Milk Tea', size: '500ml', ice: 'Low/Warm', sugar: '100%-0%',
        toppings: {zh: '芋圆1勺, 桃胶2粉勺', en: 'Taro ball 1 sp, Peach gum 2 powder sp'},
        steps: {
            cold: [{zh:'加芋圆和桃胶',en:'Add Taro ball & Peach gum'}, {zh:'雪克杯接茶',en:'Dispense to shaker'}, {zh:'加冰至400ml线摇匀',en:'Add ice to 400ml & shake'}, {zh:'倒入杯中封口',en:'Pour & Seal'}],
            warm: [{zh:'加芋圆和桃胶',en:'Add toppings'}, {zh:'机器出茶',en:'Machine dispense'}, {zh:'蒸汽加热',en:'Steam'}, {zh:'封口',en:'Seal'}]
        }
    },
     {
        id: 'm5', name: {zh: '小吊梨芦薈', en: 'Snow Pear Aloe Milk'}, cat: 'Milk Tea', size: '500ml', ice: 'Cold/Warm', sugar: 'No add',
        toppings: {zh: '马蹄爆爆珠1勺, 梨酱3粉勺', en: 'Waterchestnut boba 1 sp, Pear jam 3 ps'},
        steps: {
            cold: [{zh:'加爆爆珠和3勺梨酱',en:'Add boba & pear jam'}, {zh:'机器出茶',en:'Machine dispense'}, {zh:'加冰封口',en:'Add ice & Seal'}],
            warm: [{zh:'同冷饮步骤',en:'Same ingredients'}, {zh:'雪克杯接茶加热',en:'Dispense to shaker & Steam'}, {zh:'倒入纸杯封口',en:'Pour to paper cup & Seal'}]
        }
    },
    {
        id: 'm6', name: {zh: '经典/茉莉/山茶花/四季春奶茶', en: 'Classic/Jasmine/Camellia/4 Season Bubble Tea'}, cat: 'Milk Tea', size: '500ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '珍珠 1勺', en: 'Tapioca 1 spoon'},
        steps: {
            cold: [{zh:'加1勺珍珠',en:'Add 1 spoon tapioca'}, {zh:'雪克杯接茶',en:'Dispense to shaker'}, {zh:'加冰至450ml摇匀',en:'Add ice to 450ml & shake'}, {zh:'倒入杯中封口',en:'Pour & Seal'}],
            warm: [{zh:'加1勺珍珠',en:'Add 1 spoon tapioca'}, {zh:'钢杯接茶',en:'Dispense to stainless cup'}, {zh:'加热至70度',en:'Steam to 70°C'}, {zh:'倒入纸杯封口',en:'Pour & Seal'}]
        }
    },
    {
        id: 'm7', name: {zh: '榛果巧克力黑茶/茉莉', en: 'Hazelnut Choco Black/Jasmine'}, cat: 'Milk Tea', size: '700ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '珍珠 1勺, 巧克力液100g', en: 'Tapioca 1 spoon, Choco liquid 100g'},
        steps: {
            cold: [{zh:'加珍珠',en:'Add tapioca'}, {zh:'机器出茶',en:'Dispense tea'}, {zh:'加100-110g巧克力液',en:'Add 100-110g Choco liquid'},{zh:'加冰摇匀',en:'Add ice & Shake'},{zh:'倒入杯中封口',en:'Pour & Seal'}],
            warm: [{zh:'加珍珠',en:'Add tapioca'}, {zh:'机器出茶到钢杯',en:'Dispense to stainless cup'}, {zh:'加巧克力液加热',en:'Add Choco & Steam'}, {zh:'倒入纸杯封口',en:'Pour & Seal'}]
        }
    },
    {
        id: 'm8', name: {zh: '榛果/桃子/奥利奥布蕾奶茶', en: 'Hazelnut/Peach/Oreo Creme Brulee'}, cat: 'Milk Tea', size: '700ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '珍珠 1勺, 布蕾酱(挂壁+顶)', en: 'Tapioca 1 spoon, Creme Brulee (Wall+Top)'},
        steps: {
            cold: [{zh:'加珍珠',en:'Add tapioca'}, {zh:'布蕾挂壁',en:'Smear Brulee on wall'}, {zh:'机器出茶加料(榛果液/奥利奥等)',en:'Dispense & Add flavor'},{zh:'加冰摇匀',en:'Add ice & Shake'},{zh:'倒入杯中, 顶部加布蕾/奥利奥碎',en:'Pour, Add Brulee/Oreo on top'}],
            warm: [{zh:'加珍珠',en:'Add tapioca'}, {zh:'布蕾挂壁',en:'Smear Brulee on wall'}, {zh:'机器出茶加热',en:'Dispense & Steam'}, {zh:'倒入纸杯, 顶部加布蕾',en:'Pour & Add Brulee on top'}]
        }
    },
    {
        id: 'm9', name: {zh: '泰式咸奶茶 / 经典咸奶茶', en: 'Thai Salté / Classic Salté'}, cat: 'Milk Tea', size: '500ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '底部一勺奶盖', en: '1 spoon Cheese foam at bottom'},
        steps: {
            cold: [{zh:'底部加一勺奶盖',en:'Add 1 spoon foam at bottom'}, {zh:'机器出茶',en:'Dispense tea'}, {zh:'加冰摇匀',en:'Add ice & Shake'},{zh:'倒入杯中封口',en:'Pour & Seal'}],
            warm: [{zh:'底部加一勺奶盖',en:'Add 1 spoon foam at bottom'}, {zh:'机器出茶加热',en:'Dispense & Steam'}, {zh:'倒入纸杯封口',en:'Pour & Seal'}]
        }
    },
    {
        id: 'm10', name: {zh: '小吊梨马蹄奶茶', en: 'Snow Pear Waterchestnut Milk'}, cat: 'Milk Tea', size: '500ml', ice: 'Standard', sugar: 'No add',
        toppings: {zh: '马蹄爆爆珠1勺, 梨酱3粉勺', en: 'Waterchestnut boba 1 sp, Pear jam 3 ps'},
        steps: {
            cold: [{zh:'加爆爆珠和梨酱',en:'Add boba & pear jam'}, {zh:'机器出茶',en:'Dispense tea'}, {zh:'加冰封口',en:'Add ice & Seal'}],
            warm: [{zh:'加爆爆珠和梨酱',en:'Add boba & pear jam'}, {zh:'机器出茶加热',en:'Dispense & Steam'}, {zh:'倒入纸杯封口',en:'Pour & Seal'}]
        }
    },
    {
        id: 'f1', name: {zh: '秋天苹果茉莉', en: 'Autumn Apple Jasmine'}, cat: 'Fruit Tea', size: '500ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '苹果酱 2粉勺', en: 'Apple sauce 2 powder spoons'},
        steps: {
            cold: [{zh:'加苹果酱',en:'Add apple sauce'}, {zh:'机器出茶',en:'Machine dispense'}, {zh:'加冰满杯',en:'Fill with ice'}, {zh:'封口摇匀',en:'Seal & Shake'}],
            warm: [{zh:'加苹果酱到雪克杯',en:'Add sauce to shaker'}, {zh:'机器出茶加热',en:'Dispense & Steam'}, {zh:'倒入纸杯封口',en:'Pour & Seal'}]
        }
    },
    {
        id: 'f2', name: {zh: '初恋葡萄 (First Love)', en: 'First Love Grape'}, cat: 'Fruit Tea', size: '660ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '马蹄爆爆珠1勺, 葡萄碎1勺', en: 'Waterchestnut boba 1 sp, Grape granulates 1 sp'},
        steps: {
            cold: [{zh:'加小料到杯中',en:'Add toppings to cup'}, {zh:'雪克杯: 柠檬1片, 玫瑰花瓣, 冰块捣碎',en:'Shaker: Crush Lemon, Rose, Ice'}, {zh:'加葡萄酱',en:'Add Grape jam'}, {zh:'机器出茶',en:'Dispense tea'}, {zh:'加冰至550线摇匀',en:'Ice to 550ml & Shake'}, {zh:'倒入杯中封口',en:'Pour & Seal'}],
            warm: []
        }
    },
    {
        id: 'f3', name: {zh: '满杯葡萄', en: 'Grape Me More!'}, cat: 'Fruit Tea', size: '500ml/700ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '寒天100g, 葡萄碎60g', en: 'Gardenia jelly 100g, Grape granulates 60g'},
        steps: {
            cold: [{zh:'加寒天和葡萄碎',en:'Add jelly & grape'}, {zh:'冰沙机: 290g冰 + 70g青提酱',en:'Blender: 290g ice + 70g green grape jam'}, {zh:'按4号键打冰沙',en:'Program 4 to blend'}, {zh:'倒入杯中盖盖',en:'Pour & Cover'}],
            warm: []
        }
    },
    {
        id: 'f4', name: {zh: '黑桑葚 (Black Mulberry)', en: 'Black Mulberry'}, cat: 'Fruit Tea', size: '700ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '桑葚2粉勺, 柠檬1片, 茶冻1勺, 马蹄1勺', en: 'Mulberry 2ps, Lemon 1pc, Tea jelly 1sp, Waterchestnut 1sp'},
        steps: {
            cold: [{zh:'杯中加桑葚和柠檬捣碎',en:'Crush mulberry & lemon in cup'}, {zh:'加茶冻和马蹄',en:'Add jelly & waterchestnut'}, {zh:'机器出茶',en:'Dispense tea'}, {zh:'加冰满杯封口',en:'Fill ice & Seal'}, {zh:'摇匀',en:'Shake well'}],
            warm: []
        }
    },
    {
        id: 'f5', name: {zh: '百香果凤梨', en: 'Passion Fruit Pineapple'}, cat: 'Fruit Tea', size: '500/700ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '椰果1勺, 百香果酱1-2勺', en: 'Coconut jelly 1sp, Passion jam 1-2sp'},
        steps: {
            cold: [{zh:'加柠檬片捣碎',en:'Crush lemon slice'}, {zh:'加椰果和百香果酱',en:'Add jelly & jam'}, {zh:'机器出茶',en:'Dispense tea'}, {zh:'加冰封口',en:'Add ice & Seal'}],
            warm: []
        }
    },
    {
        id: 'f6', name: {zh: '玫瑰葡萄乌龙', en: 'Rosy Grape Oolong'}, cat: 'Fruit Tea', size: '500/700ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '葡萄5-6颗, 芋圆1勺, 玫瑰酱', en: 'Grape 5-6pcs, Taro ball 1sp, Rose syrup'},
        steps: {
            cold: [{zh:'加小料和玫瑰酱',en:'Add toppings & syrup'}, {zh:'机器出茶',en:'Dispense tea'}, {zh:'加冰封口',en:'Add ice & Seal'}],
            warm: []
        }
    },
    {
        id: 'f7', name: {zh: '霸气草莓/桃子/百香果/荔枝...', en: 'Strawberry/Peach/Passion/Lychee Jasmine'}, cat: 'Fruit Tea', size: '500ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '对应果酱 + 脆波波/椰果/鲜果', en: 'Fruit jam + Crystal ball/Coconut jelly/Fresh fruit'},
        steps: {
            cold: [{zh:'加小料到杯中',en:'Add toppings'}, {zh:'如有鲜果则捣碎',en:'Crush fresh fruit if any'}, {zh:'机器出茶',en:'Dispense tea'}, {zh:'加冰摇匀',en:'Add ice & Shake'}, {zh:'倒入杯中封口',en:'Pour & Seal'}],
            warm: []
        }
    },
    {
        id: 'f8', name: {zh: '手打柠檬茶 (红/绿/优格)', en: 'Lemon Crushed Tea (Black/Green/Yogurt)'}, cat: 'Lemon Tea', size: '700ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '荔枝椰果/青苹果爆珠/优格爆珠', en: 'Lychee jelly/Apple boba/Yogurt boba'},
        steps: {
            cold: [{zh:'加对应小料',en:'Add toppings'}, {zh:'雪克杯: 2片柠檬+冰块捣碎',en:'Shaker: Crush 2 lemon slices + ice'}, {zh:'机器出茶',en:'Dispense tea'}, {zh:'加冰至600ml摇匀',en:'Ice to 600ml & Shake'}, {zh:'倒入杯中封口',en:'Pour & Seal'}],
            warm: []
        }
    },
    {
        id: 'c1', name: {zh: '芝士果茶 (芒果/桃子/草莓/葡萄)', en: 'Cheezo Fruit Tea (Mango/Peach/etc)'}, cat: 'Cheezo', size: '500ml', ice: 'Slush', sugar: '100%-0%',
        toppings: {zh: '脆波波/鲜果', en: 'Crystal balls/Fresh fruit'},
        steps: {
            cold: [{zh:'加脆波波',en:'Add crystal balls'}, {zh:'冰沙机: 果酱+冰块打沙',en:'Blender: Jam + Ice -> Slush'}, {zh:'倒入杯中',en:'Pour slush'}, {zh:'顶部加芝士奶盖',en:'Add Cheese foam on top'}, {zh:'不封口(用盖子)',en:'Use lid (No seal)'}],
            warm: []
        }
    },
    {
        id: 'fb1', name: {zh: '现萃茶 (玫瑰/桂花/白桃乌龙)', en: 'Fresh Brew (Rose/Osmanthus/Peach)'}, cat: 'Fresh Brew', size: '700ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '黑茶冻 2勺 + 芝士奶盖', en: 'Black tea jelly 2sp + Cheese foam'},
        steps: {
            cold: [{zh:'加茶冻',en:'Add jelly'}, {zh:'萃茶机萃取茶包',en:'Brew tea bag'}, {zh:'加冰满杯, 倒入茶汤',en:'Fill ice, pour tea'}, {zh:'机器出茶汤补满',en:'Dispense base tea'}, {zh:'顶部加芝士奶盖+花瓣',en:'Add Cheese foam + Petals'}],
            warm: []
        }
    },
    {
        id: 'nc1', name: {zh: '奶油茉莉 /奶油龙井', en: 'Cream Jasmine / Dragonwell'}, cat: '2025 New Creamer', size: '500ml', ice: 'Low/Warm', sugar: '100%-0%',
        toppings: {zh: '碧根果 / 无花果碎', en: 'Pecans / Fig granules'},
        steps: {
            cold: [{zh:'机器出茶',en:'Dispense tea'}, {zh:'加冰至350ml',en:'Ice to 350ml'}, {zh:'奶昔机搅拌5秒',en:'Mix 5s'}, {zh:'顶部打奶油3圈',en:'Cream top 3 rounds'}, {zh:'撒坚果碎',en:'Sprinkle nuts'}],
            warm: [{zh:'机器出茶加热',en:'Dispense & Steam'}, {zh:'顶部打奶油3圈',en:'Cream top 3 rounds'}, {zh:'撒坚果碎',en:'Sprinkle nuts'}]
        }
    },
    {
        id: 'nc2', name: {zh: '雪梨乌龙', en: 'Snow Pear Oolong'}, cat: '2025 New Creamer', size: '500/660ml', ice: 'Standard', sugar: 'No add',
        toppings: {zh: '马蹄爆爆珠+芦薈+梨酱', en: 'Waterchestnut boba+Aloe+Pear jam'},
        steps: {
            cold: [{zh:'加小料和梨酱',en:'Add toppings & jam'}, {zh:'机器出茶',en:'Dispense tea'}, {zh:'加冰封口',en:'Add ice & Seal'}, {zh:'摇匀',en:'Shake well'}],
            warm: [{zh:'加小料和梨酱',en:'Add toppings & jam'}, {zh:'机器出茶加热',en:'Dispense & Steam'}, {zh:'封口',en:'Seal'}]
        }
    },
    {
        id: 'bs1', name: {zh: '黑糖咖啡珍珠鲜奶', en: 'Brown Sugar Coffee Milk'}, cat: 'Brown Sugar', size: '500ml', ice: 'Cold/Warm', sugar: '100%-0%',
        toppings: {zh: '珍珠, 黑糖挂壁', en: 'Tapioca, Brown sugar wall'},
        steps: {
            cold: [{zh:'加珍珠, 黑糖挂壁',en:'Add Tapioca'}, {zh:'黑糖挂壁',en:'Brown sugar on wall'}, {zh:'机器出奶',en:'Dispense milk'}, {zh:'加冰',en:'Add ice'}, {zh:'加咖啡液',en:'Add coffee'}, {zh:'封口',en:'Seal'}],
            warm: [{zh:'加珍珠, 黑糖挂壁',en:'Add Tapioca'}, {zh:'黑糖挂壁',en:'Brown sugar on wall'}, {zh:'机器出奶加热',en:'Dispense milk & Steam'}, {zh:'加咖啡液',en:'Add coffee'}, {zh:'封口',en:'Seal'}]
        }
    },
    {
        id: 'bs2', name: {zh: '黑糖珍珠鲜奶', en: 'Brown Sugar Milk'}, cat: 'Brown Sugar', size: '500ml', ice: 'Cold/Warm', sugar: '100%-0%',
        toppings: {zh: '珍珠, 黑糖挂壁', en: 'Tapioca, Brown sugar wall'},
        steps: {
            cold: [{zh:'加珍珠, 黑糖挂壁',en:'Add Tapioca'}, {zh:'黑糖挂壁',en:'Brown sugar on wall'}, {zh:'机器出奶',en:'Dispense milk'}, {zh:'加冰',en:'Add ice'}, {zh:'封口',en:'Seal'}],
            warm: [{zh:'加珍珠, 黑糖挂壁',en:'Add Tapioca'}, {zh:'黑糖挂壁',en:'Brown sugar on wall'}, {zh:'机器出奶加热',en:'Dispense milk & Steam'}, {zh:'封口',en:'Seal'}]
        }
    },
    {
        id: 'ma1', name: {zh: '抹茶草莓', en: 'Matcha Strawberry'}, cat: 'Matcha', size: '500ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '草莓水晶球, 草莓酱', en: 'Strawberry crystal balls, Jam'},
        steps: {
            cold: [{zh:'加水晶球和草莓酱挂壁',en:'Add crystal balls & Smear jam'}, {zh:'雪克杯: 牛奶+奶油+糖+冰摇匀',en:'Shaker: Milk+Cream+Sugar+Ice -> Shake'}, {zh:'倒入杯中',en:'Pour to cup'}, {zh:'顶部倒100ml抹茶液',en:'Pour 100ml Matcha liquid'}],
            warm: []
        }
    },
    {
        id: 'ma2', name: {zh: '魔法抹茶 (Wizard of Matcha)', en: 'Wizard of Matcha'}, cat: 'Matcha', size: '500ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '无', en: 'None'},
        steps: {
            cold: [{zh:'机器出抹茶',en:'Dispense Matcha'}, {zh:'加冰摇匀',en:'Add ice & Shake'}, {zh:'倒入杯中',en:'Pour'}, {zh:'加咖啡液',en:'Add coffee'}, {zh:'顶部加抹茶奶盖',en:'Add Matcha foam'}],
            warm: []
        }
    },
    {
        id: 'ma3', name: {zh: '抹茶黑糖珍珠', en: 'Matcha Brown Sugar'}, cat: 'Matcha', size: '500ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '珍珠, 黑糖挂壁', en: 'Tapioca, Brown sugar wall'},
        steps: {
            cold: [{zh:'加珍珠, 黑糖挂壁',en:'Add tapioca, Smear brown sugar'}, {zh:'机器出抹茶',en:'Dispense Matcha'}, {zh:'加冰摇匀',en:'Add ice & Shake'}, {zh:'倒入杯中',en:'Pour'}, {zh:'顶部加抹茶液',en:'Add Matcha liquid'}],
            warm: []
        }
    },
     {
        id: 'cf1', name: {zh: '鲜果美式 (橙子/荔枝/茉莉)', en: 'Fruit Americano (Orange/Lychee/Jasmine)'}, cat: 'Coffee', size: '500ml', ice: 'Cold', sugar: '100%-0%',
        toppings: {zh: '橙片 (仅橙子美式)', en: 'Orange slice (Orange only)'},
        steps: {
            cold: [{zh:'加水果/小料',en:'Add fruit'}, {zh:'机器出茶',en:'Dispense tea'}, {zh:'加冰摇匀',en:'Add ice & Shake'}, {zh:'倒入杯中',en:'Pour'}, {zh:'顶部加咖啡液',en:'Add coffee liquid'}],
            warm: []
        }
    },
    {
        id: 'cf2', name: {zh: '抹茶/咖啡椰椰', en: 'Matcha/Coffee Coconut'}, cat: 'Coffee/Matcha', size: '500ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '无', en: 'None'},
        steps: {
            cold: [{zh:'机器出椰奶',en:'Dispense Coconut milk'}, {zh:'加冰摇匀',en:'Add ice & Shake'}, {zh:'倒入杯中',en:'Pour'}, {zh:'顶部加抹茶液或咖啡液',en:'Add Matcha/Coffee liquid'}],
            warm: []
        }
    },
// FIX: Corrected corrupted recipe data and closed array.
    {
        id: 'p1', name: {zh: '奶茶大满贯', en: 'Milk Tea Grand Slam'}, cat: 'Milk Tea', size: '700ml', ice: 'Standard', sugar: '100%-0%',
        toppings: {zh: '珍珠, 椰果, 茶冻', en: 'Tapioca, Coconut Jelly, Tea Jelly'},
        steps: {
            cold: [
                {zh:'加所有小料到杯中',en:'Add all toppings to cup'},
                {zh:'雪克杯接茶',en:'Dispense tea to shaker'},
                {zh:'加冰至600ml线摇匀',en:'Add ice to 600ml line and shake'},
                {zh:'倒入杯中封口',en:'Pour into cup and seal'}
            ],
            warm: []
        }
    }
];

// FIX: Added missing exports to resolve import errors in other files.
export const INITIAL_MENU_DATA: CustomerMenuItem[] = [];
export const INITIAL_WIKI_DATA: WikiItem[] = [];
export const INITIAL_ANNOUNCEMENT_DATA: AnnouncementData = {
    enabled: false,
    titleCN: '', titleEN: '', date: '',
    mainPromoCN: '', mainPromoEN: '',
    subPromoCN: '', subPromoEN: '',
    includedCN: '', includedEN: '',
    itemsCN: '', itemsEN: '',
    rulesCN: '', rulesEN: '',
    disclaimerCN: '', disclaimerEN: ''
};
export const INVENTORY_ITEMS: InventoryItem[] = [
  { id: 'milk', name: { zh: '牛奶', en: 'Milk' }, unit: 'L', defaultVal: '12', category: 'dairy' },
  { id: 'tapioca', name: { zh: '珍珠', en: 'Tapioca' }, unit: 'kg', defaultVal: '3', category: 'raw' },
  { id: 'jasmine_tea', name: { zh: '茉莉绿茶', en: 'Jasmine Tea' }, unit: 'g', defaultVal: '500', category: 'raw' },
  { id: 'cups_500', name: { zh: '500ml杯', en: '500ml Cups' }, unit: '个', defaultVal: '100', category: 'packaging' },
  { id: 'cups_700', name: { zh: '700ml杯', en: '700ml Cups' }, unit: '个', defaultVal: '100', category: 'packaging' },
];