FROM node:20-bullseye

WORKDIR /app

# Install production dependencies first to leverage Docker layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the default port; Railway will override with $PORT
# Automatically run database setup before starting the server
CMD ["bash", "-lc", "SETUP_AUTO_CONFIRM=n node server/setup.js && npm start"]
