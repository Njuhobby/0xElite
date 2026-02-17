import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Get configuration from environment or use defaults
  const USDC_ADDRESS = process.env.USDC_ADDRESS || "";
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || deployer.address;
  const REQUIRED_STAKE = process.env.REQUIRED_STAKE || "150000000"; // 150 USDC (6 decimals)

  if (!USDC_ADDRESS) {
    console.log("\n⚠️  USDC_ADDRESS not set. Deploying MockUSDC for testing...");
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();
    const usdcAddress = await mockUSDC.getAddress();
    console.log("MockUSDC deployed to:", usdcAddress);
    process.env.USDC_ADDRESS = usdcAddress;
  }

  const usdcAddress = process.env.USDC_ADDRESS!;

  console.log("\n📦 Deploying StakeVault (UUPS Proxy)...");
  const StakeVault = await ethers.getContractFactory("StakeVault");
  const stakeVault = await upgrades.deployProxy(
    StakeVault,
    [usdcAddress, REQUIRED_STAKE],
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
    [usdcAddress, TREASURY_ADDRESS],
    { kind: "uups" }
  );
  await escrowVault.waitForDeployment();
  const escrowVaultAddress = await escrowVault.getAddress();
  console.log("EscrowVault Proxy deployed to:", escrowVaultAddress);
  console.log("EscrowVault Implementation:", await upgrades.erc1967.getImplementationAddress(escrowVaultAddress));

  console.log("\n📦 Deploying ProjectManager (UUPS Proxy)...");
  const ProjectManager = await ethers.getContractFactory("ProjectManager");
  const projectManager = await upgrades.deployProxy(
    ProjectManager,
    [deployer.address],
    { kind: "uups" }
  );
  await projectManager.waitForDeployment();
  const projectManagerAddress = await projectManager.getAddress();
  console.log("ProjectManager Proxy deployed to:", projectManagerAddress);
  console.log("ProjectManager Implementation:", await upgrades.erc1967.getImplementationAddress(projectManagerAddress));

  // Configure EscrowVault to use ProjectManager
  console.log("\n⚙️  Configuring EscrowVault...");
  const escrowVaultContract = await ethers.getContractAt("EscrowVault", escrowVaultAddress);
  await escrowVaultContract.setProjectManager(projectManagerAddress);
  console.log("EscrowVault.projectManager set to:", projectManagerAddress);

  console.log("\n✅ Deployment complete!");
  console.log("\n📋 Contract Addresses:");
  console.log("─".repeat(60));
  console.log(`USDC:              ${usdcAddress}`);
  console.log(`StakeVault:        ${stakeVaultAddress}`);
  console.log(`EscrowVault:       ${escrowVaultAddress}`);
  console.log(`ProjectManager:    ${projectManagerAddress}`);
  console.log(`Treasury:          ${TREASURY_ADDRESS}`);
  console.log("─".repeat(60));

  console.log("\n📝 Add these to your .env file:");
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${usdcAddress}`);
  console.log(`NEXT_PUBLIC_STAKE_VAULT_ADDRESS=${stakeVaultAddress}`);
  console.log(`NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=${escrowVaultAddress}`);
  console.log(`NEXT_PUBLIC_PROJECT_MANAGER_ADDRESS=${projectManagerAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
