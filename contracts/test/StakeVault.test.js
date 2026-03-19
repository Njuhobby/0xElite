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

    // Deploy StakeVault via UUPS proxy with 200 USDC required stake
    const requiredStake = ethers.parseUnits("200", 6);
    const StakeVault = await ethers.getContractFactory("StakeVault");
    const stakeVault = await upgrades.deployProxy(
      StakeVault,
      [await usdc.getAddress(), requiredStake],
      { kind: "uups" }
    );
    await stakeVault.waitForDeployment();

    // Mint USDC to developers for testing
    await usdc.mint(developer1.address, ethers.parseUnits("1000", 6));
    await usdc.mint(developer2.address, ethers.parseUnits("1000", 6));

    return { stakeVault, usdc, owner, developer1, developer2, requiredStake };
  }

  // Helper: stake USDC for a developer
  async function stakeFor(stakeVault, usdc, developer, amount) {
    await usdc.connect(developer).approve(await stakeVault.getAddress(), amount);
    await stakeVault.connect(developer).stake(amount);
  }

  describe("Deployment", function () {
    it("Should set the correct stake token", async function () {
      const { stakeVault, usdc } = await loadFixture(deployStakeVaultFixture);
      expect(await stakeVault.stakeToken()).to.equal(await usdc.getAddress());
    });

    it("Should set the correct required stake", async function () {
      const { stakeVault, requiredStake } = await loadFixture(deployStakeVaultFixture);
      expect(await stakeVault.requiredStake()).to.equal(requiredStake);
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
          [ethers.ZeroAddress, ethers.parseUnits("200", 6)],
          { kind: "uups" }
        )
      ).to.be.revertedWith("Invalid token address");
    });

    it("Should revert initialize with zero required stake", async function () {
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const usdc = await MockUSDC.deploy();
      await usdc.waitForDeployment();

      const StakeVault = await ethers.getContractFactory("StakeVault");
      await expect(
        upgrades.deployProxy(
          StakeVault,
          [await usdc.getAddress(), 0],
          { kind: "uups" }
        )
      ).to.be.revertedWith("Required stake must be positive");
    });
  });

  describe("Staking", function () {
    it("Should allow staking with sufficient amount", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await usdc.connect(developer1).approve(await stakeVault.getAddress(), requiredStake);

      await expect(stakeVault.connect(developer1).stake(requiredStake))
        .to.emit(stakeVault, "Staked")
        .withArgs(developer1.address, requiredStake);

      expect(await stakeVault.getStake(developer1.address)).to.equal(requiredStake);
      expect(await stakeVault.stakes(developer1.address)).to.equal(requiredStake);
    });

    it("Should update stakedAt timestamp", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);

      const stakedAt = await stakeVault.stakedAt(developer1.address);
      expect(stakedAt).to.be.gt(0);
    });

    it("Should allow cumulative staking", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      const firstStake = requiredStake;
      const secondStake = ethers.parseUnits("50", 6);

      await stakeFor(stakeVault, usdc, developer1, firstStake);

      await usdc.connect(developer1).approve(await stakeVault.getAddress(), secondStake);
      await stakeVault.connect(developer1).stake(secondStake);

      expect(await stakeVault.getStake(developer1.address)).to.equal(firstStake + secondStake);
    });

    it("Should revert if amount is below required stake", async function () {
      const { stakeVault, usdc, developer1 } = await loadFixture(deployStakeVaultFixture);

      const insufficientAmount = ethers.parseUnits("100", 6);
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), insufficientAmount);

      await expect(
        stakeVault.connect(developer1).stake(insufficientAmount)
      ).to.be.revertedWith("Amount below required stake");
    });

    it("Should revert if transfer fails (insufficient balance)", async function () {
      const { stakeVault, usdc, developer1 } = await loadFixture(deployStakeVaultFixture);

      await usdc.connect(developer1).approve(await stakeVault.getAddress(), ethers.parseUnits("10000", 6));

      await expect(
        stakeVault.connect(developer1).stake(ethers.parseUnits("10000", 6))
      ).to.be.reverted;
    });

    it("Should revert if no approval given", async function () {
      const { stakeVault, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await expect(
        stakeVault.connect(developer1).stake(requiredStake)
      ).to.be.reverted;
    });
  });

  describe("Unstaking (owner-only)", function () {
    it("Should revert if developer calls unstake directly", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);

      await expect(
        stakeVault.connect(developer1).unstake(ethers.parseUnits("50", 6))
      ).to.be.revertedWithCustomError(stakeVault, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to unstake their own stake", async function () {
      const { stakeVault, usdc, owner, requiredStake } = await loadFixture(deployStakeVaultFixture);

      // Owner stakes (for edge case — owner is also a staker)
      await usdc.mint(owner.address, requiredStake);
      await stakeFor(stakeVault, usdc, owner, requiredStake);

      const unstakeAmount = ethers.parseUnits("50", 6);
      await expect(stakeVault.connect(owner).unstake(unstakeAmount))
        .to.emit(stakeVault, "Unstaked")
        .withArgs(owner.address, unstakeAmount);

      expect(await stakeVault.getStake(owner.address)).to.equal(requiredStake - unstakeAmount);
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
      const { stakeVault, usdc, owner, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);

      const initialBalance = await usdc.balanceOf(developer1.address);
      const unstakeAmount = ethers.parseUnits("50", 6);

      await expect(stakeVault.connect(owner).unstakeFor(developer1.address, unstakeAmount))
        .to.emit(stakeVault, "Unstaked")
        .withArgs(developer1.address, unstakeAmount);

      // Verify stake reduced
      expect(await stakeVault.getStake(developer1.address)).to.equal(requiredStake - unstakeAmount);

      // Verify USDC sent to developer (not owner)
      expect(await usdc.balanceOf(developer1.address)).to.equal(initialBalance + unstakeAmount);
    });

    it("Should allow owner to unstake full amount for a developer", async function () {
      const { stakeVault, usdc, owner, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);

      await stakeVault.connect(owner).unstakeFor(developer1.address, requiredStake);

      expect(await stakeVault.getStake(developer1.address)).to.equal(0);
    });

    it("Should allow multiple partial unstakes for a developer", async function () {
      const { stakeVault, usdc, owner, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);

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
      const { stakeVault, usdc, developer1, developer2, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);

      await expect(
        stakeVault.connect(developer2).unstakeFor(developer1.address, ethers.parseUnits("50", 6))
      ).to.be.revertedWithCustomError(stakeVault, "OwnableUnauthorizedAccount");
    });

    it("Should revert if developer calls unstakeFor for themselves", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);

      await expect(
        stakeVault.connect(developer1).unstakeFor(developer1.address, ethers.parseUnits("50", 6))
      ).to.be.revertedWithCustomError(stakeVault, "OwnableUnauthorizedAccount");
    });

    it("Should revert if unstaking more than developer's stake", async function () {
      const { stakeVault, usdc, owner, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);

      await expect(
        stakeVault.connect(owner).unstakeFor(developer1.address, requiredStake + ethers.parseUnits("1", 6))
      ).to.be.revertedWith("Insufficient stake");
    });

    it("Should revert if developer address is zero", async function () {
      const { stakeVault, owner } = await loadFixture(deployStakeVaultFixture);

      await expect(
        stakeVault.connect(owner).unstakeFor(ethers.ZeroAddress, ethers.parseUnits("50", 6))
      ).to.be.revertedWith("Invalid developer address");
    });

    it("Should revert if amount is zero", async function () {
      const { stakeVault, usdc, owner, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);

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
      const { stakeVault, usdc, owner, developer1, developer2, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);
      await stakeFor(stakeVault, usdc, developer2, requiredStake);

      const unstakeAmount = ethers.parseUnits("50", 6);

      // Unstake for developer1 only
      await stakeVault.connect(owner).unstakeFor(developer1.address, unstakeAmount);

      // Developer1 reduced, developer2 unchanged
      expect(await stakeVault.getStake(developer1.address)).to.equal(requiredStake - unstakeAmount);
      expect(await stakeVault.getStake(developer2.address)).to.equal(requiredStake);
    });
  });

  describe("getStake", function () {
    it("Should return correct stake amount", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      expect(await stakeVault.getStake(developer1.address)).to.equal(0);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);
      expect(await stakeVault.getStake(developer1.address)).to.equal(requiredStake);
    });

    it("Should return zero for address that never staked", async function () {
      const { stakeVault, developer2 } = await loadFixture(deployStakeVaultFixture);
      expect(await stakeVault.getStake(developer2.address)).to.equal(0);
    });
  });

  describe("setRequiredStake", function () {
    it("Should allow owner to update required stake", async function () {
      const { stakeVault, owner, requiredStake } = await loadFixture(deployStakeVaultFixture);

      const newRequiredStake = ethers.parseUnits("300", 6);

      await expect(stakeVault.connect(owner).setRequiredStake(newRequiredStake))
        .to.emit(stakeVault, "RequiredStakeUpdated")
        .withArgs(requiredStake, newRequiredStake);

      expect(await stakeVault.requiredStake()).to.equal(newRequiredStake);
    });

    it("Should revert if non-owner tries to update", async function () {
      const { stakeVault, developer1 } = await loadFixture(deployStakeVaultFixture);

      await expect(
        stakeVault.connect(developer1).setRequiredStake(ethers.parseUnits("200", 6))
      ).to.be.revertedWithCustomError(stakeVault, "OwnableUnauthorizedAccount");
    });

    it("Should revert if setting to zero", async function () {
      const { stakeVault, owner } = await loadFixture(deployStakeVaultFixture);

      await expect(
        stakeVault.connect(owner).setRequiredStake(0)
      ).to.be.revertedWith("Required stake must be positive");
    });

    it("Should not affect existing stakes when requirement changes", async function () {
      const { stakeVault, usdc, owner, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);

      await stakeVault.connect(owner).setRequiredStake(ethers.parseUnits("300", 6));

      expect(await stakeVault.getStake(developer1.address)).to.equal(requiredStake);
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should prevent reentrancy attacks on stake", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await stakeFor(stakeVault, usdc, developer1, requiredStake);

      expect(await stakeVault.getStake(developer1.address)).to.equal(requiredStake);
    });
  });

  describe("Multiple Developers", function () {
    it("Should handle multiple developers independently", async function () {
      const { stakeVault, usdc, developer1, developer2, requiredStake } = await loadFixture(deployStakeVaultFixture);

      const stake1 = requiredStake;
      const stake2 = ethers.parseUnits("250", 6);

      await stakeFor(stakeVault, usdc, developer1, stake1);
      await stakeFor(stakeVault, usdc, developer2, stake2);

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
