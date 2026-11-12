# Online database sync for the 2026-11-12 progress sheet (step 3)
File: `supabase/data_refresh_2026-11-12.sql`. **Not executed anywhere.** Run it yourself in the Supabase SQL Editor (one paste, one run). It is one transaction (all or nothing) and can be run again: a second run changes nothing.
## What it changes
| Part | What | Rows |
|---|---|---|
| 1 | Owner, executors, planned end date, name (2 renamed) of imported projects / follow-ups, value by value | 31 values on 26 items (end 12, exec 15, name 2, pic 2) |
| 2 | Status (closing stamps the close date and marks the milestones done; reopening removes the close date) | 17 items |
| 3 | Extension dates added to the list | 11 items |
| 4 | New progress records, appended after the existing ones | 98 records on 69 items |
| 5 | New items: 7 projects and 1 follow-up (ids p254 to p260 and f40) | 8 rows |

Only rows of the table `public.projects` are touched, and only their `data`, `name` and `status` (plus the new rows). Each update fires the existing audit trigger and bumps the row version, so a browser tab that was open before has to reload (it does so by itself on the next sync).
## What is preserved
* **Nothing is deleted** and nothing is overwritten wholesale: `data` is patched key by key.
* **Changes made on the platform after the import win.** An owner, executor list, planned end date, name or status is only changed while the database still holds exactly the value the *old* sheet had. If somebody changed it on the platform (for example an approved change request), that value is kept and the item is listed in the result set at the end of the run ("kept: changed on the platform after the import").
* **Requests, approvals, close reviews, to-dos, issues, meetings, ALSA data, mail, people and accounts are not touched** (no other table is written).
* **Two-week updates written on the platform stay.** New sheet progress is only appended at the end of the progress list, and skipped when a record with the same text (first 60 characters) already exists.
* **Projects created on the platform are not touched** (only the ids p0 to p253 and f0 to f39 of the import are updated).
* New items are inserted with `on conflict do nothing`: if one of the new ids or codes already exists, it is left alone and reported.
## Before and after you run it
1. The script stops with a message if the database does not hold the imported projects (fewer than 200 ids like p12 / f3).
2. The pending code migration `20261111000100_project_codes_eas.sql` is independent: run it before or after. The new items already carry the new-style codes.
3. Optional but recommended: the app's member sync mails "[Assigned]" to people newly named as owner or executor the next time a PMO user signs in (about 40 people). The two lines at the top of the SQL file switch that mail off and on again. Switch it off first, sign in once as PMO, then switch it on again.
4. The names shown in Chinese or English for the two renamed projects come from the page build, so deploy the new page (step 2 build) as well; the data and the page do not depend on each other for the run.
## Changed items
### Status
| Code | Was | Now |
|---|---|---|
| EAS-2025-UKR-009 | to_report | on_hold |
| EAS-2025-IBR-003 | to_report | closed |
| EAS-2025-CEE-009 | closed | canceled |
| EAS-2026-CVS-001 | active | to_report |
| EAS-2024-TEC-003 | to_report | on_hold |
| EAS-2024-TEC-001 | active | to_report |
| EAS-2025-TEC-007 | closed | on_hold |
| EAS-2025-TEC-003 | to_report | canceled |
| EAS-2024-PLS-001 | active | closed |
| TRN-25-F01 | open | closed |
| CAT-26-F01 | open | closed |
| CAT-26-F02 | open | closed |
| CAT-26-F04 | open | closed |
| CAT-26-F05 | open | closed |
| CAT-26-F07 | open | closed |
| CAT-26-F09 | open | closed |
| TEC-25-F01 | open | closed |

### Owner / executors / planned end / name
| Code | Field | Was | Now |
|---|---|---|---|
| EAS-2025-CCR-005 | pic | Anna Marchi | 黄浩 Cokey |
| EAS-2025-UKR-002 | exec | ['Maurizio Pisano', '葛南宏Hugo'] | ['葛南宏Hugo'] |
| EAS-2026-UKR-001 | exec | ['赵栋Alex', '朱泓源Janson', '史宇Sirius', '段梦醒Blair'] | ['葛南宏Hugo'] |
| EAS-2026-BNB-004 | end | 2026-10-31 | 2026-11-30 |
| EAS-2026-BNB-005 | exec | ['姜鑫Xin'] | ['姜鑫Xin', 'Daniel Papp'] |
| EAS-2026-BNB-006 | exec | ['赵栋Alex', '朱泓源Janson', '史宇Sirius', '段梦醒Blair'] | ['姜鑫Xin', 'Daniel Papp', 'Peter Öster'] |
| EAS-2026-BNB-007 | name | 2026 Netherlands Battery Repair Center Establishment Project | HV Battery Authorized Repair Network Development - Netherlan |
| EAS-2026-BNB-007 | exec | ['赵栋Alex', '朱泓源Janson', '史宇Sirius', '段梦醒Blair', '姜丹Vivian'] | ['黄明辉Brent'] |
| EAS-2026-FRA-001 | end | 2026-10-31 | 2026-12-31 |
| EAS-2026-FRA-006 | end | 2026-10-31 | 2026-12-31 |
| EAS-2026-FRA-007 | exec | ['赵栋Alex', '朱泓源Janson', '史宇Sirius', '段梦醒Blair'] | ['许沛励Peili XU', 'Ben ZAHAF'] |
| EAS-2026-ITA-004 | exec | ['赵栋Alex', '朱泓源Janson', '史宇Sirius', '段梦醒Blair'] | ['Liwei Zou', 'Paul Gervais Ava'] |
| EAS-2025-IBR-006 | exec | ['Jesús Javier Pérez Blanco', 'Paula Noreña'] | ['Jesús Javier Pérez Blanco'] |
| EAS-2026-IBR-001 | end | 2026-09-30 | 2026-11-30 |
| EAS-2026-IBR-002 | exec | ['赵栋Alex', '朱泓源Janson', '史宇Sirius', '段梦醒Blair'] | ['Jesús Javier Pérez Blanco'] |
| EAS-2026-CEE-002 | name | 2026 Czech & Slovakia Battery Repair Center Establishment Pr | HV Battery Authorized Repair Network Development - Czech & S |
| EAS-2026-CEE-002 | exec | ['赵栋Alex', '朱泓源Janson', '史宇Sirius', '段梦醒Blair'] | ['赵栋Alex', '史宇Sirius', '段梦醒Blair'] |
| EAS-2026-SEE-001 | exec | ['赵栋Alex', '朱泓源Janson', '史宇Sirius', '段梦醒Blair'] | ['史宇Sirius'] |
| EAS-2026-CAC-001 | end | 2026-09-30 | 2026-11-30 |
| EAS-2026-CAC-023 | exec | ['赵栋Alex', '朱泓源Janson', '史宇Sirius', '段梦醒Blair'] | ['Murat Taşkın'] |
| EAS-2025-UOP-002 | end | 2026-09-30 | 2026-12-31 |
| EAS-2025-CVS-001 | exec | ['Joao Pedro Sousa Guerra', '周翔宇Naoko Zhou', '马悦Yue Ma'] | ['Joao Pedro Sousa Guerra', '周翔宇Naoko Zhou', '马悦Yue Ma', '殷平 |
| EAS-2025-CVS-001 | end | 2026-10-31 | 2026-12-31 |
| EAS-2024-TEC-001 | end | 2026-09-30 | 2026-10-31 |
| EAS-2025-TEC-002 | pic | 朱泓源Janson | 赵栋Alex |
| EAS-2025-TEC-002 | end | 2026-10-11 | 2026-12-31 |
| EAS-2026-TEC-002 | end | 2026-09-30 | 2026-12-31 |
| EAS-2026-PLS-002 | end | 2026-09-16 | 2026-11-30 |
| EAS-2026-SEN-002 | exec | ['龙丽竹 Bamboo', '吴雨瞳 Yutong', '马百德 Chester', '靳日朝 Richao', '唐 | ['龙丽竹 Bamboo', '吴雨瞳Yutong', '马百德 Chester', '靳日朝Richao', '唐亦凡 |
| EAS-2026-SEN-004 | exec | ['吴雨瞳 Yutong', '唐亦凡 Yvonne', '靳日朝 Richao', '潘雨婷 Effy', '潘天翔P | ['唐亦凡 Yvonne', '靳日朝Richao', '潘天翔Peter', '赵捷 George', 'Haomia |
| EAS-2026-SEN-004 | end | 2026-11-15 | 2026-11-30 |

### Extension dates added
| Code | Dates |
|---|---|
| EAS-2025-NBA-005 | 2025-09-30 |
| EAS-2026-IBR-001 | 2026-09-30 |
| EAS-2026-CAC-001 | 2026-06-30 |
| EAS-2025-CVS-002 | 2025-06-30, 2025-07-30 |
| EAS-2024-CVS-003 | 2025-08-30 |
| EAS-2025-CVS-001 | 2026-10-31 |
| EAS-2024-TEC-001 | 2026-09-30 |
| EAS-2025-TEC-002 | 2026-10-31 |
| EAS-2026-TEC-002 | 2026-09-30, 2026-10-31 |
| EAS-2025-PLS-001 | 2026-03-31 |
| EAS-2026-PLS-002 | 2026-08-30, 2026-09-16 |

### New progress records per item
| Code | Records |
|---|---|
| CAT-26-F03 | 1 |
| CAT-26-F06 | 1 |
| CAT-26-F08 | 1 |
| CVS-26-F01 | 2 |
| CVS-26-F02 | 2 |
| CVS-26-F03 | 2 |
| EAS-2024-PLS-001 | 1 |
| EAS-2024-TEC-001 | 2 |
| EAS-2025-CCR-005 | 1 |
| EAS-2025-CEE-004 | 1 |
| EAS-2025-CEE-012 | 1 |
| EAS-2025-CEE-013 | 1 |
| EAS-2025-CVS-001 | 2 |
| EAS-2025-IBR-006 | 1 |
| EAS-2025-ITA-001 | 1 |
| EAS-2025-ITA-002 | 1 |
| EAS-2025-PBS-001 | 2 |
| EAS-2025-PBS-002 | 2 |
| EAS-2025-TEC-002 | 2 |
| EAS-2025-UKR-001 | 2 |
| EAS-2025-UKR-002 | 1 |
| EAS-2025-UOP-001 | 2 |
| EAS-2025-UOP-002 | 2 |
| EAS-2026-BNB-004 | 1 |
| EAS-2026-BNB-005 | 1 |
| EAS-2026-BNB-006 | 1 |
| EAS-2026-BNB-007 | 1 |
| EAS-2026-CAC-001 | 1 |
| EAS-2026-CAC-002 | 1 |
| EAS-2026-CAC-003 | 1 |
| EAS-2026-CAC-023 | 1 |
| EAS-2026-CEE-001 | 1 |
| EAS-2026-CEE-002 | 1 |
| EAS-2026-CVS-001 | 2 |
| EAS-2026-CVS-003 | 2 |
| EAS-2026-DE-001 | 1 |
| EAS-2026-DE-002 | 1 |
| EAS-2026-DE-003 | 1 |
| EAS-2026-FRA-001 | 1 |
| EAS-2026-FRA-004 | 1 |
| EAS-2026-FRA-006 | 1 |
| EAS-2026-FRA-007 | 1 |
| EAS-2026-IBR-001 | 1 |
| EAS-2026-IBR-002 | 1 |
| EAS-2026-ITA-001 | 1 |
| EAS-2026-ITA-004 | 1 |
| EAS-2026-PBS-001 | 2 |
| EAS-2026-PBS-004 | 2 |
| EAS-2026-PLS-001 | 2 |
| EAS-2026-PLS-002 | 2 |
| EAS-2026-SEE-001 | 1 |
| EAS-2026-SEN-002 | 2 |
| EAS-2026-SEN-004 | 2 |
| EAS-2026-TEC-001 | 2 |
| EAS-2026-TEC-002 | 2 |
| EAS-2026-TEC-003 | 2 |
| EAS-2026-TRN-001 | 1 |
| EAS-2026-TRN-002 | 1 |
| EAS-2026-UKR-001 | 1 |
| EAS-2026-UOP-001 | 2 |
| TEC-25-F03 | 1 |
| TEC-25-F05 | 2 |
| TEC-25-F07 | 2 |
| TEC-25-F08 | 2 |
| TEC-26-F01 | 1 |
| TEC-26-F02 | 2 |
| TEC-26-F09 | 2 |
| TRN-25-F01 | 1 |
| UOP-26-F02 | 2 |

### New items
| Id | Code | Kind | Team | Section | Name |
|---|---|---|---|---|---|
| p254 | EAS-2026-BNB-008 | project | CHE |  | Swiss Winter Complete Wheel |
| p255 | EAS-2026-BNB-009 | project | CHE |  | HV Battery Authorized Repair Network Development - Swit |
| p256 | EAS-2026-CEE-003 | project | POL |  | HV Battery Authorized Repair Network Development - Pola |
| p257 | EAS-2026-SEN-006 | project | SEN | 售后商务科 | BYD欧洲经销商系统及VDS收费项目 |
| p258 | EAS-2026-SEN-007 | project | SEN | 渠道管理 | BYD钣喷中心泛欧认证标准 |
| p259 | EAS-2026-SEN-008 | project | SEN | 渠道管理 | 欧洲售后技术质量检查（TQC）体系建设 |
| p260 | EAS-2026-SEN-009 | project | SEN | 售后商务科 | 成本精细化测算及成本优化 |
| f40 | SEN-26-F03 | follow | SEN | 售后商务科 | 合同智能管理系统 |

## How it was checked

There is no database here, so it was **not run against Postgres**. It was (a) parsed with the real PostgreSQL parser (22 statements, no errors), and (b) replayed in a script on a copy of the old data: the result equals the new seed field by field, a second run changes nothing, a value changed on the platform is kept, and a two-week update written on the platform stays. Run it first on a copy / branch of the database if you can.
