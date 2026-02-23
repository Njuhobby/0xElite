const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("DisputeDAO", function () {
  const PROJECT_BUDGET = ethers.parseUnits("10000", 6); // 10,000 USDC
  const ARBITRATION_FEE = ethers.parseUnits("50", 6); // 50 USDC
  const EVIDENCE_PERIOD = 3 * 24 * 60 * 60; // 3 days
  const VOTING_PERIOD = 5 * 24 * 60 * 60; // 5 days
  const PROJECT_ID = 0;

  async function deployDisputeDAOFixture() {
    const [owner, client, developer, treasury, voter1, voter2, voter3, other] =
      await ethers.getSigners();

    // Deploy MockUSDC (not upgradeable)
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy EliteToken via proxy
    const EliteToken = await ethers.getContractFactory("EliteToken");
    const eliteToken = await upgrades.deployProxy(EliteToken, [], {
      kind: "uups",
    });
    await eliteToken.waitForDeployment();

    // Deploy ProjectManager via proxy
    const ProjectManager = await ethers.getContractFactory("ProjectManager");
    const projectManager = await upgrades.deployProxy(
      ProjectManager,
      [owner.address],
      { kind: "uups" }
    );
    await projectManager.waitForDeployment();

    // Deploy EscrowVault via proxy
    const EscrowVault = await ethers.getContractFactory("EscrowVault");
    const escrowVault = await upgrades.deployProxy(
      EscrowVault,
      [await usdc.getAddress(), treasury.address],
      { kind: "uups" }
    );
    await escrowVault.waitForDeployment();

    // Deploy DisputeDAO via proxy
    const DisputeDAO = await ethers.getContractFactory("DisputeDAO");
    const disputeDAO = await upgrades.deployProxy(
      DisputeDAO,
      [
        await usdc.getAddress(),
        await eliteToken.getAddress(),
        await escrowVault.getAddress(),
        await projectManager.getAddress(),
        treasury.address,
      ],
      { kind: "uups" }
    );
    await disputeDAO.waitForDeployment();

    // Wire up contracts
    await escrowVault.setProjectManager(await projectManager.getAddress());
    await escrowVault.setDisputeDAO(await disputeDAO.getAddress());

    return {
      usdc,
      eliteToken,
      projectManager,
      escrowVault,
      disputeDAO,
      owner,
      client,
      developer,
      treasury,
      voter1,
      voter2,
      voter3,
      other,
    };
  }

  /**
   * Helper: create a project, assign developer, deposit escrow
   */
  async function setupProject(fixtures) {
    const { usdc, projectManager, escrowVault, owner, client, developer } =
      fixtures;

    // Create project
    await projectManager.connect(client).createProject(PROJECT_BUDGET);

    // Assign developer (owner-only)
    await projectManager
      .connect(owner)
      .assignDeveloper(PROJECT_ID, developer.address);

    // Client deposits escrow
    await usdc.mint(client.address, PROJECT_BUDGET);
    await usdc
      .connect(client)
      .approve(await escrowVault.getAddress(), PROJECT_BUDGET);
    await escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET);
  }

  /**
   * Helper: set up voters with EliteToken voting power and delegation
   */
  async function setupVoters(fixtures) {
    const { eliteToken, voter1, voter2, voter3 } = fixtures;

    const vp1 = ethers.parseUnits("1000", 6);
    const vp2 = ethers.parseUnits("800", 6);
    const vp3 = ethers.parseUnits("600", 6);

    // Mint voting tokens
    await eliteToken.mint(voter1.address, vp1);
    await eliteToken.mint(voter2.address, vp2);
    await eliteToken.mint(voter3.address, vp3);

    // Self-delegate to activate voting power
    await eliteToken.connect(voter1).delegate(voter1.address);
    await eliteToken.connect(voter2).delegate(voter2.address);
    await eliteToken.connect(voter3).delegate(voter3.address);

    return { vp1, vp2, vp3 };
  }

  /**
   * Helper: create a dispute and return the dispute ID
   */
  async function createTestDispute(fixtures) {
    const { usdc, disputeDAO, client } = fixtures;

    // Approve arbitration fee
    await usdc.mint(client.address, ARBITRATION_FEE);
    await usdc
      .connect(client)
      .approve(await disputeDAO.getAddress(), ARBITRATION_FEE);

    // Create dispute
    const tx = await disputeDAO
      .connect(client)
      .createDispute(PROJECT_ID, "ipfs://client-evidence-hash");
    await tx.wait();

    return 1; // First dispute is ID 1
  }

  // =========================================================================
  // Deployment & Initialization
  // =========================================================================

  describe("Deployment & Initialization", function () {
    it("Should set correct contract references", async function () {
      const { usdc, eliteToken, escrowVault, projectManager, disputeDAO } =
        await loadFixture(deployDisputeDAOFixture);

      expect(await disputeDAO.usdc()).to.equal(await usdc.getAddress());
      expect(await disputeDAO.eliteToken()).to.equal(
        await eliteToken.getAddress()
      );
      expect(await disputeDAO.escrowVault()).to.equal(
        await escrowVault.getAddress()
      );
      expect(await disputeDAO.projectManager()).to.equal(
        await projectManager.getAddress()
      );
    });

    it("Should set correct default parameters", async function () {
      const { disputeDAO, treasury } = await loadFixture(
        deployDisputeDAOFixture
      );

      expect(await disputeDAO.evidencePeriod()).to.equal(EVIDENCE_PERIOD);
      expect(await disputeDAO.votingPeriod()).to.equal(VOTING_PERIOD);
      expect(await disputeDAO.arbitrationFee()).to.equal(ARBITRATION_FEE);
      expect(await disputeDAO.quorumNumerator()).to.equal(25);
      expect(await disputeDAO.treasury()).to.equal(treasury.address);
    });

    it("Should start with zero disputes", async function () {
      const { disputeDAO } = await loadFixture(deployDisputeDAOFixture);
      expect(await disputeDAO.disputeCount()).to.equal(0);
    });

    it("Should return version 1.0.0", async function () {
      const { disputeDAO } = await loadFixture(deployDisputeDAOFixture);
      expect(await disputeDAO.version()).to.equal("1.0.0");
    });

    it("Should revert initialization with zero addresses", async function () {
      const DisputeDAO = await ethers.getContractFactory("DisputeDAO");

      await expect(
        upgrades.deployProxy(
          DisputeDAO,
          [
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
          ],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(DisputeDAO, "InvalidAddress");
    });

    it("Should not allow re-initialization", async function () {
      const { disputeDAO, usdc, eliteToken, escrowVault, projectManager, treasury } =
        await loadFixture(deployDisputeDAOFixture);

      await expect(
        disputeDAO.initialize(
          await usdc.getAddress(),
          await eliteToken.getAddress(),
          await escrowVault.getAddress(),
          await projectManager.getAddress(),
          treasury.address
        )
      ).to.be.reverted;
    });
  });

  // =========================================================================
  // Phase 1: Dispute Creation
  // =========================================================================

  describe("Dispute Creation", function () {
    it("Should allow client to create a dispute", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);

      const { usdc, disputeDAO, client } = fixtures;

      await usdc.mint(client.address, ARBITRATION_FEE);
      await usdc
        .connect(client)
        .approve(await disputeDAO.getAddress(), ARBITRATION_FEE);

      await expect(
        disputeDAO
          .connect(client)
          .createDispute(PROJECT_ID, "ipfs://client-evidence")
      )
        .to.emit(disputeDAO, "DisputeCreated")
        .withArgs(1, PROJECT_ID, client.address);

      expect(await disputeDAO.disputeCount()).to.equal(1);
    });

    it("Should allow developer to create a dispute", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);

      const { usdc, disputeDAO, developer } = fixtures;

      await usdc.mint(developer.address, ARBITRATION_FEE);
      await usdc
        .connect(developer)
        .approve(await disputeDAO.getAddress(), ARBITRATION_FEE);

      await expect(
        disputeDAO
          .connect(developer)
          .createDispute(PROJECT_ID, "ipfs://dev-evidence")
      )
        .to.emit(disputeDAO, "DisputeCreated")
        .withArgs(1, PROJECT_ID, developer.address);
    });

    it("Should freeze escrow when dispute is created", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await createTestDispute(fixtures);

      const { escrowVault } = fixtures;
      const escrowInfo = await escrowVault.getEscrowInfo(PROJECT_ID);
      expect(escrowInfo.disputed).to.be.true;
    });

    it("Should transfer arbitration fee from initiator", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);

      const { usdc, disputeDAO, client } = fixtures;

      await usdc.mint(client.address, ARBITRATION_FEE);
      await usdc
        .connect(client)
        .approve(await disputeDAO.getAddress(), ARBITRATION_FEE);

      const balanceBefore = await usdc.balanceOf(client.address);
      await disputeDAO
        .connect(client)
        .createDispute(PROJECT_ID, "ipfs://evidence");
      const balanceAfter = await usdc.balanceOf(client.address);

      expect(balanceBefore - balanceAfter).to.equal(ARBITRATION_FEE);
    });

    it("Should store correct dispute data via getDisputeCore", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, client, developer } = fixtures;

      const core = await disputeDAO.getDisputeCore(1);
      expect(core.projectId).to.equal(PROJECT_ID);
      expect(core.client).to.equal(client.address);
      expect(core.developer).to.equal(developer.address);
      expect(core.initiator).to.equal(client.address);
      expect(core.status).to.equal(0); // DisputeStatus.Open
      expect(core.resolvedByOwner).to.be.false;
      expect(core.clientWon).to.be.false;
      expect(core._arbitrationFee).to.equal(ARBITRATION_FEE);
    });

    it("Should store client evidence when client initiates", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO } = fixtures;

      const timeline = await disputeDAO.getDisputeTimeline(1);
      expect(timeline.clientEvidenceURI).to.equal(
        "ipfs://client-evidence-hash"
      );
      expect(timeline.developerEvidenceURI).to.equal("");
    });

    it("Should revert if non-party tries to create dispute", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);

      const { usdc, disputeDAO, other } = fixtures;

      await usdc.mint(other.address, ARBITRATION_FEE);
      await usdc
        .connect(other)
        .approve(await disputeDAO.getAddress(), ARBITRATION_FEE);

      await expect(
        disputeDAO
          .connect(other)
          .createDispute(PROJECT_ID, "ipfs://evidence")
      ).to.be.revertedWithCustomError(disputeDAO, "NotProjectParty");
    });

    it("Should revert if dispute already exists for project", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await createTestDispute(fixtures);

      const { usdc, disputeDAO, developer } = fixtures;

      await usdc.mint(developer.address, ARBITRATION_FEE);
      await usdc
        .connect(developer)
        .approve(await disputeDAO.getAddress(), ARBITRATION_FEE);

      await expect(
        disputeDAO
          .connect(developer)
          .createDispute(PROJECT_ID, "ipfs://evidence")
      ).to.be.revertedWithCustomError(disputeDAO, "DisputeAlreadyExists");
    });
  });

  // =========================================================================
  // Phase 2: Evidence Submission
  // =========================================================================

  describe("Evidence Submission", function () {
    it("Should allow developer to submit evidence", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, developer } = fixtures;

      await expect(
        disputeDAO
          .connect(developer)
          .submitEvidence(1, "ipfs://dev-evidence-hash")
      )
        .to.emit(disputeDAO, "EvidenceSubmitted")
        .withArgs(1, developer.address, "ipfs://dev-evidence-hash");

      const timeline = await disputeDAO.getDisputeTimeline(1);
      expect(timeline.developerEvidenceURI).to.equal(
        "ipfs://dev-evidence-hash"
      );
    });

    it("Should allow client to update evidence", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, client } = fixtures;

      await disputeDAO
        .connect(client)
        .submitEvidence(1, "ipfs://updated-client-evidence");

      const timeline = await disputeDAO.getDisputeTimeline(1);
      expect(timeline.clientEvidenceURI).to.equal(
        "ipfs://updated-client-evidence"
      );
    });

    it("Should revert if non-party submits evidence", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, other } = fixtures;

      await expect(
        disputeDAO.connect(other).submitEvidence(1, "ipfs://bad-evidence")
      ).to.be.revertedWithCustomError(disputeDAO, "NotProjectParty");
    });

    it("Should revert if evidence period has ended", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, developer } = fixtures;

      // Fast-forward past evidence deadline
      await time.increase(EVIDENCE_PERIOD + 1);

      await expect(
        disputeDAO
          .connect(developer)
          .submitEvidence(1, "ipfs://late-evidence")
      ).to.be.revertedWithCustomError(disputeDAO, "EvidencePeriodEnded");
    });
  });

  // =========================================================================
  // Phase 2→3: Start Voting
  // =========================================================================

  describe("Start Voting", function () {
    it("Should transition to voting after evidence period", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, other } = fixtures;

      // Fast-forward past evidence deadline
      await time.increase(EVIDENCE_PERIOD + 1);

      await expect(disputeDAO.connect(other).startVoting(1)).to.emit(
        disputeDAO,
        "VotingStarted"
      );

      const core = await disputeDAO.getDisputeCore(1);
      expect(core.status).to.equal(1); // DisputeStatus.Voting
    });

    it("Should set voting snapshot and deadline", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO } = fixtures;

      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      const timeline = await disputeDAO.getDisputeTimeline(1);
      expect(timeline.votingSnapshot).to.be.gt(0);
      expect(timeline.votingDeadline).to.be.gt(timeline.votingSnapshot);
    });

    it("Should capture total supply snapshot", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      const { vp1, vp2, vp3 } = await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO } = fixtures;

      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      const voting = await disputeDAO.getDisputeVoting(1);
      expect(voting.snapshotTotalSupply).to.equal(vp1 + vp2 + vp3);
    });

    it("Should revert if evidence period not ended", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO } = fixtures;

      await expect(
        disputeDAO.startVoting(1)
      ).to.be.revertedWithCustomError(
        disputeDAO,
        "EvidencePeriodNotEnded"
      );
    });

    it("Should revert if dispute is not in Open status", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO } = fixtures;

      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      // Try to start voting again
      await expect(
        disputeDAO.startVoting(1)
      ).to.be.revertedWithCustomError(disputeDAO, "InvalidDisputeStatus");
    });
  });

  // =========================================================================
  // Phase 3: Voting
  // =========================================================================

  describe("Voting", function () {
    async function setupVotingPhase(fixtures) {
      await setupProject(fixtures);
      const votingPower = await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO } = fixtures;

      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      return votingPower;
    }

    it("Should allow voter to cast vote for client", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      const { vp1 } = await setupVotingPhase(fixtures);

      const { disputeDAO, voter1 } = fixtures;

      await expect(disputeDAO.connect(voter1).castVote(1, true))
        .to.emit(disputeDAO, "VoteCast")
        .withArgs(1, voter1.address, true, vp1);

      const voting = await disputeDAO.getDisputeVoting(1);
      expect(voting.clientVoteWeight).to.equal(vp1);
      expect(voting.developerVoteWeight).to.equal(0);
      expect(voting.totalVoteWeight).to.equal(vp1);
    });

    it("Should allow voter to cast vote for developer", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      const { vp1 } = await setupVotingPhase(fixtures);

      const { disputeDAO, voter1 } = fixtures;

      await disputeDAO.connect(voter1).castVote(1, false);

      const voting = await disputeDAO.getDisputeVoting(1);
      expect(voting.clientVoteWeight).to.equal(0);
      expect(voting.developerVoteWeight).to.equal(vp1);
    });

    it("Should accumulate votes from multiple voters", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      const { vp1, vp2, vp3 } = await setupVotingPhase(fixtures);

      const { disputeDAO, voter1, voter2, voter3 } = fixtures;

      await disputeDAO.connect(voter1).castVote(1, true); // client
      await disputeDAO.connect(voter2).castVote(1, false); // developer
      await disputeDAO.connect(voter3).castVote(1, true); // client

      const voting = await disputeDAO.getDisputeVoting(1);
      expect(voting.clientVoteWeight).to.equal(vp1 + vp3);
      expect(voting.developerVoteWeight).to.equal(vp2);
      expect(voting.totalVoteWeight).to.equal(vp1 + vp2 + vp3);
    });

    it("Should prevent double voting", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupVotingPhase(fixtures);

      const { disputeDAO, voter1 } = fixtures;

      await disputeDAO.connect(voter1).castVote(1, true);

      await expect(
        disputeDAO.connect(voter1).castVote(1, false)
      ).to.be.revertedWithCustomError(disputeDAO, "AlreadyVoted");
    });

    it("Should prevent client from voting", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupVotingPhase(fixtures);

      const { disputeDAO, eliteToken, client } = fixtures;

      // Give client voting power
      await eliteToken.mint(client.address, ethers.parseUnits("100", 6));
      await eliteToken.connect(client).delegate(client.address);

      await expect(
        disputeDAO.connect(client).castVote(1, true)
      ).to.be.revertedWithCustomError(disputeDAO, "PartyCannotVote");
    });

    it("Should prevent developer from voting", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupVotingPhase(fixtures);

      const { disputeDAO, eliteToken, developer } = fixtures;

      // Give developer voting power
      await eliteToken.mint(developer.address, ethers.parseUnits("100", 6));
      await eliteToken.connect(developer).delegate(developer.address);

      await expect(
        disputeDAO.connect(developer).castVote(1, false)
      ).to.be.revertedWithCustomError(disputeDAO, "PartyCannotVote");
    });

    it("Should prevent voter with no voting power", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupVotingPhase(fixtures);

      const { disputeDAO, other } = fixtures;

      await expect(
        disputeDAO.connect(other).castVote(1, true)
      ).to.be.revertedWithCustomError(disputeDAO, "NoVotingPower");
    });

    it("Should revert if voting period has ended", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupVotingPhase(fixtures);

      const { disputeDAO, voter1 } = fixtures;

      // Fast-forward past voting deadline
      await time.increase(VOTING_PERIOD + 1);

      await expect(
        disputeDAO.connect(voter1).castVote(1, true)
      ).to.be.revertedWithCustomError(disputeDAO, "VotingPeriodEnded");
    });
  });

  // =========================================================================
  // Phase 4: Resolution
  // =========================================================================

  describe("Resolution (executeResolution)", function () {
    async function setupFullVoting(fixtures, clientWins) {
      await setupProject(fixtures);
      const { vp1, vp2, vp3 } = await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, voter1, voter2, voter3 } = fixtures;

      // Evidence period
      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      // All voters vote (quorum 100% of total supply)
      if (clientWins) {
        await disputeDAO.connect(voter1).castVote(1, true); // 1000
        await disputeDAO.connect(voter2).castVote(1, true); // 800
        await disputeDAO.connect(voter3).castVote(1, false); // 600
      } else {
        await disputeDAO.connect(voter1).castVote(1, false); // 1000
        await disputeDAO.connect(voter2).castVote(1, false); // 800
        await disputeDAO.connect(voter3).castVote(1, true); // 600
      }

      // Voting period ends
      await time.increase(VOTING_PERIOD + 1);
    }

    it("Should resolve in favor of client (client wins)", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupFullVoting(fixtures, true);

      const { disputeDAO, usdc, client } = fixtures;

      const clientBalanceBefore = await usdc.balanceOf(client.address);

      await expect(disputeDAO.executeResolution(1))
        .to.emit(disputeDAO, "DisputeResolved")
        .withArgs(1, true, PROJECT_BUDGET, 0);

      // Client gets escrow funds back + arbitration fee refund (client initiated and won)
      const clientBalanceAfter = await usdc.balanceOf(client.address);
      expect(clientBalanceAfter - clientBalanceBefore).to.equal(
        PROJECT_BUDGET + ARBITRATION_FEE
      );

      const core = await disputeDAO.getDisputeCore(1);
      expect(core.status).to.equal(2); // DisputeStatus.Resolved
      expect(core.clientWon).to.be.true;
      expect(core.resolvedByOwner).to.be.false;
    });

    it("Should resolve in favor of developer (developer wins)", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupFullVoting(fixtures, false);

      const { disputeDAO, usdc, developer } = fixtures;

      const devBalanceBefore = await usdc.balanceOf(developer.address);

      await disputeDAO.executeResolution(1);

      // Developer gets escrow funds
      const devBalanceAfter = await usdc.balanceOf(developer.address);
      expect(devBalanceAfter - devBalanceBefore).to.equal(PROJECT_BUDGET);

      const core = await disputeDAO.getDisputeCore(1);
      expect(core.clientWon).to.be.false;
    });

    it("Should refund arbitration fee to initiator when they win", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupFullVoting(fixtures, true); // client initiated and wins

      const { disputeDAO, usdc, client } = fixtures;

      const clientBalanceBefore = await usdc.balanceOf(client.address);
      await disputeDAO.executeResolution(1);
      const clientBalanceAfter = await usdc.balanceOf(client.address);

      // Client gets escrow + arbitration fee refund
      expect(clientBalanceAfter - clientBalanceBefore).to.equal(
        PROJECT_BUDGET + ARBITRATION_FEE
      );
    });

    it("Should send arbitration fee to treasury when initiator loses", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupFullVoting(fixtures, false); // client initiated, developer wins

      const { disputeDAO, usdc, treasury } = fixtures;

      const treasuryBalanceBefore = await usdc.balanceOf(treasury.address);
      await disputeDAO.executeResolution(1);
      const treasuryBalanceAfter = await usdc.balanceOf(treasury.address);

      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(
        ARBITRATION_FEE
      );
    });

    it("Should revert if quorum not met", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, voter1 } = fixtures;

      // Evidence period
      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      // Only voter1 votes (1000 out of 2400 total supply = ~42%)
      // But we need 25% quorum, so actually 1000/2400 = 41.7% which IS enough...
      // Let's just not vote at all and test with no votes
      await time.increase(VOTING_PERIOD + 1);

      await expect(
        disputeDAO.executeResolution(1)
      ).to.be.revertedWithCustomError(disputeDAO, "QuorumNotMet");
    });

    it("Should revert if voting period not ended", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, voter1 } = fixtures;

      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      await disputeDAO.connect(voter1).castVote(1, true);

      // Don't fast-forward past voting period
      await expect(
        disputeDAO.executeResolution(1)
      ).to.be.revertedWithCustomError(disputeDAO, "VotingPeriodNotEnded");
    });
  });

  // =========================================================================
  // Owner Resolution
  // =========================================================================

  describe("Owner Resolution", function () {
    it("Should allow owner to resolve when quorum not met", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, owner } = fixtures;

      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      // No votes cast, voting period ends
      await time.increase(VOTING_PERIOD + 1);

      await expect(disputeDAO.connect(owner).ownerResolve(1, true))
        .to.emit(disputeDAO, "DisputeResolvedByOwner")
        .withArgs(1, true);

      const core = await disputeDAO.getDisputeCore(1);
      expect(core.status).to.equal(2); // Resolved
      expect(core.resolvedByOwner).to.be.true;
      expect(core.clientWon).to.be.true;
    });

    it("Should revert if quorum was met", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, owner, voter1, voter2, voter3 } = fixtures;

      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      // All voters vote (100% quorum)
      await disputeDAO.connect(voter1).castVote(1, true);
      await disputeDAO.connect(voter2).castVote(1, true);
      await disputeDAO.connect(voter3).castVote(1, true);

      await time.increase(VOTING_PERIOD + 1);

      await expect(
        disputeDAO.connect(owner).ownerResolve(1, true)
      ).to.be.revertedWithCustomError(disputeDAO, "QuorumAlreadyMet");
    });

    it("Should revert if non-owner calls ownerResolve", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, other } = fixtures;

      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);
      await time.increase(VOTING_PERIOD + 1);

      await expect(
        disputeDAO.connect(other).ownerResolve(1, true)
      ).to.be.revertedWithCustomError(disputeDAO, "OwnableUnauthorizedAccount");
    });
  });

  // =========================================================================
  // View Functions
  // =========================================================================

  describe("View Functions", function () {
    it("quorumReached should return false before voting starts", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO } = fixtures;
      expect(await disputeDAO.quorumReached(1)).to.be.false;
    });

    it("quorumReached should return true when enough votes", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, voter1, voter2, voter3 } = fixtures;

      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      // All voters vote
      await disputeDAO.connect(voter1).castVote(1, true);
      await disputeDAO.connect(voter2).castVote(1, true);
      await disputeDAO.connect(voter3).castVote(1, true);

      expect(await disputeDAO.quorumReached(1)).to.be.true;
    });

    it("getDisputeVoting should return correct tallies", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      const { vp1, vp2 } = await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, voter1, voter2 } = fixtures;

      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      await disputeDAO.connect(voter1).castVote(1, true);
      await disputeDAO.connect(voter2).castVote(1, false);

      const voting = await disputeDAO.getDisputeVoting(1);
      expect(voting.clientVoteWeight).to.equal(vp1);
      expect(voting.developerVoteWeight).to.equal(vp2);
      expect(voting.totalVoteWeight).to.equal(vp1 + vp2);
    });

    it("hasVoted should track vote status correctly", async function () {
      const fixtures = await loadFixture(deployDisputeDAOFixture);
      await setupProject(fixtures);
      await setupVoters(fixtures);
      await createTestDispute(fixtures);

      const { disputeDAO, voter1, voter2 } = fixtures;

      await time.increase(EVIDENCE_PERIOD + 1);
      await disputeDAO.startVoting(1);

      expect(await disputeDAO.hasVoted(1, voter1.address)).to.be.false;

      await disputeDAO.connect(voter1).castVote(1, true);

      expect(await disputeDAO.hasVoted(1, voter1.address)).to.be.true;
      expect(await disputeDAO.hasVoted(1, voter2.address)).to.be.false;
    });
  });

  // =========================================================================
  // Admin Functions
  // =========================================================================

  describe("Admin Functions", function () {
    it("Should allow owner to update arbitration fee", async function () {
      const { disputeDAO } = await loadFixture(deployDisputeDAOFixture);
      const newFee = ethers.parseUnits("100", 6);

      await disputeDAO.setArbitrationFee(newFee);
      expect(await disputeDAO.arbitrationFee()).to.equal(newFee);
    });

    it("Should allow owner to update quorum", async function () {
      const { disputeDAO } = await loadFixture(deployDisputeDAOFixture);

      await disputeDAO.setQuorumNumerator(50);
      expect(await disputeDAO.quorumNumerator()).to.equal(50);
    });

    it("Should revert invalid quorum values", async function () {
      const { disputeDAO } = await loadFixture(deployDisputeDAOFixture);

      await expect(disputeDAO.setQuorumNumerator(0)).to.be.revertedWith(
        "Invalid quorum"
      );
      await expect(disputeDAO.setQuorumNumerator(101)).to.be.revertedWith(
        "Invalid quorum"
      );
    });

    it("Should allow owner to update treasury", async function () {
      const { disputeDAO, other } = await loadFixture(deployDisputeDAOFixture);

      await disputeDAO.setTreasury(other.address);
      expect(await disputeDAO.treasury()).to.equal(other.address);
    });

    it("Should revert setting treasury to zero address", async function () {
      const { disputeDAO } = await loadFixture(deployDisputeDAOFixture);

      await expect(
        disputeDAO.setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(disputeDAO, "InvalidAddress");
    });

    it("Should allow owner to update evidence period", async function () {
      const { disputeDAO } = await loadFixture(deployDisputeDAOFixture);
      const newPeriod = 5 * 24 * 60 * 60; // 5 days

      await disputeDAO.setEvidencePeriod(newPeriod);
      expect(await disputeDAO.evidencePeriod()).to.equal(newPeriod);
    });

    it("Should allow owner to update voting period", async function () {
      const { disputeDAO } = await loadFixture(deployDisputeDAOFixture);
      const newPeriod = 7 * 24 * 60 * 60; // 7 days

      await disputeDAO.setVotingPeriod(newPeriod);
      expect(await disputeDAO.votingPeriod()).to.equal(newPeriod);
    });

    it("Should prevent non-owner from calling admin functions", async function () {
      const { disputeDAO, other } = await loadFixture(deployDisputeDAOFixture);

      await expect(
        disputeDAO.connect(other).setArbitrationFee(100)
      ).to.be.revertedWithCustomError(disputeDAO, "OwnableUnauthorizedAccount");

      await expect(
        disputeDAO.connect(other).setQuorumNumerator(50)
      ).to.be.revertedWithCustomError(disputeDAO, "OwnableUnauthorizedAccount");

      await expect(
        disputeDAO.connect(other).setTreasury(other.address)
      ).to.be.revertedWithCustomError(disputeDAO, "OwnableUnauthorizedAccount");

      await expect(
        disputeDAO.connect(other).setEvidencePeriod(100)
      ).to.be.revertedWithCustomError(disputeDAO, "OwnableUnauthorizedAccount");

      await expect(
        disputeDAO.connect(other).setVotingPeriod(100)
      ).to.be.revertedWithCustomError(disputeDAO, "OwnableUnauthorizedAccount");
    });
  });
});
