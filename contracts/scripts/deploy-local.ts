import { ethers, upgrades } from "hardhat";

/**
 * Local deployment script for Hardhat node (localhost:8545)
 * - Deploys MockUSDC and mints to test accounts
 * - Deploys all platform contracts
 * - Prints env config for backend & frontend
 *
 * Usage:
 *   Terminal 1: npx hardhat node
 *   Terminal 2: npx hardhat run scripts/deploy-local.ts --network localhost
 */
async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  // Use signer[1] as a test developer, signer[2] as a test client
  const testDeveloper = signers[1];
  const testClient = signers[2];

  console.log("Deploying to local Hardhat node...");
  console.log("Deployer (owner):", deployer.address);
  console.log("Test developer:  ", testDeveloper.address);
  console.log("Test client:     ", testClient.address);

  const REQUIRED_STAKE = process.env.REQUIRED_STAKE || "10000000"; // 10 USDC default for local dev
  const PLATFORM_FEE_BPS = parseInt(process.env.PLATFORM_FEE_BPS || "1000");
  const TREASURY_ADDRESS = deployer.address;

  // 1. Deploy MockUSDC
  console.log("\n📦 Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);

  // Mint USDC to test accounts (10,000 USDC each)
  const mintAmount = ethers.parseUnits("10000", 6);
  await usdc.mint(testDeveloper.address, mintAmount);
  await usdc.mint(testClient.address, mintAmount);
  console.log(`Minted ${ethers.formatUnits(mintAmount, 6)} USDC to test developer`);
  console.log(`Minted ${ethers.formatUnits(mintAmount, 6)} USDC to test client`);

  // 2. Deploy StakeVault
  console.log("\n📦 Deploying StakeVault (UUPS Proxy)...");
  const StakeVault = await ethers.getContractFactory("StakeVault");
  const stakeVault = await upgrades.deployProxy(
    StakeVault,
    [usdcAddress, REQUIRED_STAKE],
    { kind: "uups" }
  );
  await stakeVault.waitForDeployment();
  const stakeVaultAddress = await stakeVault.getAddress();
  console.log("StakeVault:", stakeVaultAddress);

  // 3. Deploy EscrowVault
  console.log("\n📦 Deploying EscrowVault (UUPS Proxy)...");
  const EscrowVault = await ethers.getContractFactory("EscrowVault");
  const escrowVault = await upgrades.deployProxy(
    EscrowVault,
    [usdcAddress, TREASURY_ADDRESS],
    { kind: "uups" }
  );
  await escrowVault.waitForDeployment();
  const escrowVaultAddress = await escrowVault.getAddress();
  console.log("EscrowVault:", escrowVaultAddress);

  // 4. Deploy EliteToken
  console.log("\n📦 Deploying EliteToken (UUPS Proxy)...");
  const EliteToken = await ethers.getContractFactory("EliteToken");
  const eliteToken = await upgrades.deployProxy(EliteToken, [], { kind: "uups" });
  await eliteToken.waitForDeployment();
  const eliteTokenAddress = await eliteToken.getAddress();
  console.log("EliteToken:", eliteTokenAddress);

  // 5. Deploy ProjectManager
  console.log("\n📦 Deploying ProjectManager (UUPS Proxy)...");
  const ProjectManager = await ethers.getContractFactory("ProjectManager");
  const projectManager = await upgrades.deployProxy(
    ProjectManager,
    [deployer.address, escrowVaultAddress, TREASURY_ADDRESS, PLATFORM_FEE_BPS],
    { kind: "uups" }
  );
  await projectManager.waitForDeployment();
  const projectManagerAddress = await projectManager.getAddress();
  console.log("ProjectManager:", projectManagerAddress);

  // 6. Deploy DisputeDAO
  console.log("\n📦 Deploying DisputeDAO (UUPS Proxy)...");
  const DisputeDAO = await ethers.getContractFactory("DisputeDAO");
  const disputeDAO = await upgrades.deployProxy(
    DisputeDAO,
    [usdcAddress, eliteTokenAddress, escrowVaultAddress, projectManagerAddress, TREASURY_ADDRESS],
    { kind: "uups" }
  );
  await disputeDAO.waitForDeployment();
  const disputeDAOAddress = await disputeDAO.getAddress();
  console.log("DisputeDAO:", disputeDAOAddress);

  // 7. Configure EscrowVault
  console.log("\n⚙️  Configuring EscrowVault...");
  const escrowVaultContract = await ethers.getContractAt("EscrowVault", escrowVaultAddress);
  await escrowVaultContract.setProjectManager(projectManagerAddress);
  await escrowVaultContract.setDisputeDAO(disputeDAOAddress);
  console.log("EscrowVault configured.");

  // Print summary
  console.log("\n" + "═".repeat(60));
  console.log("  ✅ Local deployment complete!");
  console.log("═".repeat(60));

  console.log("\n📋 Contract Addresses:");
  console.log("─".repeat(60));
  console.log(`MockUSDC:          ${usdcAddress}`);
  console.log(`StakeVault:        ${stakeVaultAddress}`);
  console.log(`EscrowVault:       ${escrowVaultAddress}`);
  console.log(`EliteToken:        ${eliteTokenAddress}`);
  console.log(`ProjectManager:    ${projectManagerAddress}`);
  console.log(`DisputeDAO:        ${disputeDAOAddress}`);
  console.log(`Treasury:          ${TREASURY_ADDRESS}`);
  console.log(`Required Stake:    ${ethers.formatUnits(REQUIRED_STAKE, 6)} USDC`);
  console.log(`Platform Fee:      ${PLATFORM_FEE_BPS} bps (${PLATFORM_FEE_BPS / 100}%)`);
  console.log("─".repeat(60));

  console.log("\n📝 Backend .env (copy to .env):");
  console.log("─".repeat(60));
  console.log(`RPC_URL=http://127.0.0.1:8545`);
  console.log(`USDC_ADDRESS=${usdcAddress}`);
  console.log(`STAKE_VAULT_ADDRESS=${stakeVaultAddress}`);
  console.log(`ESCROW_VAULT_ADDRESS=${escrowVaultAddress}`);
  console.log(`ELITE_TOKEN_ADDRESS=${eliteTokenAddress}`);
  console.log(`PROJECT_MANAGER_ADDRESS=${projectManagerAddress}`);
  console.log(`DISPUTE_DAO_ADDRESS=${disputeDAOAddress}`);
  console.log(`REQUIRED_STAKE=${REQUIRED_STAKE}`);
  // Hardhat account #0 private key
  console.log(`PRIVATE_KEY=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`);

  console.log("\n📝 Frontend .env.local (copy to frontend/.env.local):");
  console.log("─".repeat(60));
  console.log(`NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545`);
  console.log(`NEXT_PUBLIC_USDC_ADDRESS=${usdcAddress}`);
  console.log(`NEXT_PUBLIC_STAKE_VAULT_ADDRESS=${stakeVaultAddress}`);
  console.log(`NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=${escrowVaultAddress}`);
  console.log(`NEXT_PUBLIC_ELITE_TOKEN_ADDRESS=${eliteTokenAddress}`);
  console.log(`NEXT_PUBLIC_PROJECT_MANAGER_ADDRESS=${projectManagerAddress}`);
  console.log(`NEXT_PUBLIC_DISPUTE_DAO_ADDRESS=${disputeDAOAddress}`);
  console.log(`NEXT_PUBLIC_REQUIRED_STAKE=${REQUIRED_STAKE}`);

  console.log("\n🔑 Test Accounts (import into MetaMask):");
  console.log("─".repeat(60));
  console.log(`Account #0 (owner):     ${deployer.address}`);
  console.log(`  Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`);
  console.log(`Account #1 (developer): ${testDeveloper.address}`);
  console.log(`  Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`);
  console.log(`  USDC Balance: 10,000`);
  console.log(`Account #2 (client):    ${testClient.address}`);
  console.log(`  Private Key: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a`);
  console.log(`  USDC Balance: 10,000`);

  console.log("\n🌐 MetaMask Network Config:");
  console.log("─".repeat(60));
  console.log(`Network Name:  Hardhat Local`);
  console.log(`RPC URL:       http://127.0.0.1:8545`);
  console.log(`Chain ID:      31337`);
  console.log(`Currency:      ETH`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
