import { PlotsService } from '../../src/app/services/plots.service';

describe('PlotsService with database storage', () => {
  it('persists plot changes and enforces the owner on reads and deletes', async () => {
    const rows = new Map<string, Record<string, unknown>>();
    const query = jest.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith('INSERT INTO plots')) {
        const [id, name, latitude, longitude, province, cropType, plantedAt, active, createdAt, ownerId] = values;
        rows.set(String(id), {
          id, name, latitude, longitude, province, crop_type: cropType,
          planted_at: plantedAt, active, created_at: createdAt, owner_id: ownerId,
        });
        return [];
      }
      if (sql.startsWith('UPDATE plots')) {
        const [name, latitude, longitude, province, cropType, plantedAt, active, id, ownerId] = values;
        const row = rows.get(String(id));
        if (row && row.owner_id === ownerId) Object.assign(row, {
          name, latitude, longitude, province, crop_type: cropType, planted_at: plantedAt, active,
        });
        return [];
      }
      if (sql.startsWith('DELETE FROM plots')) {
        if (rows.get(String(values[0]))?.owner_id === values[1]) rows.delete(String(values[0]));
        return [];
      }
      if (sql.includes('WHERE id = $1')) {
        const row = rows.get(String(values[0]));
        return row && (!sql.includes('owner_id') || row.owner_id === values[1]) ? [row] : [];
      }
      if (sql.includes('WHERE owner_id')) return [...rows.values()].filter((row) => row.owner_id === values[0]);
      return [...rows.values()];
    });
    const service = new PlotsService({ enabled: true, query } as never);
    const created = await service.create({
      name: 'North field', latitude: 14, longitude: 100, cropType: 'RICE', plantedAt: '2026-07-01',
    }, 'owner-1');

    expect(created).toMatchObject({ name: 'North field', active: true });
    expect(await service.findAll('owner-1')).toEqual([created]);
    expect(await service.findAll('owner-2')).toEqual([]);
    expect(await service.findAll()).toEqual([created]);
    expect(await service.findActive()).toEqual([created]);
    await expect(service.findOne(created.id, 'owner-2')).rejects.toThrow('not found');
    expect(await service.findOne(created.id)).toEqual(created);

    const updated = await service.update(created.id, { name: 'South field', active: false }, 'owner-1');
    expect(updated).toMatchObject({ name: 'South field', active: false });
    expect(await service.findActive()).toEqual([]);
    expect(await service.findOne(created.id, 'owner-1')).toEqual(updated);
    await expect(service.remove(created.id, 'owner-2')).rejects.toThrow('not found');
    await service.remove(created.id, 'owner-1');
    await expect(service.findOne(created.id, 'owner-1')).rejects.toThrow('not found');
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM plots WHERE id=$1 AND owner_id=$2', [created.id, 'owner-1'],
    );
  });
});
