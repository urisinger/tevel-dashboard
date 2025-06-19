import React from 'react'
import { NavLink } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'

export const Sidebar: React.FC<{
  onRefresh: () => void
}> = ({ onRefresh }) => {
  const { theme, toggleTheme } = useTheme()

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <h2>Dashboard</h2>
        <button
          className="sidebar-item refresh-button"
          onClick={onRefresh}
          aria-label="Refresh structs definition"
        >
          🔄
        </button>
      </div>
      <nav className="sidebar-content">
        <NavLink
          to="/"
          className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
        >
          Send
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
        >
          History
        </NavLink>
      </nav>
    </aside>
  )
}
