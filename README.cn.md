# @isdk/match-ex

> 【[English](./README.md)|中文】
---

一个声明式、带权重评分的匹配/校验引擎：用操作符（`$and`、`$or`、`$contains`、`$each` 等）、JSON Schema、语义化 diff 与模板，将「实际值」与「期望树」进行匹配。

与框架无关——可用于纯数据驱动的集成测试、响应契约校验，也可直接跑在浏览器里。

> 需要完整的 AI 测试运行器（执行器、fixtures、YAML、评分报告）？请看基于本引擎构建的 [`@isdk/ai-test-runner`](https://github.com/isdk/ai-test-runner.js)。

## 为什么用 match-ex？

- **声明式期望**——正则、子集匹配、操作符与自定义函数可自由组合成一棵期望树；普通对象默认按「部分匹配」语义处理。
- **加权评分，而非简单通过/失败**——任意节点都可以携带权重、维度标签与红线（`critical`）规则；引擎返回带逐路径明细的评分结果 `MatchResult`。
- **零重型依赖**——核心仅依赖 `diff`、`lodash-es` 和 `util-ex`。JSON Schema 校验与模板插值拆成了两个可插拔的小插件。
- **同构（isomorphic）**——不使用任何 Node 内建模块，可直接打包进浏览器。

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
npm install @isdk/match-ex

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
  input: {},                  // fixture 级配置（如 strict、diff）
})

// 正则 + 部分对象匹配
let r = await validate({ role: 'assistant', content: 'Hello Alice!' },
                       { content: /Hello {{name}}/ }, ctx)
// r.pass === true, r.score === 1

// 操作符自由组合
r = await validate([3, 1, 2],
  { $sort: { $by: '-.', $first: { $lte: 1 } } }, ctx)

// 加权评分 + 红线惩罚
r = await validate('Hello World',
  { $or: [
      { $expect: /Hello/, $meta: { score: 80, critical: true } },
      { $expect: /BadWord/, $meta: { score: { value: -20, critical: true } } },
  ] }, ctx)
// r.score, r.pass, r.details（逐路径评分）, r.failures
```

### 入口一览

| 导出 | 说明 |
|---|---|
| `validate(actual, expected, ctx)` | 主入口。返回带评分的 `MatchResult`（`{ score, pass, failures, details }`）。 |
| `validateMatch(actual, expected, options)` | 旧版包装，只返回 `failures`。建议使用 `validate`。 |
| `ValidationContext` | 携带匹配配置（`data`、`input`、`strict`、操作符、策略）贯穿递归。 |
| `@isdk/match-ex/loader` | 子路径入口，提供 `loadOperators()` / `wrapCustomOperator()` 用于动态加载操作符。 |

## 匹配语义

每个期望值按以下优先级分发：

1. **操作符**——普通对象且（唯一的非元数据）键是 `$and` 之类的操作符。
2. **RegExp**——对字符串化后的实际值做 `test`。
3. **字符串**——未配置 diff 要求时为 `actual.includes(expected)`；否则回退到**语义化 diff**（字符/词/行策略）。
4. **数组**——逐元素递归匹配（严格模式下还要校验长度）。
5. **函数**——`(actual, input) => boolean | ValidationResult | score`。
6. **JSON Schema**——注册的 `JsonSchemaType` 实例，或通过 `isJsonSchema` 启发式识别的普通对象（可用 `ctx.disableHeuristicSchema` 关闭）。
7. **对象**——逐属性递归匹配；键支持点路径（`user.name`），`/regex/` 形式的键可匹配任意实际键名。
8. **原始值**——严格相等。

### 严格模式

`ctx.input.strict` 接受 `true | false | 'object' | 'diff' | 'array' | string[]`：

- `object`：实际对象中出现多余键即失败。
- `array`：数组长度必须一致。
- `diff`：diff 非宽松（未列出的变更视为失败）。

## 操作符

| 操作符 | 含义 |
|---|---|
| `$and` | 所有条件都须通过（加权和聚合）。 |
| `$or` | 至少一个条件通过（最高分聚合）。 |
| `$not` | 对嵌套期望取反。 |
| `$contains` | 数组：包含一个匹配项 · 字符串：子串 · 对象：部分匹配。 |
| `$all` | 数组包含全部期望项，顺序不限。 |
| `$each` | 每个元素都匹配给定的单条规则。 |
| `$sequence` | 数组按顺序包含指定项（允许中间穿插噪声项）。 |
| `$sort` | 先按 `$by`（字段/函数/`$expr`，`-字段` 表示降序）对实际数组排序，再校验其余内容。 |
| `$nth` / `$first` / `$last` | 按索引提取元素（支持负索引）并校验。 |
| `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin` | 比较与成员判断。 |
| `$expr` | 求值 JS 表达式字符串，作用域内有 `actual`、`expected`、`data`、`fixture`、`loop`、`ctx`；结果可为布尔/数字/结果对象。 |
| `$exists` | 键/值存在性；`{ $value: false, strict: true }` 要求键物理不存在。 |
| `$expect` | 透明包装，用于给任意节点附加元数据。 |
| `$schema` | 显式 JSON Schema 校验（需要 schema 插件）。 |
| `$diff` | 强制语义化 diff，支持白名单与策略。 |

## 评分与元数据

通过 `$meta` 容器或 `$` 简写（`$score`、`$critical`、`$title`、`$description`、`$dimension`、`$strategy`、`$threshold`）为任意节点附加元数据：

```yaml
someField:            # 业务数据优先——此处无 $meta
  score: 100          # 按普通字段校验
status:
  $expect: 'ok'       # 下面是简写元数据
  $score: 80
  $title: '核心字段'
keywords:
  $expect: /Spring/
  $meta: { score: { value: -20, critical: true }, dimension: 'security' }
```

- **权重**在同一层级内按相对比例分配；未显式赋权的兄弟节点瓜分剩余预算。百分比和整数分值均可。
- **负分即惩罚项**——惩罚项命中且标记 `critical` 时整体判负（红线）。
- **策略**：`weighted`（`$and`/对象/数组默认）与 `max`（`$or` 默认）。可通过 `$strategy` 按节点指定，或用 `getStrategy()` 查询。

返回的 `MatchResult.details` 是 `{ key, title, dimension, weight, score }` 的树——每个路径一条——同时返回用于报告的 `failures`。

## 自定义操作符

内联处理器：

```ts
import { ValidationContext, validate, wrapCustomOperator } from '@isdk/match-ex'

const ctx = new ValidationContext({
  operators: {
    $length: wrapCustomOperator((actual, expected) =>
      actual?.length === expected),
  },
})
await validate('abc', { $length: 3 }, ctx)
```

简化版处理器签名为 `(actual, expected, fixture)`，其中 `fixture` 暴露 `$data`、`$options`（来自 `expected.$value` 包装）和用于递归匹配的 `$validate`。返回 `ValidationResult`、布尔值或数字分数均可。

动态（字符串）操作符模块通过 `@isdk/match-ex/loader` 子路径支持：

```ts
import { loadOperators } from '@isdk/match-ex/loader'
const operators = await loadOperators({
  $len: 'js://./my-operators.js#checkLength', // 路径#导出名
})
```

## 模板与 Schema 注册表

| 函数 | 用途 |
|---|---|
| `setStringTemplate(impl)` / `getStringTemplate()` | 注册/读取插值实现（`{ formatIf(options) }`）。 |
| `setJsonSchemaType(ctor)` / `getJsonSchemaType()` / `resolveJsonSchemaType()` | 注册/读取 JSON Schema 实现。 |
| `isJsonSchema(obj)` | 启发式判断普通对象是否为 JSON Schema。 |
| `JsonSchemaType` | 用于实现自定义校验器的抽象基类。 |

参考实现见插件包 [`@isdk/match-ex-schema`](https://github.com/isdk/match-ex-schema.js) 与 [`@isdk/match-ex-template`](https://github.com/isdk/match-ex-template.js)。

## 开发

```bash
pnpm test      # vitest
pnpm build     # tsup（ESM + CJS + dts）
```

## 许可证

MIT © Riceball Lee
