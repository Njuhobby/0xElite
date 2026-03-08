import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Get configuration from environment or use defaults
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "";
  const TREASURY_ADDRESS = deployer.address;
  const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS || "1000"); // 1000 = 10%

  if (!USDC_ADDRESS) {
    throw new Error("USDC_ADDRESS is required. Set it in your environment before deploying.");
  }

  console.log("\n📦 Deploying StakeVault (UUPS Proxy)...");
  const StakeVault = await ethers.getContractFactory("StakeVault");
  const stakeVault = await upgrades.deployProxy(
    StakeVault,
    [USDC_ADDRESS],
    { kind: "uups" }
  );
  await stakeVault.waitForDeployment();
  const stakeVaultAddress = await stakeVault.getAddress();
  console.log("StakeVault Proxy deployed to:", stakeVaultAddress);
  console.log("StakeVault Implementation:", await upgrades.erc1967.getImplementationAddress(stakeVaultAddress));

  console.log("\n📦 Deploying EscrowVault (UUPS Proxy)...");
  const EscrowVault = await ethers.getContractFactory("EscrowVault");
  const escrowVault = await upgrades.deployProxy(
    EscrowVault,
    [USDC_ADDRESS, TREASURY_ADDRESS],
    { kind: "uups" }
  );
  await escrowVault.waitForDeployment();
  const escrowVaultAddress = await escrowVault.getAddress();
  console.log("EscrowVault Proxy deployed to:", escrowVaultAddress);
  console.log("EscrowVault Implementation:", await upgrades.erc1967.getImplementationAddress(escrowVaultAddress));

  console.log("\n📦 Deploying EliteToken (UUPS Proxy)...");
  const EliteToken = await ethers.getContractFactory("EliteToken");
  const eliteToken = await upgrades.deployProxy(
    EliteToken,
    [],
    { kind: "uups" }
  );
  await eliteToken.waitForDeployment();
  const eliteTokenAddress = await eliteToken.getAddress();
  console.log("EliteToken Proxy deployed to:", eliteTokenAddress);
  console.log("EliteToken Implementation:", await upgrades.erc1967.getImplementationAddress(eliteTokenAddress));

  console.log("\n📦 Deploying ProjectManager (UUPS Proxy)...");
  const ProjectManager = await ethers.getContractFactory("ProjectManager");
  const projectManager = await upgrades.deployProxy(
    ProjectManager,
    [deployer.address, escrowVaultAddress, TREASURY_ADDRESS, PLATFORM_FEE_BPS],
    { kind: "uups" }
  );
  await projectManager.waitForDeployment();
  const projectManagerAddress = await projectManager.getAddress();
  console.log("ProjectManager Proxy deployed to:", projectManagerAddress);
  console.log("ProjectManager Implementation:", await upgrades.erc1967.getImplementationAddress(projectManagerAddress));

  console.log("\n📦 Deploying DisputeDAO (UUPS Proxy)...");
  const DisputeDAO = await ethers.getContractFactory("DisputeDAO");
  const disputeDAO = await upgrades.deployProxy(
    DisputeDAO,
    [USDC_ADDRESS, eliteTokenAddress, escrowVaultAddress, projectManagerAddress, TREASURY_ADDRESS],
    { kind: "uups" }
  );
  await disputeDAO.waitForDeployment();
  const disputeDAOAddress = await disputeDAO.getAddress();
  console.log("DisputeDAO Proxy deployed to:", disputeDAOAddress);
  console.log("DisputeDAO Implementation:", await upgrades.erc1967.getImplementationAddress(disputeDAOAddress));

  // Configure EscrowVault
  console.log("\n⚙️  Configuring EscrowVault...");
  const escrowVaultContract = await ethers.getContractAt("EscrowVault", escrowVaultAddress);
  await escrowVaultContract.setProjectManager(projectManagerAddress);
  console.log("EscrowVault.projectManager set to:", projectManagerAddress);
  await escrowVaultContract.setDisputeDAO(disputeDAOAddress);
  console.log("EscrowVault.disputeDAO set to:", disputeDAOAddress);

  console.log("\n✅ Deployment complete!");
  console.log("\n📋 Contract Addresses:");
  console.log("─".repeat(60));
  console.log(`USDC:              ${USDC_ADDRESS}`);
  console.log(`StakeVault:        ${stakeVaultAddress}`);
  console.log(`EscrowVault:       ${escrowVaultAddress}`);
  console.log(`EliteToken:        ${eliteTokenAddress}`);
  console.log(`ProjectManager:    ${projectManagerAddress}`);
  console.log(`DisputeDAO:        ${disputeDAOAddress}`);
  console.log(`Treasury:          ${TREASURY_ADDRESS}`);
  console.log(`Platform Fee:      ${PLATFORM_FEE_BPS} bps (${PLATFORM_FEE_BPS / 100}%)`);
  console.log("─".repeat(60));

  console.log("\n📝 Add these to your .env file:");
  console.log(`STAKE_VAULT_ADDRESS=${stakeVaultAddress}`);
  console.log(`ESCROW_VAULT_ADDRESS=${escrowVaultAddress}`);
  console.log(`ELITE_TOKEN_ADDRESS=${eliteTokenAddress}`);
  console.log(`PROJECT_MANAGER_ADDRESS=${projectManagerAddress}`);
  console.log(`DISPUTE_DAO_ADDRESS=${disputeDAOAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
