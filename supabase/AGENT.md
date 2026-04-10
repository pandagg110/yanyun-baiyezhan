# 🤖 Baiyezhan AI Agent 数据库操作规范

> 本文档定义了 AI Agent（如 Antigravity、Cursor、Copilot 等）在操作本项目数据库时 **必须遵守** 的标准操作流程。  
> **核心原则**: 数据库变更 = Migration 文件 + 文档更新，二者缺一不可。

---

## 📂 目录结构

```
supabase/
├── DATABASE.md                      # 📖 数据库完整文档（必须同步更新）
├── migrations/
│   ├── 000_baseline.sql             # 基线 Schema
│   ├── 001_create_storage_buckets.sql
│   ├── 002_add_last_seen_column.sql
│   ├── 003_add_reorder_function.sql
│   ├── 004_add_user_roles.sql
│   ├── 005_add_room_password.sql
│   ├── 006_add_baiye_hierarchy.sql
│   ├── 007_add_zombie_cleanup_cron.sql
│   ├── 008_add_guestbook_and_profile.sql
│   ├── 009_add_match_stats.sql
│   ├── 010_add_matches_table.sql
│   ├── 011_add_match_times.sql
│   ├── 012_redesign_matches.sql
│   └── NNN_<description>.sql        # 新的迁移文件
```

---

## 🔧 新增数据库变更流程

### Step 1: 创建 Migration 文件

文件命名规范：`NNN_<简短英文描述>.sql`

- `NNN` = 三位数递增序号（查看 `migrations/` 目录下最大序号 + 1）
- 描述使用小写英文 + 下划线，如 `add_xxx_column`, `create_xxx_table`

**文件模板：**

```sql
-- ============================================================================
-- Migration NNN: <标题>
-- Date: YYYY-MM-DD
-- Description: <变更描述>
-- Dependency: Migration XXX (如有依赖)
-- ============================================================================

-- 你的 SQL 变更语句
-- 使用 IF NOT EXISTS / IF EXISTS 保证幂等性
```

**关键原则：**

1. **幂等性**: 始终使用 `CREATE TABLE IF NOT EXISTS`、`ADD COLUMN IF NOT EXISTS`、`DROP POLICY IF EXISTS` 等语法
2. **前缀规范**: 所有表名必须使用 `baiyezhan_` 前缀
3. **RLS**: 新表必须启用 RLS 并创建相应策略
4. **索引**: 为频繁查询的列创建索引
5. **外键**: 考虑 `ON DELETE CASCADE` 行为

### Step 2: 更新 DATABASE.md

**必须更新的章节：**

1. **📐 架构总览** — 如果新增了表，更新 ASCII 关系图
2. **📋 表结构详情** — 新增或修改表的完整字段文档
3. **🔐 行级安全策略** — 如果涉及 RLS 变更
4. **⚙️ 存储过程** — 如果新增了函数/触发器
5. **📊 迁移历史** — 在表格末尾添加新迁移记录
6. **🔗 外键关系汇总** — 如果新增了外键
7. **🎮 角色权限矩阵** — 如果涉及权限变更

### Step 3: 更新 TypeScript 类型 (如需要)

如果表结构变更影响到前端数据模型，同步更新：

- `src/types/app.ts` — 对应的 TypeScript 接口
- `src/services/supabase-service.ts` — 数据访问逻辑

---

## ⚠️ 绝对禁止事项

| ❌ 禁止 | ✅ 应该 |
|---|---|
| 直接修改 `000_baseline.sql` | 创建新的增量 migration 文件 |
| 添加 migration 但不更新 `DATABASE.md` | 两者同步更新 |
| 在 `supabase/` 根目录放散落的 SQL 文件 | 所有 SQL 放入 `migrations/` |
| 删除或重命名已部署的 migration 文件 | 创建新的 migration 来回滚 |
| 使用没有 `baiyezhan_` 前缀的表名 | 统一使用前缀 |
| 创建新表不启用 RLS | 始终启用 RLS |

---

## 📝 变更检查清单

每次数据库变更后，确认以下所有项：

- [ ] Migration 文件已创建在 `supabase/migrations/` 下
- [ ] 文件名序号正确递增
- [ ] SQL 语句具有幂等性（`IF NOT EXISTS` / `IF EXISTS`）
- [ ] `DATABASE.md` 的「迁移历史」表格已更新
- [ ] `DATABASE.md` 的相关章节已同步更新
- [ ] 如涉及前端，`src/types/app.ts` 已更新
- [ ] RLS 策略已配置（新表必须）
- [ ] 外键的 CASCADE 行为已确认

---

## 🗄️ 常见操作示例

### 新增列

```sql
ALTER TABLE public.baiyezhan_xxx
ADD COLUMN IF NOT EXISTS new_column text DEFAULT 'default_value';
```

### 新增表

```sql
CREATE TABLE IF NOT EXISTS public.baiyezhan_xxx (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name        text NOT NULL,
    owner_id    uuid NOT NULL REFERENCES public.baiyezhan_users(id) ON DELETE CASCADE,
    created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.baiyezhan_xxx ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access" ON public.baiyezhan_xxx FOR ALL USING (true);
```

### 新增存储过程

```sql
CREATE OR REPLACE FUNCTION my_function(p_id uuid)
RETURNS void AS $$
BEGIN
    -- logic here
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION my_function(uuid) TO authenticated;
```

---

## 🔄 回滚策略

如需回滚某个迁移，**不要**删除原迁移文件，而是创建一个新的迁移来执行逆向操作：

```sql
-- Migration NNN: Rollback Migration XXX
-- 回滚 xxx_table 的某个变更

ALTER TABLE public.baiyezhan_xxx DROP COLUMN IF EXISTS removed_column;
-- 或
DROP TABLE IF EXISTS public.baiyezhan_xxx;
```

---

## 📞 Supabase 生产部署

1. 在 Supabase Dashboard 的 **SQL Editor** 中按顺序执行新的 migration 文件
2. 验证表结构变更是否生效
3. 确认 RLS 策略已正确应用
4. 如使用 `pg_cron`，确认扩展已在 Dashboard 中启用
