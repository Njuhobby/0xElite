const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  // Deploy MockUSDC (for testnet)
  console.log("\nDeploying MockUSDC...");
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddress = await usdc.getAddress();
  console.log("MockUSDC deployed to:", usdcAddress);

  // Deploy StakeVault
  console.log("\nDeploying StakeVault...");
  const requiredStake = hre.ethers.parseUnits("150", 6); // 150 USDC (6 decimals)
  const StakeVault = await hre.ethers.getContractFactory("StakeVault");
  const stakeVault = await StakeVault.deploy(usdcAddress, requiredStake);
  await stakeVault.waitForDeployment();
  const stakeVaultAddress = await stakeVault.getAddress();
  console.log("StakeVault deployed to:", stakeVaultAddress);

  console.log("\n=== Deployment Summary ===");
  console.log("MockUSDC:", usdcAddress);
  console.log("StakeVault:", stakeVaultAddress);
  console.log("Required Stake:", hre.ethers.formatUnits(requiredStake, 6), "USDC");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
