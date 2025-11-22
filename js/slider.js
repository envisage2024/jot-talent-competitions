// Lightweight slider for #her-slider
// Adapted HeroSlider from incoperate/slider-theme.js
class HeroSlider {
    constructor(container) {
        this.container = container;
    // prefer the inner .slides container as the element we translate
    this.slider = container.querySelector('.slides') || container.querySelector('#list');
    this.slides = Array.from(container.querySelectorAll('#item'));
        if (!this.slides.length) {
            // fallback to .slide elements
            this.slides = Array.from(container.querySelectorAll('.slide'));
        }
        this.dots = container.querySelectorAll('.dot');
        this.prevBtn = container.querySelector('#prev');
        this.nextBtn = container.querySelector('#next');
        this.progressBar = container.querySelector('#progress-bar');

        this.currentSlide = 0;
        this.totalSlides = this.slides.length;
        this.isAutoPlaying = true;
        this.autoPlayInterval = null;
        this.autoPlayDuration = 5000; // 5 seconds
        this.progressInterval = null;

        // touch/swipe
        this.startX = 0;
        this.endX = 0;
        this.threshold = 50;

        this.init();
    }

    init() {
        if (!this.container || !this.slides.length) return;
        this.setupEventListeners();
        this.updateSlider();
        this.startAutoPlay();
        this.addTouchSupport();
        this.addKeyboardSupport();
    }

    setupEventListeners() {
        this.prevBtn?.addEventListener('click', (e) => { e.preventDefault(); this.goToPrevSlide(); this.restartProgress(); });
        this.nextBtn?.addEventListener('click', (e) => { e.preventDefault(); this.goToNextSlide(); this.restartProgress(); });

        // build dots if container provided
        const dotsContainer = this.container.querySelector('#slider-dots');
        if (dotsContainer) {
            dotsContainer.innerHTML = '';
            this.slides.forEach((_, i) => {
                const btn = document.createElement('button');
                btn.className = 'dot';
                btn.setAttribute('aria-label', `Go to slide ${i+1}`);
                btn.dataset.index = String(i);
                btn.addEventListener('click', (ev) => { ev.preventDefault(); this.goToSlide(i); this.restartProgress(); });
                btn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this.goToSlide(i); this.restartProgress(); } });
                dotsContainer.appendChild(btn);
            });
            this.dots = dotsContainer.querySelectorAll('.dot');
        }

        this.container.addEventListener('mouseenter', () => this.pauseAutoPlay());
        this.container.addEventListener('mouseleave', () => this.resumeAutoPlay());
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.pauseAutoPlay(); else this.resumeAutoPlay(); });
    }

    addTouchSupport() {
        // touch
        this.container.addEventListener('touchstart', (e) => { this.startX = e.touches[0].clientX; this.container.classList.add('touch-active'); this.pauseAutoPlay(); }, { passive: true });
        this.container.addEventListener('touchmove', (e) => { this.endX = e.touches[0].clientX; }, { passive: true });
        this.container.addEventListener('touchend', () => { this.container.classList.remove('touch-active'); this.handleSwipe(); this.resumeAutoPlay(); });

        // mouse drag
        let isDragging = false;
        this.container.addEventListener('mousedown', (e) => { isDragging = true; this.startX = e.clientX; this.container.classList.add('touch-active'); this.pauseAutoPlay(); });
        this.container.addEventListener('mousemove', (e) => { if (!isDragging) return; this.endX = e.clientX; });
        this.container.addEventListener('mouseup', () => { if (!isDragging) return; isDragging = false; this.container.classList.remove('touch-active'); this.handleSwipe(); this.resumeAutoPlay(); });
        this.container.addEventListener('mouseleave', () => { if (!isDragging) return; isDragging = false; this.container.classList.remove('touch-active'); this.resumeAutoPlay(); });
    }

    addKeyboardSupport() {
        this.container.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); this.goToPrevSlide(); this.restartProgress(); }
            if (e.key === 'ArrowRight') { e.preventDefault(); this.goToNextSlide(); this.restartProgress(); }
            if (e.key === ' ') { e.preventDefault(); this.toggleAutoPlay(); }
        });
        this.container.setAttribute('tabindex', '0');
    }

    handleSwipe() {
        const distance = this.endX - this.startX;
        if (Math.abs(distance) > this.threshold) {
            if (distance > 0) this.goToPrevSlide(); else this.goToNextSlide();
        }
    }

    goToSlide(index) {
        if (index === this.currentSlide) return;
        this.slides[this.currentSlide]?.classList.remove('active');
        this.dots[this.currentSlide]?.classList.remove('active');
        this.currentSlide = index;
        this.updateSlider();
        this.restartProgress();
    }

    goToNextSlide() { this.goToSlide((this.currentSlide + 1) % this.totalSlides); }
    goToPrevSlide() { this.goToSlide((this.currentSlide - 1 + this.totalSlides) % this.totalSlides); }

    updateSlider() {
        // If slider uses percentage translate (incoperate used 20% per slide when 5 slides)
        if (this.slider && this.slider.style) {
            // translate full width per slide (100% per slide)
            const translateX = -this.currentSlide * 100;
            this.slider.style.transform = `translateX(${translateX}%)`;
        }

        this.slides.forEach((slide, index) => slide.classList.toggle('active', index === this.currentSlide));
        this.dots.forEach((dot, index) => dot.classList.toggle('active', index === this.currentSlide));

        this.slides.forEach((slide, index) => slide.setAttribute('aria-hidden', index !== this.currentSlide));
        this.dots.forEach((dot, index) => dot.setAttribute('aria-pressed', index === this.currentSlide));
    }

    startAutoPlay() {
        if (!this.isAutoPlaying) return;
        this.stopAutoPlay();
        this.autoPlayInterval = setInterval(() => { this.goToNextSlide(); }, this.autoPlayDuration);
        this.startProgress();
    }

    stopAutoPlay() { if (this.autoPlayInterval) { clearInterval(this.autoPlayInterval); this.autoPlayInterval = null; } }
    pauseAutoPlay() { this.stopAutoPlay(); this.pauseProgress(); }
    resumeAutoPlay() { if (this.isAutoPlaying && !this.autoPlayInterval) this.startAutoPlay(); }
    toggleAutoPlay() { this.isAutoPlaying = !this.isAutoPlaying; if (this.isAutoPlaying) this.startAutoPlay(); else this.pauseAutoPlay(); }

    startProgress() {
        if (!this.progressBar) return;
        let progress = 0;
        const increment = 100 / (this.autoPlayDuration / 100);
        this.progressInterval = setInterval(() => {
            progress += increment;
            this.progressBar.style.width = `${Math.min(progress, 100)}%`;
            if (progress >= 100) progress = 0;
        }, 100);
    }

    pauseProgress() { if (this.progressInterval) { clearInterval(this.progressInterval); this.progressInterval = null; } }
    restartProgress() { this.pauseProgress(); if (this.progressBar) this.progressBar.style.width = '0%'; if (this.isAutoPlaying) this.startProgress(); }

}

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('carousel') || document.getElementById('her-slider');
    if (container) {
        // ensure slides have id="item" for compatibility
        const slides = container.querySelectorAll('.slide');
        slides.forEach((s) => { if (!s.id) s.id = 'item'; });
        new HeroSlider(container);
    }
});
