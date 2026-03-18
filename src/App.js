import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    fetch('/api/summary')
      .then(res => res.json())
      .then(data => setSummary(data))
      .catch(() => setSummary({ devicesOnline: 0, activeAlerts: 0, eventsPerMinute: 0 }));

    fetch('/api/devices')
      .then(res => res.json())
      .then(data => setDevices(data))
      .catch(() => setDevices([]));
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>IoT Agent Dashboard</h1>
      </header>

      <div className="dashboard-container">
        <div className="metrics">
          <div className="metric-card">
            <h3>Devices Online</h3>
            <p className="metric-value">{summary?.devicesOnline ?? '-'}</p>
          </div>
          <div className="metric-card">
            <h3>Active Alerts</h3>
            <p className="metric-value alert">{summary?.activeAlerts ?? '-'}</p>
          </div>
          <div className="metric-card">
            <h3>Events/min</h3>
            <p className="metric-value">{summary?.eventsPerMinute ?? '-'}</p>
          </div>
        </div>

        <div className="devices-section">
          <h2>Devices</h2>
          {devices.length === 0 ? (
            <p className="empty-state">No devices found. Register a device via API.</p>
          ) : (
            <table className="devices-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(device => (
                  <tr key={device.id}>
                    <td>{device.id}</td>
                    <td>{device.name}</td>
                    <td>
                      <span className={`status ${device.status}`}>{device.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
