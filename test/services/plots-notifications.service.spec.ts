import { PlotsService } from '../../src/app/services/plots.service';
import { NotificationsService } from '../../src/app/services/notifications.service';

describe('PlotsService and NotificationsService in-memory workflows', () => {
  const database = { enabled: false, query: jest.fn() };

  it('limits plots and notifications to their owner and supports updates', async () => {
    const plots = new PlotsService(database as never);
    const notifications = new NotificationsService(database as never, plots);
    const plot = await plots.create({
      name: 'North field', latitude: 14.02, longitude: 100.52, cropType: 'RICE', plantedAt: '2026-07-01',
    }, 'owner-1');

    expect(await plots.findAll('owner-1')).toHaveLength(1);
    expect(await plots.findAll('owner-2')).toHaveLength(0);
    expect(await plots.findActive()).toHaveLength(1);
    await expect(plots.findOne(plot.id, 'owner-2')).rejects.toThrow(`Plot ${plot.id} not found`);

    const updated = await plots.update(plot.id, { name: 'South field', active: false }, 'owner-1');
    expect(updated).toMatchObject({ name: 'South field', active: false });
    expect(await plots.findActive()).toHaveLength(0);

    const low = await notifications.createIfNeeded({ id: 'low', plotId: plot.id, riskLevel: 'LOW', recommendations: [], triggeredRules: [], forecastAt: '', growthStage: 'SEEDLING', createdAt: '' });
    expect(low).toBeUndefined();
    const created = await notifications.createIfNeeded({ id: 'risk-1', plotId: plot.id, riskLevel: 'HIGH', recommendations: ['Drain water'], triggeredRules: ['HEAVY_RAIN'], forecastAt: '', growthStage: 'SEEDLING', createdAt: '' });
    expect(created).toMatchObject({ status: 'PENDING', severity: 'HIGH' });
    await expect(notifications.createIfNeeded({ id: 'risk-2', plotId: plot.id, riskLevel: 'HIGH', recommendations: ['Drain water'], triggeredRules: ['HEAVY_RAIN'], forecastAt: '', growthStage: 'SEEDLING', createdAt: '' })).resolves.toEqual(created);
    await expect(notifications.findByPlot(plot.id, 'owner-2')).rejects.toThrow();
    await expect(notifications.markRead(created!.id, 'owner-1')).resolves.toMatchObject({ status: 'READ', readAt: expect.any(String) });

    await plots.remove(plot.id, 'owner-1');
    await expect(plots.findOne(plot.id, 'owner-1')).rejects.toThrow();
    await expect(notifications.markRead('missing', 'owner-1')).rejects.toThrow('Notification missing not found');
  });
});
