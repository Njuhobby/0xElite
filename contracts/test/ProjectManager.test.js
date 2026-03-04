const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("ProjectManager", function () {
  let projectManager, escrowVault, mockUSDC;
  let owner, client1, client2, developer1, developer2, developer3, treasury, randomUser;

  const USDC_DECIMALS = 6;
  const parseUSDC = (amount) => ethers.parseUnits(amount.toString(), USDC_DECIMALS);
  const FEE_BPS = 1000; // 10%

  async function deployEscrowAndUSDC() {
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const EscrowVault = await ethers.getContractFactory("EscrowVault");
    const escrow = await upgrades.deployProxy(
      EscrowVault,
      [await usdc.getAddress(), treasury.address],
      { kind: "uups" }
    );
    await escrow.waitForDeployment();

    return { usdc, escrow };
  }

  async function deployProjectManager(escrowAddr) {
    const ProjectManager = await ethers.getContractFactory("ProjectManager");
    const pm = await upgrades.deployProxy(
      ProjectManager,
      [owner.address, escrowAddr, treasury.address, FEE_BPS],
      { kind: "uups" }
    );
    await pm.waitForDeployment();
    return pm;
  }

  async function setupWithEscrow() {
    const { usdc, escrow } = await deployEscrowAndUSDC();
    const pm = await deployProjectManager(await escrow.getAddress());

    // Configure EscrowVault to trust ProjectManager
    await escrow.setProjectManager(await pm.getAddress());

    return { pm, escrow, usdc };
  }

  async function createProjectAndDeposit(pm, escrow, usdc, clientSigner, totalBudget, budgets, hashes) {
    const tx = await pm.connect(clientSigner).createProjectWithMilestones(totalBudget, budgets, hashes);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try { return pm.interface.parseLog(log)?.name === "ProjectCreated"; } catch { return false; }
    });
    const projectId = pm.interface.parseLog(event).args.projectId;

    // Fund client and deposit to escrow
    await usdc.mint(clientSigner.address, totalBudget);
    await usdc.connect(clientSigner).approve(await escrow.getAddress(), totalBudget);
    await escrow.connect(clientSigner).deposit(projectId, totalBudget);

    return projectId;
  }

  beforeEach(async function () {
    [owner, client1, client2, developer1, developer2, developer3, treasury, randomUser] = await ethers.getSigners();
  });

  // =========================================================================
  // 1. Deployment & Initialization
  // =========================================================================
  describe("Deployment", function () {
    it("Should set the correct owner", async function () {
      const { pm } = await setupWithEscrow();
      expect(await pm.owner()).to.equal(owner.address);
    });

    it("Should initialize nextProjectId to 0", async function () {
      const { pm } = await setupWithEscrow();
      expect(await pm.nextProjectId()).to.equal(0);
    });

    it("Should initialize project count to 0", async function () {
      const { pm } = await setupWithEscrow();
      expect(await pm.getProjectCount()).to.equal(0);
    });

    it("Should set escrow vault, treasury, and fee bps", async function () {
      const { pm, escrow } = await setupWithEscrow();
      expect(await pm.escrowVault()).to.equal(await escrow.getAddress());
      expect(await pm.treasury()).to.equal(treasury.address);
      expect(await pm.platformFeeBps()).to.equal(FEE_BPS);
    });

    it("Should return correct version", async function () {
      const { pm } = await setupWithEscrow();
      expect(await pm.version()).to.equal("1.0.0");
    });

    it("Should reject initialize with zero owner", async function () {
      const { escrow } = await deployEscrowAndUSDC();
      const ProjectManager = await ethers.getContractFactory("ProjectManager");
      await expect(
        upgrades.deployProxy(
          ProjectManager,
          [ethers.ZeroAddress, await escrow.getAddress(), treasury.address, FEE_BPS],
          { kind: "uups" }
        )
      ).to.be.revertedWith("Invalid owner address");
    });

    it("Should reject initialize with zero escrow address", async function () {
      const ProjectManager = await ethers.getContractFactory("ProjectManager");
      await expect(
        upgrades.deployProxy(
          ProjectManager,
          [owner.address, ethers.ZeroAddress, treasury.address, FEE_BPS],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ProjectManager, "InvalidAddress");
    });

    it("Should reject initialize with zero treasury address", async function () {
      const { escrow } = await deployEscrowAndUSDC();
      const ProjectManager = await ethers.getContractFactory("ProjectManager");
      await expect(
        upgrades.deployProxy(
          ProjectManager,
          [owner.address, await escrow.getAddress(), ethers.ZeroAddress, FEE_BPS],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ProjectManager, "InvalidAddress");
    });

    it("Should reject initialize with fee > 5000", async function () {
      const { escrow } = await deployEscrowAndUSDC();
      const ProjectManager = await ethers.getContractFactory("ProjectManager");
      await expect(
        upgrades.deployProxy(
          ProjectManager,
          [owner.address, await escrow.getAddress(), treasury.address, 5001],
          { kind: "uups" }
        )
      ).to.be.revertedWithCustomError(ProjectManager, "InvalidFeeBps");
    });
  });

  // =========================================================================
  // 2. Simple Project Creation (no milestones)
  // =========================================================================
  describe("Simple Project Creation", function () {
    let pm;
    const validBudget = parseUSDC("5000");

    beforeEach(async function () {
      const result = await setupWithEscrow();
      pm = result.pm;
    });

    it("Should create a project with valid budget", async function () {
      const tx = await pm.connect(client1).createProject(validBudget);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try { return pm.interface.parseLog(log)?.name === "ProjectCreated"; } catch { return false; }
      });
      const parsedEvent = pm.interface.parseLog(event);
      expect(parsedEvent.args.projectId).to.equal(0);
      expect(parsedEvent.args.client).to.equal(client1.address);
      expect(parsedEvent.args.totalBudget).to.equal(validBudget);

      const project = await pm.getProject(0);
      expect(project.projectId).to.equal(0);
      expect(project.client).to.equal(client1.address);
      expect(project.assignedDeveloper).to.equal(ethers.ZeroAddress);
      expect(project.state).to.equal(0); // Draft
      expect(project.totalBudget).to.equal(validBudget);
      expect(project.createdAt).to.be.gt(0);
      expect(await pm.milestoneCount(0)).to.equal(0);
    });

    it("Should increment nextProjectId after creation", async function () {
      await pm.connect(client1).createProject(validBudget);
      expect(await pm.nextProjectId()).to.equal(1);
      await pm.connect(client2).createProject(validBudget);
      expect(await pm.nextProjectId()).to.equal(2);
    });

    it("Should reject project with zero budget", async function () {
      await expect(
        pm.connect(client1).createProject(0)
      ).to.be.revertedWith("Budget must be positive");
    });

    it("Should allow same client to create multiple projects", async function () {
      await pm.connect(client1).createProject(validBudget);
      await pm.connect(client1).createProject(parseUSDC("3000"));
      expect(await pm.getProjectCount()).to.equal(2);
    });
  });

  // =========================================================================
  // 3. createProjectWithMilestones
  // =========================================================================
  describe("createProjectWithMilestones", function () {
    let pm;

    beforeEach(async function () {
      const result = await setupWithEscrow();
      pm = result.pm;
    });

    it("Should create project with valid milestones", async function () {
      const total = parseUSDC("5000");
      const budgets = [parseUSDC("2000"), parseUSDC("1500"), parseUSDC("1500")];
      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("milestone1")),
        ethers.keccak256(ethers.toUtf8Bytes("milestone2")),
        ethers.keccak256(ethers.toUtf8Bytes("milestone3")),
      ];

      const tx = await pm.connect(client1).createProjectWithMilestones(total, budgets, hashes);
      const receipt = await tx.wait();

      // Check ProjectCreated event
      const createEvent = receipt.logs.find(log => {
        try { return pm.interface.parseLog(log)?.name === "ProjectCreated"; } catch { return false; }
      });
      expect(createEvent).to.not.be.undefined;
      const parsedCreate = pm.interface.parseLog(createEvent);
      expect(parsedCreate.args.projectId).to.equal(0);
      expect(parsedCreate.args.client).to.equal(client1.address);
      expect(parsedCreate.args.totalBudget).to.equal(total);

      // Check MilestonesCreated event
      const milestoneEvent = receipt.logs.find(log => {
        try { return pm.interface.parseLog(log)?.name === "MilestonesCreated"; } catch { return false; }
      });
      expect(milestoneEvent).to.not.be.undefined;
      const parsedMilestone = pm.interface.parseLog(milestoneEvent);
      expect(parsedMilestone.args.count).to.equal(3);

      // Verify stored data
      const project = await pm.getProject(0);
      expect(project.client).to.equal(client1.address);
      expect(project.state).to.equal(0); // Draft
      expect(await pm.milestoneCount(0)).to.equal(3);

      const m0 = await pm.getMilestone(0, 0);
      expect(m0.budget).to.equal(budgets[0]);
      expect(m0.detailsHash).to.equal(hashes[0]);
      expect(m0.status).to.equal(0); // Pending
    });

    it("Should revert on budget mismatch", async function () {
      const total = parseUSDC("5000");
      const budgets = [parseUSDC("2000"), parseUSDC("1500")]; // sum = 3500 != 5000
      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("m1")),
        ethers.keccak256(ethers.toUtf8Bytes("m2")),
      ];

      await expect(
        pm.connect(client1).createProjectWithMilestones(total, budgets, hashes)
      ).to.be.revertedWithCustomError(pm, "BudgetMismatch");
    });

    it("Should revert on empty milestones", async function () {
      await expect(
        pm.connect(client1).createProjectWithMilestones(parseUSDC("5000"), [], [])
      ).to.be.revertedWithCustomError(pm, "NoMilestones");
    });

    it("Should revert on more than 20 milestones", async function () {
      const budgets = new Array(21).fill(parseUSDC("100"));
      const hashes = new Array(21).fill(ethers.keccak256(ethers.toUtf8Bytes("m")));
      const total = parseUSDC("2100");

      await expect(
        pm.connect(client1).createProjectWithMilestones(total, budgets, hashes)
      ).to.be.revertedWithCustomError(pm, "TooManyMilestones");
    });

    it("Should revert on zero budget milestone", async function () {
      const total = parseUSDC("5000");
      const budgets = [parseUSDC("5000"), 0n];
      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("m1")),
        ethers.keccak256(ethers.toUtf8Bytes("m2")),
      ];

      await expect(
        pm.connect(client1).createProjectWithMilestones(total, budgets, hashes)
      ).to.be.revertedWithCustomError(pm, "BudgetMismatch");
    });

    it("Should revert on mismatched array lengths", async function () {
      const total = parseUSDC("5000");
      const budgets = [parseUSDC("2500"), parseUSDC("2500")];
      const hashes = [ethers.keccak256(ethers.toUtf8Bytes("m1"))];

      await expect(
        pm.connect(client1).createProjectWithMilestones(total, budgets, hashes)
      ).to.be.revertedWithCustomError(pm, "BudgetMismatch");
    });

    it("Should store detailsHash correctly", async function () {
      const hash = ethers.keccak256(ethers.solidityPacked(
        ["string", "string", "string"],
        ["Build frontend", "Create the frontend UI", "React components"]
      ));
      const total = parseUSDC("1000");

      await pm.connect(client1).createProjectWithMilestones(total, [total], [hash]);

      const m = await pm.getMilestone(0, 0);
      expect(m.detailsHash).to.equal(hash);
    });

    it("Should allow creating 20 milestones (max)", async function () {
      const budgetPer = parseUSDC("50");
      const budgets = new Array(20).fill(budgetPer);
      const hashes = new Array(20).fill(ethers.keccak256(ethers.toUtf8Bytes("m")));
      const total = parseUSDC("1000");

      await pm.connect(client1).createProjectWithMilestones(total, budgets, hashes);
      expect(await pm.milestoneCount(0)).to.equal(20);
    });

    it("Should allow single milestone project", async function () {
      const total = parseUSDC("500");
      await pm.connect(client1).createProjectWithMilestones(
        total, [total], [ethers.keccak256(ethers.toUtf8Bytes("m"))]
      );
      expect(await pm.milestoneCount(0)).to.equal(1);
    });

    it("Simple and milestone projects can coexist", async function () {
      await pm.connect(client1).createProject(parseUSDC("1000"));
      const total = parseUSDC("2000");
      await pm.connect(client2).createProjectWithMilestones(
        total,
        [parseUSDC("1000"), parseUSDC("1000")],
        [ethers.keccak256(ethers.toUtf8Bytes("m1")), ethers.keccak256(ethers.toUtf8Bytes("m2"))]
      );

      expect(await pm.getProjectCount()).to.equal(2);
      expect(await pm.milestoneCount(0)).to.equal(0);
      expect(await pm.milestoneCount(1)).to.equal(2);
    });
  });

  // =========================================================================
  // 4. Developer Assignment
  // =========================================================================
  describe("Developer Assignment", function () {
    let pm;
    const validBudget = parseUSDC("5000");

    beforeEach(async function () {
      const result = await setupWithEscrow();
      pm = result.pm;
    });

    describe("assignDeveloper (single)", function () {
      beforeEach(async function () {
        await pm.connect(client1).createProject(validBudget);
      });

      it("Should assign developer to draft project", async function () {
        const tx = await pm.connect(owner).assignDeveloper(0, developer1.address);
        const receipt = await tx.wait();

        const assignEvent = receipt.logs.find(log => {
          try { return pm.interface.parseLog(log)?.name === "DeveloperAssigned"; } catch { return false; }
        });
        expect(assignEvent).to.not.be.undefined;

        const project = await pm.getProject(0);
        expect(project.assignedDeveloper).to.equal(developer1.address);
        expect(project.state).to.equal(1); // Active
        expect(project.activatedAt).to.be.gt(0);
      });

      it("Should only allow owner to assign developers", async function () {
        await expect(
          pm.connect(client1).assignDeveloper(0, developer1.address)
        ).to.be.revertedWithCustomError(pm, "OwnableUnauthorizedAccount");
      });

      it("Should reject assignment to non-existent project", async function () {
        await expect(
          pm.connect(owner).assignDeveloper(999, developer1.address)
        ).to.be.revertedWith("Project does not exist");
      });

      it("Should reject assignment with zero address", async function () {
        await expect(
          pm.connect(owner).assignDeveloper(0, ethers.ZeroAddress)
        ).to.be.revertedWith("Invalid developer address");
      });

      it("Should reject assignment to non-draft project", async function () {
        await pm.connect(owner).assignDeveloper(0, developer1.address);
        await expect(
          pm.connect(owner).assignDeveloper(0, developer2.address)
        ).to.be.revertedWith("Project not in draft state");
      });
    });

    describe("assignDevelopers (multi)", function () {
      beforeEach(async function () {
        const total = parseUSDC("3000");
        const budgets = [parseUSDC("1500"), parseUSDC("1500")];
        const hashes = [
          ethers.keccak256(ethers.toUtf8Bytes("m1")),
          ethers.keccak256(ethers.toUtf8Bytes("m2")),
        ];
        await pm.connect(client1).createProjectWithMilestones(total, budgets, hashes);
      });

      it("Should assign a single developer", async function () {
        const tx = await pm.connect(owner).assignDevelopers(0, [developer1.address]);
        const receipt = await tx.wait();

        const event = receipt.logs.find(log => {
          try { return pm.interface.parseLog(log)?.name === "DevelopersAssigned"; } catch { return false; }
        });
        expect(event).to.not.be.undefined;

        const devs = await pm.getProjectDevelopers(0);
        expect(devs.length).to.equal(1);
        expect(devs[0]).to.equal(developer1.address);

        const project = await pm.getProject(0);
        expect(project.state).to.equal(1); // Active
        expect(project.assignedDeveloper).to.equal(developer1.address);
      });

      it("Should assign multiple developers", async function () {
        await pm.connect(owner).assignDevelopers(0, [developer1.address, developer2.address, developer3.address]);

        const devs = await pm.getProjectDevelopers(0);
        expect(devs.length).to.equal(3);
        expect(await pm.isProjectDeveloper(0, developer1.address)).to.be.true;
        expect(await pm.isProjectDeveloper(0, developer2.address)).to.be.true;
        expect(await pm.isProjectDeveloper(0, developer3.address)).to.be.true;
        expect(await pm.isProjectDeveloper(0, randomUser.address)).to.be.false;
      });

      it("Should revert with zero address developer", async function () {
        await expect(
          pm.connect(owner).assignDevelopers(0, [ethers.ZeroAddress])
        ).to.be.revertedWithCustomError(pm, "InvalidAddress");
      });

      it("Should revert when not owner", async function () {
        await expect(
          pm.connect(client1).assignDevelopers(0, [developer1.address])
        ).to.be.revertedWithCustomError(pm, "OwnableUnauthorizedAccount");
      });

      it("Should revert on empty developers array", async function () {
        await expect(
          pm.connect(owner).assignDevelopers(0, [])
        ).to.be.revertedWithCustomError(pm, "NoDevelopers");
      });

      it("Should revert on duplicate developers", async function () {
        await expect(
          pm.connect(owner).assignDevelopers(0, [developer1.address, developer1.address])
        ).to.be.revertedWithCustomError(pm, "InvalidAddress");
      });
    });
  });

  // =========================================================================
  // 5. Project State Management
  // =========================================================================
  describe("Project State Management", function () {
    let pm;
    const validBudget = parseUSDC("5000");

    beforeEach(async function () {
      const result = await setupWithEscrow();
      pm = result.pm;
      await pm.connect(client1).createProject(validBudget);
      await pm.connect(owner).assignDeveloper(0, developer1.address);
    });

    it("Should update project state to Completed", async function () {
      await pm.connect(owner).updateProjectState(0, 2);
      const project = await pm.getProject(0);
      expect(project.state).to.equal(2);
      expect(project.completedAt).to.be.gt(0);
    });

    it("Should update project state to Disputed", async function () {
      await pm.connect(owner).updateProjectState(0, 3);
      const project = await pm.getProject(0);
      expect(project.state).to.equal(3);
    });

    it("Should update project state to Cancelled", async function () {
      await pm.connect(owner).updateProjectState(0, 4);
      const project = await pm.getProject(0);
      expect(project.state).to.equal(4);
    });

    it("Should only allow owner to update state", async function () {
      await expect(
        pm.connect(client1).updateProjectState(0, 2)
      ).to.be.revertedWithCustomError(pm, "OwnableUnauthorizedAccount");
    });

    it("Should reject state update for non-existent project", async function () {
      await expect(
        pm.connect(owner).updateProjectState(999, 2)
      ).to.be.revertedWith("Project does not exist");
    });

    it("Should reject state update to same state", async function () {
      await expect(
        pm.connect(owner).updateProjectState(0, 1) // Already Active
      ).to.be.revertedWith("State unchanged");
    });
  });

  // =========================================================================
  // 6. updateMilestoneStatus
  // =========================================================================
  describe("updateMilestoneStatus", function () {
    let pm;

    beforeEach(async function () {
      const result = await setupWithEscrow();
      pm = result.pm;

      const total = parseUSDC("3000");
      const budgets = [parseUSDC("1500"), parseUSDC("1500")];
      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("m1")),
        ethers.keccak256(ethers.toUtf8Bytes("m2")),
      ];
      await pm.connect(client1).createProjectWithMilestones(total, budgets, hashes);
      await pm.connect(owner).assignDevelopers(0, [developer1.address]);
    });

    it("Should transition Pending -> InProgress", async function () {
      const tx = await pm.connect(owner).updateMilestoneStatus(0, 0, 1);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try { return pm.interface.parseLog(log)?.name === "MilestoneStatusChanged"; } catch { return false; }
      });
      const parsed = pm.interface.parseLog(event);
      expect(parsed.args.oldStatus).to.equal(0);
      expect(parsed.args.newStatus).to.equal(1);

      const m = await pm.getMilestone(0, 0);
      expect(m.status).to.equal(1);
    });

    it("Should transition InProgress -> PendingReview", async function () {
      await pm.connect(owner).updateMilestoneStatus(0, 0, 1);
      await pm.connect(owner).updateMilestoneStatus(0, 0, 2);

      const m = await pm.getMilestone(0, 0);
      expect(m.status).to.equal(2);
    });

    it("Should revert when setting to Completed (must use approveMilestone)", async function () {
      await pm.connect(owner).updateMilestoneStatus(0, 0, 1);
      await pm.connect(owner).updateMilestoneStatus(0, 0, 2);

      await expect(
        pm.connect(owner).updateMilestoneStatus(0, 0, 3)
      ).to.be.revertedWithCustomError(pm, "InvalidMilestoneStatus");
    });

    it("Should revert when setting same status", async function () {
      await expect(
        pm.connect(owner).updateMilestoneStatus(0, 0, 0)
      ).to.be.revertedWithCustomError(pm, "InvalidMilestoneStatus");
    });

    it("Should revert when non-owner calls", async function () {
      await expect(
        pm.connect(client1).updateMilestoneStatus(0, 0, 1)
      ).to.be.revertedWithCustomError(pm, "OwnableUnauthorizedAccount");
    });

    it("Should revert on invalid milestone index", async function () {
      await expect(
        pm.connect(owner).updateMilestoneStatus(0, 5, 1)
      ).to.be.revertedWithCustomError(pm, "MilestoneNotFound");
    });

    it("Should allow setting Disputed status", async function () {
      await pm.connect(owner).updateMilestoneStatus(0, 0, 1);
      await pm.connect(owner).updateMilestoneStatus(0, 0, 4);

      const m = await pm.getMilestone(0, 0);
      expect(m.status).to.equal(4);
    });
  });

  // =========================================================================
  // 7. approveMilestone
  // =========================================================================
  describe("approveMilestone", function () {
    let pm, escrow, usdc;

    beforeEach(async function () {
      const result = await setupWithEscrow();
      pm = result.pm;
      escrow = result.escrow;
      usdc = result.usdc;
    });

    it("Should pay single developer correctly", async function () {
      const total = parseUSDC("1000");
      const budgets = [total];
      const hashes = [ethers.keccak256(ethers.toUtf8Bytes("m1"))];

      const projectId = await createProjectAndDeposit(pm, escrow, usdc, client1, total, budgets, hashes);
      await pm.connect(owner).assignDevelopers(projectId, [developer1.address]);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 1);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 2);

      const dev1Before = await usdc.balanceOf(developer1.address);
      const treasuryBefore = await usdc.balanceOf(treasury.address);

      const tx = await pm.connect(client1).approveMilestone(projectId, 0);
      const receipt = await tx.wait();

      const approvedEvent = receipt.logs.find(log => {
        try { return pm.interface.parseLog(log)?.name === "MilestoneApproved"; } catch { return false; }
      });
      const parsed = pm.interface.parseLog(approvedEvent);

      // 10% fee: 100 USDC, developer gets 900 USDC
      const expectedFee = parseUSDC("100");
      const expectedDevPayment = parseUSDC("900");
      expect(parsed.args.platformFee).to.equal(expectedFee);
      expect(parsed.args.developerPayment).to.equal(expectedDevPayment);

      expect(await usdc.balanceOf(developer1.address) - dev1Before).to.equal(expectedDevPayment);
      expect(await usdc.balanceOf(treasury.address) - treasuryBefore).to.equal(expectedFee);

      const m = await pm.getMilestone(projectId, 0);
      expect(m.status).to.equal(3); // Completed
    });

    it("Should split payment equally among multiple developers", async function () {
      const total = parseUSDC("3000");
      const budgets = [total];
      const hashes = [ethers.keccak256(ethers.toUtf8Bytes("m1"))];

      const projectId = await createProjectAndDeposit(pm, escrow, usdc, client1, total, budgets, hashes);
      await pm.connect(owner).assignDevelopers(projectId, [developer1.address, developer2.address, developer3.address]);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 1);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 2);

      const dev1Before = await usdc.balanceOf(developer1.address);
      const dev2Before = await usdc.balanceOf(developer2.address);
      const dev3Before = await usdc.balanceOf(developer3.address);

      await pm.connect(client1).approveMilestone(projectId, 0);

      const expectedPerDev = parseUSDC("900");
      expect(await usdc.balanceOf(developer1.address) - dev1Before).to.equal(expectedPerDev);
      expect(await usdc.balanceOf(developer2.address) - dev2Before).to.equal(expectedPerDev);
      expect(await usdc.balanceOf(developer3.address) - dev3Before).to.equal(expectedPerDev);
    });

    it("Should handle rounding dust correctly (last developer gets remainder)", async function () {
      const total = parseUSDC("1000");
      const budgets = [total];
      const hashes = [ethers.keccak256(ethers.toUtf8Bytes("m1"))];

      const projectId = await createProjectAndDeposit(pm, escrow, usdc, client1, total, budgets, hashes);
      await pm.connect(owner).setPlatformFeeBps(333); // 3.33%
      await pm.connect(owner).assignDevelopers(projectId, [developer1.address, developer2.address, developer3.address]);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 1);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 2);

      const dev1Before = await usdc.balanceOf(developer1.address);
      const dev2Before = await usdc.balanceOf(developer2.address);
      const dev3Before = await usdc.balanceOf(developer3.address);
      const treasuryBefore = await usdc.balanceOf(treasury.address);

      await pm.connect(client1).approveMilestone(projectId, 0);

      const dev1After = await usdc.balanceOf(developer1.address);
      const dev2After = await usdc.balanceOf(developer2.address);
      const dev3After = await usdc.balanceOf(developer3.address);
      const treasuryAfter = await usdc.balanceOf(treasury.address);

      const totalPaid = (dev1After - dev1Before) + (dev2After - dev2Before) + (dev3After - dev3Before) + (treasuryAfter - treasuryBefore);
      expect(totalPaid).to.equal(total);

      // Last developer should get 1 more than first two
      expect(dev3After - dev3Before).to.equal(dev1After - dev1Before + 1n);
    });

    it("Should revert when caller is not the client", async function () {
      const total = parseUSDC("1000");
      const projectId = await createProjectAndDeposit(pm, escrow, usdc, client1, total, [total], [ethers.keccak256(ethers.toUtf8Bytes("m1"))]);
      await pm.connect(owner).assignDevelopers(projectId, [developer1.address]);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 1);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 2);

      await expect(
        pm.connect(developer1).approveMilestone(projectId, 0)
      ).to.be.revertedWithCustomError(pm, "NotProjectClient");

      await expect(
        pm.connect(randomUser).approveMilestone(projectId, 0)
      ).to.be.revertedWithCustomError(pm, "NotProjectClient");
    });

    it("Should revert when milestone is not PendingReview", async function () {
      const total = parseUSDC("1000");
      const projectId = await createProjectAndDeposit(pm, escrow, usdc, client1, total, [total], [ethers.keccak256(ethers.toUtf8Bytes("m1"))]);
      await pm.connect(owner).assignDevelopers(projectId, [developer1.address]);

      await expect(
        pm.connect(client1).approveMilestone(projectId, 0)
      ).to.be.revertedWithCustomError(pm, "InvalidMilestoneStatus");
    });

    it("Should revert when project is not Active", async function () {
      const total = parseUSDC("1000");
      await pm.connect(client1).createProjectWithMilestones(total, [total], [ethers.keccak256(ethers.toUtf8Bytes("m1"))]);

      await expect(
        pm.connect(client1).approveMilestone(0, 0)
      ).to.be.revertedWithCustomError(pm, "ProjectNotActive");
    });

    it("Should revert on invalid milestone index", async function () {
      const total = parseUSDC("1000");
      const projectId = await createProjectAndDeposit(pm, escrow, usdc, client1, total, [total], [ethers.keccak256(ethers.toUtf8Bytes("m1"))]);
      await pm.connect(owner).assignDevelopers(projectId, [developer1.address]);

      await expect(
        pm.connect(client1).approveMilestone(projectId, 5)
      ).to.be.revertedWithCustomError(pm, "MilestoneNotFound");
    });

    it("Should revert when escrow is frozen", async function () {
      const total = parseUSDC("1000");
      const projectId = await createProjectAndDeposit(pm, escrow, usdc, client1, total, [total], [ethers.keccak256(ethers.toUtf8Bytes("m1"))]);
      await pm.connect(owner).assignDevelopers(projectId, [developer1.address]);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 1);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 2);

      await escrow.setDisputeDAO(owner.address);
      await escrow.connect(owner).freeze(projectId);

      await expect(
        pm.connect(client1).approveMilestone(projectId, 0)
      ).to.be.revertedWithCustomError(escrow, "EscrowFrozen");
    });

    it("Should handle zero platform fee", async function () {
      await pm.connect(owner).setPlatformFeeBps(0);

      const total = parseUSDC("1000");
      const projectId = await createProjectAndDeposit(pm, escrow, usdc, client1, total, [total], [ethers.keccak256(ethers.toUtf8Bytes("m1"))]);
      await pm.connect(owner).assignDevelopers(projectId, [developer1.address]);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 1);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 2);

      const devBefore = await usdc.balanceOf(developer1.address);
      await pm.connect(client1).approveMilestone(projectId, 0);
      expect(await usdc.balanceOf(developer1.address) - devBefore).to.equal(total);
    });
  });

  // =========================================================================
  // 8. Auto-Completion
  // =========================================================================
  describe("Auto-completion", function () {
    let pm, escrow, usdc;

    beforeEach(async function () {
      const result = await setupWithEscrow();
      pm = result.pm;
      escrow = result.escrow;
      usdc = result.usdc;
    });

    it("Should auto-complete project when all milestones approved", async function () {
      const total = parseUSDC("3000");
      const budgets = [parseUSDC("1000"), parseUSDC("1000"), parseUSDC("1000")];
      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("m1")),
        ethers.keccak256(ethers.toUtf8Bytes("m2")),
        ethers.keccak256(ethers.toUtf8Bytes("m3")),
      ];

      const projectId = await createProjectAndDeposit(pm, escrow, usdc, client1, total, budgets, hashes);
      await pm.connect(owner).assignDevelopers(projectId, [developer1.address]);

      for (let i = 0; i < 3; i++) {
        await pm.connect(owner).updateMilestoneStatus(projectId, i, 1);
        await pm.connect(owner).updateMilestoneStatus(projectId, i, 2);
        await pm.connect(client1).approveMilestone(projectId, i);
      }

      const project = await pm.getProject(projectId);
      expect(project.state).to.equal(2); // Completed
      expect(project.completedAt).to.be.gt(0);
    });

    it("Should NOT auto-complete when some milestones remain", async function () {
      const total = parseUSDC("2000");
      const budgets = [parseUSDC("1000"), parseUSDC("1000")];
      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("m1")),
        ethers.keccak256(ethers.toUtf8Bytes("m2")),
      ];

      const projectId = await createProjectAndDeposit(pm, escrow, usdc, client1, total, budgets, hashes);
      await pm.connect(owner).assignDevelopers(projectId, [developer1.address]);

      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 1);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 2);
      await pm.connect(client1).approveMilestone(projectId, 0);

      const project = await pm.getProject(projectId);
      expect(project.state).to.equal(1); // Still Active
    });

    it("Should emit ProjectStateChanged on auto-completion", async function () {
      const total = parseUSDC("500");
      const projectId = await createProjectAndDeposit(pm, escrow, usdc, client1, total, [total], [ethers.keccak256(ethers.toUtf8Bytes("m1"))]);
      await pm.connect(owner).assignDevelopers(projectId, [developer1.address]);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 1);
      await pm.connect(owner).updateMilestoneStatus(projectId, 0, 2);

      const tx = await pm.connect(client1).approveMilestone(projectId, 0);
      const receipt = await tx.wait();

      const stateEvent = receipt.logs.find(log => {
        try { return pm.interface.parseLog(log)?.name === "ProjectStateChanged"; } catch { return false; }
      });
      expect(stateEvent).to.not.be.undefined;
      const parsed = pm.interface.parseLog(stateEvent);
      expect(parsed.args.oldState).to.equal(1);
      expect(parsed.args.newState).to.equal(2);
    });
  });

  // =========================================================================
  // 9. Configuration
  // =========================================================================
  describe("Configuration", function () {
    let pm;

    beforeEach(async function () {
      const result = await setupWithEscrow();
      pm = result.pm;
    });

    it("Should update platform fee bps", async function () {
      const tx = await pm.connect(owner).setPlatformFeeBps(500);
      const receipt = await tx.wait();

      const event = receipt.logs.find(log => {
        try { return pm.interface.parseLog(log)?.name === "PlatformFeeBpsUpdated"; } catch { return false; }
      });
      const parsed = pm.interface.parseLog(event);
      expect(parsed.args.oldBps).to.equal(FEE_BPS);
      expect(parsed.args.newBps).to.equal(500);
      expect(await pm.platformFeeBps()).to.equal(500);
    });

    it("Should reject fee bps > 5000", async function () {
      await expect(
        pm.connect(owner).setPlatformFeeBps(5001)
      ).to.be.revertedWithCustomError(pm, "InvalidFeeBps");
    });

    it("Should allow fee bps = 0", async function () {
      await pm.connect(owner).setPlatformFeeBps(0);
      expect(await pm.platformFeeBps()).to.equal(0);
    });

    it("Should allow fee bps = 5000 (max)", async function () {
      await pm.connect(owner).setPlatformFeeBps(5000);
      expect(await pm.platformFeeBps()).to.equal(5000);
    });

    it("Should update treasury", async function () {
      await pm.connect(owner).setTreasury(randomUser.address);
      expect(await pm.treasury()).to.equal(randomUser.address);
    });

    it("Should reject zero treasury address", async function () {
      await expect(
        pm.connect(owner).setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(pm, "InvalidAddress");
    });

    it("Should update escrow vault", async function () {
      await pm.connect(owner).setEscrowVault(randomUser.address);
      expect(await pm.escrowVault()).to.equal(randomUser.address);
    });

    it("Should reject zero escrow vault address", async function () {
      await expect(
        pm.connect(owner).setEscrowVault(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(pm, "InvalidAddress");
    });

    it("Should reject non-owner config changes", async function () {
      await expect(
        pm.connect(client1).setPlatformFeeBps(500)
      ).to.be.revertedWithCustomError(pm, "OwnableUnauthorizedAccount");

      await expect(
        pm.connect(client1).setTreasury(client1.address)
      ).to.be.revertedWithCustomError(pm, "OwnableUnauthorizedAccount");

      await expect(
        pm.connect(client1).setEscrowVault(client1.address)
      ).to.be.revertedWithCustomError(pm, "OwnableUnauthorizedAccount");
    });
  });

  // =========================================================================
  // 10. View Functions
  // =========================================================================
  describe("View Functions", function () {
    let pm;

    beforeEach(async function () {
      const result = await setupWithEscrow();
      pm = result.pm;

      const total = parseUSDC("3000");
      const budgets = [parseUSDC("1000"), parseUSDC("1000"), parseUSDC("1000")];
      const hashes = [
        ethers.keccak256(ethers.toUtf8Bytes("m1")),
        ethers.keccak256(ethers.toUtf8Bytes("m2")),
        ethers.keccak256(ethers.toUtf8Bytes("m3")),
      ];
      await pm.connect(client1).createProjectWithMilestones(total, budgets, hashes);
    });

    it("getMilestones should return all milestones", async function () {
      const ms = await pm.getMilestones(0);
      expect(ms.length).to.equal(3);
      expect(ms[0].budget).to.equal(parseUSDC("1000"));
    });

    it("getMilestones should return empty for simple project", async function () {
      await pm.connect(client2).createProject(parseUSDC("500"));
      const ms = await pm.getMilestones(1);
      expect(ms.length).to.equal(0);
    });

    it("getMilestone should revert on invalid index", async function () {
      await expect(pm.getMilestone(0, 10)).to.be.revertedWithCustomError(pm, "MilestoneNotFound");
    });

    it("getProjectDevelopers should return empty before assignment", async function () {
      const devs = await pm.getProjectDevelopers(0);
      expect(devs.length).to.equal(0);
    });

    it("isProjectDeveloper should return false before assignment", async function () {
      expect(await pm.isProjectDeveloper(0, developer1.address)).to.be.false;
    });

    it("Should correctly identify project client", async function () {
      expect(await pm.isProjectClient(0, client1.address)).to.be.true;
      expect(await pm.isProjectClient(0, client2.address)).to.be.false;
    });

    it("getProject should revert for non-existent project", async function () {
      await expect(pm.getProject(999)).to.be.revertedWith("Project does not exist");
    });
  });

  // =========================================================================
  // 11. Access Control
  // =========================================================================
  describe("Access Control", function () {
    let pm;

    beforeEach(async function () {
      const result = await setupWithEscrow();
      pm = result.pm;
    });

    it("Should allow ownership transfer", async function () {
      await pm.connect(owner).transferOwnership(client1.address);
      expect(await pm.owner()).to.equal(client1.address);
    });

    it("Should allow new owner to perform admin functions after transfer", async function () {
      await pm.connect(client1).createProject(parseUSDC("5000"));
      await pm.connect(owner).transferOwnership(client1.address);

      await expect(
        pm.connect(client1).assignDeveloper(0, developer1.address)
      ).to.not.be.reverted;
    });

    it("Should prevent old owner from performing admin functions after transfer", async function () {
      await pm.connect(client1).createProject(parseUSDC("5000"));
      await pm.connect(owner).transferOwnership(client1.address);

      await expect(
        pm.connect(owner).assignDeveloper(0, developer1.address)
      ).to.be.revertedWithCustomError(pm, "OwnableUnauthorizedAccount");
    });
  });
});
