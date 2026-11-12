'use strict';
/* ================= core: state, helpers, permissions, engines ================= */
const KEY='byd-as-pmo-v2';
// the organisation this PMO serves (passenger and commercial vehicles)
const ORG={zh:'欧美中东非售后服务中心',en:'Europe, Americas, Middle East & Africa After-sales Service Center'};
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let S=null;
const T=(zh,en)=>(S&&S.lang==='en')?en:zh;
const uid=()=>Math.random().toString(36).slice(2,9);

/* ---- dates (ISO yyyy-mm-dd, day math in UTC) ---- */
const isoLocal=d=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const realToday=()=>isoLocal(new Date());              // the greeting always shows the real date of the day you are signed in
const today=()=>S.simToday||realToday();
const dn=s=>Math.round(Date.parse(s.slice(0,10)+'T00:00:00Z')/864e5);
const diff=(a,b)=>dn(a)-dn(b);
const addDays=(s,n)=>new Date((dn(s)+n)*864e5).toISOString().slice(0,10);
const fd=s=>s?s.slice(0,10):'—';
const qOf=s=>Math.floor((+s.slice(5,7)-1)/3)+1;
const yr=s=>s?+s.slice(0,4):null;
const nowStamp=()=>today()+' '+new Date().toTimeString().slice(0,5);

/* ---- reference data ---- */
const ST={
  not_started:{zh:'未开始',en:'Not started'},
  active:{zh:'进行中',en:'In progress'},
  on_hold:{zh:'暂停/待定',en:'On hold'},
  to_report:{zh:'待结项汇报',en:'Awaiting close review'},
  closed:{zh:'已关闭',en:'Closed'},
  canceled:{zh:'已取消',en:'Canceled'}
};
const INFLIGHT=['not_started','active','on_hold','to_report'];
const FT={
  incubate:{zh:'孵化评估',en:'Incubation',d:['项目尚不成熟，孵化观察是否有必要转为项目','Not mature yet; incubate and decide whether it becomes a project']},
  postclose:{zh:'结项后监控',en:'Post-close monitoring',d:['项目结项后持续监控一段时间的数据','Track data for a period after a project closes']},
  monitor:{zh:'日常监控',en:'Routine monitoring',d:['需要解决但达不到立项要求，日常监控跟进','Needs follow-up but does not meet the bar for a project']}
};
const RISK_CAT={
  delivery:{zh:'交付逾期',en:'Overdue deliverable'},
  schedule:{zh:'进度滞后',en:'Behind schedule'},
  closure:{zh:'超期未结项',en:'Past due, not closed'},
  deadline:{zh:'临近截止',en:'Deadline close'},
  extension:{zh:'频繁延期',en:'Repeated extensions'},
  silence:{zh:'进度未更新',en:'No recent update'},
  resource:{zh:'资源风险',en:'Resourcing'},
  stalled:{zh:'长期暂停',en:'Stalled'},
  reported:{zh:'负责人上报',en:'Owner reported'}
};
const LV={high:{zh:'高',en:'High'},mid:{zh:'中',en:'Medium'},low:{zh:'低',en:'Low'}};
const RULES=[
  {k:'R1',zh:'节点分级提醒',en:'Milestone reminders',who:['负责人 + 执行人（三天前抄送部门经理，前一天再抄送 PMO）','Owner + executors (manager copied at 3 days, PMO as well at 1 day)'],d:['里程碑到期前一周提醒、前三天预警、前一天紧急提醒，一级比一级紧','One week before: heads-up. Three days before: warning. One day before: urgent, each stricter than the last']},
  {k:'DG',zh:'每周摘要',en:'Weekly digest',who:['每位用户','Everyone'],d:['每周第一个工作日汇总一封：未来 7 天到期的节点（一周 / 三天 / 一天三级）、双周更新、临近结项、待审批、待表决。开启后其余提醒不再单独发送，只有逾期和明天到期的节点会单独提醒。','One mail a week on the first working day: milestones due in 7 days (one week / three days / one day), two-week updates, projects ending, approvals and votes waiting. When on, the other reminders fold into it; only overdue and due-tomorrow milestones still get their own mail.']},
  {k:'R2',zh:'结项汇报提前提醒',en:'Close-report heads-up',who:['负责人（抄送 PMO）','Owner (cc PMO)'],d:['项目计划完成日前 N 天（默认 15 天），列出最后一个交付物，提醒准备项目汇报 / 结项申请','N days before project end: names the last deliverable and asks them to prepare the report']},
  {k:'R3',zh:'逾期通知 PMO',en:'Overdue → PMO',who:['PMO（抄送负责人）','PMO (cc owner)'],d:['到期后仍未提交，通知 PMO 并生成「延期评估」待办','After the due date with nothing submitted: notify PMO and create an extension-review task']},
  {k:'R4',zh:'逾期 7 天升级',en:'7-day escalation',who:['负责人 + 部门经理（抄送 PMO）','Owner + manager (cc PMO)'],d:['逾期满 7 天仍未提交，升级提醒并标记为高风险','7 days overdue: escalate and flag high risk']},
  {k:'R5',zh:'超期未结项',en:'Past end date',who:['PMO','PMO'],d:['计划完成日已过且无结项 / 延期申请，生成 PMO 待办','End date passed with no close/extension request: task for PMO']},
  {k:'R6',zh:'双周进展提醒',en:'Bi-weekly update reminder',who:['负责人（抄送部门经理）','Owner (cc manager)'],d:['项目会前一周的周五提醒一次，会议周的周一、周二（截止日）再各提醒一次；已提交的不再提醒。中英文会议隔周轮换','A reminder on the Friday before the meeting week, then again on Monday and Tuesday (the due day) of the meeting week; skipped once the update is posted. English and Chinese meetings alternate weekly.']},
  {k:'R7',zh:'审批超 3 天未处理',en:'Approval waiting 3+ days',who:['PMO','PMO'],d:['待审批申请超过 3 天，提醒 PMO','Remind PMO about requests waiting more than 3 days']},
  {k:'R8',zh:'ALSA 审批催办',en:'ALSA vote reminder',who:['未投票的 ALSA 成员','ALSA members yet to vote'],d:['ALSA 项目发起审批 3 天后仍未表决，提醒该成员','Remind members who have not voted 3 days after PMO sends the project']}
];
const SECTIONS=['售后商务科','渠道管理','运营管理','平台支持'];
const SEC_EN={售后商务科:'After-sales Business',渠道管理:'Channel Mgmt',运营管理:'Operations Mgmt',平台支持:'Platform Support'};
const ALSA_LV={S:{zh:'S 级 · 战略',en:'S · Strategic'},A:{zh:'A 级 · 重点',en:'A · Key'},B:{zh:'B 级 · 推进',en:'B · Enabler'}};

// job title (zh / en) of each country's head
const CAM='国家售后经理 / Country Aftersales Manager';
const CAM_IDS=['maurizio','daglef','mariusz','clara','jesus','enea','charlie'];
const USERS0=[
  ['pmo','Aiden','pmo',[],'zh','PMO Lead'],
  ['anna','Anna Marchi','mgr',['CCR'],'en'],
  ['cokey','黄浩 Cokey','mgr',['TRN','PBS'],'zh'],
  ['maurizio','Maurizio Pisano','mgr',['UKR'],'en',CAM],
  ['daglef','Daglef Seeck','mgr',['GER'],'en',CAM,1],
  ['brent','黄明辉 Brent','mgr',['BNL','NBA','CHE','AUT','SEI'],'zh',0,1,'C',['SEN|渠道管理']],
  ['mariusz','Mariusz Kiljańczyk','mgr',['POL','CEE'],'en',CAM,1],
  ['clara','王睿 Clara Wang','mgr',['FRA'],'zh',CAM,1],
  ['jesus','Jesús Javier Pérez Blanco','mgr',['IBR'],'en',CAM,1],
  ['enea','Enea Costa','mgr',['ITA'],'en',CAM,1],
  ['charlie','陈彦 Charlie','mgr',['CAT'],'zh',CAM],
  ['cassie','易鑫 Cassie','mgr',['UOP'],'zh',0,1],
  ['chen','杨琛 Chen','mgr',['CVS'],'zh'],
  ['alex','赵栋 Alex','mgr',['TEC'],'zh',0,1],
  ['lucas','张振禄 Lucas','mgr',['PLS'],'zh'],
  ['hailin','陈海林 Hailin','mgr',['SEN'],'zh',0,1],
  ['blair','段梦醒 Blair','mgr',['SEN'],'zh'],
  ['zuo','左子航 Toby','viewer',[],'zh','ALSA Execution',1,'C'],
  ['sharon','宋晓晓 Sharon','viewer',[],'zh','ALSA Secretariat'],
  ['alfredo','Alfredo Altavilla','viewer',[],'en','ALSA Steering',1]
];
// The people list: the latest staff list with roles (name, system role, teams, language, ALSA role, sees all risks).
// Real e-mail addresses are NOT part of the demo; every address below is generated. 'teams' may carry sections as TEAM|section.
const ROSTER=[
  ["葛南宏","member","UKR","zh","",0],
  ["MirNaghi Arabi","mgr","TRN","en","",0],
  ["Jesús Javier Pérez Blanco","mgr","IBR","en","steer",0],
  ["吾尔肯·努尔波森","viewer","CAT","zh","",0],
  ["李赓","viewer","CVS","zh","",0],
  ["邱鸿烨","viewer","UKR","zh","",0],
  ["曾剑波","viewer","TEC","zh","",0],
  ["蔡诗滢","viewer","TEC","zh","",0],
  ["田慧婷","viewer","TEC","zh","",0],
  ["刘一杰","viewer","UKR","zh","",0],
  ["杜文研","viewer","SEN|售后商务科","zh","",0],
  ["高佳雨","viewer","TEC","zh","",0],
  ["熊卓","pmo","","zh","pmo",1],
  ["廖蕴怡","viewer","SEN|运营管理","zh","",0],
  ["孙达奇","viewer","TEC","zh","",0],
  ["宋晓晓","member","PBS","zh","sec",0],
  ["黄晓文","viewer","TEC","zh","",0],
  ["陈米蕾","viewer","TEC","zh","",0],
  ["Liwei Zou","member","ITA","zh","",0],
  ["王敬雯","viewer","CVS","zh","",0],
  ["郭宗毅","viewer","CVS","zh","",0],
  ["宋迪","viewer","CVS","zh","",0],
  ["Чернышов Иван Юрьевич","viewer","CAT","en","",0],
  ["张涵悦","viewer","CVS","zh","",0],
  ["Jani Petteri Laine","viewer","CVS","en","",0],
  ["Errol Robinson","viewer","CVS","en","",0],
  ["蔡湜","viewer","CVS","zh","",0],
  ["胡帅","viewer","POL","zh","",0],
  ["Maurizio Pisano","mgr","UKR","en","",0],
  ["Kayahan Kaya","viewer","CVS","en","",0],
  ["Gurdeep Sapal","viewer","CVS","en","",0],
  ["Fabrizio Franzese","viewer","CVS","en","",0],
  ["许沛励","viewer","FRA","zh","",0],
  ["Bradley Fuller","viewer","UKR","en","",0],
  ["易文杰","viewer","POL","zh","",0],
  ["Tomas Jallen","viewer","CVS","en","",0],
  ["许鹏杰","viewer","TEC","zh","",0],
  ["Kristian Vonk","viewer","BNL","en","",0],
  ["Ermanno D'Ermo","viewer","CVS","en","",0],
  ["Enea Costa","mgr","ITA","en","steer",0],
  ["Sebastian Meinken","viewer","GER","en","",0],
  ["Sadeq Ahmed Ahmed Saeed","viewer","CVS","en","",0],
  ["Neda Asghari","viewer","UKR","en","",0],
  ["Matheus Motta Campos","viewer","TEC","en","",0],
  ["Nurmatov Ulugbek","viewer","CAT","en","",0],
  ["Mariusz Kiljańczyk","mgr","POL,CEE","en","steer",0],
  ["林利蓝","viewer","SEN|售后商务科","zh","",0],
  ["余寒凝","viewer","BNL","zh","",0],
  ["曾添","viewer","PLS","zh","",0],
  ["Abdullayev Abdulloh","viewer","CAT","en","",0],
  ["SULAYMONOV ELBEK","viewer","CAT","en","",0],
  ["陈倬婧","viewer","PLS","zh","",0],
  ["Abdurakhimov Akmal","viewer","CAT","en","",0],
  ["Daniel Valverde","viewer","CVS","en","",0],
  ["Markus Anglé","viewer","NBA","en","",0],
  ["TIM BRÜCKNER","viewer","GER","en","",0],
  ["Mattia Barbiero","viewer","ITA","en","",0],
  ["Ahmed Said","viewer","CVS","en","",0],
  ["王溢","viewer","SEN|渠道管理","zh","",0],
  ["Richard Asamoah","viewer","ITA","en","",0],
  ["Rubén Adán","viewer","IBR","en","",0],
  ["João Pedro Marques Ribeiro","viewer","CCR","en","",0],
  ["Jaime Cervera de Arcos","viewer","IBR","en","",0],
  ["徐吉米","viewer","CEE","zh","",0],
  ["陈熹","viewer","FRA","zh","",0],
  ["Davide Biella","viewer","ITA","en","",0],
  ["Kuenyuen Lee","member","NBA","en","",0],
  ["黄精思","viewer","SEN|平台支持","zh","",0],
  ["靳日朝","viewer","SEN|平台支持","zh","",0],
  ["Ustinov Aleksey Vladimirovich","viewer","CAT","en","",0],
  ["Rafael Núñez","viewer","IBR","en","",0],
  ["关子莹","viewer","CVS","zh","",0],
  ["Mannopov Azamat Mutal ugli","viewer","CAT","en","",0],
  ["Miguel Piñeiro","viewer","IBR","en","",0],
  ["王睿","mgr","FRA","zh","steer",0],
  ["顾迈克","viewer","CEE","zh","",0],
  ["Radu-Marius Petrescu","viewer","SEI","en","",0],
  ["赫英男","viewer","TEC","zh","",0],
  ["汤灿","viewer","CAT","zh","",0],
  ["黄国雯","viewer","","zh","",0],
  ["郑川","viewer","SEN|售后商务科","zh","",0],
  ["秦子然","viewer","PBS","zh","",0],
  ["李怿嘉","viewer","TEC","zh","",0],
  ["杨栩","viewer","TEC","zh","",0],
  ["张雨婕","viewer","PBS","zh","",0],
  ["郭家宇","viewer","NBA","zh","",0],
  ["舒哲","viewer","GER","zh","",0],
  ["吴雨莲","viewer","POL","zh","",0],
  ["张珊珊","viewer","TEC","zh","",0],
  ["林中洁","viewer","CHE","zh","",0],
  ["卢丽娜","viewer","FRA","zh","",0],
  ["唐浩博","viewer","","zh","",0],
  ["林中虹","viewer","IBR","zh","",0],
  ["Daglef Seeck","mgr","GER","en","steer",0],
  ["Christian Bode","viewer","GER","en","",0],
  ["Zsombor Lubinszki","viewer","CVS","en","",0],
  ["Julio Gómez","viewer","IBR","en","",0],
  ["Antonio Vito Sabato","viewer","ITA","en","",0],
  ["Bartłomiej Ustaszewski","viewer","POL","en","",0],
  ["Owen Davidson","viewer","UKR","en","",0],
  ["Georgios Kouris","viewer","CCR","en","",0],
  ["Tamara Orbán","viewer","TRN","en","",0],
  ["Robert James Taylor","viewer","CVS","en","",0],
  ["潘雨婷","viewer","SEN|平台支持","zh","",0],
  ["Gergő Birkás","viewer","PLS","en","",0],
  ["Yaroslav Veretkovskyi","viewer","CVS","en","",0],
  ["Daniel Adam","viewer","PLS","en","",0],
  ["Gjorgji Sotirovski","viewer","CCR","en","",0],
  ["Matthias Lühr","viewer","CVS","en","",0],
  ["Christoph Stocker","viewer","GER","en","",0],
  ["Markus Schwenke","viewer","GER","en","",0],
  ["Antonio Magnatta","viewer","ITA","en","",0],
  ["Sunay Lyatif","viewer","CCR","en","",0],
  ["Anastasiia Kapai","viewer","CCR","en","",0],
  ["Sofia Kislova​","viewer","CCR","en","",0],
  ["Simon Dodson","viewer","UKR","en","",0],
  ["黄远珍","viewer","SEN|售后商务科","zh","",0],
  ["Elisa Nousiainen","viewer","NBA","en","",0],
  ["Joakim Järvi","viewer","NBA","en","",0],
  ["Sara Trincia","viewer","CCR","en","",0],
  ["Giacomo Ferraro","viewer","CCR","en","",0],
  ["Хayrullayev Xojiakbar Shukhratovic","viewer","CAT","en","",0],
  ["Georgij Usakov","viewer","CCR","en","",0],
  ["范芷汀","viewer","CVS","zh","",0],
  ["Dominique BARTHE-LAPEYRIGNE","viewer","FRA","en","",0],
  ["ATTILA LŐKÖS","viewer","TEC","en","",0],
  ["Baranyi Zsuzsanna","viewer","TRN","en","",0],
  ["Jonathan Galvez","viewer","NBA","en","",0],
  ["Áron Lőrincz","viewer","TEC","en","",0],
  ["José Luis Herrera Suárez","viewer","CCR","en","",0],
  ["Alberto González de la Rosa","viewer","CCR","en","",0],
  ["Mina Koorani","viewer","CVS","en","",0],
  ["Adam Patel","viewer","CVS","en","",0],
  ["Huangkun Chen","viewer","CVS","en","",0],
  ["邓菲","viewer","CCR","zh","",0],
  ["Polly Qiu","viewer","CVS","en","",0],
  ["Christian Affa","viewer","GER","en","",0],
  ["Gary Found","viewer","UKR","en","",0],
  ["Réka Vajda","viewer","CCR","en","",0],
  ["Md Sifat Adnan Khan","viewer","UKR","en","",0],
  ["Ugur POLAT","viewer","FRA","en","",0],
  ["Marek Raninec","mgr","CEE","en","",0],
  ["Shehana Mohafuz","viewer","CCR","en","",0],
  ["Matteo Ghezzi","viewer","ITA","en","",0],
  ["Francesco Soldano","viewer","CVS","en","",0],
  ["Chiril Colotenco","viewer","SEI","en","",0],
  ["吴楠","viewer","CVS","zh","",0],
  ["Anthony MORIN","viewer","FRA","en","",0],
  ["Stevanovic Stefan","viewer","CCR","en","",0],
  ["Richard Werner","viewer","PLS","en","",0],
  ["Abdufattakhov Abdulaziz Adkhamovich ugli","viewer","CAT","en","",0],
  ["姜鑫","viewer","NBA","zh","",0],
  ["Venishree Mayer","viewer","GER","en","",0],
  ["Mirzoxidov Doniyor Miranvar","viewer","CAT","en","",0],
  ["Boushra Hammoud","viewer","CCR","en","",0],
  ["Erzsébet Monostori","viewer","CCR","en","",0],
  ["Richard Chinellato","viewer","CCR","en","",0],
  ["Christian Engels","viewer","CCR","en","",0],
  ["Arianna Antonante","viewer","CCR","en","",0],
  ["郑苗苗","viewer","CHE","zh","",0],
  ["Sameer Ata","viewer","GER","en","",0],
  ["Karol Płoszyński","viewer","POL","en","",0],
  ["Aleksander Gołębiewski","viewer","POL","en","",0],
  ["Mario Gabriel Marte-Bruno","viewer","CCR","en","",0],
  ["Krisztián Kása","viewer","TEC","en","",0],
  ["Jowita Pieczulis","viewer","POL","en","",0],
  ["乔成新","viewer","GER","zh","",0],
  ["Josefine Lacour","viewer","CHE","en","",0],
  ["Paula Pulido Livingston","viewer","IBR","en","",0],
  ["Gustil Andrei","viewer","SEI","en","",0],
  ["Paola Docio Herrera","viewer","IBR","en","",0],
  ["Facundo Sanchez Carballo","viewer","CCR","en","",0],
  ["杨琦","viewer","TEC","zh","",0],
  ["李安稷","viewer","SEN|售后商务科","zh","",0],
  ["Alborz Asef","viewer","NBA","en","",0],
  ["Sergio Valdés Fernández","viewer","IBR","en","",0],
  ["Philipp Eigner","viewer","GER","en","",0],
  ["Poór Sándor","viewer","PLS","en","",0],
  ["Dany Peleman","viewer","CCR","en","",0],
  ["Gizella Pál","viewer","CCR","en","",0],
  ["Krizsanyik Evelin","viewer","TEC","en","",0],
  ["Jinhui Hu","viewer","CCR","en","",0],
  ["Theo Nanninga","viewer","CCR","en","",0],
  ["Dominik Kovács","viewer","CCR","en","",0],
  ["Mario Alexandru Mihai","viewer","CCR","en","",0],
  ["James Stephens","viewer","CCR","en","",0],
  ["Gellért Benkő","viewer","CCR","en","",0],
  ["王聪","viewer","IBR","zh","",0],
  ["Costin Radulescu","viewer","SEI","en","",0],
  ["Sorin Olaru","viewer","UKR","en","",0],
  ["Barraza Luciana Andrea","viewer","UOP","en","",0],
  ["黄斯齐","viewer","UKR","zh","",0],
  ["Matteo Mian","viewer","CCR","en","",0],
  ["Aleksei Mirkin","viewer","CCR","en","",0],
  ["牛鹤","viewer","SEN|平台支持","zh","",0],
  ["Claas Runge","viewer","CVS","en","",0],
  ["林佳懿","viewer","","zh","",0],
  ["Rashed Almawed","viewer","NBA","en","",0],
  ["Laura Serena Milani","viewer","ITA","en","",0],
  ["Pedro Miguel Lourenço Vieira","viewer","CCR","en","",0],
  ["Jennyfer Iziz Krista e Silva","viewer","CCR","en","",0],
  ["王丹","viewer","IBR","zh","",0],
  ["Vanessa Paige Kocsardy","viewer","CCR","en","",0],
  ["Gael Nexer","viewer","CCR","en","",0],
  ["Murat Taşkın","viewer","CAT","en","",0],
  ["Peter Andersson","mgr","NBA","en","",0],
  ["Robert Kenneth Leslie Mitchell","viewer","UKR","en","",0],
  ["Yuxuan Zhou","viewer","UKR","en","",0],
  ["Rubén Cumbrera","viewer","IBR","en","",0],
  ["Thomas MILAD","viewer","FRA","en","",0],
  ["Carlos García Pérez","viewer","SEN|平台支持","en","",0],
  ["Baidhir Juste Hidair","viewer","CCR","en","",0],
  ["Damir Domitran","viewer","SEI","en","",0],
  ["Idan Shamel","viewer","CCR","en","",0],
  ["Antonios Kouris","viewer","CCR","en","",0],
  ["Renato Mari","viewer","CCR","en","",0],
  ["Toni Bumbak","viewer","TEC","en","",0],
  ["Nacho Simeonov","viewer","BNL","en","",0],
  ["Peter Brouwer","viewer","CHE","en","",0],
  ["Marius Revhaug","mgr","NBA","en","",0],
  ["Adam Dumalski","viewer","POL","en","",0],
  ["Jose Francisco López","viewer","IBR","en","",0],
  ["Francisco Urrutia Villanueva","viewer","IBR","en","",0],
  ["Ilvars Udrovskis","viewer","TRN","en","",0],
  ["Malikov Jasurbek Kodirjon","viewer","CAT","en","",0],
  ["Fabrice HALLET","viewer","FRA","en","",0],
  ["王哲","viewer","UKR","zh","",0],
  ["Laurent DOLACINSKI","viewer","FRA","en","",0],
  ["Adam Darius Zloch","viewer","PLS","en","",0],
  ["Cosimo Ribezzo","viewer","CVS","en","",0],
  ["Yang Liu","viewer","NBA","en","",0],
  ["Shiqiang Sun","viewer","PLS","en","",0],
  ["陈冠名","viewer","CVS","zh","",0],
  ["Francisco Lafuente","viewer","CVS","en","",0],
  ["Marc Nogal","viewer","CVS","en","",0],
  ["Haomiao WANG","viewer","SEN|平台支持","en","",0],
  ["Henrique Almeida","viewer","CCR","en","",0],
  ["Christina Pieri","viewer","TRN","en","",0],
  ["Alejandra Pérez Avila","viewer","CCR","en","",0],
  ["Alessandro Ricci","viewer","ITA","en","",0],
  ["Paula Alvarado","viewer","UOP","en","",0],
  ["Damia SMIRES","viewer","FRA","en","",0],
  ["David Jonsson","viewer","NBA","en","",0],
  ["Maximilian Ruhland","viewer","GER","en","",0],
  ["Daniel Strohbichler","viewer","AUT","en","",0],
  ["Fuyu Luo","viewer","CVS","en","",0],
  ["Ahmet Celik","viewer","GER","en","",0],
  ["刘晨","viewer","CVS","zh","",0],
  ["Zofia Mańk","viewer","POL","en","",0],
  ["Roy Kern","viewer","GER","en","",0],
  ["Michael Curson","viewer","UKR","en","",0],
  ["Taxirov Akbar Aybek ugli","viewer","CAT","en","",0],
  ["Félipe Baquié","viewer","UOP","en","",0],
  ["Paul De-foe","viewer","UKR","en","",0],
  ["John Gillies","viewer","CVS","en","",0],
  ["Shreena Useree","viewer","GER","en","",0],
  ["Alexandru Florentin Stefan","viewer","SEI","en","",0],
  ["Nathan Butler","viewer","UKR","en","",0],
  ["Dongxuan Li","viewer","NBA","en","",0],
  ["Ishonboyeva Fotimaxon Akbarhuja qizi","viewer","CAT","en","",0],
  ["Gayimova Nazokat Qahramon qizi","viewer","CAT","en","",0],
  ["Robert Zahra","viewer","CCR","en","",0],
  ["Nermin Bradarić","viewer","SEI","en","",0],
  ["Elin Yan Zou","viewer","SEN|平台支持","en","",0],
  ["Feng Wang","viewer","SEN|平台支持","en","",0],
  ["Abdulrahman Abdullah Abdulaziz","viewer","CCR","en","",0],
  ["Rima Alloush","viewer","CCR","en","",0],
  ["André Berg","viewer","GER","en","",0],
  ["Pascal Pierre Ledoux","viewer","CHE","en","",0],
  ["Brendan Osei-Antwi","viewer","UOP","en","",0],
  ["Vivek Mishra","viewer","SEN|平台支持","en","",0],
  ["刘行","viewer","CVS","zh","",0],
  ["羅發諭","viewer","CVS","zh","",0],
  ["Brückner Dániel","viewer","UOP","en","",0],
  ["Razvan Marian Sonea","viewer","SEI","en","",0],
  ["王磊","viewer","GER","zh","",0],
  ["Murat Demir","viewer","GER","en","",0],
  ["Paolo Liistro","viewer","CHE","en","",0],
  ["Nicolas Herault","viewer","CCR","en","",0],
  ["Adrian Olid Marcos","viewer","IBR","en","",0],
  ["Luca Pistoni","viewer","ITA","en","",0],
  ["郭翔","viewer","GER","zh","",0],
  ["Carter Hale","viewer","UKR","en","",0],
  ["Vijayanthiy Jasotharan","viewer","NBA","en","",0],
  ["Mario Bischoff","viewer","GER","en","",0],
  ["白洪铭","viewer","UOP","zh","",0],
  ["Juliana Jordan","viewer","UOP","en","",0],
  ["Amanda Mariel Salazar Parra","viewer","CCR","en","",0],
  ["Xuan Zhou","viewer","SEN|售后商务科","en","",0],
  ["Minzhou Shi","viewer","SEN|售后商务科","en","",0],
  ["Jan Rudolf","viewer","CEE","en","",0],
  ["Nick Vervloet","viewer","TRN","en","",0],
  ["Normatova Diyora Davron qizi","viewer","CAT","en","",0],
  ["高佳屹","viewer","CVS","zh","",0],
  ["Monika Liepuoniute","viewer","NBA","en","",0],
  ["Florian Eisinger","viewer","GER","en","",0],
  ["Xiang Jin","viewer","BNL","en","",0],
  ["Tim Ruijgh","viewer","BNL","en","",0],
  ["Peter Nemeth","viewer","CEE","en","",0],
  ["胡瑜棚","viewer","CVS","zh","",0],
  ["Patrick Protze","viewer","GER","en","",0],
  ["Konrad Halla","viewer","POL","en","",0],
  ["Hegedüs Endre","viewer","TEC","en","",0],
  ["Jan Pärssinen","viewer","TEC","en","",0],
  ["Omar Trabelsi","viewer","TEC","en","",0],
  ["Anna Manetti","viewer","CCR","en","",0],
  ["Asmaa Khairy Abdelkader Ibrahim Bakhaty","viewer","CCR","en","",0],
  ["Peter Öster","viewer","NBA","en","",0],
  ["Ashley Harry","viewer","CVS","en","",0],
  ["Zia-Ul-Haq Tahir","viewer","UKR","en","",0],
  ["Robert Griga","viewer","CVS","en","",0],
  ["Meryem Chemlal","viewer","BNL","en","",0],
  ["Sheraz Shaikh","viewer","CVS","en","",0],
  ["刘丽莉","viewer","CVS","zh","",0],
  ["Tamás Sihai","viewer","TEC","en","",0],
  ["Jon-Anders Prestegård","viewer","NBA","en","",0],
  ["Miriam Kaatz","viewer","GER","en","",0],
  ["Jani Tamminen","viewer","NBA","en","",0],
  ["Daniel Papp","viewer","NBA","en","",0],
  ["Tommy Kjærland","viewer","NBA","en","",0],
  ["Enka Lamaj","viewer","SEN|平台支持","en","",0],
  ["Leon Vargas Ivan Salvador","viewer","CCR","en","",0],
  ["Atina Angelina Schnedl","viewer","CCR","en","",0],
  ["Uros Dzodan","viewer","TEC","en","",0],
  ["Keke Zhu","pmo","","zh","pmo",1],
  ["Alessandro Ottaviani","viewer","CCR","en","",0],
  ["Nikolas Rogowski","viewer","CCR","en","",0],
  ["Jegor Jegorov","viewer","CEE","en","",0],
  ["Michael Löw","viewer","CVS","en","",0],
  ["Shady Gaafar","viewer","BNL","en","",0],
  ["Maik Petrovic","viewer","GER","en","",0],
  ["Tobias Kümmel","viewer","GER","en","",0],
  ["Leah Suttner","viewer","GER","en","",0],
  ["Niklas Edelhäußer","viewer","GER","en","",0],
  ["Eda Akdut-Orhan","viewer","GER","en","",0],
  ["Klaudia Morarz","viewer","TRN","en","",0],
  ["Olav Flaten","viewer","NBA","en","",0],
  ["Jonathan MEURIC","viewer","FRA","en","",0],
  ["Alban Hajdini","viewer","NBA","en","",0],
  ["Sylwia de Oliveira Silva Szteliga","viewer","POL","en","",0],
  ["Ze Chen","viewer","SEN|平台支持","en","",0],
  ["Hárskuti Panna Blanka","viewer","TRN","en","",0],
  ["黄明辉","mgr","BNL,NBA,CHE,AUT,SEI,SEN|渠道管理","zh","exec",1],
  ["田海辉","viewer","CVS","zh","",0],
  ["李扩","viewer","CAT","zh","",0],
  ["刘婷","viewer","SEN","zh","",0],
  ["黄浩","mgr","","zh","exec",1],
  ["陈振廷","viewer","CVS","zh","",0],
  ["林飞燕","viewer","CVS","zh","",0],
  ["陈彦","mgr","CAT","zh","",0],
  ["李壮","viewer","CAT","zh","",0],
  ["张天逸","viewer","SEN|平台支持","zh","",0],
  ["Strani Stefano","viewer","CVS","en","",0],
  ["黄俏华","viewer","SEN","zh","",0],
  ["殷昌蕾","viewer","CAT","zh","",0],
  ["魏鸿艳","viewer","PBS","zh","",0],
  ["马浪潮","viewer","CVS","zh","",0],
  ["杨琛","mgr","CVS","zh","",0],
  ["段梦醒","mgr","SEN","zh","",0],
  ["熊明然","viewer","CVS","zh","",0],
  ["赵巍","viewer","CVS","zh","",0],
  ["Ahmed Hussien","viewer","CVS","en","",0],
  ["David Bernard","viewer","CVS","en","",0],
  ["Rhyce Tokeley","viewer","CVS","en","",0],
  ["Nicolas Maire","viewer","CVS","en","",0],
  ["Peter Martin Odilia Rijs","viewer","CVS","en","",0],
  ["Daniel Perez","viewer","CVS","en","",0],
  ["Pedro Hornero Gómez","viewer","CVS","en","",0],
  ["Adamkó Dániel","viewer","CVS","en","",0],
  ["赵之铁","viewer","CVS","zh","",0],
  ["Jasurbek Muminov","viewer","CAT","en","",0],
  ["Paul Dixon","viewer","CVS","en","",0],
  ["Orhan Sylhasi","viewer","CVS","en","",0],
  ["Sandhya Raghavan","viewer","CVS","en","",0],
  ["Hanif Jivani","viewer","UKR","en","",0],
  ["Matteo Di Cosmo","viewer","CVS","en","",0],
  ["朱泓源","viewer","TEC","zh","",0],
  ["周树华","viewer","CVS","zh","",0],
  ["张丁莲","viewer","PLS","zh","",0],
  ["才昊冉","viewer","TEC","zh","",0],
  ["李辰鸣","viewer","TEC","zh","",0],
  ["罗杰斯","viewer","CAT","zh","",0],
  ["常溪梦","viewer","SEN","zh","",0],
  ["薛敏","viewer","CVS","zh","",0],
  ["甄镒帆","viewer","SEN|渠道管理","zh","",0],
  ["滕越","viewer","CVS","zh","",0],
  ["王琦","viewer","CVS","zh","",0],
  ["莫平凡","viewer","CVS","zh","",0],
  ["张锋云","viewer","CVS","zh","",0],
  ["徐腾","viewer","CEE","zh","",0],
  ["陶巍","viewer","CVS","zh","",0],
  ["姚子豪","viewer","TEC","zh","",0],
  ["赵树文","viewer","TEC","zh","",0],
  ["孙继楠","viewer","CVS","zh","",0],
  ["黄瑞源","viewer","TEC","zh","",0],
  ["黄钊桐","viewer","CVS","zh","",0],
  ["孙振恒","viewer","CVS","zh","",0],
  ["郭明豪","viewer","CVS","zh","",0],
  ["黄嘉应","viewer","TEC","zh","",0],
  ["马百德","viewer","SEN|平台支持","zh","",0],
  ["龙丽竹","viewer","SEN|平台支持","zh","",0],
  ["王娟","viewer","SEN","zh","",0],
  ["叶紫薇","viewer","SEN|运营管理","zh","",0],
  ["赵伟","viewer","UOP","zh","",0],
  ["丁帅","viewer","PBS","zh","",0],
  ["陈屹","viewer","UOP","zh","",0],
  ["汤睿","viewer","SEN|渠道管理","zh","",0],
  ["金辉","viewer","TEC","zh","",0],
  ["潘婷","viewer","UOP","zh","",0],
  ["赵学明","viewer","TEC","zh","",0],
  ["姜丹","viewer","","zh","",0],
  ["庞明慧","viewer","CVS","zh","",0],
  ["章濠铄","viewer","CVS","zh","",0],
  ["陈金凤","viewer","SEN|售后商务科","zh","",0],
  ["张璐","viewer","TEC","zh","",0],
  ["张瑜","viewer","TEC","zh","",0],
  ["罗灵芝","viewer","UKR","zh","",0],
  ["石岚桦","viewer","CVS","zh","",0],
  ["倪康平","viewer","CVS","zh","",0],
  ["李仁航","viewer","","zh","",0],
  ["朱明飞","viewer","CAT","zh","",0],
  ["李静婷","viewer","SEN","zh","",0],
  ["黄玮峣","viewer","TEC","zh","",0],
  ["郑晓闯","viewer","CAT","zh","",0],
  ["王海军","viewer","TEC","zh","",0],
  ["周翔宇","viewer","CVS","zh","",0],
  ["Angelique van Leeuwen","viewer","PLS","en","",0],
  ["贾鹏","viewer","ITA","zh","",0],
  ["Simone Cosentino","viewer","CVS","en","",0],
  ["Jörg Lichte","viewer","CVS","en","",0],
  ["喻静蕾","viewer","BNL","zh","",0],
  ["Dany CARBONNELLE","viewer","CVS","en","",0],
  ["付博","viewer","CVS","zh","",0],
  ["David Metcalfe","viewer","CVS","en","",0],
  ["James Cummins","viewer","CVS","en","",0],
  ["Mark Gallifant","viewer","UKR","en","",0],
  ["Paul Folan","viewer","CVS","en","",0],
  ["Simon Knox","viewer","CVS","en","",0],
  ["Steven Knight","viewer","CVS","en","",0],
  ["Christopher Arthur","viewer","CVS","en","",0],
  ["Frank Moelands","viewer","CVS","en","",0],
  ["黄欣濛","viewer","CVS","zh","",0],
  ["Joao Pedro Sousa Guerra","viewer","CVS","en","",0],
  ["Andrea Paravani","viewer","CVS","en","",0],
  ["陈海林","mgr","SEN","zh","exec",0],
  ["Tong Yu Bao","viewer","IBR","en","",0],
  ["Cristina Colina Posada","viewer","IBR","en","",0],
  ["Michael Webb","viewer","CVS","en","",0],
  ["Aarón Nieto Cuesta","viewer","PLS","en","",0],
  ["Nayree Michelle Paula","viewer","PLS","en","",0],
  ["张志超","viewer","CVS","zh","",0],
  ["王佳玮","viewer","CVS","zh","",0],
  ["尹幸","viewer","CVS","zh","",0],
  ["Paul Gervais Ava","viewer","ITA","en","",0],
  ["Gulomov Shokhjakhon","viewer","CAT","en","",0],
  ["Willy HOUILLON","viewer","CVS","en","",0],
  ["Naadiah Younis","viewer","CVS","en","",0],
  ["Jaspreet Kaur Kapoor","viewer","CVS","en","",0],
  ["Paul McCorry","viewer","CVS","en","",0],
  ["Leroy McKenzie","viewer","CVS","en","",0],
  ["Mark Brady","viewer","CVS","en","",0],
  ["Spanky de Quack","viewer","CVS","en","",0],
  ["Aysu Öksüz","viewer","PLS","en","",0],
  ["马悦","viewer","PLS","zh","",0],
  ["ALIMARDONOV ELYOR","viewer","CAT","en","",0],
  ["Máté Márkus","viewer","CVS","en","",0],
  ["Ismail Alçiçek","viewer","PLS","en","",0],
  ["Jakub Karkusiewicz","viewer","CVS","en","",0],
  ["Jochen Bauer","viewer","CVS","en","",0],
  ["Nian Liu","viewer","CVS","en","",0],
  ["Ron Heijnen","viewer","PLS","en","",0],
  ["Janusz Król","viewer","CVS","en","",0],
  ["Sascha Gustav Schwarzfeld","viewer","CVS","en","",0],
  ["Hugo Jonatan Hidrobo Lopez","viewer","CVS","en","",0],
  ["Alex Bayón Sanchez","viewer","CVS","en","",0],
  ["Roberto Alviti","viewer","CVS","en","",0],
  ["Ben ZAHAF","viewer","FRA","en","",0],
  ["Per Aleby","viewer","CVS","en","",0],
  ["周子琪","viewer","CVS","zh","",0],
  ["王珂","viewer","BNL","zh","",0],
  ["王浩一","viewer","UKR","zh","",0],
  ["Laura Odile Larochelle","viewer","UKR","en","",0],
  ["殷平","viewer","CVS","zh","",0],
  ["易浩然","viewer","PLS","zh","",0],
  ["Nigel lino Lima","viewer","CVS","en","",0],
  ["Sharipov Akhrorbek","viewer","CAT","en","",0],
  ["Maciej Smierzchala","viewer","CVS","en","",0],
  ["吴雨瞳","viewer","SEN|平台支持","zh","",0],
  ["文君","viewer","FRA","zh","",0],
  ["杨跃彬","viewer","BNL","zh","",0],
  ["赵栋","mgr","TEC","zh","exec",0],
  ["邓杰","viewer","PLS","zh","",0],
  ["潘天翔","viewer","SEN|平台支持","zh","",0],
  ["张绩","viewer","","zh","",0],
  ["ALI FAHAD","viewer","TRN","en","",0],
  ["蔡俊","viewer","CVS","zh","",0],
  ["史宇","viewer","TEC","zh","",0],
  ["刘优宝","viewer","CVS","zh","",0],
  ["张琴","viewer","BNL","zh","",0],
  ["郑冰冰","viewer","IBR","zh","",0],
  ["林婷芳","viewer","UOP","zh","",0],
  ["李浩","viewer","CAT","zh","",0],
  ["霍文靖","viewer","CVS","zh","",0],
  ["冯辰昱","viewer","CVS","zh","",0],
  ["左子航","mgr","PBS","zh","exec",0],
  ["易鑫","mgr","UOP","zh","exec",0],
  ["乐比","viewer","CVS","zh","",0],
  ["刘澳强","viewer","CVS","zh","",0],
  ["张振禄 Lucas","mgr","PLS","zh","",0],
  ["Alfredo Altavilla","mgr","","en","advisor",0]
];
// people who already existed in the demo keep their id (projects, meetings and follow-ups refer to them)
const OLD_ID_BY_ROSTER={'熊卓':'pmo','黄浩':'cokey','Maurizio Pisano':'maurizio','Daglef Seeck':'daglef','黄明辉':'brent','Mariusz Kiljańczyk':'mariusz','王睿':'clara','Jesús Javier Pérez Blanco':'jesus','Enea Costa':'enea','陈彦':'charlie','易鑫':'cassie','杨琛':'chen','赵栋':'alex','张振禄 Lucas':'lucas','陈海林':'hailin','段梦醒':'blair','左子航':'zuo','宋晓晓':'sharon','Alfredo Altavilla':'alfredo','Keke Zhu':'keke'};
const ROSTER_IDS=ROSTER.map((x,i)=>OLD_ID_BY_ROSTER[x[0]]||'u'+String(i+1).padStart(3,'0'));
const rosterIds=k=>ROSTER.map((x,i)=>x[4]===k?ROSTER_IDS[i]:null).filter(Boolean);
// ALSA: fixed body, taken from the staff list. Only Steering + Execution vote on ALSA projects; the Secretariat is copied throughout.
// ('advisor' is no longer an ALSA role, so people marked advisor have no ALSA role here.)
const ALSA_ROLES=[
  {k:'steer',en:'Steering',ids:rosterIds('steer'),vote:true},
  {k:'exec',en:'Execution',ids:rosterIds('exec'),vote:true},
  {k:'pmo',en:'ALSA PMO',ids:rosterIds('pmo')},
  {k:'sec',en:'ALSA Secretariat',ids:rosterIds('sec')}];
const ALSA_IDS=ALSA_ROLES.filter(r=>r.vote).flatMap(r=>r.ids);
const alsaRoleOf=id=>ALSA_ROLES.find(r=>r.ids.includes(id));
const DEPARTED0=[{name:'陈惠强 Royce',at:'2026-10-08',note:'离职，账号已删除'},{name:'迟璕 Edmund',at:'2026-10-08',note:'离职，账号已删除'},{name:'Anna Marchi',at:'2026-11-12',note:'转岗，账号已停用'},{name:'朱泓源Janson',at:'2026-11-12',note:'离职，账号已删除'}];

function mkEmail(name){
  const lat=name.normalize('NFD').replace(/[̀-ͯ]/g,'').match(/[A-Za-z]+/g);
  return (lat?lat.join('.').toLowerCase():'user')+'@byd.example';
}

/* ---- people ---- */
function buildUsers(){
  const O=new Map(USERS0.map(x=>[x[0],x])),taken=new Set(),L=[],used=new Set();
  const unique=(name)=>{const lat=name.normalize('NFD').replace(/[̀-ͯ]/g,'').match(/[A-Za-z]+/g);let b=lat?lat.join('.').toLowerCase():'user',e=b+'@byd.example',n=1;while(taken.has(e)){n++;e=b+n+'@byd.example'}taken.add(e);return e};
  const row=(x,id)=>{const o=O.get(id),teams=String(x[2]||'').split(',').filter(Boolean);
    return {id,name:o?o[1]:x[0],role:x[1],teams:teams.filter(t=>!t.includes('|')),secs:teams.filter(t=>t.includes('|')),lang:x[3],alsa:x[4]==='steer'||x[4]==='exec',side:o&&o[7]||'',status:'active',title:o&&o[5]||(x[1]==='pmo'?'PMO':x[1]==='mgr'?'部门经理 / Department Manager':'员工 / Staff'),riskAll:!!x[5]}};
  const byId=new Map(ROSTER.map((x,i)=>[ROSTER_IDS[i],row(x,ROSTER_IDS[i])]));
  // people who were already in the demo first, in their old order (also the ones missing from the staff list), then the rest
  USERS0.forEach(([id,name,role,teams,lang,title,alsa,side,secs])=>{const u=byId.get(id)||{id,name,role,teams,secs:secs||[],lang,alsa:!!alsa,side:side||'',status:id==='anna'?'disabled':'active',title:title||(role==='pmo'?'PMO Lead':'部门经理 / Department Manager'),riskAll:false};
    u.email=id==='pmo'?'aiden@byd.example':mkEmail(u.name);taken.add(u.email);L.push(u);used.add(id)});
  ROSTER_IDS.forEach(id=>{if(used.has(id))return;const u=byId.get(id);u.email=unique(u.name);L.push(u);used.add(id)});
  return L;
}
function refreshFromSeed(){
  const sync=(list,seedList,pre,isFollow)=>seedList.forEach((sp,i)=>{
    if(sp.rf!=='2026-11-12')return;const id=pre+i;let p=list.find(x=>x.id===id)||list.find(x=>x.code===sp.code);
    if(!p){list.push({...sp,id,history:[{at:'2026-11-12',by:'系统',text:`由新进度表同步（页签 ${sp.sheet}${sp.oldNew?'，表内编号 '+sp.oldNew:''}）`}]});return}
    ['name','origStatus','status','pic','exec','end'].forEach(k=>{p[k]=Array.isArray(sp[k])?[...sp[k]]:sp[k]});
    if(sp.closedAt)p.closedAt=sp.closedAt;else delete p.closedAt;
    if(!isFollow&&sp.status==='closed')(p.milestones||[]).forEach(m=>{m.done=true});
    p.exts=[...new Set([...(p.exts||[]),...(sp.exts||[])])];
    const have=new Set((p.updates||[]).map(u=>String(u.text||'').replace(/\s+/g,' ').trim().slice(0,60)));
    (sp.updates||[]).forEach(u=>{const k=String(u.text||'').replace(/\s+/g,' ').trim().slice(0,60);if(!have.has(k)){(p.updates=p.updates||[]).push({...u});have.add(k)}});
    (p.history=p.history||[]).push({at:'2026-11-12',by:'系统',text:'按新进度表更新（状态、负责人、执行人、计划完成日、进展）'});
  });
  sync(S.projects,SEED.projects,'p',false);sync(S.follows,SEED.follows,'f',true);
}
// a saved demo from before: add the missing people and bring roles, teams and ALSA roles in line with the staff list
function mergeRoster(){
  const have=new Map(S.users.map(u=>[u.id,u]));
  buildUsers().forEach(n=>{const o=have.get(n.id);if(!o)S.users.push(n);else{o.role=n.role;o.teams=n.teams;o.secs=n.secs;o.lang=n.lang;o.alsa=n.alsa;o.riskAll=n.riskAll}});
}
/* ---- state ---- */
function initState(){
  const projects=SEED.projects.map((p,i)=>({...p,id:'p'+i,history:[p.nw?{at:'2026-11-12',by:T('系统','System'),text:`由新进度表同步（页签 ${p.sheet}${p.oldNew?'，表内编号 '+p.oldNew:''}）`}:{at:'2026-10-08',by:T('系统','System'),text:`由原进度表迁移（原编号 ${p.old||p.oldNew||'—'}，原页签 ${p.sheet}）`}]}));
  const follows=SEED.follows.map((f,i)=>({...f,id:'f'+i,history:[f.nw?{at:'2026-11-12',by:'系统',text:`由新进度表同步（页签 ${f.sheet}${f.oldNew?'，表内编号 '+f.oldNew:''}）`}:{at:'2026-10-08',by:'系统',text:`由原进度表迁移（原编号 ${f.old||'—'}，原页签 ${f.sheet}）`}]}));
  const users=buildUsers();
  const s={v:2,lang:'zh',user:'pmo',teamView:null,view:'dashboard',simToday:null,teams:SEED.teams,users,projects,follows,
    requests:[],mails:[],todos:[],issues:[],acks:{},sent:{},rules:Object.fromEntries(RULES.map(r=>[r.k,true])),lead:15,drawer:null,filters:{},bg:'hero-forest',theme:'light',
    departed:DEPARTED0.map(d=>({...d})),acctReqs:[],alsa:[],meetings:[],
    cadence:{anchor:'2026-10-19',first:'en',dow:3,start:'2026-10-21'},tracks:initTracks(users),patches:['p3','p4','p5','p6','p7','p9','p10','p11','p12','p13','p14','p15','p16','p17','p24','p25','p26','p27']};
  S=s; staleClose(); seedDemo(); tpSeed(); resSeed(); aboutSeed(); if(typeof pinKeys==='function')pinKeys(); return s;
}
// Bi-weekly project meetings alternate by language: one week English, next week Chinese.
// Each team reports at the meeting of its manager's language (PMO can change per team).
// regional teams report at the English meeting, back-office teams at the Chinese meeting
function initTracks(){const o={};SEED.teams.forEach(t=>{o[t.code]=t.group==='R'?'en':'zh'});o.CCR='en';o.TRN='en';return o}
// v2 browsers keep their data; bring roster, ALSA members and cadence up to date once
function patchState(){
  S.patches=S.patches||[];
  if(!S.patches.includes('p3')){
    S.users=S.users.filter(u=>u.id!=='edmund');
    if(!S.users.some(u=>u.id==='zuo')) S.users.push({id:'zuo',name:'左子航',role:'viewer',teams:[],lang:'zh',alsa:true,side:'C',status:'active',title:'中台 · ALSA 成员',email:mkEmail('左子航')});
    S.users.forEach(u=>{u.alsa=ALSA_IDS.includes(u.id);if(u.id==='brent')u.side='C'});
    DEPARTED0.forEach(d=>{if(!S.departed.some(x=>x.name===d.name))S.departed.push({...d})});
    S.cadence=S.cadence||{anchor:'2026-10-05',first:'zh',dow:3};
    S.tracks=S.tracks||initTracks(S.users.concat([{role:'mgr',teams:['SEI'],lang:'zh'}]));
    if(S.view==='alsa'||S.view==='biweekly')S.view='dashboard';
    S.patches.push('p3');
  }
  if(!S.patches.includes('p4')){
    const z=S.users.find(u=>u.id==='zuo');if(z){z.name='左子航 Toby';z.title='ALSA Execution';z.email=mkEmail('Toby')}
    if(!S.users.some(u=>u.id==='sharon'))S.users.push({id:'sharon',name:'Sharon',role:'viewer',teams:[],lang:'zh',alsa:false,side:'',status:'active',title:'ALSA Secretariat',email:mkEmail('Sharon')});
    S.users.forEach(u=>{u.alsa=ALSA_IDS.includes(u.id)});S.patches.push('p4');
  }
  if(!S.patches.includes('p9')){S.tracks=initTracks();const b=S.users.find(u=>u.id==='brent');if(b&&!b.teams.includes('SEI'))b.teams.push('SEI');S.patches.push('p9')}
  if(!S.patches.includes('p10')){const b=S.users.find(u=>u.id==='brent');if(b&&!(b.secs||[]).includes('SEN|渠道管理'))b.secs=[...(b.secs||[]),'SEN|渠道管理'];S.patches.push('p10')}
  // p11: organisation renamed; bring already generated reminder mails in line
  if(!S.patches.includes('p11')){const fx=t=>String(t??'').split('售后项目管理中心 · 自动提醒').join(ORG.zh+' · 售后项目管理中心 · 自动提醒').split('After-sales PMO · automatic reminder').join(ORG.en+' · PMO · automatic reminder').split('[账号已开通] 售后项目管理中心').join('[账号已开通] '+ORG.zh+' · 售后项目管理中心').split('[Account activated] After-sales PMO').join('[Account activated] '+ORG.en+' · PMO');(S.mails||[]).forEach(m=>{m.body=fx(m.body);m.subject=fx(m.subject)});S.patches.push('p11')}
  // p12: the first import kept only the latest 3 updates per project; bring in the full tracker history
  if(!S.patches.includes('p12')){const lang=S.lang==='en'?'en':'zh',tr=typeof TR==='undefined'?{}:TR;
    const by=new Map([...SEED.projects,...SEED.follows].map(x=>[x.code,x]));
    for(const x of [...S.projects,...S.follows]){const sx=by.get(x.code);if(!sx)continue;x.updates=x.updates||[];
      sx.updates.forEach((u,i)=>{const k=TRK(x.code,'u',i),t=tr[k],vs=[u.text,t&&t.zh,t&&t.en,t&&t.o].filter(Boolean).map(v=>String(v).trim());
        if(x.updates.some(o=>o._k===k||(!o.meet&&o.date===u.date&&vs.includes(String(o.text??'').trim()))))return;
        x.updates.push({...u,text:(t&&t[lang])||u.text,_k:k})})}
    S.patches.push('p12')}
  // p13: legacy projects with no progress for over a year are treated as closed (needs the full history from p12)
  if(!S.patches.includes('p13')){staleClose();S.patches.push('p13')}
  // p14: country heads carry the title Country Aftersales Manager
  // p16: team regrouping. Customer Care + Training Management move to back-office; Poland splits from CEE;
  // Switzerland and Austria split from SWA. Project codes never change, only the team they belong to.
  if(!S.patches.includes('p16')){
    const T0=SEED.teams;S.teams=T0.map(t=>({...(S.teams.find(x=>x.code===t.code)||{}),...t}));
    const POL=new Set(['EAS-2025-POL-001','EAS-2025-POL-002','EAS-2025-POL-003','EAS-2025-POL-004','EAS-2025-CEE-003','EAS-2026-CEE-001']);
    [...S.projects,...S.follows,...(S.alsa||[]),...S.requests.map(r=>r)].forEach(x=>{if(!x)return;if(x.team==='SWA')x.team=x.code&&/Austria/i.test(x.name||'')?'AUT':'CHE';if(x.team==='CEE'&&POL.has(x.code))x.team='POL';if(x.data&&x.data.team==='SWA')x.data.team='CHE'});
    [...(S.alsa||[]),...S.projects].forEach(x=>{if(Array.isArray(x.pilots)&&x.pilots.includes('SWA'))x.pilots=[...new Set(x.pilots.flatMap(c=>c==='SWA'?['CHE','AUT']:[c]))]});
    S.users.forEach(u=>{if(u.teams.includes('SWA'))u.teams=[...new Set(u.teams.flatMap(c=>c==='SWA'?['CHE','AUT']:[c]))];if(u.id==='mariusz'&&!u.teams.includes('POL'))u.teams=['POL',...u.teams]});
    S.acctReqs&&S.acctReqs.forEach(r=>{if(r.team==='SWA')r.team='CHE'});
    S.tracks=S.tracks||{};const sw=S.tracks.SWA||'en';S.tracks.CHE=S.tracks.CHE||sw;S.tracks.AUT=S.tracks.AUT||sw;S.tracks.POL=S.tracks.POL||S.tracks.CEE||'en';delete S.tracks.SWA;
    if(S.teamView==='SWA')S.teamView='CHE';
    S.patches.push('p16')}
  // p17: ALSA topics become requests approved and scheduled by the ALSA Secretariat (L1/L2, three-part details)
  if(!S.patches.includes('p17')){S.alsaTopics=[];S.filters&&(S.filters.tpForm=null);tpSeed();S.patches.push('p17')}
  // p15: ALSA topics & meetings (example: Enea's channel-upgrade idea)
  if(!S.patches.includes('p15')){S.alsaTopics=S.alsaTopics||[];tpSeed();S.patches.push('p15')}
  if(!S.patches.includes('p14')){S.users.forEach(u=>{if(CAM_IDS.includes(u.id))u.title=CAM;else if(u.title==='部门经理 / Manager')u.title='部门经理 / Department Manager'});S.patches.push('p14')}
  if(!S.patches.includes('p7')){if(!S.users.some(u=>u.id==='alfredo'))S.users.push({id:'alfredo',name:'Alfredo Altavilla',role:'viewer',teams:[],lang:'en',alsa:true,side:'',status:'active',title:'ALSA Steering',email:mkEmail('Alfredo Altavilla')});S.users.forEach(u=>{u.alsa=ALSA_IDS.includes(u.id)});S.patches.push('p7')}
  if(!S.patches.includes('p6')){S.cadence={anchor:'2026-10-19',first:'en',dow:3,start:'2026-10-21'};S.patches.push('p6')}
  if(!S.patches.includes('p5')){const sh=S.users.find(u=>u.id==='sharon');if(sh)sh.name='宋晓晓 Sharon';S.patches.push('p5')}
  // 2026-11-12 progress sheet: bring a saved demo in line (status, owner, executors, planned end, extensions, new progress, new projects); nothing is removed
  if(!S.patches.includes('p27')){if(typeof SEED!=='undefined')refreshFromSeed();S.patches.push('p27')}
  if(!S.patches.includes('p26')){DEPARTED0.forEach(d=>{if(!(S.departed=S.departed||[]).some(x=>x.name===d.name))S.departed.push({...d})});S.patches.push('p26')}
  if(!S.patches.includes('p25')){const a=S.users.find(u=>u.id==='anna');if(a)a.status='disabled';DEPARTED0.forEach(d=>{if(!(S.departed=S.departed||[]).some(x=>x.name===d.name))S.departed.push({...d})});S.patches.push('p25')}
  if(!S.patches.includes('p24')){mergeRoster();S.patches.push('p24')}
  if(!S.patches.includes('p23')){S.rules=S.rules||{};if(S.rules.DG===undefined)S.rules.DG=true;S.patches.push('p23')}
  if(!S.patches.includes('p22')){if(typeof SEED!=='undefined')S.projects.forEach(p=>{const m=/^p(\d+)$/.exec(p.id||''),sp=m&&SEED.projects[+m[1]];if(sp&&sp.prev&&(p.code===sp.prev||p.code===sp.code)){p.prev=sp.prev;p.code=sp.code}});S.patches.push('p22')}
  if(!S.patches.includes('p21')){S.alsaRes=(S.alsaRes||[]).filter(x=>!(x.type==='about'&&x.example));S.patches.push('p21')}
  if(!S.patches.includes('p19')){S.alsaRes=S.alsaRes||[];resSeed();S.patches.push('p19')}
  if(!S.patches.includes('p18')){const al=S.users.find(u=>u.id==='alfredo');if(al){al.alsa=true;al.title='ALSA Steering'}S.patches.push('p18')}
  if(!S.bg)S.bg='hero-forest';if(!S.theme)S.theme='light';
}
const LANGN=l=>l==='en'?T('英文项目会','English meeting'):T('中文项目会','Chinese meeting');
const trackOf=c=>(S.tracks&&S.tracks[c])||'zh';
const mondayOf=d=>addDays(d,-((new Date(dn(d)*864e5).getUTCDay()+6)%7));
// next meeting (date) of a language track on or after `from`
function meetFor(lang,from){
  const c=S.cadence,f=from||today();const k0=Math.floor(diff(mondayOf(f),c.anchor)/7);
  for(let k=k0;k<k0+60;k++){const l=(((k%2)+2)%2===0)?c.first:(c.first==='zh'?'en':'zh');if(l!==lang)continue;const m=addDays(c.anchor,k*7+(c.dow-1));if(diff(m,f)>=0&&(!c.start||m>=c.start))return m}
}
// reporting period for a meeting: the two weeks since the previous meeting of the same track
const periodOf=(lang,from)=>{const meet=meetFor(lang,from);return {lang,meet,from:addDays(meet,-13),to:addDays(meet,-1),due:addDays(meet,-1)}};
const wkN=d=>['日','一','二','三','四','五','六'][new Date(dn(d)*864e5).getUTCDay()];
const md=d=>d?`${+d.slice(5,7)}/${+d.slice(8,10)}`:'—';
const fdW=d=>S.lang==='en'?`${md(d)} ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(dn(d)*864e5).getUTCDay()]}`:`${md(d)}（周${wkN(d)}）`;
// the update that counts for this meeting: posted for that meeting, or dated inside its window
const updFor=(p,per)=>(p.updates||[]).filter(u=>u.meet?u.meet===per.meet:(/^\d{4}-\d\d-\d\d/.test(u.date||'')&&u.date>=per.from&&u.date<=per.meet)).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
const bwState=(p,per)=>{if(updFor(p,per))return 'done';const d=diff(per.due,today());return d<0?'late':d<=2?'soon':'open'};
const needsBW=p=>['active','not_started','to_report'].includes(p.status);
function seedDemo(){
  // A few example requests so the approval flow can be tried immediately (marked as examples)
  const t=today();
  const byCode=c=>S.projects.find(p=>p.code===c);
  const pick=(team,st)=>S.projects.find(p=>p.team===team&&p.status===st&&p.milestones.length>1)||S.projects.find(p=>p.team===team&&p.status===st);
  S.requests.push({id:uid(),type:'new',status:'pending',by:'daglef',at:addDays(t,-4)+' 09:12',team:'GER',example:true,data:{
    applicant:{name:'Daglef Seeck',email:mkEmail('Daglef Seeck'),dept:'GER'},
    name:'Germany Approved Bodyshop Network 2027',
    bg:{background:'Bodyshop capacity in Germany does not cover the expected 2027 repair volume in the south.',why:'Customers wait 4–6 weeks for body repairs in Bavaria and Baden-Württemberg.',benefit:'Reduce average repair lead time to under 10 working days; protect CSI.',process:'Bodyshop approval, parts pre-allocation, claim handling.',risk:'Loss of fleet customers and negative reviews due to downtime.'},
    pic:'Daglef Seeck',exec:['Christian Bode','姜鑫 Xin'],start:'2026-11-01',end:'2027-04-30',
    milestones:[{name:'Network gap analysis and target list of bodyshops',due:'2026-11-30',forms:['文字','文件']},{name:'Contract template and approval criteria signed off',due:'2027-01-15',forms:['文件','邮件']},{name:'First 12 bodyshops approved and trained',due:'2027-03-31',forms:['截图','文字']},{name:'Go-live report with lead-time KPI',due:'2027-04-30',forms:['文字','截图']}]}});
  const pc=pick('TEC','active');
  if(pc) S.requests.push({id:uid(),type:'change',status:'pending',by:'alex',at:addDays(t,-1)+' 16:40',team:'TEC',pid:pc.id,example:true,data:{types:['end'],before:{end:pc.end},after:{end:addDays(pc.end||t,31)},reason:'各国门店执行进度不一，最后 5% 门店需要逐店沟通，申请延期一个月。'}});
  const pz=pick('CVS','active');
  if(pz){const checks={},reasons={};pz.milestones.forEach((m,i)=>{checks[m.id]=i<pz.milestones.length-1;if(i===pz.milestones.length-1)reasons[m.id]='最后一项交付物转为日常运营，由区域持续跟进。'});
    S.requests.push({id:uid(),type:'close',status:'pending',by:'chen',at:t+' 10:05',team:'CVS',pid:pz.id,example:true,data:{checks,reasons,forceReason:'核心目标已完成，剩余事项不影响项目结项。',summary:'核心交付物已完成并在区域落地。',benefit:'流程标准化，区域执行一致。',leftover:'剩余一项转日常运营。',toFollow:true,followNote:'结项后监控 3 个月执行数据'}});}
  const hz=S.projects.find(p=>/Hertz/i.test(p.name)&&INFLIGHT.includes(p.status))||S.projects.find(p=>/Hertz/i.test(p.name));
  if(hz) S.issues.push({id:uid(),pid:hz.id,text:'Hertz fleet cars off the road 60–76 days; parts delays (windscreen 35 days, suspension 35 days).',owner:hz.pic||'Maurizio Pisano',due:addDays(t,14),sev:'high',status:'open',at:t,example:true});
  const bat=S.projects.find(p=>/Battery Repair Center/i.test(p.name));
  if(bat) S.issues.push({id:uid(),pid:bat.id,text:'三国电池维修中心共用同一执行团队（Alex / Janson / Siri），11–12 月节点集中，存在资源冲突。',owner:'赵栋 Alex',due:addDays(t,10),sev:'mid',status:'open',at:t,example:true});
}
// LOAD_ERR / SAVE_ERR feed the error banners at the top of every page
let LOAD_ERR=null,SAVE_ERR=null;
function load(){
  let raw=null;try{raw=localStorage.getItem(KEY)}catch(e){LOAD_ERR='storage'}
  if(raw){
    try{const s=JSON.parse(raw);if(!s||s.v!==2)throw new Error('version');S=s;patchState();if(typeof pinKeys==='function')pinKeys();return}
    catch(e){LOAD_ERR='corrupt';console.error(e);try{localStorage.setItem(KEY+'.bak',raw)}catch(_){}}
  }
  initState();
}
function save(){
  // a rule-closed project that PMO reopens is an ordinary project again (a later close is a real close)
  for(const p of S.projects||[])if(p.staleClosed&&p.status!=='closed'){p.staleReopened=p.staleClosed;delete p.staleClosed}
  try{localStorage.setItem(KEY,JSON.stringify(S));if(SAVE_ERR){SAVE_ERR=null;document.getElementById('saveErr')?.remove()}}
  catch(e){const first=!SAVE_ERR;SAVE_ERR=e&&e.name==='QuotaExceededError'?'quota':'blocked';if(first)toast(T('无法保存到本浏览器，刚才的修改在刷新后会丢失','Could not save in this browser; changes will be lost on reload'),'err')}
}
function resetAll(){navReset();hideCtx();hideModal();try{localStorage.removeItem(KEY)}catch(e){} initState(); runReminders(); save(); render(); toast(T('已恢复为初始演示数据','Demo data reset'));}

/* ---- people & permissions ---- */
const me=()=>S.users.find(u=>u.id===S.user)||S.users[0];
const isPMO=()=>me().role==='pmo';
const allTeams=()=>S.teams.map(t=>t.code);
// a manager can also hold one section of a shared department, e.g. Brent: Service Engineering · Channel Mgmt ("SEN|渠道管理")
const secKey=(t,s)=>`${t}|${s||''}`;
const myTeams=()=>{if(isPMO())return allTeams();if(me().role==='viewer')return [];const v=S.teamView;if(v&&v.includes('|'))return [];return v&&me().teams.includes(v)?[v]:me().teams};
const mySecs=()=>isPMO()||me().role==='viewer'?[]:S.teamView?(S.teamView.includes('|')?[S.teamView]:[]):(me().secs||[]);
const canTeam=c=>myTeams().includes(c);
const canSee=x=>!!x&&(canTeam(x.team)||mySecs().includes(secKey(x.team,x.section)));
// teams the current view touches (whole teams plus the teams of granted sections)
const scopeTeams=()=>[...new Set([...myTeams(),...mySecs().map(k=>k.split('|')[0])])];
const secsFor=t=>isPMO()||canTeam(t)?SECTIONS:mySecs().filter(k=>k.startsWith(t+'|')).map(k=>k.split('|')[1]);
const visP=()=>S.projects.filter(canSee);
// owner, executors, or the owner / executors of the linked project may post progress on a follow-up
const fParty=f=>{if(!f)return false;const n=norm(me().name),q=S.projects.find(p=>p.code===f.link);return norm(f.pic||'')===n||(f.exec||[]).some(x=>norm(x)===n)||!!q&&(norm(q.pic||'')===n||(q.exec||[]).some(x=>norm(x)===n))};
const canNewFollow=()=>isPMO()||(me().role!=='viewer'&&(me().role==='mgr'||S.projects.some(p=>norm(p.pic||'')===norm(me().name))));
const visF=()=>S.follows.filter(f=>canSee(f)||fParty(f));
const team=c=>S.teams.find(t=>t.code===c)||{code:c,zh:c,en:c,group:'C'};
const tName=c=>{const t=team(c);return S.lang==='en'?t.en:t.zh};
const secName=s=>s?(S.lang==='en'?(SEC_EN[s]||s):s):'';
const isDeparted=n=>!!n&&S.departed.some(d=>norm(d.name)===norm(n)||norm(n).includes(norm(d.name).replace(/[a-z]/g,''))&&norm(d.name).replace(/[a-z]/g,'').length>1);
const gName=g=>g==='R'?T('区域市场','Regions'):T('中台支持','Back-office');
const userName=id=>(S.users.find(u=>u.id===id)||{name:id}).name;
// a title stored as "中文 / English" shows in the page language
const jobT=u=>{const t=String(u&&u.title||'');const i=t.indexOf(' / ');return i>0?T(t.slice(0,i),t.slice(i+3)):t};
const mgrOf=c=>S.users.find(u=>u.role==='mgr'&&u.status!=='disabled'&&u.teams.includes(c));
const secMgr=k=>S.users.find(u=>u.role==='mgr'&&u.status!=='disabled'&&(u.secs||[]).includes(k));
const mgrOfKey=k=>k.includes('|')?secMgr(k):mgrOf(k);
// the manager who answers for a project: the section holder first, then the team manager
const mgrOfP=p=>(p.section&&secMgr(secKey(p.team,p.section)))||mgrOf(p.team);
const secLabel=k=>{const [t,s]=k.split('|');return T(`${tName(t)}（${secName(s)}）`,`${tName(t)} (${secName(s)})`)};
const alsaMembers=()=>S.users.filter(u=>ALSA_IDS.includes(u.id)&&u.status!=='disabled');
const alsaCc=(stage)=>['Aiden',...ALSA_ROLES.filter(r=>r.k==='sec').flatMap(r=>r.ids).map(userName)];
// ALSA Project Sponsor: someone outside ALSA who backs an ALSA project piloted in a market with no ALSA member.
// Named per project; does not vote; is emailed and can see that project (read only).
const MARKETS=()=>S.teams.filter(t=>t.group==='R'&&t.zh.includes('市场')).map(t=>t.code);
const alsaIn=c=>alsaMembers().filter(u=>u.teams.includes(c));
const spCands=()=>S.users.filter(u=>u.status!=='disabled'&&u.role!=='pmo'&&!alsaRoleOf(u.id));
const spKey=s=>norm(s.email||s.name);
const sponsorOf=x=>{const u=me();return !!x&&(x.sponsors||[]).some(s=>s.email&&u.email&&norm(s.email)===norm(u.email)||norm(s.name)===norm(u.name))};
// ALSA projects are pan-European: everyone on the ALSA roster can see all of them (read only), whatever their team
const canView=x=>!!x&&(isPMO()||!!alsaRoleOf(me().id)||!(x.alsa||x.votes));
const viewP=()=>S.projects.filter(canView),viewF=()=>S.follows.filter(canView);
const canClose=()=>isPMO()||me().role==='mgr';
const riskAll=()=>isPMO()||!!me().riskAll;
const riskP=()=>riskAll()?viewP():visP();
const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,'');
function emailOf(name){
  const n=norm(name); if(!n) return '';
  const u=S.users.find(u=>norm(u.name)===n||n.includes(norm(u.name))||norm(u.name).includes(n));
  return u?u.email:'';
}
function people(){
  const set=new Set();
  S.users.forEach(u=>set.add(u.name));
  S.projects.forEach(p=>{if(p.pic)set.add(p.pic);(p.exec||[]).forEach(e=>set.add(e))});
  return [...set].filter(Boolean).sort((a,b)=>a.localeCompare(b));
}
const initials=n=>{const l=String(n).match(/[A-Za-z]/g);const h=String(n).match(/[一-龥]/);const w=String(n).match(/[A-Za-z]+/g)||[];return h?h[0]:(w.length>1?(w[0][0]+w[1][0]).toUpperCase():(l?l[0].toUpperCase():'?'))};

/* ---- project metrics ---- */
function msState(m){
  if(m.done) return 'done';
  if(!m.due) return 'nodate';
  const d=diff(m.due,today());
  if(d<0) return 'overdue';
  if(d<=3) return 'soon';
  return 'upcoming';
}
const pct=p=>{const ms=p.milestones||[];return ms.length?Math.round(100*ms.filter(m=>m.done).length/ms.length):0};
const lastUpd=p=>{const u=(p.updates||[]).map(x=>x.date).filter(x=>/^\d{4}-/.test(x||'')).sort();return u.length?u[u.length-1]:null};
// PMO rule (2026-10-10): legacy projects nobody followed up — started over a year ago and no progress for over a year — are treated as closed:
// no two-week updates, no risk warnings or reminders. Applied once to the migrated tracker; PMO can reopen any of them in Edit.
const STALE_CUT='2025-10-10',STALE_AT='2026-10-10';
// only projects migrated from the tracker that nobody has touched since (a PMO edit, approval or deliverable leaves a history entry)
const touched=p=>(p.history||[]).some(h=>h.k!=='stale'&&!/^由原进度表迁移|^Migrated from the original tracker/.test(String(h.text||'')));
const isStale=p=>!!p.sheet&&INFLIGHT.includes(p.status)&&!p.alsa&&!touched(p)&&(p.start?p.start<=STALE_CUT:/^[A-Z]{3}-2[0-5]-/.test(p.prev||p.code))&&(lastUpd(p)||'')<=STALE_CUT;
const staleTxt=(d,lang)=>lang==='en'?`No progress for over a year; closed under the PMO rule for legacy projects (was: ${ST[d.from].en}; last update: ${d.last||'none'})`:`超过 1 年没有进展，按 PMO 老项目规则视为关闭（原状态：${ST[d.from].zh}；最后更新：${d.last||'无'}）`;
const isStaleClosed=p=>!!p.staleClosed&&p.status==='closed';
const staleVoidTxt=lang=>lang==='en'?'Project closed under the PMO rule for legacy projects; request voided (no progress for over a year)':'项目已按 PMO 老项目规则视为关闭，此申请自动作废（超过 1 年没有进展）';
function staleClose(){
  const lang=S.lang==='en'?'en':'zh',by=lang==='en'?'System':'系统';let n=0;
  for(const p of S.projects){if(!isStale(p))continue;const last=lastUpd(p);
    p.staleClosed={from:p.status,last,at:STALE_AT};p.status='closed';p.closedAt=STALE_AT;
    S.requests.filter(r=>r.pid===p.id&&r.status==='pending').forEach(r=>{r.status='rejected';r.decision={by:'pmo',at:STALE_AT,k:'stale',comment:staleVoidTxt(lang)}});
    (S.todos||[]).filter(t=>t.pid===p.id&&t.status==='open').forEach(t=>t.status='done');
    (S.issues||[]).filter(i=>i.pid===p.id&&i.status==='open').forEach(i=>{const alt=i.example&&S.projects.find(x=>x!==p&&x.name===p.name&&INFLIGHT.includes(x.status)&&!isStale(x));if(alt)i.pid=alt.id;else i.status='closed'});
    p.history.push({at:STALE_AT,by,k:'stale',d:{...p.staleClosed},text:staleTxt(p.staleClosed,lang)});n++}
  return n;
}
// Projects follow the data sheet's "new project name": EAS-YEAR-TEAM-NUMBER. The sheet spells a few teams differently, so those count as the same team.
const TEAM_ALIAS={GER:['DE'],NBA:['BNB'],CAT:['CAC'],SEI:['SEE']};
function nextCode(teamCode,yy,kind){ // kind: undefined=project, true/'F'=follow-up, 'A'=ALSA proposal, 'P'=ALSA project in the library
  if(kind==='P'){const year=String(2000+(parseInt(yy,10)||26));let max=0;
    S.projects.forEach(p=>{const m=/^EAS-(\d{4})-ALSA-(\d{3})$/.exec(p.code||'');if(m&&m[1]===year)max=Math.max(max,+m[2])});
    return `EAS-${year}-ALSA-${String(max+1).padStart(3,'0')}`}
  if(!kind){const year=String(2000+(parseInt(yy,10)||26)),names=[teamCode,...(TEAM_ALIAS[teamCode]||[])];let max=0;
    S.projects.forEach(p=>{const m=/^EAS-(\d{4})-([A-Z]+)-(\d{3})$/.exec(p.code||'');if(m&&m[1]===year&&names.includes(m[2]))max=Math.max(max,+m[3])});
    return `EAS-${year}-${teamCode}-${String(max+1).padStart(3,'0')}`}
  const k=kind===true?'F':kind||'';const pre=`${teamCode}-${yy}-`;let max=0;
  const pool=k==='F'?S.follows:[...S.projects,...(S.alsa||[])];
  pool.forEach(p=>{if(p.code&&p.code.startsWith(pre)){const rest=p.code.slice(pre.length);const isK=k?rest.startsWith(k):/^\d/.test(rest);if(isK){const n=parseInt(rest.replace(/^[A-Z]/,''),10);if(n>max)max=n}}});
  return k?`${pre}${k}${String(max+1).padStart(2,'0')}`:`${pre}${String(max+1).padStart(3,'0')}`;
}

/* ---- risk engine (rule-based "smart" detection; swap for an AI model later) ---- */
function risksOf(p){
  const out=[];const t=today();
  // paused projects are not counted as risks (their plan is frozen); holdReview() lists them for a PMO decision instead
  if(!INFLIGHT.includes(p.status)||p.status==='on_hold') return out;
  const add=(cat,level,title,detail,sugg)=>out.push({key:`${p.id}|${cat}|${title}`,pid:p.id,cat,level,title,detail,sugg,owner:p.pic||'—'});
  const running=p.status==='active'||p.status==='to_report';
  // overdue milestones make one finding (not one per milestone); once the planned end has passed they fold into that finding
  const od=running?(p.milestones||[]).filter(m=>!m.done&&m.due&&diff(t,m.due)>0).map(m=>({m,d:diff(t,m.due)})).sort((a,b)=>b.d-a.d):[];
  const odNames=od.map(x=>x.m.name).join('；'),pastEnd=p.end&&p.status==='active'?diff(t,p.end):0;
  if(od.length&&!(pastEnd>0)){const d=od[0].d;
    add('delivery',d>7?'high':'mid',od.length>1?T(`${od.length} 个节点逾期，最长 ${d} 天`,`${od.length} milestones overdue, up to ${d} days`):T(`节点逾期 ${d} 天`,`Milestone ${d} days overdue`),odNames,d>7?T('与负责人确认原因，决定催办或要求提交延期申请','Confirm cause with owner; chase or ask for an extension request'):T('提醒负责人尽快提交成果','Remind the owner to submit'))}
  if(running){
    if(p.start&&p.end&&p.milestones.length>1){
      const span=Math.max(1,diff(p.end,p.start));const el=Math.min(1,Math.max(0,diff(t,p.start)/span));const gap=Math.round(100*el)-pct(p);
      if(gap>=30) add('schedule',gap>=50?'high':'mid',T(`时间已过 ${Math.round(100*el)}%，交付完成 ${pct(p)}%`,`${Math.round(100*el)}% of time used, ${pct(p)}% delivered`),T('计划进度与成果交付明显脱节','Delivery is well behind the time plan'),T('评估是否需要调整执行要求或延期','Review plan scope or request an extension'));
    }
  }
  if(p.end&&p.status==='active'){
    const d=pastEnd;
    if(d>0) add('closure','high',T(`已超过计划完成日 ${d} 天`,`${d} days past planned end`),od.length?T(`仍有 ${od.length} 个节点逾期（最长 ${od[0].d} 天）：${odNames}`,`${od.length} milestone${od.length>1?'s':''} still overdue (up to ${od[0].d} days): ${odNames}`):T('既未申请结项，也未申请延期','No close or extension request'),od.length?T('要求负责人补交逾期成果，并提交结项或延期申请','Ask the owner to submit the overdue deliverables and file a close or extension request'):T('要求负责人提交结项或延期申请','Ask the owner to file a close or extension request'));
    else if(d>=-7&&p.status==='active'&&p.milestones.some(m=>!m.done)) add('deadline',d>=-3?'mid':'low',T(`距计划完成日 ${-d} 天`,`${-d} days to planned end`),T(`仍有 ${p.milestones.filter(m=>!m.done).length} 项交付物未完成`,`${p.milestones.filter(m=>!m.done).length} deliverables open`),T('确认能否按期结项','Confirm the project can close on time'));
  }
  if(isDeparted(p.pic)) add('resource','high',T('负责人已离职','Owner has left'),`${p.pic}`,T('通过变更申请指定新负责人','Assign a new owner via a change request'));
  const ex=(p.exts||[]).length;
  if(ex>=2) add('extension',ex>=4?'high':'mid',T(`已延期 ${ex} 次`,`Extended ${ex} times`),delayLines(p).join('；'),T('在项目会议上复盘计划可行性','Review plan feasibility at the project meeting'));
  if(p.status==='active'){
    // an owner who reports "At risk" or "Blocked" in the two-week update shows up here for three weeks
    const bw=(p.updates||[]).filter(u=>u.meet&&u.rag).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0];
    if(bw&&(bw.rag==='r'||bw.rag==='y')&&diff(t,bw.date)<=21)add('reported',bw.rag==='r'?'high':'mid',T(`负责人上报：${RAG[bw.rag].zh}`,`Owner reported: ${RAG[bw.rag].en}`),String(bw.help||bw.done||'').split('\n')[0],T('在项目会议上讨论，并确认需要的支持','Discuss at the project meeting and agree the support needed'));
    const lu=lastUpd(p);const d=lu?diff(t,lu):null;
    if(d===null||d>30) add('silence',d!==null&&d>60?'mid':'low',d===null?T('暂无进度更新记录','No progress updates yet'):T(`${d} 天未更新进度`,`No update for ${d} days`),T('看板无法反映真实进展','Board does not show real progress'),T('提醒负责人更新进度','Ask the owner for an update'));
    if(!(p.exec||[]).length) add('resource','mid',T('未指定执行人','No executor assigned'),T('项目只有负责人','Only an owner is assigned'),T('通过变更申请补充执行人','Add executors via a change request'));
  }
  if(p.alsa) out.forEach(r=>{if(r.level==='mid')r.level='high';else if(r.level==='low')r.level='mid'}); // ALSA projects get one level higher
  return out;
}
function workloadRisks(){
  const cnt={};S.projects.filter(p=>p.status==='active').forEach(p=>[p.pic,...(p.exec||[])].filter(Boolean).forEach(n=>{cnt[n]=(cnt[n]||[]);cnt[n].push(p)}));
  return cnt;
}
function allRisks(scope){
  const ps=scope||riskP();const out=[];ps.forEach(p=>out.push(...risksOf(p)));
  const w=workloadRisks();
  Object.entries(w).forEach(([n,arr])=>{if(arr.length>=5){arr.filter(p=>canSee(p)&&(!scope||scope.includes(p))).slice(0,1).forEach(p=>out.push({key:`${p.id}|resource|load|${n}`,pid:p.id,cat:'resource',level:'low',title:T(`${n} 同时参与 ${arr.length} 个进行中项目`,`${n} is on ${arr.length} active projects`),detail:arr.map(x=>x.code).join('、'),sugg:T('确认资源是否足够','Check capacity'),owner:n}))}});
  const ord={high:0,mid:1,low:2};
  return out.sort((a,b)=>ord[a.level]-ord[b.level]);
}
// paused project review: not a risk, a decision the PMO owes (resume, cancel, or convert to a follow-up).
// "due" when paused with no progress for over HOLD_DAYS days, or the owner has left; other facts are listed for context.
const HOLD_DAYS=60;
function holdReview(p){
  if(p.status!=='on_hold')return null;
  const t=today(),lu=lastUpd(p)||null,d=lu?diff(t,lu):null,why=[];
  const quiet=d===null||d>HOLD_DAYS,gone=isDeparted(p.pic);
  if(quiet)why.push(d===null?T('暂停后没有任何进展记录','No progress recorded while on hold'):T(`已 ${d} 天没有进展`,`No progress for ${d} days`));
  if(gone)why.push(T(`负责人 ${p.pic} 已离职`,`Owner ${p.pic} has left`));
  const pe=p.end?diff(t,p.end):0;if(pe>0)why.push(T(`已超过原计划完成日 ${pe} 天`,`${pe} days past the original planned end`));
  const ex=(p.exts||[]).length;if(ex>=2)why.push(T(`此前已延期 ${ex} 次`,`Extended ${ex} times before`));
  return {pid:p.id,days:d,last:lu,why,due:quiet||gone};
}
const holdList=scope=>(scope||riskP()).map(holdReview).filter(Boolean);
// each project is shown with ONE main risk: the most severe open finding; equal levels go by this order
const RISK_PRI=['resource','closure','delivery','schedule','deadline','extension','silence','stalled'];
// one entry per project: its findings sorted by severity; the project's level is its main (most severe open) finding
// (a project with an overdue end date and a quiet update log is one high-risk project, not one high and one low)
function riskGroups(list){
  const ord={high:0,mid:1,low:2},m=new Map();
  list.forEach(r=>{if(!m.has(r.pid))m.set(r.pid,{pid:r.pid,items:[]});m.get(r.pid).items.push(r)});
  const gs=[...m.values()];
  const ak=r=>S.acks[r.key]?1:0;
  gs.forEach(g=>{g.items.sort((a,b)=>ak(a)-ak(b)||ord[a.level]-ord[b.level]||RISK_PRI.indexOf(a.cat)-RISK_PRI.indexOf(b.cat));g.main=g.items[0];g.level=g.main.level;g.done=!!ak(g.main)});
  return gs;
}
// the one risk a project is labelled with
const mainRisk=p=>{const g=riskGroups(risksOf(p))[0];return g?g.main:null};
const pLevel=p=>{const r=risksOf(p);return r.some(x=>x.level==='high')?'high':r.some(x=>x.level==='mid')?'mid':r.length?'low':null};

/* ---- mail + reminder engine ---- */
// "Aiden" in the texts is the PMO Lead. Mail to "PMO" goes to his address; admin accounts such as Kay's do not receive it.
const pmoEmail=()=>{const L=S.users.filter(u=>u.role==='pmo'&&u.status!=='disabled');return (L.find(u=>/aiden/i.test(u.name))||L[0]||{}).email||''};
// Reminder-rule mails (R1–R8) become DRAFTS that PMO reviews and sends from the mail center.
// Everything else (approval notices etc.) is only logged here; the database sends the key ones itself.
function sendMail({to,cc=[],subject,body,rule,ref}){
  const addr=n=>n==='Aiden'?pmoEmail():(emailOf(n)||'');
  // one person once: dedupe by address (or loose name), To before cc
  const seen=new Set(),uniq=a=>a.filter(Boolean).map(n=>typeof n==='object'?{n:n.n,e:n.e||addr(n.n)}:{n,e:addr(n)}).filter(x=>{const k=x.e||norm(x.n);return seen.has(k)?false:(seen.add(k),true)});
  const toL=uniq(to),ccL=uniq(cc);
  const m={id:uid(),at:nowStamp(),to:toL,cc:ccL,subject,body,rule:rule||'manual',ref,status:/^R\d$|^DG$/.test(rule||'')||rule==='custom'?'draft':'local'};
  S.mails.unshift(m);
  {let n=0;S.mails=S.mails.filter(x=>x.status!=='local'||++n<=800)}      // only the local log is trimmed; sent mail is kept
  return m;
}
function sig(){return `\n\n——\n${T(ORG.zh+' · 售后项目管理中心 · 自动提醒',ORG.en+' · PMO · automatic reminder')}\n${T('请登录系统提交成果或申请变更。','Please sign in to submit deliverables or request a change.')}`}
function addTodo(o){S.todos.unshift({id:uid(),at:nowStamp(),status:'open',...o})}
function allProjects(){return S.projects}
/* reminder e-mail texts, shared by the daily rule check and the manual "pick projects" generator */
const MB={
  R1:(p,m,ms)=>{const t=today(),d=diff(m.due,t),idx=ms.indexOf(m)+1,forms=fList(m.forms)||T('图文汇报 / 邮件跟进 / 项目文件展示','report / email / files'),rc=[p.pic,...(p.exec||[])].filter(Boolean),tagA=p.alsa?'[ALSA] ':'';const mg=mgrOfP(p),cc=d>3?[]:d>1?[mg&&mg.name]:[mg&&mg.name,'Aiden'];if(p.alsa&&!cc.includes('Aiden'))cc.push('Aiden');return {to:rc,cc:ccList(cc,rc),subject:`${tagA}[${d>3?T('节点提醒 · 一周','Heads-up · 1 week'):d>1?T('节点预警 · 三天','Warning · 3 days'):T('节点紧急 · 明天到期','Urgent · due tomorrow')}] ${p.code} · ${T(`${d} 天后到期`,`due in ${d} days`)}：${m.name}`,body:`${p.pic||''}${CM()}${T('您好','hello')}${CO()}\n\n${T('项目','Project')} ${p.code}「${p.name}」${T('的第','milestone')} ${idx}/${ms.length} ${T('个节点将于','is due on')} ${m.due} ${T('到期（还有','(in')} ${d} ${T('天）。','days).')}\n${d>3?'':d>1?T('⚠ 距离到期不足三天，请确认交付进度；来不及请尽早申请节点异动。','⚠ Less than three days left: confirm progress, and file a milestone change early if you cannot make it.'):T('🚨 明天到期：今天必须完成并提交；来不及请立即申请节点异动。','🚨 Due tomorrow: finish and submit today; if you cannot, file a milestone change now.')}\n\n${T('需提交成果','Deliverable')}${CO()}${m.name}\n${T('提交形式','Format')}${CO()}${forms}\n\n${T('请提前安排，到期前在系统「项目库 → 里程碑与成果」中提交，可附文字说明、截图、邮件。如预计无法按期完成，请尽早提交「项目变更 → 申请延期」。','Please plan ahead and submit under Projects → Milestones before the date (text, screenshots, emails). If it will slip, file Change → Extension early.')}${sig()}`,rule:'R1',ref:p.id}},
  R2:p=>{const t=today(),de=diff(p.end,t),ms=(p.milestones||[]).filter(m=>m.due).sort((a,b)=>a.due.localeCompare(b.due)),last=ms[ms.length-1],open=ms.filter(m=>!m.done),tagA=p.alsa?'[ALSA] ':'';return {to:[p.pic,...(p.exec||[])],cc:['Aiden'],subject:`${tagA}[${T('准备结项汇报','Prepare close report')}] ${p.code} ${T(`还有 ${de} 天到计划完成日`,`ends in ${de} days`)}`,body:`${p.pic||''}${CM()}${T('您好','hello')}${CO()}\n\n${T('项目','Project')} ${p.code}「${p.name}」${T('计划完成日为','planned end')} ${p.end}（${T('还有','in')} ${de} ${T('天','days')}）。\n\n${T('最后一个交付物','Final deliverable')}${CO()}${last?last.name+'（'+last.due+'）':T('见项目执行要求','see plan')}\n${open.length?`${T('仍未提交的交付物','Still open')}（${open.length}）：\n${open.map(m=>`· ${m.due}  ${m.name}`).join('\n')}\n`:''}\n${T('请开始准备项目汇报材料：完成后在系统「申请结项」中逐项勾选交付物并提交，PMO 预审后安排在项目会议汇报。如无法按期完成，请在到期前提交「项目变更 → 申请延期」。','Please start preparing the project report. When done, file a close request with every deliverable ticked; PMO pre-reviews and schedules it for the project meeting. If it will slip, file an extension before the end date.')}${sig()}`,rule:'R2',ref:p.id}},
  R6:(p,per)=>{const mg=mgrOfP(p),tagA=p.alsa?'[ALSA] ':'';return {to:[p.pic],cc:mg&&mg.name!==p.pic?[mg.name]:[],subject:`${tagA}[${T('双周进展','Two-week progress')}] ${p.code} · ${LANGN(per.lang)} ${md(per.meet)}`,body:`${p.pic||''}${CM()}${T('您好','hello')}${CO()}\n\n${T(`${md(per.meet)} 的${LANGN(per.lang)}将汇报项目`,`At the ${LANGN(per.lang)} on ${md(per.meet)} we review`)} ${p.code}「${p.name}」。\n${T('请在','Please post the two-week progress by')} ${md(per.due)} 13:00 ${T('（阿姆斯特丹时间）前在系统「双周更新」中填写本期进展（之后不能再改）','Amsterdam time in the system under Two-week updates (it is locked after that)')}（${T('汇报周期','period')} ${md(per.from)}–${md(per.to)}）：\n· ${T('过去两周完成了什么','What was done in the past two weeks')}\n· ${T('接下来两周计划','Plan for the next two weeks')}\n· ${T('需要的支持 / 风险','Support needed / risks')}\n\n${T('提交后 PMO 会汇总成会议材料，会上只讨论问题和需要的支持。','PMO compiles the submissions for the meeting, which then focuses on issues and support.')}${sig()}`,rule:'R6',ref:p.id}}
};
const DGON=()=>S.rules&&S.rules.DG!==false;
function isoWeek(ds){const t=new Date(dn(ds)*864e5),d=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate())),day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const y=d.getUTCFullYear();return `${y}-W${String(Math.ceil(((d-Date.UTC(y,0,1))/864e5+1)/7)).padStart(2,'0')}`}
// what one person should know this week, in one place
function digestFor(u){
  const t=today(),N=S.lead||15,mine=p=>norm(p.pic||'')===norm(u.name)||(p.exec||[]).some(n=>norm(n)===norm(u.name)),own=p=>norm(p.pic||'')===norm(u.name),sec=[];
  const run=allProjects().filter(p=>(p.status==='active'||p.status==='not_started'));
  const ms=[];run.filter(mine).forEach(p=>(p.milestones||[]).forEach(m=>{if(!m.done&&m.due){const d=diff(m.due,t);if(d<=7)ms.push({d,p,m})}}));ms.sort((a,b)=>a.d-b.d);
  if(ms.length)sec.push([T('节点到期','Milestones'),ms.map(({d,p,m})=>`${d<0?T('🔴 已逾期','🔴 Overdue'):d<=1?T('🚨 紧急','🚨 Urgent'):d<=3?T('⚠ 预警','⚠ Warning'):T('· 提醒','· Heads-up')}  ${p.code} ${p.name} — ${m.name}（${m.due}${d<0?`，${T(`逾期 ${-d} 天`,`${-d} days late`)}`:d===0?`，${T('今天','today')}`:`，${T(`${d} 天后`,`in ${d} days`)}`}）`)]);
  const ends=run.filter(p=>own(p)&&p.status==='active'&&p.end&&diff(p.end,t)>0&&diff(p.end,t)<=N).map(p=>`${p.code} ${p.name} — ${T('计划完成日','ends')} ${p.end}`);if(ends.length)sec.push([T('临近计划完成日，请准备结项','Ending soon: prepare the close'),ends]);
  if(u.role==='pmo'){const pend=S.requests.filter(q=>q.status==='pending');if(pend.length)sec.push([T('待你审批','Waiting for your approval'),pend.slice(0,12).map(q=>`${reqTitle(q)} — ${T(`已等 ${diff(t,q.at.slice(0,10))} 天`,`waiting ${diff(t,q.at.slice(0,10))} days`)}`).concat(pend.length>12?[T(`……共 ${pend.length} 项`,`… ${pend.length} in all`)]:[])])}
  const votes=(S.alsa||[]).filter(a=>a.status==='voting'&&alsaMembers().some(m=>m.id===u.id)&&!a.votes[u.id]).map(a=>`${a.code} ${a.name}`);if(votes.length)sec.push([T('ALSA 项目等你表决','ALSA projects waiting for your vote'),votes]);
  return sec;
}
function sendDigests(){
  if(!DGON())return 0;const t=today(),dow=new Date(dn(t)*864e5).getUTCDay();if(dow<1||dow>5)return 0;
  const wk=isoWeek(t);let n=0;
  for(const u of S.users){if(u.status==='disabled'||!u.email)continue;const k=`DG|${u.id}|${wk}`;if(S.sent[k])continue;
    const sec=digestFor(u);S.sent[k]=t;if(!sec.length)continue;
    const cnt=sec.reduce((a,x)=>a+x[1].length,0);
    sendMail({to:[u.name],subject:`[${T('每周摘要','Weekly digest')}] ${cnt} ${T('项需要关注','item(s) need attention')} · ${wk}`,body:`${u.name}${CM()}${T('您好','hello')}${CO()}\n\n${T('这是本周需要您关注的事项：','Here is what needs your attention this week:')}\n\n${sec.map(([h,L])=>`■ ${h}\n${L.map(x=>'  '+x).join('\n')}`).join('\n\n')}\n\n${T('请登录系统处理。逾期和明天到期的节点仍会单独提醒。','Please open the system. Overdue and due-tomorrow milestones still get their own mail.')}${sig()}`,rule:'DG'});n++}
  return n;
}
function runReminders(){
  const t=today();let n=0;const N=S.lead||15;
  const once=(k,fn)=>{if(S.sent[k])return;S.sent[k]=t;fn();n++};
  for(const p of allProjects()){
    if(!(p.status==='active'||p.status==='not_started')) continue;
    const rc=[p.pic,...(p.exec||[])].filter(Boolean);const mg=mgrOfP(p);const tagA=p.alsa?'[ALSA] ':'';
    const ms=(p.milestones||[]).filter(m=>m.due).sort((a,b)=>a.due.localeCompare(b.due));const last=ms[ms.length-1];
    for(const m of ms){
      if(m.done) continue;const d=diff(m.due,t);
      const forms=fList(m.forms)||T('图文汇报 / 邮件跟进 / 项目文件展示','report / email / files');
      const idx=ms.indexOf(m)+1;
      if(S.rules.R1&&d>=0&&d<=7){const st=d>3?'w':d>1?'d3':'d1';if(!DGON()||st==='d1')once(`R1|${p.id}|${m.id}|${m.due}|${st}`,()=>sendMail(MB.R1(p,m,ms)))}
      if(S.rules.R3&&d<0) once(`R3|${p.id}|${m.id}|${m.due}`,()=>{
        sendMail({to:['Aiden'],cc:[p.pic],subject:`${tagA}[${T('成果未提交','Not submitted')}] ${p.code} · ${T('逾期','overdue')} ${-d} ${T('天','days')}`,body:`Aiden${CM()}${T('您好','hello')}${CO()}\n\n${T('项目','Project')} ${p.code}「${p.name}」（${tName(p.team)}）${T('的节点已于','milestone was due on')} ${m.due} ${T('到期，负责人尚未提交成果。','and the owner has not submitted anything.')}\n\n${T('节点成果','Deliverable')}${CO()}${m.name}\n${T('负责人','Owner')}${CO()}${p.pic||'—'}\n${T('执行人','Executors')}${CO()}${(p.exec||[]).join('、')||'—'}\n\n${T('已在您的「待办审批」生成延期评估事项：催办 / 要求提交延期申请 / 已知悉。','An extension-review task is in your Approvals: chase / ask for extension / acknowledge.')}${sig()}`,rule:'R3',ref:p.id});
        addTodo({type:'overdue',assignee:'pmo',pid:p.id,mid:m.id,title:`${p.code} ${T('节点逾期未提交','milestone overdue')}${CO()}${m.name}`});
      });
      if(S.rules.R4&&d<=-7) once(`R4|${p.id}|${m.id}|${m.due}`,()=>sendMail({to:[p.pic,mg&&mg.name!==p.pic?mg.name:null],cc:['Aiden'],subject:`${tagA}[${T('升级提醒','Escalation')}] ${p.code} ${T('节点逾期','milestone overdue')} ${-d} ${T('天','days')}`,body:`${T('项目','Project')} ${p.code}「${p.name}」${T('的节点成果已逾期','deliverable is overdue by')} ${-d} ${T('天','days')}${CO()}${m.name}\n\n${T('请在 2 个工作日内提交成果，或提交延期申请并说明原因。此项已标记为高风险。','Please submit within 2 working days or file an extension with the reason. Flagged as high risk.')}${sig()}`,rule:'R4',ref:p.id}));
    }
    if(p.end&&p.status==='active'){
      const de=diff(p.end,t);
      if(S.rules.R2&&!DGON()&&de>0&&de<=N) once(`R2|${p.id}|${p.end}`,()=>{const open=ms.filter(m=>!m.done);
        sendMail(MB.R2(p))});
      if(S.rules.R5&&de<0&&!S.requests.some(r=>r.pid===p.id&&r.status==='pending')) once(`R5|${p.id}|${p.end}`,()=>{
        sendMail({to:['Aiden'],subject:`${tagA}[${T('超期未结项','Past end')}] ${p.code} ${T('已超过计划完成日','is past its end date')}`,body:`${p.code}「${p.name}」${T('计划完成日','end date')} ${p.end}，${T('至今未收到结项或延期申请。','no close or extension request received.')}${sig()}`,rule:'R5',ref:p.id});
        addTodo({type:'pastEnd',assignee:'pmo',pid:p.id,title:`${p.code} ${T('超期未结项','past end, not closed')}（${p.end}）`});
      });

    }
  }
  // two-week update: the Friday before the meeting week, then Monday and Tuesday (the due day); only the latest step reached is sent
  if(S.rules.R6&&S.cadence) for(const p of S.projects){
    if(!needsBW(p))continue;const per=periodOf(trackOf(p.team),t);if(updFor(p,per))continue;
    const mon=mondayOf(per.meet),steps=[addDays(mon,-3),mon,addDays(mon,1)].filter(x=>diff(per.meet,x)>0),done=steps.filter(x=>diff(t,x)>=0);
    if(!done.length)continue;const k=done.length-1;
    once(`R6|${p.id}|${per.meet}|${k}`,()=>sendMail({...MB.R6(p,per),subject:MB.R6(p,per).subject+(k===0?` · ${T('提前提醒','heads-up')}`:k===steps.length-1&&steps.length===3?` · ${T('今天截止','due today')}`:'')}));
  }
  for(const r of S.requests) if(r.status==='pending'&&S.rules.R7&&!DGON()&&diff(t,r.at.slice(0,10))>=3) once(`R7|${r.id}`,()=>sendMail({to:['Aiden'],subject:`[${T('审批提醒','Approval waiting')}] ${reqTitle(r)}`,body:`${T('该申请已等待','This request has waited')} ${diff(t,r.at.slice(0,10))} ${T('天','days')}，${T('提交人','submitted by')} ${userName(r.by)}。${sig()}`,rule:'R7'}));
  for(const a of S.alsa||[]) if(a.status==='voting'&&S.rules.R8&&!DGON()&&diff(t,a.sentAt.slice(0,10))>=3){
    const pend=alsaMembers().filter(u=>!a.votes[u.id]);
    if(pend.length) once(`R8|${a.id}|${a.round}`,()=>sendMail({to:pend.map(u=>u.name),cc:['Aiden'],subject:`[ALSA ${T('审批提醒','vote reminder')}] ${a.code} ${a.name}`,body:`${T('该 ALSA 项目已发起审批','This ALSA project was sent for approval on')} ${a.sentAt.slice(0,10)}，${T('您尚未表决。请登录系统「ALSA 战略项目」查看并同意或提出意见。','you have not voted yet. Please review it under ALSA projects.')}${sig()}`,rule:'R8'}));
  }
  n+=sendDigests();
  save();return n;
}
function reqTitle(r){
  const ty={new:T('立项申请','New project'),change:T('变更申请','Change'),close:T('结项申请','Close')}[r.type];
  if(r.type==='new') return `${ty} · ${r.data.name}`;
  const p=S.projects.find(x=>x.id===r.pid);return `${ty} · ${p?p.code+' '+p.name:''}`;
}

/* ---- UI helpers ---- */
const pill=st=>`<span class="pill p-${st}"><i></i>${esc(T(ST[st].zh,ST[st].en))}</span>`;
const stPill=p=>pill(p.status)+(isStaleClosed(p)?` <span class="tag stale-tag" title="${T('超过 1 年没有进展，按 PMO 规则视为关闭','No progress for over a year; closed under the PMO rule')}">${T('长期无进展','Inactive 1y+')}</span>`:'');
const lvPill=l=>l?`<span class="pill p-${l}">${ico(l==='high'?'tri':l==='mid'?'dot':'ring')}${esc(T(LV[l].zh,LV[l].en))}</span>`:'';
const tag=c=>`<span class="tag ${team(c).group}">${esc(tName(c))}</span>`;
const prog=p=>`<div class="prog"><div class="bar"><i style="width:${pct(p)}%"></i></div><span class="small num muted">${pct(p)}%</span></div>`;
const lockI=`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
// feedback for every action: one polite live region, newest message on top; errors stay longer and are announced assertively
function toast(msg,kind='ok'){
  let box=document.getElementById('toasts');
  if(!box){box=document.createElement('div');box.id='toasts';box.className='toasts';box.setAttribute('role','status');box.setAttribute('aria-live','polite');document.body.appendChild(box)}
  const d=document.createElement('div');d.className='toast t-'+kind;if(kind==='err'||kind==='warn')d.setAttribute('role','alert');
  d.innerHTML=`${ico(kind==='err'||kind==='warn'?'alert':kind==='info'?'info':'ok')}<span></span>`;d.lastChild.textContent=msg;
  box.prepend(d);while(box.children.length>3)box.lastChild.remove();
  setTimeout(()=>{d.classList.add('out');setTimeout(()=>d.remove(),180)},kind==='err'?6000:kind==='warn'?4200:2600);
}
function teamOptions(sel,list){
  const L=list||allTeams();const groups={R:[],C:[]};L.forEach(c=>groups[team(c).group].push(c));
  return ['R','C'].filter(g=>groups[g].length).map(g=>`<optgroup label="${esc(gName(g))}">${groups[g].map(c=>`<option value="${c}" ${c===sel?'selected':''}>${esc(tName(c))}</option>`).join('')}</optgroup>`).join('');
}

/* ================= project content follows the page language =================
   TR (built from the migrated tracker) holds a Chinese and an English version of every
   project / follow-up name, scope, milestone and progress note, keyed "CODE|field".
   Bilingual originals are split so each page language shows its own text only.
   A field is switched only while it still holds a known version; once someone edits it,
   their text is kept as written. */
const TRK=(code,prop,i)=>`${code}|${prop==='name'||prop==='scope'?prop:prop+i}`;
function trSwap(obj,prop,key,lang){
  const tr=TR[key];if(!tr||obj[prop]==null)return;
  const cur=String(obj[prop]).trim();if(cur!==tr.zh&&cur!==tr.en&&cur!==(tr.o||tr.zh))return; // edited by a user: keep
  obj[prop]=tr[lang]||cur;
}
// small fixed texts written by the migration
const FIXED=[['（历史项目，按原表视为已完成）','(Legacy project, treated as completed per the original tracker)'],['系统迁移','Migration'],['系统','System']];
const fixSwap=(obj,prop,lang)=>{const v=obj[prop];if(v==null)return;for(const [z,e] of FIXED){if(v===z||v===e){obj[prop]=lang==='en'?e:z;return}}};
const MIG_ZH=/^由原进度表迁移（原编号 (.*)，原页签 (.*)）$/,MIG_EN=/^Migrated from the original tracker \(old code (.*), sheet (.*)\)$/;
function histSwap(h,lang){if(h.k==='stale'&&h.d){h.text=staleTxt(h.d,lang);fixSwap(h,'by',lang);return}const m=String(h.text).match(MIG_ZH)||String(h.text).match(MIG_EN);if(m)h.text=lang==='en'?`Migrated from the original tracker (old code ${m[1]}, sheet ${m[2]})`:`由原进度表迁移（原编号 ${m[1]}，原页签 ${m[2]}）`;fixSwap(h,'by',lang)}
// the few example issues / requests seeded for the demo
const DEMO=[['三国电池维修中心共用同一执行团队（Alex / Janson / Siri），11–12 月节点集中，存在资源冲突。','The three battery repair centres share one execution team (Alex / Janson / Siri); milestones cluster in Nov–Dec, so resources will clash.'],
  ['各国门店执行进度不一，最后 5% 门店需要逐店沟通，申请延期一个月。','Roll-out progress differs by country; the last 5% of dealers need one-by-one follow-up, so we request a one-month extension.'],
  ['最后一项交付物转为日常运营，由区域持续跟进。','The last deliverable moves into daily operations and the regions keep following it up.'],
  ['核心目标已完成，剩余事项不影响项目结项。','The core goals are achieved; the remaining items do not block closing the project.'],
  ['核心交付物已完成并在区域落地。','Core deliverables are done and rolled out in the regions.'],
  ['流程标准化，区域执行一致。','Standardised process, consistent execution across regions.'],
  ['剩余一项转日常运营。','One remaining item moves into daily operations.'],
  ['结项后监控 3 个月执行数据','Monitor execution data for 3 months after closing']];
const demoSwap=(obj,prop,lang)=>{const v=obj&&obj[prop];if(v==null)return;for(const [z,e] of DEMO){if(v===z||v===e){obj[prop]=lang==='en'?e:z;return}}};
function applyLang(){
  if(typeof TR==='undefined'||S._al===S.lang)return;const lang=S.lang==='en'?'en':'zh';
  for(const x of [...S.projects,...S.follows]){
    trSwap(x,'name',TRK(x.code,'name'),lang);trSwap(x,'scope',TRK(x.code,'scope'),lang);
    (x.milestones||[]).forEach((m,i)=>{trSwap(m,'name',m._k||TRK(x.code,'m',i),lang);if(m.evidence){fixSwap(m.evidence,'text',lang);fixSwap(m.evidence,'by',lang)}});
    (x.updates||[]).forEach((u,i)=>trSwap(u,'text',u._k||TRK(x.code,'u',i),lang));
    (x.history||[]).forEach(h=>histSwap(h,lang));
  }
  (S.issues||[]).forEach(o=>demoSwap(o,'text',lang));
  (S.requests||[]).forEach(r=>{if(r.decision&&r.decision.k==='stale')r.decision.comment=staleVoidTxt(lang);const dd=r.data||{};['reason','forceReason','summary','benefit','leftover','followNote'].forEach(k=>demoSwap(dd,k,lang));if(dd.reasons)Object.keys(dd.reasons).forEach(k=>demoSwap(dd.reasons,k,lang))});
  S._al=S.lang;
}
// pin each migrated milestone / update to its translation key so later inserts do not shift them
function pinKeys(){
  for(const x of [...S.projects,...S.follows]){
    (x.milestones||[]).forEach((m,i)=>{if(!m._k&&TR[TRK(x.code,'m',i)])m._k=TRK(x.code,'m',i)});
    (x.updates||[]).forEach((u,i)=>{const k=TRK(x.code,'u',i),tr=TR[k],t=String(u.text??'').trim();if(!u._k&&!u.meet&&tr&&(t===tr.zh||t===tr.en||t===(tr.o||tr.zh)))u._k=k});
  }
}

/* ================= shell & views ================= */
const IC={
  dash:'<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  lib:'<path d="M4 4h16v4H4zM4 10h16v4H4zM4 16h16v4H4z"/>',
  gantt:'<path d="M3 5h10M7 10h12M5 15h9M10 20h10"/>',
  risk:'<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17v.5"/>',
  follow:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  inbox:'<path d="M3 13h5l1 3h6l1-3h5"/><path d="M5 5h14l2 8v6H3v-6z"/>',
  apply:'<path d="M12 5v14M5 12h14"/>',
  change:'<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
  close:'<path d="M5 12l4 4L19 6"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  code:'<path d="M8 6 3 12l5 6M16 6l5 6-5 6"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  // interface icons: one family (24px grid, 1.75 stroke, round joins) for every control
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  ok:'<path d="M5 12.5l4.5 4.5L19 7"/>',
  chevR:'<path d="m10 6 6 6-6 6"/>',
  chevD:'<path d="m6 10 6 6 6-6"/>',
  chevL:'<path d="M15 5l-7 7 7 7"/>',
  more:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  tri:'<path d="M12 4.5 3.5 19h17z"/><path d="M12 10v4M12 16.6v.4"/>',
  dot:'<circle cx="12" cy="12" r="4.2" style="fill:currentColor;stroke:none"/>',
  ring:'<circle cx="12" cy="12" r="4.2"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 1.5"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.4"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.2v.4"/>',
  kbd:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  empty:'<path d="M3.5 13.5h5l1.2 2.5h4.6l1.2-2.5h5"/><path d="M5.5 5.5h13l2 8v5h-17v-5z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M2.5 12h2M19.5 12h2M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  mouse:'<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v7M6 10h6"/>',
  clip:'<path d="M20 11.5 12.4 19a5 5 0 0 1-7.1-7.1l7.8-7.7a3.3 3.3 0 0 1 4.7 4.7l-7.8 7.7a1.7 1.7 0 0 1-2.4-2.4l7.1-7"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
};
// <svg> for an icon of the set; decorative unless a label is given
const ico=(n,cls='',label='')=>`<svg class="ico${cls?' '+cls:''}" viewBox="0 0 24 24" ${label?`role="img" aria-label="${esc(label)}"`:'aria-hidden="true"'} focusable="false">${IC[n]||''}</svg>`;
const pmoNavOpen=()=>S.filters.pmoOpen===undefined?S.view==='pmo':!!S.filters.pmoOpen;
function navHTML(){
  return NAV().filter(n=>!n.pmo||isPMO()).filter(n=>n.k!=='approvals'||!isPMO()).filter(n=>(n.k!=='alsa'&&!n.alsa)||isPMO()||!!alsaRoleOf(me().id)).filter(n=>n.k!=='close'||canClose()).filter(n=>me().role!=='viewer'||!['apply','change','biweekly'].includes(n.k)).filter(n=>!n.sub||n.always||pmoNavOpen()).map(n=>n.g?`<div class="navgroup">${esc(n.g)}</div>`:`${n.parent?'<div class="nav-row">':''}<button class="nav${n.sub?' sub':''} ${navOn(n)||(n.also||[]).includes(S.view)?'on':''}" data-act="go" data-v="${n.k}"${n.at?` data-at="${n.at}"`:''} ${navOn(n)?'aria-current="page"':''}>${ico(n.i)}<span>${esc(n.l)}</span>${n.b&&n.b()?`<span class="badge" ${n.bc?'style="background:var(--warn)"':''}>${n.b()}</span>`:''}</button>${n.parent?`<button type="button" class="nav-tg" data-act="pmoToggle" aria-expanded="${pmoNavOpen()}" aria-label="${T('展开 / 收起 PMO 工作台','Expand or collapse the PMO workbench')}">${ico('chevD')}</button></div>`:''}`).join('');
}
const navOn=n=>S.view===n.k&&(!n.at||(n.k==='pmo'?pmoTab():alsaTab())===n.at);
const canSetup=()=>isPMO()||isAlsa();   // PMO and the voting ALSA members can set up an ALSA project
const canManageA=a=>isPMO()||(!!a.by&&a.by===me().id);
const alsaTab=()=>(S.filters.alsaForm&&canSetup())?'setup':(['about','res','setup','topic'].includes(S.filters.alsaTab)?S.filters.alsaTab:'about');
const alsaTabT=()=>({about:T('关于我们','About us'),res:T('ALSA 动态','ALSA News'),setup:T('ALSA 项目','ALSA Projects'),topic:T('ALSA 会议安排','ALSA Meeting Schedule')})[alsaTab()];
const NAV=()=>[
  {g:T('概览','Overview')},
  {k:'dashboard',i:'dash',l:T('项目看板','Project board'),also:['gantt']},
  {k:'risks',sub:true,always:true,i:'risk',l:T('风险与问题','Risks & issues'),b:()=>riskBadge(),bc:'warn'},
  {k:'follows',sub:true,always:true,i:'follow',l:T('跟进项','Follow-ups')},
  {g:T('项目','Projects')},
  {k:'projects',i:'lib',l:T('项目库','Project library')},
  {k:'library',i:'book',l:T('项目资料库','Knowledge library')},
  {g:T('ALSA','ALSA'),alsa:true},
  {k:'alsa',at:'about',i:'info',l:T('关于我们','About us')},
  {k:'alsa',at:'res',i:'star',l:T('ALSA 动态','ALSA News')},
  {k:'alsa',at:'setup',i:'apply',l:T('ALSA 项目','ALSA Projects'),b:()=>alsaInbox()},
  {k:'alsa',at:'topic',i:'cal',l:T('ALSA 会议安排','ALSA Meeting Schedule'),b:()=>tpInbox()},
  {g:T('申请中心','Requests')},
  {k:'apply',i:'apply',l:isPMO()?T('新建项目','New project'):T('项目申请','New project')},
  {k:'change',i:'change',l:T('项目变更','Change request')},
  {k:'close',i:'close',l:T('申请结项','Close request')},
  {g:T('工作台','My work')},
  {k:'biweekly',i:'cal',l:T('双周更新','Two-week updates'),b:()=>bwPending()},
  {k:'approvals',i:'inbox',l:T('我的待办审批','My approvals'),b:()=>inboxCount()},
  {k:'pmo',at:'overview',i:'dash',l:T('PMO 工作台','PMO workbench'),pmo:true,parent:true,b:()=>{const c=pmoCounts();return c.new+c.change+c.close+c.wait+c.remind}},
  {k:'pmo',sub:true,at:'new',i:'apply',l:T('立项审批','New projects'),pmo:true,b:()=>pmoCounts().new},
  {k:'pmo',sub:true,at:'change',i:'change',l:T('项目变更','Project changes'),pmo:true,b:()=>pmoCounts().change},
  {k:'pmo',sub:true,at:'close',i:'close',l:T('结项审批','Close approvals'),pmo:true,b:()=>pmoCounts().close+pmoCounts().wait},
  {k:'pmo',sub:true,at:'remind',i:'inbox',l:T('提醒与待办','Reminders and tasks'),pmo:true,b:()=>pmoCounts().remind},
  {k:'pmo',sub:true,at:'done',i:'info',l:T('已处理记录','Decided'),pmo:true},
  {k:'pmo',sub:true,at:'usage',i:'dash',l:T('使用统计','Usage'),pmo:true},
  {k:'mail',i:'mail',l:T('邮件提醒','Email reminders')},
  {g:isPMO()?T('PMO 管理','PMO admin'):T('参考','Reference')},
  {k:'guide',i:'info',l:T('使用手册','User guide')},
  {k:'codes',i:'code',l:T('项目编码规则','Project codes')},
  {k:'users',i:'users',l:isPMO()?T('账号与权限','Accounts & roles'):T('账号申请与权限','Accounts & access')}
];
IC.star='<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>';
const TITLES=()=>({review:[T('逐个过更新','Going through updates'),T('双周更新','Two-week updates')],dashboard:[T('项目看板','Dashboard'),T('概览','Overview')],gantt:[T('甘特图','Gantt'),T('概览','Overview')],risks:[T('风险与问题清单','Risks & issues'),T('概览','Overview')],alsa:[alsaTabT(),T('ALSA 项目','ALSA projects')],pmo:[pmoTabT(),T('PMO 工作台','PMO workbench')],projects:[T('项目库','Project library'),T('项目','Projects')],library:[T('项目资料库','Knowledge library'),T('项目 · 项目库','Projects · Project library')],follows:[T('跟进项','Follow-ups'),T('项目','Projects')],apply:isPMO()?[T('新建项目（PMO 直接立项）','New project (set up by PMO)'),T('申请中心','Requests')]:[T('项目申请','New project request'),T('申请中心','Requests')],change:[T('项目变更申请','Change request'),T('申请中心','Requests')],close:[T('项目结项申请','Close request'),T('申请中心','Requests')],biweekly:[T('双周更新','Two-week updates'),T('工作台','My work')],approvals:[T('我的待办审批','My approvals'),T('工作台','My work')],mail:[T('邮件提醒中心','Email reminders'),T('工作台','My work')],codes:[T('项目编码规则','Project code scheme'),T('参考','Reference')],guide:[T('使用手册','User guide'),T('参考','Reference')],users:[T('账号与权限','Accounts & roles'),T('PMO 管理','PMO admin')]});
function viewOptions(){
  const cur=isPMO()?'pmo':S.teamView?'team:'+S.teamView:'user:'+me().id;
  const o=(v,l)=>`<option value="${esc(v)}" ${cur===v?'selected':''}>${esc(l)}</option>`;
  const mg=S.users.filter(u=>u.role==='mgr'&&u.status!=='disabled');
  const secs=[...new Set(mg.flatMap(u=>u.secs||[]))];
  const g=k=>S.teams.filter(t=>t.group===k&&mgrOf(t.code)).map(t=>o('team:'+t.code,tName(t.code))).join('')+(k==='C'?secs.map(s=>o('team:'+s,secLabel(s))).join(''):'');
  // views are by team only (managers change); a whole-scope preview opened from the accounts page is labelled by its teams
  const alsaV=[['user:sharon',T('ALSA 秘书处视角','ALSA Secretariat view')],['user:daglef',T('ALSA 成员视角 · Steering','ALSA member view · Steering')],['user:hailin',T('ALSA 成员视角 · Execution','ALSA member view · Execution')]].filter(([v])=>S.users.some(u=>'user:'+u.id===v));
  const cu=cur.startsWith('user:')&&!alsaV.some(([v])=>v===cur)?o(cur,scopeLabel()||me().name):'';
  return `${o('pmo',T('PMO 管理视图（全部团队）','PMO view (all teams)'))}${cu?`<optgroup label="${esc(T('当前预览','Previewing'))}">${cu}</optgroup>`:''}<optgroup label="ALSA">${alsaV.map(([v,l])=>o(v,l)).join('')}</optgroup><optgroup label="${esc(gName('R'))}">${g('R')}</optgroup><optgroup label="${esc(gName('C'))}">${g('C')}</optgroup>`;
}
const heroOn=()=>S.view==='dashboard'&&S.bg&&S.bg.startsWith('hero');
const greet=()=>{const h=new Date().getHours();return h<11?T('早上好','Good morning'):h<18?T('下午好','Good afternoon'):T('晚上好','Good evening')};
function renderApp(){
  applyLang();
  document.body.dataset.bg=S.bg||'none';if(S.bg&&S.bg.startsWith('full'))document.body.style.setProperty('--full-img',`url(${BG[S.bg.split('-')[1]]})`);
  document.documentElement.lang=S.lang==='en'?'en':'zh-CN';
  if(S.theme!=='dark')S.theme='light';document.documentElement.dataset.theme=S.theme;
  if(S.view==='approvals'&&isPMO())S.view='pmo';
  if(!VIEWS[S.view]) S.view='dashboard';
  const u=me();const tt=TITLES()[S.view]||['',''];
  const segs=`<div class="seg"><button data-act="lang" data-l="zh" class="${S.lang==='zh'?'on':''}">中文</button><button data-act="lang" data-l="en" class="${S.lang==='en'?'on':''}">EN</button></div><div class="seg theme-seg" role="group" aria-label="${T('主题','Theme')}"><button data-act="theme" data-t="light" class="${S.theme==='light'?'on':''}" aria-pressed="${S.theme==='light'}" title="${T('浅色','Light')}">${ico('sun')}<span class="sr-only">${T('浅色','Light')}</span></button><button data-act="theme" data-t="dark" class="${S.theme==='dark'?'on':''}" aria-pressed="${S.theme==='dark'}" title="${T('深色','Dark')}">${ico('moon')}<span class="sr-only">${T('深色','Dark')}</span></button></div>`;
  const nav=navHTML();
  $('#app').innerHTML=`<a class="skip" href="#content">${T('跳到主要内容','Skip to main content')}</a>
  <header class="pmo-bar">
    <button class="menu-btn" data-act="menu" aria-label="${T('打开菜单','Open menu')}" aria-controls="side">${ico('menu')}</button>
    <img class="logo logo-g" src="${LOGO.grey}" alt="BYD Service"><img class="logo logo-w" src="${LOGO.white}" alt="BYD Service">
    <span class="vdiv"></span>
    <div class="pmo-id"><span class="pmo-badge" aria-hidden="true">PMO</span><div class="pmo-t"><b>${T('售后项目管理中心','After-sales Project Management Office')}</b><small title="${esc(T(ORG.zh,ORG.en))}">${esc(T(ORG.zh,ORG.en))}</small></div></div>
    <span class="sp"></span>
    <div class="search" role="search">${ico('search')}<input id="q" type="search" placeholder="${T('搜索编号 / 项目名称','Search code or name')}" aria-label="${T('搜索项目（快捷键 /）','Search projects (shortcut /)')}" autocomplete="off" aria-controls="qres"><kbd class="kbd-hint" aria-hidden="true">/</kbd><div class="res" id="qres" role="listbox" aria-label="${T('搜索结果','Search results')}" hidden></div></div>
    <div class="bar-tools">${segs}</div>
    <div class="who" style="padding:4px 12px 4px 4px"><span class="av">${esc(viewBadge())}</span><span class="who-l"><small>${T('登录账号','Signed in')}</small><b style="font-size:13px">${esc(me().name)}</b></span></div>
  </header>
  <div class="shell">
  <nav class="side" id="side" aria-label="${T('主菜单','Main menu')}">
    <div class="side-tools">${segs}</div>
    ${nav}
    <div class="side-foot"><div>${T('登录账号','Signed in')}${CO()}<b style="color:var(--ink-2)">${esc(u.name)}</b>${u.alsa?` · <span class="tag" style="font-size:11px">ALSA</span>`:''}</div><div>${T('今天','Today')} <span class="num">${today()}</span>${S.simToday?` · <b style="color:var(--warn)">${T('模拟日期','simulated')}</b>`:''}</div><div class="row" style="gap:4px"><button class="btn ghost sm" style="padding-left:0" data-act="signout">${T('退出登录','Sign out')}</button><button class="btn ghost sm" data-act="keys" aria-haspopup="dialog">${ico('kbd')}${T('快捷键','Shortcuts')}<kbd class="kbd-hint">?</kbd></button></div></div>
  </nav>
  <main class="main" id="main">${bannersHTML()}
    ${heroOn()?`<div class="page-h hero hero-${S.bg.split('-')[1]}"><div class="hero-bg" style="background-image:url(${BG[S.bg.split('-')[1]]})"></div><div>${backHTML()}<div class="crumb">PMO / ${esc(tt[1])}</div><h1>${esc(tt[0])}</h1><p class="hero-sub">${greet()}${CM()}${esc(me().name)} · ${T('今天是','Today is')} <span class="num">${realToday()}</span>${S.simToday&&S.simToday!==realToday()?` · <b style="color:var(--warn)">${T('模拟日期','simulated')} ${esc(S.simToday)}</b>`:''}</p></div></div>`:`<div class="page-h"><div>${backHTML()}<div class="crumb">PMO / ${esc(tt[1])}</div><h1>${esc(tt[0])}</h1></div></div>`}
    <div class="content" id="content" tabindex="-1">${VIEWS[S.view]()}</div>
  </main></div><div id="drawer"></div>`;
  renderDrawer();
  if(VIEWS_AFTER[S.view]) VIEWS_AFTER[S.view]();
}
// replace: leave a screen without recording it (e.g. a submitted form), so Back skips it
function go(v,extra,replace){if(v==='approvals'&&isPMO())v='pmo';if(!replace&&(v!==S.view||S.drawer||(S.view==='alsa'&&S.filters.alsaForm)))navPush();S.view=v;if(v!=='alsa'){S.filters.alsaForm=false;S.filters.alsaEdit=null}if(extra)Object.assign(S.filters,extra);S.drawer=null;save();render();window.scrollTo(0,0);const sd=$('#side');sd&&sd.classList.remove('open')}

/* ---------- dashboard ---------- */
// the badge next to the view switcher names the team, not the person (managers change, team codes do not)
function viewBadge(){if(isPMO())return 'PMO';const t=scopeTeams();if(!t.length)return alsaRoleOf(me().id)?'ALSA':T('只读','VIEW');return t.length>1?t[0]+'+':t[0]}
function scopeLabel(){return true?T(`全部 ${S.teams.length} 个团队`,`All ${S.teams.length} teams`):[...myTeams().map(tName),...mySecs().map(secLabel)].join(' · ')}
// Everyone may read every project, but the dashboard opens on the person's own team(s); one click widens it to all teams.
const hasOwnScope=()=>!isPMO()&&scopeTeams().length>0;
const dashMode=()=>hasOwnScope()?(S.filters.dash||'mine'):'all';
function dashboardClassic(opt){
  opt=opt||{};
  const mineOn=dashMode()==='mine';
  const P=mineOn?visP():viewP(),F=mineOn?visF():viewF(),t=today(),Y=yr(t),Q=qOf(t);
  const inf=P.filter(p=>INFLIGHT.includes(p.status));
  const reg=inf.filter(p=>team(p.team).group==='R').length,cen=inf.length-reg;
  const fo=F.filter(f=>f.status==='open');const fc=k=>fo.filter(f=>f.ftype===k).length;
  const started=P.filter(p=>yr(p.start)===Y).length;
  const closedY=P.filter(p=>p.status==='closed'&&!isStaleClosed(p)&&yr(p.closedAt)===Y); // legacy projects closed by rule are not delivery closures
  const qc=[1,2,3,4].map(q=>closedY.filter(p=>qOf(p.closedAt)===q).length);
  const qs=`${Y}-${String((Q-1)*3+1).padStart(2,'0')}-01`,qe=addDays(Q===4?`${Y+1}-01-01`:`${Y}-${String(Q*3+1).padStart(2,'0')}-01`,-1);
  const dueQ=inf.filter(p=>p.end&&p.end>=qs&&p.end<=qe).sort((a,b)=>a.end.localeCompare(b.end));
  const warn=inf.filter(p=>pLevel(p)==='high');
  const k=(l,v,s,act,cls='')=>`<button class="kpi ${cls}" ${act}><span class="l">${l}</span><span class="v">${v}</span><span class="s">${s}</span></button>`;
  // quarterly chart
  const W=420,H=190,pl=28,pb=26,pt=16,mx=Math.max(4,...qc);const step=mx<=8?2:mx<=20?5:10;const top=Math.ceil(mx/step)*step;
  const bw=46,gap=(W-pl-4*bw)/4;
  let svg=`<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${T('各季度关闭项目数','Projects closed per quarter')}">`;
  for(let v=0;v<=top;v+=step){const y=pt+(H-pt-pb)*(1-v/top);svg+=`<line class="grid-l" x1="${pl}" x2="${W}" y1="${y}" y2="${y}"/><text x="${pl-6}" y="${y+4}" text-anchor="end">${v}</text>`}
  qc.forEach((v,i)=>{const x=pl+gap/2+i*(bw+gap),h=(H-pt-pb)*v/top,y=H-pb-h;const cur=i+1===Q;
    svg+=`<g data-tip="Q${i+1} ${Y}：${T('关闭','closed')} ${v}"><rect x="${x-8}" y="${pt}" width="${bw+16}" height="${H-pt-pb}" fill="transparent"/>${v?`<path d="M${x},${H-pb} V${y+4} Q${x},${y} ${x+4},${y} H${x+bw-4} Q${x+bw},${y} ${x+bw},${y+4} V${H-pb} Z" fill="var(--s1)" opacity="${cur?1:.75}"/>`:''}<text x="${x+bw/2}" y="${y-6}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${v}</text><text x="${x+bw/2}" y="${H-8}" text-anchor="middle" ${cur?'style="fill:var(--ink);font-weight:600"':''}>Q${i+1}${cur?' · '+T('本季','now'):''}</text></g>`});
  svg+=`<line class="axis" x1="${pl}" x2="${W}" y1="${H-pb}" y2="${H-pb}"/></svg>`;
  // status by group
  const SS=['active','to_report','not_started','on_hold'],SC={active:'var(--s1)',to_report:'var(--s2)',not_started:'var(--s3)',on_hold:'var(--s4)'};
  const stackRow=(label,arr)=>{const tot=arr.length||1;return `<div style="display:grid;grid-template-columns:86px 1fr 36px;gap:10px;align-items:center"><span class="small muted">${esc(label)}</span><div class="stack" style="height:14px">${SS.map(s=>{const n=arr.filter(p=>p.status===s).length;return n?`<i style="width:${100*n/tot}%;background:${SC[s]}" data-tip="${esc(label)} · ${esc(T(ST[s].zh,ST[s].en))}：${n}"></i>`:''}).join('')}</div><b class="num" style="text-align:right">${arr.length}</b></div>`};
  const teams=mineOn?scopeTeams():allTeams();
  const trow=c=>{const ps=P.filter(p=>p.team===c),i=ps.filter(p=>INFLIGHT.includes(p.status));const tot=i.length||1;
    return `<tr class="click" data-act="go" data-v="projects" data-team="${c}"><td><span class="mono">${c}</span></td><td>${esc(tName(c))}${!isPMO()&&!canTeam(c)?`<span class="small faint">${esc(T(`（${secsFor(c).map(secName).join('、')}）`,` (${secsFor(c).map(secName).join(', ')})`))}</span>`:''}</td><td><div class="stack">${SS.map(s=>{const n=i.filter(p=>p.status===s).length;return n?`<i style="width:${100*n/tot}%;background:${SC[s]}" data-tip="${esc(T(ST[s].zh,ST[s].en))}：${n}"></i>`:''}).join('')||''}</div></td><td class="num">${i.length}</td><td class="num">${i.filter(p=>p.status==='active').length}</td><td class="num">${ps.filter(p=>p.status==='closed'&&!isStaleClosed(p)&&yr(p.closedAt)===Y).length}</td><td class="num">${F.filter(f=>f.team===c&&f.status==='open').length}</td><td class="num">${i.filter(p=>pLevel(p)==='high').length?`<span style="color:var(--bad);font-weight:600">${i.filter(p=>pLevel(p)==='high').length}</span>`:'0'}</td></tr>`};
  const li=p=>`<div class="li" data-act="open" data-id="${p.id}"><span class="mono small faint" style="width:84px;flex:none">${p.code}</span><div class="grow"><div class="ttl">${esc(p.name)}</div><div class="small faint">${esc(tName(p.team))} · ${esc(p.pic||'—')}</div></div>`;
  return `${opt.pmo?'':`
  <div class="row">${hasOwnScope()?`<div class="seg" role="group" aria-label="${T('看板范围','Dashboard scope')}"><button class="${mineOn?'on':''}" data-act="dscope" data-v="mine">${esc(T('我的团队','My team'))} · ${esc(scopeTeams().join(' '))}</button><button class="${mineOn?'':'on'}" data-act="dscope" data-v="all">${T(`全部 ${S.teams.length} 个团队`,`All ${S.teams.length} teams`)}</button></div>`:`<div class="muted">${T('范围','Scope')}${CO()}<b style="color:var(--ink)">${esc(scopeLabel())}</b></div>`}<div class="muted">${T('统计日期','As of')} <span class="num">${t}</span></div><span class="sp" style="flex:1"></span>${isPMO()?`<button class="btn" data-act="go" data-v="approvals">${T('待我审批','Waiting for me')} <span class="badge">${inboxCount()}</span></button>`:''}<button class="btn pri" data-act="go" data-v="apply">${ico('apply')}${isPMO()?T('新建项目','New project'):T('新项目申请','New project')}</button></div>
  ${bwBanner()}
  ${spCard()}`}
  ${opt.noKpi?'':`<div class="kpis">
    ${k(T('在管项目','Open projects'),inf.length,`${T('区域','Regions')} ${reg} · ${T('中台','Back-office')} ${cen}`,'data-act="go" data-v="projects" data-st="inflight"')}
    ${k(T('进行中','In progress'),inf.filter(p=>p.status==='active').length,`${T('待结项汇报','Awaiting close')} ${inf.filter(p=>p.status==='to_report').length} · ${T('暂停','On hold')} ${inf.filter(p=>p.status==='on_hold').length}`,'data-act="go" data-v="projects" data-st="active"')}
    ${k(T('跟进项','Follow-ups'),fo.length,`${T('孵化','Incub.')} ${fc('incubate')} · ${T('监控','Monitor')} ${fc('monitor')} · ${T('结项后','Post-close')} ${fc('postclose')}`,'data-act="go" data-v="follows"')}
    ${k(T('ALSA 战略项目','ALSA projects'),P.filter(p=>p.alsa&&INFLIGHT.includes(p.status)).length,`${T('审批中','In ALSA vote')} ${(S.alsa||[]).filter(a=>a.status==='voting'&&canSee(a)).length} · ${T('季度会议设立','set at quarterly meetings')}`,'data-act="go" data-v="alsa"')}
    ${k(T(`${Y} 年立项 / 关闭`,`${Y} started / closed`),`${started}<span class="faint" style="font-size:.6em"> / ${closedY.length}</span>`,`Q1 ${qc[0]} · Q2 ${qc[1]} · Q3 ${qc[2]} · Q4 ${qc[3]} ${T('关闭','closed')}`,'data-act="go" data-v="projects" data-st="all" data-y="'+Y+'"')}
    ${k(T('预警项目','Red flags'),warn.length,T('含高风险项的在管项目','Open projects with a high risk'),'data-act="go" data-v="risks"','alert')}
  </div>`}
  ${opt.pmo?'':focusTable(inf.filter(p=>p.status==='active'))}
  <div class="grid g-7-5">
    <div class="card"><div class="card-h"><h2>${T(`${Y} 年各季度关闭项目`,`Projects closed per quarter, ${Y}`)}</h2><span class="sp"></span><span class="small faint">${T('关闭日期以实际完成时间为准，原表缺失时按计划完成时间计','Uses actual completion date, or planned end where the old sheet had none')}</span></div><div class="card-b">${svg}</div></div>
    <div class="card"><div class="card-h"><h2>${T('在管项目：区域 vs 中台','Open projects: regions vs back-office')}</h2></div><div class="card-b" style="display:flex;flex-direction:column;gap:14px">
      ${stackRow(gName('R'),inf.filter(p=>team(p.team).group==='R'))}${stackRow(gName('C'),inf.filter(p=>team(p.team).group==='C'))}
      <div class="legend">${SS.map(s=>`<span><i style="background:${SC[s]}"></i>${esc(T(ST[s].zh,ST[s].en))}</span>`).join('')}</div>
      <div class="note small">${T('区域 = 13 个英文团队（含客户关怀、售后培训）；中台 = 中文支持部门及服务工程部各科室。','Regions = the 13 English-speaking teams (incl. Customer Care and Training); Back-office = the Chinese support departments and Service Engineering sections.')}</div>
    </div></div>
  </div>
  ${opt.pmo?'':`  <div class="grid g2">
    <div class="card"><div class="card-h"><h2>${T(`本季度（Q${Q}）需完成`,`Due this quarter (Q${Q})`)}</h2><span class="tag">${dueQ.length}</span><span class="sp"></span><span class="small faint num">${qs} → ${qe}</span></div>
      <div class="list" style="max-height:340px;overflow:auto">${dueQ.length?dueQ.map(p=>li(p)+`<div style="text-align:right;flex:none"><div class="small num ${p.end<t?'':'muted'}" style="${p.end<t?'color:var(--bad);font-weight:600':''}">${p.end}</div>${pill(p.status)}</div></div>`).join(''):`<div class="empty">${T('本季度没有到期项目','Nothing due this quarter')}</div>`}</div></div>
    <div class="card"><div class="card-h"><h2>${T('预警项目','Red-flag projects')}</h2><span class="tag">${warn.length}</span><span class="sp"></span><button class="btn sm" data-act="go" data-v="risks">${T('查看风险清单','Open risk list')}</button></div>
      <div class="list" style="max-height:340px;overflow:auto">${warn.length?warn.map(p=>{const r=mainRisk(p);return li(p)+`<div style="text-align:right;flex:none;max-width:42%"><span class="pill p-high">${ico('tri')} ${esc(T(RISK_CAT[r.cat].zh,RISK_CAT[r.cat].en))}</span><div class="small faint" style="margin-top:2px">${esc(r.title)}</div></div></div>`}).join(''):`<div class="empty">${T('没有预警项目','No red flags')}</div>`}</div></div>
  </div>`}
  <div class="card"><div class="card-h"><h2>${T('各团队概况','By team')}</h2><span class="sp"></span><div class="legend">${SS.map(s=>`<span><i style="background:${SC[s]}"></i>${esc(T(ST[s].zh,ST[s].en))}</span>`).join('')}</div></div>
    <div class="tw"><table class="t"><thead><tr><th>${T('代码','Code')}</th><th>${T('团队','Team')}</th><th style="width:28%">${T('在管项目状态','Open by status')}</th><th>${T('在管','Open')}</th><th>${T('进行中','Active')}</th><th>${T(`${Y} 关闭`,`Closed ${Y}`)}</th><th>${T('跟进项','Follow-ups')}</th><th>${T('预警','Red flags')}</th></tr></thead><tbody>
    ${['R','C'].map(g=>{const cs=teams.filter(c=>team(c).group===g);return cs.length?`<tr><td colspan="8" style="background:var(--surface-2);font-weight:600;font-size:12px;color:var(--ink-2)">${esc(gName(g))}</td></tr>`+cs.map(trow).join(''):''}).join('')}
    </tbody></table></div></div>`;
}

function nextMs(p){return (p.milestones||[]).filter(m=>!m.done&&m.due).sort((a,b)=>a.due.localeCompare(b.due))[0]}
/* ---------- PMO daily review ----------
   A PMO reviews exceptions, not every project: the numbers on top are things to act on, the list below holds only projects that need
   attention (with the reason), and "Reviewed" hides a project for 7 days unless something new or worse shows up. */
const EX_KEYS=['overdue','reported','bwdue','closing','silent','behind','ext','toreport','hold','other'];
const EX_LBL=()=>({overdue:T('逾期 / 超期','Overdue or past end'),reported:T('上报受阻 / 有风险','Reported blocked / at risk'),bwdue:T('双周更新未交','Update missing'),closing:T('14 天内到期','Closing in 14 days'),silent:T('30 天无更新','No update 30d+'),behind:T('进度落后','Behind plan'),ext:T('频繁延期','Repeated extensions'),toreport:T('待结项汇报','Awaiting close review'),hold:T('暂停待决定','Paused, decision needed'),other:T('其他风险','Other risks')});
const EX_MAP={delivery:'overdue',closure:'overdue',reported:'reported',deadline:'closing',silence:'silent',schedule:'behind',extension:'ext',resource:'other',stalled:'other'};
const LVN={high:0,mid:1,low:2};
function pmoExceptions(){
  const t=today(),holds=new Map(holdList().filter(h=>h.due).map(h=>[h.pid,h])),out=[];
  for(const p of S.projects){
    if(!canView(p)||!['active','not_started','to_report','on_hold'].includes(p.status))continue;
    const rs=[];
    risksOf(p).forEach(r=>rs.push({k:EX_MAP[r.cat]||'other',level:r.level,title:r.title,detail:r.detail||''}));
    if(needsBW(p)){const per=periodOf(trackOf(p.team),t);if(!updFor(p,per)&&diff(per.due,t)<=2){const dd=diff(per.due,t);
      rs.push({k:'bwdue',level:dd<0?'high':'mid',title:T(`${md(per.meet)} 会议的双周更新还没提交`,`Update for the ${md(per.meet)} meeting not posted`),detail:T(`截止 ${md(per.due)} 13:00（阿姆斯特丹）`,`Due ${md(per.due)} 13:00 Amsterdam`)})}}
    if(p.status==='to_report')rs.push({k:'toreport',level:'mid',title:T('等待结项汇报','Waiting for the close review'),detail:''});
    if(p.status==='on_hold'&&holds.has(p.id))rs.push({k:'hold',level:'mid',title:T('暂停太久，需要决定','Paused too long; needs a decision'),detail:(holds.get(p.id).why||[]).join('；')});
    if(!rs.length)continue;
    const level=rs.reduce((a,r)=>LVN[r.level]<LVN[a]?r.level:a,'low');
    const sig=rs.map(r=>r.k).sort().join(',')+'|'+level;
    const rv=(S.reviews||{})[p.id];
    const live=!!rv&&rv.until>=t;                       // a review counts for 7 days, and only while nothing new or worse appeared
    const od=Math.max(0,...(p.milestones||[]).filter(m=>!m.done&&m.due&&m.due<t).map(m=>diff(t,m.due)));
    out.push({p,rs,level,sig,reviewed:live&&rv.sig===sig,changed:live&&rv.sig!==sig,od});
  }
  return out.sort((a,b)=>LVN[a.level]-LVN[b.level]||b.od-a.od||a.p.code.localeCompare(b.p.code));
}
function pmoDashboard(){
  const f=S.filters,t=today(),all=pmoExceptions();
  const showRev=!!f.pxrev,pool=all.filter(x=>showRev?x.reviewed:!x.reviewed),nRev=all.filter(x=>x.reviewed).length;
  // the list opens on the high-level items only (the daily review); Medium, Low or All are one click away. The numbers on top count every level.
  const lvSel=f.pxl===undefined?'high':f.pxl,poolL=pool.filter(x=>!lvSel||x.level===lvSel);
  const cnt=k=>pool.filter(x=>x.rs.some(r=>r.k===k)).length,cntL=k=>poolL.filter(x=>x.rs.some(r=>r.k===k)).length,sel=f.pxr||'',g=f.pxg||'',q=(f.pxq||'').trim().toLowerCase();
  const teamsIn=allTeams().filter(c=>poolL.some(x=>x.p.team===c&&(!g||team(c).group===g)));
  const tm=teamsIn.includes(f.pxt)?f.pxt:'';
  const rows=poolL.filter(x=>(!sel||x.rs.some(r=>r.k===sel))&&(!g||team(x.p.team).group===g)&&(!tm||x.p.team===tm)&&(!q||(x.p.code+' '+x.p.name+' '+(x.p.pic||'')).toLowerCase().includes(q)));
  const lim=f.pxall?9999:40,shown=rows.slice(0,lim),LB=EX_LBL();
  const tile=(label,v,sub,attr,hot,k)=>`<button type="button" class="kpi ${hot&&v?'alert':''}" ${attr} data-from-tile="1" style="${k&&sel===k?'border-color:var(--accent);background:var(--accent-soft)':''}"><span class="l">${label}</span><span class="v">${v}</span><span class="s">${sub}</span></button>`;
  const tiles=`<div class="kpis">${tile(T('待我审批','Waiting for me'),inboxCount(),T('申请、结项汇报、待办','Requests, close reviews, tasks'),'data-act="go" data-v="approvals"',true)}${tile(T('逾期 / 超期','Overdue'),cnt('overdue'),T('节点逾期或过了计划完成日','Milestone or end date passed'),'data-act="pxset" data-r="overdue"',true,'overdue')}${tile(T('上报受阻 / 有风险','Blocked or at risk'),cnt('reported'),T('负责人在双周更新里上报','Reported by the owner'),'data-act="pxset" data-r="reported"',true,'reported')}${tile(T('双周更新未交','Update missing'),cnt('bwdue'),T('会前 7 天内还没提交','Meeting within 7 days'),'data-act="pxset" data-r="bwdue"',false,'bwdue')}${tile(T('14 天内到期','Closing in 14 days'),cnt('closing'),T('仍有未交付的节点','Open deliverables left'),'data-act="pxset" data-r="closing"',false,'closing')}${tile(T('30 天无更新','No update 30d+'),cnt('silent'),T('看板无法反映真实进展','Board is blind to progress'),'data-act="pxset" data-r="silent"',false,'silent')}</div>`;
  const chip=(k,l,n)=>`<button type="button" class="chk" style="${(sel||'')===k?'border-color:var(--accent);background:var(--accent-soft);color:var(--accent)':''}" data-act="pxset" data-r="${k}">${esc(l)} <b class="num">${n}</b></button>`;
  const chips=chip('',T('全部原因','Any reason'),poolL.length)+EX_KEYS.filter(k=>cntL(k)||sel===k).map(k=>chip(k,LB[k],cntL(k))).join('');
  const lvSeg=`<div class="seg" role="group" aria-label="${T('等级','Level')}">${[['high',T('高','High')],['mid',T('中','Medium')],['low',T('低','Low')],['',T('全部等级','All levels')]].map(([k,l])=>`<button data-act="fset" data-k="pxl" data-val="${k}" class="${lvSel===k?'on':''}">${l}${k?` <b class="num">${pool.filter(x=>x.level===k).length}</b>`:` <b class="num">${pool.length}</b>`}</button>`).join('')}</div>`;
  const nm=p=>{const m=nextMs(p);if(!m)return `<span class="small faint">${T('交付物已全部提交','All submitted')}</span>`;const d=diff(m.due,t);return `<div class="small">${esc(m.name)}</div><div class="small num" style="color:${d<0?'var(--bad)':d<=7?'var(--warn)':'var(--ink-3)'}">${m.due} · ${d<0?T(`逾期 ${-d} 天`,`${-d}d overdue`):T(`${d} 天后`,`in ${d}d`)}</div>`};
  const why=x=>x.rs.slice().sort((a,b)=>LVN[a.level]-LVN[b.level]).slice(0,3).map(r=>`<div style="margin-bottom:4px"><span class="pill p-${r.level}">${esc(LB[r.k])}</span> <span class="small">${esc(r.title)}</span>${r.detail?`<div class="small faint bw-sum" style="max-width:340px" title="${esc(r.detail)}">${esc(r.detail)}</div>`:''}</div>`).join('')+(x.rs.length>3?`<div class="small faint">${T(`另有 ${x.rs.length-3} 项`,`${x.rs.length-3} more`)}</div>`:'');
  const row=x=>{const pm=pxMail(x.p);return `<tr class="click" data-act="open" data-id="${x.p.id}"><td>${lvPill(x.level)}${x.changed?`<div class="small" style="color:var(--warn);margin-top:4px">${T('看过后有新情况','New since review')}</div>`:''}</td><td class="nm"><div>${x.p.alsa?'<span class="alsa-tag">ALSA</span> ':''}<span class="mono small faint">${x.p.code}</span> ${esc(x.p.name)}</div><div class="small faint">${tag(x.p.team)} · ${esc(x.p.pic||'—')}${isDeparted(x.p.pic)?` <span class="pill p-high">${T('已离职','left')}</span>`:''}</div></td><td style="min-width:260px">${why(x)}</td><td style="min-width:170px">${bwCell(x.p)}</td><td style="min-width:200px">${nm(x.p)}</td><td style="white-space:nowrap"><button type="button" class="btn sm" data-act="pxnotify" data-id="${x.p.id}" data-tip="${T('打开邮件窗口：改收件人和内容后直接发送','Opens the email editor: change recipients and text, then send')}">${ico('mail')}${pm.pend.length?T('打开待发送草稿','Open the draft'):pm.sent?T('再写一封','Write another'):T('写邮件并发送','Write and send email')}</button> <button type="button" class="btn sm ${x.reviewed?'':'ghost'}" data-act="pxrev" data-id="${x.p.id}" data-tip="${x.reviewed?T('取消「已看过」','Undo reviewed'):T('7 天内不再出现，除非有新情况','Hidden for 7 days unless something new or worse shows up')}">${x.reviewed?T('撤销','Undo'):T('已看过','Reviewed')}</button>${pm.sent?`<div class="small faint" style="margin-top:4px">${T('已发邮件','Emailed')} ${md(mailTs(pm.sent).slice(0,10))}</div>`:''}${pm.pend.length?`<div class="small" style="color:var(--warn);margin-top:4px">${T('有草稿待发送','Draft waiting')}</div>`:''}</td></tr>`};
  // one entry of the list: level, project, why, next milestone, and the two quick actions
  const li=x=>{const pm=pxMail(x.p),m=nextMs(x.p),d=m?diff(m.due,t):null;
    return `<div class="fl-i" data-act="open" data-id="${x.p.id}"><div class="fl-h">${lvPill(x.level)}<span class="mono small faint">${x.p.code}</span><b class="fl-n">${x.p.alsa?'<span class="alsa-tag">ALSA</span> ':''}${esc(x.p.name)}</b></div>
      <div class="small faint">${tag(x.p.team)} ${esc(x.p.pic||'—')}${isDeparted(x.p.pic)?` <span class="pill p-high">${T('已离职','left')}</span>`:''}${m?` · <span style="color:${d<0?'var(--bad)':d<=7?'var(--warn)':'var(--ink-3)'}">${esc(m.name.length>34?m.name.slice(0,34)+'…':m.name)} ${d<0?T(`逾期 ${-d} 天`,`${-d}d late`):T(`${d} 天后`,`in ${d}d`)}</span>`:''}</div>
      <div class="fl-why">${x.rs.slice().sort((a,b)=>LVN[a.level]-LVN[b.level]).slice(0,2).map(r=>`<div class="small"><span class="pill p-${r.level}">${esc(LB[r.k])}</span> ${esc(r.title)}</div>`).join('')}${x.rs.length>2?`<div class="small faint">${T(`另有 ${x.rs.length-2} 项`,`${x.rs.length-2} more`)}</div>`:''}${x.changed?`<div class="small" style="color:var(--warn)">${T('看过后有新情况','New since review')}</div>`:''}</div>
      <div class="fl-a"><button type="button" class="btn sm" data-act="pxnotify" data-id="${x.p.id}" data-tip="${T('打开邮件窗口：改收件人和内容后直接发送','Opens the email editor: change recipients and text, then send')}">${ico('mail')}${pm.pend.length?T('草稿','Draft'):pm.sent?T('再写一封','Again'):T('写邮件','Email')}</button><button type="button" class="btn sm ${x.reviewed?'':'ghost'}" data-act="pxrev" data-id="${x.p.id}" data-tip="${x.reviewed?T('取消「已看过」','Undo reviewed'):T('7 天内不再出现，除非有新情况','Hidden for 7 days unless something new or worse shows up')}">${x.reviewed?T('撤销','Undo'):T('已看过','Reviewed')}</button>${pm.sent?`<span class="small faint">${T('已发邮件','Emailed')} ${md(mailTs(pm.sent).slice(0,10))}</span>`:''}</div></div>`};
  const rsel=`<select id="pxR" aria-label="${T('原因','Reason')}"><option value="">${T('全部原因','Any reason')}</option>${EX_KEYS.filter(k=>cntL(k)||sel===k).map(k=>`<option value="${k}" ${sel===k?'selected':''}>${esc(LB[k])} (${cntL(k)})</option>`).join('')}</select>`;
  const fcard=`<div class="card fl" id="pxlist"><div class="card-h"><h2>${showRev?T('已看过的项目','Reviewed projects'):T('今日关注清单','Needs attention today')}</h2><span class="tag">${rows.length}</span><span class="sp"></span>
      <button type="button" class="btn sm ${showRev?'pri':''}" data-act="fset" data-k="pxrev" data-val="${showRev?'':'1'}">${showRev?T('返回待处理','Back'):T(`已看过 (${nRev})`,`Reviewed (${nRev})`)}</button></div>
    <div class="small faint" style="padding:0 14px 6px">${T('统计日期','As of')} <span class="num">${t}</span> · ${T(`${all.filter(x=>!x.reviewed).length} 个项目有待处理事项`,`${all.filter(x=>!x.reviewed).length} projects need attention`)}</div>
    <div class="card-h filters" style="border-bottom:0;padding-top:0">${lvSeg}</div>
    <div class="card-h filters" style="border-bottom:1px solid var(--line-2);padding-top:0">${rsel}<select id="pxT" aria-label="${T('团队','Team')}"><option value="">${T('全部团队','All teams')}</option>${teamsIn.map(c=>`<option value="${c}" ${tm===c?'selected':''}>${esc(c)}</option>`).join('')}</select><input type="search" id="pxQ" aria-label="${T('搜索','Search')}" placeholder="${T('编号 / 名称 / 负责人','Code / name / owner')}" value="${esc(f.pxq||'')}"></div>
    <div class="fl-list">${shown.map(li).join('')||`<div class="empty" style="padding:20px">${showRev?T('还没有标为已看过的项目','Nothing marked as reviewed'):(pool.length?(poolL.length?T('当前筛选下没有项目','Nothing matches these filters'):T('这个等级下没有项目，可以切换到「中」「低」或「全部等级」','Nothing at this level; try Medium, Low or All levels')):T('今天没有需要处理的事项','Nothing needs attention today'))}</div>`}
    ${rows.length>shown.length?`<div style="padding:10px 14px"><button type="button" class="btn sm" data-act="fset" data-k="pxall" data-val="1">${T(`显示全部 ${rows.length} 个`,`Show all ${rows.length}`)}</button></div>`:''}</div></div>`;
  return `${bwBanner()}
  ${tiles}
  <div class="board2"><div class="pf">${dashboardClassic({pmo:true,noKpi:true})}</div>${fcard}</div>`;
}
function dashboard(){return isPMO()?pmoDashboard():dashboardClassic()}
// "Email owner": prepares a draft in the mail center (PMO still reviews and sends it)
// what has already happened for a project: drafts waiting in Email reminders, and the latest mail that went out in the last 7 days
const pxMail=p=>{const t=today();
  const pend=S.mails.filter(m=>isDraft(m)&&m.ref===p.id);
  const sent=S.mails.filter(m=>!isDraft(m)&&(m.status==='sent'||m.status==='queued')&&m.ref===p.id&&diff(t,mailTs(m).slice(0,10))<=7).sort((a,b)=>mailTs(b).localeCompare(mailTs(a)))[0]||null;
  return {pend,sent}};
function pxNotify(id){
  const x=pmoExceptions().find(y=>y.p.id===id);if(!x)return;const p=x.p;
  const pm=pxMail(p);
  if(pm.pend.length){reviewOpen([(pm.pend.find(m=>m.rule==='custom')||pm.pend[0]).id]);return}   // a draft already waits for this project: open that one
  if(pm.sent&&!confirm(T(`这个项目 ${mailTs(pm.sent).slice(0,10)} 已经发过邮件（${pm.sent.subject}）。还要再写一封吗？`,`An email about this project already went out on ${mailTs(pm.sent).slice(0,10)} (${pm.sent.subject}). Write another?`)))return;
  const mg=mgrOfP(p),LB=EX_LBL(),lines=x.rs.slice(0,5).map(r=>`· ${LB[r.k]}: ${r.title}${r.detail?' — '+r.detail:''}`).join('\n');
  const m=sendMail({to:[p.pic,...(p.exec||[])].filter(Boolean),cc:mg&&mg.name!==p.pic?[mg.name]:[],subject:`[${p.code}] ${T('请跟进','Please follow up')}`,
    body:`${p.pic||''}${CM()}${T('您好','Hello')}\n\n${T('项目','Project')} ${p.code}「${p.name}」${T('需要您关注：','needs your attention:')}\n${lines}\n\n${T('请在系统里更新进展，或提交变更申请。','Please update the progress in the system or file a change request.')}${sig()}`,rule:'custom',ref:p.id});
  // people with no email address on file are left out (and named in the editor), so an urgent mail is not blocked by a missing address
  m.dropped=[...m.to,...m.cc].filter(r=>!r.e).map(r=>r.n);
  if(m.to.some(r=>r.e))m.to=m.to.filter(r=>r.e);
  m.cc=m.cc.filter(r=>r.e);
  save();reviewOpen([m.id]);          // straight into the editor: change recipients and text, then send
}
document.addEventListener('toggle',e=>{if(e.target&&e.target.id==='pxPort'){S.filters.pxport=e.target.open}},true);
document.addEventListener('keydown',e=>{if(S.view!=='review'||S.drawer||e.altKey||e.ctrlKey||e.metaKey)return;const tg=(document.activeElement||{}).tagName;if(/INPUT|TEXTAREA|SELECT/.test(tg))return;
  const R=S.filters.rv;if(!R)return;if(e.key==='ArrowRight'&&R.i<rvItems(R).length-1){R.i++;save();render();window.scrollTo(0,0);e.preventDefault()}else if(e.key==='ArrowLeft'&&R.i>0){R.i--;save();render();window.scrollTo(0,0);e.preventDefault()}});
document.addEventListener('change',e=>{const id=e.target&&e.target.id;if(id==='rvT'||id==='rvO'||id==='rvS'){const R=S.filters.rv;if(R){R[id==='rvT'?'team':id==='rvO'?'owner':'stat']=e.target.value;R.i=0;save();render()}return}if(e.target&&e.target.id==='pxT'){S.filters.pxt=e.target.value;save();render()}if(e.target&&e.target.id==='pxR'){S.filters.pxr=e.target.value;S.filters.pxall='';save();render()}});
document.addEventListener('input',e=>{const el=e.target;if(!el||el.id!=='pxQ')return;S.filters.pxq=el.value;const pos=el.selectionStart;$('#content').innerHTML=dashboard();enhance($('#content'));const n=$('#pxQ');if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(_){}}});

function focusTable(A){
  const ord={high:0,mid:1,low:2,null:3};const t=today();
  A=[...A].sort((a,b)=>(b.alsa?1:0)-(a.alsa?1:0)||ord[pLevel(a)]-ord[pLevel(b)]||String(a.end).localeCompare(String(b.end)));
  return `<div class="card focus"><div class="card-h"><h2>${T('进行中项目 · 重点关注','In-progress projects · focus list')}</h2><span class="tag">${A.length}</span><span class="sp"></span><span class="small faint">${T('ALSA 项目置顶，其余按风险等级和完成时间排序','ALSA first, then by risk and end date')}</span><button class="btn sm" data-act="go" data-v="gantt">${T('看甘特图','Open Gantt')}</button></div>${ctxHint()}
  <div class="tw" style="max-height:470px"><table class="t"><thead><tr><th>${T('编号','Code')}</th><th>${T('项目','Project')}</th><th>${T('团队','Team')}</th><th>${T('负责人','Owner')}</th><th>${T('下一个节点 / 交付物','Next milestone')}</th><th>${T('交付进度','Delivered')}</th><th>${T('最新进展','Latest update')}</th><th>${T('计划完成','End')}</th><th>${T('风险','Risk')}</th></tr></thead><tbody>
  ${A.map(p=>{const m=nextMs(p);const d=m?diff(m.due,t):null;const de=p.end?diff(p.end,t):null;return `<tr class="click" data-act="open" data-id="${p.id}"><td class="mono">${p.code}</td><td class="nm"><div>${p.alsa?'<span class="alsa-tag">ALSA</span> ':''}${esc(p.name)}</div></td><td>${tag(p.team)}</td><td class="small">${esc(p.pic||'—')}${isDeparted(p.pic)?` <span class="pill p-high">${T('已离职','left')}</span>`:''}</td><td class="nm" style="max-width:280px">${m?`<div class="small">${esc(m.name)}</div><div class="small num" style="color:${d<0?'var(--bad)':d<=15?'var(--warn)':'var(--ink-3)'}">${m.due} · ${d<0?T(`逾期 ${-d} 天`,`${-d}d overdue`):T(`${d} 天后`,`in ${d}d`)}</div>`:`<span class="small faint">${T('交付物已全部提交','All submitted')}</span>`}</td><td>${prog(p)}</td><td style="min-width:190px">${bwCell(p)}</td><td class="num small" style="${de!==null&&de<0?'color:var(--bad);font-weight:600':''}">${fd(p.end)}${de!==null&&de>=0&&de<=15?`<div class="small" style="color:var(--warn)">${T(`${de} 天后`,`in ${de}d`)}</div>`:''}</td><td>${lvPill(pLevel(p))}</td></tr>`}).join('')||`<tr><td colspan="9" class="empty">${T('没有进行中的项目','No projects in progress')}</td></tr>`}
  </tbody></table></div></div>`;
}
/* ---------- project library: every project, whatever its status ---------- */
const ST_ORDER=['active','not_started','to_report','on_hold','closed','canceled'];
// opens on an overview (by team and by status); a click on a card lists the matching projects
function projects(){
  const f=S.filters,P=viewP();
  if(f.pview!=='list')return libTabs('projects')+projectsHome(P);
  const st=f.st||'all',tm=f.team||'',g=f.group||'',q=(f.q||'').toLowerCase(),y=f.y||'';
  let rows=P.filter(p=>(st==='all'||(st==='inflight'?INFLIGHT.includes(p.status):st==='alsa'?p.alsa:p.status===st))&&(!tm||p.team===tm)&&(!g||team(p.team).group===g)&&(!y||yr(st==='closed'?p.closedAt:p.start)==y)&&(!q||(p.code+p.name+p.pic+(p.exec||[]).join()+p.old).toLowerCase().includes(q)));
  rows.sort((a,b)=>a.code.localeCompare(b.code));PROJ_ROWS=rows.map(p=>p.id);
  const years=[...new Set(P.map(p=>yr(p.start)).filter(Boolean))].sort().reverse();
  return `${libTabs('projects')}<div class="card"><div class="card-h"><div class="filters">
    <button type="button" class="btn sm" data-act="phome">${ico('chevL')}${T('返回总览','Overview')}</button>
    <input type="search" id="pf-q" aria-label="${T('搜索项目','Search projects')}" placeholder="${T('编号、名称、负责人、原编号','Code, name, owner, old code')}" value="${esc(f.q||'')}">
    <select id="pf-st" aria-label="${T('状态','Status')}"><option value="all">${T('全部状态','All statuses')}</option><option value="inflight">${T('在管（未关闭）','Open')}</option>${ST_ORDER.map(k=>`<option value="${k}">${esc(T(ST[k].zh,ST[k].en))}</option>`).join('')}<option value="alsa">${T('ALSA 战略项目','ALSA projects')}</option></select>
    ${isPMO()?`<select id="pf-g" aria-label="${T('区域或中台','Group')}"><option value="">${T('区域 + 中台','All groups')}</option><option value="R">${gName('R')}</option><option value="C">${gName('C')}</option></select>`:''}
    <select id="pf-team" aria-label="${T('团队','Team')}"><option value="">${T('全部团队','All teams')}</option>${teamOptions(tm)}</select>
    <select id="pf-y" aria-label="${T('年份','Year')}"><option value="">${T('全部年份','Any year')}</option>${years.map(v=>`<option ${v==y?'selected':''}>${v}</option>`).join('')}</select>
    </div><span class="sp"></span><button type="button" class="btn sm pri" data-act="rvList" ${rows.length?'':'disabled'} data-tip="${T('一个一个项目过更新：全屏、带时间线','Go through the updates one project at a time: full screen with a timeline')}">${ico('cal')}${T('逐个过更新','Go through updates')}</button><span class="muted small">${rows.length} ${T('个项目','projects')}</span></div>${ctxHint()}
    <div class="tw"><table class="t"><thead><tr><th>${T('编号','Code')}</th><th>${T('项目名称','Project')}</th><th>${T('团队','Team')}</th><th>${T('负责人','Owner')}</th><th>${T('开始','Start')}</th><th>${T('计划完成','End')}</th><th>${T('交付进度','Delivered')}</th><th>${T('最新进展','Latest update')}</th><th>${T('状态','Status')}</th><th>${T('风险','Risk')}</th><th></th></tr></thead><tbody>
    ${rows.map(p=>`<tr class="click" data-act="open" data-id="${p.id}"><td class="mono">${p.code}</td><td class="nm"><div>${p.alsa?'<span class="alsa-tag">ALSA</span> ':''}${esc(p.name)}</div></td><td>${tag(p.team)}${p.section?`<div class="small faint">${esc(secName(p.section))}</div>`:''}</td><td>${esc(p.pic||'—')}${isDeparted(p.pic)?` <span class="pill p-high">${T('已离职','left')}</span>`:''}</td><td class="num small">${fd(p.start)}</td><td class="num small">${fd(p.end)}${(p.exts||[]).length?` <span class="tag" title="${T('延期次数','Extensions')}">+${p.exts.length}</span>`:''}</td><td>${prog(p)}</td><td style="min-width:190px">${bwCell(p)}</td><td>${stPill(p)}</td><td>${lvPill(pLevel(p))}</td><td><button type="button" class="btn sm ghost icon-btn" data-ctxb="${p.id}" aria-label="${T('可用操作','Actions')} ${esc(p.code)}" data-tip="${T('可用操作','Actions')}">${ico('more')}</button></td></tr>`).join('')||`<tr><td colspan="11" class="empty">${T('没有符合条件的项目','No matching projects')}${(q||tm||g||y||st!=='all')?`<div class="empty-a"><button class="btn sm" data-act="clearPf">${ico('x')}${T('清除筛选，查看全部项目','Clear filters and show all')}</button></div>`:''}</td></tr>`}
    </tbody></table></div></div>`;
}
function projectsHome(P){
  const cnt=(ps,k)=>ps.filter(p=>p.status===k).length;
  const sdesc={active:T('正在推进','Running now'),not_started:T('已批准，尚未开始','Approved, not started'),to_report:T('等待结项汇报','Waiting for the close review'),on_hold:T('暂停 / 待决定','Paused or awaiting a decision'),closed:T('已结项（同时归档到资料库）','Closed; also archived in the knowledge library'),canceled:T('已取消或不再推进','Canceled or no longer pursued')};
  const sCard=k=>`<button type="button" class="kpi" data-act="pgo" data-st="${k}"><span class="l">${pill(k)}</span><span class="v">${cnt(P,k)}</span><span class="s">${esc(sdesc[k])}</span></button>`;
  const tCard=c=>{const ps=P.filter(p=>p.team===c);if(!ps.length)return '';const run=cnt(ps,'active')+cnt(ps,'not_started')+cnt(ps,'to_report');
    return `<button type="button" class="kpi" data-act="pgo" data-team="${c}"><span class="l"><span class="mono">${c}</span> · ${esc(tName(c))}</span><span class="v">${ps.length}</span><span class="s">${T(`进行中 ${run} · 暂停 ${cnt(ps,'on_hold')} · 已关闭 ${cnt(ps,'closed')} · 已取消 ${cnt(ps,'canceled')}`,`${run} running · ${cnt(ps,'on_hold')} on hold · ${cnt(ps,'closed')} closed · ${cnt(ps,'canceled')} canceled`)}</span></button>`};
  const grid=h=>`<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${h}</div>`;
  const mine=hasOwnScope()?scopeTeams():[];
  const sec=(title,sub,h)=>h?`<div class="card"><div class="card-h"><h2>${title}</h2>${sub?`<span class="muted small">${sub}</span>`:''}</div><div class="card-b">${grid(h)}</div></div>`:'';
  const alsaN=P.filter(p=>p.alsa).length;
  return `<div class="card"><div class="card-b row"><div class="search" style="flex:1;min-width:240px;position:relative">${ico('search')}<input type="search" id="pf-q0" style="width:100%;padding-left:32px" placeholder="${T('搜索任何项目：编号、名称、负责人…（回车查看结果）','Search any project: code, name, owner… (Enter to list)')}" aria-label="${T('搜索项目','Search projects')}"></div><button type="button" class="btn" data-act="pgo" data-st="all">${T(`查看全部 ${P.length} 个项目`,`List all ${P.length} projects`)}</button></div></div>
  ${mine.length?sec(T('我的团队','My team'),'',mine.map(tCard).join('')):''}
  ${sec(T('按状态','By status'),T('点击查看该状态下的所有项目','Click to list every project in that status'),ST_ORDER.map(sCard).join('')+(alsaN?`<button type="button" class="kpi" data-act="pgo" data-st="alsa"><span class="l"><span class="alsa-tag">ALSA</span></span><span class="v">${alsaN}</span><span class="s">${T('ALSA 战略项目','ALSA strategic projects')}</span></button>`:''))}
  ${sec(gName('R'),T('按市场','By market'),allTeams().filter(c=>team(c).group==='R').map(tCard).join(''))}
  ${sec(gName('C'),T('按部门','By department'),allTeams().filter(c=>team(c).group==='C').map(tCard).join(''))}`;
}
function projectsAfter(){
  const f=S.filters;const set=(id,k)=>{const el=$('#'+id);if(!el)return;if(el.tagName==='SELECT')el.value=f[k]||(k==='st'?'all':'');el.addEventListener(el.type==='search'?'input':'change',()=>{f[k]=el.value;save();const pos=el.selectionStart;$('#content').innerHTML=projects();projectsAfter();enhance($('#content'));if(el.type==='search'){const n=$('#'+id);n.focus();try{n.setSelectionRange(pos,pos)}catch(e){}}})};
  set('pf-q','q');set('pf-st','st');set('pf-g','group');set('pf-team','team');set('pf-y','y');
  const q0=$('#pf-q0');q0&&q0.addEventListener('keydown',e=>{if(e.key==='Enter'&&q0.value.trim()){Object.assign(S.filters,{pview:'list',q:q0.value.trim(),st:'all',team:'',group:'',y:''});save();render()}});
}

/* ---------- gantt ---------- */
function msTip(p,m,i,n){
  const st={done:T('已提交成果','Submitted'),overdue:T(`逾期 ${-diff(m.due,today())} 天未提交`,'Overdue'),soon:T('3 天内到期','Due within 3 days'),upcoming:T(`${diff(m.due,today())} 天后到期`,'Upcoming'),nodate:''}[msState(m)];
  return `${p.code} · ${T('节点','Milestone')} ${i}/${n}\n${T('截止','Due')} ${m.due}　${st}\n${T('交付物','Deliverable')}${CO()}${m.name}\n${T('提交形式','Format')}${CO()}${fList(m.forms)}${(m.dueHistory||[]).length?`\n${T('已改期，原定','Rescheduled, was')} ${m.dueHistory[m.dueHistory.length-1].from}`:''}`;
}
function gantt(){
  const f=S.filters;const t=today();const range=f.gr||'rolling',gst=f.gst||'running';const exp=f.gexp||{};const expAll=!!f.gexpAll;
  // PMO and people with global risk access (e.g. Cokey, Brent) open on every market; everyone else opens on their own market(s) and can switch to all
  const own=hasOwnScope(),mine=own&&(f.gscope||(riskAll()?'all':'mine'))==='mine';
  const gTeams=mine?scopeTeams():allTeams(),tm=gTeams.includes(f.gteam)?f.gteam:'';
  let P=(mine?visP():viewP()).filter(p=>p.start&&p.end&&(!tm||p.team===tm)&&(gst==='all'?true:gst==='running'?['active','to_report','not_started'].includes(p.status):gst==='active'?p.status==='active':gst==='alsa'?p.alsa:INFLIGHT.includes(p.status)));
  let r0,r1;
  if(range==='year'){r0=`${yr(t)}-01-01`;r1=`${yr(t)}-12-31`}
  else if(range==='all'){r0=P.reduce((m,p)=>p.start<m?p.start:m,t).slice(0,8)+'01';r1=P.reduce((m,p)=>p.end>m?p.end:m,t)}
  else{r0=addDays(t,-120).slice(0,8)+'01';r1=addDays(t,270)}
  P=P.filter(p=>p.end>=r0&&p.start<=r1);
  const span=diff(r1,r0)||1;const X=d=>Math.max(0,Math.min(100,100*diff(d,r0)/span));
  const months=[];let m=r0.slice(0,7)+'-01';while(m<=r1){months.push(m);const yy=+m.slice(0,4),mm=+m.slice(5,7);m=mm===12?`${yy+1}-01-01`:`${yy}-${String(mm+1).padStart(2,'0')}-01`}
  const mlab=s=>{const mm=+s.slice(5,7);return mm===1||s===months[0]?`${s.slice(0,4)}/${mm}`:String(mm)};
  const every=months.length>24?3:months.length>14?2:1;
  const grid=months.map((s,i)=>`<div class="g-m" style="left:${X(s)}%">${i%every===0?`<span>${mlab(s)}</span>`:''}</div>`).join('');
  const grid2=months.map(s=>`<div class="g-m" style="left:${X(s)}%"></div>`).join('');
  const todayL=t>=r0&&t<=r1?`<div class="g-today" style="left:${X(t)}%"></div>`:'';
  const SC={active:'var(--s1)',to_report:'var(--s2)',not_started:'var(--s3)',on_hold:'var(--s4)'};
  const byTeam={};P.forEach(p=>(byTeam[p.team]=byTeam[p.team]||[]).push(p));
  const order=allTeams().filter(c=>byTeam[c]);
  const row=p=>{const l=X(p.start),r=X(p.end);const c=SC[p.status]||'var(--mute)';const ms=(p.milestones||[]).filter(m=>m.due).sort((a,b)=>a.due.localeCompare(b.due));const open=expAll||exp[p.id];
    const dia=(m,i,lab)=>m.due<r0||m.due>r1?'':`<div class="g-ms ${msState(m)}" style="left:${X(m.due)}%" data-act="open" data-id="${p.id}" data-tab="ms" data-tip="${esc(msTip(p,m,i+1,ms.length))}"><b>${i+1}</b></div>${lab?`<span class="g-lab" style="${X(m.due)>70?`right:${100-X(m.due)}%;padding-right:14px;text-align:right`:`left:${X(m.due)}%;padding-left:14px`}">${esc(m.name)}</span>`:''}`;
    return `<div class="g-row ${p.alsa?'is-alsa':''}"><div class="g-l"><button class="g-exp" data-act="gexp" data-id="${p.id}" aria-label="${T('展开节点','Show milestones')}" ${ms.length?'':'disabled'} aria-expanded="${open}">${ico(open?'chevD':'chevR')}</button><span class="mono small faint" style="flex:none" data-act="open" data-id="${p.id}">${p.code}</span><span class="ttl" data-act="open" data-id="${p.id}">${p.alsa?'<span class="alsa-tag">ALSA</span> ':''}${esc(p.name)}</span>${pLevel(p)==='high'?`<span class="pill p-high pill-ico" style="flex:none" title="${T('高风险','High risk')}">${ico('tri','',T('高风险','High risk'))}</span>`:''}</div>
      <div class="g-r">${grid2}${todayL}<div class="g-bar" style="--c:${c};left:${l}%;width:${Math.max(.6,r-l)}%" data-act="open" data-id="${p.id}" data-tip="${esc(p.code+' '+p.name)}\n${p.start} → ${p.end}${(p.exts||[]).length?`（${T('延期','ext.')} ${p.exts.length}）`:''}\n${T('负责人','Owner')}${CO()}${esc(p.pic||'—')}\n${T('交付','Delivered')} ${pct(p)}% · ${esc(T(ST[p.status].zh,ST[p.status].en))}"><i style="width:${pct(p)}%"></i></div>
      ${ms.map((m,i)=>dia(m,i,false)).join('')}</div></div>
      ${open?ms.map((m,i)=>`<div class="g-row sub"><div class="g-l" data-act="open" data-id="${p.id}" data-tab="ms"><span class="g-n ${msState(m)}">${i+1}</span><span class="ttl small" title="${esc(m.name)}">${esc(m.name)}</span><span class="small faint num" style="flex:none">${m.due.slice(5)}</span></div><div class="g-r">${grid2}${todayL}${dia(m,i,true)}</div></div>`).join(''):''}`};
  return `<div class="card"><div class="card-h"><div class="filters">
    ${own?`<div class="seg" role="group" aria-label="${T('甘特图范围','Gantt scope')}"><button data-act="gset" data-k="gscope" data-val="mine" class="${mine?'on':''}">${esc(T('我的团队','My team'))} · ${esc(scopeTeams().join(' '))}</button><button data-act="gset" data-k="gscope" data-val="all" class="${mine?'':'on'}">${T('全部团队','All teams')}</button></div>`:''}
    <div class="seg">${[['rolling',T('近 12 个月','12 months')],['year',T('本年','This year')],['all',T('全部','All')]].map(([k,l])=>`<button data-act="gset" data-k="gr" data-val="${k}" class="${range===k?'on':''}">${l}</button>`).join('')}</div>
    <select id="g-team" aria-label="${T('团队','Team')}"><option value="">${mine?T('我的全部团队','All my teams'):T('全部团队','All teams')}</option>${gTeams.map(c=>`<option value="${c}" ${c===tm?'selected':''}>${esc(c)} · ${esc(tName(c))}</option>`).join('')}</select>
    <select id="g-st" aria-label="${T('状态','Status')}"><option value="running" ${gst==='running'?'selected':''}>${T('执行中（进行中/未开始/待结项）','Running')}</option><option value="active" ${gst==='active'?'selected':''}>${T('仅进行中','In progress only')}</option><option value="alsa" ${gst==='alsa'?'selected':''}>${T('ALSA 战略项目','ALSA projects')}</option><option value="inflight" ${gst==='inflight'?'selected':''}>${T('在管（含暂停）','Open incl. on hold')}</option><option value="all" ${gst==='all'?'selected':''}>${T('全部（含已关闭）','All incl. closed')}</option></select>
    <button class="btn sm" data-act="gset" data-k="gexpAll" data-val="${expAll?'':'1'}">${expAll?T('收起全部节点','Collapse milestones'):T('展开全部节点','Expand all milestones')}</button>
    </div><span class="sp"></span><div class="legend"><span><i style="background:var(--s1)"></i>${T('进行中','In progress')}</span><span><i style="background:var(--s2)"></i>${T('待结项汇报','Awaiting close')}</span><span><i style="background:var(--s3)"></i>${T('未开始','Not started')}</span><span><i style="background:var(--s4)"></i>${T('暂停','On hold')}</span><span><i style="background:var(--ok);transform:rotate(45deg);border-radius:2px"></i>${T('已提交','Submitted')}</span><span><i style="background:var(--bad);transform:rotate(45deg);border-radius:2px"></i>${T('逾期','Overdue')}</span><span><i style="background:var(--warn);transform:rotate(45deg);border-radius:2px"></i>${T('3 天内','≤3 days')}</span><span><i style="background:var(--ink-3);transform:rotate(45deg);border-radius:2px"></i>${T('未到期','Upcoming')}</span><span><i style="background:var(--bad);width:2px"></i>${T('今天','Today')}</span></div></div>
    <div class="card-b small muted" style="padding-block:8px;border-bottom:1px solid var(--line-2)">${T('每个菱形是一个项目节点，数字是节点序号；鼠标移到菱形上可看到该节点的截止日期、交付物和提交形式。点 ▸ 展开该项目的全部节点。','Each diamond is a milestone (number = order). Hover it for the due date, deliverable and format. Click ▸ to list a project’s milestones.')}</div>
    <div class="tw" style="max-height:74vh"><div class="gantt">
      <div class="g-row head"><div class="g-l" style="cursor:default"><b class="small">${P.length} ${T('个项目','projects')}</b><span class="small faint">· ${T('深色填充 = 交付完成比例','dark fill = share delivered')}</span></div><div class="g-r">${grid}${todayL}</div></div>
      ${order.map(c=>`<div class="g-row grp"><div class="g-l" style="cursor:default">${tag(c)} <span class="faint small">${byTeam[c].length}</span></div><div class="g-r">${grid2}</div></div>`+byTeam[c].sort((a,b)=>(b.alsa?1:0)-(a.alsa?1:0)||a.start.localeCompare(b.start)).map(row).join('')).join('')||`<div class="empty">${T('当前筛选下没有带起止日期的项目','No projects with dates in this view')}</div>`}
    </div></div></div>`;
}
function ganttAfter(){
  const a=$('#g-team'),b=$('#g-st');a&&a.addEventListener('change',()=>{S.filters.gteam=a.value;save();render()});b&&b.addEventListener('change',()=>{S.filters.gst=b.value;save();render()});
}

/* ---------- risks & issues ----------
   Who sees what: PMO and people with global risk access (riskAll, e.g. Cokey, Brent) see every market and back-office team;
   everyone else sees only the risks and issues of their own team(s). The page reads top-down:
   1) pick the scope (group / team)  2) see where and what (team x category matrix)  3) work through the register, grouped as you prefer. */
// who is looking: PMO (no team of their own) sees everything; anyone with a team opens on that team. Only people with global risk access (e.g. Cokey, Brent) may switch to all teams.
const rkMode=()=>hasOwnScope()?(riskAll()?(S.filters.rscope||'mine'):'mine'):'all';
const rkTeamsInView=()=>rkMode()==='all'&&riskAll()?allTeams():scopeTeams();
const rkInScope=c=>{const f=S.filters;return rkTeamsInView().includes(c)&&(!f.rgrp||team(c).group===f.rgrp)&&(!f.rteam||c===f.rteam)};
function risks(){
  const f=S.filters,tab=f.rtab||'risk',inView=rkTeamsInView(),global=rkMode()==='all'&&riskAll(),canSwitch=hasOwnScope()&&riskAll();
  if(f.rteam&&(!inView.includes(f.rteam)||(f.rgrp&&team(f.rteam).group!==f.rgrp)))f.rteam='';
  const R=allRisks();const open=R.filter(r=>!S.acks[r.key]);
  const lv=f.rlv||'',cat=f.rcat||'',showAck=!!f.rack,q=(f.rq||'').trim().toLowerCase();
  const P=id=>S.projects.find(p=>p.id===id);
  const ord={high:0,mid:1,low:2};
  const scoped=g=>{const p=P(g.pid);return !!p&&rkInScope(p.team)};
  const hasCat=(g,c)=>g.items.some(i=>i.cat===c);
  const openG=riskGroups(open).filter(scoped);                           // projects with open risks inside the chosen scope
  const base=(showAck?riskGroups(R):riskGroups(open)).filter(scoped).filter(g=>{const p=P(g.pid);return !q||(p.code+' '+p.name+' '+(p.pic||'')).toLowerCase().includes(q)});
  const rows=base.filter(g=>(!lv||g.level===lv)&&(!cat||hasCat(g,cat))).sort((a,b)=>(a.done-b.done)||ord[a.level]-ord[b.level]||P(a.pid).code.localeCompare(P(b.pid).code));
  const iss=S.issues.filter(i=>{const p=P(i.pid);return p&&(riskAll()||canSee(p))&&canView(p)&&rkInScope(p.team)});
  const holdN=holdList().filter(h=>{const p=P(h.pid);return p&&rkInScope(p.team)&&h.due}).length;
  const head=`<div class="tabs" style="border-bottom:1px solid var(--line)"><button class="${tab==='risk'?'on':''}" data-act="fset" data-k="rtab" data-val="risk">${T('风险识别','Risks')} (${openG.length})</button><button class="${tab==='hold'?'on':''}" data-act="fset" data-k="rtab" data-val="hold">${T('暂停项目复核','Paused projects')} (${holdN})</button><button class="${tab==='issue'?'on':''}" data-act="fset" data-k="rtab" data-val="issue">${T('问题清单','Issues')} (${iss.filter(i=>i.status==='open').length})</button></div>`;
  // scope bar, shared by the three tabs
  const tOpts=inView.filter(c=>!f.rgrp||team(c).group===f.rgrp);
  const mineSeg=canSwitch?`<div class="seg" role="group" aria-label="${T('风险范围','Risk scope')}"><button data-act="fset" data-k="rscope" data-val="mine" class="${global?'':'on'}">${esc(T('我的团队','My team'))} · ${esc(scopeTeams().join(' '))}</button><button data-act="fset" data-k="rscope" data-val="all" class="${global?'on':''}">${T('全部团队','All teams')}</button></div>`:'';
  const bar=`<div class="row" style="padding:12px 0 4px"><span class="lbl">${T('范围','Scope')}</span>${mineSeg}${global?`<div class="seg" role="group" aria-label="${T('区域或中台','Group')}">${[['',T('全部','All')],['R',gName('R')],['C',gName('C')]].map(([k,l])=>`<button data-act="fset" data-k="rgrp" data-val="${k}" class="${(f.rgrp||'')===k?'on':''}">${l}</button>`).join('')}</div>`:''}${inView.length>1?`<select id="rk-team" aria-label="${T('团队','Team')}"><option value="">${global?T('全部团队','All teams'):T('我的全部团队','All my teams')}</option>${tOpts.map(c=>`<option value="${c}" ${f.rteam===c?'selected':''}>${esc(c)} · ${esc(tName(c))}</option>`).join('')}</select>`:`<b style="color:var(--ink)">${esc(inView.map(tName).join(' · ')||'—')}</b>`}${global?'':`<span class="small faint">${T('只显示你自己团队的风险与问题','Showing the risks and issues of your own team only')}${canSwitch?T('；可切换到全部团队','; switch to All teams to see the rest'):''}</span>`}</div>`;
  if(tab==='issue') return head+bar+issuesView(iss);
  if(tab==='hold') return head+bar+holdView();

  const one=r=>`<div class="rk-h"><span class="tag">${esc(T(RISK_CAT[r.cat].zh,RISK_CAT[r.cat].en))}</span><b>${esc(r.title)}</b>${S.acks[r.key]?`<span class="small faint">${T('已处理','Handled')} ${S.acks[r.key]}</span>`:''}</div>${r.detail?`<div class="small muted rk-d">${esc(r.detail)}</div>`:''}`;
  const rk=g=>{const p=P(g.pid),r=g.main,more=g.items.slice(1);return `<tr class="${g.done?'rk-done':''}"><td>${g.done?`<span class="pill p-low">${T('已处理','Handled')}</span>`:lvPill(g.level)}</td><td class="nm" style="cursor:pointer" data-act="open" data-id="${p.id}"><div><span class="mono small faint">${p.code}</span> ${esc(p.name)}</div><div class="small faint">${tag(p.team)} ${stPill(p)}</div></td><td>${esc(p.pic||'—')}</td>
    <td class="rk-main">${one(r)}${more.length?`<details class="rk-more"><summary>${T(`另有 ${more.length} 项风险`,`${more.length} more`)}</summary>${more.map(x=>`<div class="rk-x">${lvPill(x.level)}<div>${one(x)}</div></div>`).join('')}</details>`:''}</td>
    <td class="small">${esc(r.sugg)}</td>
    <td style="white-space:nowrap">${g.done?'':`<div class="rk-a"><button class="btn sm" data-act="notifyP" data-id="${p.id}">${T('通知负责人','Notify owner')}</button><button class="btn sm ghost" data-act="ackP" data-id="${p.id}">${T('已处理','Handled')}</button></div>`}</td></tr>`};
  // 1) where x what: one cell = number of projects in that team with an open risk of that category
  const mCats=Object.keys(RISK_CAT).filter(k=>openG.some(g=>hasCat(g,k)));
  const cnt=(c,k)=>openG.filter(g=>P(g.pid).team===c&&(!k||hasCat(g,k))).length;
  const mTeams=inView.filter(c=>rkInScope(c)&&cnt(c)>0);
  const mCell=(c,k,n)=>n?`<button class="chk" style="min-width:34px;justify-content:center;${f.rteam===c&&cat===k?'border-color:var(--accent);background:var(--accent-soft);color:var(--accent)':''}" data-act="rkset" data-team="${c}" data-cat="${k}"><b class="num">${n}</b></button>`:`<span class="faint">·</span>`;
  const matrix=global&&mTeams.length?`<div class="card"><div class="card-h"><h2>${T('哪里、什么风险','Where and what')}</h2><span class="muted small">${T('点数字筛选下方清单；数字是该团队有此类风险的项目数','Click a number to filter the register below. Numbers count projects with an open risk of that kind.')}</span></div><div class="tw"><table class="t"><thead><tr><th>${T('团队','Team')}</th>${mCats.map(k=>`<th style="text-align:center"><button class="btn sm ghost" style="${cat===k?'color:var(--accent);font-weight:700':''}" data-act="rkset" data-team="" data-cat="${k}">${esc(T(RISK_CAT[k].zh,RISK_CAT[k].en))}</button></th>`).join('')}<th style="text-align:center">${T('合计','Total')}</th></tr></thead><tbody>
    ${['R','C'].map(g=>{const L=mTeams.filter(c=>team(c).group===g);return L.length?`<tr><td colspan="${mCats.length+2}" style="background:var(--surface-2);font-weight:600;font-size:12px">${gName(g)}</td></tr>`+L.map(c=>`<tr class="${f.rteam===c&&!cat?'':''}"><td><button class="btn sm ghost" style="${f.rteam===c?'color:var(--accent);font-weight:700':''}" data-act="rkset" data-team="${c}" data-cat="">${tag(c)}</button></td>${mCats.map(k=>`<td style="text-align:center">${mCell(c,k,cnt(c,k))}</td>`).join('')}<td style="text-align:center"><b class="num">${cnt(c)}</b></td></tr>`).join(''):''}).join('')}
    </tbody></table></div></div>`:'';
  // 2) severity cards and category chips for whatever is in scope
  const lvN=l=>openG.filter(g=>g.level===l&&(!cat||hasCat(g,cat))).length;
  const cats=Object.keys(RISK_CAT).map(k=>({k,n:openG.filter(g=>hasCat(g,k)).length})).filter(x=>x.n);
  const by=f.rby||(global?'team':'level');
  const groups=[];
  if(by==='team')inView.forEach(c=>{const L=rows.filter(g=>P(g.pid).team===c);if(L.length)groups.push({h:`${tag(c)} <span class="small faint">${esc(tName(c))}</span>`,L})});
  else if(by==='level')['high','mid','low'].forEach(l=>{const L=rows.filter(g=>g.level===l);if(L.length)groups.push({h:lvPill(l),L})});
  else Object.keys(RISK_CAT).forEach(k=>{const L=rows.filter(g=>g.main.cat===k);if(L.length)groups.push({h:esc(T(RISK_CAT[k].zh,RISK_CAT[k].en)),L})});
  const filtered=!!(lv||cat||q||f.rteam||f.rgrp);
  return head+bar+`
  <div class="row">${['high','mid','low'].map(l=>`<button class="kpi" style="min-width:150px" data-act="fset" data-k="rlv" data-val="${lv===l?'':l}" aria-pressed="${lv===l}"><span class="l">${lvPill(l)}</span><span class="v">${lvN(l)}</span><span class="s">${T('个项目','projects')}</span></button>`).join('')}
    <div class="card" style="flex:1;min-width:260px;padding:12px 16px"><div class="lbl" style="margin-bottom:8px">${T('按风险类别（项目数）','By risk category (projects)')}</div><div class="row">${cats.map(c=>`<button class="chk" style="${cat===c.k?'border-color:var(--accent);color:var(--accent)':''}" data-act="fset" data-k="rcat" data-val="${cat===c.k?'':c.k}">${esc(T(RISK_CAT[c.k].zh,RISK_CAT[c.k].en))} <b class="num">${c.n}</b></button>`).join('')||`<span class="small faint">${T('没有识别到风险','No risks found')}</span>`}</div></div></div>
  ${matrix}
  <div class="card"><div class="card-h"><h2>${T('风险清单','Risk register')}</h2><span class="muted small">${rows.length} ${T('个项目','projects')}</span>${filtered?`<button class="btn sm ghost" data-act="rkclear">${ico('x')}${T('清除筛选','Clear filters')}</button>`:''}<span class="sp"></span><input type="search" id="rk-q" aria-label="${T('搜索项目','Search')}" placeholder="${T('搜索编号 / 名称 / 负责人','Code / name / owner')}" value="${esc(f.rq||'')}" style="width:210px"><div class="seg" role="group" aria-label="${T('分组方式','Group by')}">${[['team',T('按团队','By team')],['level',T('按等级','By level')],['cat',T('按类别','By category')]].map(([k,l])=>`<button data-act="fset" data-k="rby" data-val="${k}" class="${by===k?'on':''}">${l}</button>`).join('')}</div><label class="chk small"><input type="checkbox" id="rack" ${showAck?'checked':''}> ${T('显示已处理','Show handled')}</label>${isPMO()?`<button class="btn sm" data-act="notifyAll">${T('一键通知全部高风险负责人','Notify all high-risk owners')}</button>`:''}</div>
  <div class="tw"><table class="t rk-t"><thead><tr><th>${T('等级','Level')}</th><th>${T('项目','Project')}</th><th>${T('负责人','Owner')}</th><th>${T('主要风险','Main risk')}</th><th>${T('建议动作','Suggested action')}</th><th></th></tr></thead><tbody>
  ${groups.map(g=>`<tr><td colspan="6" style="background:var(--surface-2);font-weight:600;padding:8px 12px">${g.h} <span class="small faint">· ${g.L.length}</span></td></tr>`+g.L.slice(0,300).map(rk).join('')).join('')||`<tr><td colspan="6" class="empty">${filtered?T('当前筛选下没有项目','No projects for this filter'):T('没有识别到风险','No risks found')}</td></tr>`}
  </tbody></table></div></div>
    <details class="small muted" style="padding:2px 4px"><summary style="cursor:pointer">${T('风险是怎么识别的？','How are risks identified?')}</summary><div class="note info small" style="margin-top:8px">${T('系统每次打开时根据项目完成情况自动扫描：节点是否逾期、时间进度与交付进度是否脱节、是否超期未结项、延期次数、进度更新频率、执行人负荷等，并给出等级与建议动作。每个项目只标一个主要风险（最严重的一条），其他收在“另有 N 项”里。','Scanned automatically each time the app opens: overdue milestones, time vs delivery gap, past-end projects, extensions, update frequency and executor load. Each project shows one main risk; the rest are folded under “N more”.')}</div></details>`;
}
function holdView(){
  const P=id=>S.projects.find(p=>p.id===id),pmo=isPMO();
  const L=holdList().filter(h=>{const p=P(h.pid);return p&&rkInScope(p.team)}).sort((a,b)=>(b.due-a.due)||((b.days??1e4)-(a.days??1e4)));
  const btn=(h,k,l,cls='')=>`<button class="btn sm ${cls}" data-act="holdDo" data-k="${k}" data-id="${h.pid}">${l}</button>`;
  return `<div class="note info small">${T(`暂停 / 待定项目的计划已冻结，不再按完成日、延期次数报风险，也不计入风险数量。暂停超过 ${HOLD_DAYS} 天没有进展、或负责人已离职的项目标为「需要决定」：请在项目会上决定恢复推进、取消，或转为跟进项。`,`Paused projects have a frozen plan, so they raise no risk warnings and are not counted as risks. Those with no progress for over ${HOLD_DAYS} days, or whose owner has left, are marked “Decision needed”: decide at the project meeting to resume, cancel, or convert to a follow-up.`)}</div>
  <div class="card"><div class="card-h"><h2>${T('暂停项目复核','Paused projects')}</h2><span class="muted small">${L.filter(h=>h.due).length} ${T('个需要决定','need a decision')} · ${T('共','of')} ${L.length}</span></div>
  <div class="tw"><table class="t rk-t"><thead><tr><th>${T('状态','Status')}</th><th>${T('项目','Project')}</th><th>${T('负责人','Owner')}</th><th>${T('最后进展','Last progress')}</th><th>${T('情况','Situation')}</th><th>${pmo?T('处理','Decide'):''}</th></tr></thead><tbody>
  ${L.map(h=>{const p=P(h.pid);return `<tr><td>${h.due?`<span class="pill p-mid">${ico('clock')}${T('需要决定','Decision needed')}</span>`:`<span class="pill p-low">${T('观察中','Watching')}</span>`}</td>
    <td class="nm" style="cursor:pointer" data-act="open" data-id="${p.id}"><div><span class="mono small faint">${p.code}</span> ${esc(p.name)}</div><div class="small faint">${tName(p.team)}</div></td>
    <td>${esc(p.pic||'—')}${isDeparted(p.pic)?` <span class="pill p-high">${T('已离职','left')}</span>`:''}</td><td class="num small">${h.last?fd(h.last):'—'}</td>
    <td class="small">${h.why.length?h.why.map(esc).join('<br>'):`<span class="faint">${T('近期有进展','Recent progress')}</span>`}</td>
    <td>${pmo?`<div class="rk-a" style="flex-wrap:wrap">${btn(h,'st:active',T('恢复推进','Resume'),'ok')}${btn(h,'st:canceled',T('取消','Cancel'),'bad')}${btn(h,'p2f',T('转为跟进项','To follow-up'))}${hasOwner(p)?btn(h,'notify',T('提醒负责人','Remind'),'ghost'):''}</div>`:''}</td></tr>`}).join('')||`<tr><td colspan="6" class="empty">${T('没有暂停 / 待定的项目','No paused projects')}</td></tr>`}
  </tbody></table></div></div>`;
}
function issuesView(iss){
  return `<div class="card"><div class="card-h"><h2>${T('新增问题','Log an issue')}</h2></div><form class="card-b form" id="issueForm"><div class="fgrid">
    <div class="f"><label>${T('所属项目','Project')}<span class="req">*</span></label><select name="pid" required>${visP().filter(p=>INFLIGHT.includes(p.status)).sort((a,b)=>a.code.localeCompare(b.code)).map(p=>`<option value="${p.id}">${p.code} · ${esc(p.name.slice(0,60))}</option>`).join('')}</select></div>
    <div class="f"><label>${T('严重程度','Severity')}</label><select name="sev"><option value="high">${T('高','High')}</option><option value="mid" selected>${T('中','Medium')}</option><option value="low">${T('低','Low')}</option></select></div>
    <div class="f full"><label>${T('问题描述','Issue')}<span class="req">*</span></label><textarea name="text" required placeholder="${T('发生了什么，影响是什么','What happened and what it affects')}"></textarea></div>
    <div class="f"><label>${T('责任人','Owner')}</label><input type="text" name="owner" list="plist"></div>
    <div class="f"><label>${T('期望解决日期','Target date')}</label><input type="date" name="due"></div></div>
    <div class="row"><button class="btn pri">${T('添加到问题清单','Add issue')}</button></div><datalist id="plist">${people().map(n=>`<option value="${esc(n)}">`).join('')}</datalist></form></div>
  <div class="card"><div class="card-h"><h2>${T('问题清单','Issue log')}</h2></div><div class="tw"><table class="t"><thead><tr><th>${T('严重度','Severity')}</th><th>${T('项目','Project')}</th><th>${T('问题','Issue')}</th><th>${T('责任人','Owner')}</th><th>${T('期望解决','Target')}</th><th>${T('状态','Status')}</th><th></th></tr></thead><tbody>
  ${iss.map(i=>{const p=S.projects.find(x=>x.id===i.pid);return `<tr><td>${lvPill(i.sev)}</td><td class="nm" data-act="open" data-id="${p.id}" style="cursor:pointer"><div><span class="mono small faint">${p.code}</span> ${esc(p.name)}</div></td><td class="nm"><div>${esc(i.text)}${i.example?` <span class="tag">${T('示例','Example')}</span>`:''}</div></td><td>${esc(i.owner||'—')}</td><td class="num small ${i.status==='open'&&i.due&&i.due<today()?'':''}">${fd(i.due)}</td><td>${i.status==='open'?`<span class="pill p-open">${T('处理中','Open')}</span>`:`<span class="pill p-closed">${T('已解决','Resolved')}</span>`}</td><td>${i.status==='open'?`<button class="btn sm" data-act="issueNotify" data-id="${i.id}">${T('提醒','Remind')}</button> <button class="btn sm ok" data-act="issueClose" data-id="${i.id}">${T('标记解决','Resolve')}</button>`:''}</td></tr>`}).join('')||`<tr><td colspan="7" class="empty">${T('还没有问题记录。用上方表单添加第一条。','No issues yet. Add the first one above.')}</td></tr>`}
  </tbody></table></div></div>`;
}
function risksAfter(){
  const a=$('#rack');a&&a.addEventListener('change',()=>{S.filters.rack=a.checked;save();render()});
  const tsel=$('#rk-team');tsel&&tsel.addEventListener('change',()=>{S.filters.rteam=tsel.value;save();render()});
  const rq=$('#rk-q');rq&&rq.addEventListener('input',()=>{S.filters.rq=rq.value;const pos=rq.selectionStart;$('#content').innerHTML=risks();risksAfter();enhance($('#content'));const n=$('#rk-q');if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(e){}}});
  const f=$('#issueForm');f&&f.addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));
    S.issues.unshift({id:uid(),pid:d.pid,text:d.text,owner:d.owner,due:d.due,sev:d.sev,status:'open',at:today()});
    const p=S.projects.find(x=>x.id===d.pid);if(d.owner)sendMail({to:[d.owner],cc:[p.pic],subject:`[${T('新问题','New issue')}] ${p.code}`,body:`${d.text}\n\n${T('期望解决日期','Target')}${CO()}${d.due||'—'}${sig()}`,rule:'manual',ref:p.id});
    save();render();toast(T('已添加并通知责任人','Issue logged; owner notified'))});
}

/* ---------- follow-ups ---------- */
function follows(){
  const own=hasOwnScope(),mine=own&&(S.filters.fscope||'mine')==='mine';const F=mine?visF():viewF();const ft=S.filters.ft||'',fst=S.filters.fst||'open';
  // list filters: team, type, time, status (the type cards above set the same type filter)
  const present=allTeams().filter(c=>F.some(f=>f.team===c)),fteam=present.includes(S.filters.fteam)?S.filters.fteam:'',ftime=S.filters.ftime||'',t0=today();
  const timeOk=f=>{const st=f.start||'',lu=lastUpd(f)||st;
    return !ftime||(ftime==='new30'?!!st&&diff(t0,st)<=30:ftime==='new90'?!!st&&diff(t0,st)<=90:ftime==='y0'?yr(st)===yr(t0):ftime==='y1'?yr(st)===yr(t0)-1:ftime==='quiet30'?f.status==='open'&&(!lu||diff(t0,lu)>30):true)};
  const base=F.filter(f=>(!fteam||f.team===fteam)&&(!ft||f.ftype===ft)&&timeOk(f));
  const rows=base.filter(f=>fst==='all'||f.status===fst).sort((a,b)=>a.code.localeCompare(b.code));
  const ftab=canNewFollow()&&S.filters.ftab==='new'?'new':'list';
  const fOpt=(v,l,cur)=>`<option value="${esc(v)}" ${String(cur)===String(v)?'selected':''}>${esc(l)}</option>`;
  const filtered=!!(fteam||ft||ftime||fst!=='open');
  return `${canNewFollow()?`<div class="row"><button type="button" class="btn sm pri" data-act="rvFollows" style="margin-right:8px">${ico('cal')}${T('逐个过跟进项','Go through follow-ups')}</button><div class="seg" role="tablist" aria-label="${T('跟进项页签','Follow-up tabs')}"><button role="tab" aria-selected="${ftab==='list'}" data-act="fset" data-k="ftab" data-val="list" class="${ftab==='list'?'on':''}">${T('跟进项清单','Follow-ups')}</button><button role="tab" aria-selected="${ftab==='new'}" data-act="fset" data-k="ftab" data-val="new" class="${ftab==='new'?'on':''}">${ico('apply')}${T('新建跟进项','New follow-up')}</button></div></div>`:''}${own?`<div class="row"><div class="seg" role="group" aria-label="${T('跟进项范围','Follow-up scope')}"><button data-act="fset" data-k="fscope" data-val="mine" class="${mine?'on':''}">${esc(T('我的团队','My team'))} · ${esc(scopeTeams().join(' '))}</button><button data-act="fset" data-k="fscope" data-val="all" class="${mine?'':'on'}">${T('全部团队','All teams')}</button></div></div>`:''}<div class="note small">${T('跟进项没有预计截止日期，只有开始日期和持续跟进记录。跟进项由 PMO、部门经理或项目负责人创建，分配到各团队 / 科室，可随时「转为项目」或关闭。原「待办跟进项」页签已全部按负责人分配到对应科室。','Follow-ups have no end date, only a start date and running updates. PMO, managers and project owners create them and assign them to a team; they can be converted to a project or closed. The old “待办跟进项” sheet has been split by owner into the teams.')}</div>
  ${ftab==='new'&&canNewFollow()?'':`<div class="grid g3">${Object.entries(FT).map(([k,v])=>`<button class="kpi" data-act="fset" data-k="ft" data-val="${ft===k?'':k}" style="${ft===k?'border-color:var(--accent)':''}"><span class="l">${esc(T(v.zh,v.en))}</span><span class="v">${F.filter(f=>f.ftype===k&&f.status==='open').length}</span><span class="s">${esc(T(v.d[0],v.d[1]))}</span></button>`).join('')}</div>`}
  ${ftab==='new'&&canNewFollow()?`<div class="card"><div class="card-h"><h2>${T('新建跟进项','New follow-up')}</h2><span class="small faint">${T('PMO、部门经理和项目负责人都可以新建','PMO, managers and project owners can create one')}</span></div><form class="card-b form" id="fuForm"><div class="fgrid">
    <div class="f"><label>${T('分配到团队 / 科室','Assign to team')}<span class="req">*</span></label><select name="team" required id="fuTeam">${teamOptions('',isPMO()?undefined:scopeTeams())}</select><span class="hint">${T('编号预览','Code preview')}${CO()}<b class="mono" id="fuCode"></b></span></div>
    <div class="f" id="fuSecF" hidden><label>${T('科室（服务工程部）','Section (Service Engineering)')}</label><select name="section"><option value="">—</option>${SECTIONS.map(x=>`<option value="${x}">${esc(secName(x))}</option>`).join('')}</select></div>
    <div class="f"><label>${T('跟进类型','Type')}<span class="req">*</span></label><select name="ftype">${Object.entries(FT).map(([k,v])=>`<option value="${k}">${esc(T(v.zh,v.en))}</option>`).join('')}</select></div>
    <div class="f full"><label>${T('跟进事项','Item')}<span class="req">*</span></label><input type="text" name="name" required></div>
    <div class="f"><label>${T('跟进人','Owner')}<span class="req">*</span></label><input type="text" name="pic" list="plist2" required></div>
    <div class="f"><label>${T('执行人（可选，多人用逗号分隔）','Executors (optional, comma separated)')}</label><input type="text" name="exec" list="plist2"></div>
    <div class="f"><label>${T('开始日期','Start')}</label><input type="date" name="start" value="${today()}"></div>
    <div class="f full"><label>${T('说明 / 监控指标','Notes / metrics')}</label><textarea name="scope"></textarea></div></div>
    <div class="row"><button class="btn pri">${T('创建并通知跟进人','Create and notify owner')}</button></div><datalist id="plist2">${people().map(n=>`<option value="${esc(n)}">`).join('')}</datalist></form></div>`:''}
  ${ftab==='new'&&canNewFollow()?'':`<div class="card"><div class="card-h"><h2>${T('跟进项清单','Follow-up list')}</h2><span class="muted small">${rows.length} / ${F.length}</span><span class="sp"></span></div>
  <div class="card-h filters" role="group" aria-label="${T('筛选跟进项','Filter follow-ups')}" style="border-bottom:1px solid var(--line-2)">
    <label class="lib-f small muted">${T('团队','Team')} <select data-ff="fteam">${fOpt('',T('全部团队','All teams'),fteam)}${present.map(c=>fOpt(c,`${c} · ${tName(c)}`,fteam)).join('')}</select></label>
    <label class="lib-f small muted">${T('类型','Type')} <select data-ff="ft">${fOpt('',T('全部类型','All types'),ft)}${Object.entries(FT).map(([k,v])=>fOpt(k,T(v.zh,v.en),ft)).join('')}</select></label>
    <label class="lib-f small muted">${T('时间','Time')} <select data-ff="ftime">${[['',T('不限时间','Any time')],['new30',T('近 30 天开始','Started in the last 30 days')],['new90',T('近 90 天开始','Started in the last 90 days')],['y0',T('今年开始','Started this year')],['y1',T('去年开始','Started last year')],['quiet30',T('超过 30 天没有更新','No update for 30+ days')]].map(([k,l])=>fOpt(k,l,ftime)).join('')}</select></label>
    <label class="lib-f small muted">${T('状态','Status')} <select data-ff="fst">${[['open',T('跟进中','Open')],['closed',T('已关闭','Closed')],['converted',T('已转项目','Converted')],['all',T('全部状态','All statuses')]].map(([k,l])=>fOpt(k,l,fst)).join('')}</select></label>
    ${filtered?`<button type="button" class="btn sm ghost" data-act="fclearF">${ico('x')}${T('清除筛选','Clear filters')}</button>`:''}</div>
  <div class="tw"><table class="t"><thead><tr><th>${T('编号','Code')}</th><th>${T('跟进事项','Item')}</th><th>${T('团队','Team')}</th><th>${T('类型','Type')}</th><th>${T('跟进人','Owner')}</th><th>${T('开始','Start')}</th><th>${T('最近更新','Last update')}</th><th>${T('状态','Status')}</th></tr></thead><tbody>
  ${rows.map(f=>`<tr class="click" data-act="openf" data-id="${f.id}"><td class="mono">${f.code}</td><td class="nm"><div>${esc(f.name)}</div></td><td>${tag(f.team)}</td><td class="small">${esc(T(FT[f.ftype].zh,FT[f.ftype].en))}</td><td>${esc(f.pic||'—')}</td><td class="num small">${fd(f.start)}</td><td class="num small">${fd(lastUpd(f))}</td><td>${f.status==='open'?`<span class="pill p-open">${T('跟进中','Open')}</span>`:f.status==='converted'?`<span class="pill p-to_report">${T('已转项目','Converted')}</span>`:`<span class="pill p-closed">${T('已关闭','Closed')}</span>`}</td></tr>`).join('')||`<tr><td colspan="8" class="empty">${mine?T('你的团队目前没有跟进项','Your team has no follow-ups right now'):T('没有跟进项','No follow-ups')}${mine?`<div class="empty-a"><button class="btn sm" data-act="fset" data-k="fscope" data-val="all">${T('查看全部团队的跟进项','Show all teams')}</button></div>`:''}</td></tr>`}
  </tbody></table></div></div>`}`;
}
function followsAfter(){
  $$('[data-ff]').forEach(el=>el.addEventListener('change',()=>{S.filters[el.dataset.ff]=el.value;save();render()}));
  const f=$('#fuForm');if(!f)return;const tm=$('#fuTeam'),cd=$('#fuCode');const upd=()=>{cd.textContent=nextCode(tm.value,today().slice(2,4),true);$('#fuSecF').hidden=tm.value!=='SEN'};tm.addEventListener('change',upd);upd();
  f.addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));const code=nextCode(d.team,(d.start||today()).slice(2,4),true);
    const fo={id:'f'+uid(),code,kind:'follow',team:d.team,section:d.team==='SEN'?d.section||'':'',name:d.name,pic:d.pic,exec:String(d.exec||'').split(/[,，;；]/).map(x=>x.trim()).filter(Boolean),start:d.start||today(),end:null,ftype:d.ftype,status:'open',scope:d.scope,updates:[],history:[{at:today(),by:me().name,text:isPMO()?T('PMO 创建跟进项','Created by PMO'):T('创建跟进项','Follow-up created')}]};S.follows.unshift(fo);
    sendMail({to:[d.pic,...fo.exec],cc:[mgrOfP(fo)?.name,...(isPMO()?[]:['Aiden'])],subject:`[${T('新跟进项','New follow-up')}] ${code} ${d.name}`,body:`${isPMO()?T('PMO 为您分配了一个跟进项','PMO assigned you a follow-up'):`${me().name} ${T('为您分配了一个跟进项','assigned you a follow-up')}`}（${T(FT[d.ftype].zh,FT[d.ftype].en)}）：\n${code} ${d.name}\n\n${d.scope||''}\n\n${T('跟进项没有截止日期，请定期在系统中更新跟进记录。','Follow-ups have no end date; please post updates regularly.')}${sig()}`,rule:'manual'});
    S.filters.ftab='list';save();render();toast(T(`已创建 ${code}`,`Created ${code}`))});
}

const riskBadge=()=>riskGroups(allRisks().filter(r=>!S.acks[r.key])).filter(g=>{const p=S.projects.find(x=>x.id===g.pid);return g.level==='high'&&p&&rkInScope(p.team)}).length;

const dashTabs=()=>{const tb=(v,l,n)=>`<button type="button" data-act="go" data-v="${v}" class="${S.view===v?'on':''}">${l}${n?` <span class="badge" style="background:var(--warn)">${n}</span>`:''}</button>`;
  return `<div class="row"><div class="seg dash-tabs" role="group" aria-label="${T('看板视图','Board view')}">${tb('dashboard',T('看板','Board'))}${tb('gantt',T('甘特图','Gantt'))}</div></div>`};
const VIEWS={dashboard,projects,gantt,risks,follows,review:()=>reviewView()};
{const d0=VIEWS.dashboard,g0=VIEWS.gantt;VIEWS.dashboard=()=>dashTabs()+d0();VIEWS.gantt=()=>dashTabs()+g0();}
const VIEWS_AFTER={projects:projectsAfter,gantt:ganttAfter,risks:risksAfter,follows:followsAfter};

/* ================= request forms ================= */
// how a deliverable is reported: stored as the Chinese key; '其他:xxx' carries the free text. Old values (文字 截图 邮件 文件) still read correctly.
const FORMS=['图文汇报','邮件跟进','项目文件展示','其他'];
const FORMS_EN={图文汇报:'Report with text & images',邮件跟进:'Email follow-up',项目文件展示:'Project files shown',其他:'Other'};
const FM_OLD={文字:'图文汇报',截图:'图文汇报',邮件:'邮件跟进',文件:'项目文件展示'};
const fmBase=x=>{x=String(x||'');return x.startsWith('其他')?'其他':(FM_OLD[x]||x)};
const fmOther=x=>String(x||'').startsWith('其他:')?String(x).slice(3):'';
const fN=x=>{const b=fmBase(x);if(b==='其他'){const o=fmOther(x);return (S.lang==='en'?'Other':'其他')+(o?`: ${o}`:'')}return S.lang==='en'?(FORMS_EN[b]||b):b};
const fList=a=>[...new Set((a||[]).map(fN))].join(' / ');
const fmHas=(a,k)=>(a||[]).some(x=>fmBase(x)===k);
const fmBoxes=(cls,forms,dis)=>{const a=forms&&forms.length?forms:['图文汇报'],oth=a.find(x=>fmBase(x)==='其他');
  return `<div class="row fm-box" style="gap:6px">${FORMS.map(k=>`<label class="chk small"><input type="checkbox" class="${cls}" value="${k}" ${fmHas(a,k)?'checked':''} ${dis?'disabled':''}>${esc(fN(k))}</label>`).join('')}<input type="text" class="fm-o ${cls}-o" ${oth?'':'hidden'} ${dis?'disabled':''} value="${esc(oth?fmOther(oth):'')}" placeholder="${T('请填写形式','Describe the format')}" aria-label="${T('其他提交形式','Other format')}" style="width:150px"></div>`};
const fmRead=(tr,cls)=>$$('.'+cls+':checked',tr).map(x=>x.value==='其他'?'其他:'+((($('.'+cls+'-o',tr)||{}).value)||'').trim():x.value);
const fmMissingText=forms=>(forms||[]).some(x=>x==='其他:');
document.addEventListener('change',e=>{const el=e.target;if(el.matches&&el.matches('input[type=checkbox][value="其他"]')){const o=el.closest('.fm-box')&&el.closest('.fm-box').querySelector('.fm-o');if(o){o.hidden=!el.checked;if(el.checked)o.focus()}}});
const req=`<span class="req">*</span>`;


/* ---- classification and similar projects ---- */
// the categories are a starting list for the PMO to confirm; "Other" lets an applicant type their own
// similar projects: compare the whole write-up (name, background, why, benefits, processes, risks, approach, milestones)
// with every project we can see, running or closed. Words are weighted by how rare they are; the name counts three times.
const SIM_GEN=new Set(['in','of','to','for','the','and','with','from','on','at','by','is','are','be','management','project','plan','program','programme','establishment','center','centre','service','services','system','process','optimisation','optimization','improvement','improve','build','launch','support','new','make','need','needs','also','include','including','team','based','within','across','will','all','one','two','year','month','week','day','提升','建设','项目','管理','优化','实施','推进','完成','相关','进行','工作','系统','流程','服务'].filter(w=>w.length>1));
let SIM_GLC=null;const simGL=()=>SIM_GLC||(SIM_GLC=`电池,动力电池|battery,batteries,hv
维修,修理,维护,检修|repair,maintenance,workshop
备件,配件,零部件|part,spare,spares,component
物流,运输,配送|logistics,shipping,transport,delivery
仓库,仓储,库存,盘点|warehouse,warehousing,stock,inventory,stocking
培训,课程,认证培训|training,trainer,course,academy,certification
技师,工程师,技术员|technician,engineer,mechanic
经销商,渠道商,门店,4s|dealer,dealership,retailer,outlet,store
进口商,总代,分销商|importer,distributor
网络,渠道,网点|network,channel,coverage
废弃,废料,报废,废弃物|waste,scrap,disposal,end-of-life
回收,再利用,梯次利用|recycle,recycling,recycled,buyback,second-life
客户,用户,车主,车辆所有人|customer,owner,consumer,driver
满意度,体验,nps|satisfaction,experience,nps
投诉,抱怨|complaint,escalation,claim
索赔,保修,质保,质量担保|warranty,guarantee,reimbursement
质量,缺陷,故障|quality,defect,fault,failure,issue
召回|recall,campaign
诊断,检测,检查|diagnosis,diagnostic,inspection,detection
工具,设备,专用工具|tool,equipment,tooling
平台,系统,门户|platform,portal,extranet,dms
数字化,线上,在线,网站|digital,online,web,website,e-commerce
应用,小程序|app,application,mobile
软件,升级,ota|software,ota,upgrade,firmware
数据,报表,看板,分析|data,report,dashboard,analytics,analysis
人工智能,智能,大模型|ai,intelligent,chatbot,llm
合同,合约,协议|contract,agreement
财务,费用,成本,预算,结算|finance,financial,cost,budget,settlement,invoice,payment
价格,定价,报价|price,pricing,quotation
充电,充电桩,充电站,壁盒|charging,charger,wallbox,charge
热线,呼叫中心,客服,电话|hotline,call,helpdesk,support
道路救援,救援,拖车|roadside,rescue,towing,breakdown,assistance
上门,移动服务,移动维修|mobile,onsite,on-site,home
轮胎|tyre,tire,wheel
保险,理赔|insurance,insurer
二手车,认证二手|used,pre-owned,second-hand
精品,附件,加装|accessory,accessories,merchandise,lifestyle
手册,文档,资料,知识库|manual,document,documentation,knowledge,library,handbook
合规,法规,认证,型式认证|compliance,regulation,homologation,legal,gdpr
网络安全,信息安全|cybersecurity,security
绩效,指标,考核|kpi,performance,metric,target
流程,规范,标准化|sop,standardization,standardisation,standard
备货,补货,订货|replenishment,ordering,order,procurement
钣喷,钣金,碰撞,事故车|bodyshop,collision,paint,crash,body
车间,工位,展厅|workshop,showroom,bay
德国|germany,german,de,ger
法国|france,french,fra
西班牙|spain,spanish,esp
意大利|italy,italian,ita
英国|uk,britain,british
波兰|poland,polish
荷兰|netherlands,dutch,nl
比利时|belgium,belgian
挪威|norway,norwegian
瑞典|sweden,swedish
丹麦|denmark,danish
芬兰|finland,finnish
葡萄牙|portugal,portuguese
希腊|greece,greek
土耳其|turkey,turkiye
以色列|israel,israeli
乌克兰|ukraine,ukrainian
中东|middle-east,mena,gcc
非洲|africa,african
澳大利亚|australia,australian
欧洲|europe,european,eu
区域|region,regional,local,localization,localisation`.split(String.fromCharCode(10)).map(l=>{const [z,e]=l.split('|');const zh=z.split(','),en=e.split(',').map(w=>libTok(w)[0]||w);return {id:'#'+zh[0]+'/'+e.split(',')[0],zh,en}}));
// words in either language also count as shared concepts, so a Chinese write-up finds English-named projects and the other way round
function simTok(t){
  const raw=String(t||''),lc=raw.toLowerCase(),w=libTok(raw).filter(x=>!SIM_GEN.has(x)),set=new Set(w),out=[...w];
  simGL().forEach(g=>{if(g.en.some(x=>set.has(x))||g.zh.some(z=>lc.includes(z))){out.push(g.id,g.id)}});
  return out;
}
let SIMX=null;
function simDocOf(p){const nt=simTok(trTwo(p.code+'|name',p.name));return [...nt,...nt,...nt,...simTok([p.scope,p.how,p.bg&&p.bg.background,p.bg&&p.bg.why,p.bg&&p.bg.benefit,p.bg&&p.bg.process,p.bg&&p.bg.risk,p.summary,...(p.milestones||[]).map(m=>m.name)].filter(Boolean).join(String.fromCharCode(10)))]}
function simIndex(){
  if(SIMX&&SIMX.n===S.projects.length)return SIMX;
  const docs=new Map(),df=new Map();
  S.projects.filter(p=>!p.alsa).forEach(p=>{const tf=new Map();simDocOf(p).forEach(w=>tf.set(w,(tf.get(w)||0)+1));docs.set(p.id,tf);tf.forEach((_,w)=>df.set(w,(df.get(w)||0)+1))});
  const N=Math.max(1,docs.size),idf=w=>Math.log(1+N/(1+(df.get(w)||0)));
  const norm=new Map();docs.forEach((tf,id)=>{let n=0;tf.forEach((c,w)=>{const x=(1+Math.log(c))*idf(w);n+=x*x});norm.set(id,Math.sqrt(n)||1)});
  return SIMX={n:S.projects.length,docs,idf,norm};
}
// q = {name, text}; returns the closest projects with the words they share
function similarProjects(q,excludeId){
  const nameT=simTok(q.name||''),toks=[...nameT,...nameT,...nameT,...simTok(q.text||'')];if(toks.length<2)return [];
  const X=simIndex(),vec=L=>{const m=new Map();L.forEach(w=>m.set(w,(m.get(w)||0)+1));let n=0;m.forEach((c,w)=>{const x=(1+Math.log(c))*X.idf(w);n+=x*x});return {m,n:Math.sqrt(n)||1}};
  const full=vec(toks),nm=vec(nameT);
  const cos=(Q,tf,dn)=>{let dot=0;const hits=[];Q.m.forEach((c,w)=>{const d=tf.get(w);if(d){const x=(1+Math.log(c))*X.idf(w)*(1+Math.log(d))*X.idf(w);dot+=x;hits.push([w,x])}});return {sc:dot/(Q.n*dn),hits}};
  const out=[];
  S.projects.forEach(p=>{if(p.alsa||p.id===excludeId||!canView(p))return;const tf=X.docs.get(p.id);if(!tf)return;const dn=X.norm.get(p.id);
    const a=cos(full,tf,dn),b=nameT.length?cos(nm,tf,dn):{sc:0,hits:[]};const score=Math.max(a.sc,b.sc*.9),hits=a.hits.length>=b.hits.length?a.hits:b.hits;
    if(score<SIM_MIN||(hits.length<2&&score<.2))return;
    out.push({p,score,words:(h=>{const c=h.filter(w=>w[0]==='#');return (c.length?c:h.filter(w=>/^[a-z0-9-]{3,}$/.test(w)||/^[一-鿿]{3,}$/.test(w)).length?h.filter(w=>/^[a-z0-9-]{3,}$/.test(w)):h).slice(0,4).map(w=>w.replace(/^#/,''))})(hits.sort((x,y)=>y[1]-x[1]).map(x=>x[0]))})});
  return out.sort((a,b)=>b.score-a.score).slice(0,6);
}
const SIM_MIN=.12;
const simQuery=(name,bg,how,ms)=>({name,text:[bg&&bg.background,bg&&bg.why,bg&&bg.benefit,bg&&bg.process,bg&&bg.risk,how,...(ms||[]).map(m=>m.name)].filter(Boolean).join('\n')});
function simHTML(L,act){
  if(!L.length)return act?`<div class="small faint">${T('写完名称和背景后，这里会提示是否已有相似的项目（进行中或已结项）。','Once the name and background are filled in, similar projects (running or closed) show up here.')}</div>`:'';
  return `<div class="note info small sim"><b>${T(`发现 ${L.length} 个相似项目`,`${L.length} similar project(s) found`)}</b> <span class="faint">${T('按名称、背景和内容比对，只是提醒、不拦截：请确认不是重复立项，也可以直接参考已有项目。','Compared on name, background and content. A reminder only, nothing is blocked: check it is not a duplicate, or reuse an existing project.')}</span><div class="sim-list">${L.map(({p,words})=>`<div class="sim-row"><span class="mono">${esc(p.code)}</span><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(tName(p.team))} · ${esc(T(ST[p.status].zh,ST[p.status].en))}${words&&words.length?` · ${T('相近','shared')}：${esc(words.join(' / '))}`:''}</div></div><button type="button" class="btn sm ghost" data-act="open" data-id="${p.id}">${T('查看','View')}</button>${act?`<button type="button" class="btn sm" data-simuse="ref" data-id="${p.id}">${T('参考已有项目','Use as reference')}</button>`:''}</div>`).join('')}</div></div>`;
}
function apply(){
  const u=me();const pre=S.formPrefill&&S.formPrefill.type==='new'?S.formPrefill:null;const d=pre?pre.data:{};
  const tm=d.team||(pre&&pre.team)||scopeTeams()[0];
  const bg=d.bg||{};
  return `<form class="form" id="applyForm" novalidate>
  ${isPMO()?`<div class="note info">${T('PMO 直接立项：适用于已确定的项目（例如分配给区域的任务）。填写后点“直接立项”即生效，不需要再审批。团队提交的立项申请仍由 PMO 审批。','PMO set-up: for projects already decided (e.g. tasks assigned to a region). Click “Set up project” and it takes effect, with no approval step. Requests filed by teams still go to PMO for approval.')}</div>`:''}
  ${pre&&pre.fromFollow?`<div class="note info">${T('由跟进项转入：','Converted from follow-up: ')}<b class="mono">${esc(pre.fromFollowCode)}</b></div>`:''}
  ${pre&&pre.rid?`<div class="note warn">${T('PMO 退回意见：','PMO comment: ')}${esc(pre.comment||'')}</div>`:''}
  <div class="card"><div class="card-h"><h2><span class="sec-t"><span class="n">1</span>${T('申请人','Applicant')}</span></h2></div><div class="card-b fgrid">
    <div class="f"><label>${T('姓名','Name')}${req}</label><input type="text" name="aname" value="${esc(d.applicant?.name||u.name)}" required></div>
    <div class="f"><label>${T('邮箱','Email')}${req}</label><input type="email" name="aemail" value="${esc(d.applicant?.email||u.email)}" required></div>
    <div class="f"><label>${T('所属部门 / 团队','Department / team')}${req}</label><select name="team" id="apTeam">${teamOptions(tm)}</select><span class="hint">${isPMO()?T('PMO 可为任意团队立项','PMO can file for any team'):T('只能为本部门申请项目','You can only file for your own team')}</span></div>
    <div class="f" id="apSecF"><label>${T('科室（服务工程部）','Section (Service Engineering)')}</label><select name="section">${secsFor('SEN').map(x=>`<option value="${x}" ${d.section===x?'selected':''}>${esc(secName(x))}</option>`).join('')}</select></div>
    <div class="f"><label>${isPMO()?T('项目编号','Project code'):T('审批通过后的项目编号','Code after approval')}</label><input type="text" id="apCode" readonly class="mono"><span class="hint">${isPMO()?T('提交后立即生成，此处为预览','Assigned on submit; preview only'):T('编号在 PMO 审批通过时自动生成，申请阶段为预览','Assigned automatically on approval; preview only')}</span></div>
  </div></div>
  <div class="card"><div class="card-h"><h2><span class="sec-t"><span class="n">2</span>${T('项目名称与背景','Project and background')}</span></h2></div><div class="card-b fgrid">
    <div class="f full"><label>${T('项目名称','Project name')}${req}</label><input type="text" name="name" value="${esc(d.name||'')}" required></div>
    <div class="f full"><label>${T('立项背景','Background')}${req}</label><textarea name="background" required placeholder="${T('现状是什么','What is the current situation')}">${esc(bg.background||'')}</textarea></div>
    <div class="f"><label>${T('为什么要立项','Why a project')}${req}</label><textarea name="why" required>${esc(bg.why||'')}</textarea></div>
    <div class="f"><label>${T('能带来哪些收益','Expected benefits')}${req}</label><textarea name="benefit" required placeholder="${T('尽量量化，例如时效、成本、满意度','Quantify where possible')}">${esc(bg.benefit||'')}</textarea></div>
    <div class="f"><label>${T('改善哪些流程','Processes improved')}</label><textarea name="process">${esc(bg.process||'')}</textarea></div>
    <div class="f"><label>${T('解决哪些风险','Risks addressed')}</label><textarea name="risk">${esc(bg.risk||'')}</textarea></div>
    <div class="f full" id="apSim" aria-live="polite"></div>
  </div></div>
  <div class="card"><div class="card-h"><h2><span class="sec-t"><span class="n">3</span>${T('负责人与执行人','Owner and executors')}</span></h2></div><div class="card-b form"><div class="fgrid">
    <div class="f"><label>${T('项目负责人','Project owner')}${req}</label><input type="text" name="pic" id="apPic" list="plist" value="${esc(d.pic||u.name)}" required></div>
    <div class="f"><label>${T('负责人所属团队','Owner\'s team')}${req}</label>${teamSel('name="picTeam" id="apPicTeam" required',d.picTeam||userTeamTxt(d.pic||u.name)||'')}</div></div>
    <div class="lbl">${T('项目执行人（可添加多人，可跨部门）','Executors (add as many as needed; cross-team allowed)')}${req}</div>
    <div class="ex-grid" id="exTable"><div class="ex-head"><span>${T('姓名','Name')}</span><span>${T('所属团队','Team')}</span><span>${T('权责（手动填写：负责什么、做到什么程度）','Responsibilities (free text)')}</span><span></span></div><div id="exBody"></div></div>
    <div class="row"><button type="button" class="btn" id="exAdd">${ico('apply')}${T('添加执行人','Add executor')}</button><span class="small faint">${T('每位执行人都要写团队；权责会成为结项时核对贡献的依据。','Every executor needs a team; the responsibilities are what the close request is checked against.')}</span></div>
  </div></div>
  <div class="card"><div class="card-h"><h2><span class="sec-t"><span class="n">4</span>${T('执行要求与时间轴','Execution plan and timeline')}</span></h2><span class="sp"></span><span class="small faint">${T('每个节点的交付成果会成为项目管控表里的里程碑','Each deliverable becomes a tracked milestone')}</span></div><div class="card-b form">
    <div class="fgrid"><div class="f"><label>${T('开始时间','Start')}${req}</label><input type="date" name="start" value="${esc(d.start||'')}" required></div><div class="f"><label>${T('计划完成时间','Planned end')}${req}</label><input type="date" name="end" value="${esc(d.end||'')}" required></div>
    <div class="f full"><label>${T('怎么做（执行方式说明）','How it will be done')}</label><textarea name="how" placeholder="${T('分几步做、关键动作、需要的支持','Steps, key actions, support needed')}">${esc(d.how||'')}</textarea></div></div>
    <div class="lbl">${T('项目节点与交付成果','Milestones and deliverables')}${req}</div>
    <div class="tw"><table class="t" id="msTable"><thead><tr><th style="width:34px">#</th><th>${T('节点交付成果','Deliverable')}</th><th style="width:160px">${T('截止日期','Due')}</th><th>${T('成果提交形式','Evidence format')}</th><th style="width:40px"></th></tr></thead><tbody></tbody></table></div>
    <div class="row"><button type="button" class="btn" id="msAdd">${ico('apply')}${T('添加节点','Add milestone')}</button><span class="small faint">${T('系统会在每个节点前一周、前三天、前一天发出由轻到重的三次提醒（三天前抄送部门经理，前一天再抄送 PMO）；逾期未交会通知 PMO 评估是否延期。','Three reminders go out before each milestone, one week, three days and one day ahead, each stricter than the last (manager copied at three days, PMO as well at one day); if nothing is submitted, PMO is notified to review an extension.')}</span></div>
  </div></div>
  <div id="apErr"></div>
  <div class="row"><button class="btn pri" type="submit">${isPMO()?T('直接立项','Set up project'):pre&&pre.rid?T('重新提交审批','Resubmit'):T('提交给 PMO 审批','Submit to PMO')}</button><span class="small faint">${isPMO()?T('PMO 直接立项：提交后立即生效、生成编号，并邮件通知负责人、执行人和部门经理，不需要审批。','PMO set-up: takes effect at once, gets its code, and emails the owner, executors and manager. No approval step.'):T('提交后项目名称、负责人、执行人、时间及执行要求即锁定，之后修改需走变更申请。','After approval, name, owner, executors, dates and plan are locked and change only via a change request.')}</span></div>
  <datalist id="plist">${people().map(n=>`<option value="${esc(n)}">`).join('')}</datalist></form>`;
}
function msRow(m,i){
  return `<tr><td class="num faint">${i+1}</td><td><input type="text" class="ms-name" value="${esc(m.name||'')}" placeholder="${T('例如：完成供应商评估报告','e.g. supplier assessment report')}"></td><td><input type="date" class="ms-due" aria-label="${T('计划完成日期','Due date')}" value="${esc(m.due||'')}"></td><td>${fmBoxes('ms-f',m.forms)}</td><td><button type="button" class="btn sm ghost icon-btn ms-del" aria-label="${T('删除这个节点','Remove this milestone')}">${ico('x')}</button></td></tr>`;
}
function readMs(tb){return $$('tr',tb).map((tr,i)=>({id:'m'+(i+1),name:$('.ms-name',tr).value.trim(),due:$('.ms-due',tr).value,forms:fmRead(tr,'ms-f')}))}
function bindMsTable(tb,init){
  const draw=ms=>{tb.innerHTML=ms.map(msRow).join('');$$('.ms-del',tb).forEach((b,i)=>b.onclick=()=>{const cur=readMs(tb);cur.splice(i,1);draw(cur.length?cur:[{}])})};
  draw(init&&init.length?init:[{},{}]);return {add:()=>{const c=readMs(tb);c.push({});draw(c)},read:()=>readMs(tb),set:rows=>draw(rows&&rows.length?rows:[{},{}])};
}
function applyAfter(){
  const f=$('#applyForm');const pre=S.formPrefill&&S.formPrefill.type==='new'?S.formPrefill:null;const d=pre?pre.data:{};
  const tm=$('#apTeam'),code=$('#apCode');const st=f.elements.start;
  const upd=()=>{code.value=nextCode(tm.value,(st.value||today()).slice(2,4));$('#apSecF').hidden=tm.value!=='SEN'};tm.onchange=upd;st.addEventListener('change',upd);upd();
  let ex=[];
  const exTb=$('#exBody');
  const exRow=x=>`<div class="ex-r"><div>${ppkHTML(x)}</div><div>${tpkHTML('',x.team||'')}</div><input type="text" class="ex-d" value="${esc(x.duty||'')}" placeholder="${T('例如：负责后端割接','e.g. owns the back-end cut-over')}" aria-label="${T('权责','Responsibilities')}"><button type="button" class="btn sm ghost icon-btn ex-del" aria-label="${T('移除','Remove')}">${ico('x')}</button></div>`;
  const readEx=()=>$$('.ex-r',exTb).map(r=>({...ppkRead($('.ppk',r)),team:tpkRead($('.tpk',r)),duty:$('.ex-d',r).value.trim()}));
  const drawEx=rows=>{exTb.innerHTML=(rows.length?rows:[{}]).map(exRow).join('');$$('.ex-del',exTb).forEach((bt,i)=>bt.onclick=()=>{const c=readEx();c.splice(i,1);drawEx(c)})};
  exTb.addEventListener('change',e=>{if(!e.target.classList.contains('ppk-s'))return;const row=e.target.closest('.ex-r'),ts=$('.tpk-s',row);if(ts&&!ts.value&&e.target.value&&e.target.value!=='__other'){const c=userTeamTxt(e.target.value);if(c&&[...ts.options].some(o=>o.value===c))ts.value=c}});
  drawEx((d.execInfo&&d.execInfo.length?d.execInfo:(d.exec||[]).map(n=>({name:n,team:userTeamTxt(n),duty:''}))));
  $('#exAdd').onclick=()=>{const c=readEx();c.push({});drawEx(c)};
  const pt=$('#apPicTeam');$('#apPic').addEventListener('change',()=>{if(!pt.value)pt.value=userTeamTxt($('#apPic').value)});
  const ms=bindMsTable($('#msTable tbody'),d.milestones);$('#msAdd').onclick=ms.add;
  {const simBox=$('#apSim'),nm=f.elements.name;let tm=0;
   const simUpd=()=>{const g=k=>f.elements[k].value.trim();simBox.innerHTML=simHTML(similarProjects(simQuery(nm.value,{background:g('background'),why:g('why'),benefit:g('benefit'),process:g('process'),risk:g('risk')},g('how'),ms.read())),true)};
   f.addEventListener('input',e=>{if(['name','background','why','benefit','process','risk','how'].includes(e.target.name)||e.target.closest('#msTable')){clearTimeout(tm);tm=setTimeout(simUpd,350)}});simUpd();
   simBox.addEventListener('click',e=>{const b=e.target.closest('[data-simuse]');if(!b)return;const q=S.projects.find(x=>x.id===b.dataset.id);if(!q)return;
     const bgv=(q.bg&&q.bg.background)||q.scope||'';if(bgv&&!f.elements.background.value.trim())f.elements.background.value=String(bgv).slice(0,1500);
     if(q.how&&!f.elements.how.value.trim())f.elements.how.value=q.how;
     if((q.milestones||[]).length&&!ms.read().some(x=>x.name))ms.set(q.milestones.map(m=>({name:m.name,due:'',forms:[...(m.forms||[])]})));
     toast(T('已带入参考内容：背景、执行方式和节点名称（日期请自己填）；名称请自己起','Copied background, approach and milestone names (set the dates and the name yourself)'),'info')})}
  f.addEventListener('submit',e=>{e.preventDefault();
    const fd=Object.fromEntries(new FormData(f));const m=ms.read().filter(x=>x.name||x.due);const err=[];
    ['aname','aemail','name','background','why','benefit','pic','picTeam','start','end'].forEach(k=>{if(!String(fd[k]||'').trim())err.push(k)});
    const exr=readEx().filter(x=>x.name||x.team||x.duty);ex=exr.map(x=>x.name);
    if(err.length) return showErr('#apErr',T('请填写所有带 * 的必填项','Fill in every field marked *'));
    if(!exr.length||exr.some(x=>!x.name)) return showErr('#apErr',T('请至少添加一位执行人，并写清每个人的姓名','Add at least one executor and give every name'));
    if(exr.some(x=>!x.team)) return showErr('#apErr',T('每位执行人都要填写所属团队','Every executor needs a team'));
    {const EM=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;if(exr.some(x=>x.other&&(!x.name||!EM.test(x.email)))) return showErr('#apErr',T('选了「其他」的执行人，请填写姓名和有效邮箱','For “Other”, enter the name and a valid email'))}
    if(fd.end<fd.start) return showErr('#apErr',T('计划完成时间不能早于开始时间','End date is before start date'));
    if(!m.length||m.some(x=>!x.name||!x.due)) return showErr('#apErr',T('每个节点都需要填写交付成果和截止日期','Each milestone needs a deliverable and a due date'));
    if(m.some(x=>x.due<fd.start||x.due>fd.end)) return showErr('#apErr',T('节点截止日期需在项目开始与完成时间之间','Milestone dates must fall between start and end'));
    if(m.some(x=>!x.forms.length)) return showErr('#apErr',T('每个节点至少选择一种成果提交形式','Pick at least one evidence format per milestone'));
    if(m.some(x=>fmMissingText(x.forms))) return showErr('#apErr',T('选了「其他」，请填写具体的提交形式','You picked “Other”: describe the format'));
    const data={applicant:{name:fd.aname,email:fd.aemail,dept:fd.team},team:fd.team,section:fd.team==='SEN'?fd.section:'',name:fd.name.trim(),bg:{background:fd.background,why:fd.why,benefit:fd.benefit,process:fd.process,risk:fd.risk},pic:fd.pic,picTeam:(fd.picTeam||'').trim(),exec:ex,execInfo:exr,start:fd.start,end:fd.end,how:fd.how,milestones:m.sort((a,b)=>a.due.localeCompare(b.due))};
    if(pre&&pre.fromFollow) data.fromFollow=pre.fromFollow;
    if(isPMO()){
      let r=pre&&pre.rid&&S.requests.find(x=>x.id===pre.rid);
      const dec={by:me().id,at:nowStamp(),comment:T('PMO 直接立项','Set up directly by PMO')};
      if(r)Object.assign(r,{status:'approved',data,team:fd.team,decision:dec,direct:true});else{r={id:uid(),type:'new',status:'approved',by:me().id,at:nowStamp(),team:fd.team,data,decision:dec,direct:true};S.requests.unshift(r)}
      const p=createProject(r,'',true);S.formPrefill=null;save();go('projects',null,true);openDrawer('p',p.id,'info');toast(T(`已立项：${p.code}，已通知负责人和执行人`,`Project ${p.code} set up; owner and executors notified`));return;
    }
    if(pre&&pre.rid){const r=S.requests.find(x=>x.id===pre.rid);Object.assign(r,{status:'pending',data,team:fd.team,at:nowStamp(),decision:null})}
    else S.requests.unshift({id:uid(),type:'new',status:'pending',by:me().id,at:nowStamp(),team:fd.team,data});
    S.formPrefill=null;sendMail({to:['Aiden'],cc:[fd.aname],subject:`[${T('立项申请','New project request')}] ${data.name}`,body:`${fd.aname}（${tName(fd.team)}）${T('提交了立项申请，请审批。','submitted a new project request for approval.')}${sig()}`,rule:'manual'});
    save();go('approvals',null,true);S.filters.atab='mine';render();toast(T('已提交，等待 PMO 审批','Submitted for PMO approval'));
  });
}
function showErr(sel,msg){const el=$(sel);el.innerHTML=`<div class="note bad">${esc(msg)}</div>`;el.scrollIntoView({block:'center',behavior:'smooth'});return false}

/* --- shared: team → project cascade + info card --- */
function pickerHTML(prefix,filter){
  const pid=S.formPid;const p0=pid&&S.projects.find(p=>p.id===pid);const tm=p0?p0.team:scopeTeams()[0];
  return `<div class="card"><div class="card-h"><h2><span class="sec-t"><span class="n">1</span>${T('选择项目','Pick the project')}</span></h2><span class="sp"></span><span class="small faint">${T('先选团队，再选项目编号，项目信息自动带出','Pick team, then code; details load automatically')}</span></div><div class="card-b fgrid">
    <div class="f"><label>${T('所属团队','Team')}${req}</label><select id="${prefix}Team">${teamOptions(tm)}</select></div>
    <div class="f"><label>${T('项目编号','Project code')}${req}</label><select id="${prefix}Pid"></select></div></div>
    <div class="card-b" id="${prefix}Info" style="border-top:1px solid var(--line-2)"></div></div>`;
}
function bindPicker(prefix,filter,onPick){
  const tm=$('#'+prefix+'Team'),ps=$('#'+prefix+'Pid');
  const fill=()=>{const L=S.projects.filter(p=>p.team===tm.value&&canSee(p)&&filter(p)).sort((a,b)=>a.code.localeCompare(b.code));
    const miss=S.formPid&&!L.some(p=>p.id===S.formPid); // e.g. a closed project: nothing is preselected
    ps.innerHTML=L.length?(miss?`<option value="" selected>${T('请选择项目','Pick a project')}</option>`:'')+L.map(p=>`<option value="${p.id}" ${p.id===S.formPid?'selected':''}>${p.code} · ${esc(p.name.slice(0,70))}</option>`).join(''):`<option value="">${T('该团队没有可选项目','No eligible projects')}</option>`;pick()};
  const pick=()=>{const p=S.projects.find(x=>x.id===ps.value);$('#'+prefix+'Info').innerHTML=p?infoCard(p):`<div class="empty">${T('请选择项目','Pick a project')}</div>`;onPick(p)};
  tm.onchange=()=>{S.formPid=null;fill()};ps.onchange=pick;fill();
}
function infoCard(p){
  return `<dl class="kv"><dt>${T('项目','Project')}</dt><dd><b class="mono">${p.code}</b> ${esc(p.name)} ${pill(p.status)}</dd>
  <dt>${T('负责人','Owner')}</dt><dd>${esc(p.pic||'—')}</dd><dt>${T('执行人','Executors')}</dt><dd>${esc((p.exec||[]).join('、')||'—')}</dd>
  <dt>${T('时间','Dates')}</dt><dd class="num">${fd(p.start)} → ${fd(p.end)}${(p.exts||[]).length?` · ${T('已延期','extended')} ${p.exts.length} ${T('次','×')}`:''}</dd>
  <dt>${T('交付进度','Delivered')}</dt><dd>${prog(p)}</dd>
  <dt>${T('执行要求','Plan')}</dt><dd><div style="max-height:140px;overflow:auto" class="small muted">${esc(p.scope||p.how||'—')}</div></dd></dl>`;
}

/* --- extension / plan change: re-plan the whole project, not just the end date --- */
const fk=a=>[...new Set((a||[]).map(x=>fmBase(x)==='其他'?x:fmBase(x)))].sort().join('|');
const rpState=r=>r.drop?'dropped':r.isNew?'new':r.due!==r.oldDue?'moved':(r.name!==r.oldName||fk(r.forms)!==fk(r.oldForms))?'edited':'kept';
const rpDays=r=>r.due&&r.oldDue?diff(r.due,r.oldDue):0;
function rpDefaults(P){return (P.milestones||[]).filter(m=>!m.done).map(m=>({id:m.id,name:m.name||'',oldName:m.name||'',due:m.due||'',oldDue:m.due||'',forms:[...(m.forms||[])],oldForms:[...(m.forms||[])],drop:false,why:''}))}
// suggestions the PMO can still edit by hand: how do the open milestones follow the new end date?
function rpSuggest(rows,P,newEnd,how){
  const oldEnd=P.end,delta=diff(newEnd,oldEnd),t=today();
  rows.forEach(r=>{if(r.isNew||r.drop)return;
    if(how==='keep')r.due=r.oldDue;
    else if(how==='tail')r.due=(r.oldDue&&r.oldDue>=oldEnd)?addDays(r.oldDue,delta):r.oldDue;
    else if(how==='shift')r.due=r.oldDue?addDays(r.oldDue,delta):r.oldDue;
    else if(how==='stretch'){const a=diff(oldEnd,t),b=diff(newEnd,t);r.due=(r.oldDue&&a>0&&r.oldDue>t)?addDays(t,Math.round(diff(r.oldDue,t)*b/a)):r.oldDue}
    if(r.due>newEnd)r.due=newEnd});
}
function replanBind(box,P,getEnd,st){
  const M=st||{rows:rpDefaults(P),how:'tail',keepOk:false};const rows=M.rows;
  const effEnd=()=>getEnd()||P.end;
  const extending=()=>!!getEnd()&&!!P.end&&diff(getEnd(),P.end)>0;
  const how=[['tail',T('只顺延最后交付的节点','Only the last milestone(s) move')],['shift',T('所有未完成节点整体顺延','Shift every open milestone by the delay')],['stretch',T('按比例拉长所有节点','Stretch all open milestones proportionally')],['keep',T('全部保持原日期','Keep every date')]];
  const row=(r,i)=>`<tr data-i="${i}" class="${r.drop?'faint':''}"><td class="num faint">${i+1}</td><td><input type="text" class="rp-name" value="${esc(r.name)}" ${r.drop?'disabled':''} placeholder="${T('交付成果','Deliverable')}" style="${r.drop?'text-decoration:line-through':''}">${r.drop?`<input type="text" class="rp-why" value="${esc(r.why)}" placeholder="${T('为什么删除这个节点（必填）','Why is it dropped? (required)')}" style="margin-top:6px">`:''}</td><td class="num small">${esc(r.isNew?'—':fd(r.oldDue))}</td><td><input type="date" class="rp-due" value="${esc(r.due)}" ${r.drop?'disabled':''}></td><td class="small" id="rpB${i}"></td><td>${fmBoxes('rp-f',r.forms,r.drop)}</td><td><button type="button" class="btn sm ghost rp-x" aria-label="${r.isNew?T('删除','Remove'):r.drop?T('恢复','Restore'):T('删除这个节点','Drop this milestone')}">${r.drop?T('恢复','Undo'):ico('x')}</button></td></tr>`;
  const badge=r=>{const s=rpState(r),d=rpDays(r);return {kept:`<span class="faint">${T('不变','no change')}</span>`,moved:`<span class="tag" style="color:var(--warn)">${d>0?'+':''}${d} ${T('天','d')}</span>`,edited:`<span class="tag">${T('已改内容','edited')}</span>`,dropped:`<span class="tag" style="color:var(--bad)">${T('删除','dropped')}</span>`,new:`<span class="tag" style="color:var(--ok)">${T('新增','new')}</span>`}[s]};
  const sync=()=>{ // DOM -> model
    $$('#rpBody tr',box).forEach(tr=>{const r=rows[+tr.dataset.i];if(!r)return;
      const n=$('.rp-name',tr),du=$('.rp-due',tr),w=$('.rp-why',tr);
      if(n&&!r.drop)r.name=n.value;if(du&&!r.drop)r.due=du.value;if(w)r.why=w.value;if(!r.drop)r.forms=fmRead(tr,'rp-f')})};
  const summary=()=>{
    const e=effEnd(),act=rows.filter(r=>!r.drop),by=k=>rows.filter(r=>rpState(r)===k).length;
    const late=act.filter(r=>r.due&&e&&r.due>e).length,early=act.filter(r=>r.due&&P.start&&r.due<P.start).length,over=act.filter(r=>r.due&&r.due<today()).length;
    rows.forEach((r,i)=>{const b=$('#rpB'+i,box);b&&(b.innerHTML=badge(r))});
    const changed=rows.some(r=>rpState(r)!=='kept');const ed=getEnd()&&P.end?diff(getEnd(),P.end):0;
    $('#rpSum',box).innerHTML=`<b>${T('影响汇总','Impact')}${CO()}</b>${ed?` ${T('完成日','End')} ${fd(P.end)} → ${fd(getEnd())} (${ed>0?'+':''}${ed} ${T('天','d')}) ·`:''} ${T(`${by('moved')} 个节点改期，${by('edited')} 个改内容，${by('dropped')} 个删除，${by('new')} 个新增，${by('kept')} 个不变`,`${by('moved')} moved, ${by('edited')} edited, ${by('dropped')} dropped, ${by('new')} added, ${by('kept')} unchanged`)}`
      +(late?`<br><span style="color:var(--bad)">${T(`${late} 个节点晚于项目完成日，请调整`,`${late} milestone(s) fall after the project end date; fix them`)}</span>`:'')
      +(early?`<br><span style="color:var(--bad)">${T(`${early} 个节点早于项目开始日`,`${early} milestone(s) fall before the project start`)}</span>`:'')
      +(over?`<br><span style="color:var(--warn)">${T(`${over} 个节点的日期已过，提交后会立即显示为逾期`,`${over} milestone(s) are already in the past and will show as overdue`)}</span>`:'');
    const k=$('#rpKeep',box);if(k)k.hidden=changed||!extending();
  };
  const draw=()=>{
    box.innerHTML=`<div class="lbl">${T('同步调整项目规划：节点与交付成果','Re-plan the project: milestones and deliverables')}</div>
    <div class="row" id="rpTools"><label class="small muted" for="rpHow">${T('按新完成日自动调整','Auto-adjust to the new end date')}</label><select id="rpHow" style="width:auto">${how.map(([k,l])=>`<option value="${k}" ${M.how===k?'selected':''}>${esc(l)}</option>`).join('')}</select><button type="button" class="btn sm" id="rpApply">${T('应用建议','Apply')}</button><span class="small faint">${T('只是建议，每一行都可以再手动改。','A suggestion only; you can still edit every row.')}</span></div>
    <div class="tw"><table class="t"><thead><tr><th>#</th><th>${T('交付成果','Deliverable')}</th><th>${T('原截止','Was due')}</th><th>${T('新截止','New due')}</th><th>${T('变化','Change')}</th><th>${T('提交形式','Format')}</th><th></th></tr></thead><tbody id="rpBody">${rows.map(row).join('')||`<tr><td colspan="7" class="empty small">${T('没有未完成的节点','No open milestones')}</td></tr>`}</tbody></table></div>
    <button type="button" class="btn" id="rpAdd" style="align-self:flex-start">${ico('apply')}${T('添加节点','Add milestone')}</button>
    <div class="note info small" id="rpSum"></div>
    <label class="chk" id="rpKeep" hidden><input type="checkbox" id="rpKeepOk" ${M.keepOk?'checked':''}> ${T('我确认：延期后所有节点和交付成果保持原计划不变','I confirm: after the extension all milestones and deliverables stay as planned')}</label>`;
    $('#rpApply',box).disabled=!extending();
    $('#rpApply',box).onclick=()=>{sync();M.how=$('#rpHow',box).value;rpSuggest(rows,P,getEnd(),M.how);draw()};
    $('#rpAdd',box).onclick=()=>{sync();rows.push({id:null,name:'',oldName:'',due:effEnd()||'',oldDue:'',forms:['图文汇报'],oldForms:[],drop:false,why:'',isNew:true});draw()};
    $('#rpKeepOk',box).onchange=e=>{M.keepOk=e.target.checked};
    summary();
  };
  box.onclick=e=>{const b=e.target.closest('.rp-x');if(!b)return;sync();const i=+b.closest('tr').dataset.i,r=rows[i];if(r.isNew)rows.splice(i,1);else r.drop=!r.drop;draw()};
  box.oninput=box.onchange=e=>{if(e.target.id==='rpHow'||e.target.id==='rpKeepOk')return;sync();summary()};
  draw();
  return {state:M,
    // the end date field changed: re-suggest only while nothing has been touched by hand
    onEnd:()=>{if(extending()&&!rows.some(r=>rpState(r)!=='kept')){sync();rpSuggest(rows,P,getEnd(),M.how);draw()}else{$('#rpApply',box).disabled=!extending();summary()}},
    // '' when fine, otherwise the message to show
    check:()=>{sync();const e=effEnd(),act=rows.filter(r=>!r.drop);
      if(rows.some(r=>!r.drop&&(!r.name.trim()||!r.due)))return T('每个节点都需要交付成果和截止日期','Each milestone needs a deliverable and a due date');
      if(rows.some(r=>r.drop&&!r.why.trim()))return T('删除的节点需要填写原因','Say why each dropped milestone is dropped');
      if(act.some(r=>fmMissingText(r.forms)))return T('选了「其他」，请填写具体的提交形式','You picked “Other”: describe the format');
      if(act.some(r=>e&&r.due>e))return T('有节点晚于项目完成日，请先调整节点或完成日','A milestone falls after the project end date');
      if(act.some(r=>P.start&&r.due<P.start))return T('有节点早于项目开始日','A milestone falls before the project start');
      if(!act.length&&!(P.milestones||[]).some(m=>m.done))return T('至少保留一个节点','Keep at least one milestone');
      return ''},
    changed:()=>rows.some(r=>rpState(r)!=='kept'),keepOk:()=>M.keepOk,
    lines:()=>rows.map(r=>({id:r.id||null,name:r.name.trim(),oldName:r.oldName||'',due:r.due,oldDue:r.oldDue||'',forms:r.forms,st:rpState(r),why:(r.why||'').trim()}))};
}
/* tidy diff of a re-plan for the approval card */
function replanTable(rp){
  const st={kept:'',moved:'',edited:T('改内容','edited'),dropped:T('删除','dropped'),new:T('新增','new')};
  return `<div class="tw"><table class="t"><thead><tr><th>#</th><th>${T('交付成果','Deliverable')}</th><th>${T('原截止','Was')}</th><th>${T('新截止','New')}</th><th>${T('变化','Change')}</th></tr></thead><tbody>${rp.lines.map((l,i)=>{const dd=l.due&&l.oldDue?diff(l.due,l.oldDue):0;
    return `<tr style="${l.st==='dropped'?'opacity:.6':''}"><td class="num faint">${i+1}</td><td><span style="${l.st==='dropped'?'text-decoration:line-through':''}">${esc(l.name||l.oldName)}</span>${l.oldName&&l.name&&l.oldName!==l.name?`<div class="small faint">${T('原','was')}：${esc(l.oldName)}</div>`:''}${l.why?`<div class="small" style="color:var(--bad)">${esc(l.why)}</div>`:''}</td><td class="num small">${esc(fd(l.oldDue))}</td><td class="num">${l.st==='dropped'?'—':esc(fd(l.due))}</td><td class="small">${l.st==='moved'?`<b style="color:var(--warn)">${dd>0?'+':''}${dd} ${T('天','d')}</b>`:esc(st[l.st]||T('不变','no change'))}</td></tr>`}).join('')}</tbody></table></div>`;
}

/* --- change request --- */
const CH_TYPES=()=>[['end',T('整体延期','Overall delay')],['plan',T('节点异动','Milestone change')],['exec',T('变更执行人','Executors')],['pic',T('变更负责人','Owner')],['name',T('变更项目名称','Project name')],['start',T('变更开始时间','Start date')],['hold',T('申请暂停项目','Put on hold')],['cancel',T('申请取消项目','Cancel project')]];
function change(){
  return `<form class="form" id="chForm" novalidate>${pickerHTML('ch')}
  <div class="card"><div class="card-h"><h2><span class="sec-t"><span class="n">2</span>${T('变更内容','What changes')}</span></h2></div><div class="card-b form">
    <div class="row">${CH_TYPES().map(([k,l])=>`<label class="chk"><input type="radio" name="types" value="${k}">${l}</label>`).join('')}</div><div class="small faint">${T('每次只能提交一类变更；有多类变更请分别申请。','One kind of change per request; file several requests for several changes.')}</div>
    <div id="chFields" class="form"></div>
    <div class="f"><label>${T('原因类别','Reason category')}</label><select name="reasonType"><option value="">${T('请选择','Choose')}</option>${REASONS().map(([g,L])=>`<optgroup label="${esc(g)}">${L.map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select></div>
    <div id="chDelay" class="form" hidden><div id="chFlow"></div><div class="fgrid">
      <div class="f"><label>${T('原因涉及的团队','Team behind the reason')}${req}</label>${teamSel('name="rTeam"','')}</div>
      <div class="f"><label>${T('业务原因（业务板块）','Business reason (area)')}${req}</label><select name="rBiz"><option value="">${T('请选择','Choose')}</option>${BIZ().map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</select></div></div>
      <div class="f" id="chCatchF" hidden><label>${T('追赶计划','Catch-up plan')}${req}</label><textarea name="catchup" placeholder="${T('下一阶段如何追回进度：调整节点或交付比例、需要的支持','How the next phase makes up for it: adjusted milestones or deliverables, support needed')}"></textarea></div></div>
    <div class="f"><label>${T('变更原因','Reason')}${req}</label><textarea name="reason" required placeholder="${T('为什么需要变更，对结果有什么影响','Why, and what it changes for the outcome')}"></textarea></div>
  </div></div><div id="chErr"></div>
  <div class="row"><button class="btn pri" type="submit">${T('提交变更申请','Submit change request')}</button><span class="small faint">${T('PMO 审批通过后才会生效，并记录在项目变更历史中。','Takes effect only after PMO approval; kept in the project history.')}</span></div>
  <datalist id="plist">${people().map(n=>`<option value="${esc(n)}">`).join('')}</datalist></form>`;
}
function changeAfter(){
  let P=null,ex=[],ms=null;const f=$('#chForm');
  const fields=()=>{const types=$$('input[name=types]:checked',f).map(x=>x.value);{const dl=$('#chDelay');if(dl){const dly=types.includes('end'),mv=types.includes('plan');dl.hidden=!(dly||mv);$('#chCatchF').hidden=!mv;$('#chFlow').innerHTML=chFlowHTML(dly,mv)}}
    const box=$('#chFields');if(!P){box.innerHTML='';return}
    let h='';
    if(types.includes('name')) h+=`<div class="f"><label>${T('新项目名称','New name')}</label><input type="text" id="chName" value="${esc(P.name)}"></div>`;
    if(types.includes('pic')) h+=`<div class="f"><label>${T('新负责人','New owner')}</label><input type="text" id="chPic" list="plist" value="${esc(P.pic||'')}"></div>`;
    if(types.includes('exec')) h+=`<div class="f"><label>${T('执行人（调整后的完整名单）','Executors (full new list)')}</label><div class="row" style="flex-wrap:nowrap"><input type="text" id="chExIn" list="plist"><button type="button" class="btn" id="chExAdd">${T('添加','Add')}</button></div><div class="row" id="chExList"></div></div>`;
    if(types.includes('start')) h+=`<div class="f"><label>${T('新开始时间','New start')}</label><input type="date" id="chStart" value="${esc(P.start||'')}"></div>`;
    if(types.includes('end')) h+=`<div class="f"><label>${T('延期至（新计划完成时间）','Extend to')}</label><input type="date" id="chEnd" value="${esc(P.end||'')}"><span class="hint">${T('当前','Current')}${CO()}${fd(P.end)}${(P.exts||[]).length?` · ${T('历史延期','previous')}${CO()}${P.exts.join(' → ')}`:''}</span></div>`;
    if(types.includes('hold')) h+=`<div class="f"><label>${T('预计恢复时间（可选）','Expected resume date (optional)')}</label><input type="date" id="chResume"></div>`;
    if(types.includes('cancel')) h+=`<div class="note warn small">${T('取消项目：PMO 批准后项目状态变为「已取消」，未完成的节点不再提醒。请在下方写清取消原因和已完成的成果如何处理。','Cancelling: once PMO approves, the project becomes Canceled and open milestones stop reminding. Say why, and what happens to what was delivered.')}</div>`;
    if(types.includes('end')||types.includes('plan')) h+=`<div id="rpBox" class="form"></div>`;
    box.innerHTML=h;
    if(types.includes('exec')){ex=[...(P.exec||[])];const L=$('#chExList');const draw=()=>L.innerHTML=ex.map((n,i)=>`<span class="tag" style="padding:3px 8px">${esc(n)} <button type="button" class="chip-x" data-i="${i}" aria-label="${T('移除','Remove')} ${esc(n)}">${ico('x')}</button></span>`).join('');L.onclick=e=>{const b=e.target.closest('button[data-i]');if(b){ex.splice(+b.dataset.i,1);draw()}};$('#chExAdd').onclick=()=>{const v=$('#chExIn').value.trim();if(v&&!ex.includes(v))ex.push(v);$('#chExIn').value='';draw()};draw()}
    ms=null;
    if(types.includes('end')||types.includes('plan')){
      ms=replanBind($('#rpBox'),P,()=>types.includes('end')?($('#chEnd')||{}).value:P.end,rpSaved);rpSaved=ms.state;
      const ce=$('#chEnd');if(ce)ce.addEventListener('change',()=>ms.onEnd());
    }
  };
  let rpSaved=null;
  bindPicker('ch',p=>INFLIGHT.includes(p.status),p=>{P=p;rpSaved=null;fields()});
  $$('input[name=types]',f).forEach(x=>x.onchange=fields);
  f.addEventListener('submit',e=>{e.preventDefault();if(!P)return showErr('#chErr',T('请选择项目','Pick a project'));
    const types=$$('input[name=types]:checked',f).map(x=>x.value);const reason=f.elements.reason.value.trim();
    if(!types.length) return showErr('#chErr',T('请至少勾选一项变更内容','Tick at least one change'));
    if(!reason) return showErr('#chErr',T('请填写变更原因','Give a reason'));
    const dly=types.includes('end'),mv=types.includes('plan');const rType=(f.elements.reasonType||{}).value||'',rTeam=((f.elements.rTeam||{}).value||'').trim(),rBiz=(f.elements.rBiz||{}).value||'',catchup=((f.elements.catchup||{}).value||'').trim();
    if((dly||mv)&&(!rType||!rTeam||!rBiz))return showErr('#chErr',T('延期 / 异动需要选择原因类别、涉及的团队和业务原因','A delay or change needs the reason category, the team and the business reason'));
    if(mv&&!dly&&!catchup)return showErr('#chErr',T('节点异动请附追赶计划','Add a catch-up plan for a milestone change'));
    const before={},after={};
    if(types.includes('name')){before.name=P.name;after.name=$('#chName').value.trim()}
    if(types.includes('pic')){before.pic=P.pic;after.pic=$('#chPic').value.trim()}
    if(types.includes('exec')){before.exec=P.exec;after.exec=ex}
    if(types.includes('start')){before.start=P.start;after.start=$('#chStart').value}
    const stat=types.filter(k=>k==='hold'||k==='cancel');
    if(stat.length&&types.length>1)return showErr('#chErr',T('暂停或取消项目不能和其他变更一起提交，请单独申请','Hold or cancel cannot be combined with other changes; file it on its own'));
    if(types.includes('hold')){before.status=P.status;after.status='on_hold';after.resume=($('#chResume')||{}).value||''}
    if(types.includes('cancel')){before.status=P.status;after.status='canceled'}
    let replan=null;
    if(types.includes('end')){before.end=P.end;after.end=$('#chEnd').value;if(!after.end)return showErr('#chErr',T('请填写新的完成时间','Pick the new end date'));if(P.end&&after.end<=P.end)return showErr('#chErr',T('延期后的完成时间必须晚于当前完成时间；缩短工期请用「调整节点」','The new end must be later than the current one. To shorten, use Milestones / deliverables'))}
    if(types.includes('end')||types.includes('plan')){
      const bad=ms.check();if(bad)return showErr('#chErr',bad);
      if(types.includes('end')&&!ms.changed()&&!ms.keepOk())return showErr('#chErr',T('延期后节点和交付成果没有任何调整：请调整，或勾选「保持原计划不变」确认','Nothing in the plan changes with this extension. Adjust it, or tick "stay as planned" to confirm'));
      if(types.includes('plan')&&!ms.changed())return showErr('#chErr',T('你勾选了调整节点，但没有任何改动','You chose to change milestones but changed nothing'));
      if(ms.changed()){replan={how:ms.state.how,delta:types.includes('end')?diff(after.end,P.end):0,lines:ms.lines()};before.plan=P.milestones.filter(x=>!x.done).map(x=>`${x.due} ${x.name}`);after.plan=replan.lines.filter(l=>l.st!=='dropped').map(l=>({id:l.id,name:l.name,due:l.due,forms:l.forms}));if(!types.includes('plan'))types.push('plan')}
    }
    const isDelay=types.includes('end'),isMove=types.includes('plan');
    const toOwner=!isDelay&&isMove&&!(norm(me().name)===norm(P.pic||'')||isPMO());
    S.requests.unshift({id:uid(),type:'change',status:toOwner?'with_owner':'pending',by:me().id,at:nowStamp(),team:P.team,pid:P.id,data:{types,before,after,reason,...(replan?{replan}:{}),reasonType:rType,rTeam,rBiz,catchup}});
    const lab=types.map(k=>CH_TYPES().find(x=>x[0]===k)[1]).join('、');
    const body=`${me().name} ${isDelay?T('提交了整体延期申请','filed an overall delay'):isMove?T('提交了节点异动','filed a milestone change'):T('提交了变更申请','filed a change request')}${CO()}${lab}\n${T('原因','Reason')}${CO()}${reason}${(dly||mv)?`\n${T('原因类别','Reason')}${CO()}${reasonName(rType)} · ${teamLbl(rTeam)} · ${bizName(rBiz)}`:''}${catchup?`\n${T('追赶计划','Catch-up plan')}${CO()}${catchup}`:''}${sig()}`;
    if(toOwner)sendMail({to:[P.pic],cc:[me().name],subject:`[${T('异动待上报','Change to escalate')}] ${P.code}`,body:`${T('项目执行人提交了节点异动，请先确认，再上报 PMO 预警。','A project executor reported a milestone change. Please review it, then escalate it to PMO.')}\n\n${body}`,rule:'manual',ref:P.id});
    else sendMail({to:['Aiden'],cc:ccList([mgrOfP(P)&&mgrOfP(P).name,P.pic,...(isDelay?[userName('cokey')]:[])],[]),subject:`[${isDelay?T('延期申请','Delay request'):isMove?T('异动预警','Change alert'):T('变更申请','Change request')}] ${P.code}`,body,rule:'manual',ref:P.id});
    S.formPid=null;save();S.filters.atab='mine';go('approvals',null,true);toast(T('变更申请已提交','Change request submitted'));
  });
}

/* --- close request --- */
function close_(){
  return `<form class="form" id="clForm" novalidate>${pickerHTML('cl')}
  <div class="card"><div class="card-h"><h2><span class="sec-t"><span class="n">2</span>${T('交付物核对','Deliverable check')}</span></h2><span class="sp"></span><span class="small faint">${T('按立项时的执行要求逐项勾选','Tick each deliverable from the approved plan')}</span></div><div class="card-b form" id="clChecks"></div></div>
  <div class="card"><div class="card-h"><h2><span class="sec-t"><span class="n">3</span>${T('结项汇报材料','Close report files')}</span></h2></div><div class="card-b form"><div class="f"><label for="clReport">${T('结项汇报材料（PPT / PDF）','Close report (PPT / PDF)')}${req}</label><input type="file" id="clReport" multiple accept="${FILE_ACCEPT}"><span class="hint">${T('上传用于项目会议汇报的材料，通常是 PPT。可以选多个文件。','Upload what you will present at the project meeting, usually a PPT. You can pick several files.')}</span></div></div></div>
  <div class="card"><div class="card-h"><h2><span class="sec-t"><span class="n">4</span>${T('结项总结','Close summary')}</span></h2></div><div class="card-b fgrid">
    <div class="f full"><label>${T('成果总结','What was delivered')}${req}</label><textarea name="summary" required></textarea></div>
    <div class="f"><label>${T('收益 / 目标达成情况','Benefits / targets met')}</label><textarea name="benefit"></textarea></div>
    <div class="f"><label>${T('遗留事项','Open points')}</label><textarea name="leftover"></textarea></div>
    <div class="f full"><label class="chk" style="align-self:flex-start;font-weight:500;color:var(--ink)"><input type="checkbox" name="toFollow">${T('结项后转为跟进项，持续监控数据','After closing, keep a follow-up to monitor data')}</label><div class="row" style="flex-wrap:nowrap"><select name="followMonths" style="width:auto" aria-label="${T('监控期','Monitoring period')}">${[1,2,3,4,5,6].map(n=>`<option value="${n}">${T(`监控 ${n} 个月`,`Monitor ${n} month${n>1?'s':''}`)}</option>`).join('')}</select><input type="text" name="followNote" placeholder="${T('监控什么指标（如粉丝量、发帖数）','Which metrics (followers, posts…)')}"></div></div>
  </div></div>
  <div class="card"><div class="card-h"><h2><span class="sec-t"><span class="n">5</span>${T('执行人贡献','Executor contributions')}</span></h2><span class="sp"></span><span class="small faint" id="clTot"></span></div><div class="card-b form"><div class="small muted">${T('列出本项目的执行人，写每个人的贡献比例（合计 100%）、具体工作和贡献原因，可上传佐证材料。这是奖励分配的依据。','List the executors with each person\'s share (total 100%), what they did and why, with evidence if you have it. This is the basis for the reward split.')}</div><div class="tw"><table class="t" id="clContrib"><thead><tr><th style="width:18%">${T('执行人','Executor')}</th><th style="width:14%">${T('团队','Team')}</th><th style="width:80px">%</th><th>${T('具体工作 / 贡献原因','Work and reason')}</th><th style="width:170px">${T('佐证材料','Evidence')}</th></tr></thead><tbody></tbody></table></div><div class="row"><button type="button" class="btn" id="clCAdd">${ico('apply')}${T('添加执行人','Add a person')}</button></div></div></div>
  <div id="clErr"></div><datalist id="plist">${people().map(n=>`<option value="${esc(n)}">`).join('')}</datalist>
  <div class="row"><button class="btn pri" type="submit">${T('提交结项申请','Submit close request')}</button><span class="small faint">${T('PMO 预审通过后进入「待结项汇报」，在项目会议汇报通过后正式关闭。','After PMO pre-review it moves to “Awaiting close review”; it closes once approved at the project meeting.')}</span></div></form>`;
}
function closeAfter(){
  let P=null;const f=$('#clForm');
  const cTb=$('#clContrib tbody');
  const cRow=x=>`<tr><td>${ppkHTML(x,P?[P.pic,...(P.exec||[])].filter(Boolean):[])}</td><td>${tpkHTML('',x.team||'')}</td><td><input type="number" class="cn-p" min="0" max="100" step="1" value="${esc(x.pct??'')}"></td><td><textarea class="cn-w" style="min-height:44px">${esc(x.work||'')}</textarea></td><td><input type="file" class="cn-f" multiple></td></tr>`;
  const readC=()=>$$('tr',cTb).map(tr=>({...ppkRead($('.ppk',tr)),team:tpkRead($('.tpk',tr)),pct:+$('.cn-p',tr).value||0,work:$('.cn-w',tr).value.trim(),fl:Array.from($('.cn-f',tr).files||[])}));
  // the shares must add up to exactly 100%: the submit button stays off until they do
  const totC=()=>{const t=readC().reduce((n,x)=>n+x.pct,0);const e=$('#clTot'),sb=f.querySelector('button[type=submit]');
    const msg=t===100?T('合计 100% ✓','Total 100% ✓'):t<100?T(`合计 ${t}%，还差 ${100-t}%`,`Total ${t}%, ${100-t}% short`):T(`合计 ${t}%，多了 ${t-100}%`,`Total ${t}%, ${t-100}% over`);
    if(e){e.textContent=msg;e.style.color=t===100?'var(--ok)':'var(--bad)'}
    if(sb){sb.disabled=t!==100;sb.title=t===100?'':T('执行人贡献比例合计必须正好是 100% 才能提交','The shares must total exactly 100% before you can submit')}};
  const drawC=rows=>{cTb.innerHTML=rows.map(cRow).join('');$$('.cn-p',cTb).forEach(i=>i.addEventListener('input',totC));totC()};
  const drawContrib=()=>{if(!P){drawC([{}]);return}const L=(P.execInfo&&P.execInfo.length?P.execInfo:(P.exec||[]).map(n=>({name:n,team:userTeamTxt(n)})));drawC(L.length?L.map(x=>({name:x.name,email:x.email||'',other:x.other,team:x.team||''})):[{}])};
  $('#clCAdd').onclick=()=>{const c=readC().map(({fl,...q})=>q);c.push({});drawC(c)};
  const drawChecks=()=>{const b=$('#clChecks');Object.keys(FP).forEach(k=>{if(k.startsWith('cl-'))delete FP[k]});if(!P){b.innerHTML='';return}
    b.innerHTML=P.milestones.map(m=>`<div class="ms ${m.done?'done':''}" data-mid="${m.id}"><div class="ms-h"><label class="chk" style="flex:none"><input type="checkbox" class="cl-c" ${m.done?'checked':''}>${T('已完成','Done')}</label><div class="grow"><div>${esc(m.name)}</div><div class="small faint">${T('截止','Due')} ${fd(m.due)} · ${fList(m.forms)}${m.evidence?` · ${T('已提交成果','evidence on file')} ${esc(m.evidence.at||'')}`:''}</div></div></div><div class="f cl-why" ${m.done?'hidden':''}><label>${T('未完成原因','Why not done')}${req}</label><input type="text" class="cl-r"></div><div class="f cl-file" style="margin-top:8px" ${m.done?'':'hidden'}><label>${T('上传这项交付物的文件','Upload the file(s) for this deliverable')}${m.evidence?'':req}</label>${fpHTML('cl-'+m.id)}<span class="hint">${T('例如 PPT、PDF、Excel，也可以是截图。','e.g. PPT, PDF, Excel or screenshots.')}${m.evidence?T(' 这个节点已经提交过成果，可以不再上传。',' This milestone already has evidence on file; uploading more is optional.'):''}</span></div></div>`).join('')+`<div id="clWarn"></div>`;
    const upd=()=>{let n=0;$$('.ms',b).forEach(x=>{const c=$('.cl-c',x).checked;$('.cl-why',x).hidden=c;$('.cl-file',x).hidden=!c;x.classList.toggle('done',c);if(!c)n++});
      $('#clWarn').innerHTML=n?`<div class="note warn"><b>${T(`还有 ${n} 项交付物未勾选，是否仍然申请结项？`,`${n} deliverable(s) not ticked. Still request closing?`)}</b><div class="f" style="margin-top:8px"><label>${T('仍然申请结项的原因','Why close anyway')}${req}</label><textarea id="clForce"></textarea></div><label class="chk" style="margin-top:8px"><input type="checkbox" id="clConfirm">${T('确认仍然申请结项','Yes, request closing anyway')}</label></div>`:`<div class="note info">${T('全部交付物已完成，可以申请结项。','All deliverables done; ready to close.')}</div>`};
    b.onchange=e=>{if(e.target.classList.contains('cl-c'))upd()};upd();
  };
  bindPicker('cl',p=>['active','on_hold','not_started'].includes(p.status),p=>{P=p;drawChecks();drawContrib()});
  f.addEventListener('submit',async e=>{e.preventDefault();if(!P)return showErr('#clErr',T('请选择项目','Pick a project'));
    const checks={},reasons={};let miss=false;
    $$('#clChecks .ms').forEach(x=>{const id=x.dataset.mid,c=$('.cl-c',x).checked;checks[id]=c;if(!c){reasons[id]=$('.cl-r',x).value.trim();if(!reasons[id])miss=true}});
    const open=Object.values(checks).filter(v=>!v).length;
    if(miss) return showErr('#clErr',T('请为每项未完成的交付物填写原因','Give a reason for each unticked deliverable'));
    if(open&&(!$('#clForce').value.trim()||!$('#clConfirm').checked)) return showErr('#clErr',T('有未完成的交付物：请填写仍然结项的原因并勾选确认','Some deliverables are open: give the reason and confirm'));
    // files: the close report is required, and every deliverable ticked as done needs a file unless it already has evidence on file
    const repFiles=Array.from(($('#clReport')||{}).files||[]);
    if(!repFiles.length)return showErr('#clErr',T('请上传结项汇报材料（通常是 PPT）','Upload the close report (usually a PPT)'));
    const perM={};let noFile=[];
    $$('#clChecks .ms').forEach(x=>{const id=x.dataset.mid;if(!checks[id])return;const fl=[...(FP['cl-'+id]||[])];perM[id]=fl;const m=P.milestones.find(y=>y.id===id);if(!fl.length&&!(m&&m.evidence))noFile.push(m?m.name:id)});
    if(noFile.length)return showErr('#clErr',T('这些已完成的交付物还没有上传文件：','Upload a file for these completed deliverables: ')+noFile.join('、'));
    const fd=Object.fromEntries(new FormData(f));if(!String(fd.summary||'').trim())return showErr('#clErr',T('请填写成果总结','Add a summary'));
    const cRows=readC().filter(x=>x.name||x.pct||x.work);
    if(!cRows.length||cRows.some(x=>!x.name))return showErr('#clErr',T('请填写执行人贡献：每位执行人的姓名','List the executors and their contributions'));
    {const tot=cRows.reduce((n,x)=>n+x.pct,0);if(tot!==100)return showErr('#clErr',T(`执行人贡献比例合计必须正好是 100%（现在 ${tot}%），多了少了都不能提交`,`The shares must total exactly 100% (now ${tot}%); over or under cannot be submitted`))}
    if(cRows.some(x=>x.pct>0&&!x.work))return showErr('#clErr',T('请为每位有贡献的执行人写具体工作和贡献原因','Say what each person did and why'));
    const sb=f.querySelector('button[type=submit]');sb&&(sb.disabled=true,sb.setAttribute('aria-busy','true'));
    let reportFiles=[],files={};
    try{
      reportFiles=await Promise.all(repFiles.map(x=>filePut(x,P.id)));
      for(const [id,fl] of Object.entries(perM)){if(fl.length)files[id]=await Promise.all(fl.map(x=>filePut(x,P.id)))}
      for(const c of cRows){c.files=c.fl.length?await Promise.all(c.fl.map(x=>filePut(x,P.id))):[]}
    }catch(err){sb&&(sb.disabled=false,sb.removeAttribute('aria-busy'));return showErr('#clErr',err&&err.code==='too_big'?tooBigMsg():T('文件上传失败，请检查网络后重试','Upload failed; check your connection and try again'))}
    S.requests.unshift({id:uid(),type:'close',status:'pending',by:me().id,at:nowStamp(),team:P.team,pid:P.id,data:{checks,reasons,forceReason:open?$('#clForce').value.trim():'',summary:fd.summary,benefit:fd.benefit,leftover:fd.leftover,toFollow:!!fd.toFollow,followNote:fd.followNote,followMonths:fd.toFollow?fd.followMonths:'',reportFiles,files,contrib:cRows.map(({fl,...c})=>c),leaders:closeLeaders(P)}});
    sendMail({to:['Aiden'],subject:`[${T('结项申请','Close request')}] ${P.code}${open?` · ${T('有','with')} ${open} ${T('项未完成','open item(s)')}`:''}`,body:`${me().name} ${T('申请结项','requests closing')} ${P.code}「${P.name}」。${open?`\n${T('未完成交付物','Open deliverables')}${CO()}${open}`:''}${sig()}`,rule:'manual',ref:P.id});
    {const L=closeLeaders(P);if(L.length)sendMail({to:L.map(userName),cc:ccList([P.pic],[]),subject:`[${T('请就结项给意见','Your opinion on a close request')}] ${P.code}`,body:`${P.code}「${P.name}」${T('已提交结项申请。请登录系统「我的待办审批」，选择同意或不同意结项，并写明原因。','has a close request. Open My approvals, then agree or disagree with a reason.')}${sig()}`,rule:'manual',ref:P.id})}
    S.formPid=null;save();S.filters.atab='mine';go('approvals',null,true);toast(T('结项申请已提交','Close request submitted'));
  });
}

/* ================= approvals / my work ================= */
function myDue(){ // deliverables the current manager has to submit
  const t=today();const out=[];
  visP().filter(p=>p.status==='active'||p.status==='not_started').forEach(p=>p.milestones.forEach(m=>{if(!m.done&&m.due&&diff(m.due,t)<=3)out.push({p,m,d:diff(m.due,t)})}));
  return out.sort((a,b)=>a.d-b.d);
}
function staleFollows(){return visF().filter(f=>f.status==='open'&&(!lastUpd(f)||diff(today(),lastUpd(f))>30))}
function inboxCount(){
  if(isPMO()) return S.requests.filter(r=>r.status==='pending').length+S.projects.filter(p=>p.status==='to_report').length+S.todos.filter(t=>t.status==='open'&&t.assignee==='pmo').length+alsaInbox()+tpInbox();
  return alsaInbox()+tpInbox()+ownerMoves().length+oppsToGive().length+myDue().length+S.requests.filter(r=>r.by===me().id&&r.status==='returned').length+S.todos.filter(t=>t.status==='open'&&t.assignee===me().id).length;
}
function reqBody(r){
  const P=r.pid&&S.projects.find(p=>p.id===r.pid);const d=r.data;
  if(r.type==='new') return `<dl class="kv">
    <dt>${T('申请人','Applicant')}</dt><dd>${esc(d.applicant.name)} · ${esc(d.applicant.email)} · ${esc(tName(r.team))}</dd>
    <dt>${T('立项背景','Background')}</dt><dd>${esc(d.bg.background)}</dd><dt>${T('为什么立项','Why')}</dt><dd>${esc(d.bg.why)}</dd><dt>${T('收益','Benefits')}</dt><dd>${esc(d.bg.benefit)}</dd>${d.bg.process?`<dt>${T('改善流程','Processes')}</dt><dd>${esc(d.bg.process)}</dd>`:''}${d.bg.risk?`<dt>${T('解决风险','Risks')}</dt><dd>${esc(d.bg.risk)}</dd>`:''}
    <dt>${T('负责人','Owner')}</dt><dd>${esc(d.pic)}${d.picTeam?` · <span class="tag">${esc(teamLbl(d.picTeam))}</span>`:''}</dd><dt>${T('执行人','Executors')}</dt><dd>${execHTML({exec:d.exec,execInfo:d.execInfo})}</dd>
    <dt>${T('时间','Dates')}</dt><dd class="num">${d.start} → ${d.end}</dd>${d.how?`<dt>${T('执行方式','Approach')}</dt><dd>${esc(d.how)}</dd>`:''}</dl>
    <div class="tw"><table class="t"><thead><tr><th>#</th><th>${T('节点交付成果','Deliverable')}</th><th>${T('截止','Due')}</th><th>${T('形式','Format')}</th></tr></thead><tbody>${d.milestones.map((m,i)=>`<tr><td class="num faint">${i+1}</td><td>${esc(m.name)}</td><td class="num">${m.due}</td><td class="small">${fList(m.forms)}</td></tr>`).join('')}</tbody></table></div>
    ${r.status==='pending'?simHTML(similarProjects(simQuery(d.name,d.bg,d.how,d.milestones),r.pid),false):''}
    ${r.status==='pending'?`<div class="small muted">${T('通过后编号','Code on approval')}${CO()}<b class="mono">${nextCode(r.team,d.start.slice(2,4))}</b></div>`:''}`;
  if(r.type==='change'){const lab=Object.fromEntries(CH_TYPES());const v=(k,x)=>k==='exec'?(x||[]).join('、'):k==='plan'?(Array.isArray(x)?x.map(m=>typeof m==='string'?m:`${m.due} ${m.name}`).join('\n'):''):(x||'—');
    const rtype=reasonName(d.reasonType);
    // status changes (hold / cancel) show as words; a re-plan shows as a per-milestone table instead of two raw lists
    const sv=(k,x)=>k==='hold'||k==='cancel'?(ST[x]?T(ST[x].zh,ST[x].en):'—'):v(k,x);
    const sk=k=>k==='hold'||k==='cancel'?'status':k;
    const rows=d.types.filter(k=>!(k==='plan'&&d.replan));
    return `<div class="diff"><span class="lbl">${T('项目','Project')}</span><span style="grid-column:span 2"><b class="mono">${P.code}</b> ${esc(P.name)}</span>${rows.map(k=>`<span class="lbl">${esc(lab[k])}</span><span class="o" style="white-space:pre-wrap">${esc(sv(k,d.before[sk(k)]))}</span><span class="n" style="white-space:pre-wrap">${esc(sv(k,d.after[sk(k)]))}${k==='hold'&&d.after.resume?` · ${T('预计恢复','resume')} ${esc(d.after.resume)}`:''}</span>`).join('')}</div>${d.replan?`<div class="lbl" style="margin-top:8px">${T('项目规划调整','Plan changes')}</div>${replanTable(d.replan)}`:''}<div class="note"><b>${T('原因','Reason')}${CO()}</b>${rtype?`[${esc(rtype)}] `:''}${esc(d.reason)}</div>`}
  if(r.type==='close'){const open=P.milestones.filter(m=>d.checks[m.id]===false);
    return `<div><b class="mono">${P.code}</b> ${esc(P.name)}</div><div class="form" style="gap:6px">${P.milestones.map(m=>`<div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span style="flex:none;color:${d.checks[m.id]?'var(--ok)':'var(--bad)'};display:inline-flex;padding-top:2px">${ico(d.checks[m.id]?'ok':'x','',d.checks[m.id]?T('已完成','Done'):T('未完成','Not done'))}</span><div><div>${esc(m.name)}</div>${(d.files&&d.files[m.id]||[]).length?`<div class="row" style="margin-top:4px">${fileLinks(d.files[m.id])}</div>`:''}${d.checks[m.id]?'':`<div class="small" style="color:var(--bad)">${T('未完成原因','Reason')}${CO()}${esc(d.reasons[m.id]||'')}</div>`}</div></div>`).join('')}</div>
    ${open.length?`<div class="note warn"><b>${T(`${open.length} 项交付物未完成，申请人仍申请结项`,`${open.length} deliverable(s) open; applicant still asks to close`)}</b><br>${esc(d.forceReason)}</div>`:`<div class="note info">${T('全部交付物已勾选完成','All deliverables ticked')}</div>`}
    ${(d.reportFiles||[]).length?`<div><div class="lbl" style="margin-bottom:6px">${T('结项汇报材料','Close report files')}</div><div class="row">${fileLinks(d.reportFiles)}</div></div>`:''}
    <dl class="kv"><dt>${T('成果总结','Summary')}</dt><dd>${esc(d.summary)}</dd>${d.benefit?`<dt>${T('收益','Benefits')}</dt><dd>${esc(d.benefit)}</dd>`:''}${d.leftover?`<dt>${T('遗留事项','Open points')}</dt><dd>${esc(d.leftover)}</dd>`:''}${d.toFollow?`<dt>${T('转跟进项','Follow-up')}</dt><dd>${esc(d.followNote||T('是','Yes'))}</dd>`:''}</dl>`}
}

/* ---- people, teams, delays and close opinions (review with the boss, Nov 2026) ---- */
const oldCodes=p=>[p.old,p.oldNew&&p.oldNew!==p.code?p.oldNew:'',p.prev].filter(Boolean);
// team field that also accepts a typed name ("Other")
const tpkHTML=(cls,cur)=>{const known=!cur||cur==='PMO'||S.teams.some(t=>t.code===cur);
  return `<div class="tpk ${cls}"><select class="tpk-s" aria-label="${T('所属团队','Team')}"><option value="">${T('请选择团队','Choose a team')}</option><option value="PMO" ${cur==='PMO'?'selected':''}>PMO</option>${['R','C'].map(g=>`<optgroup label="${esc(gName(g))}">${S.teams.filter(t=>t.group===g).map(t=>`<option value="${t.code}" ${cur===t.code?'selected':''}>${esc(tName(t.code))}</option>`).join('')}</optgroup>`).join('')}<option value="__other" ${known?'':'selected'}>${T('其他（手动填写）','Other (type it)')}</option></select><input type="text" class="tpk-o" placeholder="${T('团队 / 部门名称','Team or department')}" value="${known?'':esc(cur)}" ${known?'hidden':''}></div>`};
const tpkRead=root=>{const sl=$('.tpk-s',root);return sl.value==='__other'?$('.tpk-o',root).value.trim():sl.value};
// person field: pick from the list, or "Other" with a typed name and email; a known person brings their email along
const ppkHTML=(x,first=[])=>{const names=people(),known=!!x.name&&names.some(n=>norm(n)===norm(x.name))&&!x.other,oth=!!(x.name||x.email)&&!known,u=known&&S.users.find(q=>norm(q.name)===norm(x.name));
  const opt=n=>`<option ${known&&norm(x.name)===norm(n)?'selected':''}>${esc(n)}</option>`;
  return `<div class="ppk"><select class="ppk-s" aria-label="${T('人员','Person')}"><option value="">${T('请选择','Choose')}</option>${first.length?`<optgroup label="${T('本项目','This project')}">${first.map(opt).join('')}</optgroup>`:''}<optgroup label="${T('全部人员','Everyone')}">${names.map(opt).join('')}</optgroup><option value="__other" ${oth?'selected':''}>${T('其他（手动填写姓名和邮箱）','Other (type name and email)')}</option></select><div class="ppk-o" ${oth?'':'hidden'}><input type="text" class="ppk-n" placeholder="${T('姓名','Name')}" value="${esc(oth?x.name||'':'')}"><input type="email" class="ppk-e" placeholder="${T('邮箱','Email')}" value="${esc(oth?x.email||'':'')}"></div><div class="ppk-em small faint">${esc(u?(u.email||''):'')}</div></div>`};
const ppkRead=root=>{const sl=$('.ppk-s',root);if(sl.value==='__other')return {name:$('.ppk-n',root).value.trim(),email:$('.ppk-e',root).value.trim(),other:true};if(!sl.value)return {name:'',email:'',other:false};const u=S.users.find(q=>norm(q.name)===norm(sl.value));return {name:sl.value,email:u?(u.email||''):'',other:false}};
document.addEventListener('change',e=>{const t=e.target;if(!t.classList)return;
  if(t.classList.contains('tpk-s')){const o=$('.tpk-o',t.closest('.tpk'));o.hidden=t.value!=='__other';if(!o.hidden)o.focus();return}
  const root=t.closest&&t.closest('.ppk');if(!root)return;
  if(t.classList.contains('ppk-s')){const oth=t.value==='__other';$('.ppk-o',root).hidden=!oth;const u=!oth&&t.value&&S.users.find(q=>norm(q.name)===norm(t.value));$('.ppk-em',root).textContent=u?(u.email||''):'';if(oth)$('.ppk-n',root).focus()}
  if(t.classList.contains('ppk-n')){const u=S.users.find(q=>norm(q.name)===norm(t.value));if(u)$('.ppk-e',root).value=u.email||''}});
// several files at once, kept as a removable list
const FP={};
const fpChips=id=>(FP[id]||[]).map((f,i)=>`<span class="tag" style="padding:3px 8px">${ico('clip')} ${esc(f.name)} <button type="button" class="chip-x" data-fprm="${id}|${i}" aria-label="${T('移除','Remove')} ${esc(f.name)}">${ico('x')}</button></span>`).join('')||`<span class="small faint">${T('还没有选择文件','No files yet')}</span>`;
const fpHTML=id=>`<div class="fp" data-fp="${id}"><label class="btn sm" style="cursor:pointer">${ico('apply')}${T('选择文件（可多选）','Choose files (several at once)')}<input type="file" class="fp-in" multiple hidden></label><span class="fp-list">${fpChips(id)}</span></div>`;
document.addEventListener('change',e=>{const t=e.target;if(!t.classList||!t.classList.contains('fp-in'))return;const box=t.closest('[data-fp]'),id=box.dataset.fp;FP[id]=(FP[id]||[]).concat(Array.from(t.files));t.value='';$('.fp-list',box).innerHTML=fpChips(id)});
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-fprm]');if(!b)return;const [id,i]=b.dataset.fprm.split('|');(FP[id]||[]).splice(+i,1);$('.fp-list',b.closest('[data-fp]')).innerHTML=fpChips(id)});
const teamLbl=c=>c==='PMO'?'PMO':(S.teams.some(t=>t.code===c)?tName(c):(c||''));
const teamSel=(attrs,cur)=>{const has=cur&&(cur==='PMO'||S.teams.some(t=>t.code===cur));return `<select ${attrs}><option value="">${T('请选择团队','Choose a team')}</option><option value="PMO" ${cur==='PMO'?'selected':''}>PMO</option>${['R','C'].map(g=>`<optgroup label="${esc(gName(g))}">${S.teams.filter(t=>t.group===g).map(t=>`<option value="${t.code}" ${cur===t.code?'selected':''}>${esc(tName(t.code))}</option>`).join('')}</optgroup>`).join('')}${cur&&!has?`<option value="${esc(cur)}" selected>${esc(cur)}</option>`:''}</select>`};
const teamCodeOf=x=>{const q=norm(x||'');if(!q)return '';const t=S.teams.find(t=>norm(t.code)===q||norm(t.zh)===q||norm(t.en)===q);return t?t.code:''};
const userTeamTxt=n=>{const u=S.users.find(x=>norm(x.name)===norm(n));return u?((u.teams&&u.teams[0])||(u.role==='pmo'?'PMO':'')):''};
const execHTML=p=>{const L=p.execInfo||[];if(!L.length)return esc((p.exec||[]).join('、')||'—');return `<div class="ex-list">${L.map(x=>`<div class="ex-row"><b>${esc(x.name)}</b>${x.team?` <span class="tag">${esc(teamLbl(x.team))}</span>`:''}${x.email?` <span class="small faint">${esc(x.email)}</span>`:''}${x.duty?`<div class="small muted">${esc(x.duty)}</div>`:''}</div>`).join('')}</div>`};
const BLAME=()=>({subj:T('主观原因','Subjective'),obj:T('客观原因','Objective')});
const BIZ=()=>[['network',T('网络 / 渠道运营','Network / channel operations')],['parts',T('备件供应与物流','Parts supply and logistics')],['warranty',T('技术与索赔','Technical and warranty')],['training',T('培训','Training')],['care',T('客户关怀 / 用户运营','Customer care / user operations')],['digital',T('数字化 / 系统','Digital / systems')],['contract',T('合同 / 供应商 / 场地','Contract / supplier / site')],['finance',T('财务 / 商务','Finance / commercial')],['other',T('其他','Other')]];
const bizName=k=>(BIZ().find(x=>x[0]===k)||[k,k])[1];
const isOwnerOfReq=r=>{const p=S.projects.find(x=>x.id===r.pid);return !!p&&norm(p.pic||'')===norm(me().name)};
const ownerMoves=()=>S.requests.filter(r=>r.status==='with_owner'&&isOwnerOfReq(r));
// who gives an opinion on a close request: the leaders of the project team and of every executor's team
function closeLeaders(P){
  const codes=new Set([P.team]);
  (P.execInfo||[]).forEach(x=>{const c=teamCodeOf(x.team);if(c)codes.add(c)});
  (P.exec||[]).forEach(n=>{const u=S.users.find(x=>norm(x.name)===norm(n));(u&&u.teams||[]).forEach(c=>codes.add(c))});
  const ids=[...codes].map(c=>mgrOf(c)).filter(Boolean).map(u=>u.id);
  return [...new Set(ids)].filter(id=>norm(userName(id))!==norm(P.pic||'')&&id!==me().id);
}
const oppsToGive=()=>S.requests.filter(r=>r.type==='close'&&r.status==='pending'&&(r.data.leaders||[]).includes(me().id)&&!(r.opinions||{})[me().id]);
function oppsHTML(r){
  const L=r.data.leaders||[];if(!L.length)return '';const O=r.opinions||{};
  return `<div class="lbl">${T('区域 / 团队意见','Regional / team opinions')}</div><div class="form" style="gap:6px">${L.map(id=>{const o=O[id];return `<div class="row" style="gap:8px;flex-wrap:nowrap;align-items:flex-start"><span class="pill ${o?o.v==='yes'?'p-closed':'p-high':'p-low'}">${o?o.v==='yes'?T('同意结项','Agrees'):T('不同意','Disagrees'):T('未回复','No reply')}</span><div><b>${esc(userName(id))}</b>${o&&o.why?`<div class="small muted">${esc(o.why)}</div>`:''}</div></div>`}).join('')}</div>`;
}
// one line per extension / milestone change: dates, reason category, team, business reason
function delayLines(p){
  const L=[...(p.delays||[])].sort((a,b)=>String(a.at).localeCompare(String(b.at)));
  if(!L.length)return (p.exts||[]).map(x=>String(x));
  return L.map(x=>[x.kind==='delay'?`${x.from||'?'} → ${x.to||'?'}`:T('节点异动','Milestone change'),x.rtype?reasonName(x.rtype):'',x.team?teamLbl(x.team):'',x.biz?bizName(x.biz):'',x.reason||''].filter(Boolean).join(' · '));
}
function delayBlock(p){
  const L=[...(p.delays||[])].sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  return `<div class="note bad delay-rec"><div class="row" style="margin-bottom:6px"><b>${T('延期 / 异动记录','Delay and change record')}</b><span class="tag">${L.length}</span></div>${L.map(x=>`<div class="delay-i"><div class="row" style="gap:6px"><span class="pill ${x.kind==='delay'?'p-high':'p-mid'}">${x.kind==='delay'?T('整体延期','Overall delay'):T('节点异动','Milestone change')}</span><span class="small faint num">${esc(x.at)}</span>${x.to?`<span class="small num">${esc(x.from||'—')} → ${esc(x.to)}</span>`:''}</div>
    <div class="small">${x.rtype?`<b>${esc(reasonName(x.rtype))}</b> · `:''}${x.team?`${esc(teamLbl(x.team))} · `:''}${x.biz?esc(bizName(x.biz)):''}</div><div class="small muted">${esc(x.reason||'')}</div>${x.catchup?`<div class="small"><b>${T('追赶计划','Catch-up plan')}${CO()}</b>${esc(x.catchup)}</div>`:''}${x.cokey?`<div class="small"><b>Cokey${CO()}</b>${x.cokey.v==='yes'?T('同意','agreed'):T('不同意','disagreed')}${x.cokey.comment?'：'+esc(x.cokey.comment):''}</div>`:''}</div>`).join('')}</div>`;
}
// extra lines on a request card: reasons, Cokey step, regional opinions, contributions
function reqExtra(r,actions){
  const d=r.data||{};let h='';
  if(r.type==='change'){
    if(d.rTeam||d.rBiz)h+=`<dl class="kv"><dt>${T('原因类别','Reason category')}</dt><dd>${d.reasonType?`<b>${esc(reasonName(d.reasonType))}</b> · `:''}${esc(teamLbl(d.rTeam))} · ${esc(bizName(d.rBiz))}</dd>${d.catchup?`<dt>${T('追赶计划','Catch-up plan')}</dt><dd style="white-space:pre-wrap">${esc(d.catchup)}</dd>`:''}</dl>`;
    if(r.status==='with_owner')h+=`<div class="note info small">${T('执行人提交的节点异动，先由项目负责人确认，再上报 PMO 预警。','A milestone change reported by an executor: the project owner reviews it first, then escalates it to PMO as an alert.')}</div>`;
    if(r.escalatedBy)h+=`<div class="small faint">${T('已由负责人上报 PMO','Escalated to PMO by the owner')}${CO()}${esc(userName(r.escalatedBy))}</div>`;
    if((d.types||[]).includes('end')){
      h+=r.cokey?`<div class="note ${r.cokey.v==='yes'?'info':'warn'} small"><b>Cokey${CO()}</b>${r.cokey.v==='yes'?T('同意延期','agrees to the delay'):T('不同意延期','does not agree')}${r.cokey.comment?'：'+esc(r.cokey.comment):''}</div>`
        :(actions&&isPMO()&&r.status==='pending'?`<div class="note warn small"><b>${T('整体延期需要上报 Cokey','An overall delay goes to Cokey')}</b><div class="small" style="margin:4px 0">${T('请把申请发给 Cokey，在这里记录他的决定和答复意见；记录同意后才能通过。','Send it to Cokey, then record his decision and reply here. It can only be approved once he agrees.')}</div>
          <div class="row" style="gap:8px"><select id="ck-${r.id}" style="width:auto"><option value="yes">${T('同意延期','Agrees')}</option><option value="no">${T('不同意','Does not agree')}</option></select><input type="text" id="ckc-${r.id}" placeholder="${T('Cokey 的答复意见','Cokey\'s reply')}" style="flex:1;min-width:200px"><button type="button" class="btn sm" data-act="cokeySave" data-id="${r.id}">${T('记录 Cokey 的决定','Record Cokey\'s decision')}</button></div></div>`:'');
    }
  }
  if(r.type==='close'){
    if((d.contrib||[]).length)h+=`<div class="lbl">${T('执行人贡献','Executor contributions')}</div><div class="tw"><table class="t"><thead><tr><th>${T('执行人','Executor')}</th><th>${T('团队','Team')}</th><th>%</th><th>${T('具体工作 / 贡献原因','Work and reason')}</th><th>${T('佐证','Evidence')}</th></tr></thead><tbody>${d.contrib.map(c=>`<tr><td>${esc(c.name)}</td><td class="small">${esc(teamLbl(c.team))}</td><td class="num"><b>${esc(c.pct)}</b></td><td class="small" style="white-space:pre-wrap">${esc(c.work||'')}</td><td>${(c.files||[]).length?fileLinks(c.files):'<span class="faint">—</span>'}</td></tr>`).join('')}</tbody></table></div>`;
    if(d.toFollow&&d.followMonths)h+=`<div class="small faint">${T('监控期','Monitoring period')}${CO()}${esc(d.followMonths)} ${T('个月','month(s)')}</div>`;
    h+=oppsHTML(r);
  }
  if(r.status==='with_owner'&&isOwnerOfReq(r))h+=`<div class="f"><label>${T('意见（退回时必填）','Comment (required to send back)')}</label><textarea id="cm-${r.id}" style="min-height:50px"></textarea></div><div class="row"><button class="btn pri" data-act="moveEsc" data-id="${r.id}">${T('确认并上报 PMO 预警','Confirm and escalate to PMO')}</button><button class="btn" data-act="moveBack" data-id="${r.id}">${T('退回给提交人','Send back to the reporter')}</button></div>`;
  return h;
}
const reqKind=q=>q.type==='change'?((q.data.types||[]).includes('end')?'delay':(q.data.types||[]).includes('plan')?'move':'change'):q.type;

// the approval route of a delay or a milestone change, as the rules agreed with the boss
function chFlowHTML(dly,mv){
  const flow=(title,steps)=>`<div class="ch-flow"><div class="lbl">${title}</div><ol class="flow flow-4">${steps.map(([a,b],i)=>`<li><span>${i+1}</span><div><b>${a}</b><div class="small muted">${b}</div></div></li>`).join('')}</ol></div>`;
  return (dly?flow(T('整体延期的审批流','Approval route: overall delay'),[[T('项目负责人提交','Owner files'),T('写明原因类别、涉及团队、业务原因','Reason category, team and business reason')],[T('PMO 评估','PMO assesses'),T('核对原因和影响','Checks the reason and the impact')],[T('Cokey 决策','Cokey decides'),T('PMO 记录 Cokey 的决定和答复意见','PMO records the decision and reply')],[T('通过并通知','Approved and notified'),T('项目更新，邮件抄送部门经理、PMO、Cokey','Project updated; line manager, PMO and Cokey copied')]]):'')
   +(mv?flow(T('节点异动的审批流','Approval route: milestone change'),[[T('执行人汇报','Executor reports'),T('提交异动和追赶计划','Files the change and a catch-up plan')],[T('项目负责人确认','Owner confirms'),T('判断严重程度，上报 PMO 预警','Judges the severity and escalates to PMO')],[T('PMO 评估','PMO assesses'),T('调整节点或交付比例，发布预警','Adjusts milestones or deliverables, raises an alert')],[T('大幅延期则上报','If final delivery slips'),T('最终交付大幅延期，上升 Cokey 决策','Goes up to Cokey for a decision')]]):'');
}
const REASONS=()=>[[T('人员','People'),[['p_left',T('人员离职 / 调动','Someone left or moved')],['p_short',T('人手不足 / 被其他项目占用','Not enough people / pulled to other projects')],['p_skill',T('能力或经验缺口','Skill or experience gap')]]],
 [T('范围与优先级','Scope and priority'),[['s_scope',T('需求 / 范围变化','Scope or requirement change')],['s_prio',T('业务优先级调整','Business priority changed')],['s_decision',T('上级决策变化','Management decision changed')]]],
 [T('外部依赖','External dependency'),[['e_supplier',T('供应商 / 合作方延误','Supplier or partner delay')],['e_contract',T('合同 / 商务谈判卡点','Contract or commercial blocker')],['e_site',T('场地 / 选址问题','Site or location issue')],['e_reg',T('政策 / 法规 / 认证','Regulation or certification')],['e_force',T('不可抗力','Force majeure')]]],
 [T('内部协同','Internal'),[['i_xfn',T('跨部门协同不畅','Cross-team coordination')],['i_it',T('系统 / IT 支持不足','Systems / IT support')],['i_appr',T('内部审批耗时','Internal approvals took long')]]],
 [T('计划本身','Planning'),[['d_est',T('原计划估算不足','Original estimate too tight')],['d_buffer',T('未预留合理时间窗口','No realistic buffer planned')],['d_follow',T('执行跟进不到位','Follow-through was lacking')]]],
 [T('其他','Other'),[['other',T('其他','Other')]]]];
const reasonName=k=>{for(const [,L] of REASONS()){const x=L.find(y=>y[0]===k);if(x)return x[1]}const old={resource:T('资源 / 人员','Resources / people'),scope:T('范围变化','Scope change'),dependency:T('外部依赖 / 供应商','External dependency / supplier'),business:T('业务优先级调整','Business priority'),estimate:T('原计划估算不足','Original estimate too tight')}[k];return old||k||''};
function reqCard(r,actions){
  const st={pending:T('待审批','Pending'),approved:T('已通过','Approved'),rejected:T('已驳回','Rejected'),returned:T('已退回修改','Returned'),withdrawn:T('已重新提交','Resubmitted'),with_owner:T('待负责人上报','With the owner')}[r.status];
  return `<details class="req" ${actions?'open':''}><summary class="req-h" style="cursor:pointer;list-style:none"><span class="pill p-${r.status}">${st}</span><b style="flex:1;min-width:200px">${esc(reqTitle(r))}</b>${tag(r.team)}${r.example?`<span class="tag">${T('示例','Example')}</span>`:''}<span class="small faint">${esc(userName(r.by))} · ${esc(r.at)}</span></summary>
  <div class="req-b">${reqBody(r)}${reqExtra(r,actions)}${r.decision?`<div class="note"><b>${esc(userName(r.decision.by))}</b> · ${esc(r.decision.at)}${r.decision.comment?`：${esc(r.decision.comment)}`:''}</div>`:''}
  ${actions&&isPMO()?`<div class="f"><label>${T('审批意见','Comment')}</label><textarea id="cm-${r.id}" style="min-height:56px" placeholder="${T('退回或驳回时必填','Required when returning or rejecting')}"></textarea></div><div class="row"><button class="btn pri" data-act="approve" data-id="${r.id}">${r.type==='close'?T('预审通过 → 待结项汇报','Pre-approve → close review'):T('通过','Approve')}</button><button class="btn" data-act="return" data-id="${r.id}">${T('退回修改','Return')}</button><button class="btn bad" data-act="reject" data-id="${r.id}">${T('驳回','Reject')}</button></div>`:''}
  ${!isPMO()&&r.status==='returned'&&r.by===me().id?`<div class="row"><button class="btn pri" data-act="resubmit" data-id="${r.id}">${T('修改后重新提交','Edit and resubmit')}</button></div>`:''}
  </div></details>`;
}
function approvals(){
  const tab=S.filters.atab||'todo';const mine=S.requests.filter(r=>r.by===me().id);
  const tabs=`<div class="tabs" style="border-bottom:1px solid var(--line)"><button class="${tab==='todo'?'on':''}" data-act="fset" data-k="atab" data-val="todo">${T('待我处理','Waiting for me')} (${inboxCount()})</button><button class="${tab==='mine'?'on':''}" data-act="fset" data-k="atab" data-val="mine">${T('我提交的申请','My requests')} (${mine.length})</button>${isPMO()?`<button class="${tab==='done'?'on':''}" data-act="fset" data-k="atab" data-val="done">${T('已处理','Decided')}</button>`:''}</div>`;
  if(tab==='mine') return tabs+(mine.map(r=>reqCard(r,false)).join('')||`<div class="card empty">${T('还没有提交过申请','No requests yet')}</div>`);
  if(tab==='done') return tabs+(S.requests.filter(r=>r.status!=='pending').map(r=>reqCard(r,false)).join('')||`<div class="card empty">${T('暂无记录','Nothing yet')}</div>`);
  if(isPMO())return pmoPage();
  const due=myDue();const ret=S.requests.filter(r=>r.by===me().id&&r.status==='returned');const td=S.todos.filter(t=>t.status==='open'&&t.assignee===me().id);const sf=staleFollows();
  return tabs+alsaInboxCard()+tpInboxCard()+`
  <div class="card"><div class="card-h"><h2>${T('需要提交的节点成果','Deliverables to submit')}</h2><span class="tag">${due.length}</span><span class="sp"></span><span class="small faint">${T('3 天内到期或已逾期','Due within 3 days or overdue')}</span></div>
  <div class="list">${due.map(({p,m,d})=>`<div class="li" data-act="open" data-id="${p.id}" data-tab="ms"><span class="pill ${d<0?'p-high':'p-mid'}">${d<0?T(`逾期 ${-d} 天`,`${-d}d overdue`):d===0?T('今天到期','Due today'):T(`${d} 天后`,`in ${d}d`)}</span><div class="grow"><div class="ttl">${esc(m.name)}</div><div class="small faint"><span class="mono">${p.code}</span> ${esc(p.name)}</div></div><span class="btn sm">${T('提交成果','Submit')}</span></div>`).join('')||`<div class="empty">${T('近期没有到期的节点','Nothing due soon')}</div>`}</div></div>
  ${td.length?`<div class="card"><div class="card-h"><h2>${T('PMO 指派','From PMO')}</h2></div><div class="list">${td.map(t=>{const p=S.projects.find(x=>x.id===t.pid);return `<div class="li" style="cursor:default"><div class="grow"><div class="ttl">${esc(t.title)}</div><div class="small faint">${esc(t.at)}</div></div>${t.type==='askExt'?`<button class="btn sm pri" data-act="toChange" data-id="${p.id}" data-todo="${t.id}">${T('去提交延期申请','File extension')}</button>`:t.type==='askClose'?`<button class="btn sm pri" data-act="toClose" data-id="${p.id}" data-todo="${t.id}">${T('去申请结项','File close request')}</button>`:`<button class="btn sm" data-act="open" data-id="${p.id}" data-tab="ms">${T('去提交','Open')}</button>`}<button class="btn sm ghost" data-act="todo" data-a="ok" data-id="${t.id}">${T('完成','Done')}</button></div>`}).join('')}</div></div>`:''}
  ${ownerMoves().length?`<div class="lbl">${T('待你上报的异动','Changes waiting for you to escalate')}</div>${ownerMoves().map(x=>reqCard(x,false)).join('')}`:''}
  ${oppsToGive().length?`<div class="lbl">${T('请就结项给意见','Close requests waiting for your opinion')}</div>${oppsToGive().map(opinionCard).join('')}`:''}
  ${ret.length?`<div class="lbl">${T('被退回的申请','Returned to you')}</div>${ret.map(r=>reqCard(r,false)).join('')}`:''}
  <div class="card"><div class="card-h"><h2>${T('需要更新的跟进项','Follow-ups needing an update')}</h2><span class="tag">${sf.length}</span><span class="sp"></span><span class="small faint">${T('30 天未更新','No update for 30 days')}</span></div><div class="list">${sf.map(f=>`<div class="li" data-act="openf" data-id="${f.id}"><span class="mono small faint" style="width:84px;flex:none">${f.code}</span><div class="grow"><div class="ttl">${esc(f.name)}</div><div class="small faint">${T('最近更新','Last update')} ${fd(lastUpd(f))}</div></div></div>`).join('')||`<div class="empty">${T('都已更新','All up to date')}</div>`}</div></div>`;
}

function opinionCard(q){
  const p=S.projects.find(x=>x.id===q.pid);
  return `<div class="card"><div class="card-h"><h2><span class="mono">${p?p.code:''}</span> ${esc(p?p.name:'')}</h2><span class="sp"></span><span class="small faint">${T('负责人','Owner')}${CO()}${esc(p?p.pic:'')}</span></div><div class="card-b form">${reqBody(q)}${(q.data.contrib||[]).length?reqExtra({...q,type:'close',status:'x'},false):''}
    <div class="f"><label>${T('你的意见（不同意时必填原因）','Your opinion (give a reason if you disagree)')}</label><textarea id="op-${q.id}" style="min-height:56px" placeholder="${T('例如：本区域没有参与，无法核实交付成果','e.g. our market did not take part, so the result cannot be confirmed')}"></textarea></div>
    <div class="row"><button class="btn ok" data-act="opinion" data-v="yes" data-id="${q.id}">${T('同意结项','Agree to close')}</button><button class="btn bad" data-act="opinion" data-v="no" data-id="${q.id}">${T('不同意结项','Disagree')}</button></div></div></div>`;
}

/* ================= PMO workbench: one page per kind of work ================= */
const PMO_TABS=['overview','new','change','close','remind','done','usage'];
const pmoTab=()=>{const t=S.filters.pmoTab==='delay'||S.filters.pmoTab==='move'?'change':S.filters.pmoTab;return PMO_TABS.includes(t)?t:'overview'};
const pmoTabT=()=>({overview:T('PMO 工作台','PMO workbench'),new:T('立项审批','New project approvals'),change:T('项目变更','Project changes'),close:T('结项审批','Close approvals'),remind:T('提醒与待办','Reminders and tasks'),done:T('已处理记录','Decided'),usage:T('使用统计','Usage')})[pmoTab()];
function pmoCounts(){
  const pend=S.requests.filter(q=>q.status==='pending'),k=x=>pend.filter(q=>reqKind(q)===x).length;
  return {new:k('new'),delay:k('delay'),move:k('move'),other:k('change'),change:k('delay')+k('move')+k('change'),close:k('close'),wait:S.projects.filter(p=>p.status==='to_report').length,remind:S.todos.filter(t=>t.status==='open'&&t.assignee==='pmo').length+(b=>b.review.filter(x=>x.ready).length)(bwReviewItems()),alsa:alsaInbox()+tpInbox()};
}
function usagePage(){
  const live=!!window.usageBackend;
  if(live&&USAGE_CACHE===null&&!USAGE_LOADING){USAGE_LOADING=true;window.usageBackend.fetch(28).then(x=>{USAGE_CACHE=x;USAGE_LOADING=false;if(S.view==='pmo'&&pmoTab()==='usage')render()}).catch(()=>{USAGE_CACHE=[];USAGE_LOADING=false;if(S.view==='pmo'&&pmoTab()==='usage')render()})}
  const E=(live?(USAGE_CACHE||[]):(S.usageEv||[])),t0=dn(new Date().toISOString().slice(0,10));
  const lab={};NAV().forEach(n=>{if(n.k)lab[n.k+(n.at?'/'+n.at:'')]=n.l});lab.gantt=lab.gantt||T('甘特图','Gantt');
  const by={};E.forEach(e=>{const o=by[e.v]=by[e.v]||{n:0,u:new Set(),w:[0,0,0,0],last:''};o.n++;o.u.add(e.u);const w=Math.min(3,Math.floor((t0-dn(e.d))/7));if(w>=0)o.w[w]++;if(e.d>o.last)o.last=e.d});
  const rows=Object.entries(by).sort((a,b)=>b[1].n-a[1].n);
  const roles={};E.forEach(e=>roles[e.r]=(roles[e.r]||0)+1);
  const unused=Object.keys(lab).filter(k=>!by[k]&&!/^(pmo|alsa)$/.test(k));
  const wk=['0-7','8-14','15-21','22-28'].map(x=>T(`${x} 天前`,`${x} d ago`));
  return `<div class="note info small">${live?T('来自数据库：所有人最近 28 天打开各页面的次数。内测 4 周后，据此决定哪些功能折叠或删除。','From the database: how often everybody opened each page in the last 28 days. After the 4-week pilot, use it to decide what to fold away or drop.'):T('演示版：只统计这个浏览器里的使用。线上版会汇总所有人。','Demo: this browser only. The live site adds everybody up.')}</div>
  <div class="card"><div class="card-h"><h2>${T('页面使用次数（28 天）','Page views (28 days)')}</h2><span class="tag">${E.length}</span><span class="sp"></span>${live?`<button type="button" class="btn sm" data-act="usageReload">${ico('refresh')}${T('刷新','Refresh')}</button>`:''}</div>
    <div class="tw"><table class="t"><thead><tr><th>${T('页面','Page')}</th><th>${T('次数','Views')}</th><th>${T('人数','People')}</th>${wk.map(x=>`<th>${x}</th>`).join('')}<th>${T('最近使用','Last used')}</th></tr></thead><tbody>${rows.map(([k,o])=>`<tr><td>${esc(lab[k]||k)}</td><td class="num"><b>${o.n}</b></td><td class="num">${o.u.size}</td>${o.w.map(n=>`<td class="num ${n?'':'faint'}">${n}</td>`).join('')}<td class="small faint">${esc(o.last)}</td></tr>`).join('')||`<tr><td colspan="8" class="empty">${live&&USAGE_CACHE===null?T('正在读取…','Loading…'):T('还没有使用记录','No usage yet')}</td></tr>`}</tbody></table></div></div>
  <div class="grid g2"><div class="card"><div class="card-h"><h2>${T('按角色','By role')}</h2></div><div class="card-b small">${Object.entries(roles).map(([r,n])=>`<div class="row" style="justify-content:space-between"><span>${esc(r)}</span><b class="num">${n}</b></div>`).join('')||`<span class="faint">—</span>`}</div></div>
  <div class="card"><div class="card-h"><h2>${T('28 天内没人打开的页面','Pages nobody opened in 28 days')}</h2></div><div class="card-b small">${unused.length?unused.map(k=>`<div>${esc(lab[k])}</div>`).join(''):`<span class="faint">${T('每个页面都有人用过','Every page was used')}</span>`}</div></div></div>`;
}
function pmoAwaitCard(){
  const rep=S.projects.filter(p=>p.status==='to_report');
  return `    <div class="card"><div class="card-h"><h2>${T('待项目会议汇报','Awaiting close review at the project meeting')}</h2><span class="tag">${rep.length}</span><span class="sp"></span><span class="small faint">${T('会议汇报通过后点击关闭','Close after the meeting approves')}</span></div>
      <div class="list">${rep.map(p=>`<div class="li" style="cursor:default"><span class="mono small faint" style="width:84px;flex:none">${p.code}</span><div class="grow" data-act="open" data-id="${p.id}" style="cursor:pointer"><div class="ttl">${esc(p.name)}</div><div class="small faint">${esc(tName(p.team))} · ${esc(p.pic)} · ${T('交付','delivered')} ${pct(p)}%</div></div><button class="btn sm ok" data-act="meetClose" data-id="${p.id}">${T('会议通过，关闭项目','Approved at meeting: close')}</button><button class="btn sm" data-act="meetBack" data-id="${p.id}">${T('驳回，退回继续执行','Reject: back to execution')}</button></div>`).join('')||`<div class="empty">${T('暂无','None')}</div>`}</div></div>`;
}
function pmoTodoCard(){
  const todos=S.todos.filter(t=>t.status==='open'&&t.assignee==='pmo'),bw=bwReviewItems(),sel=S.filters.rmcat||'';
  const rowT=t=>{const p=S.projects.find(x=>x.id===t.pid);return `<div class="li" style="cursor:default;flex-wrap:wrap"><span class="pill ${t.type==='overdue'?'p-high':'p-mid'}">${t.type==='overdue'?T('延期评估','Extension review'):T('超期未结项','Past end')}</span><div class="grow" data-act="open" data-id="${p.id}" style="cursor:pointer;min-width:220px"><div class="ttl">${esc(t.title)}</div><div class="small faint">${esc(p.pic||'—')} · ${esc(t.at)}</div></div><div class="row" style="gap:6px"><button class="btn sm" data-act="todo" data-a="chase" data-id="${t.id}">${T('催办','Chase')}</button><button class="btn sm" data-act="todo" data-a="askExt" data-id="${t.id}">${T('要求提交延期申请','Ask for extension')}</button>${t.type==='pastEnd'?`<button class="btn sm" data-act="todo" data-a="askClose" data-id="${t.id}">${T('要求提交结项','Ask to close')}</button>`:''}<button class="btn sm ghost" data-act="todo" data-a="ok" data-id="${t.id}">${T('已知悉','Acknowledge')}</button></div></div>`};
  const byTeam=(L,f)=>L.slice().sort((a,b)=>f(a).team.localeCompare(f(b).team)||f(a).code.localeCompare(f(b).code));
  const rvRow=({p,per,u})=>`<div class="li" style="cursor:default;flex-wrap:wrap"><span class="pill p-mid">${esc(LANGN(per.lang))} ${md(per.meet)}</span><div class="grow" data-act="open" data-id="${p.id}" data-tab="upd" style="cursor:pointer;min-width:240px"><div class="ttl">${tag(p.team)} <span class="mono small faint">${p.code}</span> ${esc(p.name)}</div><div class="small faint">${esc(p.pic||'—')} · ${ragPill(u.rag)} ${rvPill(u)}</div><div class="small muted bw-sum" style="max-width:520px">${esc((u.done||'').split('\n')[0])}</div></div><div class="row" style="gap:6px"><button class="btn sm" data-act="open" data-id="${p.id}" data-tab="upd">${T('打开 / 打回','Open / send back')}</button><button class="btn sm pri" data-act="bwOk" data-id="${p.id}">${T('确认通过','Confirm')}</button></div></div>`;
  const wRow=({p,per,u})=>`<div class="li" style="cursor:pointer;flex-wrap:wrap" data-act="open" data-id="${p.id}" data-tab="upd"><span class="pill p-high">${T('已打回','Sent back')}</span><div class="grow" style="min-width:240px"><div class="ttl">${tag(p.team)} <span class="mono small faint">${p.code}</span> ${esc(p.name)}</div><div class="small faint">${esc(p.pic||'—')} · ${esc(u.review.reason)}</div></div><span class="small">${bwRetOpen(per)?T(`等待补充，${md(per.meet)} 09:00 截止`,`waiting; due ${md(per.meet)} 09:00`):`<b style="color:var(--bad)">${T('补充期限已过','Deadline passed')}</b>`}</span></div>`;
  const cats=[
    ['bw',T('双周更新待复核','Two-week updates to review'),T('看大家的进展，太简略的打回并写明理由','Read the updates; send thin ones back with a reason'),byTeam(bw.review,x=>x.p),rvRow,'p-mid'],
    ['back',T('已打回，等待补充','Sent back, waiting'),T('负责人在会议当天 09:00 前补充','Owners supplement before 09:00 on the meeting day'),byTeam(bw.waiting,x=>x.p),wRow,'p-high'],
    ['overdue',T('节点逾期，需评估延期','Overdue milestones'),T('到期未提交成果，决定催办或要求提交延期申请','Decide: chase, or ask for an extension request'),byTeam(todos.filter(t=>t.type==='overdue'),t=>S.projects.find(x=>x.id===t.pid)||{team:'',code:''}),rowT,'p-high'],
    ['pastEnd',T('超期未结项','Past the planned end'),T('计划完成日已过，也没有延期或结项申请','No extension or close request yet'),byTeam(todos.filter(t=>t.type==='pastEnd'),t=>S.projects.find(x=>x.id===t.pid)||{team:'',code:''}),rowT,'p-mid']
  ];
  const chip=(k,l,n)=>`<button type="button" class="chk" style="${sel===k?'border-color:var(--accent);background:var(--accent-soft);color:var(--accent)':''}" data-act="fset" data-k="rmcat" data-val="${sel===k?'':k}">${esc(l)} <b class="num">${n}</b></button>`;
  const shown=cats.filter(c=>!sel||c[0]===sel);
  return `<div class="row" style="gap:6px;margin-bottom:10px">${cats.map(c=>chip(c[0],c[1],c[3].length)).join('')}</div>`+
    (shown.map(([k,l,sub,L,fn])=>L.length?`<div class="card"><div class="card-h"><h2>${l}</h2><span class="tag">${L.length}</span><span class="sp"></span><span class="small faint">${sub}</span></div><div class="list" style="max-height:480px;overflow:auto">${L.map(fn).join('')}</div></div>`:'').join('')||`<div class="card empty">${T('没有待处理的提醒','Nothing to review')}</div>`);
}
function pmoPage(){
  const tab=pmoTab(),c=pmoCounts();
  const pend=S.requests.filter(q=>q.status==='pending');
  const list=kk=>{const L=pend.filter(q=>reqKind(q)===kk);return L.map(q=>reqCard(q,true)).join('')||`<div class="card empty">${T('这里没有待处理的申请','Nothing waiting here')}</div>`};
  if(tab==='overview'){
    const tile=(k,l,n,sub)=>`<button type="button" class="kpi ${n?'alert':''}" data-act="go" data-v="pmo" data-at="${k}"><span class="l">${l}</span><span class="v">${n}</span><span class="s">${sub||''}</span></button>`;
    return `<div class="grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">${tile('new',T('立项审批','New projects'),c.new)}${tile('change',T('项目变更','Project changes'),c.change,T(`${c.delay} 延期 · ${c.move} 异动 · ${c.other} 其他`,`${c.delay} delays · ${c.move} milestone · ${c.other} other`))}
      ${tile('close',T('结项审批','Close approvals'),c.close+c.wait,T(`${c.close} 待预审 · ${c.wait} 待会议汇报`,`${c.close} to pre-review · ${c.wait} to present`))}${tile('remind',T('提醒与待办','Reminders and tasks'),c.remind)}${tile('done',T('已处理记录','Decided'),S.requests.filter(q=>q.status!=='pending'&&q.status!=='with_owner').length)}</div>
      ${alsaInboxCard()}${tpInboxCard()}`;
  }
  if(tab==='close')return `<div class="lbl" style="font-size:14px">${T('结项申请预审','Close requests to pre-review')} · ${c.close}</div>${list('close')}${pmoAwaitCard()}`;
  if(tab==='usage')return usagePage();
  if(tab==='remind')return pmoTodoCard();
  if(tab==='done')return S.requests.filter(q=>q.status!=='pending'&&q.status!=='with_owner').map(q=>reqCard(q,false)).join('')||`<div class="card empty">${T('暂无记录','Nothing yet')}</div>`;
  if(tab==='change'){
    const sec=(k,l,sub)=>{const n=pend.filter(q=>reqKind(q)===k).length;return n?`<div class="row" style="margin:14px 0 6px"><b>${l}</b><span class="tag">${n}</span>${sub?`<span class="small faint">${sub}</span>`:''}</div>${list(k)}`:''};
    return (sec('delay',T('整体延期','Overall delays'),T('需要 Cokey 决策','Cokey decides'))+sec('move',T('节点异动 / 预警','Milestone changes'))+sec('change',T('其他变更','Other changes'),T('执行人 · 负责人 · 名称 · 开始时间 · 暂停 / 取消','executors · owner · name · start · hold / cancel')))||`<div class="card empty">${T('这里没有待处理的申请','Nothing waiting here')}</div>`;
  }
  return list(tab);
}
function alsaInboxCard(){
  const L=isPMO()?(S.alsa||[]).filter(a=>a.status==='revise'&&proposerIsPMO(a)):isAlsa()?(S.alsa||[]).filter(a=>(a.status==='voting'&&!a.votes[me().id])||(a.status==='revise'&&a.by===me().id)):[];
  if(!L.length) return '';
  return `<div class="card" style="border-color:color-mix(in srgb,var(--violet) 40%,var(--line))"><div class="card-h"><h2><span class="alsa-tag">ALSA</span> ${isPMO()?T('成员提出意见，需修改后重新发起','Members objected; revise and resend'):T('等待我表决的 ALSA 项目','ALSA projects waiting for my vote')}</h2><span class="badge">${L.length}</span><span class="sp"></span><button class="btn sm pri" data-act="go" data-v="alsa">${isPMO()?T('去修改','Revise'):T('去表决','Vote')}</button></div><div class="list">${L.map(a=>`<div class="li" data-act="go" data-v="alsa"><span class="mono small faint" style="width:92px;flex:none">${a.code}</span><div class="grow"><div class="ttl">${esc(a.name)}</div><div class="small faint">${esc(a.meeting)} · ${esc(alsaCovTxt(a))}</div></div>${lvTag(a)}</div>`).join('')}</div></div>`;
}
// a new project from an approved request, or set up directly by PMO (direct=true: no approval step)
function createProject(r,cm,direct){
  const d=r.data;
  const code=nextCode(r.team,d.start.slice(2,4));
  const p={id:'p'+uid(),code,kind:'project',team:r.team,section:d.section||'',name:d.name,scope:d.milestones.map((m,i)=>`${i+1}. ${m.name}（${m.due}）`).join('\n'),how:d.how,bg:d.bg,applicant:d.applicant,pic:d.pic,picTeam:d.picTeam||'',exec:d.exec,execInfo:d.execInfo||[],start:d.start,end:d.end,actual:null,exts:[],updates:[],status:d.start>today()?'not_started':'active',
    milestones:d.milestones.map((m,i)=>({id:'m'+(i+1),name:m.name,due:m.due,forms:m.forms,done:false})),history:[{at:nowStamp(),by:'Aiden',text:(direct?T(`PMO 直接立项，编号 ${code}`,`Set up directly by PMO; code ${code}`):T(`立项审批通过，编号 ${code}`,`Approved; code ${code}`))+(cm?`（${cm}）`:'')}],old:'',sheet:''};
  S.projects.unshift(p);r.pid=p.id;r.code=code;
  if(d.fromFollow){const f=S.follows.find(x=>x.id===d.fromFollow);if(f){f.status='converted';f.history.push({at:nowStamp(),by:'Aiden',text:T(`已转为项目 ${code}`,`Converted to project ${code}`)})}}
  sendMail({to:[...new Set([d.pic,...execRecipients(d),...(direct?[]:[d.applicant.name])])],cc:direct?ccList([mgrOf(r.team)?.name,'Aiden'],[d.pic]):[],subject:`[${direct?T('项目已立项','New project'):T('立项通过','Approved')}] ${code} ${d.name}`,body:`${direct?T('PMO 已为您的团队立项，编号','PMO has set up this project for your team. Code'):T('项目已立项，编号','The project is approved. Code')}${CO()}${code}\n${T('时间','Dates')}${CO()}${d.start} → ${d.end}\n\n${T('节点计划','Milestones')}${CO()}\n${d.milestones.map(m=>`· ${m.due}  ${m.name}`).join('\n')}\n\n${T('系统将在每个节点前一天自动提醒提交成果。','You will get a reminder the day before each milestone.')}${sig()}`,rule:'manual',ref:p.id});
  return p;
}
function decide(rid,kind){
  const r=S.requests.find(x=>x.id===rid);const cm=($('#cm-'+rid)||{}).value||'';
  if((kind==='return'||kind==='reject')&&!cm.trim()){toast(T('请填写审批意见','Add a comment first'),'warn');flagField($('#cm-'+rid));return}
  if(kind==='approve'&&r.type==='change'&&(r.data.types||[]).includes('end')&&!(r.cokey&&r.cokey.v==='yes')){toast(T('整体延期需要先记录 Cokey 的同意意见','An overall delay needs Cokey\'s approval recorded first'),'warn');return}
  const rp=r.pid&&S.projects.find(x=>x.id===r.pid);
  if(kind==='approve'&&rp&&!INFLIGHT.includes(rp.status)){r.status='rejected';r.decision={by:me().id,at:nowStamp(),comment:T(`项目已是「${ST[rp.status].zh}」，此申请作废`,`Project is already ${ST[rp.status].en}; request voided`)};save();render();toast(T('项目已关闭或取消，此申请已作废','The project is closed or canceled; request voided'),'info');return}
  r.decision={by:me().id,at:nowStamp(),comment:cm.trim()};const sub=S.users.find(u=>u.id===r.by);const subN=sub?sub.name:'';
  if(kind==='return'){r.status='returned';sendMail({to:[subN],subject:`[${T('申请退回','Returned')}] ${reqTitle(r)}`,body:`${T('PMO 退回了您的申请，请修改后重新提交。','PMO returned your request; please edit and resubmit.')}\n\n${T('意见','Comment')}${CO()}${cm}${sig()}`,rule:'manual'})}
  else if(kind==='reject'){r.status='rejected';sendMail({to:[subN],subject:`[${T('申请驳回','Rejected')}] ${reqTitle(r)}`,body:`${T('意见','Comment')}${CO()}${cm}${sig()}`,rule:'manual'})}
  else{
    r.status='approved';const d=r.data;
    if(r.type==='new'){
      createProject(r,cm);
    }
    if(r.type==='change'){
      const p=S.projects.find(x=>x.id===r.pid);const a=d.after;const ch=[];
      if('name' in a){ch.push(`${T('名称','Name')}${CO()}${p.name} → ${a.name}`);p.name=a.name}
      if('pic' in a){ch.push(`${T('负责人','Owner')}${CO()}${p.pic} → ${a.pic}`);p.pic=a.pic}
      if('exec' in a){ch.push(`${T('执行人','Executors')}${CO()}${(p.exec||[]).join('、')} → ${a.exec.join('、')}`);p.exec=a.exec;p.execInfo=a.exec.map(n=>(p.execInfo||[]).find(x=>norm(x.name)===norm(n))||{name:n,team:userTeamTxt(n),duty:''})}
      if('start' in a){ch.push(`${T('开始','Start')}${CO()}${p.start} → ${a.start}`);p.start=a.start}
      const _oldEnd=p.end;
      if('end' in a){ch.push(`${T('完成时间','End')}${CO()}${p.end} → ${a.end}`);if(a.end>(p.end||''))(p.exts=p.exts||[]).push(a.end);p.end=a.end}
      if('plan' in a){const done=p.milestones.filter(m=>m.done),olds=p.milestones.filter(m=>!m.done);
        // keep each milestone's identity (id, history); only changed ones get new dates / names
        const keep=a.plan.map(m=>{const o=m.id&&olds.find(x=>x.id===m.id);
          if(!o)return {id:'m'+uid(),name:m.name,due:m.due,forms:m.forms,done:false};
          const n={...o,name:m.name,due:m.due,forms:m.forms};
          if(o.due!==m.due)n.dueHistory=[...(o.dueHistory||[]),{from:o.due,to:m.due,at:today()}];
          if(o.name!==m.name)delete n._k;return n});
        p.milestones=[...done,...keep].sort((x,y)=>String(x.due||'').localeCompare(String(y.due||'')));
        if(d.replan){d.replan.lines.forEach(l=>{if(l.st==='moved')ch.push(`${l.oldName||l.name}${CO()}${l.oldDue} → ${l.due}`);else if(l.st==='edited')ch.push(`${T('交付成果调整','Deliverable edited')}${CO()}${l.oldName} → ${l.name}${l.oldDue!==l.due?` (${l.oldDue} → ${l.due})`:''}`);else if(l.st==='dropped'){ch.push(`${T('删除节点','Dropped')}${CO()}${l.oldName}（${l.why}）`);(p.removedMs=p.removedMs||[]).push({name:l.oldName,due:l.oldDue,why:l.why,at:today()})}else if(l.st==='new')ch.push(`${T('新增节点','Added')}${CO()}${l.name} (${l.due})`)})}
        else ch.push(T(`执行要求更新为 ${a.plan.length} 个未完成节点`,`Plan updated: ${a.plan.length} open milestones`))}
      if('status' in a){ch.push(`${T('状态','Status')}${CO()}${T(ST[p.status].zh,ST[p.status].en)} → ${T(ST[a.status].zh,ST[a.status].en)}${a.resume?`（${T('预计恢复','resume')} ${a.resume}）`:''}`);p.status=a.status;if(a.status==='canceled')p.canceledAt=today();if(a.status==='on_hold')p.holdUntil=a.resume||''}
      if((d.types||[]).some(k=>k==='end'||k==='plan'))(p.delays=p.delays||[]).push({at:today(),kind:(d.types||[]).includes('end')?'delay':'move',from:_oldEnd,to:'end' in a?a.end:'',rtype:d.reasonType||'',team:d.rTeam||'',biz:d.rBiz||'',reason:d.reason,catchup:d.catchup||'',cokey:r.cokey||null,rid:r.id});
      p.history.push({at:nowStamp(),by:'Aiden',text:T('变更审批通过：','Change approved: ')+ch.join(T('；','; '))+`（${T('原因','reason')}${CO()}${d.reason}）`});
      sendMail({to:[p.pic,...(p.exec||[])],cc:[subN],subject:`[${T('变更通过','Change approved')}] ${p.code}`,body:ch.join('\n')+sig(),rule:'manual',ref:p.id});
    }
    if(r.type==='close'){
      const p=S.projects.find(x=>x.id===r.pid);p.status='to_report';p.closeReq=r.id;
      p.closeFiles=[...(p.closeFiles||[]),...(d.reportFiles||[])];
      Object.entries(d.files||{}).forEach(([mid,fs])=>{const m=p.milestones.find(x=>x.id===mid);if(m&&fs.length){m.evidence=m.evidence||{text:'',email:'',files:[],by:subN,at:today()};m.evidence.files=[...(m.evidence.files||[]),...fs]}});
      p.history.push({at:nowStamp(),by:'Aiden',text:T('结项预审通过，待项目会议汇报','Close pre-approved; to be presented at the project meeting')});
      sendMail({to:[p.pic],cc:[subN],subject:`[${T('结项预审通过','Close pre-approved')}] ${p.code}`,body:`${T('请在下一次项目会议上汇报结项，会议通过后项目正式关闭。','Please present the close at the next project meeting; it closes once approved there.')}${sig()}`,rule:'manual',ref:p.id});
    }
  }
  save();render();toast(kind==='approve'?T('已通过','Approved'):kind==='return'?T('已退回','Returned'):T('已驳回','Rejected'));
}
// o.direct: PMO closes it from the menu (not at the meeting); o.mail=false: no closing mail
function meetClose(pid,o={}){
  const p=S.projects.find(x=>x.id===pid);p.status='closed';p.closedAt=today();p.actual=today();
  p.history.push({at:nowStamp(),by:'Aiden',text:o.direct?T('PMO 直接关闭（结项汇报已预审）','Closed directly by PMO (close report pre-approved)')+whyTxt(o.why||''):T('项目会议汇报通过，项目关闭','Approved at the project meeting; closed')});
  const r=S.requests.find(x=>x.id===p.closeReq);
  if(r&&r.data.toFollow){const code=nextCode(p.team,today().slice(2,4),true);S.follows.unshift({id:'f'+uid(),code,kind:'follow',team:p.team,section:p.section||'',name:`${T('结项后监控','Post-close monitoring')}${CO()}${p.name}`,pic:p.pic,exec:[],start:today(),end:null,ftype:'postclose',status:'open',scope:(r.data.followMonths?T(`监控期 ${r.data.followMonths} 个月；`,`Monitoring period: ${r.data.followMonths} month(s); `):'')+(r.data.followNote||''),link:p.code,updates:[],history:[{at:nowStamp(),by:'Aiden',text:T(`由项目 ${p.code} 结项后转入`,`Created when ${p.code} closed`)}]})}
  const to=[p.pic,...(p.exec||[])].filter(n=>n&&!isDeparted(n));
  if(o.mail!==false&&to.length)sendMail({to,cc:o.direct?ccList([mgrOfP(p)?.name,'Aiden'],to):[],subject:`[${T('项目关闭','Closed')}] ${p.code} ${p.name}`,body:(o.direct?T('PMO 已关闭该项目。','PMO has closed this project.')+(o.why?`\n${T('原因','Reason')}${CO()}${o.why}`:''):T('项目已在项目会议上汇报通过并正式关闭。感谢大家的投入！','The project was approved at the project meeting and is now closed. Thank you!'))+sig(),rule:'manual',ref:p.id});
  save();render();toast(T('项目已关闭','Project closed'));
}
function todoAct(id,a){
  const t=S.todos.find(x=>x.id===id);const p=S.projects.find(x=>x.id===t.pid);const mg=mgrOfP(p);
  if(a==='chase') sendMail({to:[p.pic,...(p.exec||[])],cc:['Aiden'],subject:`[${T('催办','Chaser')}] ${p.code}`,body:`${t.title}\n\n${T('请尽快在系统中提交成果；如无法完成，请提交延期申请并说明原因。','Please submit the deliverable now, or file an extension with the reason.')}${sig()}`,rule:'manual',ref:p.id});
  if(a==='askExt'||a==='askClose'){
    sendMail({to:[p.pic],cc:['Aiden'],subject:`[${a==='askExt'?T('请提交延期申请','Please file an extension'):T('请提交结项申请','Please file a close request')}] ${p.code}`,body:`${t.title}\n\n${a==='askExt'?T('请在系统「项目变更 → 申请延期」中提交新的计划完成时间和原因。','Use Change request → Extension with the new date and reason.'):T('请在系统「申请结项」中勾选交付物并提交。','Use Close request and tick the deliverables.')}${sig()}`,rule:'manual',ref:p.id});
    if(mg) addTodo({type:a,assignee:mg.id,pid:p.id,title:`${p.code} ${a==='askExt'?T('PMO 要求提交延期申请','PMO asks for an extension request'):T('PMO 要求提交结项申请','PMO asks for a close request')}`});
  }
  if(a!=='chase'||true) t.status='done';
  save();render();toast(a==='ok'?T('已处理','Done'):T('已发送邮件','Email sent'));
}
const VIEWS2={apply,change,close:close_,approvals};
const AFTER2={apply:applyAfter,change:changeAfter,close:closeAfter};
Object.assign(VIEWS,VIEWS2);Object.assign(VIEWS_AFTER,AFTER2);

/* ================= ALSA strategic projects ================= */
const ALSA_ST={draft:{zh:'草稿',en:'Draft',c:'p-low'},voting:{zh:'ALSA 审批中',en:'In ALSA vote',c:'p-pending'},revise:{zh:'需修改',en:'Needs revision',c:'p-returned'},approved:{zh:'已全票通过 · 受控执行',en:'Approved · controlled',c:'p-approved'},withdrawn:{zh:'已撤回',en:'Withdrawn',c:'p-withdrawn'}};
const isAlsa=()=>ALSA_IDS.includes(me().id);
const memberGroup=u=>u.side||(u.teams.length&&u.teams.every(c=>team(c).group==='R')?'R':'C');
function alsaInbox(){
  if(isPMO()) return (S.alsa||[]).filter(a=>a.status==='revise'&&proposerIsPMO(a)).length;
  if(isAlsa()) return (S.alsa||[]).filter(a=>a.status==='voting'&&!a.votes[me().id]).length+(S.alsa||[]).filter(a=>a.status==='revise'&&a.by===me().id).length;
  return 0;
}
function curQuarter(){const t=today();return `${yr(t)} Q${qOf(t)}`}
// ALSA projects are classified like topics: L1 = one of six pillars (dropdown), L2 = free text
const MEET_TYPES=[['project','Project meeting'],['adhoc','Ad-hoc meeting'],['quarterly','Quarterly meeting'],['yearly','Yearly meeting']];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const meetLabel=(y,m,t)=>`${y}-${m} ${(MEET_TYPES.find(x=>x[0]===t)||MEET_TYPES[2])[1]}`;
const meetSrcHTML=d=>`<div class="row" style="gap:8px;flex-wrap:nowrap"><select name="mY" aria-label="${T('年份','Year')}">${[0,1,2,3].map(i=>String(yr(today())-1+i)).map(y=>`<option ${String(d.mY||yr(today()))===y?'selected':''}>${y}</option>`).join('')}</select><select name="mM" aria-label="${T('月份','Month')}">${MON.map((m,i)=>{const v=String(i+1).padStart(2,'0');return `<option value="${v}" ${(d.mM||today().slice(5,7))===v?'selected':''}>${T(`${i+1} 月`,m)}</option>`}).join('')}</select><select name="mT" aria-label="${T('会议类型','Meeting type')}">${MEET_TYPES.map(([k,l])=>`<option value="${k}" ${(d.mT||'quarterly')===k?'selected':''}>${l}</option>`).join('')}</select></div>`;
const MKT_R=()=>S.teams.filter(t=>t.group==='R').map(t=>t.code);
const alsaCovTxt=x=>{const c=x&&x.cov;if(!c)return x?tName(x.team):'';const m=c.m||[];return (!m.length||m.length>=MKT_R().length)?T('泛欧','Pan-European'):m.map(k=>tName(k)).join(' · ')};
const covTag=x=>`<span class="tag">${esc(alsaCovTxt(x))}</span>`;
const proposerName=a=>(a.by&&S.users.some(u=>u.id===a.by))?userName(a.by):'Aiden';
const proposerIsPMO=a=>!a.by||!!S.users.find(u=>u.id===a.by&&u.role==='pmo');
const execRecipients=a=>(a.execInfo&&a.execInfo.length)?a.execInfo.map(x=>x.email?{n:x.name,e:x.email}:x.name):(a.exec||[]);
const alsaOwnerTeam=n=>((S.users.find(u=>norm(u.name)===norm(n))||{}).teams||[])[0]||'SEN';
const alsaCls=x=>{const c=TP_L1.find(l=>l[0]===(x&&x.l1));return c?{c:c[0],n:c[1],l2:String(x.l2||'')}:null};
const alsaClsTxt=x=>{const k=alsaCls(x);return k?`${k.n}${k.l2?' · '+k.l2:''}`:'—'};
function lvTag(x){const k=alsaCls(x);return k?`<span class="pill lv-A" title="${esc(k.n)}">${esc(k.n)}</span>${k.l2?` <span class="small muted">${esc(k.l2)}</span>`:''}`:''}
// the proposer is the root; every other voting member is a child with their answer
function voteTree(a){
  const M=alsaMembers(),root=a.by?userName(a.by):'PMO',kids=M.filter(u=>u.id!==a.by);
  const y=kids.filter(u=>a.votes[u.id]&&a.votes[u.id].v==='yes').length,n=kids.filter(u=>a.votes[u.id]&&a.votes[u.id].v==='no').length;
  return `<div class="vtree"><div class="vt-root"><span class="av">${esc(initials(root))}</span><div><b>${esc(root)}</b><div class="small faint">${T('提出人','Proposer')} · ${T(`第 ${a.round||1} 轮`,`Round ${a.round||1}`)} · <span style="color:var(--ok)">${T('同意','yes')} ${y}</span> · <span style="color:var(--bad)">${T('不同意','no')} ${n}</span> · ${T('待表决','pending')} ${kids.length-y-n}</div></div></div>
  <ul class="vt-kids">${kids.map(u=>{const v=a.votes[u.id];const k=v?v.v:'pend';return `<li class="vt-k ${k}"><div class="vt-card"><div class="row" style="gap:8px"><span class="av">${esc(initials(u.name))}</span><b>${esc(u.name)}</b><span class="pill ${k==='yes'?'p-closed':k==='no'?'p-high':'p-low'}">${k==='yes'?T('同意','Approved'):k==='no'?T('不同意','Objected'):T('待表决','Pending')}</span>${v?`<span class="small faint num">${esc(v.at)}</span>`:''}</div>${v&&v.comment?`<div class="small" style="margin-top:4px">${esc(v.comment)}</div>`:''}</div></li>`}).join('')}</ul></div>`;
}
// PMO and the Secretariat see every project, who answered what, and the latest change
function alsaProgress(A){
  const M=alsaMembers(),last=a=>a.history[a.history.length-1]||{};
  const L=[...A].sort((x,y)=>String(last(y).at).localeCompare(String(last(x).at)));
  const row=a=>{const kids=M.filter(u=>u.id!==a.by),y=kids.filter(u=>a.votes[u.id]&&a.votes[u.id].v==='yes').length,n=kids.filter(u=>a.votes[u.id]&&a.votes[u.id].v==='no').length,st=ALSA_ST[a.status]||ALSA_ST.draft,l=last(a);
    return `<tr><td class="mono">${a.code}</td><td class="nm"><div>${esc(a.name)}</div></td><td class="small">${esc(a.by?userName(a.by):'PMO')}</td><td><span class="pill ${st.c}">${esc(T(st.zh,st.en))}</span></td><td class="small">${a.status==='draft'?'—':`<span class="vchip yes">${y}</span> <span class="vchip no">${n}</span> <span class="vchip">${kids.length-y-n}</span>`}</td><td class="small faint">${esc(String(l.at||'').slice(0,16))} · ${esc(l.text||'')}</td></tr>`};
  return `<div class="card"><div class="card-h"><h2>${T('立项表决与反馈进程','Approval and feedback progress')}</h2><span class="tag">${L.length}</span><span class="sp"></span><span class="small faint">${T('同意 / 不同意 / 待表决','approve / object / pending')}</span></div><div class="tw"><table class="t"><thead><tr><th>${T('编号','Code')}</th><th>${T('项目','Project')}</th><th>${T('提出人','Proposer')}</th><th>${T('状态','Status')}</th><th>${T('表决','Votes')}</th><th>${T('最近变动','Latest change')}</th></tr></thead><tbody>${L.map(row).join('')||`<tr><td colspan="6" class="empty">${T('还没有 ALSA 项目','No ALSA projects yet')}</td></tr>`}</tbody></table></div></div>`;
}
function voteBar(a){
  const M=alsaMembers();const yes=M.filter(u=>a.votes[u.id]&&a.votes[u.id].v==='yes').length;const no=M.filter(u=>a.votes[u.id]&&a.votes[u.id].v==='no').length;
  return `<div class="vote"><div class="stack" style="height:8px;flex:1">${yes?`<i style="width:${100*yes/M.length}%;background:var(--ok)"></i>`:''}${no?`<i style="width:${100*no/M.length}%;background:var(--bad)"></i>`:''}<i style="width:${100*(M.length-yes-no)/M.length}%;background:var(--line)"></i></div><span class="small num"><b>${yes}</b>/${M.length} ${T('同意','approved')}${no?` · <span style="color:var(--bad)">${no} ${T('反对','objected')}</span>`:''}</span></div>
  <div class="row" style="gap:6px">${M.map(u=>{const v=a.votes[u.id];return `<span class="vchip ${v?v.v:''}" data-tip="${esc(u.name)}${v?`\n${v.v==='yes'?T('同意','Approved'):T('不同意','Objected')} · ${v.at}${v.comment?'\n'+v.comment:''}`:'\n'+T('未表决','Not voted')}">${ico(v?(v.v==='yes'?'ok':'x'):'clock')}${esc(u.name.replace(/^[一-龥]+\s*/,''))}</span>`}).join('')}</div>`;
}
function alsaCard(a){
  const pmo=isPMO();const mine=a.votes[me().id];const canVote=isAlsa()&&a.status==='voting'&&!mine;const st=ALSA_ST[a.status];
  const proj=a.pid&&S.projects.find(p=>p.id===a.pid);
  const spMe=!pmo&&!isAlsa()&&sponsorOf(a);
  return `<details class="req alsa-card" ${canVote||(canManageA(a)&&a.status==='revise')||(spMe&&a.status==='voting')?'open':''}><summary class="req-h" style="cursor:pointer;list-style:none"><span class="pill ${st.c}">${esc(T(st.zh,st.en))}</span><span class="mono small">${a.code}</span><b style="flex:1;min-width:200px">${esc(a.name)}</b>${lvTag(a)}${covTag(a)}<span class="small faint">${esc(a.meeting)}</span></summary>
  <div class="req-b">
    ${spMe?`<div class="note info small">${T('您是本项目的 ALSA Project Sponsor：不参与表决，可在这里查看审批进度；项目立项（全票通过）后会邮件通知您。','You are the ALSA Project Sponsor for this project. You do not vote; follow the approval here. You will be emailed once all members approve.')}</div>`:''}
    ${a.status!=='draft'?voteTree(a):''}
    <dl class="kv">
      <dt>${T('隶属团队','Team')}</dt><dd>${esc(tName(a.team))}${a.section?` · ${esc(secName(a.section))}`:''}</dd>
      <dt>${T('背景与目标','Background & goal')}</dt><dd>${esc(a.bg.background)}${a.bg.goal?`\n\n${T('目标','Goal')}${CO()}${esc(a.bg.goal)}`:''}</dd>
      ${a.bg.benefit?`<dt>${T('预期收益','Benefits')}</dt><dd>${esc(a.bg.benefit)}</dd>`:''}
      <dt>${T('负责人','Owner')}</dt><dd>${esc(a.pic)}</dd><dt>${T('执行人','Executors')}</dt><dd>${esc(a.exec.join('、'))}</dd>
      ${spKv(a)}
      <dt>${T('时间','Dates')}</dt><dd class="num">${a.start} → ${a.end}</dd></dl>
    <div class="tw"><table class="t"><thead><tr><th>#</th><th>${T('节点交付成果（执行要求）','Deliverable')}</th><th>${T('截止','Due')}</th><th>${T('形式','Format')}</th></tr></thead><tbody>${a.milestones.map((m,i)=>`<tr><td class="num faint">${i+1}</td><td>${esc(m.name)}</td><td class="num">${m.due}</td><td class="small">${fList(m.forms)}</td></tr>`).join('')}</tbody></table></div>
    ${canVote?`<div class="f"><label>${T('表决意见（不同意时必填）','Comment (required if you object)')}</label><textarea id="av-${a.id}" style="min-height:56px"></textarea></div><div class="row"><button class="btn pri" data-act="alsaVote" data-v="yes" data-id="${a.id}">${T('同意立项','Approve')}</button><button class="btn bad" data-act="alsaVote" data-v="no" data-id="${a.id}">${T('不同意，退回 PMO 修改','Object, send back to PMO')}</button></div>`:''}
    ${mine&&a.status==='voting'?`<div class="note small">${T('您已表决：','You voted: ')}${mine.v==='yes'?T('同意','Approve'):T('不同意','Object')} · ${esc(mine.at)}</div>`:''}
    ${canManageA(a)?`<div class="row">${['draft','revise'].includes(a.status)?`<button class="btn" data-act="alsaEdit" data-id="${a.id}">${T('编辑','Edit')}</button><button class="btn pri" data-act="alsaSend" data-id="${a.id}">${a.status==='revise'?T('修改完成，重新发起审批','Resend for vote'):T('发给 ALSA 成员审批','Send to ALSA members')}</button>`:''}${a.status==='voting'?`<button class="btn" data-act="alsaChase" data-id="${a.id}">${T('催办未表决成员','Remind members who have not voted')}</button><button class="btn ghost" data-act="alsaWithdraw" data-id="${a.id}">${T('撤回','Withdraw')}</button>`:''}${proj?`<button class="btn" data-act="open" data-id="${proj.id}">${T('打开受控项目','Open project')}</button>`:''}</div>`:proj&&canView(proj)?`<div class="row"><button class="btn" data-act="open" data-id="${proj.id}">${T('打开受控项目','Open project')}</button></div>`:''}
    <div class="timeline">${[...a.history].reverse().map(h=>`<div class="tl"><span class="d">${esc(String(h.at).slice(0,10))}</span><div class="x small">${esc(h.text)} <span class="faint">${esc(h.by)}</span></div></div>`).join('')}</div>
  </div></details>`;
}
const alsaDept=(id,u)=>id==='pmo'?'PMO':(u.dept||(u.teams&&u.teams.length?u.teams.slice(0,2).map(c=>tName(c)).join(' · ')+(u.teams.length>2?` +${u.teams.length-2}`:''):''));
function alsaHero(){
  return `<div class="alsa-hero ${S.bg&&S.bg!=='none'?'alsa-ocean':''}">${S.bg&&S.bg!=='none'?`<div class="hero-bg" style="background-image:url(${BG.ocean})"></div>`:''}
    <div class="alsa-eyebrow">ALSA · Aftersales Leadership Steering &amp; Alignment</div>
    <h2 class="alsa-slogan">One Aftersales for Europe.<br><span>Aligned across markets and functions, built for the long run.</span></h2></div>`;
}
function alsaRoster(){
  return `<div class="card"><div class="card-h"><h2>${T('ALSA 成员','ALSA members')}</h2></div><div class="card-b alsa-roster">
    ${ALSA_ROLES.map(r=>`<div class="ar ar-${r.k}"><div class="ar-h">${esc(r.en)}${r.ids.length>1?` <span class="faint">${r.ids.length}</span>`:''}</div>${r.ids.map(id=>{const u=S.users.find(x=>x.id===id)||{name:id,teams:[]};const nm=id==='pmo'?'熊卓 Aiden':u.name;const dp=alsaDept(id,u);return `<div class="ar-p"><span class="av">${esc(initials(nm))}</span><span><b>${esc(nm)}</b></span></div>`}).join('')}</div>`).join('')}
    ${spTile()}
  </div></div>`;
}
// meeting schedule: every scheduled ALSA meeting the viewer may see, soonest first, with the reply count
function tpSchedule(){
  const L=tpList().filter(t=>t.status==='scheduled'&&tpVis(t)).sort(tpOrd);const up=L.filter(t=>!tpPast(t)),wait=tpList().filter(t=>t.status==='pending'&&tpVis(t)).length;
  const row=t=>{const y=tpTally(t);return `<tr${tpPast(t)?' class="faint"':''}><td class="num" style="white-space:nowrap">${esc(tpWhen(t))}</td><td class="nm"><div><b>${esc(t.title)}</b></div></td><td class="small">${esc(userName(t.by))}</td><td class="small">${esc(t.place||'—')}</td><td class="small"><span class="vchip yes">${y.yes}</span> <span class="vchip no">${y.no}</span> <span class="vchip">${y.pend}</span></td></tr>`};
  return `<div class="card"><div class="card-h"><h2>${T('会议排期','Meeting schedule')}</h2><span class="tag">${up.length}</span><span class="sp"></span><span class="small faint">${wait?T(`另有 ${wait} 个议题等待秘书处安排`,`${wait} topic(s) waiting for the Secretariat to schedule`):''}</span></div>
    <div class="tw"><table class="t"><thead><tr><th>${T('时间','When')}</th><th>${T('会议 / 议题','Meeting / topic')}</th><th>${T('发起人','Raised by')}</th><th>${T('地点','Where')}</th><th>${T('回复：参加 / 不参加 / 待回复','Replies: yes / no / pending')}</th></tr></thead><tbody>${L.map(row).join('')||`<tr><td colspan="5" class="empty">${T('暂无已安排的会议。提出议题后，由秘书处安排时间。','No meetings scheduled yet. Raise a topic and the Secretariat sets the time.')}</td></tr>`}</tbody></table></div></div>`;
}
/* ---- ALSA resolutions: a news-style feed. The Secretariat publishes; every ALSA member reads and filters ---- */
const resList=()=>S.alsaRes||(S.alsaRes=[]);
const resCan=()=>tpIsSec();
const RES_OPEN=new Set();let RESD=null;   // RESD: the form being filled in (new or edit)
function resItems(){return resList().filter(x=>x.status==='published'&&x.type!=='about')}
const resQ=x=>'Q'+Math.ceil((+String(x.date||'').slice(5,7)||1)/3);
const resMT=x=>x.mT||(MEET_TYPES.find(([k,l])=>String(x.meeting||'').includes(l))||[''])[0];
function resFiltered(){
  const f=S.filters,toks=(f.rq||'').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const L=resItems().filter(x=>(!f.rl1||x.l1===f.rl1)&&(!f.ry||String(x.date).slice(0,4)===f.ry)&&(!f.rqt||resQ(x)===f.rqt)&&(!f.rmt||resMT(x)===f.rmt)&&(!toks.length||toks.every(t=>[x.title,x.summary,x.body,x.l2,x.meeting].join(' ').toLowerCase().includes(t))));
  L.sort((a,b)=>f.rs==='old'?String(a.date).localeCompare(b.date):String(b.date).localeCompare(String(a.date)));
  return L;
}
const resImg=x=>{const f=x.image;if(!f)return `<div class="res-ph"><b>${esc((TP_L1.find(l=>l[0]===x.l1)||[])[1]||'ALSA')}</b></div>`;
  return f.data?`<img src="${f.data}" alt="">`:`<img data-fpath="${esc(f.path)}" alt="">`};
function resCard(x){
  const k=alsaCls(x),has=!!x.image;const sec=resCan()&&!x.auto;
  return `<article class="res-item ${has?'':'noimg'}">${has?`<div class="res-pic">${resImg(x)}</div>`:''}<div class="res-txt">
    <h3>${esc(x.title)}</h3><div class="res-rule"></div>
    <div class="small faint res-meta">${esc(fdW(x.date))}${x.meeting?' · '+esc(x.meeting):''}${k?` · <span class="pill lv-A">${esc(k.n)}</span>${k.l2?' '+esc(k.l2):''}`:''}</div>
    <p>${esc(x.summary||'')}</p>
    <div class="row"><button type="button" class="btn pri" data-act="resView" data-id="${esc(x.id)}">${T('阅读全文','Read more')}</button>${sec?`<button type="button" class="btn sm" data-act="resEdit" data-id="${x.id}">${T('编辑','Edit')}</button><button type="button" class="btn sm bad" data-act="resUnpub" data-id="${x.id}">${T('撤回','Withdraw')}</button>`:''}</div>
  </div></article>`;
}
// full article on its own page
function resDetail(x){
  const k=alsaCls(x),p=x.auto&&S.projects.find(q=>q.code===x.pcode),sec=resCan()&&!x.auto;
  return `<div class="row"><button type="button" class="btn" data-act="resBack">${ico('chevL')}${T('返回 ALSA 动态','Back to ALSA News')}</button></div>
  <article class="card res-art"><div class="card-b">
    <div class="small faint res-meta">${esc(fdW(x.date))}${x.meeting?' · '+esc(x.meeting):''}${k?` · <span class="pill lv-A">${esc(k.n)}</span>${k.l2?' '+esc(k.l2):''}`:''}</div>
    <h1 class="res-h1">${esc(x.title)}</h1><div class="res-rule"></div>
    ${x.image?`<div class="res-hero">${resImg(x)}</div>`:''}
    <p class="res-lead">${esc(x.summary||'')}</p>
    ${x.body?`<div class="res-text">${esc(x.body)}</div>`:''}
    ${(x.files||[]).length?`<div class="lbl" style="margin-top:14px">${T('附件','Attachments')}</div><div class="row">${fileLinks(x.files)}</div>`:''}
    <div class="row" style="margin-top:16px">${p?`<button type="button" class="btn" data-act="open" data-id="${p.id}">${T('打开项目','Open the project')}</button>`:''}${sec?`<button type="button" class="btn sm" data-act="resEdit" data-id="${x.id}">${T('编辑','Edit')}</button><button type="button" class="btn sm bad" data-act="resUnpub" data-id="${x.id}">${T('撤回','Withdraw')}</button>`:''}</div>
  </div></article>`;
}
function resListHTML(){const L=resFiltered();return L.map(resCard).join('')||`<div class="empty">${T('没有符合条件的决议','No resolutions match')}</div>`}
function resFilterHTML(){
  const f=S.filters,A=resItems(),o=(v,l,cur)=>`<option value="${esc(v)}" ${String(cur||'')===String(v)?'selected':''}>${esc(l)}</option>`;
  const years=[...new Set(A.map(x=>String(x.date).slice(0,4)).filter(Boolean))].sort().reverse();
  const sel=(k,label,opts)=>`<label class="lib-f"><span class="sr-only">${label}</span><select data-rf="${k}" aria-label="${label}">${opts.replace(/(<option value=""[^>]*>)[^<]*(<\/option>)/,`$1${label} · ${T('全部','All')}$2`)}</select></label>`;
  return `<div class="card"><div class="card-b form" style="padding:10px 14px"><div class="res-filter"><label class="lib-f"><span class="sr-only">${T('搜索','Search')}</span><input type="search" data-rf="rq" value="${esc(f.rq||'')}" aria-label="${T('搜索','Search')}" placeholder="${T('关键词搜索：标题、内容、会议…（可输入多个词）','Keywords: title, text, meeting… (several words allowed)')}"></label>
    ${sel('ry',T('年份','Year'),o('',T('全部','All'),f.ry)+years.map(y=>o(y,y,f.ry)).join(''))}
    ${sel('rqt',T('季度','Quarter'),o('',T('全部','All'),f.rqt)+[1,2,3,4].map(q=>o('Q'+q,'Q'+q,f.rqt)).join(''))}
    ${sel('rmt',T('会议类型','Meeting type'),o('',T('全部','All'),f.rmt)+MEET_TYPES.map(([k,l])=>o(k,l,f.rmt)).join(''))}
    ${sel('rl1','L1',o('',T('全部','All'),f.rl1)+TP_L1.map(([c,n])=>o(c,n,f.rl1)).join(''))}
    ${sel('rs',T('排序','Sort'),o('new',T('最新在前','Newest first'),f.rs||'new')+o('old',T('最早在前','Oldest first'),f.rs))}
    <button type="button" class="btn" data-act="resClear">${T('清除筛选','Clear')}</button></div></div></div>`;
}
// Secretariat: upload and publish resolutions
function resForm(){
  const d=RESD,drafts=resList().filter(x=>x.status==='draft');
  return `<div class="card res-sec"><div class="card-h"><h2><span class="alsa-tag">${T('秘书处','Secretariat')}</span> ${T('上传并发布决议','Upload and publish resolutions')}</h2><span class="sp"></span>${d?'':`<button type="button" class="btn pri sm" data-act="resNew">${ico('apply')}${T('新决议','New resolution')}</button>`}</div>
    ${d?`<form class="card-b form" id="resForm" novalidate><div class="fgrid">
      <div class="f full"><label>${T('标题','Title')}<span class="req">*</span></label><input type="text" name="title" value="${esc(d.title)}" required></div>
      <div class="f"><label>${T('会议日期','Meeting date')}<span class="req">*</span></label><input type="date" name="date" value="${esc(d.date)}" required></div>
      <div class="f"><label>${T('会议来源','Meeting source')}<span class="req">*</span></label>${meetSrcHTML(d)}</div>
      <div class="f"><label>L1 ${T('分类','category')}</label><select name="l1"><option value="">—</option>${TP_L1.map(([c,n])=>`<option value="${c}" ${d.l1===c?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="f"><label>L2 ${T('具体方向','topic')}</label><input type="text" name="l2" value="${esc(d.l2)}"></div>
      <div class="f full"><label>${T('摘要（显示在列表里）','Summary (shown in the list)')}<span class="req">*</span></label><textarea name="summary" required style="min-height:64px">${esc(d.summary)}</textarea></div>
      <div class="f full"><label>${T('决议内容','Resolution text')}</label><textarea name="body">${esc(d.body)}</textarea></div>
      <div class="f"><label>${T('预览图（可省略）','Preview image (optional)')}</label><input type="file" name="image" accept="image/*">${d.image?`<span class="hint">${T('已有：','Current: ')}${esc(d.image.name)}</span>`:''}</div>
      <div class="f"><label>${T('附件（任意格式）','Attachments (any format)')}</label><input type="file" name="files" multiple>${(d.files||[]).length?`<span class="hint">${T('已有：','Current: ')}${d.files.map(f=>esc(f.name)).join(', ')}</span>`:''}</div></div>
      <div id="resErr"></div><div class="row"><button class="btn pri" name="go" value="publish">${T('发布','Publish')}</button><button class="btn" name="go" value="draft">${T('保存草稿','Save draft')}</button><button type="button" class="btn ghost" data-act="resCancel">${T('取消','Cancel')}</button><span class="small faint">${T('发布后所有 ALSA 成员都能在下方看到','Once published, every ALSA member sees it below')}</span></div></form>`:''}
    ${drafts.length&&!d?`<div class="card-b"><div class="lbl">${T('草稿与已撤回（仅秘书处可见）','Drafts and withdrawn (Secretariat only)')}</div>${drafts.map(x=>`<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line-2)"><b style="flex:1;min-width:200px">${esc(x.title)}</b>${x.withdrawnAt?`<span class="pill p-low">${T('已撤回','Withdrawn')}</span>`:''}<span class="small faint">${esc(x.date||'')}</span><button type="button" class="btn sm pri" data-act="resPublish" data-id="${x.id}">${T('重新发布','Publish')}</button><button type="button" class="btn sm" data-act="resEdit" data-id="${x.id}">${T('编辑','Edit')}</button><button type="button" class="btn sm bad" data-act="resDel" data-id="${x.id}">${T('删除','Delete')}</button></div>`).join('')}</div>`:''}</div>`;
}
function resPage(){
  const id=S.filters.resView,x=id&&resItems().find(q=>q.id===id);
  if(x&&!RESD)return resDetail(x);
  return `${alsaHero()}${resCan()?resForm():''}${resFilterHTML()}<div class="card"><div class="card-h"><h2>ALSA News</h2><span class="tag" id="resN">${resFiltered().length}</span></div><div class="card-b res-feed" id="resList">${resListHTML()}</div></div>`;
}
// About us: vision, charter, members, principles, purpose. The Secretariat keeps the texts.
const AB_SEC=()=>[['vision',T('愿景','Vision')],['purpose',T('宗旨','Purpose')],['principles',T('原则','Principles')],['members',T('成员','Members')],['charter',T('章程','Charter')]];
let ABE=null;
const aboutRec=k=>resList().find(x=>x.type==='about'&&x.key===k);
const aboutTxt=k=>{const q=aboutRec(k);return q?q.text:(k==='vision'?'One Aftersales for Europe.\nAligned across markets and functions, built for the long run.':'')};
const abLines=t=>String(t||'').split('\n').map(x=>x.trim()).filter(Boolean);
function aboutBody(k,t){
  const L=abLines(t);
  if(!L.length)return `<div class="ab-empty">${ico('book')}<div><b>${T('内容尚未添加','Nothing here yet')}</b><div class="small">${resCan()?T('点右上角「编辑」添加。','Use Edit (top right) to add it.'):T('秘书处会在这里发布。','The Secretariat will publish it here.')}</div></div></div>`;
  if(k==='vision')return `<div class="ab-vision"><div class="ab-vq">${esc(L[0])}</div>${L.length>1?`<div class="ab-vs">${L.slice(1).map(esc).join('<br>')}</div>`:''}</div>`;
  if(k==='purpose')return `<blockquote class="ab-purpose">${L.map(esc).join('<br>')}</blockquote>`;
  if(k==='principles')return `<div class="ab-grid">${L.map((l,i)=>{const m=l.match(/^([^:：]{2,40})[:：]\s*(.+)$/);return `<div class="ab-card"><span class="ab-n">${i+1}</span>${m?`<b>${esc(m[1])}</b><p>${esc(m[2])}</p>`:`<p>${esc(l)}</p>`}</div>`}).join('')}</div>`;
  return `<ol class="ab-doc">${L.map(l=>{const m=l.match(/^(\d+)[\.\)]\s*(.+)$/);return `<li ${m?`value="${m[1]}"`:''}>${esc(m?m[2]:l)}</li>`}).join('')}</ol>`;
}
function aboutPage(){
  const toc=`<nav class="ab-toc" aria-label="${T('目录','On this page')}">${AB_SEC().map(([k,l])=>`<button type="button" data-act="abGo" data-k="${k}">${l}</button>`).join('')}</nav>`;
  const sect=([k,l])=>{
    if(k==='members')return `<div id="ab-members" class="ab-sec"><div class="ab-eye">${T('我们是谁','Who we are')}</div>${alsaRoster()}</div>`;
    const q=aboutRec(k),t=aboutTxt(k),ed=ABE===k&&resCan();
    const eye={vision:T('我们的方向','Where we are heading'),charter:T('我们如何运作','How we work'),principles:T('我们的做事方式','How we act'),purpose:T('我们为什么存在','Why we exist')}[k]||'';
    return `<section class="ab-sec abs-${k}" id="ab-${k}"><div class="ab-head"><div><div class="ab-eye">${eye}</div><h2>${l}</h2></div><span class="sp" style="flex:1"></span>${q&&q.example?`<span class="tag">${T('示例文字','Example text')}</span>`:''}${resCan()&&!ed?`<button type="button" class="btn sm" data-act="abEdit" data-k="${k}">${ico('apply')}${T('编辑','Edit')}</button>`:''}</div>
      ${ed?`<form class="card form" id="abForm" style="padding:16px"><input type="hidden" name="k" value="${k}"><textarea name="text" style="min-height:170px" placeholder="${k==='principles'?T('每行一条，可写成「标题：说明」','One per line; write it as "Title: explanation"'):k==='charter'?T('每行一条，可以用 1. 2. 3. 编号','One clause per line; you can number them 1. 2. 3.'):''}">${esc(t)}</textarea><div class="row"><button class="btn pri">${T('保存','Save')}</button><button type="button" class="btn ghost" data-act="abCancel">${T('取消','Cancel')}</button></div></form>`:aboutBody(k,t)}</section>`;
  };
  return alsaHero()+toc+AB_SEC().map(sect).join('');
}
function aboutSeed(){
  return;const now=nowStamp();
  const add=(k,text)=>resList().push({id:'ab-'+k,type:'about',key:k,status:'about',text,at:now,by:'sharon',example:true});
  add('charter','1. ALSA is the steering body for aftersales alignment across European markets and functions.\n2. Steering and Execution members vote on ALSA projects; a project runs once every voting member approves.\n3. The Secretariat schedules meetings, collects replies and publishes resolutions.\n4. PMO sets up ALSA projects and tracks them until they are closed.');
  add('principles','One Europe: Decide once and apply it in every market where it fits.\nLocal ownership: Markets own delivery; ALSA aligns direction and standards.\nTransparency: Every decision is published with its reasoning.\nEvidence first: Proposals come with background, research and clear questions.\nFollow-through: Approved projects run under control until they are closed.');
  add('purpose','To align aftersales across European markets and functions, so customers get one consistent experience and the business grows on shared standards and joint execution.');
}
document.addEventListener('submit',e=>{
  const f=e.target;if(f.id!=='abForm')return;e.preventDefault();e.stopImmediatePropagation();if(!resCan())return;
  const k=f.elements.k.value,text=f.elements.text.value.trim();let q=aboutRec(k);const now=nowStamp();
  if(q){q.text=text;q.at=now;q.by=me().id;q.example=false}else resList().push({id:'ab-'+k,type:'about',key:k,status:'about',text,at:now,by:me().id});
  ABE=null;save();render();toast(T('已保存','Saved'));
},true);
function resImgFix(){if(!window.fileBackend)return;$$('img[data-fpath]').forEach(async im=>{if(im.dataset.done)return;im.dataset.done='1';try{im.src=await window.fileBackend.url({path:im.dataset.fpath,name:'image'})}catch(e){}})}
document.addEventListener('input',e=>{const k=e.target.dataset&&e.target.dataset.rf;if(!k)return;S.filters[k]=e.target.value;const L=$('#resList');if(L){L.innerHTML=resListHTML();const n=$('#resN');n&&(n.textContent=resFiltered().length);resImgFix()}});
document.addEventListener('change',e=>{if(e.target.dataset&&e.target.dataset.rf)save()});
document.addEventListener('submit',async e=>{
  const f=e.target;if(f.id!=='resForm')return;e.preventDefault();e.stopImmediatePropagation();
  if(!resCan())return;const go=(e.submitter&&e.submitter.value)||'draft',g=n=>(f.elements[n]?.value||'').trim();
  const bad=m=>{const x=$('#resErr');x&&(x.innerHTML=`<div class="note bad small" role="alert">${esc(m)}</div>`)};
  if(go==='publish'&&(!g('title')||!g('date')||!g('summary')))return bad(T('发布前请填写带 * 的项','Fill in every field marked * before publishing'));
  if(!g('title'))return bad(T('请至少填写标题','Add at least a title'));
  const sb=f.querySelector('button[name=go]');let img=RESD.image||null,files=[...(RESD.files||[])];
  try{if(f.elements.image.files.length)img=(await readFiles(f.elements.image.files,'alsa-res'))[0];if(f.elements.files.files.length)files=files.concat(await readFiles(f.elements.files.files,'alsa-res'))}
  catch(err){return bad(err&&err.code==='too_big'?tooBigMsg():T('附件读取失败，请重新选择文件','Could not read the attachment; choose the file again'))}
  const rec=RESD.id?resList().find(x=>x.id===RESD.id):null,now=nowStamp();
  const data={title:g('title'),date:g('date'),mY:g('mY'),mM:g('mM'),mT:g('mT'),meeting:meetLabel(g('mY'),g('mM'),g('mT')),l1:g('l1'),l2:g('l2'),summary:g('summary'),body:g('body'),image:img,files,status:go==='publish'?'published':'draft'};
  if(rec){Object.assign(rec,data);rec.history=(rec.history||[]).concat({at:now,by:me().name,text:go==='publish'?'Published':'Saved'})}
  else resList().unshift({id:'r'+uid(),by:me().id,at:now,history:[{at:now,by:me().name,text:go==='publish'?'Published':'Saved as draft'}],...data});
  RESD=null;save();render();toast(go==='publish'?T('决议已发布','Resolution published'):T('草稿已保存','Draft saved'));
},true);
function resSeed(){
  if(resList().some(x=>x.example))return;const t=today();
  const mk=(d,meeting,l1,l2,title,summary,body)=>({id:'r'+uid(),by:'sharon',example:true,status:'published',at:addDays(t,d)+' 17:00',date:addDays(t,d),meeting,l1,l2,title,summary,body,files:[],image:null,history:[{at:addDays(t,d)+' 17:00',by:'Sharon',text:'Published'}]});
  resList().push(
    mk(-12,'2026-10 Quarterly meeting','01','Tiered authorised service network','Three-tier authorised service network endorsed','ALSA endorses a three-tier authorised service network (flagship, standard, satellite) with one set of entry standards for all markets.','1. A three-tier model is adopted as the target network structure.\n2. Entry standards are defined once centrally and applied by every market.\n3. Italy and Poland pilot first; the Secretariat collects the pilot readout for the next meeting.'),
    mk(-40,'2026-07 Quarterly meeting','05','Partner workshop parts logistics','One replenishment rule for partner workshop parts','Parts supply to partner workshops moves to a single regional replenishment rule, owned by the European Parts department.','1. One replenishment rule for partner workshops, owned by European Parts.\n2. Weekly service-level report to Steering until the rule is stable.'),
    mk(-95,'2026-04 Quarterly meeting','03','Warranty data and AI triage','Common warranty data model approved as the base for AI triage','ALSA approves a shared warranty data model as the base for AI-assisted triage; markets keep local systems but report in the common format.','1. The common warranty data model is mandatory for new reports from Q3.\n2. A working group of Technical & Warranty and two markets proposes the AI triage pilot scope.'));
}
function alsa(){
  const pmo=isPMO();const A=(S.alsa||[]).filter(a=>pmo||!!alsaRoleOf(me().id)||a.status==='approved'&&(canSee(a)||alsaRoleOf(me().id))||sponsorOf(a)&&a.status!=='draft');
  const live=S.projects.filter(p=>p.alsa&&canView(p));const toVote=A.filter(a=>a.status==='voting'&&isAlsa()&&!a.votes[me().id]);
  const editing=canSetup()&&S.filters.alsaForm;const tab=alsaTab();
  if(tab==='topic')return tpSchedule()+tpSection();
  if(tab==='about')return aboutPage();
  if(tab==='setup')return `<div class="lbl" style="font-size:14px">1 · ${T('ALSA 项目看板','ALSA project board')}</div>
  <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">
    <div class="kpi" style="cursor:default"><span class="l">${T('审批中','In vote')}</span><span class="v">${A.filter(a=>a.status==='voting').length}</span><span class="s">${T('需修改','Needs revision')} ${A.filter(a=>a.status==='revise').length} · ${T('草稿','Draft')} ${A.filter(a=>a.status==='draft').length}</span></div>
    <div class="kpi" style="cursor:default"><span class="l">${T('受控执行中','Controlled, running')}</span><span class="v">${live.filter(p=>INFLIGHT.includes(p.status)).length}</span><span class="s">${TP_L1.map(([c])=>[c,live.filter(p=>p.l1===c&&INFLIGHT.includes(p.status)).length]).filter(x=>x[1]).map(x=>`${(TP_L1.find(l=>l[0]===x[0])||[])[1]} · ${x[1]}`).join('  ')||'—'}</span></div>
    <div class="kpi ${live.some(p=>pLevel(p)==='high')?'alert':''}" style="cursor:default"><span class="l">${T('ALSA 预警','ALSA red flags')}</span><span class="v">${live.filter(p=>INFLIGHT.includes(p.status)&&pLevel(p)==='high').length}</span><span class="s">${T('ALSA 项目风险自动上调一级','ALSA risks are raised one level')}</span></div>
  </div>
  <div class="card"><div class="card-h"><h2>${T('受控执行的 ALSA 项目','Controlled ALSA projects')}</h2><span class="tag">${live.length}</span></div>
    <div class="tw"><table class="t"><thead><tr><th>${T('编号','Code')}</th><th>${T('项目','Project')}</th><th>L1 / L2</th><th>${T('会议','Meeting')}</th><th>${T('覆盖范围','Coverage')}</th><th>${T('负责人','Owner')}</th><th>${T('下一个节点','Next milestone')}</th><th>${T('交付进度','Delivered')}</th><th>${T('状态','Status')}</th><th>${T('风险','Risk')}</th></tr></thead><tbody>
    ${live.map(p=>{const m=nextMs(p);return `<tr class="click" data-act="open" data-id="${p.id}"><td class="mono">${p.code}</td><td class="nm"><div>${esc(p.name)}</div></td><td>${lvTag(p)}</td><td class="small">${esc(p.meeting||'')}</td><td>${covTag(p)}</td><td>${esc(p.pic)}${(p.sponsors||[]).length?`<div class="small faint">Sponsor ${esc(spNames(p))}</div>`:''}</td><td class="small">${m?`${m.due} · ${esc(m.name)}`:'—'}</td><td>${prog(p)}</td><td>${pill(p.status)}</td><td>${lvPill(pLevel(p))}</td></tr>`}).join('')||`<tr><td colspan="10" class="empty">${T('暂无。成员全票通过后，项目会出现在这里，并同时进入项目库、看板和甘特图。','None yet. Once all members approve, the project appears here and in the project list, dashboard and Gantt.')}</td></tr>`}
    </tbody></table></div></div>
  <div class="lbl" style="font-size:14px;margin-top:6px">2 · ${T('ALSA 立项','ALSA project set-up')}</div>
  ${toVote.length?`<div class="card"><div class="card-h"><h2>${T('待我表决','Waiting for my vote')}</h2><span class="badge">${toVote.length}</span></div><div class="card-b form">${toVote.map(alsaCard).join('')}</div></div>`:''}
  ${canSetup()?(editing?alsaForm():`<div class="row"><button class="btn pri" data-act="alsaNew">${ico('apply')}${T('设立 ALSA 项目','Set up ALSA project')}</button><span class="small faint">${T('ALSA 项目编号：团队代码-年份-A 流水号，例如 GER-26-A01','ALSA code: TEAM-YY-A##, e.g. GER-26-A01')}</span></div>`):''}
  ${(isPMO()||tpIsSec())?alsaProgress(A):''}
  <div class="card"><div class="card-h"><h2>${T('ALSA 项目审批','ALSA approvals')}</h2><span class="tag">${A.filter(a=>a.status!=='approved').length}</span></div><div class="card-b form">${A.filter(a=>a.status!=='approved'&&!toVote.includes(a)).map(alsaCard).join('')||`<div class="empty">${pmo?T('还没有 ALSA 项目。季度 ALSA 会议后，点「设立 ALSA 项目」填写并发给成员审批。','No ALSA projects yet. After the quarterly ALSA meeting, use “Set up ALSA project” and send it to members.'):T('暂无待审批的 ALSA 项目','No ALSA projects in vote')}</div>`}</div></div>`;
  return resPage();
}
const alsaRoleNames=k=>((ALSA_ROLES.find(q=>q.k===k)||{ids:[]}).ids).map(id=>(S.users.find(u=>u.id===id)||{}).name).filter(Boolean);
function alsaForm(){
  const a=S.filters.alsaEdit?(S.alsa||[]).find(x=>x.id===S.filters.alsaEdit):null;const d=a||{bg:{},exec:[],team:'',l1:'',l2:'',cov:{t:'single',m:[]}};
  return `<form class="card form" id="alsaForm" novalidate><div class="card-h"><h2>${a?T(`编辑 ${a.code}`,`Edit ${a.code}`):T('设立 ALSA 项目','Set up an ALSA project')}</h2><span class="sp"></span><button type="button" class="btn sm ghost" data-act="alsaCancel">${T('取消','Cancel')}</button></div>
  <div class="card-b form"><div class="fgrid">
    <div class="f"><label>${T('会议来源','Meeting source')}${req}</label>${meetSrcHTML(d)}</div>
    <div class="f"><label>L1 ${T('分类','category')}${req}</label><select name="l1" required><option value="">${T('请选择','Choose')}</option>${TP_L1.map(([c,n])=>`<option value="${c}" ${d.l1===c?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="f"><label>L2 ${T('具体方向（手动填写）','topic (free text)')}${req}</label><input type="text" name="l2" value="${esc(d.l2||'')}" required placeholder="${T('例如：授权服务网络分级','e.g. Tiered authorised service network')}"></div>
    <div class="f full" id="alMkmF"><div class="row"><label style="font-weight:600;color:var(--ink-2);font-size:12.5px">${T('覆盖的市场（可单选、多选或一键全选；非必填）','Markets covered (one, several or all; optional)')}</label><span class="sp" style="flex:1"></span><button type="button" class="btn sm" id="alMkAll">${T('全选','Select all')}</button><button type="button" class="btn sm ghost" id="alMkNone">${T('清除','Clear')}</button></div><div class="row" style="gap:6px">${S.teams.filter(t=>t.group==='R').map(t=>`<label class="chk small"><input type="checkbox" name="mkm" value="${t.code}" ${((d.cov||{}).m||[]).includes(t.code)?'checked':''}> ${esc(tName(t.code))}</label>`).join('')}</div><span class="hint">${T('不选或全选都显示为「泛欧」。','Leaving it empty or selecting all both show as Pan-European.')}</span></div>
    <div class="f full"><label>${T('项目名称','Project name')}${req}</label><input type="text" name="name" value="${esc(d.name||'')}" required></div>
    <div class="f full"><label>${T('背景','Background')}${req}</label><textarea name="background" required>${esc(d.bg.background||'')}</textarea></div>
    <div class="f"><label>${T('目标','Goal')}${req}</label><textarea name="goal" required>${esc(d.bg.goal||'')}</textarea></div>
    <div class="f"><label>${T('预期收益','Expected benefits')}</label><textarea name="benefit">${esc(d.bg.benefit||'')}</textarea></div>
    <div class="f"><label for="alPic">${T('项目负责人','Project owner')}${req}</label><select name="pic" id="alPic" required><option value="">${T('请选择','Choose')}</option>${alsaMembers().map(u=>u.name).map(n=>`<option ${norm(d.pic||'')===norm(n)?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="f full"><label>${T('项目执行人','Project executors')}${req}</label><div id="alExBox" class="form" style="gap:8px"></div><div><button type="button" class="btn sm" id="alExAdd">${ico('apply')}${T('添加执行人','Add executor')}</button></div><span class="hint">${T('项目负责人和项目执行人都从 ALSA 成员里选。','The owner and the executors are chosen from the ALSA members.')}</span></div>
    <div class="f"><label>${T('开始','Start')}${req}</label><input type="date" name="start" value="${esc(d.start||'')}" required></div>
    <div class="f"><label>${T('计划完成','Planned end')}${req}</label><input type="date" name="end" value="${esc(d.end||'')}" required></div>
    ${spFields(d.pilots||[],d.sponsors||[])}</div>
    <div class="lbl">${T('执行要求：节点与交付成果','Plan: milestones and deliverables')}${req}</div>
    <div class="tw"><table class="t" id="alMs"><thead><tr><th>#</th><th>${T('交付成果','Deliverable')}</th><th>${T('截止','Due')}</th><th>${T('形式','Format')}</th><th></th></tr></thead><tbody></tbody></table></div>
    <button type="button" class="btn" id="alMsAdd" style="align-self:flex-start">${ico('apply')}${T('添加节点','Add milestone')}</button>
    <div id="alErr"></div>
    <div class="row"><button class="btn" name="go" value="draft">${T('保存草稿','Save draft')}</button><button class="btn pri" name="go" value="send">${T('发给 ALSA 成员审批','Send to ALSA members')}</button><span class="small faint">${T(`将发送给 ${alsaMembers().length} 位成员，全部同意后自动进入受控执行；Sponsor 另收通知邮件，不参与表决`,`Goes to ${alsaMembers().length} members; runs once all approve. Sponsors get a separate email and do not vote`)}</span></div>
  </div><datalist id="plist">${people().map(n=>`<option value="${esc(n)}">`).join('')}</datalist></form>`;
}
function alsaAfter(){
  resImgFix();
  const f=$('#alsaForm');if(!f)return;const a=S.filters.alsaEdit?(S.alsa||[]).find(x=>x.id===S.filters.alsaEdit):null;
  const cd=$('#alCode');
  const covOf=()=>{const m=new FormData(f).getAll('mkm');return {t:(!m.length||m.length>=MKT_R().length)?'pan':m.length===1?'single':'multi',m}};
  const teamOf=()=>{const c=covOf();return c.m[0]||alsaOwnerTeam(f.elements.pic.value)};
  const upd=()=>{const tm=teamOf();if(cd)cd.textContent=a&&a.team===tm?a.code:nextCode(tm,(f.elements.start.value||today()).slice(2,4),'A')};
  ['pic','start'].forEach(n=>f.elements[n].addEventListener('change',upd));$$('[name=mkm]',f).forEach(c=>c.addEventListener('change',upd));upd();
  $('#alMkAll').onclick=()=>{$$('[name=mkm]',f).forEach(c=>c.checked=true);upd()};$('#alMkNone').onclick=()=>{$$('[name=mkm]',f).forEach(c=>c.checked=false);upd()};
  // executors: pick from the list, or "Other" with a typed name and email
  // owner and executors are ALSA members: the lists hold the members only
  const exBox=$('#alExBox');
  const exRowH=x=>`<div class="al-exrow"><div class="al-excol"><select class="al-exsel" aria-label="${T('项目执行人','Project executor')}"><option value="">${T('请选择','Choose')}</option>${alsaMembers().map(u=>u.name).map(n=>`<option ${x.name&&norm(x.name)===norm(n)?'selected':''}>${esc(n)}</option>`).join('')}</select></div><button type="button" class="btn sm ghost icon-btn al-exdel" aria-label="${T('移除','Remove')}">${ico('x')}</button></div>`;
  const readEx=()=>$$('.al-exsel',exBox).map(sel=>({name:sel.value})).filter(x=>x.name);
  const drawEx=rows=>{exBox.innerHTML=(rows.length?rows:[{}]).map(exRowH).join('');$$('.al-exdel',exBox).forEach((bt,i)=>bt.onclick=()=>{const cur=$$('.al-exsel',exBox).map(sel=>({name:sel.value}));cur.splice(i,1);drawEx(cur)})};
  drawEx(a?(a.exec||[]).map(n=>({name:n})):[]);
  $('#alExAdd').onclick=()=>{const cur=$$('.al-exsel',exBox).map(sel=>({name:sel.value}));cur.push({});drawEx(cur)};
  const ms=bindMsTable($('#alMs tbody'),a&&a.milestones);$('#alMsAdd').onclick=ms.add;spBind(f);
  let goV='draft';$$('button[name=go]',f).forEach(b=>b.onclick=()=>goV=b.value);
  f.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(f),d=Object.fromEntries(fd);const m=ms.read().filter(x=>x.name||x.due);const pil=fd.getAll('pilot'),sp=spRead(fd);
    d.meeting=meetLabel(d.mY,d.mM,d.mT);const cov=covOf();
    for(const k of ['name','l1','l2','background','goal','pic','start','end']) if(!String(d[k]||'').trim()) return showErr('#alErr',T('请填写所有带 * 的必填项','Fill in every field marked *'));
    const exr=readEx();if(!exr.length) return showErr('#alErr',T('请至少选择一位项目执行人','Pick at least one project executor'));
    if(new Set(exr.map(x=>norm(x.name))).size<exr.length) return showErr('#alErr',T('同一位执行人选了两次','The same executor is listed twice'));
    {const er=spCheck(pil,sp,d.pic);if(er) return showErr('#alErr',er)}
    if(d.end<d.start) return showErr('#alErr',T('计划完成时间不能早于开始时间','End date is before start date'));
    if(!m.length||m.some(x=>!x.name||!x.due)) return showErr('#alErr',T('每个节点都需要交付成果和截止日期','Each milestone needs a deliverable and a date'));
    if(m.some(x=>x.due<d.start||x.due>d.end)) return showErr('#alErr',T('节点日期需在开始与完成时间之间','Milestones must fall between start and end'));
    if(goV==='send'&&!alsaMembers().length) return showErr('#alErr',T('请先在下方设置 ALSA 成员','Set ALSA members first'));
    const rec=a||{id:'a'+uid(),votes:{},round:0,by:me().id,history:[{at:nowStamp(),by:isPMO()?'Aiden':me().name,text:isPMO()?T('PMO 设立 ALSA 项目','Created by PMO'):T('ALSA 成员设立 ALSA 项目','Created by an ALSA member')}],status:'draft'};
    const team=cov.m[0]||alsaOwnerTeam(d.pic);const code=a&&a.team===team?a.code:nextCode(team,d.start.slice(2,4),'A');
    Object.assign(rec,{code,team,cov,section:'',mY:d.mY,mM:d.mM,mT:d.mT,l1:d.l1,l2:(d.l2||'').trim(),meeting:d.meeting.trim(),name:d.name.trim(),bg:{background:d.background,goal:d.goal,benefit:d.benefit},pic:d.pic.trim(),exec:exr.map(x=>x.name),execInfo:exr,start:d.start,end:d.end,pilots:pil,sponsors:sp,milestones:m.sort((x,y)=>x.due.localeCompare(y.due))});rec.spSent=(rec.spSent||[]).filter(k=>sp.some(s=>spKey(s)===k));
    if(!a){S.alsa=S.alsa||[];S.alsa.unshift(rec)}else rec.history.push({at:nowStamp(),by:isPMO()?'Aiden':me().name,text:isPMO()?T('PMO 修改项目内容','Edited by PMO'):T('修改项目内容','Edited')});
    S.filters.alsaForm=false;S.filters.alsaEdit=null;
    if(goV==='send') alsaSend(rec.id); else {save();render();toast(T('草稿已保存','Draft saved'))}
  });
}
function alsaSend(id){
  const a=S.alsa.find(x=>x.id===id);const who=a.by&&norm(userName(a.by))!==norm('Aiden')&&!S.users.find(u=>u.id===a.by&&u.role==='pmo')?userName(a.by):'PMO';a.status='voting';a.votes={};a.round=(a.round||0)+1;if(a.by&&alsaMembers().some(u=>u.id===a.by))a.votes[a.by]={v:'yes',comment:'',at:nowStamp(),auto:true};a.sentAt=nowStamp();
  a.history.push({at:nowStamp(),by:'Aiden',text:T(`第 ${a.round} 轮：发给 ${alsaMembers().length} 位 ALSA 成员审批`,`Round ${a.round}: sent to ${alsaMembers().length} ALSA members`)});
  sendMail({to:alsaMembers().map(u=>u.name),cc:alsaCc('vote'),subject:`[ALSA ${T('立项审批','approval')}] ${a.code} ${a.name}`,body:`${T('各位 ALSA 成员好','Dear ALSA members')}${CO()}\n\n${T('以下项目来自','The following project comes from')} ${a.meeting}，${T(`由 ${who} 设立，请审批。`,`set up by ${who}; please vote.`)}\n\n${a.code}「${a.name}」（${alsaClsTxt(a)}，${alsaCovTxt(a)}）\n${T('负责人','Owner')}${CO()}${a.pic}\n${T('执行人','Executors')}${CO()}${a.exec.join('、')}\n${T('时间','Dates')}${CO()}${a.start} → ${a.end}${spLines(a)}\n\n${T('执行要求','Plan')}${CO()}\n${a.milestones.map((m,i)=>`${i+1}. ${m.due}  ${m.name}`).join('\n')}\n\n${T('请登录系统「ALSA 战略项目」表决：同意，或不同意并写明意见。全部同意后项目进入受控执行。','Sign in to ALSA projects to approve, or object with a comment. The project starts once everyone approves.')}${sig()}`,rule:'manual'});
  save();render();toast(T('已发给 ALSA 成员审批','Sent to ALSA members'));
}
function alsaVote(id,v){
  const a=S.alsa.find(x=>x.id===id);const cm=($('#av-'+id)||{}).value||'';
  if(v==='no'&&!cm.trim()){toast(T('不同意时请填写意见','Add a comment when objecting'),'warn');flagField($('#av-'+id));return}
  a.votes[me().id]={v,comment:cm.trim(),at:nowStamp()};
  a.history.push({at:nowStamp(),by:me().name,text:v==='yes'?T('同意立项','Approved'):T(`不同意：${cm}`,`Objected: ${cm}`)});
  if(v==='no'){a.status='revise';sendMail({to:[proposerName(a)],subject:`[ALSA ${T('退回修改','sent back')}] ${a.code} ${a.name}`,body:`${me().name} ${T('不同意该 ALSA 项目','objected to this ALSA project')}${CO()}\n${cm}\n\n${T('请修改后重新发起审批（将开始新一轮表决）。','Please revise and resend (a new voting round starts).')}${sig()}`,rule:'manual'})}
  else if(alsaMembers().every(u=>a.votes[u.id]&&a.votes[u.id].v==='yes')) alsaApprove(a);
  save();render();toast(v==='yes'?T('已同意','Approved'):T('已退回给提出人','Sent back to the proposer'));
}
function alsaApprove(a){
  a.status='approved';
  const pcode=nextCode('ALSA',(a.start||today()).slice(2,4),'P');a.pcode=pcode;   // its own number series in the project library; the proposal number stays as the old code
  const p={id:'p'+uid(),code:pcode,prev:a.code,kind:'project',alsa:true,l1:a.l1,l2:a.l2,cov:a.cov,meeting:a.meeting,team:a.team,section:a.section,name:a.name,bg:{background:a.bg.background,why:a.bg.goal,benefit:a.bg.benefit},scope:a.milestones.map((m,i)=>`${i+1}. ${m.name}（${m.due}）`).join('\n'),pic:a.pic,exec:a.exec,execInfo:(a.execInfo||[]).map(x=>({...x,team:'',duty:''})),pilots:[...(a.pilots||[])],sponsors:(a.sponsors||[]).map(s=>({...s})),start:a.start,end:a.end,actual:null,exts:[],updates:[],status:a.start>today()?'not_started':'active',
    milestones:a.milestones.map((m,i)=>({id:'m'+(i+1),name:m.name,due:m.due,forms:m.forms,done:false})),history:[{at:nowStamp(),by:T('系统','System'),text:T(`ALSA 全体成员（${alsaMembers().length} 人）同意，进入受控执行`,`All ${alsaMembers().length} ALSA members approved; now controlled`)}],old:'',sheet:''};
  S.projects.unshift(p);a.pid=p.id;a.history.push({at:nowStamp(),by:T('系统','System'),text:T('全票通过，进入受控执行','Unanimous; project started')});
  sendMail({to:[a.pic,...execRecipients(a),...alsaMembers().map(u=>u.name)],cc:alsaCc(),subject:`[ALSA ${T('全票通过','approved')}] ${pcode} ${a.name}`,body:`${T('ALSA 全体成员已同意，项目进入受控执行，由 PMO 在 ALSA 会议上统一管控。','All ALSA members approved. The project now runs under PMO control and is reviewed at ALSA meetings.')}${spLines(a)}\n\n${T('节点计划','Milestones')}${CO()}\n${a.milestones.map(m=>`· ${m.due}  ${m.name}`).join('\n')}\n\n${T(`系统会在每个节点前 ${S.lead||15} 天提醒，并抄送 PMO。`,`Reminders go out ${S.lead||15} days before each milestone, cc PMO.`)}${sig()}`,rule:'manual',ref:p.id});
  alsaSpMail(a,p);
}
/* ---- ALSA Project Sponsor ---- */
const spNames=x=>(x.sponsors||[]).map(s=>s.name).join('、');
const spLines=x=>`${(x.pilots||[]).length?`\n${T('试点市场','Pilot markets')}${CO()}${x.pilots.map(c=>`${c} ${tName(c)}`).join('、')}`:''}${(x.sponsors||[]).length?`\nALSA Project Sponsor${CO()}${spNames(x)}${T('（不参与表决）',' (no vote)')}`:''}`;
function spKv(x){
  return `${(x.pilots||[]).length?`<dt>${T('试点市场','Pilot markets')}</dt><dd>${x.pilots.map(tag).join(' ')}</dd>`:''}${(x.sponsors||[]).length?`<dt>ALSA Project Sponsor</dt><dd>${x.sponsors.map(s=>`${esc(s.name)} <span class="small faint">&lt;${esc(s.email)}&gt;</span>`).join('<br>')}<div class="small faint">${T('不参与表决，项目立项后邮件通知','No vote; emailed once the project is approved')}</div></dd>`:''}`;
}
function ownerSel(cur){
  const M=alsaMembers(),isM=M.some(u=>norm(u.name)===norm(cur));
  return `<select name="pic" id="alPic" required><option value="">${T('请选择 ALSA 成员','Choose an ALSA member')}</option>${cur&&!isM?`<option value="${esc(cur)}" selected>${esc(cur)} · ${T('不是 ALSA 成员','not an ALSA member')}</option>`:''}${ALSA_ROLES.filter(r=>r.vote).map(r=>`<optgroup label="${r.en}">${r.ids.map(id=>M.find(u=>u.id===id)).filter(Boolean).map(u=>`<option value="${esc(u.name)}" ${norm(u.name)===norm(cur)?'selected':''}>${esc(u.name)}${u.teams.length?` · ${u.teams.join(' ')}`:''}</option>`).join('')}</optgroup>`).join('')}</select>`;
}
const spPeople=()=>S.users.filter(u=>u.status!=='disabled'&&!isDeparted(u.name));
const spRow=(s={})=>{const u=spPeople().find(x=>(s.email&&x.email&&norm(x.email)===norm(s.email))||(s.name&&norm(x.name)===norm(s.name)));const oth=!!(s.name||s.email)&&!u;
  return `<div class="sp-row"><select class="sp-sel" aria-label="Sponsor"><option value="">${T('请选择','Choose')}</option>${spPeople().map(x=>`<option value="${esc(x.name)}" ${u&&u.id===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}<option value="__other" ${oth?'selected':''}>${T('其他（手动填写姓名和邮箱）','Other (type name and email)')}</option></select><span class="sp-oth" ${oth?'':'hidden'}><input type="text" name="spName" value="${esc(u?u.name:(s.name||''))}" placeholder="${T('姓名','Name')}" aria-label="${T('Sponsor 姓名','Sponsor name')}" autocomplete="off"><input type="email" name="spEmail" value="${esc(u?(u.email||''):(s.email||''))}" placeholder="${T('邮箱','Email')}" aria-label="${T('Sponsor 邮箱','Sponsor email')}"></span><button type="button" class="btn sm ghost" data-sp="del" aria-label="${T('删除这一行','Remove this row')}">${ico('x')}</button></div>`};
// pilot markets + sponsors: the ALSA set-up form and the drawer dialog for running projects
function spFields(pilots,sponsors){
  return `<fieldset class="f full sp-f"><legend>ALSA Project Sponsor <span class="faint">${T('（可选，不参与表决）','(optional, no vote)')}</span></legend>
    <div class="sp-rows">${(sponsors.length?sponsors:[{}]).map(spRow).join('')}</div>
    <button type="button" class="btn sm" data-sp="add" style="align-self:flex-start">${ico('apply')}${T('添加 Sponsor','Add sponsor')}</button>
    <div class="sp-sum" aria-live="polite"></div>
    <datalist id="spList">${spCands().map(u=>`<option value="${esc(u.name)}">`).join('')}</datalist></fieldset>`;
}
function spRead(fd){const N=fd.getAll('spName'),E=fd.getAll('spEmail');return N.map((n,i)=>({name:String(n).trim(),email:String(E[i]||'').trim()})).filter(s=>s.name||s.email)}
function spBind(root){
  const box=$('.sp-rows',root),out=$('.sp-sum',root);if(!box)return;
  const rows=()=>$$('.sp-row',box),val=(r,n)=>$(`[name=${n}]`,r).value.trim();
  const read=()=>rows().map(r=>({name:val(r,'spName'),email:val(r,'spEmail')})).filter(s=>s.name||s.email);
  const add=s=>{const r=rows().find(r=>!val(r,'spName')&&!val(r,'spEmail'));if(r){$('[name=spName]',r).value=s.name||'';$('[name=spEmail]',r).value=s.email||'';return r}box.insertAdjacentHTML('beforeend',spRow(s));return box.lastElementChild};
  const upd=()=>{
    const P=$$('input[name=pilot]:checked',root).map(i=>i.value),sp=read().filter(s=>s.name);
    const L=P.map(c=>{const mem=alsaIn(c);if(mem.length)return `<div>${ico('ok')}<span><b class="mono">${c}</b> ${T('由 ALSA 成员推进','run by ALSA member')} ${esc(mem.map(u=>u.name).join('、'))}</span></div>`;
      const own=sp.filter(s=>{const u=S.users.find(x=>norm(x.name)===norm(s.name));return u&&u.teams.includes(c)}),s=own.length?own:sp;
      return s.length?`<div>${ico('ok')}<span><b class="mono">${c}</b> ${T('无 ALSA 成员','no ALSA member')} · Sponsor ${esc(s.map(x=>x.name).join('、'))}</span></div>`:`<div class="bad">${ico('alert')}<span><b class="mono">${c}</b> ${T('没有 ALSA 成员，请填写 Sponsor','has no ALSA member; add a sponsor')}</span></div>`});
    out.innerHTML=L.length?`<div class="note small">${L.join('')}</div>`:'';
  };
  root.addEventListener('click',e=>{const b=e.target.closest('[data-sp]');if(!b||!root.contains(b))return;
    if(b.dataset.sp==='add'){const r=add({});$('[name=spName]',r).focus()}
    else{const r=b.closest('.sp-row');if(rows().length>1)r.remove();else{$$('input',r).forEach(i=>i.value='');const sl=$('.sp-sel',r);sl&&(sl.value='');const ot=$('.sp-oth',r);ot&&(ot.hidden=true)}}
    upd()});
  root.addEventListener('change',e=>{const n=e.target.name;
    // a known person: fill in their email
    if(e.target.classList.contains('sp-sel')){const row=e.target.closest('.sp-row'),v=e.target.value,nm=$('[name=spName]',row),em=$('[name=spEmail]',row),ot=$('.sp-oth',row);if(v==='__other'){ot.hidden=false;nm.value='';em.value='';nm.focus()}else{ot.hidden=true;const u=S.users.find(x=>x.name===v);nm.value=v;em.value=u?(u.email||''):''}upd();return}
    if(n==='spName'){const u=S.users.find(x=>norm(x.name)===norm(e.target.value));const em=$('[name=spEmail]',e.target.closest('.sp-row'));if(u&&em&&!em.value.trim())em.value=u.email||''}
    // ticking a market with no ALSA member adds its manager as sponsor
    if(n==='pilot'&&e.target.checked&&!alsaIn(e.target.value).length){const m=mgrOf(e.target.value);if(m&&!read().some(s=>norm(s.name)===norm(m.name)))add({name:m.name,email:m.email})}
    if(n==='pilot'||n==='spName'||n==='spEmail')upd()});
  upd();
}
function spCheck(pil,sp,owner){
  const EM=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for(const s of sp){
    if(!s.name) return T('请填写 Sponsor 姓名','Enter the sponsor’s name');
    if(!EM.test(s.email)) return T(`请填写 ${s.name} 的有效邮箱`,`Enter a valid email for ${s.name}`);
    if(norm(s.name)===norm(owner)) return T('Sponsor 不能是项目负责人','A sponsor cannot be the owner');
  }
  if(new Set(sp.map(spKey)).size<sp.length) return T('同一位 Sponsor 填了两次','The same sponsor is listed twice');
  const bare=pil.filter(c=>!alsaIn(c).length);
  if(bare.length&&!sp.length) return T(`试点市场 ${bare.join('、')} 没有 ALSA 成员，请填写 ALSA Project Sponsor`,`Pilot market ${bare.join(', ')} has no ALSA member; add an ALSA Project Sponsor`);
  return '';
}
// each sponsor is emailed once the project is approved, and a sponsor PMO adds later is emailed when added
function alsaSpMail(x,p){
  const fresh=(x.sponsors||[]).filter(s=>!(x.spSent||[]).includes(spKey(s)));if(!fresh.length)return 0;
  x.spSent=[...(x.spSent||[]),...fresh.map(spKey)];const nm=fresh.map(s=>s.name);
  sendMail({to:fresh.map(s=>({n:s.name,e:s.email})),cc:ccList([x.pic,'Aiden'],nm),subject:`[ALSA Sponsor] ${x.code} ${x.name}`,body:`${nm.join('、')}${CM()}${T('您好','hello')}${CO()}\n\n${T('以下 ALSA 项目已获 ALSA 全体成员同意，正式立项并进入受控执行。PMO 指定您为该项目的 ALSA Project Sponsor。','All ALSA members have approved this ALSA project and it is now running under PMO control. PMO has named you its ALSA Project Sponsor.')}\n\n${x.code}「${x.name}」（${alsaClsTxt(x)}，${alsaCovTxt(x)}）\n${T('负责人','Owner')}${CO()}${x.pic}${T('（ALSA 成员）',' (ALSA member)')}\n${T('执行人','Executors')}${CO()}${(x.exec||[]).join('、')}\n${T('时间','Dates')}${CO()}${x.start} → ${x.end}${spLines(x)}\n\n${T('Sponsor 的作用：项目在您负责、但没有 ALSA 成员的市场试点时，提供资源和决策支持，协助负责人推进试点，之后全欧推广。Sponsor 不参与 ALSA 表决，项目由 ALSA 成员审批、由负责人执行。','As sponsor you back the pilot in your market, which has no ALSA member, with resources and decisions, and help the owner run it before the Europe-wide rollout. Sponsors do not vote: ALSA members approve the project and the owner runs it.')}\n\n${T('节点计划','Milestones')}${CO()}\n${(x.milestones||[]).map(m=>`· ${m.due}  ${m.name}`).join('\n')}\n\n${T('您可以登录系统，在「ALSA 战略项目」和「项目看板」查看该项目。','Sign in to see it under ALSA projects and on your dashboard.')}${sig()}`,rule:'manual',ref:p?p.id:x.id});
  const h={at:nowStamp(),by:T('系统','System'),text:T(`已邮件通知 ALSA Project Sponsor：${nm.join('、')}`,`ALSA Project Sponsor emailed: ${nm.join(', ')}`)};
  x.history.push(h);if(p&&p!==x)p.history.push({...h});
  return fresh.length;
}
function qaSponsor(p){
  showModal(T('试点市场与 ALSA Project Sponsor','Pilot markets and ALSA Project Sponsor'),`<input type="hidden" name="qa" value="sponsor"><input type="hidden" name="pid" value="${p.id}">${spFields(p.pilots||[],p.sponsors||[])}<div class="small faint">${T('新填写的 Sponsor 保存后立即收到邮件通知。','New sponsors are emailed as soon as you save.')}</div>`,qaHead(p));
  spBind($('#qaForm'));
}
function spTile(){
  const L=(S.alsa||[]).filter(a=>!['draft','withdrawn'].includes(a.status));const P=new Map();
  L.forEach(a=>(a.sponsors||[]).forEach(s=>{const k=spKey(s);const o=P.get(k)||{s,codes:[]};o.codes.push(a.code);P.set(k,o)}));
  return `<div class="ar ar-sp"><div class="ar-h">ALSA Project Sponsor</div><div class="ar-note">${T('按项目指定，不是 ALSA 成员：项目在没有 ALSA 成员的市场试点时，由该市场的国家售后经理支持试点。不参与审批；项目立项后收到邮件，并可查看所支持的项目。','Named per project, not an ALSA member: backs a pilot in a market that has no ALSA member. No vote; emailed once the project is approved, and can see the projects they sponsor.')}</div>
    <div class="ar-list">${P.size?[...P.values()].map(({s,codes})=>`<div class="ar-p"><span class="av">${esc(initials(s.name))}</span><span><b>${esc(s.name)}</b><small class="mono">${codes.join(' · ')}</small></span></div>`).join(''):`<span class="small faint">${T('暂无','None yet')}</span>`}</div></div>`;
}
// dashboard card for people who sponsor an ALSA project
function spCard(){
  if(isPMO())return '';const L=(S.alsa||[]).filter(a=>a.status!=='draft'&&sponsorOf(a));if(!L.length)return '';
  return `<div class="card sp-card"><div class="card-h"><h2>${T('我担任 Sponsor 的 ALSA 项目','ALSA projects I sponsor')}</h2><span class="tag">${L.length}</span><span class="sp"></span><span class="small faint">${T('Sponsor 不参与表决，在试点市场支持项目推进','Sponsors do not vote; they back the pilot in their market')}</span></div>
    <div class="list">${L.map(a=>{const p=a.pid&&S.projects.find(x=>x.id===a.pid);const m=p&&nextMs(p);const st=ALSA_ST[a.status];
      return `<div class="li" ${p?`data-act="open" data-id="${p.id}"`:'data-act="go" data-v="alsa" data-at="setup"'}><span class="mono small faint" style="width:84px;flex:none">${a.code}</span><div class="grow"><div class="ttl"><span class="alsa-tag">ALSA</span> ${esc(a.name)}</div><div class="small faint">${T('负责人','Owner')} ${esc(a.pic)}${(a.pilots||[]).length?` · ${T('试点','Pilot')} ${esc(a.pilots.join(' '))}`:''}${m?` · ${T('下一个节点','Next')} ${m.due} ${esc(m.name)}`:''}</div></div><div style="flex:none">${p?pill(p.status):`<span class="pill ${st.c}">${esc(T(st.zh,st.en))}</span>`}</div></div>`}).join('')}</div></div>`;
}
Object.assign(VIEWS,{alsa});Object.assign(VIEWS_AFTER,{alsa:alsaAfter});

/* ================= ALSA topics & meetings: an approval flow through the ALSA Secretariat =================
   1. an ALSA member raises a topic: L1 strategic pillar + L2 sub-topic, background / prior research / questions,
      the length they need; every Steering and Execution member is invited, other colleagues are added by email
   2. the request goes to the ALSA Secretariat, who schedules it (sees everyone's free time), sends it back for
      more detail, or declines it
   3. the invitation is emailed to everyone; invitees accept or decline (from the email or this page) and the
      Secretariat collects the replies, records external guests' answers, reminds, reschedules or cancels.
   Demo: free/busy comes from a simulated calendar plus the ALSA meetings booked here (Outlook / Exchange in production). */
const TP_L1=[['01','Service Network & Governance Excellence'],['02','Customer Experience & Loyalty Excellence'],['03','Digital, Data & AI-driven Aftersales'],['04','Technical & Service Excellence'],['05','Parts Supply & Logistics Excellence'],['06','Aftersales Business Growth & Dealer Profitability']];
const tpL1N=c=>{const x=TP_L1.find(l=>l[0]===c);return x?x[1]:'—'};
const TP_ST={pending:{zh:'待秘书处安排',en:'With the Secretariat',c:'p-pending'},returned:{zh:'退回补充',en:'Returned for detail',c:'p-returned'},rejected:{zh:'不予安排',en:'Not scheduled',c:'p-rejected'},scheduled:{zh:'已安排',en:'Scheduled',c:'p-approved'},held:{zh:'已召开',en:'Held',c:'p-closed'},canceled:{zh:'已取消',en:'Canceled',c:'p-withdrawn'},withdrawn:{zh:'已撤回',en:'Withdrawn',c:'p-withdrawn'}};
const TP_N=18; // working day 09:00–18:00 CET in 30-minute slots
const tpT=i=>{const m=540+30*i;return `${String(Math.floor(m/60)).padStart(2,'0')}:${m%60?'30':'00'}`};
const tpList=()=>S.alsaTopics||(S.alsaTopics=[]);
const tpCan=()=>!!alsaRoleOf(me().id);
const TP_SEC=()=>ALSA_ROLES.filter(r=>r.k==='sec').flatMap(r=>r.ids);
const tpIsSec=()=>TP_SEC().includes(me().id);
const tpCore=()=>ALSA_IDS.filter(id=>{const u=S.users.find(x=>x.id===id);return u&&u.status!=='disabled'});
const tpShort=id=>userName(id).replace(/^[一-龥]+\s+/,'');
const tpWhen=t=>t.d?`${fdW(t.d)} ${tpT(t.s)}–${tpT(t.s+t.k)} CET`:T('待秘书处安排','To be scheduled');
const tpStage=t=>t.status==='scheduled'&&tpPastTime(t)?'held':t.status;
const tpNowMin=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()};
const tpPastTime=t=>!!t.d&&(t.d<today()||(t.d===today()&&540+30*(t.s+t.k)<=tpNowMin()));
const tpPast=t=>['rejected','canceled','withdrawn'].includes(t.status)||(t.status==='scheduled'&&tpPastTime(t));
const tpAtt=t=>[...new Set([t.by,...tpCore()])]; // system attendees: the requester + every Steering / Execution member
const tpInvOf=t=>tpAtt(t).filter(id=>id!==t.by);  // those who reply (the requester has accepted by raising it)
const tpMine=t=>t.by===me().id||tpAtt(t).includes(me().id);
const tpVis=t=>tpCan()||tpIsSec()||tpMine(t);
const tpEmailOk=e=>/^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(String(e||'').trim());
function tpDays(){const out=[];let d=today();const ed=TPD&&TPD.id&&tpList().find(x=>x.id===TPD.id);if(ed&&ed.d===today()){const w=new Date(dn(d)*864e5).getUTCDay();if(w&&w<6)out.push(d)}while(out.length<20){d=addDays(d,1);const w=new Date(dn(d)*864e5).getUTCDay();if(w&&w<6)out.push(d)}return out}
const TPC={};
function tpCal(id,d){
  const k=id+'|'+d;if(TPC[k])return TPC[k];
  if(!IS_DEMO())return TPC[k]={b:new Array(TP_N).fill(false),ooo:false};   // live: no invented busy slots; only ALSA meetings booked here count
  let h=2166136261;for(const c of k){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}
  const r=()=>{h=Math.imul(h^(h>>>15),2246822507);h=Math.imul(h^(h>>>13),3266489909);h^=h>>>16;return (h>>>0)/4294967296};
  const b=new Array(TP_N).fill(false);const n=Math.floor(r()*4);
  for(let j=0;j<n;j++){const s=Math.floor(r()*TP_N),L=1+Math.floor(r()*2);for(let i=s;i<Math.min(TP_N,s+L);i++)b[i]=true}
  return TPC[k]={b,ooo:r()<.03};
}
function tpBusy(id,d,i,excl){
  for(const t of tpList()){if(t.id===excl||t.status!=='scheduled'||t.d!==d||i<t.s||i>=t.s+t.k)continue;
    if(tpAtt(t).includes(id)&&!(t.rsvp[id]&&t.rsvp[id].v==='no'))return T(`ALSA 会议「${t.title}」`,`ALSA meeting "${t.title}"`)}
  const c=tpCal(id,d);if(c.ooo)return T('全天外出','Out of office');if(c.b[i])return T('日历已有安排','Busy in calendar');return null;
}
function tpBusyR(id,d,s,k,excl){for(let i=s;i<s+k;i++){const r=tpBusy(id,d,i,excl);if(r)return r}return null}
// what is waiting for me: invitations to answer, requests to handle (Secretariat), requests sent back to me
const tpForMe=()=>{const m=me().id;return tpList().filter(t=>(t.status==='scheduled'&&!tpPast(t)&&tpInvOf(t).includes(m)&&!t.rsvp[m])||(t.status==='pending'&&tpIsSec())||(t.status==='returned'&&t.by===m))};
function tpInbox(){return tpForMe().length}

/* ---- the request form (the person raising the topic) ---- */
let TPR=null; // request draft
let TPD=null,TPCX=null;const TPOPEN=new Set(); // TPD: Secretariat's scheduling draft; TPCX: meeting being cancelled
document.addEventListener('toggle',e=>{const d=e.target;if(d.matches&&d.matches('details.tp-card')){d.open?TPOPEN.add(d.dataset.tpid):TPOPEN.delete(d.dataset.tpid)}},true);
function tpNewReq(t){TPR=t?{id:t.id,owner:me().id,title:t.title,l1:t.l1,l2:t.l2,k:t.k,bg:t.bg,research:t.research,questions:t.questions,pref:t.pref||'',ext:[...(t.ext||[])],files:[...(t.files||[])]}:{id:null,owner:me().id,title:'',l1:'',l2:'',k:2,bg:'',research:'',questions:'',pref:'',ext:[],files:[]}}
const TP_DUR=[1,2,3,4];
const tpDurHTML=(k,act)=>TP_DUR.map(n=>`<button type="button" data-tp="${act}" data-k="${n}" class="${k===n?'on':''}" aria-pressed="${k===n}">${n*30} ${T('分钟','min')}</button>`).join('');
const tpExtHTML=(L,act)=>`${L.map(e=>`<span class="tag tp-ext">${esc(e)}<button type="button" class="chip-x" data-tp="${act}" data-e="${esc(e)}" aria-label="${T('移除','Remove')} ${esc(e)}">${ico('x')}</button></span>`).join('')}`;
function tpCoreHTML(by){
  const C=tpCore().filter(id=>id!==by);
  return ALSA_ROLES.filter(r=>r.vote).map(r=>{const ids=r.ids.filter(id=>C.includes(id));return ids.length?`<div class="tp-grp"><div class="tp-grp-h">${esc(r.en)} <span class="tp-grp-n">${T(`全部 ${ids.length} 人，自动邀请`,`all ${ids.length}, invited automatically`)}</span></div><div class="tp-chips">${ids.map(id=>`<span class="tag tp-lock">${ico('ok')}${esc(userName(id))}</span>`).join('')}</div></div>`:''}).join('');
}
const tpMfChips=D=>[...(D.files||[]).map((f,i)=>['o:'+i,f.name]),...(D.nf||[]).map((f,i)=>['n:'+i,f.name])].map(([k,n])=>`<span class="tag" style="padding:3px 8px">${ico('clip')} ${esc(n)} <button type="button" class="chip-x" data-tpmf="${k}" aria-label="${T('移除','Remove')} ${esc(n)}">${ico('x')}</button></span>`).join('')||`<span class="small faint">${T('还没有选择文件','No files yet')}</span>`;
document.addEventListener('change',e=>{if(e.target.id!=='tpMf'||!TPR)return;TPR.nf=(TPR.nf||[]).concat(Array.from(e.target.files));e.target.value='';const L=$('#tpMfList');L&&(L.innerHTML=tpMfChips(TPR))});
document.addEventListener('click',e=>{const b=e.target.closest('[data-tpmf]');if(!b||!TPR)return;const [w,i]=b.dataset.tpmf.split(':');(w==='o'?TPR.files:TPR.nf).splice(+i,1);const L=$('#tpMfList');L&&(L.innerHTML=tpMfChips(TPR))});
function tpReqForm(){
  const D=TPR,ed=!!D.id;
  return `<form class="card form tp-form" id="tpReqForm" novalidate><div class="card-h"><h2>${ed?T('补充并重新提交议题','Add detail and resubmit'):T('提出议题','Raise a topic')}</h2><span class="sp"></span><button type="button" class="btn sm ghost" data-tp="close">${T('取消','Cancel')}</button></div>
  <div class="card-b form">
    <div class="note info small">${T('提交后由 ALSA 秘书处审核，并根据所有参与人的空闲时间安排会议；会议邀请会发到每位参与人的邮箱。','The ALSA Secretariat reviews it and schedules the meeting around everyone\'s free time; the invitation then goes to every invitee by email.')}</div>
    <div class="sec-t"><span class="n">1</span>${T('议题','Topic')}</div>
    <div class="fgrid">
      <div class="f full"><label>${T('议题名称','Topic')}${req}</label><input type="text" name="title" data-tpr="title" value="${esc(D.title)}" maxlength="120" placeholder="${T('例如：意大利渠道升级——经销商网络分级','e.g. Italy channel upgrade: tiered dealer network')}" required></div>
      <div class="f"><label>L1 ${T('战略方向','strategic pillar')}${req}</label><select name="l1" data-tpr="l1" required><option value="">${T('请选择','Choose')}</option>${TP_L1.map(([c,n])=>`<option value="${c}" ${D.l1===c?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="f"><label>L2 ${T('子议题','sub-topic')}${req}</label><input type="text" name="l2" data-tpr="l2" value="${esc(D.l2)}" maxlength="80" placeholder="${T('手动填写，例如：授权服务网络分级','Type it, e.g. tiered authorised network')}" required></div>
      <div class="f full"><span class="lbl">${T('期望会议时长','Meeting length needed')}</span><div class="seg" id="tpReqDur" role="group" aria-label="${T('期望会议时长','Meeting length')}">${tpDurHTML(D.k,'rdur')}</div></div>
    </div>
    <div class="sec-t"><span class="n">2</span>${T('详情','Details')}</div>
    <div class="form" style="gap:14px">
      <div class="f"><label>1. ${T('项目背景','Background')}${req}</label><textarea name="bg" data-tpr="bg" placeholder="${T('现状、要解决的问题、为什么现在提','Where things stand, the problem, why now')}" required>${esc(D.bg)}</textarea></div>
      <div class="f"><label>2. ${T('前期调研','Prior research')}${req}</label><textarea name="research" data-tpr="research" placeholder="${T('已经收集的数据、对标、试点或访谈结果','Data gathered, benchmarks, pilots or interviews so far')}" required>${esc(D.research)}</textarea></div>
      <div class="f"><label>3. ${T('想要讨论的问题','Questions to discuss')}${req}</label><textarea name="questions" data-tpr="questions" placeholder="${T('希望会上决定或讨论的问题，可逐条列出','What you want decided or discussed; one per line is fine')}" required>${esc(D.questions)}</textarea></div>
      <div class="f"><label>4. ${T('会议资料（可选，任意格式，可上传多个）','Meeting materials (optional, any format, several files)')}</label><div class="row"><label class="btn" for="tpMf" style="cursor:pointer">${ico('apply')}${T('选择文件（可多选）','Choose files (several at once)')}</label><input type="file" id="tpMf" multiple hidden><span class="small faint">${T('可以一次选多个，也可以分几次添加；PPT、PDF、Excel、图片等','Pick several at once or add more later; PPT, PDF, Excel, images…')}</span></div><div class="row" id="tpMfList">${tpMfChips(D)}</div></div>
    </div>
    <div class="sec-t"><span class="n">3</span>${T('参与人','Invitees')}</div>
    <div class="tp-inv">${tpCoreHTML(D.owner)}
      <div class="tp-grp"><div class="tp-grp-h">${T('其他同事','Other colleagues')} <span class="tp-grp-n">${T('输入邮箱邀请，可添加多位','Invite by email; add as many as needed')}</span></div>
        <div class="tp-add"><input type="email" id="tpReqEmail" placeholder="name@byd.com" aria-label="${T('同事邮箱','Colleague email')}" autocomplete="off"><button type="button" class="btn sm" data-tp="raddExt">${ico('apply')}${T('添加','Add')}</button></div>
        <div class="tp-chips" id="tpReqExt">${tpExtHTML(D.ext,'rdelExt')}</div></div></div>
    <div class="sec-t"><span class="n">4</span>${T('时间偏好','Timing')} <span class="small faint">${T('可选','optional')}</span></div>
    <div class="f"><input type="text" name="pref" data-tpr="pref" value="${esc(D.pref)}" maxlength="120" placeholder="${T('例如：希望在 11 月第三周之前；周五下午不方便','e.g. before the third week of November; not Friday afternoons')}" aria-label="${T('时间偏好','Timing preference')}"></div>
    <div id="tpReqErr"></div>
    <div class="row"><button class="btn pri" type="submit">${ico('send')}${ed?T('重新提交给秘书处','Resubmit to the Secretariat'):T('提交给 ALSA 秘书处','Submit to the ALSA Secretariat')}</button><span class="small faint">${T(`将邀请 Steering 和 Execution 全部 ${tpCore().filter(id=>id!==D.owner).length} 位成员${D.ext.length?` 和 ${D.ext.length} 位其他同事`:''}`,`Invites all ${tpCore().filter(id=>id!==D.owner).length} Steering and Execution members${D.ext.length?` and ${D.ext.length} other colleagues`:''}`)}</span></div>
  </div></form>`;
}
async function tpReqSubmit(f){
  const D=TPR;['title','l2','bg','research','questions','pref'].forEach(k=>D[k]=f.elements[k].value);D.l1=f.elements.l1.value;
  const need=[['title',T('议题名称','topic')],['l1','L1'],['l2','L2'],['bg',T('项目背景','background')],['research',T('前期调研','prior research')],['questions',T('想要讨论的问题','questions')]].filter(([k])=>!String(D[k]||'').trim());
  if(need.length){$('#tpReqErr').innerHTML=`<div class="note bad small">${T('请填写：','Please fill in: ')}${need.map(x=>esc(x[1])).join(T('、',', '))}</div>`;flagField(f.elements[need[0][0]]);toast(T('还有必填项没有填写','Some required fields are empty'),'warn');return}
  const pending=($('#tpReqEmail')||{}).value;if(pending&&pending.trim()){if(!tpAddExt(D.ext,pending,'#tpReqEmail'))return}
  let files=[...(D.files||[])];try{if((D.nf||[]).length)files=files.concat(await readFiles(D.nf,'alsa-topic'))}catch(err){toast(err&&err.code==='too_big'?tooBigMsg():T('附件读取失败，请重新选择文件','Could not read the attachment; choose the file again'),'err');return}
  const now=nowStamp(),secN=TP_SEC().map(userName);let t;
  if(D.id){t=tpList().find(x=>x.id===D.id);Object.assign(t,{title:D.title.trim(),l1:D.l1,l2:D.l2.trim(),k:D.k,bg:D.bg.trim(),research:D.research.trim(),questions:D.questions.trim(),pref:D.pref.trim(),ext:[...D.ext],files,status:'pending',at:now});
    t.history.push({at:now,by:me().name,text:T('补充后重新提交给秘书处','Added detail and resubmitted')})}
  else{t={id:'t'+uid(),by:D.owner,title:D.title.trim(),l1:D.l1,l2:D.l2.trim(),k:D.k,bg:D.bg.trim(),research:D.research.trim(),questions:D.questions.trim(),pref:D.pref.trim(),ext:[...D.ext],files,status:'pending',at:now,d:null,s:null,place:'',rsvp:{},history:[{at:now,by:me().name,text:T('提出议题，提交 ALSA 秘书处','Raised the topic; sent to the ALSA Secretariat')}]};tpList().unshift(t)}
  sendMail({to:secN,cc:[userName(t.by)],subject:`[${D.id?T('ALSA 议题重新提交','ALSA topic resubmitted'):T('ALSA 议题申请','ALSA topic request')}] ${t.title}`,body:`${T('秘书处好','Dear Secretariat')}${CO()}\n\n${T(`${userName(t.by)} ${D.id?'补充后重新提交了':'提出了'}一个 ALSA 议题，请审核并安排会议时间。`,`${userName(t.by)} ${D.id?'resubmitted':'raised'} an ALSA topic. Please review it and schedule the meeting.`)}\n\n${tpText(t)}\n\n${T('请登录系统「ALSA 战略项目 → ALSA 议题与会议」处理：安排时间、退回补充或不予安排。','Please handle it under ALSA projects → ALSA topics & meetings: schedule it, send it back for detail, or decline it.')}${sig()}`,rule:'manual',ref:'atm'+t.id});
  TPR=null;S.filters.tpForm=null;S.filters.tpf='up';save();render();const sec=$('#tpSec');sec&&sec.scrollIntoView({block:'start',behavior:'smooth'});
  toast(T('已提交给 ALSA 秘书处，安排好时间后会发会议邀请','Sent to the ALSA Secretariat; the invitation follows once it is scheduled'));
}
function tpAddExt(L,v,sel){
  const parts=String(v||'').split(/[\s,;，；]+/).map(x=>x.trim()).filter(Boolean);if(!parts.length)return true;
  const bad=parts.filter(x=>!tpEmailOk(x));if(bad.length){toast(T(`邮箱格式不对：${bad.join('、')}`,`Not an email address: ${bad.join(', ')}`),'warn');flagField($(sel));return false}
  const known=parts.filter(x=>S.users.some(u=>(u.email||'').toLowerCase()===x.toLowerCase()&&tpCore().includes(u.id)));
  parts.filter(x=>!known.includes(x)).forEach(x=>{if(!L.some(y=>y.toLowerCase()===x.toLowerCase()))L.push(x)});
  if(known.length)toast(T('Steering / Execution 成员已自动邀请，无需再加','Steering / Execution members are already invited'),'info');
  const i=$(sel);if(i)i.value='';return true;
}
// the topic as plain text (emails)
function tpText(t){
  return `${T('议题','Topic')}${CO()}${t.title}\nL1${CO()}${tpL1N(t.l1)}\nL2${CO()}${t.l2}\n${T('发起人','Raised by')}${CO()}${userName(t.by)}\n${T('期望时长','Length')}${CO()}${t.k*30} ${T('分钟','min')}${t.pref?`\n${T('时间偏好','Timing')}${CO()}${t.pref}`:''}\n\n1. ${T('项目背景','Background')}\n${t.bg}\n\n2. ${T('前期调研','Prior research')}\n${t.research}\n\n3. ${T('想要讨论的问题','Questions to discuss')}\n${t.questions}\n\n${(t.files||[]).length?`${T('会议资料','Materials')}${CO()}${t.files.map(f=>f.name).join('; ')}\n\n`:''}${T('参与人','Invitees')}${CO()}Steering + Execution ${T(`全部 ${tpInvOf(t).length} 人`,`all ${tpInvOf(t).length}`)}${(t.ext||[]).length?`；${T('其他同事','others')}${CO()}${t.ext.join(', ')}`:''}`;
}

/* ---- the Secretariat's scheduling form ---- */
function tpNewSched(t){const i=t.d?tpDays().indexOf(t.d):-1;TPD={id:t.id,owner:me().id,k:t.k,ext:[...(t.ext||[])],d:t.status==='scheduled'?t.d:null,s:t.status==='scheduled'?t.s:null,place:t.place||'Microsoft Teams',wk:i<0?0:Math.min(3,Math.floor(i/5)),re:t.status==='scheduled'}}
function tpGrid(){
  const D=TPD,t=tpList().find(x=>x.id===D.id),ppl=tpAtt(t),N=ppl.length,days=tpDays().slice(D.wk*5,D.wk*5+5),k=D.k;
  let h=`<table class="tp-grid"><thead><tr><th class="tm"></th>${days.map(d=>`<th>${esc(fdW(d))}</th>`).join('')}</tr></thead><tbody>`;
  for(let i=0;i<TP_N;i++){
    h+=`<tr><th class="tm">${i%2?'':tpT(i)}</th>`;
    for(const d of days){
      if(i+k>TP_N){h+=`<td><button type="button" class="tp-c" disabled tabindex="-1" aria-hidden="true"></button></td>`;continue}
      const busy=ppl.map(id=>[id,tpBusyR(id,d,i,k,D.id)]).filter(x=>x[1]);const free=N-busy.length;
      const cls=free===N?'f-all':free===0?'f-none':free/N>=.7?'f-most':'f-few';
      const on=D.d===d&&D.s===i,inr=D.d===d&&i>D.s&&i<D.s+k;
      const tip=`${fdW(d)} ${tpT(i)}–${tpT(i+k)}\n${T('有空','Free')} ${free}/${N}${busy.length?`\n${T('没空','Busy')}${CO()}${busy.map(([id])=>tpShort(id)).join(T('、',', '))}`:''}`;
      h+=`<td><button type="button" class="tp-c ${cls}${busy.some(x=>x[0]===t.by)?' me-busy':''}${on?' on':''}${inr?' in':''}" data-tp="slot" data-d="${d}" data-s="${i}" data-tip="${esc(tip)}" aria-label="${esc(tip.replace(/\n/g,' · '))}" aria-pressed="${on}">${free===N?ico('ok'):`${free}/${N}`}</button></td>`;
    }
    h+='</tr>';
  }
  return h+'</tbody></table>';
}
function tpSelHTML(){
  const D=TPD,t=tpList().find(x=>x.id===D.id);if(!D.d)return `<div class="note small">${T('在上方表格里点一个时间段。深绿色 = 所有参与人都有空；数字 = 有空人数 / 总人数。','Pick a slot in the grid. Dark green = everyone is free; numbers = free / invited.')}</div>`;
  const ppl=tpAtt(t);const busy=ppl.map(id=>[id,tpBusyR(id,D.d,D.s,D.k,D.id)]).filter(x=>x[1]);
  return `<div class="note ${busy.length?'warn':'info'} small"><b>${esc(fdW(D.d))} ${tpT(D.s)}–${tpT(D.s+D.k)} CET</b> · ${T('有空','Free')} ${ppl.length-busy.length}/${ppl.length}${busy.length?`<br>${T('时间冲突','Conflicts')}${CO()}${busy.map(([id,r])=>`${esc(userName(id))}${PAR(esc(r))}`).join(T('、',', '))}<br><span class="faint">${T('仍可发送；有冲突的人可以拒绝并留言建议其他时间。','You can still send; people with a conflict can decline and suggest another time.')}</span>`:` · ${T('所有人都有空','everyone is free')}`}${D.ext.length?`<br><span class="faint">${T(`另有 ${D.ext.length} 位其他同事（邮箱邀请，系统看不到他们的日历）`,`Plus ${D.ext.length} colleagues invited by email (no calendar visible here)`)}</span>`:''}</div>`;
}
function tpWkHTML(){const days=tpDays(),w=TPD.wk,p=days.slice(w*5,w*5+5);return `<button type="button" class="btn sm icon-btn" data-tp="wk" data-k="-1" ${w?'':'disabled'} aria-label="${T('上一周','Previous week')}">${ico('chevL')}</button><span class="small num" style="min-width:96px;text-align:center"><b>${md(p[0])} – ${md(p[p.length-1])}</b></span><button type="button" class="btn sm icon-btn" data-tp="wk" data-k="1" ${w<3?'':'disabled'} aria-label="${T('下一周','Next week')}">${ico('chevR')}</button>`}
function tpPaint(){const set=(s,h)=>{const el=$(s);if(el)el.innerHTML=h};set('#tpGridW',tpGrid());set('#tpSel',tpSelHTML());set('#tpWk',tpWkHTML());set('#tpDur',tpDurHTML(TPD.k,'dur'));set('#tpSchedExt',tpExtHTML(TPD.ext,'delExt'));enhance(document)}
function tpSchedForm(){
  const D=TPD,t=tpList().find(x=>x.id===D.id);
  return `<form class="card form tp-form" id="tpForm" novalidate><div class="card-h"><h2>${D.re?T('改期','Reschedule'):T('安排会议','Schedule the meeting')}${CO()}${esc(t.title)}</h2><span class="sp"></span><button type="button" class="btn sm ghost" data-tp="close">${T('取消','Cancel')}</button></div>
  <div class="card-b form">
    <div class="small muted">${esc(tpL1N(t.l1))} · ${esc(t.l2)} · ${T('发起人','Raised by')} ${esc(userName(t.by))} · ${T('期望','asked for')} ${t.k*30} ${T('分钟','min')}${t.pref?` · ${T('时间偏好','timing')}${CO()}${esc(t.pref)}`:''}</div>
    <div class="fgrid">
      <div class="f"><span class="lbl">${T('会议时长','Length')}</span><div class="seg" id="tpDur" role="group" aria-label="${T('会议时长','Length')}">${tpDurHTML(D.k,'dur')}</div></div>
      <div class="f"><label>${T('地点 / 会议链接','Location / meeting link')}</label><input type="text" name="place" data-tpf="place" value="${esc(D.place)}"></div>
    </div>
    <div class="f"><span class="lbl">${T('其他同事（邮箱）','Other colleagues (email)')}</span><div class="tp-add"><input type="email" id="tpSchedEmail" placeholder="name@byd.com" aria-label="${T('同事邮箱','Colleague email')}"><button type="button" class="btn sm" data-tp="addExt">${ico('apply')}${T('添加','Add')}</button></div><div class="tp-chips" id="tpSchedExt">${tpExtHTML(D.ext,'delExt')}</div></div>
    <div class="row tp-bar"><div class="row" id="tpWk" style="gap:6px">${tpWkHTML()}</div><button type="button" class="btn sm" data-tp="best">${ico('search')}${T('找最早所有人都有空的时间','First time everyone is free')}</button><span class="sp" style="flex:1"></span>
      <span class="legend"><span><i class="tp-lg f-all"></i>${T('全员有空','All free')}</span><span><i class="tp-lg f-most"></i>${T('多数有空','Most free')}</span><span><i class="tp-lg f-few"></i>${T('少数有空','Few free')}</span><span><i class="tp-lg me-busy"></i>${T('发起人没空','Requester busy')}</span></span></div>
    <div class="small faint">${T(`按发起人和 Steering、Execution 全部 ${tpAtt(t).length - 1} 位成员的空闲计算（CET，工作日 09:00–18:00）`,`Free time of the requester and all ${tpAtt(t).length - 1} Steering and Execution members (CET, weekdays 09:00–18:00)`)}</div>
    <div class="tw tp-gw" id="tpGridW">${tpGrid()}</div>
    <div id="tpSel">${tpSelHTML()}</div>
    <div class="note small">${IS_DEMO()?T('演示环境：忙闲来自模拟日历和本系统已约的 ALSA 会议。上线后读取 Outlook / Exchange 忙闲，并发出标准日历邀请（.ics）。','Demo: free/busy is simulated plus ALSA meetings booked here. In production it reads Outlook / Exchange and sends a standard calendar invite (.ics).'):T('这里只检查本系统已约的 ALSA 会议是否冲突，个人日历（Outlook）的忙闲不会读取，请自行确认。','Only ALSA meetings booked in this system are checked for clashes. Personal Outlook calendars are not read; please check them yourself.')}</div>
    <div id="tpErr"></div>
    <div class="row"><button class="btn pri" type="submit">${ico('mail')}${D.re?T('发送改期邀请','Send the new time'):T('发送会议邀请','Send the invitation')}</button><span class="small faint">${T(`邀请发到 ${tpAtt(t).length + D.ext.length} 人的邮箱；回复会汇总在这个议题下，每个回复也会邮件通知秘书处。`,`Goes to ${tpAtt(t).length + D.ext.length} people by email; replies collect under this topic and each one is emailed to the Secretariat.`)}</span></div>
  </div></form>`;
}
function tpBody(t,lead){
  return `${T('各位好','Hello')}${CO()}\n\n${lead}\n\n${T('时间','When')}${CO()}${tpWhen(t)}${PAR(`${t.k*30} ${T('分钟','min')}`)}\n${T('地点 / 会议链接','Location / link')}${CO()}${t.place||'—'}\n${T('组织','Organised by')}${CO()}ALSA Secretariat\n\n${tpText(t)}\n\n${T('请在邮件中点「接受」或「拒绝」，或登录系统「ALSA 战略项目 → ALSA 议题与会议」回复；拒绝时可以留言建议其他时间。系统外的同事请直接回复本邮件给秘书处。','Please accept or decline from this email, or under ALSA projects → ALSA topics & meetings; if you decline you can suggest another time. Colleagues outside the system, please reply to the Secretariat by email.')}${sig()}`;
}
const tpTo=t=>[...tpInvOf(t).map(userName),userName(t.by),...(t.ext||[]).map(e=>({n:e,e}))];
function tpSchedSubmit(f){
  const D=TPD;D.place=f.elements.place.value;const t=tpList().find(x=>x.id===D.id);
  const pending=($('#tpSchedEmail')||{}).value;if(pending&&pending.trim()){if(!tpAddExt(D.ext,pending,'#tpSchedEmail'))return}
  if(!D.d){$('#tpErr').innerHTML=`<div class="note bad small">${T('请在表格里选一个会议时间','Pick a time in the grid')}</div>`;toast(T('请先选会议时间','Pick a time first'),'warn');return}
  const re=t.status==='scheduled',old=tpWhen(t),timeCh=!re||t.d!==D.d||t.s!==D.s||t.k!==D.k,added=D.ext.filter(e=>!(t.ext||[]).includes(e));
  Object.assign(t,{d:D.d,s:D.s,k:D.k,place:D.place.trim(),ext:[...D.ext],status:'scheduled',sec:{by:me().id,at:nowStamp()}});
  if(timeCh)t.rsvp={};
  t.history.push({at:nowStamp(),by:me().name,text:re?(timeCh?T(`秘书处改期：${old} → ${tpWhen(t)}`,`Secretariat moved it: ${old} → ${tpWhen(t)}`):T('秘书处更新了会议信息','Secretariat updated the details')):T(`秘书处安排会议：${tpWhen(t)}，邀请 ${tpAtt(t).length+t.ext.length} 人`,`Secretariat scheduled it: ${tpWhen(t)}, ${tpAtt(t).length+t.ext.length} invited`)});
  const sub=`${t.title} · ${md(t.d)} ${tpT(t.s)}`;
  if(timeCh){sendMail({to:tpTo(t),cc:TP_SEC().map(userName),subject:`[${re?T('ALSA 会议改期','ALSA meeting moved'):T('ALSA 会议邀请','ALSA meeting invitation')}] ${sub}`,body:tpBody(t,re?T(`会议改到了新的时间（原来是 ${old}），请重新回复。`,`The meeting moved (it was ${old}); please reply again.`):T(`ALSA 秘书处为 ${userName(t.by)} 提出的议题安排了会议，邀请您参加：`,`The ALSA Secretariat has scheduled ${userName(t.by)}'s topic and invites you:`)),rule:'manual',ref:'atm'+t.id});S.mails[0].tpk='inv'}
  else{if(added.length){sendMail({to:added.map(e=>({n:e,e})),cc:TP_SEC().map(userName),subject:`[${T('ALSA 会议邀请','ALSA meeting invitation')}] ${sub}`,body:tpBody(t,T('ALSA 秘书处邀请您参加以下会议：','The ALSA Secretariat invites you to this meeting:')),rule:'manual',ref:'atm'+t.id})}
    sendMail({to:tpTo(t).filter(x=>typeof x==='string'||!added.includes(x.e)),cc:TP_SEC().map(userName),subject:`[${T('ALSA 会议更新','ALSA meeting updated')}] ${sub}`,body:tpBody(t,T('会议信息有更新，时间不变，您之前的回复仍然有效。','The details changed; the time is the same and your reply stands.')),rule:'manual',ref:'atm'+t.id})}
  TPD=null;S.filters.tpForm=null;S.filters.tpf='up';save();render();const sec=$('#tpSec');sec&&sec.scrollIntoView({block:'start',behavior:'smooth'});
  toast(T(`会议邀请已发到 ${tpAtt(t).length+t.ext.length} 人的邮箱`,`Invitation emailed to ${tpAtt(t).length+t.ext.length} people`));
}
function tpRsvp(id,v,who){
  const t=tpList().find(x=>x.id===id);if(!t||t.status!=='scheduled'||tpPast(t))return;
  const m=who||me().id;const ext=m.startsWith('ext:');if(!ext&&!tpInvOf(t).includes(m))return;if(ext&&!tpIsSec())return;
  const note=(($('#tpn-'+(ext?id+'-'+m.slice(4).replace(/[^a-z0-9]/gi,''):id))||{}).value||'').trim();const was=t.rsvp[m];
  t.rsvp[m]={v,at:nowStamp(),note,by:ext?me().name:undefined};
  const nm=ext?m.slice(4):me().name;
  t.history.push({at:nowStamp(),by:me().name,text:(ext?T(`代 ${nm} 登记：`,`Recorded for ${nm}: `):'')+(v==='yes'?T('接受邀请','Accepted'):T('拒绝邀请','Declined'))+(note?`${CO()}${note}`:'')});
  const c=tpTally(t);
  if(!ext)sendMail({to:TP_SEC().map(userName),cc:[userName(t.by)],subject:`[${v==='yes'?T('已接受','Accepted'):T('已拒绝','Declined')}] ${t.title} · ${md(t.d)} ${tpT(t.s)} · ${me().name}`,
    body:`${me().name} ${was?T('修改了回复：','changed the reply to: '):''}${v==='yes'?T('接受了会议邀请。','accepted the invitation.'):T('拒绝了会议邀请。','declined the invitation.')}${note?`\n${T('留言','Note')}${CO()}${note}`:''}\n\n${T('议题','Topic')}${CO()}${t.title}\n${T('时间','When')}${CO()}${tpWhen(t)}\n\n${T(`目前：接受 ${c.yes} · 拒绝 ${c.no} · 未回复 ${c.pend}`,`So far: ${c.yes} accepted · ${c.no} declined · ${c.pend} no reply`)}${c.pend?'':`\n${T('所有参与人都已回复。','Everyone has replied.')}`}${sig()}`,rule:'manual',ref:'atm'+t.id});
  save();render();toast(ext?T('已登记','Recorded'):v==='yes'?T('已接受，已通知秘书处','Accepted; the Secretariat was told'):T('已拒绝，已通知秘书处','Declined; the Secretariat was told'));
}
// replies: every invitee in the system + each external email
function tpTally(t){const keys=[...tpInvOf(t),...(t.ext||[]).map(e=>'ext:'+e)];const yes=keys.filter(k=>t.rsvp[k]&&t.rsvp[k].v==='yes').length,no=keys.filter(k=>t.rsvp[k]&&t.rsvp[k].v==='no').length;return {keys,yes,no,pend:keys.length-yes-no}}

/* ---- cards ---- */
function tpCard(t){
  const m=me().id,st=tpStage(t),S0=TP_ST[st],sec=tpIsSec(),req0=t.by===m,inv=t.status==='scheduled'&&tpInvOf(t).includes(m),r=t.rsvp[m],up=t.status==='scheduled'&&!tpPast(t);
  const c=tpTally(t);
  const chip=k=>{const ext=k.startsWith('ext:'),v=k===t.by?{v:'yes'}:t.rsvp[k],nm=ext?k.slice(4):userName(k);return `<span class="vchip ${v?v.v:''}" data-tip="${esc(nm)}\n${k===t.by?T('发起人','Requester'):v?`${v.v==='yes'?T('已接受','Accepted'):T('已拒绝','Declined')} · ${v.at}${v.by?' · '+T('秘书处代登记','recorded by the Secretariat'):''}${v.note?'\n'+v.note:''}`:T('未回复','No reply yet')}">${ico(v?(v.v==='yes'?'ok':'x'):'clock')}${esc(ext?nm:tpShort(k))}${k===t.by?` <span class="faint">${T('发起','req.')}</span>`:''}${ext?` <span class="faint">${T('外部','ext.')}</span>`:''}</span>`};
  const notes=c.keys.filter(k=>t.rsvp[k]&&t.rsvp[k].note);
  const open=(inv&&!r&&up)||(sec&&t.status==='pending')||(req0&&t.status==='returned')||TPOPEN.has(t.id)||TPCX===t.id;
  const extIds=(t.ext||[]).map(e=>[e,e.replace(/[^a-z0-9]/gi,'')]);
  return `<details class="req tp-card" data-tpid="${t.id}" ${open?'open':''}><summary class="req-h" style="cursor:pointer;list-style:none">
    <span class="tp-when ${t.d?'':'tbd'}">${t.d?`<small>${esc(fdW(t.d))}</small><b class="num">${tpT(t.s)}</b>`:`<small>${T('时间','Time')}</small><b>${T('待定','TBD')}</b>`}</span>
    <span style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:3px"><b>${esc(t.title)}</b><span class="small faint"><span class="tag tp-l1">${esc((TP_L1.find(l=>l[0]===t.l1)||[])[1]||'—')}</span> ${esc(t.l2||'')} · ${esc(userName(t.by))}${t.example?` · ${T('示例','example')}`:''}</span></span>
    <span class="pill ${S0.c}">${esc(T(S0.zh,S0.en))}${t.status==='scheduled'&&up&&c.pend?` · ${T(`待回复 ${c.pend}`,`${c.pend} to reply`)}`:''}</span>${inv&&r&&up?`<span class="vchip ${r.v}">${ico(r.v==='yes'?'ok':'x')}${r.v==='yes'?T('我已接受','I accepted'):T('我已拒绝','I declined')}</span>`:''}</summary>
  <div class="req-b">
    <dl class="kv">
      <dt>L1</dt><dd>${esc(tpL1N(t.l1))}</dd><dt>L2</dt><dd>${esc(t.l2||'—')}</dd>
      <dt>${T('发起人','Raised by')}</dt><dd>${esc(userName(t.by))} <span class="small faint">${esc(t.at)}</span></dd>
      <dt>${T('时间','When')}</dt><dd class="num">${esc(tpWhen(t))}${PAR(`${t.k*30} ${T('分钟','min')}`)}${!t.d&&t.pref?`<div class="small faint">${T('时间偏好','Timing')}${CO()}${esc(t.pref)}</div>`:''}</dd>
      ${t.d?`<dt>${T('地点','Where')}</dt><dd>${esc(t.place||'—')}</dd>`:''}
      <dt>1. ${T('项目背景','Background')}</dt><dd>${esc(t.bg)}</dd>
      <dt>2. ${T('前期调研','Prior research')}</dt><dd>${esc(t.research)}</dd>
      <dt>3. ${T('想要讨论的问题','Questions')}</dt><dd>${esc(t.questions)}</dd>${(t.files||[]).length?`<dt>${T('会议资料','Materials')}</dt><dd><div class="row">${fileLinks(t.files)}</div></dd>`:''}
      <dt>${T('参与人','Invitees')}</dt><dd>Steering + Execution ${T(`全部 ${tpInvOf(t).length} 人`,`all ${tpInvOf(t).length}`)}${(t.ext||[]).length?`<div class="small">${T('其他同事','Others')}${CO()}${t.ext.map(esc).join(', ')}</div>`:''}</dd></dl>
    ${t.secNote?`<div class="note ${t.status==='rejected'?'bad':'warn'} small"><b>${T('秘书处意见','Secretariat')}</b>${CO()}${esc(t.secNote)}</div>`:''}
    ${t.status==='scheduled'?`<div class="lbl">${T('参会反馈','Replies')} <span class="faint" style="font-weight:400">${T(`接受 ${c.yes} · 拒绝 ${c.no} · 未回复 ${c.pend}`,`${c.yes} accepted · ${c.no} declined · ${c.pend} no reply`)}</span></div>
      <div class="stack" style="height:8px">${c.yes?`<i style="width:${100*c.yes/c.keys.length}%;background:var(--ok)"></i>`:''}${c.no?`<i style="width:${100*c.no/c.keys.length}%;background:var(--bad)"></i>`:''}<i style="width:${100*c.pend/c.keys.length}%;background:var(--line)"></i></div>
      <div class="row" style="gap:6px">${[t.by,...c.keys].map(chip).join('')}</div>
      ${notes.length?`<div class="form" style="gap:6px">${notes.map(k=>`<div class="note ${t.rsvp[k].v==='no'?'warn':''} small"><b>${esc(k.startsWith('ext:')?k.slice(4):userName(k))}</b>${PAR(t.rsvp[k].v==='yes'?T('接受','accepted'):T('拒绝','declined'))}${CO()}${esc(t.rsvp[k].note)}</div>`).join('')}</div>`:''}`:''}
    ${inv&&up?(r?`<div class="row"><span class="small muted">${r.v==='yes'?T('您已接受','You accepted'):T('您已拒绝','You declined')} · ${esc(r.at)}</span><button type="button" class="btn sm" data-tp="rsvp" data-id="${t.id}" data-v="${r.v==='yes'?'no':'yes'}">${r.v==='yes'?T('改为拒绝','Change to decline'):T('改为接受','Change to accept')}</button></div>`
      :`<div class="f"><label for="tpn-${t.id}">${T('留言（可选，拒绝时可以建议其他时间）','Note (optional; suggest another time if you decline)')}</label><textarea id="tpn-${t.id}" style="min-height:52px"></textarea></div><div class="row"><button type="button" class="btn pri" data-tp="rsvp" data-id="${t.id}" data-v="yes">${ico('ok')}${T('接受','Accept')}</button><button type="button" class="btn bad" data-tp="rsvp" data-id="${t.id}" data-v="no">${ico('x')}${T('拒绝','Decline')}</button></div>`):''}
    ${sec&&t.status==='pending'?`<div class="tp-secbox"><div class="lbl">${T('秘书处处理','Secretariat')}</div><div class="f"><label for="tps-${t.id}">${T('意见（退回补充或不予安排时必填，会邮件发给发起人）','Comment (required to send back or decline; emailed to the requester)')}</label><textarea id="tps-${t.id}" style="min-height:52px"></textarea></div>
      <div class="row"><button type="button" class="btn pri" data-tp="sched" data-id="${t.id}">${ico('cal')}${T('安排会议','Schedule')}</button><button type="button" class="btn" data-tp="secBack" data-id="${t.id}">${T('退回补充','Send back for detail')}</button><button type="button" class="btn bad" data-tp="secNo" data-id="${t.id}">${T('不予安排','Decline')}</button></div></div>`:''}
    ${sec&&up?`<div class="tp-secbox"><div class="lbl">${T('秘书处：收集反馈','Secretariat: replies')}</div>
      ${extIds.length?`<div class="small faint">${T('其他同事不在系统里，收到他们的邮件回复后在这里登记：','Colleagues outside the system: record their email replies here:')}</div>${extIds.map(([e,k])=>{const v=t.rsvp['ext:'+e];return `<div class="row tp-extrow"><span class="small" style="min-width:180px">${esc(e)}</span>${v?`<span class="vchip ${v.v}">${ico(v.v==='yes'?'ok':'x')}${v.v==='yes'?T('接受','Accepted'):T('拒绝','Declined')}</span>`:''}<input type="text" id="tpn-${t.id}-${k}" placeholder="${T('留言（可选）','Note (optional)')}" style="flex:1;min-width:120px;width:auto"><button type="button" class="btn sm ok" data-tp="extRsvp" data-id="${t.id}" data-e="${esc(e)}" data-v="yes">${T('登记接受','Accepted')}</button><button type="button" class="btn sm bad" data-tp="extRsvp" data-id="${t.id}" data-e="${esc(e)}" data-v="no">${T('登记拒绝','Declined')}</button></div>`}).join('')}`:''}
      <div class="row"><button type="button" class="btn" data-tp="resched" data-id="${t.id}">${ico('cal')}${T('改期 / 修改','Reschedule / edit')}</button>${c.pend?`<button type="button" class="btn" data-tp="chase" data-id="${t.id}">${ico('mail')}${T(`提醒未回复的 ${c.pend} 人`,`Remind ${c.pend} who have not replied`)}</button>`:''}<button type="button" class="btn sm" data-tp="copySum" data-id="${t.id}">${ico('copy')}${T('复制反馈汇总','Copy replies')}</button><button type="button" class="btn ghost" data-tp="cancelAsk" data-id="${t.id}">${T('取消会议','Cancel meeting')}</button></div>
      ${TPCX===t.id?`<div class="note bad tp-confirm" role="group" aria-label="${T('确认取消会议','Confirm cancellation')}"><b>${T(`确定取消这个会议吗？将给 ${c.keys.length + 1} 位参与人发送取消邮件，取消后不能恢复。`,`Cancel this meeting? ${c.keys.length + 1} people will be emailed; it cannot be undone.`)}</b><div class="f"><label for="tpc-${t.id}">${T('取消原因（可选，会写进邮件）','Reason (optional, included in the email)')}</label><textarea id="tpc-${t.id}" style="min-height:52px"></textarea></div><div class="row"><button type="button" class="btn bad" data-tp="cancel" data-id="${t.id}">${T('确认取消并通知参与人','Cancel and notify')}</button><button type="button" class="btn" data-tp="cancelNo">${T('不取消','Keep the meeting')}</button></div></div>`:''}</div>`:''}
    ${req0&&t.status==='returned'?`<div class="row"><button type="button" class="btn pri" data-tp="redo" data-id="${t.id}">${T('补充并重新提交','Add detail and resubmit')}</button><button type="button" class="btn ghost" data-tp="withdraw" data-id="${t.id}">${T('撤回','Withdraw')}</button></div>`:''}
    ${req0&&t.status==='pending'?`<div class="row"><span class="small faint">${T('秘书处正在安排，安排好后会发会议邀请。','The Secretariat is scheduling it; the invitation follows.')}</span><button type="button" class="btn ghost sm" data-tp="withdraw" data-id="${t.id}">${T('撤回','Withdraw')}</button></div>`:''}
    <div class="timeline">${[...t.history].reverse().map(h=>`<div class="tl"><span class="d">${esc(String(h.at).slice(0,10))}</span><div class="x small">${esc(h.text)} <span class="faint">${esc(h.by)}</span></div></div>`).join('')}</div>
  </div></details>`;
}
const tpOrd=(a,b)=>(a.d||'9')===(b.d||'9')?(a.s||0)-(b.s||0):(a.d||'9')<(b.d||'9')?-1:1;
function tpInboxCard(){
  const L=tpForMe().sort(tpOrd);if(!L.length)return '';
  return `<div class="card tp-inbox"><div class="card-h"><h2>${tpIsSec()?T('ALSA 议题：待我处理','ALSA topics waiting for me'):T('待我回复的 ALSA 会议 / 议题','ALSA meetings and topics waiting for me')}</h2><span class="badge">${L.length}</span><span class="sp"></span><button type="button" class="btn sm ghost" data-act="go" data-v="alsa">${T('打开 ALSA 议题与会议','Open ALSA topics & meetings')}</button></div><div class="card-b form">${L.map(tpCard).join('')}</div></div>`;
}
function tpSection(){
  const m=me().id,L=tpList().filter(tpVis);if(!tpCan()&&!tpIsSec()&&!L.length)return '';
  const f=S.filters.tpf||'up';const mine=tpForMe().sort(tpOrd);
  const rows=L.filter(t=>f==='mine'?tpMine(t):f==='past'?tpPast(t):!tpPast(t)&&!mine.includes(t)).sort(f==='past'?(a,b)=>-tpOrd(a,b):tpOrd);
  const form=S.filters.tpForm==='req'&&TPR&&TPR.owner===m?tpReqForm():S.filters.tpForm==='sched'&&TPD&&TPD.owner===m&&tpIsSec()?tpSchedForm():'';
  const live=L.filter(t=>!tpPast(t)).length;
  return `${mine.length?`<div class="card tp-inbox"><div class="card-h"><h2>${tpIsSec()?T('待秘书处处理','Waiting for the Secretariat'):T('待我处理','Waiting for me')}</h2><span class="badge">${mine.length}</span></div><div class="card-b form">${mine.map(tpCard).join('')}</div></div>`:''}
  ${form}
  <div class="card tp-sec" id="tpSec"><div class="card-h"><h2>${T('ALSA 议题与会议','ALSA topics & meetings')}</h2><span class="tag">${live}</span><span class="sp"></span>
    <div class="seg" role="group" aria-label="${T('筛选','Filter')}">${[['up',T('进行中','Open')],['mine',T('与我有关','Mine')],['past',T('已结束 / 已取消','Closed')]].map(([k,l])=>`<button type="button" data-tp="filt" data-k="${k}" class="${f===k?'on':''}">${l}</button>`).join('')}</div>
    ${form||!tpCan()?'':`<button type="button" class="btn pri sm" data-tp="new">${ico('apply')}${T('提出议题','Raise a topic')}</button>`}</div>
    <div class="card-b form">
      ${rows.map(tpCard).join('')||`<div class="empty">${f==='past'?T('还没有已结束的议题','Nothing closed yet'):T('暂无议题。有想法？点「提出议题」，写清背景、前期调研和想讨论的问题，提交给秘书处安排。','No topics yet. Have an idea? Use “Raise a topic”, describe the background, research and questions, and the Secretariat schedules it.')}</div>`}
    </div></div>`;
}
// accept / decline straight from the invitation email
function tpMailActs(m){
  if(!m||!String(m.ref||'').startsWith('atm'))return '';const t=tpList().find(x=>x.id===String(m.ref).slice(3));if(!t)return '';
  const me_=me().id;if(!tpInvOf(t).includes(me_)||m.tpk!=='inv')return '';
  if(t.status==='canceled')return `<div class="note small">${T('该会议已取消','This meeting was canceled')}</div>`;
  if(t.status!=='scheduled'||tpPast(t))return '';const r=t.rsvp[me_];
  return `<div class="tp-mailacts">${r?`<span class="small muted">${r.v==='yes'?T('您已接受','You accepted'):T('您已拒绝','You declined')} · ${esc(r.at)}</span><button type="button" class="btn sm" data-tp="rsvp" data-id="${t.id}" data-v="${r.v==='yes'?'no':'yes'}">${r.v==='yes'?T('改为拒绝','Change to decline'):T('改为接受','Change to accept')}</button>`
    :`<button type="button" class="btn pri sm" data-tp="rsvp" data-id="${t.id}" data-v="yes">${ico('ok')}${T('接受','Accept')}</button><button type="button" class="btn bad sm" data-tp="rsvp" data-id="${t.id}" data-v="no">${ico('x')}${T('拒绝','Decline')}</button><span class="small faint">${T('想留言或建议其他时间，请到 ALSA 页面回复','To add a note or suggest another time, reply on the ALSA page')}</span>`}</div>`;
}
function tpSecAct(id,kind){
  const t=tpList().find(x=>x.id===id);if(!t||t.status!=='pending'||!tpIsSec())return;const box=$('#tps-'+id),why=(box&&box.value||'').trim();
  if(!why){toast(T('请先填写意见','Add a comment first'),'warn');flagField(box);return}
  t.status=kind==='back'?'returned':'rejected';t.secNote=why;
  t.history.push({at:nowStamp(),by:me().name,text:(kind==='back'?T('秘书处退回补充：','Secretariat sent it back: '):T('秘书处不予安排：','Secretariat declined: '))+why});
  sendMail({to:[userName(t.by)],cc:TP_SEC().map(userName),subject:`[${kind==='back'?T('ALSA 议题退回补充','ALSA topic: more detail needed'):T('ALSA 议题不予安排','ALSA topic not scheduled')}] ${t.title}`,
    body:`${userName(t.by)}${T('，您好','')}${CO()}\n\n${kind==='back'?T('秘书处需要您补充以下信息后再安排会议：','The Secretariat needs more detail before scheduling:'):T('秘书处决定暂不安排这个议题，原因如下：','The Secretariat will not schedule this topic, because:')}\n${why}\n\n${T('议题','Topic')}${CO()}${t.title}${kind==='back'?`\n\n${T('请登录系统「ALSA 战略项目 → ALSA 议题与会议」补充后重新提交。','Please add the detail under ALSA projects → ALSA topics & meetings and resubmit.')}`:''}${sig()}`,rule:'manual',ref:'atm'+t.id});
  save();render();toast(kind==='back'?T('已退回发起人补充','Sent back to the requester'):T('已通知发起人不予安排','The requester was told'));
}
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-tp]');if(!el||el.matches('input'))return;const a=el.dataset.tp,id=el.dataset.id;
  if(a==='new'){if(!tpCan())return;tpNewReq();TPD=null;S.filters.tpForm='req';save();render();const f=$('#tpReqForm');f&&(f.scrollIntoView({block:'start',behavior:'smooth'}),f.elements.title.focus({preventScroll:true}));return}
  if(a==='redo'){const t=tpList().find(x=>x.id===id);tpNewReq(t);TPD=null;S.filters.tpForm='req';save();render();const f=$('#tpReqForm');f&&f.scrollIntoView({block:'start',behavior:'smooth'});return}
  if(a==='sched'||a==='resched'){if(!tpIsSec())return;const t=tpList().find(x=>x.id===id);tpNewSched(t);TPR=null;S.filters.tpForm='sched';save();render();const f=$('#tpForm');f&&f.scrollIntoView({block:'start',behavior:'smooth'});return}
  if(a==='close'){TPD=null;TPR=null;S.filters.tpForm=null;save();render();return}
  if(a==='filt'){S.filters.tpf=el.dataset.k;save();render();return}
  if(a==='rsvp'){tpRsvp(id,el.dataset.v);return}
  if(a==='extRsvp'){tpRsvp(id,el.dataset.v,'ext:'+el.dataset.e);return}
  if(a==='secBack'){tpSecAct(id,'back');return}
  if(a==='secNo'){tpSecAct(id,'no');return}
  if(a==='withdraw'){const t=tpList().find(x=>x.id===id);if(!t||t.by!==me().id)return;t.status='withdrawn';t.history.push({at:nowStamp(),by:me().name,text:T('发起人撤回','Withdrawn by the requester')});sendMail({to:TP_SEC().map(userName),subject:`[${T('ALSA 议题撤回','ALSA topic withdrawn')}] ${t.title}`,body:`${userName(t.by)} ${T('撤回了这个议题。','withdrew this topic.')}${sig()}`,rule:'manual',ref:'atm'+t.id});save();render();toast(T('已撤回','Withdrawn'));return}
  if(a==='copySum'){const t=tpList().find(x=>x.id===id),c=tpTally(t);const line=k=>{const v=t.rsvp[k],nm=k.startsWith('ext:')?k.slice(4):userName(k);return `${nm}: ${v?(v.v==='yes'?T('接受','accepted'):T('拒绝','declined'))+(v.note?` (${v.note})`:''):T('未回复','no reply')}`};
    const txt=`${t.title}\n${tpWhen(t)}\n${T(`接受 ${c.yes} · 拒绝 ${c.no} · 未回复 ${c.pend}`,`${c.yes} accepted · ${c.no} declined · ${c.pend} no reply`)}\n\n${c.keys.map(line).join('\n')}`;
    navigator.clipboard&&navigator.clipboard.writeText(txt).then(()=>toast(T('反馈汇总已复制','Replies copied')),()=>toast(T('无法复制','Could not copy'),'warn'));return}
  if(a==='cancelAsk'){TPCX=id;render();const x=$('#tpc-'+id);x&&x.focus();return}
  if(a==='cancelNo'){const id0=TPCX;TPCX=null;render();const b=$(`[data-tp=cancelAsk][data-id="${id0}"]`);b&&b.focus();return}
  if(a==='cancel'){const t=tpList().find(x=>x.id===id);if(!t||t.status!=='scheduled'||!tpIsSec())return;const why=(($('#tpc-'+id)||{}).value||'').trim();TPCX=null;
    t.status='canceled';t.history.push({at:nowStamp(),by:me().name,text:T('秘书处取消会议','Secretariat canceled the meeting')+(why?`${CO()}${why}`:'')});
    sendMail({to:tpTo(t),cc:TP_SEC().map(userName),subject:`[${T('ALSA 会议取消','ALSA meeting canceled')}] ${t.title} · ${md(t.d)} ${tpT(t.s)}`,body:`${T('各位好','Hello')}${CO()}\n\n${T('ALSA 秘书处取消了以下会议：','The ALSA Secretariat canceled this meeting:')}\n${t.title}\n${tpWhen(t)}${why?`\n\n${T('原因','Reason')}${CO()}${why}`:''}${sig()}`,rule:'manual',ref:'atm'+t.id});
    save();render();toast(T('会议已取消，已邮件通知参与人','Meeting canceled; invitees were emailed'));return}
  if(a==='chase'){const t=tpList().find(x=>x.id===id),c=tpTally(t);const pend=c.keys.filter(k=>!t.rsvp[k]);
    sendMail({to:pend.map(k=>k.startsWith('ext:')?{n:k.slice(4),e:k.slice(4)}:userName(k)),cc:TP_SEC().map(userName),subject:`[${T('请回复','Please reply')}] ${t.title} · ${md(t.d)} ${tpT(t.s)}`,body:tpBody(t,T('提醒：以下会议邀请您还没有回复。','Reminder: you have not replied to this invitation yet.')),rule:'manual',ref:'atm'+t.id});S.mails[0].tpk='inv';
    t.history.push({at:nowStamp(),by:me().name,text:T(`提醒未回复的 ${pend.length} 人`,`Reminded ${pend.length} who had not replied`)});save();render();toast(T(`已提醒 ${pend.length} 人`,`Reminded ${pend.length}`));return}
  // request form
  if(TPR&&a==='rdur'){TPR.k=+el.dataset.k;const s=$('#tpReqDur');if(s)s.innerHTML=tpDurHTML(TPR.k,'rdur');return}
  if(TPR&&a==='raddExt'){if(tpAddExt(TPR.ext,$('#tpReqEmail').value,'#tpReqEmail')){$('#tpReqExt').innerHTML=tpExtHTML(TPR.ext,'rdelExt');$('#tpReqEmail').focus()}return}
  if(TPR&&a==='rdelExt'){TPR.ext=TPR.ext.filter(x=>x!==el.dataset.e);$('#tpReqExt').innerHTML=tpExtHTML(TPR.ext,'rdelExt');return}
  if(!TPD)return;
  if(a==='addExt'){if(tpAddExt(TPD.ext,$('#tpSchedEmail').value,'#tpSchedEmail')){tpPaint();$('#tpSchedEmail').focus()}return}
  if(a==='delExt'){TPD.ext=TPD.ext.filter(x=>x!==el.dataset.e);tpPaint();return}
  if(a==='slot'){TPD.d=el.dataset.d;TPD.s=+el.dataset.s;tpPaint();const b=$(`.tp-c[data-d="${TPD.d}"][data-s="${TPD.s}"]`);b&&b.focus();$('#tpErr').innerHTML='';return}
  if(a==='dur'){TPD.k=+el.dataset.k;if(TPD.d&&TPD.s+TPD.k>TP_N)TPD.d=null;tpPaint();return}
  if(a==='wk'){TPD.wk=Math.max(0,Math.min(3,TPD.wk+ +el.dataset.k));tpPaint();return}
  if(a==='best'){const t=tpList().find(x=>x.id===TPD.id),ppl=tpAtt(t),days=tpDays();
    for(let di=0;di<days.length;di++)for(let i=0;i+TPD.k<=TP_N;i++)if(ppl.every(p=>!tpBusyR(p,days[di],i,TPD.k,TPD.id))){TPD.d=days[di];TPD.s=i;TPD.wk=Math.floor(di/5);tpPaint();toast(T(`找到了：${fdW(TPD.d)} ${tpT(i)}，所有人都有空`,`Found: ${fdW(TPD.d)} ${tpT(i)}, everyone is free`),'info');return}
    toast(T('未来 4 周没有所有人都有空的时间，请缩短时长或选冲突最少的时间','No slot in the next 4 weeks suits everyone; shorten the meeting or pick the fewest conflicts'),'warn');return}
});
document.addEventListener('keydown',e=>{if(e.key!=='Enter'||e.isComposing)return;const id=e.target&&e.target.id;if(id==='tpReqEmail'){e.preventDefault();$('[data-tp=raddExt]').click()}else if(id==='tpSchedEmail'){e.preventDefault();$('[data-tp=addExt]').click()}});
document.addEventListener('change',e=>{const el=e.target;if(TPR&&el.dataset&&el.dataset.tpr)TPR[el.dataset.tpr]=el.value;if(TPD&&el.dataset&&el.dataset.tpf)TPD[el.dataset.tpf]=el.value});
document.addEventListener('input',e=>{const el=e.target;if(TPR&&el.dataset&&el.dataset.tpr)TPR[el.dataset.tpr]=el.value;if(TPD&&el.dataset&&el.dataset.tpf)TPD[el.dataset.tpf]=el.value});
document.addEventListener('submit',e=>{if(e.target.id==='tpForm'){e.preventDefault();if(TPD)tpSchedSubmit(e.target)}else if(e.target.id==='tpReqForm'){e.preventDefault();if(TPR)tpReqSubmit(e.target)}});

/* ================= Project library: every closed project's material, packed per project =================
   The library is the knowledge base of the Playbook assistant (retrieval-augmented generation):
   1. each closed project becomes a dossier (background, scope, milestones + evidence, two-week updates, close report, history)
   2. dossiers are cut into passages and indexed in the page (BM25; English words + Chinese bigrams, both page languages)
   3. a request is expanded into bilingual search terms, the best passages go to Claude with the request,
      and Claude can search the library again or open a whole dossier through two page tools
   4. Claude answers with a playbook that cites the projects it learned from; a project draft can go straight to the request form. */
IC.book='<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7h8M8 11h6"/>';
IC.send='<path d="M4 12 20 4l-4 16-4-7z"/><path d="m12 13 8-9"/>';
IC.stop='<rect x="6" y="6" width="12" height="12" rx="2"/>';
IC.copy='<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>';
IC.dl='<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>';
IC.spark='<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>';
// the knowledge library holds projects that really closed after the close review; legacy projects closed by the one-year rule are not knowledge
const libProjects=()=>S.projects.filter(p=>p.status==='closed'&&!isStaleClosed(p));
const libPh=t=>!t||/历史项目，按原表视为已完成|视为已完成/.test(t);
const trTwo=(k,cur)=>{const x=k&&TR[k];return x?[...new Set([x.zh,x.en,cur].filter(Boolean))].join('\n'):String(cur||'')};
const libCloseReq=p=>S.requests.find(r=>r.type==='close'&&r.pid===p.id&&['approved','pending'].includes(r.status));
// one project's archive pack, as Markdown (what the export saves and what Claude reads when it opens a project)
function libDossier(p){
  const L=[`# ${p.code} · ${p.name}`,
    `- ${T('团队','Team')}${CO()}${tName(p.team)}${p.section?' · '+secName(p.section):''}${p.alsa?' · ALSA':''}`,
    `- ${T('负责人','Owner')}${CO()}${p.pic||'—'}；${T('执行人','Executors')}${CO()}${(p.exec||[]).join(T('、',', '))||'—'}`,
    `- ${T('计划','Planned')}${CO()}${p.start||'?'} → ${p.end||'?'}；${T('关闭','Closed')}${CO()}${p.closedAt||p.actual||'?'}；${T('延期次数','Extensions')}${CO()}${(p.exts||[]).length}`];
  if(oldCodes(p).length)L.push(`- ${T('原编号','Old code')}${CO()}${oldCodes(p).join(' / ')}`);
  const bg=p.bg||{};const bgL=[['background',T('背景','Background')],['why',T('为什么要做','Why')],['benefit',T('预期收益','Benefits')],['process',T('涉及流程','Processes')],['risk',T('不做的风险','Risk if not done')]].filter(([k])=>bg[k]);
  if(bgL.length)L.push('',`## ${T('立项背景','Background')}`,...bgL.map(([k,l])=>`**${l}**${CO()}${bg[k]}`));
  if(p.scope)L.push('',`## ${T('范围与目标','Scope')}`,p.scope);
  if((p.milestones||[]).length)L.push('',`## ${T('节点与交付成果','Milestones & deliverables')}`,...p.milestones.map(m=>`- [${m.done?'x':' '}] ${m.name}（${m.due||'—'}）${m.evidence&&!libPh(m.evidence.text)?`\n  ${T('成果','Evidence')}${CO()}${m.evidence.text}`:''}${m.evidence&&(m.evidence.files||[]).length?`\n  ${T('文件','Files')}${CO()}${m.evidence.files.map(f=>f.name).join('; ')}`:''}`));
  if((p.closeFiles||[]).length)L.push('',`## ${T('结项汇报材料','Close report files')}`,...p.closeFiles.map(f=>`- ${f.name}`));
  const r=libCloseReq(p);if(r&&r.data){const d=r.data;L.push('',`## ${T('结项总结','Close report')}`,...[[d.summary,T('成果总结','Summary')],[d.benefit,T('实际收益','Benefits')],[d.leftover,T('遗留事项','Leftovers')],[d.forceReason,T('未完成节点说明','Unfinished milestones')]].filter(x=>x[0]).map(([v,l])=>`**${l}**${CO()}${v}`))}
  const U=[...(p.updates||[])].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(U.length)L.push('',`## ${T('进展记录','Progress updates')}`,...U.map(u=>`### ${u.date||''}${u.by?' · '+u.by:''}\n${u.text||''}`));
  const H=(p.history||[]).filter(h=>!/迁移|migrat/i.test(h.text||''));
  if(H.length)L.push('',`## ${T('变更与审批记录','Changes & decisions')}`,...H.map(h=>`- ${String(h.at).slice(0,10)} ${h.text}（${h.by}）`));
  return L.join('\n');
}
/* ---- index: passages + BM25 ---- */
const LIB_STOP=new Set('the and for with from that this are was were have has will into per its our their not but all any can may also than then been being which when where while what who how out off over under more less each other such only both these those there they them very week weekly update updates current situation status next steps'.split(' '));
function libTok(s){
  s=String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');const out=[];
  for(let w of s.match(/[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z]/g)||[]){if(w.length<2||LIB_STOP.has(w))continue;if(w.length>4&&w.endsWith('s')&&!w.endsWith('ss'))w=w.slice(0,-1);out.push(w)}
  for(const run of s.match(/[一-鿿]+/g)||[]){if(run.length===1)out.push(run);for(let i=0;i<run.length-1;i++)out.push(run.slice(i,i+2))}
  return out;
}
let LIBX=null;
function libIndex(){
  const P=libProjects();const sig=P.map(p=>p.id+':'+(p.updates||[]).length).join('|')+S.lang;
  if(LIBX&&LIBX.sig===sig)return LIBX;
  const C=[];const add=(p,label,text,idx)=>{text=String(text||'').trim();if(!text)return;
    for(let i=0;i<text.length;i+=1100){const t=text.slice(i,i+1200);C.push({pid:p.id,code:p.code,label,text:t,tok:libTok(`${p.code} ${trTwo(p.code+'|name',p.name)} ${label} ${idx||''} ${t}`)})}};
  for(const p of P){
    const bg=p.bg||{};
    add(p,T('概况','Overview'),`${p.name}\n${tName(p.team)} · ${p.pic||''} · ${p.start||''} → ${p.closedAt||p.end||''}${(p.exts||[]).length?` · ${T('延期','extended')} ${(p.exts||[]).length}x`:''}\n${[bg.background,bg.why,bg.benefit,bg.process,bg.risk].filter(Boolean).join('\n')}\n${p.scope||''}`,trTwo(p.code+'|scope',''));
    const ms=(p.milestones||[]).map(m=>`- ${m.done?'✓':'✗'} ${m.name} (${m.due||'—'})${m.evidence&&!libPh(m.evidence.text)?': '+m.evidence.text:''}`).join('\n');
    add(p,T('节点与交付成果','Milestones'),ms,(p.milestones||[]).map(m=>trTwo(m._k,'')).join(' '));
    const r=libCloseReq(p);if(r&&r.data)add(p,T('结项总结','Close report'),[r.data.summary,r.data.benefit,r.data.leftover,r.data.forceReason].filter(Boolean).join('\n'));
    (p.updates||[]).forEach(u=>add(p,`${T('进展','Update')} ${u.date||''}`,u.text,trTwo(u._k,'')));
  }
  const N=C.length,df=new Map();let tot=0;
  C.forEach(c=>{c.tf=new Map();c.tok.forEach(w=>c.tf.set(w,(c.tf.get(w)||0)+1));c.len=c.tok.length;tot+=c.len;c.tf.forEach((_,w)=>df.set(w,(df.get(w)||0)+1));delete c.tok});
  return LIBX={sig,C,N,df,avg:tot/Math.max(1,N)};
}
// best passages for a query; at most `per` passages from one project so several projects are represented
function libSearch(q,k=12,per=3){
  const X=libIndex(),qt=[...new Set(libTok(q))];if(!qt.length)return [];
  const k1=1.3,b=.72,sc=[];
  for(const c of X.C){let s=0;for(const w of qt){const f=c.tf.get(w);if(!f)continue;const idf=Math.log(1+(X.N-X.df.get(w)+.5)/(X.df.get(w)+.5));s+=idf*f*(k1+1)/(f+k1*(1-b+b*c.len/X.avg))}if(s>0)sc.push([s,c])}
  sc.sort((a,b)=>b[0]-a[0]);const out=[],n={};
  for(const [s,c] of sc){if((n[c.pid]||0)>=per)continue;n[c.pid]=(n[c.pid]||0)+1;out.push({...c,score:s});if(out.length>=k)break}
  return out;
}
const libProjOf=pid=>S.projects.find(p=>p.id===pid);
const libByCode=code=>S.projects.find(p=>p.code===String(code||'').trim().toUpperCase());
function libPassages(L){return L.map(c=>{const p=libProjOf(c.pid);return `<passage project="${c.code}" name="${(p&&p.name||'').replace(/"/g,"'")}" team="${p?tName(p.team):''}" part="${c.label}">\n${c.text}\n</passage>`}).join('\n')}

/* ---- the Playbook assistant ---- */
let LIBC=null; // {turns:[{role,content,shown,refs,draft,err,mode}],busy,ctl}
const libChat=()=>LIBC||(LIBC={turns:(S.libChat||[]).slice(-12),busy:false,ctl:null});
let LIB_SAMPLE;const libSampleP=()=>LIB_SAMPLE||(LIB_SAMPLE=(window.claude&&window.claude.use?window.claude.use('sample'):Promise.resolve(null)).catch(()=>null));
let LIB_DL;const libDlP=()=>LIB_DL||(LIB_DL=(window.claude&&window.claude.use?window.claude.use('downloads'):Promise.resolve(null)).catch(()=>null));
let LIB_AVAIL=null; // null = checking, true / false once known
const LIB_ERR=c=>({not_granted:T('你没有允许本页面使用 Claude，资料问答助手在这次打开期间不可用；资料库仍可检索和浏览。','Claude was not allowed for this page, so the assistant is off for this visit; the library still works.'),
  rate_limited:T('请求太频繁，请稍等一会儿再试。','Too many requests; wait a moment and try again.'),
  prompt_too_large:T('这次发送的资料太多，请把问题说得更具体一点再试。','Too much material for one request; make the request more specific.'),
  session_expired:T('登录已过期，请刷新页面后再试。','Your session expired; reload the page and try again.'),
  sampling_disabled:T('你的账号当前不能在页面里使用 Claude。','Claude is not available in pages for your account.'),
  refused:T('Claude 没有回答这个请求，请换一种说法。','Claude declined this request; try rephrasing it.'),
  cancelled:T('已停止生成。','Stopped.')}[c]||T('生成没有完成，请再试一次。','The answer could not be finished; please try again.'));
function libRules(){
  return T(`你是比亚迪欧洲售后（欧美中东非售后服务中心）PMO 的资料库助手。下面是从「项目资料库」检索到的资料片段。资料库里是所有已结项并完成结项汇报的项目（立项背景、范围、节点与交付成果、双周进展、结项总结、延期与变更记录）。
用户会用自然语言提问，想找到相关的项目资料。你的任务是找到并返回他们想要的项目资料，不是写新项目的方案或 Playbook。

规则：
1. 只依据资料库内容回答。引用项目时用方括号写项目编号，例如 [EAS-2025-CCR-010]，只引用资料里真实存在的编号。
2. 资料不够时直接说“资料库里没有找到”，不要编造数字、人名或结论，也不要用通用经验凑数。
3. 需要更多资料时可以调用 search_library（中英文关键词都试一下，资料多为英文）或 get_project 读取整个项目的资料包；最多调用 4 次。
4. 用中文，Markdown 格式。先用 1–3 句话直接回答问题（找到几个相关项目、最相关的是哪个），然后：
## 相关项目
表格：编号 | 项目 | 团队 | 负责人 | 关闭时间 | 为什么相关。按相关度排序，最多 8 个。
## 要点
按项目分组，每个项目 2–4 条，只写资料里的事实：做了什么、交付了什么、遇到什么延期或问题、结论。每条标注 [编号]。
如果用户问的是某个具体项目或具体信息（例如“XX 项目最后交付了什么”），直接给出答案和出处，不必套用上面的结构。
5. 用户追问时，在之前结果的基础上回答，保持引用编号。`,
`You are the library assistant of the PMO of BYD's European aftersales organisation (Europe, Americas, Middle East & Africa After-sales Service Center). Below are passages retrieved from the "knowledge library". It holds every project that closed after its close review (background, scope, milestones and deliverables, two-week updates, close report, extensions and changes).
Users ask in plain language and want the relevant project material. Your job is to find and return what they ask for. You do not write plans for new projects or playbooks.

Rules:
1. Answer only from the library. When you draw on a project, cite its code in square brackets, e.g. [EAS-2025-CCR-010]; only cite codes that exist in the material.
2. If the library does not cover the question, say "the library has nothing on this". Never invent numbers, names or conclusions, and do not fill gaps with general practice.
3. For more material, call search_library (try English and Chinese keywords; most material is in English) or get_project to read a whole project pack; at most 4 calls.
4. Write in English, in Markdown. Start with 1–3 sentences that answer directly (how many relevant projects, which one fits best), then:
## Matching projects
A table: Code | Project | Team | Owner | Closed | Why it matches. Most relevant first, at most 8.
## Key points
Grouped by project, 2–4 points each, only facts from the material: what was done, what was delivered, which delays or problems came up, the outcome. Cite [code] on every point.
If the user asks about one specific project or one specific fact (for example "what did project X finally deliver"), just answer it with the source; the structure above is not needed.
5. On follow-up questions, answer on top of the previous result and keep the citations.`);
}
function libTools(log){
  return [
    {name:'search_library',description:'Search the closed-project library. Returns the best matching passages with their project codes. Use short keyword queries; the material is mostly English, some Chinese.',
      inputSchema:{type:'object',properties:{query:{type:'string',description:'keywords, e.g. "dealer network expansion service coverage"'}},required:['query']},
      execute:({query})=>{const L=libSearch(String(query||''),6,2);log(T(`检索：${query}`,`Searched: ${query}`),L);return L.length?libPassages(L.map(c=>({...c,text:c.text.slice(0,900)}))):'No matching passages.'}},
    {name:'get_project',description:'Read the whole archive pack of one closed project by its code, e.g. "EAS-2025-CCR-010".',
      inputSchema:{type:'object',properties:{code:{type:'string'}},required:['code']},
      execute:({code})=>{const p=libByCode(code);if(!p)throw new Error('No project with code '+code);log(T(`读取资料包：${p.code}`,`Opened pack: ${p.code}`),[{pid:p.id,code:p.code}]);return libDossier(p).slice(0,9000)}}];
}
// split the reply: the playbook shown, and the json project draft
function libSplit(text){
  const m=String(text||'').match(/```json\s*([\s\S]*?)```\s*$/)||String(text||'').match(/```json\s*([\s\S]*?)(```|$)/);
  let draft=null;if(m){try{draft=JSON.parse(m[1])}catch(e){}}
  const shown=m?text.slice(0,m.index).trimEnd():String(text||'').replace(/```json[\s\S]*$/,'').trimEnd();
  return {shown,draft};
}
async function libAsk(q){
  const C=libChat();q=String(q||'').trim();if(!q||C.busy)return;
  const mk=($('#libMkt')||{}).value||'';const qFull=mk?`${q}\n（${T('只考虑这个团队的项目','Only consider projects of')}${CO()}${tName(mk)}）`:q;
  C.turns.push({role:'user',content:qFull,shown:q,mk});
  const A={role:'assistant',content:'',shown:'',refs:[],steps:[],mode:'llm'};C.turns.push(A);C.busy=true;C.ctl=new AbortController();libPaint();
  const box=$('#libIn');if(box)box.value='';
  const sample=await libSampleP();
  // 1) search terms in both languages (quick), then the passages
  let terms=q+' '+(mk?tName(mk):'');
  if(sample){A.steps.push(T('理解需求，生成中英文检索词…','Turning the request into English and Chinese search terms…'));libPaintLast();
    try{const kw=await sample.json(`Extract search keywords to search an automotive aftersales project archive (mostly English, some Chinese) for this request. Request: """${q}"""${mk?` Market/team: ${tName(mk)}`:''}\nReturn only JSON: {"en":[up to 12 English keywords or short phrases incl. synonyms],"zh":[up to 8 Chinese keywords]}`,{modelTier:'quick',signal:C.ctl.signal});
      terms+=' '+[...(kw.en||[]),...(kw.zh||[])].join(' ');A.steps[A.steps.length-1]=T(`检索词：${[...(kw.en||[]).slice(0,6),...(kw.zh||[]).slice(0,4)].join('、')}`,`Search terms: ${[...(kw.en||[]).slice(0,6),...(kw.zh||[]).slice(0,4)].join(', ')}`)}
    catch(e){if(e&&e.code==='cancelled'){libFail(A,e);return}A.steps.pop()}}
  const hits=libSearch(terms,mk?60:14,3).filter(c=>{const p=libProjOf(c.pid);return !mk||(p&&p.team===mk)}).slice(0,14);
  A.refs=[...new Set(hits.map(c=>c.pid))];A.steps.push(T(`在资料库中找到 ${A.refs.length} 个相关项目、${hits.length} 段资料`,`Found ${hits.length} passages from ${A.refs.length} projects in the library`));libPaintLast();
  if(!sample){A.mode='search';A.hits=hits;C.busy=false;libSave();libPaint();return}
  // 2) the playbook, grounded in the passages; Claude may search again or open a pack
  const ctx=`<library projects="${libProjects().length}" today="${today()}">\n${libPassages(hits)}\n</library>`;
  // earlier exchanges that produced a playbook, as alternating user / assistant turns
  const T0=C.turns.slice(0,-2),msgs=[];
  for(let i=0;i+1<T0.length;i++){const u=T0[i],a=T0[i+1];if(u.role==='user'&&a.role==='assistant'&&a.content&&a.mode!=='search'&&(!a.err||a.err==='cancelled')){msgs.push({role:'user',content:(msgs.length?'':libRules()+'\n\n')+u.content},{role:'assistant',content:a.content});i++}}
  if(msgs.length>8)msgs.splice(0,msgs.length-8),msgs[0].content=libRules()+'\n\n'+msgs[0].content;
  const lastUser=`${msgs.length?'':libRules()+'\n\n'}${T('资料库检索结果：','Library search results:')}\n${ctx}\n\n${T('我的需求：','My request: ')}${qFull}`;
  msgs.push({role:'user',content:lastUser});
  A.steps.push(T('正在整理答案…','Putting the answer together…'));libPaintLast();
  const log=(s,L)=>{A.steps.splice(A.steps.length-1,0,s);(L||[]).forEach(c=>{if(!A.refs.includes(c.pid))A.refs.push(c.pid)});libPaintLast()};
  try{
    const {text,truncated}=await sample(msgs,{cache:false,modelTier:'default',signal:C.ctl.signal,tools:libTools(log),onText:({text})=>{A.content=text;const s=libSplit(text);A.shown=s.shown;libPaintLast(true)}});
    A.content=text;const s=libSplit(text);A.shown=s.shown;A.draft=s.draft;A.truncated=truncated;A.steps.pop();
    // keep only the cited projects that exist, cited ones first
    const cited=[...new Set((A.shown.match(/[A-Z]{3}-\d{2}-[AF]?\d{2,3}/g)||[]).map(c=>libByCode(c)).filter(Boolean).map(p=>p.id))];
    A.refs=[...cited,...A.refs.filter(x=>!cited.includes(x))];A.cited=cited;
  }catch(e){libFail(A,e);return}
  C.busy=false;C.ctl=null;libSave();libPaint();
}
function libFail(A,e){const C=libChat();A.err=e&&e.code||'error';if(e&&e.text){A.content=e.text;A.shown=libSplit(e.text).shown}A.steps=[];C.busy=false;C.ctl=null;if(A.err==='not_granted')LIB_AVAIL=false;libSave();libPaint()}
function libSave(){S.libChat=libChat().turns.filter(t=>!(t.role==='assistant'&&!t.shown&&!t.hits)).slice(-12).map(t=>({...t,hits:t.hits?t.hits.map(h=>({pid:h.pid,code:h.code,label:h.label,text:h.text})):undefined}));save()}

/* ---- Markdown (small, safe: everything escaped first) ---- */
function libInline(s){
  return esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')
    .replace(/\[?\b([A-Z]{3}-\d{2}-[AF]?\d{2,3})\b\]?/g,(m,c)=>{const p=libByCode(c);return p?`<button type="button" class="lib-ref" data-act="open" data-id="${p.id}" data-tip="${esc(p.name)}">${c}</button>`:m});
}
function libMd(src){
  const L=String(src||'').split('\n');let h='',i=0;
  const list=(re,tag)=>{let o=`<${tag}>`;while(i<L.length&&re.test(L[i])){const t=L[i].replace(re,'');const ck=t.match(/^\[( |x|X)\]\s*(.*)$/);o+=ck?`<li class="ck"><span class="cb ${ck[1]!==' '?'on':''}" aria-hidden="true"></span>${libInline(ck[2])}</li>`:`<li>${libInline(t)}</li>`;i++}return o+`</${tag}>`};
  while(i<L.length){const l=L[i];
    if(/^```/.test(l)){let c='';i++;while(i<L.length&&!/^```/.test(L[i])){c+=L[i]+'\n';i++}i++;h+=`<pre class="lib-code">${esc(c)}</pre>`;continue}
    let m=l.match(/^(#{1,4})\s+(.*)$/);if(m){const n=Math.min(4,m[1].length+1);h+=`<h${n}>${libInline(m[2])}</h${n}>`;i++;continue}
    if(/^\s*\|.*\|\s*$/.test(l)){const rows=[];while(i<L.length&&/^\s*\|.*\|\s*$/.test(L[i])){rows.push(L[i]);i++}
      const cells=r=>r.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim());const body=rows.filter(r=>!/^\s*\|[\s:|-]+\|\s*$/.test(r));
      h+=`<div class="tw"><table class="t lib-t"><thead><tr>${cells(body[0]).map(c=>`<th>${libInline(c)}</th>`).join('')}</tr></thead><tbody>${body.slice(1).map(r=>`<tr>${cells(r).map(c=>`<td>${libInline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;continue}
    if(/^\s*[-*]\s+/.test(l)){h+=list(/^\s*[-*]\s+/,'ul');continue}
    if(/^\s*\d+[.)]\s+/.test(l)){h+=list(/^\s*\d+[.)]\s+/,'ol');continue}
    if(/^>\s?/.test(l)){h+=`<blockquote>${libInline(l.replace(/^>\s?/,''))}</blockquote>`;i++;continue}
    if(/^\s*(---|\*\*\*)\s*$/.test(l)){h+='<hr>';i++;continue}
    if(!l.trim()){i++;continue}
    let p=l;i++;while(i<L.length&&L[i].trim()&&!/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+[.)]\s|>|\s*\|)/.test(L[i])){p+='\n'+L[i];i++}
    h+=`<p>${libInline(p).replace(/\n/g,'<br>')}</p>`;
  }
  return h;
}

/* ---- view ---- */
function libTabs(on){
  const exp=on==='projects'
    ?T('项目库收录所有项目，不论状态：进行中、暂停、已关闭，也包括已取消和不再推进的。已结项并完成结项汇报的项目会同时归档到「项目资料库」。','The project library holds every project whatever its status: in progress, on hold, closed, and also canceled or no longer pursued. Projects that closed after the close review are also archived in the Knowledge library.')
    :T('项目资料库只收已结项并完成结项汇报的项目，整套资料归档成知识库，可以用自然语言查询。取消或不再推进的项目不在这里，请到「项目库」查看。','The knowledge library holds only projects that closed after the close review. Their full material is archived as a knowledge base you can query in plain language. Canceled or dropped projects are not here; find them in the Project library.');
  return `<div class="seg lib-tabs" role="tablist" aria-label="${T('项目库','Projects')}"><button type="button" role="tab" aria-selected="${on==='projects'}" class="${on==='projects'?'on':''}" data-act="go" data-v="projects">${ico('lib')}${T('项目库','Project library')} <span class="tag">${viewP().length}</span></button><button type="button" role="tab" aria-selected="${on==='library'}" class="${on==='library'?'on':''}" data-act="go" data-v="library">${ico('book')}${T('项目资料库','Knowledge library')} <span class="tag">${libProjects().length}</span></button></div>
  <p class="small muted" style="margin:8px 0 12px;max-width:80ch">${exp}</p>`;
}
// archive filters: text, group, team, year closed, owner, how it closed, extensions, ALSA, milestones delivered, material, sort
const LIB_F=['lq','lgrp','lteam','lyear','lpic','lalsa','lsort'];
const libDur=p=>p.start&&(p.closedAt||p.actual)?Math.max(0,diff(p.closedAt||p.actual,p.start)):null;
const libDoneR=p=>{const m=p.milestones||[];return m.length?m.filter(x=>x.done).length/m.length:null};
function libFiltered(){
  const f=S.filters,q=(f.lq||'').trim();let score=null;
  let P=libProjects().filter(p=>(!f.lgrp||team(p.team).group===f.lgrp)&&(!f.lteam||p.team===f.lteam)&&(!f.lyear||String(yr(p.closedAt||p.actual))===f.lyear)&&(!f.lpic||norm(p.pic||'')===norm(f.lpic))
    &&(!f.lalsa||(f.lalsa==='alsa'?!!p.alsa:!p.alsa)));
  if(q){const L=libSearch(q,400,1);score=new Map();L.forEach((c,i)=>score.set(c.pid,i));const ql=q.toLowerCase();P=P.filter(p=>score.has(p.id)||(p.code+' '+p.name+' '+(p.pic||'')).toLowerCase().includes(ql))}
  const srt=f.lsort||(q?'rel':'new'),cl=p=>String(p.closedAt||p.actual||'');
  const by={rel:(a,b)=>(score&&score.has(a.id)?score.get(a.id):999)-(score&&score.has(b.id)?score.get(b.id):999),new:(a,b)=>cl(b).localeCompare(cl(a))||a.code.localeCompare(b.code),old:(a,b)=>cl(a).localeCompare(cl(b))||a.code.localeCompare(b.code),
    code:(a,b)=>a.code.localeCompare(b.code),upd:(a,b)=>(b.updates||[]).length-(a.updates||[]).length,long:(a,b)=>(libDur(b)??-1)-(libDur(a)??-1),ext:(a,b)=>(b.exts||[]).length-(a.exts||[]).length};
  P.sort(by[srt]||by.new);return {P,q,srt};
}
function libFiltersHTML(){
  const f=S.filters,A=libProjects(),o=(v,l,cur)=>`<option value="${esc(v)}" ${String(cur||'')===String(v)?'selected':''}>${esc(l)}</option>`;
  const years=[...new Set(A.map(p=>yr(p.closedAt||p.actual)).filter(Boolean))].sort().reverse();
  const pics=[...new Set(A.map(p=>p.pic).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const teams=[...new Set(A.filter(p=>!f.lgrp||team(p.team).group===f.lgrp).map(p=>p.team))];
  const sel=(id,k,label,opts)=>`<label class="lib-f"><span>${label}</span><select id="${id}" data-lf="${k}">${opts}</select></label>`;
    return `<div class="lib-fbar"><input type="search" id="libQ" placeholder="${T('搜索资料：关键词、编号、负责人…','Search the material: keywords, code, owner…')}" value="${esc(f.lq||'')}" aria-label="${T('搜索资料库','Search the library')}">
</div>
  <div class="lib-fs" id="libFs" role="group" aria-label="${T('筛选','Filters')}">
    ${sel('lfGrp','lgrp',T('区域 / 中台','Group'),o('',T('全部','All'),f.lgrp)+o('R',gName('R'),f.lgrp)+o('C',gName('C'),f.lgrp))}
    ${sel('lfTeam','lteam',T('团队','Team'),o('',T('全部团队','All teams'),f.lteam)+teamOptions(f.lteam||'',teams))}
    ${sel('lfYear','lyear',T('关闭年份','Year closed'),o('',T('全部年份','Any year'),f.lyear)+years.map(y=>o(y,y,f.lyear)).join(''))}
    ${sel('lfPic','lpic',T('负责人','Owner'),o('',T('全部负责人','Anyone'),f.lpic)+pics.map(x=>o(x,x,f.lpic)).join(''))}
    ${sel('lfAlsa','lalsa',T('项目类型','Type'),o('',T('全部','All'),f.lalsa)+o('alsa',T('ALSA 战略项目','ALSA projects'),f.lalsa)+o('std',T('常规项目','Standard projects'),f.lalsa))}
    ${sel('lfSort','lsort',T('排序','Sort'),(f.lq?o('rel',T('相关度','Relevance'),f.lsort||'rel'):'')+o('new',T('最新关闭','Newest'),f.lsort||(f.lq?'':'new'))+o('old',T('最早关闭','Oldest'),f.lsort)+o('code',T('编号','Code'),f.lsort)+o('upd',T('进展记录最多','Most updates'),f.lsort)+o('long',T('周期最长','Longest'),f.lsort)+o('ext',T('延期最多','Most extensions'),f.lsort))}
  </div>`;
}
function libListHTML(){
  const f=S.filters,{P,q,srt}=libFiltered();
  const chips=LIB_F.filter(k=>k!=='lq'&&k!=='lsort'&&f[k]).map(k=>{const el=document.querySelector(`[data-lf="${k}"]`);const lab=el?el.closest('label').querySelector('span').textContent:k;const val=el&&el.selectedOptions[0]?el.selectedOptions[0].textContent:f[k];
    return `<span class="tag lib-chip">${esc(lab)}${CO()}${esc(val)}<button type="button" class="chip-x" data-lib="fx" data-k="${k}" aria-label="${T('移除筛选','Remove filter')} ${esc(lab)}">${ico('x')}</button></span>`}).join('');
  const SL={rel:T('按相关度','by relevance'),new:T('按关闭时间','newest first'),old:T('最早关闭在前','oldest first'),code:T('按编号','by code'),upd:T('按进展数','by updates'),long:T('按周期','by length'),ext:T('按延期次数','by extensions')};
  return `<div class="lib-cnt"><span class="small faint">${T(`${P.length} / ${libProjects().length} 个项目`,`${P.length} of ${libProjects().length} projects`)} · ${SL[srt]||''}</span>${chips?`<span class="lib-chips">${chips}<button type="button" class="btn sm ghost" data-lib="fclear">${T('清除筛选','Clear filters')}</button></span>`:''}</div>
  <div class="list lib-list">${P.slice(0,200).map(p=>{const nU=(p.updates||[]).length,nM=(p.milestones||[]).length,dn=(p.milestones||[]).filter(m=>m.done).length,ex=(p.exts||[]).length;return `<div class="li" data-act="open" data-id="${p.id}"><span class="mono small faint" style="width:88px;flex:none">${p.code}</span><div class="grow"><div class="ttl">${p.alsa?'<span class="alsa-tag">ALSA</span> ':''}${esc(p.name)}</div><div class="small faint">${esc(tName(p.team))} · ${esc(p.pic||'—')} · ${T('关闭于','closed')} ${esc(p.closedAt||p.actual||'—')}</div><div class="small faint lib-meta">${T(`节点 ${dn}/${nM}`,`Milestones ${dn}/${nM}`)} · ${T(`进展 ${nU}`,`${nU} updates`)}${ex?` · <span style="color:var(--warn)">${T(`延期 ${ex} 次`,`extended ${ex}x`)}</span>`:''}${isStaleClosed(p)?` · ${T('规则关闭','stale-closed')}`:''}</div></div><button type="button" class="btn sm ghost icon-btn" data-lib="exp1" data-id="${p.id}" aria-label="${T('导出资料包','Export pack')} ${p.code}" data-tip="${T('导出资料包（.md）','Export pack (.md)')}">${ico('dl')}</button></div>`}).join('')||`<div class="empty small">${T('没有符合条件的项目','No matching projects')}${chips?`<div class="empty-a"><button type="button" class="btn sm" data-lib="fclear">${T('清除筛选','Clear filters')}</button></div>`:''}</div>`}${P.length>200?`<div class="small faint" style="padding:10px 18px">${T('只显示前 200 个，请缩小筛选范围','Showing the first 200; narrow the filters')}</div>`:''}</div>`;
}
function libPaintArch(){const w=$('#libArchB');if(!w)return;const fo=document.activeElement&&document.activeElement.id;w.innerHTML=libFiltersHTML()+`<div id="libList"></div>`;$('#libList').innerHTML=libListHTML();libBindArch();enhance(w);if(fo&&fo!=='libQ'){const el=document.getElementById(fo);el&&el.focus()}}
function libBindArch(){
  const q=$('#libQ');let tmr;
  q&&q.addEventListener('input',()=>{clearTimeout(tmr);tmr=setTimeout(()=>{const had=!!S.filters.lq;S.filters.lq=q.value;if(!q.value&&S.filters.lsort==='rel')S.filters.lsort='';save();
    if(had!==!!q.value){const pos=q.selectionStart;libPaintArch();const n=$('#libQ');n.focus();try{n.setSelectionRange(pos,pos)}catch(_){}}else{$('#libList').innerHTML=libListHTML();enhance($('#libList'))}},160)});
  $$('[data-lf]').forEach(el=>el.addEventListener('change',()=>{const k=el.dataset.lf;S.filters[k]=el.value;if(k==='lgrp'&&S.filters.lteam&&el.value&&team(S.filters.lteam).group!==el.value)S.filters.lteam='';save();libPaintArch()}));
}
function libMsgHTML(t,i){
  if(t.role==='user')return `<div class="lib-msg u"><div class="lib-b">${esc(t.shown||t.content).replace(/\n/g,'<br>')}${t.mk?`<div class="small" style="opacity:.8;margin-top:4px">${esc(T('目标市场','Market'))}${CO()}${esc(tName(t.mk))}</div>`:''}</div></div>`;
  const C=libChat(),live=C.busy&&i===C.turns.length-1;
  const refs=(t.refs||[]).map(libProjOf).filter(Boolean);
  const steps=(t.steps||[]).length&&(live||!t.shown)?`<ol class="lib-steps">${t.steps.map((s,j)=>`<li class="${live&&j===t.steps.length-1?'now':''}">${live&&j===t.steps.length-1?'<span class="lib-dot"></span>':ico('ok')}${esc(s)}</li>`).join('')}</ol>`:'';
  const body=t.mode==='search'?`<div class="note info small">${T('Playbook 助手需要在 claude.ai 里打开本页面并允许使用 Claude。下面是资料库里与你的需求最相关的资料，可以先参考。','The assistant needs this page opened in claude.ai with Claude allowed. Here is the most relevant material from the library in the meantime.')}</div>${(t.hits||[]).slice(0,8).map(h=>{const p=libProjOf(h.pid);return `<div class="lib-hit"><div class="row" style="gap:8px"><button type="button" class="lib-ref" data-act="open" data-id="${h.pid}">${h.code}</button><b class="small">${esc(p?p.name:'')}</b><span class="small faint">${esc(h.label)}</span></div><div class="small muted">${esc(h.text.slice(0,320))}${h.text.length>320?'…':''}</div></div>`}).join('')||`<div class="empty small">${T('没有找到相关资料','Nothing relevant found')}</div>`}`
    :`${t.shown?`<div class="lib-md">${libMd(t.shown)}</div>`:''}`;
  const err=t.err?`<div class="note ${t.err==='cancelled'?'':'warn'} small">${esc(LIB_ERR(t.err))}</div>`:'';
  const acts=!live&&t.shown&&t.mode!=='search'?`<div class="row lib-acts"><button type="button" class="btn sm" data-lib="copy" data-i="${i}">${ico('copy')}${T('复制','Copy')}</button><button type="button" class="btn sm" data-lib="dl" data-i="${i}">${ico('dl')}${T('下载 .md','Download .md')}</button>${t.draft?`<button type="button" class="btn sm pri" data-lib="apply" data-i="${i}">${ico('apply')}${T('据此发起项目申请','Start a project request from this')}</button>`:''}${t.truncated?`<span class="small faint">${T('内容较长被截断，可以追问「继续」','Cut short; ask “continue”')}</span>`:''}</div>`:'';
  const src=refs.length&&(t.shown||t.mode==='search')&&!live?`<div class="lib-src"><span class="small faint">${T(`参考资料（${refs.length} 个项目）`,`Sources (${refs.length} projects)`)}</span>${refs.slice(0,12).map(p=>`<button type="button" class="lib-ref ${t.cited&&t.cited.includes(p.id)?'cited':''}" data-act="open" data-id="${p.id}" data-tip="${esc(p.name)}">${p.code}</button>`).join('')}</div>`:'';
  return `<div class="lib-msg a" data-i="${i}"><span class="lib-av" aria-hidden="true">${ico('spark')}</span><div class="lib-b">${steps}${body}${live&&!t.shown?'':''}${err}${src}${acts}</div></div>`;
}
const LIB_EX=()=>[T('哪些项目做过电池维修中心？分别遇到了什么延期？','Which projects built a battery repair centre, and what delays did each hit?'),T('意大利做过哪些渠道或服务网络相关的项目？','What channel or service-network projects were run in Italy?'),T('有哪些项目是针对车队 / 租赁客户的？最后交付了什么？','Which projects targeted fleet or leasing customers, and what did they deliver?'),T('延期最多的项目有哪些，原因是什么？','Which projects were extended most often, and why?')];
function libChatInner(){
  const C=libChat();
  if(!C.turns.length)return `<div class="lib-empty"><span class="lib-empty-ic">${ico('spark')}</span><h3>${T('用自然语言查找项目资料','Ask the library in plain language')}</h3><p class="small muted">${T(`比如“哪些项目做过电池维修中心？”“意大利的渠道项目遇到过哪些延期？”助手会在 ${libProjects().length} 个已结项项目的资料里查找，返回相关项目和要点，并标明出处。它只查资料库，不会替你写新方案。`,`For example: “which projects built a battery repair centre?” or “what delays did the Italy channel projects run into?” The assistant searches the material of ${libProjects().length} closed projects and returns the matching projects and key points, with sources. It only looks things up; it does not write new plans.`)}</p>
    <div class="lib-exs">${LIB_EX().map(x=>`<button type="button" class="lib-ex" data-lib="ex">${esc(x)}</button>`).join('')}</div></div>`;
  return C.turns.map(libMsgHTML).join('');
}
function libPaint(){const m=$('#libMsgs');if(!m)return;m.innerHTML=libChatInner();libComposerState();enhance(m);m.scrollTop=m.scrollHeight}
let LIB_RAF=0;
function libPaintLast(stream){
  if(LIB_RAF)return;LIB_RAF=requestAnimationFrame(()=>{LIB_RAF=0;const m=$('#libMsgs');if(!m)return;const C=libChat(),i=C.turns.length-1;const el=m.querySelector(`.lib-msg.a[data-i="${i}"]`);
    const near=m.scrollHeight-m.scrollTop-m.clientHeight<80;
    if(el)el.outerHTML=libMsgHTML(C.turns[i],i);else{m.innerHTML=libChatInner()}
    libComposerState();if(near||!stream)m.scrollTop=m.scrollHeight});
}
function libComposerState(){const C=libChat(),b=$('#libSend');if(!b)return;b.innerHTML=C.busy?`${ico('stop')}${T('停止','Stop')}`:`${ico('send')}${T('提问','Ask')}`;b.dataset.lib=C.busy?'stop':'send';b.classList.toggle('pri',!C.busy);
  const n=$('#libNew');if(n)n.disabled=C.busy||!C.turns.length;const a=$('#libAvail');if(a)a.hidden=LIB_AVAIL!==false}
function library(){
  const P=libProjects();const nU=P.reduce((n,p)=>n+(p.updates||[]).length,0),nM=P.reduce((n,p)=>n+(p.milestones||[]).length,0);const teams=new Set(P.map(p=>p.team));
  const last=P.map(p=>p.closedAt||'').sort().pop()||'—';const C=libChat();
  return `${libTabs('library')}
  <div class="lib-hero card"><div class="lib-hero-t"><h2>${T('项目资料库','Knowledge library')}</h2><p class="small muted">${T('所有已结项项目的资料都按项目打包归档在这里：立项背景、范围与目标、节点与交付成果、双周进展、结项总结、延期与变更记录。它是一个知识库，可以在下方用自然语言查询：项目一结项并完成结项汇报，资料就自动进入资料库。','Every closed project is packed and archived here: background, scope, milestones and deliverables, two-week updates, close report, extensions and changes. It works as a knowledge base you can query in plain language below: a project joins once it is closed and the close review is done.')}</p></div>
    <dl class="lib-stats"><div><dt>${T('已归档项目','Archived projects')}</dt><dd>${P.length}</dd></div><div><dt>${T('覆盖团队','Teams')}</dt><dd>${teams.size}</dd></div></dl></div>
  <div class="grid lib-grid">
    <section class="card lib-chat" aria-labelledby="libH"><div class="card-h"><h2 id="libH">${ico('spark')} ${T('资料问答助手','Library assistant')}</h2><span class="tag">${T(`知识库：${P.length} 个已结项项目`,`Knowledge base: ${P.length} closed projects`)}</span><span class="sp"></span><button type="button" class="btn sm ghost" id="libNew" data-lib="new" ${C.busy||!C.turns.length?'disabled':''}>${ico('refresh')}${T('新对话','New chat')}</button></div>
      <div class="lib-msgs" id="libMsgs" aria-live="polite">${libChatInner()}</div>
      <form class="lib-comp" id="libForm"><div class="note warn small" id="libAvail" ${LIB_AVAIL===false?'':'hidden'}>${IS_DEMO()?T('当前无法使用 Claude（需要在 claude.ai 中打开本页并允许）。发送后会先给出资料库里最相关的资料。','Claude is not available here (open this page in claude.ai and allow it). Sending will show the most relevant library material instead.'):T('这个版本没有接入 AI 问答。提问会直接列出资料库里最相关的资料，可点开项目核对。','AI answers are not connected in this version. A question lists the most relevant library material, which you can open and check.')}</div>
        <textarea id="libIn" rows="3" placeholder="${C.turns.length?T('继续追问，例如：只看区域市场的；把这几个项目的延期原因列出来…','Follow up, e.g. only the regional markets; list the delay reasons of these projects…'):T('直接提问，例如：哪些项目做过电池维修中心？它们各自遇到了什么延期？','Just ask, e.g. which projects built a battery repair centre, and what delays did each hit?')}" aria-label="${T('你的问题','Your question')}"></textarea>
        <div class="row"><select id="libMkt" aria-label="${T('只看这个团队（可选）','Only this team (optional)')}" style="width:auto;max-width:220px"><option value="">${T('只看这个团队（可选）','Only this team (optional)')}</option>${teamOptions(S.filters.lmk||'',allTeams())}</select><span class="sp" style="flex:1"></span><span class="small faint lib-kh">${T('Enter 发送 · Shift+Enter 换行','Enter to send · Shift+Enter for a new line')}</span><button type="submit" class="btn ${C.busy?'':'pri'}" id="libSend" data-lib="${C.busy?'stop':'send'}">${C.busy?`${ico('stop')}${T('停止','Stop')}`:`${ico('send')}${T('提问','Ask')}`}</button></div>
        <div class="small faint">${T('每次提问会使用你自己的 Claude 额度；第一次使用时会请你确认。回答只来自资料库，请点开项目核对原文。','Each question uses your own Claude usage; you are asked once the first time. Answers come only from the library; open the project to check the original.')}</div></form>
    </section>
    <section class="card lib-arch" aria-labelledby="libAH"><div class="card-h"><h2 id="libAH">${T('归档项目','Archived projects')}</h2><span class="sp"></span><button type="button" class="btn sm" data-lib="expAll" data-tip="${T('导出当前筛选出的项目','Exports the projects the filters show')}">${ico('dl')}${T('导出资料包','Export packs')}</button></div>
      <div id="libArchB">${libFiltersHTML()}<div id="libList"></div></div></section>
  </div>`;
}
function libAfter(){
  libIndex();libComposerState();
  const mk=$('#libMkt');$('#libList').innerHTML=libListHTML();libBindArch();
  mk&&mk.addEventListener('change',()=>{S.filters.lmk=mk.value;save()});
  const inp=$('#libIn');inp&&inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){e.preventDefault();$('#libForm').requestSubmit()}});
  const m=$('#libMsgs');if(m)m.scrollTop=m.scrollHeight;
  if(LIB_AVAIL===null)libSampleP().then(s=>{LIB_AVAIL=!!s;libComposerState()});
}
/* ---- real file downloads: ZIP (stored), XLSX and DOCX are written here, no library and no network ---- */
const U8=s=>new TextEncoder().encode(s);
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
const crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC_T[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0};
// files: [{name,data:Uint8Array}]; names are UTF-8 (flag bit 11) so Chinese names stay readable
function zipBuild(files){
  const d=new Date(),dt=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),tm=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
  const out=[],cen=[];let off=0;
  const hdr=(sig,fields)=>{let n=4;fields.forEach(f=>n+=f[0]);const a=new Uint8Array(n),v=new DataView(a.buffer);v.setUint32(0,sig,true);let o=4;fields.forEach(([w,x])=>{w===2?v.setUint16(o,x,true):v.setUint32(o,x,true);o+=w});return a};
  for(const f of files){
    const nm=U8(f.name),crc=crc32(f.data),sz=f.data.length;
    const lh=hdr(0x04034b50,[[2,20],[2,0x0800],[2,0],[2,tm],[2,dt],[4,crc],[4,sz],[4,sz],[2,nm.length],[2,0]]);
    out.push(lh,nm,f.data);
    cen.push([hdr(0x02014b50,[[2,20],[2,20],[2,0x0800],[2,0],[2,tm],[2,dt],[4,crc],[4,sz],[4,sz],[2,nm.length],[2,0],[2,0],[2,0],[2,0],[4,0],[4,off]]),nm]);
    off+=lh.length+nm.length+sz;
  }
  let cs=0;cen.forEach(([h,n])=>{out.push(h,n);cs+=h.length+n.length});
  out.push(hdr(0x06054b50,[[2,0],[2,0],[2,files.length],[2,files.length],[4,cs],[4,off],[2,0]]));
  const all=new Uint8Array(out.reduce((n,x)=>n+x.length,0));let o=0;out.forEach(x=>{all.set(x,o);o+=x.length});return all;
}
const xe=s=>String(s==null?'':s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const XH='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
// rows: array of arrays (first row = header); numbers stay numbers
function xlsxBuild(sheet,rows,widths){
  const col=i=>String.fromCharCode(65+i);
  const sd=rows.map((r,ri)=>`<row r="${ri+1}">${r.map((v,ci)=>{const ref=col(ci)+(ri+1);return typeof v==='number'?`<c r="${ref}"><v>${v}</v></c>`:`<c r="${ref}" t="inlineStr"${ri===0?' s="1"':''}><is><t xml:space="preserve">${xe(v)}</t></is></c>`}).join('')}</row>`).join('');
  const cols=`<cols>${(widths||[]).map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>`;
  const F=[
    ['[Content_Types].xml',XH+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels',XH+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',XH+`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xe(sheet).slice(0,31)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',XH+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml',XH+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF3F8"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml',XH+`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${sd}</sheetData></worksheet>`]];
  return zipBuild(F.map(([name,x])=>({name,data:U8(x)})));
}
// Markdown-ish dossier text -> Word paragraphs (headings, bullets, **bold** lead-ins)
function docxBuild(md){
  const run=(t,o={})=>`<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei"/>${o.b?'<w:b/>':''}${o.c?`<w:color w:val="${o.c}"/>`:''}<w:sz w:val="${o.sz||21}"/></w:rPr><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
  const inl=(t,o={})=>t.split(/\*\*(.+?)\*\*/).map((x,i)=>x?run(x,i%2?{...o,b:true}:o):'').join('');
  const para=(runs,sp={})=>`<w:p><w:pPr><w:spacing w:before="${sp.b||0}" w:after="${sp.a==null?80:sp.a}"/>${sp.ind?`<w:ind w:left="${sp.ind}" w:hanging="${sp.h||0}"/>`:''}</w:pPr>${runs}</w:p>`;
  const body=String(md).split('\n').map(l=>{
    if(/^# /.test(l))return para(run(l.slice(2),{b:true,sz:36,c:'1A2128'}),{a:160});
    if(/^## /.test(l))return para(run(l.slice(3),{b:true,sz:28,c:'2B5C8A'}),{b:280,a:100});
    if(/^### /.test(l))return para(run(l.slice(4),{b:true,sz:23}),{b:160,a:60});
    if(/^---+$/.test(l))return para('',{a:40});
    let m;if(m=l.match(/^- \[(x| )\] (.*)$/))return para(run(m[1]==='x'?'☑ ':'☐ ')+inl(m[2]),{ind:360,h:260});
    if(m=l.match(/^- (.*)$/))return para(run('• ')+inl(m[1]),{ind:360,h:260});
    if(m=l.match(/^\s{2,}(.*)$/))return para(inl(m[1],{c:'4E5A65'}),{ind:640});
    return para(inl(l));
  }).join('');
  const F=[
    ['[Content_Types].xml',XH+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels',XH+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml',XH+`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`]];
  return zipBuild(F.map(([name,x])=>({name,data:U8(x)})));
}
// save a real file: the artifact "downloads" capability when it exists, otherwise an ordinary browser download
async function libDownload(name,data,mime){
  const blob=new Blob([data],{type:mime||'application/octet-stream'});
  const dl=await libDlP();
  if(dl){try{await dl.save({filename:name,data:blob});toast(T('已保存','Saved'));return true}catch(e){if(e&&e.code==='declined')return false;if(e&&e.code==='rate_limited'){toast(T('请稍后再试','Try again in a moment'),'warn');return false}}}
  try{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);toast(T('已下载：','Downloaded: ')+name);return true}
  catch(e){toast(T('无法下载','Could not download the file'),'warn');return false}
}
const LIB_MIME={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',zip:'application/zip',md:'text/markdown;charset=utf-8'};
const libSaveFile=(name,text)=>libDownload(name,U8(text),LIB_MIME.md);
// ALSA projects stay with ALSA role holders and PMO, in exports as everywhere
const libCanExp=p=>!p.alsa||isPMO()||!!alsaRoleOf(me().id);
function libSummaryRows(P){
  const H=[T('编号','Code'),T('项目名称','Project'),T('团队','Team'),T('负责人','Owner'),T('执行人','Executors'),'ALSA',T('开始','Start'),T('计划完成','Planned end'),T('关闭日期','Closed'),T('历时（天）','Days'),T('节点总数','Milestones'),T('已完成节点','Milestones done'),T('延期次数','Extensions'),T('进展记录数','Updates'),T('结项总结','Close summary')];
  return [H,...P.map(p=>{const r=libCloseReq(p),ms=p.milestones||[];return [p.code,p.name,tName(p.team)+(p.section?' · '+secName(p.section):''),p.pic||'',(p.exec||[]).join(', '),p.alsa?'ALSA':'',p.start||'',p.end||'',p.closedAt||p.actual||'',libDur(p)==null?'':libDur(p),ms.length,ms.filter(m=>m.done).length,(p.exts||[]).length,(p.updates||[]).length,r&&r.data?String(r.data.summary||'').replace(/\s+/g,' ').slice(0,300):'']})];
}
const libFn=s=>String(s||'playbook').replace(/[\\/:*?"<>|#\n]+/g,' ').trim().slice(0,60)||'playbook';
document.addEventListener('submit',e=>{if(e.target.id!=='libForm')return;e.preventDefault();const C=libChat();if(C.busy){C.ctl&&C.ctl.abort();return}const v=$('#libIn').value;if(!v.trim()){flagField($('#libIn'));return}libAsk(v)});
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-lib]');if(!el)return;const a=el.dataset.lib,C=libChat();
  if(a==='stop'){e.preventDefault();C.ctl&&C.ctl.abort();return}
  if(a==='send')return; // the form's submit handles it
  if(a==='ex'){const i=$('#libIn');i.value=el.textContent;i.focus();return}
  if(a==='new'){if(C.busy)return;C.turns=[];libSave();libPaint();$('#libIn')&&$('#libIn').focus();return}
  if(a==='copy'){const t=C.turns[+el.dataset.i];try{await navigator.clipboard.writeText(t.shown);toast(T('已复制','Copied'))}catch(_){toast(T('无法复制','Could not copy'),'warn')}return}
  if(a==='dl'){const t=C.turns[+el.dataset.i];const title=(t.shown.match(/^#\s+(.*)$/m)||[])[1]||'Library answer';const refs=(t.refs||[]).map(libProjOf).filter(Boolean);
    libSaveFile(libFn(title)+'.md',`${t.shown}\n\n---\n${T('参考项目','Sources')}${CO()}${refs.map(p=>`${p.code} ${p.name}`).join('; ')}\n${T('生成于','Generated')} ${nowStamp()} · ${T('资料问答助手','Library assistant')}\n`);return}
  if(a==='apply'){const t=C.turns[+el.dataset.i],d=t.draft||{};const st=addDays(today(),14);const ms=(Array.isArray(d.milestones)?d.milestones:[]).slice(0,8).map(m=>({name:String(m.name||''),due:addDays(st,Math.max(1,Math.round(+m.month||1))*30),forms:['图文汇报']}));
    const u=C.turns[+el.dataset.i-1]||{};const mk=u.mk||'';const tm=mk&&canTeam(mk)?mk:(scopeTeams()[0]||'');
    S.formPrefill={type:'new',team:tm,data:{team:tm,name:String(d.name||''),pic:isPMO()?'':me().name,exec:[],start:st,end:ms.length?ms[ms.length-1].due:addDays(st,180),bg:{background:String(d.background||''),why:String(d.why||''),benefit:String(d.benefit||''),process:String(d.process||''),risk:String(d.risk||'')},milestones:ms}};
    go('apply');toast(T('已根据 Playbook 预填立项申请，请检查后提交','The request form is prefilled from the playbook; check it before submitting'),'info');return}
  if(a==='exp1'){e.stopPropagation();const p=libProjOf(el.dataset.id);if(!p||!libCanExp(p)){toast(T('没有权限导出这个项目','You are not allowed to export this project'),'warn');return}libDownload(`${p.code} ${libFn(p.name)}.docx`,docxBuild(libDossier(p)),LIB_MIME.docx);return}
  if(a==='fx'){S.filters[el.dataset.k]='';save();libPaintArch();return}
  if(a==='fclear'){LIB_F.forEach(k=>{if(k!=='lq')S.filters[k]=''});S.filters.lq='';save();libPaintArch();return}
  if(a==='expAll'){const tm=S.filters.lteam||'';const P=libFiltered().P.filter(libCanExp);
    if(!P.length){toast(T('当前筛选下没有可导出的项目','No projects to export with the current filters'),'warn');return}
    const root=`${T('项目资料包','Project packs')}${tm?' '+tm:''} ${today()}`,used=new Set(),files=[];
    files.push({name:`${root}/${T('项目一览','Overview')}.xlsx`,data:xlsxBuild(T('项目一览','Overview'),libSummaryRows(P),[16,46,28,18,30,8,12,12,12,10,10,10,10,10,60])});
    P.forEach(p=>{let n=`${p.code} ${libFn(p.name)}.docx`;while(used.has(n))n='_'+n;used.add(n);files.push({name:`${root}/${n}`,data:docxBuild(libDossier(p))})});
    libDownload(`${root}.zip`,zipBuild(files),LIB_MIME.zip);return}
},true);
Object.assign(VIEWS,{library});Object.assign(VIEWS_AFTER,{library:libAfter});
// examples so the flow can be tried at once: Enea's request waits for the Secretariat; Daglef's is scheduled and collecting replies
function tpSeed(){
  const L=tpList();if(L.some(t=>t.example&&t.l1))return;
  const days=tpDays(),y=addDays(today(),-1);
  const a={id:'t'+uid(),by:'enea',example:true,title:'Italy channel upgrade: tiered service network',l1:'01',l2:'Tiered authorised service network',k:2,status:'pending',at:y+' 10:20',d:null,s:null,place:'',rsvp:{},ext:['luca.bianchi@byd.example'],pref:'Before the end of November; not Friday afternoons',
    bg:'In Italy, service capacity is not keeping up with sales growth. Customers in the south drive more than 80 km to an authorised workshop, and workshop lead time is above 3 weeks in Sicily and Puglia.',
    research:'Mapped all 46 authorised points against registrations by province. Visited 6 independent workshops interested in joining. Compared the tiered models used by two other OEMs in Italy.',
    questions:'1. Do we agree on three tiers (flagship / standard / satellite) and one set of entry standards across markets?\n2. How are parts supplied to satellite workshops?\n3. Which markets pilot together with Italy?',
    history:[{at:y+' 10:20',by:'Enea Costa',text:'Raised the topic; sent to the ALSA Secretariat'}]};
  const b={id:'t'+uid(),by:'daglef',example:true,title:'Parts supply for Bosch Car Service partners',l1:'05',l2:'Partner workshop parts logistics',k:3,status:'scheduled',at:addDays(today(),-4)+' 09:05',d:days[2],s:10,place:'Microsoft Teams',ext:['christian.bode@byd.example'],pref:'',
    bg:'Germany and Poland now run Bosch Car Service partnerships. Partner workshops order BYD parts through three different routes, and delivery times differ from 2 to 9 days.',
    research:'Order data from 38 partner workshops over 6 months; interviews with the German and Polish parts teams; the current warehouse set-up in Germany.',
    questions:'1. One ordering route for all partner workshops?\n2. Which stock is held locally and which ships from the central warehouse?\n3. Target delivery time to propose to Bosch.',
    rsvp:{clara:{v:'yes',at:y+' 14:37',note:''},mariusz:{v:'yes',at:y+' 11:02',note:'Poland can share its ordering data before the meeting.'},hailin:{v:'no',at:today()+' 09:15',note:'In Shenzhen that week. Alex can cover the service engineering side.'},'ext:christian.bode@byd.example':{v:'yes',at:today()+' 08:40',note:'',by:'宋晓晓 Sharon'}},
    sec:{by:'sharon',at:addDays(today(),-2)+' 16:10'},
    history:[{at:addDays(today(),-4)+' 09:05',by:'Daglef Seeck',text:'Raised the topic; sent to the ALSA Secretariat'},{at:addDays(today(),-2)+' 16:10',by:'宋晓晓 Sharon',text:'Secretariat scheduled it'},{at:y+' 11:02',by:'Mariusz Kiljańczyk',text:'Accepted: Poland can share its ordering data before the meeting.'},{at:y+' 14:37',by:'王睿 Clara Wang',text:'Accepted'},{at:today()+' 08:40',by:'宋晓晓 Sharon',text:'Recorded for christian.bode@byd.example: Accepted'},{at:today()+' 09:15',by:'陈海林 Hailin',text:'Declined: In Shenzhen that week. Alex can cover the service engineering side.'}]};
  b.history[1].text='Secretariat scheduled it: '+tpWhen(b);
  L.unshift(b,a);
  const box=(n)=>({n,e:n==='Aiden'?'aiden@byd.example':emailOf(n)||''});
  S.mails.unshift({id:uid(),at:a.at,to:TP_SEC().map(userName).map(box),cc:[box('Enea Costa')],subject:`[ALSA topic request] ${a.title}`,body:`Dear Secretariat:\n\nEnea Costa raised an ALSA topic. Please review it and schedule the meeting.\n\n${tpText(a)}${sig()}`,rule:'manual',ref:'atm'+a.id});
  S.mails.unshift({id:uid(),at:b.sec.at,to:tpTo(b).map(x=>typeof x==='string'?box(x):x),cc:TP_SEC().map(userName).map(box),subject:`[ALSA meeting invitation] ${b.title} · ${md(b.d)} ${tpT(b.s)}`,body:tpBody(b,"The ALSA Secretariat has scheduled Daglef Seeck's topic and invites you:"),rule:'manual',ref:'atm'+b.id,tpk:'inv'});
}


/* ================= bi-weekly progress (EN / ZH meetings alternate weekly) ================= */
let PROJ_ROWS=[];
const rvPer=p=>periodOf(trackOf(p.team));
const RAG={g:{zh:'正常推进',en:'On track',c:'p-closed'},y:{zh:'有风险',en:'At risk',c:'p-mid'},r:{zh:'受阻，需要支持',en:'Blocked, needs support',c:'p-high'}};
const BWS={done:{zh:'已提交',en:'Posted',c:'p-closed'},open:{zh:'待填写',en:'To post',c:'p-low'},soon:{zh:'即将截止',en:'Due soon',c:'p-mid'},late:{zh:'已过截止',en:'Late',c:'p-high'}};
const bwPill=s=>`<span class="pill ${BWS[s].c}">${esc(T(BWS[s].zh,BWS[s].en))}</span>`;
const ragPill=r=>r&&RAG[r]?`<span class="pill ${RAG[r].c}">${esc(T(RAG[r].zh,RAG[r].en))}</span>`:'';
// latest progress = the newest two-week update (falls back to the newest older note)
const lastBw=p=>(p.updates||[]).filter(u=>u.meet).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.meet).localeCompare(String(a.meet)))[0]||null;
const lastAnyUpd=p=>(p.updates||[]).filter(u=>/^\d{4}-/.test(u.date||'')).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]||null;
const bwCell=p=>{const u=lastBw(p)||lastAnyUpd(p);if(!u)return `<span class="small faint">—</span>`;const tx=String(u.done||u.text||'').split('\n')[0];return `<div class="row" style="gap:6px;flex-wrap:nowrap">${ragPill(u.rag)}<span class="small faint num">${esc(md(u.date))}</span></div><div class="small muted bw-sum" style="max-width:260px" title="${esc(u.done||u.text||'')}">${esc(tx)}</div>`};
const bwProjects=lang=>visP().filter(p=>needsBW(p)&&trackOf(p.team)===lang);
// a meeting shows up only if the view has projects reporting there (falls back to the teams' own meetings)
const myTracks=()=>{const all=[...new Set(scopeTeams().map(trackOf))];const ls=all.filter(l=>bwProjects(l).length);return ls.length?ls:all.length?all:['zh']};
// tracks in the order of their next meeting
const bwOrder=()=>myTracks().map(l=>periodOf(l)).sort((a,b)=>a.meet.localeCompare(b.meet));
// PMO reviews what was posted. "Returned" (too thin / not enough) reopens the update until 09:00 on the meeting day.
const BW_RET_HOUR=9;
const bwRetOpen=per=>{const t=today();return t<per.meet||(t===per.meet&&AMS_HOUR()<BW_RET_HOUR)};
const bwOpenU=(per,u)=>u&&u.review&&u.review.st==='returned'?bwRetOpen(per):bwOpen(per);
const rvPill=u=>{const v=u&&u.review;return v?(v.st==='returned'?`<span class="pill p-high">${T('已打回 · 待补充','Returned')}</span>`:v.st==='resub'?`<span class="pill p-mid">${T('已补充 · 待复核','Supplemented')}</span>`:`<span class="pill p-closed">${T('PMO 已确认','PMO confirmed')}</span>`):''};
// updates of the next meeting of each series, for PMO: what to review, and what was sent back
function bwReviewItems(){
  const out={review:[],waiting:[]};if(!isPMO())return out;
  ['en','zh'].forEach(l=>{const per=periodOf(l);if(diff(per.meet,today())>14)return;
    S.projects.filter(p=>needsBW(p)&&trackOf(p.team)===l&&canView(p)).forEach(p=>{const u=updFor(p,per);if(!u)return;const v=u.review;
      if(v&&v.st==='returned')out.waiting.push({p,per,u});else if(!v||v.st==='resub')out.review.push({p,per,u,ready:!!v||diff(today(),per.due)>=0})})});
  return out;
}
const bwPending=()=>isPMO()?0:bwOrder().reduce((n,per)=>n+bwProjects(per.lang).filter(p=>{const u=updFor(p,per);return (!u&&diff(per.meet,today())<=7)||(u&&u.review&&u.review.st==='returned'&&canSee(p)&&bwRetOpen(per))}).length,0);
// posting and editing close at 13:00 Amsterdam time on the day before the meeting (the date follows the simulated date if one is set)
const AMS_HOUR=()=>{try{return +new Intl.DateTimeFormat('en-GB',{hour:'numeric',hourCycle:'h23',timeZone:'Europe/Amsterdam'}).format(new Date())}catch(_){return new Date().getHours()}};   // deadlines are Amsterdam time
const BW_CLOSE_HOUR=13;
const bwOpen=per=>{const t=today();if(t<per.due)return true;if(t>per.due)return false;return AMS_HOUR()<BW_CLOSE_HOUR};
const perLine=per=>`${T('汇报周期','Period')} <span class="num">${md(per.from)}–${md(per.to)}</span> · ${T('请于','due')} <b class="num">${fdW(per.due)} 13:00</b> <span class="small faint">AMS</span> ${T('（阿姆斯特丹时间）前提交','Amsterdam time')}`;

// compact banner for the dashboard
function bwBanner(){
  const per=bwOrder()[0];if(!per)return '';const ps=bwProjects(per.lang);const done=ps.filter(p=>updFor(p,per)).length;const d=diff(per.meet,today());
  return `<button class="bw-banner" data-act="go" data-v="biweekly"><span class="bw-ic">${ico('cal')}</span>
    <span class="grow"><b>${T('下次项目会','Next project meeting')}${CO()}${esc(LANGN(per.lang))} · ${fdW(per.meet)}</b><span class="small muted">${perLine(per)}</span></span>
    <span class="bw-count"><b class="num">${done}</b><span class="faint">/ ${ps.length}</span><small>${T('已提交双周进展','posted')}</small></span>
    <span class="btn ${done<ps.length&&!isPMO()?'pri':''}">${isPMO()?T('查看提交情况','See status'):done<ps.length?T('去填写','Post now'):T('查看','Open')}</span>${d<=3&&done<ps.length?`<span class="pill p-mid bw-tag">${d===0?T('今天开会','Today'):T(`${d} 天后开会`,`in ${d} days`)}</span>`:''}</button>`;
}

// the two upcoming meetings of the tracks in view: "next" and "after that". A team that reports to one meeting series sees its next two meetings.
const bwNext2=()=>{const out=[];(isPMO()?['en','zh']:myTracks()).forEach(l=>{const a=periodOf(l);out.push(a,periodOf(l,addDays(a.meet,1)))});return out.sort((a,b)=>a.meet.localeCompare(b.meet)).slice(0,2)};
function biweekly(){
  const pmo=isPMO();const ord=bwOrder();const fl=S.filters.bwOnly||'';
  const tiles=bwNext2().map((per,i)=>{const ps=bwProjects(per.lang);const done=ps.filter(p=>updFor(p,per)).length;
    return `<div class="bw-tile ${i===0?'next':''}"><div class="row" style="gap:8px"><span class="lbl" style="margin:0">${i===0?T('下一场','Next'):T('再下一场','After that')}</span><span class="sp" style="flex:1"></span><span class="small faint">${T('每两周一次','every 2 weeks')}</span></div>
      <div class="bw-t">${esc(LANGN(per.lang))}</div><div class="bw-d num">${fdW(per.meet)}</div><div class="small muted">${perLine(per)}</div>
      <div class="bw-bar"><i style="width:${ps.length?100*done/ps.length:0}%"></i></div><div class="small"><b class="num">${done}</b> / ${ps.length} ${T('个项目已提交','projects posted')}</div></div>`}).join('');
  // deadline text for one meeting: closed / today / in N days
  const dueTx=per=>{const d=diff(per.due,today());if(!bwOpen(per))return `<span class="pill p-high">${T('已截止','Closed')}</span>`;return `<b class="num">${fdW(per.due)} 13:00</b> <span class="small faint">AMS</span> <span class="small ${d<=2?'bw-warn':'faint'}">${d<=0?T('今天截止','today'):T(`还剩 ${d} 天`,`${d} day${d>1?'s':''} left`)}</span>`};
  const isNextOf=per=>per.meet===periodOf(per.lang).meet;   // only the next meeting of a series can be posted for
  const row=(p,per)=>{const u=updFor(p,per);const isNext=isNextOf(per);const can=!pmo&&canSee(p)&&isNext&&bwOpenU(per,u);
    const st=u?'done':(isNext&&!bwOpen(per)?'late':bwState(p,per)),rv=u&&u.review;
    const stx=!isNext?`<span class="pill p-low">${T('尚未开放','Opens later')}</span>`:u?`${bwPill('done')} ${ragPill(u.rag)} ${rvPill(u)}${rv&&rv.st==='returned'&&bwRetOpen(per)?`<div class="small" style="color:var(--bad)">${T(`请于 ${md(per.meet)} 09:00 前补充`,`Supplement by ${md(per.meet)} 09:00`)}</div>`:can&&!pmo?`<div class="small faint">${T('可修改，截止前有效','Editable until the deadline')}</div>`:''}`:`${bwPill(st)}`;
    const lbl=can?(u?T('修改','Edit'):T('填写','Post')):T('查看','View');
    return `<tr class="click" data-act="open" data-id="${p.id}" data-tab="upd"><td class="mono">${p.code}</td><td class="nm"><div>${p.alsa?'<span class="alsa-tag">ALSA</span> ':''}${esc(p.name)}</div></td><td>${tag(p.team)}</td><td class="small">${esc(p.pic||'—')}</td>
      <td>${isNext?dueTx(per):`<span class="faint small">${fdW(per.due)} 13:00 AMS</span>`}</td><td>${stx}</td><td class="small muted bw-sum">${u?esc((u.done||u.text||'').split('\n')[0]):'—'}</td>
      <td><button class="btn sm ${can&&!u?'pri':''}" data-act="open" data-id="${p.id}" data-tab="upd">${lbl}</button></td></tr>`};
  const grp=(t,n)=>`<tr class="bw-grp"><td colspan="8">${t}${n!=null?` <span class="tag">${n}</span>`:''}</td></tr>`;
  const card=per=>{const isNext=isNextOf(per);
    const all=bwProjects(per.lang);
    const miss=p=>!updFor(p,per);
    const ord=(a,b)=>(updFor(a,per)?1:0)-(updFor(b,per)?1:0)||a.team.localeCompare(b.team)||a.code.localeCompare(b.code);
    let ps=[...all].sort(ord);
    if(fl==='todo'&&isNext)ps=ps.filter(miss);
    if(fl==='review'&&isNext)ps=ps.filter(p=>{const u=updFor(p,per);return u&&(!u.review||u.review.st==='resub')});
    if(fl==='returned'&&isNext)ps=ps.filter(p=>{const u=updFor(p,per);return u&&u.review&&u.review.st==='returned'});
    let body;
    if(pmo){
      // PMO: who has / has not posted, not posted first
      body=ps.map(p=>row(p,per)).join('');
    }else{
      const mine=ps.filter(canSee),other=ps.filter(p=>!canSee(p));
      body=(mine.length?grp(T('我负责的项目（可填写）','My projects (you can post)'),isNext?mine.filter(miss).length+' '+T('待填写','to post'):mine.length)+mine.map(p=>row(p,per)).join(''):'')
          +(other.length?grp(T('仅查看（无编辑权限）','View only (no edit rights)'),other.length)+other.map(p=>row(p,per)).join(''):'');
    }
    const byTeam=pmo&&isNext?(()=>{const m={};all.forEach(p=>{(m[p.team]=m[p.team]||{n:0,miss:0,who:[]}).n++;if(miss(p)){m[p.team].miss++;m[p.team].who.push(p.pic||'—')}});
      return `<div class="bw-teamchips">${Object.entries(m).sort((x,y)=>y[1].miss-x[1].miss||x[0].localeCompare(y[0])).map(([t,v])=>`<span class="pill ${v.miss?'p-high':'p-closed'}" title="${esc([...new Set(v.who)].join(', '))}">${t} ${v.n-v.miss}/${v.n}${v.miss?' · '+T(`缺 ${v.miss}`,`${v.miss} missing`):''}</span>`).join('')}</div>`})():'';
    return `<div class="card"><div class="card-h"><h2>${esc(LANGN(per.lang))} · <span class="num">${fdW(per.meet)}</span></h2><span class="small muted">${perLine(per)}</span>${isNext?'':`<span class="pill p-low">${T('后一场：上一场会议之后开放填写','Later meeting: posting opens after the previous one')}</span>`}<span class="sp"></span>${isNext?`<button type="button" class="btn sm pri" data-act="rvMeet" data-lang="${per.lang}">${ico('cal')}${T('开始过会','Go through projects')}</button>`:''}
      ${pmo?`<span class="small faint">${T('参会团队','Teams')}${CO()}${[...new Set(Object.keys(S.tracks).filter(c=>S.tracks[c]===per.lang))].map(c=>esc(c)).join(' · ')}</span>`:''}</div>
      ${byTeam?`<div class="card-b" style="padding-bottom:0">${byTeam}</div>`:''}
      <div class="tw"><table class="t"><thead><tr><th>${T('编号','Code')}</th><th>${T('项目','Project')}</th><th>${T('团队','Team')}</th><th>${T('负责人','Owner')}</th><th>${T('截止','Deadline')}</th><th>${T('本期','This period')}</th><th>${T('过去两周进展（摘要）','Past two weeks (summary)')}</th><th></th></tr></thead><tbody>
      ${body||`<tr><td colspan="8" class="empty">${fl==='todo'?T('本期都已提交','All posted'):T('这场会议没有需要汇报的项目','No projects for this meeting')}</td></tr>`}
      </tbody></table></div></div>`};
  // top block: what still needs a post (own projects first for business views)
  const topBlock=(()=>{
    const per0=bwNext2().filter(isNextOf);
    if(pmo){
      const n=per0.reduce((k,per)=>k+bwProjects(per.lang).filter(p=>!updFor(p,per)).length,0);
      return `<div class="note ${n?'warn':'info'} small">${n?T(`本期还有 ${n} 个项目没有提交双周进展，下面每场会议已按“未提交在前”排列，上方标出各团队的提交情况。`,`${n} project(s) have not posted for the next meeting. Each meeting below lists them first, with a per-team count on top.`):T('下一场会议的双周进展已全部提交。','Everything is posted for the next meeting.')}</div>`}
    const todo=[],back=[];per0.forEach(per=>bwProjects(per.lang).filter(canSee).forEach(p=>{const u=updFor(p,per);if(!u)todo.push([p,per]);else if(u.review&&u.review.st==='returned'&&bwRetOpen(per))back.push([p,per,u])}));
    const backCard=back.length?`<div class="card bw-todo" style="border-color:var(--bad)"><div class="card-h"><h2>${T('PMO 打回，需要补充','Sent back by PMO')}</h2><span class="badge">${back.length}</span></div><div class="tw"><table class="t"><tbody>${back.map(([p,per,u])=>`<tr class="click" data-act="open" data-id="${p.id}" data-tab="upd"><td class="mono">${p.code}</td><td class="nm">${esc(p.name)}</td><td class="small">${esc(u.review.reason)}</td><td><b class="num">${md(per.meet)} 09:00</b></td><td><button class="btn sm pri" data-act="open" data-id="${p.id}" data-tab="upd">${T('去补充','Supplement')}</button></td></tr>`).join('')}</tbody></table></div></div>`:'';
    const mineAll=per0.reduce((k,per)=>k+bwProjects(per.lang).filter(canSee).length,0);
    if(!todo.length)return backCard+(mineAll?`<div class="note info small">${T('你负责的项目都已提交。截止前可以随时修改（见下表“修改”）。','All your projects are posted. You can still edit them until the deadline (use “Edit” below).')}</div>`:`<div class="note info small">${T('你没有可填写的项目，下面是只读视图。','You have no projects to post for; everything below is view only.')}</div>`);
    return backCard+`<div class="card bw-todo"><div class="card-h"><h2>${T('需要你填写','Needs your update')}</h2><span class="badge">${todo.length}</span></div><div class="tw"><table class="t"><tbody>${todo.map(([p,per])=>`<tr class="click" data-act="open" data-id="${p.id}" data-tab="upd"><td class="mono">${p.code}</td><td class="nm">${esc(p.name)}</td><td>${tag(p.team)}</td><td class="small">${esc(LANGN(per.lang))} · ${fdW(per.meet)}</td><td>${dueTx(per)}</td><td><button class="btn sm pri" data-act="open" data-id="${p.id}" data-tab="upd">${T('填写','Post')}</button></td></tr>`).join('')}</tbody></table></div></div>`})();
  const steps=[[T('会前 3 天收到提醒','Reminder 3 days before'),T('系统在项目会前 3 天，给还没提交的负责人发邮件，抄送部门经理','3 days before, owners who have not posted get an email (cc manager)')],
    [T('在本页点「填写」','Click “Post”'),T('每个项目填三项：过去两周进展、接下来两周计划、需要的支持；再选一个状态','Per project: past two weeks, next two weeks, support needed, plus a status')],
    [T('提交即完成','Submit and you are done'),T('会前一天下午 1 点（阿姆斯特丹时间）前可以随时修改，不需要审批；之后不能再改。锁定字段（时间、负责人等）仍走变更申请','Editable until 13:00 Amsterdam time on the day before the meeting, no approval needed; after that it is locked. Locked project fields (dates, owner…) still need a change request')],
    [T('PMO 复核','PMO reviews'),T('PMO 看一遍大家的进展；太简略或信息不够的会被打回并写明理由，负责人在会议当天 09:00 前补充即可','PMO reads the updates; thin or incomplete ones are sent back with a reason, and the owner supplements them before 09:00 on the meeting day')],
    [T('PMO 汇总上会','PMO compiles it'),T('会上按「受阻 → 有风险 → 正常」顺序过，重点讨论问题和需要的支持','The meeting goes Blocked → At risk → On track and focuses on support')]];
  return `<div class="note info small bw-intro">${T('项目会每两周一次，英文会和中文会隔周轮换，所以每个项目每两周更新一次「双周进展」。','Project meetings run every two weeks, with English and Chinese meetings in alternate weeks, so each project posts a two-week update.')}</div>
  ${topBlock}
  <div class="bw-tiles">${tiles}</div>
  <ol class="bw-steps">${steps.map(([a,b],i)=>`<li><span>${i+1}</span><div><b>${esc(a)}</b><div class="small muted">${esc(b)}</div></div></li>`).join('')}</ol>
  <div class="row"><div class="seg"><button data-act="bwOnly" data-val="" class="${fl?'':'on'}">${T('全部项目','All')}</button><button data-act="bwOnly" data-val="todo" class="${fl==='todo'?'on':''}">${T('只看未提交','Not posted')}</button>${pmo?`<button data-act="bwOnly" data-val="review" class="${fl==='review'?'on':''}">${T('待复核','To review')}</button><button data-act="bwOnly" data-val="returned" class="${fl==='returned'?'on':''}">${T('已打回','Sent back')}</button>`:''}</div></div>
  ${bwNext2().map(card).join('')}
  ${pmo?bwSettings():''}`;
}

function bwSettings(){
  const c=S.cadence;const dows=[[1,T('周一','Mon')],[2,T('周二','Tue')],[3,T('周三','Wed')],[4,T('周四','Thu')],[5,T('周五','Fri')]];
  return `<div class="card"><div class="card-h"><h2>${T('会议设置（PMO）','Meeting settings (PMO)')}</h2><span class="sp"></span><span class="small faint">${T('改完立即生效，提醒邮件按新日期发送','Takes effect immediately')}</span></div>
  <div class="card-b"><form class="form" id="bwSet"><div class="fgrid">
    <div class="f"><label>${T('参考周（任一周的周一）','Reference week (a Monday)')}</label><input type="date" name="anchor" value="${esc(c.anchor)}"></div>
    <div class="f"><label>${T('这一周开哪场会','Meeting that week')}</label><select name="first"><option value="zh" ${c.first==='zh'?'selected':''}>${LANGN('zh')}</option><option value="en" ${c.first==='en'?'selected':''}>${LANGN('en')}</option></select></div>
    <div class="f"><label>${T('开会日','Meeting day')}</label><select name="dow">${dows.map(([v,l])=>`<option value="${v}" ${c.dow===v?'selected':''}>${l}</option>`).join('')}</select></div></div>
    <div class="lbl">${T('各团队参加哪场会（默认：区域团队参加英文会，中台参加中文会）','Which meeting each team joins (default: regional teams English, back-office Chinese)')}</div>
    <div class="bw-teams">${S.teams.map(t=>`<label class="small"><span class="mono">${t.code}</span> <span class="muted">${esc(tName(t.code))}</span><select name="tr_${t.code}">${['en','zh'].map(l=>`<option value="${l}" ${trackOf(t.code)===l?'selected':''}>${l==='en'?T('英文会','EN'):T('中文会','ZH')}</option>`).join('')}</select></label>`).join('')}</div>
    <div class="row"><button class="btn pri">${T('保存设置','Save')}</button></div></form></div></div>`;
}

// the review step: PMO can send an update back (too thin, not enough information) with a reason; the owner supplements it until 09:00 on the meeting day
// ---- meeting mode: the project list on the left, one project at a time on the right ----
function rvAgenda(lang){
  const o={r:0,y:1,g:2};
  return bwProjects(lang).slice().sort((a,b)=>{const ua=updFor(a,periodOf(lang)),ub=updFor(b,periodOf(lang));return (ua?o[ua.rag||'g']:3)-(ub?o[ub.rag||'g']:3)||a.team.localeCompare(b.team)||a.code.localeCompare(b.code)}).map(p=>p.id);
}
function rvStart(ids,title,kind){if(kind!=='follow'&&!ids.length)return;S.filters.rv={kind:kind||'proj',base:ids,team:'',owner:'',stat:'',i:0,seen:{},back:S.view==='review'?(S.filters.rv&&S.filters.rv.back)||'biweekly':S.view,title:title||''};S.view='review';S.drawer=null;save();render();window.scrollTo(0,0)}
function bwDecide(p,v,reason){
  const per=periodOf(trackOf(p.team)),u=updFor(p,per);if(!u||!isPMO()||today()>per.meet)return false;
  const old=u.review,hist=[...(old&&old.hist||[])];if(old&&old.reason&&old.st!=='returned')hist.push({at:old.at,reason:old.reason});
  u.review=v==='ret'?{st:'returned',reason,by:me().name,at:nowStamp(),hist}:{st:'ok',by:me().name,at:nowStamp(),hist};
  if(v==='ret'){const mg=mgrOfP(p);sendMail({to:[p.pic,...(p.exec||[])].filter(Boolean),cc:mg&&mg.name!==p.pic?[mg.name]:[],subject:`[${T('双周进展被打回','Two-week update sent back')}] ${p.code} · ${LANGN(per.lang)} ${md(per.meet)}`,body:`${p.pic||''}${CM()}${T('您好','hello')}\n\n${T(`${p.code}「${p.name}」的双周进展 PMO 看过后认为需要补充：`,`PMO reviewed the two-week update for ${p.code} "${p.name}" and needs more:`)}\n\n${reason}\n\n${T(`请在 ${md(per.meet)} 09:00 前在系统「双周更新」里补充并重新提交。`,`Please supplement it in the system under Two-week updates and post again before ${md(per.meet)} 09:00.`)}${sig()}`,rule:'manual'})}
  return true;
}
// the list for the current filters, grouped by department: team, then how it is going, then code
function rvItems(R){
  const ord=new Map(allTeams().map((c,i)=>[c,i])),tk=x=>ord.has(x.team)?ord.get(x.team):99;
  const okT=x=>(!R.team||x.team===R.team)&&(!R.owner||norm(x.pic||'')===R.owner);
  if(R.kind==='follow')return visF().filter(f=>f.status==='open'&&okT(f)).sort((a,b)=>tk(a)-tk(b)||a.code.localeCompare(b.code));
  const o={r:0,y:1,g:2},stOk=p=>{const u=updFor(p,rvPer(p)),v=u&&u.review;return !R.stat||(R.stat==='issue'?!!u&&(u.rag==='r'||u.rag==='y'):R.stat==='unposted'?!u:R.stat==='toreview'?!!u&&(!v||v.st==='resub'):R.stat==='returned'?!!v&&v.st==='returned':true)};
  return (R.base||[]).map(id=>S.projects.find(p=>p.id===id)).filter(Boolean).filter(p=>okT(p)&&stOk(p)).sort((a,b)=>tk(a)-tk(b)||((updFor(a,rvPer(a))?o[updFor(a,rvPer(a)).rag||'g']:3)-(updFor(b,rvPer(b))?o[updFor(b,rvPer(b)).rag||'g']:3))||a.code.localeCompare(b.code));
}
const rvAgo=d=>{if(!d)return '';const n=diff(today(),String(d).slice(0,10));return n<=0?T('今天','today'):T(`${n} 天前`,`${n} d ago`)};
function reviewView(){
  const R=S.filters.rv;if(!R)return `<div class="card empty">${T('没有可过的项目。','Nothing to go through.')}</div>`;
  R.seen=R.seen||{};
  const follow=R.kind==='follow',all=follow?visF().filter(f=>f.status==='open'):(R.base||[]).map(id=>S.projects.find(p=>p.id===id)).filter(Boolean);
  const items=rvItems(R),t=today();
  const i=Math.min(Math.max(0,R.i||0),Math.max(0,items.length-1));R.i=i;const cur=items[i];
  const teamsIn=[...new Set(all.map(x=>x.team))].sort((a,b)=>allTeams().indexOf(a)-allTeams().indexOf(b)),ownersIn=[...new Set(all.map(x=>x.pic).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const cnt=(k,v)=>all.filter(x=>k==='team'?x.team===v:norm(x.pic||'')===v).length;
  const nP=(R.base||[]).length,nF=visF().filter(f=>f.status==='open').length;
  const bar=`<div class="rw-bar"><button class="btn sm" data-act="rvExit">${ico('chevL')}${T('退出','Exit')}</button><b class="rw-title">${esc(R.title||T('逐个过更新','Going through updates'))}</b>
    <div class="seg" role="tablist"><button role="tab" aria-selected="${!follow}" data-act="rvKind" data-v="proj" class="${follow?'':'on'}">${T('项目','Projects')}${nP?` <b class="num">${nP}</b>`:''}</button><button role="tab" aria-selected="${follow}" data-act="rvKind" data-v="follow" class="${follow?'on':''}">${T('跟进项','Follow-ups')} <b class="num">${nF}</b></button></div>
    <select id="rvT" aria-label="${T('部门','Department')}"><option value="">${T('全部部门','All departments')}</option>${teamsIn.map(c=>`<option value="${c}" ${R.team===c?'selected':''}>${esc(c)} · ${esc(tName(c))} (${cnt('team',c)})</option>`).join('')}</select>
    <select id="rvO" aria-label="${T('负责人','Owner')}"><option value="">${T('全部负责人','All owners')}</option>${ownersIn.map(n=>`<option value="${esc(norm(n))}" ${R.owner===norm(n)?'selected':''}>${esc(n)} (${cnt('owner',norm(n))})</option>`).join('')}</select>
    ${follow?'':`<select id="rvS" aria-label="${T('状态','Status')}">${[['',T('全部状态','Any status')],['issue',T('受阻 / 有风险','Blocked / at risk')],['unposted',T('本期未提交','Not posted')],['toreview',T('待复核','To review')],['returned',T('已打回','Sent back')]].map(([k,l])=>`<option value="${k}" ${(R.stat||'')===k?'selected':''}>${l}</option>`).join('')}</select>`}
    ${R.team||R.owner||R.stat?`<button class="btn sm ghost" data-act="rvClear">${ico('x')}${T('清除筛选','Clear')}</button>`:''}
    <span class="sp"></span><span class="small faint">${T('← → 切换','← → to switch')}</span><button class="btn" data-act="rvPrev" ${i?'':'disabled'}>${ico('chevL')}${T('上一个','Previous')}</button><span class="num"><b>${items.length?i+1:0}</b> / ${items.length}</span><button class="btn pri" data-act="rvNext" ${i<items.length-1?'':'disabled'}>${T('下一个','Next')}${ico('chevR')}</button></div>`;
  if(!items.length)return bar+`<div class="card empty">${T('这个筛选下没有内容。','Nothing matches these filters.')}</div>`;
  R.seen[cur.id]=1;
  // left: grouped by department, with how many were looked at
  let lastT='';const seenIn=c=>items.filter(x=>x.team===c&&R.seen[x.id]).length,totIn=c=>items.filter(x=>x.team===c).length;
  const side=items.map((x,k)=>{const u=follow?null:updFor(x,rvPer(x)),rv=u&&u.review;const lu=follow?lastUpd(x):null,stale=follow&&(!lu||diff(t,lu)>30);
    const h=x.team!==lastT?(lastT=x.team,`<div class="rw-gh"><span class="mono">${esc(x.team)}</span><span class="rw-gn">${esc(tName(x.team))}</span><span class="sp"></span><span class="small num">${seenIn(x.team)}/${totIn(x.team)}</span></div>`):'';
    return h+`<button type="button" class="rw-li ${k===i?'on':''} ${R.seen[x.id]?'seen':''}" data-act="rvGo" data-i="${k}" ${k===i?'aria-current="true"':''}><i class="rw-dot ${follow?(stale?'r-y':'r-g'):u?'r-'+(u.rag||'g'):'r-none'}"></i><span class="rw-t"><b class="mono small">${x.code}</b><span>${esc(x.name)}</span></span>${rv?`<i class="rw-fl ${rv.st==='returned'?'bad':rv.st==='ok'?'ok':'mid'}" data-tip="${esc(rv.st)}"></i>`:''}${R.seen[x.id]?'<span class="rw-ck">✓</span>':''}</button>`}).join('');
  return bar+`<div class="rw"><aside class="rw-side" aria-label="${T('列表','List')}">${side}</aside><main class="rw-main" id="rvMain">${follow?rvFollow(cur,t):rvProj(cur,R,t)}</main></div>`;
}
// one project: header, status trend, the latest update, the step-by-step history, milestones
function rvProj(p,R,t){
  const per=rvPer(p),u=updFor(p,per),ms=(p.milestones||[]).slice().sort((a,b)=>String(a.due).localeCompare(String(b.due))),nm=nextMs(p),dEnd=p.end?diff(p.end,t):null;
  const upd=(p.updates||[]).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.meet||'').localeCompare(String(a.meet||'')));
  const lat=u||upd[0]||null,isThis=!!u,past=upd.filter(x=>x!==lat);
  const trend=(p.updates||[]).filter(x=>x.meet).sort((a,b)=>String(a.meet).localeCompare(String(b.meet))).slice(-8);
  const sec=(ic,l,x,cls)=>`<div class="rw-sec ${cls||''}"><div class="rw-sl">${ic}${l}</div><div class="rw-big">${x?esc(x):`<span class="faint">${T('没有填写','Not filled in')}</span>`}</div></div>`;
  const dec=isPMO()&&u&&t<=per.meet?`<form class="form rw-dec" id="rvDec" data-pid="${p.id}"><div class="f"><label>${T('PMO 复核','PMO review')} ${rvPill(u)}</label><textarea name="reason" style="min-height:52px" placeholder="${T('打回理由（太简略或信息不够时填写）','Reason, if sent back (too thin or incomplete)')}"></textarea></div><div class="row"><button class="btn" type="submit" value="ret">${T('打回，要求补充','Send back')}</button><button class="btn pri" type="submit" value="ok">${T('确认，下一个','Confirm, next')}</button></div></form>`:'';
  const latest=lat?`<section class="card rw-latest r-b-${lat.meet?(lat.rag||'g'):'none'}"><div class="rw-lh"><span class="rw-badge">${isThis?T('最新进展','Latest update'):T('上一次进展','Last update')}</span>${lat.meet?ragPill(lat.rag):''}${isThis?rvPill(lat):''}<span class="sp"></span><span class="small muted">${esc(lat.by||'')} · ${esc(fd(lat.date))} · ${rvAgo(lat.date)}</span></div>
      ${isThis?'':`<div class="note warn small">${needsBW(p)?T(`本期（${esc(LANGN(per.lang))} ${md(per.meet)}）还没有提交，下面是上一次的进展。`,`Nothing posted yet for this meeting (${esc(LANGN(per.lang))} ${md(per.meet)}); this is the previous update.`):T('这个项目不需要提交双周进展。','This project does not post two-week updates.')}</div>`}
      ${lat.meet?`<div class="rw-per small muted num">${md(lat.from)}–${md(lat.to)} · ${esc(LANGN(lat.lang))} ${md(lat.meet)}</div>${sec('✔ ',T('过去两周做了什么','Done in the past two weeks'),lat.done)}${sec('➜ ',T('接下来两周计划','Plan for the next two weeks'),lat.next)}${sec('⚑ ',T('需要的支持 / 风险','Support needed / risks'),lat.help,lat.help?'warn':'')}`:`<div class="rw-big">${esc(lat.text||lat.done||'')}</div>`}
      ${lat.review&&lat.review.reason?`<div class="small" style="margin-top:8px"><b>${T('打回理由','Sent back')}</b>${CO()}${esc(lat.review.reason)}</div>`:''}
      ${lat.prev?`<details class="small" style="margin-top:6px"><summary>${T('补充前的内容','Before the supplement')}</summary><div class="bw-sec"><span>${T('过去两周','Past two weeks')}</span>${esc(lat.prev.done||'')}</div><div class="bw-sec"><span>${T('接下来两周','Next two weeks')}</span>${esc(lat.prev.next||'')}</div></details>`:''}${dec}</section>`
    :`<section class="card"><div class="card-b"><div class="note warn">${T('这个项目还没有任何进展记录。','No update has ever been posted for this project.')}</div></div></section>`;
  const tl=past.slice(0,R.all?999:5).map((x,k)=>`<details class="rw-te" ${k<1?'open':''}><summary><i class="rw-pt ${x.meet?'r-'+(x.rag||'g'):'r-none'}"></i><b class="num">${x.meet?`${md(x.from)}–${md(x.to)}`:esc(fd(x.date))}</b>${x.meet?`<span class="small muted">${esc(LANGN(x.lang))} ${md(x.meet)}</span>${ragPill(x.rag)}`:`<span class="small faint">${T('进度记录','Note')}</span>`}<span class="small faint rw-sum">${esc(String(x.done||x.text||'').split('\n')[0].slice(0,70))}</span></summary>
      <div class="rw-tb">${x.meet?`${sec('✔ ',T('过去两周','Past two weeks'),x.done)}${sec('➜ ',T('接下来两周','Next two weeks'),x.next)}${x.help?sec('⚑ ',T('支持 / 风险','Support / risks'),x.help,'warn'):''}`:`<div class="rw-big">${esc(x.text||'')}</div>`}<div class="small faint">${esc(x.by||'')} · ${esc(x.date||'')}</div></div></details>`).join('');
  const rk=risksOf(p),dl=delayLines(p);
  const step=(m,k)=>{const late=!m.done&&m.due&&m.due<t,isN=nm&&m.id===nm.id;return `<li class="${m.done?'done':late?'late':isN?'next':''}"><i>${m.done?'✓':k+1}</i><div><b>${esc(m.name)}</b><span class="num">${esc(m.due||'')}${late?` · ${T(`逾期 ${diff(t,m.due)} 天`,`${diff(t,m.due)} d late`)}`:isN?` · ${T('下一个','next')}`:''}</span></div></li>`};
  return `<div class="card rw-head"><div class="card-b"><div class="row" style="gap:8px;flex-wrap:wrap">${p.alsa?'<span class="alsa-tag">ALSA</span>':''}${tag(p.team)}<span class="mono" style="font-weight:600">${p.code}</span>${stPill(p)}${lvPill(pLevel(p))}<span class="sp"></span><button class="btn sm" data-act="open" data-id="${p.id}">${T('项目详情','Open project')}</button></div>
    <h2 class="rw-name">${esc(p.name)}</h2>
    <div class="rw-facts"><span><i>${T('负责人','Owner')}</i><b>${esc(p.pic||'—')}</b></span><span><i>${T('执行人','Executors')}</i><b>${esc((p.exec||[]).join('、')||'—')}</b></span><span><i>${T('计划','Plan')}</i><b class="num">${fd(p.start)} → ${fd(p.end)}</b>${dEnd!==null?`<em class="${dEnd<0?'bad':''}">${dEnd<0?T(`已超 ${-dEnd} 天`,`${-dEnd} d past`):T(`还剩 ${dEnd} 天`,`${dEnd} d left`)}</em>`:''}</span><span><i>${T('交付','Delivered')}</i><b>${ms.filter(m=>m.done).length}/${ms.length}</b><span class="bar"><i style="width:${pct(p)}%"></i></span></span></div>
    <div class="rw-trend"><span class="small muted">${T('状态走势','Status trend')}</span>${trend.map(x=>`<span class="rw-tr ${x===u?'now':''}" data-tip="${esc(md(x.meet)+' · '+T(RAG[x.rag||'g'].zh,RAG[x.rag||'g'].en))}"><i class="r-${x.rag||'g'}"></i><em>${md(x.meet)}</em></span>`).join('')}${isThis||!needsBW(p)?'':`<span class="rw-tr now" data-tip="${T('本期未提交','Not posted')}"><i class="r-none"></i><em>${md(per.meet)}</em></span>`}${trend.length?'':`<span class="small faint">—</span>`}</div></div></div>
  <div class="rw-cols"><div class="rw-l">${latest}
    <section class="card"><div class="card-h"><h2>${T('进展历程','Update history')}</h2><span class="tag">${past.length}</span><span class="small faint">${T('从新到旧，一步一步','newest first, step by step')}</span></div><div class="card-b"><div class="rw-tl">${tl||`<span class="faint">${T('没有更早的记录','No earlier updates')}</span>`}</div>${past.length>5&&!R.all?`<div style="margin-top:8px"><button class="btn sm" data-act="rvAll">${T(`显示全部 ${past.length} 条`,`Show all ${past.length}`)}</button></div>`:''}</div></section></div>
  <div class="rw-r"><section class="card"><div class="card-h"><h2>${T('节点进度','Milestones')}</h2><span class="tag">${ms.filter(m=>m.done).length}/${ms.length}</span></div><div class="card-b"><ol class="rw-steps">${ms.map(step).join('')||`<li><div><span class="faint">—</span></div></li>`}</ol></div></section>
    <section class="card"><div class="card-h"><h2>${T('风险与延期','Risks and delays')}</h2></div><div class="card-b small">${rk.map(x=>`<div style="margin-bottom:8px"><span class="pill p-${x.level}">${esc(x.title)}</span>${x.detail?`<div class="faint">${esc(String(x.detail).slice(0,140))}</div>`:''}</div>`).join('')}${dl.length?`<div class="lbl">${T('延期 / 异动记录','Delay record')}</div>`+dl.map(x=>`<div style="margin-bottom:4px">${esc(x)}</div>`).join(''):''}${rk.length||dl.length?'':`<span class="faint">${T('没有风险和延期记录','No risks or delays on record')}</span>`}</div></section></div></div>`;
}
// one follow-up: latest note, history, and a box to post progress (owner, executors, PMO)
function rvFollow(f,t){
  const up=[...(f.updates||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))),lat=up[0],past=up.slice(1),lu=lastUpd(f),n=lu?diff(t,lu):null,can=f.status==='open'&&(isPMO()||fParty(f)||canSee(f));
  return `<div class="card rw-head"><div class="card-b"><div class="row" style="gap:8px;flex-wrap:wrap">${tag(f.team)}<span class="mono" style="font-weight:600">${f.code}</span><span class="pill p-open">${esc(T(FT[f.ftype].zh,FT[f.ftype].en))}</span><span class="sp"></span><button class="btn sm" data-act="openf" data-id="${f.id}">${T('详情','Open')}</button></div>
    <h2 class="rw-name">${esc(f.name)}</h2><div class="rw-facts"><span><i>${T('跟进人','Owner')}</i><b>${esc(f.pic||'—')}</b></span><span><i>${T('执行人','Executors')}</i><b>${esc((f.exec||[]).join('、')||'—')}</b></span><span><i>${T('开始','Start')}</i><b class="num">${fd(f.start)}</b></span><span><i>${T('最近更新','Last update')}</i><b class="${n===null||n>30?'bad':''}">${n===null?T('从未更新','never'):rvAgo(lu)}</b></span></div></div></div>
  <div class="rw-cols"><div class="rw-l"><section class="card rw-latest r-b-${n===null||n>30?'y':'g'}"><div class="rw-lh"><span class="rw-badge">${T('最新跟进','Latest note')}</span><span class="sp"></span>${lat?`<span class="small muted">${esc(byName(lat.by))} · ${esc(fd(lat.date))} · ${rvAgo(lat.date)}</span>`:''}</div>${lat?`<div class="rw-big">${esc(lat.text)}</div>`:`<div class="note warn small">${T('还没有跟进记录。','No updates yet.')}</div>`}
      ${can?`<form class="form rw-dec" id="rvFu" data-fid="${f.id}"><div class="f"><label>${T('发布新的跟进进展','Post a progress note')}</label><textarea name="text" required style="min-height:64px"></textarea></div><div class="row"><button class="btn pri">${T('发布','Post')}</button></div></form>`:''}</section>
    <section class="card"><div class="card-h"><h2>${T('跟进历程','History')}</h2><span class="tag">${past.length}</span></div><div class="card-b"><div class="rw-tl">${past.map((x,k)=>`<details class="rw-te" ${k<1?'open':''}><summary><i class="rw-pt r-none"></i><b class="num">${esc(fd(x.date))}</b><span class="small faint rw-sum">${esc(String(x.text||'').split('\n')[0].slice(0,80))}</span></summary><div class="rw-tb"><div class="rw-big">${esc(x.text||'')}</div><div class="small faint">${esc(byName(x.by))}</div></div></details>`).join('')||`<span class="faint">${T('没有更早的记录','No earlier notes')}</span>`}</div></div></section></div>
  <div class="rw-r"><section class="card"><div class="card-h"><h2>${T('说明 / 监控指标','Notes / metrics')}</h2></div><div class="card-b small" style="white-space:pre-wrap">${esc(f.scope||'—')}</div></section></div></div>`;
}
function bwReviewHTML(p,per,u,own){
  if(!u)return '';const v=u.review,pmo=isPMO(),dl=`${md(per.meet)} 09:00`;
  const hist=(v&&v.hist||[]).map(h=>`<div class="small faint">${esc(h.at)} · ${esc(h.reason)}</div>`).join('');
  if(!pmo){
    if(v&&v.st==='returned')return `<div class="note bad small"><b>${T('PMO 打回了这份进展，请补充','PMO sent this update back; please add to it')}</b><div style="white-space:pre-wrap;margin:4px 0">${esc(v.reason)}</div><div class="faint">${esc(v.by)} · ${esc(v.at)} · ${bwRetOpen(per)?T(`请在 ${dl} 前补充并重新提交`,`Supplement and post again before ${dl}`):T(`补充期限 ${dl} 已过`,`The supplement deadline (${dl}) has passed`)}</div></div>`;
    if(v&&v.st==='resub')return `<div class="note info small">${T('已补充，等待 PMO 复核。','Supplemented; waiting for PMO to review.')}${hist}</div>`;
    if(v&&v.st==='ok')return `<div class="note info small">${T('PMO 已确认这份进展。','PMO confirmed this update.')}</div>`;
    return '';
  }
  const open=today()<=per.meet;
  return `<div class="card"><div class="card-h"><h2>${T('PMO 复核','PMO review')}</h2>${rvPill(u)||`<span class="pill p-low">${T('未复核','Not reviewed')}</span>`}</div><div class="card-b">
    ${v&&v.st==='returned'?`<div class="small" style="margin-bottom:6px"><b>${T('已打回','Sent back')}${CO()}</b>${esc(v.reason)} <span class="faint">${esc(v.at)}</span></div>`:''}${hist}
    ${v&&v.st==='resub'&&u.prev?`<details class="small" style="margin-bottom:6px"><summary>${T('补充前的内容','Before the supplement')}</summary><div class="bw-sec"><span>${T('过去两周','Past two weeks')}</span>${esc(u.prev.done||'')}</div><div class="bw-sec"><span>${T('接下来两周','Next two weeks')}</span>${esc(u.prev.next||'')}</div></details>`:''}
    ${open?`<form class="form" id="bwRev"><div class="f"><label>${T('打回理由（太简略或信息不够时填写）','Reason (when it is too thin or incomplete)')}</label><textarea name="reason" style="min-height:64px" placeholder="${T('写清楚需要补充什么，例如：没有写明遇到的问题和需要的支持','Say what is missing, e.g. no issues or support needs given')}"></textarea></div>
      <div class="row"><button class="btn" type="submit" value="ret">${T('打回，要求补充','Send back')}</button><button class="btn pri" type="submit" value="ok">${T('确认通过','Confirm')}</button><span class="small faint">${T(`打回后负责人可在 ${dl} 前补充`,`After a return the owner can supplement until ${dl}`)}</span></div></form>`:`<div class="small faint">${T('会议已开，不能再打回。','The meeting has passed; it can no longer be sent back.')}</div>`}</div></div>`;
}
// drawer tab: this period's form + history
function bwTab(p,own){
  const per=periodOf(trackOf(p.team));const cur=updFor(p,per);const st=bwState(p,per);const open_=bwOpenU(per,cur),can=!isPMO()&&own&&needsBW(p)&&open_,closedNote=!isPMO()&&own&&needsBW(p)&&!open_;
  const ord=[...(p.updates||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  return `<div class="row" style="margin-bottom:8px"><button class="btn sm" data-act="rvOne" data-id="${p.id}">${ico('cal')}${T('全屏查看更新时间线','Full-screen update timeline')}</button></div><div class="note small bw-now"><div class="row" style="gap:8px"><b>${T('本期','This period')}${CO()}${esc(LANGN(per.lang))} · ${fdW(per.meet)}</b>${needsBW(p)?bwPill(st):''}</div><div class="muted">${perLine(per)}</div></div>
  ${closedNote?`<div class="note warn small">${T(`本期已于 ${md(per.due)} 13:00（阿姆斯特丹时间）截止，不能再提交或修改。如有特殊情况，请联系 PMO。`,`This period closed at 13:00 Amsterdam time on ${md(per.due)}; it can no longer be posted or edited. For an exception, contact PMO.`)}</div>`:''}${can?`<form class="form" id="bwForm"><div class="f"><label>${T('过去两周进展','Past two weeks')}（${md(per.from)}–${md(per.to)}）<span class="req">*</span></label><textarea name="done" required placeholder="${T('完成了哪些工作、哪个节点有进展，尽量写结果','What was done and which milestone moved; focus on results')}">${esc(cur?cur.done||cur.text||'':'')}</textarea></div>
    <div class="f"><label>${T('接下来两周计划','Next two weeks')}<span class="req">*</span></label><textarea name="next" required placeholder="${T('到下次会议前要完成什么','What will be done before the next meeting')}">${esc(cur?cur.next||'':'')}</textarea></div>
    <div class="f"><label>${T('需要的支持 / 风险','Support needed / risks')}</label><textarea name="help" style="min-height:64px" placeholder="${T('没有可以不填','Leave empty if none')}">${esc(cur?cur.help||'':'')}</textarea></div>
    <div class="f"><label>${T('整体状态','Overall status')}</label><div class="seg rag-seg">${Object.entries(RAG).map(([k,v])=>`<label><input type="radio" name="rag" value="${k}" ${(cur?cur.rag:'g')===k?'checked':''}><span>${esc(T(v.zh,v.en))}</span></label>`).join('')}</div></div>
    <div class="row"><button class="btn pri">${cur?T('保存修改','Save changes'):T('提交双周进展','Post update')}</button><span class="small faint">${T('会前一天 13:00（阿姆斯特丹时间）前可随时修改，不需要审批','Editable until 13:00 Amsterdam time on the day before the meeting; no approval needed')}</span></div></form>`:''}
  ${bwReviewHTML(p,per,cur,own)}
  <div class="lbl">${T('历次进展','All updates')}${ord.length?` · ${ord.length}`:''}</div>
  <div class="timeline">${tlList('u'+p.id,ord,u=>`<div class="tl"><span class="d">${u.meet?`${md(u.from)}–${md(u.to)}`:esc(u.date)}</span><div class="x">${u.meet?`<div class="row" style="gap:6px;margin-bottom:4px"><b class="small">${esc(LANGN(u.lang))} ${md(u.meet)}</b>${ragPill(u.rag)}</div><div class="bw-sec"><span>${T('过去两周','Past two weeks')}</span>${esc(u.done)}</div><div class="bw-sec"><span>${T('接下来两周','Next two weeks')}</span>${esc(u.next)}</div>${u.help?`<div class="bw-sec"><span>${T('需要的支持','Support needed')}</span>${esc(u.help)}</div>`:''}`:esc(u.text)}<div class="small faint">${esc(byName(u.by))}${u.meet?` · ${T('提交于','posted')} ${esc(u.date)}`:''}</div></div></div>`,T('暂无进展记录','No updates yet'))}</div>`;
}
// long histories (the migrated tracker goes back to early 2025): the newest few show, the rest are one click away
const TL_SHOW=6,TLOPEN=new Set();
const byName=b=>b==='原表'?T('原表','Original tracker'):(b||'');
function tlList(k,items,row,empty){
  if(!items.length)return `<div class="empty">${empty}</div>`;
  if(items.length<=TL_SHOW+2)return items.map(row).join('');
  const open=TLOPEN.has(k),n=items.length-TL_SHOW,t=items.length;
  // older rows stay in the page and are only shown / hidden, so a draft being typed above is never re-rendered away
  return items.slice(0,TL_SHOW).map(row).join('')+`<div class="tl-old"${open?'':' hidden'}>${items.slice(TL_SHOW).map(row).join('')}</div>`
    +`<button type="button" class="btn sm tl-more" data-act="tlMore" data-k="${esc(k)}" data-n="${n}" data-t="${t}" aria-expanded="${open}">${tlLbl(open,n,t)}</button>`;
}
const tlLbl=(open,n,t)=>open?T('收起更早的记录','Show fewer'):T(`显示更早的 ${n} 条（共 ${t} 条）`,`Show ${n} earlier (${t} in total)`);

document.addEventListener('submit',e=>{
  const f=e.target;
  if(f.id==='bwForm'){e.preventDefault();e.stopImmediatePropagation();const p=curItem();const per=periodOf(trackOf(p.team));const g=n=>(f.elements[n]?.value||'').trim();
    const old=(p.updates||[]).find(x=>x.meet===per.meet);
    if(isPMO()||!bwOpenU(per,old)){toast(T(`本期已于 ${md(per.due)} 13:00（阿姆斯特丹时间）截止，不能再提交或修改`,`This period closed at 13:00 Amsterdam time on ${md(per.due)}`),'warn');renderDrawer();return}
    if(!g('done')||!g('next'))return;
    const u={date:today(),meet:per.meet,from:per.from,to:per.to,lang:per.lang,done:g('done'),next:g('next'),help:g('help'),rag:(f.querySelector('[name=rag]:checked')||{}).value||'g',by:me().name};
    u.text=`${u.done}\n${T('下两周','Next')}${CO()}${u.next}${u.help?`\n${T('支持','Support')}${CO()}${u.help}`:''}`;
    const ov=old&&old.review;
    if(ov&&(ov.st==='returned'||ov.st==='resub')){u.review={st:'resub',reason:ov.reason,by:ov.by,at:ov.at,hist:ov.hist||[],back:nowStamp()};u.prev=old.st==='resub'||ov.st==='resub'?(old.prev||{done:old.done,next:old.next,help:old.help}):{done:old.done,next:old.next,help:old.help}}
    p.updates=(p.updates||[]).filter(x=>x.meet!==per.meet);p.updates.push(u);
    if(ov&&ov.st==='returned')sendMail({to:['Aiden'],cc:[p.pic],subject:`[${T('双周进展已补充','Two-week update supplemented')}] ${p.code} · ${LANGN(per.lang)} ${md(per.meet)}`,body:`${p.code}「${p.name}」${T('已按 PMO 的意见补充双周进展，请复核。','was supplemented as PMO asked; please review it.')}${sig()}`,rule:'manual'});
    save();render();renderDrawer();toast(ov&&ov.st==='returned'?T('已补充，等待 PMO 复核','Supplemented; PMO will review'):T(`已提交，${md(per.meet)} ${LANGN(per.lang)}会用到`,`Posted for the ${LANGN(per.lang)} on ${md(per.meet)}`));return}
  if(f.id==='rvDec'){e.preventDefault();e.stopImmediatePropagation();const p=S.projects.find(y=>y.id===f.dataset.pid);if(!p)return;
    const v=(e.submitter&&e.submitter.value)||'ok',reason=(f.elements.reason.value||'').trim();
    if(v==='ret'&&!reason){toast(T('请写明打回的理由','Say why it is sent back'),'warn');flagField(f.elements.reason);return}
    if(bwDecide(p,v,reason)){const R=S.filters.rv;toast(v==='ret'?T('已打回，负责人收到邮件','Sent back; the owner got an email'):T('已确认','Confirmed'));if(R.i<rvItems(R).length-1)R.i++;save();render();window.scrollTo(0,0)}return}
  if(f.id==='rvFu'){e.preventDefault();e.stopImmediatePropagation();const fo=S.follows.find(y=>y.id===f.dataset.fid),tx=(f.elements.text.value||'').trim();if(!fo||!tx)return;(fo.updates=fo.updates||[]).push({date:today(),text:tx,by:me().name});save();render();toast(T('进度已更新','Update posted'));return}
  if(f.id==='bwRev'){e.preventDefault();e.stopImmediatePropagation();const p=curItem();const per=periodOf(trackOf(p.team));const u=updFor(p,per);if(!u||!isPMO()||today()>per.meet)return;
    const v=(e.submitter&&e.submitter.value)||'ok',reason=(f.elements.reason.value||'').trim();
    if(v==='ret'&&!reason){toast(T('请写明打回的理由','Say why it is sent back'),'warn');flagField(f.elements.reason);return}
    const old=u.review,hist=[...(old&&old.hist||[])];if(old&&old.reason&&old.st!=='returned')hist.push({at:old.at,reason:old.reason});
    u.review=v==='ret'?{st:'returned',reason,by:me().name,at:nowStamp(),hist}:{st:'ok',by:me().name,at:nowStamp(),hist};
    if(v==='ret'){const mg=mgrOfP(p);sendMail({to:[p.pic,...(p.exec||[])].filter(Boolean),cc:mg&&mg.name!==p.pic?[mg.name]:[],subject:`[${T('双周进展被打回','Two-week update sent back')}] ${p.code} · ${LANGN(per.lang)} ${md(per.meet)}`,body:`${p.pic||''}${CM()}${T('您好','hello')}\n\n${T(`${p.code}「${p.name}」的双周进展 PMO 看过后认为需要补充：`,`PMO reviewed the two-week update for ${p.code} "${p.name}" and needs more:`)}\n\n${reason}\n\n${T(`请在 ${md(per.meet)} 09:00 前在系统「双周更新」里补充并重新提交。`,`Please supplement it in the system under Two-week updates and post again before ${md(per.meet)} 09:00.`)}${sig()}`,rule:'manual'})}
    save();render();renderDrawer();toast(v==='ret'?T('已打回，负责人收到邮件','Sent back; the owner got an email'):T('已确认','Confirmed'));return}
  if(f.id==='bwSet'){e.preventDefault();e.stopImmediatePropagation();const d=Object.fromEntries(new FormData(f));
    S.cadence={...S.cadence,anchor:mondayOf(d.anchor||S.cadence.anchor),first:d.first,dow:+d.dow};S.teams.forEach(t=>{if(d['tr_'+t.code])S.tracks[t.code]=d['tr_'+t.code]});
    save();render();toast(T('会议设置已保存','Saved'))}
},true);

IC.cal='<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3"/>';
Object.assign(VIEWS,{biweekly});

/* ================= back navigation ================= */
// Every page change and every opened project pushes the screen it left, so "Back" always returns there.
// The browser / phone back gesture does the same while there is somewhere to go back to.
try{if('scrollRestoration' in history)history.scrollRestoration='manual'}catch(e){}
const NAVH=[];
const fKey=()=>JSON.stringify(S.filters,(k,v)=>k==='alsaForm'||k==='alsaEdit'?undefined:v);
const navSnap=()=>({view:S.view,drawer:S.drawer?{...S.drawer,edit:false}:null,af:S.view==='alsa'&&!!S.filters.alsaForm,ae:S.view==='alsa'&&S.filters.alsaEdit||null,f:fKey(),y:window.scrollY});
const sameScr=(a,b)=>a.view===b.view&&a.af===b.af&&a.ae===b.ae&&a.f===b.f&&JSON.stringify(a.drawer)===JSON.stringify(b.drawer);
const canBack=()=>NAVH.length>0||!!S.drawer||S.view!=='dashboard';
function navPush(){const s=navSnap();const top=NAVH[NAVH.length-1];if(top&&sameScr(top,s))return;NAVH.push(s);if(NAVH.length>60)NAVH.shift();histArm()}
function navReset(){NAVH.length=0;histDrop()}
// the entry Back will return to (entries identical to the current screen are skipped)
function backEntry(){const cur=navSnap();for(let i=NAVH.length-1;i>=0;i--)if(!sameScr(NAVH[i],cur))return NAVH[i];return null}
function backTarget(){
  const top=backEntry();
  if(!top)return S.view==='alsa'&&S.filters.alsaForm&&!S.drawer?TITLES().alsa[0]:S.drawer?(TITLES()[S.view]||[''])[0]:TITLES().dashboard[0];
  if(top.drawer){const x=top.drawer.kind==='p'?S.projects.find(p=>p.id===top.drawer.id):S.follows.find(f=>f.id===top.drawer.id);if(x)return x.code}
  return (TITLES()[top.view]||[''])[0];
}
function navBack(){
  hideCtx();hideModal();
  const cur=navSnap();let s=NAVH.pop();
  while(s&&sameScr(s,cur))s=NAVH.pop(); // skip entries that would change nothing
  if(!s){ // nothing recorded (e.g. after a reload): close what is open, else go home
    if(S.drawer){S.drawer=null;save();render();window.scrollTo(0,cur.y);return}
    if(S.view==='alsa'&&S.filters.alsaForm){S.filters.alsaForm=false;S.filters.alsaEdit=null;save();render();return}
    if(S.view!=='dashboard'){S.view='dashboard';save();render();window.scrollTo(0,0)}
    return;
  }
  const pageSame=s.view===cur.view&&s.af===cur.af&&s.ae===cur.ae&&s.f===cur.f;
  S.view=s.view;S.drawer=s.drawer?{...s.drawer}:null;
  try{S.filters={...JSON.parse(s.f),alsaForm:s.af,alsaEdit:s.ae}}catch(e){S.filters.alsaForm=s.af;S.filters.alsaEdit=s.ae}
  save();render();window.scrollTo(0,pageSame?cur.y:(s.y||0));
  const sd=$('#side');sd&&sd.classList.remove('open');
}
// one history entry is "armed" while there is somewhere to go back to, so the browser / phone Back lands here
let histArmed=false,histSkip=false;
function histArm(){if(histArmed)return;try{history.pushState({pmo:1},'');histArmed=true}catch(e){}}
function histDrop(){if(!histArmed)return;histSkip=true;histArmed=false;try{history.back()}catch(e){histSkip=false}}
function backBtn(){navBack();if(!canBack())histDrop()}
// on load (reload, restored tab): adopt our entry if we are sitting on it, or arm one when there is somewhere to go back to
function histBoot(){try{if(history.state&&history.state.pmo){if(canBack())histArmed=true;else history.replaceState(null,'')}else if(canBack())histArm()}catch(e){}}
window.addEventListener('popstate',e=>{
  if(histSkip){histSkip=false;return}
  if(e.state&&e.state.pmo){histArmed=true;return} // a Forward step back onto our entry
  histArmed=false;
  if(ctxEl||$('#qa')){hideCtx();hideModal();if(canBack())histArm();return} // Back first closes an open menu or dialog
  navBack();if(canBack())histArm();
});
const backHTML=()=>canBack()?`<button class="back-btn" data-act="back" title="${T('返回上一个界面（也可用浏览器返回键）','Back to the previous screen (browser Back works too)')}">${ico('chevL')}<span>${T('返回','Back')}</span><b>${esc(backTarget())}</b></button>`:'';

/* ================= right-click menu on projects ================= */
// Right-click (or long-press on a phone) any project or follow-up row: PMO gets edit / owner / status / close,
// managers get the actions their role allows (post progress, submit deliverable, request change or close).
const CTX_SEL='[data-act="open"][data-id],[data-act="openf"][data-id],[data-act="qpick"][data-id]';
let ctxEl=null,ctxAt=0,ctxEat=false;
// punctuation that follows the page language (mails and history are written in the current language)
const CO=()=>T('：',': '),COL=()=>T('：',':'),PAR=s=>T(`（${s}）`,` (${s})`),QT=s=>T(`「${s}」`,` "${s}"`),CM=()=>T('，',', '),END=()=>T('。','.');
const ctxHint=()=>`<div class="ctx-hint">${ico('mouse')}${isPMO()?T('右键点击项目（手机长按，或点行末的 ⋯）可直接编辑、更换负责人、关闭或终止项目','Right-click a project (long-press on a phone, or use the ⋯ button) to edit it, change the owner, close or stop it'):T('右键点击项目（手机长按，或点行末的 ⋯）：本团队的项目可直接填写双周进展、提交成果或申请变更；其他团队的项目只读','Right-click a project (long-press, or use the ⋯ button): in your own team you can post two-week progress, submit a deliverable or request a change; other teams’ projects are read-only')}</div>`;
const ctxNote=(x,kind)=>{if(isPMO())return '';if(!canSee(x))return T('只读：这是其他团队的项目，只有该团队的经理 / 运营经理可以提交进展或申请变更','Read-only: this belongs to another team. Only its manager or ops manager can post progress or request changes');if(!INFLIGHT.includes(x.status))return T('这个项目已不在进行中，不能再提交进展或变更','This project is no longer running, so progress and changes can no longer be submitted');return T('名称、负责人、时间等需通过变更申请，由 PMO 审批','Name, owner and dates change through a request PMO approves')};
function ctxTarget(el){const a=el.dataset.act;const kind=a==='openf'||(a==='qpick'&&el.dataset.k==='f')?'f':'p';const x=kind==='p'?S.projects.find(p=>p.id===el.dataset.id):S.follows.find(f=>f.id===el.dataset.id);return x&&(isPMO()||canSee(x)||canView(x))?{kind,x}:null}
const hasOwner=x=>!!x.pic&&!isDeparted(x.pic);
function ctxItems(kind,x){
  const pmo=isPMO(),own=canSee(x),run=INFLIGHT.includes(x.status);const L=[];
  if(kind==='p'){
    L.push(['open',T('打开项目','Open project')]);
    if(pmo){
      L.push(['edit',T('编辑项目信息','Edit project details')],['owner',hasOwner(x)?T('更换负责人','Change owner'):T('更换负责人（现无在职负责人）','Change owner (none active)')],['-']);
      L.push(['status',T('更改状态…','Change status…')]);
      if(run)L.push(['st:closed',T('直接关闭项目','Close project now')],['st:canceled',T('终止项目（取消）','Stop project (cancel)')]);
      else L.push(['st:active',T('重新打开项目','Reopen project')]);
      if(run){L.push(['-'],['p2f',T('转为跟进项','Convert to follow-up')]);if(hasOwner(x))L.push(['notify',T('提醒负责人','Remind the owner')]);L.push(['toChange',T('代为发起变更','File a change request')])}
    }else if(own&&run){
      if(needsBW(x))L.push(['upd',T('填写双周进展','Post two-week progress')]);
      if(needsBW(x)&&(x.milestones||[]).some(m=>!m.done))L.push(['ms',T('提交里程碑成果','Submit a deliverable')]);
      L.push(['-'],['toChange',T('申请变更 / 延期 / 换负责人','Request change / extension / new owner')]);
      if(x.status!=='to_report'&&canClose())L.push(['toClose',T('申请结项','Request close')]);
    }
    L.push(['-'],['hist',T('查看变更历史','View history')]);
  }else{
    L.push(['open',T('打开跟进项','Open follow-up')]);
    if(pmo){
      if(x.status==='open')L.push(['owner',T('更换跟进人','Change owner')],['-'],['f2p',T('转为项目','Convert to project')],['fClose',T('关闭跟进项','Close follow-up')]);
      else if(x.status==='closed')L.push(['fReopen',T('重新打开','Reopen')]);
    }else if(own&&x.status==='open')L.push(['fUpd',T('写跟进记录','Post an update')]);
  }
  return L;
}
function showCtx(el,cx,cy){
  const t=ctxTarget(el);if(!t)return false;hideCtx();const {kind,x}=t;
  const items=ctxItems(kind,x);
  const m=document.createElement('div');m.className='ctx';m.setAttribute('role','menu');m.dataset.kind=kind;m.dataset.id=x.id;
  m.innerHTML=`<div class="ctx-h"><span class="mono">${esc(x.code)}</span>${kind==='p'?pill(x.status):''}${kind==='p'&&pLevel(x)==='high'?lvPill('high'):''}<div class="ctx-n">${esc(x.name)}</div></div>`+
    items.map(([k,l])=>k==='-'?'<div class="ctx-sep"></div>':`<button role="menuitem" data-act="cx" data-cx="${k}" class="${k==='st:closed'||k==='st:canceled'||k==='fClose'?'danger':''}">${esc(l)}</button>`).join('')+
    (()=>{const n=ctxNote(x,kind);return n?`<div class="ctx-f">${esc(n)}</div>`:''})();
  document.body.appendChild(m);m.style.maxHeight=(window.innerHeight-16)+'px';
  const w=m.offsetWidth,h=m.offsetHeight;m.style.left=Math.max(8,Math.min(cx,window.innerWidth-w-8))+'px';m.style.top=Math.max(8,Math.min(cy,window.innerHeight-h-8))+'px';
  ctxEl=m;ctxAt=Date.now();histArm();const b=m.querySelector('button');b&&b.focus({preventScroll:true});return true;
}
// drop: the menu was dismissed without an action, so release the history entry it armed
// the ⋯ button at the end of a list row opens the same menu as a right-click
document.addEventListener('click',e=>{const b=e.target.closest('[data-ctxb]');if(!b)return;e.preventDefault();e.stopPropagation();const r=b.getBoundingClientRect();showCtx({dataset:{act:'open',id:b.dataset.ctxb}},r.left,r.bottom+4)},true);
function hideCtx(drop){if(ctxEl){ctxEl.remove();ctxEl=null;if(drop&&!canBack()&&!$('#qa'))histDrop()}}
document.addEventListener('contextmenu',e=>{
  if(ctxEl&&(e.target.closest('.ctx')||Date.now()-ctxAt<700)){e.preventDefault();return} // on the menu itself, or long-press already opened it
  const el=e.target.closest(CTX_SEL);if(!el||e.target.closest('input,textarea,select'))return;
  if(showCtx(el,e.clientX,e.clientY))e.preventDefault();
});
// long-press for touch screens (iOS does not send contextmenu)
(()=>{let tm=null,sx=0,sy=0,fired=false;
  document.addEventListener('touchstart',e=>{const el=e.target.closest(CTX_SEL);fired=false;if(!el||e.touches.length>1)return;const t=e.touches[0];sx=t.clientX;sy=t.clientY;clearTimeout(tm);tm=setTimeout(()=>{if(showCtx(el,sx,sy)){fired=true;if(navigator.vibrate)try{navigator.vibrate(10)}catch(_){}}},550)},{passive:true});
  document.addEventListener('touchmove',e=>{const t=e.touches[0];if(Math.abs(t.clientX-sx)>10||Math.abs(t.clientY-sy)>10)clearTimeout(tm)},{passive:true});
  document.addEventListener('touchend',e=>{clearTimeout(tm);if(fired&&e.cancelable)e.preventDefault()});
  document.addEventListener('touchcancel',()=>clearTimeout(tm));
})();
// a press outside the open menu only dismisses it; the click it would make is swallowed (like a native menu)
window.addEventListener('mousedown',e=>{const out=!!ctxEl&&!e.target.closest('.ctx');ctxEat=out&&e.button===0;if(out)hideCtx(e.button!==2)},true);
window.addEventListener('click',e=>{if(!ctxEat)return;ctxEat=false;if(e.detail){e.preventDefault();e.stopPropagation()}},true);
window.addEventListener('resize',()=>hideCtx(true));window.addEventListener('scroll',e=>{if(ctxEl&&Date.now()-ctxAt>150&&!(e.target&&e.target.closest&&e.target.closest('.ctx')))hideCtx(true)},true);
document.addEventListener('keydown',e=>{
  if(ctxEl){if(e.key==='Escape'){hideCtx(true);e.stopImmediatePropagation();return}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'||e.key==='Tab'){const bs=$$('button',ctxEl);const i=bs.indexOf(document.activeElement);const dn=e.key==='ArrowDown'||(e.key==='Tab'&&!e.shiftKey);const n=bs[(i+(dn?1:-1)+bs.length)%bs.length];n&&n.focus();e.preventDefault()}}
  if(e.key==='Escape'&&$('#qa')){hideModal();e.stopImmediatePropagation()}
},true);
function ctxDo(k,kind,id){
  hideCtx();const r=$('#qres');r&&(r.hidden=true);
  const x=kind==='p'?S.projects.find(p=>p.id===id):S.follows.find(f=>f.id===id);if(!x)return;
  if(k==='open')return openDrawer(kind,id);
  if(k==='fUpd'){openDrawer('f',id);const t=$('#updForm textarea');if(t){t.scrollIntoView({block:'center'});t.focus({preventScroll:true})}return}
  if(k==='edit'){openDrawer('p',id,'info');S.drawer.edit=true;renderDrawer();const f=$('#pmoEdit');f&&f.elements.name.focus();return}
  if(k==='upd'||k==='ms'||k==='hist')return openDrawer('p',id,k);
  if(k==='toChange'||k==='toClose'){S.formPid=id;return go(k==='toChange'?'change':'close')}
  if(k==='owner')return qaOwner(kind,x);
  if(k==='status')return qaStatus(x,null);
  if(k.startsWith('st:'))return qaStatus(x,k.slice(3));
  if(k==='notify')return qaNotify(x);
  if(k==='p2f')return qaP2f(x);
  // follow-up actions reuse the existing handlers
  const b=document.createElement('button');b.dataset.act=k;b.dataset.id=id;b.hidden=true;document.body.appendChild(b);b.click();b.remove();
  if(!canBack()&&!$('#qa'))histDrop();
}

/* ---- quick-action dialogs (PMO) ---- */
function showModal(title,body,sub){
  hideModal();const d=document.createElement('div');d.id='qa';d.className='scrim qa-scrim';d.dataset.act='qaScrim';
  d.innerHTML=`<form class="qa form" id="qaForm" role="dialog" aria-label="${esc(title)}"><div class="qa-h"><h3>${esc(title)}</h3>${sub?`<div class="small muted">${sub}</div>`:''}</div>${body}<div class="row qa-b"><span class="sp" style="flex:1"></span><button type="button" class="btn" data-act="qaCancel">${T('取消','Cancel')}</button><button class="btn pri">${T('确认','Confirm')}</button></div></form>`;
  document.body.appendChild(d);histArm();const f=$('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),textarea',d);f&&f.focus();
}
function hideModal(){const d=$('#qa');if(!d)return;d.remove();if(!canBack())histDrop()}
const qaHead=x=>`<span class="mono">${esc(x.code)}</span> · ${esc(x.name)}`;
const notifyBox=(on,who)=>`<label class="chk small"><input type="checkbox" name="notify" ${on?'checked':''}> ${T('发邮件通知','Email')} ${esc(who)}</label>`;
// people to copy, without duplicates (names compared loosely) and without anyone already in To
const ccList=(m,to=[])=>{const seen=new Set(to.filter(Boolean).map(norm));return m.filter(n=>n&&!seen.has(norm(n))&&seen.add(norm(n)))};
const whyTxt=why=>why?PAR(`${T('原因','reason')}${CO()}${why}`):'';
// PMO rejects at the close meeting or sends a deliverable back: a written comment is required and goes to the owner
function qaReturn(kind,p,mid){
  const m=mid&&(p.milestones||[]).find(x=>x.id===mid);
  showModal(kind==='meetBack'?T('驳回结项，退回继续执行','Reject the close: back to execution'):T('驳回节点成果','Reject the deliverable'),
    `<input type="hidden" name="qa" value="${kind}"><input type="hidden" name="pid" value="${p.id}"><input type="hidden" name="mid" value="${mid||''}"><div class="f"><label>${T('驳回意见','Comment')}<span class="req">*</span></label><textarea name="why" required placeholder="${T('写清楚哪里不够、需要补什么；负责人会收到邮件','Say what is missing and what to add; the owner gets it by email')}"></textarea></div>`,qaHead(p)+(m?` · ${esc(m.name)}`:''));
}
function qaStatus(p,pre){
  const opts=Object.keys(ST).filter(k=>k!==p.status);const sel=pre&&opts.includes(pre)?pre:'';
  showModal(T('更改项目状态','Change project status'),`<input type="hidden" name="qa" value="status"><input type="hidden" name="pid" value="${p.id}">
    <div class="f"><label>${T('当前','Now')}${CO()}${pill(p.status)}${T('　',' · ')}${T('改为','Change to')}</label><div class="qa-st">${opts.map(k=>`<label class="chk"><input type="radio" name="st" value="${k}" required ${k===sel?'checked':''}> ${pill(k)}</label>`).join('')}</div></div>
    <div class="f"><label>${T('原因','Reason')}<span class="req" id="qaReq" ${['closed','canceled'].includes(sel)?'':'hidden'}>*</span></label><textarea name="why" placeholder="${T('例如：负责人无法推进，项目终止，由 PMO 关闭','e.g. owner cannot deliver; PMO stops the project')}"></textarea><span class="hint">${T('关闭或终止必须写原因，会记入变更历史；该项目待审批的申请会自动作废','Required to close or stop; saved in the history. Pending requests for the project are voided.')}</span></div>
    ${hasOwner(p)?notifyBox(true,T('负责人和部门经理','the owner and manager')):''}`,qaHead(p));
}
function qaOwner(kind,x){
  showModal(kind==='p'?T('更换负责人','Change owner'):T('更换跟进人','Change owner'),`<input type="hidden" name="qa" value="owner"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="pid" value="${x.id}">
    <div class="f"><label>${T('现负责人','Current owner')}</label><div>${esc(x.pic||'—')} ${isDeparted(x.pic)?`<span class="pill p-high">${T('已离职','Has left')}</span>`:''}</div></div>
    <div class="f"><label>${T('新负责人','New owner')}<span class="req">*</span></label><input type="text" name="pic" list="qaPeople" autocomplete="off" required><datalist id="qaPeople">${people().filter(n=>!isDeparted(n)&&norm(n)!==norm(x.pic)).map(n=>`<option value="${esc(n)}">`).join('')}</datalist></div>
    ${kind==='p'&&hasOwner(x)?`<label class="chk small"><input type="checkbox" name="keep"> ${T('原负责人留作执行人','Keep the current owner as an executor')}</label>`:''}
    <div class="f"><label>${T('原因','Reason')}</label><textarea name="why" placeholder="${T('例如：原负责人无法推进','e.g. current owner cannot deliver')}"></textarea></div>
    ${notifyBox(true,T('新、旧负责人','the new and old owner'))}`,qaHead(x));
}
function qaNotify(p){
  const rs=risksOf(p);
  const txt=`${p.pic||''}${CM()}${T('您好','hello')}${T('：',':')}\n\n${T('请关注项目','Please look at project')} ${p.code}${QT(p.name)}${END()}\n${rs.length?rs.map(r=>`· ${r.title}${PAR(r.sugg)}`).join('\n'):p.status==='on_hold'?T('项目目前处于暂停 / 待定状态。请告知是否可以恢复推进，或建议取消、转为跟进项，以便在项目会上决定。','The project is on hold. Please tell us whether it can resume, or should be cancelled or turned into a follow-up, so it can be decided at the project meeting.'):T('请更新最新进展。','Please post the latest progress.')}\n`;
  showModal(T('提醒负责人','Remind the owner'),`<input type="hidden" name="qa" value="notify"><input type="hidden" name="pid" value="${p.id}">
    <div class="f"><label>${T('收件人','To')}</label><div>${esc(p.pic||'—')} <span class="small faint">${T('抄送','cc')} ${esc(ccList([mgrOfP(p)?.name,'Aiden'],[p.pic]).join(T('、',', ')))}</span></div></div>
    <div class="f"><label>${T('内容','Message')}</label><textarea name="body" style="min-height:150px">${esc(txt)}</textarea></div>`,qaHead(p));
}
function qaP2f(p){
  showModal(T('转为跟进项','Convert to follow-up'),`<input type="hidden" name="qa" value="p2f"><input type="hidden" name="pid" value="${p.id}">
    <div class="note warn small">${T('项目将被取消，并新建一个跟进项（孵化评估）继续跟踪，负责人不变。','The project is canceled and a new follow-up (incubation) keeps tracking it, with the same owner.')}</div>
    <div class="f"><label>${T('原因','Reason')}</label><textarea name="why" placeholder="${T('例如：暂不具备立项条件，先日常跟进','e.g. not ready to run as a project; follow up routinely')}"></textarea></div>`,qaHead(p));
}
// close or stop: pending requests and PMO to-dos for the project no longer apply
function voidPending(x,to,why,by){
  const vr=S.requests.filter(r=>r.pid===x.id&&r.status==='pending');
  vr.forEach(r=>{r.status='rejected';r.decision={by:me().id,at:nowStamp(),comment:T(`项目已由 PMO 改为「${ST[to].zh}」，此申请自动作废`,`Project set to ${ST[to].en} by PMO; request voided`)+whyTxt(why)}});
  (S.todos||[]).filter(t=>t.pid===x.id&&t.status==='open').forEach(t=>t.status='done');
  if(vr.length)x.history.push({at:nowStamp(),by,text:T(`${vr.length} 个待审批申请已作废`,`${vr.length} pending request(s) voided`)});
}
document.addEventListener('submit',e=>{
  if(e.target.id!=='qaForm')return;e.preventDefault();e.stopImmediatePropagation();
  if(!isPMO()){hideModal();return}
  const f=e.target,d=Object.fromEntries(new FormData(f));const why=(d.why||'').trim();
  const x=(d.kind==='f'?S.follows:S.projects).find(o=>o.id===d.pid);if(!x){hideModal();return}
  const by=me().name,edit=T('PMO 直接修改：','PMO edit: ');
  if(d.qa==='status'){
    const to=d.st;if(!to)return;
    if((to==='closed'||to==='canceled')&&!why){flagField(f.elements.why);toast(T('请填写原因','Please give a reason'),'warn');return}
    const from=x.status;
    if(to==='closed'||to==='canceled')voidPending(x,to,why,by);
    // an approved close report: closing it is the meeting close (follow-up, closing mail)
    if(from==='to_report'&&to==='closed'){hideModal();meetClose(x.id,{direct:true,why,mail:!!d.notify&&hasOwner(x)});return}
    x.status=to;if(to==='closed'){x.closedAt=today();x.actual=today()}
    x.history.push({at:nowStamp(),by,text:`${edit}${T('状态','Status')}${CO()}${T(ST[from].zh,ST[from].en)} → ${T(ST[to].zh,ST[to].en)}${whyTxt(why)}`});
    if(d.notify&&hasOwner(x)){const mg=mgrOfP(x);sendMail({to:[x.pic],cc:ccList([mg&&mg.name,...(x.alsa?alsaCc():['Aiden'])],[x.pic]),subject:`${x.alsa?'[ALSA] ':''}[${T('项目状态变更','Status changed')}] ${x.code} · ${T(ST[to].zh,ST[to].en)}`,body:`${x.pic}${CM()}${T('您好','hello')}${T('：',':')}\n\n${T('PMO 已将项目','PMO changed project')} ${x.code}${QT(x.name)} ${T('的状态由','from')}${QT(T(ST[from].zh,ST[from].en))} ${T('改为','to')}${QT(T(ST[to].zh,ST[to].en))}${END()}${why?`\n${T('原因','Reason')}${CO()}${why}`:''}${sig()}`,rule:'manual',ref:x.id})}
    hideModal();save();render();toast(T(`${x.code} 已改为「${ST[to].zh}」`,`${x.code} is now ${ST[to].en}`));return;
  }
  if(d.qa==='owner'){
    const np=(d.pic||'').trim();if(!np){f.elements.pic.focus();return}
    const old=x.pic;if(norm(np)===norm(old)){hideModal();return}
    x.pic=np;if(d.keep&&old&&!isDeparted(old)){x.exec=[...(x.exec||[]).filter(n=>norm(n)!==norm(old)),old]}
    if(x.exec)x.exec=x.exec.filter(n=>norm(n)!==norm(np));
    x.history.push({at:nowStamp(),by,text:`${edit}${T('负责人','Owner')}${CO()}${old||'—'} → ${np}${whyTxt(why)}`});
    if(d.notify){const mg=mgrOfP(x);sendMail({to:[np],cc:ccList([old&&!isDeparted(old)?old:null,mg&&mg.name,'Aiden'],[np]),subject:`[${T('负责人变更','New owner')}] ${x.code} ${x.name}`,body:`${np}${CM()}${T('您好','hello')}${T('：',':')}\n\n${T('PMO 已指定您为','PMO has made you the owner of')} ${x.code}${QT(x.name)}${T(' 的负责人','')}${PAR(`${T('原负责人','previous owner')}${CO()}${old||'—'}`)}${END()}${why?`\n${T('原因','Reason')}${CO()}${why}`:''}\n\n${T('请登录系统查看里程碑和双周进展。','Please sign in to review the milestones and two-week updates.')}${sig()}`,rule:'manual',ref:x.id})}
    hideModal();save();render();toast(T(`负责人已改为 ${np}`,`Owner is now ${np}`));return;
  }
  if(d.qa==='notify'){
    if(!hasOwner(x)){hideModal();toast(T('该项目没有在职负责人，请先更换负责人','This project has no active owner; change the owner first'),'warn');return}
    const mg=mgrOfP(x);sendMail({to:[x.pic],cc:ccList([mg&&mg.name,'Aiden'],[x.pic]),subject:`[${T('PMO 提醒','PMO reminder')}] ${x.code} ${x.name}`,body:(d.body||'').trim()+sig(),rule:'manual',ref:x.id});
    hideModal();save();render();toast(T('提醒邮件已发送','Reminder sent'));return;
  }
  if(d.qa==='sponsor'){
    const fd=new FormData(f),pil=fd.getAll('pilot'),sp=spRead(fd);const er=spCheck(pil,sp,x.pic);if(er){toast(er,'warn');return}
    const a=(S.alsa||[]).find(r=>r.pid===x.id),rec=a||x;
    x.pilots=pil;x.sponsors=sp;if(a){a.pilots=[...pil];a.sponsors=sp.map(s=>({...s}))}rec.spSent=(rec.spSent||[]).filter(k=>sp.some(s=>spKey(s)===k));
    x.history.push({at:nowStamp(),by,text:`${edit}${T('试点市场','Pilot markets')}${CO()}${pil.join('、')||'—'}；ALSA Project Sponsor${CO()}${spNames(x)||'—'}`});
    const n=alsaSpMail(rec,x);
    hideModal();save();render();toast(n?T(`已保存，已邮件通知 ${n} 位新 Sponsor`,`Saved; ${n} new sponsor(s) emailed`):T('已保存','Saved'));return;
  }
  if(d.qa==='meetBack'||d.qa==='msReturn'){
    if(!why){flagField(f.elements.why);toast(T('请填写驳回意见','Add a comment first'),'warn');return}
    if(d.qa==='meetBack'){
      x.status='active';x.history.push({at:nowStamp(),by,text:T(`会议未通过结项，驳回继续执行：${why}`,`Close not approved at the meeting; rejected back to execution: ${why}`)});
      if(hasOwner(x))sendMail({to:[x.pic],subject:`[${T('结项被驳回','Close rejected')}] ${x.code}`,body:`${T('项目会议未通过结项，请继续执行并补充交付物。','The meeting did not approve closing; please continue and complete the deliverables.')}\n\n${T('意见','Comment')}${CO()}${why}${sig()}`,rule:'manual',ref:x.id});
    }else{
      const m=(x.milestones||[]).find(o=>o.id===d.mid);if(!m){hideModal();return}
      m.done=false;m.returned=why;m.evidence=null;x.history.push({at:nowStamp(),by,text:T(`驳回节点成果：${m.name}（${why}）`,`Rejected deliverable: ${m.name} (${why})`)});
      if(hasOwner(x))sendMail({to:[x.pic],subject:`[${T('成果被驳回','Deliverable rejected')}] ${x.code}`,body:`${m.name}\n\n${T('意见','Comment')}${CO()}${why}${sig()}`,rule:'manual',ref:x.id});
    }
    hideModal();save();render();toast(T('已驳回，意见已发给负责人','Rejected; the owner has the comment'));return;
  }
  if(d.qa==='p2f'){hideModal();const code=projToFollow(x,why);save();render();toast(T(`已转为跟进项 ${code}`,`Now follow-up ${code}`));return}
},true);
document.addEventListener('change',e=>{if(e.target.name==='st'&&e.target.closest('#qaForm')){const r=$('#qaReq');r&&(r.hidden=!['closed','canceled'].includes(e.target.value))}});
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-act]');if(!el)return;const a=el.dataset.act;
  if(a==='back'){e.preventDefault();backBtn();return}
  if(a==='cx'){const m=el.closest('.ctx');ctxDo(el.dataset.cx,m.dataset.kind,m.dataset.id);return}
  if(a==='qaCancel'){hideModal();return}
  if(a==='qaScrim'&&e.target===el){hideModal();return}
});

/* ================= drawer ================= */
function openDrawer(kind,id,tab){hideCtx();navPush();S.drawer={kind,id,tab:tab||'info',edit:false};save();renderDrawer()}
// closing a project returns to the screen it was opened from (same as Back)
function closeDrawer(){const top=NAVH[NAVH.length-1];if(S.drawer&&top&&!top.drawer&&top.view===S.view){backBtn();return}const y=window.scrollY;S.drawer=null;save();render();window.scrollTo(0,y)}
function renderDrawer(){
  const box=$('#drawer');if(!box)return;const D=S.drawer;if(!D){box.innerHTML='';return}
  const P=D.kind==='p'?S.projects.find(x=>x.id===D.id):S.follows.find(x=>x.id===D.id);
  if(!P||!canView(P)){S.drawer=null;box.innerHTML='';return}
  box.innerHTML=`<div class="scrim" data-act="scrim"><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle">${D.kind==='p'?projDrawer(P,D):followDrawer(P,D)}</aside></div>`;
}
function projDrawer(p,D){
  const own=canSee(p);const pmo=isPMO();const running=['active','not_started','to_report'].includes(p.status);
  const tabs=[['info',T('概要','Overview')],['ms',T('里程碑与成果','Milestones')+` (${p.milestones.filter(m=>m.done).length}/${p.milestones.length})`],['upd',T('双周进展','Two-week progress')+` (${(p.updates||[]).length})`],['hist',T('变更与历史','History')],['iss',T('问题','Issues')+` (${S.issues.filter(i=>i.pid===p.id&&i.status==='open').length})`]];
  const L=`<span class="lock" title="${T('锁定字段：需提交变更申请，由 PMO 审批','Locked: change via a request approved by PMO')}">${lockI}</span>`;
  let body='';
  if(D.tab==='info'){
    const rs=risksOf(p);
    if(D.edit&&pmo) body=`<form class="form" id="pmoEdit"><div class="note warn small">${T('PMO 直接修改，将记录在变更历史中','PMO direct edit; recorded in history')}</div><div class="fgrid">
      <div class="f full"><label>${T('项目名称','Name')}</label><input type="text" name="name" value="${esc(p.name)}"></div>
      <div class="f"><label>${T('负责人','Owner')}</label><input type="text" name="pic" value="${esc(p.pic||'')}"></div>
      <div class="f"><label>${T('执行人（逗号分隔）','Executors (comma separated)')}</label><input type="text" name="exec" value="${esc((p.exec||[]).join(', '))}"></div>
      <div class="f"><label>${T('开始','Start')}</label><input type="date" name="start" value="${esc(p.start||'')}"></div>
      <div class="f"><label>${T('计划完成','End')}</label><input type="date" name="end" value="${esc(p.end||'')}"></div>
      <div class="f"><label>${T('状态','Status')}</label><select name="status">${Object.keys(ST).map(k=>`<option value="${k}" ${p.status===k?'selected':''}>${esc(T(ST[k].zh,ST[k].en))}</option>`).join('')}</select></div>
      <div class="f"><label>${T('团队','Team')}</label><select name="team">${teamOptions(p.team,allTeams())}</select><span class="hint">${T('换团队不改编号，编号终身不变','Changing team keeps the code')}</span></div>
      <div class="f" id="peSecF" ${p.team==='SEN'?'':'hidden'}><label>${T('科室（服务工程部）','Section (Service Engineering)')}</label><select name="section"><option value="">—</option>${SECTIONS.map(x=>`<option value="${x}" ${p.section===x?'selected':''}>${esc(secName(x))}</option>`).join('')}</select><span class="hint">${T('科室决定谁能看到项目，例如渠道管理由黄明辉负责','The section decides who sees the project, e.g. Channel Mgmt belongs to Brent')}</span></div>
      <div class="f full"><label>${T('执行范围与交付物','Scope & deliverables')}</label><textarea name="scope" style="min-height:120px">${esc(p.scope||'')}</textarea></div>
      <div class="f full"><label>${T('修改原因','Reason for the change')}</label><textarea name="why" placeholder="${T('把状态改为已关闭或已取消时必填，会记入变更历史','Required when setting Closed or Canceled; saved in the history')}"></textarea></div></div>
      <div class="row"><button class="btn pri">${T('保存修改','Save')}</button><button type="button" class="btn" data-act="editOff">${T('取消','Cancel')}</button></div></form>`;
    else body=`${isStaleClosed(p)?`<div class="note small">${T(`该项目开始已超过 1 年，且超过 1 年没有进展（最后更新：${p.staleClosed.last||'无'}），已按 PMO 老项目规则视为关闭：不需要再更新双周进展，也不会再有风险提醒。`,`This project started over a year ago and has had no progress for over a year (last update: ${p.staleClosed.last||'none'}), so it is closed under the PMO rule for legacy projects: no two-week updates and no risk warnings.`)}${pmo?T('如需重新启动，可在「编辑」中改回进行中。',' To restart it, set it back to In progress in Edit.'):T('如需重新启动，请联系 PMO。',' To restart it, contact the PMO.')}</div>`:''}
      ${!own&&sponsorOf(p)?`<div class="note info small">${T('您是本项目的 ALSA Project Sponsor：可以查看项目和进度（只读），不参与表决；项目由负责人执行，PMO 受控管理。','You are the ALSA Project Sponsor for this project: you can see it and its progress (read only) and do not vote. The owner runs it under PMO control.')}</div>`:''}
      ${(()=>{const h=holdReview(p);return h&&h.due?`<div class="note warn"><b>${T('暂停项目，需要决定去留','Paused: decision needed')}</b><div style="margin-top:4px">${h.why.map(esc).join('；')}${T('。请在项目会上决定恢复推进、取消，或转为跟进项（暂停项目不计入风险）。','. Decide at the project meeting to resume, cancel, or convert to a follow-up (paused projects are not counted as risks).')}</div></div>`:''})()}
      ${(()=>{const g=riskGroups(rs)[0];if(!g)return '';const r=g.main,more=g.items.slice(1);const line=x=>`${esc(T(RISK_CAT[x.cat].zh,RISK_CAT[x.cat].en))} · ${esc(x.title)}${x.detail?`<div class="small muted">${esc(x.detail)}</div>`:''}`;
        return `<div class="note ${r.level==='high'?'bad':'warn'}"><div class="rk-h"><b>${T('主要风险','Main risk')}</b>${lvPill(r.level)}</div><div style="margin-top:6px">${line(r)}<div class="small" style="margin-top:2px"><span class="faint">${T('建议','Suggested')}${CO()}</span>${esc(r.sugg)}</div></div>${more.length?`<details class="rk-more"><summary>${T(`另有 ${more.length} 项风险`,`${more.length} more`)}</summary>${more.map(x=>`<div class="rk-x">${lvPill(x.level)}<div>${line(x)}</div></div>`).join('')}</details>`:''}</div>`})()}
      <dl class="kv">
      <dt>${T('项目名称','Name')} ${L}</dt><dd>${esc(p.name)}</dd>
      <dt>${T('团队','Team')}</dt><dd>${tag(p.team)}${p.section?` · ${esc(secName(p.section))}`:''} <span class="small faint">${esc(gName(team(p.team).group))}</span></dd>
      ${p.alsa?`<dt>ALSA</dt><dd>${lvTag(p)} <span class="small muted">${esc(p.meeting||'')} · ${T('全体成员审批通过，PMO 受控执行','approved by all members, PMO-controlled')}</span></dd>
      <dt>${T('试点市场','Pilot markets')}</dt><dd>${(p.pilots||[]).map(tag).join(' ')||'—'}</dd>
      <dt>ALSA Project Sponsor</dt><dd>${esc(spNames(p)||'—')}${(p.sponsors||[]).length?` <span class="small faint">${T('不参与表决','no vote')}</span>`:''}${pmo&&INFLIGHT.includes(p.status)?` <button class="btn sm ghost" data-act="alsaSp" data-id="${p.id}">${ico('change')}${T('设置','Edit')}</button>`:''}</dd>`:''}
      <dt>${T('负责人','Owner')} ${L}</dt><dd>${esc(p.pic||'—')} ${isDeparted(p.pic)?`<span class="pill p-high">${T('已离职，需更换负责人','Has left; reassign')}</span>`:`<span class="small faint">${esc(emailOf(p.pic))}</span>`}</dd>
      <dt>${T('执行人','Executors')} ${L}</dt><dd>${execHTML(p)}</dd>
      <dt>${T('开始时间','Start')} ${L}</dt><dd class="num">${fd(p.start)}</dd>
      <dt>${T('计划完成','Planned end')} ${L}</dt><dd class="num">${fd(p.end)}</dd>
      <dt>${T('延期记录','Extensions')} ${L}</dt><dd class="small">${delayLines(p).length?delayLines(p).map(x=>`<div>${esc(x)}</div>`).join(''):'—'}</dd>
      ${p.status==='closed'?`<dt>${T('关闭日期','Closed on')}</dt><dd class="num">${fd(p.closedAt)}</dd>`:''}
      <dt>${T('交付进度','Delivered')}</dt><dd>${prog(p)}</dd>
      ${oldCodes(p).length?`<dt>${T('原编号','Old code')}</dt><dd class="mono small">${esc(oldCodes(p).join(' / '))}</dd>`:''}
      ${p.bg?`<dt>${T('立项背景','Background')}</dt><dd>${esc(p.bg.background)}</dd><dt>${T('为什么立项','Why')}</dt><dd>${esc(p.bg.why)}</dd><dt>${T('收益','Benefits')}</dt><dd>${esc(p.bg.benefit)}</dd>`:''}
      <dt>${T('最新进展','Latest update')}</dt><dd class="small">${(()=>{const u=lastBw(p)||lastAnyUpd(p);return u?`${ragPill(u.rag)} <span class="faint num">${esc(u.date||'')}</span><div style="margin-top:4px">${esc(u.done||u.text||'')}</div>`:'<span class="faint">—</span>'})()}</dd>
      <dt>${T('执行要求','Plan')} ${L}</dt><dd class="small">${esc(p.scope||'—')}</dd></dl>
      <div class="row">${own&&!pmo&&INFLIGHT.includes(p.status)?`<button class="btn" data-act="toChange" data-id="${p.id}">${T('申请变更 / 延期','Request change / extension')}</button>${p.status!=='to_report'?`<button class="btn" data-act="toClose" data-id="${p.id}">${T('申请结项','Request close')}</button>`:''}`:''}
      ${pmo?`<button class="btn pri" data-act="editOn">${T('编辑（PMO）','Edit (PMO)')}</button>${INFLIGHT.includes(p.status)?`<button class="btn" data-act="toChange" data-id="${p.id}">${T('代为发起变更','File change')}</button>`:''}${p.status==='to_report'?`<button class="btn ok" data-act="meetClose" data-id="${p.id}">${T('会议通过，关闭项目','Close after meeting')}</button>`:''}${INFLIGHT.includes(p.status)?`<button class="btn" data-act="p2f" data-id="${p.id}">${T('转为跟进项','Convert to follow-up')}</button>`:''}`:''}</div>
      ${!pmo?`<div class="note small">${lockI} ${T('带锁字段（名称、负责人、执行人、开始/完成/延期时间、执行要求）只能通过变更申请修改，PMO 审批后生效。','Locked fields change only through a change request approved by PMO.')}</div>`:''}`;
  }
  if(D.tab==='ms') body=p.milestones.map(m=>{const s=msState(m);const sp={done:['p-closed',T('已提交','Submitted')],overdue:['p-high',T('逾期','Overdue')],soon:['p-mid',T('即将到期','Due soon')],upcoming:['p-low',T('未到期','Upcoming')],nodate:['p-low',T('无日期','No date')]}[s];
    const ev=m.evidence;
    return `<div class="ms ${m.done?'done':''}"><div class="ms-h"><span class="pill ${sp[0]}">${sp[1]}</span><div class="grow"><div>${esc(m.name)}</div><div class="small faint num">${T('截止','Due')} ${fd(m.due)}${(m.dueHistory||[]).length?` <span class="tag" style="color:var(--warn)" title="${esc(m.dueHistory.map(h=>`${h.at}: ${h.from} → ${h.to}`).join('\n'))}">${T('已改期，原定','rescheduled, was')} ${fd(m.dueHistory[0].from)}</span>`:''} · ${fList(m.forms)}${m.auto?` · <span title="${T('迁移时根据原表「执行范围与交付物」自动拆分，日期按项目周期均分，请负责人确认','Auto-split from the old sheet; dates spread evenly. Owner to confirm.')}">${T('系统拆分·待确认','auto-split')}</span>`:''}</div></div>
      ${!m.done&&own&&running?`<button class="btn sm pri" data-act="msForm" data-mid="${m.id}">${T('提交成果','Submit')}</button>`:''}${m.done&&pmo&&ev&&ev.by!=='系统迁移'?`<button class="btn sm" data-act="msReturn" data-mid="${m.id}">${T('驳回','Reject')}</button>`:''}</div>
      ${ev?`<div class="ev">${esc(ev.text||'')}${ev.email?`\n${T('邮件','Email')}${CO()}${esc(ev.email)}`:''}${(ev.files||[]).map(f=>f.data&&/^data:image\//.test(f.data)?`<img src="${f.data}" alt="${esc(f.name)}">`:'').join('')}${(ev.files||[]).filter(f=>!(f.data&&/^data:image\//.test(f.data))).length?`<div class="row" style="margin-top:6px">${fileLinks((ev.files||[]).filter(f=>!(f.data&&/^data:image\//.test(f.data))))}</div>`:''}<div class="faint">${esc(ev.by||'')} · ${esc(ev.at||'')}</div></div>`:''}
      ${m.returned&&!m.done?`<div class="note warn small">${T('PMO 驳回','Rejected by PMO')}${CO()}${esc(m.returned)}</div>`:''}
      <form class="form msf" data-mid="${m.id}" hidden><div class="f"><label>${T('文字说明','Description')}<span class="req">*</span></label><textarea name="text" required></textarea></div><div class="fgrid"><div class="f"><label>${T('相关邮件（主题 / 日期）','Email reference')}</label><input type="text" name="email"></div><div class="f"><label>${T('图片 / 文件（任意格式：PPT、PDF、Excel、视频、压缩包…）','Images and files (any format: PPT, PDF, Excel, video, archives…)')}</label><input type="file" name="files" multiple accept="image/*,${FILE_ACCEPT}"></div></div><div class="row"><button class="btn pri">${T('确认提交','Submit')}</button></div></form></div>`}).join('')||`<div class="empty">${T('没有里程碑','No milestones')}</div>`;
  if(D.tab==='ms'&&(p.removedMs||[]).length)body+=`<div class="note small"><b>${T('已删除的节点','Removed milestones')}</b>${p.removedMs.map(x=>`<div>${esc(x.name)} <span class="faint">(${fd(x.due)}) · ${esc(x.why||'')} · ${esc(x.at||'')}</span></div>`).join('')}</div>`;
  if(D.tab==='ms'&&(p.closeFiles||[]).length)body=`<div class="card"><div class="card-b"><div class="lbl" style="margin-bottom:6px">${T('结项汇报材料','Close report files')}</div><div class="row">${fileLinks(p.closeFiles)}</div></div></div>`+body;
  if(D.tab==='upd') body=bwTab(p,own);
  if(D.tab==='info'&&(p.delays||[]).length)body=delayBlock(p)+body;
  if(D.tab==='hist'){const rq=S.requests.filter(r=>r.pid===p.id);body=`<div class="timeline">${[...p.history].reverse().map(h=>`<div class="tl"><span class="d">${esc(String(h.at).slice(0,10))}</span><div class="x">${esc(h.text)}<div class="small faint">${esc(h.by)}</div></div></div>`).join('')}</div>${rq.length?`<div class="lbl">${T('相关申请','Requests')}</div>`+rq.map(r=>reqCard(r,false)).join(''):''}`}
  if(D.tab==='iss'){const is=S.issues.filter(i=>i.pid===p.id);body=is.map(i=>`<div class="ms"><div class="ms-h">${lvPill(i.sev)}<div class="grow">${esc(i.text)}<div class="small faint">${esc(i.owner||'—')} · ${T('期望解决','target')} ${fd(i.due)}</div></div>${i.status==='open'?`<span class="pill p-open">${T('处理中','Open')}</span>`:`<span class="pill p-closed">${T('已解决','Resolved')}</span>`}</div></div>`).join('')||`<div class="empty">${T('没有问题记录，可在「风险与问题 → 问题清单」中添加','No issues. Add one under Risks & issues → Issues.')}</div>`}
  return `<div class="d-h"><div class="row">${dBack()}${p.alsa?'<span class="alsa-tag">ALSA</span>':''}<span class="mono" style="font-weight:600">${p.code}</span>${tag(p.team)}${stPill(p)}${lvPill(pLevel(p))}<span class="sp" style="flex:1"></span><button class="btn sm icon-btn" data-act="closeDrawer" aria-label="${T('关闭','Close')}" title="${T('关闭（Esc）','Close (Esc)')}">${ico('x')}</button></div><h2 id="dTitle" tabindex="-1">${esc(p.name)}</h2>
    <div class="tabs" role="tablist" aria-label="${T('项目信息','Project sections')}">${tabs.map(([k,l])=>`<button class="${D.tab===k?'on':''}" role="tab" aria-selected="${D.tab===k}" tabindex="${D.tab===k?0:-1}" data-act="dtab" data-val="${k}">${l}</button>`).join('')}</div></div><div class="d-b">${body}</div>`;
}
function followDrawer(f,D){
  const own=canSee(f)||fParty(f),pmo=isPMO();
  return `<div class="d-h"><div class="row">${dBack()}<span class="mono" style="font-weight:600">${f.code}</span>${tag(f.team)}${f.section?`<span class="small muted">${esc(secName(f.section))}</span>`:''}<span class="pill ${f.status==='open'?'p-open':'p-closed'}">${f.status==='open'?T('跟进中','Open'):f.status==='converted'?T('已转项目','Converted'):T('已关闭','Closed')}</span><span class="sp" style="flex:1"></span><button class="btn sm icon-btn" data-act="closeDrawer" aria-label="${T('关闭','Close')}" title="${T('关闭（Esc）','Close (Esc)')}">${ico('x')}</button></div><h2 id="dTitle" tabindex="-1">${esc(f.name)}</h2><div></div></div>
  <div class="d-b"><dl class="kv"><dt>${T('类型','Type')}</dt><dd>${pmo&&f.status==='open'?`<select id="fType" style="width:auto" aria-label="${T('类型','Type')}">${Object.entries(FT).map(([k,v])=>`<option value="${k}" ${f.ftype===k?'selected':''}>${esc(T(v.zh,v.en))}</option>`).join('')}</select>`:esc(T(FT[f.ftype].zh,FT[f.ftype].en))}</dd>
    ${pmo&&f.team==='SEN'?`<dt>${T('科室','Section')}</dt><dd><select id="fSec" style="width:auto" aria-label="${T('科室','Section')}"><option value="">—</option>${SECTIONS.map(x=>`<option value="${x}" ${f.section===x?'selected':''}>${esc(secName(x))}</option>`).join('')}</select> <span class="small faint">${T('科室决定谁能看到','The section decides who can see it')}</span></dd>`:''}
    <dt>${T('跟进人','Owner')}</dt><dd>${esc(f.pic||'—')}</dd><dt>${T('开始日期','Start')}</dt><dd class="num">${fd(f.start)}</dd><dt>${T('截止日期','End date')}</dt><dd class="faint">${T('跟进项不设截止日期','Follow-ups have no end date')}</dd>
    ${f.link?`<dt>${T('来源项目','From project')}</dt><dd class="mono">${esc(f.link)}</dd>`:''}${f.old?`<dt>${T('原编号','Old code')}</dt><dd class="mono small">${esc(f.old)}</dd>`:''}
    <dt>${T('说明','Notes')}</dt><dd class="small">${esc(f.scope||'—')}</dd></dl>
    ${pmo&&f.status==='open'?`<div class="row"><button class="btn pri" data-act="f2p" data-id="${f.id}">${T('转为项目（进入立项申请）','Convert to project')}</button><button class="btn" data-act="fClose" data-id="${f.id}">${T('关闭跟进项','Close')}</button></div>`:''}
    ${pmo&&f.status==='closed'?`<div class="row"><button class="btn" data-act="fReopen" data-id="${f.id}">${T('重新打开','Reopen')}</button></div>`:''}
    ${own&&f.status==='open'?`<form class="form" id="updForm"><div class="f"><label>${T('跟进记录','Update')}</label><textarea name="text" required></textarea></div><div class="row"><button class="btn pri">${T('发布','Post')}</button></div></form>`:''}
    <div class="lbl">${T('跟进记录','Updates')}${(f.updates||[]).length?` · ${f.updates.length}`:''}</div><div class="timeline">${tlList('f'+f.id,[...(f.updates||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))),u=>`<div class="tl"><span class="d">${esc(u.date)}</span><div class="x">${esc(u.text)}<div class="small faint">${esc(byName(u.by))}</div></div></div>`,T('暂无记录','None yet'))}</div>
    <div class="lbl">${T('历史','History')}</div><div class="timeline">${[...f.history].reverse().map(h=>`<div class="tl"><span class="d">${esc(String(h.at).slice(0,10))}</span><div class="x">${esc(h.text)} <span class="small faint">${esc(h.by)}</span></div></div>`).join('')}</div></div>`;
}
const dBack=()=>`<button class="btn sm d-back" data-act="back" title="${T('返回上一个界面','Back to the previous screen')}">${ico('chevL')}${T('返回','Back')}</button>`;
// project → follow-up (keeps team and section, so the same people still see it); the project is canceled
function projToFollow(p,why){
  const code=nextCode(p.team,today().slice(2,4),true);
  S.follows.unshift({id:'f'+uid(),code,kind:'follow',team:p.team,section:p.section||'',name:p.name,pic:p.pic,exec:p.exec,start:today(),end:null,ftype:'incubate',status:'open',scope:p.scope,link:p.code,updates:[],history:[{at:nowStamp(),by:'Aiden',text:T(`由项目 ${p.code} 转为跟进项`,`Converted from project ${p.code}`)}]});
  if(typeof voidPending==='function')voidPending(p,'canceled',why,'Aiden');
  p.status='canceled';p.history.push({at:nowStamp(),by:'Aiden',text:T(`转为跟进项 ${code}，项目取消`,`Converted to follow-up ${code}; project canceled`)+(why?(S.lang==='en'?` (reason: ${why})`:`（原因：${why}）`):'')});
  return code;
}
function curItem(){const D=S.drawer;return D.kind==='p'?S.projects.find(x=>x.id===D.id):S.follows.find(x=>x.id===D.id)}
/* ---- files: the live system stores them in Supabase Storage (window.fileBackend, set by sync.js); the demo keeps small files in the browser ---- */
const FILE_ACCEPT='*/*';   // any file: documents, images, video, archives, mail
const FILE_DEMO_MAX=1.5*1024*1024;
async function filePut(file,pid){
  if(window.fileBackend)return window.fileBackend.put(file,pid);
  if(file.size>FILE_DEMO_MAX){const e=new Error('too big');e.code='too_big';throw e}
  return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res({name:file.name,size:file.size,type:file.type,data:r.result,at:today(),by:me().name});r.onerror=()=>rej(new Error('read'));r.readAsDataURL(file)});
}
const tooBigMsg=()=>window.fileBackend?T('文件太大（上限 50 MB）','File too large (limit 50 MB)'):T('演示版每个文件最大 1.5 MB（正式版可达 50 MB）','The demo accepts files up to 1.5 MB each (the live system allows 50 MB)');
const FILE_REG=new Map();
const fileSize=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round((n||0)/1024))+' KB';
const fileLink=f=>{const k='fo'+uid();FILE_REG.set(k,f);return `<button type="button" class="lib-ref" data-fo="${k}" title="${esc(f.name)}">${ico('clip')} ${esc(f.name)}${f.size?` <span class="faint">(${fileSize(f.size)})</span>`:''}</button>`};
const fileLinks=a=>(a||[]).map(fileLink).join(' ');
async function fileOpen(f){
  try{
    if(f.data){const a=document.createElement('a');a.href=f.data;a.download=f.name;document.body.appendChild(a);a.click();a.remove();return}
    if(window.fileBackend&&f.path){const u=await window.fileBackend.url(f);window.open(u,'_blank','noopener');return}
    toast(T('这个文件只记录了文件名，没有保存内容','Only the file name was kept for this file'),'info');
  }catch(e){toast(T('无法打开文件','Could not open the file'),'err')}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-fo]');if(!b)return;e.preventDefault();e.stopPropagation();const f=FILE_REG.get(b.dataset.fo);f&&fileOpen(f)},true);
function readFiles(list,pid){pid=pid||((typeof curItem==='function'&&curItem())||{}).id;return Promise.all(Array.from(list||[]).map(async f=>{try{return await filePut(f,pid)}catch(e){if(e&&e.code==='too_big')throw e;return {name:f.name,size:f.size}}}))}

/* ================= mail center: create drafts → review (optional) → send ================= */
const isDraft=m=>m.status==='draft';
const MAIL_TYPES=()=>[['R1',T('节点提前提醒（下一个未完成节点）','Milestone heads-up (next open milestone)')],['R2',T('结项汇报提醒','Close-report heads-up')],['R6',T('双周进展提醒','Two-week progress reminder')],['custom',T('自定义邮件（自己写内容）','Custom message (write it yourself)')]];
const fmtRcpt=a=>(a||[]).map(x=>x.e?(x.n&&x.n.toLowerCase()!==x.e?`${x.n} <${x.e}>`:x.e):x.n).join('; ');
function parseRcpt(str){
  return String(str||'').split(/[;\n]|,(?![^<]*>)/).map(x=>x.trim()).filter(Boolean).map(tok=>{
    const m=tok.match(/^(.*?)\s*<([^>]+)>$/);
    if(m)return {n:m[1].trim()||m[2].trim(),e:m[2].trim().toLowerCase()};
    if(tok.includes('@'))return {n:tok,e:tok.toLowerCase()};
    return {n:tok,e:String(emailOf(tok)||'').toLowerCase()};
  });
}
const noAddr=m=>[...m.to,...m.cc].filter(x=>!x.e).map(x=>x.n);
// why a draft cannot be sent yet ('' = fine)
function mailProblem(m){
  if(!m.to.some(x=>x.e))return T('收件人没有邮箱地址','No recipient has an email address');
  if(noAddr(m).length)return T('这些人没有邮箱，请补上或删除：','These people have no email, fix or remove: ')+noAddr(m).join('、');
  if(!String(m.subject||'').trim())return T('主题不能为空','Subject is empty');
  return '';
}
const IS_DEMO=()=>typeof DEMO_BUILD!=='undefined'&&DEMO_BUILD;
// One email per project and person: once a mail about a project has gone out (from the dashboard or from Email reminders),
// pending drafts about the same project to the same people are dropped, so nothing is sent twice. Drafts sent in the same batch are left alone.
const mailKey=x=>String(x.e||'').toLowerCase()||norm(x.n);
const mailOverlap=(a,b)=>{const k=new Set(a.to.map(mailKey));return b.to.some(x=>k.has(mailKey(x)))};
function coverDrafts(m,except){if(!m.ref)return 0;let n=0;S.mails.forEach(d=>{if(d!==m&&isDraft(d)&&d.ref===m.ref&&!(except||[]).includes(d.id)&&mailOverlap(m,d)){d.status='discarded';d.coveredBy=m.id;d.coveredAt=nowStamp();n++}});return n}
function queueMail(m,except){
  m.status=IS_DEMO()?'sent':'queued';m.sentAt=nowStamp();m.by=S.user;
  const n=coverDrafts(m,except);if(n)toast(T(`同一项目、同一收件人的另外 ${n} 封待发送草稿已自动作废，避免重复发送`,`${n} other draft(s) for the same project and recipients were dropped, so nothing is sent twice`),'info');
}

/* ---- creating drafts ---- */
function genFromPicked(){
  const g=S.filters.mgen||{};const sel=g.sel||[];
  if(!sel.length){toast(T('请先勾选项目','Tick at least one project first'),'warn');return}
  const type=g.type||'R1',t=today();let n=0;const skip=[];
  for(const id of sel){
    const p=S.projects.find(x=>x.id===id);if(!p)continue;
    const ms=(p.milestones||[]).filter(m=>m.due).sort((a,b)=>a.due.localeCompare(b.due));
    let a=null;
    if(type==='R1'){const m=ms.find(x=>!x.done);if(m)a=MB.R1(p,m,ms)}
    else if(type==='R2'){if(p.end)a=MB.R2(p)}
    else if(type==='R6')a=MB.R6(p,periodOf(trackOf(p.team),t));
    else{const mg=mgrOfP(p);a={to:[p.pic,...(p.exec||[])].filter(Boolean),cc:mg&&mg.name!==p.pic?[mg.name]:[],subject:`[${p.code}] `,body:`${p.pic||''}${CM()}${T('您好','Hello')}\n\n\n${T('项目','Project')} ${p.code}「${p.name}」${sig()}`,rule:'custom',ref:p.id}}
    if(!a||S.mails.some(x=>isDraft(x)&&x.rule===a.rule&&x.ref===a.ref)){skip.push(p.code);continue}
    sendMail(a);n++;
  }
  S.filters.mgen={...g,sel:[]};save();render();
  toast(n?T(`已生成 ${n} 封草稿，请在下方审阅后发送`,`${n} drafts created. Review and send them below.`)+(skip.length?T(`（${skip.length} 个项目跳过：已有草稿或无可提醒的节点）`,` (${skip.length} skipped: already drafted or nothing to remind)`):''):T('没有生成草稿：所选项目已有草稿或没有可提醒的内容','No drafts created: the selected projects already have one or have nothing to remind about'),n?'ok':'warn');
}

/* ---- the page ---- */
/* ---- read / unread / new ----
   Unread = an email addressed to you (To or Cc) that you have not opened yet.
   New    = arrived since your last visit to this page.
   Read state is stored per person (database table mail_reads in the live system, the browser in the demo). */
let MAIL_BASE=null,MAIL_BASE_USER=null;
const mailTs=m=>String(m.sentAt||m.at||'');
const mailToMe=m=>{const u=me(),em=String(u.email||'').toLowerCase();return [...m.to,...m.cc].some(x=>(x.e&&em&&String(x.e).toLowerCase()===em)||norm(x.n)===norm(u.name)||(String(x.n).length>2&&norm(u.name).includes(norm(x.n))))};
const mailReadMap=()=>{S.mailRead=S.mailRead||{};return S.mailRead[S.user]=S.mailRead[S.user]||{}};
const isMailRead=m=>!!mailReadMap()[m.id];
const isUnread=m=>mailToMe(m)&&!isMailRead(m);
const mailSeenKey=()=>'pmo-mailseen:'+S.user;
const mailLastSeen=()=>{try{return localStorage.getItem(mailSeenKey())||''}catch(e){return ''}};
const mailSetSeen=()=>{try{localStorage.setItem(mailSeenKey(),nowStamp())}catch(e){}};
const mailBase=()=>{if(MAIL_BASE_USER!==S.user){MAIL_BASE=null;MAIL_BASE_USER=S.user}return MAIL_BASE||(MAIL_BASE=mailLastSeen()||(addDays(today(),-3)+' 00:00'))};
const isNewMail=m=>mailTs(m)>mailBase();
function markRead(ids){const mp=mailReadMap(),fresh=ids.filter(id=>!mp[id]);if(!fresh.length)return;fresh.forEach(id=>{mp[id]=nowStamp()});if(window.mailReadBackend)window.mailReadBackend.mark(fresh);save()}
// the baseline for "new" is fixed when you open the page; it moves forward when you leave it
{const _go=go;go=function(v){if(v==='mail'&&S.view!=='mail'){MAIL_BASE=null;mailBase()}if(S.view==='mail'&&v!=='mail')mailSetSeen();return _go.apply(this,arguments)}}
window.addEventListener('pagehide',()=>{try{if(S&&S.view==='mail')mailSetSeen()}catch(e){}});
const mailStPill=m=>{const x={sent:['p-closed',T('已发送','Sent')],queued:['p-mid',T('已排队','Queued')],failed:['p-high',T('发送失败','Failed')]}[m.status]||['p-low',T('仅记录','Logged')];return `<span class="pill ${x[0]}">${esc(x[1])}</span>`};

// the archive: PMO sees every email; everyone else sees only what was sent to them (To or Cc). raw = ignore the filters (used for the summary numbers)
function mailArchive(raw){
  const pmo=isPMO(),f=S.filters,rf=f.mrule||'',q=(f.mq||'').trim().toLowerCase(),st=pmo?(f.mst||''):'',rng=+(f.mrng||0),vw=f.mview||'';
  const base=S.mails.filter(m=>!isDraft(m)&&m.status!=='discarded'&&(pmo||mailToMe(m)));
  if(raw)return base;
  return base.filter(m=>(!rf||m.rule===rf)&&(!st||(st==='logged'?(!m.status||m.status==='local'):m.status===st))
    &&(!rng||diff(today(),String(m.sentAt||m.at||'').slice(0,10))<=rng)
    &&(!vw||(vw==='unread'?isUnread(m):vw==='read'?(mailToMe(m)&&isMailRead(m)):isNewMail(m)))
    &&(!q||(m.subject+' '+m.body+' '+m.rule+' '+[...m.to,...m.cc].map(x=>x.n+' '+(x.e||'')).join(' ')).toLowerCase().includes(q)));
}
function mailExport(){
  const L=mailArchive();if(!L.length){toast(T('没有可导出的邮件','Nothing to export'),'warn');return}
  const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const rows=[['Date','Status','Rule','Subject','To','Cc','Project','Body']].concat(L.map(m=>{const p=m.ref&&S.projects.find(x=>x.id===m.ref);return [m.sentAt||m.at,(!m.status||m.status==='local')?'logged':m.status,m.rule,m.subject,fmtRcpt(m.to),fmtRcpt(m.cc),p?p.code:'',m.body]}));
  libSaveFile(`Mail archive ${today()}.csv`,String.fromCharCode(0xFEFF)+rows.map(r=>r.map(q).join(',')).join(String.fromCharCode(13,10)));
}
function mail(){
  const pmo=isPMO();const meN=me().name;const rf=S.filters.mrule||'';
  const D=pmo?S.mails.filter(isDraft):[];
  const L=mailArchive();
  const sel=L.find(m=>m.id===S.filters.msel)||null;
  // summary numbers on top: they always count everything you may see, whatever the filters below say
  const A0=mailArchive(true),d7=m=>diff(today(),String(m.sentAt||m.at||'').slice(0,10))<=7;
  const kn={drafts:D.length,queued:A0.filter(m=>m.status==='queued').length,sent7:A0.filter(m=>m.status==='sent'&&d7(m)).length,failed:A0.filter(m=>m.status==='failed').length,fresh:A0.filter(isNewMail).length,unread:A0.filter(isUnread).length,week:A0.filter(d7).length,total:A0.length};
  const kp=(l,v,sub,attr,cls)=>`<button type="button" class="kpi ${cls||''}" ${attr}><span class="l">${l}</span><span class="v">${v}</span><span class="s">${sub}</span></button>`;
  const kpis=pmo?`<div class="kpis">${kp(T('待发送草稿','Drafts to send'),kn.drafts,T('审阅后发送','Review, then send'),'data-m="kf" data-go="mdrafts"')}${kp(T('已排队','Queued'),kn.queued,T('等待服务器发出','Waiting to go out'),'data-m="kf" data-set="mst=queued"')}${kp(T('近 7 天已发送','Sent, last 7 days'),kn.sent7,T('点开看清单','Click to list'),'data-m="kf" data-set="mst=sent&mrng=7"')}${kp(T('发送失败','Failed'),kn.failed,T('需要处理','Needs attention'),'data-m="kf" data-set="mst=failed"',kn.failed?'alert':'')}${kp(T('自上次访问的新邮件','New since your last visit'),kn.fresh,T('新到的邮件','Newly added'),'data-m="kf" data-set="mview=new"')}${kp(T('我的未读','Unread (to me)'),kn.unread,T('发给我、还没打开','Sent to me, not opened'),'data-m="kf" data-set="mview=unread"')}</div>`
    :`<div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">${kp(T('未读','Unread'),kn.unread,T('还没打开的邮件','Not opened yet'),'data-m="kf" data-set="mview=unread"')}${kp(T('自上次访问的新邮件','New since your last visit'),kn.fresh,T('新到的邮件','Newly added'),'data-m="kf" data-set="mview=new"')}${kp(T('近 7 天','Last 7 days'),kn.week,T('收到的邮件','Emails received'),'data-m="kf" data-set="mrng=7"')}${kp(T('全部收到','All received'),kn.total,T('存档，不会删除','Archived, never deleted'),'data-m="kf" data-set="all=1"')}</div>`;
  const who=a=>a.map(x=>`${esc(x.n)}${x.e&&x.e!==String(x.n).toLowerCase()?` &lt;${esc(x.e)}&gt;`:x.e?'':` <span class="faint">(${T('邮箱待补充','email missing')})</span>`}`).join('；');
  const stTag=m=>({queued:T('已排队，约 1 分钟内发出','Queued; goes out within about a minute'),sent:T('已发送','Sent'),failed:T('发送失败','Failed')})[m.status]||T('仅记录，未发出','Logged only');
  const tab=S.filters.mtab||'rules';const g=S.filters.mgen||{type:'R1',sel:[]};
  const picks=S.projects.filter(p=>needsBW(p)||INFLIGHT.includes(p.status)).filter(p=>canView(p)).sort((a,b)=>a.code.localeCompare(b.code));
  const create=pmo?`<div class="card"><div class="card-h"><h2>${T('生成邮件','Create emails')}</h2><span class="sp"></span><div class="seg" role="group"><button class="${tab==='rules'?'on':''}" data-m="tab" data-v="rules">${T('按提醒规则生成','From reminder rules')}</button><button class="${tab==='pick'?'on':''}" data-m="tab" data-v="pick">${T('手动选择项目生成','Pick projects')}</button></div></div>
  ${tab==='rules'?`<div class="card-b form"><div class="row">${IS_DEMO()?`<label class="small muted">${T('模拟日期','Simulated date')} <input type="date" id="simDate" value="${esc(S.simToday||'')}" style="width:auto"></label><button class="btn sm" data-act="simClear">${T('用真实日期','Use real date')}</button>`:''}<label class="small muted">${T('提前提醒天数','Heads-up days')} <input type="number" id="leadDays" min="3" max="60" value="${S.lead||15}" style="width:70px;padding:6px 8px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--surface)"></label><span class="sp" style="flex:1"></span><button class="btn pri" data-act="runRem">${T('按规则检查并生成草稿','Check rules and create drafts')}</button></div>
  <div class="tw"><table class="t"><thead><tr><th>${T('启用','On')}</th><th>${T('规则','Rule')}</th><th>${T('触发条件','Trigger')}</th><th>${T('收件人','Recipients')}</th><th>${T('已生成','Created')}</th></tr></thead><tbody>${RULES.map(r=>`<tr><td><input type="checkbox" data-act="rule" data-k="${r.k}" ${S.rules[r.k]?'checked':''} aria-label="${r.k}"></td><td><b class="mono small">${r.k}</b> ${esc(T(r.zh,r.en))}</td><td class="small">${esc(T(r.d[0],r.d[1]))}</td><td class="small">${esc(T(r.who[0],r.who[1]))}</td><td class="num">${S.mails.filter(m=>m.rule===r.k&&m.status!=='discarded').length}</td></tr>`).join('')}</tbody></table></div>
  <div class="small muted">${T('规则检查只生成草稿，不会直接发出。每条规则对同一节点 / 同一到期日只生成一次；延期获批后按新日期重新生成。','The rule check only creates drafts; nothing is sent by itself. Each rule fires once per milestone and due date; an approved extension resets it.')}</div></div>`
  :`<div class="card-b form"><div class="row"><div class="f" style="min-width:260px"><label for="mgType">${T('邮件类型','Email type')}</label><select id="mgType" data-m="gtype">${MAIL_TYPES().map(([k,l])=>`<option value="${k}" ${(g.type||'R1')===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div><div class="f"><label for="mgQ">${T('搜索项目','Search')}</label><input type="search" id="mgQ" data-m="gq" placeholder="${T('编号 / 名称 / 团队','Code / name / team')}" autocomplete="off"></div><span class="sp" style="flex:1"></span><button class="btn pri" data-m="gen" id="mgGo">${T('生成草稿','Create drafts')} (<span id="mgN">${(g.sel||[]).length}</span>)</button></div>
  <div class="tw" style="max-height:320px;overflow:auto"><table class="t"><thead><tr><th style="width:36px"></th><th>${T('编号','Code')}</th><th>${T('项目','Project')}</th><th>${T('团队','Team')}</th><th>${T('负责人','Owner')}</th></tr></thead><tbody>${picks.map(p=>`<tr data-s="${esc((p.code+' '+p.name+' '+p.team+' '+(p.pic||'')).toLowerCase())}"><td><input type="checkbox" data-m="gsel" value="${p.id}" ${(g.sel||[]).includes(p.id)?'checked':''} aria-label="${esc(p.code)}"></td><td class="mono">${esc(p.code)}</td><td>${esc(p.name)}</td><td>${esc(p.team)}</td><td>${esc(p.pic||'—')}</td></tr>`).join('')||`<tr><td colspan="5" class="empty">${T('没有可选项目','No projects')}</td></tr>`}</tbody></table></div>
  <div class="small muted">${T('生成后进入下方「待发送草稿」，你可以审阅修改，也可以直接发送。','Drafts appear in "Drafts to send" below. Review and edit them, or send them straight away.')}</div></div>`}</div>
  <div class="card" id="mdrafts"><div class="card-h"><h2>${T('待发送草稿','Drafts to send')}</h2><span class="tag">${D.length}</span><span class="sp"></span>${D.length?`<button class="btn sm" data-m="discard">${T('丢弃所选','Discard selected')}</button><button class="btn sm" data-m="sendnow">${T('不审阅，直接发送所选','Send selected without review')}</button><button class="btn sm pri" data-m="review">${T('审阅并发送所选','Review and send selected')}</button>`:''}</div>
  ${D.length?`<div class="tw"><table class="t"><thead><tr><th style="width:36px"><input type="checkbox" data-m="dall" aria-label="${T('全选','Select all')}" checked></th><th>${T('规则','Rule')}</th><th>${T('主题','Subject')}</th><th>${T('收件人','To')}</th><th>${T('状态','State')}</th><th></th></tr></thead><tbody>${D.map(m=>{const pr=mailProblem(m);return `<tr class="click" data-m="open" data-id="${m.id}"><td><input type="checkbox" data-m="dsel" value="${m.id}" checked aria-label="${esc(m.subject)}"></td><td><span class="tag mono">${esc(m.rule)}</span></td><td>${esc(m.subject)}${m.edited?` <span class="tag">${T('已修改','edited')}</span>`:''}</td><td class="small">${esc(m.to.map(x=>x.n).join('、'))}</td><td class="small ${pr?'':'faint'}" style="${pr?'color:var(--warn)':''}">${esc(pr||T('可发送','Ready'))}</td><td style="white-space:nowrap"><button type="button" class="btn sm ${pr?'':'pri'}" data-m="sendone" data-id="${m.id}">${pr?T('补全后发送','Fix and send'):T('发送','Send')}</button></td></tr>`}).join('')}</tbody></table></div>`:`<div class="empty small">${T('没有待发送的草稿。从上方「生成邮件」开始。','No drafts. Start with "Create emails" above.')}</div>`}</div>`:'';
  return `${kpis}${IS_DEMO()?`<div class="note warn small">${T('演示版：数据只保存在你的浏览器里，邮件“发送”后只记录在发件记录中，不会真正发出。','Demo: data lives only in your browser and "sent" emails are only logged here; nothing is delivered.')}</div>`:''}<div class="note info small" ${pmo?'':'hidden'}>${T('邮件先生成为草稿：你可以审阅并修改，也可以不审阅直接发送。发送后邮件进入队列，由服务器在约 1 分钟内发出。审批结果和项目指派等关键通知由系统自动发送。','Emails are created as drafts first. You can review and edit them, or send them without review. Sent emails are queued and go out within about a minute. Key notices (approval results, project assignments) are sent automatically.')}</div>
  ${create}
  <div class="card"><div class="card-h"><h2>${pmo?T('邮件存档','Mail archive'):T('我收到的邮件','Mail I received')}</h2><span class="muted small">${L.length}</span><span class="sp"></span><input type="search" id="mq" aria-label="${T('搜索邮件','Search emails')}" placeholder="${T('搜索主题、收件人、正文','Search subject, recipient, text')}" value="${esc(S.filters.mq||'')}" style="width:210px">${pmo?`<select id="mSt" aria-label="${T('状态','Status')}" style="width:auto">${[['',T('全部状态','All statuses')],['sent',T('已发送','Sent')],['queued',T('已排队','Queued')],['failed',T('发送失败','Failed')],['logged',T('仅记录','Logged only')]].map(([k,l])=>`<option value="${k}" ${(S.filters.mst||'')===k?'selected':''}>${l}</option>`).join('')}</select>`:''}<select id="mView" aria-label="${T('阅读状态','Read state')}" style="width:auto">${[['',T('全部邮件','All emails')],['unread',T('未读','Unread')],['read',T('已读','Read')],['new',T('新邮件','New')]].map(([k,l])=>`<option value="${k}" ${(S.filters.mview||'')===k?'selected':''}>${l}</option>`).join('')}</select><select id="mRng" aria-label="${T('时间','Time')}" style="width:auto">${[['',T('不限时间','Any time')],['7',T('近 7 天','Last 7 days')],['30',T('近 30 天','Last 30 days')],['90',T('近 90 天','Last 90 days')]].map(([k,l])=>`<option value="${k}" ${(S.filters.mrng||'')===k?'selected':''}>${l}</option>`).join('')}</select>${kn.unread?`<button type="button" class="btn sm" data-m="readall">${T('全部标为已读','Mark all as read')}</button>`:''}<button type="button" class="btn sm" data-m="export">${ico('dl')}${T('导出 CSV','Export CSV')}</button><select id="mRule" style="width:auto" aria-label="${T('按提醒规则筛选','Filter by rule')}"><option value="">${T('全部规则','All rules')}</option>${RULES.map(r=>`<option value="${r.k}" ${rf===r.k?'selected':''}>${r.k} ${esc(T(r.zh,r.en))}</option>`).join('')}<option value="custom" ${rf==='custom'?'selected':''}>${T('自定义','Custom')}</option><option value="manual" ${rf==='manual'?'selected':''}>${T('审批 / 手动通知','Approvals / manual')}</option></select></div>
  <p class="small faint" style="margin:0;padding:8px 18px;border-bottom:1px solid var(--line-2)">${pmo?T('所有邮件都会存档，不会被删除；丢弃的草稿不算。','Every email is archived and never deleted; discarded drafts are not counted.'):T('这里只显示发给你（含抄送）的邮件。','Only the emails sent to you, including as cc, are shown here.')}</p>
  ${L.length?`<div class="mailwrap"><div class="mlist">${L.slice(0,200).map(m=>`<div class="mi ${sel&&m.id===sel.id?'on':''} ${isUnread(m)?'unread':''}" data-act="msel" data-id="${m.id}"><span class="s">${isUnread(m)?`<i class="udot" title="${T('未读','Unread')}"></i>`:''}${esc(m.subject)}</span><span class="small faint">${esc(m.sentAt||m.at)} · ${esc(m.to.map(x=>x.n).join('、'))}</span><span class="row" style="gap:6px">${isNewMail(m)?`<span class="pill p-open">${T('新','New')}</span>`:''}${pmo?mailStPill(m):''}${mailToMe(m)&&isMailRead(m)?`<span class="small faint">${T('已读','Read')}</span>`:''}</span></div>`).join('')}</div>
  <div class="mprev">${sel?`<div class="row"><span class="tag mono">${esc(sel.rule)}</span><span class="small faint">${esc(sel.at)} · ${esc(stTag(sel))}</span></div><h3 style="margin:0;font:600 16px/1.35 var(--f-display)">${esc(sel.subject)}</h3><div class="small"><b>${T('收件人','To')}${CO()}</b>${who(sel.to)}${sel.cc.length?`<br><b>${T('抄送','Cc')}${CO()}</b>${who(sel.cc)}`:''}</div><pre>${esc(sel.body)}</pre>${tpMailActs(sel)}${sel.ref?(String(sel.ref).startsWith('a')?`<button class="btn sm" style="align-self:flex-start" data-act="go" data-v="alsa">${T('打开 ALSA 战略项目','Open ALSA projects')}</button>`:`<button class="btn sm" style="align-self:flex-start" data-act="${String(sel.ref).startsWith('f')?'openf':'open'}" data-id="${sel.ref}">${T('打开相关项目','Open project')}</button>`):''}`:`<div class="empty small">${T('点左边的一封邮件查看内容','Select an email on the left to read it')}</div>`}</div></div>`:`<div class="empty">${T('暂无邮件','No emails')}</div>`}</div>`;
}
function mailAfter(){
  const mq=$('#mq');mq&&mq.addEventListener('input',()=>{S.filters.mq=mq.value;const pos=mq.selectionStart;$('#content').innerHTML=mail();mailAfter();enhance($('#content'));const n=$('#mq');if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(e){}}});
  [['mSt','mst'],['mRng','mrng'],['mView','mview']].forEach(([id,k])=>{const el=$('#'+id);el&&el.addEventListener('change',()=>{S.filters[k]=el.value;save();render()})});
  const r=$('#mRule');r&&r.addEventListener('change',()=>{S.filters.mrule=r.value;S.filters.msel=null;save();render()});
  const ld=$('#leadDays');ld&&ld.addEventListener('change',()=>{S.lead=Math.max(3,Math.min(60,+ld.value||15));save();render();toast(T(`已改为提前 ${S.lead} 天提醒`,`Heads-up set to ${S.lead} days`))});
  const d=$('#simDate');d&&d.addEventListener('change',()=>{S.simToday=d.value||null;const n=runReminders();save();render();toast(T(`日期设为 ${today()}，生成 ${n} 封草稿`,`Date set to ${today()}; ${n} drafts created`))});
}

/* ---- draft table + generator interactions (data-m, kept apart from the app's data-act handlers) ---- */
const pickedDrafts=()=>$$('input[data-m=dsel]:checked').map(x=>x.value).filter(id=>S.mails.some(m=>m.id===id&&isDraft(m)));
document.addEventListener('change',e=>{
  const el=e.target;if(!el.dataset||!el.dataset.m)return;
  if(el.dataset.m==='gtype'){S.filters.mgen={...(S.filters.mgen||{}),type:el.value};return}
  if(el.dataset.m==='gsel'){const g=S.filters.mgen=S.filters.mgen||{type:'R1',sel:[]};g.sel=$$('input[data-m=gsel]:checked').map(x=>x.value);const n=$('#mgN');n&&(n.textContent=g.sel.length);return}
  if(el.dataset.m==='dall'){$$('input[data-m=dsel]').forEach(x=>x.checked=el.checked)}
});
document.addEventListener('input',e=>{
  const el=e.target;if(!el.dataset||el.dataset.m!=='gq')return;const q=el.value.trim().toLowerCase();
  $$('tr[data-s]').forEach(tr=>tr.hidden=!!q&&!tr.dataset.s.includes(q));
});
document.addEventListener('click',e=>{
  if(e.target.closest('#mrev'))return;
  const el=e.target.closest('[data-m]');if(!el||el.matches('input,select'))return;
  const a=el.dataset.m;
  if(a==='sendone'){const m=S.mails.find(x=>x.id===el.dataset.id);if(!m||!isDraft(m))return;if(mailProblem(m)){reviewOpen([m.id]);return}queueMail(m,[]);save();render();toast(T('已发送（已排队，约 1 分钟内发出）','Sent (queued; out within about a minute)'));return}
  if(a==='kf'){
    if(el.dataset.go){const t=document.getElementById(el.dataset.go);t&&t.scrollIntoView({behavior:'smooth',block:'start'});return}
    Object.assign(S.filters,{mview:'',mst:'',mrng:'',mq:'',mrule:''},Object.fromEntries(new URLSearchParams(el.dataset.set||'')));delete S.filters.all;S.filters.msel=null;save();render();return}
  if(a==='readall'){markRead(mailArchive(true).filter(isUnread).map(m=>m.id));render();return}
  if(a==='export'){mailExport();return}
  if(a==='tab'){S.filters.mtab=el.dataset.v;render();return}
  if(a==='gen'){genFromPicked();return}
  if(a==='open'){reviewOpen([el.dataset.id]);return}
  if(a==='review'){const ids=pickedDrafts();ids.length?reviewOpen(ids):toast(T('请先勾选草稿','Tick at least one draft'),'warn');return}
  if(a==='discard'){const ids=pickedDrafts();if(!ids.length){toast(T('请先勾选草稿','Tick at least one draft'),'warn');return}
    if(!confirm(T(`丢弃 ${ids.length} 封草稿？`,`Discard ${ids.length} drafts?`)))return;
    S.mails.filter(m=>ids.includes(m.id)).forEach(m=>m.status='discarded');save();render();toast(T('已丢弃','Discarded'),'info');return}
  if(a==='sendnow'){const ids=pickedDrafts();if(!ids.length){toast(T('请先勾选草稿','Tick at least one draft'),'warn');return}
    if(!confirm(T(`不审阅，直接发送 ${ids.length} 封邮件？`,`Send ${ids.length} emails without review?`)))return;
    sendDrafts(ids);return}
});
// queues every sendable draft in ids; returns {sent, blocked:[{m,why}]}
function sendDrafts(ids,quiet){
  const blocked=[];let sent=0;
  for(const m of S.mails.filter(x=>ids.includes(x.id)&&isDraft(x))){const why=mailProblem(m);if(why)blocked.push({m,why});else{queueMail(m,ids);sent++}}
  save();if(!quiet)render();
  if(!quiet)toast(sent?T(`已发送 ${sent} 封（已排队，约 1 分钟内发出）`,`${sent} sent (queued; out within about a minute)`)+(blocked.length?T(`；${blocked.length} 封因收件人问题未发`,`; ${blocked.length} held back for recipient problems`):''):T('没有可发送的邮件','Nothing could be sent'),sent?'ok':'warn');
  return {sent,blocked};
}

/* ---- review window ---- */
function reviewOpen(ids){S.filters.mrev={ids:[...ids],cur:ids[0]};reviewRender()}
function reviewClose(){const d=$('#mrev');d&&d.remove();S.filters.mrev=null;render()}
function reviewRead(){ // copy the editor fields into the current draft
  const R=S.filters.mrev;if(!R||!$('#mrTo'))return;const m=S.mails.find(x=>x.id===R.cur);if(!m)return;
  const to=parseRcpt($('#mrTo').value),cc=parseRcpt($('#mrCc').value),sub=$('#mrSub').value,body=$('#mrBody').value;
  const changed=fmtRcpt(to)!==fmtRcpt(m.to)||fmtRcpt(cc)!==fmtRcpt(m.cc)||sub!==m.subject||body!==m.body;
  if(changed){m.to=to;m.cc=cc;m.subject=sub;m.body=body;m.edited=true;save()}
}
function reviewRender(msg){
  const R=S.filters.mrev;if(!R)return;
  const list=R.ids.map(id=>S.mails.find(m=>m.id===id)).filter(m=>m&&isDraft(m));
  if(!list.length){reviewClose();return}
  if(!list.some(m=>m.id===R.cur))R.cur=list[0].id;
  const m=list.find(x=>x.id===R.cur);
  let d=$('#mrev');if(!d){d=document.createElement('div');d.id='mrev';d.className='scrim qa-scrim';document.body.appendChild(d)}
  const pr=mailProblem(m);
  d.innerHTML=`<div class="qa" role="dialog" aria-label="${T('审阅邮件','Review emails')}" style="width:min(980px,100%);max-height:88vh;display:grid;grid-template-columns:260px minmax(0,1fr);gap:0;padding:0;overflow:hidden">
    <div style="border-right:1px solid var(--line-2);overflow:auto;max-height:88vh"><div class="card-h"><h3 style="margin:0;font:600 15px/1.3 var(--f-display)">${T('待审阅','To review')} (${list.length})</h3></div>${list.map(x=>`<div class="mi ${x.id===m.id?'on':''}" data-r="pick" data-id="${x.id}" tabindex="0"><span class="s">${esc(x.subject||T('（无主题）','(no subject)'))}</span><span class="small faint">${esc(x.to.map(y=>y.n).join('、'))}${x.edited?' · '+T('已改','edited'):''}${mailProblem(x)?' · ⚠':''}</span></div>`).join('')}</div>
    <div style="padding:18px 22px;overflow:auto;max-height:88vh;display:flex;flex-direction:column;gap:12px">
      <div class="f"><label for="mrTo">${T('收件人','To')}</label><input id="mrTo" type="text" value="${esc(fmtRcpt(m.to))}" autocomplete="off"><span class="hint">${T('多人用分号隔开；可写「姓名 <邮箱>」或直接写邮箱','Separate with semicolons. Use "Name <email>" or just an address')}</span></div>
      <div class="f"><label for="mrCc">${T('抄送','Cc')}</label><input id="mrCc" type="text" value="${esc(fmtRcpt(m.cc))}" autocomplete="off"></div>
      <div class="f"><label for="mrSub">${T('主题','Subject')}</label><input id="mrSub" type="text" value="${esc(m.subject)}"></div>
      <div class="f" style="flex:1"><label for="mrBody">${T('正文','Body')}</label><textarea id="mrBody" style="min-height:260px;font:13.5px/1.6 var(--f-body)">${esc(m.body)}</textarea></div>
      ${m.dropped&&m.dropped.length?`<div class="note info small">${T('已自动去掉没有邮箱地址的人：','Left out because no email is on file: ')}${esc(m.dropped.join('、'))}</div>`:''}
      <div id="mrErr">${msg||pr?`<div class="note ${msg?'bad':'warn'}" role="alert">${esc(msg||pr)}</div>`:''}</div>
      <div class="row"><button class="btn" data-r="close">${T('存入待发送，稍后再发','Save to drafts, send later')}</button><button class="btn ghost" data-r="tomail">${T('去邮件提醒页','Open in Email reminders')}</button><span class="sp" style="flex:1"></span><button class="btn" data-r="discard">${T('丢弃这封','Discard this')}</button>${list.length>1?`<button class="btn" data-r="sendall">${T(`发送全部可发送的 (${list.length})`,`Send all sendable (${list.length})`)}</button>`:''}<button class="btn pri" data-r="send">${T('发送这封','Send this one')}</button></div>
    </div></div>`;
}
function reviewNext(){const R=S.filters.mrev;if(!R)return;const left=R.ids.filter(id=>S.mails.some(m=>m.id===id&&isDraft(m)));R.ids=left;if(!left.length){reviewClose();return}R.cur=left[0];reviewRender()}
document.addEventListener('click',e=>{
  const el=e.target.closest('#mrev [data-r]');if(!el)return;const a=el.dataset.r,R=S.filters.mrev;if(!R)return;
  if(a==='pick'){reviewRead();R.cur=el.dataset.id;reviewRender();return}
  if(a==='close'){reviewRead();const had=R.ids.some(id=>S.mails.some(m=>m.id===id&&isDraft(m)));reviewClose();if(had)toast(T('已存入「邮件提醒 → 待发送草稿」，稍后可以在那里直接发送','Saved under Email reminders → Drafts to send; you can send it from there'),'ok');return}
  if(a==='tomail'){reviewRead();const d=$('#mrev');d&&d.remove();S.filters.mrev=null;go('mail');setTimeout(()=>{const t=document.getElementById('mdrafts');t&&t.scrollIntoView({behavior:'smooth',block:'start'})},250);return}
  if(a==='discard'){const m=S.mails.find(x=>x.id===R.cur);if(m){m.status='discarded';save()}reviewNext();return}
  if(a==='send'){reviewRead();const m=S.mails.find(x=>x.id===R.cur);const why=m&&mailProblem(m);
    if(why){reviewRender(why);return}
    queueMail(m,R.ids);save();toast(T('已发送（已排队，约 1 分钟内发出）','Sent (queued; out within about a minute)'));reviewNext();return}
  if(a==='sendall'){reviewRead();const r=sendDrafts(R.ids,true);
    toast(r.sent?T(`已发送 ${r.sent} 封`,`${r.sent} sent`)+(r.blocked.length?T(`；${r.blocked.length} 封因收件人问题留在草稿`,`; ${r.blocked.length} kept as drafts for recipient problems`):''):T('没有可发送的邮件','Nothing could be sent'),r.sent?'ok':'warn');
    if(r.blocked.length){R.ids=r.blocked.map(b=>b.m.id);R.cur=R.ids[0];reviewRender(r.blocked[0].why)}else reviewClose();return}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#mrev')&&!e.isComposing){reviewRead();reviewClose()}});

/* ================= code scheme ================= */
function codes(){
  return `<div class="card"><div class="card-h"><h2>${T('项目编号：EAS - 年份 - 团队 - 流水号','Project code: EAS - YEAR - TEAM - NUMBER')}</h2></div><div class="card-b form">
    <div class="row" style="gap:8px"><span class="code-part"><span class="code-big">EAS</span><small>${T('固定前缀','Fixed prefix')}</small></span><span class="code-big faint">-</span><span class="code-part"><span class="code-big">2026</span><small>${T('立项年份','Year started')}</small></span><span class="code-big faint">-</span><span class="code-part"><span class="code-big">GER</span><small>${T('团队代码','Team code')}</small></span><span class="code-big faint">-</span><span class="code-part"><span class="code-big">007</span><small>${T('团队内当年流水号','Sequence in team & year')}</small></span>
      <span style="width:24px"></span><span class="code-part"><span class="code-big">TEC-26-F03</span><small>${T('跟进项：流水号前加 F','Follow-up: F before the number')}</small></span><span class="code-part"><span class="code-big">SEN-26-A01</span><small>${T('ALSA 项目：流水号前加 A','ALSA project: A before the number')}</small></span></div>
    <ul class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">
      <li>${T('沿用原数据表里的 new project name。表里没有、重复或格式不对的项目，系统按同样的格式补号。','Taken from the new project name column of the data sheet. Projects the sheet leaves out, repeats or spells differently were numbered in the same format.')}</li>
      <li>${T('编号在 PMO 审批立项时由系统自动生成，申请人不能自己填。','Generated by the system when PMO approves; applicants cannot type one.')}</li>
      <li>${T('编号终身不变、不复用：项目延期、换负责人、换团队都不改编号。原来的 ASP 编号和旧平台编号保留在「原编号」里，搜索时也能查到。','Never changes or gets reused. The old ASP code and the old platform code stay under "Old code" and can still be searched.')}</li>
      <li>${T('服务工程部统一使用 SEN；科室（售后商务科、渠道管理、运营管理、平台支持）作为项目属性记录，不进编号。','Service Engineering uses one code, SEN; the section is a project field, not part of the code.')}</li>
      <li>${T('ALSA 战略项目：设立和表决阶段用 GER-26-A01 这样的提案编号；全票通过进入项目库后单独编号 EAS-年份-ALSA-流水号，例如 EAS-2026-ALSA-001，提案编号保留为原编号。','ALSA projects: proposals use a number like GER-26-A01; once approved and in the library they get their own series, EAS-year-ALSA-number, e.g. EAS-2026-ALSA-001, and the proposal number stays as the old code.')}</li></ul></div></div>
  <div class="grid g2">${['R','C'].map(g=>`<div class="card"><div class="card-h"><h2>${esc(gName(g))}</h2><span class="tag ${g}">${S.teams.filter(t=>t.group===g).length}</span></div><div class="tw"><table class="t"><thead><tr><th>${T('代码','Code')}</th><th>${T('团队','Team')}</th><th>English</th></tr></thead><tbody>${S.teams.filter(t=>t.group===g).map(t=>`<tr><td class="mono"><b>${t.code}</b></td><td>${esc((t.dept?t.dept+' · ':'')+t.zh)}</td><td class="small muted">${esc(t.en)}</td></tr>`).join('')}</tbody></table></div></div>`).join('')}</div>`;
}
function codesAfter(){const c=$('#cq');c&&c.addEventListener('input',()=>{S.filters.cq=c.value;const pos=c.selectionStart;$('#content').innerHTML=codes();codesAfter();const n=$('#cq');n.focus();n.setSelectionRange(pos,pos)})}

/* ================= accounts ================= */
const ROLES={mgr:{zh:'国家售后经理 / 中台负责人',en:'Country manager / Dept head'},member:{zh:'国家售后运营经理 / 中台运营',en:'Country ops manager / Dept ops'},viewer:{zh:'只读查看',en:'Read-only'}};
// ✓ / ✗ in the matrix are drawn with the icon set so they match every other control
const permCell=c=>{const m=String(c).match(/^([✓✗])\s*(.*)$/);if(!m)return esc(c);const yes=m[1]==='✓';return `<span class="perm ${yes?'yes':'no'}">${ico(yes?'ok':'x','',m[2]?'':(yes?T('可以','Allowed'):T('不可以','Not allowed')))}${m[2]?esc(m[2]):''}</span>`};
function users(){
  const pmo=isPMO();
  const steps=[[T('提交账号申请','Request'),T('经理或成员在本页填写申请：姓名、公司邮箱、所属团队、申请角色、直属领导','Fill in the request on this page: name, company email, team, role, line manager')],[T('PMO 审批','PMO approves'),T('PMO 核对团队与角色，只开通工作需要的最小权限','PMO checks team and role and grants only what the job needs')],[T('开通并通知','Activated'),T('系统发邮件通知，用公司邮箱单点登录（Microsoft 365），不另设密码','Email notice; sign in with the company account (Microsoft 365 SSO), no extra password')],[T('定期复核 / 离职停用','Review / off-boarding'),T('每季度 PMO 复核一次名单；转岗即改团队，离职当天停用，名下项目提示更换负责人','PMO reviews the list quarterly; team changes on transfer, disabled on the day someone leaves, and their projects are flagged for a new owner')]];
  const M=[
    [T('查看项目与看板','View projects & dashboard'),T('全部团队','All'),T('本团队','Own team'),T('全部 ALSA 项目','All ALSA'),T('自己参与的项目','Own projects'),T('授权团队','Granted teams')],
    [T('提交立项 / 变更 / 结项申请','File new / change / close requests'),'✓',T('✓ 本团队','✓ own team'),'—','✗','✗'],
    [T('提交节点成果、更新进度','Submit deliverables, post updates'),'✓',T('✓ 本团队','✓ own team'),'—',T('✓ 自己负责的节点','✓ own milestones'),'✗'],
    [T('修改名称、负责人、执行人、时间、执行要求','Edit name, owner, executors, dates, plan'),T('✓ 直接修改','✓ direct'),T('✗ 只能申请变更','✗ request only'),'✗','✗','✗'],
    [T('直接立项（无需审批）','Set up projects directly (no approval)'),'✓','✗','✗','✗','✗'],
    [T('审批立项 / 变更 / 结项、会议关闭项目','Approve requests, close after meeting'),'✓','✗','✗','✗','✗'],
    [T('设立 ALSA 项目','Set up ALSA projects'),'✓','✗','✗','✗','✗'],
    [T('ALSA 项目表决','Vote on ALSA projects'),'—','✗',T('✓ 全部 ALSA 项目','✓ all'),'✗','✗'],
    [T('创建 / 转换跟进项','Create / convert follow-ups'),'✓',T('更新跟进记录','post updates'),'—','✗','✗'],
    [T('邮件规则、编码、账号与权限','Email rules, codes, accounts'),'✓','✗','✗','✗','✗']];
  const reqs=(S.acctReqs||[]);
  const form=`<form class="card-b form" id="acctForm"><div class="fgrid">
    <div class="f"><label>${T('姓名','Name')}<span class="req">*</span></label><input type="text" name="name" required></div>
    <div class="f"><label>${T('公司邮箱','Company email')}<span class="req">*</span></label><input type="email" name="email" required></div>
    <div class="f"><label>${T('所属团队','Team')}<span class="req">*</span></label><select name="team">${teamOptions('',allTeams())}</select></div>
    <div class="f"><label>${T('申请角色','Role')}<span class="req">*</span></label><select name="role">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}">${esc(T(v.zh,v.en))}</option>`).join('')}</select></div>
    <div class="f"><label>${T('直属领导','Line manager')}</label><input type="text" name="boss"></div>
    <div class="f"><label>${T('申请原因','Reason')}</label><input type="text" name="why"></div></div>
    <div class="row"><button class="btn pri">${T('提交给 PMO 开通','Send to PMO')}</button></div></form>`;
  return `<div class="card"><div class="card-h"><h2>${T('账号怎么申请和管控','How accounts are requested and controlled')}</h2></div><div class="card-b"><ol class="flow flow-4">${steps.map((x,i)=>`<li><span>${i+1}</span><div><b>${esc(x[0])}</b><div class="small muted">${esc(x[1])}</div></div></li>`).join('')}</ol></div></div>
  <div class="card"><div class="card-h"><h2>${T('角色与权限（开通 / 关闭）','Roles and permissions')}</h2><span class="sp"></span><span class="small faint">${T('原则：按团队隔离、最小权限、锁定字段只能经 PMO 审批修改','Team isolation, least privilege, locked fields change only through PMO')}</span></div><div class="tw"><table class="t"><thead><tr><th>${T('操作','Action')}</th><th>PMO Lead</th><th>${T('团队经理','Team manager')}</th><th>${T('ALSA 成员（附加身份）','ALSA member (add-on)')}</th><th>${T('项目成员','Project member')}</th><th>${T('只读查看','Read-only')}</th></tr></thead><tbody>${M.map(r=>`<tr>${r.map((c,i)=>`<td ${i?'class="small"':''}>${permCell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="card-b small muted">${T('建议开通：PMO Lead（仅你一人）、每个团队 1 位经理、10 位 ALSA 成员（在经理账号上勾选）。项目成员和只读账号按需开通，例如执行人需要自己上传成果、或高层只看看板。','Recommended: one PMO Lead (you), one manager per team, ALSA flag on the 10 members. Add project-member or read-only accounts only when needed, e.g. executors uploading their own evidence or executives viewing the dashboard.')}</div></div>
  ${pmo?`<div class="card"><div class="card-h"><h2>${T('待开通的账号申请','Pending account requests')}</h2><span class="tag">${reqs.filter(r=>r.status==='pending').length}</span></div><div class="list">${reqs.map(r=>`<div class="li" style="cursor:default;flex-wrap:wrap"><div class="grow"><div class="ttl"><b>${esc(r.name)}</b> · ${esc(r.email)}</div><div class="small faint">${esc(tName(r.team))} · ${esc(T(ROLES[r.role].zh,ROLES[r.role].en))}${r.boss?` · ${T('直属领导','manager')} ${esc(r.boss)}`:''} · ${esc(r.at)}${r.why?` · ${esc(r.why)}`:''}</div></div>${r.status==='pending'?`<button class="btn sm ok" data-act="acctOk" data-id="${r.id}">${T('开通','Approve')}</button><button class="btn sm bad" data-act="acctNo" data-id="${r.id}">${T('拒绝','Decline')}</button>`:`<span class="pill ${r.status==='approved'?'p-approved':'p-rejected'}">${r.status==='approved'?T('已开通','Activated'):T('已拒绝','Declined')}</span>`}</div>`).join('')||`<div class="empty">${T('暂无申请','No requests')}</div>`}</div></div>
  <div class="card"><div class="card-h"><h2>${T('账号列表','Accounts')}</h2><span class="muted small">${S.users.filter(u=>u.status!=='disabled').length} ${T('个启用','active')}</span><span class="sp"></span><span class="small faint">${T('邮箱为示例地址，上线前替换为公司邮箱','Emails are placeholders; replace with company addresses')}</span></div>
  <div class="tw"><table class="t"><thead><tr><th>${T('姓名','Name')}</th><th>${T('邮箱','Email')}</th><th>${T('角色','Role')}</th><th>ALSA</th><th>${T('负责团队','Teams')}</th><th>${T('状态','Status')}</th><th></th></tr></thead><tbody>
  ${S.users.map(u=>`<tr style="${u.status==='disabled'?'opacity:.55':''}"><td style="min-width:210px"><span class="row" style="gap:8px;flex-wrap:nowrap"><span class="av">${u.role==='pmo'?'PMO':esc(initials(u.name))}</span><span>${esc(u.name)}${u.title?`<div class="small faint" style="white-space:nowrap">${esc(jobT(u))}</div>`:''}</span></span></td><td><input type="email" value="${esc(u.email)}" data-uf="email" data-id="${u.id}" style="min-width:200px"></td>
    <td>${u.role==='pmo'?'<b>PMO Lead</b>':`<select data-uf="role" data-id="${u.id}" style="width:auto">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${u.role===k?'selected':''}>${esc(T(v.zh,v.en))}</option>`).join('')}</select>`}</td>
    <td class="small">${alsaRoleOf(u.id)?`<span class="alsa-tag">${esc(alsaRoleOf(u.id).en)}</span>`:'—'}</td>
    <td>${u.role==='pmo'?T('全部','All'):`<details data-u="${u.id}"><summary class="small" style="cursor:pointer">${[...u.teams.map(c=>`<span class="tag">${esc(tName(c))}</span>`),...(u.secs||[]).map(k=>`<span class="tag" title="${esc(T('只负责该科室的项目','Only this section’s projects'))}">${esc(secLabel(k))}</span>`)].join(' ')||T('未分配','None')}</summary><div class="row" style="margin-top:8px;gap:6px;max-width:520px">${S.teams.map(t=>`<label class="chk small"><input type="checkbox" data-uf="team" data-id="${u.id}" value="${t.code}" ${u.teams.includes(t.code)?'checked':''}>${esc(tName(t.code))}</label>`).join('')}</div>${u.teams.includes('SEN')?'':`<div class="small faint" style="margin-top:8px">${T('只负责服务工程部的某个科室','Only one section of Service Engineering')}</div><div class="row" style="margin-top:6px;gap:6px;max-width:520px">${SECTIONS.map(x=>`<label class="chk small"><input type="checkbox" data-uf="sec" data-id="${u.id}" value="SEN|${x}" ${(u.secs||[]).includes('SEN|'+x)?'checked':''}>${esc(secName(x))}</label>`).join('')}</div>`}</details>`}</td>
    <td>${u.status==='disabled'?`<span class="pill p-canceled">${T('已停用','Disabled')}</span>`:`<span class="pill p-closed">${T('启用','Active')}</span>`}</td>
    <td style="white-space:nowrap">${u.role!=='pmo'?`${u.status!=='disabled'&&u.role==='mgr'?`<button class="btn sm" data-act="loginAs" data-id="${u.id}">${T('以此身份查看','View as')}</button> `:''}<button class="btn sm ${u.status==='disabled'?'':'bad'}" data-act="acctToggle" data-id="${u.id}">${u.status==='disabled'?T('启用','Enable'):T('停用（离职 / 转岗）','Disable')}</button>`:''}</td></tr>`).join('')}</tbody></table></div></div>
  <div class="card"><div class="card-h"><h2>${T('离职人员','People who have left')}</h2></div><div class="list">${S.departed.map(d=>{const ps=S.projects.filter(p=>p.pic===d.name&&INFLIGHT.includes(p.status));return `<div class="li" style="cursor:default"><div class="grow"><div class="ttl"><b>${esc(d.name)}</b> · ${esc(d.note||'')} · ${esc(d.at)}</div><div class="small faint">${ps.length?T(`仍是 ${ps.length} 个在管项目的负责人，已在风险清单标记为「负责人已离职」：`,`Still owner of ${ps.length} open project(s), flagged in risks: `)+ps.map(p=>p.code).join('、'):T('名下没有在管项目','No open projects')}</div></div>${ps.map(p=>`<button class="btn sm" data-act="open" data-id="${p.id}">${p.code}</button>`).join('')}</div>`}).join('')}</div></div>
  <div class="card"><div class="card-h"><h2>${T('代为登记账号申请','Log a request on someone’s behalf')}</h2></div>${form}</div>`
  :`<div class="card"><div class="card-h"><h2>${T('为团队成员申请账号','Request an account for your team')}</h2></div>${form}</div>
  <div class="card"><div class="card-h"><h2>${T('我的申请','My requests')}</h2></div><div class="list">${reqs.filter(r=>r.by===me().id).map(r=>`<div class="li" style="cursor:default"><div class="grow">${esc(r.name)} · ${esc(r.email)}</div><span class="pill ${r.status==='pending'?'p-pending':r.status==='approved'?'p-approved':'p-rejected'}">${r.status==='pending'?T('待 PMO 开通','Pending'):r.status==='approved'?T('已开通','Activated'):T('已拒绝','Declined')}</span></div>`).join('')||`<div class="empty">${T('暂无','None')}</div>`}</div></div>`}`;
}
function usersAfter(){
  $$('[data-uf]').forEach(el=>el.addEventListener('change',()=>{const u=S.users.find(x=>x.id===el.dataset.id);const k=el.dataset.uf;
    if(k==='email')u.email=el.value.trim();else if(k==='role')u.role=el.value;else if(k==='alsa')u.alsa=el.checked;else if(k==='sec')u.secs=$$(`[data-uf=sec][data-id="${u.id}"]:checked`).map(x=>x.value);else u.teams=$$(`[data-uf=team][data-id="${u.id}"]:checked`).map(x=>x.value);
    const op=!!el.closest('details[open]');save();if(k!=='email'){render();if(op){const d=$(`details[data-u="${u.id}"]`);d&&(d.open=true)}}toast(T('已保存','Saved'))}));
  const f=$('#acctForm');f&&f.addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));if(!d.name.trim()||!d.email.trim())return;
    (S.acctReqs=S.acctReqs||[]).unshift({id:uid(),...d,by:me().id,at:nowStamp(),status:'pending'});
    sendMail({to:['Aiden'],subject:`[${T('账号申请','Account request')}] ${d.name} · ${tName(d.team)}`,body:`${d.name} <${d.email}>\n${T('角色','Role')}${CO()}${T(ROLES[d.role].zh,ROLES[d.role].en)}\n${T('直属领导','Line manager')}${CO()}${d.boss||'—'}\n${d.why||''}${sig()}`,rule:'manual'});
    save();render();toast(T('已提交，等待 PMO 开通','Sent to PMO'))});
}
/* ================= user guide ================= */
// Written for the people who use the platform every day: what each page is for, how to use it, and the usual routines per role.
function guide(){
  const f=S.filters,tab=f.gtab||'start';
  const me_=me();const rk=isPMO()?'pmo':me_.role==='mgr'?'mgr':me_.role==='member'?'ops':'view';
  const tabs=[['start',T(`快速上手`,`Getting started`)],['modules',T(`各模块怎么用`,`Module by module`)],['journey',T(`日常流程`,`Daily routines`)],['life',T(`一个项目的全流程`,`A project from start to finish`)],['faq',T(`常见问题`,`FAQ`)]];
  const li=a=>`<ul class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:5px">${a.map(x=>`<li>${x}</li>`).join('')}</ul>`;
  const go_=(v,l)=>`<button type="button" class="btn sm" data-act="go" data-v="${v}">${l}</button>`;
  const card=(h,b,extra)=>`<div class="card"><div class="card-h"><h2>${h}</h2>${extra||''}</div><div class="card-b form">${b}</div></div>`;
  const youTag=k=>rk===k?` <span class="tag" style="color:var(--accent);border-color:var(--accent-line)">${T(`你的角色`,`Your role`)}</span>`:'';
  let body='';

  if(tab==='start'){
    const roles=[
      ['pmo',T(`PMO`,`PMO`),T(`看全部，包括 ALSA`,`Everything, including ALSA`),T(`全部团队`,`All teams`),T(`可以，也可直接立项`,`Yes, can also set up directly`),T(`可以`,`Yes`),T(`审批申请、分配编号、安排结项汇报、管理账号`,`Approves requests, issues codes, schedules close reviews, manages accounts`)],
      ['mgr',T(`国家售后经理 / 中台负责人`,`Country manager / department head`),T(`看全部非 ALSA 项目`,`All non-ALSA projects`),T(`自己的团队`,`Own team`),T(`可以`,`Yes`),T(`可以`,`Yes`),T(`填写双周进展、提交成果、申请立项 / 变更 / 结项`,`Posts two-week updates, submits deliverables, files new / change / close requests`)],
      ['ops',T(`国家售后运营经理 / 中台运营`,`Country ops manager / department ops`),T(`看全部非 ALSA 项目`,`All non-ALSA projects`),T(`自己的团队`,`Own team`),T(`可以`,`Yes`),T(`不可以`,`No`),T(`与经理相同，但不能申请结项`,`Same as the manager, except it cannot file a close request`)],
      ['view',T(`其他售后同事`,`Other after-sales colleagues`),T(`看全部非 ALSA 项目`,`All non-ALSA projects`),T(`不能编辑`,`Read-only`),T(`不可以`,`No`),T(`不可以`,`No`),T(`查阅、搜索、向资料库提问`,`Browse, search, ask the knowledge library`)]];
    body=card(T(`这个平台是做什么的`,`What this platform is for`),`<p style="margin:0">${T(`这是欧美中东非售后服务中心 PMO 的项目管理平台：项目从申请、审批、编号、执行，到结项、归档，都在这里完成，并且留下完整记录。结项后的资料沉淀成知识库，供今后的项目参考。`,`The project management platform of the Europe, Americas, Middle East and Africa After-sales PMO. A project is applied for, approved, numbered, run, closed and archived here, with a full record at every step. What a closed project leaves behind becomes a knowledge base for the next projects.`)}</p>${li([T(`<b>所有售后同事都可以查看所有项目</b>（ALSA 战略项目除外，只有 ALSA 成员能看）。`,`<b>Everyone in after-sales can read every project</b>, except ALSA strategic projects, which only ALSA members can see.`),T(`<b>只有自己团队的项目可以操作</b>：填进展、交成果、提申请。别的团队的项目是只读的。`,`<b>You act only on your own team's projects</b>: post progress, submit deliverables, file requests. Other teams' projects are read-only.`),T(`项目名称、负责人、执行人、时间、节点这些关键信息被锁定，修改要提交变更申请，由 PMO 审批。`,`Name, owner, executors, dates and milestones are locked. Changing them takes a change request that PMO approves.`)])}`)
    +card(T(`登录与基本操作`,`Signing in and the basics`),li([T(`用公司邮箱登录。`,`Sign in with your company email.`),T(`右上角可以切换中文 / English。`,`Top right: switch between 中文 and English.`),T(`顶部搜索框（快捷键 <kbd>/</kbd>）按项目编号或名称找项目；按 <kbd>?</kbd> 查看全部快捷键。`,`The search box at the top (shortcut <kbd>/</kbd>) finds a project by code or name; press <kbd>?</kbd> for all shortcuts.`),T(`在任何项目列表里，<b>右键点击项目</b>（手机长按，或点行末的 ⋯）会出现可用的操作；你没有权限的操作不会出现。`,`In any project list, <b>right-click a project</b> (long-press on a phone, or use the ⋯ button) to see what you can do; actions you are not allowed to take are not shown.`),T(`点左上角的「返回」可以回到上一页。`,`Use the Back button at the top left to return to the previous page.`)]))
    +card(T(`谁能做什么`,`Who can do what`),`<div class="tw"><table class="t"><thead><tr><th>${T(`角色`,`Role`)}</th><th>${T(`能编辑`,`Can edit`)}</th><th>${T(`立项 / 变更申请`,`New / change requests`)}</th><th>${T(`结项申请`,`Close request`)}</th><th>${T(`说明`,`In short`)}</th></tr></thead><tbody>${roles.map(r=>`<tr style="${rk===r[0]?'background:var(--accent-soft)':''}"><td><b>${r[1]}</b>${youTag(r[0])}</td><td class="small">${r[3]}</td><td class="small">${r[4]}</td><td class="small">${r[5]}</td><td class="small">${r[6]}</td></tr>`).join('')}</tbody></table></div>
      <div class="small muted">${T(`风险与问题：PMO 和被授予全局权限的同事可以看全部团队；其他人只看自己团队。ALSA 项目、会议和议题只对 ALSA 成员和 PMO 开放。`,`Risks and issues: PMO and colleagues with global access can see every team; everyone else sees only their own team. ALSA projects, meetings and topics are open only to ALSA members and PMO.`)}</div>`)
    +card(T(`左边的菜单`,`The left menu`),`<div class="grid g2">${[
      [T(`概览`,`Overview`),T(`看板、甘特图、风险与问题：看现在的全局和自己团队的情况。`,`Dashboard, Gantt, Risks & issues: where things stand, for the whole centre and for your team.`)],
      [T(`项目`,`Projects`),T(`ALSA 项目、项目库（所有项目）、项目资料库（已结项的知识库）、跟进项。`,`ALSA projects, the Project library (all projects), the Knowledge library (closed projects) and Follow-ups.`)],
      [T(`申请中心`,`Requests`),T(`项目申请、项目变更、申请结项：所有需要 PMO 审批的事都从这里提交。`,`New project, Change request, Close request: everything that needs PMO approval starts here.`)],
      [T(`工作台`,`My work`),T(`双周更新、我的待办审批、邮件提醒：每天、每两周要做的事。`,`Two-week updates, My approvals, Email reminders: what you do every day and every two weeks.`)],
      [T(`参考`,`Reference`),T(`项目编码规则、账号与权限、本使用手册。`,`Project code scheme, Accounts & access, and this guide.`)]].map(([h,b])=>`<div class="note"><b>${h}</b><div class="small muted" style="margin-top:4px">${b}</div></div>`).join('')}</div>`);
  }

  if(tab==='modules'){
    const M=[
      ['dashboard',T(`项目看板`,`Dashboard`),T(`一眼看到项目总数、进行中、跟进项、ALSA、本年立项 / 关闭、预警项目，以及需要重点关注的在管项目。`,`Totals at a glance: open, in progress, follow-ups, ALSA, started and closed this year, red flags, and a focus list of running projects.`),[T(`默认显示你自己团队；点顶部的开关可以看全部团队。`,`It opens on your own team; use the switch at the top to see all teams.`),T(`点击任意数字卡片会跳到对应的项目列表。`,`Click any number card to open the matching project list.`),T(`PMO 打开看板先看「今日关注清单」：最上面的数字是待处理的事（逾期、上报受阻、双周更新未交、14 天内到期、30 天无更新），点一个就筛选；清单只列有问题的项目和原因。看完一个点「已看过」，7 天内不再出现，有新情况会自动回来；发现问题严重的项目，点「写邮件并发送」，直接在页面上打开邮件窗口，改完收件人和内容可以马上发送，也可以「存入待发送，稍后再发」，之后在「邮件提醒 → 待发送草稿」里一键发送。同一个项目、同一收件人发过一封，另一边重复的草稿会自动作废，不会发两遍。全部项目的数字和图表收在最下面的「项目组合总览」。`,`PMO opens the dashboard on "Needs attention today": the numbers on top are things to act on (overdue, blocked, update missing, closing in 14 days, no update for 30 days); click one to filter. The list holds only projects with a problem, with the reason. Click "Reviewed" and a project stays away for 7 days, coming back by itself if something new shows up; for a serious one, "Write and send email" opens the email editor right there: change recipients and text, then send now, or "Save to drafts, send later" and send it from Email reminders → Drafts to send. Once a mail about a project has gone out to someone, duplicate drafts for the same project and person are dropped, so nothing is sent twice. The numbers and charts for all projects are under "Portfolio overview" at the bottom.`),T(`重点关注表里的「最新进展」是负责人在双周更新里填的状态。`,`In the focus list, "Latest update" is the status the owner posted in the two-week update.`)],T(`所有人`,`Everyone`)],
      ['gantt',T(`甘特图`,`Gantt`),T(`每个项目的起止时间和节点（菱形）。`,`Each project's start and end, with its milestones as diamonds.`),[T(`鼠标移到菱形上看节点日期、交付物和提交形式；改过期的节点会提示原定日期。`,`Hover a diamond for its date, deliverable and format; a rescheduled milestone also shows its original date.`),T(`区域和中台默认只看自己团队，可切换到全部团队；PMO 默认看全部。`,`Regional and back-office users open on their own team and can switch to all; PMO sees all by default.`),T(`可按时间范围、团队、状态筛选，点 ▸ 展开节点。`,`Filter by time range, team and status; click ▸ to list milestones.`)],T(`所有人`,`Everyone`)],
      ['risks',T(`风险与问题`,`Risks & issues`),T(`系统每次打开时自动扫描：节点逾期、进度和时间脱节、超期未结项、频繁延期、长期没有更新、负责人上报“有风险 / 受阻”等。`,`Scanned automatically each time you open the app: overdue milestones, delivery behind time, past the end date, repeated extensions, no updates for long, and owners reporting "At risk" or "Blocked".`),[T(`最上面是三个等级的数量和风险类别，点一下就筛选。`,`The top shows the count per level and the risk categories; click to filter.`),T(`有全局权限的人还能看到「团队 × 风险类别」矩阵，点数字筛选下面的清单。`,`People with global access also get a team × category matrix; click a number to filter the register.`),T(`清单可以按团队、等级、类别分组。「通知负责人」会生成提醒，「已处理」把它收起来。`,`Group the register by team, level or category. "Notify owner" prepares a reminder; "Handled" puts it away.`),T(`「问题清单」记录已经发生的问题，「暂停项目复核」列出暂停太久、需要决定的项目。`,`"Issues" logs problems that already happened; "Paused projects" lists projects on hold that need a decision.`)],T(`你只能看到自己团队的风险；PMO 和有全局权限的同事看全部。`,`You see your own team's risks; PMO and colleagues with global access see all.`)],
      ['alsa',T(`ALSA 战略项目`,`ALSA projects`),T(`由 ALSA 指导委员会和执行成员审批的战略项目，以及 ALSA 会议议题。`,`Strategic projects voted on by the ALSA steering and execution members, and ALSA meeting topics.`),[T(`PMO 发起，ALSA 成员在页面里表决或提出意见。`,`PMO sets them up; ALSA members vote or give comments on the page.`),T(`通过后项目编号带 A，例如 GER-26-A01。`,`Approved projects get an A in the code, e.g. GER-26-A01.`)],T(`仅 ALSA 成员和 PMO`,`ALSA members and PMO only`)],
      ['projects',T(`项目库`,`Project library`),T(`收录所有项目，不论状态：进行中、暂停、已关闭，也包括已取消和不再推进的。`,`Every project, whatever its status: in progress, on hold, closed, and also canceled or no longer pursued.`),[T(`进入先看总览：按状态、按团队的卡片，点一张卡片看对应的项目列表。`,`It opens on an overview with cards by status and by team; click a card to list those projects.`),T(`列表里可以搜索和筛选，每行末尾的 ⋯（或右键）是你可以做的操作。`,`In the list you can search and filter; the ⋯ at the end of a row (or a right-click) shows what you can do.`),T(`点开项目看详情：节点与成果、双周进展、历史、问题。`,`Open a project for its details: milestones and deliverables, two-week updates, history and issues.`)],T(`所有人（别的团队只读）`,`Everyone (other teams read-only)`)],
      ['library',T(`项目资料库`,`Knowledge library`),T(`只收已经结项、并完成结项汇报的项目，整套资料归档成知识库。取消和不再推进的项目不在这里。`,`Only projects that closed after the close review. Their full material is archived as a knowledge base. Canceled or dropped projects are not here.`),[T(`顶部的助手可以用自然语言提问，比如“哪些项目做过电池维修中心？”，它会返回相关项目和要点，并标出处，点编号就能打开项目。`,`The assistant at the top answers questions in plain language, e.g. "which projects built a battery repair centre?", with the matching projects, key points and sources. Click a code to open the project.`),T(`下面的归档项目可以按区域、团队、年份、负责人筛选，也可以导出资料包。`,`Below, filter archived projects by group, team, year and owner, or export a project pack.`),T(`它只查资料库，不会替你写新方案。`,`It only looks things up; it does not write new plans.`)],T(`所有人`,`Everyone`)],
      ['follows',T(`跟进项`,`Follow-ups`),T(`还不够立项、但需要持续盯的事项：孵化评估、日常监控、结项后监控。没有截止日期，只有持续的跟进记录。`,`Things not ready to be a project but worth watching: incubation, routine monitoring, post-close monitoring. No end date, just a running log.`),[T(`默认看自己团队，可切换到全部团队；可按团队、类型、时间、状态筛选。`,`Opens on your team, switchable to all; filter by team, type, time and status.`),T(`PMO 创建并分配跟进项，负责人定期写跟进记录。需要时可以转为正式项目。`,`PMO creates and assigns them; the owner posts updates regularly. A follow-up can be converted to a project.`)],T(`PMO 创建；各团队跟进`,`PMO creates; teams follow up`)],
      ['apply',T(`项目申请`,`New project`),T(`申请一个新项目。`,`Apply for a new project.`),[T(`选团队，填背景、为什么做、预期收益、负责人、执行人、起止时间。`,`Choose the team, then fill in background, why, benefits, owner, executors, start and end.`),T(`列出节点：每个节点写清交付成果、截止日期，并选择成果提交形式：图文汇报、邮件跟进、项目文件展示，或者「其他」（自己写）。`,`List the milestones: for each, the deliverable, the due date and the evidence format: report with text and images, email follow-up, project files shown, or "Other" (write your own).`),T(`提交后由 PMO 审批；通过时系统生成项目编号。PMO 退回的申请可以修改后重新提交。`,`PMO reviews it; on approval the system issues the project code. A returned request can be edited and resubmitted.`)],T(`经理、运营经理、PMO`,`Managers, ops managers, PMO`)],
      ['change',T(`项目变更`,`Change request`),T(`项目立项后，名称、负责人、执行人、时间、节点这些信息都是锁定的，要改就在这里申请。`,`After approval, name, owner, executors, dates and milestones are locked; change them here.`),[T(`<b>申请延期</b>：填新的完成日后，同一页逐条重排未完成的节点，每个节点可以保持、改期、改交付物、删除（要写原因）或新增。页面会实时提示影响。`,`<b>Extension</b>: after the new end date, re-plan every open milestone on the same page: keep, move, change the deliverable, drop (with a reason) or add. The page shows the impact as you go.`),T(`也可以只调整节点和交付成果、换负责人或执行人、改名称、改开始时间，或申请暂停 / 取消项目。`,`You can also change only milestones and deliverables, the owner or executors, the name or the start date, or ask to put the project on hold or cancel it.`),T(`PMO 批准后，改动自动写进项目：完成日、节点、交付物都会更新，项目库、看板、甘特图同步变化，改过期的节点会标出原定日期。`,`Once PMO approves, the changes are written into the project automatically: end date, milestones and deliverables update, and the library, dashboard and Gantt follow. Rescheduled milestones show their original date.`)],T(`经理、运营经理、PMO`,`Managers, ops managers, PMO`)],
      ['close',T(`申请结项`,`Close request`),T(`项目做完后申请结项。只有国家售后经理、中台负责人和 PMO 可以提交。`,`Request closing when the project is done. Only country managers, department heads and PMO can file it.`),[T(`逐项核对交付物：已完成的勾选，并上传文件（PPT、PDF、Excel、截图等）；已经提交过成果的节点可以不再上传。没完成的要写原因。`,`Check each deliverable: tick the completed ones and upload the files (PPT, PDF, Excel, screenshots). A milestone that already has evidence on file does not need another upload. Write a reason for any that are not done.`),T(`必须上传结项汇报材料（通常是 PPT），这也是项目会议上要汇报的内容。`,`The close report (usually a PPT) is required; it is what you present at the project meeting.`),T(`填写成果总结、收益、遗留事项，也可以选择结项后转为跟进项继续监控。`,`Add the summary, benefits and open points; you can also keep a follow-up to monitor after closing.`),T(`PMO 预审通过后，项目进入「待结项汇报」，在项目会议上汇报通过才正式关闭，之后自动进入项目资料库。`,`After PMO pre-review the project moves to "Awaiting close review"; it closes once approved at the project meeting, and then joins the Knowledge library.`)],T(`国家售后经理 / 中台负责人 / PMO`,`Country manager / department head / PMO`)],
      ['biweekly',T(`双周更新`,`Two-week updates`),T(`项目会每两周开一次，英文会和中文会隔周轮换。每个项目每两周更新一次进展。`,`Project meetings run every two weeks, with English and Chinese meetings in alternate weeks. Every project posts an update every two weeks.`),[T(`页面顶部是「下一场」和「再下一场」会议，以及每场会的提交情况。`,`The top shows the next meeting and the one after, with how many projects have posted for each.`),T(`点项目的「填写」，写三项：过去两周进展、接下来两周计划、需要的支持，再选状态：正常推进 / 有风险 / 受阻。`,`Click "Post" on a project and write three things: the past two weeks, the next two weeks and the support you need, then pick a status: On track, At risk or Blocked.`),T(`提交就生效，不需要审批；会前一天下午 1 点（阿姆斯特丹时间）前可以随时修改，之后不能再改。`,`It takes effect on submit with no approval. You can edit it until 13:00 Amsterdam time on the day before the meeting; after that it is locked.`),T(`提交后项目库、看板里的「最新进展」会立即更新；选「有风险」或「受阻」还会进入风险清单。`,`After you submit, "Latest update" in the project library and on the dashboard updates at once; "At risk" and "Blocked" also appear in the risk register.`),T(`截止是会议前一天下午 1 点（阿姆斯特丹时间）；会前 3 天系统会提醒还没提交的负责人。`,`The deadline is 13:00 Amsterdam time on the day before the meeting; owners who have not posted get a reminder 3 days before.`)],T(`经理、运营经理`,`Managers, ops managers`)],
      ['approvals',T(`我的待办审批`,`My approvals`),T(`你需要处理的事。`,`What waits for you.`),[T(`PMO：待审批的立项、变更、结项申请，待安排结项汇报的项目，系统生成的待办（如节点逾期评估）。每个申请可以通过、退回（写意见）或驳回。`,`PMO: new, change and close requests to review, projects waiting for the close review, and system tasks such as overdue-milestone reviews. Each request can be approved, returned with a comment, or rejected.`),T(`其他人：被退回需要修改的申请、快到期的交付物、分给你的待办。`,`Everyone else: requests returned for changes, deliverables about to fall due, tasks assigned to you.`)],T(`所有人`,`Everyone`)],
      ['mail',T(`邮件提醒`,`Email reminders`),T(`系统按规则生成提醒邮件，由 PMO 审阅后发送，所有邮件都存档。`,`The system prepares reminder emails by rule; PMO reviews and sends them, and every email is archived.`),[T(`PMO：「生成邮件」有两种方式，按提醒规则自动检查，或者手动勾选项目、选邮件类型。生成的是草稿，可以逐封审阅、修改收件人和内容再发送，也可以不审阅直接发送。`,`PMO: "Create emails" works two ways: check the reminder rules, or pick projects and an email type by hand. The result is drafts you can review and edit one by one before sending, or send without review.`),T(`邮件存档里可以按关键词、规则、状态、时间筛选，也能导出为 CSV。`,`The mail archive can be filtered by keyword, rule, status and time, and exported as CSV.`),T(`其他人：只能看到发给自己（含抄送）的邮件。`,`Everyone else: only the emails sent to you, including as cc.`),T(`页面最上面是汇总数字，点一下就筛选。列表里的蓝点表示未读，「新」表示上次访问之后新到的；点开一封就变成已读，也可以「全部标为已读」。`,`The numbers at the top summarise the mailbox; click one to filter. A blue dot marks an unread email and "New" marks mail that arrived since your last visit. Opening an email marks it read, or use "Mark all as read".`),T(`审批结果、项目指派等关键通知由系统自动发送。`,`Key notices such as approval results and project assignments are sent automatically.`)],T(`PMO 发送；所有人查看自己收到的`,`PMO sends; everyone reads their own`)],
      ['codes',T(`项目编码规则`,`Project code scheme`),T(`项目编号怎么来的。`,`How project codes work.`),[T(`格式是 EAS-年份-团队-流水号，例如 EAS-2026-GER-004。`,`The format is EAS-YEAR-TEAM-NUMBER, e.g. EAS-2026-GER-004.`)],T(`所有人`,`Everyone`)],
      ['users',T(`账号与权限`,`Accounts & access`),T(`PMO 管理账号、角色和团队范围；其他人在这里申请开通账号。`,`PMO manages accounts, roles and team scope; others can request an account here.`),[T(`角色决定能做什么，团队范围决定能操作哪些项目。`,`The role decides what you can do; the team scope decides which projects you can act on.`)],T(`PMO；其他人可申请`,`PMO; others can request`)]];
    const vis=m=>!(m[0]==='alsa'&&!(isPMO()||alsaRoleOf(me_.id)))&&!(m[0]==='close'&&!canClose());
    body=`<div class="note info small">${T(`点标题右边的按钮可以直接打开对应页面。你的角色没有权限的页面不会出现在左边菜单里。`,`Use the button next to a title to open that page. Pages your role cannot use do not appear in the left menu.`)}</div>`
      +M.filter(vis).map(m=>card(`${esc(m[1])}`,`<p style="margin:0">${m[2]}</p>${li(m[3])}<div class="small faint">${T(`谁可以用`,`Who`)}${CO()}${m[4]}</div>`,`<span class="sp"></span>${go_(m[0],T(`打开`,`Open`))}`)).join('');
  }

  if(tab==='journey'){
    const J={
      mgr:{h:T(`国家售后经理 / 中台负责人`,`Country manager / department head`),steps:[
        [T(`每天`,`Every day`),[T(`登录后先看<b>项目看板</b>（默认是你的团队）和侧边栏的红色角标。`,`Sign in and start with the <b>Dashboard</b> (your team by default) and the red badges in the menu.`),T(`到<b>我的待办审批</b>看有没有被退回的申请、快到期的交付物。`,`Open <b>My approvals</b> for returned requests and deliverables about to fall due.`),T(`有邮件提醒时，到<b>邮件提醒</b>查看发给你的邮件。`,`Read the emails sent to you under <b>Email reminders</b>.`)]],
        [T(`每两周（会前）`,`Every two weeks, before the meeting`),[T(`打开<b>双周更新</b>，给你团队每个在管项目填写进展：过去两周、接下来两周、需要的支持、状态。`,`Open <b>Two-week updates</b> and post for every running project of your team: past two weeks, next two weeks, support needed and status.`),T(`截止是会前一天下午 1 点（阿姆斯特丹时间），之后不能再改；写“受阻 / 有风险”会进入风险清单，PMO 会在会上重点讨论。`,`The deadline is 13:00 Amsterdam time on the day before the meeting, and the update is locked after that; "Blocked" and "At risk" enter the risk register and PMO discusses them at the meeting.`)]],
        [T(`节点快到期时`,`When a milestone is coming up`),[T(`在项目里点<b>提交成果</b>，按立项时选的形式提交：文字和截图、邮件、或者上传文件。`,`In the project, click <b>Submit</b> and give the evidence in the agreed format: text and screenshots, an email reference, or an uploaded file.`),T(`预计来不及，尽早提交<b>项目变更 → 申请延期</b>，同时重排后面的节点。`,`If it will slip, file <b>Change request → Extension</b> early and re-plan the milestones that follow.`)]],
        [T(`有新想法时`,`When you have a new project`),[T(`在<b>项目申请</b>里提交；通过后系统发编号，你就可以开始执行。`,`File it under <b>New project</b>; once approved the system issues the code and you can start.`)]],
        [T(`项目做完时`,`When the project is done`),[T(`在<b>申请结项</b>里核对交付物、上传文件和结项汇报材料；PMO 预审后安排你在项目会议上汇报。`,`Under <b>Close request</b>, check the deliverables and upload the files and the close report; after PMO pre-review you present at the project meeting.`)]]]},
      ops:{h:T(`国家售后运营经理 / 中台运营`,`Country ops manager / department ops`),steps:[
        [T(`每天`,`Every day`),[T(`看<b>项目看板</b>和<b>我的待办审批</b>，跟进快到期的节点。`,`Check the <b>Dashboard</b> and <b>My approvals</b>, and follow up on milestones coming due.`)]],
        [T(`每两周（会前）`,`Every two weeks, before the meeting`),[T(`和经理一起在<b>双周更新</b>里填写你们项目的进展。`,`Together with your manager, post progress for your projects under <b>Two-week updates</b>.`)]],
        [T(`日常执行`,`Day-to-day`),[T(`提交节点成果、提出<b>项目变更</b>（延期、换执行人、调整节点等）、提<b>项目申请</b>。`,`Submit milestone deliverables, file <b>change requests</b> (extension, new executors, milestone changes) and <b>new project</b> requests.`),T(`结项申请由经理或中台负责人提交，你可以准备材料交给他们。`,`The close request is filed by the manager or department head; you can prepare the material for them.`)]]]},
      pmo:{h:T(`PMO`,`PMO`),steps:[
        [T(`每天`,`Every day`),[T(`<b>我的待办审批</b>：处理立项、变更、结项申请；逾期节点的待办也在这里。`,`<b>My approvals</b>: handle new, change and close requests; overdue-milestone tasks are here too.`),T(`<b>风险与问题</b>：先看高风险和新增的风险，通知负责人；暂停太久的项目安排决定。`,`<b>Risks & issues</b>: start with high and new risks and notify the owners; schedule decisions on projects held too long.`)]],
        [T(`每周`,`Every week`),[T(`<b>邮件提醒</b> → 生成邮件：按规则检查，或手动选项目；审阅草稿后发送。`,`<b>Email reminders</b> → Create emails: check the rules or pick projects; review the drafts, then send.`),T(`新同事：把邮箱、角色和团队范围加进账号名单（见<b>账号与权限</b>），他们才能登录。`,`New colleagues: add their email, role and team scope to the access list (see <b>Accounts & access</b>); they cannot sign in before that.`)]],
        [T(`项目会前后`,`Around each project meeting`),[T(`会前看<b>双周更新</b>的提交情况，催还没提交的；会上按“受阻 → 有风险 → 正常”过。`,`Before the meeting, check who has posted under <b>Two-week updates</b> and chase the rest; in the meeting go Blocked, then At risk, then On track.`),T(`会后：通过结项汇报的项目点<b>会议通过，关闭项目</b>。`,`After it: close projects whose close report was approved with <b>Close after meeting</b>.`)]],
        [T(`随时`,`Any time`),[T(`直接立项、编辑项目、更换负责人、转为跟进项、取消项目，都可以在项目上右键完成。`,`Set up projects directly, edit them, change owners, convert to a follow-up or cancel: all by right-click on the project.`),T(`<b>邮件存档</b>里查任何一封发出过的邮件，必要时导出。`,`Look up any sent email in the <b>mail archive</b> and export it if needed.`)]]]},
      view:{h:T(`其他售后同事（只读）`,`Other colleagues (read-only)`),steps:[
        [T(`想了解项目`,`To find out about a project`),[T(`用顶部搜索框，或进<b>项目库</b>按团队、状态找；点开看节点、进展、历史。`,`Use the search box, or the <b>Project library</b> by team and status; open a project to see milestones, progress and history.`),T(`<b>甘特图</b>看时间安排，<b>项目看板</b>看总体。`,`The <b>Gantt</b> shows the schedule and the <b>Dashboard</b> the overall picture.`)]],
        [T(`想借鉴以前的做法`,`To learn from earlier projects`),[T(`进<b>项目资料库</b>，用助手提问，比如“哪些项目做过……”，再点编号打开项目看资料。`,`Open the <b>Knowledge library</b> and ask the assistant, e.g. "which projects did …", then open a project to read its material.`)]],
        [T(`想做点什么`,`To act`),[T(`你的账号是只读的。需要立项或跟进，请联系你所在团队的经理，或联系 PMO 调整权限。`,`Your account is read-only. To start or follow a project, talk to your team manager, or ask PMO to change your access.`)]]]}};
    const order=[rk,...['mgr','ops','pmo','view'].filter(k=>k!==rk)];
    body=`<div class="note info small">${T(`下面是每种角色的日常节奏。你的角色排在最前面。`,`Daily routines for each role. Yours is listed first.`)}</div>`+order.map(k=>{const j=J[k];return card(`${j.h}${youTag(k)}`,`<div class="grid g2">${j.steps.map(([w,a])=>`<div class="note"><b>${w}</b>${li(a)}</div>`).join('')}</div>`)}).join('');
  }

  if(tab==='life'){
    const S1=[
      [T(`1. 申请`,`1. Apply`),T(`经理 / 运营经理`,`Manager / ops manager`),T(`在<b>项目申请</b>里填背景、收益、负责人、执行人、时间，和每个节点的交付成果、截止日期、提交形式。`,`Under <b>New project</b>: background, benefits, owner, executors, dates, and for each milestone the deliverable, due date and evidence format.`)],
      [T(`2. 审批与编号`,`2. Approval and code`),T(`PMO`,`PMO`),T(`PMO 通过、退回（写意见，申请人修改后重提）或驳回。通过时系统生成编号 团队-年份-流水号，并通知相关人员。`,`PMO approves, returns with a comment (the applicant edits and resubmits) or rejects. On approval the system issues TEAM-YEAR-SEQUENCE and notifies the people involved.`)],
      [T(`3. 执行`,`3. Run`),T(`负责人 / 执行人`,`Owner / executors`),T(`项目状态是「未开始」或「进行中」。按节点提交成果；每两周在<b>双周更新</b>里报告进展。系统在节点前提醒，逾期会通知 PMO。`,`Status is Not started or In progress. Submit evidence per milestone and report progress every two weeks. The system reminds before a milestone and tells PMO when one is overdue.`)],
      [T(`4. 变更（需要时）`,`4. Change (if needed)`),T(`经理 / 运营经理 → PMO`,`Manager / ops manager → PMO`),T(`延期并重排节点，或换负责人、调整交付物、暂停、取消。PMO 批准后自动更新到项目。`,`Extend and re-plan milestones, change owner, adjust deliverables, hold or cancel. After PMO approves, the project updates automatically.`)],
      [T(`5. 申请结项`,`5. Close request`),T(`经理 / 中台负责人`,`Manager / department head`),T(`核对交付物、上传文件和结项汇报材料（PPT）、写成果总结。`,`Check the deliverables, upload the files and the close report (PPT), write the summary.`)],
      [T(`6. 预审`,`6. Pre-review`),T(`PMO`,`PMO`),T(`PMO 看材料。通过后项目变成「待结项汇报」；材料不够就退回补充。`,`PMO reads the material. If it passes the project becomes "Awaiting close review"; if not, it is returned for more.`)],
      [T(`7. 项目会议汇报`,`7. Project meeting`),T(`负责人 + PMO`,`Owner + PMO`),T(`在项目会议上汇报。通过后 PMO 关闭项目；没通过则退回继续执行。`,`Present at the project meeting. If approved, PMO closes the project; if not, it goes back to running.`)],
      [T(`8. 归档`,`8. Archive`),T(`自动`,`Automatic`),T(`项目关闭后，背景、节点与成果、双周进展、结项总结、变更记录和上传的文件进入<b>项目资料库</b>。需要时转为跟进项，继续监控数据。`,`Once closed, the background, milestones and deliverables, two-week updates, close summary, change history and uploaded files join the <b>Knowledge library</b>. If needed it becomes a follow-up to keep monitoring.`)]];
    const status=[['not_started',T(`已批准，尚未开始`,`Approved, not started yet`)],['active',T(`正在执行`,`Running`)],['on_hold',T(`暂停，等待决定`,`Paused, waiting for a decision`)],['to_report',T(`已预审，等待项目会议汇报`,`Pre-reviewed, waiting for the project meeting`)],['closed',T(`已关闭，已归档到资料库`,`Closed and archived in the Knowledge library`)],['canceled',T(`已取消或不再推进，留在项目库`,`Canceled or dropped; stays in the Project library`)]];
    body=card(T(`项目从头到尾`,`From first idea to archive`),`<div class="tw"><table class="t"><thead><tr><th>${T(`步骤`,`Step`)}</th><th>${T(`谁`,`Who`)}</th><th>${T(`发生什么`,`What happens`)}</th></tr></thead><tbody>${S1.map(r=>`<tr><td><b>${r[0]}</b></td><td class="small">${r[1]}</td><td class="small">${r[2]}</td></tr>`).join('')}</tbody></table></div>`)
    +card(T(`项目状态`,`Project statuses`),`<div class="grid g2">${status.map(([k,t])=>`<div class="row" style="flex-wrap:nowrap;align-items:flex-start">${pill(k)}<span class="small muted">${t}</span></div>`).join('')}</div>`)
    +card(T(`项目编号`,`Project codes`),`<p class="small" style="margin:0">${T(`格式 <b>EAS-年份-团队-流水号</b>，例如 EAS-2026-GER-004。跟进项在流水号前加 F（TEC-26-F03），ALSA 项目加 A（SEN-26-A01）。编号由系统在审批通过时生成，终身不变。详见`,`The format is <b>EAS-YEAR-TEAM-NUMBER</b>, e.g. EAS-2026-GER-004. Follow-ups put an F before the number (TEC-26-F03), ALSA projects an A (SEN-26-A01). The system issues the code when a request is approved and it never changes. See`)} ${go_('codes',T(`项目编码规则`,`Project code scheme`))}</p>`);
  }

  if(tab==='faq'){
    const Q=[
      [T(`我为什么不能编辑某个项目？`,`Why can't I edit a project?`),T(`只有自己团队的项目可以操作，别的团队的是只读。自己团队的项目里，名称、负责人、执行人、时间和节点是锁定的，要改请提交项目变更。`,`You can act only on your own team's projects; other teams' are read-only. Even in your own team, name, owner, executors, dates and milestones are locked: file a change request.`)],
      [T(`项目延期了，要怎么改？`,`The project is running late. What do I do?`),T(`项目变更 → 申请延期。填新的完成日，同一页决定每个节点是保持、改期、改交付物还是删除。PMO 批准后自动更新。`,`Change request → Extension. Enter the new end date, then decide for each milestone whether to keep, move, rewrite or drop it, all on one page. The project updates when PMO approves.`)],
      [T(`项目库和项目资料库有什么区别？`,`What is the difference between the Project library and the Knowledge library?`),T(`项目库收录所有项目，不论状态，包括已取消和不再推进的。项目资料库只收已结项并完成结项汇报的项目，整套资料归档成知识库，可以用自然语言提问。`,`The Project library holds every project, whatever its status, including canceled and dropped ones. The Knowledge library holds only projects that closed after the close review; their full material is archived as a knowledge base you can query in plain language.`)],
      [T(`为什么看不到 ALSA 项目？`,`Why can't I see ALSA projects?`),T(`ALSA 项目、会议和议题只对 ALSA 成员和 PMO 开放。`,`ALSA projects, meetings and topics are open only to ALSA members and PMO.`)],
      [T(`为什么风险页只有我自己团队的？`,`Why does the risk page show only my team?`),T(`每个团队只看自己团队的风险与问题。PMO 和有全局权限的同事可以切换到全部团队。`,`Each team sees only its own risks and issues. PMO and colleagues with global access can switch to all teams.`)],
      [T(`双周更新提交后去哪了？`,`Where does a two-week update go after I submit it?`),T(`它会立刻成为项目的「最新进展」，显示在项目库、项目看板的重点关注表和项目详情里；写“有风险”或“受阻”还会出现在风险清单。会前一天下午 1 点（阿姆斯特丹时间）前可以修改，之后不能改。`,`It immediately becomes the project's "Latest update", shown in the Project library, the Dashboard focus list and the project page; "At risk" or "Blocked" also appears in the risk register. You can edit it until 13:00 Amsterdam time on the day before the meeting; after that it is locked.`)],
      [T(`结项申请提交不了？`,`I cannot submit a close request.`),T(`检查三点：你是不是国家售后经理 / 中台负责人（运营经理不能提交）；是否上传了结项汇报材料；每个已完成的交付物是否上传了文件（已经提交过成果的节点可以不传）。`,`Check three things: that you are a country manager or department head (ops managers cannot file it); that the close report is uploaded; and that every completed deliverable has a file (a milestone that already has evidence on file does not need one).`)],
      [T(`成果提交形式选“其他”是什么意思？`,`What does "Other" mean for the evidence format?`),T(`立项或变更时，如果节点的成果不适合图文汇报、邮件或项目文件，可以选“其他”，并自己写明形式，比如“Teams 录屏”。`,`If a deliverable does not fit a text-and-image report, an email or project files, choose "Other" when you apply or change the plan and describe the format, e.g. "Teams recording".`)],
      [T(`我没收到提醒邮件？`,`I did not receive a reminder email.`),T(`邮件提醒页只显示发给你的邮件。提醒由 PMO 审阅后发送，所以会比系统生成晚一点。也请检查名单里你的邮箱是否正确。`,`The Email reminders page shows only emails sent to you. PMO reviews reminders before sending, so they may arrive a little after they are prepared. Also check that your email on the PMO list is correct.`)],
      [T(`忘记密码或需要开通账号？`,`Forgot my password or need an account?`),T(`请联系 PMO。PMO 管理账号名单、角色和团队范围。`,`Ask the PMO. They manage the access list, roles and team scope.`)]];
    body=Q.map(([q,a])=>`<details class="card" style="padding:0"><summary class="card-h" style="cursor:pointer;border-bottom:0"><h2 style="font-size:14px">${esc(q)}</h2></summary><div class="card-b small muted" style="padding-top:0">${a}</div></details>`).join('');
  }

  return `<div class="row"><div class="seg" role="tablist" aria-label="${T(`使用手册`,`User guide`)}">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${tab===k}" data-act="fset" data-k="gtab" data-val="${k}" class="${tab===k?'on':''}">${l}</button>`).join('')}</div></div>${body}`;
}

Object.assign(VIEWS,{mail,codes,users,guide,pmo:pmoPage});
VIEWS.users=users;Object.assign(VIEWS_AFTER,{mail:mailAfter,codes:codesAfter,users:usersAfter});

/* ================= events ================= */
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-act]');
  if(!el){const r=$('#qres');if(r&&!e.target.closest('.search'))r.hidden=true;return}
  const a=el.dataset.act,id=el.dataset.id;
  if(a==='scrim'){if(e.target===el)closeDrawer();return}
  if(el.tagName==='INPUT'&&a!=='rule'&&a!=='alsaMember')return;
  switch(a){
    case 'bwOk':{const p=S.projects.find(x=>x.id===el.dataset.id);if(!p)break;const u=updFor(p,periodOf(trackOf(p.team)));if(u&&isPMO()){const old=u.review;u.review={st:'ok',by:me().name,at:nowStamp(),hist:[...(old&&old.hist||[])]};save();render();toast(T('已确认','Confirmed'))}break}
    case 'rvMeet':rvStart(rvAgenda(el.dataset.lang),`${LANGN(el.dataset.lang)} · ${md(periodOf(el.dataset.lang).meet)}`);break;
    case 'rvList':rvStart(PROJ_ROWS.slice(),T('项目库','Projects'));break;
    case 'rvOne':rvStart([el.dataset.id],T('更新时间线','Update timeline'));break;
    case 'rvGo':S.filters.rv.i=+el.dataset.i;save();render();window.scrollTo(0,0);break;
    case 'rvPrev':case 'rvNext':{const R=S.filters.rv;R.i=Math.max(0,Math.min(rvItems(R).length-1,(R.i||0)+(a==='rvNext'?1:-1)));save();render();window.scrollTo(0,0);break}
    case 'rvKind':{const R=S.filters.rv;R.kind=el.dataset.v==='follow'?'follow':'proj';if(R.kind==='proj'&&!(R.base||[]).length)R.base=S.projects.filter(p=>needsBW(p)&&canView(p)).map(p=>p.id);R.team=R.owner=R.stat='';R.i=0;save();render();break}
    case 'rvClear':{const R=S.filters.rv;R.team=R.owner=R.stat='';R.i=0;save();render();break}
    case 'rvFollows':rvStart([],T('跟进项','Follow-ups'),'follow');break;
    case 'rvAll':S.filters.rv.all=true;save();render();break;
    case 'rvExit':S.view=(S.filters.rv&&S.filters.rv.back&&S.filters.rv.back!=='review')?S.filters.rv.back:'biweekly';save();render();window.scrollTo(0,0);break;
    case 'usageReload':USAGE_CACHE=null;USAGE_LOADING=false;render();break;
    case 'pmoToggle':S.filters.pmoOpen=!pmoNavOpen();save();render();break;
    case 'go':{const x={};if(el.dataset.at){if(el.dataset.v==='pmo'){x.pmoTab=el.dataset.at;x.pmoOpen=true}else x.alsaTab=el.dataset.at}if(el.dataset.team!==undefined)x.team=el.dataset.team;if(el.dataset.st)x.st=el.dataset.st==='inflight'?'inflight':el.dataset.st;if(el.dataset.y)x.y=el.dataset.y;else if(el.dataset.v==='projects')x.y='';if(el.dataset.v==='projects'&&!el.dataset.team)x.team='';if(el.dataset.v==='projects'&&!el.dataset.st&&el.dataset.team)x.st='inflight';if(el.dataset.v==='projects')x.pview=(el.dataset.st||el.dataset.team||el.dataset.y)?'list':'home';go(el.dataset.v,x);break}
    case 'open':openDrawer('p',id,el.dataset.tab);break;
    case 'tlMore':{const k=el.dataset.k,open=!TLOPEN.has(k);open?TLOPEN.add(k):TLOPEN.delete(k);const old=el.previousElementSibling;if(old&&old.classList.contains('tl-old'))old.hidden=!open;
      el.setAttribute('aria-expanded',open);el.textContent=tlLbl(open,+el.dataset.n,+el.dataset.t);if(!open)el.scrollIntoView({block:'nearest'});break}
    case 'bwOnly':S.filters.bwOnly=el.dataset.val;save();render();break;
    case 'openf':openDrawer('f',id);break;
    case 'dscope':S.filters.dash=el.dataset.v;render();break;
    case 'pxset':S.filters.pxr=(el.dataset.r||'')===S.filters.pxr?'':(el.dataset.r||'');S.filters.pxrev='';S.filters.pxall='';if(el.dataset.fromTile)S.filters.pxl='';save();render();{const t=document.getElementById('pxlist');t&&t.scrollIntoView({behavior:'smooth',block:'start'})}break;
    case 'pxrev':{S.reviews=S.reviews||{};const x=pmoExceptions().find(y=>y.p.id===id);
      if(S.reviews[id]&&S.reviews[id].until>=today()){delete S.reviews[id];toast(T('已撤销','Undone'),'info')}
      else if(x){S.reviews[id]={at:today(),until:addDays(today(),7),by:S.user,sig:x.sig};toast(T(`已标为看过：7 天内不再出现，除非有新情况（${addDays(today(),7)}）`,`Marked as reviewed: hidden for 7 days unless something new shows up (${addDays(today(),7)})`),'ok')}
      save();render();break}
    case 'pxnotify':pxNotify(id);break;
    case 'pgo':Object.assign(S.filters,{pview:'list',st:el.dataset.st||'all',team:el.dataset.team||'',group:'',y:'',q:''});save();render();window.scrollTo(0,0);break;
    case 'fclearF':Object.assign(S.filters,{fteam:'',ft:'',ftime:'',fst:'open'});save();render();break;
    case 'phome':Object.assign(S.filters,{pview:'home',q:'',st:'',team:'',group:'',y:''});save();render();break;
    case 'rkset':{const f=S.filters,t=el.dataset.team||'',c=el.dataset.cat||'';
      if(t&&c){const same=f.rteam===t&&f.rcat===c;f.rteam=same?'':t;f.rcat=same?'':c}else if(t){f.rteam=f.rteam===t?'':t}else if(c){f.rcat=f.rcat===c?'':c}
      save();render();break}
    case 'rkclear':Object.assign(S.filters,{rteam:'',rgrp:'',rlv:'',rcat:'',rq:''});save();render();break;
    case 'closeDrawer':closeDrawer();break;
    case 'dtab':S.drawer.tab=el.dataset.val;S.drawer.edit=false;save();renderDrawer();break;
    case 'editOn':S.drawer.edit=true;renderDrawer();break;
    case 'editOff':S.drawer.edit=false;renderDrawer();break;
    case 'lang':S.lang=el.dataset.l;save();render();break;
    case 'theme':S.theme=el.dataset.t==='dark'?'dark':'light';document.documentElement.dataset.theme=S.theme;save();render();break;
    case 'reset':resetAll();break;
    case 'menu':$('#side').classList.toggle('open');break;
    case 'gexp':{S.filters.gexp=S.filters.gexp||{};S.filters.gexp[id]=!S.filters.gexp[id];save();render();break}
    case 'gset':case 'fset':S.filters[el.dataset.k]=el.dataset.val;save();render();break;
    case 'notify':case 'ack':{const r=allRisks().find(x=>x.key===el.dataset.key);if(!r)break;const p=S.projects.find(x=>x.id===r.pid);
      if(a==='notify')sendMail({to:[r.owner],cc:['Aiden'],subject:`[${T('风险提醒','Risk alert')}] ${p.code} · ${T(RISK_CAT[r.cat].zh,RISK_CAT[r.cat].en)}`,body:`${p.code}「${p.name}」\n\n${T('识别结果','Finding')}${CO()}${r.title}\n${r.detail}\n\n${T('建议动作','Suggested action')}${CO()}${r.sugg}${sig()}`,rule:'risk',ref:p.id});
      if(a==='ack')S.acks[r.key]=today();save();render();toast(a==='notify'?T('已发送风险提醒邮件','Risk alert sent'):T('已标记为已处理','Marked as handled'));break}
    case 'holdDo':ctxDo(el.dataset.k,'p',id);break;
    case 'alsaSp':{const p=S.projects.find(x=>x.id===id);if(p&&isPMO())qaSponsor(p);break}
    case 'notifyP':case 'ackP':{const p=S.projects.find(x=>x.id===id);const g=p&&riskGroups(allRisks([p]).filter(r=>!S.acks[r.key]))[0];if(!g)break;
      if(a==='notifyP'){const r=g.main,more=g.items.slice(1);sendMail({to:[p.pic],cc:['Aiden'],subject:`[${T('风险提醒','Risk alert')}] ${p.code} · ${T(RISK_CAT[r.cat].zh,RISK_CAT[r.cat].en)}`,body:`${p.code}「${p.name}」\n\n${T('主要风险','Main risk')}${CO()}${r.title}\n${r.detail||''}\n\n${T('建议动作','Suggested action')}${CO()}${r.sugg}${more.length?`\n\n${T('其他需要注意','Also note')}${CO()}\n${more.map(x=>`· ${x.title}`).join('\n')}`:''}${sig()}`,rule:'risk',ref:p.id})}
      else g.items.forEach(r=>{S.acks[r.key]=today()});
      save();render();toast(a==='notifyP'?T('已发送风险提醒邮件','Risk alert sent'):T('已标记为已处理','Marked as handled'));break}
    case 'notifyAll':{const R=riskGroups(allRisks().filter(r=>!S.acks[r.key])).filter(g=>g.level==='high').map(g=>({...g.main,owner:(S.projects.find(x=>x.id===g.pid)||{}).pic||g.main.owner}));const by={};R.forEach(r=>(by[r.owner]=by[r.owner]||[]).push(r));Object.entries(by).forEach(([o,rs])=>sendMail({to:[o],cc:['Aiden'],subject:`[${T('高风险项目提醒','High-risk projects')}] ${rs.length} ${T('项','items')}`,body:rs.map(r=>{const p=S.projects.find(x=>x.id===r.pid);return `· ${p.code} ${p.name}\n  ${r.title}；${T('建议','suggest')}${CO()}${r.sugg}`}).join('\n')+sig(),rule:'risk'}));save();render();toast(T(`已通知 ${Object.keys(by).length} 位负责人`,`Notified ${Object.keys(by).length} owners`));break}
    case 'issueClose':{const i=S.issues.find(x=>x.id===id);i.status='closed';save();render();break}
    case 'issueNotify':{const i=S.issues.find(x=>x.id===id);const p=S.projects.find(x=>x.id===i.pid);sendMail({to:[i.owner],subject:`[${T('问题跟进','Issue')}] ${p.code}`,body:`${i.text}\n${T('期望解决','Target')}${CO()}${i.due||'—'}${sig()}`,rule:'manual',ref:p.id});save();toast(T('已发送提醒','Reminder sent'));break}
    case 'approve':decide(id,'approve');break;
    case 'return':decide(id,'return');break;
    case 'reject':decide(id,'reject');break;
    case 'resubmit':{const r=S.requests.find(x=>x.id===id);if(r.type==='new'){S.formPrefill={type:'new',rid:r.id,data:r.data,team:r.team,comment:r.decision&&r.decision.comment};go('apply')}else{S.formPid=r.pid;r.status='withdrawn';go(r.type==='change'?'change':'close')}break}
    case 'meetClose':meetClose(id);break;
    case 'meetBack':{const p=S.projects.find(x=>x.id===id);if(p)qaReturn('meetBack',p);break}
    case 'todo':todoAct(id,el.dataset.a);break;
    case 'toChange':case 'toClose':{if(el.dataset.todo){const t=S.todos.find(x=>x.id===el.dataset.todo);if(t)t.status='done'}S.formPid=id;go(a==='toChange'?'change':'close');break}
    case 'msForm':{const f=$(`.msf[data-mid="${el.dataset.mid}"]`);f.hidden=!f.hidden;if(!f.hidden)$('textarea',f).focus();break}
    case 'msReturn':{const p=curItem();if(p)qaReturn('msReturn',p,el.dataset.mid);break}
    case 'p2f':{const p=S.projects.find(x=>x.id===id);if(p)qaP2f(p);break}
    case 'f2p':{const f=S.follows.find(x=>x.id===id);S.formPrefill={type:'new',fromFollow:f.id,fromFollowCode:f.code,team:f.team,data:{team:f.team,section:f.section||'',name:f.name,pic:f.pic,exec:f.exec||[],bg:{background:f.scope||''}}};go('apply');break}
    case 'fClose':case 'fReopen':{const f=S.follows.find(x=>x.id===id);f.status=a==='fClose'?'closed':'open';f.history.push({at:nowStamp(),by:'Aiden',text:a==='fClose'?T('关闭跟进项','Closed'):T('重新打开','Reopened')});save();render();break}
    case 'msel':S.filters.msel=id;markRead([id]);render();break;
    case 'runRem':{const n=runReminders();render();toast(n?T(`检查完成，新生成 ${n} 封草稿，请在下方审阅后发送`,`Done: ${n} new drafts. Review and send them below.`):T('检查完成，没有新的提醒','Done: nothing new to remind'),n?'ok':'info');break}
    case 'simClear':S.simToday=null;save();render();break;
    case 'rule':S.rules[el.dataset.k]=el.checked;save();break;
    case 'loginAs':{const u=S.users.find(x=>x.id===id);const k=u.teams.length===1&&!(u.secs||[]).length?u.teams[0]:null;switchUser(k&&mgrOf(k)===u?'team:'+k:'user:'+u.id);break}
    case 'acctOk':case 'acctNo':{const r=S.acctReqs.find(x=>x.id===id);r.status=a==='acctOk'?'approved':'rejected';if(a==='acctOk'){S.users.push({id:'u'+uid(),name:r.name,email:r.email,role:r.role,teams:[r.team],lang:team(r.team).group==='R'?'en':'zh',alsa:false,status:'active'})}
      sendMail({to:[r.name],cc:[userName(r.by)],subject:a==='acctOk'?T(`[账号已开通] ${ORG.zh} · 售后项目管理中心`,`[Account activated] ${ORG.en} · PMO`):T('[账号申请未通过]','[Account request declined]'),body:a==='acctOk'?T('您的账号已开通，请用公司邮箱登录。','Your account is active; sign in with your company account.')+sig():sig(),rule:'manual'});save();render();break}
    case 'acctToggle':{const u=S.users.find(x=>x.id===id);u.status=u.status==='disabled'?'active':'disabled';if(u.status==='disabled'&&!S.departed.some(d=>d.name===u.name))S.departed.push({name:u.name,at:today(),note:T('账号已停用','account disabled')});if(u.status==='active')S.departed=S.departed.filter(d=>d.name!==u.name);save();render();break}
    case 'cokeySave':{const q=S.requests.find(x=>x.id===el.dataset.id);if(!q||!isPMO())break;const v=($('#ck-'+q.id)||{}).value||'yes',c=(($('#ckc-'+q.id)||{}).value||'').trim();q.cokey={v,comment:c,by:me().id,at:nowStamp()};save();render();toast(T('已记录 Cokey 的决定','Cokey\'s decision recorded'));break}
    case 'moveEsc':{const q=S.requests.find(x=>x.id===el.dataset.id);if(!q||!isOwnerOfReq(q))break;const p=S.projects.find(x=>x.id===q.pid);q.status='pending';q.escalatedBy=me().id;q.at=nowStamp();
      sendMail({to:['Aiden'],cc:ccList([userName(q.by),mgrOfP(p)&&mgrOfP(p).name],[]),subject:`[${T('异动预警','Change alert')}] ${p.code}`,body:`${me().name} ${T('确认并上报了执行人提交的节点异动，请评估。','confirmed and escalated a milestone change reported by an executor. Please assess it.')}\n\n${reqTitle(q)}${sig()}`,rule:'manual',ref:p.id});save();render();toast(T('已上报 PMO 预警','Escalated to PMO'));break}
    case 'moveBack':{const q=S.requests.find(x=>x.id===el.dataset.id);if(!q||!isOwnerOfReq(q))break;const c=(($('#cm-'+q.id)||{}).value||'').trim();if(!c){toast(T('请写明退回原因','Say why you send it back'),'warn');flagField($('#cm-'+q.id));break}
      q.status='returned';q.decision={by:me().id,at:nowStamp(),comment:c};sendMail({to:[userName(q.by)],subject:`[${T('异动被退回','Change sent back')}] ${reqTitle(q)}`,body:`${T('项目负责人退回了你提交的节点异动。','The project owner sent back the change you reported.')}\n\n${T('意见','Comment')}${CO()}${c}${sig()}`,rule:'manual'});save();render();toast(T('已退回','Sent back'));break}
    case 'opinion':{const q=S.requests.find(x=>x.id===el.dataset.id);if(!q||!(q.data.leaders||[]).includes(me().id))break;const v=el.dataset.v,w=(($('#op-'+q.id)||{}).value||'').trim();
      if(v==='no'&&!w){toast(T('不同意结项请写明原因','Give a reason if you disagree'),'warn');flagField($('#op-'+q.id));break}
      q.opinions=q.opinions||{};q.opinions[me().id]={v,why:w,at:nowStamp()};const p=S.projects.find(x=>x.id===q.pid);
      sendMail({to:ccList([p&&p.pic,'Aiden'],[]),subject:`[${v==='yes'?T('同意结项','Agrees to close'):T('不同意结项','Disagrees with closing')}] ${p?p.code:''}`,body:`${me().name}${CO()}${v==='yes'?T('同意结项','agrees to close'):T('不同意结项','does not agree')}${w?`\n${T('原因','Reason')}${CO()}${w}`:''}${sig()}`,rule:'manual',ref:p&&p.id});save();render();toast(T('已提交你的意见','Your opinion is in'));break}
    case 'resView':S.filters.resView=el.dataset.id;save();render();window.scrollTo(0,0);break;
    case 'resBack':S.filters.resView='';save();render();window.scrollTo(0,0);break;
    case 'abGo':{const t=document.getElementById('ab-'+el.dataset.k);t&&t.scrollIntoView({behavior:'smooth',block:'start'});break}
    case 'abEdit':if(resCan()){ABE=el.dataset.k;render()}break;
    case 'abCancel':ABE=null;render();break;
    case 'resOpen':{const k=el.dataset.id;RES_OPEN.has(k)?RES_OPEN.delete(k):RES_OPEN.add(k);const L=$('#resList');if(L){L.innerHTML=resListHTML();resImgFix()}else render();break}
    case 'resNew':if(!resCan())break;RESD={id:null,title:'',date:today(),mY:'',mM:'',mT:'quarterly',l1:'',l2:'',summary:'',body:'',image:null,files:[]};render();break;
    case 'resEdit':{if(!resCan())break;const x=resList().find(q=>q.id===el.dataset.id);if(!x)break;RESD={id:x.id,title:x.title||'',date:x.date||today(),mY:x.mY||String(x.date||today()).slice(0,4),mM:x.mM||String(x.date||today()).slice(5,7),mT:x.mT||'quarterly',l1:x.l1||'',l2:x.l2||'',summary:x.summary||'',body:x.body||'',image:x.image||null,files:[...(x.files||[])]};render();window.scrollTo(0,0);break}
    case 'resCancel':RESD=null;render();break;
    case 'resUnpub':{if(!resCan())break;const x=resList().find(q=>q.id===el.dataset.id);if(x&&confirm(T('撤回这条决议？撤回后成员看不到，可以修改后重新发布。','Withdraw this resolution? Members will no longer see it; you can edit it and publish again.'))){x.status='draft';x.withdrawnAt=nowStamp();x.history=(x.history||[]).concat({at:nowStamp(),by:me().name,text:'Withdrawn'});S.filters.resView='';save();render();window.scrollTo(0,0);toast(T('已撤回，可在草稿里修改后重新发布','Withdrawn; edit it under drafts and publish again'))}break}
    case 'resPublish':{if(!resCan())break;const x=resList().find(q=>q.id===el.dataset.id);if(x){if(!x.title||!x.summary){toast(T('发布前请先补全标题和摘要','Add a title and summary before publishing'),'warn');break}x.status='published';x.withdrawnAt=null;x.history=(x.history||[]).concat({at:nowStamp(),by:me().name,text:'Published again'});save();render();toast(T('已重新发布','Published'))}break}
    case 'resDel':{if(!resCan())break;const x=resList().find(q=>q.id===el.dataset.id);if(x&&x.status==='draft'&&confirm(T('删除这条草稿？','Delete this draft?'))){S.alsaRes=resList().filter(q=>q!==x);save();render()}break}
    case 'resClear':['rq','rl1','ry','rqt','rmt','rs'].forEach(k=>S.filters[k]='');save();render();break;
    case 'alsaNew':navPush();S.filters.alsaForm=true;S.filters.alsaEdit=null;save();render();break;
    case 'alsaEdit':navPush();S.filters.alsaForm=true;S.filters.alsaEdit=id;save();render();window.scrollTo(0,0);break;
    case 'alsaCancel':{const top=NAVH[NAVH.length-1];if(top&&top.view==='alsa'&&!top.af&&!top.drawer){backBtn();break}S.filters.alsaForm=false;S.filters.alsaEdit=null;save();render();break}
    case 'alsaSend':alsaSend(id);break;
    case 'alsaVote':alsaVote(id,el.dataset.v);break;
    case 'alsaWithdraw':{const x=S.alsa.find(q=>q.id===id);x.status='draft';x.history.push({at:nowStamp(),by:'Aiden',text:T('PMO 撤回审批，回到草稿','Withdrawn to draft')});save();render();break}
    case 'alsaChase':{const x=S.alsa.find(q=>q.id===id);const pend=alsaMembers().filter(u=>!x.votes[u.id]);sendMail({to:pend.map(u=>u.name),cc:['Aiden'],subject:`[ALSA ${T('审批提醒','vote reminder')}] ${x.code} ${x.name}`,body:T('请尽快在系统「ALSA 战略项目」中表决。','Please vote under ALSA projects.')+sig(),rule:'R8'});save();toast(T(`已提醒 ${pend.length} 位成员`,`Reminded ${pend.length} members`));break}
    case 'alsaMember':{const u=S.users.find(x=>x.id===id);u.alsa=el.checked;save();render();break}
    case 'qpick':$('#qres').hidden=true;openDrawer(el.dataset.k,id);break;
  }
});
document.addEventListener('submit',async e=>{
  const f=e.target;
  if(f.id==='updForm'){e.preventDefault();const p=curItem();const t=f.elements.text.value.trim();if(!t)return;(p.updates=p.updates||[]).push({date:today(),text:t,by:me().name});save();renderDrawer();toast(T('进度已更新','Update posted'));return}
  if(f.classList.contains('msf')){e.preventDefault();const p=curItem();const m=p.milestones.find(x=>x.id===f.dataset.mid);const t=f.elements.text.value.trim();if(!t){f.elements.text.focus();return}
    const sb=f.querySelector('button[type=submit],button:not([type])');sb&&(sb.disabled=true,sb.setAttribute('aria-busy','true'));let files;try{files=await readFiles(f.elements.files.files)}catch(err){sb&&(sb.disabled=false,sb.removeAttribute('aria-busy'));toast(err&&err.code==='too_big'?tooBigMsg():T('附件读取失败，请重新选择文件','Could not read the attachment; choose the file again'),'err');return}m.done=true;m.returned=null;m.evidence={text:t,email:f.elements.email.value.trim(),files,by:me().name,at:today()};
    p.history.push({at:nowStamp(),by:me().name,text:T(`提交节点成果：${m.name}`,`Submitted deliverable: ${m.name}`)});
    if(!isPMO())sendMail({to:['Aiden'],subject:`[${T('成果已提交','Deliverable submitted')}] ${p.code}`,body:`${me().name}：${m.name}\n\n${t}${sig()}`,rule:'manual',ref:p.id});
    save();render();toast(T('成果已提交','Deliverable submitted'));return}
  if(f.id==='pmoEdit'){e.preventDefault();const p=curItem();const d=Object.fromEntries(new FormData(f));const ch=[];
    const from=p.status,to=d.status,why=(d.why||'').trim();
    if(to!==from&&(to==='closed'||to==='canceled')&&!why){flagField(f.elements.why);toast(T('关闭或取消项目请填写原因','Give a reason to close or cancel'),'warn');return}
    const setF=(k,v,lab)=>{if(String(p[k]??'')!==String(v??'')){ch.push(`${lab}：${Array.isArray(p[k])?p[k].join('、'):p[k]||'—'} → ${Array.isArray(v)?v.join('、'):v||'—'}`);p[k]=v}};
    setF('name',d.name.trim(),T('名称','Name'));setF('pic',d.pic.trim(),T('负责人','Owner'));const ex=d.exec.split(/[,，、]/).map(s=>s.trim()).filter(Boolean);if(ex.join()!==(p.exec||[]).join())setF('exec',ex,T('执行人','Executors'));
    setF('start',d.start,T('开始','Start'));if(d.end>(p.end||'')&&p.end)(p.exts=p.exts||[]).push(d.end);setF('end',d.end,T('完成','End'));setF('team',d.team,T('团队','Team'));{const ns=d.team==='SEN'?(d.section||''):'';if((p.section||'')!==ns){ch.push(`${T('科室','Section')}${CO()}${secName(p.section)||'—'} → ${secName(ns)||'—'}`);p.section=ns}}setF('scope',d.scope,T('执行要求','Plan'));
    if(to!==from){
      if(to==='closed'||to==='canceled')voidPending(p,to,why,'Aiden');
      // an approved close report: closing it is the meeting close (post-close follow-up), without the meeting wording
      if(from==='to_report'&&to==='closed'){if(ch.length)p.history.push({at:nowStamp(),by:'Aiden',text:T('PMO 直接修改：','PMO edit: ')+ch.join(T('；','; '))});S.drawer.edit=false;meetClose(p.id,{direct:true,why,mail:false});return}
      ch.push(`${T('状态','Status')}${CO()}${T(ST[from].zh,ST[from].en)} → ${T(ST[to].zh,ST[to].en)}${whyTxt(why)}`);p.status=to;if(to==='closed'){p.closedAt=today();p.actual=today()}
    }else if(why&&ch.length)ch.push(`${T('原因','Reason')}${CO()}${why}`);
    if(ch.length)p.history.push({at:nowStamp(),by:'Aiden',text:T('PMO 直接修改：','PMO edit: ')+ch.join(T('；','; '))});S.drawer.edit=false;save();render();toast(ch.length?T('已保存','Saved'):T('没有修改','No changes'),ch.length?'ok':'info');return}
});
document.addEventListener('change',e=>{
  if(e.target.id==='whoSel')switchUser(e.target.value);
  if(e.target.name==='team'&&e.target.closest('#pmoEdit')){const s=$('#peSecF');s&&(s.hidden=e.target.value!=='SEN')}
  if(e.target.id==='fSec'){const f=curItem();const o=f.section||'';f.section=e.target.value;f.history.push({at:nowStamp(),by:'Aiden',text:`${T('科室','Section')}${CO()}${secName(o)||'—'} → ${secName(f.section)||'—'}`});save();render()}
  if(e.target.id==='fType'){const f=curItem();const o=f.ftype;f.ftype=e.target.value;f.history.push({at:nowStamp(),by:'Aiden',text:`${T('类型','Type')}${CO()}${T(FT[o].zh,FT[o].en)} → ${T(FT[f.ftype].zh,FT[f.ftype].en)}`});save();render()}
});
document.addEventListener('input',e=>{
  if(e.target.id!=='q')return;const q=e.target.value.trim().toLowerCase();const r=$('#qres');
  if(!q){r.hidden=true;return}
  const hits=[...S.projects.filter(canView).map(p=>['p',p]),...viewF().map(f=>['f',f])].filter(([,p])=>(p.code+' '+p.name+' '+(p.old||'')+' '+(p.oldNew||'')+' '+(p.prev||'')).toLowerCase().includes(q)).slice(0,12);
  r.innerHTML=hits.map(([k,p])=>`<button role="option" data-act="qpick" data-k="${k}" data-id="${p.id}"><span class="mono small faint" style="flex:none;width:84px">${p.code}</span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span></button>`).join('')||`<div class="empty small">${T('没有匹配的项目，试试项目编号或名称里的词','No matching project. Try a code or a word from the name')}</div>`;r.hidden=false;
});
// Esc goes back from a project; inside a field with text it only leaves the field, so typing is not lost
document.addEventListener('keydown',e=>{if(e.key!=='Escape'||!S.drawer||e.isComposing||e.keyCode===229)return;const t=e.target;if(t.closest&&t.closest('#drawer')&&t.matches('textarea,select,input:not([type=radio]):not([type=checkbox])')&&(t.value||S.drawer.edit)){t.blur();return}closeDrawer()});
function switchUser(v){let id=v,tv=null;if(v==='pmo')id='pmo';else if(v.startsWith('user:'))id=v.slice(5);else if(v.startsWith('team:')){tv=v.slice(5);const m=mgrOfKey(tv);id=m?m.id:'pmo'}navReset();hideCtx();hideModal();S.user=id;S.teamView=tv;const u=me();S.lang=u.lang||'zh';S.view='dashboard';S.drawer=null;S.filters={};S.formPid=null;S.formPrefill=null;save();render();toast(T(`已切换为 ${u.name}`,`Signed in as ${u.name}`))}
/* tooltip */
(()=>{let tip=null;document.addEventListener('mouseover',e=>{const el=e.target.closest('[data-tip]');if(!el){if(tip){tip.remove();tip=null}return}if(!tip){tip=document.createElement('div');tip.className='tip';document.body.appendChild(tip)}tip.textContent=el.dataset.tip});
document.addEventListener('mousemove',e=>{if(tip){const w=tip.offsetWidth;tip.style.left=Math.min(window.innerWidth-w-8,e.clientX+14)+'px';tip.style.top=(e.clientY+16)+'px'}})})();


/* ================= interaction layer: error states, banners, focus, keyboard, accessibility =================
   Everything here wraps the views without changing them: render() catches failures and shows an error state,
   every repaint is followed by enhance() (labels, keyboard access, ARIA), and focus survives repaints. */

// ---- error state: a failed view never leaves a blank page ----
let LAST_ERR=null;
function errorState(e,where){
  const msg=String(e&&(e.message||e)||'Error');const T=(z,en)=>{try{return S&&S.lang==='en'?en:z}catch(_){return z}};
  return `<div class="state state-err" role="alert">${ico('alert','state-ic')}<h2>${T('这个页面没有正常显示','This page could not be shown')}</h2>
    <p class="muted">${T('数据没有丢失。可以重试，或先回到项目看板。','Your data is safe. Try again, or go back to the dashboard.')}</p>
    <div class="row" style="justify-content:center"><button class="btn pri" data-act="retry">${ico('refresh')}${T('重试','Try again')}</button><button class="btn" data-act="go" data-v="dashboard">${T('回到项目看板','Go to dashboard')}</button></div>
    <details class="state-d"><summary>${T('技术信息（发给 PMO 排查用）','Technical details (for the PMO)')}</summary><pre>${esc((where?where+': ':'')+msg)}</pre></details></div>`;
}
// which pages are used: one tiny event per page change (kept in the browser for the demo, in the database for the live site)
let USAGE_LAST='',USAGE_CACHE=null,USAGE_LOADING=false;const USAGE_Q=[];
function trackView(){
  if(!S.user||!S.view)return;const k=S.view==='pmo'?'pmo/'+pmoTab():S.view==='alsa'?'alsa/'+alsaTab():S.view;if(k===USAGE_LAST)return;USAGE_LAST=k;
  const ev={d:new Date().toISOString().slice(0,10),u:me().id,r:me().role,v:k};USAGE_Q.push(ev);
  if(!window.usageBackend){const L=(S.usageEv=S.usageEv||[]);L.push(ev);if(L.length>1500)L.splice(0,L.length-1500)}
}
const usageFlush=()=>{if(window.usageBackend&&USAGE_Q.length){const b=USAGE_Q.splice(0);window.usageBackend.log(b).catch(()=>{})}};
setInterval(usageFlush,30000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')usageFlush()});
function render(){
  const fk=focusKey();
  try{renderApp();LAST_ERR=null;trackView()}
  catch(e){
    console.error(e);LAST_ERR=e;
    const c=$('#content');
    if(c)c.innerHTML=errorState(e,S.view);
    else $('#app').innerHTML=`<main class="content" id="content" tabindex="-1">${errorState(e,'app')}</main>`;
  }
  afterPaint(fk);
}
// drawer repaints go through the same safety net
const _renderDrawer=renderDrawer;
renderDrawer=function(){
  const fk=focusKey();
  try{_renderDrawer()}
  catch(e){console.error(e);const box=$('#drawer');if(box)box.innerHTML=`<div class="scrim" data-act="scrim"><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="dTitle"><div class="d-h"><div class="row">${dBack()}<span class="sp" style="flex:1"></span><button class="btn sm icon-btn" data-act="closeDrawer" aria-label="${T('关闭','Close')}">${ico('x')}</button></div><h2 id="dTitle" tabindex="-1">${T('出错了','Something went wrong')}</h2></div><div class="d-b">${errorState(e,'drawer')}</div></aside></div>`}
  afterPaint(fk);
};
// an error inside a click or form handler: say so instead of silently doing nothing
window.addEventListener('error',e=>{if(!e.error&&!e.message)return;console.error(e.error||e.message);toast(T('操作没有完成，请重试。如果反复出现，请联系 PMO。','That did not work. Please try again; contact the PMO if it keeps happening.'),'err')});
window.addEventListener('unhandledrejection',e=>{console.error(e.reason);toast(T('操作没有完成，请重试。','That did not work. Please try again.'),'err')});

// ---- banners: storage problems are shown on every page until they are gone ----
function bannersHTML(){
  const out=[];
  if(SAVE_ERR)out.push(`<div class="banner b-err" id="saveErr" role="alert">${ico('alert')}<span>${SAVE_ERR==='quota'?T('浏览器存储空间已满，新的修改无法保存。请清理浏览器数据或联系 PMO。','Browser storage is full, so new changes cannot be saved. Clear site data or contact the PMO.'):T('这个浏览器不允许保存数据（例如无痕模式），刷新后修改会丢失。','This browser does not allow saving (e.g. private mode); changes are lost on reload.')}</span></div>`);
  if(LOAD_ERR==='corrupt')out.push(`<div class="banner b-warn" role="status">${ico('info')}<span>${T('本地保存的数据无法读取，已载入初始演示数据；原数据已备份在浏览器中。','Saved data could not be read, so the demo data was loaded; the old data was backed up in this browser.')}</span><button class="btn sm ghost" data-act="dismissLoad">${T('知道了','Dismiss')}</button></div>`);
  return out.length?`<div class="banners">${out.join('')}</div>`:'';
}

// ---- focus that survives a repaint (keyboard users keep their place) ----
const FK_ATTRS=['act','id','v','val','k','l','t','tab','mid'];
function focusKey(){
  const a=document.activeElement;if(!a||a===document.body)return null;
  if(a.id&&a.id!=='content')return '#'+CSS.escape(a.id);
  if(a.dataset&&a.dataset.act)return FK_ATTRS.filter(k=>a.dataset[k]!=null).map(k=>`[data-${k}="${CSS.escape(a.dataset[k])}"]`).join('');
  return null;
}
let DRAWER_OPEN=false,OPENER=null;
function afterPaint(fk){
  enhance(document);
  const open=!!$('#drawer .drawer');
  if(open&&!DRAWER_OPEN){const h=$('#dTitle');h&&h.focus({preventScroll:true})}
  else if(!open&&DRAWER_OPEN&&OPENER){const el=$(OPENER);if(el){el.focus({preventScroll:true});OPENER=null;DRAWER_OPEN=open;return}}
  DRAWER_OPEN=open;
  if(fk&&(document.activeElement===document.body||!document.activeElement)){const el=document.querySelector(fk);if(el&&el.offsetParent!==null)el.focus({preventScroll:true})}
}
// remember what opened the drawer, to return focus there when it closes
document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el||$('#drawer .drawer'))return;const a=el.dataset.act;if(['open','openf','qpick','go'].includes(a)||el.closest('#content'))OPENER=focusKeyOf(el)},true);
const focusKeyOf=el=>FK_ATTRS.filter(k=>el.dataset[k]!=null).map(k=>`[data-${k}="${CSS.escape(el.dataset[k])}"]`).join('')||null;

// ---- accessibility pass after each repaint ----
let FLD=0;
const NATIVE='button,a[href],input,select,textarea,summary,label,[contenteditable]';
function enhance(root){
  // labels belong to their field (screen readers read the label, clicking the label focuses the field)
  root.querySelectorAll('.f').forEach(f=>{const lb=f.querySelector(':scope>label');if(!lb||lb.htmlFor||lb.querySelector('input,select,textarea'))return;
    const c=f.querySelector(':scope>input:not([type=hidden]),:scope>select,:scope>textarea,:scope>.row input,:scope>div>input:not([type=hidden]),:scope>div>select');if(!c)return;if(!c.id)c.id='fld'+(++FLD);lb.htmlFor=c.id;
    if(lb.querySelector('.req')&&!c.hasAttribute('aria-required'))c.setAttribute('aria-required','true')});
  // anything clickable can be reached and used with the keyboard
  root.querySelectorAll('[data-act]').forEach(el=>{const a=el.dataset.act;if(a==='scrim'||a==='qaScrim'||el.matches(NATIVE)||el.closest('svg')||el.matches('.g-bar,.g-ms'))return;
    if(!el.hasAttribute('tabindex'))el.tabIndex=0;if(!el.hasAttribute('role'))el.setAttribute('role','button')});
  root.querySelectorAll('td input:not([type=hidden]),td select,td textarea').forEach(c=>{if(c.getAttribute('aria-label')||(c.labels&&c.labels.length))return;
    const td=c.closest('td'),tr=td.parentNode,tb=tr.closest('table'),th=tb&&tb.tHead&&tb.tHead.rows[0]&&tb.tHead.rows[0].cells[td.cellIndex];
    const col=th?th.textContent.trim():'',row=(tr.cells[0]&&tr.cells[0]!==td?tr.cells[0].textContent.trim():'').slice(0,40);const l=[col,row].filter(Boolean).join(' · ');l&&c.setAttribute('aria-label',l)});
  root.querySelectorAll('.g-bar[data-act],.g-ms[data-act]').forEach(el=>{el.tabIndex=-1});
  root.querySelectorAll('[data-tip]:not([tabindex]):not(button):not(a)').forEach(el=>{if(!el.closest('[data-act]'))el.tabIndex=0});
  root.querySelectorAll('.seg').forEach(g=>{if(!g.hasAttribute('role'))g.setAttribute('role','group');g.querySelectorAll(':scope>button').forEach(b=>b.setAttribute('aria-pressed',b.classList.contains('on')))});
  root.querySelectorAll('img:not([alt])').forEach(i=>i.alt='');
  const mb=$('.menu-btn');if(mb){const o=!!$('#side.open');mb.setAttribute('aria-expanded',o)}
  const app=$('#app');app&&app.removeAttribute('aria-busy');
}
// Enter / Space on a keyboard-reachable row or card does what a click does
document.addEventListener('keydown',e=>{
  if(e.key!=='Enter'&&e.key!==' ')return;const el=e.target;if(!el||!el.dataset||!el.dataset.act||el.matches(NATIVE))return;
  e.preventDefault();el.click();
});
// tooltips also for keyboard focus
document.addEventListener('focusin',e=>{const el=e.target.closest&&e.target.closest('[data-tip]');let tip=$('.tip.kb');if(!el){tip&&tip.remove();return}
  if(!tip){tip=document.createElement('div');tip.className='tip kb';document.body.appendChild(tip)}tip.textContent=el.dataset.tip;const r=el.getBoundingClientRect();tip.style.left=Math.min(innerWidth-tip.offsetWidth-8,r.left)+'px';tip.style.top=(r.bottom+6)+'px'});
document.addEventListener('focusout',()=>{const t=$('.tip.kb');t&&t.remove()});

// ---- dialogs keep focus inside while open ----
document.addEventListener('keydown',e=>{
  if(e.key!=='Tab')return;const box=$('#qa .qa')||$('#drawer .drawer');if(!box)return;
  const f=[...box.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&x.offsetParent!==null);if(!f.length)return;
  const i=f.indexOf(document.activeElement);
  if(e.shiftKey&&(i<=0)){f[f.length-1].focus();e.preventDefault()}else if(!e.shiftKey&&(i===f.length-1||i<0&&!box.contains(document.activeElement))){f[0].focus();e.preventDefault()}
});
// drawer tabs: arrow keys move between tabs (WAI-ARIA tabs pattern)
document.addEventListener('keydown',e=>{
  const t=e.target;if(!t.matches||!t.matches('[role=tab]'))return;const tabs=[...t.parentNode.querySelectorAll('[role=tab]')];let i=tabs.indexOf(t);
  if(e.key==='ArrowRight')i=(i+1)%tabs.length;else if(e.key==='ArrowLeft')i=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=tabs.length-1;else return;
  e.preventDefault();tabs[i].click();const n=document.querySelector('[role=tab][aria-selected=true]');n&&n.focus();
});

// ---- search results: arrow keys ----
document.addEventListener('keydown',e=>{
  const q=$('#q'),r=$('#qres');if(!q||!r||r.hidden)return;const items=[...r.querySelectorAll('button')];if(!items.length)return;
  const i=items.indexOf(document.activeElement);
  if(e.target===q&&e.key==='ArrowDown'){items[0].focus();e.preventDefault()}
  else if(i>=0&&e.key==='ArrowDown'){(items[i+1]||items[0]).focus();e.preventDefault()}
  else if(i>=0&&e.key==='ArrowUp'){(i?items[i-1]:q).focus();e.preventDefault()}
  else if((i>=0||e.target===q)&&e.key==='Escape'){r.hidden=true;q.focus();e.preventDefault();e.stopPropagation()}
},true);

// ---- immediate feedback on submit: the button shows it is working ----
document.addEventListener('submit',e=>{const b=e.submitter||e.target.querySelector('button:not([type=button])');if(!b)return;b.setAttribute('aria-busy','true');setTimeout(()=>{if(b.isConnected&&!b.disabled)b.removeAttribute('aria-busy')},400)},true);
// a field our own checks reject: marked invalid, focused, and cleared as soon as the user types
function flagField(el){if(!el)return;el.setAttribute('aria-invalid','true');el.focus();el.addEventListener('input',()=>el.removeAttribute('aria-invalid'),{once:true})}
// a field the browser rejects explains itself next to the field
document.addEventListener('invalid',e=>{const f=e.target;f.setAttribute('aria-invalid','true');f.addEventListener('input',()=>f.removeAttribute('aria-invalid'),{once:true})},true);

// ---- keyboard shortcuts ----
const SHORTCUTS=()=>[
  [['/'],T('搜索项目','Search projects')],[['Ctrl','K'],T('搜索项目','Search projects')],
  [['g','d'],T('项目看板','Dashboard')],[['g','p'],T('项目库','All projects')],[['g','r'],T('风险与问题','Risks & issues')],[['g','t'],T('甘特图','Gantt')],
  [['g','b'],T('双周更新','Two-week updates')],[['g','a'],T('我的待办审批','My approvals')],[['g','f'],T('跟进项','Follow-ups')],[['g','l'],T('ALSA 战略项目','ALSA projects')],[['g','m'],T('邮件提醒','Email reminders')],
  [['n'],T('新建项目申请','New project request')],[['['],T('返回上一个界面','Back')],[['Esc'],T('关闭弹窗 / 返回','Close dialog / back')],[['←','→'],T('在项目详情里切换页签','Switch drawer tabs')],[['?'],T('显示快捷键','Show shortcuts')]];
const GO_KEYS={d:'dashboard',p:'projects',r:'risks',t:'gantt',b:'biweekly',a:'approvals',f:'follows',l:'alsa',m:'mail'};
let gAt=0;
function showKeys(){
  hideModal();const d=document.createElement('div');d.id='qa';d.className='scrim qa-scrim';d.dataset.act='qaScrim';
  d.innerHTML=`<div class="qa" role="dialog" aria-modal="true" aria-labelledby="kTitle"><div class="row qa-h"><h3 id="kTitle" style="flex:1">${T('键盘快捷键','Keyboard shortcuts')}</h3><button class="btn sm icon-btn" data-act="qaCancel" aria-label="${T('关闭','Close')}">${ico('x')}</button></div>
    <dl class="keys">${SHORTCUTS().map(([k,l])=>`<dt>${k.map(x=>`<kbd>${esc(x)}</kbd>`).join(k[0]==='g'?' ':' + ')}</dt><dd>${esc(l)}</dd>`).join('')}</dl>
    <p class="small faint" style="margin:12px 0 0">${T('在输入框里打字时快捷键不生效。','Shortcuts are off while you type in a field.')}</p></div>`;
  document.body.appendChild(d);histArm();d.querySelector('[data-act=qaCancel]').focus();
}
document.addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.isComposing||e.keyCode===229)return;
  const t=e.target,typing=t&&t.matches&&t.matches('input,textarea,select,[contenteditable]');
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='k'){const q=$('#q');if(q&&q.offsetParent){e.preventDefault();q.focus();q.select()}return}
  if(typing||e.ctrlKey||e.metaKey)return;
  if(e.altKey){if(e.key==='ArrowLeft'&&canBack()){e.preventDefault();backBtn()}return}
  if($('#qa')||$('.ctx'))return;
  const k=e.key;
  if(gAt&&Date.now()-gAt<1200){gAt=0;if(GO_KEYS[k]){e.preventDefault();hideCtx();go(GO_KEYS[k])}return}
  if(k==='g'){gAt=Date.now();return}
  if(k==='/'){const q=$('#q');if(q&&q.offsetParent){e.preventDefault();q.focus()}return}
  if(k==='?'){e.preventDefault();showKeys();return}
  if(k==='n'&&!S.drawer){e.preventDefault();go('apply');return}
  if(k==='['&&canBack()){e.preventDefault();backBtn();return}
});
document.addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el)return;const a=el.dataset.act;
  if(a==='keys'){showKeys();return}
  if(a==='retry'){render();toast(T('已重新加载页面','Reloaded'),'info');return}
  if(a==='dismissLoad'){LOAD_ERR=null;render();return}
  if(a==='clearPf'){Object.assign(S.filters,{q:'',st:'all',group:'',team:'',y:''});save();render();toast(T('已清除筛选','Filters cleared'),'info');return}
});

/* boot: a skeleton is in the page until the first paint replaces it; a failed start shows the error state, not a frozen skeleton */
/* boot handled by sync.js */


