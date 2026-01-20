/**
 * VerificationEscrow contract ABI
 * Generated from contracts/src/VerificationEscrow.sol
 */
export const VerificationEscrowABI = [
  // Constructor
  {
    type: 'constructor',
    inputs: [
      { name: '_paymentToken', type: 'address' },
      { name: '_initialOwner', type: 'address' },
    ],
  },

  // Events
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'brand', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'VerificationRecorded',
    inputs: [
      { name: 'brand', type: 'address', indexed: true },
      { name: 'supplier', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'receiptId', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'TransferredToSettlement',
    inputs: [
      { name: 'supplier', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      { name: 'brand', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },

  // Read functions
  {
    type: 'function',
    name: 'getBrandBalance',
    stateMutability: 'view',
    inputs: [{ name: 'brand', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getPendingAmount',
    stateMutability: 'view',
    inputs: [
      { name: 'brand', type: 'address' },
      { name: 'supplier', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getSupplierPendingTotal',
    stateMutability: 'view',
    inputs: [{ name: 'supplier', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isReceiptRecorded',
    stateMutability: 'view',
    inputs: [{ name: 'receiptId', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'brandBalances',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'supplierPendingTotals',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'settlementContract',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
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

  // Write functions
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'recordVerification',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'brand', type: 'address' },
      { name: 'supplier', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'receiptId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transferToSettlement',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'supplier', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setSettlementContract',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_settlementContract', type: 'address' }],
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
  {
    type: 'error',
    name: 'InsufficientBalance',
    inputs: [
      { name: 'brand', type: 'address' },
      { name: 'available', type: 'uint256' },
      { name: 'required', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'InvalidAddress', inputs: [] },
  {
    type: 'error',
    name: 'ReceiptAlreadyRecorded',
    inputs: [{ name: 'receiptId', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'NotSettlementContract',
    inputs: [{ name: 'caller', type: 'address' }],
  },
  { type: 'error', name: 'SettlementContractNotSet', inputs: [] },
  {
    type: 'error',
    name: 'InsufficientPendingAmount',
    inputs: [
      { name: 'supplier', type: 'address' },
      { name: 'available', type: 'uint256' },
      { name: 'required', type: 'uint256' },
    ],
  },
] as const;

export type VerificationEscrowABIType = typeof VerificationEscrowABI;
