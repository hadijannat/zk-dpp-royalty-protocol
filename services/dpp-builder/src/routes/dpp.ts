import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ViewComposer } from '../services/view-composer.js';
import type { AccessLevel, GetDPPViewResponse } from '../types.js';

export function registerDPPRoutes(app: FastifyInstance, viewComposer: ViewComposer): void {
  /**
   * GET /dpp/:id/view/public
   *
   * Get the public view of a DPP
   */
  app.get<{
    Params: { id: string };
    Reply: GetDPPViewResponse;
  }>(
    '/dpp/:id/view/public',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<GetDPPViewResponse> => {
      const dpp = await viewComposer.composeDPPView(request.params.id, 'PUBLIC');

      if (!dpp) {
        reply.code(404);
        return { success: false, error: 'Product not found' };
      }

      return { success: true, dpp };
    }
  );

  /**
   * GET /dpp/:id/view/legit-interest
   *
   * Get the legitimate interest view of a DPP.
   * In production, this requires authentication and authorization.
   */
  app.get<{
    Params: { id: string };
    Reply: GetDPPViewResponse;
  }>(
    '/dpp/:id/view/legit-interest',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<GetDPPViewResponse> => {
      // In production, verify JWT and check for LEGIT_INTEREST role
      // For MVP, allow access without authentication

      const dpp = await viewComposer.composeDPPView(request.params.id, 'LEGIT_INTEREST');

      if (!dpp) {
        reply.code(404);
        return { success: false, error: 'Product not found' };
      }

      return { success: true, dpp };
    }
  );

  /**
   * GET /dpp/:id/view/authority
   *
   * Get the authority view of a DPP.
   * In production, this requires authentication and AUTHORITY role.
   */
  app.get<{
    Params: { id: string };
    Reply: GetDPPViewResponse;
  }>(
    '/dpp/:id/view/authority',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<GetDPPViewResponse> => {
      // In production, verify JWT and check for AUTHORITY role
      // For MVP, allow access without authentication

      const dpp = await viewComposer.composeDPPView(request.params.id, 'AUTHORITY');

      if (!dpp) {
        reply.code(404);
        return { success: false, error: 'Product not found' };
      }

      return { success: true, dpp };
    }
  );

  /**
   * GET /dpp/:id/view/:level
   *
   * Generic endpoint to get any view level.
   * Useful for dynamic access level selection.
   */
  app.get<{
    Params: { id: string; level: string };
    Reply: GetDPPViewResponse;
  }>(
    '/dpp/:id/view/:level',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            level: { type: 'string', enum: ['public', 'legit-interest', 'authority'] },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<GetDPPViewResponse> => {
      const levelMap: Record<string, AccessLevel> = {
        'public': 'PUBLIC',
        'legit-interest': 'LEGIT_INTEREST',
        'authority': 'AUTHORITY',
      };

      const accessLevel = levelMap[request.params.level.toLowerCase()];
      if (!accessLevel) {
        reply.code(400);
        return { success: false, error: 'Invalid access level' };
      }

      const dpp = await viewComposer.composeDPPView(request.params.id, accessLevel);

      if (!dpp) {
        reply.code(404);
        return { success: false, error: 'Product not found' };
      }

      return { success: true, dpp };
    }
  );
}
