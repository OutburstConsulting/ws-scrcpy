# ============================================
# Stage 1: Builder
# ============================================
FROM node:24-alpine AS builder

WORKDIR /ws-scrcpy

# Install build dependencies (including Java for samlify-xsd-schema-validator)
RUN apk add --no-cache \
    build-base \
    python3 \
    openjdk17-jdk

# Install node-gyp globally
RUN npm install -g node-gyp

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run dist

# Remove devDependencies to keep only production deps
RUN rm -rf node_modules && npm install --omit=dev

# ============================================
# Stage 2: Runtime
# ============================================
FROM node:24-alpine

LABEL maintainer="Outburst"
LABEL description="Custom ws-scrcpy with workflow recording and enhanced UI"

ENV LANG=C.UTF-8
ENV NODE_ENV=production

WORKDIR /ws-scrcpy

# Install runtime dependencies (ADB + Java for SAML validation)
RUN apk add --no-cache android-tools openjdk17-jre-headless

# Copy built artifacts from builder
COPY --from=builder /ws-scrcpy/dist ./dist
COPY --from=builder /ws-scrcpy/node_modules ./node_modules

# Expose the default port
EXPOSE 8000

# Run the server
CMD ["node", "dist/index.js"]