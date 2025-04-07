const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || './data';
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Создаем директорию для данных, если не существует
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Загрузка данных из файлов
function loadData() {
  try {
    let sessions = {};
    let users = {};
    
    if (fs.existsSync(SESSIONS_FILE)) {
      const sessionsData = fs.readFileSync(SESSIONS_FILE, 'utf8');
      sessions = JSON.parse(sessionsData);
      console.log(`Загружено ${Object.keys(sessions).length} сессий из файла`);
    }
    
    if (fs.existsSync(USERS_FILE)) {
      const usersData = fs.readFileSync(USERS_FILE, 'utf8');
      users = JSON.parse(usersData);
      console.log(`Загружено ${Object.keys(users).length} пользователей из файла`);
    }
    
    return { sessions, users };
  } catch (error) {
    console.error('Ошибка при загрузке данных:', error);
    return { sessions: {}, users: {} };
  }
}

// Сохранение данных в файлы
function saveData(sessions, users) {
  try {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log('Данные успешно сохранены в файлы');
  } catch (error) {
    console.error('Ошибка при сохранении данных:', error);
  }
}

// Настройка автоматического сохранения каждые 5 минут
function setupAutoSave(sessions, users) {
  const SAVE_INTERVAL = 5 * 60 * 1000; // 5 минут
  
  setInterval(() => {
    saveData(sessions, users);
  }, SAVE_INTERVAL);
  
  // Сохранение при завершении процесса
  process.on('SIGINT', () => {
    console.log('Получен сигнал завершения. Сохраняю данные...');
    saveData(sessions, users);
    process.exit(0);
  });
}

module.exports = {
  loadData,
  saveData,
  setupAutoSave
}; 