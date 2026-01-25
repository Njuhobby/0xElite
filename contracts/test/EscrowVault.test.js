const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EscrowVault", function () {
  let escrowVault;
  let usdcToken;
  let owner, client, developer, treasury, projectManager, disputeDAO, other;

  const INITIAL_USDC_BALANCE = ethers.parseUnits("100000", 6); // 100k USDC
  const PROJECT_BUDGET = ethers.parseUnits("5000", 6); // 5k USDC
  const MILESTONE_PAYMENT = ethers.parseUnits("1500", 6); // 1.5k USDC
  const PLATFORM_FEE = ethers.parseUnits("225", 6); // 225 USDC
  const PROJECT_ID = 1;

  beforeEach(async function () {
    [owner, client, developer, treasury, projectManager, disputeDAO, other] = await ethers.getSigners();

    // Deploy mock USDC token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    usdcToken = await MockERC20.deploy("USD Coin", "USDC", 6);
    await usdcToken.waitForDeployment();

    // Mint USDC to client
    await usdcToken.mint(client.address, INITIAL_USDC_BALANCE);

    // Deploy EscrowVault
    const EscrowVault = await ethers.getContractFactory("EscrowVault");
    escrowVault = await EscrowVault.deploy(
      await usdcToken.getAddress(),
      treasury.address
    );
    await escrowVault.waitForDeployment();

    // Set ProjectManager and DisputeDAO
    await escrowVault.setProjectManager(projectManager.address);
    await escrowVault.setDisputeDAO(disputeDAO.address);
  });

  describe("Deployment", function () {
    it("Should set the correct USDC token address", async function () {
      expect(await escrowVault.usdcToken()).to.equal(await usdcToken.getAddress());
    });

    it("Should set the correct treasury address", async function () {
      expect(await escrowVault.treasury()).to.equal(treasury.address);
    });

    it("Should set the correct owner", async function () {
      expect(await escrowVault.owner()).to.equal(owner.address);
    });

    it("Should have zero project manager and dispute DAO initially", async function () {
      const freshVault = await (await ethers.getContractFactory("EscrowVault")).deploy(
        await usdcToken.getAddress(),
        treasury.address
      );
      expect(await freshVault.projectManager()).to.equal(ethers.ZeroAddress);
      expect(await freshVault.disputeDAO()).to.equal(ethers.ZeroAddress);
    });

    it("Should revert if USDC address is zero", async function () {
      const EscrowVault = await ethers.getContractFactory("EscrowVault");
      await expect(
        EscrowVault.deploy(ethers.ZeroAddress, treasury.address)
      ).to.be.revertedWithCustomError(escrowVault, "InvalidAddress");
    });

    it("Should revert if treasury address is zero", async function () {
      const EscrowVault = await ethers.getContractFactory("EscrowVault");
      await expect(
        EscrowVault.deploy(await usdcToken.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(escrowVault, "InvalidAddress");
    });
  });

  describe("Deposit", function () {
    it("Should allow client to deposit funds", async function () {
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), PROJECT_BUDGET);

      await expect(escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET))
        .to.emit(escrowVault, "Deposited")
        .withArgs(PROJECT_ID, client.address, PROJECT_BUDGET, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));

      const escrowInfo = await escrowVault.getEscrowInfo(PROJECT_ID);
      expect(escrowInfo.projectId).to.equal(PROJECT_ID);
      expect(escrowInfo.client).to.equal(client.address);
      expect(escrowInfo.totalAmount).to.equal(PROJECT_BUDGET);
      expect(escrowInfo.releasedAmount).to.equal(0);
      expect(escrowInfo.disputed).to.equal(false);
    });

    it("Should transfer USDC from client to contract", async function () {
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), PROJECT_BUDGET);

      const clientBalanceBefore = await usdcToken.balanceOf(client.address);
      const contractBalanceBefore = await usdcToken.balanceOf(await escrowVault.getAddress());

      await escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET);

      expect(await usdcToken.balanceOf(client.address)).to.equal(clientBalanceBefore - PROJECT_BUDGET);
      expect(await usdcToken.balanceOf(await escrowVault.getAddress())).to.equal(contractBalanceBefore + PROJECT_BUDGET);
    });

    it("Should revert if amount is zero", async function () {
      await expect(
        escrowVault.connect(client).deposit(PROJECT_ID, 0)
      ).to.be.revertedWithCustomError(escrowVault, "InvalidAmount");
    });

    it("Should revert if escrow already exists for project", async function () {
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), PROJECT_BUDGET * 2n);
      await escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET);

      await expect(
        escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET)
      ).to.be.revertedWithCustomError(escrowVault, "EscrowAlreadyExists");
    });

    it("Should revert if client has insufficient USDC", async function () {
      const insufficientAmount = INITIAL_USDC_BALANCE + 1n;
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), insufficientAmount);

      await expect(
        escrowVault.connect(client).deposit(PROJECT_ID, insufficientAmount)
      ).to.be.reverted;
    });

    it("Should revert if client hasn't approved USDC", async function () {
      await expect(
        escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET)
      ).to.be.reverted;
    });
  });

  describe("Release", function () {
    beforeEach(async function () {
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), PROJECT_BUDGET);
      await escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET);
    });

    it("Should allow ProjectManager to release funds to developer", async function () {
      await expect(
        escrowVault.connect(projectManager).release(PROJECT_ID, developer.address, MILESTONE_PAYMENT)
      )
        .to.emit(escrowVault, "Released")
        .withArgs(PROJECT_ID, developer.address, MILESTONE_PAYMENT, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));

      const escrowInfo = await escrowVault.getEscrowInfo(PROJECT_ID);
      expect(escrowInfo.releasedAmount).to.equal(MILESTONE_PAYMENT);
    });

    it("Should transfer USDC to developer", async function () {
      const developerBalanceBefore = await usdcToken.balanceOf(developer.address);

      await escrowVault.connect(projectManager).release(PROJECT_ID, developer.address, MILESTONE_PAYMENT);

      expect(await usdcToken.balanceOf(developer.address)).to.equal(developerBalanceBefore + MILESTONE_PAYMENT);
    });

    it("Should update available balance correctly", async function () {
      const availableBefore = await escrowVault.getAvailableBalance(PROJECT_ID);
      await escrowVault.connect(projectManager).release(PROJECT_ID, developer.address, MILESTONE_PAYMENT);
      const availableAfter = await escrowVault.getAvailableBalance(PROJECT_ID);

      expect(availableAfter).to.equal(availableBefore - MILESTONE_PAYMENT);
    });

    it("Should allow multiple releases", async function () {
      await escrowVault.connect(projectManager).release(PROJECT_ID, developer.address, MILESTONE_PAYMENT);
      await escrowVault.connect(projectManager).release(PROJECT_ID, developer.address, MILESTONE_PAYMENT);

      const escrowInfo = await escrowVault.getEscrowInfo(PROJECT_ID);
      expect(escrowInfo.releasedAmount).to.equal(MILESTONE_PAYMENT * 2n);
    });

    it("Should revert if caller is not ProjectManager", async function () {
      await expect(
        escrowVault.connect(other).release(PROJECT_ID, developer.address, MILESTONE_PAYMENT)
      ).to.be.revertedWithCustomError(escrowVault, "Unauthorized");
    });

    it("Should revert if developer address is zero", async function () {
      await expect(
        escrowVault.connect(projectManager).release(PROJECT_ID, ethers.ZeroAddress, MILESTONE_PAYMENT)
      ).to.be.revertedWithCustomError(escrowVault, "InvalidAddress");
    });

    it("Should revert if amount is zero", async function () {
      await expect(
        escrowVault.connect(projectManager).release(PROJECT_ID, developer.address, 0)
      ).to.be.revertedWithCustomError(escrowVault, "InvalidAmount");
    });

    it("Should revert if escrow doesn't exist", async function () {
      await expect(
        escrowVault.connect(projectManager).release(999, developer.address, MILESTONE_PAYMENT)
      ).to.be.revertedWithCustomError(escrowVault, "EscrowNotFound");
    });

    it("Should revert if insufficient escrow balance", async function () {
      await expect(
        escrowVault.connect(projectManager).release(PROJECT_ID, developer.address, PROJECT_BUDGET + 1n)
      ).to.be.revertedWithCustomError(escrowVault, "InsufficientEscrowBalance");
    });

    it("Should revert if escrow is frozen", async function () {
      await escrowVault.connect(disputeDAO).freeze(PROJECT_ID);

      await expect(
        escrowVault.connect(projectManager).release(PROJECT_ID, developer.address, MILESTONE_PAYMENT)
      ).to.be.revertedWithCustomError(escrowVault, "EscrowFrozen");
    });
  });

  describe("ReleaseFee", function () {
    beforeEach(async function () {
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), PROJECT_BUDGET);
      await escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET);
    });

    it("Should allow ProjectManager to release fees to treasury", async function () {
      await expect(
        escrowVault.connect(projectManager).releaseFee(PROJECT_ID, PLATFORM_FEE)
      )
        .to.emit(escrowVault, "FeesCollected")
        .withArgs(PROJECT_ID, treasury.address, PLATFORM_FEE, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));
    });

    it("Should transfer USDC to treasury", async function () {
      const treasuryBalanceBefore = await usdcToken.balanceOf(treasury.address);

      await escrowVault.connect(projectManager).releaseFee(PROJECT_ID, PLATFORM_FEE);

      expect(await usdcToken.balanceOf(treasury.address)).to.equal(treasuryBalanceBefore + PLATFORM_FEE);
    });

    it("Should update released amount", async function () {
      await escrowVault.connect(projectManager).releaseFee(PROJECT_ID, PLATFORM_FEE);

      const escrowInfo = await escrowVault.getEscrowInfo(PROJECT_ID);
      expect(escrowInfo.releasedAmount).to.equal(PLATFORM_FEE);
    });

    it("Should revert if caller is not ProjectManager", async function () {
      await expect(
        escrowVault.connect(other).releaseFee(PROJECT_ID, PLATFORM_FEE)
      ).to.be.revertedWithCustomError(escrowVault, "Unauthorized");
    });

    it("Should revert if amount is zero", async function () {
      await expect(
        escrowVault.connect(projectManager).releaseFee(PROJECT_ID, 0)
      ).to.be.revertedWithCustomError(escrowVault, "InvalidAmount");
    });

    it("Should revert if insufficient balance", async function () {
      await expect(
        escrowVault.connect(projectManager).releaseFee(PROJECT_ID, PROJECT_BUDGET + 1n)
      ).to.be.revertedWithCustomError(escrowVault, "InsufficientEscrowBalance");
    });

    it("Should revert if escrow is frozen", async function () {
      await escrowVault.connect(disputeDAO).freeze(PROJECT_ID);

      await expect(
        escrowVault.connect(projectManager).releaseFee(PROJECT_ID, PLATFORM_FEE)
      ).to.be.revertedWithCustomError(escrowVault, "EscrowFrozen");
    });
  });

  describe("Freeze", function () {
    beforeEach(async function () {
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), PROJECT_BUDGET);
      await escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET);
    });

    it("Should allow DisputeDAO to freeze escrow", async function () {
      await expect(escrowVault.connect(disputeDAO).freeze(PROJECT_ID))
        .to.emit(escrowVault, "Frozen")
        .withArgs(PROJECT_ID, disputeDAO.address, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));

      const escrowInfo = await escrowVault.getEscrowInfo(PROJECT_ID);
      expect(escrowInfo.disputed).to.equal(true);
    });

    it("Should revert if caller is not DisputeDAO", async function () {
      await expect(
        escrowVault.connect(other).freeze(PROJECT_ID)
      ).to.be.revertedWithCustomError(escrowVault, "Unauthorized");
    });

    it("Should revert if escrow doesn't exist", async function () {
      await expect(
        escrowVault.connect(disputeDAO).freeze(999)
      ).to.be.revertedWithCustomError(escrowVault, "EscrowNotFound");
    });

    it("Should revert if escrow is already frozen", async function () {
      await escrowVault.connect(disputeDAO).freeze(PROJECT_ID);

      await expect(
        escrowVault.connect(disputeDAO).freeze(PROJECT_ID)
      ).to.be.revertedWithCustomError(escrowVault, "EscrowFrozen");
    });
  });

  describe("Unfreeze", function () {
    beforeEach(async function () {
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), PROJECT_BUDGET);
      await escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET);
      await escrowVault.connect(disputeDAO).freeze(PROJECT_ID);
    });

    it("Should allow DisputeDAO to unfreeze escrow", async function () {
      await expect(escrowVault.connect(disputeDAO).unfreeze(PROJECT_ID))
        .to.emit(escrowVault, "Unfrozen")
        .withArgs(PROJECT_ID, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));

      const escrowInfo = await escrowVault.getEscrowInfo(PROJECT_ID);
      expect(escrowInfo.disputed).to.equal(false);
    });

    it("Should revert if caller is not DisputeDAO", async function () {
      await expect(
        escrowVault.connect(other).unfreeze(PROJECT_ID)
      ).to.be.revertedWithCustomError(escrowVault, "Unauthorized");
    });

    it("Should revert if escrow is not frozen", async function () {
      await escrowVault.connect(disputeDAO).unfreeze(PROJECT_ID);

      await expect(
        escrowVault.connect(disputeDAO).unfreeze(PROJECT_ID)
      ).to.be.revertedWithCustomError(escrowVault, "EscrowNotFrozen");
    });
  });

  describe("ResolveDispute", function () {
    const CLIENT_SHARE = ethers.parseUnits("2000", 6);
    const DEVELOPER_SHARE = ethers.parseUnits("3000", 6);

    beforeEach(async function () {
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), PROJECT_BUDGET);
      await escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET);
      await escrowVault.connect(disputeDAO).freeze(PROJECT_ID);
    });

    it("Should allow DisputeDAO to resolve dispute", async function () {
      await expect(
        escrowVault.connect(disputeDAO).resolveDispute(PROJECT_ID, developer.address, CLIENT_SHARE, DEVELOPER_SHARE)
      )
        .to.emit(escrowVault, "DisputeResolved")
        .withArgs(PROJECT_ID, CLIENT_SHARE, DEVELOPER_SHARE, await ethers.provider.getBlock('latest').then(b => b.timestamp + 1));
    });

    it("Should transfer client share to client", async function () {
      const clientBalanceBefore = await usdcToken.balanceOf(client.address);

      await escrowVault.connect(disputeDAO).resolveDispute(PROJECT_ID, developer.address, CLIENT_SHARE, DEVELOPER_SHARE);

      expect(await usdcToken.balanceOf(client.address)).to.equal(clientBalanceBefore + CLIENT_SHARE);
    });

    it("Should transfer developer share to developer", async function () {
      const developerBalanceBefore = await usdcToken.balanceOf(developer.address);

      await escrowVault.connect(disputeDAO).resolveDispute(PROJECT_ID, developer.address, CLIENT_SHARE, DEVELOPER_SHARE);

      expect(await usdcToken.balanceOf(developer.address)).to.equal(developerBalanceBefore + DEVELOPER_SHARE);
    });

    it("Should update released amount", async function () {
      await escrowVault.connect(disputeDAO).resolveDispute(PROJECT_ID, developer.address, CLIENT_SHARE, DEVELOPER_SHARE);

      const escrowInfo = await escrowVault.getEscrowInfo(PROJECT_ID);
      expect(escrowInfo.releasedAmount).to.equal(CLIENT_SHARE + DEVELOPER_SHARE);
    });

    it("Should unfreeze escrow after resolution", async function () {
      await escrowVault.connect(disputeDAO).resolveDispute(PROJECT_ID, developer.address, CLIENT_SHARE, DEVELOPER_SHARE);

      const escrowInfo = await escrowVault.getEscrowInfo(PROJECT_ID);
      expect(escrowInfo.disputed).to.equal(false);
    });

    it("Should allow zero client share", async function () {
      await expect(
        escrowVault.connect(disputeDAO).resolveDispute(PROJECT_ID, developer.address, 0, DEVELOPER_SHARE)
      ).to.not.be.reverted;
    });

    it("Should allow zero developer share", async function () {
      await expect(
        escrowVault.connect(disputeDAO).resolveDispute(PROJECT_ID, developer.address, CLIENT_SHARE, 0)
      ).to.not.be.reverted;
    });

    it("Should revert if caller is not DisputeDAO", async function () {
      await expect(
        escrowVault.connect(other).resolveDispute(PROJECT_ID, developer.address, CLIENT_SHARE, DEVELOPER_SHARE)
      ).to.be.revertedWithCustomError(escrowVault, "Unauthorized");
    });

    it("Should revert if escrow is not frozen", async function () {
      await escrowVault.connect(disputeDAO).unfreeze(PROJECT_ID);

      await expect(
        escrowVault.connect(disputeDAO).resolveDispute(PROJECT_ID, developer.address, CLIENT_SHARE, DEVELOPER_SHARE)
      ).to.be.revertedWithCustomError(escrowVault, "EscrowNotFrozen");
    });

    it("Should revert if developer address is zero", async function () {
      await expect(
        escrowVault.connect(disputeDAO).resolveDispute(PROJECT_ID, ethers.ZeroAddress, CLIENT_SHARE, DEVELOPER_SHARE)
      ).to.be.revertedWithCustomError(escrowVault, "InvalidAddress");
    });

    it("Should revert if total shares exceed remaining balance", async function () {
      const excessiveShare = PROJECT_BUDGET + 1n;

      await expect(
        escrowVault.connect(disputeDAO).resolveDispute(PROJECT_ID, developer.address, excessiveShare, 0)
      ).to.be.revertedWithCustomError(escrowVault, "InsufficientEscrowBalance");
    });
  });

  describe("Configuration Updates", function () {
    it("Should allow owner to update ProjectManager", async function () {
      const newManager = other.address;

      await expect(escrowVault.setProjectManager(newManager))
        .to.emit(escrowVault, "ProjectManagerUpdated")
        .withArgs(projectManager.address, newManager);

      expect(await escrowVault.projectManager()).to.equal(newManager);
    });

    it("Should allow owner to update DisputeDAO", async function () {
      const newDAO = other.address;

      await expect(escrowVault.setDisputeDAO(newDAO))
        .to.emit(escrowVault, "DisputeDAOUpdated")
        .withArgs(disputeDAO.address, newDAO);

      expect(await escrowVault.disputeDAO()).to.equal(newDAO);
    });

    it("Should allow owner to update Treasury", async function () {
      const newTreasury = other.address;

      await expect(escrowVault.setTreasury(newTreasury))
        .to.emit(escrowVault, "TreasuryUpdated")
        .withArgs(treasury.address, newTreasury);

      expect(await escrowVault.treasury()).to.equal(newTreasury);
    });

    it("Should revert if non-owner tries to update ProjectManager", async function () {
      await expect(
        escrowVault.connect(other).setProjectManager(other.address)
      ).to.be.revertedWithCustomError(escrowVault, "OwnableUnauthorizedAccount");
    });

    it("Should revert if setting ProjectManager to zero address", async function () {
      await expect(
        escrowVault.setProjectManager(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(escrowVault, "InvalidAddress");
    });

    it("Should revert if setting DisputeDAO to zero address", async function () {
      await expect(
        escrowVault.setDisputeDAO(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(escrowVault, "InvalidAddress");
    });

    it("Should revert if setting Treasury to zero address", async function () {
      await expect(
        escrowVault.setTreasury(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(escrowVault, "InvalidAddress");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), PROJECT_BUDGET);
      await escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET);
    });

    it("Should return correct escrow info", async function () {
      const info = await escrowVault.getEscrowInfo(PROJECT_ID);

      expect(info.projectId).to.equal(PROJECT_ID);
      expect(info.client).to.equal(client.address);
      expect(info.totalAmount).to.equal(PROJECT_BUDGET);
      expect(info.releasedAmount).to.equal(0);
      expect(info.disputed).to.equal(false);
    });

    it("Should return correct available balance", async function () {
      expect(await escrowVault.getAvailableBalance(PROJECT_ID)).to.equal(PROJECT_BUDGET);

      await escrowVault.connect(projectManager).release(PROJECT_ID, developer.address, MILESTONE_PAYMENT);

      expect(await escrowVault.getAvailableBalance(PROJECT_ID)).to.equal(PROJECT_BUDGET - MILESTONE_PAYMENT);
    });

    it("Should revert getAvailableBalance for non-existent escrow", async function () {
      await expect(
        escrowVault.getAvailableBalance(999)
      ).to.be.revertedWithCustomError(escrowVault, "EscrowNotFound");
    });
  });

  describe("Gas Optimization", function () {
    it("Should use reasonable gas for deposit", async function () {
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), PROJECT_BUDGET);

      const tx = await escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET);
      const receipt = await tx.wait();

      console.log(`      Gas used for deposit: ${receipt.gasUsed}`);
      expect(receipt.gasUsed).to.be.lessThan(150000n);
    });

    it("Should use reasonable gas for release", async function () {
      await usdcToken.connect(client).approve(await escrowVault.getAddress(), PROJECT_BUDGET);
      await escrowVault.connect(client).deposit(PROJECT_ID, PROJECT_BUDGET);

      const tx = await escrowVault.connect(projectManager).release(PROJECT_ID, developer.address, MILESTONE_PAYMENT);
      const receipt = await tx.wait();

      console.log(`      Gas used for release: ${receipt.gasUsed}`);
      expect(receipt.gasUsed).to.be.lessThan(100000n);
    });
  });
});
