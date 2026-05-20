import React, { useState } from 'react';
import { FiPlus, FiSettings, FiDatabase, FiChevronRight, FiChevronDown, FiList, FiRefreshCw, FiZapOff } from 'react-icons/fi';
import './Sidebar.css';
import HistoryPanel from './HistoryPanel';

export default function Sidebar({ schema, activeConnection, recentQueries, isLoading, user, onOpenSettings, onRefreshMetadata, onDisconnect, onLogout }) {
  const [expandedTables, setExpandedTables] = useState({});

  const toggleTable = (tableKey) => {
    setExpandedTables(prev => ({
      ...prev,
      [tableKey]: !prev[tableKey]
    }));
  };

  const catalogs = schema?.catalogs || {};
  const catalogEntries = Object.entries(catalogs);
  const hasSchema = catalogEntries.some(([, catalog]) =>
    Object.entries(catalog?.schemas || {}).some(([, schemaMeta]) =>
      Object.keys(schemaMeta.tables || {}).length > 0
    )
  );

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button className="new-chat-btn">
          <FiPlus className="icon" />
          <span>New query</span>
        </button>
      </div>

      <div className="sidebar-content">
        <HistoryPanel history={recentQueries} />

        {activeConnection && hasSchema && (
          <div className="schema-panel">
            <div className="schema-label-container">
              <div className="schema-label">Trino Catalogs</div>
              <button className="refresh-btn" onClick={onRefreshMetadata} title="Refresh Metadata">
                <FiRefreshCw />
              </button>
            </div>

            {activeConnection?.default_catalog && (
              <div className="schema-catalog">
                <FiDatabase className="schema-icon" />
                Default Catalog: {activeConnection.default_catalog}
                {activeConnection.default_schema ? ` / Default Schema: ${activeConnection.default_schema}` : ''}
              </div>
            )}

            <div className="schema-catalog">
              <FiDatabase className="schema-icon" />
              {catalogEntries.length} discovered catalog{catalogEntries.length === 1 ? '' : 's'}
            </div>

            <div className="schema-list">
              {catalogEntries.map(([catalogName, catalog]) => {
                const visibleSchemas = Object.entries(catalog?.schemas || {});

                return (
                  <div key={catalogName} className="schema-tree-group">
                    <div className="schema-tree-heading">{catalogName}</div>
                    {visibleSchemas.map(([schemaName, schemaMeta]) => {
                      const schemaKey = `${catalogName}.${schemaName}`;

                      return (
                        <div key={schemaKey} className="schema-tree-schema">
                          <div className="schema-tree-subheading">{schemaName}</div>
                          {Object.entries(schemaMeta.tables || {}).map(([tableName, table]) => {
                            const tableKey = `${catalogName}.${schemaName}.${tableName}`;

                            return (
                              <div key={tableKey} className="schema-table-item">
                                <div
                                  className="schema-table-header"
                                  onClick={() => toggleTable(tableKey)}
                                >
                                  {expandedTables[tableKey] ? <FiChevronDown /> : <FiChevronRight />}
                                  <span>{tableName}</span>
                                  {table.row_count != null && (
                                    <span className="table-row-count">{table.row_count.toLocaleString()} rows</span>
                                  )}
                                </div>

                                {expandedTables[tableKey] && (
                                  <div className="schema-columns-list">
                                    {(table.columns || []).map(col => {
                                      const columnKey = `${catalogName}.${schemaName}.${tableName}.${col.name}`;

                                      return (
                                        <div key={columnKey} className="schema-column-item">
                                          <FiList className="column-icon" />
                                          <span className="column-name">{col.name}</span>
                                          <span className="column-type">{col.data_type}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!activeConnection && !isLoading && (
          <div className="no-connection-placeholder">
            <FiDatabase className="placeholder-icon" />
            <p className="placeholder-title">No Trino endpoint connected</p>
            <p className="placeholder-subtitle">Configure a Trino endpoint to discover all available catalogs.</p>
            <button className="btn-connect-prompt" onClick={onOpenSettings}>
              Connect to Trino
            </button>
          </div>
        )}

        {activeConnection && !hasSchema && !isLoading && (
          <div className="no-connection-placeholder">
            <FiDatabase className="placeholder-icon" />
            <p className="placeholder-title">No tables found</p>
            <p className="placeholder-subtitle">The schema appears empty. Try refreshing or check connection settings.</p>
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        {user && (
          <div className="user-profile">
            <img src={user.avatar_url || 'https://github.com/identicons/default.png'} alt={user.username} className="user-avatar" />
            <div className="user-info-text">
              <span className="user-name">{user.username}</span>
            </div>
            <button className="logout-btn" onClick={onLogout} title="Logout">
              Logout
            </button>
          </div>
        )}

        <div className="connection-status">
          <div className={`status-indicator ${activeConnection ? 'connected' : 'disconnected'}`}></div>
          <span>{activeConnection ? 'Connected' : 'Not Connected'}</span>
          {activeConnection && (
            <button className="disconnect-btn" onClick={onDisconnect} title="Disconnect">
              <FiZapOff />
            </button>
          )}
        </div>

        <button className="settings-btn" onClick={onOpenSettings}>
          <FiSettings className="icon" />
          <span>Connection Settings</span>
        </button>
      </div>
    </div>
  );
}
