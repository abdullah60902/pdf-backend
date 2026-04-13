# Use Node.js LTS
FROM node:20-slim

# Install LibreOffice and Fonts for high-quality conversion
RUN apt-get update && apt-get install -y \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    fonts-liberation \
    fonts-dejavu \
    fonts-noto \
    ttf-mscorefonts-installer \
    --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Environment Variables
ENV PORT=5000
ENV NODE_ENV=production
ENV LIBREOFFICE_PATH=soffice

# Expose port
EXPOSE 5000

# Start the server
CMD ["node", "dist/index.js"]
