import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';
import { CROP_TYPES, CropType } from '../models/crop-catalog';

export class CreatePlotDto {
  @ApiProperty({ example: 'แปลงข้าวเหนือคลอง' })
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiProperty({ example: 14.0208 })
  @IsLatitude()
  latitude: number;

  @ApiProperty({ example: 100.525 })
  @IsLongitude()
  longitude: number;

  @ApiPropertyOptional({ example: 'ปทุมธานี' })
  @IsOptional()
  @IsString()
  province?: string;

  @ApiProperty({ enum: CROP_TYPES, example: 'RICE' })
  @IsIn(CROP_TYPES)
  cropType: CropType;

  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  plantedAt: string;
}
