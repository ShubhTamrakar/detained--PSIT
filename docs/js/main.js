document.addEventListener('DOMContentLoaded', () => {
    const chromeBtn = document.getElementById('chrome-btn');
    const edgeBtn = document.getElementById('edge-btn');

    // Simple Browser Detection
    const isEdge = /Edg/.test(navigator.userAgent);
    const isChrome = /Chrome/.test(navigator.userAgent) && !isEdge;

    // Highlight the correct button
    if (isEdge) {
        edgeBtn.classList.remove('btn-outline');
        edgeBtn.classList.add('btn-primary');
        chromeBtn.classList.remove('btn-primary');
        chromeBtn.classList.add('btn-outline');
    }

    // Scroll Reveal Intersection Observer
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new MutationObserver((mutations) => {
        // This is a backup if content is added dynamically
    });

    const revealElements = document.querySelectorAll('.feature-card, .step, .privacy-box');
    
    const revealOnScroll = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    revealElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'all 0.6s ease-out';
        revealOnScroll.observe(el);
    });

    // Logo Click to Scroll Top
    document.querySelector('.logo').addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});
