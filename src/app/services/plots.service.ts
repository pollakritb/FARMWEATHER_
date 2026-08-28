import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../infrastructure/database/database.service';
import { CreatePlotDto } from '../dtos/create-plot.dto';
import { UpdatePlotDto } from '../dtos/update-plot.dto';
import { Plot } from '../models/domain';

type PlotRow = {
  id: string; name: string; latitude: number; longitude: number; province?: string | null;
  crop_type: Plot['cropType']; planted_at: string | Date; active: boolean; created_at: string | Date;
};

@Injectable()
export class PlotsService {
  private readonly plots = new Map<string, Plot>();
  private readonly owners = new Map<string, string>();

  constructor(private readonly database: DatabaseService) {}

  async create(dto: CreatePlotDto, ownerId: string): Promise<Plot> {
    const plot: Plot = {
      id: randomUUID(),
      ...dto,
      active: true,
      createdAt: new Date().toISOString(),
    };
    if (this.database.enabled) {
      await this.database.query(
        `INSERT INTO plots (id, name, latitude, longitude, province, crop_type, planted_at, active, created_at, owner_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [plot.id, plot.name, plot.latitude, plot.longitude, plot.province ?? null, plot.cropType, plot.plantedAt, plot.active, plot.createdAt, ownerId],
      );
      return plot;
    }
    this.plots.set(plot.id, plot);
    this.owners.set(plot.id, ownerId);
    return plot;
  }

  async findAll(ownerId?: string): Promise<Plot[]> {
    if (this.database.enabled) {
      const rows = ownerId
        ? await this.database.query<PlotRow>('SELECT * FROM plots WHERE owner_id = $1 ORDER BY created_at', [ownerId])
        : await this.database.query<PlotRow>('SELECT * FROM plots ORDER BY created_at');
      return rows.map((row) => this.toPlot(row));
    }
    return [...this.plots.values()].filter((plot) => !ownerId || this.owners.get(plot.id) === ownerId);
  }

  async findActive(): Promise<Plot[]> {
    return (await this.findAll()).filter((plot) => plot.active);
  }

  async findOne(id: string, ownerId?: string): Promise<Plot> {
    let plot: Plot | undefined;
    if (this.database.enabled) {
      const row = ownerId
        ? (await this.database.query<PlotRow>('SELECT * FROM plots WHERE id = $1 AND owner_id = $2', [id, ownerId]))[0]
        : (await this.database.query<PlotRow>('SELECT * FROM plots WHERE id = $1', [id]))[0];
      plot = row ? this.toPlot(row) : undefined;
    } else plot = !ownerId || this.owners.get(id) === ownerId ? this.plots.get(id) : undefined;
    if (!plot) throw new NotFoundException(`Plot ${id} not found`);
    return plot;
  }

  async update(id: string, dto: UpdatePlotDto, ownerId: string): Promise<Plot> {
    const current = await this.findOne(id, ownerId);
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    ) as UpdatePlotDto;
    const updated: Plot = { ...current, ...changes };
    if (this.database.enabled) {
      await this.database.query(
        `UPDATE plots SET name=$1, latitude=$2, longitude=$3, province=$4, crop_type=$5,
         planted_at=$6, active=$7 WHERE id=$8 AND owner_id=$9`,
        [updated.name, updated.latitude, updated.longitude, updated.province ?? null,
          updated.cropType, updated.plantedAt, updated.active, id, ownerId],
      );
    } else this.plots.set(id, updated);
    return updated;
  }

  async remove(id: string, ownerId: string): Promise<void> {
    await this.findOne(id, ownerId);
    if (this.database.enabled) await this.database.query('DELETE FROM plots WHERE id=$1 AND owner_id=$2', [id, ownerId]);
    else { this.plots.delete(id); this.owners.delete(id); }
  }

  private toPlot(row: PlotRow): Plot {
    return {
      id: row.id, name: row.name, latitude: row.latitude, longitude: row.longitude,
      province: row.province ?? undefined, cropType: row.crop_type,
      plantedAt: new Date(row.planted_at).toISOString().slice(0, 10), active: row.active,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
