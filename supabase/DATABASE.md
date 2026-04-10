# 🏛️ Baiyezhan 数据库文档

> **数据库**: Supabase (PostgreSQL)  
> **表前缀**: `baiyezhan_`  
> **最后更新**: 2026-04-11  
> **Schema**: `public`

---

## 📐 架构总览

```
                        ┌─────────────────┐
                        │   auth.users    │  (Supabase 内置)
                        └────────┬────────┘
                                 │ id (uuid)
                                 ▼
                     ┌───────────────────────┐
                     │   baiyezhan_users     │  用户资料
                     │   (核心用户表)          │
                     └───┬─────────┬─────────┘
                         │         │
              owner_id   │         │  owner_id / author_id
                 ┌───────┘         └───────┐
                 ▼                         ▼
      ┌──────────────────┐     ┌──────────────────────┐
      │ baiyezhan_baiye  │     │ baiyezhan_guestbook  │
      │ (百业/大房间)      │     │ (留言板)              │
      └────┬─────┬───────┘     └──────────────────────┘
           │     │ id (uuid)
           │     │
           │     ▼ baiye_id
           │  ┌──────────────────┐
           │  │ baiyezhan_rooms  │
           │  │ (房间/小房间)      │
           │  └────┬─────────────┘
           │       │ id (uuid)
           │       │
           │  ┌────┴────────────────────┐
           │  ▼                         ▼
           │ ┌────────────────┐ ┌────────────────────────┐
           │ │ room_state     │ │ room_members           │
           │ │ (房间运行状态)   │ │ (房间成员)               │
           │ └────────────────┘ └────────────────────────┘
           │
           ▼ baiye_id
      ┌────────────────────────┐
      │ baiyezhan_matches     │  对战记录 (Match 级别)
      │ (百业A vs 百业B)        │
      └──────────┬─────────────┘
                 │ id (uuid)
                 ▼ match_id
      ┌──────────────────────────┐
      │ baiyezhan_match_stats   │  个人战绩 (Player 级别)
      │ (每人每局数据)             │
      └──────────────────────────┘
```

---

## 📋 表结构详情

### 1. `baiyezhan_users` — 用户资料表

> 与 Supabase `auth.users` 一对一关联，用户注册时通过触发器自动创建。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `uuid` | **PK**, FK → `auth.users(id)` ON DELETE CASCADE | — | 用户 ID，与 auth 系统同步 |
| `email` | `text` | — | `NULL` | 用户邮箱 |
| `character_name` | `text` | — | `NULL` | 游戏角色名 |
| `avatar_url` | `text` | — | `NULL` | 头像 URL |
| `role` | `text` | NOT NULL, CHECK (`user`, `vip`, `admin`) | `'user'` | 用户角色 |
| `created_at` | `timestamptz` | NOT NULL | `now()` | 创建时间 |

**索引**:
- `idx_baiyezhan_users_role` — 按角色查询

**触发器**:
- `handle_new_user()` — 新用户注册时自动从 `auth.users` 同步 `id`, `email`, `character_name`

---

### 2. `baiyezhan_baiye` — 百业表（大房间/竞技场）

> 顶层组织单元，一个百业包含多个房间。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `uuid` | **PK** | `gen_random_uuid()` | 百业唯一 ID |
| `name` | `text` | NOT NULL | — | 百业名称 |
| `description` | `text` | — | `NULL` | 百业描述 |
| `cover_image` | `text` | — | `NULL` | 封面图片 URL |
| `password` | `text` | — | `NULL` | 可选访问密码（NULL = 无需密码） |
| `owner_id` | `uuid` | NOT NULL, FK → `baiyezhan_users(id)` | — | 创建者 ID |
| `created_at` | `timestamptz` | — | `now()` | 创建时间 |

**索引**:
- `idx_baiyezhan_baiye_owner` — 按创建者查询

---

### 3. `baiyezhan_rooms` — 房间表（小房间/广播频道）

> 广播引擎的原子单位，每个房间属于一个百业。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `uuid` | **PK** | `gen_random_uuid()` | 房间唯一 ID |
| `room_code` | `text` | UNIQUE, NOT NULL | — | 房间邀请码 |
| `owner_id` | `uuid` | NOT NULL, FK → `baiyezhan_users(id)` ON DELETE CASCADE | — | 房主 ID |
| `name` | `text` | NOT NULL | `'未命名房间'` | 房间名称 |
| `room_type` | `text` | NOT NULL | `'default'` | 房间类型：`default` / `nameless` / `healer` / `tank` |
| `baiye_id` | `uuid` | FK → `baiyezhan_baiye(id)` ON DELETE CASCADE | `NULL` | 所属百业 ID |
| `round_duration` | `integer` | — | `80` | 每轮时长（秒） |
| `broadcast_interval` | `integer` | — | `10` | 广播间隔（秒） |
| `bgm_track` | `text` | — | `'default'` | 背景音乐轨道 |
| `cover_image` | `text` | — | `'default'` | 封面图片 |
| `password` | `text` | — | `NULL` | 房间密码（NULL = 无需密码） |
| `created_at` | `timestamptz` | NOT NULL | `now()` | 创建时间 |

**索引**:
- `baiyezhan_rooms_room_code_key` (UNIQUE) — 按邀请码查找
- `idx_baiyezhan_rooms_baiye` — 按百业分组查询

---

### 4. `baiyezhan_room_state` — 房间状态表

> 每个房间一条记录，跟踪广播引擎的运行状态。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|---|---|---|---|---|
| `room_id` | `uuid` | **PK**, FK → `baiyezhan_rooms(id)` ON DELETE CASCADE | — | 房间 ID |
| `round_start_time` | `bigint` | — | `NULL` | 当前轮次开始时间（Unix 毫秒） |
| `is_running` | `boolean` | — | `false` | 广播是否正在进行 |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | 最近更新时间 |

---

### 5. `baiyezhan_room_members` — 房间成员表

> 复合主键 (`room_id`, `user_id`)，记录参与者及其排队顺序。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|---|---|---|---|---|
| `room_id` | `uuid` | **PK** (联合), FK → `baiyezhan_rooms(id)` ON DELETE CASCADE | — | 房间 ID |
| `user_id` | `uuid` | **PK** (联合), FK → `baiyezhan_users(id)` ON DELETE CASCADE | — | 用户 ID |
| `order_index` | `integer` | NOT NULL | — | 排队序号（从 0 开始） |
| `last_seen` | `timestamptz` | — | `now()` | 心跳时间，用于僵尸清理 |
| `joined_at` | `timestamptz` | NOT NULL | `now()` | 加入时间 |

---

### 6. `baiyezhan_guestbook` — 留言板表

> 多语境留言系统，支持全局、百业级、房间级三种作用域。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `uuid` | **PK** | `gen_random_uuid()` | 留言唯一 ID |
| `content` | `text` | NOT NULL | — | 留言内容 |
| `author_id` | `uuid` | NOT NULL, FK → `baiyezhan_users(id)` ON DELETE CASCADE | — | 作者 ID |
| `target_type` | `text` | NOT NULL | — | 类型：`global` / `baiye` / `room` |
| `target_id` | `uuid` | — | `NULL` | 目标 ID（全局时为 NULL） |
| `created_at` | `timestamptz` | NOT NULL | `now()` | 创建时间 |

**索引**:
- `idx_guestbook_target` — 按 (target_type, target_id) 组合查询

---

### 7. `baiyezhan_matches` — 对战记录表 (对称设计)

> Match 级别记录。每条 = 一场百业对战（team_a vs team_b），双方共享同一条记录。通过 `match_key` 唯一约束实现去重。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `uuid` | **PK** | `gen_random_uuid()` | 对战记录 ID |
| `baiye_id` | `uuid` | NOT NULL, FK → `baiyezhan_baiye(id)` ON DELETE CASCADE | — | 首次提交方百业 ID |
| `team_a` | `text` | NOT NULL | — | 百业A名称 |
| `team_b` | `text` | NOT NULL | — | 百业B名称 |
| `match_key` | `text` | UNIQUE | — | 去重键（触发器自动计算：sorted(a,b)\|time） |
| `winner` | `text` | — | `NULL` | 胜利方百业名 / `'draw'` / `NULL`(待定) |
| `match_start_time` | `timestamptz` | — | `NULL` | 对战开始时间 |
| `match_date` | `timestamptz` | — | `now()` | 对战日期（触发器自动同步为 `match_start_time`） |
| `notes` | `text` | — | `NULL` | 备注 |
| `screenshot_urls` | `text[]` | — | `NULL` | 原始截图 URL 数组 |
| `created_by` | `uuid` | FK → `baiyezhan_users(id)` ON DELETE SET NULL | `NULL` | 上传者 ID |
| `created_at` | `timestamptz` | NOT NULL | `now()` | 录入时间 |

**索引**:
- `idx_matches_baiye` — 按百业 ID 查询
- `idx_matches_date` — 按 (baiye_id, match_date DESC) 时间线查询
- `idx_matches_team_a` — 按 team_a 名称查询
- `idx_matches_team_b` — 按 team_b 名称查询
- `uq_matches_match_key` (UNIQUE) — 唯一约束保证对局不重复

**触发器**:
- `trg_compute_match_key` — INSERT/UPDATE 时自动计算 `match_key` 和同步 `match_date`

**设计说明**:
- **对称去重**: `match_key = sorted(team_a, team_b) + '|' + time`，A vs B 和 B vs A 在同一时间产生相同的 key
- `winner` 存储胜利方的百业名称（非 FK），`'draw'` 表示平局，`NULL` 表示待定
- `screenshot_urls` 使用 PostgreSQL 原生数组类型，支持多张截图
- `team_a` / `team_b` 为文本字段，因为对手百业可能不在本系统中注册

---

### 8. `baiyezhan_match_stats` — 个人战绩表 (含队伍归属)

> Player 级别记录。每条 = 一个玩家在一场对战中的战斗数据。通过 `match_id` 关联 `matches` 表，`team_name` 标识所属队伍。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `uuid` | **PK** | `gen_random_uuid()` | 记录唯一 ID |
| `match_id` | `uuid` | NOT NULL, FK → `baiyezhan_matches(id)` ON DELETE CASCADE | — | 所属对战 ID |
| `team_name` | `text` | NOT NULL | — | 所属队伍名（对应 match 的 team_a 或 team_b） |
| `player_name` | `text` | NOT NULL | — | 玩家名快照（不随改名变化） |
| `user_id` | `uuid` | FK → `baiyezhan_users(id)` ON DELETE SET NULL | `NULL` | 可选，关联注册用户 |
| `kills` | `integer` | NOT NULL | `0` | 击败数 |
| `assists` | `integer` | NOT NULL | `0` | 助攻数 |
| `deaths` | `integer` | NOT NULL | `0` | 重伤次数 |
| `coins` | `integer` | NOT NULL | `0` | 逗币 |
| `damage` | `numeric` | NOT NULL | `0` | 输出伤害 |
| `damage_taken` | `numeric` | NOT NULL | `0` | 承受伤害 |
| `healing` | `numeric` | NOT NULL | `0` | 治疗量 |
| `building_damage` | `numeric` | NOT NULL | `0` | 建筑伤害 |
| `created_at` | `timestamptz` | NOT NULL | `now()` | 记录时间 |

**索引**:
- `idx_match_stats_match` — 按对战 ID 查询同一局所有玩家
- `idx_match_stats_player` — 按 player_name 查询个人战绩
- `idx_match_stats_team` — 按 team_name 查询百业维度数据
- `idx_match_stats_player_team` — 按 (player_name, team_name) 联合查询
- `uq_match_stats_team_player` (UNIQUE) — 阻止同一局同一队同一玩家重复录入

**设计说明**:
- `team_name` 标识此玩家属于哪支队伍，支持按百业维度和人维度分析
- 唯一约束 `(match_id, team_name, player_name)` 确保同一队不会重复提交
- `player_name` 为快照字段，记录战斗发生时的角色名
- `user_id` 使用 `ON DELETE SET NULL`，确保用户注销后战绩数据仍保留

---

### 9. `baiyezhan_match_screenshots` — 对战截图证据表

> 记录每次提交对战数据时上传的截图，作为数据溯源依据。按队伍分组，支持在对战详情中查看原始截图。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|---|---|---|---|---|
| `id` | `uuid` | **PK** | `gen_random_uuid()` | 记录唯一 ID |
| `match_id` | `uuid` | NOT NULL, FK → `baiyezhan_matches(id)` ON DELETE CASCADE | — | 所属对战 ID |
| `team_name` | `text` | NOT NULL | — | 上传方队伍名 |
| `image_url` | `text` | NOT NULL | — | Supabase Storage 公开 URL |
| `uploaded_by` | `uuid` | FK → `baiyezhan_users(id)` ON DELETE SET NULL | `NULL` | 上传者 |
| `created_at` | `timestamptz` | NOT NULL | `now()` | 上传时间 |

**索引**:
- `idx_screenshots_match` — 按对战 ID 查询该局所有截图
- `idx_screenshots_team` — 按 `(match_id, team_name)` 查询某队伍上传的截图

**设计说明**:
- 每次提交队伍数据时，上传的图片 URL 逐条写入此表
- 删除对战记录时，关联截图通过 `ON DELETE CASCADE` 自动清理
- `uploaded_by` 记录上传者，用户注销后截图记录仍保留

---

## 🔐 行级安全策略 (RLS)


所有表均 **启用 RLS** (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)。

| 表 | 策略名称 | 操作 | 说明 |
|---|---|---|---|
| `baiyezhan_users` | Public access | ALL | 公开读写（依赖应用层权限控制） |
| `baiyezhan_rooms` | Public access | ALL | 公开读写 |
| `baiyezhan_room_state` | Public access | ALL | 公开读写 |
| `baiyezhan_room_members` | Public access | ALL | 公开读写 |
| `baiyezhan_guestbook` | Public read access | SELECT | 所有人可读 |
| `baiyezhan_guestbook` | Authenticated insert access | INSERT | 认证用户可写，且 `author_id` 必须等于 `auth.uid()` |
| `baiyezhan_guestbook` | User delete own or Admin delete all | DELETE | 用户删自己的，Admin/VIP 可删所有 |
| `baiyezhan_matches` | Public read access | SELECT | 所有人可读对战记录 |
| `baiyezhan_matches` | Authenticated insert access | INSERT | 认证用户可创建对战记录 |
| `baiyezhan_matches` | Admin or owner update | UPDATE | Admin/VIP 或百业创建者可更新 |
| `baiyezhan_matches` | Admin or owner delete | DELETE | Admin/VIP 或百业创建者可删除 |
| `baiyezhan_match_stats` | Public read access | SELECT | 所有人可读战绩 |
| `baiyezhan_match_stats` | Authenticated insert access | INSERT | 认证用户可录入战绩 |
| `baiyezhan_match_stats` | Admin or owner delete | DELETE | Admin/VIP 或百业创建者可删除 |
| `storage.objects` | Allow authenticated uploads to baiyezhan | INSERT | 认证用户可上传到 `baiyezhan` 桶 |
| `storage.objects` | Public read access to baiyezhan | SELECT | 公开读取 `baiyezhan` 桶 |

---

## ⚙️ 存储过程 & 函数 (RPC)

### `reorder_room_members(p_room_id uuid)`

**用途**: 成员离开或被清理后，原子化重新编排 `order_index` 序号（0, 1, 2, ...），防止出现间隔。

```sql
-- 使用 ROW_NUMBER() 窗口函数重新编号
WITH ranked AS (
    SELECT user_id, ROW_NUMBER() OVER (ORDER BY order_index) - 1 AS new_index
    FROM baiyezhan_room_members WHERE room_id = p_room_id
)
UPDATE baiyezhan_room_members m
SET order_index = r.new_index
FROM ranked r
WHERE m.room_id = p_room_id AND m.user_id = r.user_id;
```

**权限**: `authenticated`, `anon`

---

### `cleanup_inactive_room_members()`

**用途**: 清理 `last_seen` 超过 2 分钟的僵尸成员，并自动调用 `reorder_room_members` 补缺。

**调度**: 通过 `pg_cron` 每 2 分钟自动执行一次。

```
Job Name: cleanup-inactive-members
Schedule: */2 * * * *
```

---

### `handle_new_user()` (Trigger Function)

**用途**: `auth.users` 新增记录时，自动在 `baiyezhan_users` 中创建对应行。

**触发条件**: `AFTER INSERT ON auth.users`

---

## 📦 存储 (Storage)

| 桶名 | 公开 | 用途 |
|---|---|---|
| `baiyezhan` | ✅ | 存放 BGM 音频、封面图片、用户头像等资源文件 |

**目录结构**:
```
baiyezhan/
├── sounds/      # 背景音乐文件
├── image/       # 封面图片
└── avatars/     # 用户头像
```

---

## 🔗 外键关系汇总

```
auth.users.id           ──→ baiyezhan_users.id                (CASCADE)
baiyezhan_users.id      ──→ baiyezhan_baiye.owner_id
baiyezhan_users.id      ──→ baiyezhan_rooms.owner_id          (CASCADE)
baiyezhan_users.id      ──→ baiyezhan_room_members.user_id    (CASCADE)
baiyezhan_users.id      ──→ baiyezhan_guestbook.author_id     (CASCADE)
baiyezhan_users.id      ──→ baiyezhan_matches.created_by      (SET NULL)
baiyezhan_users.id      ──→ baiyezhan_match_stats.user_id     (SET NULL)
baiyezhan_baiye.id      ──→ baiyezhan_rooms.baiye_id          (CASCADE)
baiyezhan_baiye.id      ──→ baiyezhan_matches.baiye_id        (CASCADE)
baiyezhan_matches.id    ──→ baiyezhan_match_stats.match_id    (CASCADE)
baiyezhan_rooms.id      ──→ baiyezhan_room_state.room_id      (CASCADE)
baiyezhan_rooms.id      ──→ baiyezhan_room_members.room_id    (CASCADE)
```

---

## 📊 迁移历史

| 序号 | 文件名 | 日期 | 描述 |
|---|---|---|---|
| 0 | `000_baseline.sql` | 2026-01-24 | 基线：创建所有核心表、RLS 策略、触发器 |
| 1 | `001_create_storage_buckets.sql` | 2026-01-24 | 创建 `baiyezhan` 存储桶及上传/读取策略 |
| 2 | `002_add_last_seen_column.sql` | 2026-01-25 | 为房间成员表添加 `last_seen` 心跳列 |
| 3 | `003_add_reorder_function.sql` | 2026-01-28 | 添加原子化成员重排序 RPC 函数 |
| 4 | `004_add_user_roles.sql` | 2026-02-01 | 添加用户角色系统 (`user`/`vip`/`admin`) |
| 5 | `005_add_room_password.sql` | 2026-02-01 | 为房间表添加可选密码字段 |
| 6 | `006_add_baiye_hierarchy.sql` | 2026-02-01 | 创建百业表，建立层级关系 |
| 7 | `007_add_zombie_cleanup_cron.sql` | 2026-02-01 | 添加 pg_cron 僵尸成员清理任务 |
| 8 | `008_add_guestbook_and_profile.sql` | 2026-02-01 | 添加留言板表、用户头像字段 |
| 9 | `009_add_match_stats.sql` | 2026-04-11 | 创建战斗数据统计表 (match_stats)，归属百业层级 |
| 10 | `010_add_matches_table.sql` | 2026-04-11 | 新增对战记录表 (matches)，重构 match_stats FK 指向 matches |
| 11 | `011_add_match_times.sql` | 2026-04-11 | 为 matches 表添加 start/end time，触发器自动同步 match_date |
| 12 | `012_redesign_matches.sql` | 2026-04-11 | 对称重设计：team_a/team_b/match_key 去重，winner 替代 result |

---

## 🎮 角色权限矩阵

| 操作 | `user` | `vip` | `admin` |
|---|---|---|---|
| 创建百业 | ❌ | ✅ (上限 1) | ✅ (无限) |
| 创建房间 | ❌ | ✅ (上限 4) | ✅ (无限) |
| 加入房间 | ✅ | ✅ | ✅ |
| 录入对战 | ✅ | ✅ | ✅ |
| 修改/删除对战 | ❌ | ✅ (百业主) | ✅ |
| 录入战绩 | ✅ | ✅ | ✅ |
| 删除战绩 | ❌ | ✅ (百业主) | ✅ |
| 删除留言 | 仅自己的 | 任意 | 任意 |
| 管理用户 | ❌ | ❌ | ✅ |
