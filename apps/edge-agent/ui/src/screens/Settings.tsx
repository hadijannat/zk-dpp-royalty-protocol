import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

interface AppSettings {
  supplier_id: string | null;
  supplier_name: string | null;
  ollama_url: string | null;
  ollama_model: string | null;
}

interface KeypairInfo {
  id: string;
  public_key: string;
  created_at: string;
}

function Settings() {
  const [settings, setSettings] = useState<AppSettings>({
    supplier_id: null,
    supplier_name: null,
    ollama_url: null,
    ollama_model: null,
  });
  const [keypair, setKeypair] = useState<KeypairInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const [settingsRes, keypairRes] = await Promise.all([
        invoke<{ success: boolean; data: AppSettings }>('get_settings'),
        invoke<{ success: boolean; data: KeypairInfo | null }>('get_keypair'),
      ]);

      if (settingsRes.success) {
        setSettings(settingsRes.data);
      }
      if (keypairRes.success) {
        setKeypair(keypairRes.data);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await invoke('update_settings', { settings });
      alert('Settings saved!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function generateNewKeypair() {
    if (!confirm('Generate a new keypair? This will replace your current active keypair.')) {
      return;
    }

    try {
      const response = await invoke<{ success: boolean; data: KeypairInfo; error?: string }>('generate_new_keypair');
      if (response.success) {
        setKeypair(response.data);
        alert('New keypair generated!');
      } else {
        alert(`Failed: ${response.error}`);
      }
    } catch (error) {
      console.error('Failed to generate keypair:', error);
      alert('Failed to generate keypair');
    }
  }

  if (loading) {
    return <div className="empty-state">Loading...</div>;
  }

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <p>Configure your Edge Agent</p>
      </div>

      <div className="card">
        <h3 className="card-title">Supplier Information</h3>

        <div className="form-group">
          <label className="form-label">Supplier ID</label>
          <input
            type="text"
            className="form-input"
            value={settings.supplier_id || ''}
            onChange={e => setSettings(s => ({ ...s, supplier_id: e.target.value }))}
            placeholder="e.g., SUPPLIER-001"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Supplier Name</label>
          <input
            type="text"
            className="form-input"
            value={settings.supplier_name || ''}
            onChange={e => setSettings(s => ({ ...s, supplier_name: e.target.value }))}
            placeholder="e.g., Acme Battery Corp"
          />
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">AI Configuration</h3>

        <div className="form-group">
          <label className="form-label">Ollama URL</label>
          <input
            type="text"
            className="form-input"
            value={settings.ollama_url || ''}
            onChange={e => setSettings(s => ({ ...s, ollama_url: e.target.value }))}
            placeholder="http://localhost:11434"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Model</label>
          <input
            type="text"
            className="form-input"
            value={settings.ollama_model || ''}
            onChange={e => setSettings(s => ({ ...s, ollama_model: e.target.value }))}
            placeholder="phi3 or llama3"
          />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Signing Keypair</span>
          <button className="btn btn-secondary" onClick={generateNewKeypair}>
            🔑 Generate New
          </button>
        </div>

        {keypair ? (
          <div>
            <div className="form-group">
              <label className="form-label">Public Key</label>
              <input
                type="text"
                className="form-input"
                value={keypair.public_key}
                readOnly
                style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
              />
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Created: {new Date(keypair.created_at).toLocaleString()}
            </p>
          </div>
        ) : (
          <p style={{ color: 'var(--text-secondary)' }}>
            No keypair generated yet. Click "Generate New" to create one.
          </p>
        )}
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button
          className="btn btn-primary"
          onClick={saveSettings}
          disabled={saving}
        >
          {saving ? 'Saving...' : '💾 Save Settings'}
        </button>
      </div>
    </div>
  );
}

export default Settings;
