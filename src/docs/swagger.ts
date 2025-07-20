import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ContractNest API',
      version: '1.0.0',
      description: 'API documentation for ContractNest',
      contact: {
        name: 'Support',
        email: 'support@contractnest.com',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:5000',
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/docs/schemas/*.ts'], // Path to API routes with JSDoc documentation
};

export const specs = swaggerJsdoc(options);