import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkAuth, login, checkDefaultPassword } from '../services/api';
import './LoginPage.css';

const LoginPage = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usingDefaultPassword, setUsingDefaultPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already authenticated
    const checkAuthentication = async () => {
      try {
        const result = await checkAuth();
        if (result.authenticated) {
          navigate('/upload');
        }
      } catch (error) {
        // Not authenticated, stay on login page
      }
    };
    checkAuthentication();

    // Check if using default password
    const checkDefault = async () => {
      try {
        const result = await checkDefaultPassword();
        setUsingDefaultPassword(result.usingDefault);
      } catch (error) {
        // Ignore error
      }
    };
    checkDefault();
  }, [navigate, onLogin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(password);
      if (result.success) {
        navigate('/upload');
        if (onLogin) onLogin();
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Invalid password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Invoicing System</h1>
        {usingDefaultPassword && (
          <div className="default-password-notice">
            <span className="notice-icon">⚠️</span>
            <span>Using the default password</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              autoFocus
            />
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" disabled={loading} className="login-button">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;

