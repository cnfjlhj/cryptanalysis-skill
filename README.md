# Cryptanalysis Skill

一个独立可发布的“密码学分析”skill 仓库。

当前版本的目标不是声称“任意论文自动复现”，而是把已经打通的这条密码分析 lane 单独沉淀出来，形成一个可演示、可验证、可继续演化的独立资产。

当前仓库已经把下面这条主线单独抽出来了：

```text
raw materials
  -> input normalization
  -> algorithm description
  -> structural IR
  -> semantic attachment
  -> model instantiation
  -> backend emission / solve
  -> report
```

## 当前能力边界

- 领域：对称密码分析
- 当前最强已验证 lane：`ePrint 2013/676` 上的 `PRESENT-80` 相关密钥差分 MILP lane
- 当前可以稳定做到：
  - intake 归一化
  - 已整理样例的 algorithm description / structural IR 承载
  - semantic attachment 自动生成
  - model instantiation 自动生成
  - backend emission / verdict / `.tex` / `.pdf` 生成
  - `completed / limited / needs-calibration / unsupported-current-scope` 四类诚实结果返回
- 当前还不能诚实声称：
  - 任意密码论文全自动 solver-ready 建模
  - 任意论文的 algorithm description / structural IR 完全自动抽取
  - 对所有论文主结论都给出 solver-certified 复现

## 仓库结构

```text
SKILL.md
skills/
  cryptanalysis/
  cryptanalysis-calibration/
docs/cryptanalysis-benchmark/
scripts/cryptanalysis-benchmark/
tests/
fixtures/
  solver-summaries/
  emission-summaries/
```

说明：

- 根目录 `SKILL.md` 是对外入口
- `skills/cryptanalysis-calibration/` 是内部 trust lane
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

- 默认 demo 会复用 `fixtures/solver-summaries/` 中的净化 summary，便于快速演示
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

仓库保留了 `serverC` 这条远端执行 lane 的说明文档，但它现在被当作“可选远端执行面”，不是仓库发布的前提。

参考：

- `docs/cryptanalysis-benchmark/serverC-execution-lane.md`
- `scripts/cryptanalysis-benchmark/probe-serverc.js`

## 设计原则

- 先诚实路由，再运行，不伪装“已分析”
- 复现结果是 trust gate，不是全部目标
- 当前阶段优先把可验证的 lane 做扎实，而不是假装已具备任意论文通吃能力
- skill 的演化主要靠：
  - 新论文前端参考样例积累
  - algorithm description / structural IR 金样补齐
  - 新 lane 的 calibration
