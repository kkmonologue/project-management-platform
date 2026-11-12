# BYD EMEA 售后 PMO 平台（内测版）

项目立项、审批、编号、执行跟踪、结项的内部协作平台。由单文件原型改造为：**静态前端 + Supabase 后端**，面向约 25 人内测。

> 最后更新：2026-11-09。本文档是整个项目的入口，所有文件都在本文件夹里。

---

## 1. 现在的状态（一眼看懂）

| 项 | 状态 |
|---|---|
| 线上地址 | https://tight-dust-509b.keke-z.workers.dev （Cloudflare Workers 静态站点） |
| Cloudflare Access（页面门禁） | **未启用**（2026-11 暂不启用，见第 8 节风险） |
| 后端 | Supabase 项目 `xwtlxvdubbwqhsjqrfra`，Region 法兰克福 |
| 登录 | 邮箱 + 密码；只有 `roster`（花名册）里的邮箱能注册 |
| 数据库迁移 | 6 份已全部运行（见第 4 节） |
| 原型数据 | 已导入（团队、项目、跟进项、ALSA） |
| 花名册 | `supabase/roster_import.sql` **已生成，需运行**（见第 5 节） |
| 邮件发送 | **未联通**：邮件只会停在“已排队”（见第 7 节） |
| 权限、实时同步 | 已写好，**还没用不同角色的真实账号在线上测过** |

---

## 2. 架构

```
浏览器 ─► Cloudflare Workers（静态页面，web/dist）
浏览器 ─► Supabase（Frankfurt）
            ├ Auth：邮箱+密码，花名册触发器挡住外人
            ├ Postgres + RLS：数据与权限隔离
            ├ Realtime：多人修改即时同步
            ├ Storage：私有文件桶（按项目编号隔离）
            └ Edge Function send-mail + pg_cron → Resend（未配置）
```

- **页面不是安全边界，数据库才是。** 用户拿到页面后直接调 Supabase 接口，所有隔离靠数据库的行级安全（RLS）。
- Docker 只用于可选的本地开发，线上不需要。
- 应用内部仍操作内存状态，`web/sync.js` 负责与数据库对齐：读取时由 RLS 过滤，保存时只写变化的行并带版本号，冲突会提示。

---

## 3. 文件夹结构

```
BYD-PMO-Platform/
├─ README.md                    本文件
├─ roster_template.csv          花名册原始名单（人工维护的源表）
├─ 欧洲售后员工库1109_权限划分.xlsx   员工库权限划分表（27 人为权限名单确认，其余 483 人按组织信息推断）
├─ docs/
│  └─ team-codes.md             21 个团队代码对照表 + 权限规则 v2
├─ supabase/
│  ├─ migrations/               数据库迁移（按文件名顺序运行，各一次）
│  ├─ run_pending.sql           把后 4 份迁移合成一个文件（已运行过）
│  ├─ roster_import.sql         由 CSV 生成的花名册导入脚本，可重复运行
│  ├─ first_user.sql            首个 PMO 账号（已运行）
│  ├─ reset.sql                 ⚠ 清空数据库，不要运行
│  └─ functions/send-mail/      邮件发送函数（未部署）
└─ web/
   ├─ source.html               原型原始页面（冻结，不要改，不要部署）
   ├─ src/                      页面源码：app.js 应用本体，head.html 样式，data.js/seed.js 数据
   ├─ sync.js                   登录、读写数据库、实时同步
   ├─ build.py                  构建脚本
   ├─ config.js                 Supabase 地址和公开密钥（已填好）
   ├─ config.example.js         配置模板
   ├─ _headers                  Cloudflare 响应头
   ├─ dist/                     ★ 部署用，上传到 Cloudflare
   ├─ import/                   仅本机一次性导入旧数据用，不要部署
   └─ demo/artifact.html        演示版（本地存储，不连数据库），已发布到共享 artifact
```

---

## 4. 数据库迁移

按顺序，每份运行一次（Supabase 后台 → SQL Editor）。**全部已运行。**

| 顺序 | 文件 | 内容 |
|---|---|---|
| 1 | `20261104000000_init.sql` | 表结构、RLS、审计日志、乐观并发版本号、邮件队列、通知触发器 |
| 2 | `20261104000100_permissions_v2.sql` | 权限 v2：全员只读非 ALSA 项目，角色/团队编辑，ALSA 隔离，风险可见范围 |
| 3 | `20261104000200_mail_drafts.sql` | 邮件草稿状态 |
| 4 | `20261104000300_storage_files.sql` | 文件上传私有桶（单文件 ≤ 50 MB） |
| 5 | `20261104000400_mail_reads.sql` | 邮件已读记录 |

以后新增数据库改动：**写成新的迁移文件**，文件名用递增时间戳，不要改旧文件。

---

## 5. 花名册（谁能登录）

花名册 `roster` 表决定谁能注册、角色、团队、ALSA 角色。

1. 源表是 `roster_template.csv`，维护后需要转成 SQL 再运行（直接导入 CSV 会失败，原因：邮箱必须全小写、列名是 `teams` 不是 `team_code`、`alsa` 要小写、`{PM}`/`{ALL}` 不是真实团队、没有 `ref` 列）。
2. `supabase/roster_import.sql` 是已修正的版本，**在 SQL Editor 整份运行**即可，可重复运行（按邮箱更新）。
3. 每个人要**自己打开网址点“注册”**，用花名册里的邮箱设密码。花名册只是允许注册，不会自动建账号。
4. ⚠ **已注册的人**，再改花名册不会更新他已有的角色/团队（`profiles` 里是注册时的快照）；需要同时去 `profiles` 表改，或让 PMO 在库里改。
5. 待核实：Lucas、Alfredo 在员工库里没有邮箱；Aiden 需登记为 `pmo`，邮箱 `aiden.xiong@byd.com`。

### 角色与团队代码
- `role`：`pmo` / `mgr`（国家售后经理、部门负责人，可结项）/ `member`（运营经理，不可结项）/ `viewer`（只读）。
- `teams`：只填字母代码，如 `{GER}`、`{BNL,NBA}`、`{SEN|渠道管理}`；无团队写 `{}`。
- 完整的 21 个团队代码和权限表见 `docs/team-codes.md`。

---

## 6. 权限规则 v2（摘要）

- 售后团队所有人：只读全部**非 ALSA** 项目。
- 国家售后经理 + 国家运营经理 / 中台负责人 + 运营：编辑自己团队，发双周更新，提交立项、变更、取消申请。
- 结项：只有国家经理 / 中台负责人（`mgr`）和 PMO。
- 项目状态、编号、所属团队：只有 PMO 通过审批后才能改。
- 风险与问题：PMO、Cokey、Brent（`risk_all`）看全部，其他人只看自己团队。
- ALSA 模块：只有有 ALSA 角色的人和 PMO 可见可用。
- 项目不能删除，只能关闭或取消；每次修改留历史（`audit_log`，仅 PMO 可查）。

---

## 7. 邮件（待办）

- 页面上的邮件中心已可用：按规则 R1–R8 或手动勾选项目生成草稿 → 审阅/修改 → 发送。
- 发送后写入 `mail_outbox` 队列，**目前不会真正发出**。
- 要联通需要：
  1. 确定发件人名称（建议 `BYD EMEA Aftersales PMO <pmo-noreply@你们的域名>`）。
  2. **一个你能改 DNS 的域名**配置 SPF/DKIM/DMARC（最可能卡住，要找 IT）。
  3. Resend 账号和 API Key。
  4. `supabase secrets set RESEND_API_KEY=… MAIL_FROM="…" CRON_SECRET=…`，`supabase functions deploy send-mail`。
  5. 用 SQL 建 `pg_cron` 任务每分钟调用该函数。
- “PMO”收件人取名字含 Aiden 的 PMO 账号邮箱。

---

## 8. 已知缺口与风险

| 事项 | 说明 |
|---|---|
| 权限、实时同步未在线上测过 | 内测前必须用不同角色账号各测一遍 |
| 没有 Access 门禁 | 页面里仍带中英文翻译表，含项目文字。数据库数据不受影响，但页面本身公开。链接只发给内测人员；后续计划把翻译表搬进数据库 |
| 审批、ALSA 投票规则在前端判断 | 有技术的人可绕过页面改审批状态；数据隔离不受影响。Phase 2 移到数据库函数 |
| “账号与角色”页修改不写回数据库 | 人员/角色/团队目前只能在 Supabase 表里改 |
| 项目编号由前端计算 | 唯一约束兜底；`next_code()` 已备好，Phase 2 改用 |
| 逾期提醒只在 PMO 打开页面时生成 | Phase 2 改成服务端定时 |
| 姓名匹配 | 负责人/执行人按姓名匹配账号，花名册姓名要与项目表一致，否则收不到指派和可见权 |
| 数据合规 | 数据在法兰克福，涉及中国团队数据出境时，建议内测前与 IT/合规打招呼 |
| 备份 | 免费套餐没有自动备份，内测期间建议定期导出 |

---

## 9. 日常操作手册

### 改前端并重新部署
1. 只改 `web/src/`（`app.js` 应用，`head.html` 样式）和 `web/sync.js`，**不要改 `web/source.html`**。
2. 构建：
   ```
   cd web
   py build.py
   ```
   生成 `web/dist/`（部署用）、`web/import/`（本机导入用）、`web/demo/artifact.html`（演示版）。
3. 部署：Cloudflare 控制台 → Workers & Pages → `tight-dust-509b` → **New deployment**，上传 `web/dist` 里的文件（`index.html`、`config.js`、`_headers`）。
4. 测试方法：用本地 `py -m http.server` 打开 `dist/`，用内存模拟的 Supabase 先自测。

### 改数据库
新建迁移文件放进 `supabase/migrations/`，在 SQL Editor 运行一次。**不要运行 `reset.sql`。**

### 新增一个人
在 `roster_template.csv` 加一行 → 重新生成 `roster_import.sql` → 运行 → 让他自己注册。

### 导入旧数据（仅一次，已做过）
本机 `cd web/import && py -m http.server 8770`，浏览器打开 `http://localhost:8770/#import`，用 PMO 邮箱登录。`import/` 不要部署。

### 演示版 artifact
共享 artifact：https://claude.ai/artifact/VwKjocavn1C6CLWeme2DSA（本地存储，不连数据库，仅用于演示新界面）。

---

## 10. 接下来的顺序（建议）

1. 运行 `roster_import.sql`；让 Aiden 注册，确认他有 PMO 权限。
2. **权限与同步测试**：用 `pmo`、`mgr`、`member`、`viewer`、ALSA 人员各登录一次，核对该看到/不该看到的内容；两人同时修改验证实时同步与冲突提示。
3. 邀请少数同事开始内测。
4. 同时向 IT 申请发件域名，联通邮件（第 7 节）。
5. 重新评估是否启用 Cloudflare Access，并把翻译表搬进数据库。
6. Phase 2：审批与投票规则入库、项目编号用 `next_code()`、账号管理写回数据库、服务端定时提醒、统一登录（SSO）。

---

## 11. 关键标识（不含密码）

- Supabase 项目 ref：`xwtlxvdubbwqhsjqrfra`
- Supabase API：`https://xwtlxvdubbwqhsjqrfra.supabase.co`
- 前端使用的是**公开可用的 publishable key**，已写在 `web/config.js`，不是机密；**绝不要把 service_role 密钥放进前端或本文件夹**。
- 首个 PMO 账号：`keke.zhu@byd.com`。
