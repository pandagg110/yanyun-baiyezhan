# 📋 百业战排表系统 — 技术文档

> **模块路径**: `/baiye/[id]/roster`  
> **状态**: 生产就绪 · 最后更新 2026-04-28  
> **相关 Migrations**: 017 → 018 → 019

---

## 一、系统概览

排表系统为每场百业战（30v30）提供可视化人员排布工具，核心流程：

```
人员池 → 拖拽分配到进攻/防守小队 → 按阶段配置战术 → 人墙站位 → 导出截图
```

### 页面三区布局

```
┌──────────┬─────────────────────────────────────────────────┐
│          │  Tab: ⚔️进攻(5x)  |  🛡️防守(1x)  |  🧱人墙(1x)  │  ← 选中 Tab 占 5 份宽度
│  左侧栏  │─────────────────────────────────────────────────│
│          │                                                 │
│ · 历史排表 │         主排表区域（进攻/防守/人墙）              │
│ · 人员池  │         ┌──────────────────────────┐            │
│ · 选项管理 │         │  1队:  成员 × 5, 列 × 8  │            │
│          │         │  2队:  成员 × 5, 列 × 8  │            │
│          │         │  3队:  成员 × 5, 列 × 8  │            │
│          │         └──────────────────────────┘            │
└──────────┴─────────────────────────────────────────────────┘
```

---

## 二、数据库 Schema

### 2.1 四张核心表

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `baiyezhan_roster_members` | 人员池（每百业独立） | `baiye_id`, `name` (UNIQUE per baiye) |
| `baiyezhan_rosters` | 排表快照 (JSONB) | `baiye_id`, `roster_date` (UNIQUE per baiye), `roster_data` |
| `baiyezhan_roster_options` | 下拉选项（颜色标签） | `baiye_id`, `category`, `label`, `color`, `sort_order` |
| `baiyezhan_matches` | 对战记录 | `roster_id` FK → `baiyezhan_rosters` |

### 2.2 Migration 链

#### Migration 017 — 基础表结构
```sql
-- 人员池
CREATE TABLE baiyezhan_roster_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    baiye_id uuid NOT NULL REFERENCES baiyezhan_baiye(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(baiye_id, name)
);

-- 排表快照
CREATE TABLE baiyezhan_rosters (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    baiye_id uuid NOT NULL REFERENCES baiyezhan_baiye(id) ON DELETE CASCADE,
    name text DEFAULT '排表',
    roster_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES baiyezhan_users(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 下拉选项
CREATE TABLE baiyezhan_roster_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    baiye_id uuid NOT NULL REFERENCES baiyezhan_baiye(id) ON DELETE CASCADE,
    category text NOT NULL DEFAULT 'general',
    label text NOT NULL,
    color text,
    sort_order int DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    UNIQUE(baiye_id, category, label)
);
```

#### Migration 018 — 日期 Upsert
```sql
ALTER TABLE baiyezhan_rosters ADD COLUMN roster_date date DEFAULT CURRENT_DATE;
UPDATE baiyezhan_rosters SET roster_date = created_at::date WHERE roster_date IS NULL;
ALTER TABLE baiyezhan_rosters ALTER COLUMN roster_date SET NOT NULL;
ALTER TABLE baiyezhan_rosters ADD CONSTRAINT uq_rosters_baiye_date UNIQUE (baiye_id, roster_date);
```

#### Migration 019 — 对战关联
```sql
ALTER TABLE baiyezhan_matches
ADD COLUMN roster_id UUID REFERENCES baiyezhan_rosters(id) ON DELETE SET NULL;
```

### 2.3 RLS 策略
所有表均启用 Row Level Security：
- **SELECT**: 公开可读 (`true`)
- **INSERT / UPDATE / DELETE**: 仅认证用户 (`auth.role() = 'authenticated'`)

---

## 三、数据模型 (TypeScript)

### 3.1 核心类型层次

```
RosterData (JSONB 存储)
├── columns: string[]              // 阶段列名称
├── attack: RosterSquad[3]         // 进攻 3 队
├── defense: RosterSquad[3]        // 防守 3 队
└── wall: WallTower[3]             // 人墙 3 塔
```

### 3.2 完整类型定义

```typescript
/** 人员池成员 */
interface RosterMember {
    id: string;
    baiye_id: string;
    name: string;
    created_at: string;
}

/** 下拉选项 */
interface RosterOption {
    id: string;
    baiye_id: string;
    category: string;   // 选项分类（映射到列）
    label: string;       // 选项文字
    color?: string;      // 颜色 hex（可选）
    sort_order: number;
}

/** 单元格（一个人在一个阶段的战术指令） */
interface RosterCell {
    text: string;        // 选项文字
    color?: string;      // 颜色
}

/** 小队成员行 */
interface RosterSquadMember {
    name: string;        // 人员名称
    isLeader?: boolean;  // 是否小队长
    cells: RosterCell[]; // 对应 columns 的每一列
}

/** 小队 */
interface RosterSquad {
    members: RosterSquadMember[];
    colorNote?: string;  // 花脸色标点
    timeNote?: string;   // 集合时间
}

/** 人墙塔位 */
interface WallTower {
    name: string;        // "上塔" | "中塔" | "下塔"
    members: string[];   // 最多 3 人
}

/** 完整排表数据 */
interface RosterData {
    columns: string[];
    attack: RosterSquad[];
    defense: RosterSquad[];
    wall: WallTower[];
}

/** 排表记录 */
interface Roster {
    id: string;
    baiye_id: string;
    name: string;
    roster_date: string;  // YYYY-MM-DD
    roster_data: RosterData;
    created_by?: string;
    created_at: string;
    updated_at?: string;
}
```

---

## 四、默认列 & 选项分类映射

### 4.1 固定 8 列

| 序号 | 列名 | 映射选项分类 (category) | 说明 |
|------|------|------------------------|------|
| 1 | 开局规划 | — (自由文本) | 开局打法 |
| 2 | 守塔 | `守位` | 防守塔点 |
| 3 | 守鹅 | `守位` | 防守鹅点 |
| 4 | 守车 | `守位` | 防守车点 |
| 5 | 铁桶（boss没拿到） | `守位` | 铁桶阵 |
| 6 | 打野 | `打野` | 野区分配 |
| 7 | 25分boss规划 | `25分boss` | 25 分 boss |
| 8 | 15分boss规划 | `15分boss` | 15 分 boss |

### 4.2 列名 → 分类映射逻辑

```typescript
function getColumnCategory(colName: string): string | null {
    if (["守塔", "守鹅", "守车"].includes(colName) || colName.includes("铁桶")) return "守位";
    if (colName.includes("打野")) return "打野";
    if (colName.includes("25分")) return "25分boss";
    if (colName.includes("15分")) return "15分boss";
    return null;  // 自由文本输入
}
```

### 4.3 预置选项种子数据

> [!IMPORTANT]
> 以下 SQL 在 `baiyezhan_roster_options` 表中插入初始下拉选项。`baiye_id` 需替换为实际百业 ID。

#### 守位选项 (守塔 / 守鹅 / 守车 / 铁桶 共享)

由管理员在 UI 中自行添加管理。

#### 打野选项

```sql
INSERT INTO baiyezhan_roster_options (baiye_id, category, label, sort_order) VALUES
('YOUR_BAIYE_ID', '打野', '上内野（进攻）', 1),
('YOUR_BAIYE_ID', '打野', '上内野（防守）', 2),
('YOUR_BAIYE_ID', '打野', '上外野（进攻）', 3),
('YOUR_BAIYE_ID', '打野', '上外野（防守）', 4),
('YOUR_BAIYE_ID', '打野', '下内野（进攻）', 5),
('YOUR_BAIYE_ID', '打野', '下内野（防守）', 6),
('YOUR_BAIYE_ID', '打野', '下外野（进攻）', 7),
('YOUR_BAIYE_ID', '打野', '下外野（防守）', 8);
```

#### 25 分 boss 规划

```sql
INSERT INTO baiyezhan_roster_options (baiye_id, category, label, sort_order) VALUES
('YOUR_BAIYE_ID', '25分boss', '扔鸡', 1),
('YOUR_BAIYE_ID', '25分boss', '无', 2);
```

#### 15 分 boss 规划

```sql
INSERT INTO baiyezhan_roster_options (baiye_id, category, label, sort_order) VALUES
('YOUR_BAIYE_ID', '15分boss', '风墙', 1),
('YOUR_BAIYE_ID', '15分boss', '八方', 2),
('YOUR_BAIYE_ID', '15分boss', '扔鸡', 3),
('YOUR_BAIYE_ID', '15分boss', '抓鸡', 4),
('YOUR_BAIYE_ID', '15分boss', '打团', 5);
```

---

## 五、组件架构

### 5.1 组件树

```
/baiye/[id]/roster/page.tsx          ← 主页面 + 全局状态管理
├── RosterPlayerPool                 ← 左侧人员池
│   ├── 单人添加 / 批量导入
│   ├── 历史导入 (🕰️)
│   └── 人员重命名 / 删除
├── RosterOptionsManager             ← 选项管理（仅 Admin）
│   ├── 分类创建 / 编辑 / 删除
│   └── 颜色设置
├── RosterTable (×2: 进攻 + 防守)    ← 主排表区域（forwardRef 用于导出）
│   ├── 小队长下拉选择
│   ├── 成员拖拽入队
│   ├── CellEditor 单元格编辑器
│   └── 选项下拉匹配
└── RosterWall                       ← 人墙站位（forwardRef 用于导出）
    ├── 上塔 🔺 / 中塔 🔷 / 下塔 🔻
    ├── 每塔最多 3 人
    └── 拖拽放入
```

### 5.2 关键组件 Props

| 组件 | 关键 Props | 说明 |
|------|-----------|------|
| `RosterTable` | `columns`, `squads`, `options`, `availableMembers`, `globalAssignedNames` | 进攻/防守表格 |
| `RosterWall` | `towers`, `availableMembers`, `wallAssignedNames`, `globalAssignedNames` | 人墙 3 塔 |
| `RosterPlayerPool` | `members`, `assignedNames`, `onAddMember`, `onBatchAdd`, `onHistoryImport` | 人员管理 |
| `RosterOptionsManager` | `options`, `onAdd`, `onDelete`, `onUpdate` | 选项 CRUD |

### 5.3 文件清单

| 文件 | 路径 | 行数 |
|------|------|------|
| 排表主页面 | `src/app/baiye/[id]/roster/page.tsx` | ~398 |
| 排表表格 | `src/components/feature/roster-table.tsx` | ~226 |
| 人墙组件 | `src/components/feature/roster-wall.tsx` | ~131 |
| 人员池 | `src/components/feature/roster-player-pool.tsx` | ~120 |
| 选项管理 | `src/components/feature/roster-options-manager.tsx` | ~150 |
| 类型定义 | `src/types/app.ts` (L179–246) | — |
| 服务层 | `src/services/supabase-service.ts` (L1020–1170) | — |

---

## 六、API 接口

### 6.1 排表 CRUD（前端直连 Supabase）

| 方法 | 服务函数 | 说明 |
|------|---------|------|
| 列表 | `SupabaseService.getRosters(baiyeId)` | 按 `roster_date DESC` 排序 |
| 详情 | `SupabaseService.getRoster(rosterId)` | 单条查询 |
| 创建 | `SupabaseService.createRoster(...)` | 新建排表 |
| Upsert | `SupabaseService.upsertRosterByDate(baiyeId, date, name, data)` | 同日覆盖 (onConflict: `baiye_id,roster_date`) |
| 历史导入 | `SupabaseService.importMembersFromHistory(baiyeId)` | 从所有历史排表提取人名 |

### 6.2 对战-排表关联（Next.js API Route）

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/matches` | 创建对局时带 `roster_id` |
| PATCH | `/api/matches/[id]` | 后续绑定/解绑 `roster_id` |

---

## 七、关键设计决策

### 7.1 日期 Upsert（一日一表）

```
UNIQUE (baiye_id, roster_date)
```

每个百业每天只保存一份排表。保存时使用 `upsert`，同日自动覆盖。

### 7.2 人员全局唯一约束

每人**仅出现在一个位置**：进攻3队 + 防守3队共享去重池。人墙独立计算（不与进攻/防守冲突）。

```typescript
// 全局已分配人名 = 进攻所有队 + 防守所有队
const globalAssigned = new Set([...attackNames, ...defenseNames]);
```

### 7.3 无弹窗 UX

整个排表页面**零 `alert()` / `confirm()`**。所有操作（删除人员、移除成员、保存）均静默执行，优先保证操作流畅性。

### 7.4 活跃 Tab 放大

选中的 Tab 占 5 份宽度，未选中各占 1 份，附带 `MM-DD` 日期标注，方便截图辨识。

```typescript
style={{ flex: isActive ? 5 : 1 }}
```

### 7.5 人员池上下文加载

- **打开排表时**: 池子只包含当前排表内的人（空表 = 空池）
- **历史导入**: 按需拉取所有历史排表中出现过的人名
- **已分配人员**: 标记 ✅ 并排到底部

### 7.6 导出截图

使用 `html2canvas` 将 `forwardRef` 指向的 DOM 节点导出为 PNG 图片（进攻表、防守表、人墙 分别导出）。`data-no-export` 属性的元素在导出时隐藏。

---

## 八、开发指南

### 8.1 新增列

修改 `DEFAULT_COLUMNS` 常量（`page.tsx` L14-18）。如需下拉选项支持，在 `getColumnCategory` 函数中添加映射规则。

### 8.2 新增选项分类

1. 在 DB 中 INSERT 新 category 的选项行
2. 在 `getColumnCategory` 函数中添加 `colName → category` 映射
3. 选项会自动出现在对应列的编辑器下拉中

### 8.3 修改人墙塔数

修改 `EMPTY_WALL()` 函数和 `WallTower` 接口。每塔上限在 `RosterWall` 组件中 `members.length >= 3` 控制。

### 8.4 对战记录关联排表

```
战绩录入页 (/stats):  创建对局时自动关联最新排表
对战记录页 (/matches): "绑定排表" 按钮 → PATCH /api/matches/[id]
```

### 8.5 JSONB 数据兼容

历史排表可能存在旧格式的 `wall` 数据（`RosterSquad[]` 而非 `WallTower[]`）。加载时在 `page.tsx` 中自动迁移：

```typescript
// 检测旧格式并转换
if (data.wall && Array.isArray(data.wall) && data.wall[0]?.members?.[0]?.name) {
    // 旧格式: RosterSquad[] → 转换为 WallTower[]
    data.wall = EMPTY_WALL();
}
```

---

## 九、环境依赖

| 依赖 | 用途 |
|------|------|
| Supabase | 数据库 + Auth + Storage |
| html2canvas | 排表导出 PNG |
| Next.js 15 | 框架 |
| TypeScript | 类型安全 |

---

## 十、Migration 执行清单

> [!CAUTION]
> 部署前务必按顺序执行以下 migration，跳过会导致外键约束失败。

```bash
# 按顺序执行
017_add_rosters.sql        # 基础表 + RLS
018_roster_date.sql        # roster_date 列 + UNIQUE 约束
019_match_roster_link.sql  # matches 表添加 roster_id FK
```
