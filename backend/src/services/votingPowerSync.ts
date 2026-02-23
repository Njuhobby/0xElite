import { ethers } from 'ethers';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

const ELITE_TOKEN_ABI = [
  'function mint(address to, uint256 amount) external',
  'function burn(address from, uint256 amount) external',
  'function balanceOf(address account) external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
];

/**
 * VotingPowerSync service
 *
 * Recalculates voting power for developers and syncs EliteToken balances on-chain.
 * Voting power = total_earned × (average_rating / 5.0)
 *
 * The DB trigger handles recalculation when total_earned or average_rating changes.
 * This service handles the on-chain mint/burn to keep EliteToken balances in sync.
 */
export class VotingPowerSync {
  private db: Pool;
  private eliteToken: ethers.Contract;

  constructor(db: Pool, eliteTokenAddress: string, signer: ethers.Signer) {
    this.db = db;
    this.eliteToken = new ethers.Contract(eliteTokenAddress, ELITE_TOKEN_ABI, signer);
  }

  /**
   * Sync a single developer's EliteToken balance to match their voting_power
   */
  async syncDeveloper(walletAddress: string): Promise<void> {
    const client = await this.db.connect();

    try {
      const result = await client.query(
        'SELECT wallet_address, voting_power, elite_token_balance FROM developers WHERE wallet_address = $1',
        [walletAddress.toLowerCase()]
      );

      if (result.rows.length === 0) {
        logger.warn(`Developer not found: ${walletAddress}`);
        return;
      }

      const dev = result.rows[0];
      const targetBalance = Math.floor(parseFloat(dev.voting_power) * 1e6); // 6 decimals
      const currentOnChain = await this.eliteToken.balanceOf(walletAddress);
      const currentBalance = Number(currentOnChain);

      if (targetBalance === currentBalance) {
        return; // Already in sync
      }

      if (targetBalance > currentBalance) {
        const mintAmount = targetBalance - currentBalance;
        logger.info(`Minting ${mintAmount} EliteToken to ${walletAddress}`);
        const tx = await this.eliteToken.mint(walletAddress, mintAmount);
        await tx.wait();
      } else {
        const burnAmount = currentBalance - targetBalance;
        logger.info(`Burning ${burnAmount} EliteToken from ${walletAddress}`);
        const tx = await this.eliteToken.burn(walletAddress, burnAmount);
        await tx.wait();
      }

      // Update on-chain balance in DB
      await client.query(
        'UPDATE developers SET elite_token_balance = $1, last_voting_power_update = NOW() WHERE wallet_address = $2',
        [dev.voting_power, walletAddress.toLowerCase()]
      );

      logger.info(`Synced EliteToken for ${walletAddress}: ${currentBalance} → ${targetBalance}`);
    } catch (error) {
      logger.error(`Failed to sync voting power for ${walletAddress}:`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Sync all developers whose voting_power differs from elite_token_balance
   */
  async syncAll(): Promise<number> {
    const result = await this.db.query(
      `SELECT wallet_address FROM developers
       WHERE voting_power != elite_token_balance
         AND wallet_address IS NOT NULL
       ORDER BY voting_power DESC`
    );

    let synced = 0;
    for (const row of result.rows) {
      try {
        await this.syncDeveloper(row.wallet_address);
        synced++;
      } catch (error) {
        logger.error(`Failed to sync ${row.wallet_address}, continuing...`);
      }
    }

    logger.info(`Voting power sync complete: ${synced}/${result.rows.length} developers synced`);
    return synced;
  }
}

export default VotingPowerSync;
