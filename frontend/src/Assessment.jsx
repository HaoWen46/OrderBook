import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import './components/Dashboard.css';

const Assessment = () => {
  const { username } = useParams();

  const [features, setFeatures] = useState(Array(6).fill(''));
  const [riskScore, setRiskScore] = useState(null);
  const [riskCategory, setRiskCategory] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [components, setComponents] = useState(null);

  const handleChange = (i, v) => {
    const arr = [...features];
    arr[i] = v;
    setFeatures(arr);
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const validateInputs = (nums) => {
    // Check if we have exactly 6 features
    if (nums.length !== 6) {
      throw new Error(`Expected 6 features, got ${nums.length}`);
    }

    // Validate each feature
    nums.forEach((num, idx) => {
      if (isNaN(num) || !isFinite(num)) {
        throw new Error(`Feature ${idx + 1} is not a valid number`);
      }
      
      // Additional validation for scale-based features
      if ([2, 3, 4].includes(idx) && (num < 1 || num > 10)) {
        const labels = ['Risk Appetite', 'Investment Knowledge', 'Liquidity Needs'];
        throw new Error(`${labels[idx - 2]} must be between 1 and 10`);
      }
      
      // Validate non-negative values for certain features
      if ([0, 1, 5].includes(idx) && num < 0) {
        const labels = ['Years of Experience', 'Annual Income', 'Investment Horizon'];
        throw new Error(`${labels[idx === 0 ? 0 : idx === 1 ? 1 : 2]} cannot be negative`);
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      // Convert and validate all features
      const nums = features.map((v, idx) => {
        const trimmed = v.toString().trim();
        if (trimmed === '') {
          throw new Error(`Please fill in all fields. Field ${idx + 1} is empty.`);
        }
        
        const num = parseFloat(trimmed);
        if (isNaN(num)) {
          throw new Error(`Invalid number in field ${idx + 1}: "${v}"`);
        }
        return num;
      });
      
      // Additional validation
      validateInputs(nums);
      
      console.log('Sending features for FHE processing:', nums);
      
      const response = await fetch('http://localhost:8000/assessment', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ features: nums }),
      });
      
      let responseData;
      try {
        responseData = await response.json();
      } catch (jsonError) {
        throw new Error(`Server returned invalid response: ${response.status} ${response.statusText}`);
      }
      
      if (!response.ok) {
        // Handle different types of server errors
        const errorMessage = responseData?.detail || responseData?.message || `Server error: ${response.status}`;
        throw new Error(errorMessage);
      }
      
      if (!responseData.risk_score && responseData.risk_score !== 0) {
        throw new Error('Server response missing risk_score field');
      }
      
      const riskScore = responseData.risk_score;
      const rawScore = responseData.raw_score;
      const scoreComponents = responseData.components;
      
      console.log('Received risk score:', riskScore);
      console.log('Raw score:', rawScore);
      console.log('Components:', scoreComponents);

      // Validate the risk score
      if (typeof riskScore !== 'number' || isNaN(riskScore)) {
        throw new Error('Server returned invalid risk score');
      }

      setRiskScore(riskScore.toFixed(4));
      setComponents(scoreComponents);
      
      // Categorize the risk score
      if (riskScore >= 0.8) {
        setRiskCategory('High');
      } else if (riskScore >= 0.5) {
        setRiskCategory('Medium');
      } else {
        setRiskCategory('Low');
      }
      
    } catch (err) {
      console.error('Assessment failed:', err);
      setError(err.message);
      setRiskScore(null);
      setRiskCategory('');
      setComponents(null);
    } finally {
      setIsLoading(false);
    }
  };

  const testConnection = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('http://localhost:8000/test');
      const data = await response.json();
      
      if (data.test_passed) {
        alert('✅ Server connection and TenSEAL are working correctly!');
      } else {
        alert('❌ Server test failed: ' + data.error);
      }
    } catch (err) {
      alert('❌ Cannot connect to server: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fieldLabels = [
    'Years of Experience',
    'Annual Income (in thousands)',
    'Risk Appetite (1-10 scale)',
    'Investment Knowledge (1-10 scale)',
    'Liquidity Needs (1-10 scale)',
    'Investment Horizon (years)',
  ];

  const fieldPlaceholders = [
    'e.g., 5',
    'e.g., 75',
    '1-10',
    '1-10',
    '1-10',
    'e.g., 10'
  ];

  return (
    <div className="page-shell">
      <div className="page-blob" />
      <div className="page-card page-card--narrow">
        <h2>FHE Risk Assessment</h2>
        
        <div style={{ 
          padding: '1rem', 
          backgroundColor: '#e3f2fd', 
          color: '#1565c0', 
          borderRadius: '4px',
          marginBottom: '1rem',
          fontSize: '0.9em'
        }}>
          <strong>🔐 Fully Homomorphic Encryption Demo</strong>
          <br />
          Your data is encrypted and processed using TenSEAL without server-side decryption.
          <br />
          <button 
            onClick={testConnection}
            style={{
              marginTop: '0.5rem',
              padding: '0.25rem 0.5rem',
              fontSize: '0.8em',
              backgroundColor: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '3px',
              color: 'inherit',
              cursor: 'pointer'
            }}
            disabled={isLoading}
          >
            Test Server Connection
          </button>
        </div>
        
        {error && (
          <div style={{
            padding: '1rem',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '4px',
            marginBottom: '1rem',
            border: '1px solid #ef5350'
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          {fieldLabels.map((label, idx) => (
            <div key={idx} className="field-row">
              <label>{label}:</label>
              <input
                type="number"
                step="any"
                required
                value={features[idx]}
                onChange={(e) => handleChange(idx, e.target.value)}
                disabled={isLoading}
                placeholder={fieldPlaceholders[idx]}
                style={{
                  borderColor: error && features[idx] === '' ? '#ef5350' : undefined
                }}
              />
            </div>
          ))}
          
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button 
              className="btn-lite" 
              type="submit"
              disabled={isLoading || features.some(f => f === '')}
              style={{
                opacity: isLoading || features.some(f => f === '') ? 0.6 : 1
              }}
            >
              {isLoading ? '🔒 Processing with FHE...' : '📊 Assess Risk'}
            </button>
          </div>
        </form>

        {riskScore !== null && (
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '8px',
            border: '2px solid #e9ecef'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', textAlign: 'center' }}>
              Assessment Results
            </h3>
            <div className="field-row">
              <label>Risk Score:</label>
              <span style={{ fontFamily: 'monospace', fontSize: '1.1em' }}>
                {riskScore}
              </span>
            </div>
            <div className="field-row">
              <label>Risk Category:</label>
              <span
                style={{
                  color:
                    riskCategory === 'High'
                      ? '#d32f2f'
                      : riskCategory === 'Medium'
                      ? '#f57c00'
                      : '#388e3c',
                  fontWeight: 600,
                  fontSize: '1.1em'
                }}
              >
                {riskCategory} Risk
              </span>
            </div>
            <div style={{ 
              marginTop: '0.5rem',
              fontSize: '0.9em',
              color: '#666',
              fontStyle: 'italic'
            }}>
              ✓ Computed using homomorphic encryption (TenSEAL)
            </div>
            <div style={{ 
              marginTop: '0.5rem',
              fontSize: '0.8em',
              color: '#888',
              padding: '0.5rem',
              backgroundColor: '#f1f3f4',
              borderRadius: '4px'
            }}>
              <strong>Risk Scoring Logic:</strong><br />
              • <span style={{color: '#d32f2f'}}>Higher experience, income, knowledge, time horizon</span> → Lower Risk<br />
              • <span style={{color: '#388e3c'}}>Higher risk appetite, liquidity needs</span> → Higher Risk<br />
              • All features normalized and weighted appropriately
            </div>
            
            {components && (
              <div style={{ 
                marginTop: '0.5rem',
                fontSize: '0.8em',
                color: '#666',
                padding: '0.5rem',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px',
                maxHeight: '120px',
                overflowY: 'auto'
              }}>
                <strong>Component Breakdown:</strong><br />
                • Experience: {components.experience_contribution?.toFixed(4) || 'N/A'}<br />
                • Income: {components.income_contribution?.toFixed(4) || 'N/A'}<br />
                • Risk Appetite: {components.risk_appetite_contribution?.toFixed(4) || 'N/A'}<br />
                • Knowledge: {components.knowledge_contribution?.toFixed(4) || 'N/A'}<br />
                • Liquidity: {components.liquidity_contribution?.toFixed(4) || 'N/A'}<br />
                • Time Horizon: {components.time_horizon_contribution?.toFixed(4) || 'N/A'}
              </div>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to={`/u/${username}/dashboard`}>
            <button className="btn-lite">← Back to Dashboard</button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Assessment;