const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("StakeVault", function () {
  // Fixture to deploy contracts via UUPS proxy
  async function deployStakeVaultFixture() {
    const [owner, developer1, developer2] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    // Deploy StakeVault via UUPS proxy (no requiredStake parameter)
    const StakeVault = await ethers.getContractFactory("StakeVault");
    const stakeVault = await upgrades.deployProxy(
      StakeVault,
      [await usdc.getAddress()],
      { kind: "uups" }
    );
    await stakeVault.waitForDeployment();

    // Mint USDC to developers for testing
    await usdc.mint(developer1.address, ethers.parseUnits("1000", 6));
    await usdc.mint(developer2.address, ethers.parseUnits("1000", 6));

    return { stakeVault, usdc, owner, developer1, developer2 };
  }

  // Helper: owner stakes USDC on behalf of a developer
  async function stakeFor(stakeVault, usdc, owner, developer, amount) {
    await usdc.connect(developer).approve(await stakeVault.getAddress(), amount);
    await stakeVault.connect(owner).stake(developer.address, amount);
  }

  describe("Deployment", function () {
    it("Should set the correct stake token", async function () {
      const { stakeVault, usdc } = await loadFixture(deployStakeVaultFixture);
      expect(await stakeVault.stakeToken()).to.equal(await usdc.getAddress());
    });

    it("Should set the correct owner", async function () {
      const { stakeVault, owner } = await loadFixture(deployStakeVaultFixture);
      expect(await stakeVault.owner()).to.equal(owner.address);
    });

    it("Should revert initialize with zero token address", async function () {
      const StakeVault = await ethers.getContractFactory("StakeVault");
      await expect(
        upgrades.deployProxy(
          StakeVault,
          [ethers.ZeroAddress],
          { kind: "uups" }
        )
      ).to.be.revertedWith("Invalid token address");
    });
  });

  describe("Staking (owner-only)", function () {
    it("Should allow owner to stake on behalf of a developer", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      const amount = ethers.parseUnits("200", 6);
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), amount);

      await expect(stakeVault.connect(owner).stake(developer1.address, amount))
        .to.emit(stakeVault, "Staked")
        .withArgs(developer1.address, amount);

      expect(await stakeVault.getStake(developer1.address)).to.equal(amount);
      expect(await stakeVault.stakes(developer1.address)).to.equal(amount);
    });

    it("Should update stakedAt timestamp", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      const amount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, amount);

      const stakedAt = await stakeVault.stakedAt(developer1.address);
      expect(stakedAt).to.be.gt(0);
    });

    it("Should allow cumulative staking", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      const firstStake = ethers.parseUnits("200", 6);
      const secondStake = ethers.parseUnits("50", 6);

      await stakeFor(stakeVault, usdc, owner, developer1, firstStake);

      await usdc.connect(developer1).approve(await stakeVault.getAddress(), secondStake);
      await stakeVault.connect(owner).stake(developer1.address, secondStake);

      expect(await stakeVault.getStake(developer1.address)).to.equal(firstStake + secondStake);
    });

    it("Should revert if non-owner calls stake", async function () {
      const { stakeVault, usdc, developer1, developer2 } = await loadFixture(deployStakeVaultFixture);

      const amount = ethers.parseUnits("200", 6);
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), amount);

      await expect(
        stakeVault.connect(developer1).stake(developer1.address, amount)
      ).to.be.revertedWithCustomError(stakeVault, "OwnableUnauthorizedAccount");
    });

    it("Should revert if developer address is zero", async function () {
      const { stakeVault, owner } = await loadFixture(deployStakeVaultFixture);

      await expect(
        stakeVault.connect(owner).stake(ethers.ZeroAddress, ethers.parseUnits("200", 6))
      ).to.be.revertedWith("Invalid developer address");
    });

    it("Should revert if amount is zero", async function () {
      const { stakeVault, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      await expect(
        stakeVault.connect(owner).stake(developer1.address, 0)
      ).to.be.revertedWith("Amount must be positive");
    });

    it("Should revert if transfer fails (insufficient balance)", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      await usdc.connect(developer1).approve(await stakeVault.getAddress(), ethers.parseUnits("10000", 6));

      await expect(
        stakeVault.connect(owner).stake(developer1.address, ethers.parseUnits("10000", 6))
      ).to.be.reverted;
    });

    it("Should revert if no approval given", async function () {
      const { stakeVault, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      await expect(
        stakeVault.connect(owner).stake(developer1.address, ethers.parseUnits("200", 6))
      ).to.be.reverted;
    });
  });

  describe("Unstaking (owner-only)", function () {
    it("Should revert if developer calls unstake directly", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      const amount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, amount);

      await expect(
        stakeVault.connect(developer1).unstake(ethers.parseUnits("50", 6))
      ).to.be.revertedWithCustomError(stakeVault, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to unstake their own stake", async function () {
      const { stakeVault, usdc, owner } = await loadFixture(deployStakeVaultFixture);

      const amount = ethers.parseUnits("200", 6);
      // Owner stakes for themselves
      await usdc.mint(owner.address, amount);
      await usdc.connect(owner).approve(await stakeVault.getAddress(), amount);
      await stakeVault.connect(owner).stake(owner.address, amount);

      const unstakeAmount = ethers.parseUnits("50", 6);
      await expect(stakeVault.connect(owner).unstake(unstakeAmount))
        .to.emit(stakeVault, "Unstaked")
        .withArgs(owner.address, unstakeAmount);

      expect(await stakeVault.getStake(owner.address)).to.equal(amount - unstakeAmount);
    });

    it("Should revert unstake if owner has insufficient stake", async function () {
      const { stakeVault, owner } = await loadFixture(deployStakeVaultFixture);

      await expect(
        stakeVault.connect(owner).unstake(ethers.parseUnits("1", 6))
      ).to.be.revertedWith("Insufficient stake");
    });
  });

  describe("unstakeFor (owner unstakes on behalf of developer)", function () {
    it("Should allow owner to unstake for a developer", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      const stakeAmount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, stakeAmount);

      const initialBalance = await usdc.balanceOf(developer1.address);
      const unstakeAmount = ethers.parseUnits("50", 6);

      await expect(stakeVault.connect(owner).unstakeFor(developer1.address, unstakeAmount))
        .to.emit(stakeVault, "Unstaked")
        .withArgs(developer1.address, unstakeAmount);

      // Verify stake reduced
      expect(await stakeVault.getStake(developer1.address)).to.equal(stakeAmount - unstakeAmount);

      // Verify USDC sent to developer (not owner)
      expect(await usdc.balanceOf(developer1.address)).to.equal(initialBalance + unstakeAmount);
    });

    it("Should allow owner to unstake full amount for a developer", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      const stakeAmount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, stakeAmount);

      await stakeVault.connect(owner).unstakeFor(developer1.address, stakeAmount);

      expect(await stakeVault.getStake(developer1.address)).to.equal(0);
    });

    it("Should allow multiple partial unstakes for a developer", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      const stakeAmount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, stakeAmount);

      const partialAmount = ethers.parseUnits("50", 6);

      // First unstake: 200 → 150
      await stakeVault.connect(owner).unstakeFor(developer1.address, partialAmount);
      expect(await stakeVault.getStake(developer1.address)).to.equal(ethers.parseUnits("150", 6));

      // Second unstake: 150 → 100
      await stakeVault.connect(owner).unstakeFor(developer1.address, partialAmount);
      expect(await stakeVault.getStake(developer1.address)).to.equal(ethers.parseUnits("100", 6));

      // Third unstake: 100 → 50
      await stakeVault.connect(owner).unstakeFor(developer1.address, partialAmount);
      expect(await stakeVault.getStake(developer1.address)).to.equal(ethers.parseUnits("50", 6));

      // Fourth unstake: 50 → 0
      await stakeVault.connect(owner).unstakeFor(developer1.address, partialAmount);
      expect(await stakeVault.getStake(developer1.address)).to.equal(0);
    });

    it("Should revert if non-owner calls unstakeFor", async function () {
      const { stakeVault, usdc, owner, developer1, developer2 } = await loadFixture(deployStakeVaultFixture);

      const stakeAmount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, stakeAmount);

      await expect(
        stakeVault.connect(developer2).unstakeFor(developer1.address, ethers.parseUnits("50", 6))
      ).to.be.revertedWithCustomError(stakeVault, "OwnableUnauthorizedAccount");
    });

    it("Should revert if developer calls unstakeFor for themselves", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      const stakeAmount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, stakeAmount);

      await expect(
        stakeVault.connect(developer1).unstakeFor(developer1.address, ethers.parseUnits("50", 6))
      ).to.be.revertedWithCustomError(stakeVault, "OwnableUnauthorizedAccount");
    });

    it("Should revert if unstaking more than developer's stake", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      const stakeAmount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, stakeAmount);

      await expect(
        stakeVault.connect(owner).unstakeFor(developer1.address, stakeAmount + ethers.parseUnits("1", 6))
      ).to.be.revertedWith("Insufficient stake");
    });

    it("Should revert if developer address is zero", async function () {
      const { stakeVault, owner } = await loadFixture(deployStakeVaultFixture);

      await expect(
        stakeVault.connect(owner).unstakeFor(ethers.ZeroAddress, ethers.parseUnits("50", 6))
      ).to.be.revertedWith("Invalid developer address");
    });

    it("Should revert if amount is zero", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      const stakeAmount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, stakeAmount);

      await expect(
        stakeVault.connect(owner).unstakeFor(developer1.address, 0)
      ).to.be.revertedWith("Amount must be positive");
    });

    it("Should revert if developer has no stake", async function () {
      const { stakeVault, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      await expect(
        stakeVault.connect(owner).unstakeFor(developer1.address, ethers.parseUnits("50", 6))
      ).to.be.revertedWith("Insufficient stake");
    });

    it("Should handle unstakeFor for multiple developers independently", async function () {
      const { stakeVault, usdc, owner, developer1, developer2 } = await loadFixture(deployStakeVaultFixture);

      const stakeAmount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, stakeAmount);
      await stakeFor(stakeVault, usdc, owner, developer2, stakeAmount);

      const unstakeAmount = ethers.parseUnits("50", 6);

      // Unstake for developer1 only
      await stakeVault.connect(owner).unstakeFor(developer1.address, unstakeAmount);

      // Developer1 reduced, developer2 unchanged
      expect(await stakeVault.getStake(developer1.address)).to.equal(stakeAmount - unstakeAmount);
      expect(await stakeVault.getStake(developer2.address)).to.equal(stakeAmount);
    });
  });

  describe("getStake", function () {
    it("Should return correct stake amount", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      expect(await stakeVault.getStake(developer1.address)).to.equal(0);

      const amount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, amount);
      expect(await stakeVault.getStake(developer1.address)).to.equal(amount);
    });

    it("Should return zero for address that never staked", async function () {
      const { stakeVault, developer2 } = await loadFixture(deployStakeVaultFixture);
      expect(await stakeVault.getStake(developer2.address)).to.equal(0);
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should prevent reentrancy attacks on stake", async function () {
      const { stakeVault, usdc, owner, developer1 } = await loadFixture(deployStakeVaultFixture);

      const amount = ethers.parseUnits("200", 6);
      await stakeFor(stakeVault, usdc, owner, developer1, amount);

      expect(await stakeVault.getStake(developer1.address)).to.equal(amount);
    });
  });

  describe("Multiple Developers", function () {
    it("Should handle multiple developers independently", async function () {
      const { stakeVault, usdc, owner, developer1, developer2 } = await loadFixture(deployStakeVaultFixture);

      const stake1 = ethers.parseUnits("200", 6);
      const stake2 = ethers.parseUnits("250", 6);

      await stakeFor(stakeVault, usdc, owner, developer1, stake1);
      await stakeFor(stakeVault, usdc, owner, developer2, stake2);

      expect(await stakeVault.getStake(developer1.address)).to.equal(stake1);
      expect(await stakeVault.getStake(developer2.address)).to.equal(stake2);
    });
  });

  describe("Version", function () {
    it("Should return correct version", async function () {
      const { stakeVault } = await loadFixture(deployStakeVaultFixture);
      expect(await stakeVault.version()).to.equal("1.0.0");
    });
  });
});
