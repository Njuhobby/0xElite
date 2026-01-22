# 0xElite - Web3 精英开发者平台

## 项目计划书

---

## 1. 项目概述

### 1.1 项目名称
**0xElite** - The Elite Dev Protocol

### 1.2 一句话描述
> 一个只接纳顶尖 Web3 开发者的去中心化平台，通过准入制和主动匹配，为高价值项目快速组建精英团队。

### 1.3 核心理念
- **精英准入**：只接受最优秀的 Web3 开发者
- **主动匹配**：平台策划组队，而非被动撮合
- **链上透明**：声誉、支付、仲裁全部上链
- **高效执行**：最大程度缩短招聘方和开发者的等待时间

---

## 2. 问题与解决方案

### 2.1 现有平台的问题

| 平台类型 | 问题 |
|---------|------|
| **Upwork/Fiverr** | 质量参差不齐，海选效率低，抽成高（20%） |
| **LaborX** | 开放注册无门槛，被动撮合，仲裁中心化 |
| **Toptal** | Web2 支付，声誉不透明，数据不可携带 |

### 2.2 0xElite 的解决方案

```
传统平台:
招聘方发帖 → 100人申请 → 筛选 → 面试 → 选择 → 开始工作
                        (耗时 2-4 周)

EliteDevHub:
招聘方提交需求 → 平台审核 → 平台组队 → 开始工作
                        (耗时 < 48 小时)
```

---

## 3. 目标用户

### 3.1 开发者端 (Developer)
- 有 2+ 年 Solidity/Web3 开发经验
- 有可验证的链上部署历史
- 参与过知名项目或有审计经验
- 追求高质量项目，而非低价竞争

### 3.2 招聘方端 (Client)
- Web3 项目方、DAO、DeFi 协议
- 需要快速找到可靠的开发资源
- 愿意为质量付费
- 项目预算 > $5,000

---

## 4. 核心功能

### 4.1 准入系统 (Membership)

```
申请流程:
┌─────────────────────────────────────────┐
│  1. 提交申请                             │
│     - GitHub/GitLab 链接                 │
│     - 链上部署历史（合约地址）            │
│     - 过往项目证明                       │
│     - 技能自评                           │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  2. 自动验证                             │
│     - 链上活动验证（部署数、交互数）      │
│     - GitHub 贡献验证                    │
│     - 已有成员推荐加分                   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  3. DAO 审核投票                         │
│     - 现有成员投票                       │
│     - 通过门槛：>66% 赞成                │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  4. 铸造会员 NFT                         │
│     - 质押保证金（可选）                  │
│     - 获得平台准入资格                   │
└─────────────────────────────────────────┘
```

### 4.2 项目管理 (Project Management)

**招聘方流程:**
1. 提交项目需求（描述、预算、时间线、技能要求）
2. 存入 Escrow 保证金（项目总额的 20%）
3. 平台审核项目质量（拒绝低价/不合理项目）
4. 平台匹配并组建团队
5. 里程碑付款制

**开发者流程:**
1. 收到平台邀约
2. 查看项目详情
3. 接受或拒绝（拒绝会记录）
4. 完成里程碑，提交交付物
5. 获得付款和声誉积分

### 4.3 资金托管 (Escrow)

```
项目创建时:
├── Client 存入 100% 项目资金到 Escrow 合约
├── 资金锁定，任何一方无法单独取出
└── 可选：托管期间资金存入 Aave 生息

里程碑完成时:
├── Developer 提交交付物
├── Client 确认验收（或 7 天自动通过）
└── 合约自动释放该里程碑资金

争议时:
├── 任一方发起争议
├── 资金冻结
├── DAO 仲裁投票
└── 按裁决结果分配资金
```

### 4.4 声誉系统 (Reputation SBT)

**Soulbound Token (SBT)** - 不可转让的链上声誉

```
声誉指标:
├── projectsCompleted    // 完成项目数
├── totalEarned          // 累计收入
├── avgRating            // 平均评分 (1-100)
├── onTimeDelivery       // 按时交付率
├── rejectionCount       // 拒绝邀约次数
├── disputesWon          // 仲裁胜利次数
├── disputesLost         // 仲裁失败次数
└── memberSince          // 加入时间

声誉分数计算:
score = (projectsCompleted × 10)
      + (avgRating × 2)
      + (onTimeDelivery × 50)
      - (rejectionCount × 3)
      - (disputesLost × 20)
```

### 4.5 DAO 仲裁 (Dispute Resolution)

```
争议流程:
┌─────────────────────────────────────────┐
│  1. 发起争议                             │
│     - 提交证据（存储在 IPFS）            │
│     - 支付仲裁费（败诉方承担）            │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  2. 证据提交期 (3 天)                    │
│     - 双方提交证据和陈述                 │
│     - 所有证据链上存证                   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  3. 仲裁投票期 (5 天)                    │
│     - 随机选择 5-11 名仲裁员             │
│     - 仲裁员需质押代币                   │
│     - 投票：支持 Client / 支持 Developer │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  4. 执行裁决                             │
│     - 按投票结果分配 Escrow 资金         │
│     - 更新双方声誉                       │
│     - 奖励/惩罚仲裁员                    │
└─────────────────────────────────────────┘
```

### 4.6 防跳单机制

| 机制 | 说明 |
|-----|------|
| **声誉绑定** | 声誉 SBT 只统计平台内项目，跳单 = 不积累声誉 |
| **质押机制** | Developer 质押保证金，违规则罚没 |
| **阶梯费率** | 合作次数越多，平台费率越低（15% → 5%） |
| **持续价值** | Escrow 保护 + 仲裁 + 持续项目流 |

### 4.7 Account Abstraction (可选增强)

- 新用户无需预先持有 ETH
- 平台代付 Gas 费（从项目费用中扣除）
- 批量操作（一键接受邀约 + 签署合约）
- Session Keys（授权常用操作免签名）

---

## 5. 技术架构

### 5.1 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (dApp)                       │
│                    Next.js + wagmi + viem                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Account Abstraction Layer                  │
│                      (ERC-4337 可选)                         │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Membership   │    │    Project    │    │   Escrow      │
│   Contract    │    │    Manager    │    │   Vault       │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Reputation   │    │   Dispute     │    │   Treasury    │
│     SBT       │    │     DAO       │    │   (平台收入)   │
└───────────────┘    └───────────────┘    └───────────────┘
```

### 5.2 智能合约清单

| 合约 | 功能 |
|-----|------|
| `MembershipNFT.sol` | 会员准入凭证，可撤销 |
| `ReputationSBT.sol` | 声誉代币，不可转让 |
| `ProjectManager.sol` | 项目生命周期管理 |
| `EscrowVault.sol` | 资金托管，里程碑释放 |
| `DisputeDAO.sol` | 争议仲裁投票 |
| `Treasury.sol` | 平台收入管理 |
| `PlatformToken.sol` | 治理代币（可选） |

### 5.3 数据存储策略

| 数据类型 | 存储位置 | 原因 |
|---------|---------|------|
| 会员状态 | 链上 | 需要合约验证 |
| 声誉分数 | 链上 | 不可篡改 |
| 项目基本信息 | 链上 | 需要合约交互 |
| 项目详细描述 | IPFS | 内容大，存链上贵 |
| 争议证据 | IPFS | 不可篡改存证 |
| 用户 Profile | IPFS + ENS | 去中心化身份 |

---

## 6. 智能合约设计

### 6.1 MembershipNFT.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract MembershipNFT is ERC721, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct Member {
        uint256 joinedAt;
        uint256 stakedAmount;
        bool isActive;
        string profileURI;      // IPFS hash
        string[] skills;
    }

    mapping(uint256 => Member) public members;
    mapping(address => uint256) public addressToTokenId;

    uint256 public memberCount;
    uint256 public constant MIN_STAKE = 500 * 1e6; // 500 USDC

    IERC20 public stakeToken;

    event MemberAdmitted(address indexed member, uint256 tokenId);
    event MemberRevoked(address indexed member, uint256 tokenId, string reason);
    event StakeSlashed(address indexed member, uint256 amount, string reason);

    constructor(address _stakeToken) ERC721("0xElite Member", "0xE") {
        stakeToken = IERC20(_stakeToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // 申请加入（需要 DAO 批准后调用）
    function admitMember(
        address applicant,
        string calldata profileURI,
        string[] calldata skills
    ) external onlyRole(ADMIN_ROLE) {
        require(balanceOf(applicant) == 0, "Already a member");

        memberCount++;
        uint256 tokenId = memberCount;

        _mint(applicant, tokenId);

        members[tokenId] = Member({
            joinedAt: block.timestamp,
            stakedAmount: 0,
            isActive: true,
            profileURI: profileURI,
            skills: skills
        });

        addressToTokenId[applicant] = tokenId;

        emit MemberAdmitted(applicant, tokenId);
    }

    // 质押保证金
    function stake(uint256 amount) external {
        uint256 tokenId = addressToTokenId[msg.sender];
        require(tokenId != 0, "Not a member");

        stakeToken.transferFrom(msg.sender, address(this), amount);
        members[tokenId].stakedAmount += amount;
    }

    // 撤销会员资格
    function revokeMembership(
        address member,
        string calldata reason
    ) external onlyRole(ADMIN_ROLE) {
        uint256 tokenId = addressToTokenId[member];
        require(tokenId != 0, "Not a member");

        members[tokenId].isActive = false;

        emit MemberRevoked(member, tokenId, reason);
    }

    // 罚没质押（违规时）
    function slashStake(
        address member,
        uint256 amount,
        string calldata reason
    ) external onlyRole(ADMIN_ROLE) {
        uint256 tokenId = addressToTokenId[member];
        require(tokenId != 0, "Not a member");

        Member storage m = members[tokenId];
        uint256 slashAmount = amount > m.stakedAmount ? m.stakedAmount : amount;
        m.stakedAmount -= slashAmount;

        // 罚没的质押金转入 Treasury
        stakeToken.transfer(treasury, slashAmount);

        emit StakeSlashed(member, slashAmount, reason);
    }

    // 禁止转让
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert("Membership is non-transferable");
        }
        return super._update(to, tokenId, auth);
    }

    // 检查是否为活跃会员
    function isActiveMember(address account) external view returns (bool) {
        uint256 tokenId = addressToTokenId[account];
        if (tokenId == 0) return false;
        return members[tokenId].isActive;
    }
}
```

### 6.2 ReputationSBT.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract ReputationSBT is ERC721 {

    struct Reputation {
        uint256 projectsCompleted;
        uint256 totalEarned;
        uint256 totalRatingSum;
        uint256 ratingCount;
        uint256 onTimeDeliveries;
        uint256 lateDeliveries;
        uint256 rejectionCount;
        uint256 disputesWon;
        uint256 disputesLost;
        uint256 lastUpdated;
    }

    mapping(uint256 => Reputation) public reputations;
    mapping(address => uint256) public addressToTokenId;

    address public projectManager;
    address public disputeDAO;

    modifier onlyAuthorized() {
        require(
            msg.sender == projectManager || msg.sender == disputeDAO,
            "Not authorized"
        );
        _;
    }

    constructor() ERC721("0xElite Proof", "0xPROOF") {}

    // 会员加入时铸造
    function mint(address member) external {
        uint256 tokenId = uint256(uint160(member));
        _mint(member, tokenId);
        addressToTokenId[member] = tokenId;
        reputations[tokenId].lastUpdated = block.timestamp;
    }

    // 项目完成时更新
    function recordProjectCompletion(
        address developer,
        uint256 earned,
        uint256 rating,      // 1-100
        bool onTime
    ) external onlyAuthorized {
        uint256 tokenId = addressToTokenId[developer];
        require(tokenId != 0, "No reputation token");

        Reputation storage rep = reputations[tokenId];
        rep.projectsCompleted++;
        rep.totalEarned += earned;
        rep.totalRatingSum += rating;
        rep.ratingCount++;

        if (onTime) {
            rep.onTimeDeliveries++;
        } else {
            rep.lateDeliveries++;
        }

        rep.lastUpdated = block.timestamp;
    }

    // 记录拒绝邀约
    function recordRejection(address developer) external onlyAuthorized {
        uint256 tokenId = addressToTokenId[developer];
        require(tokenId != 0, "No reputation token");

        reputations[tokenId].rejectionCount++;
        reputations[tokenId].lastUpdated = block.timestamp;
    }

    // 记录仲裁结果
    function recordDisputeResult(
        address developer,
        bool won
    ) external onlyAuthorized {
        uint256 tokenId = addressToTokenId[developer];
        require(tokenId != 0, "No reputation token");

        if (won) {
            reputations[tokenId].disputesWon++;
        } else {
            reputations[tokenId].disputesLost++;
        }
        reputations[tokenId].lastUpdated = block.timestamp;
    }

    // 计算综合声誉分数
    function getReputationScore(address developer) external view returns (uint256) {
        uint256 tokenId = addressToTokenId[developer];
        if (tokenId == 0) return 0;

        Reputation memory rep = reputations[tokenId];

        // 平均评分
        uint256 avgRating = rep.ratingCount > 0
            ? rep.totalRatingSum / rep.ratingCount
            : 50;

        // 按时交付率 (0-100)
        uint256 totalDeliveries = rep.onTimeDeliveries + rep.lateDeliveries;
        uint256 onTimeRate = totalDeliveries > 0
            ? (rep.onTimeDeliveries * 100) / totalDeliveries
            : 100;

        // 计算分数
        uint256 score = (rep.projectsCompleted * 10)
                      + (avgRating * 2)
                      + onTimeRate
                      + (rep.disputesWon * 5);

        // 减分项
        if (score > rep.rejectionCount * 3) {
            score -= rep.rejectionCount * 3;
        } else {
            score = 0;
        }

        if (score > rep.disputesLost * 20) {
            score -= rep.disputesLost * 20;
        } else {
            score = 0;
        }

        return score;
    }

    // 禁止转让 (Soulbound)
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert("Soulbound: non-transferable");
        }
        return super._update(to, tokenId, auth);
    }
}
```

### 6.3 ProjectManager.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ProjectManager {

    enum ProjectStatus {
        Pending,        // 等待审核
        Approved,       // 审核通过，等待组队
        InProgress,     // 进行中
        UnderReview,    // 里程碑审核中
        Completed,      // 已完成
        Disputed,       // 争议中
        Cancelled       // 已取消
    }

    struct Milestone {
        string description;
        uint256 amount;
        uint256 deadline;
        bool submitted;
        bool approved;
        uint256 submittedAt;
        string deliverableURI;  // IPFS
    }

    struct Project {
        uint256 id;
        address client;
        address[] developers;
        string title;
        string descriptionURI;      // IPFS
        uint256 totalBudget;
        uint256 releasedAmount;
        ProjectStatus status;
        Milestone[] milestones;
        uint256 createdAt;
        uint256 startedAt;
    }

    mapping(uint256 => Project) public projects;
    uint256 public projectCount;

    uint256 public constant PLATFORM_FEE = 1000; // 10% (basis points)
    uint256 public constant AUTO_APPROVE_DELAY = 7 days;

    IMembershipNFT public membership;
    IEscrowVault public escrow;
    IReputationSBT public reputation;

    event ProjectCreated(uint256 indexed projectId, address indexed client);
    event ProjectApproved(uint256 indexed projectId);
    event TeamAssigned(uint256 indexed projectId, address[] developers);
    event InvitationSent(uint256 indexed projectId, address indexed developer);
    event InvitationAccepted(uint256 indexed projectId, address indexed developer);
    event InvitationRejected(uint256 indexed projectId, address indexed developer);
    event MilestoneSubmitted(uint256 indexed projectId, uint256 milestoneIndex);
    event MilestoneApproved(uint256 indexed projectId, uint256 milestoneIndex);
    event ProjectCompleted(uint256 indexed projectId);

    // Client 创建项目
    function createProject(
        string calldata title,
        string calldata descriptionURI,
        Milestone[] calldata milestones
    ) external payable returns (uint256) {
        uint256 totalBudget = 0;
        for (uint i = 0; i < milestones.length; i++) {
            totalBudget += milestones[i].amount;
        }

        require(msg.value >= totalBudget, "Insufficient deposit");

        projectCount++;
        uint256 projectId = projectCount;

        Project storage p = projects[projectId];
        p.id = projectId;
        p.client = msg.sender;
        p.title = title;
        p.descriptionURI = descriptionURI;
        p.totalBudget = totalBudget;
        p.status = ProjectStatus.Pending;
        p.createdAt = block.timestamp;

        for (uint i = 0; i < milestones.length; i++) {
            p.milestones.push(milestones[i]);
        }

        // 存入 Escrow
        escrow.deposit{value: msg.value}(projectId);

        emit ProjectCreated(projectId, msg.sender);
        return projectId;
    }

    // 平台审核通过项目
    function approveProject(uint256 projectId) external onlyAdmin {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Pending, "Not pending");

        p.status = ProjectStatus.Approved;
        emit ProjectApproved(projectId);
    }

    // 平台分配团队
    function assignTeam(
        uint256 projectId,
        address[] calldata developers
    ) external onlyAdmin {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.Approved, "Not approved");

        for (uint i = 0; i < developers.length; i++) {
            require(
                membership.isActiveMember(developers[i]),
                "Not an active member"
            );
            emit InvitationSent(projectId, developers[i]);
        }

        // 等待开发者接受邀请...
    }

    // Developer 接受邀请
    function acceptInvitation(uint256 projectId) external {
        require(membership.isActiveMember(msg.sender), "Not a member");

        Project storage p = projects[projectId];
        p.developers.push(msg.sender);

        emit InvitationAccepted(projectId, msg.sender);

        // 如果团队组建完成，开始项目
        if (p.developers.length >= requiredTeamSize[projectId]) {
            p.status = ProjectStatus.InProgress;
            p.startedAt = block.timestamp;
            emit TeamAssigned(projectId, p.developers);
        }
    }

    // Developer 拒绝邀请
    function rejectInvitation(uint256 projectId) external {
        require(membership.isActiveMember(msg.sender), "Not a member");

        // 记录拒绝
        reputation.recordRejection(msg.sender);

        emit InvitationRejected(projectId, msg.sender);
    }

    // Developer 提交里程碑
    function submitMilestone(
        uint256 projectId,
        uint256 milestoneIndex,
        string calldata deliverableURI
    ) external {
        Project storage p = projects[projectId];
        require(p.status == ProjectStatus.InProgress, "Not in progress");
        require(_isDeveloper(projectId, msg.sender), "Not a developer");

        Milestone storage m = p.milestones[milestoneIndex];
        require(!m.submitted, "Already submitted");

        m.submitted = true;
        m.submittedAt = block.timestamp;
        m.deliverableURI = deliverableURI;

        p.status = ProjectStatus.UnderReview;

        emit MilestoneSubmitted(projectId, milestoneIndex);
    }

    // Client 批准里程碑
    function approveMilestone(
        uint256 projectId,
        uint256 milestoneIndex,
        uint256 rating  // 1-100
    ) external {
        Project storage p = projects[projectId];
        require(msg.sender == p.client, "Not client");
        require(p.status == ProjectStatus.UnderReview, "Not under review");

        Milestone storage m = p.milestones[milestoneIndex];
        require(m.submitted, "Not submitted");
        require(!m.approved, "Already approved");

        m.approved = true;

        // 计算平台费用
        uint256 platformFee = (m.amount * PLATFORM_FEE) / 10000;
        uint256 developerAmount = m.amount - platformFee;

        // 释放资金
        escrow.release(projectId, p.developers, developerAmount);
        escrow.releaseFee(projectId, platformFee);

        p.releasedAmount += m.amount;

        // 更新声誉
        bool onTime = block.timestamp <= m.deadline;
        for (uint i = 0; i < p.developers.length; i++) {
            reputation.recordProjectCompletion(
                p.developers[i],
                developerAmount / p.developers.length,
                rating,
                onTime
            );
        }

        // 检查是否所有里程碑都完成
        if (_allMilestonesCompleted(projectId)) {
            p.status = ProjectStatus.Completed;
            emit ProjectCompleted(projectId);
        } else {
            p.status = ProjectStatus.InProgress;
        }

        emit MilestoneApproved(projectId, milestoneIndex);
    }

    // 超时自动批准
    function claimMilestoneAfterTimeout(
        uint256 projectId,
        uint256 milestoneIndex
    ) external {
        Project storage p = projects[projectId];
        Milestone storage m = p.milestones[milestoneIndex];

        require(m.submitted, "Not submitted");
        require(!m.approved, "Already approved");
        require(
            block.timestamp > m.submittedAt + AUTO_APPROVE_DELAY,
            "Timeout not reached"
        );

        // 自动批准，默认 80 分
        m.approved = true;
        // ... 释放资金逻辑同上
    }

    // 内部函数
    function _isDeveloper(uint256 projectId, address account) internal view returns (bool) {
        address[] memory devs = projects[projectId].developers;
        for (uint i = 0; i < devs.length; i++) {
            if (devs[i] == account) return true;
        }
        return false;
    }

    function _allMilestonesCompleted(uint256 projectId) internal view returns (bool) {
        Milestone[] memory milestones = projects[projectId].milestones;
        for (uint i = 0; i < milestones.length; i++) {
            if (!milestones[i].approved) return false;
        }
        return true;
    }
}
```

### 6.4 EscrowVault.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EscrowVault {

    struct EscrowInfo {
        uint256 projectId;
        address client;
        uint256 totalAmount;
        uint256 releasedAmount;
        bool disputed;
    }

    mapping(uint256 => EscrowInfo) public escrows;

    address public projectManager;
    address public disputeDAO;
    address public treasury;

    modifier onlyProjectManager() {
        require(msg.sender == projectManager, "Not authorized");
        _;
    }

    modifier onlyDisputeDAO() {
        require(msg.sender == disputeDAO, "Not authorized");
        _;
    }

    // 存入资金
    function deposit(uint256 projectId) external payable onlyProjectManager {
        escrows[projectId] = EscrowInfo({
            projectId: projectId,
            client: tx.origin,
            totalAmount: msg.value,
            releasedAmount: 0,
            disputed: false
        });
    }

    // 释放资金给开发者
    function release(
        uint256 projectId,
        address[] calldata developers,
        uint256 amount
    ) external onlyProjectManager {
        EscrowInfo storage e = escrows[projectId];
        require(!e.disputed, "Project is disputed");
        require(e.releasedAmount + amount <= e.totalAmount, "Exceeds escrow");

        e.releasedAmount += amount;

        uint256 perDeveloper = amount / developers.length;
        for (uint i = 0; i < developers.length; i++) {
            payable(developers[i]).transfer(perDeveloper);
        }
    }

    // 释放平台费用
    function releaseFee(uint256 projectId, uint256 amount) external onlyProjectManager {
        payable(treasury).transfer(amount);
    }

    // 冻结（争议时）
    function freeze(uint256 projectId) external onlyDisputeDAO {
        escrows[projectId].disputed = true;
    }

    // 争议解决后分配
    function resolveDispute(
        uint256 projectId,
        address[] calldata developers,
        uint256 clientShare,
        uint256 developerShare
    ) external onlyDisputeDAO {
        EscrowInfo storage e = escrows[projectId];
        require(e.disputed, "Not disputed");

        uint256 remaining = e.totalAmount - e.releasedAmount;
        require(clientShare + developerShare <= remaining, "Exceeds remaining");

        if (clientShare > 0) {
            payable(e.client).transfer(clientShare);
        }

        if (developerShare > 0) {
            uint256 perDeveloper = developerShare / developers.length;
            for (uint i = 0; i < developers.length; i++) {
                payable(developers[i]).transfer(perDeveloper);
            }
        }

        e.releasedAmount = e.totalAmount;
        e.disputed = false;
    }
}
```

### 6.5 DisputeDAO.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DisputeDAO {

    enum DisputeStatus { Open, Voting, Resolved }
    enum Vote { None, Client, Developer }

    struct Dispute {
        uint256 projectId;
        address initiator;
        string clientEvidenceURI;
        string developerEvidenceURI;
        uint256 evidenceDeadline;
        uint256 votingDeadline;
        uint256 clientVotes;
        uint256 developerVotes;
        DisputeStatus status;
        address[] arbiters;
        mapping(address => Vote) votes;
    }

    mapping(uint256 => Dispute) public disputes;
    uint256 public disputeCount;

    uint256 public constant EVIDENCE_PERIOD = 3 days;
    uint256 public constant VOTING_PERIOD = 5 days;
    uint256 public constant MIN_ARBITERS = 5;
    uint256 public constant ARBITER_STAKE = 100 * 1e6; // 100 USDC

    IProjectManager public projectManager;
    IEscrowVault public escrow;
    IReputationSBT public reputation;
    IMembershipNFT public membership;
    IERC20 public stakeToken;

    event DisputeCreated(uint256 indexed disputeId, uint256 indexed projectId);
    event EvidenceSubmitted(uint256 indexed disputeId, bool isClient, string uri);
    event VotingStarted(uint256 indexed disputeId);
    event VoteCast(uint256 indexed disputeId, address arbiter, Vote vote);
    event DisputeResolved(uint256 indexed disputeId, bool clientWon);

    // 发起争议
    function createDispute(
        uint256 projectId,
        string calldata evidenceURI
    ) external returns (uint256) {
        // 验证发起人是项目参与方
        (address client, address[] memory developers) = projectManager.getProjectParties(projectId);
        bool isClient = msg.sender == client;
        bool isDeveloper = _contains(developers, msg.sender);
        require(isClient || isDeveloper, "Not a party");

        disputeCount++;
        uint256 disputeId = disputeCount;

        Dispute storage d = disputes[disputeId];
        d.projectId = projectId;
        d.initiator = msg.sender;
        d.evidenceDeadline = block.timestamp + EVIDENCE_PERIOD;
        d.status = DisputeStatus.Open;

        if (isClient) {
            d.clientEvidenceURI = evidenceURI;
        } else {
            d.developerEvidenceURI = evidenceURI;
        }

        // 冻结 Escrow
        escrow.freeze(projectId);

        emit DisputeCreated(disputeId, projectId);
        return disputeId;
    }

    // 提交证据
    function submitEvidence(
        uint256 disputeId,
        string calldata evidenceURI
    ) external {
        Dispute storage d = disputes[disputeId];
        require(d.status == DisputeStatus.Open, "Not open");
        require(block.timestamp < d.evidenceDeadline, "Evidence period ended");

        (address client, address[] memory developers) = projectManager.getProjectParties(d.projectId);

        if (msg.sender == client) {
            d.clientEvidenceURI = evidenceURI;
            emit EvidenceSubmitted(disputeId, true, evidenceURI);
        } else if (_contains(developers, msg.sender)) {
            d.developerEvidenceURI = evidenceURI;
            emit EvidenceSubmitted(disputeId, false, evidenceURI);
        } else {
            revert("Not a party");
        }
    }

    // 开始投票（证据期结束后）
    function startVoting(uint256 disputeId) external {
        Dispute storage d = disputes[disputeId];
        require(d.status == DisputeStatus.Open, "Not open");
        require(block.timestamp >= d.evidenceDeadline, "Evidence period not ended");

        // 随机选择仲裁员（简化版，实际应使用 VRF）
        d.arbiters = _selectArbiters(d.projectId, MIN_ARBITERS);
        d.votingDeadline = block.timestamp + VOTING_PERIOD;
        d.status = DisputeStatus.Voting;

        emit VotingStarted(disputeId);
    }

    // 仲裁员投票
    function vote(uint256 disputeId, Vote _vote) external {
        Dispute storage d = disputes[disputeId];
        require(d.status == DisputeStatus.Voting, "Not voting");
        require(block.timestamp < d.votingDeadline, "Voting ended");
        require(_contains(d.arbiters, msg.sender), "Not an arbiter");
        require(d.votes[msg.sender] == Vote.None, "Already voted");
        require(_vote != Vote.None, "Invalid vote");

        // 质押
        stakeToken.transferFrom(msg.sender, address(this), ARBITER_STAKE);

        d.votes[msg.sender] = _vote;

        if (_vote == Vote.Client) {
            d.clientVotes++;
        } else {
            d.developerVotes++;
        }

        emit VoteCast(disputeId, msg.sender, _vote);
    }

    // 执行裁决
    function executeResolution(uint256 disputeId) external {
        Dispute storage d = disputes[disputeId];
        require(d.status == DisputeStatus.Voting, "Not voting");
        require(block.timestamp >= d.votingDeadline, "Voting not ended");

        bool clientWon = d.clientVotes > d.developerVotes;

        // 分配 Escrow 资金
        (address client, address[] memory developers) = projectManager.getProjectParties(d.projectId);

        if (clientWon) {
            // Client 胜：退还剩余资金给 Client
            escrow.resolveDispute(d.projectId, developers, type(uint256).max, 0);

            // 更新开发者声誉
            for (uint i = 0; i < developers.length; i++) {
                reputation.recordDisputeResult(developers[i], false);
            }
        } else {
            // Developer 胜：释放资金给开发者
            escrow.resolveDispute(d.projectId, developers, 0, type(uint256).max);

            // 更新开发者声誉
            for (uint i = 0; i < developers.length; i++) {
                reputation.recordDisputeResult(developers[i], true);
            }
        }

        // 奖励/惩罚仲裁员
        _settleArbiters(disputeId, clientWon);

        d.status = DisputeStatus.Resolved;

        emit DisputeResolved(disputeId, clientWon);
    }

    // 结算仲裁员质押
    function _settleArbiters(uint256 disputeId, bool clientWon) internal {
        Dispute storage d = disputes[disputeId];
        Vote winningVote = clientWon ? Vote.Client : Vote.Developer;

        uint256 totalSlashed = 0;
        uint256 winnerCount = 0;

        // 统计
        for (uint i = 0; i < d.arbiters.length; i++) {
            address arbiter = d.arbiters[i];
            if (d.votes[arbiter] == winningVote) {
                winnerCount++;
            } else if (d.votes[arbiter] != Vote.None) {
                totalSlashed += ARBITER_STAKE;
            }
        }

        // 分配
        uint256 reward = winnerCount > 0 ? totalSlashed / winnerCount : 0;

        for (uint i = 0; i < d.arbiters.length; i++) {
            address arbiter = d.arbiters[i];
            if (d.votes[arbiter] == winningVote) {
                // 返还质押 + 奖励
                stakeToken.transfer(arbiter, ARBITER_STAKE + reward);
            }
            // 投错的质押已被没收，不返还
        }
    }

    function _contains(address[] memory arr, address addr) internal pure returns (bool) {
        for (uint i = 0; i < arr.length; i++) {
            if (arr[i] == addr) return true;
        }
        return false;
    }

    function _selectArbiters(uint256 projectId, uint256 count) internal view returns (address[] memory) {
        // 简化版：实际应使用 Chainlink VRF 随机选择
        // 排除项目参与方
        // 选择声誉分数高的成员
        // ...
    }
}
```

---

## 7. 费率结构

### 7.1 平台费用

| 合作次数 | 平台费率 |
|---------|---------|
| 首次合作 | 15% |
| 2-5 次 | 10% |
| 6-10 次 | 7% |
| 11+ 次 | 5% |

### 7.2 其他费用

| 费用类型 | 金额 | 说明 |
|---------|------|------|
| Developer 质押 | 500 USDC | 可退还（无违规时） |
| 仲裁费 | 50 USDC | 败诉方承担 |
| 仲裁员质押 | 100 USDC | 投票正确则返还+奖励 |

---

## 8. 开发计划

### Phase 1: 核心合约 (Week 1-2)
- [ ] MembershipNFT.sol
- [ ] ReputationSBT.sol
- [ ] 单元测试

### Phase 2: 项目管理 (Week 3-4)
- [ ] ProjectManager.sol
- [ ] EscrowVault.sol
- [ ] 集成测试

### Phase 3: 争议仲裁 (Week 5-6)
- [ ] DisputeDAO.sol
- [ ] 仲裁流程测试
- [ ] Echidna 模糊测试

### Phase 4: 前端 + 集成 (Week 7-8)
- [ ] 前端 dApp (Next.js)
- [ ] 合约部署（测试网）
- [ ] 端到端测试

### Phase 5: 优化 + 文档 (Week 9-10)
- [ ] Gas 优化
- [ ] 安全审计（自查）
- [ ] 文档完善
- [ ] Demo 准备

---

## 9. 技术栈

| 层级 | 技术 |
|-----|------|
| 智能合约 | Solidity 0.8.20+, Hardhat/Foundry |
| 合约库 | OpenZeppelin |
| 测试 | Hardhat Test, Foundry Fuzz, Echidna |
| 前端 | Next.js 14, TypeScript |
| Web3 交互 | wagmi, viem |
| 样式 | Tailwind CSS |
| 存储 | IPFS (Pinata) |
| 部署网络 | Sepolia (测试), Arbitrum/Base (主网) |

---

## 10. 风险与应对

| 风险 | 应对措施 |
|-----|---------|
| 冷启动（无开发者/无项目） | Capstone 不需要解决，专注技术实现 |
| 合约安全漏洞 | 充分测试 + Echidna + Slither |
| Gas 费用过高 | 部署到 L2 (Arbitrum/Base) |
| 跳单 | 声誉绑定 + 质押 + 阶梯费率 |
| 仲裁不公正 | 随机选择仲裁员 + 质押惩罚机制 |

---

## 11. 成功指标（Capstone 评估）

| 维度 | 展示内容 |
|-----|---------|
| 智能合约能力 | 复杂合约设计、权限控制、状态机 |
| 安全意识 | 测试覆盖、Echidna 模糊测试 |
| 架构设计 | 模块化、可升级性考虑 |
| 前沿技术 | SBT、DAO 治理 |
| 系统思维 | 激励机制、边界情况处理 |
| 文档能力 | 清晰的架构文档、代码注释 |

---

## 12. 参考资料

- [ERC-721](https://eips.ethereum.org/EIPS/eip-721) - NFT 标准
- [EIP-5192](https://eips.ethereum.org/EIPS/eip-5192) - Soulbound Token
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Toptal](https://www.toptal.com/) - 商业模式参考
- [LaborX](https://laborx.com/) - Web3 平台参考

---

*Document Version: 1.1*
*Last Updated: 2026-01-20*
*Project renamed to 0xElite*
