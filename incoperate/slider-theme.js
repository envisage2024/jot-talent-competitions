// Enhanced Hero Slider with Auto-play, Touch Support, and Smooth Transitions
class HeroSlider {
    constructor(container) {
        this.container = container;
        this.slider = container.querySelector('#list');
        this.slides = container.querySelectorAll('#item');
        this.dots = container.querySelectorAll('.dot');
        this.prevBtn = container.querySelector('#prev');
        this.nextBtn = container.querySelector('#next');
        this.progressBar = container.querySelector('#progress-bar');
        
        this.currentSlide = 0;
        this.totalSlides = this.slides.length;
        this.isAutoPlaying = true;
        this.autoPlayInterval = null;
        this.autoPlayDuration = 5000; // 5 seconds per slide
        this.progressInterval = null;
        
        // Touch/swipe properties
        this.startX = 0;
        this.endX = 0;
        this.threshold = 50; // minimum distance for swipe
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateSlider();
        this.startAutoPlay();
        this.addTouchSupport();
        this.addKeyboardSupport();
    }
    
    setupEventListeners() {
        // Arrow buttons
        this.prevBtn?.addEventListener('click', () => this.goToPrevSlide());
        this.nextBtn?.addEventListener('click', () => this.goToNextSlide());
        
        // Dot navigation
        this.dots.forEach((dot, index) => {
            dot.addEventListener('click', () => this.goToSlide(index));
        });
        
        // Pause on hover
        this.container.addEventListener('mouseenter', () => this.pauseAutoPlay());
        this.container.addEventListener('mouseleave', () => this.resumeAutoPlay());
        
        // Pause when tab is not visible
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseAutoPlay();
            } else {
                this.resumeAutoPlay();
            }
        });
    }
    
    addTouchSupport() {
        this.container.addEventListener('touchstart', (e) => {
            this.startX = e.touches[0].clientX;
            this.container.classList.add('touch-active');
            this.pauseAutoPlay();
        }, { passive: true });
        
        this.container.addEventListener('touchmove', (e) => {
            this.endX = e.touches[0].clientX;
        }, { passive: true });
        
        this.container.addEventListener('touchend', () => {
            this.container.classList.remove('touch-active');
            this.handleSwipe();
            this.resumeAutoPlay();
        });
        
        // Mouse drag support
        let isDragging = false;
        
        this.container.addEventListener('mousedown', (e) => {
            isDragging = true;
            this.startX = e.clientX;
            this.container.classList.add('touch-active');
            this.pauseAutoPlay();
        });
        
        this.container.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            this.endX = e.clientX;
        });
        
        this.container.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            this.container.classList.remove('touch-active');
            this.handleSwipe();
            this.resumeAutoPlay();
        });
        
        this.container.addEventListener('mouseleave', () => {
            if (!isDragging) return;
            isDragging = false;
            this.container.classList.remove('touch-active');
            this.resumeAutoPlay();
        });
    }
    
    addKeyboardSupport() {
        this.container.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    this.goToPrevSlide();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.goToNextSlide();
                    break;
                case ' ':
                    e.preventDefault();
                    this.toggleAutoPlay();
                    break;
            }
        });
        
        // Make container focusable
        this.container.setAttribute('tabindex', '0');
    }
    
    handleSwipe() {
        const distance = this.endX - this.startX;
        
        if (Math.abs(distance) > this.threshold) {
            if (distance > 0) {
                this.goToPrevSlide();
            } else {
                this.goToNextSlide();
            }
        }
    }
    
    goToSlide(index, direction = 'next') {
        if (index === this.currentSlide) return;
        
        // Remove active class from current slide
        this.slides[this.currentSlide]?.classList.remove('active');
        this.dots[this.currentSlide]?.classList.remove('active');
        
        this.currentSlide = index;
        this.updateSlider();
        this.restartProgress();
    }
    
    goToNextSlide() {
        const nextIndex = (this.currentSlide + 1) % this.totalSlides;
        this.goToSlide(nextIndex, 'next');
    }
    
    goToPrevSlide() {
        const prevIndex = (this.currentSlide - 1 + this.totalSlides) % this.totalSlides;
        this.goToSlide(prevIndex, 'prev');
    }
    
    updateSlider() {
        // Move the slider
        const translateX = -this.currentSlide * 20; // 20% per slide (100% / 5 slides)
        this.slider.style.transform = `translateX(${translateX}%)`;
        
        // Update active states
        this.slides.forEach((slide, index) => {
            slide.classList.toggle('active', index === this.currentSlide);
        });
        
        this.dots.forEach((dot, index) => {
            dot.classList.toggle('active', index === this.currentSlide);
        });
        
        // Update ARIA attributes
        this.slides.forEach((slide, index) => {
            slide.setAttribute('aria-hidden', index !== this.currentSlide);
        });
        
        this.dots.forEach((dot, index) => {
            dot.setAttribute('aria-pressed', index === this.currentSlide);
        });
    }
    
    startAutoPlay() {
        if (!this.isAutoPlaying) return;
        
        this.autoPlayInterval = setInterval(() => {
            this.goToNextSlide();
        }, this.autoPlayDuration);
        
        this.startProgress();
    }
    
    pauseAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
        this.pauseProgress();
    }
    
    resumeAutoPlay() {
        if (this.isAutoPlaying && !this.autoPlayInterval) {
            this.startAutoPlay();
        }
    }
    
    toggleAutoPlay() {
        this.isAutoPlaying = !this.isAutoPlaying;
        if (this.isAutoPlaying) {
            this.startAutoPlay();
        } else {
            this.pauseAutoPlay();
        }
    }
    
    startProgress() {
        if (!this.progressBar) return;
        
        let progress = 0;
        const increment = 100 / (this.autoPlayDuration / 100);
        
        this.progressInterval = setInterval(() => {
            progress += increment;
            this.progressBar.style.width = `${Math.min(progress, 100)}%`;
            
            if (progress >= 100) {
                progress = 0;
            }
        }, 100);
    }
    
    pauseProgress() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }
    
    restartProgress() {
        this.pauseProgress();
        if (this.progressBar) {
            this.progressBar.style.width = '0%';
        }
        if (this.isAutoPlaying) {
            this.startProgress();
        }
    }
    
    destroy() {
        this.pauseAutoPlay();
        this.pauseProgress();
        // Remove event listeners if needed
    }
}

// Enhanced Theme Management
class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('theme') || 'light';
        this.lightBtn = document.getElementById('lightThemeButton');
        this.darkBtn = document.getElementById('darkThemeButton');
        
        this.init();
    }
    
    init() {
        this.applyTheme(this.currentTheme);
        this.updateButtons();
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.lightBtn?.addEventListener('click', () => this.setTheme('light'));
        this.darkBtn?.addEventListener('click', () => this.setTheme('dark'));
        
        // Listen for system theme changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', (e) => {
                if (!localStorage.getItem('theme')) {
                    this.setTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }
    
    setTheme(theme) {
        this.currentTheme = theme;
        this.applyTheme(theme);
        this.updateButtons();
        localStorage.setItem('theme', theme);
        
        // Trigger custom event for other components
        document.dispatchEvent(new CustomEvent('themechange', { 
            detail: { theme } 
        }));
    }
    
    applyTheme(theme) {
        const html = document.documentElement;
        const body = document.body;
        
        if (theme === 'dark') {
            html.setAttribute('data-theme', 'dark');
            body.classList.add('dark-mode');
        } else {
            html.removeAttribute('data-theme');
            body.classList.remove('dark-mode');
        }
        
        // Smooth transition for theme change
        body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
        setTimeout(() => {
            body.style.transition = '';
        }, 300);
    }
    
    updateButtons() {
        this.lightBtn?.classList.toggle('active', this.currentTheme === 'light');
        this.darkBtn?.classList.toggle('active', this.currentTheme === 'dark');
    }
    
    toggleTheme() {
        this.setTheme(this.currentTheme === 'light' ? 'dark' : 'light');
    }
    
    getCurrentTheme() {
        return this.currentTheme;
    }
}

// Enhanced Scroll Effects
class ScrollEffects {
    constructor() {
        this.lastScrollTop = 0;
        this.scrollThreshold = 100;
        this.init();
    }
    
    init() {
        this.setupScrollListeners();
        this.setupIntersectionObserver();
    }
    
    setupScrollListeners() {
        let ticking = false;
        
        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    this.handleScroll();
                    ticking = false;
                });
                ticking = true;
            }
        });
    }
    
    handleScroll() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Add scrolled class to body for styling purposes
        document.body.classList.toggle('scrolled', scrollTop > this.scrollThreshold);
        
        this.lastScrollTop = scrollTop;
    }
    
    setupIntersectionObserver() {
        if (!('IntersectionObserver' in window)) return;
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('in-view');
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '50px'
        });
        
        // Observe cards and features for animation
        const observeElements = document.querySelectorAll(
            '.about-card, .feature, .step, .cta-section'
        );
        
        observeElements.forEach(el => {
            el.classList.add('observe-me');
            observer.observe(el);
        });
    }
}

// Performance monitoring
class PerformanceMonitor {
    constructor() {
        this.metrics = {};
        this.init();
    }
    
    init() {
        if ('performance' in window) {
            this.measureInitialLoad();
            this.measureInteractions();
        }
    }
    
    measureInitialLoad() {
        window.addEventListener('load', () => {
            setTimeout(() => {
                const perfData = performance.getEntriesByType('navigation')[0];
                this.metrics.loadTime = perfData.loadEventEnd - perfData.fetchStart;
                this.metrics.domContentLoaded = perfData.domContentLoadedEventEnd - perfData.fetchStart;
                
                // Log metrics for debugging (remove in production)
                console.log('Performance Metrics:', this.metrics);
            }, 100);
        });
    }
    
    measureInteractions() {
        // Measure slider interactions
        document.addEventListener('click', (e) => {
            if (e.target.closest('.slider-arrow, .dot')) {
                const startTime = performance.now();
                requestAnimationFrame(() => {
                    const endTime = performance.now();
                    this.metrics.sliderResponse = endTime - startTime;
                });
            }
        });
    }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize slider
    const sliderContainer = document.getElementById('carousel');
    if (sliderContainer) {
        window.heroSlider = new HeroSlider(sliderContainer);
    }
    
    // Initialize theme manager
    window.themeManager = new ThemeManager();
    
    // Initialize scroll effects
    window.scrollEffects = new ScrollEffects();
    
    // Initialize performance monitoring (optional)
    if (console.debug) {
        window.performanceMonitor = new PerformanceMonitor();
    }
    
    // Add smooth scroll behavior to all anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});

// Handle page visibility changes for performance
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Pause animations and auto-play when tab is hidden
        if (window.heroSlider) {
            window.heroSlider.pauseAutoPlay();
        }
    } else {
        // Resume when tab becomes visible
        if (window.heroSlider) {
            window.heroSlider.resumeAutoPlay();
        }
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.heroSlider) {
        window.heroSlider.destroy();
    }
});

// Export for potential use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HeroSlider, ThemeManager, ScrollEffects };
}
