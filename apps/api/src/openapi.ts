import { z } from 'zod';

export interface Operation {
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
  summary: string;
  tag: 'Public' | 'Booking' | 'Sign-in' | 'Account' | 'Season holder' | 'Cabin holder' | 'Beach club' | 'Platform' | 'System';
  /** Who may call it: nobody in particular, a signed-in person, or the holder of one booking, cart or order token. */
  auth: 'none' | 'session' | 'booking-token' | 'cart-token' | 'order-token' | 'provider-signature';
  request?: z.ZodType;
  query?: Record<string, string>;
  /** Query parameters the caller may leave out. */
  optionalQuery?: Record<string, string>;
  headers?: Record<string, string>;
  /** Success status, followed by the error codes this operation can answer with. */
  success: 200 | 201 | 204;
  errors: number[];
}

const errorDescriptions: Record<number, string> = {
  400: 'Invalid request',
  401: 'Not signed in, or signature not valid',
  403: 'Not allowed for this role or beach club',
  404: 'Not found',
  409: 'Conflict with the current state',
  422: 'The request is valid but cannot be applied',
  429: 'Too many requests',
  503: 'Integration not configured',
};

/** Builds the OpenAPI document from the same schemas the routes validate with. */
export function buildOpenApi(operations: readonly Operation[], info: { title: string; version: string }): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operations) {
    const openApiPath = operation.path.replace(/:([A-Za-z]+)/g, '{$1}');
    const pathParameters = [...operation.path.matchAll(/:([A-Za-z]+)/g)].map((match) => ({ name: match[1], in: 'path', required: true, schema: { type: 'string' } }));
    const queryParameters = [
      ...Object.entries(operation.query ?? {}).map(([name, description]) => ({ name, in: 'query', required: true, description, schema: { type: 'string' } })),
      ...Object.entries(operation.optionalQuery ?? {}).map(([name, description]) => ({ name, in: 'query', required: false, description, schema: { type: 'string' } })),
    ];
    const headerParameters = Object.entries(operation.headers ?? {}).map(([name, description]) => ({ name, in: 'header', required: true, description, schema: { type: 'string' } }));
    const responses: Record<string, unknown> = { [operation.success]: { description: operation.success === 204 ? 'Done, no content' : 'Success' } };
    for (const status of operation.errors) {
      responses[status] = { description: errorDescriptions[status] ?? 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
    }
    (paths[openApiPath] ??= {})[operation.method] = {
      summary: operation.summary,
      tags: [operation.tag],
      parameters: [...pathParameters, ...queryParameters, ...headerParameters],
      ...(operation.auth === 'session' || operation.auth === 'booking-token' || operation.auth === 'cart-token' || operation.auth === 'order-token'
        ? { security: [{ [{ session: 'session', 'booking-token': 'bookingToken', 'cart-token': 'cartToken', 'order-token': 'orderToken' }[operation.auth]]: [] }] }
        : {}),
      ...(operation.request ? { requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(operation.request, { unrepresentable: 'any' }) } } } } : {}),
      responses,
    };
  }
  return {
    openapi: '3.1.0',
    info,
    paths,
    components: {
      securitySchemes: {
        session: { type: 'http', scheme: 'bearer', description: 'Token returned by POST /v1/auth/login' },
        bookingToken: { type: 'http', scheme: 'bearer', description: 'Token returned by POST /v1/checkouts, valid for that booking only' },
        cartToken: { type: 'http', scheme: 'bearer', description: 'Ticket returned by POST /v1/carts, valid for that cart only; the cart owner may use a session token instead' },
        orderToken: { type: 'http', scheme: 'bearer', description: 'Token returned by the cart confirmation, valid for that order only' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } } },
        },
      },
    },
  };
}
