import type { Database } from '../db/index.js';
import type {
  Product,
  AccessLevel,
  DPPView,
  DPPViewPublic,
  DPPViewLegitInterest,
  DPPViewAuthority,
} from '../types.js';
import { getPredicateById } from '@zkdpp/predicate-lib';
import pino from 'pino';

const logger = pino({ name: 'view-composer' });

/**
 * Composes DPP views based on access level.
 *
 * Access levels follow the privacy tier model:
 * - PUBLIC: Basic product info only
 * - LEGIT_INTEREST: Product info + verified predicate results (no raw values)
 * - AUTHORITY: Full access including raw values, supplier details, audit trail
 */
export class ViewComposer {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Compose a DPP view for the given product and access level
   */
  async composeDPPView(productId: string, accessLevel: AccessLevel): Promise<DPPView | null> {
    const product = await this.db.getProduct(productId);
    if (!product) {
      return null;
    }

    switch (accessLevel) {
      case 'PUBLIC':
        return this.composePublicView(product);
      case 'LEGIT_INTEREST':
        return this.composeLegitInterestView(product);
      case 'AUTHORITY':
        return this.composeAuthorityView(product);
      default:
        logger.warn({ accessLevel }, 'Unknown access level, returning public view');
        return this.composePublicView(product);
    }
  }

  /**
   * Public view: Basic product information only
   */
  private composePublicView(product: Product): DPPViewPublic {
    return {
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
      },
      accessLevel: 'PUBLIC',
    };
  }

  /**
   * Legitimate Interest view: Product info + verification results (no raw values)
   */
  private async composeLegitInterestView(product: Product): Promise<DPPViewLegitInterest> {
    const verifiedPredicates = await this.db.getVerifiedPredicates(product.id);
    const supplierLinks = await this.db.getSupplierLinks(product.id);

    // Aggregate predicate results (most recent verification per predicate)
    const predicateResults = new Map<string, {
      predicateId: string;
      predicateName: string;
      result: boolean;
      verifiedAt: string;
    }>();

    for (const vp of verifiedPredicates) {
      const existing = predicateResults.get(vp.predicate_id);
      if (!existing || new Date(vp.verified_at) > new Date(existing.verifiedAt)) {
        const predicate = getPredicateById(vp.predicate_id);
        if (!predicate?.accessGroups.includes('LEGIT_INTEREST')) {
          continue;
        }
        predicateResults.set(vp.predicate_id, {
          predicateId: vp.predicate_id,
          predicateName: predicate?.name || vp.predicate_id,
          result: vp.result,
          verifiedAt: vp.verified_at,
        });
      }
    }

    return {
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
      },
      accessLevel: 'LEGIT_INTEREST',
      verifiedPredicates: Array.from(predicateResults.values()),
      supplierCount: supplierLinks.length,
    };
  }

  /**
   * Authority view: Full access including supplier details and audit trail
   */
  private async composeAuthorityView(product: Product): Promise<DPPViewAuthority> {
    const verifiedPredicates = await this.db.getVerifiedPredicates(product.id);
    const supplierLinks = await this.db.getSupplierLinks(product.id);

    // Aggregate predicate results (most recent verification per predicate)
    const predicateResults = new Map<string, {
      predicateId: string;
      predicateName: string;
      result: boolean;
      verifiedAt: string;
    }>();

    for (const vp of verifiedPredicates) {
      const existing = predicateResults.get(vp.predicate_id);
      if (!existing || new Date(vp.verified_at) > new Date(existing.verifiedAt)) {
        const predicate = getPredicateById(vp.predicate_id);
        predicateResults.set(vp.predicate_id, {
          predicateId: vp.predicate_id,
          predicateName: predicate?.name || vp.predicate_id,
          result: vp.result,
          verifiedAt: vp.verified_at,
        });
      }
    }

    // Build audit trail from verification events
    const auditTrail: { eventType: string; timestamp: string; details: Record<string, unknown> }[] = [];

    for (const vp of verifiedPredicates) {
      auditTrail.push({
        eventType: 'PREDICATE_VERIFIED',
        timestamp: vp.verified_at,
        details: {
          predicateId: vp.predicate_id,
          receiptId: vp.receipt_id,
          supplierId: vp.supplier_id,
          result: vp.result,
        },
      });
    }

    // Add supplier linking events
    for (const link of supplierLinks) {
      auditTrail.push({
        eventType: 'SUPPLIER_LINKED',
        timestamp: link.linked_at,
        details: {
          supplierId: link.supplier_id,
          commitmentRoot: link.commitment_root,
        },
      });
    }

    // Sort audit trail by timestamp
    auditTrail.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return {
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        category: product.category,
      },
      accessLevel: 'AUTHORITY',
      verifiedPredicates: Array.from(predicateResults.values()),
      supplierCount: supplierLinks.length,
      suppliers: supplierLinks.map(link => ({
        id: link.supplier_id,
        commitmentRoot: link.commitment_root,
        publicKey: link.supplier_public_key,
        linkedAt: link.linked_at,
      })),
      auditTrail,
    };
  }

  /**
   * Check if a given access level can access a predicate based on access groups
   */
  canAccessPredicate(accessLevel: AccessLevel, predicateId: string): boolean {
    const predicate = getPredicateById(predicateId);
    if (!predicate) {
      return false;
    }

    // PUBLIC can't access any predicates
    if (accessLevel === 'PUBLIC') {
      return false;
    }

    // AUTHORITY can access everything
    if (accessLevel === 'AUTHORITY') {
      return true;
    }

    // LEGIT_INTEREST can access if predicate allows it
    return predicate.accessGroups.includes('LEGIT_INTEREST');
  }
}
