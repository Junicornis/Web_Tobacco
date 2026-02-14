import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, useInView } from 'framer-motion';
import './AnimatedList.css';

const AnimatedItem = ({ children, delay = 0, index, onMouseEnter, onClick, className = '' }) => {
    const ref = useRef(null);
    const inView = useInView(ref, { amount: 0.2, triggerOnce: false }); // triggerOnce: false allows re-animation on scroll

    return (
        <motion.div
            ref={ref}
            data-index={index}
            onMouseEnter={onMouseEnter}
            onClick={onClick}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={inView ? { scale: 1, opacity: 1 } : { scale: 0.7, opacity: 0 }}
            transition={{ duration: 0.2, delay }}
            style={{ marginBottom: '8px', cursor: 'pointer' }}
            className={className}
        >
            {children}
        </motion.div>
    );
};

const AnimatedList = ({
    items = [],
    renderItem,
    onItemSelect,
    showGradients = true,
    enableArrowNavigation = true,
    displayScrollbar = true,
    className = '',
    itemClassName = '',
    initialSelectedIndex = -1,
    height = '400px'
}) => {
    const listRef = useRef(null);
    const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
    const [keyboardNav, setKeyboardNav] = useState(false);
    const [topGradientOpacity, setTopGradientOpacity] = useState(0);
    const [bottomGradientOpacity, setBottomGradientOpacity] = useState(1);

    const handleItemMouseEnter = useCallback(index => {
        if (!keyboardNav) {
            setSelectedIndex(index);
        }
    }, [keyboardNav]);

    const handleItemClick = useCallback(
        (item, index) => {
            setSelectedIndex(index);
            if (onItemSelect) {
                onItemSelect(item, index);
            }
        },
        [onItemSelect]
    );

    const handleScroll = useCallback(e => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        setTopGradientOpacity(Math.min(scrollTop / 50, 1));
        const bottomDistance = scrollHeight - (scrollTop + clientHeight);
        setBottomGradientOpacity(scrollHeight <= clientHeight ? 0 : Math.min(bottomDistance / 50, 1));
    }, []);

    // Reset keyboardNav on mouse move to allow hover effects again
    const handleMouseMove = useCallback(() => {
        if (keyboardNav) {
            setKeyboardNav(false);
        }
    }, [keyboardNav]);

    useEffect(() => {
        if (!enableArrowNavigation) return;
        const handleKeyDown = e => {
            // Only capture keys if the list or its parent is focused, or broadly for now if we assume this is the main interactive component
            // To avoid capturing global keys when not intended, we can check if document.activeElement is body or related
            // But for this specific use case (KGConfirmPage), global arrow keys might be fine or we attach listener to listRef
            
            // However, the provided source used window.addEventListener. Let's stick to that but be careful.
            // If there are inputs on the page, this might interfere. 
            // Better to attach to the container and require focus, but the user's code used window.
            // I will use window but check if target is input.
            
            if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setKeyboardNav(true);
                setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setKeyboardNav(true);
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter') {
                if (selectedIndex >= 0 && selectedIndex < items.length) {
                    e.preventDefault();
                    if (onItemSelect) {
                        onItemSelect(items[selectedIndex], selectedIndex);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [items, selectedIndex, onItemSelect, enableArrowNavigation]);

    useEffect(() => {
        if (!keyboardNav || selectedIndex < 0 || !listRef.current) return;
        const container = listRef.current;
        const selectedItem = container.querySelector(`[data-index="${selectedIndex}"]`);
        if (selectedItem) {
            const extraMargin = 50;
            const containerScrollTop = container.scrollTop;
            const containerHeight = container.clientHeight;
            const itemTop = selectedItem.offsetTop;
            const itemBottom = itemTop + selectedItem.offsetHeight;
            
            // Adjust scroll if item is out of view
            if (itemTop < containerScrollTop + extraMargin) {
                container.scrollTo({ top: itemTop - extraMargin, behavior: 'smooth' });
            } else if (itemBottom > containerScrollTop + containerHeight - extraMargin) {
                container.scrollTo({
                    top: itemBottom - containerHeight + extraMargin,
                    behavior: 'smooth'
                });
            }
        }
    }, [selectedIndex, keyboardNav]);

    return (
        <div 
            className={`scroll-list-container ${className}`} 
            style={{ height }}
            onMouseMove={handleMouseMove}
        >
            <div 
                ref={listRef} 
                className={`scroll-list ${!displayScrollbar ? 'no-scrollbar' : ''}`} 
                onScroll={handleScroll}
            >
                {items.map((item, index) => (
                    <AnimatedItem
                        key={item.key || item.id || index}
                        delay={0.05} // Reduced delay for snappier feel
                        index={index}
                        onMouseEnter={() => handleItemMouseEnter(index)}
                        onClick={() => handleItemClick(item, index)}
                        className={itemClassName}
                    >
                        {renderItem ? renderItem(item, index, selectedIndex === index) : (
                            <div className={`item ${selectedIndex === index ? 'selected' : ''}`}>
                                <p className="item-text">{typeof item === 'string' ? item : JSON.stringify(item)}</p>
                            </div>
                        )}
                    </AnimatedItem>
                ))}
            </div>
            {showGradients && (
                <>
                    <div className="top-gradient" style={{ opacity: topGradientOpacity }}></div>
                    <div className="bottom-gradient" style={{ opacity: bottomGradientOpacity }}></div>
                </>
            )}
        </div>
    );
};

export default AnimatedList;
