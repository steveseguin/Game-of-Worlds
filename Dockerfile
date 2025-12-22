FROM node:20-bullseye

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["bash", "-lc", "SETUP_AUTO_CONFIRM=n node server/setup.js && npm start"]
