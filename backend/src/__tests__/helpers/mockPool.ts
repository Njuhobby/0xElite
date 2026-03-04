/**
 * Mock pg.Pool factory
 *
 * Returns a mock Pool with jest.fn() for query and connect.
 * connect() returns a mock client with query, release, and transaction helpers.
 */

export interface MockClient {
  query: jest.Mock;
  release: jest.Mock;
}

export interface MockPool {
  query: jest.Mock;
  connect: jest.Mock;
  on: jest.Mock;
  end: jest.Mock;
  _client: MockClient;
}

export function createMockPool(): MockPool {
  const mockClient: MockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  const mockPool: MockPool = {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue(mockClient),
    on: jest.fn(),
    end: jest.fn(),
    _client: mockClient,
  };

  return mockPool;
}

/**
 * Helper to set up a sequence of query results on a mock.
 * Each call to query will resolve to the next result in the list.
 */
export function mockQueryResults(mock: jest.Mock, results: Array<{ rows: any[]; rowCount?: number }>) {
  results.forEach((result) => {
    mock.mockResolvedValueOnce(result);
  });
}

/**
 * Helper to create a standard DB result object
 */
export function dbResult(rows: any[], rowCount?: number) {
  return { rows, rowCount: rowCount ?? rows.length };
}
