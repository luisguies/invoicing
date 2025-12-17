import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../services/api';
import './Navigation.css';

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
      window.location.reload(); // Force reload to clear state
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <nav className="navigation">
      <div className="nav-container">
        <h1 className="nav-title">Invoicing System</h1>
        <div className="nav-links">
          <Link 
            to="/upload" 
            className={location.pathname === '/upload' ? 'active' : ''}
          >
            Upload
          </Link>
          <Link 
            to="/list" 
            className={location.pathname === '/list' ? 'active' : ''}
          >
            Loads
          </Link>
          <Link 
            to="/print" 
            className={location.pathname === '/print' ? 'active' : ''}
          >
            Invoices
          </Link>
          <Link 
            to="/settings" 
            className={location.pathname === '/settings' ? 'active' : ''}
          >
            Settings
          </Link>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navigation;

