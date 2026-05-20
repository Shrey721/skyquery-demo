import React, { useState } from 'react';
import { FiSend } from 'react-icons/fi';
import './ChatInput.css';

export default function ChatInput({ onSendMessage }) {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (text.trim()) {
      onSendMessage(text);
      setText('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-container">
      <div className="chat-input-wrapper">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your data..."
          rows="1"
        />
        <button 
          className="send-button" 
          onClick={handleSend}
          disabled={!text.trim()}
        >
          <FiSend />
        </button>
      </div>
      <div className="input-footer">
        SkyQuery can make mistakes. Consider verifying important data.
      </div>
    </div>
  );
}
