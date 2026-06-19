# 技能 CD 埋点房间接入说明

本文给外部客户端和指挥浮窗使用。网页端创建 `埋点CD` 房间后，客户端按房间码上传玩家技能状态，网页和 App 浮窗读取同一份状态。

## 数据模型

表名：`public.baiyezhan_skill_cooldowns`

房间码是 `baiyezhan_rooms.room_code`，数据库层面全局唯一，不按百业分区。新创建房间使用 8 位数字码。

一行代表一个玩家的一个技能。唯一键是：

```text
room_code + username + skill_name
```

同一个玩家同一个技能反复上传时会覆盖旧状态。

字段含义：

| 字段 | 必填 | 说明 |
|---|---|---|
| `room_code` | 是 | 全局唯一房间码，例如 `12345678` |
| `username` | 是 | 玩家用户名/角色名 |
| `profession` | 是 | 职业 |
| `skill_name` | 是 | 技能名称 |
| `cooldown_until` | 否 | 技能冷却结束时间。为空或早于当前时间表示就绪；晚于当前时间表示仍在 CD |
| `heartbeat_at` | 否 | 心跳时间。不传时服务端使用当前时间 |
| `client_reported_at` | 否 | 客户端采集时间 |
| `metadata` | 否 | 扩展 JSON |

时间统一建议传 ISO 8601 UTC，例如：

```text
2026-06-19T12:34:56.000Z
```

## 推荐上传 API

请求：

```http
POST /api/telemetry/skill-cooldowns
Content-Type: application/json
```

单条上传：

```json
{
  "room_code": "12345678",
  "username": "玩家A",
  "profession": "九灵",
  "skill_name": "环灵诀",
  "cooldown_until": "2026-06-19T12:35:20.000Z"
}
```

技能就绪时可传 `null` 或空字符串：

```json
{
  "room_code": "12345678",
  "username": "玩家A",
  "profession": "九灵",
  "skill_name": "环灵诀",
  "cooldown_until": null
}
```

批量上传：

```json
{
  "items": [
    {
      "room_code": "12345678",
      "username": "玩家A",
      "profession": "九灵",
      "skill_name": "环灵诀",
      "cooldown_until": "2026-06-19T12:35:20.000Z"
    },
    {
      "room_code": "12345678",
      "username": "玩家A",
      "profession": "九灵",
      "skill_name": "蛊身祭命",
      "cooldown_until": null
    }
  ]
}
```

兼容字段名：

| 标准字段 | 兼容写法 |
|---|---|
| `room_code` | `roomCode` |
| `skill_name` | `skillName` |
| `cooldown_until` | `cooldownUntil`, `cd_time`, `cdTime` |

`cooldown_until` 也支持数字：

| 数字范围 | 解释 |
|---|---|
| `0` 到 `86400` | 剩余秒数，会自动换算成结束时间 |
| 大于 `1000000000000` | Unix 毫秒时间戳 |
| 大于 `1000000000` | Unix 秒时间戳 |

响应：

```json
{
  "status": "ok",
  "count": 2,
  "records": []
}
```

## 指挥浮窗读取 API

请求：

```http
GET /api/telemetry/skill-cooldowns?room_code=12345678
```

返回：

```json
{
  "room_code": "12345678",
  "records": [
    {
      "room_code": "12345678",
      "username": "玩家A",
      "profession": "九灵",
      "skill_name": "环灵诀",
      "cooldown_until": "2026-06-19T12:35:20.000Z",
      "heartbeat_at": "2026-06-19T12:34:56.000Z"
    }
  ]
}
```

浮窗展示建议：

| 状态 | 规则 |
|---|---|
| 在线 | 最近心跳小于等于 15 秒 |
| 延迟 | 最近心跳 16 到 45 秒 |
| 离线 | 最近心跳超过 45 秒 |
| 技能就绪 | `cooldown_until` 为空，或 `cooldown_until <= now` |
| 技能冷却中 | `cooldown_until > now`，显示剩余秒数 |

建议客户端每 1 到 3 秒上传一次当前玩家所有技能状态。只上传一个技能也可以，但网页端会以该玩家最近一条技能记录作为心跳。

## 直连 Supabase 备用方式

如果不走 Next API，也可以直接 upsert 表。请求地址：

```text
{NEXT_PUBLIC_SUPABASE_URL}/rest/v1/baiyezhan_skill_cooldowns?on_conflict=room_code,username,skill_name
```

请求头：

```http
apikey: {NEXT_PUBLIC_SUPABASE_ANON_KEY}
Authorization: Bearer {NEXT_PUBLIC_SUPABASE_ANON_KEY}
Content-Type: application/json
Prefer: resolution=merge-duplicates,return=representation
```

请求体可直接传数组：

```json
[
  {
    "room_code": "12345678",
    "username": "玩家A",
    "profession": "九灵",
    "skill_name": "环灵诀",
    "cooldown_until": "2026-06-19T12:35:20.000Z",
    "heartbeat_at": "2026-06-19T12:34:56.000Z"
  }
]
```

推荐优先走 `/api/telemetry/skill-cooldowns`，因为 API 会校验房间存在且房间类型为 `telemetry`。
