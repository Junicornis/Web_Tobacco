import React, { useRef, useState, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { DeploymentUnitOutlined } from '@ant-design/icons';

const PillNav = ({
  logo,
  logoAlt = "Logo",
  items = [],
  activeHref = "/",
  className = "",
  ease = "power2.easeOut",
  baseColor = "#000000",
  pillColor = "#1890ff", // Default Ant Design Blue
  hoveredPillTextColor = "#ffffff",
  pillTextColor = "#000000",
  theme = "light",
  initialLoadAnimation = false
}) => {
  const navigate = useNavigate();
  const navRef = useRef(null);
  const pillRef = useRef(null);
  const itemsRef = useRef([]);

  // Find active index
  const activeIndex = items.findIndex(item => item.href === activeHref);
  const safeActiveIndex = activeIndex >= 0 ? activeIndex : 0;

  useLayoutEffect(() => {
    if (!pillRef.current || !itemsRef.current[safeActiveIndex]) return;

    const targetItem = itemsRef.current[safeActiveIndex];
    const { offsetLeft, offsetWidth } = targetItem;

    // Animate pill
    gsap.to(pillRef.current, {
      x: offsetLeft,
      width: offsetWidth,
      duration: 0.5,
      ease: ease
    });

  }, [activeHref, safeActiveIndex, ease, items]);

  // Handle item click
  const handleItemClick = (e, href) => {
    e.preventDefault();
    navigate(href);
  };

  return (
    <div className={`pill-nav-container ${className}`} style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      height: '64px',
      backgroundColor: theme === 'dark' ? '#001529' : '#fff',
      borderBottom: '1px solid #f0f0f0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
    }}>
      {/* Logo Section */}
      <div className="logo-section" style={{ 
          display: 'flex', 
          alignItems: 'center',
          fontSize: '18px',
          fontWeight: 'bold',
          color: theme === 'dark' ? '#fff' : '#000',
          cursor: 'pointer'
      }} onClick={() => navigate('/admin/knowledge-graph')}>
        {logo ? (
            typeof logo === 'string' ? <img src={logo} alt={logoAlt} style={{ height: '32px' }} /> : logo
        ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DeploymentUnitOutlined style={{ fontSize: '24px', color: pillColor }} />
                <span>知识图谱</span>
            </div>
        )}
      </div>

      {/* Nav Items */}
      <nav style={{ 
          position: 'relative', 
          display: 'flex', 
          background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : '#f5f5f5', 
          borderRadius: '32px', 
          padding: '4px' 
      }}>
        {/* The Pill */}
        <div
          ref={pillRef}
          style={{
            position: 'absolute',
            top: '4px',
            left: '0',
            height: 'calc(100% - 8px)',
            backgroundColor: pillColor,
            borderRadius: '28px',
            pointerEvents: 'none',
            zIndex: 1
          }}
        />

        {/* Menu Items */}
        {items.map((item, index) => {
          const isActive = index === safeActiveIndex;
          return (
            <a
              key={index}
              href={item.href}
              ref={el => itemsRef.current[index] = el}
              onClick={(e) => handleItemClick(e, item.href)}
              style={{
                position: 'relative',
                zIndex: 2,
                padding: '8px 24px',
                textDecoration: 'none',
                color: isActive ? hoveredPillTextColor : baseColor,
                fontWeight: '500',
                transition: 'color 0.3s',
                display: 'block',
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: '14px'
              }}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
      
      {/* Right side placeholder (e.g. user profile) - Optional */}
      <div style={{ width: '100px' }}></div> 
    </div>
  );
};

export default PillNav;
