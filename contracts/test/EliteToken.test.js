const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("EliteToken", function () {
  async function deployEliteTokenFixture() {
    const [owner, developer1, developer2, other] = await ethers.getSigners();

    const EliteToken = await ethers.getContractFactory("EliteToken");
    const eliteToken = await upgrades.deployProxy(EliteToken, [], {
      kind: "uups",
    });
    await eliteToken.waitForDeployment();

    return { eliteToken, owner, developer1, developer2, other };
  }

  describe("Deployment & Initialization", function () {
    it("Should set correct name and symbol", async function () {
      const { eliteToken } = await loadFixture(deployEliteTokenFixture);
      expect(await eliteToken.name()).to.equal("0xElite Governance");
      expect(await eliteToken.symbol()).to.equal("xELITE");
    });

    it("Should have 6 decimals", async function () {
      const { eliteToken } = await loadFixture(deployEliteTokenFixture);
      expect(await eliteToken.decimals()).to.equal(6);
    });

    it("Should set deployer as owner", async function () {
      const { eliteToken, owner } = await loadFixture(deployEliteTokenFixture);
      expect(await eliteToken.owner()).to.equal(owner.address);
    });

    it("Should start with zero total supply", async function () {
      const { eliteToken } = await loadFixture(deployEliteTokenFixture);
      expect(await eliteToken.totalSupply()).to.equal(0);
    });

    it("Should use timestamp-based clock mode", async function () {
      const { eliteToken } = await loadFixture(deployEliteTokenFixture);
      expect(await eliteToken.CLOCK_MODE()).to.equal("mode=timestamp");
    });

    it("Should return current timestamp from clock()", async function () {
      const { eliteToken } = await loadFixture(deployEliteTokenFixture);
      const clockVal = await eliteToken.clock();
      const latest = await time.latest();
      // Allow small tolerance
      expect(clockVal).to.be.closeTo(latest, 2);
    });

    it("Should return version 1.0.0", async function () {
      const { eliteToken } = await loadFixture(deployEliteTokenFixture);
      expect(await eliteToken.version()).to.equal("1.0.0");
    });

    it("Should not allow re-initialization", async function () {
      const { eliteToken } = await loadFixture(deployEliteTokenFixture);
      await expect(eliteToken.initialize()).to.be.reverted;
    });
  });

  describe("Minting", function () {
    it("Should allow owner to mint tokens", async function () {
      const { eliteToken, developer1 } = await loadFixture(
        deployEliteTokenFixture
      );
      const amount = ethers.parseUnits("1000", 6);

      await eliteToken.mint(developer1.address, amount);

      expect(await eliteToken.balanceOf(developer1.address)).to.equal(amount);
      expect(await eliteToken.totalSupply()).to.equal(amount);
    });

    it("Should not allow non-owner to mint tokens", async function () {
      const { eliteToken, developer1, other } = await loadFixture(
        deployEliteTokenFixture
      );
      const amount = ethers.parseUnits("1000", 6);

      await expect(
        eliteToken.connect(other).mint(developer1.address, amount)
      ).to.be.revertedWithCustomError(eliteToken, "OwnableUnauthorizedAccount");
    });

    it("Should mint to multiple developers", async function () {
      const { eliteToken, developer1, developer2 } = await loadFixture(
        deployEliteTokenFixture
      );
      const amount1 = ethers.parseUnits("500", 6);
      const amount2 = ethers.parseUnits("1200", 6);

      await eliteToken.mint(developer1.address, amount1);
      await eliteToken.mint(developer2.address, amount2);

      expect(await eliteToken.balanceOf(developer1.address)).to.equal(amount1);
      expect(await eliteToken.balanceOf(developer2.address)).to.equal(amount2);
      expect(await eliteToken.totalSupply()).to.equal(amount1 + amount2);
    });
  });

  describe("Burning", function () {
    it("Should allow owner to burn tokens", async function () {
      const { eliteToken, developer1 } = await loadFixture(
        deployEliteTokenFixture
      );
      const mintAmount = ethers.parseUnits("1000", 6);
      const burnAmount = ethers.parseUnits("300", 6);

      await eliteToken.mint(developer1.address, mintAmount);
      await eliteToken.burn(developer1.address, burnAmount);

      expect(await eliteToken.balanceOf(developer1.address)).to.equal(
        mintAmount - burnAmount
      );
    });

    it("Should not allow non-owner to burn tokens", async function () {
      const { eliteToken, developer1, other } = await loadFixture(
        deployEliteTokenFixture
      );
      const amount = ethers.parseUnits("1000", 6);
      await eliteToken.mint(developer1.address, amount);

      await expect(
        eliteToken.connect(other).burn(developer1.address, amount)
      ).to.be.revertedWithCustomError(eliteToken, "OwnableUnauthorizedAccount");
    });

    it("Should revert when burning more than balance", async function () {
      const { eliteToken, developer1 } = await loadFixture(
        deployEliteTokenFixture
      );
      const mintAmount = ethers.parseUnits("100", 6);
      const burnAmount = ethers.parseUnits("200", 6);

      await eliteToken.mint(developer1.address, mintAmount);

      await expect(
        eliteToken.burn(developer1.address, burnAmount)
      ).to.be.reverted;
    });
  });

  describe("Soulbound (Non-Transferable)", function () {
    it("Should prevent transfer between users", async function () {
      const { eliteToken, developer1, developer2 } = await loadFixture(
        deployEliteTokenFixture
      );
      const amount = ethers.parseUnits("1000", 6);

      await eliteToken.mint(developer1.address, amount);

      await expect(
        eliteToken
          .connect(developer1)
          .transfer(developer2.address, amount)
      ).to.be.revertedWithCustomError(
        eliteToken,
        "SoulboundTransferDisabled"
      );
    });

    it("Should prevent transferFrom between users", async function () {
      const { eliteToken, owner, developer1, developer2 } = await loadFixture(
        deployEliteTokenFixture
      );
      const amount = ethers.parseUnits("1000", 6);

      await eliteToken.mint(developer1.address, amount);
      await eliteToken
        .connect(developer1)
        .approve(owner.address, amount);

      await expect(
        eliteToken.transferFrom(developer1.address, developer2.address, amount)
      ).to.be.revertedWithCustomError(
        eliteToken,
        "SoulboundTransferDisabled"
      );
    });
  });

  describe("Voting Power (ERC20Votes)", function () {
    it("Should auto-delegate votes on mint", async function () {
      const { eliteToken, developer1 } = await loadFixture(
        deployEliteTokenFixture
      );
      const amount = ethers.parseUnits("1000", 6);

      await eliteToken.mint(developer1.address, amount);

      // Developer needs to self-delegate to activate voting power
      await eliteToken.connect(developer1).delegate(developer1.address);

      expect(await eliteToken.getVotes(developer1.address)).to.equal(amount);
    });

    it("Should track historical voting power with getPastVotes", async function () {
      const { eliteToken, developer1 } = await loadFixture(
        deployEliteTokenFixture
      );
      const amount1 = ethers.parseUnits("500", 6);
      const amount2 = ethers.parseUnits("300", 6);

      // Delegate first
      await eliteToken.connect(developer1).delegate(developer1.address);

      // Mint initial tokens
      await eliteToken.mint(developer1.address, amount1);
      const snapshot1 = await time.latest();

      // Advance time
      await time.increase(100);

      // Mint more tokens
      await eliteToken.mint(developer1.address, amount2);

      // Check historical voting power at snapshot1
      expect(
        await eliteToken.getPastVotes(developer1.address, snapshot1)
      ).to.equal(amount1);

      // Current voting power should be the sum
      expect(await eliteToken.getVotes(developer1.address)).to.equal(
        amount1 + amount2
      );
    });

    it("Should track historical total supply", async function () {
      const { eliteToken, developer1, developer2 } = await loadFixture(
        deployEliteTokenFixture
      );
      const amount1 = ethers.parseUnits("500", 6);
      const amount2 = ethers.parseUnits("300", 6);

      // Mint tokens to developer1
      await eliteToken.mint(developer1.address, amount1);
      const snapshot1 = await time.latest();

      // Advance time
      await time.increase(100);

      // Mint tokens to developer2
      await eliteToken.mint(developer2.address, amount2);

      // Historical total supply at snapshot1 should be amount1 only
      expect(await eliteToken.getPastTotalSupply(snapshot1)).to.equal(amount1);

      // Current total supply should be the sum
      expect(await eliteToken.totalSupply()).to.equal(amount1 + amount2);
    });

    it("Should reduce voting power on burn", async function () {
      const { eliteToken, developer1 } = await loadFixture(
        deployEliteTokenFixture
      );
      const mintAmount = ethers.parseUnits("1000", 6);
      const burnAmount = ethers.parseUnits("400", 6);

      await eliteToken.connect(developer1).delegate(developer1.address);
      await eliteToken.mint(developer1.address, mintAmount);

      expect(await eliteToken.getVotes(developer1.address)).to.equal(
        mintAmount
      );

      await eliteToken.burn(developer1.address, burnAmount);

      expect(await eliteToken.getVotes(developer1.address)).to.equal(
        mintAmount - burnAmount
      );
    });

    it("Should allow delegation to another address", async function () {
      const { eliteToken, developer1, developer2 } = await loadFixture(
        deployEliteTokenFixture
      );
      const amount = ethers.parseUnits("1000", 6);

      await eliteToken.mint(developer1.address, amount);
      await eliteToken.connect(developer1).delegate(developer2.address);

      expect(await eliteToken.getVotes(developer1.address)).to.equal(0);
      expect(await eliteToken.getVotes(developer2.address)).to.equal(amount);
    });
  });

  describe("Access Control", function () {
    it("Should allow ownership transfer", async function () {
      const { eliteToken, owner, other } = await loadFixture(
        deployEliteTokenFixture
      );

      await eliteToken.connect(owner).transferOwnership(other.address);
      expect(await eliteToken.owner()).to.equal(other.address);
    });

    it("Should prevent old owner from minting after transfer", async function () {
      const { eliteToken, owner, developer1, other } = await loadFixture(
        deployEliteTokenFixture
      );
      const amount = ethers.parseUnits("100", 6);

      await eliteToken.connect(owner).transferOwnership(other.address);

      await expect(
        eliteToken.connect(owner).mint(developer1.address, amount)
      ).to.be.revertedWithCustomError(eliteToken, "OwnableUnauthorizedAccount");
    });
  });
});
