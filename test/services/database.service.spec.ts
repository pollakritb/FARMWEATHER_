import { Pool } from 'pg';
import { DatabaseService } from '../../src/infrastructure/database/database.service';

jest.mock('pg', () => ({ Pool: jest.fn() }));

describe('DatabaseService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses memory mode without a connection string', async () => {
    const service = new DatabaseService({ get: jest.fn(() => undefined) } as never);

    expect(service.enabled).toBe(false);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    await expect(service.query('SELECT 1')).rejects.toThrow('PostgreSQL is not configured');
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    expect(Pool).not.toHaveBeenCalled();
  });

  it('initializes PostgreSQL, returns query rows, and closes the pool', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'row-1' }] });
    const end = jest.fn().mockResolvedValue(undefined);
    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => ({ query, end }) as never);
    const service = new DatabaseService({ get: jest.fn(() => 'postgresql://localhost/farmweather') } as never);

    expect(service.enabled).toBe(true);
    expect(Pool).toHaveBeenCalledWith({ connectionString: 'postgresql://localhost/farmweather' });
    await service.onModuleInit();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS users'));
    await expect(service.query<{ id: string }>('SELECT id FROM users', ['row-1']))
      .resolves.toEqual([{ id: 'row-1' }]);
    expect(query).toHaveBeenCalledWith('SELECT id FROM users', ['row-1']);
    await service.onModuleDestroy();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
