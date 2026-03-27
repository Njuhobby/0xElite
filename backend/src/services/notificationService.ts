import { pool } from '../config/database';
import { logger } from '../utils/logger';

export async function createNotification(
  walletAddress: string,
  type: string,
  title: string,
  message: string,
  link?: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (wallet_address, type, title, message, link)
       VALUES ($1, $2, $3, $4, $5)`,
      [walletAddress.toLowerCase(), type, title, message, link || null]
    );
  } catch (error) {
    // Non-critical — log but don't throw
    logger.error('Failed to create notification:', { walletAddress, type, error });
  }
}

/**
 * Send the same notification to multiple wallet addresses
 */
export async function createNotificationBatch(
  walletAddresses: string[],
  type: string,
  title: string,
  message: string,
  link?: string
): Promise<void> {
  for (const address of walletAddresses) {
    await createNotification(address, type, title, message, link);
  }
}
