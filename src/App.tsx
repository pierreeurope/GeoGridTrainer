import React from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { TablePage } from './pages/TablePage';
import { LearningCountryPage } from './pages/LearningCountryPage';
import { LearningCategoryPage } from './pages/LearningCategoryPage';

const navItems = [
  { to: '/', label: 'Table' },
  { to: '/learning-country', label: 'Learning a Country' },
  { to: '/learning-category', label: 'Learning a Category' },
];

export function App() {
  return (
    <BrowserRouter>
      <div className="appShell">
        <header className="appNav">
          <div className="brand">
            <h1>GeoGridTrainer</h1>
            <p>Click a column header’s filter button to filter. Click the header text to sort.</p>
          </div>
          <nav className="navLinks">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'navLink navLinkActive' : 'navLink')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<TablePage />} />
            <Route path="/learning-country" element={<LearningCountryPage />} />
            <Route path="/learning-category" element={<LearningCategoryPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
