FROM node:18

WORKDIR /usr/src/app

# Копируем файлы package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код приложения
COPY . .

# Создаем директорию для данных
RUN mkdir -p /usr/src/app/data

# Указываем порт, который будет прослушивать приложение
EXPOSE 3000

# Запускаем приложение
CMD [ "node", "server.js" ] 