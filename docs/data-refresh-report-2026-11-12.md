# Data refresh report: new progress sheet vs the platform seed (2026-11-12)

Read-only comparison. **Nothing was changed** (no seed, no build, no database). Source: `data_source/EU Passenger Car Aftersales Project Progress Management Sheet.xlsx` (18 team sheets) against `web/src/seed.js` (254 projects + 40 follow-ups).

## 1. Numbers

| Item | Count |
|---|---|
| Rows in the 18 team sheets | 498 |
| Empty template rows (only a Task Status, nothing else) | 190 |
| Rows with a project (incl. follow-ups) | 308 |
| Seed items (projects + follow-ups) | 294 |
| Seed items found in the new sheet | 294 |
|   of which also listed in a second sheet (cross-listed) | 6 |
| **New projects / follow-ups (not in the seed)** | 8 |
| Seed items NOT in the new sheet | 0 |
| Same ID, project renamed | 2 |
| Status changes (Project Status) | 17 |
| Person in charge changed | 2 |
| Executor list changed | 15 |
| Planned end date changed | 12 |
| Start / actual end date changed | 0 |
| Projects with new extension notes | 11 |
| **New progress records (per-period cells not in the seed)** | 99 |
| Progress records in the seed that are no longer in the sheet (approx.) | 10 |
| New Project ID differs from the code the platform holds | 50 |
| Matched rows with no New Project ID in the sheet | 146 |
| Duplicated Project Number / New Project ID values | 29 |
| Format anomalies (section 9) | 144 |


## 2. New projects / follow-ups (in the sheet, not in the platform)

| Sheet | Row | New Project ID | Name | Owner | Status | Start | Planned end |
|---|---|---|---|---|---|---|---|
| Benelux&Nordic&Baltics | 19 | EAS-2026-BNB-008 | Swiss Winter Complete Wheel | Paolo Liistro | In Progress | 2026-05-12 | 2027-03-31 |
| Benelux&Nordic&Baltics | 20 | EAS-2026-BNB-009 | HV Battery Authorized Repair Network Development - Switzerla | Paolo Liistro | In Progress | 2026-09-23 | 2026-12-31 |
| CEE | 52 | EAS-2026-CEE-003 | HV Battery Authorized Repair Network Development - Poland | Mariusz Kiljańczyk | In Progress | 2026-09-23 | 2026-12-31 |
| 服务工程部 | 35 | EAS-2026-SEN-005 | 成本精细化测算及成本优化 | 段梦醒Blair | In Progress | 2026-10-05 | 2026-12-31 |
| 服务工程部 | 36 | EAS-2026-SEN-006 | BYD欧洲经销商系统及VDS收费项目 | 段梦醒Blair | In Progress | 2026-09-11 | 2027-01-31 |
| 服务工程部 | 37 | EAS-2026-SEN-007 | BYD钣喷中心泛欧认证标准 | 黄明辉Brent | In Progress | 2026-10-01 | 2027-03-31 |
| 服务工程部 | 38 | EAS-2026-SEN-008 | 欧洲售后技术质量检查（TQC）体系建设 | 黄明辉Brent | In Progress | 2026-11-09 | 2027-04-30 |
| 待办跟进项 | 33 | EAS-ACT-2026-SEN-001 | 合同智能管理系统 | 段梦醒Blair | In Progress | 2026-11-10 |  |


## 3. In the platform but not in the new sheet

None. Two platform items only look missing at first because they were renamed under the same ID:

| ID | Platform name | Sheet name now | Owner now |
|---|---|---|---|
| EAS-2026-BNB-007 | 2026 Netherlands Battery Repair Center Establishment Pr | HV Battery Authorized Repair Network Development - Neth | 黄明辉Brent |
| EAS-2026-CEE-002 | 2026 Czech & Slovakia Battery Repair Center Establishme | HV Battery Authorized Repair Network Development - Czec | Marek Raninec |


## 4. Status changes (Project Status column)

The platform seed keeps the raw Project Status; Task Status is not stored, so it cannot be compared. Task Status in the new sheet: Overdue 177, On Track 105, Not Started 22, Completed 4.


| Code | Name | Platform | New sheet |
|---|---|---|---|
| TRN-25-F01 | Budapest Training Centre | Follow-up Action Item | Closed |
| EAS-2025-UKR-009 | Uber | Project need to be reported | Follow-up Action Item |
| EAS-2025-IBR-003 | BYD Dealer platform. Phase 1 - Start use | Project need to be reported | Closed |
| EAS-2025-CEE-009 | Megeler Istanbule new store needs to improve  | Closed | Canceled |
| CAT-26-F01 | 中亚培训标准化与品牌形象提升 / Central Asia Training Standa | Follow-up Action Item | Closed |
| CAT-26-F02 | 乌兹别克斯坦新车漆面质量专项分析 / Uzbekistan New Vehicle Pai | Follow-up Action Item | Closed |
| CAT-26-F04 | 乌兹博翼仓库电池转运 / Boyi Warehouse Battery Transfer  | Follow-up Action Item | Closed |
| CAT-26-F05 | NPS系统权限优化 / NPS System Permission Optimizatio | Follow-up Action Item | Closed |
| CAT-26-F07 | 代步车机制标准化与主动服务 / Courtesy Car Mechanism Standa | Follow-up Action Item | Closed |
| CAT-26-F09 | ASTANA乌尔根奇门店地图标注 / ASTANA Urgench Map Marking | Follow-up Action Item | Closed |
| EAS-2026-CVS-001 | 泛欧售后工程师Job Order标准化项目 | In Progress | Project need to be reported |
| EAS-2024-TEC-003 | SN内部审批流程及文档管理规范 | Project need to be reported | Pending |
| EAS-2024-TEC-001 | 核实海外售后《服务店新能源安全生产检查规范》相关通知文件发布情况，保障市场落地执行。 | In Progress | Project need to be reported |
| EAS-2025-TEC-007 | 技索部112项目 | Closed | Pending |
| EAS-2025-TEC-003 | DMS和TIS备件工时的映射关系 | Project need to be reported | Canceled |
| EAS-2024-PLS-001 | 欧洲危险品仓开发 | In Progress | Closed |
| TEC-25-F01 | 海外市场电池维修中心由售后建设 | In Progress | Closed |


New-sheet status vocabulary: Closed 120, In Progress 69, Canceled 52, Pending 27, Project need to be reported 19, (blank) 13, Follow-up Action Item 6, Backlog 2.


## 5. Owner and executor changes

### Person in charge

| Code | Name | Platform | New sheet |
|---|---|---|---|
| EAS-2025-CCR-005 | RSA roll out plan | Anna Marchi | 黄浩 Cokey |
| EAS-2025-TEC-002 | 保养间隔界面设置研究 | 朱泓源Janson | 赵栋Alex |

### Executors

| Code | Name | Platform | New sheet |
|---|---|---|---|
| EAS-2025-UKR-002 | UK Training Centre | Maurizio Pisano, 葛南宏Hugo | 葛南宏Hugo |
| EAS-2026-UKR-001 | 2026 UK Battery Repair Center Establishm | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | 葛南宏Hugo |
| EAS-2026-BNB-005 | Sweden Bodyshop | 姜鑫Xin | 姜鑫Xin , Daniel Papp |
| EAS-2026-BNB-006 | 2026 Sweden Battery Repair Center Establ | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | 姜鑫Xin , Daniel Papp, Peter Öster |
| EAS-2026-FRA-007 | 2026 France Battery Repair Center Establ | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | 许沛励Peili XU, Ben ZAHAF |
| EAS-2026-ITA-004 | 2026 Italy Battery Repair Center Establi | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | Liwei Zou, Paul Gervais Ava |
| EAS-2025-IBR-006 | BYD Auto insurance | Jesús Javier Pérez Blanco, Paula Noreña | Jesús Javier Pérez Blanco |
| EAS-2026-IBR-002 | 2026 Spain Battery Repair Center Establi | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | Jesús Javier Pérez Blanco |
| EAS-2026-SEE-001 | 2026 Israel Battery Repair Center Establ | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | 史宇Sirius |
| EAS-2026-CAC-023 | 2026 Turkey Battery Repair Center Establ | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | Murat Taşkın |
| EAS-2025-CVS-001 | 电动巴士玻璃库存再销售 Resale of Electric Bus Inven | Joao Pedro Sousa Guerra, 周翔宇Naoko Zhou, 马悦Yue Ma | Joao Pedro Sousa Guerra, 周翔宇Naoko Zhou, 马悦Yue Ma, 殷平Eva |
| EAS-2026-SEN-002 | BSS升级项目 | 龙丽竹 Bamboo, 吴雨瞳 Yutong, 马百德 Chester, 靳日朝 Richao, 唐亦凡 Yvonne, 马悦 Yue Ma | 龙丽竹 Bamboo, 吴雨瞳Yutong, 马百德 Chester, 靳日朝Richao, 唐亦凡 Yvonne, 马悦 Yue Ma,  |
| EAS-2026-SEN-004 | 欧洲售后计划系统部署和应用 | 吴雨瞳 Yutong, 唐亦凡 Yvonne, 靳日朝 Richao, 潘雨婷 Effy, 潘天翔Peter, 赵捷 George | 唐亦凡 Yvonne, 靳日朝Richao, 潘天翔Peter, 赵捷 George, Haomiao WANG |
| EAS-2026-BNB-007 | 2026 Netherlands Battery Repair Center E | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair, 姜丹Vivian | 黄明辉Brent |
| EAS-2026-CEE-002 | 2026 Czech & Slovakia Battery Repair Cen | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | 赵栋Alex, 史宇Sirius , 段梦醒Blair |


## 6. Date changes

Start date and actual end date: no changes. Planned end date:

| Code | Name | Platform | New sheet |
|---|---|---|---|
| EAS-2026-BNB-004 | BYD Finland Aftersales Care Plan (monthly pay | 2026-10-31 | 2026-11-30 |
| EAS-2026-FRA-001 | FR Training center | 2026-10-31 | 2026-12-31 |
| EAS-2026-FRA-006 | Waste Management FRANCE | 2026-10-31 | 2026-12-31 |
| EAS-2026-IBR-001 | Dealers automatic payment for parts purchasin | 2026-09-30 | 2026-11-30 |
| EAS-2026-CAC-001 | Workshop Transparency | 2026-09-30 | 2026-11-30 |
| EAS-2025-UOP-002 | 权益中心及权益券 | 2026-09-30 | 2026-12-31 |
| EAS-2025-CVS-001 | 电动巴士玻璃库存再销售 Resale of Electric Bus Inventory | 2026-10-31 | 2026-12-31 |
| EAS-2024-TEC-001 | 核实海外售后《服务店新能源安全生产检查规范》相关通知文件发布情况，保障市场落地执行。 | 2026-09-30 | 2026-10-31 |
| EAS-2025-TEC-002 | 保养间隔界面设置研究 | 2026-10-11 | 2026-12-31 |
| EAS-2026-TEC-002 | VDS 换件中心运输模式（新）功能升级 | 2026-09-30 | 2026-12-31 |
| EAS-2026-PLS-002 | BSS系统备件退换货 | 2026-09-16 | 2026-11-30 |
| EAS-2026-SEN-004 | 欧洲售后计划系统部署和应用 | 2026-11-15 | 2026-11-30 |

New extension notes (the Notes / Revised Completion column mentions a date the platform does not hold):

| Code | Name | Platform extensions | New note |
|---|---|---|---|
| EAS-2025-NBA-005 | Bolt Europe aftersales SLA | — | 30/9/2025 |
| EAS-2026-IBR-001 | Dealers automatic payment for parts purc | 2026-06-30 | Extension: 30/6/2026 30/9/2026 |
| EAS-2026-CAC-001 | Workshop Transparency | — | 30/6/2026 |
| EAS-2025-CVS-002 | 项目名称：构建商用车售后数据库 项目范围：开发集中式售后数据库，以整合所有关键数 | — | 30/6/2025 30/7/2025 |
| EAS-2024-CVS-003 | 英国大客户Metroline电池延保服务协议&执行 | — | 30/8/2025 |
| EAS-2025-CVS-001 | 电动巴士玻璃库存再销售 Resale of Electric Bus Inven | 2025-09-30, 2025-10-31, 2025-12-31, 2026-03-31, 2026-05-31, 2026-08-19 | Extension:  30/9/2025 31/10/2025 31/12/2025 31/3/2026 31/5/2026 19/8/2026 31/10/ |
| EAS-2024-TEC-001 | 核实海外售后《服务店新能源安全生产检查规范》相关通知文件发布情况，保障市场落地执 | 2025-09-30, 2025-10-31, 2026-02-13, 2026-03-31, 2026-05-13 | Extention: 30/9/2025 31/10/2025 13/2/2026 31/3/2026 13/5/2026 30/9/2026 |
| EAS-2025-TEC-002 | 保养间隔界面设置研究 | 2025-12-31, 2026-03-31, 2026-05-31 | Extention: 31/12/2025 31/3/2026 31/5/2026 31/10/2026 |
| EAS-2026-TEC-002 | VDS 换件中心运输模式（新）功能升级 | 2026-07-31 | Extention: 31/7/2026 30/9/2026 31/10/2026 |
| EAS-2025-PLS-001 | 欧洲仓网OTD降本增效 | — | 31/3/2026 |
| EAS-2026-PLS-002 | BSS系统备件退换货 | 2025-08-30 | Extention: 30/8/2026 16/9/2026 |


## 7. New progress records, by team

A record is one per-period cell whose text is not in the seed (matched on the text, so an ambiguous d/m or m/d column header cannot create false records).

| Sheet | Team code | New progress records |
|---|---|---|
| 待办跟进项 | Follow-ups | 21 |
| 技术索赔部 | TEC | 10 |
| 服务产品经营科 | PBS | 8 |
| Central Aisa&Caucasus | CAT | 7 |
| 用户运营科 | UOP | 6 |
| 商用车服务部 | CVS | 6 |
| CEE | CEE/POL | 5 |
| 欧洲备件部 | PLS | 5 |
| UK&RHD | UKR | 4 |
| Benelux&Nordic&Baltics | BNL/NBA | 4 |
| France | FRA | 4 |
| Italy | ITA | 4 |
| 服务工程部 | SEN | 4 |
| Training Management | TRN | 3 |
| Germany | GER | 3 |
| Iberia | IBR | 3 |
| Customer Care | CCR | 1 |
| SEE & Israel | SEI | 1 |
| **Total** |  | 99 |


Samples:

| Sheet | Code | Column date | Text |
|---|---|---|---|
| Customer Care | EAS-2025-CCR-005 | 4/11/2026 | 1) Stella approved best performance setup 2) Awaiting finalization by  |
| Training Management | EAS-2026-TRN-001 | 4/11/2026 | Training Centre Planner developed (Business Plan, Centre Grade, Tools  |
| Training Management | EAS-2026-TRN-002 | 4/11/2026 | - Account management – [completed / in final testing and adding the us |
| Training Management | TRN-25-F01 | 4/11/2026 | Site analysed: the existing Cromax building at Tisztes utca 1, Budapes |
| UK&RHD | EAS-2025-UKR-001 | 4/11/2026 | I submitted a closure project on this last month. The firsy performanc |
| UK&RHD | EAS-2025-UKR-001 | 7/10/2026 | UK Bodyshop are active and operational 137. We have now added a link o |
| UK&RHD | EAS-2025-UKR-002 | 4/11/2026 | UK team, Benny, Liam viewed over 10 locations and all of them didnt me |
| UK&RHD | EAS-2026-UKR-001 | 4/11/2026 | For UK, we have done some work in the back. we have reached out to our |
| Germany | EAS-2026-DE-001 | 4/11/2026 | Monthly Invoicing: 1. #45781 Complete Note, RRP, discount, logistics d |
| Germany | EAS-2026-DE-002 | 4/11/2026 | 1. Building Alteration Application => All documents approved, PoA appr |
| Germany | EAS-2026-DE-003 | 4/11/2026 | 1. ALSA feedback provided 2. According to SA 2.2 all service shops are |
| Benelux&Nordic&Baltics | EAS-2026-BNB-004 | 4/11/2026 | GDPR clause cleared and product offering went live on Fragus sales por |


## 8. New Project ID differs from the code the platform holds (50)

The platform keeps the code it assigned earlier (sheet IDs where there were any, otherwise numbered). These rows now show a different ID in the sheet:


| Kind | Count |
|---|---|
| seed has it as follow-up (F-code); sheet gives it an EAS project ID | 34 |
| sheet uses a new EAS-ACT- format | 5 |
| sheet ID has year and team swapped (EAS-CVS-2025-001) | 5 |
| same team and year, different number (renumbered or shifted) | 3 |
| different team or year code | 3 |

| Sheet | Name | Platform code | Sheet New Project ID | Kind |
|---|---|---|---|---|
| Training Management | Budapest Training Centre | TRN-25-F01 | EAS-2026-TRN-003 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| Italy | HV Battery Authorized Repair Netwo | EAS-2026-ITA-004 | EAS-2026-ITA-003 | same team and year, different number (renumbered or shifted) |
| Iberia | Tow bar accessories | EAS-2025-IBR-022 | EAS-2025-IBR-007 | same team and year, different number (renumbered or shifted) |
| CEE | Moldova aftersales readiness | EAS-2025-CEE-012 | EAS-ACT-2025-CEE-001 | sheet uses a new EAS-ACT- format |
| CEE | Bulgaria aftersales readiness | EAS-2025-CEE-013 | EAS-ACT-2025-CEE-002 | sheet uses a new EAS-ACT- format |
| SEE & Israel | Israel Battery recycling locally | EAS-2025-SEI-001 | EAS-ACT-2025-SEE-001 | sheet uses a new EAS-ACT- format |
| SEE & Israel | BYD Roadside Assistance Number | EAS-2025-SEI-005 | EAS-ACT-2025-SEE-002 | sheet uses a new EAS-ACT- format |
| Central Aisa&Caucasus | Region dealer parts logistics calc | EAS-2025-CAT-010 | EAS-ACT-2026-CAC-001 | sheet uses a new EAS-ACT- format |
| Central Aisa&Caucasus | 中亚培训标准化与品牌形象提升 / Central Asia Trai | CAT-26-F01 | EAS-2026-CAC-011 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| Central Aisa&Caucasus | 乌兹别克斯坦新车漆面质量专项分析 / Uzbekistan New  | CAT-26-F02 | EAS-2026-CAC-012 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| Central Aisa&Caucasus | Training Subscription收费模式研究 / Trai | CAT-26-F03 | EAS-2026-CAC-014 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| Central Aisa&Caucasus | 乌兹博翼仓库电池转运 / Boyi Warehouse Batter | CAT-26-F04 | EAS-2026-CAC-016 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| Central Aisa&Caucasus | NPS系统权限优化 / NPS System Permission  | CAT-26-F05 | EAS-2026-CAC-017 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| Central Aisa&Caucasus | 备件政策优化与返点机制 / Parts Policy Optimiz | CAT-26-F06 | EAS-2026-CAC-019 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| Central Aisa&Caucasus | 代步车机制标准化与主动服务 / Courtesy Car Mecha | CAT-26-F07 | EAS-2026-CAC-020 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| Central Aisa&Caucasus | 海外备件编码/包装差异化调研 / Overseas Parts Co | CAT-26-F08 | EAS-2026-CAC-021 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| Central Aisa&Caucasus | ASTANA乌尔根奇门店地图标注 / ASTANA Urgench  | CAT-26-F09 | EAS-2026-CAC-022 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 用户运营科 | APP社区2.0 | EAS-2025-UOP-001 | EAS-2025-CCR-002 | different team or year code |
| 用户运营科 | 权益中心及权益券 | EAS-2025-UOP-002 | EAS-2025-CCR-004 | different team or year code |
| 用户运营科 | BYD生活商城搭建 | EAS-2026-UOP-001 | EAS-2025-CCR-005 | different team or year code |
| 商用车服务部 | SLA | EAS-2024-CVS-005 | EAS-CVS-2025-001 | sheet ID has year and team swapped (EAS-CVS-2025-001) |
| 商用车服务部 | 电动巴士玻璃库存再销售 Resale of Electric Bus | EAS-2025-CVS-001 | EAS-CVS-2025-002 | sheet ID has year and team swapped (EAS-CVS-2025-001) |
| 商用车服务部 | 泛欧售后工程师Job Order标准化项目 | EAS-2026-CVS-001 | EAS-CVS-2026-001 | sheet ID has year and team swapped (EAS-CVS-2025-001) |
| 商用车服务部 | 欧洲商用车售后服务商招标框架设计 EU Commercial Veh | EAS-2026-CVS-003 | EAS-CVS-2026-002 | sheet ID has year and team swapped (EAS-CVS-2025-001) |
| 商用车服务部 | 商用车动力电池延保测算模型 CV Power Battery War | EAS-2026-CVS-002 | EAS-CVS-2026-003 | sheet ID has year and team swapped (EAS-CVS-2025-001) |
| 技术索赔部 | VDS 换件中心运输模式（新）功能升级 | EAS-2026-TEC-002 | EAS-2026-TEC-004 | same team and year, different number (renumbered or shifted) |
| 服务工程部 | 系统及手册收费与VDS订阅制 / System & Manual C | SEN-26-F02 | EAS-2026-CAC-015 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 海外市场电池维修中心由售后建设 | TEC-25-F01 | EAS-ACT-2025-TEC-001 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | Denza远程诊断功能 | TEC-25-F04 | EAS-ACT-2025-TEC-002 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 15款轮胎完成欧洲市场铺货 | PLS-25-F02 | EAS-ACT-2025-PLS-001 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 建立本地适应性核心零部件预授权识别，提报，审批流程，预授权流程顺畅， | TEC-25-F07 | EAS-ACT-2025-TEC-003 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | PDS车辆市场操作流程标准卡片设计 | TEC-25-F08 | EAS-ACT-2025-TEC-004 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 技术推进管控系统线上化 | TEC-26-F01 | EAS-ACT-2026-TEC-001 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 车辆后台数据调取，技索团队拿到预授权 | TEC-26-F02 | EAS-ACT-2026-TEC-002 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 国内和欧销售后共享AI技术诊断平台 | TEC-26-F03 | EAS-ACT-2026-TEC-003 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 欧洲电池消防操作本地化方案落地 | TEC-26-F04 | EAS-ACT-2026-TEC-004 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 技术工程组的本地化业务要加强 | TEC-26-F05 | EAS-ACT-2026-TEC-005 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 索赔BI看板 | TEC-26-F06 | EAS-ACT-2026-TEC-006 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 备件拆分 | TEC-26-F07 | EAS-ACT-2026-TEC-007 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 二次追赔 | TEC-26-F08 | EAS-ACT-2026-TEC-008 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 全球技术巡检 | UOP-26-F01 | EAS-ACT-2026-SEN-001 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | Social listening 舆情监控Agent | UOP-26-F02 | EAS-ACT-2026-SEN-002 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 保养记录手册 | TEC-24-F01 | EAS-ACT-2024-TEC-001 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 技索部112项目 | TEC-25-F03 | EAS-ACT-2025-TEC-005 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | VDS诊断&资料融合 | TEC-25-F05 | EAS-ACT-2025-TEC-006 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | LMS2.0问题解决跟进 | SEN-26-F01 | EAS-ACT-2026-SEN-003 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 电池包降级处理车间的标准处置流程 评估各国推进防火毯/防爆箱，开发相 | TEC-26-F09 | EAS-ACT-2026-TEC-007 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 售后体系升级｜成立大客户专项跟踪小组 + 主动客户经营SOP | CVS-26-F01 | EAS-ACT-2026-CVS-001 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 卡车质保体系优化｜质保目标做到10年，质保标准优于竞品20% | CVS-26-F02 | EAS-ACT-2026-CVS-002 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |
| 待办跟进项 | 降低质保成本 / 对标欧洲OEM，将质保预留降低2%-3% | CVS-26-F03 | EAS-ACT-2026-CVS-003 | seed has it as follow-up (F-code); sheet gives it an EAS project ID |


Matched rows with no New Project ID in the sheet: 146 (the platform number would stay).


## 9. Duplicates and format anomalies

### Duplicated IDs


* **Same New Project ID on two different projects** (needs a decision): `EAS-2025-CCR-002` (Customer Care r6 APP Community 2.0, 用户运营科 r2 APP社区2.0); `EAS-2025-CCR-004` (Customer Care r20 Review of Past Customer Benefi, 用户运营科 r3 权益中心及权益券); `EAS-2025-CCR-005` (Customer Care r33 RSA roll out plan, 用户运营科 r4 BYD生活商城搭建); `EAS-2026-ITA-003` (Italy r17 BYD Vehicle Repair Financing S, Italy r18 HV Battery Authorized Repair N); `EAS-2025-IBR-007` (Iberia r19 Waste Management (scrap)- Spai, Iberia r21 Tow bar accessories); `EAS-2026-SEN-005` (服务工程部 r32 BYD经销商全生命周期管理系统, 服务工程部 r35 成本精细化测算及成本优化); `EAS-ACT-2026-TEC-007` (待办跟进项 r20 备件拆分, 待办跟进项 r28 电池包降级处理车间的标准处置流程 评估各国推进防火毯/防爆箱); `EAS-ACT-2026-TEC-008` (待办跟进项 r21 二次追赔, 待办跟进项 r29 大数据授权); `EAS-ACT-2026-SEN-001` (待办跟进项 r22 全球技术巡检, 待办跟进项 r33 合同智能管理系统)

* **Project Number reused for different projects**: legacy numbers such as `ASP2025-001` are shared by up to 5 unrelated projects across sheets, so Project Number is not a unique key (20 numbers appear more than once; some are the same project listed in two sheets, e.g. Customer Care and UK&RHD).


### Other anomalies

| Kind | Rows |
|---|---|
| Closed but no actual completion date | 101 |
| name with leading/trailing spaces | 15 |
| no Project Status | 13 |
| no Person in Charge / Followed by | 10 |
| New Project ID with an unusual format | 5 |


New Project ID format problems: 商用车服务部 r17 `EAS-CVS-2025-001`, 商用车服务部 r32 `EAS-CVS-2025-002`, 商用车服务部 r33 `EAS-CVS-2026-001`, 商用车服务部 r34 `EAS-CVS-2026-002`, 商用车服务部 r35 `EAS-CVS-2026-003`


Rows with no Project Status: UK&RHD r2, UK&RHD r3, UK&RHD r4, UK&RHD r5, UK&RHD r6, UK&RHD r7, UK&RHD r8, UK&RHD r9, UK&RHD r10, UK&RHD r11, UK&RHD r12, UK&RHD r13, 服务产品经营科 r5

Rows with no Person in Charge: Training Management r2, UK&RHD r5, UK&RHD r6, UK&RHD r7, UK&RHD r8, UK&RHD r9, UK&RHD r10, UK&RHD r11, UK&RHD r12, UK&RHD r13


"Closed but no actual completion date": 101 rows, mostly legacy rows.


## 10. Decisions needed before anything is updated

1. Rule "the new sheet wins" for: status, owner, executors, planned end date, extension notes, new progress records, new projects. Confirm each, or say which fields the platform keeps.
2. Project codes: keep the platform codes (section 8) and only take the sheet IDs for the new projects; or follow the sheet IDs. Several sheet IDs clash with a different project (section 9), which the sheet owner would have to fix first.
3. The two renamed projects (Netherlands and Czech & Slovakia battery repair centres, now "HV Battery Authorized Repair Network Development"): rename, or keep the old name?
4. Follow-ups that the sheet now gives an `EAS-` or `EAS-ACT-` ID (section 8): keep as follow-ups, or convert to projects?
5. Online database: any sync must be an incremental upsert by project code that never touches requests, approvals or two-week updates made on the platform (written only after step 2 is confirmed).
