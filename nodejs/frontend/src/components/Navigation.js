import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../services/api';
import './Navigation.css';

const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
      window.location.reload(); // Force reload to clear state
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  return (
    <nav className="navigation">
      <div className="nav-container">
        <h1 className="nav-title">Invoicing System</h1>
        <button
          className="nav-toggle"
          onClick={() => setMenuOpen((prevOpen) => !prevOpen)}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="navigation-links"
          type="button"
        >
          <span className="nav-toggle-line"></span>
          <span className="nav-toggle-line"></span>
          <span className="nav-toggle-line"></span>
        </button>
        <div id="navigation-links" className={`nav-links ${menuOpen ? 'open' : ''}`}>
          <Link 
            to="/upload" 
            className={location.pathname.startsWith('/upload') ? 'active' : ''}
            onClick={closeMenu}
          >
            Upload
          </Link>
          <Link 
            to="/list" 
            className={location.pathname === '/list' ? 'active' : ''}
            onClick={closeMenu}
          >
            Loads
          </Link>
          <Link
            to="/loads/new"
            className={location.pathname === '/loads/new' ? 'active' : ''}
            onClick={closeMenu}
          >
            Create Load
          </Link>
          <Link 
            to="/print" 
            className={location.pathname.startsWith('/print') ? 'active' : ''}
            onClick={closeMenu}
          >
            Invoices
          </Link>
          <Link
            to="/upload-old-invoices"
            className={location.pathname === '/upload-old-invoices' ? 'active' : ''}
            onClick={closeMenu}
          >
            Upload Old Invoices
          </Link>
          <Link
            to="/invoiced-loads"
            className={location.pathname === '/invoiced-loads' ? 'active' : ''}
            onClick={closeMenu}
          >
            Invoiced Loads
          </Link>
          <Link
            to="/calendar"
            className={location.pathname === '/calendar' ? 'active' : ''}
            onClick={closeMenu}
          >
            Calendar
          </Link>
          <Link
            to="/company-load-log"
            className={location.pathname === '/company-load-log' ? 'active' : ''}
            onClick={closeMenu}
          >
            Company Load Log
          </Link>
          <Link
            to="/sub-dispatcher-report"
            className={location.pathname === '/sub-dispatcher-report' ? 'active' : ''}
            onClick={closeMenu}
          >
            Sub-dispatcher Report
          </Link>
          <Link
            to="/driver-board"
            className={location.pathname === '/driver-board' ? 'active' : ''}
            onClick={closeMenu}
          >
            Driver board
          </Link>
          <Link
            to="/tools/load-invoice-creator"
            className={location.pathname === '/tools/load-invoice-creator' ? 'active' : ''}
            onClick={closeMenu}
          >
            Load Invoice Creator
          </Link>
          <Link 
            to="/settings" 
            className={location.pathname.startsWith('/settings') ? 'active' : ''}
            onClick={closeMenu}
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

