# 0xElite Project Overview

> A decentralized platform connecting elite Web3 developers with quality projects

## Table of Contents
- [Project Vision](#project-vision)
- [System Architecture](#system-architecture)
- [User Roles](#user-roles)
- [User Flows](#user-flows)
- [Smart Contracts](#smart-contracts)
- [Data Models](#data-models)
- [API Overview](#api-overview)
- [Implementation Progress](#implementation-progress)
- [Tech Stack](#tech-stack)

---

## Project Vision

```
┌─────────────────────────────────────────────────────────────────┐
│                         0xElite                                 │
│                                                                 │
│   "Where Top Web3 Talent Meets Quality Projects"                │
│                                                                 │
│   ┌─────────────┐         ┌─────────────┐                      │
│   │  Developers │ ◄─────► │   Clients   │                      │
│   │  (精英开发者) │  匹配   │  (项目发布者) │                      │
│   └─────────────┘         └─────────────┘                      │
│                                                                 │
│   核心价值:                                                      │
│   • DAO 验证的开发者会员制                                        │
│   • 链上 Escrow 资金保护                                         │
│   • 链上里程碑审批 → 原子付款                                     │
│   • 智能匹配算法                                                 │
│   • 争议仲裁机制                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js 14)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Landing    │  │   Developer  │  │    Client    │  │   Project    │    │
│  │    Page      │  │  Dashboard   │  │  Dashboard   │  │    Pages     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                              │                                              │
│                         wagmi / viem                                        │
│                              │                                              │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            ▼                  ▼                  ▼
┌───────────────────┐  ┌─────────────┐  ┌─────────────────────────────────────┐
│   Backend API     │  │  Blockchain │  │        Smart Contracts              │
│   (Express.js)    │  │  (EVM Chain)│  │  ┌───────────┐  ┌───────────────┐  │
│                   │  │             │  │  │StakeVault │  │ EscrowVault   │  │
│  ┌─────────────┐  │  │             │  │  └───────────┘  └───────────────┘  │
│  │ REST API    │  │  │             │  │  ┌───────────────────────────────┐  │
│  │ /developers │  │  │             │  │  │      ProjectManager           │  │
│  │ /projects   │  │  │             │  │  │  (milestones + payments)      │  │
│  │ /escrow     │  │  │             │  │  └───────────────────────────────┘  │
│  └─────────────┘  │  │             │  │                                     │
│                   │  │             │  │                                     │
│  ┌─────────────┐  │  │   Events    │  │                                     │
│  │Event        │◄─┼──┼─────────────┼──│                                     │
│  │Listeners    │  │  │             │  │                                     │
│  └─────────────┘  │  │             │  │                                     │
│         │         │  └─────────────┘  └─────────────────────────────────────┘
│         ▼         │
│  ┌─────────────┐  │
│  │ PostgreSQL  │  │
│  │  Database   │  │
│  └─────────────┘  │
└───────────────────┘
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Data Flow Diagram                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   User Action          Frontend           Backend           Blockchain      │
│   ───────────          ────────           ───────           ──────────      │
│                                                                             │
│   1. 读取数据 (非关键)                                                       │
│   ┌──────────┐      ┌──────────┐      ┌──────────┐                         │
│   │  User    │ ───► │ API Call │ ───► │ Database │                         │
│   └──────────┘      └──────────┘      └──────────┘                         │
│                                                                             │
│   2. 读取数据 (关键/资金相关) - 推荐方式                                      │
│   ┌──────────┐      ┌──────────┐                      ┌──────────┐         │
│   │  User    │ ───► │  wagmi   │ ────────────────────►│ Contract │         │
│   └──────────┘      └──────────┘                      └──────────┘         │
│                                                                             │
│   3. 写入数据 (链上操作)                                                     │
│   ┌──────────┐      ┌──────────┐                      ┌──────────┐         │
│   │  User    │ ───► │  Sign TX │ ────────────────────►│ Contract │         │
│   └──────────┘      └──────────┘                      └──────────┘         │
│                            │                                │               │
│                            │                          emit Event            │
│                            │                                │               │
│                            │         ┌──────────┐           │               │
│                            │         │ Listener │ ◄─────────┘               │
│                            │         └──────────┘                           │
│                            │               │                                │
│                            │               ▼                                │
│                            │         ┌──────────┐                           │
│                            │         │ Database │  (同步链上状态)            │
│                            │         └──────────┘                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## User Roles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Roles                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────┐  ┌─────────────────────────────────┐ │
│   │           DEVELOPER             │  │            CLIENT               │ │
│   ├─────────────────────────────────┤  ├─────────────────────────────────┤ │
│   │                                 │  │                                 │ │
│   │  身份: Web3 开发者               │  │  身份: 项目发布方                │ │
│   │                                 │  │                                 │ │
│   │  准入条件:                       │  │  准入条件:                       │ │
│   │  • 连接钱包                      │  │  • 连接钱包                      │ │
│   │  • 填写申请表                    │  │  • (无需审核)                    │ │
│   │  • 质押 USDC (如 500 USDC)      │  │                                 │ │
│   │                                 │  │                                 │ │
│   │  状态流转:                       │  │  主要操作:                       │ │
│   │  pending → active → suspended   │  │  • 链上创建项目+里程碑            │ │
│   │                                 │  │  • 存入 Escrow                  │ │
│   │  主要操作:                       │  │  • 链上审批 Milestone → 付款     │ │
│   │  • 接受项目邀请                  │  │  • 发起争议                      │ │
│   │  • 提交 Milestone               │  │                                 │ │
│   │  • 领取报酬                      │  │                                 │ │
│   │                                 │  │                                 │ │
│   └─────────────────────────────────┘  └─────────────────────────────────┘ │
│                                                                             │
│   ┌─────────────────────────────────┐  ┌─────────────────────────────────┐ │
│   │          DAO MEMBER             │  │           PLATFORM              │ │
│   ├─────────────────────────────────┤  ├─────────────────────────────────┤ │
│   │                                 │  │                                 │ │
│   │  身份: 治理参与者                │  │  身份: 系统管理                  │ │
│   │                                 │  │                                 │ │
│   │  主要操作:                       │  │  主要操作:                       │ │
│   │  • 参与争议仲裁 ✅               │  │  • 收取平台手续费 (链上自动)     │ │
│   │  • 投票决策 (EliteToken 权重) ✅ │  │  • 维护系统运行                  │ │
│   │  • 查看争议详情和证据 ✅         │  │  • Owner 裁决 (未达法定人数)     │ │
│   │                                 │  │                                 │ │
│   │  (Spec 4 已实现)                 │  │                                 │ │
│   │                                 │  │                                 │ │
│   └─────────────────────────────────┘  └─────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## User Flows

### Developer Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Developer User Flow                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────┐                                                               │
│   │  Start  │                                                               │
│   └────┬────┘                                                               │
│        │                                                                    │
│        ▼                                                                    │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                  │
│   │  访问首页    │────►│ Connect     │────►│  /apply     │                  │
│   │     /       │     │ Wallet      │     │  申请页面    │                  │
│   └─────────────┘     └─────────────┘     └──────┬──────┘                  │
│                                                  │                          │
│                                                  ▼                          │
│                                           ┌─────────────┐                   │
│                                           │  填写表单    │                   │
│                                           │  • Email    │                   │
│                                           │  • GitHub   │                   │
│                                           │  • Skills   │                   │
│                                           │  • Bio      │                   │
│                                           │  • Rate     │                   │
│                                           └──────┬──────┘                   │
│                                                  │                          │
│                                                  ▼                          │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                        Staking Flow                                 │  │
│   │  ┌───────────┐      ┌───────────┐      ┌───────────┐               │  │
│   │  │  Approve  │─────►│   Stake   │─────►│  Success  │               │  │
│   │  │   USDC    │      │   USDC    │      │           │               │  │
│   │  └───────────┘      └───────────┘      └───────────┘               │  │
│   │       TX1                TX2           status='active'              │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                  │                          │
│                                                  ▼                          │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                     Developer Dashboard                             │  │
│   │  ┌───────────────────────────────────────────────────────────────┐ │  │
│   │  │  Sidebar          │         Main Content                      │ │  │
│   │  │  ┌─────────────┐  │  ┌─────────────────────────────────────┐  │ │  │
│   │  │  │ 👤 Profile  │◄─┼──│  Profile Info / Edit                │  │ │  │
│   │  │  │ 📁 Projects │  │  │  • Avatar, Name, Skills             │  │ │  │
│   │  │  │ ⚙️ Settings │  │  │  • Stats: Stake, Projects, Rating   │  │ │  │
│   │  │  │─────────────│  │  └─────────────────────────────────────┘  │ │  │
│   │  │  │ 🏠 Main Site│  │                                           │ │  │
│   │  │  └─────────────┘  │                                           │ │  │
│   │  └───────────────────────────────────────────────────────────────┘ │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Client Flow (Project Lifecycle)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Client Flow & Project Lifecycle                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Phase 1: Project Creation (On-Chain)                                      │
│   ────────────────────────────────────                                      │
│   ┌───────────┐     ┌───────────┐     ┌───────────┐     ┌───────────┐     │
│   │  Connect  │────►│  Create   │────►│  Define   │────►│  Sign TX  │     │
│   │  Wallet   │     │  Project  │     │Milestones │     │ On-Chain  │     │
│   └───────────┘     └───────────┘     └───────────┘     └───────────┘     │
│                                                               │             │
│   Client wallet calls createProjectWithMilestones() directly  │             │
│   Milestone detailsHash (keccak256) anchored on-chain         │             │
│                                                               ▼             │
│                                                        ┌───────────┐       │
│                                                        │ Register  │       │
│                                                        │ in Backend│       │
│                                                        └─────┬─────┘       │
│                                                              │             │
│   Phase 2: Matching                                   status='open'        │
│   ────────────────────                                       │             │
│                          ┌───────────────────────────────────┐│             │
│                          │      Matching Algorithm           ││             │
│                          │  • Skills match                   │◄┘             │
│                          │  • Budget fit                     │              │
│                          │  • Availability                   │              │
│                          │  • Rating (future)                │              │
│                          └───────────────────────────────────┘              │
│                                         │                                   │
│                                         ▼                                   │
│                          ┌───────────────────────────────────┐              │
│                          │   Developers Assigned (on-chain)  │              │
│                          │   assignDevelopers() - onlyOwner   │              │
│                          │   status='active'                  │              │
│                          └───────────────────────────────────┘              │
│                                         │                                   │
│   Phase 3: Escrow Deposit               ▼                                   │
│   ─────────────────────────  ┌───────────────────────────────┐              │
│                              │  Client Deposits to Escrow    │              │
│   ┌───────────┐              │  ┌─────────┐   ┌───────────┐  │              │
│   │  Approve  │─────────────►│  │ Approve │──►│  Deposit  │  │              │
│   │   USDC    │              │  │  USDC   │   │  to Vault │  │              │
│   └───────────┘              │  └─────────┘   └───────────┘  │              │
│                              └───────────────────────────────┘              │
│                                         │                                   │
│                                         ▼                                   │
│   Phase 4: Development          status='active'                             │
│   ──────────────────────                │                                   │
│                                         ▼                                   │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                      Milestone Cycle (Repeat)                       │  │
│   │                                                                     │  │
│   │   ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐ │  │
│   │   │ Developer │───►│ Developer │───►│  Client   │───►│   Funds   │ │  │
│   │   │  Starts   │    │  Submits  │    │ Approves  │    │ Released  │ │  │
│   │   │  (API)    │    │  (API)    │    │ (On-Chain)│    │ (Atomic)  │ │  │
│   │   └───────────┘    └───────────┘    └───────────┘    └───────────┘ │  │
│   │   backend relays   backend relays   approveMilestone() on-chain    │  │
│   │   to chain         to chain         → splits payment to devs      │  │
│   │                                     → sends fee to treasury        │  │
│   │                          │                                         │  │
│   │                          ▼ (if rejected)                           │  │
│   │                    ┌───────────┐                                   │  │
│   │                    │  Dispute  │──────► DAO Arbitration (Spec 4)   │  │
│   │                    │  Raised   │                                   │  │
│   │                    └───────────┘                                   │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                         │                                   │
│                          All milestones approved → auto-complete            │
│                                         │                                   │
│                                         ▼                                   │
│   Phase 5: Completion           status='completed'                          │
│   ───────────────────                   │                                   │
│                                         ▼                                   │
│                          ┌───────────────────────────────────┐              │
│                          │      Mutual Reviews (Spec 5)      │              │
│                          │  Client ←──────────► Developer    │              │
│                          │         Rate & Review             │              │
│                          └───────────────────────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Money Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Money Flow                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐                                     ┌──────────┐            │
│   │  Client  │                                     │Developer │            │
│   │  Wallet  │                                     │ Wallet(s)│            │
│   └────┬─────┘                                     └────▲─────┘            │
│        │                                                │                  │
│        │ deposit()                      release()       │                  │
│        │                               (per developer)  │                  │
│        ▼                                                │                  │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │                         EscrowVault                                 │  │
│   │  ┌─────────────────────────────────────────────────────────────┐   │  │
│   │  │                    Project Escrow                            │   │  │
│   │  │                                                              │   │  │
│   │  │   Total Deposited: $10,000 USDC                              │   │  │
│   │  │   ─────────────────────────────                              │   │  │
│   │  │                                                              │   │  │
│   │  │   Milestone 1: $3,000  ✅ Approved on-chain                  │   │  │
│   │  │     → Dev A: $1,350 (release)                                │   │  │
│   │  │     → Dev B: $1,350 (release)                                │   │  │
│   │  │     → Treasury: $300 (releaseFee, 10%)                       │   │  │
│   │  │                                                              │   │  │
│   │  │   Milestone 2: $3,000  ✅ Approved on-chain                  │   │  │
│   │  │   Milestone 3: $4,000  🔒 Locked (in progress)               │   │  │
│   │  │                                                              │   │  │
│   │  │   Platform Fee: platformFeeBps (链上配置, 默认 10%)            │   │  │
│   │  │   Multi-Dev Split: 等额分配, 最后一个开发者获取 rounding dust  │   │  │
│   │  │                                                              │   │  │
│   │  └──────────────────────────────────────────────────────────────┘   │  │
│   │                              │                                      │  │
│   │           approveMilestone() │ (triggered by client on-chain)       │  │
│   │                              ▼                                      │  │
│   │   ┌─────────────────────────────────────────────────────────────┐  │  │
│   │   │  Atomic Payment (inside ProjectManager.approveMilestone):   │  │  │
│   │   │  1. fee = budget × feeBps / 10000                           │  │  │
│   │   │  2. devPay = budget - fee                                   │  │  │
│   │   │  3. escrowVault.release(id, dev, amount) × N developers     │  │  │
│   │   │  4. escrowVault.releaseFee(id, fee) → Treasury              │  │  │
│   │   └─────────────────────────────────────────────────────────────┘  │  │
│   │                                                                     │  │
│   │   Dispute Flow:                                                     │  │
│   │   ──────────────                                                    │  │
│   │   freeze() → DAO Votes → resolveDispute(clientShare, devShare)     │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Smart Contracts

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Smart Contracts                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  StakeVault.sol (UUPS Upgradeable)                                 │  │
│   ├─────────────────────────────────────────────────────────────────────┤  │
│   │  Purpose: 管理开发者质押                                              │  │
│   │                                                                     │  │
│   │  Key Functions:                                                     │  │
│   │  • stake(amount)      - 开发者质押 USDC                              │  │
│   │  • unstake(amount)    - 开发者取回质押 (有条件)                       │  │
│   │  • slash(developer)   - 惩罚恶意开发者 (扣除质押)                     │  │
│   │                                                                     │  │
│   │  Events:                                                            │  │
│   │  • Staked(developer, amount)                                        │  │
│   │  • Unstaked(developer, amount)                                      │  │
│   │  • Slashed(developer, amount, reason)                               │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  EscrowVault.sol (UUPS Upgradeable)                                │  │
│   ├─────────────────────────────────────────────────────────────────────┤  │
│   │  Purpose: 管理项目资金托管                                            │  │
│   │                                                                     │  │
│   │  Key Functions:                                                     │  │
│   │  • deposit(projectId, amount)     - Client 存入项目资金              │  │
│   │  • release(projectId, dev, amt)   - 释放资金给 Developer             │  │
│   │  • releaseFee(projectId, fee)     - 释放手续费给 Treasury            │  │
│   │  • freeze(projectId)              - 冻结资金 (争议时)                │  │
│   │  • resolveDispute(projectId, clientShare, devShare) - 争议裁决       │  │
│   │                                                                     │  │
│   │  Events:                                                            │  │
│   │  • Deposited(projectId, client, amount)                             │  │
│   │  • Released(projectId, developer, amount)                           │  │
│   │  • Frozen(projectId, frozenBy)                                      │  │
│   │  • DisputeResolved(projectId, clientShare, developerShare)          │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  ProjectManager.sol (UUPS Upgradeable)                              │  │
│   ├─────────────────────────────────────────────────────────────────────┤  │
│   │  Purpose: 链上项目 + 里程碑管理, 里程碑审批即付款                      │  │
│   │                                                                     │  │
│   │  On-Chain Storage per Milestone:                                    │  │
│   │  • budget (uint128, USDC 6 decimals)                                │  │
│   │  • detailsHash (bytes32, keccak256 of title+desc+deliverables)      │  │
│   │  • status (Pending/InProgress/PendingReview/Completed/Disputed)     │  │
│   │                                                                     │  │
│   │  Key Functions (Simple Projects):                                   │  │
│   │  • createProject(budget)             - 创建简单项目                   │  │
│   │  • assignDeveloper(id, dev)          - 分配单个开发者 (onlyOwner)    │  │
│   │  • updateProjectState(id, state)     - 更新项目状态 (onlyOwner)     │  │
│   │                                                                     │  │
│   │  Key Functions (On-Chain Milestones):                               │  │
│   │  • createProjectWithMilestones(      - Client 创建项目+里程碑       │  │
│   │      budget, budgets[], hashes[])      (直接链上调用, 1-20 个)      │  │
│   │  • assignDevelopers(id, devs[])      - 分配多开发者 (onlyOwner)     │  │
│   │  • updateMilestoneStatus(id,idx,s)   - 更新里程碑状态 (onlyOwner)   │  │
│   │  • approveMilestone(id, idx)         - Client 链上审批 → 原子付款   │  │
│   │                                                                     │  │
│   │  Payment Logic (approveMilestone):                                  │  │
│   │  • fee = budget × platformFeeBps / 10000                            │  │
│   │  • devPayment = budget - fee (等额分配给多开发者)                     │  │
│   │  • escrowVault.release() per developer                              │  │
│   │  • escrowVault.releaseFee() → Treasury                              │  │
│   │  • All milestones done → auto-complete project                      │  │
│   │                                                                     │  │
│   │  Config: platformFeeBps (链上, max 5000=50%), treasury, escrowVault  │  │
│   │                                                                     │  │
│   │  Events:                                                            │  │
│   │  • ProjectCreated(projectId, client, totalBudget)                   │  │
│   │  • MilestonesCreated(projectId, count)                              │  │
│   │  • MilestoneApproved(projectId, idx, devPayment, platformFee)       │  │
│   │  • MilestoneStatusChanged(projectId, idx, oldStatus, newStatus)     │  │
│   │  • DevelopersAssigned(projectId, developers[])                      │  │
│   │  • ProjectStateChanged(projectId, oldState, newState)               │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  EliteToken.sol (Spec 4 - DAO Arbitration)                         │  │
│   ├─────────────────────────────────────────────────────────────────────┤  │
│   │  Purpose: 灵魂绑定治理代币 (Soulbound ERC20Votes, UUPS)             │  │
│   │                                                                     │  │
│   │  Key Properties:                                                    │  │
│   │  • Non-transferable (soulbound) - transfers always revert           │  │
│   │  • ERC20Votes with timestamp-based clock (ERC-6372)                 │  │
│   │  • 6 decimals (matching USDC)                                       │  │
│   │                                                                     │  │
│   │  Key Functions:                                                     │  │
│   │  • mint(to, amount)              - 铸造投票权 (仅 owner)             │  │
│   │  • burn(from, amount)            - 销毁投票权 (仅 owner)             │  │
│   │                                                                     │  │
│   │  Voting Power Formula:                                              │  │
│   │  total_earned × (avg_rating / 5.0)                                  │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  DisputeDAO.sol (Spec 4 - DAO Arbitration)                         │  │
│   ├─────────────────────────────────────────────────────────────────────┤  │
│   │  Purpose: DAO 治理的争议仲裁系统 (UUPS Upgradeable)                  │  │
│   │                                                                     │  │
│   │  4-Phase Lifecycle:                                                 │  │
│   │  createDispute → submitEvidence → startVoting → resolve             │  │
│   │                                                                     │  │
│   │  Key Functions:                                                     │  │
│   │  • createDispute(projectId)      - 发起争议 (50 USDC 仲裁费)        │  │
│   │  • submitEvidence(id, uri)       - 提交证据 (7天窗口)                │  │
│   │  • startVoting(id)               - 开始投票 (3天投票期)              │  │
│   │  • castVote(id, supportClient)   - 投票 (按 EliteToken 权重)        │  │
│   │  • executeResolution(id)         - 执行裁决                          │  │
│   │  • ownerResolve(id, clientWins)  - Owner 裁决 (未达法定人数)          │  │
│   │                                                                     │  │
│   │  Events:                                                            │  │
│   │  • DisputeCreated(id, projectId, initiator)                         │  │
│   │  • EvidenceSubmitted(id, party, uri)                                │  │
│   │  • VotingStarted(id, deadline)                                      │  │
│   │  • VoteCast(id, voter, supportClient, weight)                       │  │
│   │  • DisputeResolved(id, clientWon)                                   │  │
│   │  • DisputeResolvedByOwner(id, clientWon)                            │  │
│   │                                                                     │  │
│   │  Quorum: 25% of total EliteToken supply required                    │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Models

### Entity Relationship

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Entity Relationship Diagram                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌───────────────┐           ┌───────────────────┐    ┌───────────────┐   │
│   │   developers  │           │     projects      │    │    clients    │   │
│   ├───────────────┤           ├───────────────────┤    ├───────────────┤   │
│   │ wallet_address│◄──────────│ assigned_dev      │    │ wallet_address│   │
│   │ email         │     1:N   │ client_address    │───►│               │   │
│   │ github        │           │ title             │N:1 │               │   │
│   │ skills[]      │           │ description       │    └───────────────┘   │
│   │ hourly_rate   │           │ budget            │                        │
│   │ availability  │           │ status            │                        │
│   │ stake_amount  │           │ skills_req[]      │                        │
│   │ status        │           │ uses_onchain_ms   │  (on-chain milestone?) │
│   └───────────────┘           │ contract_proj_id  │  (on-chain project ID) │
│                               │ created_at        │                        │
│                               └─────────┬─────────┘                        │
│                                         │                                   │
│                                         │ 1:N                               │
│                                         ▼                                   │
│                               ┌───────────────────┐                        │
│                               │    milestones     │                        │
│                               ├───────────────────┤                        │
│                               │ project_id        │                        │
│                               │ title             │                        │
│                               │ description       │                        │
│                               │ budget            │                        │
│                               │ status            │                        │
│                               │ details_hash      │  (keccak256, on-chain) │
│                               │ on_chain_index    │  (0-based index)       │
│                               │ due_date          │                        │
│                               └─────────┬─────────┘                        │
│                                         │                                   │
│   ┌───────────────┐                     │ 1:N                              │
│   │escrow_deposits│                     ▼                                  │
│   ├───────────────┤           ┌───────────────┐                            │
│   │ project_id    │◄──────────│payment_history│                            │
│   │ total_deposit │     1:N   ├───────────────┤                            │
│   │ total_released│           │ project_id    │                            │
│   │ is_frozen     │           │ milestone_id  │                            │
│   │ frozen_by     │           │ tx_type       │                            │
│   └───────────────┘           │ amount        │                            │
│                               │ tx_hash       │                            │
│                               └───────────────┘                            │
│                                                                             │
│   ┌───────────────┐                                                        │
│   │   reviews     │  (Spec 5 - 已实现)                                      │
│   ├───────────────┤                                                        │
│   │ project_id    │                                                        │
│   │ reviewer_addr │                                                        │
│   │ reviewee_addr │                                                        │
│   │ reviewer_type │  (client / developer)                                  │
│   │ rating (1-5)  │                                                        │
│   │ comment       │                                                        │
│   └───────────────┘                                                        │
│                                                                             │
│   ┌───────────────┐                                                        │
│   │   disputes    │  (Spec 4 - 已实现)                                      │
│   ├───────────────┤                                                        │
│   │ project_id    │──────────────┐                                         │
│   │ client_addr   │              │                                         │
│   │ developer_addr│              │ 1:N                                     │
│   │ initiator_addr│              │                                         │
│   │ status        │  (open/voting/resolved)                                │
│   │ evidence_uri  │  (client + developer)                                  │
│   │ voting_deadline│             │                                         │
│   │ vote_weights  │  (client/dev/total)                                    │
│   │ winner        │  (client/developer/null)                               │
│   │ arbitration_fee│ (50 USDC)   ▼                                         │
│   └───────────────┘      ┌───────────────┐                                │
│                          │dispute_votes  │                                │
│                          ├───────────────┤                                │
│                          │ dispute_id    │                                │
│                          │ voter_address │                                │
│                          │ support_client│  (boolean)                     │
│                          │ vote_weight   │                                │
│                          └───────────────┘                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Status State Machines

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Status State Machines                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Developer Status:                                                         │
│   ─────────────────                                                         │
│                                                                             │
│   ┌─────────┐    stake()     ┌─────────┐   violation    ┌───────────┐      │
│   │ pending │───────────────►│ active  │───────────────►│ suspended │      │
│   └─────────┘                └─────────┘                └───────────┘      │
│        ▲                          │                           │            │
│        │                          │ unstake()                 │ appeal()   │
│        │                          ▼                           │            │
│        │                    ┌─────────┐                       │            │
│        └────────────────────│ inactive│◄──────────────────────┘            │
│                             └─────────┘                                     │
│                                                                             │
│   Project Status:                                                           │
│   ───────────────                                                           │
│                                                                             │
│   ┌──────┐  match   ┌──────────┐  deposit  ┌────────┐  done   ┌──────────┐ │
│   │ open │─────────►│ assigned │──────────►│ active │────────►│completed │ │
│   └──────┘          └──────────┘           └────────┘         └──────────┘ │
│       │                  │                      │          (auto on all     │
│       │ timeout          │ reject               │ dispute   milestones     │
│       ▼                  ▼                      ▼           approved)      │
│   ┌──────────┐      ┌──────────┐          ┌──────────┐                    │
│   │cancelled │      │cancelled │          │ disputed │                    │
│   └──────────┘      └──────────┘          └──────────┘                    │
│                                                 │                          │
│                                                 │ resolved                 │
│                                                 ▼                          │
│                                           ┌──────────┐                     │
│                                           │completed │                     │
│                                           │    or    │                     │
│                                           │cancelled │                     │
│                                           └──────────┘                     │
│                                                                             │
│   Milestone Status (On-Chain):                                              │
│   ────────────────────────────                                              │
│                                                                             │
│   ┌─────────┐  start   ┌─────────────┐  submit  ┌────────────────┐         │
│   │ Pending │─────────►│ InProgress  │─────────►│ PendingReview  │         │
│   └─────────┘          └─────────────┘          └────────────────┘         │
│   (backend relays       (backend relays           │                        │
│    updateMilestone       updateMilestone           │ approveMilestone()     │
│    Status)               Status)                   │ (client, on-chain)     │
│                                                    ▼                        │
│                              ┌───────────┐   ┌──────────┐                  │
│                              │ Disputed  │   │Completed │                  │
│                              └───────────┘   │(+ atomic │                  │
│                                              │ payment) │                  │
│                                              └──────────┘                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## API Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             REST API Endpoints                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Developers API (/api/developers)                                          │
│   ────────────────────────────────                                          │
│   POST   /                      注册新开发者                                 │
│   GET    /                      获取开发者列表 (支持过滤)                     │
│   GET    /:address              获取开发者详情                               │
│   PUT    /:address              更新开发者信息                               │
│   GET    /:address/projects     获取开发者的项目                             │
│                                                                             │
│   Projects API (/api/projects)                                              │
│   ───────────────────────────                                               │
│   POST   /                      创建新项目 (off-chain 简单项目)              │
│   POST   /register              注册链上项目 (前端 TX 确认后调用)             │
│   GET    /                      获取项目列表                                 │
│   GET    /:id                   获取项目详情                                 │
│   PUT    /:id                   更新项目                                     │
│                                                                             │
│   Milestones API (/api/milestones)                                          │
│   ────────────────────────────────                                          │
│   POST   /:projectId/milestones 添加里程碑                                   │
│   PUT    /:id                   更新里程碑状态 (start/submit/approve)        │
│                                 链上项目 approve 返回 400 (需链上操作)        │
│                                                                             │
│   Escrow API (/api/escrow)                                                  │
│   ────────────────────────                                                  │
│   GET    /project/:id           获取项目 escrow 状态                         │
│   GET    /project/:id/history   获取支付历史                                 │
│                                                                             │
│   Clients API (/api/clients)                                                │
│   ─────────────────────────                                                 │
│   POST   /                      注册/更新客户资料                             │
│   GET    /:address              获取客户详情                                 │
│                                                                             │
│   Matching API (/api/matching)                                              │
│   ──────────────────────────                                                │
│   POST   /find                  为项目寻找匹配的开发者                        │
│   POST   /assign                分配开发者到项目                             │
│                                                                             │
│   Reviews API (/api/reviews)                                                │
│   ──────────────────────────                                                │
│   POST   /                      提交评价                                     │
│   GET    /developer/:address    获取开发者评价                               │
│   GET    /client/:address       获取客户评价                                 │
│   GET    /project/:id           获取项目评价                                 │
│   PUT    /:id                   编辑评价 (7天内)                              │
│                                                                             │
│   Disputes API (/api/disputes) (Spec 4)                                     │
│   ─────────────────────────────────────                                     │
│   POST   /                      创建争议 (签名验证)                          │
│   GET    /:id                   获取争议详情                                 │
│   GET    /project/:projectId    获取项目争议                                 │
│   PUT    /:id/evidence          提交/更新证据 (签名验证)                      │
│   GET    /:id/votes             获取争议投票列表                             │
│   GET    /active/list           获取活跃争议列表                             │
│   GET    /my/:address           获取用户相关争议                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Progress

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Implementation Progress                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Spec 1: Developer Registration & Staking                                  │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% ✅      │
│   [██████████████████████████████████████████████████]                      │
│   • Developer registration form                                             │
│   • StakeVault contract                                                     │
│   • Staking flow UI                                                         │
│   • Developer dashboard                                                     │
│                                                                             │
│   Spec 2: Project Submission & Matching                                     │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% ✅      │
│   [██████████████████████████████████████████████████]                      │
│   • Project creation API ✅                                                 │
│   • Matching algorithm ✅                                                   │
│   • Project listing UI ✅                                                   │
│   • Client dashboard ✅                                                     │
│                                                                             │
│   Spec 3: Escrow System                                                     │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% ✅      │
│   [██████████████████████████████████████████████████]                      │
│   • EscrowVault contract                                                    │
│   • Deposit/Release/Freeze functions                                        │
│   • Event listener (escrowEventListener.ts)                                 │
│   • Payment history tracking                                                │
│                                                                             │
│   Spec 4: DAO Arbitration                                                   │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  95% ✅      │
│   [████████████████████████████████████████████████░░]                      │
│   • EliteToken.sol (soulbound ERC20Votes governance) ✅                    │
│   • DisputeDAO.sol (4-phase arbitration lifecycle) ✅                      │
│   • Smart contract tests (23 + 52 = 75 tests) ✅                          │
│   • Database migration 005 (disputes + dispute_votes) ✅                   │
│   • Dispute API routes (7 endpoints) ✅                                    │
│   • Dispute event listener + voting power sync ✅                          │
│   • Frontend dispute pages (/disputes, /disputes/[id]) ✅                  │
│   • Remaining: E2E integration testing, contract deployment                │
│                                                                             │
│   Spec 5: Reviews & Ratings                                                 │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% ✅      │
│   [██████████████████████████████████████████████████]                      │
│   • Reviews database migration ✅                                           │
│   • Reviews API (CRUD + pagination) ✅                                      │
│   • Frontend components (RatingStars, ReviewCard, ReviewList) ✅            │
│   • SubmitReviewModal ✅                                                    │
│   • Rating auto-recalculation triggers ✅                                   │
│                                                                             │
│   Spec 6: Client Dashboard                                                  │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% ✅      │
│   [██████████████████████████████████████████████████]                      │
│   • Client dashboard layout with sidebar ✅                                 │
│   • Client profile page with registration flow ✅                           │
│   • Project management (list, create, filter) ✅                            │
│   • Project detail (milestones, escrow, approve/reject) ✅                  │
│   • Client settings page ✅                                                 │
│   • Auto-redirect for registered clients ✅                                 │
│                                                                             │
│   RFC-008: On-Chain Milestones                                              │
│   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 100% ✅      │
│   [██████████████████████████████████████████████████]                      │
│   • ProjectManager contract with on-chain milestones (78 tests) ✅         │
│   • createProjectWithMilestones + approveMilestone + multi-dev split ✅    │
│   • Database migration 007 (details_hash, on_chain_index) ✅               │
│   • Milestone event listener (milestoneListener.ts) ✅                     │
│   • Backend route updates (register endpoint, V2 milestone flow) ✅        │
│   • Frontend: client calls contract directly for create + approve ✅       │
│   • Frontend: MilestoneCard on-chain approval + MilestoneManager hash ✅   │
│   • Frontend: contracts.ts with PROJECT_MANAGER_ABI ✅                     │
│   • Remaining: contract deployment, E2E testing                            │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│   Overall Progress:  ~97%                                                   │
│   [████████████████████████████████████████████████░░]                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Tech Stack                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Frontend                          Backend                                 │
│   ────────                          ───────                                 │
│   • Next.js 14 (App Router)         • Node.js                              │
│   • React 18                        • Express.js                           │
│   • TypeScript                      • TypeScript                           │
│   • TailwindCSS                     • PostgreSQL                           │
│   • wagmi v2                        • ethers.js                            │
│   • viem                                                                    │
│                                                                             │
│   Blockchain                        DevOps                                  │
│   ──────────                        ──────                                  │
│   • Solidity ^0.8.x                 • Git / GitHub                         │
│   • Hardhat (testing)               • Docker (optional)                    │
│   • OpenZeppelin                    • Vercel (frontend)                    │
│   • EVM Compatible Chains           • Railway/Render (backend)             │
│                                                                             │
│   Key Dependencies                                                          │
│   ────────────────                                                          │
│   Frontend:                         Backend:                                │
│   • @tanstack/react-query           • pg (PostgreSQL driver)               │
│   • @rainbow-me/rainbowkit          • cors, helmet, express-rate-limit     │
│                                     • dotenv                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Reference

### Environment Variables

```bash
# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_STAKE_VAULT_ADDRESS=0x...
NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=0x...
NEXT_PUBLIC_PROJECT_MANAGER_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_DISPUTE_DAO_ADDRESS=0x...
NEXT_PUBLIC_ELITE_TOKEN_ADDRESS=0x...

# Backend (.env)
DATABASE_URL=postgresql://user:pass@localhost:5432/oxelite
RPC_URL=https://...
STAKE_VAULT_ADDRESS=0x...
ESCROW_VAULT_ADDRESS=0x...
PROJECT_MANAGER_ADDRESS=0x...
DISPUTE_DAO_ADDRESS=0x...
ELITE_TOKEN_ADDRESS=0x...
```

### Key File Locations

```
0xElite/
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx                    # Landing page (auto-redirect)
│   │   ├── apply/page.tsx              # Developer application
│   │   ├── dashboard/developer/        # Developer dashboard
│   │   │   ├── layout.tsx              #   Sidebar + access control
│   │   │   ├── page.tsx                #   Profile view
│   │   │   ├── projects/page.tsx       #   Projects list
│   │   │   └── settings/page.tsx       #   Settings
│   │   ├── dashboard/client/           # Client dashboard
│   │   │   ├── layout.tsx              #   Sidebar + client status check
│   │   │   ├── page.tsx                #   Profile + registration
│   │   │   ├── projects/page.tsx       #   Projects list + create
│   │   │   ├── projects/[id]/page.tsx  #   Project detail + milestones
│   │   │   └── settings/page.tsx       #   Settings
│   │   ├── projects/create/page.tsx    # Project creation (on-chain TX)
│   │   └── disputes/                   # DAO Arbitration (Spec 4)
│   │       ├── page.tsx                #   Disputes list + filters
│   │       └── [id]/page.tsx           #   Dispute detail + evidence + voting
│   └── src/
│       ├── config/
│       │   └── contracts.ts            # PROJECT_MANAGER_ABI + addresses
│       └── components/
│           ├── ConnectWallet.tsx
│           ├── developer/
│           │   ├── StakeFlow.tsx
│           │   └── EditProfileModal.tsx
│           ├── client/
│           │   ├── EditClientProfileModal.tsx
│           │   └── CreateProjectModal.tsx
│           ├── project/
│           │   ├── MilestoneCard.tsx    # On-chain approve + status display
│           │   └── MilestoneManager.tsx # Hash preview + milestone editor
│           ├── reviews/
│           │   ├── RatingStars.tsx
│           │   ├── ReviewCard.tsx
│           │   ├── ReviewList.tsx
│           │   └── SubmitReviewModal.tsx
│           └── disputes/
│               ├── DisputeStatusBadge.tsx
│               └── DisputeCard.tsx
│
├── backend/
│   ├── src/api/routes/
│   │   ├── developers.ts
│   │   ├── clients.ts
│   │   ├── projects.ts               # POST /register for on-chain projects
│   │   ├── milestones.ts             # V2: blocks approve for on-chain projects
│   │   ├── escrow.ts
│   │   ├── reviews.ts
│   │   └── disputes.ts               # Spec 4
│   ├── src/services/
│   │   ├── matchingAlgorithm.ts
│   │   ├── escrowEventListener.ts
│   │   ├── votingPowerSync.ts         # Spec 4
│   │   └── eventListeners/
│   │       ├── milestoneListener.ts   # RFC-008: MilestoneApproved sync
│   │       └── disputeListener.ts     # Spec 4
│   ├── src/types/
│   │   ├── developer.ts
│   │   ├── client.ts
│   │   ├── review.ts
│   │   └── dispute.ts                # Spec 4
│   └── src/db/migrations/
│       ├── 001_create_developers_table.sql
│       ├── 002_create_project_tables.sql
│       ├── 003_create_escrow_tables.sql
│       ├── 004_create_reviews_table.sql
│       ├── 005_create_dispute_tables.sql  # Spec 4
│       └── 007_add_onchain_milestone_fields.sql  # RFC-008
│
├── contracts/
│   ├── contracts/
│   │   ├── StakeVault.sol
│   │   ├── EscrowVault.sol
│   │   ├── ProjectManager.sol         # On-chain milestones + payments
│   │   ├── EliteToken.sol             # Spec 4 (soulbound ERC20Votes)
│   │   └── DisputeDAO.sol             # Spec 4 (DAO arbitration)
│   ├── test/
│   │   ├── ProjectManager.test.js     # 78 tests (milestones + payments)
│   │   ├── EliteToken.test.js         # 23 tests
│   │   └── DisputeDAO.test.js         # 52 tests
│   └── scripts/
│       ├── deploy.ts                  # Full deployment (all contracts)
│       └── upgrade.ts                 # Generic UUPS upgrade script
│
├── docs/
│   └── RFC/
│       └── RFC-008-onchain-milestones.md  # On-chain milestone design
│
└── specs/
    ├── capabilities/
    │   ├── developer-onboarding/
    │   ├── project-management/
    │   ├── escrow-management/
    │   ├── review-management/
    │   └── client-dashboard/
    ├── api/
    │   ├── developer-management/
    │   ├── project-management/
    │   ├── escrow-management/
    │   ├── review-management/
    │   └── client-management/
    ├── architecture/
    │   ├── stake-vault-contract/
    │   ├── escrow-vault-contract/
    │   ├── escrow-event-listener/
    │   ├── project-manager-contract/  # Includes V2 milestone spec
    │   └── matching-algorithm/
    ├── data-models/
    │   ├── project/                   # uses_onchain_milestones, contract_project_id
    │   └── milestone/                 # details_hash, on_chain_index
    └── changes/archive/              # Archived change proposals
        └── add-dao-arbitration/      # Spec 4 (archived)
```

---

## Next Steps

1. **Deploy Contracts** - 部署 StakeVault, EscrowVault, ProjectManager, EliteToken, DisputeDAO 到测试网
2. **Configure Addresses** - 在 .env 中配置合约地址 (包括 ProjectManager)
3. **Run Database Migration 007** - 添加 details_hash, on_chain_index, uses_onchain_milestones 字段
4. **E2E Integration Testing** - 端到端测试: 链上创建项目 → 存入 escrow → 开发 → 链上审批付款
5. **Voting Power Sync** - 部署后运行 votingPowerSync 同步开发者投票权
6. **Gas Optimization** - 合约 gas 优化和安全审计

---

*Last updated: March 4, 2026*
