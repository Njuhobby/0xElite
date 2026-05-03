import { ethers } from "hardhat";
import { Pool } from "pg";

/**
 * Local-dev seeder.
 *
 * Replays the manual UI flow (developer apply → admin approve → client create
 * → project create → escrow deposit → assign developer) by writing directly to
 * Postgres + sending the on-chain calls. Skips backend HTTP entirely so it
 * works whether or not the backend is running.
 *
 * The on-chain side is real: contracts genuinely have a staked developer, a
 * funded escrow, and an assigned developer — so dispute flows can be exercised
 * end-to-end without further setup.
 *
 * Idempotent on re-run against a fresh hardhat node + fresh DB. If you re-run
 * without resetting state, on-chain calls that already happened (stake exists,
 * escrow already created) will revert and the seeder logs and continues; DB
 * inserts use ON CONFLICT DO NOTHING.
 */

export interface SeedDeployment {
  usdcAddress: string;
  stakeVaultAddress: string;
  escrowVaultAddress: string;
  projectManagerAddress: string;
  requiredStake: string; // in USDC base units (6 decimals)
}

const DEV_PROFILE = {
  email: "test.developer@0xelite.local",
  githubUsername: "test-developer",
  skills: ["Go", "Solidity", "Python"],
  bio: "Senior backend engineer specialising in distributed systems and smart contracts.",
  hourlyRate: 100,
};

const CLIENT_PROFILE = {
  email: "test.client@0xelite.local",
  companyName: "Acme Corp",
  description: "Test client for local debugging.",
  website: "https://acme.test",
};

const PROJECT_SPEC = {
  title: "DeFi Lending Protocol",
  description:
    "Build a Compound-fork lending protocol with a custom interest-rate model.",
  requiredSkills: ["Solidity", "Go"], // intentionally overlaps DEV_PROFILE.skills
  totalBudget: 1000, // 1000 USDC, denominated in human units
  milestones: [
    {
      title: "Smart contract scaffolding",
      description:
        "Initial Solidity contracts for the lending pool, interest model, and oracle adapters.",
      deliverables: ["Base contracts", "Hardhat test suite"],
      budget: 400,
    },
    {
      title: "Backend indexer",
      description:
        "Go-based indexer that tracks lending events and computes yields.",
      deliverables: ["Event listener", "REST API", "PostgreSQL schema"],
      budget: 600,
    },
  ],
};

export async function seedTestData(deployed: SeedDeployment): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log(
      "\n⚠️  DATABASE_URL not set — skipping DB seed. On-chain seed will still run."
    );
  }

  const signers = await ethers.getSigners();
  const owner = signers[0];
  const developer = signers[1];
  const client = signers[2];

  console.log("\n" + "═".repeat(60));
  console.log("  🌱 Seeding test data");
  console.log("═".repeat(60));
  console.log(`Developer: ${developer.address}`);
  console.log(`Client:    ${client.address}`);
  console.log(`Owner:     ${owner.address}`);

  // typechain-types aren't worth importing for a dev seed; cast to any.
  const usdc = (await ethers.getContractAt(
    "MockUSDC",
    deployed.usdcAddress
  )) as any;
  const stakeVault = (await ethers.getContractAt(
    "StakeVault",
    deployed.stakeVaultAddress
  )) as any;
  const escrowVault = (await ethers.getContractAt(
    "EscrowVault",
    deployed.escrowVaultAddress
  )) as any;
  const projectManager = (await ethers.getContractAt(
    "ProjectManager",
    deployed.projectManagerAddress
  )) as any;

  const requiredStake = BigInt(deployed.requiredStake);
  const totalBudgetUnits = BigInt(PROJECT_SPEC.totalBudget) * 1_000_000n; // 6 decimals

  // -------------------------------------------------------------------------
  // 1. Developer stake (on-chain)
  // -------------------------------------------------------------------------
  console.log("\n→ Developer staking");
  try {
    await (
      await usdc.connect(developer).approve(deployed.stakeVaultAddress, requiredStake)
    ).wait();
    await (await stakeVault.connect(developer).stake(requiredStake)).wait();
    console.log(`  ✓ Staked ${ethers.formatUnits(requiredStake, 6)} USDC`);
  } catch (err: any) {
    console.log(`  ⚠️  Stake skipped (${err.shortMessage ?? err.message})`);
  }

  // -------------------------------------------------------------------------
  // 2. Project create + escrow deposit + assign (on-chain)
  // -------------------------------------------------------------------------
  console.log("\n→ Creating project on-chain");
  const milestoneBudgets = PROJECT_SPEC.milestones.map(
    (m) => BigInt(m.budget) * 1_000_000n
  );
  const milestoneHashes = PROJECT_SPEC.milestones.map((m) =>
    ethers.keccak256(
      ethers.solidityPacked(
        ["string", "string", "string"],
        [m.title, m.description, JSON.stringify(m.deliverables)]
      )
    )
  );

  let contractProjectId: bigint | null = null;
  try {
    const tx = await projectManager
      .connect(client)
      .createProjectWithMilestones(totalBudgetUnits, milestoneBudgets, milestoneHashes);
    const receipt = await tx.wait();
    const created = receipt!.logs.find(
      (l: any) => l.fragment?.name === "ProjectCreated"
    );
    contractProjectId = created?.args?.projectId ?? null;
    console.log(`  ✓ Project created (on-chain id=${contractProjectId})`);
  } catch (err: any) {
    console.log(`  ⚠️  createProject skipped (${err.shortMessage ?? err.message})`);
  }

  if (contractProjectId !== null) {
    console.log("→ Depositing escrow");
    try {
      await (
        await usdc.connect(client).approve(deployed.escrowVaultAddress, totalBudgetUnits)
      ).wait();
      await (
        await escrowVault.connect(client).deposit(contractProjectId, totalBudgetUnits)
      ).wait();
      console.log(`  ✓ Deposited ${ethers.formatUnits(totalBudgetUnits, 6)} USDC`);
    } catch (err: any) {
      console.log(`  ⚠️  Deposit skipped (${err.shortMessage ?? err.message})`);
    }

    console.log("→ Assigning developer");
    try {
      await (
        await projectManager
          .connect(owner)
          .assignDevelopers(contractProjectId, [developer.address])
      ).wait();
      console.log(`  ✓ Developer assigned`);
    } catch (err: any) {
      console.log(`  ⚠️  Assign skipped (${err.shortMessage ?? err.message})`);
    }
  }

  // -------------------------------------------------------------------------
  // 3. DB rows mirroring the on-chain state (so the UI shows what the user
  //    would have created via the manual flow)
  // -------------------------------------------------------------------------
  if (!dbUrl) {
    console.log("\n✓ On-chain seed complete (DB seed skipped)");
    return;
  }

  const pool = new Pool({ connectionString: dbUrl });
  try {
    await seedDb(pool, developer.address, client.address, contractProjectId);
    console.log("\n✓ DB seed complete");
  } catch (err: any) {
    console.log(`\n⚠️  DB seed failed: ${err.message}`);
    console.log(
      "    (Did you run `cd backend && npm run reset-dev` to apply migrations?)"
    );
  } finally {
    await pool.end();
  }
}

async function seedDb(
  pool: Pool,
  devAddress: string,
  clientAddress: string,
  contractProjectId: bigint | null
): Promise<void> {
  const devLower = devAddress.toLowerCase();
  const clientLower = clientAddress.toLowerCase();

  // Developer — straight to 'active' (skip the staked → admin-approve dance).
  await pool.query(
    `INSERT INTO developers (
       wallet_address, email, github_username, skills, bio, hourly_rate,
       availability, stake_amount, staked_at, status
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5, $6, 'available', $7, NOW(), 'active'
     )
     ON CONFLICT (wallet_address) DO NOTHING`,
    [
      devLower,
      DEV_PROFILE.email,
      DEV_PROFILE.githubUsername,
      JSON.stringify(DEV_PROFILE.skills),
      DEV_PROFILE.bio,
      DEV_PROFILE.hourlyRate,
      Number(process.env.REQUIRED_STAKE ?? 10_000_000) / 1_000_000,
    ]
  );
  console.log("  ✓ Developer row");

  // Client
  await pool.query(
    `INSERT INTO clients (
       wallet_address, email, company_name, description, website, is_registered
     ) VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (wallet_address) DO NOTHING`,
    [
      clientLower,
      CLIENT_PROFILE.email,
      CLIENT_PROFILE.companyName,
      CLIENT_PROFILE.description,
      CLIENT_PROFILE.website,
    ]
  );
  console.log("  ✓ Client row");

  if (contractProjectId === null) {
    console.log("  ⚠️  No contract project id — skipping project/milestone rows");
    return;
  }

  // Skip if a row already references this contract_project_id.
  const existing = await pool.query(
    "SELECT id FROM projects WHERE contract_project_id = $1",
    [Number(contractProjectId)]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    console.log("  ⚠️  Project row already exists for this contract id — skipping");
    return;
  }

  // Project — status='active' (escrow deposited + developer assigned).
  const projectResult = await pool.query<{ id: string }>(
    `INSERT INTO projects (
       client_address, title, description, required_skills, total_budget,
       status, assigned_developer, assigned_at, contract_project_id,
       uses_onchain_milestones, escrow_deposited, escrow_deposited_at
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5, 'active', $6, NOW(), $7, true, true, NOW()
     )
     RETURNING id`,
    [
      clientLower,
      PROJECT_SPEC.title,
      PROJECT_SPEC.description,
      JSON.stringify(PROJECT_SPEC.requiredSkills),
      PROJECT_SPEC.totalBudget,
      devLower,
      Number(contractProjectId),
    ]
  );
  const projectId = projectResult.rows[0]!.id;
  console.log(`  ✓ Project row (id=${projectId})`);

  // Milestones — match the on-chain order (on_chain_index 0..n-1).
  for (let i = 0; i < PROJECT_SPEC.milestones.length; i++) {
    const m = PROJECT_SPEC.milestones[i]!;
    const detailsHash = ethers.keccak256(
      ethers.solidityPacked(
        ["string", "string", "string"],
        [m.title, m.description, JSON.stringify(m.deliverables)]
      )
    );
    await pool.query(
      `INSERT INTO milestones (
         project_id, milestone_number, title, description, deliverables,
         budget, status, details_hash, on_chain_index
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'pending', $7, $8)`,
      [
        projectId,
        i + 1,
        m.title,
        m.description,
        JSON.stringify(m.deliverables),
        m.budget,
        detailsHash,
        i,
      ]
    );
  }
  console.log(`  ✓ ${PROJECT_SPEC.milestones.length} milestone rows`);

  // Escrow deposit row (matches handleDepositEscrow's INSERT shape).
  await pool.query(
    `INSERT INTO escrow_deposits (project_id, contract_project_id, total_deposited, deposit_tx_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id) DO NOTHING`,
    [projectId, Number(contractProjectId), PROJECT_SPEC.totalBudget, "0x" + "0".repeat(64)]
  );
  console.log("  ✓ Escrow deposit row");

  // Bump client.projects_created counter to match the manual flow.
  await pool.query(
    `UPDATE clients SET projects_created = projects_created + 1 WHERE wallet_address = $1`,
    [clientLower]
  );
}
