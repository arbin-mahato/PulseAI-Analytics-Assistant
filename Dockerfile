# -------- Stage 1: Builder --------
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first for caching
COPY package*.json ./
RUN npm ci

# Copy the rest of the project
COPY . .

# Build Next.js standalone app and Prisma client
RUN npx prisma generate 
RUN npm run build


# -------- Stage 2: Runtime --------
FROM node:20-alpine AS runner

WORKDIR /app

RUN npm install -g prisma@6.18.0
# Add only necessary binaries
RUN apk add --no-cache openssl libc6-compat

# Copy minimal standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Expose port
EXPOSE 3000

# Start Next.js standalone server
CMD ["node", "server.js"]
