/**
 * Mock ethers.Contract factory
 *
 * Returns objects with jest.fn() methods matching the contract ABIs used in the app.
 */

export function createMockProjectManagerContract() {
  const mockReceipt = {
    hash: '0x' + 'aa'.repeat(32),
    gasUsed: BigInt(100000),
    logs: [],
  };

  const mockTx = {
    hash: '0x' + 'aa'.repeat(32),
    wait: jest.fn().mockResolvedValue(mockReceipt),
  };

  return {
    createProject: jest.fn().mockResolvedValue(mockTx),
    assignDeveloper: jest.fn().mockResolvedValue(mockTx),
    updateProjectState: jest.fn().mockResolvedValue(mockTx),
    getProject: jest.fn(),
    interface: {
      parseLog: jest.fn().mockReturnValue({
        name: 'ProjectCreated',
        args: { projectId: BigInt(1) },
      }),
    },
    target: '0x' + '11'.repeat(20),
    _mockTx: mockTx,
    _mockReceipt: mockReceipt,
  };
}

export function createMockEscrowVaultContract() {
  const mockReceipt = {
    hash: '0x' + 'bb'.repeat(32),
    gasUsed: BigInt(80000),
  };

  const mockTx = {
    hash: '0x' + 'bb'.repeat(32),
    wait: jest.fn().mockResolvedValue(mockReceipt),
  };

  return {
    deposit: jest.fn().mockResolvedValue(mockTx),
    release: jest.fn().mockResolvedValue(mockTx),
    releaseFee: jest.fn().mockResolvedValue(mockTx),
    freeze: jest.fn().mockResolvedValue(mockTx),
    unfreeze: jest.fn().mockResolvedValue(mockTx),
    getEscrowInfo: jest.fn(),
    getAvailableBalance: jest.fn(),
    target: '0x' + '22'.repeat(20),
    _mockTx: mockTx,
    _mockReceipt: mockReceipt,
  };
}

export function createMockEliteTokenContract() {
  const mockTx = {
    wait: jest.fn().mockResolvedValue({ hash: '0x' + 'cc'.repeat(32) }),
  };

  return {
    mint: jest.fn().mockResolvedValue(mockTx),
    burn: jest.fn().mockResolvedValue(mockTx),
    balanceOf: jest.fn().mockResolvedValue(BigInt(0)),
    totalSupply: jest.fn().mockResolvedValue(BigInt(1000000)),
    target: '0x' + '55'.repeat(20),
    _mockTx: mockTx,
  };
}

export function createMockDisputeDAOContract() {
  return {
    getDisputeCore: jest.fn(),
    getDisputeTimeline: jest.fn(),
    getDisputeVoting: jest.fn(),
    queryFilter: jest.fn().mockResolvedValue([]),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
    filters: {
      Staked: jest.fn(),
    },
    target: '0x' + '44'.repeat(20),
  };
}
