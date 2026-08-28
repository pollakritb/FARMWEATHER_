import { IsBoolean, IsDateString, IsIn, IsLatitude, IsLongitude, IsOptional, IsString, Length } from 'class-validator';
import { CROP_TYPES, CropType } from '../models/crop-catalog';

export class UpdatePlotDto {
  @IsOptional() @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsIn(CROP_TYPES) cropType?: CropType;
  @IsOptional() @IsDateString() plantedAt?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class SetPlotActiveDto { @IsBoolean() active: boolean; }
