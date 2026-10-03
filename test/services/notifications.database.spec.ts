import { NotificationsService } from '../../src/app/services/notifications.service';
import { AnalysisResult } from '../../src/app/models/domain';

describe('NotificationsService with database storage', () => {
  it('deduplicates pending risks, checks plot ownership, and marks a notification read', async () => {
    const rows: Record<string, unknown>[] = [];
    const query = jest.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.startsWith('INSERT INTO notifications')) {
        const [id, plotId, analysisId, severity, title, message, status, createdAt] = values;
        rows.push({ id, plot_id: plotId, analysis_id: analysisId, severity, title, message,
          status, created_at: createdAt, read_at: null });
        return [];
      }
      if (sql.startsWith('SELECT * FROM notifications')) return rows.filter((row) => row.plot_id === values[0]);
      if (sql.startsWith('SELECT n.* FROM notifications')) {
        return values[1] === 'owner-1' ? rows.filter((row) => row.id === values[0]) : [];
      }
      if (sql.startsWith('UPDATE notifications')) return [];
      return [];
    });
    const plots = { findOne: jest.fn(async (_id: string, ownerId: string) => {
      if (ownerId !== 'owner-1') throw new Error('not found');
    }) };
    const service = new NotificationsService({ enabled: true, query } as never, plots as never);
    const result: AnalysisResult = {
      id: 'analysis-1', plotId: 'plot-1', riskLevel: 'HIGH', recommendations: ['Drain field'],
      triggeredRules: ['HEAVY_RAIN'], forecastAt: '2026-07-31T00:00:00.000Z',
      growthStage: 'SEEDLING', createdAt: '2026-07-31T00:00:00.000Z',
    };

    const created = await service.createIfNeeded(result);
    expect(created).toMatchObject({ status: 'PENDING', severity: 'HIGH', message: 'Drain field' });
    expect(await service.createIfNeeded({ ...result, id: 'analysis-2' })).toEqual(created);
    expect(rows).toHaveLength(1);
    await expect(service.findByPlot('plot-1', 'owner-2')).rejects.toThrow('not found');
    expect(await service.findByPlot('plot-1', 'owner-1')).toEqual([created]);
    await expect(service.markRead(created!.id, 'owner-2')).rejects.toThrow('not found');

    const read = await service.markRead(created!.id, 'owner-1');
    expect(read).toMatchObject({ status: 'READ', readAt: expect.any(String) });
    expect(query).toHaveBeenCalledWith(
      "UPDATE notifications SET status='READ', read_at=now() WHERE id=$1", [created!.id],
    );
  });
});
