import React from 'react';
import './ChatArea.css';
import { FiUser, FiCpu, FiCheckCircle, FiXCircle, FiDatabase, FiCopy, FiCheck } from 'react-icons/fi';

function SimpleBarChart({ data }) {
  if (!data || data.length === 0) return null;
  const keys = Object.keys(data[0]);
  if (keys.length !== 2) return null;

  let textKey = null;
  let numKey = null;

  if (typeof data[0][keys[0]] === 'number') {
    numKey = keys[0];
    textKey = keys[1];
  } else if (typeof data[0][keys[1]] === 'number') {
    numKey = keys[1];
    textKey = keys[0];
  }

  if (!numKey || !textKey) return null;

  const maxVal = Math.max(...data.map(d => Number(d[numKey]) || 0));

  return (
    <div className="simple-bar-chart">
      {data.map((row, idx) => {
        const val = Number(row[numKey]) || 0;
        const pct = maxVal > 0 ? (val / maxVal) * 100 : 0;
        return (
          <div key={idx} className="bar-row">
            <div className="bar-label" title={String(row[textKey])}>{String(row[textKey])}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${pct}%` }}></div>
            </div>
            <div className="bar-value">{val}</div>
          </div>
        );
      })}
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button className={`copy-sql-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
      {copied ? <><FiCheck /> Copied!</> : <><FiCopy /> Copy SQL</>}
    </button>
  );
}

export default function ChatArea({ messages }) {
  return (
    <div className="chat-area">
      {messages.length === 0 ? (
        <div className="empty-state">
          <h2>SkyQuery</h2>
          <p>Ask a question about your Trino data.</p>
        </div>
      ) : (
        <div className="messages-list">
          {messages.map((msg, idx) => (
            <div key={idx} className={`message-row ${msg.role}`}>
              <div className="message-content-wrapper">
                <div className="avatar">
                  {msg.role === 'user' ? <FiUser /> : <FiCpu />}
                </div>
                <div className="message-bubble">
                  {msg.isLoading ? (
                    <div className="loading-state">
                      <span className="spinner"></span> Querying database...
                    </div>
                  ) : msg.isError ? (
                    <div className="error-message">{msg.content}</div>
                  ) : msg.role === 'assistant' ? (
                    <div className="assistant-response">
                      <div className="summary">{msg.content}</div>

                      {msg.validation && (
                        <div className={`validation-status ${msg.validation.valid ? 'valid' : 'invalid'}`}>
                          {msg.validation.valid ? <><FiCheckCircle /> Validated SQL</> : <><FiXCircle /> Validation Failed: {msg.validation.errors?.join(', ')}</>}
                        </div>
                      )}

                      {msg.selected_tables && msg.selected_tables.length > 0 && (
                        <div className="selected-tables">
                          <FiDatabase /> Tables used: {msg.selected_tables.map(t => t.table).join(', ')}
                        </div>
                      )}

                      {msg.sql && (
                        <div className="sql-block-wrapper">
                          <div className="sql-block-header">
                            <span className="sql-label">Generated SQL</span>
                            <CopyButton text={msg.sql} />
                          </div>
                          <div className="sql-block">
                            <pre><code>{msg.sql}</code></pre>
                          </div>
                        </div>
                      )}

                      {msg.execution && msg.execution.rows && (
                        <div className="results-section">
                          <h4>Results</h4>
                          <SimpleBarChart data={msg.execution.rows} />
                          <div className="results-table-wrapper">
                            <table className="results-table">
                              <thead>
                                <tr>
                                  {Object.keys(msg.execution.rows[0] || {}).map(k => <th key={k}>{k}</th>)}
                                </tr>
                              </thead>
                              <tbody>
                                {msg.execution.rows.map((r, i) => (
                                  <tr key={i}>
                                    {Object.values(r).map((v, j) => <td key={j}>{String(v)}</td>)}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
