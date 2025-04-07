const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const storage = require('./server-storage');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Загружаем данные из файлов
const { sessions, users } = storage.loadData();

// Настраиваем автосохранение
storage.setupAutoSave(sessions, users);

// Используем статические файлы из текущей директории
app.use(express.static(path.join(__dirname, '/')));
app.use(express.json());

// Маршрут для главной страницы
app.get('/', (req, res) => {
  res.redirect('/lobby.html');
});

// API маршруты

// Создание новой сессии
app.post('/api/sessions', (req, res) => {
  const sessionId = uuidv4();
  const { hostName } = req.body;
  
  if (!hostName) {
    return res.status(400).json({ error: 'Имя организатора обязательно' });
  }
  
  const hostId = uuidv4();
  
  sessions[sessionId] = {
    id: sessionId,
    host: hostName,
    users: [{ id: hostId, name: hostName, isHost: true, isOnline: true }],
    status: 'waiting', // waiting, started, finished
    cards: {},
    scenarioId: null,
    startTime: null,
    turns: [],
    currentTurnUserId: null, // ID пользователя, чей сейчас ход
    userOrder: [hostId] // Порядок ходов пользователей
  };
  
  res.status(201).json({ 
    sessionId,
    session: sessions[sessionId]
  });

  storage.saveData(sessions, users);
});

// Получение информации о сессии
app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessions[sessionId]) {
    return res.status(404).json({ error: 'Сессия не найдена' });
  }
  
  res.json(sessions[sessionId]);
});

// Присоединение к сессии
app.post('/api/sessions/:sessionId/join', (req, res) => {
  const { sessionId } = req.params;
  const { userName } = req.body;
  
  if (!sessions[sessionId]) {
    return res.status(404).json({ error: 'Сессия не найдена' });
  }
  
  if (sessions[sessionId].status !== 'waiting') {
    return res.status(400).json({ error: 'Сессия уже началась или завершена' });
  }
  
  if (!userName) {
    return res.status(400).json({ error: 'Имя пользователя обязательно' });
  }
  
  const userId = uuidv4();
  const newUser = { id: userId, name: userName, isHost: false, isOnline: true };
  
  sessions[sessionId].users.push(newUser);
  sessions[sessionId].userOrder.push(userId); // Добавляем пользователя в порядок ходов
  
  // Уведомляем всех участников о новом пользователе
  io.to(sessionId).emit('userJoined', newUser);
  
  res.status(200).json({ 
    userId,
    session: sessions[sessionId]
  });

  storage.saveData(sessions, users);
});

// Запуск сессии и выбор сценария
app.post('/api/sessions/:sessionId/start', (req, res) => {
  const { sessionId } = req.params;
  const { scenarioId, userId } = req.body;
  
  if (!sessions[sessionId]) {
    return res.status(404).json({ error: 'Сессия не найдена' });
  }
  
  const session = sessions[sessionId];
  const user = session.users.find(u => u.id === userId);
  
  if (!user || !user.isHost) {
    return res.status(403).json({ error: 'Только организатор может начать сессию' });
  }
  
  if (session.status !== 'waiting') {
    return res.status(400).json({ error: 'Сессия уже началась или завершена' });
  }
  
  // Начинаем сессию
  session.status = 'started';
  session.scenarioId = scenarioId || 'default';
  session.startTime = new Date().toISOString();
  
  // Устанавливаем первого игрока (организатора) как текущего
  session.currentTurnUserId = session.userOrder[0];
  
  // Раздаем карты участникам
  dealCards(sessionId);
  
  // Уведомляем всех участников о начале сессии
  io.to(sessionId).emit('sessionStarted', {
    scenarioId: session.scenarioId,
    startTime: session.startTime,
    currentTurnUserId: session.currentTurnUserId
  });
  
  res.status(200).json({ 
    status: 'started',
    session
  });

  storage.saveData(sessions, users);
});

// Функция раздачи карт
function dealCards(sessionId) {
  const session = sessions[sessionId];
  if (!session) return;
  
  // Используем реальные карточки с фактическими вопросами и комментариями из index.html
  const allCards = {
    ownership: [
      { id: 'ownership-1', category: 'ownership', question: 'Как оценим бизнес, если один захочет выйти завтра?', 
        comment: '<p>Определите формулу оценки бизнеса и согласуйте сроки выплат при выходе партнёра. Это позволит избежать конфликтов в критический момент. Результат: прозрачный механизм оценки и сроки расчетов с выходящим партнёром.</p>' },
      { id: 'ownership-2', category: 'ownership', question: 'Пустим ли жену/брата в совет директоров?', 
        comment: '<p>Обсудите принципы включения родственников в управление компанией. Рассмотрите риски эмоциональных решений, конфликта интересов и возможные последствия семейных споров для бизнеса. Результат: четкая политика участия родственников в управлении.</p>' },
      { id: 'ownership-3', category: 'ownership', question: 'Будем платить дивиденды или реинвестировать?', 
        comment: '<p>Согласуйте политику распределения прибыли между реинвестированием и выплатой дивидендов. Обсудите процент выплат, периодичность и механизм принятия решений в этом вопросе. Результат: прозрачная финансовая политика, учитывающая интересы всех партнёров.</p>' },
      { id: 'ownership-4', category: 'ownership', question: 'Как делить доли, если я вложу в 2 раза больше?', 
        comment: '<p>Разработайте формулу перераспределения долей в случае диспропорциональных инвестиций. Учтите как денежные вложения, так и ценность других вкладов (время, экспертиза, связи). Результат: справедливая модель корректировки долей при неравных вложениях.</p>' },
      { id: 'ownership-5', category: 'ownership', question: 'Продадим ли долю китайским инвесторам?', 
        comment: '<p>Обсудите принципы привлечения иностранных инвесторов и возможные ограничения. Определите приемлемые лимиты отчуждения долей и последствия нарушения договоренностей. Результат: согласованная стратегия взаимодействия с иностранным капиталом.</p>' },
      { id: 'ownership-6', category: 'ownership', question: 'Кто получит право первого отказа на выкуп?', 
        comment: '<p>Определите, кто будет иметь преимущественное право выкупа доли при выходе партнёра, сроки принятия решения и метод оценки стоимости доли. Это защитит компанию от нежелательных третьих лиц. Результат: прозрачная процедура реализации права первого отказа.</p>' },
      { id: 'ownership-7', category: 'ownership', question: 'Что будет с долей, если партнёр умрет?', 
        comment: '<p>Обсудите механизм наследования доли в бизнесе и возможные ограничения для наследников. Определите, будет ли обязательный выкуп доли у наследников и на каких условиях. Результат: защита бизнеса в случае ухода из жизни одного из партнёров.</p>' },
      { id: 'ownership-8', category: 'ownership', question: 'Разрешим ли залог доли под кредит?', 
        comment: '<p>Рассмотрите возможность использования долей компании в качестве залога по личным обязательствам. Определите ограничения, процедуру согласования и последствия для нарушителей договоренностей. Результат: минимизация рисков потери контроля над бизнесом.</p>' }
      // Другие карты со-владения можно добавить при необходимости
    ],
    values: [
      { id: 'values-1', category: 'values', question: 'Можно ли совмещать с конкурентом?', 
        comment: '<p>Обсудите возможность сотрудничества с конкурирующими компаниями. Определите границы допустимого взаимодействия, условия информирования партнёров и возможные санкции за нарушение договоренностей. Результат: четкая политика взаимодействия с конкурентами.</p>' },
      { id: 'values-2', category: 'values', question: 'Будем скрывать убытки от семьи?', 
        comment: '<p>Определите политику прозрачности финансовых результатов компании для семей партнёров. Обсудите частоту и формат отчетности, границы конфиденциальности. Результат: согласованный подход к коммуникации финансового положения бизнеса в семье.</p>' },
      { id: 'values-3', category: 'values', question: 'Ваш личный потолок по долгам бизнеса?', 
        comment: '<p>Определите максимальную сумму личной ответственности каждого партнёра по обязательствам бизнеса. Это важное решение поможет установить границы финансового риска и психологический комфорт. Результат: четкие лимиты финансовой ответственности для каждого участника.</p>' },
      { id: 'values-4', category: 'values', question: 'Допустимо ли давать взятки для сделок?', 
        comment: '<p>Обсудите этические границы в переговорах с контрагентами и представителями власти. Определите, что является неприемлемым в вопросах коррупции, и какие последствия ждут того, кто нарушит договоренности. Результат: этический кодекс компании в вопросах взаимодействия с внешней средой.</p>' },
      { id: 'values-5', category: 'values', question: 'Можно ли публично критиковать партнёра?', 
        comment: '<p>Обсудите допустимость и формат публичной критики партнёров. Определите каналы и способы коммуникации разногласий, а также последствия за нарушение этических норм. Результат: политика внешних коммуникаций, защищающая репутацию компании и партнёров.</p>' }
      // Другие карты маяков и вышек можно добавить при необходимости
    ],
    scenarios: [
      { id: 'scenarios-1', category: 'scenarios', question: 'Если хакеры украдут все данные?', 
        comment: '<p>Разработайте протокол реагирования на утечку данных. Определите ответственных лиц, процедуру уведомления клиентов, механизмы компенсации ущерба и меры по восстановлению репутации. Результат: готовность к управлению киберкризисом с минимальными потерями.</p>' },
      { id: 'scenarios-2', category: 'scenarios', question: 'Если налоговая заблокирует счета?', 
        comment: '<p>Согласуйте план действий на случай блокировки корпоративных счетов. Определите альтернативные источники финансирования, расставьте приоритеты платежей и распределите ответственность за разблокировку. Результат: готовность к временному функционированию в условиях ограниченного доступа к финансам.</p>' },
      { id: 'scenarios-3', category: 'scenarios', question: 'Если один из нас влюбится в сотрудника?', 
        comment: '<p>Определите политику в отношении личных связей партнёров с сотрудниками компании. Рассмотрите варианты — от полного запрета до регламентации с обязательным информированием других партнёров. Результат: правила, минимизирующие риски конфликта интересов и негативного влияния на коллектив.</p>' },
      { id: 'scenarios-4', category: 'scenarios', question: 'Если рынок рухнет из-за кризиса?', 
        comment: '<p>Разработайте антикризисную стратегию для компании. Определите критерии принятия решений о сокращении персонала, изменении бизнес-модели или переходе в другие ниши. Результат: план действий, позволяющий сохранить ядро бизнеса в условиях экономического спада.</p>' },
      { id: 'scenarios-5', category: 'scenarios', question: 'Если партнёр присвоит деньги компании?', 
        comment: '<p>Согласуйте процедуру действий в случае выявления факта присвоения средств компании. Определите пороговые суммы для разных уровней реагирования, возможность выкупа доли нарушителя и критерии для обращения в правоохранительные органы. Результат: механизм защиты от финансовых злоупотреблений.</p>' }
      // Другие карты сценариев можно добавить при необходимости
    ],
    management: [
      { id: 'management-1', category: 'management', question: 'Кто отвечает за увольнение сотрудников?', 
        comment: '<p>Определите процедуру и ответственных за принятие решений об увольнении сотрудников разного уровня. Согласуйте необходимость согласования таких решений с партнёрами и процесс коммуникации с командой. Результат: справедливая и предсказуемая система кадровых решений.</p>' },
      { id: 'management-2', category: 'management', question: 'Как часто будем проводить планерки?', 
        comment: '<p>Определите оптимальную частоту, формат и продолжительность регулярных встреч управленческой команды. Согласуйте обязательность участия, процедуру подготовки и правила фиксации решений. Результат: эффективная система координации управленческих действий.</p>' },
      { id: 'management-3', category: 'management', question: 'Можно ли менять KPI в середине квартала?', 
        comment: '<p>Согласуйте политику изменения ключевых показателей эффективности в течение отчетного периода. Определите исключительные обстоятельства, процедуру согласования и компенсации за "изменение правил игры". Результат: стабильная и мотивирующая система оценки результатов.</p>' },
      { id: 'management-4', category: 'management', question: 'Кто подписывает договоры с поставщиками?', 
        comment: '<p>Определите круг лиц, имеющих право подписи договоров с поставщиками разного уровня значимости. Согласуйте лимиты самостоятельных решений и процедуру эскалации для крупных или стратегических контрактов. Результат: эффективный баланс между оперативностью и контролем.</p>' },
      { id: 'management-5', category: 'management', question: 'Как делить премии среди топ-менеджеров?', 
        comment: '<p>Разработайте прозрачную формулу распределения премиального фонда между руководителями высшего звена. Определите баланс между индивидуальными и командными результатами, а также условия лишения премии. Результат: справедливая система мотивации управленческой команды.</p>' }
      // Другие карты со-управления можно добавить при необходимости
    ],
    empty: [
      { id: 'empty-1', category: 'empty', question: 'Какой главный вопрос остался необсужденным?', 
        comment: '<p>Используйте этот момент, чтобы поднять важный вопрос, который ещё не обсуждался. Сформулируйте его четко и объясните, почему он критически важен для успеха предприятия. Результат: выявление и обсуждение "слепых зон" в планировании.</p>' },
      { id: 'empty-2', category: 'empty', question: 'Какой опыт предыдущих проектов стоит учесть в текущем?', 
        comment: '<p>Поделитесь релевантным опытом из предыдущих проектов — как успешным, так и неудачным. Обсудите уроки, которые можно применить в текущем проекте. Результат: практические выводы, которые помогут избежать повторения ошибок и усилить успешные практики.</p>' },
      { id: 'empty-3', category: 'empty', question: 'Какая общая цель объединяет всех партнёров?', 
        comment: '<p>Обсудите глубинные мотивы, ценности и цели, которые объединяют всех партнёров в этом бизнесе. Важно выявить действительно общие устремления, а не просто декларируемые. Результат: ясное понимание общего фундамента партнёрства.</p>' },
      { id: 'empty-4', category: 'empty', question: 'Что для вас служит главной мотивацией в бизнесе?', 
        comment: '<p>Откровенно поделитесь вашими главными драйверами в бизнесе — деньги, статус, свобода, самореализация, влияние или что-то другое. Понимание истинных мотивов друг друга поможет выстроить гармоничные отношения. Результат: осознание личных приоритетов каждого партнёра.</p>' },
      { id: 'empty-5', category: 'empty', question: 'Какие личные страхи влияют на ваши бизнес-решения?', 
        comment: '<p>Обсудите личные страхи и опасения, которые могут неосознанно влиять на принимаемые бизнес-решения. Признание этих факторов поможет принимать более объективные и взвешенные решения. Результат: снижение влияния эмоциональных триггеров на стратегические решения.</p>' }
      // Другие пустые карты можно добавить при необходимости
    ]
  };
  
  // Перемешиваем карты каждой категории
  Object.keys(allCards).forEach(category => {
    allCards[category] = shuffleArray(allCards[category]);
  });
  
  // Раздаем по 5 карт каждому участнику
  session.users.forEach(user => {
    // Выбираем случайно по одной карте из каждой категории
    const userCards = [];
    Object.keys(allCards).forEach(category => {
      if (allCards[category].length > 0) {
        userCards.push(allCards[category].pop());
      }
    });
    
    // Если нужно 5 карт, а категорий меньше, добираем из оставшихся
    const allRemainingCards = Object.values(allCards).flat();
    while (userCards.length < 5 && allRemainingCards.length > 0) {
      const randomIndex = Math.floor(Math.random() * allRemainingCards.length);
      userCards.push(allRemainingCards.splice(randomIndex, 1)[0]);
    }
    
    session.cards[user.id] = userCards;
  });

  storage.saveData(sessions, users);
}

// Вспомогательная функция для перемешивания массива
function shuffleArray(array) {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

// API для обработки хода
app.post('/api/sessions/:sessionId/turn', (req, res) => {
    const { sessionId } = req.params;
    const { userId, cardId, answer } = req.body;
    
    if (!sessions[sessionId]) {
        return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    const session = sessions[sessionId];
    
    // Проверка статуса сессии
    if (session.status !== 'started') {
        return res.status(400).json({ error: 'Сессия не начата или уже завершена' });
    }
    
    // Проверка пользователя
    const user = session.users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    // Проверка, что сейчас ход данного пользователя
    if (session.currentTurnUserId !== userId) {
        return res.status(403).json({ error: 'Сейчас не ваш ход' });
    }
    
    // Проверка наличия карт у пользователя
    const userCards = session.cards[userId];
    if (!userCards || userCards.length === 0) {
        return res.status(404).json({ error: 'У пользователя нет карт' });
    }
    
    // Проверка наличия карты
    const cardIndex = userCards.findIndex(card => card.id === cardId);
    if (cardIndex === -1) {
        return res.status(404).json({ error: 'Карта не найдена у пользователя' });
    }
    
    // Получаем карту
    const card = userCards[cardIndex];
    
    // Создаем объект хода
    const moveData = {
        userId,
        userName: user.name,
        cardId,
        card,
        answer,
        timestamp: new Date().toISOString()
    };
    
    // Добавляем ход в историю
    session.turns.push(moveData);
    
    // Удаляем карту из руки пользователя
    userCards.splice(cardIndex, 1);
    
    // Определяем следующего игрока
    const nextTurnUserId = moveToNextPlayer(session);
    
    // Уведомляем всех участников о ходе и смене активного игрока
    io.to(sessionId).emit('newTurn', { 
        lastMoveData: moveData,
        currentTurnUserId: session.currentTurnUserId,
        nextTurnUserId
    });
    
    // Отправляем обновленные данные сессии всем участникам
    io.to(sessionId).emit('sessionUpdated', session);
    
    // Возвращаем результат
    res.status(200).json({ 
        message: 'Ход совершен успешно',
        moveData,
        nextTurnUserId: session.currentTurnUserId,
        remainingCards: userCards.length
    });

    storage.saveData(sessions, users);
});

// Функция для перехода к следующему игроку
function moveToNextPlayer(session) {
    // Находим индекс текущего игрока в порядке ходов
    const currentIndex = session.userOrder.findIndex(id => id === session.currentTurnUserId);
    
    // Если не нашли или это последний игрок, переходим к первому, иначе к следующему
    let nextIndex;
    if (currentIndex === -1 || currentIndex === session.userOrder.length - 1) {
        nextIndex = 0;
    } else {
        nextIndex = currentIndex + 1;
    }
    
    // Устанавливаем ID следующего игрока
    const nextTurnUserId = session.userOrder[nextIndex];
    session.currentTurnUserId = nextTurnUserId;
    
    console.log(`Ход переходит к игроку: ${nextTurnUserId}`);
    
    return nextTurnUserId;
}

// Обновление статуса пользователя (онлайн/оффлайн)
app.post('/api/sessions/:sessionId/user-status', (req, res) => {
  const { sessionId } = req.params;
  const { userId, isOnline } = req.body;
  
  if (!sessions[sessionId]) {
    return res.status(404).json({ error: 'Сессия не найдена' });
  }
  
  const session = sessions[sessionId];
  const userIndex = session.users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  // Обновляем статус пользователя
  session.users[userIndex].isOnline = isOnline;
  
  // Уведомляем всех участников о смене статуса
  io.to(sessionId).emit('userStatusChanged', {
    userId,
    userName: session.users[userIndex].name,
    isOnline
  });
  
  res.status(200).json({ success: true });

  storage.saveData(sessions, users);
});

// Завершение сессии
app.post('/api/sessions/:sessionId/finish', (req, res) => {
  const { sessionId } = req.params;
  const { userId } = req.body;
  
  if (!sessions[sessionId]) {
    return res.status(404).json({ error: 'Сессия не найдена' });
  }
  
  const session = sessions[sessionId];
  const user = session.users.find(u => u.id === userId);
  
  if (!user || !user.isHost) {
    return res.status(403).json({ error: 'Только организатор может завершить сессию' });
  }
  
  session.status = 'finished';
  session.endTime = new Date().toISOString();
  
  // Уведомляем всех участников о завершении сессии
  io.to(sessionId).emit('sessionFinished', {
    endTime: session.endTime,
    turnCount: session.turns.length
  });
  
  res.status(200).json({ 
    status: 'finished',
    session
  });

  storage.saveData(sessions, users);
});

// Пропуск хода (только для организатора)
app.post('/api/sessions/:sessionId/skip-turn', (req, res) => {
    const { sessionId } = req.params;
    const { userId } = req.body;
    
    if (!sessions[sessionId]) {
        return res.status(404).json({ error: 'Сессия не найдена' });
    }
    
    const session = sessions[sessionId];
    const user = session.users.find(u => u.id === userId);
    
    if (!user || !user.isHost) {
        return res.status(403).json({ error: 'Только организатор может пропустить ход' });
    }
    
    if (session.status !== 'started') {
        return res.status(400).json({ error: 'Сессия не начата или уже завершена' });
    }
    
    const skippedUserId = session.currentTurnUserId;
    const skippedUser = session.users.find(u => u.id === skippedUserId);
    
    // Переходим к следующему игроку
    const nextTurnUserId = moveToNextPlayer(session);
    
    // Уведомляем всех участников о пропуске хода
    io.to(sessionId).emit('turnSkipped', {
        skippedUserId,
        skippedUserName: skippedUser ? skippedUser.name : 'Неизвестный пользователь',
        nextTurnUserId: session.currentTurnUserId,
        timestamp: new Date().toISOString()
    });
    
    // Отправляем обновленные данные сессии всем участникам
    io.to(sessionId).emit('sessionUpdated', session);
    
    res.status(200).json({ 
        success: true,
        nextTurnUserId: session.currentTurnUserId
    });

    storage.saveData(sessions, users);
});

// API для раздачи дополнительных карт - исправленная версия
app.post('/api/sessions/:sessionId/deal-more-cards', (req, res) => {
  const { sessionId } = req.params;
  const { userId } = req.body;
  
  if (!sessions[sessionId]) {
    return res.status(404).json({ error: 'Сессия не найдена' });
  }
  
  const session = sessions[sessionId];
  const user = session.users.find(u => u.id === userId);
  
  if (!user || !user.isHost) {
    return res.status(403).json({ error: 'Только организатор может раздать дополнительные карты' });
  }
  
  if (session.status !== 'started') {
    return res.status(400).json({ error: 'Сессия не начата или уже завершена' });
  }
  
  // Получаем все карты из исходного набора
  const allCards = {
    ownership: [
      { id: 'ownership-1', category: 'ownership', question: 'Как оценим бизнес, если один захочет выйти завтра?', 
        comment: '<p>Определите формулу оценки бизнеса и согласуйте сроки выплат при выходе партнёра. Это позволит избежать конфликтов в критический момент. Результат: прозрачный механизм оценки и сроки расчетов с выходящим партнёром.</p>' },
      { id: 'ownership-2', category: 'ownership', question: 'Пустим ли жену/брата в совет директоров?', 
        comment: '<p>Обсудите принципы включения родственников в управление компанией. Рассмотрите риски эмоциональных решений, конфликта интересов и возможные последствия семейных споров для бизнеса. Результат: четкая политика участия родственников в управлении.</p>' },
      // Другие карты со-владения
      { id: 'ownership-3', category: 'ownership', question: 'Будем платить дивиденды или реинвестировать?', 
        comment: '<p>Согласуйте политику распределения прибыли между реинвестированием и выплатой дивидендов. Обсудите процент выплат, периодичность и механизм принятия решений в этом вопросе. Результат: прозрачная финансовая политика, учитывающая интересы всех партнёров.</p>' },
      { id: 'ownership-4', category: 'ownership', question: 'Как делить доли, если я вложу в 2 раза больше?', 
        comment: '<p>Разработайте формулу перераспределения долей в случае диспропорциональных инвестиций. Учтите как денежные вложения, так и ценность других вкладов (время, экспертиза, связи). Результат: справедливая модель корректировки долей при неравных вложениях.</p>' },
      { id: 'ownership-5', category: 'ownership', question: 'Продадим ли долю китайским инвесторам?', 
        comment: '<p>Обсудите принципы привлечения иностранных инвесторов и возможные ограничения. Определите приемлемые лимиты отчуждения долей и последствия нарушения договоренностей. Результат: согласованная стратегия взаимодействия с иностранным капиталом.</p>' }
    ],
    values: [
      { id: 'values-1', category: 'values', question: 'Можно ли совмещать с конкурентом?', 
        comment: '<p>Обсудите возможность сотрудничества с конкурирующими компаниями. Определите границы допустимого взаимодействия, условия информирования партнёров и возможные санкции за нарушение договоренностей. Результат: четкая политика взаимодействия с конкурентами.</p>' },
      { id: 'values-2', category: 'values', question: 'Будем скрывать убытки от семьи?', 
        comment: '<p>Определите политику прозрачности финансовых результатов компании для семей партнёров. Обсудите частоту и формат отчетности, границы конфиденциальности. Результат: согласованный подход к коммуникации финансового положения бизнеса в семье.</p>' },
      // Другие карты ценностей
      { id: 'values-3', category: 'values', question: 'Ваш личный потолок по долгам бизнеса?', 
        comment: '<p>Определите максимальную сумму личной ответственности каждого партнёра по обязательствам бизнеса. Это важное решение поможет установить границы финансового риска и психологический комфорт. Результат: четкие лимиты финансовой ответственности для каждого участника.</p>' },
      { id: 'values-4', category: 'values', question: 'Допустимо ли давать взятки для сделок?', 
        comment: '<p>Обсудите этические границы в переговорах с контрагентами и представителями власти. Определите, что является неприемлемым в вопросах коррупции, и какие последствия ждут того, кто нарушит договоренности. Результат: этический кодекс компании в вопросах взаимодействия с внешней средой.</p>' },
      { id: 'values-5', category: 'values', question: 'Можно ли публично критиковать партнёра?', 
        comment: '<p>Обсудите допустимость и формат публичной критики партнёров. Определите каналы и способы коммуникации разногласий, а также последствия за нарушение этических норм. Результат: политика внешних коммуникаций, защищающая репутацию компании и партнёров.</p>' }
    ],
    scenarios: [
      { id: 'scenarios-1', category: 'scenarios', question: 'Если хакеры украдут все данные?', 
        comment: '<p>Разработайте протокол реагирования на утечку данных. Определите ответственных лиц, процедуру уведомления клиентов, механизмы компенсации ущерба и меры по восстановлению репутации. Результат: готовность к управлению киберкризисом с минимальными потерями.</p>' },
      { id: 'scenarios-2', category: 'scenarios', question: 'Если налоговая заблокирует счета?', 
        comment: '<p>Согласуйте план действий на случай блокировки корпоративных счетов. Определите альтернативные источники финансирования, расставьте приоритеты платежей и распределите ответственность за разблокировку. Результат: готовность к временному функционированию в условиях ограниченного доступа к финансам.</p>' },
      // Другие карты сценариев
      { id: 'scenarios-3', category: 'scenarios', question: 'Если один из нас влюбится в сотрудника?', 
        comment: '<p>Определите политику в отношении личных связей партнёров с сотрудниками компании. Рассмотрите варианты — от полного запрета до регламентации с обязательным информированием других партнёров. Результат: правила, минимизирующие риски конфликта интересов и негативного влияния на коллектив.</p>' },
      { id: 'scenarios-4', category: 'scenarios', question: 'Если рынок рухнет из-за кризиса?', 
        comment: '<p>Разработайте антикризисную стратегию для компании. Определите критерии принятия решений о сокращении персонала, изменении бизнес-модели или переходе в другие ниши. Результат: план действий, позволяющий сохранить ядро бизнеса в условиях экономического спада.</p>' },
      { id: 'scenarios-5', category: 'scenarios', question: 'Если партнёр присвоит деньги компании?', 
        comment: '<p>Согласуйте процедуру действий в случае выявления факта присвоения средств компании. Определите пороговые суммы для разных уровней реагирования, возможность выкупа доли нарушителя и критерии для обращения в правоохранительные органы. Результат: механизм защиты от финансовых злоупотреблений.</p>' }
    ],
    management: [
      { id: 'management-1', category: 'management', question: 'Кто отвечает за увольнение сотрудников?', 
        comment: '<p>Определите процедуру и ответственных за принятие решений об увольнении сотрудников разного уровня. Согласуйте необходимость согласования таких решений с партнёрами и процесс коммуникации с командой. Результат: справедливая и предсказуемая система кадровых решений.</p>' },
      { id: 'management-2', category: 'management', question: 'Как часто будем проводить планерки?', 
        comment: '<p>Определите оптимальную частоту, формат и продолжительность регулярных встреч управленческой команды. Согласуйте обязательность участия, процедуру подготовки и правила фиксации решений. Результат: эффективная система координации управленческих действий.</p>' },
      // Другие карты управления
      { id: 'management-3', category: 'management', question: 'Можно ли менять KPI в середине квартала?', 
        comment: '<p>Согласуйте политику изменения ключевых показателей эффективности в течение отчетного периода. Определите исключительные обстоятельства, процедуру согласования и компенсации за "изменение правил игры". Результат: стабильная и мотивирующая система оценки результатов.</p>' },
      { id: 'management-4', category: 'management', question: 'Кто подписывает договоры с поставщиками?', 
        comment: '<p>Определите круг лиц, имеющих право подписи договоров с поставщиками разного уровня значимости. Согласуйте лимиты самостоятельных решений и процедуру эскалации для крупных или стратегических контрактов. Результат: эффективный баланс между оперативностью и контролем.</p>' },
      { id: 'management-5', category: 'management', question: 'Как делить премии среди топ-менеджеров?', 
        comment: '<p>Разработайте прозрачную формулу распределения премиального фонда между руководителями высшего звена. Определите баланс между индивидуальными и командными результатами, а также условия лишения премии. Результат: справедливая система мотивации управленческой команды.</p>' }
    ],
    empty: [
      { id: 'empty-1', category: 'empty', question: 'Какой главный вопрос остался необсужденным?', 
        comment: '<p>Используйте этот момент, чтобы поднять важный вопрос, который ещё не обсуждался. Сформулируйте его четко и объясните, почему он критически важен для успеха предприятия. Результат: выявление и обсуждение "слепых зон" в планировании.</p>' },
      { id: 'empty-2', category: 'empty', question: 'Какой опыт предыдущих проектов стоит учесть в текущем?', 
        comment: '<p>Поделитесь релевантным опытом из предыдущих проектов — как успешным, так и неудачным. Обсудите уроки, которые можно применить в текущем проекте. Результат: практические выводы, которые помогут избежать повторения ошибок и усилить успешные практики.</p>' },
      // Другие пустые карты
      { id: 'empty-3', category: 'empty', question: 'Какая общая цель объединяет всех партнёров?', 
        comment: '<p>Обсудите глубинные мотивы, ценности и цели, которые объединяют всех партнёров в этом бизнесе. Важно выявить действительно общие устремления, а не просто декларируемые. Результат: ясное понимание общего фундамента партнёрства.</p>' },
      { id: 'empty-4', category: 'empty', question: 'Что для вас служит главной мотивацией в бизнесе?', 
        comment: '<p>Откровенно поделитесь вашими главными драйверами в бизнесе — деньги, статус, свобода, самореализация, влияние или что-то другое. Понимание истинных мотивов друг друга поможет выстроить гармоничные отношения. Результат: осознание личных приоритетов каждого партнёра.</p>' },
      { id: 'empty-5', category: 'empty', question: 'Какие личные страхи влияют на ваши бизнес-решения?', 
        comment: '<p>Обсудите личные страхи и опасения, которые могут неосознанно влиять на принимаемые бизнес-решения. Признание этих факторов поможет принимать более объективные и взвешенные решения. Результат: снижение влияния эмоциональных триггеров на стратегические решения.</p>' }
    ]
  };
  
  // Перемешиваем все карты каждой категории
  Object.keys(allCards).forEach(category => {
    allCards[category] = shuffleArray([...allCards[category]]);
  });
  
  // Получаем все карты, которые уже были розданы или использованы
  const usedCardIds = new Set();
  
  // Собираем ID всех карт у участников
  Object.values(session.cards).forEach(userCards => {
    userCards.forEach(card => usedCardIds.add(card.id));
  });
  
  // Добавляем ID карт, которые уже были использованы в ходах
  session.turns.forEach(turn => {
    if (turn.cardId) {
      usedCardIds.add(turn.cardId);
    }
  });
  
  // Отфильтровываем доступные карты, исключая уже розданные
  const availableCards = {};
  Object.keys(allCards).forEach(category => {
    availableCards[category] = allCards[category].filter(card => !usedCardIds.has(card.id));
  });
  
  // Проверяем, сколько карт доступно в итоге
  const totalAvailableCards = Object.values(availableCards).reduce((sum, cards) => sum + cards.length, 0);
  
  if (totalAvailableCards === 0) {
    return res.status(400).json({ error: 'Нет доступных карт для раздачи' });
  }
  
  console.log(`Доступно карт для раздачи: ${totalAvailableCards}`);
  
  // Раздаем по 5 новых карт каждому участнику
  const cardsPerUser = Math.min(5, Math.floor(totalAvailableCards / session.users.length));
  const userUpdates = {};
  
  session.users.forEach(user => {
    const newCards = [];
    const userID = user.id;
    
    // Пытаемся выбрать по одной карте из каждой категории
    for (const category of Object.keys(availableCards)) {
      if (newCards.length >= cardsPerUser) break; // Останавливаемся, если достигли нужного количества карт
      
      if (availableCards[category].length > 0) {
        const card = availableCards[category].shift(); // Берем первую карту из перемешанной категории
        newCards.push(card);
      }
    }
    
    // Если нужно больше карт, берем случайные из оставшихся
    const allRemainingCards = Object.values(availableCards).flat();
    while (newCards.length < cardsPerUser && allRemainingCards.length > 0) {
      const randomIndex = Math.floor(Math.random() * allRemainingCards.length);
      const card = allRemainingCards.splice(randomIndex, 1)[0];
      newCards.push(card);
    }
    
    // Если у пользователя еще нет массива карт, создаем его
    if (!session.cards[userID]) {
      session.cards[userID] = [];
    }
    
    // Добавляем новые карты к существующим
    session.cards[userID] = [...session.cards[userID], ...newCards];
    
    // Сохраняем информацию о новых картах для каждого пользователя
    userUpdates[userID] = {
      newCards,
      userName: user.name
    };
    
    console.log(`Раздано ${newCards.length} карт пользователю ${user.name}`);
  });
  
  // Уведомляем всех участников о раздаче новых карт
  io.to(sessionId).emit('cardsDealt', userUpdates);
  
  // Отправляем ответ организатору
  res.status(200).json({
    message: 'Дополнительные карты розданы всем участникам',
    userUpdates
  });

  storage.saveData(sessions, users);
});

// Получение истории ходов сессии
app.get('/api/sessions/:sessionId/turns', (req, res) => {
  const { sessionId } = req.params;
  
  if (!sessions[sessionId]) {
    return res.status(404).json({ error: 'Сессия не найдена' });
  }
  
  res.json(sessions[sessionId].turns);
});

// Обработка Socket.io подключений
io.on('connection', (socket) => {
  console.log('Новое подключение: ', socket.id);
  
  // Присоединение к комнате сессии
  socket.on('joinSession', ({ sessionId, userId }) => {
    if (sessions[sessionId]) {
      socket.join(sessionId);
      users[socket.id] = { sessionId, userId };
      console.log(`Пользователь ${userId} присоединился к сессии ${sessionId}`);
    }
  });
  
  // Отправка сообщения в чат сессии
  socket.on('sendMessage', (message) => {
    const userInfo = users[socket.id];
    if (userInfo && sessions[userInfo.sessionId]) {
      const user = sessions[userInfo.sessionId].users.find(u => u.id === userInfo.userId);
      if (user) {
        const chatMessage = {
          userId: user.id,
          userName: user.name,
          text: message,
          timestamp: new Date().toISOString()
        };
        io.to(userInfo.sessionId).emit('newMessage', chatMessage);
      }
    }
  });
  
  // Обработка отключения
  socket.on('disconnect', () => {
    const userInfo = users[socket.id];
    if (userInfo) {
      console.log(`Пользователь отключился от сессии ${userInfo.sessionId}`);
      delete users[socket.id];
    }
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
}); 