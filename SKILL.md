---
name: 密码学分析
description: 用于从论文、算法描述、代码和补充材料出发，逐步完成算法描述凝练、结构化 IR、语义挂接、模型实例化、求解/验证与分析报告生成的密码学分析 skill。当前已打通一条可验证的 PRESENT-80 lane，但目标是更通用的密码分析建模流程。
---

# 密码学分析

这是仓库唯一公开的 skill。

它的目标不是把“复现某篇论文”本身当作终点，而是把密码分析过程沉淀成一条可以持续演化的建模与分析链路。

## 目标主线

```text
任意材料
  -> 输入归一化
  -> algorithm description
  -> structural IR
  -> semantic attachment
  -> model instantiation
  -> backend emission / solve
  -> analysis / verification report
```

这里的“任意材料”可以是：

- 攻击论文 PDF / LaTeX / 抽取文本
- primitive 参考论文或标准
- 代码仓库
- 附录或补充材料
- 结果表格
- 用户自己的备注
- 不完整的算法描述

## 核心定位

这个 skill 的真正目标是：

- 从原始材料中逐步凝练出可建模的密码分析对象
- 把分析过程拆成可复用的中间层
- 把局部规则、语义和后端求解链显式接起来
- 最终输出研究者可读的“密码学分析报告”

因此：

- 论文复现是 `验证手段`
- calibration 是 `信任门`
- solver 结果是 `证据层`
- 它们都不是整个 skill 的最终目的

## 现阶段已经打通的部分

当前仓库已经具备下面这些部件。

### 1. 输入归一化

已经可以把原始 bundle 整理成较明确的 intake/request 结构，并在信息不足时诚实返回缺失项。

### 2. algorithm description

已经有：

- description 文档规范
- schema
- 若干 curated 示例

但还没有做到：

- 从任意密码论文全自动稳定抽取

### 3. structural IR

已经有：

- IR 文档规范
- schema
- 若干 curated 示例

但还没有做到：

- 任意论文直接自动产出高质量 IR

### 4. semantic attachment

已经在当前验证 lane 中实现了从 IR 到局部语义挂接的确定性生成。

### 5. model instantiation

已经在当前验证 lane 中实现了从 IR / semantics 到后端实例化的确定性生成。

### 6. backend solve / verify

已经有：

- MILP emission
- HiGHS 求解
- solver summary ingest
- verdict 渲染

### 7. report

已经可以输出：

- `analysis-result.json`
- `analysis-report.tex`
- `analysis-report.pdf`

在完整 demo lane 中，还会保留中间产物树，便于展示和检查：

- input normalization
- algorithm description
- structural IR
- semantic attachment
- model instantiation
- backend manifest
- verdict
- report

## 当前能力边界

当前最强、最可信的一条 lane 是：

- 领域：对称密码分析
- 已验证 paper lane：`ePrint 2013/676`
- primitive：`PRESENT-80`
- attack family：`related_key_differential`
- backend：HiGHS-backed MILP

这意味着：

- 当前仓库已经能把一条真实密码分析流程打通
- 但它还不是“任意论文全自动密码分析系统”

## 为什么仓库里会有 calibration 文档

仓库里保留了 `calibration-lane.md`，是因为：

- 新 lane 要先通过校准，才能被当作可信分析链使用
- 这有助于解释“为什么这条结果可信”

但它只是内部支撑文档，不是第二个公开 skill。

## 诚实路由规则

这个 skill 不能假装“已经分析完成”。

当前允许的顶层状态只有：

- `completed`
- `limited`
- `needs-calibration`
- `unsupported-current-scope`

当真正进入 solver-backed lane 时，再细分 paper-facing verdict：

- `optimal-consistent`
- `feasible-match-only`
- `unresolved`
- `mismatch`

## 当前最重要的演化方向

接下来真正该进化的，不是继续把 README 写成“我们复现了一篇论文”，而是持续补强前端三层：

- input normalization
- algorithm description
- structural IR

也就是把这条链真正从“当前可演示 lane”向“更通用的密码学分析 skill”推进。

