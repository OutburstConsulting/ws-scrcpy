FROM node:24-bullseye

LABEL maintainer="Outburst"
LABEL description="Custom ws-scrcpy with workflow recording and enhanced UI"

ENV LANG C.UTF-8

WORKDIR /ws-scrcpy

# Install build dependencies and ADB
RUN apt-get update && apt-get install -y \
    android-tools-adb \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install node-gyp globally
RUN npm install -g node-gyp

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the source code
COPY . .

# Build the application
RUN npm run dist

# Expose the default port
EXPOSE 8000

# Run the server
CMD ["node", "dist/index.js"]
