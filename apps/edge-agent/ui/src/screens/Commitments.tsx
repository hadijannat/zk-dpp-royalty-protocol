import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

interface Commitment {
  id: string;
  root: string;
  claim_count: number;
  claim_ids: string[];
  public_key: string;
  signature: string;
  valid_until: string | null;
  revoked: boolean;
  created_at: string;
}

interface Claim {
  id: string;
  claim_type: string;
  value: number | string | boolean | object;
  verified: boolean;
}

function Commitments() {
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClaims, setSelectedClaims] = useState<string[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [commitmentsRes, claimsRes] = await Promise.all([
        invoke<{ success: boolean; data: Commitment[] }>('list_commitments'),
        invoke<{ success: boolean; data: Claim[] }>('list_claims', { productId: null }),
      ]);

      if (commitmentsRes.success) {
        setCommitments(commitmentsRes.data);
      }
      if (claimsRes.success) {
        setClaims(claimsRes.data);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createCommitment() {
    if (selectedClaims.length === 0) {
      alert('Please select at least one claim');
      return;
    }

    try {
      const response = await invoke<{ success: boolean; data: Commitment; error?: string }>('create_commitment', {
        input: {
          claim_ids: selectedClaims,
          valid_days: 365
        }
      });

      if (response.success) {
        setCommitments(prev => [response.data, ...prev]);
        setSelectedClaims([]);
        setShowCreateDialog(false);
        alert('Commitment created successfully!');
      } else {
        alert(`Failed: ${response.error}`);
      }
    } catch (error) {
      console.error('Create commitment error:', error);
      alert('Failed to create commitment');
    }
  }

  async function revokeCommitment(id: string) {
    const reason = prompt('Reason for revocation:');
    if (!reason) return;

    try {
      const response = await invoke<{ success: boolean }>('revoke_commitment', {
        id,
        reason
      });

      if (response.success) {
        setCommitments(prev =>
          prev.map(c =>
            c.id === id ? { ...c, revoked: true } : c
          )
        );
      }
    } catch (error) {
      console.error('Revoke error:', error);
    }
  }

  function toggleClaimSelection(claimId: string) {
    setSelectedClaims(prev =>
      prev.includes(claimId)
        ? prev.filter(id => id !== claimId)
        : [...prev, claimId]
    );
  }

  const verifiedClaims = claims.filter(c => c.verified);

  if (loading) {
    return <div className="empty-state">Loading...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Commitments</h2>
        <p>Create and manage cryptographic commitments to your claims</p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Active Commitments</span>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateDialog(true)}
            disabled={verifiedClaims.length === 0}
          >
            🔐 Create Commitment
          </button>
        </div>

        {commitments.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔐</div>
            <p>No commitments yet</p>
            <p>Verify your claims, then create a commitment to enable ZK proofs</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Root (truncated)</th>
                <th>Claims</th>
                <th>Expires</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {commitments.map(commitment => (
                <tr key={commitment.id}>
                  <td>
                    <code style={{ fontSize: '0.75rem' }}>
                      {commitment.root.slice(0, 16)}...
                    </code>
                  </td>
                  <td>{commitment.claim_count}</td>
                  <td>
                    {commitment.valid_until
                      ? new Date(commitment.valid_until).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td>
                    {commitment.revoked ? (
                      <span className="badge badge-danger">Revoked</span>
                    ) : (
                      <span className="badge badge-success">Active</span>
                    )}
                  </td>
                  <td>
                    {!commitment.revoked && (
                      <button
                        className="btn btn-danger"
                        onClick={() => revokeCommitment(commitment.id)}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreateDialog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="card" style={{ width: '500px', maxHeight: '80vh', overflow: 'auto' }}>
            <div className="card-header">
              <span className="card-title">Create Commitment</span>
              <button
                className="btn btn-secondary"
                onClick={() => setShowCreateDialog(false)}
              >
                ✕
              </button>
            </div>

            <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
              Select verified claims to include in this commitment:
            </p>

            {verifiedClaims.length === 0 ? (
              <p>No verified claims available. Verify your claims first.</p>
            ) : (
              <div style={{ maxHeight: '300px', overflow: 'auto' }}>
                {verifiedClaims.map(claim => (
                  <label
                    key={claim.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedClaims.includes(claim.id)}
                      onChange={() => toggleClaimSelection(claim.id)}
                    />
                    <span className="badge badge-info">
                      {claim.claim_type.replace(/_/g, ' ')}
                    </span>
                    <span>
                      {typeof claim.value === 'object'
                        ? JSON.stringify(claim.value)
                        : String(claim.value)}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={createCommitment}
                disabled={selectedClaims.length === 0}
              >
                Create ({selectedClaims.length} claims)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Commitments;
