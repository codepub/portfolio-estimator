# frontend/Dockerfile
FROM node:20-alpine

# Set environment to production or development as needed
ENV NODE_ENV=development

WORKDIR /app

# Copy package files first for layer caching
COPY --chown=node:node package.json package-lock.json* ./
RUN npm install

# Copy the rest of the code
COPY --chown=node:node . .

# Switch to the non-root user
USER node

# Vite needs to bind to 0.0.0.0 to be accessible outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]