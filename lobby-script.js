document.addEventListener('DOMContentLoaded', () => {
    // Инициализация элементов
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const createForm = document.getElementById('create-form');
    const joinForm = document.getElementById('join-form');
    const lobbyContainer = document.querySelector('.lobby-container');
    const waitingRoom = document.querySelector('.waiting-room');
    const roomCode = document.getElementById('room-code');
    const participantsList = document.getElementById('participants-list');
    const hostControls = document.getElementById('host-controls');
    const scenarioSelect = document.getElementById('scenario-select');
    const startSessionBtn = document.getElementById('start-session-btn');
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const notification = document.getElementById('notification');

    // Переменные для хранения данных сессии
    let currentSession = null;
    let currentUser = null;
    let socket = null;

    // Инициализация Socket.io
    function initSocket() {
        socket = io();

        // Присоединение к комнате сессии
        socket.on('connect', () => {
            if (currentSession && currentUser) {
                socket.emit('joinSession', {
                    sessionId: currentSession.id,
                    userId: currentUser.id
                });
            }
        });

        // Обработка присоединения нового участника
        socket.on('userJoined', (user) => {
            showNotification(`${user.name} присоединился к сессии`, 'success');
            updateParticipantsList();
        });

        // Обработка запуска сессии
        socket.on('sessionStarted', (data) => {
            showNotification('Сессия начата! Переход в игровое пространство...', 'success');
            // Переходим на страницу сессии
            setTimeout(() => {
                window.location.href = `/session.html?id=${currentSession.id}&user=${currentUser.id}`;
            }, 1500);
        });
    }

    // Переключение между вкладками
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Убираем класс active у всех кнопок и панелей
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Добавляем класс active нужной кнопке и панели
            btn.classList.add('active');
            const targetTab = btn.getAttribute('data-tab');
            document.getElementById(targetTab).classList.add('active');
        });
    });

    // Создание новой сессии
    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const hostName = document.getElementById('host-name').value.trim();
        if (!hostName) {
            showNotification('Пожалуйста, введите ваше имя', 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ hostName })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Не удалось создать сессию');
            }
            
            // Сохраняем данные сессии и пользователя
            currentSession = data.session;
            currentUser = currentSession.users[0]; // Первый пользователь - организатор
            
            // Переходим в комнату ожидания
            showWaitingRoom();
            showNotification('Сессия успешно создана!', 'success');
            
            // Инициализируем Socket.io
            initSocket();
            
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });

    // Присоединение к существующей сессии
    joinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const sessionId = document.getElementById('session-id').value.trim();
        const userName = document.getElementById('user-name').value.trim();
        
        if (!sessionId || !userName) {
            showNotification('Пожалуйста, заполните все поля', 'error');
            return;
        }
        
        try {
            // Сначала проверяем, существует ли сессия
            const checkResponse = await fetch(`/api/sessions/${sessionId}`);
            
            if (!checkResponse.ok) {
                throw new Error('Сессия не найдена');
            }
            
            // Присоединяемся к сессии
            const joinResponse = await fetch(`/api/sessions/${sessionId}/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userName })
            });
            
            const data = await joinResponse.json();
            
            if (!joinResponse.ok) {
                throw new Error(data.error || 'Не удалось присоединиться к сессии');
            }
            
            // Сохраняем данные сессии и пользователя
            currentSession = data.session;
            currentUser = { id: data.userId, name: userName, isHost: false };
            
            // Переходим в комнату ожидания
            showWaitingRoom();
            showNotification('Вы успешно присоединились к сессии!', 'success');
            
            // Инициализируем Socket.io
            initSocket();
            
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });

    // Начало сессии (только для организатора)
    startSessionBtn.addEventListener('click', async () => {
        if (!currentSession || !currentUser || !currentUser.isHost) {
            showNotification('Только организатор может начать сессию', 'error');
            return;
        }
        
        const scenarioId = scenarioSelect.value;
        
        try {
            const response = await fetch(`/api/sessions/${currentSession.id}/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    userId: currentUser.id,
                    scenarioId 
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Не удалось начать сессию');
            }
            
            // Обновляем данные сессии
            currentSession = data.session;
            showNotification('Сессия начата! Переход в игровое пространство...', 'success');
            
        } catch (error) {
            showNotification(error.message, 'error');
        }
    });

    // Покинуть комнату
    leaveRoomBtn.addEventListener('click', () => {
        if (confirm('Вы уверены, что хотите покинуть комнату?')) {
            // Отключаем Socket.io
            if (socket) {
                socket.disconnect();
            }
            
            // Сбрасываем данные сессии и пользователя
            currentSession = null;
            currentUser = null;
            
            // Возвращаемся в лобби
            showLobby();
            showNotification('Вы покинули комнату', 'success');
        }
    });

    // Функция отображения комнаты ожидания
    function showWaitingRoom() {
        lobbyContainer.style.display = 'none';
        waitingRoom.style.display = 'block';
        
        // Отображаем код комнаты
        roomCode.textContent = currentSession.id;
        
        // Обновляем список участников
        updateParticipantsList();
        
        // Показываем элементы управления для организатора
        if (currentUser && currentUser.isHost) {
            hostControls.style.display = 'block';
        } else {
            hostControls.style.display = 'none';
        }
    }

    // Функция возврата в лобби
    function showLobby() {
        waitingRoom.style.display = 'none';
        lobbyContainer.style.display = 'block';
        
        // Очищаем формы
        document.getElementById('host-name').value = '';
        document.getElementById('session-id').value = '';
        document.getElementById('user-name').value = '';
    }

    // Функция обновления списка участников
    async function updateParticipantsList() {
        if (!currentSession) return;
        
        try {
            // Получаем актуальную информацию о сессии
            const response = await fetch(`/api/sessions/${currentSession.id}`);
            const session = await response.json();
            
            if (!response.ok) {
                throw new Error('Не удалось получить информацию о сессии');
            }
            
            // Обновляем данные сессии
            currentSession = session;
            
            // Очищаем список участников
            participantsList.innerHTML = '';
            
            // Заполняем список участников
            currentSession.users.forEach(user => {
                const li = document.createElement('li');
                li.textContent = user.name;
                
                if (user.isHost) {
                    li.classList.add('host');
                }
                
                participantsList.appendChild(li);
            });
            
        } catch (error) {
            console.error('Ошибка при обновлении списка участников:', error);
        }
    }

    // Функция показа уведомления
    function showNotification(message, type = '') {
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
}); 