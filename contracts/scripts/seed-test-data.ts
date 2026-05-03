import { ethers } from "hardhat";
import { Pool } from "pg";

/**
 * Local-dev seeder.
 *
 * Replays the manual UI flow (developer apply → admin approve → client create
 * → project create → escrow deposit → assign developer → milestone approval)
 * by writing directly to Postgres + sending the on-chain calls. Skips backend
 * HTTP entirely so it works whether or not the backend is running.
 *
 * End state:
 *  - 3 developers (signers 1, 3, 4), 1 client (signer 2)
 *  - 3 projects, all owned by the client:
 *      project 1 (assigned to dev 1): in-progress, escrow funded, no milestones
 *                                     approved — this is the dispute target.
 *      project 2 (assigned to dev 2): all milestones approved on-chain → dev 2
 *                                     earned 180 USDC, has 180 xELITE voting power.
 *      project 3 (assigned to dev 3): all milestones approved on-chain → dev 3
 *                                     earned 720 USDC, has 720 xELITE voting power.
 *  - dev 2 and dev 3 are self-delegated so their xELITE counts at vote snapshot.
 *
 * Voting maths (with default 25% quorum):
 *    total xELITE supply = 900
 *    quorum threshold    = 225
 *    dev 2 alone (180)   < 225  → fails quorum, exercises ownerResolve path
 *    dev 2 + dev 3 (900) ≥ 225  → passes quorum, exercises executeResolution
 *
 * Idempotent on a fresh hardhat node + fresh DB. If you re-run without
 * resetting state, on-chain calls that already happened revert and the seeder
 * logs and continues; DB inserts use ON CONFLICT DO NOTHING.
 */

export interface SeedDeployment {
  usdcAddress: string;
  stakeVaultAddress: string;
  escrowVaultAddress: string;
  projectManagerAddress: string;
  eliteTokenAddress: string;
  requiredStake: string; // in USDC base units (6 decimals)
  platformFeeBps: number; // e.g. 1000 = 10%
}

interface DevProfile {
  email: string;
  githubUsername: string;
  skills: string[];
  bio: string;
  hourlyRate: number;
}

interface MilestoneSpec {
  title: string;
  description: string;
  deliverables: string[];
  budget: number; // USDC
}

interface ProjectSpec {
  devIndex: 0 | 1 | 2; // which entry in DEV_PROFILES / dev signers (0..2)
  title: string;
  description: string;
  requiredSkills: string[];
  totalBudget: number; // USDC
  milestones: MilestoneSpec[];
  complete: boolean; // approve all milestones on-chain after assign
}

const CLIENT_PROFILE = {
  email: "test.client@0xelite.local",
  companyName: "Acme Corp",
  description: "Test client for local debugging.",
  website: "https://acme.test",
};

const DEV_PROFILES: DevProfile[] = [
  {
    email: "dev1@0xelite.local",
    githubUsername: "test-dev-1",
    skills: ["Go", "Solidity", "Python"],
    bio: "Senior backend engineer specialising in distributed systems and smart contracts.",
    hourlyRate: 100,
  },
  {
    email: "dev2@0xelite.local",
    githubUsername: "test-dev-2",
    skills: ["Rust", "TypeScript"],
    bio: "Mobile-first engineer focused on cross-platform clients.",
    hourlyRate: 80,
  },
  {
    email: "dev3@0xelite.local",
    githubUsername: "test-dev-3",
    skills: ["Solidity", "TypeScript", "React"],
    bio: "Full-stack web3 engineer; ships dApps end-to-end.",
    hourlyRate: 90,
  },
];

const PROJECT_SPECS: ProjectSpec[] = [
  {
    devIndex: 0,
    title: "DeFi Lending Protocol",
    description: "Build a Compound-fork lending protocol with a custom interest-rate model.",
    requiredSkills: ["Solidity", "Go"],
    totalBudget: 1000,
    milestones: [
      {
        title: "Smart contract scaffolding",
        description: "Initial Solidity contracts for the lending pool, interest model, and oracle adapters.",
        deliverables: ["Base contracts", "Hardhat test suite"],
        budget: 400,
      },
      {
        title: "Backend indexer",
        description: "Go-based indexer that tracks lending events and computes yields.",
        deliverables: ["Event listener", "REST API", "PostgreSQL schema"],
        budget: 600,
      },
    ],
    complete: false, // dispute target — stays open
  },
  {
    devIndex: 1,
    title: "Mobile Wallet App",
    description: "Cross-platform mobile wallet with WalletConnect integration.",
    requiredSkills: ["Rust", "TypeScript"],
    totalBudget: 200,
    milestones: [
      {
        title: "Wallet core + UI",
        description: "Key management, signing flow, and basic send/receive screens.",
        deliverables: ["Mobile app build", "Signing test plan"],
        budget: 200,
      },
    ],
    complete: true,
  },
  {
    devIndex: 2,
    title: "DEX Frontend",
    description: "Production-grade DEX frontend with charting and limit orders.",
    requiredSkills: ["Solidity", "React"],
    totalBudget: 800,
    milestones: [
      {
        title: "Trading UI + on-chain integration",
        description: "Limit orders, charts, wallet hookup, full happy-path tested.",
        deliverables: ["Deployed dApp", "E2E test suite"],
        budget: 800,
      },
    ],
    complete: true,
  },
];

export async function seedTestData(deployed: SeedDeployment): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("\n⚠️  DATABASE_URL not set — skipping DB seed. On-chain seed will still run.");
  }

  const signers = await ethers.getSigners();
  const owner = signers[0];
  const client = signers[2];
  // Devs are signers[1], signers[3], signers[4] — skipping signer[2] which is the client.
  const devs = [signers[1], signers[3], signers[4]];

  console.log("\n" + "═".repeat(60));
  console.log("  🌱 Seeding test data");
  console.log("═".repeat(60));
  console.log(`Owner:   ${owner.address}`);
  console.log(`Client:  ${client.address}`);
  devs.forEach((d, i) => console.log(`Dev ${i + 1}:   ${d.address}  (skills: ${DEV_PROFILES[i]!.skills.join(", ")})`));

  const usdc = (await ethers.getContractAt("MockUSDC", deployed.usdcAddress)) as any;
  const stakeVault = (await ethers.getContractAt("StakeVault", deployed.stakeVaultAddress)) as any;
  const escrowVault = (await ethers.getContractAt("EscrowVault", deployed.escrowVaultAddress)) as any;
  const projectManager = (await ethers.getContractAt("ProjectManager", deployed.projectManagerAddress)) as any;
  const eliteToken = (await ethers.getContractAt("EliteToken", deployed.eliteTokenAddress)) as any;

  const requiredStake = BigInt(deployed.requiredStake);

  // Hardhat default mint goes to dev 1 + client only. Top up dev 2 and dev 3.
  const TOP_UP = ethers.parseUnits("10000", 6);
  for (let i = 1; i < devs.length; i++) {
    try {
      await (await usdc.mint(devs[i]!.address, TOP_UP)).wait();
    } catch (err: any) {
      // MockUSDC mint shouldn't fail; if it does the dev is just under-funded.
      console.log(`  ⚠️  Could not top up dev ${i + 1}: ${err.shortMessage ?? err.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // 1. All developers stake (on-chain)
  // -------------------------------------------------------------------------
  console.log("\n→ Staking all developers");
  for (let i = 0; i < devs.length; i++) {
    try {
      await (await usdc.connect(devs[i]!).approve(deployed.stakeVaultAddress, requiredStake)).wait();
      await (await stakeVault.connect(devs[i]!).stake(requiredStake)).wait();
      console.log(`  ✓ Dev ${i + 1} staked ${ethers.formatUnits(requiredStake, 6)} USDC`);
    } catch (err: any) {
      console.log(`  ⚠️  Dev ${i + 1} stake skipped (${err.shortMessage ?? err.message})`);
    }
  }

  // -------------------------------------------------------------------------
  // 2. DB rows — devs + client first, so that project FK references resolve.
  // -------------------------------------------------------------------------
  if (!dbUrl) {
    // Without a DB we can still finish the on-chain side; do projects then bail.
    await runProjects(deployed, devs, client, owner, projectManager, escrowVault, usdc, eliteToken);
    console.log("\n✓ On-chain seed complete (DB seed skipped)");
    return;
  }

  const pool = new Pool({ connectionString: dbUrl });
  try {
    for (let i = 0; i < devs.length; i++) {
      await seedDeveloperRow(pool, devs[i]!.address, DEV_PROFILES[i]!, deployed.requiredStake);
      console.log(`  ✓ DB row for dev ${i + 1}`);
    }
    await seedClientRow(pool, client.address);
    console.log("  ✓ DB row for client");

    // -----------------------------------------------------------------------
    // 3. Projects — on-chain create/deposit/assign + DB rows. For "complete"
    //    projects, also approve milestones on-chain, mirror DB, mint xELITE,
    //    self-delegate.
    // -----------------------------------------------------------------------
    for (let s = 0; s < PROJECT_SPECS.length; s++) {
      const spec = PROJECT_SPECS[s]!;
      const dev = devs[spec.devIndex]!;
      console.log(`\n→ Project ${s + 1} "${spec.title}" → dev ${spec.devIndex + 1}`);
      const contractProjectId = await createProjectOnChain(
        spec,
        client,
        owner,
        dev,
        deployed,
        usdc,
        escrowVault,
        projectManager
      );
      if (contractProjectId === null) continue;

      const projectId = await seedProjectRow(pool, spec, client.address, dev.address, contractProjectId);
      if (!projectId) continue;

      if (!spec.complete) {
        console.log(`  · Project left in-progress (status=active)`);
        continue;
      }

      await approveMilestonesOnChain(spec, contractProjectId, client, projectManager);
      await mirrorCompletedMilestonesInDb(pool, projectId, spec, deployed.platformFeeBps);
      await seedReviewRow(pool, projectId, client.address, dev.address);
      await mintAndDelegate(pool, dev, owner, eliteToken, deployed.platformFeeBps, spec);
    }

    console.log("\n✓ Seed complete");
  } catch (err: any) {
    console.log(`\n⚠️  DB seed failed: ${err.message}`);
    console.log("    (Did you run `cd backend && npm run reset-dev` to apply migrations?)");
  } finally {
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
// On-chain helpers
// ---------------------------------------------------------------------------

async function runProjects(
  deployed: SeedDeployment,
  devs: any[],
  client: any,
  owner: any,
  projectManager: any,
  escrowVault: any,
  usdc: any,
  eliteToken: any
): Promise<void> {
  // No-DB fallback path: just push the chain through every project so contracts
  // reach the same end state. Used when DATABASE_URL isn't set.
  for (const spec of PROJECT_SPECS) {
    const dev = devs[spec.devIndex];
    const contractProjectId = await createProjectOnChain(
      spec,
      client,
      owner,
      dev,
      deployed,
      usdc,
      escrowVault,
      projectManager
    );
    if (contractProjectId === null || !spec.complete) continue;
    await approveMilestonesOnChain(spec, contractProjectId, client, projectManager);
    const earned = computeDeveloperEarnings(spec, deployed.platformFeeBps);
    try {
      await (await eliteToken.mint(dev.address, earned)).wait();
      await (await eliteToken.connect(dev).delegate(dev.address)).wait();
    } catch (err: any) {
      console.log(`  ⚠️  Mint/delegate skipped for dev ${spec.devIndex + 1}: ${err.shortMessage ?? err.message}`);
    }
  }
}

async function createProjectOnChain(
  spec: ProjectSpec,
  client: any,
  owner: any,
  dev: any,
  deployed: SeedDeployment,
  usdc: any,
  escrowVault: any,
  projectManager: any
): Promise<bigint | null> {
  const totalBudgetUnits = BigInt(spec.totalBudget) * 1_000_000n;
  const milestoneBudgets = spec.milestones.map((m) => BigInt(m.budget) * 1_000_000n);
  const milestoneHashes = spec.milestones.map((m) => detailsHash(m));

  let contractProjectId: bigint | null = null;
  try {
    const tx = await projectManager
      .connect(client)
      .createProjectWithMilestones(totalBudgetUnits, milestoneBudgets, milestoneHashes);
    const receipt = await tx.wait();
    const created = receipt.logs.find((l: any) => l.fragment?.name === "ProjectCreated");
    contractProjectId = created?.args?.projectId ?? null;
    console.log(`  ✓ on-chain id = ${contractProjectId}`);
  } catch (err: any) {
    console.log(`  ⚠️  createProject skipped (${err.shortMessage ?? err.message})`);
    return null;
  }

  if (contractProjectId === null) return null;

  try {
    await (await usdc.connect(client).approve(deployed.escrowVaultAddress, totalBudgetUnits)).wait();
    await (await escrowVault.connect(client).deposit(contractProjectId, totalBudgetUnits)).wait();
    console.log(`  ✓ escrow deposited ${spec.totalBudget} USDC`);
  } catch (err: any) {
    console.log(`  ⚠️  Deposit skipped (${err.shortMessage ?? err.message})`);
  }

  try {
    await (await projectManager.connect(owner).assignDevelopers(contractProjectId, [dev.address])).wait();
    console.log(`  ✓ assigned dev ${spec.devIndex + 1}`);
  } catch (err: any) {
    console.log(`  ⚠️  Assign skipped (${err.shortMessage ?? err.message})`);
  }

  return contractProjectId;
}

async function approveMilestonesOnChain(
  spec: ProjectSpec,
  contractProjectId: bigint,
  client: any,
  projectManager: any
): Promise<void> {
  for (let idx = 0; idx < spec.milestones.length; idx++) {
    try {
      await (await projectManager.connect(client).approveMilestone(contractProjectId, idx)).wait();
      console.log(`  ✓ approved milestone ${idx + 1}/${spec.milestones.length}`);
    } catch (err: any) {
      console.log(`  ⚠️  approveMilestone[${idx}] skipped (${err.shortMessage ?? err.message})`);
    }
  }
}

async function mintAndDelegate(
  pool: Pool | null,
  dev: any,
  owner: any,
  eliteToken: any,
  platformFeeBps: number,
  spec: ProjectSpec
): Promise<void> {
  // Voting power = total_earned × (avg_rating / 5). With a fresh 5-star review
  // (seeded right before this), avg_rating = 5 → voting_power = total_earned.
  const earnedBaseUnits = computeDeveloperEarnings(spec, platformFeeBps);
  try {
    await (await eliteToken.connect(owner).mint(dev.address, earnedBaseUnits)).wait();
    console.log(`  ✓ minted ${ethers.formatUnits(earnedBaseUnits, 6)} xELITE to dev ${spec.devIndex + 1}`);
  } catch (err: any) {
    console.log(`  ⚠️  Mint skipped (${err.shortMessage ?? err.message})`);
  }
  try {
    await (await eliteToken.connect(dev).delegate(dev.address)).wait();
    console.log(`  ✓ self-delegated dev ${spec.devIndex + 1}`);
  } catch (err: any) {
    console.log(`  ⚠️  Delegate skipped (${err.shortMessage ?? err.message})`);
  }

  if (pool) {
    await pool.query(
      `UPDATE developers
          SET elite_token_balance = $1,
              last_voting_power_update = NOW()
        WHERE wallet_address = $2`,
      [Number(earnedBaseUnits) / 1_000_000, dev.address.toLowerCase()]
    );
  }
}

function computeDeveloperEarnings(spec: ProjectSpec, platformFeeBps: number): bigint {
  const totalBudgetUnits = BigInt(spec.totalBudget) * 1_000_000n;
  const fee = (totalBudgetUnits * BigInt(platformFeeBps)) / 10_000n;
  return totalBudgetUnits - fee;
}

function detailsHash(m: MilestoneSpec): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["string", "string", "string"],
      [m.title, m.description, JSON.stringify(m.deliverables)]
    )
  );
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function seedDeveloperRow(
  pool: Pool,
  walletAddress: string,
  profile: DevProfile,
  requiredStakeBaseUnits: string
): Promise<void> {
  await pool.query(
    `INSERT INTO developers (
       wallet_address, email, github_username, skills, bio, hourly_rate,
       availability, stake_amount, staked_at, status
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5, $6, 'available', $7, NOW(), 'active'
     )
     ON CONFLICT (wallet_address) DO NOTHING`,
    [
      walletAddress.toLowerCase(),
      profile.email,
      profile.githubUsername,
      JSON.stringify(profile.skills),
      profile.bio,
      profile.hourlyRate,
      Number(requiredStakeBaseUnits) / 1_000_000,
    ]
  );
}

async function seedClientRow(pool: Pool, walletAddress: string): Promise<void> {
  await pool.query(
    `INSERT INTO clients (
       wallet_address, email, company_name, description, website, is_registered
     ) VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (wallet_address) DO NOTHING`,
    [
      walletAddress.toLowerCase(),
      CLIENT_PROFILE.email,
      CLIENT_PROFILE.companyName,
      CLIENT_PROFILE.description,
      CLIENT_PROFILE.website,
    ]
  );
}

async function seedProjectRow(
  pool: Pool,
  spec: ProjectSpec,
  clientAddress: string,
  devAddress: string,
  contractProjectId: bigint
): Promise<string | null> {
  const existing = await pool.query("SELECT id FROM projects WHERE contract_project_id = $1", [
    Number(contractProjectId),
  ]);
  if (existing.rowCount && existing.rowCount > 0) {
    console.log("  · Project row already exists — skipping insert");
    return existing.rows[0]!.id;
  }

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
      clientAddress.toLowerCase(),
      spec.title,
      spec.description,
      JSON.stringify(spec.requiredSkills),
      spec.totalBudget,
      devAddress.toLowerCase(),
      Number(contractProjectId),
    ]
  );
  const projectId = projectResult.rows[0]!.id;

  for (let i = 0; i < spec.milestones.length; i++) {
    const m = spec.milestones[i]!;
    await pool.query(
      `INSERT INTO milestones (
         project_id, milestone_number, title, description, deliverables,
         budget, status, details_hash, on_chain_index
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'pending', $7, $8)`,
      [projectId, i + 1, m.title, m.description, JSON.stringify(m.deliverables), m.budget, detailsHash(m), i]
    );
  }

  await pool.query(
    `INSERT INTO escrow_deposits (project_id, contract_project_id, total_deposited, deposit_tx_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id) DO NOTHING`,
    [projectId, Number(contractProjectId), spec.totalBudget, "0x" + "0".repeat(64)]
  );

  await pool.query(
    `UPDATE clients SET projects_created = projects_created + 1 WHERE wallet_address = $1`,
    [clientAddress.toLowerCase()]
  );

  console.log(`  ✓ DB rows for project + ${spec.milestones.length} milestones`);
  return projectId;
}

async function mirrorCompletedMilestonesInDb(
  pool: Pool,
  projectId: string,
  spec: ProjectSpec,
  platformFeeBps: number
): Promise<void> {
  // Mirror what handleApproveMilestone in the backend would have done after
  // each MilestoneApproved event: status=completed, payment fields, then add
  // the developer payment to total_earned.
  const fakeTxHash = "0x" + "0".repeat(64);
  let totalDeveloperPayment = 0;

  for (let i = 0; i < spec.milestones.length; i++) {
    const budget = spec.milestones[i]!.budget;
    const platformFee = (budget * platformFeeBps) / 10_000;
    const developerPayment = budget - platformFee;
    totalDeveloperPayment += developerPayment;

    await pool.query(
      `UPDATE milestones
          SET status = 'completed',
              completed_at = NOW(),
              payment_amount = $3,
              platform_fee = $4,
              payment_tx_hash = $5,
              paid_at = NOW(),
              updated_at = NOW()
        WHERE project_id = $1 AND on_chain_index = $2`,
      [projectId, i, developerPayment, platformFee, fakeTxHash]
    );
  }

  // Credit the developer's total_earned. The DB trigger will recompute
  // voting_power once the review (with rating) lands.
  await pool.query(
    `UPDATE developers
        SET total_earned = total_earned + $1,
            updated_at = NOW()
      WHERE wallet_address = (
        SELECT assigned_developer FROM projects WHERE id = $2
      )`,
    [totalDeveloperPayment, projectId]
  );

  // Mirror handleApproveMilestone's project-completion flip.
  const completion = await pool.query<{
    client_address: string;
    assigned_developer: string | null;
  }>(
    `UPDATE projects
        SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND status = 'active'
      RETURNING client_address, assigned_developer`,
    [projectId]
  );

  // Recompute aggregate counters from truth instead of incrementing — this
  // way re-running the seed without resetting DB doesn't double-count, and
  // doesn't silently skip the bump if a previous run flipped the status but
  // didn't update counters (which is what happens when the seed is re-run
  // across upgrades).
  const project = completion.rows[0];
  const projectRow =
    project ??
    (await pool.query<{ client_address: string; assigned_developer: string | null }>(
      `SELECT client_address, assigned_developer FROM projects WHERE id = $1`,
      [projectId]
    )).rows[0]!;

  if (projectRow.assigned_developer) {
    await pool.query(
      `UPDATE developers d
          SET projects_completed = (
                SELECT COUNT(*) FROM projects p
                 WHERE p.assigned_developer = d.wallet_address
                   AND p.status = 'completed'
              ),
              availability = 'available',
              current_project_id = NULL,
              updated_at = NOW()
        WHERE d.wallet_address = $1`,
      [projectRow.assigned_developer]
    );
  }
  await pool.query(
    `UPDATE clients c
        SET projects_completed = (
              SELECT COUNT(*) FROM projects p
               WHERE p.client_address = c.wallet_address
                 AND p.status = 'completed'
            ),
            total_spent = (
              SELECT COALESCE(SUM(total_budget), 0) FROM projects p
               WHERE p.client_address = c.wallet_address
                 AND p.status = 'completed'
            ),
            updated_at = NOW()
      WHERE c.wallet_address = $1`,
    [projectRow.client_address]
  );

  console.log(`  ✓ DB milestones marked completed; project completed; dev credited ${totalDeveloperPayment} USDC`);
}

async function seedReviewRow(
  pool: Pool,
  projectId: string,
  clientAddress: string,
  devAddress: string
): Promise<void> {
  // The recalculate_ratings trigger will update developers.average_rating,
  // which in turn fires recalculate_voting_power to set voting_power.
  await pool.query(
    `INSERT INTO reviews (project_id, reviewer_address, reviewee_address, reviewer_type, rating, comment)
     VALUES ($1, $2, $3, 'client', 5, $4)
     ON CONFLICT (project_id, reviewer_address) DO NOTHING`,
    [projectId, clientAddress.toLowerCase(), devAddress.toLowerCase(), "Excellent work, delivered on spec."]
  );
  console.log("  ✓ 5-star client review (triggers voting_power recalc)");
}
