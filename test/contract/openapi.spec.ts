import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('OpenAPI Plot response schema', () => {
  it('describes the complete response object without a contradictory allOf', () => {
    const contract = JSON.parse(readFileSync(join(process.cwd(), 'openapi.json'), 'utf8'));
    const plot = contract.components.schemas.Plot;

    expect(plot.allOf).toBeUndefined();
    expect(plot.additionalProperties).toBe(false);
    expect(plot.required).toEqual(expect.arrayContaining([
      'id', 'name', 'latitude', 'longitude', 'cropType', 'plantedAt', 'active', 'createdAt',
    ]));
    expect(Object.keys(plot.properties)).toEqual(expect.arrayContaining(plot.required));
  });
});
