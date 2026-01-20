import type { FastifyInstance } from 'fastify';
import { keccak256, toUtf8Bytes } from 'ethers';
import type { Database } from '../db/index.js';
import type {
  BlockchainConfig,
  SubmitOnChainRequest,
  SubmitOnChainResponse,
  BlockchainStatusResponse,
  SupplierWallet,
} from '../types.js';

// Dynamic import for contract client (ESM module)
type ZKDPPContractClient = import('@zkdpp/contracts').ZKDPPContractClient;

let contractClient: ZKDPPContractClient | null = null;

/**
 * Initialize the contract client lazily
 */
async function getContractClient(config: BlockchainConfig): Promise<ZKDPPContractClient> {
  if (!contractClient) {
    const { ZKDPPContractClient } = await import('@zkdpp/contracts');
    contractClient = new ZKDPPContractClient({
      addresses: config.contracts,
      chainId: config.chainId,
      rpcUrl: config.rpcUrl,
    });
    contractClient.connectWithKey(config.privateKey);
  }
  return contractClient;
}

/**
 * Register blockchain-related routes for settlement on-chain operations
 */
export function registerBlockchainRoutes(
  app: FastifyInstance,
  db: Database,
  config?: BlockchainConfig
): void {
  // Skip registration if blockchain is not configured
  if (!config) {
    app.log.warn('Blockchain not configured - blockchain routes disabled');
    return;
  }

  /**
   * POST /settlements/:id/submit-on-chain
   *
   * Submit a finalized settlement statement to the blockchain
   */
  app.post<{
    Params: { id: string };
    Body: SubmitOnChainRequest;
    Reply: SubmitOnChainResponse;
  }>(
    '/settlements/:id/submit-on-chain',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['supplierWallet'],
          properties: {
            supplierWallet: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              txHash: { type: 'string' },
              blockNumber: { type: 'number' },
              error: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: { success: { type: 'boolean' }, error: { type: 'string' } },
          },
          404: {
            type: 'object',
            properties: { success: { type: 'boolean' }, error: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply): Promise<SubmitOnChainResponse> => {
      const { id } = request.params;
      const { supplierWallet } = request.body;

      try {
        // Get statement
        const statement = await db.getStatementWithBlockchain(id);

        if (!statement) {
          reply.code(404);
          return { success: false, error: 'Statement not found' };
        }

        // Verify statement is finalized
        if (statement.status !== 'FINALIZED') {
          reply.code(400);
          return { success: false, error: 'Statement must be finalized before on-chain submission' };
        }

        // Verify not already submitted
        if (statement.blockchain_status !== 'NOT_SUBMITTED') {
          reply.code(400);
          return {
            success: false,
            error: `Statement already submitted to blockchain (status: ${statement.blockchain_status})`,
          };
        }

        // Get contract client
        const client = await getContractClient(config);

        // Generate statement hash from statement data
        const statementHash = keccak256(
          toUtf8Bytes(
            JSON.stringify({
              id: statement.id,
              supplierId: statement.supplier_id,
              periodStart: statement.period_start,
              periodEnd: statement.period_end,
              totalAmount: statement.total_amount,
              breakdown: statement.breakdown,
            })
          )
        );

        // Convert amount to USDC units (6 decimals)
        const amountInUsdc = client.parseUsdc(statement.total_amount.toString());

        // Update status to pending before submission
        await db.updateBlockchainStatus(id, 'PENDING', supplierWallet);

        // Submit to blockchain
        const result = await client.submitStatement({
          statementId: statement.id,
          supplier: supplierWallet,
          totalAmount: amountInUsdc,
          statementHash,
        });

        // Update database with transaction info
        await db.updateBlockchainSubmission(id, {
          txHash: result.hash,
          blockNumber: result.blockNumber,
          status: 'SUBMITTED',
        });

        request.log.info(
          {
            statementId: id,
            txHash: result.hash,
            blockNumber: result.blockNumber,
          },
          'Settlement submitted to blockchain'
        );

        return {
          success: true,
          txHash: result.hash,
          blockNumber: result.blockNumber,
        };
      } catch (error) {
        request.log.error({ error, statementId: id }, 'Failed to submit settlement to blockchain');

        // Revert status to NOT_SUBMITTED on failure
        await db.updateBlockchainStatus(id, 'FAILED');

        reply.code(500);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * POST /settlements/:id/finalize-on-chain
   *
   * Finalize a settlement on the blockchain after the dispute window
   */
  app.post<{
    Params: { id: string };
    Reply: SubmitOnChainResponse;
  }>(
    '/settlements/:id/finalize-on-chain',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              txHash: { type: 'string' },
              blockNumber: { type: 'number' },
              error: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: { success: { type: 'boolean' }, error: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply): Promise<SubmitOnChainResponse> => {
      const { id } = request.params;

      try {
        // Get statement
        const statement = await db.getStatementWithBlockchain(id);

        if (!statement) {
          reply.code(404);
          return { success: false, error: 'Statement not found' };
        }

        // Verify statement is submitted
        if (statement.blockchain_status !== 'SUBMITTED') {
          reply.code(400);
          return {
            success: false,
            error: `Statement must be submitted to blockchain first (status: ${statement.blockchain_status})`,
          };
        }

        // Get contract client
        const client = await getContractClient(config);

        // Check if finalizable
        const isFinalizable = await client.isFinalizable(statement.id);
        if (!isFinalizable) {
          const remaining = await client.getRemainingDisputeTime(statement.id);
          reply.code(400);
          return {
            success: false,
            error: `Dispute window not passed. ${remaining} seconds remaining.`,
          };
        }

        // Finalize on blockchain
        const result = await client.finalizeStatement(statement.id);

        // Update database
        await db.updateBlockchainFinalization(id, {
          txHash: result.hash,
          blockNumber: result.blockNumber,
        });

        request.log.info(
          {
            statementId: id,
            txHash: result.hash,
            blockNumber: result.blockNumber,
          },
          'Settlement finalized on blockchain'
        );

        return {
          success: true,
          txHash: result.hash,
          blockNumber: result.blockNumber,
        };
      } catch (error) {
        request.log.error({ error, statementId: id }, 'Failed to finalize settlement on blockchain');
        reply.code(500);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * GET /settlements/:id/blockchain-status
   *
   * Get the blockchain status of a settlement
   */
  app.get<{
    Params: { id: string };
    Reply: BlockchainStatusResponse | { error: string };
  }>(
    '/settlements/:id/blockchain-status',
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
    async (request, reply): Promise<BlockchainStatusResponse | { error: string }> => {
      const { id } = request.params;

      const statement = await db.getStatementWithBlockchain(id);

      if (!statement) {
        reply.code(404);
        return { error: 'Statement not found' };
      }

      const response: BlockchainStatusResponse = {
        statementId: statement.id,
        blockchainStatus: statement.blockchain_status,
        txHash: statement.tx_hash,
        blockNumber: statement.block_number,
        chainSubmittedAt: statement.chain_submitted_at,
        chainFinalizedAt: statement.chain_finalized_at,
      };

      // If submitted, check chain status
      if (statement.blockchain_status === 'SUBMITTED') {
        try {
          const client = await getContractClient(config);
          response.isFinalizable = await client.isFinalizable(statement.id);
          response.remainingDisputeTime = await client.getRemainingDisputeTime(statement.id);
        } catch (error) {
          request.log.warn({ error, statementId: id }, 'Failed to get chain status');
        }
      }

      return response;
    }
  );

  /**
   * POST /supplier-wallets
   *
   * Register a supplier's wallet address
   */
  app.post<{
    Body: { supplierId: string; walletAddress: string };
    Reply: { success: boolean; wallet?: SupplierWallet; error?: string };
  }>(
    '/supplier-wallets',
    {
      schema: {
        body: {
          type: 'object',
          required: ['supplierId', 'walletAddress'],
          properties: {
            supplierId: { type: 'string' },
            walletAddress: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
          },
        },
        response: {
          201: { type: 'object', additionalProperties: true },
          400: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply): Promise<{ success: boolean; wallet?: SupplierWallet; error?: string }> => {
      try {
        const wallet = await db.registerSupplierWallet(
          request.body.supplierId,
          request.body.walletAddress
        );
        reply.code(201);
        return { success: true, wallet };
      } catch (error) {
        request.log.error({ error }, 'Failed to register supplier wallet');
        reply.code(400);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to register wallet',
        };
      }
    }
  );

  /**
   * GET /supplier-wallets/:supplierId
   *
   * Get a supplier's registered wallet
   */
  app.get<{
    Params: { supplierId: string };
    Reply: { wallet: SupplierWallet | null };
  }>(
    '/supplier-wallets/:supplierId',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            supplierId: { type: 'string' },
          },
        },
        response: {
          200: { type: 'object', additionalProperties: true },
        },
      },
    },
    async (request): Promise<{ wallet: SupplierWallet | null }> => {
      const wallet = await db.getSupplierWallet(request.params.supplierId);
      return { wallet };
    }
  );

  app.log.info('Blockchain routes registered');
}
