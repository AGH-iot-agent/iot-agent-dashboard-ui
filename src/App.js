import React, { useState, useEffect } from 'react';
import './App.css';

const EMPTY_SUMMARY = { devicesOnline: 0, activeAlerts: 0, eventsPerMinute: 0 };

function MiniLineChart({ points, dataKey, color, label }) {
  if (!points || points.length === 0) {
    return <p className="empty-state">Brak danych dla {label}</p>;
  }

  const width = 620;
  const height = 170;
  const values = points
    .map(point => Number(point?.[dataKey]))
    .filter(value => Number.isFinite(value));

  if (values.length < 2) {
    return <p className="empty-state">Za mało punktow dla {label}</p>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.1, max - min);

  const polyline = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" role="img" aria-label={label}>
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="3" />
      </svg>
      <div className="chart-range">
        <span>{min.toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  );
}

function App() {
  const [summary, setSummary] = useState(null);
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [latestTelemetry, setLatestTelemetry] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [series, setSeries] = useState([]);

  const redirectToLogin = () => {
    window.location.assign('/login');
  };

  const loadJsonOrFallback = async (url, fallbackValue) => {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      return fallbackValue;
    }

    return response.json();
  };

  useEffect(() => {
    let isActive = true;

    const loadDashboard = async () => {
      try {
        const sessionResponse = await fetch('/api/auth/me', {
          credentials: 'include'
        });

        if (sessionResponse.status === 401 || sessionResponse.status === 403) {
          redirectToLogin();
          return;
        }

        if (!sessionResponse.ok) {
          throw new Error('Session check failed');
        }

        const [summaryData, devicesData] = await Promise.all([
          loadJsonOrFallback('/api/summary', EMPTY_SUMMARY),
          loadJsonOrFallback('/api/devices', [])
        ]);

        const [telemetryData, alertsData] = await Promise.all([
          loadJsonOrFallback('/api/telemetry/latest', []),
          loadJsonOrFallback('/api/telemetry/alerts', [])
        ]);

        const normalizedDevices = Array.isArray(devicesData) ? devicesData : [];
        const firstDeviceId = normalizedDevices[0]?.id || '';

        const seriesData = firstDeviceId
          ? await loadJsonOrFallback(`/api/telemetry/series/${firstDeviceId}`, [])
          : [];

        if (isActive) {
          setSummary(summaryData);
          setDevices(normalizedDevices);
          setLatestTelemetry(Array.isArray(telemetryData) ? telemetryData : []);
          setAlerts(Array.isArray(alertsData) ? alertsData : []);
          setSelectedDeviceId(firstDeviceId);
          setSeries(Array.isArray(seriesData) ? seriesData : []);
        }
      } catch {
        if (isActive) {
          setSummary(EMPTY_SUMMARY);
          setDevices([]);
          setLatestTelemetry([]);
          setAlerts([]);
          setSeries([]);
        }
      }
    };

    loadDashboard();
    const timer = setInterval(loadDashboard, 8000);

    return () => {
      isActive = false;
      clearInterval(timer);
    };
  }, []);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      .finally(() => {
        window.location.assign('/login');
      });
  };

  const handleDeviceSelect = async event => {
    const deviceId = event.target.value;
    setSelectedDeviceId(deviceId);
    const points = await loadJsonOrFallback(`/api/telemetry/series/${deviceId}`, []);
    setSeries(Array.isArray(points) ? points : []);
  };

  const zoneSummary = latestTelemetry.reduce((acc, entry) => {
    const zone = entry.krakowZone || 'UNKNOWN';
    const current = acc[zone] || { zone, leaks: 0, devices: 0 };
    current.devices += 1;
    if (entry.leak) {
      current.leaks += 1;
    }
    acc[zone] = current;
    return acc;
  }, {});

  return (
    <div className="App">

      <header className="App-header">
        <h1>IoT Agent Dashboard</h1>
        <button className="logout-btn" onClick={handleLogout}>Wyloguj</button>
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
            <>
              <table className="devices-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map(device => (
                    <tr key={device.id}>
                      <td>{device.id}</td>
                      <td>{device.name}</td>
                      <td>
                        <span className={`status ${(device.status || '').toLowerCase()}`}>{device.status}</span>
                      </td>
                      <td>{device.krakowZone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="charts-header">
                <h2>Temp over time / Energy usage</h2>
                <select value={selectedDeviceId} onChange={handleDeviceSelect}>
                  {devices.map(device => (
                    <option key={device.id} value={device.id}>{device.name}</option>
                  ))}
                </select>
              </div>

              <div className="chart-grid">
                <div className="chart-card">
                  <h3>Temperature (C)</h3>
                  <MiniLineChart points={series} dataKey="temperatureC" color="#d85f52" label="temperature" />
                </div>
                <div className="chart-card">
                  <h3>Energy usage (W)</h3>
                  <MiniLineChart points={series} dataKey="energyUsageW" color="#2a9d8f" label="energy" />
                </div>
              </div>

              <div className="zone-and-alerts">
                <div className="chart-card">
                  <h3>Mapa Krakowa - strefy (leaks)</h3>
                  <table className="devices-table compact">
                    <thead>
                      <tr>
                        <th>Strefa</th>
                        <th>Devices</th>
                        <th>Leaks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(zoneSummary).map(zone => (
                        <tr key={zone.zone}>
                          <td>{zone.zone}</td>
                          <td>{zone.devices}</td>
                          <td>{zone.leaks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="chart-card">
                  <h3>Alerts</h3>
                  {alerts.length === 0 ? (
                    <p className="empty-state">Brak aktywnych alertow</p>
                  ) : (
                    <ul className="alerts-list">
                      {alerts.slice(0, 8).map(alert => (
                        <li key={`${alert.id}-${alert.timestamp}`}>
                          <strong>{alert.severity}</strong> {alert.deviceId} ({alert.krakowZone}) - {alert.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
