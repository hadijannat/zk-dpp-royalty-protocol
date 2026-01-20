import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

interface Claim {
  id: string;
  claim_type: string;
  value: number | string | boolean | object;
  unit: string;
  product_id: string;
  confidence: number | null;
  verified: boolean;
  created_at: string;
}

function Claims() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClaims();
  }, []);

  async function loadClaims() {
    try {
      const response = await invoke<{ success: boolean; data: Claim[] }>('list_claims', {
        productId: null
      });
      if (response.success) {
        setClaims(response.data);
      }
    } catch (error) {
      console.error('Failed to load claims:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleVerified(claim: Claim) {
    try {
      const response = await invoke<{ success: boolean }>('verify_claim', {
        id: claim.id,
        verified: !claim.verified
      });

      if (response.success) {
        setClaims(prev =>
          prev.map(c =>
            c.id === claim.id ? { ...c, verified: !c.verified } : c
          )
        );
      }
    } catch (error) {
      console.error('Failed to update claim:', error);
    }
  }

  async function deleteClaim(id: string) {
    if (!confirm('Delete this claim?')) return;

    try {
      const response = await invoke<{ success: boolean }>('delete_claim', { id });
      if (response.success) {
        setClaims(prev => prev.filter(c => c.id !== id));
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  function getConfidenceClass(confidence: number | null): string {
    if (confidence === null) return '';
    if (confidence >= 0.8) return '';
    if (confidence >= 0.5) return 'medium';
    return 'low';
  }

  function formatValue(value: number | string | boolean | object): string {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  if (loading) {
    return <div className="empty-state">Loading...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Claims</h2>
        <p>Review and verify extracted claims</p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">All Claims ({claims.length})</span>
          <div>
            <span className="badge badge-success" style={{ marginRight: '0.5rem' }}>
              {claims.filter(c => c.verified).length} Verified
            </span>
            <span className="badge badge-warning">
              {claims.filter(c => !c.verified).length} Pending
            </span>
          </div>
        </div>

        {claims.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <p>No claims yet</p>
            <p>Import evidence and use AI extraction to create claims</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Value</th>
                <th>Product</th>
                <th>Confidence</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {claims.map(claim => (
                <tr key={claim.id}>
                  <td>
                    <span className="badge badge-info">
                      {claim.claim_type.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    <strong>{formatValue(claim.value)}</strong>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>{claim.unit}</span>
                  </td>
                  <td>{claim.product_id}</td>
                  <td>
                    {claim.confidence !== null ? (
                      <div style={{ width: '80px' }}>
                        <div className="confidence-bar">
                          <div
                            className={`confidence-fill ${getConfidenceClass(claim.confidence)}`}
                            style={{ width: `${claim.confidence * 100}%` }}
                          />
                        </div>
                        <small>{Math.round(claim.confidence * 100)}%</small>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {claim.verified ? (
                      <span className="badge badge-success">✓ Verified</span>
                    ) : (
                      <span className="badge badge-warning">Pending</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className={`btn ${claim.verified ? 'btn-secondary' : 'btn-success'}`}
                        onClick={() => toggleVerified(claim)}
                      >
                        {claim.verified ? 'Unverify' : 'Verify'}
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => deleteClaim(claim.id)}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Claims;
