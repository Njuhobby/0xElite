// Set environment variables BEFORE any module loads
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.RPC_URL = 'http://localhost:8545';
process.env.PRIVATE_KEY = '0x' + 'ab'.repeat(32);
process.env.PROJECT_MANAGER_ADDRESS = '0x' + '11'.repeat(20);
process.env.ESCROW_VAULT_ADDRESS = '0x' + '22'.repeat(20);
process.env.STAKE_VAULT_ADDRESS = '0x' + '33'.repeat(20);
process.env.DISPUTE_DAO_ADDRESS = '0x' + '44'.repeat(20);
process.env.ELITE_TOKEN_ADDRESS = '0x' + '55'.repeat(20);
process.env.NODE_ENV = 'test';
