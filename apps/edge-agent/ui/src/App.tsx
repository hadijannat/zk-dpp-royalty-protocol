import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './screens/Dashboard';
import Evidence from './screens/Evidence';
import Claims from './screens/Claims';
import Commitments from './screens/Commitments';
import Settings from './screens/Settings';

function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>ZK-DPP</h1>
          <p>Edge Agent</p>
        </div>

        <nav>
          <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            📊 Dashboard
          </NavLink>
          <NavLink to="/evidence" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            📄 Evidence
          </NavLink>
          <NavLink to="/claims" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            ✅ Claims
          </NavLink>
          <NavLink to="/commitments" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            🔐 Commitments
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            ⚙️ Settings
          </NavLink>
        </nav>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/claims" element={<Claims />} />
          <Route path="/commitments" element={<Commitments />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
