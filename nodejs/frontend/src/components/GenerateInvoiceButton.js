import React from 'react';
import './GenerateInvoiceButton.css';

const GenerateInvoiceButton = ({ 
  onClick, 
  disabled, 
  generating, 
  selectedRule,
  onClearRule 
}) => {
  return (
    <div className="generate-invoice-section">
      {selectedRule && (
        <div className="selected-rule-info">
          <span><strong>Using Rule:</strong> {selectedRule.rule_name}</span>
          {onClearRule && (
            <button onClick={onClearRule} className="clear-rule-btn">
              Clear Rule
            </button>
          )}
        </div>
      )}
      <button
        className="generate-invoice-btn"
        onClick={onClick}
        disabled={disabled || generating}
      >
        {generating ? (
          <>
            <span className="spinner-small"></span>
            Generating Invoice...
          </>
        ) : (
          'Generate Invoices'
        )}
      </button>
      <p className="generate-hint">
        Only non-cancelled, confirmed loads will be included in the invoice.
      </p>
    </div>
  );
};

export default GenerateInvoiceButton;

