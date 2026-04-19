/* global globalThis */
import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import './App.css';

const EMPTY_SUMMARY = { devicesOnline: 0, activeAlerts: 0, eventsPerMinute: 0 };
const DEFAULT_TAB = 'overview';
const HISTORY_PAGE_SIZE = 8;
const DEVICES_PAGE_SIZE = 6;

function MiniLineChart({ points, dataKey, color, label }) {
  if (!points || points.length === 0) {
    return <p className="empty-state inline">Brak danych dla {label}</p>;
  }

  const width = 620;
  const height = 170;
  const values = points
    .map(point => Number(point?.[dataKey]))
    .filter(value => Number.isFinite(value));

  if (values.length < 2) {
    return <p className="empty-state inline">Za malo punktow dla {label}</p>;
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
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" aria-label={label}>
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="3" />
      </svg>
      <div className="chart-range">
        <span>{min.toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  );
}

function matchesDevice(record, deviceId) {
  if (!record || !deviceId) {
    return false;
  }

  return [record.deviceId, record.id, record.sensorId]
    .filter(Boolean)
    .map(String)
    .includes(String(deviceId));
}

function formatValue(value, suffix = '') {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (typeof value === 'number') {
    return `${value.toFixed(2)}${suffix}`;
  }

  return `${value}${suffix}`;
}

function formatTimestamp(value) {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString('pl-PL');
}

function toSortableNumber(value, fallback = -Infinity) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSortableTimestamp(value) {
  if (!value) {
    return -Infinity;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

MiniLineChart.propTypes = {
  points: PropTypes.arrayOf(PropTypes.object),
  dataKey: PropTypes.string.isRequired,
  color: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired
};

MiniLineChart.defaultProps = {
  points: []
};

function App() {
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [latestTelemetry, setLatestTelemetry] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [selectedTab, setSelectedTab] = useState(DEFAULT_TAB);
  const [series, setSeries] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ column: 'lastSeen', direction: 'desc' });
  const [historyPage, setHistoryPage] = useState(1);
  const [devicesPage, setDevicesPage] = useState(1);

  const redirectToLogin = () => {
    globalThis.location.assign('/login');
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

        const [summaryData, devicesData, telemetryData, alertsData] = await Promise.all([
          loadJsonOrFallback('/api/summary', EMPTY_SUMMARY),
          loadJsonOrFallback('/api/devices', []),
          loadJsonOrFallback('/api/telemetry/latest', []),
          loadJsonOrFallback('/api/telemetry/alerts', [])
        ]);

        if (isActive) {
          setSummary(summaryData || EMPTY_SUMMARY);
          setDevices(Array.isArray(devicesData) ? devicesData : []);
          setLatestTelemetry(Array.isArray(telemetryData) ? telemetryData : []);
          setAlerts(Array.isArray(alertsData) ? alertsData : []);
        }
      } catch {
        if (isActive) {
          setSummary(EMPTY_SUMMARY);
          setDevices([]);
          setLatestTelemetry([]);
          setAlerts([]);
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

  useEffect(() => {
    let isActive = true;

    const loadSeries = async () => {
      if (!selectedDeviceId) {
        setSeries([]);
        return;
      }

      const points = await loadJsonOrFallback(`/api/telemetry/series/${selectedDeviceId}`, []);
      if (isActive) {
        setSeries(Array.isArray(points) ? points : []);
      }
    };

    loadSeries();
    const timer = selectedDeviceId ? setInterval(loadSeries, 8000) : null;

    return () => {
      isActive = false;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [selectedDeviceId]);

  const handleLogout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      .finally(() => {
        globalThis.location.assign('/login');
      });
  };

  const latestTelemetryByDevice = useMemo(() => {
    return latestTelemetry.reduce((acc, entry) => {
      const key = entry?.deviceId || entry?.id || entry?.sensorId;
      if (key) {
        acc[String(key)] = entry;
      }
      return acc;
    }, {});
  }, [latestTelemetry]);

  const alertsByDevice = useMemo(() => {
    return alerts.reduce((acc, alert) => {
      const key = String(alert?.deviceId || alert?.id || 'unknown');
      acc[key] = acc[key] || [];
      acc[key].push(alert);
      return acc;
    }, {});
  }, [alerts]);

  const deviceRows = useMemo(() => {
    return devices.map(device => {
      const telemetry = latestTelemetryByDevice[String(device.id)] || {};
      const deviceAlerts = alertsByDevice[String(device.id)] || [];
      return {
        ...device,
        telemetry,
        alertsCount: deviceAlerts.length,
        temperatureC: telemetry.temperatureC,
        energyUsageW: telemetry.energyUsageW,
        leak: Boolean(telemetry.leak),
        lastSeen: telemetry.timestamp || telemetry.recordedAt || telemetry.createdAt || device.updatedAt
      };
    });
  }, [alertsByDevice, devices, latestTelemetryByDevice]);

  const filteredDevices = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return deviceRows.filter(device => {
      const matchesQuery = !normalizedQuery || [device.id, device.name, device.status, device.krakowZone]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(normalizedQuery));

      const matchesStatus = statusFilter === 'all'
        || String(device.status || '').toLowerCase() === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [deviceRows, searchQuery, statusFilter]);

  const sortedDevices = useMemo(() => {
    const rows = [...filteredDevices];
    const { column, direction } = sortConfig;
    const multiplier = direction === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      let left;
      let right;

      switch (column) {
      case 'status':
        left = String(a.status || '').toLowerCase();
        right = String(b.status || '').toLowerCase();
        break;
      case 'zone':
        left = String(a.krakowZone || a.telemetry?.krakowZone || '').toLowerCase();
        right = String(b.krakowZone || b.telemetry?.krakowZone || '').toLowerCase();
        break;
      case 'temperature':
        left = toSortableNumber(a.temperatureC);
        right = toSortableNumber(b.temperatureC);
        break;
      case 'energy':
        left = toSortableNumber(a.energyUsageW);
        right = toSortableNumber(b.energyUsageW);
        break;
      case 'alerts':
        left = toSortableNumber(a.alertsCount, 0);
        right = toSortableNumber(b.alertsCount, 0);
        break;
      case 'lastSeen':
      default:
        left = toSortableTimestamp(a.lastSeen);
        right = toSortableTimestamp(b.lastSeen);
        break;
      }

      if (left < right) {
        return -1 * multiplier;
      }
      if (left > right) {
        return 1 * multiplier;
      }
      return 0;
    });

    return rows;
  }, [filteredDevices, sortConfig]);

  useEffect(() => {
    setDevicesPage(1);
  }, [searchQuery, statusFilter, sortConfig]);

  const devicePagesCount = Math.max(1, Math.ceil(sortedDevices.length / DEVICES_PAGE_SIZE));
  const pagedDevices = sortedDevices.slice(
    (devicesPage - 1) * DEVICES_PAGE_SIZE,
    devicesPage * DEVICES_PAGE_SIZE
  );

  useEffect(() => {
    if (devicesPage > devicePagesCount) {
      setDevicesPage(devicePagesCount);
    }
  }, [devicePagesCount, devicesPage]);

  useEffect(() => {
    if (sortedDevices.length === 0) {
      setSelectedDeviceId('');
      return;
    }

    const selectedExists = sortedDevices.some(device => String(device.id) === String(selectedDeviceId));
    if (!selectedExists) {
      setSelectedDeviceId(String(sortedDevices[0].id));
    }
  }, [sortedDevices, selectedDeviceId]);

  const selectedDevice = sortedDevices.find(device => String(device.id) === String(selectedDeviceId)) || null;
  const selectedTelemetry = selectedDevice
    ? latestTelemetry.find(entry => matchesDevice(entry, selectedDevice.id)) || null
    : null;
  const selectedAlerts = selectedDevice
    ? alerts.filter(alert => matchesDevice(alert, selectedDevice.id))
    : [];
  const recentSeries = [...series].slice(-6).reverse();
  const sortedSeriesHistory = useMemo(() => {
    return [...series].sort((a, b) => {
      const left = toSortableTimestamp(a.timestamp || a.createdAt || a.recordedAt);
      const right = toSortableTimestamp(b.timestamp || b.createdAt || b.recordedAt);
      return right - left;
    });
  }, [series]);
  const historyPagesCount = Math.max(1, Math.ceil(sortedSeriesHistory.length / HISTORY_PAGE_SIZE));
  const pagedHistory = sortedSeriesHistory.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  );
  const selectedAttributes = Object.entries({
    ...selectedDevice,
    ...selectedTelemetry
  });

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedDeviceId]);

  const requestSort = column => {
    setSortConfig(prev => {
      if (prev.column !== column) {
        return { column, direction: 'asc' };
      }

      return {
        column,
        direction: prev.direction === 'asc' ? 'desc' : 'asc'
      };
    });
  };

  const getSortState = column => {
    if (sortConfig.column !== column) {
      return '';
    }

    return sortConfig.direction === 'asc' ? 'ASC' : 'DESC';
  };

  const renderOverviewTab = () => {
    if (!selectedDevice) {
      return null;
    }

    return (
      <div className="detail-grid">
        <section className="detail-card">
          <h3>Dane bazowe</h3>
          <table className="devices-table compact">
            <tbody>
              <tr>
                <th>ID</th>
                <td>{selectedDevice.id}</td>
              </tr>
              <tr>
                <th>Nazwa</th>
                <td>{selectedDevice.name || '-'}</td>
              </tr>
              <tr>
                <th>Status</th>
                <td>{selectedDevice.status || 'UNKNOWN'}</td>
              </tr>
              <tr>
                <th>Strefa</th>
                <td>{selectedDevice.krakowZone || selectedTelemetry?.krakowZone || '-'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="detail-card">
          <h3>Ostatni odczyt</h3>
          <table className="devices-table compact">
            <tbody>
              <tr>
                <th>Temperatura</th>
                <td>{formatValue(selectedTelemetry?.temperatureC, ' C')}</td>
              </tr>
              <tr>
                <th>Zuzycie energii</th>
                <td>{formatValue(selectedTelemetry?.energyUsageW, ' W')}</td>
              </tr>
              <tr>
                <th>Leak</th>
                <td>{selectedTelemetry?.leak ? 'Tak' : 'Nie'}</td>
              </tr>
              <tr>
                <th>Aktualizacja</th>
                <td>{formatTimestamp(selectedTelemetry?.timestamp || selectedDevice.updatedAt)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="detail-card detail-card-wide">
          <h3>Atrybuty sensora</h3>
          <table className="devices-table compact">
            <thead>
              <tr>
                <th>Pole</th>
                <th>Wartosc</th>
              </tr>
            </thead>
            <tbody>
              {selectedAttributes.map(([key, value]) => (
                <tr key={key}>
                  <td>{key}</td>
                  <td>{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    );
  };

  const renderTelemetryTab = () => (
    <div className="detail-grid">
      <section className="detail-card detail-card-wide">
        <h3>Trendy telemetryczne</h3>
        <div className="chart-grid">
          <div className="chart-card">
            <h4>Temperatura</h4>
            <MiniLineChart points={series} dataKey="temperatureC" color="#2d7ff9" label="temperatura" />
          </div>
          <div className="chart-card">
            <h4>Zuzycie energii</h4>
            <MiniLineChart points={series} dataKey="energyUsageW" color="#4da7ff" label="energia" />
          </div>
        </div>
      </section>

      <section className="detail-card detail-card-wide">
        <h3>Ostatnie probki</h3>
        {recentSeries.length === 0 ? (
          <p className="empty-state">Brak historii telemetrycznej dla wybranego urzadzenia.</p>
        ) : (
          <table className="devices-table compact">
            <thead>
              <tr>
                <th>Czas</th>
                <th>Temperatura</th>
                <th>Energia</th>
                <th>Leak</th>
              </tr>
            </thead>
            <tbody>
              {recentSeries.map((point, index) => (
                <tr key={`${point.timestamp || point.createdAt || index}-${index}`}>
                  <td>{formatTimestamp(point.timestamp || point.createdAt || point.recordedAt)}</td>
                  <td>{formatValue(point.temperatureC, ' C')}</td>
                  <td>{formatValue(point.energyUsageW, ' W')}</td>
                  <td>{point.leak ? 'Tak' : 'Nie'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );

  const renderAlertsTab = () => (
    <section className="detail-card detail-card-wide">
      <h3>Alerty urzadzenia</h3>
      {selectedAlerts.length === 0 ? (
        <p className="empty-state">Brak alertow dla wybranego urzadzenia.</p>
      ) : (
        <table className="devices-table compact">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Powod</th>
              <th>Strefa</th>
              <th>Czas</th>
            </tr>
          </thead>
          <tbody>
            {selectedAlerts.map((alert, index) => (
              <tr key={`${alert.id || alert.timestamp || index}-${index}`}>
                <td>{alert.severity || '-'}</td>
                <td>{alert.reason || '-'}</td>
                <td>{alert.krakowZone || selectedDevice?.krakowZone || '-'}</td>
                <td>{formatTimestamp(alert.timestamp || alert.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );

  const renderHistoryTab = () => (
    <section className="detail-card detail-card-wide">
      <div className="detail-toolbar">
        <h3>Historia telemetryczna</h3>
        <span className="history-caption">Strona {historyPage} / {historyPagesCount}</span>
      </div>
      {sortedSeriesHistory.length === 0 ? (
        <p className="empty-state">Brak historii telemetrycznej dla wybranego urzadzenia.</p>
      ) : (
        <>
          <table className="devices-table compact">
            <thead>
              <tr>
                <th>Czas</th>
                <th>Temperatura</th>
                <th>Energia</th>
                <th>Leak</th>
              </tr>
            </thead>
            <tbody>
              {pagedHistory.map((point, index) => (
                <tr key={`${point.timestamp || point.createdAt || point.recordedAt || index}-${index}`}>
                  <td>{formatTimestamp(point.timestamp || point.createdAt || point.recordedAt)}</td>
                  <td>{formatValue(point.temperatureC, ' C')}</td>
                  <td>{formatValue(point.energyUsageW, ' W')}</td>
                  <td>{point.leak ? 'Tak' : 'Nie'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination-row">
            <button
              className="pager-button"
              onClick={() => setHistoryPage(page => Math.max(1, page - 1))}
              disabled={historyPage <= 1}
            >
              Poprzednia
            </button>
            <span className="pagination-meta">{sortedSeriesHistory.length} rekordow</span>
            <button
              className="pager-button"
              onClick={() => setHistoryPage(page => Math.min(historyPagesCount, page + 1))}
              disabled={historyPage >= historyPagesCount}
            >
              Nastepna
            </button>
          </div>
        </>
      )}
    </section>
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>IoT Agent Dashboard</h1>
          <p className="header-subtitle">Widok urzadzen i szczegolow na jednej stronie.</p>
        </div>
        <button className="logout-button" onClick={handleLogout}>Wyloguj</button>
      </header>

      <main className="dashboard-container">
        <section className="metrics-strip">
          <article className="metric-card">
            <span>Devices Online</span>
            <strong>{summary?.devicesOnline ?? 0}</strong>
          </article>
          <article className="metric-card">
            <span>Active Alerts</span>
            <strong>{summary?.activeAlerts ?? 0}</strong>
          </article>
          <article className="metric-card">
            <span>Events / min</span>
            <strong>{summary?.eventsPerMinute ?? 0}</strong>
          </article>
        </section>

        <section className="content-card">
          <div className="section-header">
            <div>
              <h2>Urzadzenia</h2>
              <p>Wybierz urzadzenie z tabeli. Szczegoly pojawiaja sie ponizej na tej samej stronie.</p>
            </div>
            <div className="table-controls">
              <input
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Szukaj po ID, nazwie lub strefie"
              />
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                <option value="all">Wszystkie statusy</option>
                <option value="online">Online</option>
                <option value="offline">Offline</option>
              </select>
            </div>
          </div>

          {sortedDevices.length === 0 ? (
            <p className="empty-state">Brak urzadzen spelniajacych filtr lub brak danych z API.</p>
          ) : (
            <>
              <table className="devices-table master-table">
                <thead>
                  <tr>
                    <th>Urzadzenie</th>
                    <th>
                      <button className="sort-button" onClick={() => requestSort('status')}>
                        Status <span>{getSortState('status')}</span>
                      </button>
                    </th>
                    <th>
                      <button className="sort-button" onClick={() => requestSort('zone')}>
                        Strefa <span>{getSortState('zone')}</span>
                      </button>
                    </th>
                    <th>
                      <button className="sort-button" onClick={() => requestSort('temperature')}>
                        Temperatura <span>{getSortState('temperature')}</span>
                      </button>
                    </th>
                    <th>
                      <button className="sort-button" onClick={() => requestSort('energy')}>
                        Energia <span>{getSortState('energy')}</span>
                      </button>
                    </th>
                    <th>Leak</th>
                    <th>
                      <button className="sort-button" onClick={() => requestSort('alerts')}>
                        Alerty <span>{getSortState('alerts')}</span>
                      </button>
                    </th>
                    <th>
                      <button className="sort-button" onClick={() => requestSort('lastSeen')}>
                        Ostatni odczyt <span>{getSortState('lastSeen')}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDevices.map(device => (
                    <tr
                      key={device.id}
                      onClick={() => setSelectedDeviceId(String(device.id))}
                      className={String(device.id) === String(selectedDeviceId) ? 'selected-row' : ''}
                    >
                      <td>
                        <div className="device-cell">
                          <strong>{device.name || device.id}</strong>
                          <span>{device.id}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`status ${(device.status || '').toLowerCase()}`}>{device.status || 'UNKNOWN'}</span>
                      </td>
                      <td>{device.krakowZone || device.telemetry?.krakowZone || '-'}</td>
                      <td>{formatValue(device.temperatureC, ' C')}</td>
                      <td>{formatValue(device.energyUsageW, ' W')}</td>
                      <td>{device.leak ? 'Tak' : 'Nie'}</td>
                      <td>{device.alertsCount}</td>
                      <td>{formatTimestamp(device.lastSeen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pagination-row top-border">
                <button
                  className="pager-button"
                  onClick={() => setDevicesPage(page => Math.max(1, page - 1))}
                  disabled={devicesPage <= 1}
                >
                  Poprzednia
                </button>
                <span className="pagination-meta">Strona {devicesPage} / {devicePagesCount}</span>
                <button
                  className="pager-button"
                  onClick={() => setDevicesPage(page => Math.min(devicePagesCount, page + 1))}
                  disabled={devicesPage >= devicePagesCount}
                >
                  Nastepna
                </button>
              </div>
            </>
          )}
        </section>

        <section className="content-card device-details">
          <div className="section-header section-header-stack">
            <div>
              <h2>Szczegoly urzadzenia</h2>
              <p>
                {selectedDevice
                  ? `Wybrane urzadzenie: ${selectedDevice.name || selectedDevice.id}`
                  : 'Brak wybranego urzadzenia.'}
              </p>
            </div>
            {selectedDevice && (
              <div className="detail-meta">
                <span className={`status ${(selectedDevice.status || '').toLowerCase()}`}>{selectedDevice.status || 'UNKNOWN'}</span>
                <span className="zone-chip">{selectedDevice.krakowZone || selectedTelemetry?.krakowZone || 'NO ZONE'}</span>
              </div>
            )}
          </div>

          {selectedDevice ? (
            <>
              <nav className="tabs-nav" aria-label="Szczegoly urzadzenia">
                <button
                  className={selectedTab === 'overview' ? 'tab active' : 'tab'}
                  onClick={() => setSelectedTab('overview')}
                >
                  Przeglad
                </button>
                <button
                  className={selectedTab === 'telemetry' ? 'tab active' : 'tab'}
                  onClick={() => setSelectedTab('telemetry')}
                >
                  Telemetria
                </button>
                <button
                  className={selectedTab === 'alerts' ? 'tab active' : 'tab'}
                  onClick={() => setSelectedTab('alerts')}
                >
                  Alerty
                </button>
                <button
                  className={selectedTab === 'history' ? 'tab active' : 'tab'}
                  onClick={() => setSelectedTab('history')}
                >
                  Historia
                </button>
              </nav>

              {selectedTab === 'overview' && renderOverviewTab()}
              {selectedTab === 'telemetry' && renderTelemetryTab()}
              {selectedTab === 'alerts' && renderAlertsTab()}
              {selectedTab === 'history' && renderHistoryTab()}
            </>
          ) : (
            <p className="empty-state">Wybierz urzadzenie z tabeli, aby zobaczyc szczegoly.</p>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
