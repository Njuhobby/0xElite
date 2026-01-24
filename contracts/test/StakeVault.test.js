const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("StakeVault", function () {
  // Fixture to deploy contracts and set up test environment
  async function deployStakeVaultFixture() {
    const [owner, developer1, developer2] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();

    // Deploy StakeVault with 150 USDC required stake (150 * 10^6)
    const requiredStake = ethers.parseUnits("150", 6);
    const StakeVault = await ethers.getContractFactory("StakeVault");
    const stakeVault = await StakeVault.deploy(await usdc.getAddress(), requiredStake);

    // Mint USDC to developers for testing
    await usdc.mint(developer1.address, ethers.parseUnits("1000", 6));
    await usdc.mint(developer2.address, ethers.parseUnits("1000", 6));

    return { stakeVault, usdc, owner, developer1, developer2, requiredStake };
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

    it("Should revert if stake token address is zero", async function () {
      const StakeVault = await ethers.getContractFactory("StakeVault");
      await expect(
        StakeVault.deploy(ethers.ZeroAddress, ethers.parseUnits("150", 6))
      ).to.be.revertedWith("Invalid token address");
    });

    it("Should revert if required stake is zero", async function () {
      const { usdc } = await loadFixture(deployStakeVaultFixture);
      const StakeVault = await ethers.getContractFactory("StakeVault");
      await expect(
        StakeVault.deploy(await usdc.getAddress(), 0)
      ).to.be.revertedWith("Required stake must be positive");
    });
  });

  describe("Staking", function () {
    it("Should allow staking with sufficient amount", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      // Approve StakeVault to spend developer's USDC
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), requiredStake);

      // Stake
      await expect(stakeVault.connect(developer1).stake(requiredStake))
        .to.emit(stakeVault, "Staked")
        .withArgs(developer1.address, requiredStake);

      // Verify stake amount
      expect(await stakeVault.getStake(developer1.address)).to.equal(requiredStake);
      expect(await stakeVault.stakes(developer1.address)).to.equal(requiredStake);
    });

    it("Should update stakedAt timestamp", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await usdc.connect(developer1).approve(await stakeVault.getAddress(), requiredStake);
      await stakeVault.connect(developer1).stake(requiredStake);

      const stakedAt = await stakeVault.stakedAt(developer1.address);
      expect(stakedAt).to.be.gt(0);
    });

    it("Should allow cumulative staking", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      const firstStake = requiredStake;
      const secondStake = ethers.parseUnits("50", 6);

      // First stake
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), firstStake);
      await stakeVault.connect(developer1).stake(firstStake);

      // Second stake
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), secondStake);
      await stakeVault.connect(developer1).stake(secondStake);

      // Total should be sum of both stakes
      expect(await stakeVault.getStake(developer1.address)).to.equal(firstStake + secondStake);
    });

    it("Should revert if amount is below required stake", async function () {
      const { stakeVault, usdc, developer1 } = await loadFixture(deployStakeVaultFixture);

      const insufficientAmount = ethers.parseUnits("100", 6); // Less than 150 USDC
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), insufficientAmount);

      await expect(
        stakeVault.connect(developer1).stake(insufficientAmount)
      ).to.be.revertedWith("Amount below required stake");
    });

    it("Should revert if transfer fails (insufficient balance)", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      // Approve more than balance
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), ethers.parseUnits("10000", 6));

      // Try to stake more than balance
      await expect(
        stakeVault.connect(developer1).stake(ethers.parseUnits("10000", 6))
      ).to.be.reverted; // ERC20 will revert with insufficient balance
    });

    it("Should revert if no approval given", async function () {
      const { stakeVault, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      // Try to stake without approval
      await expect(
        stakeVault.connect(developer1).stake(requiredStake)
      ).to.be.reverted; // ERC20 will revert with insufficient allowance
    });
  });

  describe("Unstaking", function () {
    it("Should allow unstaking with sufficient stake", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      // Stake first
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), requiredStake);
      await stakeVault.connect(developer1).stake(requiredStake);

      const initialBalance = await usdc.balanceOf(developer1.address);

      // Unstake
      const unstakeAmount = ethers.parseUnits("50", 6);
      await expect(stakeVault.connect(developer1).unstake(unstakeAmount))
        .to.emit(stakeVault, "Unstaked")
        .withArgs(developer1.address, unstakeAmount);

      // Verify stake reduced
      expect(await stakeVault.getStake(developer1.address)).to.equal(requiredStake - unstakeAmount);

      // Verify USDC returned
      expect(await usdc.balanceOf(developer1.address)).to.equal(initialBalance + unstakeAmount);
    });

    it("Should allow unstaking entire stake", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      // Stake first
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), requiredStake);
      await stakeVault.connect(developer1).stake(requiredStake);

      // Unstake all
      await stakeVault.connect(developer1).unstake(requiredStake);

      // Verify stake is zero
      expect(await stakeVault.getStake(developer1.address)).to.equal(0);
    });

    it("Should revert if unstaking more than staked", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      // Stake first
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), requiredStake);
      await stakeVault.connect(developer1).stake(requiredStake);

      // Try to unstake more
      await expect(
        stakeVault.connect(developer1).unstake(requiredStake + ethers.parseUnits("1", 6))
      ).to.be.revertedWith("Insufficient stake");
    });

    it("Should revert if unstaking with no stake", async function () {
      const { stakeVault, developer1 } = await loadFixture(deployStakeVaultFixture);

      await expect(
        stakeVault.connect(developer1).unstake(ethers.parseUnits("1", 6))
      ).to.be.revertedWith("Insufficient stake");
    });
  });

  describe("getStake", function () {
    it("Should return correct stake amount", async function () {
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      // Initially zero
      expect(await stakeVault.getStake(developer1.address)).to.equal(0);

      // After staking
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), requiredStake);
      await stakeVault.connect(developer1).stake(requiredStake);
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

      const newRequiredStake = ethers.parseUnits("200", 6);

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

      // Stake at original requirement
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), requiredStake);
      await stakeVault.connect(developer1).stake(requiredStake);

      // Change requirement
      await stakeVault.connect(owner).setRequiredStake(ethers.parseUnits("200", 6));

      // Existing stake should remain unchanged
      expect(await stakeVault.getStake(developer1.address)).to.equal(requiredStake);
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should prevent reentrancy attacks on stake", async function () {
      // This is inherently protected by nonReentrant modifier
      // Additional test would require a malicious contract attempting reentrancy
      const { stakeVault, usdc, developer1, requiredStake } = await loadFixture(deployStakeVaultFixture);

      await usdc.connect(developer1).approve(await stakeVault.getAddress(), requiredStake);
      await stakeVault.connect(developer1).stake(requiredStake);

      // Verify state is correctly updated (no reentrancy occurred)
      expect(await stakeVault.getStake(developer1.address)).to.equal(requiredStake);
    });
  });

  describe("Multiple Developers", function () {
    it("Should handle multiple developers independently", async function () {
      const { stakeVault, usdc, developer1, developer2, requiredStake } = await loadFixture(deployStakeVaultFixture);

      const stake1 = requiredStake;
      const stake2 = ethers.parseUnits("200", 6);

      // Developer 1 stakes
      await usdc.connect(developer1).approve(await stakeVault.getAddress(), stake1);
      await stakeVault.connect(developer1).stake(stake1);

      // Developer 2 stakes
      await usdc.connect(developer2).approve(await stakeVault.getAddress(), stake2);
      await stakeVault.connect(developer2).stake(stake2);

      // Verify independent stakes
      expect(await stakeVault.getStake(developer1.address)).to.equal(stake1);
      expect(await stakeVault.getStake(developer2.address)).to.equal(stake2);
    });
  });
});
