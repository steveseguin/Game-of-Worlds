FROM node:20-bullseye

WORKDIR /app

# Install production dependencies first to leverage Docker layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the default port; Railway will override with $PORT
EXPOSE 1337

CMD ["npm", "start"]
