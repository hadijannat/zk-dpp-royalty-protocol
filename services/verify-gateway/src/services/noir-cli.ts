import fs from 'fs';
import path from 'path';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';
import type { ProofPackage } from '@zkdpp/schemas';
import type { PredicateDefinition } from '@zkdpp/predicate-lib';

const execFileAsync = promisify(execFile);

interface NoirVerifyConfig {
  predicate: PredicateDefinition;
  proofPackage: ProofPackage;
  nargoBin: string;
  circuitsDir?: string;
}

export async function verifyWithNoirCli(config: NoirVerifyConfig): Promise<{ valid: boolean; error?: string }> {
  try {
    const circuitDir = resolveCircuitDir(config.circuitsDir, config.predicate.circuitPath);
    const packageName = config.predicate.circuitPath;

    ensureCompiled(config.nargoBin, circuitDir, packageName);

    const proofsDir = path.join(circuitDir, 'proofs');
    fs.mkdirSync(proofsDir, { recursive: true });

    const proofPath = path.join(proofsDir, `${packageName}.proof`);
    const proofBytes = Buffer.from(config.proofPackage.proof, 'hex');
    fs.writeFileSync(proofPath, proofBytes);

    const verifierToml = buildVerifierToml(config.predicate, config.proofPackage);
    fs.writeFileSync(path.join(circuitDir, 'Verifier.toml'), verifierToml);

    await execFileAsync(config.nargoBin, ['verify'], { cwd: circuitDir });

    return { valid: true };
  } catch (error) {
    return { valid: false, error: stringifyError(error) };
  }
}

function resolveCircuitDir(circuitsDir: string | undefined, circuitPath: string): string {
  if (circuitsDir && fs.existsSync(circuitsDir)) {
    return path.join(circuitsDir, circuitPath);
  }

  // Walk up from cwd to find circuits/noir/predicates
  let current = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(current, 'circuits/noir/predicates');
    if (fs.existsSync(candidate)) {
      return path.join(candidate, circuitPath);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error('NOIR_CIRCUITS_DIR not found. Set NOIR_CIRCUITS_DIR to circuits/noir/predicates');
}

function ensureCompiled(nargoBin: string, circuitDir: string, packageName: string): void {
  const artifact = path.join(circuitDir, 'target', `${packageName}.json`);
  if (fs.existsSync(artifact)) return;

  execFileSync(nargoBin, ['compile'], { cwd: circuitDir, stdio: 'pipe' });
}

function buildVerifierToml(predicate: PredicateDefinition, proofPackage: ProofPackage): string {
  const lines: string[] = [];
  const publicInputs = proofPackage.publicInputs;

  if (publicInputs.threshold !== undefined) {
    lines.push(`threshold = "${publicInputs.threshold}"`);
  }

  if (predicate.name === 'CERT_VALID') {
    const checkTs = publicInputs.timestamp ?? (publicInputs.extra as any)?.checkTimestamp;
    if (checkTs === undefined) {
      throw new Error('Missing timestamp for CERT_VALID verification');
    }
    lines.push(`check_timestamp = "${checkTs}"`);
  } else if (publicInputs.timestamp !== undefined) {
    lines.push(`timestamp = "${publicInputs.timestamp}"`);
  }

  lines.push(`commitment_root = ${bytesToTomlArray(publicInputs.commitmentRoot)}`);
  lines.push(`product_binding = ${bytesToTomlArray(publicInputs.productBinding)}`);
  lines.push(`requester_binding = ${bytesToTomlArray(publicInputs.requesterBinding)}`);

  const extra = publicInputs.extra as Record<string, unknown> | undefined;
  const forbiddenHash = extra?.forbiddenListHash || extra?.forbidden_list_hash;
  if (forbiddenHash) {
    lines.push(`forbidden_list_hash = ${bytesToTomlArray(String(forbiddenHash))}`);
  }

  return lines.join('\n') + '\n';
}

function bytesToTomlArray(hex: string): string {
  const bytes = Buffer.from(stripHexPrefix(hex), 'hex');
  if (bytes.length !== 32) {
    throw new Error('Expected 32-byte hex value for binding/hash');
  }
  return `[${Array.from(bytes).join(', ')}]`;
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
