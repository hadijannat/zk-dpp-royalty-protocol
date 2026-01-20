import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';

interface EvidenceItem {
  id: string;
  evidence_type: string;
  original_filename: string | null;
  content_hash: string;
  extracted_text: string | null;
  created_at: string;
}

function Evidence() {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadEvidence();
  }, []);

  async function loadEvidence() {
    try {
      const response = await invoke<{ success: boolean; data: EvidenceItem[] }>('list_evidence');
      if (response.success) {
        setEvidence(response.data);
      }
    } catch (error) {
      console.error('Failed to load evidence:', error);
    } finally {
      setLoading(false);
    }
  }

  async function importDocument() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Documents',
          extensions: ['pdf', 'txt', 'json']
        }]
      });

      if (!selected) return;

      setImporting(true);

      const response = await invoke<{ success: boolean; data: EvidenceItem; error?: string }>('ingest_document', {
        input: {
          path: selected as string,
          evidence_type: 'certificate'
        }
      });

      if (response.success) {
        setEvidence(prev => [response.data, ...prev]);
      } else {
        alert(`Import failed: ${response.error}`);
      }
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import document');
    } finally {
      setImporting(false);
    }
  }

  async function deleteEvidence(id: string) {
    if (!confirm('Delete this evidence?')) return;

    try {
      const response = await invoke<{ success: boolean }>('delete_evidence', { id });
      if (response.success) {
        setEvidence(prev => prev.filter(e => e.id !== id));
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  }

  async function extractClaims(evidenceId: string) {
    try {
      const productId = prompt('Enter Product ID:', 'PRODUCT-001');
      if (!productId) return;

      const response = await invoke<{ success: boolean; data: unknown[]; error?: string }>('extract_claims', {
        input: { evidence_id: evidenceId, product_id: productId }
      });

      if (response.success) {
        alert(`Extracted ${response.data.length} claims. View them in the Claims tab.`);
      } else {
        alert(`Extraction failed: ${response.error}`);
      }
    } catch (error) {
      console.error('Extraction error:', error);
      alert('Failed to extract claims');
    }
  }

  if (loading) {
    return <div className="empty-state">Loading...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Evidence</h2>
        <p>Import and manage source documents</p>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Documents</span>
          <button className="btn btn-primary" onClick={importDocument} disabled={importing}>
            {importing ? 'Importing...' : '📥 Import Document'}
          </button>
        </div>

        {evidence.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📄</div>
            <p>No evidence documents yet</p>
            <p>Import certificates, test reports, or declarations to get started</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Filename</th>
                <th>Type</th>
                <th>Has Text</th>
                <th>Imported</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map(item => (
                <tr key={item.id}>
                  <td>{item.original_filename || 'Unknown'}</td>
                  <td>
                    <span className="badge badge-info">{item.evidence_type}</span>
                  </td>
                  <td>
                    {item.extracted_text ? (
                      <span className="badge badge-success">Yes</span>
                    ) : (
                      <span className="badge badge-warning">No</span>
                    )}
                  </td>
                  <td>{new Date(item.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-secondary"
                        onClick={() => extractClaims(item.id)}
                        disabled={!item.extracted_text}
                        title={!item.extracted_text ? 'No text to extract from' : 'Extract claims using AI'}
                      >
                        🤖 Extract
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => deleteEvidence(item.id)}
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

export default Evidence;
