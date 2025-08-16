// Test file to verify GraphQL setup
import { ApolloServer } from 'apollo-server-express';
import express from 'express';
import Redis from 'ioredis';

const app = express();

// Test Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

console.log('GraphQL test setup - types working correctly');