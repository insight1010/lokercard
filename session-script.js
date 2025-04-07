document.addEventListener('DOMContentLoaded', () => {
    // Получаем параметры из URL
    const urlParams = new URLSearchParams(window.location.search);
    let sessionId = urlParams.get('sessionId');
    let userId = urlParams.get('userId');
    
    // Если параметры отсутствуют в URL, пытаемся восстановить из localStorage
    if (!sessionId || !userId) {
        const storedSessionId = localStorage.getItem('sessionId');
        const storedUserId = localStorage.getItem('userId');
        
        if (storedSessionId && storedUserId) {
            console.log('Восстановление параметров сессии из localStorage');
            sessionId = storedSessionId;
            userId = storedUserId;
            
            // Обновляем URL без перезагрузки страницы
            const restoredParams = new URLSearchParams();
            restoredParams.append('sessionId', sessionId);
            restoredParams.append('userId', userId);
            window.history.replaceState({}, '', `${window.location.pathname}?${restoredParams.toString()}`);
        }
    }
    
    // Проверяем, что есть необходимые параметры
    if (!sessionId || !userId) {
        console.error('Не указан ID сессии или пользователя');
        showNotification('Отсутствуют необходимые параметры', 'error');
        setTimeout(() => {
            window.location.href = '/lobby.html';
        }, 2000);
        return;
    }
    
    console.log('Инициализация сессии с ID:', sessionId, 'и пользователем:', userId);
    
    // Инициализация элементов
    const sessionCode = document.getElementById('session-code');
    const userCount = document.getElementById('user-count');
    const handCards = document.getElementById('hand-cards');
    const noActiveCard = document.getElementById('no-active-card');
    const activeCard = document.getElementById('active-card');
    const answerForm = document.getElementById('answer-form');
    const answerText = document.getElementById('answer-text');
    const submitAnswerBtn = document.getElementById('submit-answer-btn');
    const cancelAnswerBtn = document.getElementById('cancel-answer-btn');
    const turnsContainer = document.getElementById('turns-container');
    const chatMessages = document.getElementById('chat-messages');
    const chatMessage = document.getElementById('chat-message');
    const sendMessageBtn = document.getElementById('send-message-btn');
    const endSessionBtn = document.getElementById('end-session-btn');
    const leaveSessionBtn = document.getElementById('leave-session-btn');
    const hostOnlyControls = document.getElementById('host-only-controls');
    const dealCardsBtn = document.getElementById('deal-cards-btn');
    const resultsModal = document.getElementById('results-modal');
    const sessionSummary = document.getElementById('session-summary');
    const turnList = document.getElementById('turn-list');
    const saveResultsBtn = document.getElementById('save-results-btn');
    const returnLobbyBtn = document.getElementById('return-lobby-btn');
    const closeModal = document.querySelector('.close-modal');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    // Элементы нового модального окна для ответа
    const openAnswerBtn = document.getElementById('open-answer-btn');
    const answerModal = document.getElementById('answer-modal');
    const modalAnswerText = document.getElementById('modal-answer-text');
    const modalSubmitAnswerBtn = document.getElementById('modal-submit-answer-btn');
    const modalCancelAnswerBtn = document.getElementById('modal-cancel-answer-btn');
    
    // Объект для хранения данных сессии
    let session = null;
    let currentUser = null;
    let activeCardData = null;
    let socket = null;
    let isMyTurn = false;
    
    // Флаг, указывающий, является ли пользователь организатором
    let isHost = false;
    
    // Функция для восстановления ходов из localStorage
    function restoreLocalTurns() {
        try {
            const savedTurns = localStorage.getItem(`session_turns_${sessionId}`);
            if (savedTurns) {
                const turns = JSON.parse(savedTurns);
                console.log('Восстановлена история ходов из localStorage:', turns);
                
                // Отображаем восстановленные ходы
                const turnsContainer = document.getElementById('turns-container');
                if (turnsContainer) {
                    turnsContainer.innerHTML = '';
                }
                
                turns.forEach(turn => {
                    // Преобразуем ход в нужный формат
                    const formattedTurn = {
                        userId: turn.userId,
                        userName: turn.userName || 'Неизвестный игрок',
                        cardQuestion: turn.cardQuestion || (turn.card && turn.card.question) || 'Вопрос недоступен',
                        answer: turn.answer || 'Без ответа',
                        timestamp: turn.timestamp || new Date().toISOString()
                    };
                    
                    addTurnToLog(formattedTurn, false);
                });
                
                showNotification('История ходов восстановлена из кэша', 'info');
                return true;
            }
        } catch (error) {
            console.error('Ошибка при восстановлении истории ходов из localStorage:', error);
        }
        return false;
    }
    
    // Добавляем функцию инициализации интерфейса хода при загрузке сессии
    async function initSession() {
        try {
            console.log(`Инициализация сессии: ${sessionId}, пользователь: ${userId}`);
            
            // Сначала проверяем, есть ли сохраненные ходы в localStorage
            const hasLocalTurns = restoreLocalTurns();
            
            // Получение данных сессии с сервера
            const response = await fetch(`/api/sessions/${sessionId}`);
            
            if (!response.ok) {
                throw new Error(`Ошибка загрузки сессии: ${response.status}`);
            }
            
            // Обновляем данные сессии
            session = await response.json();
            console.log('Получены данные сессии:', session);
            
            // Находим текущего пользователя
            currentUser = session.users.find(u => u.id === userId);
            
            if (!currentUser) {
                showNotification('Пользователь не найден в сессии', 'error');
                return;
            }
            
            // Устанавливаем флаг хоста
            isHost = currentUser.isHost;
            
            // Отображаем код сессии
            if (sessionCode) {
                sessionCode.textContent = sessionId;
            }
            
            // Обновляем количество пользователей
            if (userCount) {
                userCount.textContent = session.users.length;
            }
            
            // Проверяем наш ли сейчас ход
            isMyTurn = session.currentTurnUserId === userId;
            console.log(`Мой ход: ${isMyTurn}, текущий игрок: ${session.currentTurnUserId}`);
            
            // Показываем/скрываем кнопки в зависимости от роли
            if (isHost) {
                // Для модератора: только "Завершить сессию"
                endSessionBtn.style.display = 'block';
                leaveSessionBtn.style.display = 'none';
                hostOnlyControls.style.display = 'flex';
            } else {
                // Для обычных участников: только "Покинуть сессию"
                endSessionBtn.style.display = 'none';
                leaveSessionBtn.style.display = 'block';
                hostOnlyControls.style.display = 'none';
            }
            
            // Создаем и обновляем индикатор хода
            createTurnIndicator();
            
            // Отрисовываем карты в руке
            renderHandCards();
            
            // Загружаем ходы с сервера только если нет локальных или нужно обновить
            try {
                await loadTurns();
            } catch (error) {
                console.error('Ошибка при загрузке ходов с сервера:', error);
                // Если у нас уже есть загруженные локальные ходы, не показываем ошибку
                if (!hasLocalTurns) {
                    showNotification('Не удалось загрузить историю ходов с сервера', 'warning');
                }
            }
            
            // Инициализируем Socket.io
            initSocket();
            
            // Обновляем статус пользователя на онлайн
            updateUserOnlineStatus(true);
            
            console.log('Инициализация сессии завершена');
        } catch (error) {
            console.error('Ошибка при инициализации сессии:', error);
            showNotification(`Ошибка при загрузке сессии: ${error.message}`, 'error');
        }
    }
    
    // Создаем индикатор текущего хода
    function createTurnIndicator() {
        console.log('Создание индикатора хода');
        
        // Находим или создаем элемент
        let turnIndicator = document.getElementById('turn-indicator');
        if (!turnIndicator) {
            turnIndicator = document.createElement('div');
            turnIndicator.id = 'turn-indicator';
            turnIndicator.className = 'turn-indicator';
            
            // Добавляем в DOM
            const header = document.querySelector('header');
            if (header) {
                header.appendChild(turnIndicator);
            }
        }
        
        // Обновляем содержимое индикатора
        updateTurnIndicator();
    }
    
    // Обновляем индикатор текущего хода
    function updateTurnIndicator() {
        const turnIndicator = document.getElementById('turn-indicator');
        if (!turnIndicator || !session) {
            console.error('Не удалось найти индикатор хода или данные сессии');
            return;
        }
        
        console.log('Обновление индикатора хода:', {
            currentTurnUserId: session.currentTurnUserId,
            myId: userId,
            isMyTurn: session.currentTurnUserId === userId
        });
        
        // Определяем, чей сейчас ход
        if (!session.currentTurnUserId) {
            turnIndicator.textContent = 'Ход не назначен';
            return;
        }
        
        // Находим имя игрока
        const currentTurnUser = session.users.find(user => user.id === session.currentTurnUserId);
        if (!currentTurnUser) {
            turnIndicator.textContent = 'Неизвестный игрок';
            return;
        }
        
        // Определяем, мой ли сейчас ход
        isMyTurn = session.currentTurnUserId === userId;
        
        // Обновляем отображение
        if (isMyTurn) {
            turnIndicator.innerHTML = `Ход игрока: <span class="current-turn-user my-turn">ваш ход!</span>`;
        } else {
            turnIndicator.innerHTML = `Ход игрока: <span class="current-turn-user">${currentTurnUser.name}</span>`;
            
            // Добавляем кнопку пропуска хода для организатора
            if (isHost) {
                const skipButton = document.createElement('button');
                skipButton.id = 'skip-turn-btn';
                skipButton.className = 'skip-turn-btn';
                skipButton.textContent = 'Пропустить ход';
                skipButton.onclick = skipTurn;
                turnIndicator.appendChild(skipButton);
            }
        }
    }
    
    // Инициализация Socket.io
    function initSocket() {
        if (!socket) {
            socket = io();
        }
        
        console.log('Инициализация сокета для сессии', sessionId);
        
        // Присоединение к комнате сессии
        socket.on('connect', () => {
            console.log('Сокет подключен, присоединяемся к сессии:', sessionId);
            socket.emit('joinSession', {
                sessionId,
                userId
            });
        });
        
        // Обработка обновления сессии
        socket.on('sessionUpdated', (updatedSession) => {
            console.log('Получено обновление сессии:', updatedSession);
            session = updatedSession;
            
            // Обновляем информацию о сессии
            if (sessionCode) {
                sessionCode.textContent = sessionId;
            }
            if (userCount) {
                userCount.textContent = updatedSession.users.length;
            }
            
            // Обновляем другие элементы интерфейса
            updateTurnIndicator();
            renderHandCards();
        });
        
        // Обработчик события нового хода
        socket.on('newTurn', async (data) => {
            console.log('Получено событие newTurn:', data);
            
            try {
                // Запрашиваем актуальные данные сессии
                const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
                if (!sessionResponse.ok) {
                    throw new Error('Не удалось обновить данные сессии');
                }
                
                // Обновляем данные сессии
                session = await sessionResponse.json();
                
                // Обновляем флаг, показывающий, наш ли сейчас ход
                isMyTurn = session.currentTurnUserId === userId;
                
                console.log('Новый ход:', {
                    currentTurnUserId: session.currentTurnUserId,
                    myId: userId,
                    isMyTurn
                });
                
                // Обновляем карты в руке, если ход сделал текущий пользователь
                if (data.lastMoveData && data.lastMoveData.userId === userId) {
                    renderHandCards();
                }
                
                // Обновляем индикатор хода
                updateTurnIndicator();
                
                // Если был последний ход и он НЕ от текущего пользователя, показываем информацию о нем
                // (для своего хода информация уже добавлена в submitAnswer)
                if (data.lastMoveData && data.lastMoveData.userId !== userId) {
                    const lastMoveData = data.lastMoveData;
                    const playerName = session.users.find(u => u.id === lastMoveData.userId)?.name || 'Неизвестный игрок';
                    
                    // Извлекаем вопрос из объекта карты или из прямого поля
                    const cardQuestion = lastMoveData.card ? lastMoveData.card.question : 
                                        (lastMoveData.cardQuestion || 'Вопрос недоступен');
                    
                    // Создаем объект для хода
                    const turnData = {
                        userId: lastMoveData.userId,
                        userName: playerName,
                        cardQuestion: cardQuestion,
                        cardId: lastMoveData.cardId,
                        answer: lastMoveData.answer,
                        timestamp: lastMoveData.timestamp
                    };
                    
                    // Добавляем ход в лог (true означает, что это новый ход, который будет сохранен в localStorage)
                    addTurnToLog(turnData, true);
                    
                    // Также обновим данные ходов с сервера для полного обновления истории
                    try {
                        await loadTurns();
                    } catch (e) {
                        console.error('Не удалось обновить историю ходов с сервера после нового хода:', e);
                    }
                    
                    showNotification(`${playerName} ответил на карту`, 'info');
                }
                
                // Если теперь наш ход, показываем уведомление
                if (isMyTurn) {
                    showNotification('Сейчас ваш ход!', 'success');
                }
            } catch (error) {
                console.error('Ошибка при обновлении данных хода:', error);
                showNotification('Не удалось обновить данные хода', 'error');
            }
        });
        
        // Обработка события пропуска хода
        socket.on('turnSkipped', data => {
            console.log('Пропущен ход:', data);
            
            const message = `Ход игрока ${data.skippedUserName} был пропущен`;
            showNotification(message, 'info');
            
            // Обновляем индикатор хода
            isMyTurn = data.nextTurnUserId === userId;
            
            if (isMyTurn) {
                showNotification('Сейчас ваш ход!', 'success');
            }
        });
        
        // Обновление при присоединении нового пользователя
        socket.on('userJoined', (user) => {
            showNotification(`${user.name} присоединился к сессии`, 'success');
            // Обновляем счетчик пользователей
            session.users.push(user);
            userCount.textContent = session.users.length;
        });
        
        // Обработка события раздачи дополнительных карт
        socket.on('cardsDealt', async (userUpdates) => {
            try {
                console.log('Получено событие cardsDealt:', userUpdates);
                
                // Проверяем, есть ли обновления для текущего пользователя
                if (userUpdates[userId] && userUpdates[userId].newCards) {
                    // Показываем уведомление
                    const cardsCount = userUpdates[userId].newCards.length;
                    showNotification(`Вы получили ${cardsCount} новых карт`, 'success');
                    
                    // Запрашиваем актуальные данные сессии для обновления карт
                    const response = await fetch(`/api/sessions/${sessionId}`);
                    if (!response.ok) {
                        throw new Error('Не удалось обновить данные сессии');
                    }
                    
                    // Обновляем данные сессии
                    session = await response.json();
                    
                    // Обновляем отображение карт
                    renderHandCards();
                } else {
                    // Показываем информацию о пользователе, который получил карты
                    const userWhoGotCards = Object.values(userUpdates)
                        .map(update => update.userName)
                        .join(', ');
                    
                    showNotification(`Пользователи ${userWhoGotCards} получили новые карты`, 'info');
                }
            } catch (error) {
                console.error('Ошибка при обработке события cardsDealt:', error);
                showNotification('Ошибка при обновлении карт', 'error');
            }
        });
        
        // Обработка нового сообщения в чате
        socket.on('newMessage', (message) => {
            addChatMessage(message);
        });
        
        // Обработка завершения сессии
        socket.on('sessionFinished', (data) => {
            showNotification('Сессия завершена', 'success');
            showResultsModal();
        });
    }
    
    // Отрисовка карт в руке пользователя
    function renderHandCards() {
        // Очищаем контейнер
        handCards.innerHTML = '';
        
        // Получаем карты пользователя
        const userCards = session.cards[userId] || [];
        
        if (userCards.length === 0) {
            // Если у пользователя нет карт
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-hand-message';
            emptyMessage.textContent = 'У вас нет карт';
            handCards.appendChild(emptyMessage);
            return;
        }
        
        // Отображаем каждую карту
        userCards.forEach(card => {
            const cardElement = document.createElement('div');
            cardElement.className = 'hand-card';
            cardElement.setAttribute('data-category', card.category);
            cardElement.setAttribute('data-id', card.id);
            
            cardElement.innerHTML = `
                <div class="hand-card-category">${getCategoryName(card.category)}</div>
                <div class="hand-card-question">${card.question}</div>
            `;
            
            // Добавляем обработчик клика для выбора карты
            cardElement.addEventListener('click', () => {
                showActiveCard(card);
            });
            
            handCards.appendChild(cardElement);
        });
    }
    
    // Отрисовка активной карты
    function showActiveCard(card) {
        // Скрываем сообщение об отсутствии активной карты
        noActiveCard.style.display = 'none';
        
        // Сохраняем данные активной карты
        activeCardData = card;
        
        // Создаем HTML для активной карты
        activeCard.innerHTML = `
            <div class="active-card-category">${getCategoryName(card.category)}</div>
            <div class="active-card-question">${card.question}</div>
            <div class="active-card-comment">${getCardComment(card)}</div>
        `;
        
        // Устанавливаем категорию карты
        activeCard.setAttribute('data-category', card.category);
        
        // Показываем карту и форму ответа
        activeCard.style.display = 'block';
        
        // Показываем кнопку "Ответить"
        openAnswerBtn.style.display = 'block';
    }
    
    // Скрытие активной карты
    function hideActiveCard() {
        noActiveCard.style.display = 'flex';
        activeCard.style.display = 'none';
        openAnswerBtn.style.display = 'none';
        answerForm.style.display = 'none';
        activeCardData = null;
    }
    
    // Показываем карту, на которую ответил другой пользователь
    function showOtherUserCard(turn) {
        // Скрываем сообщение "нет активной карты"
        noActiveCard.style.display = 'none';
        
        // Извлекаем категорию из ID карты
        const category = turn.cardId.split('-')[0];
        
        // Отображаем активную карту
        activeCard.style.display = 'block';
        activeCard.setAttribute('data-category', category);
        
        // Получаем комментарий карты из объекта turn или используем стандартный
        const cardComment = turn.cardComment || getDefaultCommentForCategory(category);
        
        activeCard.innerHTML = `
            <div class="active-card-header">
                <div class="active-card-user">${turn.userName} ответил:</div>
            </div>
            <div class="active-card-category">${getCategoryName(category)}</div>
            <div class="active-card-question">${turn.cardQuestion}</div>
            <div class="active-card-comment">${cardComment}</div>
            <div class="active-card-answer">${turn.answer}</div>
        `;
        
        // Скрываем форму для ответа
        answerForm.style.display = 'none';
    }
    
    // Получение стандартного комментария для категории
    function getDefaultCommentForCategory(category) {
        const categoryComments = {
            'ownership': '<p>Обсудите этот вопрос со-владения в контексте вашего бизнеса. Определите конкретные правила и процедуры, которые помогут избежать конфликтов в будущем.</p>',
            'values': '<p>Проанализируйте этот вопрос ценностей в контексте вашего бизнеса. Сформулируйте четкие принципы и ожидания от партнеров.</p>',
            'scenarios': '<p>Разработайте план действий для этого сценария. Определите роли, ответственность и процедуры для эффективного реагирования.</p>',
            'management': '<p>Согласуйте подход к этому аспекту управления компанией. Определите границы ответственности и процедуры принятия решений.</p>',
            'empty': '<p>Сформулируйте собственный вопрос и ответ, актуальные для вашего бизнеса.</p>'
        };
        
        return categoryComments[category] || '<p>Обсудите этот вопрос в контексте вашего бизнеса.</p>';
    }
    
    // Получение названия категории по ее идентификатору
    function getCategoryName(category) {
        const categories = {
            'ownership': 'Со-владение',
            'values': 'Маяки и вышки',
            'scenarios': 'Сценарии',
            'management': 'Со-управление',
            'empty': 'Пустые карты'
        };
        
        return categories[category] || category;
    }
    
    // Получение названия сценария по его идентификатору
    function getScenarioName(scenarioId) {
        const scenarios = {
            'default': 'Стандартный (все категории)',
            'ownership': 'Только Со-владение',
            'values': 'Только Маяки и вышки',
            'scenarios': 'Только Сценарии',
            'management': 'Только Со-управление',
            'empty': 'Только Пустые карты'
        };
        
        return scenarios[scenarioId] || scenarioId;
    }
    
    // Получение комментария к карте
    function getCardComment(card) {
        // Проверяем, есть ли у карты свой комментарий
        if (card.comment) {
            return card.comment;
        }
        
        // Если комментария нет, возвращаем стандартный для категории
        const categoryComments = {
            'ownership': '<p>Обсудите этот вопрос со-владения в контексте вашего бизнеса. Определите конкретные правила и процедуры, которые помогут избежать конфликтов в будущем. Результат: согласованное решение и понимание последствий.</p>',
            'values': '<p>Проанализируйте этот вопрос ценностей в контексте вашего бизнеса. Сформулируйте четкие принципы и ожидания от партнеров. Результат: единое понимание корпоративной культуры и приоритетов компании.</p>',
            'scenarios': '<p>Разработайте план действий для этого сценария. Определите роли, ответственность и процедуры для эффективного реагирования. Результат: готовность к потенциальным вызовам и минимизация рисков.</p>',
            'management': '<p>Согласуйте подход к этому аспекту управления компанией. Определите границы ответственности и процедуры принятия решений. Результат: эффективное совместное управление бизнесом.</p>',
            'empty': '<p>Сформулируйте собственный вопрос и ответ, актуальные для вашего бизнеса. Результат: решение специфической задачи, важной для вашей компании.</p>'
        };
        
        return categoryComments[card.category] || '<p>Обсудите этот вопрос в контексте вашего бизнеса. Определите конкретные правила и процедуры, которые помогут избежать конфликтов в будущем. Результат: согласованное решение и понимание последствий.</p>';
    }
    
    // Показать уведомление
    function showNotification(message, type = '') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = 'notification';
        
        if (type) {
            notification.classList.add(type);
        }
        
        notification.classList.add('show');
        
        // Скрываем уведомление через 3 секунды
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
    
    // Загрузка истории ходов
    async function loadTurns() {
        try {
            const response = await fetch(`/api/sessions/${sessionId}/turns`);
            
            if (!response.ok) {
                throw new Error('Не удалось загрузить историю ходов');
            }
            
            const turns = await response.json();
            console.log('Загружена история ходов с сервера:', turns);
            
            // Проверяем, возвращает ли сервер пустой массив, и есть ли данные в localStorage
            if ((!turns || turns.length === 0) && localStorage.getItem(`session_turns_${sessionId}`)) {
                console.log('Сервер вернул пустые данные, используем существующие локальные ходы');
                return; // Оставляем существующие ходы из localStorage
            }
            
            // Если данные с сервера не пустые, обновляем интерфейс и localStorage
            if (turns && turns.length > 0) {
                // Очищаем контейнер
                const turnsContainer = document.getElementById('turns-container');
                if (turnsContainer) {
                    turnsContainer.innerHTML = '';
                }
                
                // Сохраняем ходы в локальное хранилище
                localStorage.setItem(`session_turns_${sessionId}`, JSON.stringify(turns));
                console.log('История ходов сохранена в localStorage');
                
                // Отображаем каждый ход
                turns.forEach(turn => {
                    // Преобразуем ход в нужный формат
                    const formattedTurn = {
                        userId: turn.userId,
                        userName: turn.userName || 'Неизвестный игрок',
                        cardQuestion: turn.cardQuestion || (turn.card && turn.card.question) || 'Вопрос недоступен',
                        answer: turn.answer || 'Без ответа',
                        timestamp: turn.timestamp || new Date().toISOString()
                    };
                    
                    addTurnToLog(formattedTurn, false);
                });
            }
            
        } catch (error) {
            console.error('Ошибка при загрузке истории ходов:', error);
            throw error; // Пробрасываем ошибку для обработки в initSession
        }
    }
    
    // Добавление хода в лог
    function addTurnToLog(turn, isNew = true) {
        if (!turn) {
            console.error('Попытка добавить undefined ход в лог');
            return;
        }
        
        console.log('Добавление хода в лог:', turn);
        
        // Проверяем наличие необходимых данных
        if (!turn.userName || !turn.cardQuestion || !turn.answer) {
            console.error('Ход не содержит необходимых данных:', turn);
            return;
        }
        
        // Если это новый ход, сохраняем его в localStorage
        if (isNew) {
            try {
                // Получаем текущие ходы из localStorage
                const savedTurnsJson = localStorage.getItem(`session_turns_${sessionId}`);
                let savedTurns = [];
                
                if (savedTurnsJson) {
                    savedTurns = JSON.parse(savedTurnsJson);
                }
                
                // Добавляем новый ход
                savedTurns.push(turn);
                
                // Сохраняем обновленную историю
                localStorage.setItem(`session_turns_${sessionId}`, JSON.stringify(savedTurns));
                console.log('Ход добавлен в localStorage');
            } catch (error) {
                console.error('Ошибка при сохранении хода в localStorage:', error);
            }
        }
        
        // Создаем элемент хода
        const turnElement = document.createElement('div');
        turnElement.className = 'turn-item';
        if (isNew) {
            turnElement.classList.add('new-turn');
        }
        
        // Форматируем время
        let turnTime = 'Недавно';
        if (turn.timestamp) {
            try {
                const turnDate = new Date(turn.timestamp);
                if (!isNaN(turnDate.getTime())) {
                    turnTime = turnDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
            } catch (error) {
                console.error('Ошибка форматирования времени хода:', error);
            }
        }
        
        // Заполняем HTML хода
        turnElement.innerHTML = `
            <div class="turn-header">
                <div class="turn-user">${turn.userName}</div>
                <div class="turn-time">${turnTime}</div>
            </div>
            <div class="turn-question">${turn.cardQuestion}</div>
            <div class="turn-answer">${turn.answer}</div>
        `;
        
        // Получаем контейнер для ходов
        const turnsContainer = document.getElementById('turns-container');
        if (!turnsContainer) {
            console.error('Не найден контейнер для истории ходов');
            return;
        }
        
        // Добавляем элемент в начало списка
        if (turnsContainer.firstChild) {
            turnsContainer.insertBefore(turnElement, turnsContainer.firstChild);
        } else {
            turnsContainer.appendChild(turnElement);
        }
        
        // Если это новый ход, добавляем анимацию появления
        if (isNew) {
            setTimeout(() => {
                turnElement.classList.add('show');
            }, 10);
        }
    }
    
    // Отправка сообщения в чат
    function sendChatMessage() {
        const message = chatMessage.value.trim();
        
        if (!message) {
            return;
        }
        
        socket.emit('sendMessage', message);
        chatMessage.value = '';
    }
    
    // Добавление сообщения в чат
    function addChatMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';
        
        // Определяем, свое сообщение или нет
        if (message.userId === userId) {
            messageElement.classList.add('own');
        } else {
            messageElement.classList.add('other');
        }
        
        // Форматируем время
        const messageTime = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        messageElement.innerHTML = `
            <div class="chat-header">
                <div class="chat-username">${message.userName}</div>
                <div class="chat-time">${messageTime}</div>
            </div>
            <div class="chat-text">${message.text}</div>
        `;
        
        chatMessages.appendChild(messageElement);
        
        // Прокручиваем чат к новому сообщению
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // Завершение сессии (только для организатора)
    async function endSession() {
        if (!isHost) {
            showNotification('Только организатор может завершить сессию', 'error');
            return;
        }
        
        if (!confirm('Вы уверены, что хотите завершить сессию? Это действие нельзя отменить.')) {
            return;
        }
        
        try {
            console.log('Завершение сессии...');
            
            const response = await fetch(`/api/sessions/${sessionId}/finish`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId
                })
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Не удалось завершить сессию');
            }
            
            showResultsModal();
            
        } catch (error) {
            console.error('Ошибка при завершении сессии:', error);
            showNotification(`Ошибка: ${error.message}`, 'error');
        }
    }
    
    // Покинуть сессию
    function leaveSession() {
        if (confirm('Вы уверены, что хотите покинуть сессию?')) {
            // Отключаем Socket.io
            if (socket) {
                socket.disconnect();
            }
            
            // Отправляем статус оффлайн перед уходом
            updateUserOnlineStatus(false);
            
            window.location.href = '/lobby.html';
        }
    }
    
    // Показать модальное окно с результатами
    async function showResultsModal() {
        // Обновляем данные сессии
        await loadTurns();
        
        // Формируем сводку сессии
        sessionSummary.innerHTML = `
            <p>Всего участников: ${session.users.length}</p>
            <p>Карт разыграно: ${session.turns.length}</p>
            <p>Начало сессии: ${new Date(session.startTime).toLocaleString()}</p>
            ${session.endTime ? `<p>Завершение сессии: ${new Date(session.endTime).toLocaleString()}</p>` : ''}
            <p>Сценарий: ${getScenarioName(session.scenarioId)}</p>
        `;
        
        // Формируем список ходов
        turnList.innerHTML = '';
        session.turns.forEach(turn => {
            const turnItem = document.createElement('div');
            turnItem.className = 'modal-turn-item';
            
            // Извлекаем вопрос либо из строкового поля cardQuestion, либо из объекта card
            const cardQuestion = turn.cardQuestion || (turn.card && turn.card.question) || 'Вопрос недоступен';
            
            turnItem.innerHTML = `
                <div class="modal-turn-header">
                    <strong>${turn.userName || 'Неизвестный игрок'}</strong> ответил на вопрос:
                </div>
                <div class="modal-turn-question">${cardQuestion}</div>
                <div class="modal-turn-answer">${turn.answer || 'Ответ не указан'}</div>
                <div class="modal-turn-time">${new Date(turn.timestamp || new Date()).toLocaleString()}</div>
            `;
            
            turnList.appendChild(turnItem);
        });
        
        // Показываем модальное окно
        resultsModal.style.display = 'block';
    }
    
    // Сохранение результатов сессии в файл
    function saveResults() {
        // Формируем данные для сохранения
        const results = {
            sessionId,
            startTime: session.startTime,
            endTime: session.endTime,
            scenarioId: session.scenarioId,
            users: session.users.map(user => ({
                id: user.id,
                name: user.name,
                isHost: user.isHost
            })),
            turns: session.turns
        };
        
        // Преобразуем в JSON
        const jsonResults = JSON.stringify(results, null, 2);
        
        // Создаем ссылку для скачивания
        const blob = new Blob([jsonResults], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Создаем и симулируем клик по ссылке
        const a = document.createElement('a');
        a.href = url;
        a.download = `session-${sessionId}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        
        // Очищаем ресурсы
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
    
    // Функция для отправки ответа
    async function submitAnswer() {
        // Если нет активной карты, выходим
        if (!activeCardData) {
            showNotification('Выберите карту для ответа', 'error');
            return;
        }
        
        // Получаем текст ответа из модального окна
        const answer = modalAnswerText.value.trim();
        
        if (!answer) {
            showNotification('Введите ваш ответ', 'error');
            return;
        }
        
        try {
            console.log('Отправка ответа на сервер для карты:', activeCardData.id);
            
            // Отправляем ответ на сервер
            const response = await fetch(`/api/sessions/${sessionId}/turn`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId,
                    cardId: activeCardData.id,
                    answer
                })
            });
            
            if (!response.ok) {
                // Получаем текст ошибки от сервера
                const errorData = await response.json();
                
                // Если ошибка о том, что карта не найдена, отображаем уведомление и обновляем сессию
                if (errorData.error === 'Карта не найдена у пользователя') {
                    // Запрашиваем актуальные данные сессии для обновления карт
                    const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
                    if (sessionResponse.ok) {
                        session = await sessionResponse.json();
                        renderHandCards(); // Обновляем карты в руке
                    }
                }
                
                throw new Error(errorData.error || 'Не удалось отправить ответ');
            }
            
            // Получаем результат ответа
            const result = await response.json();
            console.log('Результат отправки ответа:', result);
            
            // Добавляем ход в историю
            if (result.moveData) {
                const moveData = result.moveData;
                
                // Сохраняем вопрос из объекта карты
                const cardQuestion = moveData.card ? moveData.card.question : 
                                    (activeCardData ? activeCardData.question : 'Вопрос недоступен');
                
                // Форматируем данные хода
                const turnData = {
                    userId: moveData.userId,
                    userName: currentUser.name,
                    cardQuestion: cardQuestion,
                    cardId: moveData.cardId,
                    answer: moveData.answer,
                    timestamp: moveData.timestamp
                };
                
                // Добавляем в историю
                addTurnToLog(turnData);
            }
            
            // Закрываем модальное окно
            closeAnswerModal();
            
            // Скрываем активную карту после отправки ответа
            hideActiveCard();
            
            // Очищаем данные активной карты
            activeCardData = null;
            
            // Показываем уведомление
            showNotification('Ответ отправлен', 'success');
            
        } catch (error) {
            console.error('Ошибка при отправке ответа:', error);
            showNotification(error.message, 'error');
        }
    }
    
    // Функция для открытия модального окна с ответом
    function openAnswerModal() {
        if (!activeCardData) {
            showNotification('Выберите карту для ответа', 'error');
            return;
        }
        
        // Очищаем поле ввода
        modalAnswerText.value = '';
        
        // Показываем модальное окно
        answerModal.classList.add('show');
        
        // Устанавливаем фокус на поле ввода
        modalAnswerText.focus();
    }
    
    // Функция для закрытия модального окна с ответом
    function closeAnswerModal() {
        answerModal.classList.remove('show');
    }
    
    // Обработчики событий
    
    // Нажатие на кнопку "Ответить"
    submitAnswerBtn.addEventListener('click', submitAnswer);
    
    // Нажатие на кнопку "Отмена" при ответе на карту
    cancelAnswerBtn.addEventListener('click', hideActiveCard);
    
    // Нажатие на кнопку "Отправить" в чате
    sendMessageBtn.addEventListener('click', sendChatMessage);
    
    // Обработка нажатия Enter в поле чата
    chatMessage.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
    
    // Завершение сессии
    endSessionBtn.addEventListener('click', endSession);
    
    // Покинуть сессию
    leaveSessionBtn.addEventListener('click', leaveSession);
    
    // Раздать еще карты (только для организатора)
    dealCardsBtn.addEventListener('click', async () => {
        try {
            // Отправляем запрос на сервер для раздачи дополнительных карт
            const response = await fetch(`/api/sessions/${sessionId}/deal-more-cards`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId
                })
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Не удалось раздать дополнительные карты');
            }
            
            const result = await response.json();
            
            // Если у текущего пользователя появились новые карты, отображаем их
            if (result.userUpdates[userId]) {
                renderHandCards(); // Перерисовываем все карты в руке
                showNotification(`Вы получили ${result.userUpdates[userId].newCards.length} новых карт`, 'success');
            } else {
                showNotification('Дополнительные карты розданы', 'success');
            }
            
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });
    
    // Сохранение результатов
    saveResultsBtn.addEventListener('click', saveResults);
    
    // Возврат в лобби из модального окна
    returnLobbyBtn.addEventListener('click', () => {
        window.location.href = '/lobby.html';
    });
    
    // Закрытие модального окна
    closeModal.addEventListener('click', () => {
        resultsModal.style.display = 'none';
    });
    
    // Клик вне модального окна
    window.addEventListener('click', (e) => {
        if (e.target === resultsModal) {
            resultsModal.style.display = 'none';
        }
    });
    
    // Переключение табов
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // Удаляем активный класс у всех кнопок и панелей
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Добавляем активный класс выбранной кнопке и панели
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            
            // Не меняем padding у chat-messages при переключении табов,
            // он должен быть одинаковым во всех состояниях
        });
    });
    
    // Обработчики событий для нового модального окна
    openAnswerBtn.addEventListener('click', openAnswerModal);
    modalSubmitAnswerBtn.addEventListener('click', submitAnswer);
    modalCancelAnswerBtn.addEventListener('click', closeAnswerModal);
    
    // Закрытие модального окна при клике вне его области
    answerModal.addEventListener('click', (event) => {
        if (event.target === answerModal) {
            closeAnswerModal();
        }
    });
    
    // Обработка нажатия Escape для закрытия модального окна
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && answerModal.classList.contains('show')) {
            closeAnswerModal();
        }
    });
    
    // Функция раздачи дополнительных карт
    async function dealMoreCards() {
        if (!isHost) {
            showNotification('Только организатор может раздать дополнительные карты', 'error');
            return;
        }
        
        try {
            console.log('Раздача дополнительных карт...');
            
            // Отправляем запрос на раздачу дополнительных карт
            const response = await fetch(`/api/sessions/${sessionId}/deal-more-cards`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: userId
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Не удалось раздать дополнительные карты');
            }
            
            const result = await response.json();
            console.log('Результат раздачи карт:', result);
            
            // Показываем уведомление
            showNotification('Дополнительные карты успешно розданы', 'success');
            
        } catch (error) {
            console.error('Ошибка при раздаче дополнительных карт:', error);
            showNotification(`Ошибка: ${error.message}`, 'error');
        }
    }
    
    // Функция для пропуска хода (только для хоста)
    async function skipTurn() {
        if (!isHost) {
            showNotification('Только организатор может пропустить ход', 'error');
            return;
        }
        
        try {
            console.log('Пропуск хода...');
            
            // Отправляем запрос на пропуск хода
            const response = await fetch(`/api/sessions/${sessionId}/skip-turn`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: userId
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Не удалось пропустить ход');
            }
            
            const result = await response.json();
            console.log('Результат пропуска хода:', result);
            
            // Показываем уведомление
            showNotification('Ход пропущен', 'info');
            
        } catch (error) {
            console.error('Ошибка при пропуске хода:', error);
            showNotification(`Ошибка: ${error.message}`, 'error');
        }
    }
    
    // Обновляем статус пользователя (онлайн/оффлайн)
    async function updateUserOnlineStatus(isOnline) {
        try {
            await fetch(`/api/sessions/${sessionId}/user-status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId,
                    isOnline
                })
            });
            console.log(`Статус пользователя обновлен: ${isOnline ? 'онлайн' : 'оффлайн'}`);
        } catch (error) {
            console.error('Ошибка при обновлении статуса:', error);
        }
    }
    
    // Инициализация сессии при загрузке страницы
    initSession();
    
    // Добавляем обработчики для кнопок после загрузки сессии
    const dealCardsButton = document.getElementById('deal-more-cards-btn');
    if (dealCardsButton) {
        dealCardsButton.addEventListener('click', dealMoreCards);
        console.log('Добавлен обработчик для кнопки "Раздать ещё карты"');
    }
    
    const endButton = document.getElementById('end-session-btn');
    if (endButton) {
        endButton.addEventListener('click', endSession);
        console.log('Добавлен обработчик для кнопки "Завершить сессию"');
    }
    
    const leaveButton = document.getElementById('leave-session-btn');
    if (leaveButton) {
        leaveButton.addEventListener('click', leaveSession);
        console.log('Добавлен обработчик для кнопки "Покинуть сессию"');
    }
}); 