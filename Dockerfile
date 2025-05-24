# Use official Node.js LTS image
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /usr/src/app

# Copy package metadata first for layer caching
COPY package.json ./

# Install only production dependencies
RUN npm install --production

# Copy all source code (adjust if you use .dockerignore)
COPY . .

# Expose port used by your app (3002)
EXPOSE 3002

# Start the server (adjust if you use another entry file)
CMD ["node", "server.js"]
