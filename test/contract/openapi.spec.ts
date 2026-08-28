import { readFileSync } from 'node:fs';

type JsonObject = Record<string, unknown>;
type Operation = {
  responses?: Record<string, JsonObject>;
  parameters?: JsonObject[];
  security?: unknown[];
};

const openapi = JSON.parse(readFileSync('openapi.json', 'utf8')) as JsonObject & {
  components: {
    parameters: Record<string, JsonObject>;
    responses: Record<string, JsonObject>;
    schemas: Record<string, JsonObject>;
  };
  paths: Record<string, Record<string, Operation>>;
};

function refName(ref: string): string {
  return ref.slice(ref.lastIndexOf('/') + 1);
}

function resolveComponent<T extends JsonObject>(item: T): T {
  const ref = item.$ref;
  if (typeof ref !== 'string') return item;
  if (ref.startsWith('#/components/responses/')) {
    return openapi.components.responses[refName(ref)] as T;
  }
  if (ref.startsWith('#/components/parameters/')) {
    return openapi.components.parameters[refName(ref)] as T;
  }
  if (ref.startsWith('#/components/schemas/')) {
    return openapi.components.schemas[refName(ref)] as T;
  }
  throw new Error(`Unsupported OpenAPI reference: ${ref}`);
}

describe('OpenAPI contract', () => {
  it('declares every path parameter used by a route template', () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      const requiredParams = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);

      for (const [method, operation] of Object.entries(methods)) {
        if (!['get', 'post', 'patch', 'delete'].includes(method)) continue;
        const parameters = (operation.parameters ?? []).map((parameter) =>
          resolveComponent(parameter),
        );

        for (const name of requiredParams) {
          expect(parameters).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ name, in: 'path', required: true }),
            ]),
          );
        }
      }
    }
  });

  it('documents JSON schemas for every successful response with a body', () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!['get', 'post', 'patch', 'delete'].includes(method)) continue;

        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          if (status === '204' || !status.startsWith('2')) continue;
          const resolved = resolveComponent(response);
          const json = (resolved.content as JsonObject | undefined)?.['application/json'] as
            | JsonObject
            | undefined;

          expect({ method: method.toUpperCase(), path, status, response: resolved }).toEqual(
            expect.objectContaining({
              response: expect.objectContaining({
                content: expect.objectContaining({
                  'application/json': expect.objectContaining({
                    schema: expect.any(Object),
                  }),
                }),
              }),
            }),
          );
          expect(json?.schema).toBeDefined();
        }
      }
    }
  });

  it('documents Unauthorized responses for every bearer-protected operation', () => {
    for (const [path, methods] of Object.entries(openapi.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!['get', 'post', 'patch', 'delete'].includes(method)) continue;
        if (Array.isArray(operation.security) && operation.security.length === 0) continue;

        expect({ method: method.toUpperCase(), path, responses: operation.responses }).toEqual(
          expect.objectContaining({
            responses: expect.objectContaining({
              '401': expect.any(Object),
            }),
          }),
        );
      }
    }
  });

  it('keeps Plot as a closed response schema that accepts actual API fields', () => {
    expect(openapi.components.schemas.Plot).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: expect.arrayContaining([
        'id',
        'name',
        'latitude',
        'longitude',
        'cropType',
        'plantedAt',
        'active',
        'createdAt',
      ]),
      properties: expect.objectContaining({
        id: expect.any(Object),
        name: expect.any(Object),
        latitude: expect.any(Object),
        longitude: expect.any(Object),
        cropType: expect.any(Object),
        plantedAt: expect.any(Object),
        active: expect.any(Object),
        createdAt: expect.any(Object),
      }),
    });
  });
});
