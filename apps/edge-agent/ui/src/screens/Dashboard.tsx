import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

interface Stats {
  evidenceCount: number;
  claimsCount: number;
  verifiedClaimsCount: number;
  commitmentsCount: number;
}

function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    evidenceCount: 0,
    claimsCount: 0,
    verifiedClaimsCount: 0,
    commitmentsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const [evidenceRes, claimsRes, commitmentsRes] = await Promise.all([
        invoke<{ success: boolean; data: unknown[] }>('list_evidence'),
        invoke<{ success: boolean; data: unknown[] }>('list_claims', { productId: null }),
        invoke<{ success: boolean; data: unknown[] }>('list_commitments'),
      ]);

      const evidence = evidenceRes.success ? evidenceRes.data : [];
      const claims = claimsRes.success ? claimsRes.data as { verified: boolean }[] : [];
      const commitments = commitmentsRes.success ? commitmentsRes.data : [];

      setStats({
        evidenceCount: evidence.length,
        claimsCount: claims.length,
        verifiedClaimsCount: claims.filter(c => c.verified).length,
        commitmentsCount: commitments.length,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="empty-state">Loading...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Overview of your ZK-DPP data and activities</p>
      </div>

      <div className="grid grid-3">
        <div className="stat-card">
          <div className="stat-value">{stats.evidenceCount}</div>
          <div className="stat-label">Evidence Documents</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.claimsCount}</div>
          <div className="stat-label">Total Claims</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.verifiedClaimsCount}</div>
          <div className="stat-label">Verified Claims</div>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-value">{stats.commitmentsCount}</div>
          <div className="stat-label">Active Commitments</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats.claimsCount > 0
              ? Math.round((stats.verifiedClaimsCount / stats.claimsCount) * 100)
              : 0}%
          </div>
          <div className="stat-label">Verification Rate</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '2rem' }}>
        <h3 className="card-title">Quick Actions</h3>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <a href="/evidence" className="btn btn-primary">
            📄 Import Evidence
          </a>
          <a href="/claims" className="btn btn-secondary">
            ✅ Review Claims
          </a>
          <a href="/commitments" className="btn btn-secondary">
            🔐 Create Commitment
          </a>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
