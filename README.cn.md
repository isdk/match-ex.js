# @isdk/match-ex

> 【[English](./README.md)|中文】
---

一个声明式、带权重评分的匹配/校验引擎：用操作符（`$and`、`$or`、`$contains`、`$each` 等）、JSON Schema、语义化 diff 与模板，将「实际值」与「期望树」进行匹配。

与框架无关——可用于纯数据驱动的集成测试、响应契约校验，也可直接跑在浏览器里。

> 需要完整的 AI 测试运行器（执行器、fixtures、YAML、评分报告）？请看基于本引擎构建的 [`@isdk/ai-test-runner`](https://github.com/isdk/ai-test-runner.js)。其验证语法与本引擎完全一致（并自动完成插件注册），可作为本 README 的用例参考。

## 目录

- [为什么用 match-ex？](#为什么用-match-ex)
- [架构](#架构)
- [安装](#安装)
- [快速上手](#快速上手)
- [核心概念](#核心概念)
  - [匹配语义](#匹配语义) · [严格模式](#严格模式) · [模板系统](#模板系统) · [JSON Schema 校验](#json-schema-校验) · [语义化差异匹配](#语义化差异匹配-diff)
- [操作符](#操作符)
- [评分与元数据](#评分与元数据)
- [自定义操作符](#自定义操作符)
- [API 参考](#api-参考)

## 为什么用 match-ex？

- **声明式期望**——正则、子集匹配、操作符与自定义函数可自由组合成一棵期望树；普通对象默认按「部分匹配」语义处理。
- **加权评分，而非简单通过/失败**——任意节点都可以携带权重、维度标签与红线（`critical`）规则；引擎返回带逐路径明细的评分结果 `MatchResult`。
- **零重型依赖**——核心仅依赖 `diff`、`lodash-es` 和 `util-ex`。JSON Schema 校验与模板插值拆成了两个可插拔的小插件。
- **同构（isomorphic）**——不使用任何 Node 内建模块，可直接打包进浏览器。
- **语义化失败反馈**——字符串比对失败时自动回退到结构化 diff（字符/词/行/JSON），而不是只告诉你「不相等」。

## 架构

```
@isdk/match-ex            核心引擎：操作符、评分策略、diff、
                          模板/Schema 注册表（不内置具体实现）
@isdk/match-ex-schema     插件：基于 Ajv 的 JSON Schema（导入即注册）
@isdk/match-ex-template   插件：{{占位符}} 插值（导入即注册）
```

核心**不内置**模板引擎和 Schema 校验器，两者均可插拔：

- 未安装 `@isdk/match-ex-template` 时，`{{...}}` 期望的字符串插值不可用（`getStringTemplate()` 会抛错）。
- 未安装 `@isdk/match-ex-schema` 时，JSON Schema 期望（启发式识别或 `$schema`）会抛错并提示安装插件。

导入插件即自动完成注册：

```ts
import '@isdk/match-ex-schema'
import '@isdk/match-ex-template'
```

（`@isdk/ai-test-runner` 已经替你完成这些导入，行为与拆分前完全一致。）

## 安装

```bash
# 仅核心
npm install @isdk/match-ex          # 或 pnpm add @isdk/match-ex

# 带插件
npm install @isdk/match-ex @isdk/match-ex-schema @isdk/match-ex-template
```

## 快速上手

```ts
import { validate, ValidationContext } from '@isdk/match-ex'
import '@isdk/match-ex-schema'    // 可选：JSON Schema 支持
import '@isdk/match-ex-template'  // 可选：{{模板}} 支持

const ctx = new ValidationContext({
  data: { name: 'Alice' },   // 模板变量
  input: {},                  // fixture 级配置（如 diff、diffPermissive）
  maxScore: 100,              // 评分区间上限（默认 100）
  scoring: true,              // 开启评分模式
})

// 正则 + 部分对象匹配（未声明的键被忽略）
let r = await validate({ role: 'assistant', content: 'Hello Alice!' },
                       { content: /Hello {{name}}/ }, ctx)
// r.pass === true, r.score === 1

// 操作符自由组合：先排序再取首个元素断言
r = await validate([3, 1, 2],
  { $sort: { $by: (n: number) => n, $first: { $lte: 1 } } }, ctx)

// 加权评分 + 红线惩罚
r = await validate('Hello World',
  { $or: [
      { $expect: /Hello/, $meta: { score: 80, critical: true } },
      { $expect: /BadWord/, $meta: { score: { value: -20, critical: true } } },
  ] }, ctx)
// r.score, r.pass, r.details（逐路径评分）, r.failures
```

`validate()` 返回 `MatchResult`：

| 字段 | 说明 |
|---|---|
| `score` | 归一化得分 `0.0 ~ 1.0`（相对父节点已分配权重）。 |
| `pass` | 是否通过（受 `critical` 红线与 `threshold` 影响）。 |
| `failures` | `MatchFailure[]`：每个失败项带 `key`（路径）、`message`、`expected`、`actual`，字符串失败时还带 `diff`。 |
| `details` | `MatchResultDetail[]`：评分明细树（`key`/`title`/`dimension`/`weight`/`score`/`pass`/`critical`）。 |
| `title` / `dimension` / `critical` | 当前节点的元数据（由 `$meta`/`$` 简写注入）。 |

### 入口一览

| 导出 | 说明 |
|---|---|
| `validate(actual, expected, ctx)` | 主入口。返回带评分的 `MatchResult`。 |
| `validateMatch(actual, expected, options)` | 旧版包装，只返回 `failures`。建议使用 `validate`。 |
| `ValidationContext` | 携带匹配配置（`data`、`input`、`strict`、操作符、评分）贯穿递归。 |
| `OPERATORS` | 内置操作符注册表（`$and`、`$contains` …）。 |
| `@isdk/match-ex/loader` | 子路径入口，提供 `loadOperators()` / `wrapCustomOperator()` 用于动态加载操作符。 |

---

## 核心概念

### 匹配语义

每个期望值按以下优先级分发：

1. **操作符**——普通对象且（唯一的非元数据）键是 `$and` 之类的操作符。
2. **RegExp**——对字符串化后的实际值做 `test`。
3. **字符串**——未配置 diff 要求时为 `actual.includes(expected)`；否则回退到**语义化 diff**（字符/词/行策略）。
4. **数组**——逐元素递归匹配（严格模式下还要校验长度）。
5. **函数**——`(actual, input) => boolean | ValidationResult | score`。
6. **JSON Schema**——注册的 `JsonSchemaType` 实例，或通过 `isJsonSchema` 启发式识别的普通对象（可用 `ctx.disableHeuristicSchema` 关闭）。
7. **对象**——逐属性递归匹配；键支持点路径（`user.name`），`/regex/` 形式的键可匹配任意实际键名。
8. **原始值**——严格相等。

补充规则：

- **部分匹配**：默认情况下，对象只校验期望中声明的属性，实际值多出的键不会导致失败（`strict` 除外）。
- **自动 trim**：字符串类型的实际值在每一层递归前都会 `trim()`。
- **元数据键不参与校验**：`$meta` 以及（无 `$meta` 时的）`$score`、`$title` 等简写键会被剔除；对象中的操作符键同样不会当作待校验的业务字段。

```ts
// 点路径 + 正则键名
await validate(
  { user_42: { profile: { name: 'Alice' } } },
  { '/^user_\\d+$/': { 'profile.name': 'Alice' } },
  ctx
)
```

### 严格模式

严格模式通过 `ValidationContext` 的 `strict` 选项配置（即 `ctx.strict`），接受 `true | false | 'object' | 'diff' | 'array' | string[]`：

- `object`：实际对象中出现未被期望匹配的键即失败。
- `array`：数组长度必须一致。
- `diff`：diff 非宽松（未列入白名单的变更视为失败）。
- `true`：以上全部；数组形式可组合，如 `['object', 'array']`。

```ts
const ctx = new ValidationContext({ strict: ['object', 'array'] })
await validate({ a: 1, b: 2 }, { a: 1 }, ctx) // pass === false（多余键 b）
```

### 模板系统

期望值（含正则的 `source`、对象的**键名**、数组元素）在匹配前都会经过模板插值，变量来自 `ctx.data`（以及 `ctx.input`，后者优先级更高）。

- **纯占位符替换**：若模板字符串只包含一个变量（如 `{{user}}`），且数据中该值是对象/数组/布尔，则整体替换为该**原始值**，而不是字符串化结果。
- **深度递归解析**：替换出来的值若仍含模板，会自动递归渲染。
- **模板方言**：`ctx.data.templateFormat` 可选 `default | fstring | golang | env | hf`。
- **插件依赖**：插值实现由 `@isdk/match-ex-template` 提供，未导入时遇到 `{{...}}` 会抛错。

```ts
const ctx = new ValidationContext({ data: { user: { id: 1, name: 'Alice' } } })
// "{{user}}" → { id: 1, name: 'Alice' }（对象本身，可直接做深度匹配）
await validate({ id: 1, name: 'Alice' }, '{{user}}', ctx)
// 正则模板：/Alice/ 
await validate('Hi Alice', '/{{user.name}}/', ctx)
```

### JSON Schema 校验

两种触发方式（均需要 `@isdk/match-ex-schema` 插件）：

- **启发式识别**：普通对象带合法的 `type`（`string`/`number`/`integer`/`boolean`/`object`/`array`/`null`）且不含 `$contains`/`$all`/`$sequence` 键时，自动按 JSON Schema 校验。可用 `ctx.disableHeuristicSchema = true` 关闭。
- **显式 `$schema` 操作符**：始终按 JSON Schema 校验。

所有 [ajv-formats](https://github.com/ajv-validator/ajv-formats) 与 [ajv-keywords](https://github.com/ajv-validator/ajv-keywords) 的关键字均可用。

```yaml
# 显式
profile:
  $schema:
    type: object
    properties:
      age: { type: number, minimum: 18 }
    required: [age]

# 启发式（顶层 type 即可）
age: { type: number, minimum: 18 }
```

### 语义化差异匹配 (Diff)

**引擎中所有的字符串比对在失败时都会自动调用 diff 引擎**——即使没有显式使用 `$diff`：当 `actual.includes(expected)` 不成立（或已配置 diff 要求）时，会自动执行结构化差分比对，并在 `MatchFailure.diff` 中给出逐项变更，而不是一句模糊的「不匹配」。

#### 智能探测（`auto`）

未指定 `type` 时（或 `diff: true` / `diff: 'auto'`）使用启发式探测：

- 两侧都是可解析的 JSON 对象/数组 → `json`（按路径对比，忽略缩进与字段顺序）。
- 任一侧含换行 → `lines`。
- 任一侧长度 ≥ 20 且含空格 → `words`。
- 其余 → `chars`。

#### 策略类型

`auto` | `chars`（默认兜底）| `words`（忽略空格）| `wordsWithSpace` | `lines` | `sentences` | `json`

#### 白名单与宽容模式

通过 `DiffOptions` 配置（可作为 `$diff` 的操作数，也可放在 `ctx.input.diff`）：

| 选项 | 说明 |
|---|---|
| `type` | diff 策略。 |
| `items` | 期望变更白名单：`{ value?, path?, val?, added?, removed?, required?, score? }`；`value` 支持正则字符串。 |
| `permissive` | 宽容模式：忽略未声明的变更，仅验证 `required: true` 的项是否按预期出现（同 `ctx.diffPermissive`）。 |
| `ignoreCase` / `ignoreWhitespace` / `ignoreNewlineAtEof` / `newlineIsToken` / `stripTrailingCr` / `intlSegmenter` | 透传给 `diff` 库的细粒度选项。 |

```yaml
# 仅确保 "User" 被添加，忽略其它改动
output: "Hello"
diff:
  permissive: true
  items:
    - { value: "User", added: true, required: true }
```

```yaml
# JSON 级结构化白名单
diff:
  type: json
  items:
    - path: "user.id"
      val: 123
      added: true
```

> `strict: 'diff'`（或 `strict: true`）表示非宽容：任何未列入白名单的变更都会导致失败。

---

## 操作符

### 总览

> 同一对象中（除 `$meta`/`$` 简写等元数据键外）**只能出现一个操作符**，多个条件请用 `$and` / `$or` 组合。

| 操作符 | 含义 | 默认策略 |
|---|---|---|
| `$and` | 所有条件都须通过。 | `weighted` |
| `$or` | 至少一个条件通过（取最高分）。 | `max` |
| `$not` | 对嵌套期望取反。 | — |
| `$contains` | 数组：包含一个匹配项 · 字符串：子串 · 对象：部分匹配。 | `max` |
| `$all` | 数组包含全部期望项，顺序不限。 | `weighted` |
| `$each` | 每个元素都匹配给定的单条规则。 | `weighted` |
| `$sequence` | 数组按顺序包含指定项（允许中间穿插噪声项）。 | — |
| `$sort` | 先按 `$by` 排序，再校验其余内容。 | — |
| `$nth` / `$first` / `$last` | 按索引提取元素（支持负索引）并校验。 | — |
| `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin` | 比较与成员判断。 | — |
| `$expr` | 求值 JS 表达式字符串。 | — |
| `$exists` | 键/值存在性。 | — |
| `$expect` | 透明包装，用于给任意节点附加元数据。 | — |
| `$schema` | 显式 JSON Schema 校验（需要 schema 插件）。 | — |
| `$diff` | 强制语义化 diff，支持白名单与策略。 | — |

### 逻辑与集合

- **`$and`**：条件数组，实际值必须满足**所有**条件；得分按权重加权求和。
- **`$or`**：满足**任意一个**即通过；得分取加权后的最高分分支。
- **`$not`**：命中嵌套期望即失败，反之通过。常用于黑名单：`$not: /敏感词/`。
- **`$contains`**：按目标类型自适应——数组「至少一项匹配」、字符串「子串包含」、对象「子集匹配」。
- **`$all`**：数组必须包含**所有**期望项，**不要求顺序**，也不限制额外元素。
- **`$each`**：数组中**每一个**元素都必须符合给定的**单一**规则；空数组默认通过；权重自动均分给每个元素。
- **`$sequence`**：数组**按顺序**出现指定项，项之间允许夹带未声明的干扰项。适合校验多步调用链路。
- **`$exists`**：存在性校验（详见下方）。

```yaml
$and:
  - "/^Hello/"          # 必须以 Hello 开头
  - { $not: "/World/" } # 且不能包含 World
```

```yaml
# 多维消息链路上做「或」判定
$or:
  - $contains: { role: 'assistant', tools: [{ name: 'get_user' }] }
  - $contains: { role: 'assistant', tools: [{ name: 'find_person' }] }
```

```yaml
# 有序序列：先 get_user，再 send_email（中间可有其它步骤）
$sequence:
  - { role: 'assistant', tools: [{ name: 'get_user' }] }
  - { role: 'assistant', tools: [{ name: 'send_email' }] }
```

**`$exists` 的三种模式：**

| 写法 | 含义 |
|---|---|
| `$exists: true` / `false` | 简写：值不为 `undefined`（且 `null` 也视为不存在）。 |
| `$exists: { $value: true, nullAsAbsent: true }` | `null` 也算存在，只有 `undefined` 视为不存在。 |
| `$exists: { $value: false, strict: true }` | 严格：要求该键在父对象中**物理不存在**（可与 `nullAsAbsent` 组合）。 |

### 数组处理与变换

- **`$sort`**：先对实际数组排序，再把**剩余的期望断言**应用到排好序的新数组上（流式包装）。
  - **`$by`** 支持四种格式：
    - **字符串**：属性名，前缀 `-` 表示降序（如 `"-score"`）。
    - **函数**：`(item, index, array) => value`（支持异步）。
    - **表达式对象**：`{ "$expr": "item.score * 1.2", "order": "desc" }`，作用域内有 `item`（`actual` 为其别名）、`index`、`array`、`data`、`input`、`ctx`。
    - **数组**：以上格式的组合，实现多层级排序。
- **`$nth`**：取 `$index`（默认 `0`，支持负数如 `-1`）位置的元素单独校验，越界或空数组直接失败。
- **`$first`** / **`$last`**：`$nth` 在 `$index: 0` / `-1` 时的语法糖。

```yaml
$sort:
  $by:
    - { $expr: "item.score * 1.2", order: "desc" }
    - "-createdAt"
  $first: { status: "success" }
```

```yaml
$nth: { $index: 1, status: "success" }
```

### 关系与比较

- **`$eq` / `$ne`**：严格相等 / 不相等。
- **`$gt` / `$gte` / `$lt` / `$lte`**：数值（或可比较值）的大小关系，适合阈值、打分、长度约束。
- **`$in` / `$nin`**：实际值存在 / 不存在于给定数组。

```yaml
# 同一层级只能有一个操作符，多个条件请用 $and 组合
score: { $and: [{ $gte: 60 }, { $lt: 100 }] }
status: { $in: ['active', 'pending'] }
```

### 表达式算子 `$expr`

以 JavaScript 语法书写一段表达式字符串，实现跨字段、算术或异步判断。

可用作用域变量：

| 变量 | 说明 |
|---|---|
| `actual` | 当前被校验的实际值。 |
| `expected` | 当前期望值（即表达式字符串本身）。 |
| `data` | `ctx.data`（模板变量集）。 |
| `fixture` | `ctx.input`（fixture 级配置）。 |
| `ctx` | 当前 `ValidationContext`；`ctx.actual` 为根实际值。 |
| `loop` | 仅数组算子（`$each`、`$contains`、`$all`、`$sequence`）中存在：`{ index, first, last, length }`。 |

返回值语义：`boolean` → 1/0；`number` → 置信度（结合 `threshold` 判定）；`{ pass?, score?, ... }` → 直接采用；其它值按真假转换。表达式抛错会作为失败原因返回。

```yaml
# 内置 $length/$keys/$values 的替代实现
$expr: "actual.length === 5"
# 多属性联动
$expr: "actual.price * actual.quantity >= 500 && data.userRole === 'admin'"
# 借助 loop 做首尾差异断言
$each: { $expr: "loop.first ? actual.status === 'init' : actual.status === 'done'" }
```

### 特化算子

- **`$expect`**：虚拟容器，透明地委托给其值，仅用于为任意节点注入评分元数据（权重、红线、标题、维度）。
- **`$schema`**：显式 JSON Schema 校验。
- **`$diff`**：强制使用指定策略/白名单做语义化差分对比；操作数可以是字符串，也可以是 `{ value | expected, type, items, permissive, ... }`。

---

## 评分与元数据

### 核心配置（`ValidationContext`）

| 选项 | 说明 |
|---|---|
| `scoring` | `true | false | 'auto'`，开启评分模式（影响 diff 评分与 `$contains` 的最优分支搜索）。 |
| `maxScore` | 总分上限，默认 `100`，同时作为权重归一化的量纲基准。 |
| `passScore` | 及格线，默认等于 `maxScore`（引擎只透传该值，是否通过由上层判定，如 `ai-test-runner`）。 |
| `unassignedWeight` | `totalUnassignedWeight` 的别名：为所有未显式设置 `score` 的项预留的总预算，默认 `0.1`。 |
| `autoConfidence` | 默认 `true`：自动把 `0~1` 之间的权重视为置信度（百分比）；`'force'` 跳过启发式强制按置信度处理。 |
| `threshold` | 模糊匹配的置信度阈值（叶子节点），得分低于该值即判失败。 |
| `allocatedScore` | 父节点分配给当前节点的分数预算，默认等于 `maxScore`。 |
| `strategy` | 当前使用的 `ScoringStrategy`（未指定时默认 `weighted`）。 |

### 分层相对权重

评分采用 **「自上而下分配，自下而上聚合」** 的层级权重模型：

- **权重归一化**：同一层级内的兄弟节点竞争分配父节点的 `allocatedScore`。
- **自动适配量级**：`0~1` 视为百分比，`>= 1` 视为绝对分值，按 `scale = max(maxScore, 最大显式分值)` 自动换算。
- **未标注项**：平分 `totalUnassignedWeight` 预算（空间不足时会按预算反向压缩显式项）。
- **负分（惩罚项）**：不参与正权重项的 `1.0` 预算竞争，直接按比例换算为负权重。

### `$meta` 与 `$` 简写

> **⚠️ 注意**：`score`、`title`、`critical`、`description`、`dimension` 等键名属于**业务数据**；所有元数据必须通过 `$meta` 容器或 `$` 前缀简写键定义。
> 两者**互斥**：一旦对象中存在 `$meta`，`$` 简写键就不再被当作元数据（会被忽略），避免与业务字段冲突。

**推荐：显式 `$meta` 容器**（存在 `$meta` 时，顶级命名空间保持清洁，可安全校验同名字段）

```yaml
someField:
  score: 100         # 业务数据：实际输出必须包含 score 字段
  $meta:
    score: 80        # 元数据：该项的验证权重
    title: "核心字段"
```

**快捷：`$` 前缀简写**（对象中**不含** `$meta` 时生效）

```yaml
$score: 80              # 数字：权重（0~1 视为百分比，>= 1 视为绝对分值）
$title: "核心字段"
```

```yaml
$score: { value: -20, critical: true }   # 对象：负分（扣分）+ 红线
$title: "安全扣分"
$dimension: 'security'  # (可选) 维度标签，用于多维度评估报告（也可写在 $score 内）
$critical: true         # (可选) 红线
$strategy: 'weighted'   # (可选) 子节点聚合策略
$threshold: 0.75        # (可选) 模糊匹配置信度阈值
$description: '...'     # (可选) 描述
```

### 负分与红线

- 负值被视为**扣分偏移量**：惩罚项**匹配成功**即意味着扣分。
- 惩罚项命中且标记 `critical` 时，整体判定为不通过（红线），并生成一条虚拟 `critical` 失败项，便于定位是哪个红线被触碰。
- 奖励项（`weight >= 0`）未通过时，整体不通过。

### 评分策略

| 策略 | 聚合逻辑 | 默认使用者 |
|---|---|---|
| `weighted`（别名 `and`） | `score = Σ(child.score × child.weight)`，所有奖励项必须通过 | `$and`、对象、数组、`$each`、`$all` |
| `max`（别名 `or`） | `score = max(child.score × child.weight)`，任一通过即通过 | `$or`、`$contains` |

- 策略优先级：**算子内置 `strategy`**（如 `$or.strategy = 'max'`，保证算子逻辑完整）> **用户 `$strategy`（或 `$meta.strategy`）** > **父级继承（`ctx.strategy`）**。
- 策略按名称引用：`weighted` / `and`、`max` / `or`，未知名称回退到 `weighted`（注册表 `strategies` 与 `getStrategy()` 目前属于内部模块，未从核心入口导出）。

### `$expect`：评分包装算子

`$expect` 是虚拟容器，可在任意位置注入评分元数据：

```yaml
output:
  $and:
    - $expect: /春天/
      $meta: { score: 80, dimension: 'accuracy', critical: true, title: "核心关键词" }
    - $expect: /花/
      $score: 20
      $threshold: 0.5   # 匹配置信度低于 50% 则失败
    - $expect: /敏感词/
      $score: { value: -50, dimension: 'security' }
      $title: "安全扣分"
```

### `$diff`：差异分值化

对 diff 白名单中的每一项打分（需开启 `scoring`）：

```yaml
$diff:
  items:
    - value: "核心结论"
      added: true
      $score: { value: 90, critical: true }
    - value: "修饰词"
      added: true
      $score: 10
  permissive: true   # 宽容模式：仅按白名单项评分，忽略未声明的其它变化
```

---

## 自定义操作符

### 内联操作符

通过 `ctx.operators` 注册，键名通常以 `$` 开头（与内置操作符风格一致）：

```ts
import { ValidationContext, validate } from '@isdk/match-ex'
import { wrapCustomOperator } from '@isdk/match-ex/loader'

const ctx = new ValidationContext({
  operators: {
    $length: wrapCustomOperator((actual, expected) => actual?.length === expected),
  },
})
await validate('abc', { $length: 3 }, ctx)
```

> `wrapCustomOperator` 与 `loadOperators` 一样位于 `@isdk/match-ex/loader` 子路径入口（核心入口刻意不导出它们）。

`wrapCustomOperator` 适配**简化签名** `(actual, expected, fixture)`，其中 `fixture` 提供：

| 属性 | 说明 |
|---|---|
| `$data` | 即 `ctx.data`。 |
| `$options` | 来自 `expected.$value` 包装的辅助参数（见下）。 |
| `$validate` | `(act, exp) => validate(act, exp, ctx)`，用于递归复用引擎逻辑。 |
| 其余 | `ctx.input` 的内容会被展开进来（`input` 为非对象时置于 `input` 字段）。 |

### 返回值映射

| 返回值类型 | 映射逻辑 | 适用场景 |
|---|---|---|
| `boolean` | `true` → 得分 1.0 通过；`false` → 0.0 不通过。 | 简单对/错断言。 |
| `string` | 视为失败消息：得分 0.0 不通过。 | 需要具体失败原因。 |
| `number` | `0.0 ~ 1.0` 置信度；是否通过取决于 `threshold`。 | 模糊/相似度匹配。 |
| `Object` | 需含 `score`/`pass` 之一（或 `failures`），可附带 `message`、`dimension`、`details`。 | 需要维度信息或自定义失败列表。 |

### `$value` 约定：分离主值与参数

在 YAML/JSON 中使用 `$value` 结构时，`$value` 的内容作为 `expected` 传入，其余属性被提取到 `fixture.$options`：

```yaml
output:
  $checkCode:
    $value: "function sum"   # 主校验内容 → expected
    timeout: 1000            # 辅助参数 → fixture.$options
    strict: true
```

```js
export function checkCode(actual, expected, fixture) {
  const { timeout, strict } = fixture.$options
  // expected === "function sum"
}
```

### 逻辑容器算子

需要递归校验多个子项的算子（如自定义 `$and`）使用**完整签名** `(actual, expected, ctx, validate)`，并可利用 `ValidationContext` 的助手方法：

```js
export async function myContainer(actual, expectedList, ctx, validate) {
  const weights = ctx.distribute(expectedList)              // 自动权重分配
  const results = []
  for (let i = 0; i < expectedList.length; i++) {
    const subCtx = ctx.createChildContext(i, expectedList.length) // 自动路径/变量
    results.push(await validate(actual[i], expectedList[i], subCtx))
  }
  return ctx.aggregate(results, weights)   // 自动应用 myContainer.strategy
}

myContainer.virtual = true
myContainer.strategy = 'weighted'   // 锁定为加权平均策略
```

- 完整签名（4 个形参）会被直接使用；简化签名（≤3 个形参）会被 `wrapCustomOperator` 包装。
- `ctx.distribute(items)`：按当前策略把 `ScoreConfig` 列表归一化成权重数组。
- `ctx.aggregate(results, weights)`：按当前策略聚合并填充 `details`。
- `ctx.createChildContext(keyOrIndex, count, options)`：自动处理路径层级。

### 虚拟路径策略（`virtual`）

算子通过 `virtual` 属性声明其在评分明细树中的路径表现，遵循 **「默认虚拟」** 准则：

| 取值 | 行为 |
|---|---|
| `true`（默认） | 虚拟模式：单元素时完全透明（子项继承父路径）；多元素时按模板生成可读分支（如 `$and[0]`）。 |
| `false` | 物理模式：保留算子自身层级（如 `output.$myOp`），子项落在 `[index]` 下。 |
| `string` | 自定义路径模板，可用 `$key`、`$index`、`$count`、`$operator` 变量（如 `$operator[$key]`）。 |

### 动态加载 `loadOperators`

字符串形式的操作符模块通过 `@isdk/match-ex/loader` 子路径加载（核心入口刻意不导出它，以避免打包器无法分析的动态 `import()`）：

```ts
import { loadOperators } from '@isdk/match-ex/loader'

const operators = await loadOperators({
  $len: 'js://./my-operators.js#checkLength',  // 路径#导出名
  checkCode: './checkers.js#checkCode',        // 自动补齐 $ 前缀
}, baseDir)

// 数组形式：自动推断名称（优先导出名，否则取文件名的小驼峰）
const ops = await loadOperators(['./checkers.js#checkCode', 'my-test-utils#validator'], baseDir)
```

- 协议前缀 `js://` 可省略（默认即 `js:`）。
- 相对路径基于第二个参数 `baseDir`（未提供时按原样交给 `import()`）。
- 绝对路径与 npm 裸包名（如 `lodash-es#isEqual`）同样支持；`#` 后为导出名，缺省取 `default`。
- 加载后的函数同样按形参个数判定使用完整签名还是简化签名。

### 相关配置项

- **`allowOperatorOverride`**：默认 `false`（内置操作符优先）。置为 `true` 时，自定义操作符可覆盖内置操作符（如 `$contains`）。
- **`ctx.operators`**：内联操作符表，键名建议以 `$` 开头；`loadOperators()` 会自动为缺失 `$` 前缀的名称补齐。

---

## API 参考

### 导出

| 导出 | 说明 |
|---|---|
| `validate(actual, expected, ctx)` | 主入口，返回 `MatchResult`。 |
| `validateMatch(actual, expected, options)` | 旧版包装，返回 `failures`（并追加到 `options.failures`）。 |
| `ValidationContext` | 校验上下文：`createSubContext(subKey, options)`、`createChildContext(keyOrIndex, count, options)`、`distribute(items)`、`aggregate(results, weights)`。 |
| `OPERATORS` | 内置操作符注册表。 |
| `isStrict(type, strict)` | 严格模式判定工具。 |
| `getDiff(expected, actual, options)` | 生成 `DiffItem[]`。 |
| `validateStringDiff(actual, expected, ctx, options)` | 字符串 diff 校验（含白名单/评分）。 |
| `hasDiffChanges(diff)` | 是否存在增删改。 |
| `formatTemplate(value, options)` / `formatObject(input, options)` | 模板插值（单值 / 递归对象与键名）。 |
| `setStringTemplate(impl)` / `getStringTemplate()` | 注册/读取插值实现（契约：`{ formatIf(options) }`）。 |
| `setJsonSchemaType(ctor)` / `getJsonSchemaType()` / `resolveJsonSchemaType()` | 注册/读取 JSON Schema 实现。 |
| `isJsonSchema(obj)` | 启发式判断普通对象是否为 JSON Schema。 |
| `JsonSchemaType` | 用于实现自定义校验器的抽象基类（`create(schema)` / `validate(value)` / `getErrors()`）。 |
| `calculateNormalizedWeights(weights, options)` | 权重归一化核心算法（混合百分比与绝对分值）。 |
| `getScoreConfig(item)` / `isMetadataKey(key, item)` | 元数据解析工具。 |
| `@isdk/match-ex/loader` | `loadOperators()`、`wrapCustomOperator()`、`resolveModuleUrl()`。 |

### `ValidationContext` 选项

| 选项 | 默认 | 说明 |
|---|---|---|
| `key` | `''` | 当前路径（由引擎自动维护）。 |
| `data` | `{}` | 模板变量集（可含 `templateFormat`）。 |
| `input` | — | fixture 级配置，会并入模板变量；其中的 `diff`、`diffPermissive` 会被 diff 引擎读取。 |
| `strict` | — | 严格模式：`true`\|`false`\|`'object'`\|`'diff'`\|`'array'`\|`string[]`。 |
| `diffPermissive` | — | 全局宽容 diff。 |
| `disableHeuristicSchema` | `false` | 关闭 JSON Schema 启发式识别。 |
| `operators` | — | 自定义操作符表。 |
| `allowOperatorOverride` | `false` | 允许覆盖内置操作符。 |
| `scoring` | — | 评分模式开关。 |
| `maxScore` / `passScore` | `100` / `maxScore` | 分值与及格线。 |
| `unassignedWeight` | `0.1` | 未分配项权重预算。 |
| `allocatedScore` | `maxScore` | 当前节点的分数预算。 |
| `strategy` | `weighted` | 评分策略实例。 |
| `threshold` / `autoConfidence` | — | 置信度阈值 / 百分比权重自动识别。 |
| `loop` | — | 数组迭代信息（`{ index, first, last, length }`）。 |
| `actual` | — | 根实际值（供 `$expr`/自定义算子回溯）。 |

### 核心类型

```ts
interface MatchResult {
  score: number            // 0.0 - 1.0
  pass: boolean
  failures: MatchFailure[] // { key?, message?, expected?, actual?, diff?, critical? }
  details?: MatchResultDetail[]
  title?: string
  dimension?: string
  critical?: boolean
}

interface MatchResultDetail {
  key: string              // 路径
  title?: string
  dimension?: string
  score: number            // 相对已分配权重的得分
  weight: number           // 归一化权重
  pass: boolean
  critical?: boolean
  details?: MatchResultDetail[]
}
```

---

## 开发

```bash
pnpm test      # vitest
pnpm build     # tsup（ESM + CJS + dts）
```

## 许可证

MIT © Riceball Lee
