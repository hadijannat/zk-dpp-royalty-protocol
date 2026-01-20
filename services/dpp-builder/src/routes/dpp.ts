import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  requireDppViewAccess,
  hasAnyRole,
  DppViewRoles,
  type DppViewType,
  type AuthUser,
} from '@zkdpp/shared';
import type { ViewComposer } from '../services/view-composer.js';
import type { AccessLevel, GetDPPViewResponse } from '../types.js';

/**
 * Map URL path to access level
 */
const viewTypeMap: Record<string, AccessLevel> = {
  'public': 'PUBLIC',
  'legit-interest': 'LEGIT_INTEREST',
  'authority': 'AUTHORITY',
};

/**
 * Map access level to DPP view type for RBAC
 */
const accessToDppView: Record<AccessLevel, DppViewType> = {
  'PUBLIC': 'PUBLIC',
  'LEGIT_INTEREST': 'LEGIT_INTEREST',
  'AUTHORITY': 'AUTHORITY',
};

export function registerDPPRoutes(app: FastifyInstance, viewComposer: ViewComposer): void {
  /**
   * GET /dpp/:id/view/public
   *
   * Get the public view of a DPP (no auth required)
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
   * Requires authentication and LEGIT_INTEREST access.
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
          401: { type: 'object', properties: { error: { type: 'string' }, code: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' }, code: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
      preHandler: requireDppViewAccess('LEGIT_INTEREST'),
    },
    async (request, reply): Promise<GetDPPViewResponse> => {
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
   * Requires authentication and AUTHORITY role.
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
          401: { type: 'object', properties: { error: { type: 'string' }, code: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' }, code: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
      preHandler: requireDppViewAccess('AUTHORITY'),
    },
    async (request, reply): Promise<GetDPPViewResponse> => {
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
          401: { type: 'object', properties: { error: { type: 'string' }, code: { type: 'string' } } },
          403: { type: 'object', properties: { error: { type: 'string' }, code: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<GetDPPViewResponse> => {
      const accessLevel = viewTypeMap[request.params.level.toLowerCase()];
      if (!accessLevel) {
        reply.code(400);
        return { success: false, error: 'Invalid access level' };
      }

      // Check authorization for non-public views
      if (accessLevel !== 'PUBLIC') {
        const dppViewType = accessToDppView[accessLevel];
        const requiredRoles = DppViewRoles[dppViewType];
        const user = (request as FastifyRequest & { user?: AuthUser }).user;

        if (!user) {
          reply.code(401);
          return {
            success: false,
            error: 'Authentication required for this view',
          };
        }

        if (!hasAnyRole(user, requiredRoles)) {
          reply.code(403);
          return {
            success: false,
            error: `Access denied to ${dppViewType} view`,
          };
        }
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
