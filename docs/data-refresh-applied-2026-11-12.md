# Data refresh applied: demo seed updated from the new progress sheet (2026-11-12)
Rule confirmed by the user: **the new sheet wins** for status, owner, executors, planned end date, extension notes, new progress records and new projects. Platform codes are kept; the two renamed projects are renamed; the 34 follow-ups that now carry an EAS ID stay follow-ups. Source: `data_source/EU Passenger Car Aftersales Project Progress Management Sheet.xlsx`. Diff report: `docs/data-refresh-report-2026-11-12.md`.
Applied to `web/src/seed.js` (and the stored name translations in `web/src/data.js`) only. **The online database is not touched** (step 3, the incremental SQL, is still to be written). Changed items carry `rf:"2026-11-12"`, new ones `nw:1`; a saved demo gets the same changes through patch p27 (`refreshFromSeed`), which never deletes anything.
## Counts
| Change | Count |
|---|---|
| Status changed | 17 |
| Owner changed | 2 |
| Executor list replaced | 15 |
| Planned end date changed | 12 |
| Extension dates added | 14 |
| New progress records | 98 |
| Projects renamed | 2 |
| New projects / follow-ups | 8 |

## New items
| Code | Kind | Team | Section (assumed from the owner) | Name | Owner | Progress records |
|---|---|---|---|---|---|---|
| EAS-2026-BNB-008 | project | CHE |  | Swiss Winter Complete Wheel | Paolo Liistro | 1 |
| EAS-2026-BNB-009 | project | CHE |  | HV Battery Authorized Repair Network Development - | Paolo Liistro | 1 |
| EAS-2026-CEE-003 | project | POL |  | HV Battery Authorized Repair Network Development - | Mariusz Kiljańczyk | 1 |
| EAS-2026-SEN-006 | project | SEN | 售后商务科 | BYD欧洲经销商系统及VDS收费项目 | 段梦醒Blair | 2 |
| EAS-2026-SEN-007 | project | SEN | 渠道管理 | BYD钣喷中心泛欧认证标准 | 黄明辉Brent | 1 |
| EAS-2026-SEN-008 | project | SEN | 渠道管理 | 欧洲售后技术质量检查（TQC）体系建设 | 黄明辉Brent | 1 |
| EAS-2026-SEN-009 | project | SEN | 售后商务科 | 成本精细化测算及成本优化 | 段梦醒Blair | 2 |
| SEN-26-F03 | follow | SEN | 售后商务科 | 合同智能管理系统 | 段梦醒Blair | 1 |

Codes: sheet IDs were used where free. The sheet gave `EAS-2026-SEN-005` to two different projects; the platform already holds that code for the older one, so the new one (cost calculation) got the next free number `EAS-2026-SEN-009`. New BNB rows are Switzerland (team CHE) and Poland (team POL) by name. The follow-up got `SEN-26-F03` (sheet ID `EAS-ACT-2026-SEN-001` kept as the table code).
## Renamed (same code)
| Code | Old name | New name |
|---|---|---|
| EAS-2026-BNB-007 | 2026 Netherlands Battery Repair Center Establishment Project | HV Battery Authorized Repair Network Development - Netherlands |
| EAS-2026-CEE-002 | 2026 Czech & Slovakia Battery Repair Center Establishment Project | HV Battery Authorized Repair Network Development - Czech & Slovakia |

## Status changes
| Code | Name | Was | Now | Sheet value |
|---|---|---|---|---|
| TRN-25-F01 | Budapest Training Centre | open | closed | Closed |
| EAS-2025-UKR-009 | Uber | to_report | on_hold | Follow-up Action Item |
| EAS-2025-IBR-003 | BYD Dealer platform. Phase 1 - Start use | to_report | closed | Closed |
| EAS-2025-CEE-009 | Megeler Istanbule new store needs to imp | closed | canceled | Canceled |
| CAT-26-F01 | 中亚培训标准化与品牌形象提升 / Central Asia Training S | open | closed | Closed |
| CAT-26-F02 | 乌兹别克斯坦新车漆面质量专项分析 / Uzbekistan New Vehicl | open | closed | Closed |
| CAT-26-F04 | 乌兹博翼仓库电池转运 / Boyi Warehouse Battery Tran | open | closed | Closed |
| CAT-26-F05 | NPS系统权限优化 / NPS System Permission Optimi | open | closed | Closed |
| CAT-26-F07 | 代步车机制标准化与主动服务 / Courtesy Car Mechanism S | open | closed | Closed |
| CAT-26-F09 | ASTANA乌尔根奇门店地图标注 / ASTANA Urgench Map Ma | open | closed | Closed |
| EAS-2026-CVS-001 | 泛欧售后工程师Job Order标准化项目 | active | to_report | Project need to be reported |
| EAS-2024-TEC-003 | SN内部审批流程及文档管理规范 | to_report | on_hold | Pending |
| EAS-2024-TEC-001 | 核实海外售后《服务店新能源安全生产检查规范》相关通知文件发布情况，保障市场落地执 | active | to_report | Project need to be reported |
| EAS-2025-TEC-007 | 技索部112项目 | closed | on_hold | Pending |
| EAS-2025-TEC-003 | DMS和TIS备件工时的映射关系 | to_report | canceled | Canceled |
| EAS-2024-PLS-001 | 欧洲危险品仓开发 | active | closed | Closed |
| TEC-25-F01 | 海外市场电池维修中心由售后建设 | open | closed | Closed |

Rules: Closed sets the close date to the actual or planned end and marks all milestones done; a blank Project Status in the sheet keeps the platform value; an unknown value (Follow-up Action Item) is shown as On hold.
## Owner changes
| Code | Name | Was | Now |
|---|---|---|---|
| EAS-2025-CCR-005 | RSA roll out plan | Anna Marchi | 黄浩 Cokey |
| EAS-2025-TEC-002 | 保养间隔界面设置研究 | 朱泓源Janson | 赵栋Alex |

## Executor changes
(The sheet list replaces the platform list; a blank executor cell keeps the platform list.)

| Code | Name | Was | Now |
|---|---|---|---|
| EAS-2025-UKR-002 | UK Training Centre | Maurizio Pisano, 葛南宏Hugo | 葛南宏Hugo |
| EAS-2026-UKR-001 | 2026 UK Battery Repair Center Establishm | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | 葛南宏Hugo |
| EAS-2026-BNB-005 | Sweden Bodyshop | 姜鑫Xin | 姜鑫Xin, Daniel Papp |
| EAS-2026-BNB-006 | 2026 Sweden Battery Repair Center Establ | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | 姜鑫Xin, Daniel Papp, Peter Öster |
| EAS-2026-FRA-007 | 2026 France Battery Repair Center Establ | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | 许沛励Peili XU, Ben ZAHAF |
| EAS-2026-ITA-004 | 2026 Italy Battery Repair Center Establi | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | Liwei Zou, Paul Gervais Ava |
| EAS-2025-IBR-006 | BYD Auto insurance | Jesús Javier Pérez Blanco, Paula Noreña | Jesús Javier Pérez Blanco |
| EAS-2026-IBR-002 | 2026 Spain Battery Repair Center Establi | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | Jesús Javier Pérez Blanco |
| EAS-2026-SEE-001 | 2026 Israel Battery Repair Center Establ | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | 史宇Sirius |
| EAS-2026-CAC-023 | 2026 Turkey Battery Repair Center Establ | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | Murat Taşkın |
| EAS-2025-CVS-001 | 电动巴士玻璃库存再销售 Resale of Electric Bus Inven | Joao Pedro Sousa Guerra, 周翔宇Naoko Zhou, 马悦Yue Ma | Joao Pedro Sousa Guerra, 周翔宇Naoko Zhou, 马悦Yue Ma, 殷平Eva |
| EAS-2026-SEN-002 | BSS升级项目 | 龙丽竹 Bamboo, 吴雨瞳 Yutong, 马百德 Chester, 靳日朝 Richao, 唐亦凡 Yvonne, 马悦 Yue Ma, 潘雨婷 Effy, 田海辉 Mike, Viktoriia Garaeva | 龙丽竹 Bamboo, 吴雨瞳Yutong, 马百德 Chester, 靳日朝Richao, 唐亦凡 Yvonne, 马悦 Yue Ma, 田海辉 Mike |
| EAS-2026-SEN-004 | 欧洲售后计划系统部署和应用 | 吴雨瞳 Yutong, 唐亦凡 Yvonne, 靳日朝 Richao, 潘雨婷 Effy, 潘天翔Peter, 赵捷 George | 唐亦凡 Yvonne, 靳日朝Richao, 潘天翔Peter, 赵捷 George, Haomiao WANG |
| EAS-2026-BNB-007 | HV Battery Authorized Repair Network Dev | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair, 姜丹Vivian | 黄明辉Brent |
| EAS-2026-CEE-002 | HV Battery Authorized Repair Network Dev | 赵栋Alex, 朱泓源Janson, 史宇Sirius, 段梦醒Blair | 赵栋Alex, 史宇Sirius, 段梦醒Blair |

## Planned end date changes
| Code | Name | Was | Now |
|---|---|---|---|
| EAS-2026-BNB-004 | BYD Finland Aftersales Care Plan (monthl | 2026-10-31 | 2026-11-30 |
| EAS-2026-FRA-001 | FR Training center | 2026-10-31 | 2026-12-31 |
| EAS-2026-FRA-006 | Waste Management FRANCE | 2026-10-31 | 2026-12-31 |
| EAS-2026-IBR-001 | Dealers automatic payment for parts purc | 2026-09-30 | 2026-11-30 |
| EAS-2026-CAC-001 | Workshop Transparency | 2026-09-30 | 2026-11-30 |
| EAS-2025-UOP-002 | 权益中心及权益券 | 2026-09-30 | 2026-12-31 |
| EAS-2025-CVS-001 | 电动巴士玻璃库存再销售 Resale of Electric Bus Inven | 2026-10-31 | 2026-12-31 |
| EAS-2024-TEC-001 | 核实海外售后《服务店新能源安全生产检查规范》相关通知文件发布情况，保障市场落地执 | 2026-09-30 | 2026-10-31 |
| EAS-2025-TEC-002 | 保养间隔界面设置研究 | 2026-10-11 | 2026-12-31 |
| EAS-2026-TEC-002 | VDS 换件中心运输模式（新）功能升级 | 2026-09-30 | 2026-12-31 |
| EAS-2026-PLS-002 | BSS系统备件退换货 | 2026-09-16 | 2026-11-30 |
| EAS-2026-SEN-004 | 欧洲售后计划系统部署和应用 | 2026-11-15 | 2026-11-30 |

## Extension dates added
| Code | Name | Date |
|---|---|---|
| EAS-2025-NBA-005 | Bolt Europe aftersales SLA | 2025-09-30 |
| EAS-2026-IBR-001 | Dealers automatic payment for parts purc | 2026-09-30 |
| EAS-2026-CAC-001 | Workshop Transparency | 2026-06-30 |
| EAS-2025-CVS-002 | 项目名称：构建商用车售后数据库 项目范围：开发集中式售后数据库，以整合所有关键数 | 2025-06-30 |
| EAS-2025-CVS-002 | 项目名称：构建商用车售后数据库 项目范围：开发集中式售后数据库，以整合所有关键数 | 2025-07-30 |
| EAS-2024-CVS-003 | 英国大客户Metroline电池延保服务协议&执行 | 2025-08-30 |
| EAS-2025-CVS-001 | 电动巴士玻璃库存再销售 Resale of Electric Bus Inven | 2026-10-31 |
| EAS-2024-TEC-001 | 核实海外售后《服务店新能源安全生产检查规范》相关通知文件发布情况，保障市场落地执 | 2026-09-30 |
| EAS-2025-TEC-002 | 保养间隔界面设置研究 | 2026-10-31 |
| EAS-2026-TEC-002 | VDS 换件中心运输模式（新）功能升级 | 2026-09-30 |
| EAS-2026-TEC-002 | VDS 换件中心运输模式（新）功能升级 | 2026-10-31 |
| EAS-2025-PLS-001 | 欧洲仓网OTD降本增效 | 2026-03-31 |
| EAS-2026-PLS-002 | BSS系统备件退换货 | 2026-08-30 |
| EAS-2026-PLS-002 | BSS系统备件退换货 | 2026-09-16 |

## New progress records
| Sheet | Code | Date |
|---|---|---|
| Customer Care | EAS-2025-CCR-005 | 2026-11-04 |
| Training Management | EAS-2026-TRN-001 | 2026-11-04 |
| Training Management | EAS-2026-TRN-002 | 2026-11-04 |
| Training Management | TRN-25-F01 | 2026-11-04 |
| UK&RHD | EAS-2025-UKR-001 | 2026-11-04 |
| UK&RHD | EAS-2025-UKR-001 | 2026-10-07 |
| UK&RHD | EAS-2025-UKR-002 | 2026-11-04 |
| UK&RHD | EAS-2026-UKR-001 | 2026-11-04 |
| Germany | EAS-2026-DE-001 | 2026-11-04 |
| Germany | EAS-2026-DE-002 | 2026-11-04 |
| Germany | EAS-2026-DE-003 | 2026-11-04 |
| Benelux&Nordic&Baltics | EAS-2026-BNB-004 | 2026-11-04 |
| Benelux&Nordic&Baltics | EAS-2026-BNB-005 | 2026-11-04 |
| Benelux&Nordic&Baltics | EAS-2026-BNB-006 | 2026-11-04 |
| France | EAS-2026-FRA-001 | 2026-11-04 |
| France | EAS-2026-FRA-004 | 2026-11-04 |
| France | EAS-2026-FRA-006 | 2026-11-04 |
| France | EAS-2026-FRA-007 | 2026-11-04 |
| Italy | EAS-2025-ITA-001 | 2026-11-04 |
| Italy | EAS-2025-ITA-002 | 2026-11-04 |
| Italy | EAS-2026-ITA-001 | 2026-11-04 |
| Italy | EAS-2026-ITA-004 | 2026-11-04 |
| Iberia | EAS-2025-IBR-006 | 2026-11-04 |
| Iberia | EAS-2026-IBR-001 | 2026-11-04 |
| Iberia | EAS-2026-IBR-002 | 2026-11-04 |
| CEE | EAS-2025-CEE-004 | 2026-11-04 |
| CEE | EAS-2025-CEE-012 | 2026-11-04 |
| CEE | EAS-2025-CEE-013 | 2026-11-04 |
| CEE | EAS-2026-CEE-001 | 2026-11-04 |
| SEE & Israel | EAS-2026-SEE-001 | 2026-11-04 |
| Central Aisa&Caucasus | EAS-2026-CAC-001 | 2026-11-04 |
| Central Aisa&Caucasus | EAS-2026-CAC-002 | 2026-11-04 |
| Central Aisa&Caucasus | EAS-2026-CAC-003 | 2026-11-04 |
| Central Aisa&Caucasus | CAT-26-F03 | 2026-11-04 |
| Central Aisa&Caucasus | CAT-26-F06 | 2026-11-04 |
| Central Aisa&Caucasus | CAT-26-F08 | 2026-11-04 |
| Central Aisa&Caucasus | EAS-2026-CAC-023 | 2026-11-04 |
| 服务产品经营科 | EAS-2025-PBS-001 | 2026-11-11 |
| 服务产品经营科 | EAS-2025-PBS-001 | 2026-10-28 |
| 服务产品经营科 | EAS-2025-PBS-002 | 2026-11-11 |
| 服务产品经营科 | EAS-2025-PBS-002 | 2026-10-28 |
| 服务产品经营科 | EAS-2026-PBS-001 | 2026-11-11 |
| 服务产品经营科 | EAS-2026-PBS-001 | 2026-10-28 |
| 服务产品经营科 | EAS-2026-PBS-004 | 2026-11-11 |
| 服务产品经营科 | EAS-2026-PBS-004 | 2026-10-28 |
| 用户运营科 | EAS-2025-UOP-001 | 2026-11-11 |
| 用户运营科 | EAS-2025-UOP-001 | 2026-10-28 |
| 用户运营科 | EAS-2025-UOP-002 | 2026-11-11 |
| 用户运营科 | EAS-2025-UOP-002 | 2026-10-28 |
| 用户运营科 | EAS-2026-UOP-001 | 2026-11-11 |
| 用户运营科 | EAS-2026-UOP-001 | 2026-10-28 |
| 商用车服务部 | EAS-2025-CVS-001 | 2026-11-11 |
| 商用车服务部 | EAS-2025-CVS-001 | 2026-10-28 |
| 商用车服务部 | EAS-2026-CVS-001 | 2026-11-11 |
| 商用车服务部 | EAS-2026-CVS-001 | 2026-10-28 |
| 商用车服务部 | EAS-2026-CVS-003 | 2026-11-11 |
| 商用车服务部 | EAS-2026-CVS-003 | 2026-10-28 |
| 技术索赔部 | EAS-2024-TEC-001 | 2026-11-11 |
| 技术索赔部 | EAS-2024-TEC-001 | 2026-10-28 |
| 技术索赔部 | EAS-2025-TEC-002 | 2026-11-11 |
| 技术索赔部 | EAS-2025-TEC-002 | 2026-10-28 |
| 技术索赔部 | EAS-2026-TEC-001 | 2026-11-11 |
| 技术索赔部 | EAS-2026-TEC-001 | 2026-10-28 |
| 技术索赔部 | EAS-2026-TEC-002 | 2026-11-11 |
| 技术索赔部 | EAS-2026-TEC-002 | 2026-10-28 |
| 技术索赔部 | EAS-2026-TEC-003 | 2026-11-11 |
| 技术索赔部 | EAS-2026-TEC-003 | 2026-10-28 |
| 欧洲备件部 | EAS-2024-PLS-001 | 2026-10-28 |
| 欧洲备件部 | EAS-2026-PLS-001 | 2026-11-11 |
| 欧洲备件部 | EAS-2026-PLS-001 | 2026-10-28 |
| 欧洲备件部 | EAS-2026-PLS-002 | 2026-11-11 |
| 欧洲备件部 | EAS-2026-PLS-002 | 2026-10-28 |
| 服务工程部 | EAS-2026-SEN-002 | 2026-11-11 |
| 服务工程部 | EAS-2026-SEN-002 | 2026-10-28 |
| 服务工程部 | EAS-2026-SEN-004 | 2026-11-11 |
| 服务工程部 | EAS-2026-SEN-004 | 2026-10-28 |
| 待办跟进项 | TEC-25-F07 | 2026-11-11 |
| 待办跟进项 | TEC-25-F07 | 2026-10-28 |
| 待办跟进项 | TEC-25-F08 | 2026-11-11 |
| 待办跟进项 | TEC-25-F08 | 2026-10-28 |
| 待办跟进项 | TEC-26-F01 | 2026-11-11 |
| 待办跟进项 | TEC-26-F02 | 2026-11-11 |
| 待办跟进项 | TEC-26-F02 | 2026-10-28 |
| 待办跟进项 | UOP-26-F02 | 2026-11-11 |
| 待办跟进项 | UOP-26-F02 | 2026-10-28 |
| 待办跟进项 | TEC-25-F03 | 2026-11-11 |
| 待办跟进项 | TEC-25-F05 | 2026-11-11 |
| 待办跟进项 | TEC-25-F05 | 2026-10-28 |
| 待办跟进项 | TEC-26-F09 | 2026-11-11 |
| 待办跟进项 | TEC-26-F09 | 2026-10-28 |
| 待办跟进项 | CVS-26-F01 | 2026-11-11 |
| 待办跟进项 | CVS-26-F01 | 2026-10-28 |
| 待办跟进项 | CVS-26-F02 | 2026-11-11 |
| 待办跟进项 | CVS-26-F02 | 2026-10-28 |
| 待办跟进项 | CVS-26-F03 | 2026-11-11 |
| 待办跟进项 | CVS-26-F03 | 2026-10-28 |
| Benelux&Nordic&Baltics | EAS-2026-BNB-007 | 2026-11-04 |
| CEE | EAS-2026-CEE-002 | 2026-11-04 |

Progress dates follow the column header; where a header could be read as d/m or m/d the reading that keeps the columns in descending order and not in the future was used. New records are appended after the existing ones, so the stored translations keep their numbers.
## Not changed

Project names (except the two), scope text, milestones of existing projects, start dates, actual dates (the sheet had no differences), codes, follow-up types. Nothing was deleted.
