import { ethers } from 'ethers';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { eventSyncConfig } from '../config/eventSync';

// Unlock schedule: tier → { projects required, USDC to unlock }
const UNLOCK_SCHEDULE = [
  { tier: 1, projectsRequired: 5, amount: 50 },
  { tier: 2, projectsRequired: 10, amount: 50 },
  { tier: 3, projectsRequired: 15, amount: 50 },
  { tier: 4, projectsRequired: 20, amount: 50 },
] as const;

const USDC_DECIMALS = 6;
const UNLOCK_AMOUNT_RAW = 50_000_000n; // 50 USDC in 6-decimal base units

const STAKE_VAULT_ABI = [
  'function unstakeFor(address developer, uint256 amount) external',
  'function stakes(address developer) view returns (uint256)',
];

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000; // 1 second

export interface UnlockResult {
  developerAddress: string;
  amount: number;
  fromTier: number;
  toTier: number;
  txHash: string;
}

/**
 * Determines the expected unlock tier based on completed project count
 */
function getExpectedTier(projectsCompleted: number): number {
  let tier = 0;
  for (const schedule of UNLOCK_SCHEDULE) {
    if (projectsCompleted >= schedule.projectsRequired) {
      tier = schedule.tier;
    }
  }
  return tier;
}

/**
 * Check if a developer qualifies for an unlock and execute it if so.
 * Called by milestoneListener after a project is marked Completed.
 *
 * Returns UnlockResult if an unlock was executed, null otherwise.
 */
export async function checkAndExecuteUnlock(
  developerAddress: string
): Promise<UnlockResult | null> {
  const normalizedAddress = developerAddress.toLowerCase();

  // 1. Read developer's current state from DB
  const devResult = await pool.query(
    'SELECT projects_completed, unlock_tier, stake_amount FROM developers WHERE wallet_address = $1',
    [normalizedAddress]
  );

  if (devResult.rows.length === 0) {
    logger.warn(`[UnlockService] Developer not found: ${normalizedAddress}`);
    return null;
  }

  const { projects_completed, unlock_tier, stake_amount } = devResult.rows[0];
  const currentTier = Number(unlock_tier);
  const projectsCompleted = Number(projects_completed);

  // 2. Determine expected tier
  const expectedTier = getExpectedTier(projectsCompleted);

  if (expectedTier <= currentTier) {
    // No new unlock needed
    return null;
  }

  // 3. Calculate total to unlock (handles skip-tier)
  const tierGap = expectedTier - currentTier;
  const totalToUnlockUSDC = tierGap * 50;
  const totalToUnlockRaw = UNLOCK_AMOUNT_RAW * BigInt(tierGap);

  logger.info(
    `[UnlockService] Developer ${normalizedAddress} qualifies for unlock: ` +
    `tier ${currentTier} → ${expectedTier}, ${totalToUnlockUSDC} USDC ` +
    `(projects_completed=${projectsCompleted})`
  );

  // 4. Verify on-chain stake is sufficient
  const provider = new ethers.JsonRpcProvider(eventSyncConfig.rpcUrl);
  const stakeVaultContract = new ethers.Contract(
    eventSyncConfig.stakeVaultAddress,
    STAKE_VAULT_ABI,
    provider
  );

  const onChainStake = await (stakeVaultContract as any).stakes(normalizedAddress);
  if (BigInt(onChainStake) < totalToUnlockRaw) {
    logger.error(
      `[UnlockService] On-chain stake insufficient for ${normalizedAddress}: ` +
      `on-chain=${ethers.formatUnits(onChainStake, USDC_DECIMALS)} USDC, ` +
      `needed=${totalToUnlockUSDC} USDC. Data inconsistency — alerting admin.`
    );
    await alertAdmin(
      `Unlock blocked: on-chain stake mismatch for ${normalizedAddress}. ` +
      `On-chain: ${ethers.formatUnits(onChainStake, USDC_DECIMALS)}, needed: ${totalToUnlockUSDC}`
    );
    return null;
  }

  // 5. Execute unstakeFor via backend wallet
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    logger.error('[UnlockService] PRIVATE_KEY not configured — cannot execute unstake');
    await alertAdmin('UnlockService: PRIVATE_KEY missing, unstake blocked');
    return null;
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const stakeVaultWithSigner = stakeVaultContract.connect(wallet) as ethers.Contract;

  let txHash: string | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(
        `[UnlockService] Sending unstakeFor tx (attempt ${attempt}/${MAX_RETRIES}): ` +
        `developer=${normalizedAddress}, amount=${totalToUnlockRaw}`
      );

      const tx = await (stakeVaultWithSigner as any).unstakeFor(normalizedAddress, totalToUnlockRaw);
      logger.info(`[UnlockService] Tx submitted: ${tx.hash}`);

      const receipt = await tx.wait(eventSyncConfig.confirmations);
      txHash = receipt.hash;

      logger.info(`[UnlockService] Tx confirmed: ${txHash}`);
      break;
    } catch (error: any) {
      logger.error(`[UnlockService] unstakeFor attempt ${attempt} failed:`, error.message || error);

      if (attempt === MAX_RETRIES) {
        logger.error(
          `[UnlockService] All ${MAX_RETRIES} attempts failed for ${normalizedAddress}. Alerting admin.`
        );
        await alertAdmin(
          `Unlock tx failed after ${MAX_RETRIES} retries for ${normalizedAddress}: ${error.message}`
        );
        return null;
      }

      // Exponential backoff: 1s, 4s, 16s
      const delay = RETRY_BASE_DELAY * Math.pow(4, attempt - 1);
      logger.info(`[UnlockService] Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }

  if (!txHash) {
    return null;
  }

  // 6. Update DB: developer unlock_tier + total_unlocked + unlock_history
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    await dbClient.query(
      `UPDATE developers
       SET unlock_tier = $1,
           total_unlocked = total_unlocked + $2,
           last_unlock_at = NOW(),
           updated_at = NOW()
       WHERE wallet_address = $3`,
      [expectedTier, totalToUnlockUSDC, normalizedAddress]
    );

    await dbClient.query(
      `INSERT INTO unlock_history (developer_address, amount, from_tier, to_tier, tx_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [normalizedAddress, totalToUnlockUSDC, currentTier, expectedTier, txHash]
    );

    await dbClient.query('COMMIT');

    logger.info(
      `[UnlockService] DB updated: ${normalizedAddress} tier ${currentTier}→${expectedTier}, ` +
      `${totalToUnlockUSDC} USDC unlocked, tx=${txHash}`
    );
  } catch (error) {
    await dbClient.query('ROLLBACK');
    logger.error('[UnlockService] DB update failed after successful tx:', error);
    await alertAdmin(
      `Unlock tx succeeded (${txHash}) but DB update failed for ${normalizedAddress}. ` +
      `Manual DB fix needed: set unlock_tier=${expectedTier}, add ${totalToUnlockUSDC} to total_unlocked.`
    );
    // Still return the result since the on-chain tx succeeded
  } finally {
    dbClient.release();
  }

  return {
    developerAddress: normalizedAddress,
    amount: totalToUnlockUSDC,
    fromTier: currentTier,
    toTier: expectedTier,
    txHash,
  };
}

/**
 * Get unlock status for a developer
 */
export async function getUnlockStatus(developerAddress: string) {
  const normalizedAddress = developerAddress.toLowerCase();

  const devResult = await pool.query(
    'SELECT projects_completed, unlock_tier, total_unlocked, stake_amount, last_unlock_at FROM developers WHERE wallet_address = $1',
    [normalizedAddress]
  );

  if (devResult.rows.length === 0) {
    return null;
  }

  const dev = devResult.rows[0];
  const currentTier = Number(dev.unlock_tier);
  const projectsCompleted = Number(dev.projects_completed);

  // Find next unlock threshold
  const nextSchedule = UNLOCK_SCHEDULE.find((s) => s.tier === currentTier + 1);
  const nextUnlock = nextSchedule
    ? {
        projectsNeeded: nextSchedule.projectsRequired,
        projectsRemaining: Math.max(0, nextSchedule.projectsRequired - projectsCompleted),
        amount: nextSchedule.amount.toFixed(6),
      }
    : null;

  const totalUnlocked = Number(dev.total_unlocked);
  const stakeAmount = Number(dev.stake_amount);

  return {
    address: normalizedAddress,
    projectsCompleted,
    unlockTier: currentTier,
    totalUnlocked: totalUnlocked.toFixed(6),
    remainingStake: Math.max(0, stakeAmount - totalUnlocked).toFixed(6),
    lastUnlockAt: dev.last_unlock_at,
    nextUnlock,
  };
}

/**
 * Get unlock history for a developer
 */
export async function getUnlockHistory(developerAddress: string) {
  const normalizedAddress = developerAddress.toLowerCase();

  const result = await pool.query(
    `SELECT id, amount, from_tier, to_tier, tx_hash, unlocked_at
     FROM unlock_history
     WHERE developer_address = $1
     ORDER BY unlocked_at DESC`,
    [normalizedAddress]
  );

  return result.rows.map((row) => ({
    id: row.id,
    amount: Number(row.amount).toFixed(6),
    fromTier: row.from_tier,
    toTier: row.to_tier,
    txHash: row.tx_hash,
    unlockedAt: row.unlocked_at,
  }));
}

/**
 * Return the static unlock schedule
 */
export function getUnlockSchedule() {
  return UNLOCK_SCHEDULE.map((s) => ({
    tier: s.tier,
    projectsRequired: s.projectsRequired,
    unlockAmount: s.amount,
  }));
}

async function alertAdmin(message: string): Promise<void> {
  logger.error(`[UnlockService] ADMIN ALERT: ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
