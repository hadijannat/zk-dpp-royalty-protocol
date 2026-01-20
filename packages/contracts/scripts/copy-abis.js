#!/usr/bin/env node
/**
 * Copy ABIs from Foundry build output to the TypeScript package
 *
 * Run after `forge build` to update ABIs:
 *   node scripts/copy-abis.js
 *
 * Or from the root:
 *   pnpm --filter @zkdpp/contracts copy-abis
 */

const fs = require('fs');
const path = require('path');

const CONTRACTS_DIR = path.resolve(__dirname, '../../../contracts');
const ABIS_DIR = path.resolve(__dirname, '../src/abis');

const CONTRACTS = [
  'RoyaltySettlement',
  'VerificationEscrow',
  'PaymentDistributor',
  'mocks/MockUSDC',
];

function extractABI(contractName) {
  const jsonPath = path.join(
    CONTRACTS_DIR,
    'out',
    `${contractName.split('/').pop()}.sol`,
    `${contractName.split('/').pop()}.json`
  );

  if (!fs.existsSync(jsonPath)) {
    console.warn(`Warning: ${jsonPath} not found. Run 'forge build' first.`);
    return null;
  }

  const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return json.abi;
}

function generateABIFile(contractName, abi) {
  const name = contractName.split('/').pop();
  const content = `/**
 * ${name} contract ABI
 * Auto-generated from contracts/src/${contractName}.sol
 *
 * DO NOT EDIT MANUALLY - run 'pnpm copy-abis' to regenerate
 */
export const ${name}ABI = ${JSON.stringify(abi, null, 2)} as const;

export type ${name}ABIType = typeof ${name}ABI;
`;

  const outputPath = path.join(ABIS_DIR, `${name}.json.ts`);
  fs.writeFileSync(outputPath, content);
  console.log(`Generated: ${outputPath}`);
}

function main() {
  console.log('Copying ABIs from Foundry build output...\n');

  // Check if Foundry output exists
  const outDir = path.join(CONTRACTS_DIR, 'out');
  if (!fs.existsSync(outDir)) {
    console.error('Error: Foundry output directory not found.');
    console.error('Run "cd contracts && forge build" first.');
    process.exit(1);
  }

  // Create ABIs directory if needed
  if (!fs.existsSync(ABIS_DIR)) {
    fs.mkdirSync(ABIS_DIR, { recursive: true });
  }

  let success = 0;
  let failed = 0;

  for (const contractName of CONTRACTS) {
    const abi = extractABI(contractName);
    if (abi) {
      generateABIFile(contractName, abi);
      success++;
    } else {
      failed++;
    }
  }

  console.log(`\nDone: ${success} generated, ${failed} skipped`);

  if (failed > 0) {
    console.log('\nTo generate all ABIs:');
    console.log('  cd contracts && forge build');
    console.log('  cd ../packages/contracts && node scripts/copy-abis.js');
  }
}

main();
