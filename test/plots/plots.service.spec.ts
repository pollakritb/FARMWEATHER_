import { PlotsService } from '../../src/app/services/plots.service';

describe('PlotsService', () => {
  const ownerId = 'owner-1';

  function createService() {
    const database = { enabled: false, query: jest.fn() };
    return new PlotsService(database as never);
  }

  it('preserves omitted fields during a partial update', async () => {
    const service = createService();
    const created = await service.create({
      name: 'แปลงเดิม',
      latitude: 14.0208,
      longitude: 100.525,
      province: 'ปทุมธานี',
      cropType: 'RICE',
      plantedAt: '2026-07-01',
    }, ownerId);

    const updated = await service.update(created.id, { name: 'แปลงใหม่' }, ownerId);
    const stored = await service.findOne(created.id, ownerId);

    expect(updated).toEqual({ ...created, name: 'แปลงใหม่' });
    expect(stored).toEqual(updated);
  });

  it('changes active without losing plot coordinates or crop metadata', async () => {
    const service = createService();
    const created = await service.create({
      name: 'แปลงเดิม',
      latitude: 14.0208,
      longitude: 100.525,
      province: 'ปทุมธานี',
      cropType: 'RICE',
      plantedAt: '2026-07-01',
    }, ownerId);

    const updated = await service.update(created.id, { active: false }, ownerId);

    expect(updated).toEqual({ ...created, active: false });
  });
});
