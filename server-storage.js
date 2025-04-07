const fs = require('fs');
const path = require('path');

// Используем корневой каталог для хранения данных в Glitch
const DATA_DIR = process.env.DATA_DIR || '.';
const SESSIONS_FILE = path.join(DATA_DIR, '.sessions.json');
const USERS_FILE = path.join(DATA_DIR, '.users.json');

// Используем только хранение в памяти на Glitch
const memoryStore = {
  sessions: {},
  users: {}
};

// Создаем директорию для данных, если не существует (отключено для Glitch)
// if (!fs.existsSync(DATA_DIR)) {
//  fs.mkdirSync(DATA_DIR, { recursive: true });
// }

// Загрузка данных из файлов
function loadData() {
  try {
    // На Glitch используем только память
    if (process.env.GLITCH) {
      console.log('Запущено на Glitch, используем только память');
      return { sessions: memoryStore.sessions, users: memoryStore.users };
    }
    
    let sessions = {};
    let users = {};
    
    if (fs.existsSync(SESSIONS_FILE)) {
      const sessionsData = fs.readFileSync(SESSIONS_FILE, 'utf8');
      sessions = JSON.parse(sessionsData);
      console.log(`Загружено ${Object.keys(sessions).length} сессий из файла`);
    } else {
      console.log('Файл сессий не найден, используем данные из памяти');
      sessions = memoryStore.sessions;
    }
    
    if (fs.existsSync(USERS_FILE)) {
      const usersData = fs.readFileSync(USERS_FILE, 'utf8');
      users = JSON.parse(usersData);
      console.log(`Загружено ${Object.keys(users).length} пользователей из файла`);
    } else {
      console.log('Файл пользователей не найден, используем данные из памяти');
      users = memoryStore.users;
    }
    
    return { sessions, users };
  } catch (error) {
    console.error('Ошибка при загрузке данных из файлов:', error);
    console.log('Используем данные из памяти');
    return { sessions: memoryStore.sessions, users: memoryStore.users };
  }
}

// Сохранение данных в файлы
function saveData(sessions, users) {
  try {
    // Всегда обновляем данные в памяти
    memoryStore.sessions = sessions;
    memoryStore.users = users;
    
    // На Glitch не пытаемся сохранять в файлы
    if (process.env.GLITCH) {
      return;
    }
    
    // Пытаемся сохранить в файлы
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log('Данные успешно сохранены в файлы');
  } catch (error) {
    console.error('Ошибка при сохранении данных в файлы:', error);
    console.log('Данные сохранены только в памяти');
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