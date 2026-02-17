import { ethers, upgrades } from "hardhat";

/**
 * Upgrade script for UUPS upgradeable contracts
 *
 * Usage:
 *   CONTRACT=StakeVault PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade.ts
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Upgrading contracts with account:", deployer.address);

  const contractName = process.env.CONTRACT;
  const proxyAddress = process.env.PROXY_ADDRESS;

  if (!contractName || !proxyAddress) {
    console.error("Usage: CONTRACT=<name> PROXY_ADDRESS=<address> npx hardhat run scripts/upgrade.ts");
    console.error("Example: CONTRACT=StakeVault PROXY_ADDRESS=0x... npx hardhat run scripts/upgrade.ts");
    process.exit(1);
  }

  console.log(`\n📦 Upgrading ${contractName} at ${proxyAddress}...`);

  // Get the old implementation address
  const oldImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`Old implementation: ${oldImplementation}`);

  // Deploy new implementation and upgrade
  const ContractFactory = await ethers.getContractFactory(contractName);
  const upgraded = await upgrades.upgradeProxy(proxyAddress, ContractFactory);
  await upgraded.waitForDeployment();

  // Get the new implementation address
  const newImplementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`New implementation: ${newImplementation}`);

  // Verify version
  const contract = await ethers.getContractAt(contractName, proxyAddress);
  const version = await contract.version();
  console.log(`Contract version: ${version}`);

  console.log(`\n✅ ${contractName} upgraded successfully!`);
  console.log(`Proxy address (unchanged): ${proxyAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
