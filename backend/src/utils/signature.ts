import { ethers } from 'ethers';

/**
 * Verify that a message was signed by the expected address
 * @param message - The original message that was signed
 * @param signature - The signature to verify
 * @param expectedAddress - The address that should have signed the message
 * @returns true if signature is valid, false otherwise
 */
export function verifySignature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    // Recover the address that signed the message
    const recoveredAddress = ethers.verifyMessage(message, signature);

    // Compare addresses (case-insensitive)
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generate a message for user to sign when creating their profile
 * @param address - User's wallet address
 * @param timestamp - Current timestamp
 * @returns Message string to be signed
 */
export function generateRegistrationMessage(address: string, timestamp: number): string {
  return `Welcome to 0xElite!

Please sign this message to verify your wallet ownership.

Wallet: ${address}
Timestamp: ${timestamp}`;
}

/**
 * Generate a message for user to sign when updating their profile
 * @param address - User's wallet address
 * @param timestamp - Current timestamp
 * @returns Message string to be signed
 */
export function generateUpdateMessage(address: string, timestamp: number): string {
  return `Update profile for 0xElite

Wallet: ${address}
Timestamp: ${timestamp}`;
}
