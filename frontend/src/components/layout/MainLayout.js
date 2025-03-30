// src/components/layout/MainLayout.js
import React from 'react';
import { Outlet } from 'react-router-dom';

const MainLayout = () => {
  return (
    <div className="main-layout">
      {/* Your header, sidebar, etc. will go here later */}
      <div className="content-area">
        <Outlet /> {/* This renders the child routes */}
      </div>
    </div>
  );
};

export default MainLayout;