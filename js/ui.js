let sidebarOpen = false;
let touchStartX = 0;
let touchEndX = 0;

function initUI() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    const overlay = document.getElementById('overlay');
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    
    toggle.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', closeSidebar);
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.getAttribute('data-section');
            showSection(section);
            if (window.innerWidth <= 768) {
                closeSidebar();
            }
        });
    });
    
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, false);
    
    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, false);
    
    const taskModal = document.getElementById('add-task-modal');
    const closeTaskModal = document.getElementById('close-task-modal');
    const hardnessSlider = document.getElementById('task-hardness');
    const hardnessValue = document.getElementById('hardness-value');
    const xpPreview = document.getElementById('xp-preview');
    const durationInput = document.getElementById('task-duration');
    
    if (closeTaskModal && taskModal) {
        closeTaskModal.addEventListener('click', closeModals);
    }
    
    if (overlay) {
        overlay.addEventListener('click', closeModals);
    }
    
    if (hardnessSlider && hardnessValue && xpPreview && durationInput) {
        hardnessSlider.addEventListener('input', () => {
            hardnessValue.textContent = hardnessSlider.value;
            updateXPPreview();
        });
        
        durationInput.addEventListener('input', updateXPPreview);
        
        const taskSize = document.getElementById('task-size');
        if (taskSize) {
            taskSize.addEventListener('change', updateXPPreview);
        }
        
        const usefulnessSlider = document.getElementById('task-usefulness');
        const usefulnessValue = document.getElementById('usefulness-value');
        if (usefulnessSlider && usefulnessValue) {
            usefulnessSlider.addEventListener('input', () => {
                usefulnessValue.textContent = usefulnessSlider.value;
                updateXPPreview();
            });
        }
    }
}

function updateXPPreview() {
    const duration = parseInt(document.getElementById('task-duration').value) || 0;
    const hardness = parseInt(document.getElementById('task-hardness').value) || 1;
    const taskSize = document.getElementById('task-size')?.value || 'medium';
    const usefulness = parseInt(document.getElementById('task-usefulness')?.value) || 5;
    const xp = (window.app && window.app.calculateXP) ? window.app.calculateXP(duration, hardness, taskSize, usefulness) : 0;
    document.getElementById('xp-preview').textContent = `${xp} XP`;
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebarOpen = !sidebarOpen;
    
    if (sidebarOpen) {
        sidebar.classList.add('open');
        overlay.classList.add('active');
    } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    sidebarOpen = false;
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

function handleSwipe() {
    const threshold = 80;
    const diff = touchEndX - touchStartX;
    
    if (Math.abs(diff) < threshold) return;
    
    const sidebar = document.getElementById('sidebar');
    
    if (diff > 0 && !sidebarOpen && window.innerWidth <= 768) {
        toggleSidebar();
    } else if (diff < 0 && sidebarOpen) {
        closeSidebar();
    }
}

function showSection(sectionName) {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.content-section');
    
    navItems.forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-section') === sectionName);
    });
    
    sections.forEach(section => {
        section.classList.toggle('active', section.id === `section-${sectionName}`);
    });
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
    document.getElementById('overlay').classList.remove('active');
    resetAddTaskModal();
}

function resetAddTaskModal() {
    const aiSection = document.getElementById('ai-task-section');
    const loadingSection = document.getElementById('ai-loading');
    const manualSection = document.getElementById('manual-fallback-section');
    const aiInput = document.getElementById('ai-task-input');
    const taskForm = document.getElementById('task-form');
    
    if (aiSection) aiSection.style.display = 'block';
    if (loadingSection) loadingSection.style.display = 'none';
    if (manualSection) manualSection.style.display = 'none';
    if (aiInput) aiInput.value = '';
    if (taskForm) taskForm.reset();
    const hardnessValue = document.getElementById('hardness-value');
    const xpPreview = document.getElementById('xp-preview');
    if (hardnessValue) hardnessValue.textContent = '5';
    if (xpPreview) xpPreview.textContent = '25 XP';
}

export { initUI, showSection, closeModals, updateXPPreview, resetAddTaskModal };
