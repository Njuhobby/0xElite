import { ethers } from 'ethers';
import { verifySignature, generateRegistrationMessage, generateUpdateMessage } from '../../utils/signature';

describe('verifySignature', () => {
  let wallet: ethers.Wallet;

  beforeAll(() => {
    wallet = ethers.Wallet.createRandom();
  });

  it('returns true for a valid signature', async () => {
    const message = 'Hello, 0xElite!';
    const signature = await wallet.signMessage(message);
    expect(verifySignature(message, signature, wallet.address)).toBe(true);
  });

  it('returns false when message does not match', async () => {
    const signature = await wallet.signMessage('original message');
    expect(verifySignature('different message', signature, wallet.address)).toBe(false);
  });

  it('returns false when address does not match', async () => {
    const message = 'Hello';
    const signature = await wallet.signMessage(message);
    const otherWallet = ethers.Wallet.createRandom();
    expect(verifySignature(message, signature, otherWallet.address)).toBe(false);
  });

  it('returns false for malformed signature', () => {
    expect(verifySignature('test', 'not-a-sig', '0x' + 'ab'.repeat(20))).toBe(false);
  });

  it('is case-insensitive for address comparison', async () => {
    const message = 'case test';
    const signature = await wallet.signMessage(message);
    expect(verifySignature(message, signature, wallet.address.toLowerCase())).toBe(true);
    expect(verifySignature(message, signature, wallet.address.toUpperCase())).toBe(true);
  });
});

describe('generateRegistrationMessage', () => {
  it('includes the wallet address', () => {
    const addr = '0x' + 'ab'.repeat(20);
    const msg = generateRegistrationMessage(addr, 1234567890);
    expect(msg).toContain(addr);
  });

  it('includes the timestamp', () => {
    const msg = generateRegistrationMessage('0x' + 'ab'.repeat(20), 1234567890);
    expect(msg).toContain('1234567890');
  });

  it('includes welcome text', () => {
    const msg = generateRegistrationMessage('0x' + 'ab'.repeat(20), 0);
    expect(msg).toContain('Welcome to 0xElite');
  });
});

describe('generateUpdateMessage', () => {
  it('includes the wallet address', () => {
    const addr = '0x' + 'ab'.repeat(20);
    const msg = generateUpdateMessage(addr, 1234567890);
    expect(msg).toContain(addr);
  });

  it('includes the timestamp', () => {
    const msg = generateUpdateMessage('0x' + 'ab'.repeat(20), 9999);
    expect(msg).toContain('9999');
  });

  it('includes update text', () => {
    const msg = generateUpdateMessage('0x' + 'ab'.repeat(20), 0);
    expect(msg).toContain('Update profile');
  });
});
