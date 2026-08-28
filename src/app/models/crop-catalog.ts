export const CROP_PROFILES = {
  RICE: {
    code: 'RICE', name: 'ข้าว',
    thresholds: { heavyRainMmPerHour: 10, highTemperatureC: 35, lowHumidityPct: 45, strongWindMs: 8 },
  },
  CORN: {
    code: 'CORN', name: 'ข้าวโพด',
    thresholds: { heavyRainMmPerHour: 12, highTemperatureC: 36, lowHumidityPct: 40, strongWindMs: 7 },
  },
  CASSAVA: {
    code: 'CASSAVA', name: 'มันสำปะหลัง',
    thresholds: { heavyRainMmPerHour: 15, highTemperatureC: 38, lowHumidityPct: 35, strongWindMs: 10 },
  },
  SUGARCANE: {
    code: 'SUGARCANE', name: 'อ้อย',
    thresholds: { heavyRainMmPerHour: 15, highTemperatureC: 38, lowHumidityPct: 35, strongWindMs: 9 },
  },
  DURIAN: {
    code: 'DURIAN', name: 'ทุเรียน',
    thresholds: { heavyRainMmPerHour: 8, highTemperatureC: 34, lowHumidityPct: 50, strongWindMs: 6 },
  },
} as const;

export type CropType = keyof typeof CROP_PROFILES;
export const CROP_TYPES = Object.keys(CROP_PROFILES) as CropType[];

// End day (days after planting) for each stage. These are configurable MVP agronomic defaults.
export const GROWTH_STAGE_DAYS: Record<CropType, [number, number, number]> = {
  RICE: [20, 60, 100], CORN: [14, 45, 85], CASSAVA: [30, 120, 240],
  SUGARCANE: [35, 150, 300], DURIAN: [60, 180, 300],
};
