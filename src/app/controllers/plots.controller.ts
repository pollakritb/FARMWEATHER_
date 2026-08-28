import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreatePlotDto } from '../dtos/create-plot.dto';
import { SetPlotActiveDto, UpdatePlotDto } from '../dtos/update-plot.dto';
import { CurrentUser } from '../http/decorators/current-user.decorator';
import { AuthUser } from '../models/auth.types';
import { PlotsService } from '../services/plots.service';

@ApiTags('plots')
@Controller('plots')
export class PlotsController {
  constructor(private readonly plots: PlotsService) {}

  @Post()
  create(@Body() dto: CreatePlotDto, @CurrentUser() user: AuthUser) {
    return this.plots.create(dto, user.id);
  }

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.plots.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.plots.findOne(id, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlotDto, @CurrentUser() user: AuthUser) {
    return this.plots.update(id, dto, user.id);
  }

  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() dto: SetPlotActiveDto, @CurrentUser() user: AuthUser) {
    return this.plots.update(id, { active: dto.active }, user.id);
  }

  @Delete(':id') @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.plots.remove(id, user.id);
  }
}
