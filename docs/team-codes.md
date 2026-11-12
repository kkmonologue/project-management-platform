# 团队代码对照表 / Team code reference

花名册（`roster.teams`）、项目编号（如 `EAS-2026-GER-001`）和数据库里的 `teams` 表都只使用下面的**字母代码**。中文名、英文名只用于页面显示，页面切换语言时显示对应的那个。

数据来源：原型的团队清单，已导入数据库（`public.teams`）。共 21 个团队。

## 区域市场（分组 R）

| 代码 | 中文 | English |
|---|---|---|
| UKR | UK&RHD 市场 | UK & RHD |
| GER | 德国市场 | Germany |
| BNL | 荷比卢市场 | Benelux |
| NBA | 北欧&波罗的海市场 | Nordics & Baltics |
| CHE | 瑞士市场 | Switzerland |
| AUT | 奥地利市场 | Austria |
| CEE | CEE 市场 | Central & Eastern Europe |
| POL | 波兰市场 | Poland |
| SEI | SEE&以色列市场 | SEE & Israel |
| FRA | 法国市场 | France |
| IBR | 伊比利亚市场 | Iberia |
| ITA | 意大利市场 | Italy |
| CAT | 中亚&高加索&土耳其市场 | Central Asia, Caucasus & Türkiye |

## 中台支持（分组 C）

| 代码 | 中文 | English |
|---|---|---|
| CCR | 客户关怀 | Customer Care |
| TRN | 售后培训管理 | Training Management |
| PBS | 服务产品经营科 | Service Product Business |
| UOP | 用户运营科 | User Operations |
| CVS | 商用车服务部 | Commercial Vehicle Service |
| TEC | 技术索赔部 | Technical & Warranty |
| PLS | 欧洲备件部 | European Parts |
| SEN | 服务工程部 | Service Engineering |

## 花名册 `teams` 列怎么填

- 只填字母代码，字母大写，和上表完全一致。写中文名或写错，数据库认不出，那一行会出错。
- 格式是花括号加逗号：`{GER}`、`{BNL,NBA,CHE}`；没有负责团队的写 `{}`。
- 负责整个团队，写团队代码。例如 `{FRA}` 表示法国市场的全部项目。
- 只负责某个团队下的一个科室，写成 `团队代码|科室名`，例如 `SEN|渠道管理`。目前只有服务工程部（SEN）下面分科室。

### 科室（仅 SEN 使用）

| 科室（中文，填写时用这个） | English |
|---|---|
| 售后商务科 | After-sales Business |
| 渠道管理 | Channel Mgmt |
| 运营管理 | Operations Mgmt |
| 平台支持 | Platform Support |

## 权限规则（v2）

| 角色 `role` | 是谁 | 能看 | 能改 / 能提交 |
|---|---|---|---|
| `pmo` | PMO | 全部 | 全部，审批，立项 |
| `mgr` | 国家售后经理；中台负责人 | 所有非 ALSA 项目（只读）；自己团队的可编辑 | 自己团队：双周更新、立项申请、变更/取消申请、**结项申请** |
| `member` | 国家售后运营经理；中台运营 | 同上 | 自己团队：双周更新、立项申请、变更/取消申请；**不能结项** |
| `viewer` | 售后团队其他人 | 所有非 ALSA 项目（只读） | 无 |

- 项目的状态、编号、所属团队只有 PMO 能改，其他人通过申请，PMO 审批后生效。
- **风险与问题**：PMO 和 `risk_all = true` 的人（Cokey、Brent）看全部；其他人只看自己团队/市场的。
- **ALSA 项目、ALSA 会议和议题**：只有有 ALSA 角色的人和 PMO 能看。项目赞助人不再因为被指定而获得可见权。
- ALSA 角色 `alsa`：空，或 `steer`（指导委员会）、`exec`（执行）、`pmo`、`sec`（秘书处）。

## 改动团队时

团队存在数据库里，可以改名、新增或拆分。项目编号一旦发出不会变，历史项目的编号保持原样；改动后请同步更新花名册，并更新本文档。
