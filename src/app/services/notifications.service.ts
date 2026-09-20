import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { AnalysisResult, Notification, RiskLevel } from '../models/domain';
import { PlotsService } from './plots.service';

type NotificationRow = { id:string; plot_id:string; analysis_id:string; severity:RiskLevel; title:string; message:string; status:'PENDING'|'READ'; created_at:string|Date; read_at?:string|Date };

@Injectable()
export class NotificationsService {
  private readonly notifications = new Map<string, Notification>();
  constructor(private readonly database: DatabaseService, private readonly plots: PlotsService) {}

  async createIfNeeded(result: AnalysisResult): Promise<Notification | undefined> {
    if (result.riskLevel === 'LOW') return;
    const message = result.recommendations.join(' • ');
    const duplicate = (await this.findByPlot(result.plotId)).find((item) => item.status === 'PENDING' && item.message === message);
    if (duplicate) return duplicate;
    const notification: Notification = { id:randomUUID(), plotId:result.plotId, analysisId:result.id, severity:result.riskLevel, title:`ความเสี่ยงสภาพอากาศระดับ ${result.riskLevel}`, message, status:'PENDING', createdAt:new Date().toISOString() };
    if (this.database.enabled) await this.database.query('INSERT INTO notifications VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [notification.id,notification.plotId,notification.analysisId,notification.severity,notification.title,notification.message,notification.status,notification.createdAt,null]);
    else this.notifications.set(notification.id, notification);
    return notification;
  }

  async findByPlot(plotId: string, ownerId?: string): Promise<Notification[]> {
    if (ownerId) await this.plots.findOne(plotId, ownerId);
    if (this.database.enabled) return (await this.database.query<NotificationRow>('SELECT * FROM notifications WHERE plot_id=$1 ORDER BY created_at',[plotId])).map(this.toDomain);
    return [...this.notifications.values()].filter((item) => item.plotId === plotId);
  }

  async markRead(id: string, ownerId: string): Promise<Notification> {
    let notification: Notification | undefined;
    if (this.database.enabled) {
      const row = (await this.database.query<NotificationRow>('SELECT n.* FROM notifications n JOIN plots p ON p.id=n.plot_id WHERE n.id=$1 AND p.owner_id=$2',[id,ownerId]))[0];
      notification = row ? this.toDomain(row) : undefined;
      if (notification) await this.database.query('UPDATE notifications SET status=\'READ\', read_at=now() WHERE id=$1',[id]);
    } else {
      notification = this.notifications.get(id);
      if (notification) await this.plots.findOne(notification.plotId, ownerId);
    }
    if (!notification) throw new NotFoundException(`Notification ${id} not found`);
    notification.status='READ'; notification.readAt=new Date().toISOString();
    return notification;
  }

  private readonly toDomain = (r: NotificationRow): Notification => ({ id:r.id, plotId:r.plot_id, analysisId:r.analysis_id, severity:r.severity, title:r.title, message:r.message, status:r.status, createdAt:new Date(r.created_at).toISOString(), readAt:r.read_at ? new Date(r.read_at).toISOString() : undefined });
}
