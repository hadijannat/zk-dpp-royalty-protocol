/**
 * PaymentDistributor contract ABI
 * Generated from contracts/src/PaymentDistributor.sol
 */
export const PaymentDistributorABI = [
  // Constructor
  {
    type: 'constructor',
    inputs: [
      { name: '_paymentToken', type: 'address' },
      { name: '_protocolTreasury', type: 'address' },
      { name: '_initialOwner', type: 'address' },
    ],
  },

  // Events
  {
    type: 'event',
    name: 'PaymentDistributed',
    inputs: [
      { name: 'supplier', type: 'address', indexed: true },
      { name: 'gateway', type: 'address', indexed: true },
      { name: 'supplierAmount', type: 'uint256', indexed: false },
      { name: 'protocolFee', type: 'uint256', indexed: false },
      { name: 'gatewayFee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FeesUpdated',
    inputs: [
      { name: 'protocolFeeBps', type: 'uint256', indexed: false },
      { name: 'gatewayFeeBps', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TreasuryUpdated',
    inputs: [
      { name: 'oldTreasury', type: 'address', indexed: true },
      { name: 'newTreasury', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'ProtocolFeesClaimed',
    inputs: [
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'GatewayFeesClaimed',
    inputs: [
      { name: 'gateway', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },

  // Read functions
  {
    type: 'function',
    name: 'getFees',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'protocolFeeBps', type: 'uint256' },
      { name: 'gatewayFeeBps', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'calculateFees',
    stateMutability: 'view',
    inputs: [{ name: 'totalAmount', type: 'uint256' }],
    outputs: [
      { name: 'supplierAmount', type: 'uint256' },
      { name: 'protocolFee', type: 'uint256' },
      { name: 'gatewayFee', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getAccumulatedProtocolFees',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getAccumulatedGatewayFees',
    stateMutability: 'view',
    inputs: [{ name: 'gateway', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'protocolFeeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'gatewayFeeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'protocolTreasury',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'accumulatedProtocolFees',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'accumulatedGatewayFees',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paymentToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'owner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },

  // Constants
  {
    type: 'function',
    name: 'MAX_TOTAL_FEE_BPS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'BPS_DENOMINATOR',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'DEFAULT_PROTOCOL_FEE_BPS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'DEFAULT_GATEWAY_FEE_BPS',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },

  // Write functions
  {
    type: 'function',
    name: 'distribute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'supplier', type: 'address' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'gateway', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setFees',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_protocolFeeBps', type: 'uint256' },
      { name: '_gatewayFeeBps', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setProtocolTreasury',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'newTreasury', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimProtocolFees',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimGatewayFees',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'pause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unpause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // Errors
  { type: 'error', name: 'InvalidAddress', inputs: [] },
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  {
    type: 'error',
    name: 'FeesTooHigh',
    inputs: [
      { name: 'combined', type: 'uint256' },
      { name: 'max', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'InsufficientBalance',
    inputs: [
      { name: 'available', type: 'uint256' },
      { name: 'required', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'NothingToClaim', inputs: [] },
] as const;

export type PaymentDistributorABIType = typeof PaymentDistributorABI;
