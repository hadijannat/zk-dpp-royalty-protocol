import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ProofPackage } from '@zkdpp/schemas';
import { validateProofPackage } from '@zkdpp/schemas';
import type { Verifier } from '../services/verifier.js';
import type { VerifyResponse } from '../types.js';

interface VerifyBody {
  proofPackage: ProofPackage;
}

export function registerVerifyRoutes(
  app: FastifyInstance,
  verifier: Verifier
): void {
  /**
   * POST /verify
   *
   * Verify a ZK proof package and return a signed receipt.
   */
  app.post<{ Body: VerifyBody }>(
    '/verify',
    {
      schema: {
        body: {
          type: 'object',
          required: ['proofPackage'],
          properties: {
            proofPackage: {
              type: 'object',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              receipt: { type: 'object', additionalProperties: true },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: VerifyBody }>,
      reply: FastifyReply
    ): Promise<VerifyResponse> => {
      const { proofPackage } = request.body;

      // Validate proof package against schema
      if (!validateProofPackage(proofPackage)) {
        reply.code(400);
        const errors = (validateProofPackage as unknown as { errors?: Array<{ message: string }> }).errors;
        return {
          success: false,
          error: `Invalid proof package: ${errors?.map((e: { message: string }) => e.message).join(', ') || 'unknown error'}`,
        };
      }

      // Verify the proof
      const result = await verifier.verify(proofPackage);

      if (!result.success) {
        reply.code(400);
        return {
          success: false,
          error: result.error,
        };
      }

      return {
        success: true,
        receipt: result.receipt,
      };
    }
  );
}
