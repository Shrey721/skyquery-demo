import React from 'react';
import { FiMessageSquare } from 'react-icons/fi';
import './HistoryPanel.css';

export default function HistoryPanel({ history = [] }) {

  return (
    <div className="history-panel">
      <div className="history-label">Recent Queries</div>
      <div className="history-list">
        {history.length === 0 && <div className="history-empty">No recent queries</div>}
        {history.map((title, i) => (
          <button key={i} className="history-item">
            <FiMessageSquare className="history-icon" />
            <span className="history-text">{title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
