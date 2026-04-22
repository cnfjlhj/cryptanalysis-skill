# 密码学分析 Skill

这是一个独立可发布的“密码学分析”skill 仓库。

它的核心目标不是“只做论文复现”，而是把密码分析过程沉淀成一条可复用、可验证、可扩展的建模链路。

当前仓库围绕下面这条主线组织：

```text
任意材料
  -> input normalization
  -> algorithm description
  -> structural IR
  -> semantic attachment
  -> model instantiation
  -> backend emission / solve
  -> analysis report
```

## 仓库定位

这个仓库真正承载的是：

- 从原始材料中抽取和凝练密码分析对象
- 形成中间表示与语义挂接
- 自动拼接可求解模型
- 产出分析/验证报告

其中：

- 论文复现是 `验证手段`
- calibration 是 `信任门`
- 不是整个仓库的最终目标

## 当前进度

当前已经真正打通的部分：

- input normalization
- algorithm description 的规范与样例
- structural IR 的规范与样例
- semantic attachment 自动生成
- model instantiation 自动生成
- backend emission / solve / verdict / report

当前还明显偏弱的部分：

- 从任意材料自动抽取 algorithm description
- 从 algorithm description 自动生成高质量 structural IR
- 扩展到更多 primitive / attack family / backend

## 当前最强验证 lane

当前最可信的一条 lane 是：

- 领域：对称密码分析
- paper lane：`ePrint 2013/676`
- primitive：`PRESENT-80`
- attack family：`related_key_differential`
- backend：HiGHS-backed MILP

它的意义是：

- 证明这条总体流程不是空想
- 说明中后端链路已经有一条真实可跑通的样板

而不是把整个仓库缩成“只会复现 PRESENT-80”

## 仓库结构

```text
SKILL.md
docs/cryptanalysis-benchmark/
scripts/cryptanalysis-benchmark/
tests/
fixtures/
  solver-summaries/
  emission-summaries/
```

说明：

- 根目录 `SKILL.md` 是对外入口
- `docs/cryptanalysis-benchmark/calibration-lane.md` 是内部 calibration 说明，不是第二个 skill，也不是仓库主目标
- `fixtures/` 内放的是已净化的 demo/bootstrap 结果，不含原工程私有绝对路径

## 快速开始

前置：

- Node.js >= 18
- Python 3.10+，如果要本地求解则安装 `highspy`
- 如果要生成 PDF，需要 `latexmk`

Python 依赖：

```bash
python3 -m pip install -r requirements-python.txt
```

最小演示：

```bash
node scripts/cryptanalysis-benchmark/run-cryptanalysis-demo.js --demo all --no-report
```

完整链路演示：

```bash
node scripts/cryptanalysis-benchmark/run-cryptanalysis-full-chain-demo.js --no-report
```

按 bundle 入口走：

```bash
node scripts/cryptanalysis-benchmark/run-cryptanalysis-analysis.js \
  --bundle docs/cryptanalysis-benchmark/examples/eprint-2013-676.present80-r5.bundle.json \
  --no-report
```

说明：

- 默认 demo 会复用 `fixtures/solver-summaries/` 中的净化 summary，便于快速演示整个流程
- 如果你想真的本地求解，可以改走 `run-calibration-case.js` 并安装 `highspy`

## 测试

运行关键测试：

```bash
npm test
```

或者单独跑：

```bash
node tests/test-cryptanalysis-benchmark-run-cryptanalysis-demo.js
node tests/test-cryptanalysis-benchmark-run-full-chain-demo.js
node tests/test-cryptanalysis-benchmark-generate-model-instantiation.js
```

## serverC

仓库保留了 `serverC` 这条远端执行 lane 的说明文档，但它只是可选执行面，不是 skill 的核心定义。

参考：

- `docs/cryptanalysis-benchmark/serverC-execution-lane.md`
- `scripts/cryptanalysis-benchmark/probe-serverc.js`

## 设计原则

- 先诚实路由，再运行，不伪装“已分析”
- 复现结果是 trust gate，不是全部目标
- 当前阶段优先补强前端三层：`input normalization -> algorithm description -> structural IR`
- 当前可运行 lane 是演化基础，不是仓库最终定义
- skill 的演化主要靠：
  - 新论文前端参考样例积累
  - algorithm description / structural IR 金样补齐
  - 操作语义与规则库扩展
  - 新 lane 的 calibration 与验证
