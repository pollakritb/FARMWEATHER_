import { CropsController } from '../../src/app/controllers/crops.controller';
import { CROP_PROFILES, GROWTH_STAGE_DAYS } from '../../src/app/models/crop-catalog';

describe('CropsController', () => {
  it('publishes every crop with its thresholds and growth stages', () => {
    const crops = new CropsController().findAll();

    expect(crops).toHaveLength(Object.keys(CROP_PROFILES).length);
    for (const crop of crops) {
      expect(crop).toEqual({
        code: crop.code,
        name: CROP_PROFILES[crop.code].name,
        thresholds: CROP_PROFILES[crop.code].thresholds,
        growthStageDays: GROWTH_STAGE_DAYS[crop.code],
      });
    }
  });
});
