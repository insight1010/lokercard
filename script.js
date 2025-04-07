document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('search');
    const categoryButtons = document.querySelectorAll('.category-btn');
    const randomBtn = document.getElementById('random-btn');
    const cards = document.querySelectorAll('.card');
    
    // Функция для переворота карточки
    function initCardFlip() {
        cards.forEach(card => {
            card.addEventListener('click', function() {
                // Закрыть любую другую открытую карточку
                document.querySelectorAll('.card-inner.active').forEach(activeCard => {
                    if (activeCard !== card.querySelector('.card-inner')) {
                        activeCard.classList.remove('active');
                    }
                });
                
                // Перевернуть текущую карточку
                this.querySelector('.card-inner').classList.toggle('active');
            });
        });
    }
    
    // Функция фильтрации карточек
    function filterCards() {
        const searchTerm = searchInput.value.toLowerCase();
        let activeCategory = 'all';
        
        categoryButtons.forEach(btn => {
            if (btn.classList.contains('active')) {
                activeCategory = btn.getAttribute('data-category');
            }
        });
        
        cards.forEach(card => {
            const cardQuestion = card.querySelector('.card-question').textContent.toLowerCase();
            const cardCategory = card.getAttribute('data-category');
            const matchSearch = searchTerm === '' || cardQuestion.includes(searchTerm);
            const matchCategory = activeCategory === 'all' || cardCategory === activeCategory;
            
            if (matchSearch && matchCategory) {
                card.style.display = 'block';
                card.style.opacity = '1';
                card.style.transform = 'scale(1)';
            } else {
                card.style.opacity = '0';
                card.style.transform = 'scale(0.8)';
                // Используем таймаут для плавного исчезновения
                setTimeout(() => {
                    if (card.style.opacity === '0') {
                        card.style.display = 'none';
                    }
                }, 300);
            }
        });
    }
    
    // Получение всех видимых карточек
    function getVisibleCards() {
        return Array.from(cards).filter(card => 
            card.style.display !== 'none' && card.style.opacity !== '0');
    }
    
    // Функция для выбора случайной карточки
    function showRandomCard() {
        // Сначала сбросим все активные карточки
        document.querySelectorAll('.card-inner.active').forEach(card => {
            card.classList.remove('active');
        });
        
        const visibleCards = getVisibleCards();
        if (visibleCards.length === 0) return;
        
        // Скрыть все карточки
        visibleCards.forEach(card => {
            card.style.opacity = '0.3';
            card.style.transform = 'scale(0.95)';
        });
        
        // Выбрать случайную карточку
        const randomIndex = Math.floor(Math.random() * visibleCards.length);
        const randomCard = visibleCards[randomIndex];
        
        // Подождать немного и показать случайную карточку
        setTimeout(() => {
            randomCard.style.opacity = '1';
            randomCard.style.transform = 'scale(1.05)';
            randomCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Добавить анимацию пульсации
            randomCard.classList.add('pulse');
            
            // Перевернуть карточку для просмотра вопроса
            setTimeout(() => {
                randomCard.classList.remove('pulse');
                randomCard.style.transform = 'scale(1)';
                
                // После небольшой паузы перевернуть карточку
                setTimeout(() => {
                    randomCard.querySelector('.card-inner').classList.add('active');
                }, 500);
            }, 1000);
            
            // Вернуть видимость остальным карточкам
            visibleCards.forEach(card => {
                if (card !== randomCard) {
                    card.style.opacity = '1';
                    card.style.transform = 'scale(1)';
                }
            });
        }, 300);
    }
    
    // Инициализация карточек
    function initializeCards() {
        cards.forEach(card => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            
            setTimeout(() => {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, 100 + Math.random() * 300);
        });
    }
    
    // Обработчики событий
    searchInput.addEventListener('input', function() {
        // Задержка для уменьшения нагрузки при вводе
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(filterCards, 300);
    });
    
    categoryButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            categoryButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filterCards();
        });
    });
    
    randomBtn.addEventListener('click', function() {
        this.classList.add('active');
        setTimeout(() => this.classList.remove('active'), 300);
        showRandomCard();
    });
    
    // Инициализация
    initCardFlip();
    initializeCards();
}); 